// -*- coding: utf-8 -*-
//
// Live Chat Bridge Server — ehsmaha.com
// =========================================
// سيرفر واحد مستضاف مرة وحدة (وليس تطبيقاً محلياً عند الستريمر). يستقبل
// اتصالات WebSocket من الموقع مباشرة، وهو المسؤول الوحيد عن التحدث فعلياً
// مع تيك توك/يوتيوب/كيك — لكل ستريمر عبر يوزرنيمه (أو رابط بثه) فقط، بدون
// أي مفتاح API من المستخدم النهائي على أي منصة من الثلاث.
//
// المنصات المدعومة (query param platform=، افتراضي 'tiktok' للتوافق
// الخلفي مع أي عميل قديم لا يرسل platform= إطلاقاً):
//   - tiktok  : tiktok-live-connector (كما كان بالضبط — لم يُغيَّر سلوكه).
//   - youtube : مكتبة youtube-chat — تقبل يوزر/هاندل القناة، رابط القناة،
//               رابط البث المباشر، أو معرف الفيديو. بدون مفتاح YouTube API.
//   - kick    : مكتبة @retconned/kick-js بوضع readOnly (بدون تسجيل دخول أو
//               بيانات اعتماد) — تقبل يوزرنيم القناة أو رابط kick.com/يوزر،
//               وتحل chatroomId تلقائياً من داخل المكتبة (بدل إدخاله يدوياً).
//
// معمارية الجلسات (نفس الفكرة لكل منصة):
//   - "Room" واحدة لكل (platform + معرّف). أول عميل يطلب معرّفاً معيّناً
//     ينشئ اتصالاً واحداً لذلك المعرّف؛ أي عميل إضافي (لعبة ثانية، جهاز
//     ثانٍ لنفس الستريمر) ينضم لنفس الـ Room ويستقبل نفس تدفق الأحداث فوراً
//     بدون فتح اتصال منصّة مكرر.
//   - الـ Room تُغلق تلقائياً وتحرر مواردها عند خروج آخر عميل.
//
// التحقق من التفعيل/التعطيل:
//   - قبل قبول أي اتصال (بأي منصة)، يُفحص مستند Firestore عند
//     bridgeStreamers/{المعرّف}. إذا enabled === false يُرفض الاتصال فوراً
//     برمز إغلاق 4403 ورسالة واضحة. ملاحظة: المعرّف هنا هو معرّف الاتصال
//     الفعلي بتلك المنصة (يوزر تيك توك، أو يوزر/هاندل يوتيوب، أو يوزر كيك) —
//     تعطيل حساب تيك توك لستريمر ما يعطّل تلقائياً حساباته على يوتيوب/كيك
//     لو كانت بأسماء مختلفة؛ لازم مستند bridgeStreamers منفصل لكل معرّف لو
//     أردت تغطية كل منصات نفس الستريمر.
//
// شكل الأحداث المُرسَلة للموقع — نفس الغلاف الذي تفهمه كل الألعاب اليوم
// ({messages:[...]}) بنفس حقول user (uniqueId/nickname/profilePictureUrl/
// isFollower/followInfo) التي تستهلكها extractUser() في index.html، حتى لا
// يحتاج أي تعديل إضافي على منطق الألعاب — بغض النظر عن مصدر الحدث.

'use strict';

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const {
  TikTokLiveConnection, WebcastEvent, ControlEvent, UserOfflineError,
} = require('tiktok-live-connector');
const { LiveChat: YoutubeLiveChat } = require('youtube-chat');
const { createClient: createKickClient } = require('@retconned/kick-js');

// مفتاح Euler Stream اختياري بالكامل (متغير بيئة على السيرفر فقط — لا علاقة
// له بالستريمر ولا يُطلب منه أبداً). بدونه تعمل المكتبة على الطبقة المجانية
// من Euler Stream (محدودة المعدل)؛ وجوده يرفع الحد الأقصى للاتصالات المتزامنة
// فقط. راجع options.signApiKey في tiktok-live-connector. خاص بتيك توك فقط.
const EULER_SIGN_API_KEY = process.env.EULER_SIGN_API_KEY || '';

const PORT = process.env.PORT || 8080;
const RECONNECT_DELAY_MS = 5000;
const NOT_LIVE_RETRY_DELAY_MS = 20000;
// عند رد 429 (تجاوز حد خدمة التوقيع EulerStream — خاص بتيك توك) يجب التراجع
// مدة طويلة بدل الدق كل 5ث — لأن كل محاولة إضافية تُشبع الحد أكثر وتطيل
// الحظر (حلقة موت rate-limit). الحل الجذري هو ضبط EULER_SIGN_API_KEY كمتغيّر
// بيئة، وهذا التراجع يمنع تفاقم المشكلة حتى مع المفتاح.
const RATE_LIMIT_BACKOFF_MS = 60000;
const ROOM_IDLE_GRACE_MS = 5000; // مهلة قبل إغلاق الغرفة بعد خروج آخر عميل (يتجنب فتح/إغلاق سريع عند إعادة تحميل الصفحة)

// jitter عشوائي يُضاف لكل تأخير إعادة محاولة حتى لا تُعيد كل الغرف الاتصال في
// نفس اللحظة (thundering herd) فتضرب خدمة التوقيع دفعة واحدة وتستهلك الحد.
function withJitter(base) { return base + Math.floor(Math.random() * 4000); }

// ------------------------------------------------------------------ Firestore (تفعيل/تعطيل الستريمرز)
// نفس مشروع فايربيس الذي يستخدمه index.html (streamgame-180b8). نقرأ فقط
// enabled بمستند bridgeStreamers/{معرّف} — لا حاجة لأي بيانات اعتماد
// مستخدم، القراءة عامة (Firestore rules تسمح بقراءة هذه المجموعة فقط).
let db = null;
function initFirestore() {
  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svcJson) {
    log('warn', 'FIREBASE_SERVICE_ACCOUNT غير مضبوط — سيُسمح لكل الستريمرز بالاتصال بدون فحص تفعيل/تعطيل');
    return;
  }
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(svcJson)) });
    }
    db = admin.firestore();
    log('info', 'Firestore متصل — فحص تفعيل الستريمرز فعّال');
  } catch (e) {
    log('warn', 'تعذّر تهيئة Firestore (' + e.message + ') — سيُسمح لكل الستريمرز بالاتصال بدون فحص تفعيل');
  }
}

async function isStreamerEnabled(identifier) {
  if (!db) return true; // لا فحص إذا Firestore غير متاح — لا نمنع الخدمة بالكامل
  try {
    const snap = await db.collection('bridgeStreamers').doc(identifier).get();
    if (!snap.exists) return true; // لم يُعطَّل صراحة = مسموح افتراضياً
    const data = snap.data() || {};
    return data.enabled !== false;
  } catch (e) {
    log('warn', 'فحص Firestore فشل لـ ' + identifier + ': ' + e.message);
    return true; // فشل الفحص لا يمنع الخدمة
  }
}

function log(level, msg) {
  const stamp = new Date().toISOString();
  console.log('[' + stamp + '] [' + level.toUpperCase() + '] ' + msg);
}

// ==================================================================
// بناء الأحداث الموحّدة — نفس الشكل بالضبط لكل المنصات الثلاث، حتى لا
// تحتاج أي لعبة أي تعديل على منطقها الداخلي (type === 'WebcastChatMessage').
// ==================================================================

// ------------------------------------------------------------------ تيك توك
// أسماء الحقول هنا تم التحقق منها فعلياً من بيانات خام حقيقية (bridge status
// وحدث CHAT حقيقي من بث لايف فعلي)، وليس من توثيق/تخمين. النسخة المثبتة من
// tiktok-live-connector (2.4.x) لا تحتوي uniqueId إطلاقاً؛ اليوزرنيم الحقيقي
// في displayId. الصورة في avatarThumb.urlList (مو profilePicture.urls).
// followStatus يرجع كنص ("0"/"1"/"2")، فالمقارنة الرقمية المباشرة كانت تفشل
// دائماً حتى للمتابعين الحقيقيين. — هذا القسم لم يتغيّر إطلاقاً.
function extractTikTokUser(user) {
  if (!user) {
    return { uniqueId: '?', nickname: '?', profilePictureUrl: '', followRole: 0, isFollower: false, followInfo: { followStatus: 0 } };
  }
  const uniqueId = user.displayId || user.uniqueId || user.userId || user.id || '?';
  const nickname = user.nickname || uniqueId;
  const avatar = (user.avatarThumb && Array.isArray(user.avatarThumb.urlList) && user.avatarThumb.urlList[0]) || '';

  const followStatus = Number((user.followInfo && user.followInfo.followStatus) || 0);
  const following = followStatus === 1 || followStatus === 2;

  return {
    uniqueId: String(uniqueId),
    nickname: String(nickname),
    profilePictureUrl: avatar,
    followRole: following ? 1 : 0,
    isFollower: following,
    followInfo: { followStatus: following ? 1 : 0 },
  };
}

// data.content مو data.comment — تحقق فعلي من بث لايف حقيقي (WebcastChatMessage
// بالمكتبة المثبتة يستخدم content). هذا الحقل هو الأهم بكل الملف لأن كل لعبة
// تقرأ نص الشات منه لمطابقة الكلمات/الأوامر.
function buildTikTokComment(data) {
  const user = extractTikTokUser(data.user);
  const text = data.content || data.comment || '';
  return { type: 'WebcastChatMessage', comment: text, user, timestamp: Date.now() };
}

// data.gift (مو data.giftDetails — تحقق من tiktok-live-proto v3 WebcastGiftMessage:
// الحقل الصحيح gift: Gift، وGift.name/diamondCount/type).
function buildTikTokGift(data) {
  const user = extractTikTokUser(data.user);
  const gift = data.gift || {};
  return {
    type: 'WebcastGiftMessage',
    giftName: gift.name || 'هدية',
    diamondCount: gift.diamondCount || 0,
    repeatCount: data.repeatCount || 1,
    giftId: data.giftId || 0,
    user,
    timestamp: Date.now(),
  };
}

function buildTikTokFollow(data) {
  const user = extractTikTokUser(data.user);
  return { type: 'WebcastSocialMessage', displayType: 'follow', user, timestamp: Date.now() };
}

// data.count/data.total (مو likeCount/totalLikeCount — تحقق فعلي من بث لايف حقيقي).
function buildTikTokLike(data) {
  const user = extractTikTokUser(data.user);
  return { type: 'WebcastLikeMessage', likeCount: Number(data.count) || 0, totalLikeCount: Number(data.total) || 0, user, timestamp: Date.now() };
}

function buildTikTokViewer(count) {
  return { type: 'WebcastRoomUserSeqMessage', viewerCount: count || 0, timestamp: Date.now() };
}

// ------------------------------------------------------------------ يوتيوب ولكيك
// لا يوجد مفهوم "متابع" موثوق من شات يوتيوب/كيك العام (لا API رسمي يكشفه
// بدون صلاحيات إضافية) — بنفس القرار المعتمد أصلاً بهذا المشروع لتويتش/كيك
// المباشر بالمتصفح (twitchEventShape يفرض isFollower:true للجميع)، نفرضها
// هنا أيضاً بدل ما نمنع كل مشاهدي يوتيوب/كيك من المشاركة بأي لعبة.
function buildYoutubeComment(chatItem) {
  const author = chatItem.author || {};
  const uniqueId = String(author.channelId || author.name || '?');
  const nickname = String(author.name || uniqueId);
  const avatar = (author.thumbnail && author.thumbnail.url) || '';
  const text = (chatItem.message || []).map((m) => m.text || m.emojiText || '').join('');
  return {
    type: 'WebcastChatMessage',
    comment: text,
    user: { uniqueId, nickname, profilePictureUrl: avatar, followRole: 1, isFollower: true, followInfo: { followStatus: 1 } },
    timestamp: Date.now(),
  };
}

function buildKickComment(messageData) {
  const sender = (messageData && messageData.sender) || {};
  // نفس ملاحظة الفرونت إند القديمة لـsender.slug: يحوّل _ إلى - فيكسر أي
  // مقارنة يوزر لاسم فيه شرطة سفلية — username هو الاسم الحقيقي المطابق
  // لما يكتبه الستريمر بلوحته.
  const uniqueId = String(sender.username || sender.slug || '?');
  return {
    type: 'WebcastChatMessage',
    comment: (messageData && messageData.content) || '',
    user: { uniqueId, nickname: uniqueId, profilePictureUrl: '', followRole: 1, isFollower: true, followInfo: { followStatus: 1 } },
    timestamp: Date.now(),
  };
}

function buildStatus(state, message, extra) {
  return Object.assign({ type: 'bridge_status', state, message, timestamp: Date.now() }, extra || {});
}

// ------------------------------------------------------------------ تحليل مُدخلات يوتيوب/كيك (يوزر أو رابط، بدون أي مفتاح)

// نفس منطق youtubeExtractVideoId المستخدم أصلاً بالفرونت إند (مرجع الطلب)،
// لكن يرجّع الشكل الذي تتوقعه مكتبة youtube-chat مباشرة: {liveId}، أو
// {channelId} (رابط قناة/معرف قناة UC...)، أو {handle} (يوزر/هاندل مجرّد أو
// آخر جزء برابط قناة بصيغة @handle) — الأخير هو الحالة الأشيع (الستريمر
// يكتب يوزره فقط، بدون رابط).
function parseYoutubeIdentifier(raw) {
  const input = (raw || '').trim();
  if (!input) return null;
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(input)) return { channelId: input };
  if (input.indexOf('http') === 0) {
    try {
      const url = new URL(input);
      if (url.searchParams.get('v')) return { liveId: url.searchParams.get('v') };
      const parts = url.pathname.split('/').filter(Boolean);
      if (url.hostname.indexOf('youtu.be') !== -1 && parts[0]) return { liveId: parts[0] };
      const liveIdx = parts.indexOf('live');
      if (liveIdx !== -1 && parts[liveIdx + 1]) return { liveId: parts[liveIdx + 1] };
      const shortsIdx = parts.indexOf('shorts');
      if (shortsIdx !== -1 && parts[shortsIdx + 1]) return { liveId: parts[shortsIdx + 1] };
      const chIdx = parts.indexOf('channel');
      if (chIdx !== -1 && parts[chIdx + 1]) return { channelId: parts[chIdx + 1] };
      const handlePart = parts.find((p) => p.indexOf('@') === 0);
      if (handlePart) return { handle: handlePart };
      if (parts.length) return { handle: parts[parts.length - 1] };
      return null;
    } catch (e) {
      return { handle: input };
    }
  }
  return { handle: input }; // يوزر/هاندل مجرّد — الحالة الافتراضية المتوقعة
}

function youtubeIdentifierLabel(ytId) {
  if (!ytId) return '?';
  return ytId.handle || ytId.channelId || ytId.liveId || '?';
}

// يقبل يوزرنيم كيك مجرد أو رابط kick.com/username — @retconned/kick-js يحل
// chatroomId تلقائياً من الاسم داخلياً (بدل إدخاله يدوياً كما كان سابقاً).
function parseKickIdentifier(raw) {
  const input = (raw || '').trim();
  if (!input) return null;
  if (input.indexOf('http') === 0 || input.toLowerCase().indexOf('kick.com') !== -1) {
    try {
      const withProto = input.indexOf('http') === 0 ? input : 'https://' + input;
      const url = new URL(withProto);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length) return parts[0].toLowerCase();
    } catch (e) { /* يكمل للمسار العادي تحت */ }
  }
  return input.replace(/^@/, '').toLowerCase();
}

// ==================================================================
// إدارة الغرف — BaseRoom يحمل كل منطق العملاء/الحالة/إعادة المحاولة
// المشترك بين المنصات الثلاث (كان قبل هذا التعديل مكتوباً مرة وحدة خاصاً
// بتيك توك فقط تحت اسم Room) — كل منصة تضيف فوقه فقط "كيف تتصل فعلياً"
// و"كيف تصنّف أخطاءها" عبر start()/handleConnectError()/disconnect().
// ==================================================================
class BaseRoom {
  constructor(key, displayId) {
    this.key = key;             // مفتاح التسجيل بخريطة rooms، مثل 'kick:xqc'
    this.displayId = displayId; // نص يظهر برسائل الحالة، مثل '@xqc'
    this.clients = new Set();
    this.connection = null;
    this.state = 'idle';
    this.stopped = false;
    this.reconnectTimer = null;
    this.closeTimer = null;
    this.lastExtra = null;
  }

  addClient(ws) {
    if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null; }
    this.clients.add(ws);
    this.sendTo(ws, buildStatus(this.state, this.messageForState(this.state, this.lastExtra), this.lastExtra));
  }

  removeClient(ws) {
    this.clients.delete(ws);
    if (this.clients.size === 0 && !this.closeTimer) {
      this.closeTimer = setTimeout(() => this.teardown(), ROOM_IDLE_GRACE_MS);
    }
  }

  messageForState(state, extra) {
    const id = this.displayId;
    if (state === 'error' && extra && extra.code === 'user_not_found') {
      return id + ' — يوزرنيم/قناة غير موجودة، تأكد من كتابته صح';
    }
    if (state === 'error' && extra && extra.code === 'rate_limited') {
      return 'المنصة مزدحمة مؤقتاً على خدمة تيك توك — سنعيد المحاولة تلقائياً بعد قليل، ابقَ في الصفحة';
    }
    const map = {
      connecting: 'جاري الاتصال بـ ' + id + '…',
      connected: 'متصل بالبث المباشر ✅',
      not_live: id + ' مو مفتوح بث الآن',
      reconnecting: 'انقطع الاتصال — إعادة المحاولة تلقائياً…',
      error: 'خطأ مؤقت بالاتصال — إعادة المحاولة تلقائياً',
      stopped: 'متوقف',
    };
    return map[state] || '';
  }

  broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(data); } catch (e) { /* best-effort */ }
      }
    }
  }

  sendTo(ws, payload) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(payload)); } catch (e) { /* best-effort */ }
    }
  }

  setState(state, extra) {
    this.state = state;
    this.lastExtra = extra || null;
    this.broadcast(buildStatus(state, this.messageForState(state, extra), extra));
  }

  scheduleReconnect(delay) {
    if (this.stopped) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.stopped) return;
      this.connection = null;
      this.start();
    }, delay);
  }

  // كل صنف فرعي يطبّق start()/handleConnectError()/disconnect() الخاصة به.
  async start() { throw new Error('start() not implemented'); }
  handleConnectError(err) {
    log('warn', this.key + ' — خطأ اتصال: ' + ((err && err.message) || String(err)));
    this.setState('error', { code: 'connect_failed' });
    this.scheduleReconnect(withJitter(RECONNECT_DELAY_MS));
  }
  disconnect() { /* override إذا كان this.connection يحتاج تفكيكاً خاصاً */ }

  teardown() {
    log('info', this.key + ' — إغلاق الغرفة (لا عملاء متبقّين)');
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.disconnect();
    this.connection = null;
    rooms.delete(this.key);
  }
}

// ------------------------------------------------------------------ تيك توك (سلوك مطابق تماماً لما كان قبل هذا التعديل)
class TikTokRoom extends BaseRoom {
  constructor(uniqueId) {
    super('tiktok:' + uniqueId, '@' + uniqueId);
    this.uniqueId = uniqueId;
    this.notLiveRetries = 0;
    this.firstCommentSeen = false;
  }

  async start() {
    if (this.connection) return;
    this.stopped = false;
    this.setState('connecting');

    const connOptions = { processInitialData: false };
    if (EULER_SIGN_API_KEY) connOptions.signApiKey = EULER_SIGN_API_KEY;
    const conn = new TikTokLiveConnection(this.uniqueId, connOptions);
    this.connection = conn;

    conn.on(ControlEvent.CONNECTED, () => {
      this.notLiveRetries = 0;
      log('info', '@' + this.uniqueId + ' — متصل ببث فعلي (ConnectEvent)');
      this.setState('connected');
    });

    conn.on(ControlEvent.DISCONNECTED, () => {
      log('info', '@' + this.uniqueId + ' — انفصل');
      if (this.stopped) return;
      this.setState('reconnecting');
      this.scheduleReconnect(withJitter(RECONNECT_DELAY_MS));
    });

    conn.on(WebcastEvent.CHAT, (data) => {
      if (!this.firstCommentSeen) {
        this.firstCommentSeen = true;
        log('info', '@' + this.uniqueId + ' — أول CommentEvent فعلي وصل: "' + String(data.comment || '').slice(0, 40) + '"');
      }
      this.broadcast({ messages: [buildTikTokComment(data)] });
    });

    conn.on(WebcastEvent.GIFT, (data) => {
      // الهدايا القابلة للتتابع (streak, gift.type===1) ترسل عدة أحداث أثناء
      // التتابع؛ repeatEnd (0/1) يشير لآخر حدث بالتتابع — نبث مرة وحدة فقط
      // عند انتهائه حتى لا تُحتسب الهدية مضاعفة بالألعاب.
      const giftType = data.gift && data.gift.type;
      if (giftType === 1 && !data.repeatEnd) return;
      this.broadcast({ messages: [buildTikTokGift(data)] });
    });

    conn.on(WebcastEvent.FOLLOW, (data) => {
      this.broadcast({ messages: [buildTikTokFollow(data)] });
    });

    conn.on(WebcastEvent.LIKE, (data) => {
      this.broadcast({ messages: [buildTikTokLike(data)] });
    });

    conn.on(WebcastEvent.ROOM_USER, (data) => {
      this.broadcast({ messages: [buildTikTokViewer(data.totalUser)] });
    });

    conn.on(WebcastEvent.STREAM_END, () => {
      log('info', '@' + this.uniqueId + ' — انتهى البث');
      if (this.stopped) return;
      this.setState('not_live');
      this.scheduleReconnect(withJitter(NOT_LIVE_RETRY_DELAY_MS));
    });

    try {
      await conn.connect();
    } catch (err) {
      this.handleConnectError(err);
    }
  }

  handleConnectError(err) {
    if (err instanceof UserOfflineError) {
      log('info', '@' + this.uniqueId + ' — غير مباشر حالياً');
      this.notLiveRetries++;
      this.setState('not_live');
      this.scheduleReconnect(withJitter(NOT_LIVE_RETRY_DELAY_MS));
      return;
    }
    const msg = (err && err.message) || String(err);
    const low = msg.toLowerCase();
    // تجاوز حد خدمة التوقيع (EulerStream 429). ملاحظة مهمة: النسخة 2.4.x من
    // tiktok-live-connector فيها باگ — عند رد 429 تمرّر response.data بدل
    // response لباني SignatureRateLimitError، فيُرمى بدلاً منه استثناء نصّه
    // "Cannot read properties of undefined (reading 'retry-after')". لذلك نميّز
    // الـ rate limit من هذا النص تحديداً بالإضافة للأنماط المعتادة.
    const looksLikeRateLimit = (
      low.includes('retry-after') ||
      low.includes('rate limit') || low.includes('ratelimit') ||
      low.includes('too many') || low.includes(' 429') || low.includes('429 ') ||
      (low.includes('sign server') && low.includes('limit'))
    );
    if (looksLikeRateLimit) {
      log('warn', '@' + this.uniqueId + ' — تجاوز حد خدمة التوقيع (429/rate limit) — تراجع ' + Math.round(RATE_LIMIT_BACKOFF_MS / 1000) + 'ث. الحل الجذري: اضبط EULER_SIGN_API_KEY. التفاصيل: ' + msg);
      this.setState('error', { code: 'rate_limited' });
      this.scheduleReconnect(withJitter(RATE_LIMIT_BACKOFF_MS));
      return;
    }
    const looksLikeMissingUser = (
      low.includes('failed to retrieve room id') ||
      low.includes('failed to fetch room id') ||
      (low.includes('room id') && (low.includes('not found') || low.includes('invalid'))) ||
      low.includes('user not found') ||
      low.includes("doesn't exist") || low.includes('does not exist') ||
      low.includes('404')
    );
    if (looksLikeMissingUser) {
      log('info', '@' + this.uniqueId + ' — يوزرنيم غير موجود (على الأغلب): ' + msg);
      this.setState('error', { code: 'user_not_found' });
      this.scheduleReconnect(withJitter(NOT_LIVE_RETRY_DELAY_MS));
      return;
    }
    log('warn', '@' + this.uniqueId + ' — خطأ اتصال: ' + msg);
    this.setState('error', { code: 'connect_failed' });
    this.scheduleReconnect(withJitter(RECONNECT_DELAY_MS));
  }

  disconnect() {
    if (this.connection) {
      try { this.connection.disconnect(); } catch (e) { /* ignore */ }
    }
  }
}

// ------------------------------------------------------------------ يوتيوب (youtube-chat — بدون أي مفتاح API)
class YoutubeRoom extends BaseRoom {
  constructor(rawIdentifier) {
    const ytId = parseYoutubeIdentifier(rawIdentifier);
    super('youtube:' + rawIdentifier.toLowerCase(), youtubeIdentifierLabel(ytId));
    this.rawIdentifier = rawIdentifier;
    this.ytId = ytId;
  }

  async start() {
    if (this.connection) return;
    this.stopped = false;
    this.setState('connecting');

    if (!this.ytId) {
      log('info', 'youtube:' + this.rawIdentifier + ' — مُدخل غير صالح');
      this.setState('error', { code: 'user_not_found' });
      this.scheduleReconnect(withJitter(NOT_LIVE_RETRY_DELAY_MS));
      return;
    }

    const liveChat = new YoutubeLiveChat(this.ytId);
    this.connection = liveChat;

    liveChat.on('start', (liveId) => {
      log('info', 'youtube:' + this.displayId + ' — بدأ استقبال الشات (liveId=' + liveId + ')');
      this.setState('connected');
    });

    liveChat.on('chat', (chatItem) => {
      this.broadcast({ messages: [buildYoutubeComment(chatItem)] });
    });

    liveChat.on('end', (reason) => {
      log('info', 'youtube:' + this.displayId + ' — انتهى الاستماع (' + (reason || '') + ')');
      if (this.stopped) return;
      this.connection = null;
      this.setState('not_live');
      this.scheduleReconnect(withJitter(NOT_LIVE_RETRY_DELAY_MS));
    });

    // youtube-chat لا يميّز نوع الخطأ (لا رمز حالة مخصص لـ"غير موجود" ولا
    // rate-limit) — أشيع سبب فعلي هو ببساطة عدم وجود بث لايف نشط حالياً على
    // هذا الهاندل/القناة، فنعامل كل الأخطاء هنا كـ"not_live" مع نفس التراجع
    // المستخدم لتيك توك، بدل رسالة خطأ عامة مضلّلة.
    liveChat.on('error', (err) => {
      this.handleConnectError(err);
    });

    try {
      const ok = await liveChat.start();
      if (!ok) throw new Error('youtube-chat: start() returned false');
    } catch (err) {
      this.connection = null;
      this.handleConnectError(err);
    }
  }

  handleConnectError(err) {
    const msg = (err && err.message) || String(err);
    log('info', 'youtube:' + this.displayId + ' — ' + msg);
    this.setState('not_live');
    this.scheduleReconnect(withJitter(NOT_LIVE_RETRY_DELAY_MS));
  }

  disconnect() {
    if (this.connection) {
      try { this.connection.stop(); } catch (e) { /* ignore */ }
    }
  }
}

// ------------------------------------------------------------------ كيك (@retconned/kick-js — readOnly، بدون أي بيانات اعتماد)
class KickRoom extends BaseRoom {
  constructor(rawIdentifier) {
    const channelName = parseKickIdentifier(rawIdentifier);
    super('kick:' + rawIdentifier.toLowerCase(), '@' + (channelName || rawIdentifier));
    this.rawIdentifier = rawIdentifier;
    this.channelName = channelName;
  }

  async start() {
    if (this.connection) return;
    this.stopped = false;
    this.setState('connecting');

    if (!this.channelName) {
      log('info', 'kick:' + this.rawIdentifier + ' — مُدخل غير صالح');
      this.setState('error', { code: 'user_not_found' });
      this.scheduleReconnect(withJitter(NOT_LIVE_RETRY_DELAY_MS));
      return;
    }

    let client;
    try {
      client = createKickClient(this.channelName, { readOnly: true, logger: false });
    } catch (err) {
      this.handleConnectError(err);
      return;
    }
    this.connection = client;

    client.on('ready', () => {
      log('info', 'kick:' + this.channelName + ' — متصل');
      this.setState('connected');
    });

    client.on('ChatMessage', (data) => {
      this.broadcast({ messages: [buildKickComment(data)] });
    });

    // المكتبة تدير إعادة اتصال الـ WebSocket الداخلي (Pusher) بنفسها — نكتفي
    // هنا بإشعار العملاء بصرياً، بدون إعادة إنشاء العميل بالكامل.
    client.on('disconnect', () => {
      log('info', 'kick:' + this.channelName + ' — انفصل (إعادة الاتصال تُدار داخلياً بالمكتبة)');
      if (!this.stopped) this.setState('reconnecting');
    });

    client.on('error', (err) => {
      this.handleConnectError(err);
    });
  }

  handleConnectError(err) {
    const status = err && err.status;
    if (status === 404) {
      log('info', 'kick:' + this.channelName + ' — يوزرنيم/قناة غير موجودة');
      this.setState('error', { code: 'user_not_found' });
      this.disconnect();
      this.scheduleReconnect(withJitter(NOT_LIVE_RETRY_DELAY_MS));
      return;
    }
    const msg = (err && err.message) || String(err);
    log('warn', 'kick:' + this.channelName + ' — خطأ: ' + msg);
    this.setState('error', { code: 'connect_failed' });
    this.disconnect();
    this.scheduleReconnect(withJitter(RECONNECT_DELAY_MS));
  }

  disconnect() {
    if (this.connection) {
      try { this.connection.destroy(); } catch (e) { /* ignore */ }
      this.connection = null;
    }
  }
}

// rooms: 'platform:معرّف'(lowercase) -> BaseRoom
const rooms = new Map();

function getOrCreateRoom(platform, rawIdentifier) {
  const lower = rawIdentifier.toLowerCase();
  const key = platform + ':' + lower;
  let room = rooms.get(key);
  if (room) return room;

  if (platform === 'youtube') room = new YoutubeRoom(rawIdentifier);
  else if (platform === 'kick') room = new KickRoom(rawIdentifier);
  else room = new TikTokRoom(lower); // 'tiktok' والافتراضي

  rooms.set(key, room);
  room.start();
  return room;
}

// ------------------------------------------------------------------ بروفايل عام (أفتار اللاعب) — تيك توك فقط، غير ملموس
// GET /profile?u=<username>  ->  { ok, uniqueId, nickname, avatar }
//
// خاص بميزة "ربط حسابي بتيك توك" في صفحة البروفايل بالموقع: اللاعب العادي
// يكتب يوزره مرة وحدة عشان نعرف هويته ونجيب صورته. هذا المسار **لا يفتح أي
// اتصال بث** ولا ينشئ Room ولا يلمس TikTokLiveConnection إطلاقاً — فقط قراءة
// صفحة البروفايل العامة واستخراج الصورة والاسم المعروض منها.
//
// النتيجة تُخزَّن بالذاكرة مدة PROFILE_CACHE_TTL_MS حتى ما نطلب من تيك توك
// نفس اليوزر مرة بعد مرة (الربط يصير مرة واحدة لكل لاعب أصلاً).
const PROFILE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PROFILE_FETCH_TIMEOUT_MS = 8000;
const PROFILE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const profileCache = new Map(); // uniqueId -> { at, data }

function profileCorsHeaders(extra) {
  return Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=3600',
  }, extra || {});
}

// تيك توك يحقن بيانات الصفحة كـJSON داخل وسم <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">.
// نقرأ منه userInfo.user (avatarLarger/avatarMedium/nickname). لو تغيّر الشكل
// عند تيك توك، نرجع لبحث نصي بسيط عن أول رابط صورة بروفايل — وإن فشل الاثنان
// نرجّع ok:false والموقع يكمّل بأفتار افتراضي بدون ما تتعطل عملية الربط.
function extractProfileFromHtml(html) {
  try {
    const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
      const data = JSON.parse(m[1]);
      const scope = data && data.__DEFAULT_SCOPE__;
      const detail = scope && scope['webapp.user-detail'];
      const user = detail && detail.userInfo && detail.userInfo.user;
      if (user) {
        return {
          nickname: user.nickname || user.uniqueId || '',
          avatar: user.avatarLarger || user.avatarMedium || user.avatarThumb || '',
        };
      }
    }
  } catch (err) { /* نكمّل للبديل النصي */ }
  const flat = html.replace(/\\\//g, '/');
  const direct = flat.match(/https:\/\/[^"'\s]*tiktokcdn[^"'\s]*?\.(?:jpeg|jpg|webp)[^"'\s]*/);
  if (direct) return { nickname: '', avatar: direct[0] };
  return null;
}

async function fetchPublicProfile(uniqueId) {
  const cached = profileCache.get(uniqueId);
  if (cached && (Date.now() - cached.at) < PROFILE_CACHE_TTL_MS) return cached.data;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROFILE_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch('https://www.tiktok.com/@' + encodeURIComponent(uniqueId), {
      headers: { 'User-Agent': PROFILE_UA, 'Accept-Language': 'ar,en;q=0.9' },
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error('http ' + resp.status);
    const html = await resp.text();
    const found = extractProfileFromHtml(html);
    if (!found || !found.avatar) throw new Error('no-avatar');
    const data = { ok: true, uniqueId, nickname: found.nickname || uniqueId, avatar: found.avatar };
    profileCache.set(uniqueId, { at: Date.now(), data });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ خادم HTTP + WebSocket
const server = http.createServer(async (req, res) => {
  const path = (req.url || '').split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, profileCorsHeaders());
    res.end();
    return;
  }

  if (path === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  if (path === '/profile') {
    const uniqueId = (new URL(req.url, 'http://localhost').searchParams.get('u') || '')
      .trim().replace(/^@/, '').toLowerCase();
    const headers = profileCorsHeaders({ 'Content-Type': 'application/json; charset=utf-8' });
    if (!uniqueId || !/^[a-z0-9._]{2,24}$/.test(uniqueId)) {
      res.writeHead(400, headers);
      res.end(JSON.stringify({ ok: false, reason: 'bad-username' }));
      return;
    }
    try {
      const data = await fetchPublicProfile(uniqueId);
      res.writeHead(200, headers);
      res.end(JSON.stringify(data));
    } catch (err) {
      log('info', '@' + uniqueId + ' — تعذّر جلب البروفايل العام: ' + (err && err.message));
      res.writeHead(200, headers);
      res.end(JSON.stringify({ ok: false, uniqueId, reason: 'fetch-failed' }));
    }
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

const wss = new WebSocketServer({ server, path: '/ws' });
const VALID_PLATFORMS = new Set(['tiktok', 'youtube', 'kick']);

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const rawUser = (url.searchParams.get('u') || url.searchParams.get('uniqueId') || '').trim().replace(/^@/, '');
  // platform افتراضياً 'tiktok' — يحافظ على توافق أي نسخة فرونت إند قديمة ما
  // ترسل platform= إطلاقاً (سلوك تيك توك الحالي لا يتأثر بهذا التعديل).
  const platformRaw = (url.searchParams.get('platform') || 'tiktok').trim().toLowerCase();
  const platform = VALID_PLATFORMS.has(platformRaw) ? platformRaw : 'tiktok';

  if (!rawUser) {
    ws.close(4400, 'اكتب يوزر/رابط البث');
    return;
  }

  // مفتاح فحص Firestore: نفس المعرّف المستخدم لفتح الاتصال الفعلي بهذي
  // المنصة (uniqueId تيك توك بحروف صغيرة، أو يوزر/هاندل يوتيوب، أو يوزر كيك).
  const checkId = rawUser.toLowerCase();
  const enabled = await isStreamerEnabled(checkId);
  if (!enabled) {
    log('info', platform + ':' + checkId + ' — الاتصال مرفوض (الحساب معطّل من المالك)');
    ws.close(4403, 'هذا الحساب معطّل من إدارة المنصة');
    return;
  }

  log('info', platform + ':' + checkId + ' — عميل جديد اتصل');
  const room = getOrCreateRoom(platform, rawUser);
  room.addClient(ws);

  ws.on('close', () => {
    room.removeClient(ws);
    log('info', platform + ':' + checkId + ' — عميل انفصل');
  });

  ws.on('error', () => {
    room.removeClient(ws);
  });
});

// ------------------------------------------------------------------ Keep-Alive (منع خمول خطة Render المجانية)
// خطة Render المجانية توقف الخدمة (Spin down) بعد ~15 دقيقة بلا طلبات واردة،
// فأول اتصال بعدها يأخذ Cold Start ~30-60ث. Render يوفّر RENDER_EXTERNAL_URL
// تلقائياً؛ نطلب /healthz دورياً (كل 10 دقائق < 15) لإبقاء الخدمة مستيقظة ما
// دامت حيّة. ملاحظة: هذا يمنع الخمول ولا يوقظ خدمة نائمة أصلاً — لضمان أقوى
// أضِف مُراقِباً خارجياً (cron-job.org / UptimeRobot) يطلب نفس المسار.
function startKeepAlive() {
  const base = (process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
  if (!base) { log('info', 'Keep-Alive غير مفعّل (RENDER_EXTERNAL_URL غير متاح)'); return; }
  const url = base + '/healthz';
  const intervalMs = 10 * 60 * 1000;
  const https = require('https');
  const timer = setInterval(() => {
    try {
      const req = https.get(url, (res) => { res.resume(); });
      req.on('error', () => {});
      req.setTimeout(15000, () => { try { req.destroy(); } catch (e) {} });
    } catch (e) { /* best-effort */ }
  }, intervalMs);
  timer.unref();
  log('info', 'Keep-Alive مفعّل — ' + url + ' كل 10 دقائق');
}

initFirestore();
server.listen(PORT, () => {
  log('info', 'خادم جسر البث يعمل على المنفذ ' + PORT + ' (WebSocket: /ws?platform=tiktok|youtube|kick&u=username)');
  startKeepAlive();
});

process.on('SIGTERM', () => {
  log('info', 'إيقاف السيرفر (SIGTERM)…');
  for (const room of rooms.values()) room.teardown();
  server.close(() => process.exit(0));
});
