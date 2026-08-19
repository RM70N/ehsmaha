// -*- coding: utf-8 -*-
//
// TikTok Live Bridge Server — ehsmaha.com
// =========================================
// سيرفر واحد مستضاف مرة وحدة (وليس تطبيقاً محلياً عند الستريمر). يستقبل
// اتصالات WebSocket من الموقع مباشرة (وهو المسؤول الوحيد عن تشغيل مكتبة
// TikTok Live والاتصال ببثوث تيك توك)، لكل ستريمر عبر يوزرنيمه فقط — بدون
// أي مفتاح API إطلاقاً.
//
// معمارية الجلسات:
//   - "Room" واحدة لكل يوزرنيم تيك توك (uniqueId بحروف صغيرة). أول عميل
//     يطلب يوزرنيم معيّن ينشئ اتصال TikTokLiveConnection واحد لذلك اليوزر؛
//     أي عميل إضافي (لعبة ثانية، جهاز ثانٍ لنفس الستريمر) ينضم لنفس
//     الـ Room ويستقبل نفس تدفق الأحداث فوراً بدون فتح اتصال TikTok مكرر.
//   - الـ Room تُغلق تلقائياً وتحرر موارد TikTokLive عند خروج آخر عميل.
//
// التحقق من التفعيل/التعطيل:
//   - قبل قبول أي اتصال، يُفحص مستند Firestore عند
//     bridgeStreamers/{uniqueId}. إذا enabled === false يُرفض الاتصال فوراً
//     برمز إغلاق 4403 ورسالة واضحة — الستريمر ما يقدر يلعب أي لعبة إطلاقاً.
//
// شكل الأحداث المُرسَلة للموقع — نفس الغلاف الذي تفهمه كل الألعاب اليوم
// ({messages:[...]}) بنفس حقول user (uniqueId/nickname/profilePictureUrl/
// isFollower/followInfo) التي تستهلكها extractUser() في index.html، حتى لا
// يحتاج أي تعديل إضافي على منطق الألعاب.

'use strict';

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const {
  TikTokLiveConnection, WebcastEvent, ControlEvent, UserOfflineError,
} = require('tiktok-live-connector');

// مفتاح Euler Stream اختياري بالكامل (متغير بيئة على السيرفر فقط — لا علاقة
// له بالستريمر ولا يُطلب منه أبداً). بدونه تعمل المكتبة على الطبقة المجانية
// من Euler Stream (محدودة المعدل)؛ وجوده يرفع الحد الأقصى للاتصالات المتزامنة
// فقط. راجع options.signApiKey في tiktok-live-connector.
const EULER_SIGN_API_KEY = process.env.EULER_SIGN_API_KEY || '';

const PORT = process.env.PORT || 8080;
const RECONNECT_DELAY_MS = 5000;
const NOT_LIVE_RETRY_DELAY_MS = 20000;
const ROOM_IDLE_GRACE_MS = 5000; // مهلة قبل إغلاق الغرفة بعد خروج آخر عميل (يتجنب فتح/إغلاق سريع عند إعادة تحميل الصفحة)

// ------------------------------------------------------------------ Firestore (تفعيل/تعطيل الستريمرز)
// نفس مشروع فايربيس الذي يستخدمه index.html (streamgame-180b8). نقرأ فقط
// enabled بمستند bridgeStreamers/{username} — لا حاجة لأي بيانات اعتماد
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

async function isStreamerEnabled(uniqueId) {
  if (!db) return true; // لا فحص إذا Firestore غير متاح — لا نمنع الخدمة بالكامل
  try {
    const snap = await db.collection('bridgeStreamers').doc(uniqueId).get();
    if (!snap.exists) return true; // لم يُعطَّل صراحة = مسموح افتراضياً
    const data = snap.data() || {};
    return data.enabled !== false;
  } catch (e) {
    log('warn', 'فحص Firestore فشل لـ @' + uniqueId + ': ' + e.message);
    return true; // فشل الفحص لا يمنع الخدمة
  }
}

function log(level, msg) {
  const stamp = new Date().toISOString();
  console.log('[' + stamp + '] [' + level.toUpperCase() + '] ' + msg);
}

// ------------------------------------------------------------------ بناء الأحداث الموحّدة (مطابقة لما تتوقعه الألعاب)
// أسماء الحقول هنا تم التحقق منها فعلياً من بيانات خام حقيقية (bridge status
// وحدث CHAT حقيقي من بث لايف فعلي)، وليس من توثيق/تخمين — راجع
// tiktok-server/_inspect_user.js. النسخة المثبتة من tiktok-live-connector
// (2.4.x) لا تحتوي uniqueId إطلاقاً؛ اليوزرنيم الحقيقي في displayId. الصورة
// في avatarThumb.urlList (مو profilePicture.urls). followStatus يرجع كنص
// ("0"/"1"/"2")، فالمقارنة الرقمية المباشرة كانت تفشل دائماً حتى للمتابعين
// الحقيقيين.
function extractUser(user) {
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
function buildComment(data) {
  const user = extractUser(data.user);
  const text = data.content || data.comment || '';
  return { type: 'WebcastChatMessage', comment: text, user, timestamp: Date.now() };
}

// data.gift (مو data.giftDetails — تحقق من tiktok-live-proto v3 WebcastGiftMessage
// أعلاه: الحقل الصحيح gift: Gift، وGift.name/diamondCount/type).
function buildGift(data) {
  const user = extractUser(data.user);
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

function buildFollow(data) {
  const user = extractUser(data.user);
  return { type: 'WebcastSocialMessage', displayType: 'follow', user, timestamp: Date.now() };
}

// data.count/data.total (مو likeCount/totalLikeCount — تحقق فعلي من بث لايف
// حقيقي، راجع تعليق extractUser أعلاه لنفس السبب).
function buildLike(data) {
  const user = extractUser(data.user);
  return { type: 'WebcastLikeMessage', likeCount: Number(data.count) || 0, totalLikeCount: Number(data.total) || 0, user, timestamp: Date.now() };
}

function buildViewer(count) {
  return { type: 'WebcastRoomUserSeqMessage', viewerCount: count || 0, timestamp: Date.now() };
}

function buildStatus(state, message, extra) {
  return Object.assign({ type: 'bridge_status', state, message, timestamp: Date.now() }, extra || {});
}

// ------------------------------------------------------------------ إدارة الغرف (room = يوزرنيم واحد)
// rooms: uniqueId(lowercase) -> Room
const rooms = new Map();

class Room {
  constructor(uniqueId) {
    this.uniqueId = uniqueId;
    this.clients = new Set();
    this.connection = null;
    this.state = 'idle';
    this.stopped = false;
    this.notLiveRetries = 0;
    this.reconnectTimer = null;
    this.closeTimer = null;
    this.firstCommentSeen = false;
    this.lastExtra = null;
  }

  addClient(ws) {
    if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null; }
    this.clients.add(ws);
    // أرسل للعميل الجديد الحالة الحالية فوراً
    this.sendTo(ws, buildStatus(this.state, this.messageForState(this.state, this.lastExtra), this.lastExtra));
  }

  removeClient(ws) {
    this.clients.delete(ws);
    if (this.clients.size === 0 && !this.closeTimer) {
      this.closeTimer = setTimeout(() => this.teardown(), ROOM_IDLE_GRACE_MS);
    }
  }

  messageForState(state, extra) {
    if (state === 'error' && extra && extra.code === 'user_not_found') {
      return '@' + this.uniqueId + ' — يوزرنيم غير موجود، تأكد من كتابته صح';
    }
    const map = {
      connecting: 'جاري الاتصال بـ @' + this.uniqueId + '…',
      connected: 'متصل بالبث المباشر ✅',
      not_live: '@' + this.uniqueId + ' مو مفتوح بث الآن',
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
      this.scheduleReconnect(RECONNECT_DELAY_MS);
    });

    conn.on(WebcastEvent.CHAT, (data) => {
      if (!this.firstCommentSeen) {
        this.firstCommentSeen = true;
        log('info', '@' + this.uniqueId + ' — أول CommentEvent فعلي وصل: "' + String(data.comment || '').slice(0, 40) + '"');
      }
      this.broadcast({ messages: [buildComment(data)] });
    });

    conn.on(WebcastEvent.GIFT, (data) => {
      // الهدايا القابلة للتتابع (streak, gift.type===1) ترسل عدة أحداث أثناء التتابع؛
      // repeatEnd (0/1) يشير لآخر حدث بالتتابع — نبث مرة وحدة فقط عند انتهائه حتى لا
      // تُحتسب الهدية مضاعفة بالألعاب. الهدايا غير القابلة للتتابع تُبث فوراً.
      // (data.gift.type مو data.giftDetails.giftType — راجع تعليق buildGift أعلاه.)
      const giftType = data.gift && data.gift.type;
      if (giftType === 1 && !data.repeatEnd) return;
      this.broadcast({ messages: [buildGift(data)] });
    });

    conn.on(WebcastEvent.FOLLOW, (data) => {
      this.broadcast({ messages: [buildFollow(data)] });
    });

    conn.on(WebcastEvent.LIKE, (data) => {
      this.broadcast({ messages: [buildLike(data)] });
    });

    conn.on(WebcastEvent.ROOM_USER, (data) => {
      // data.totalUser مو data.viewerCount — تحقق فعلي من بث لايف حقيقي (راجع
      // تعليق extractUser أعلاه).
      this.broadcast({ messages: [buildViewer(data.totalUser)] });
    });

    conn.on(WebcastEvent.STREAM_END, () => {
      log('info', '@' + this.uniqueId + ' — انتهى البث');
      if (this.stopped) return;
      this.setState('not_live');
      this.scheduleReconnect(NOT_LIVE_RETRY_DELAY_MS);
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
      this.scheduleReconnect(NOT_LIVE_RETRY_DELAY_MS);
      return;
    }
    // لا يوجد صنف خطأ مخصص لـ"يوزرنيم غير موجود" بالمكتبة الحالية — نميّزه
    // من نص الرسالة (فشل جلب room id / room info من TikTok لحساب غير موجود
    // يختلف نصياً عن أخطاء الشبكة أو خدمة التوقيع).
    const msg = (err && err.message) || String(err);
    const low = msg.toLowerCase();
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
      this.scheduleReconnect(NOT_LIVE_RETRY_DELAY_MS);
      return;
    }
    log('warn', '@' + this.uniqueId + ' — خطأ اتصال: ' + msg);
    this.setState('error', { code: 'connect_failed' });
    this.scheduleReconnect(RECONNECT_DELAY_MS);
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

  teardown() {
    log('info', '@' + this.uniqueId + ' — إغلاق الغرفة (لا عملاء متبقّين)');
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.connection) {
      try { this.connection.disconnect(); } catch (e) { /* ignore */ }
      this.connection = null;
    }
    rooms.delete(this.uniqueId);
  }
}

function getOrCreateRoom(uniqueId) {
  let room = rooms.get(uniqueId);
  if (!room) {
    room = new Room(uniqueId);
    rooms.set(uniqueId, room);
    room.start();
  }
  return room;
}

// ------------------------------------------------------------------ خادم HTTP + WebSocket
const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const rawUser = (url.searchParams.get('u') || url.searchParams.get('uniqueId') || '').trim().replace(/^@/, '');
  const uniqueId = rawUser.toLowerCase();

  if (!uniqueId) {
    ws.close(4400, 'اكتب يوزرنيم تيك توك');
    return;
  }

  const enabled = await isStreamerEnabled(uniqueId);
  if (!enabled) {
    log('info', '@' + uniqueId + ' — الاتصال مرفوض (الحساب معطّل من المالك)');
    ws.close(4403, 'هذا الحساب معطّل من إدارة المنصة');
    return;
  }

  log('info', '@' + uniqueId + ' — عميل جديد اتصل');
  const room = getOrCreateRoom(uniqueId);
  room.addClient(ws);

  ws.on('close', () => {
    room.removeClient(ws);
    log('info', '@' + uniqueId + ' — عميل انفصل');
  });

  ws.on('error', () => {
    room.removeClient(ws);
  });
});

initFirestore();
server.listen(PORT, () => {
  log('info', 'خادم جسر تيك توك يعمل على المنفذ ' + PORT + ' (WebSocket: /ws?u=username)');
});

process.on('SIGTERM', () => {
  log('info', 'إيقاف السيرفر (SIGTERM)…');
  for (const room of rooms.values()) room.teardown();
  server.close(() => process.exit(0));
});
