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
//   - tiktok  : tiktok-live-connector 2.5.x (الطريقة الوحيدة للربط بتيك توك). التوقيع
//               عبر EulerStream بمفتاح من متغيّر البيئة EULER_API_KEY (اختياري —
//               بدونه تعمل الطبقة المجانية مع تحذير باللوغ). راجع .env.example.
//   - youtube : مكتبة youtube-chat — تقبل يوزر/هاندل القناة، رابط القناة،
//               رابط البث المباشر، أو معرف الفيديو. بدون مفتاح YouTube API.
//   - kick    : مكتبة kick-live-connector (lox-x) — بدون تسجيل دخول أو أي
//               توكن. تقبل يوزرنيم القناة أو رابط kick.com/يوزر، وتحل
//               بيانات القناة وغرفة الشات تلقائياً من الاسم وحده. إعادة
//               الاتصال التلقائية من طرفنا (المكتبة لا توفّرها).
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
// متطلب نشر خاص بكيك:
//   kick-live-connector تعتمد على Playwright لجلب بيانات القناة من kick.com،
//   أي أنها تحتاج متصفح Chromium مثبتاً على السيرفر (وليس حزمة npm فقط).
//   لذلك أُضيف postinstall بـpackage.json يشغّل `playwright install chromium`.
//   الـ`|| true` هناك مقصودة: لو فشل التنزيل (شبكة/صلاحيات المستضيف) ما ينكسر
//   النشر كله — تتعطّل كيك وحدها وتكمل تيك توك/يوتيوب بشكل طبيعي.
//   انتبه أيضاً: كل محاولة اتصال بكيك تشغّل Chromium ثلاث مرات، فهي أثقل
//   بكثير على الذاكرة/المعالج من تيك توك ويوتيوب.

// شكل الأحداث المُرسَلة للموقع — نفس الغلاف الذي تفهمه كل الألعاب اليوم
// ({messages:[...]}) بنفس حقول user (uniqueId/nickname/profilePictureUrl/
// isFollower/followInfo) التي تستهلكها extractUser() في index.html، حتى لا
// يحتاج أي تعديل إضافي على منطق الألعاب — بغض النظر عن مصدر الحدث.

'use strict';

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const tiktokLib = require('tiktok-live-connector');
const {
  TikTokLiveConnection, WebcastEvent, ControlEvent, UserOfflineError,
  SignatureRateLimitError, SignAPIError, InvalidResponseCompositeError, InvalidUniqueIdError,
} = tiktokLib;
const { LiveChat: YoutubeLiveChat } = require('youtube-chat');
const { KickConnection, Events: KickEvents } = require('kick-live-connector');

// instanceof آمن: لو صنف خطأ ما غير مُصدَّر بنسخة المكتبة (أو بمحاكي الاختبار)
// يرجع false بدل ما يرمي TypeError.
function isErr(err, Cls) { return typeof Cls === 'function' && err instanceof Cls; }

// مفتاح Euler Stream (خدمة التوقيع التي تعتمد عليها tiktok-live-connector) —
// متغير بيئة على السيرفر فقط، ولا يُكتب في الكود أو git أبداً. بدونه تعمل
// المكتبة على الطبقة المجانية المحدودة بعدد طلبات لكل IP (وIP خدمات Render
// مشترك، فتُستهلك الحصة بسرعة). EULER_API_KEY هو الاسم المعتمد؛ الاسمان
// القديمان مقبولان كبديل حتى لا يتعطل مفتاح مضبوط سابقاً على Render:
//   EULER_SIGN_API_KEY (اسم قديم بهذا المشروع) وSIGN_API_KEY (الاسم الذي تقرأه المكتبة نفسها).
const EULER_KEY_ENV = ['EULER_API_KEY', 'EULER_SIGN_API_KEY', 'SIGN_API_KEY'].find((k) => (process.env[k] || '').trim()) || '';
const EULER_API_KEY = EULER_KEY_ENV ? process.env[EULER_KEY_ENV].trim() : '';
const TIKTOK_LIB_VERSION = tiktokLib.VERSION || 'unknown';
const BOOT_AT = Date.now();

const PORT = process.env.PORT || 8080;
const RECONNECT_DELAY_MS = 5000;
const NOT_LIVE_RETRY_DELAY_MS = 20000;
const ROOM_IDLE_GRACE_MS = 5000; // مهلة قبل إغلاق الغرفة بعد خروج آخر عميل (يتجنب فتح/إغلاق سريع عند إعادة تحميل الصفحة)
// آخر عميل انقطع انقطاعاً غير طبيعي (شبكة/نوم جهاز/نبض ميت — مو close(1000) مقصود):
// نبقي الغرفة واتصال تيك توك دقيقة كاملة، فلما يرجع يلقى نفس الغرفة ويستلم ما فاته.
const ROOM_ABNORMAL_GRACE_MS = 60000;

// ---------------- نبض الاتصال + إعادة إرسال ما فات (كل المنصات) ----------------
// ping/pong على مستوى البروتوكول يكشف العملاء الميتين (TCP مقطوع بصمت) ويطردهم،
// و{type:'bridge_ping'} رسالة تطبيق يشوفها المتصفح (المتصفح ما يكشف ping للجافاسكربت)
// عشان يعرف إن الاتصال حي حتى لو الشات هادي، ويعيد الاتصال لو انقطعت.
const HEARTBEAT_MS = Number(process.env.BRIDGE_HEARTBEAT_MS || 20000);
// كل حدث شات/هدية/متابعة ياخذ id = BOOT_ID.seq، والغرفة تحفظ آخر REPLAY_MAX حدث
// (بحد أقصى REPLAY_WINDOW_MS). العميل يرسل ?since=<آخر id> عند إعادة الاتصال فنرسل
// له ما فاته. BOOT_ID يتغير مع كل تشغيل للسيرفر، فالـids القديمة بعد إعادة تشغيل
// ما تطابق (المخزن ضاع أصلاً) — ما نرسل شيء خطأ.
const BOOT_ID = Date.now().toString(36);
const REPLAY_MAX = 300;
const REPLAY_WINDOW_MS = 90000;

// ---------------- سياسة إعادة المحاولة — تيك توك فقط ----------------
// هذه الثوابت تُستخدم داخل TikTokRoom وحدها — يوتيوب/كيك يكملان على
// RECONNECT_DELAY_MS/NOT_LIVE_RETRY_DELAY_MS + withJitter بلا أي تغيير إطلاقاً.
//
// المبدأ: كل محاولة اتصال بتيك توك تستهلك طلب توقيع واحداً على الأقل من حصة
// Euler Stream، فلا توجد أبداً حلقة إعادة اتصال سريعة:
//   - فشل عابر: 2ث ← 4ث ← 8ث … حتى دقيقة، مع jitter ±25%.
//   - بعد TIKTOK_PARK_AFTER_FAILS فشلاً متتالياً: "وضع التهدئة" — محاولة كل
//     5 دقائق فقط ما دام فيه عميل (والغرفة تُغلق نهائياً بعد خروج آخر عميل).
//   - rate limit/429: يحترم retry-after إن وصل، وإلا 30ث ← 60ث … حتى 5 دقائق،
//     ويُطبَّق على كل الغرف (الحصة مشتركة لكل السيرفر) لا على الغرفة وحدها.
//   - اتصال نجح ثم انقطع قبل TIKTOK_STABLE_MS يُحتسب فشلاً (لا يُصفّر العداد)،
//     وإلا كان "اتصل ← انقطع فوراً" يتكرر كل ثانيتين للأبد ويحرق الحصة.
//   - "مو لايف": 20ث ← 30ث ← 45ث ← 60ث كحد أقصى.
//   - يوزر غير موجود: 60ث ← 120ث … حتى 5 دقائق.
const TIKTOK_FIRST_RETRY_MS = 2000;
const TIKTOK_MAX_RETRY_MS = 60000;
const TIKTOK_PARK_AFTER_FAILS = 8;
const TIKTOK_PARKED_RETRY_MS = 5 * 60 * 1000;
const TIKTOK_RATE_LIMIT_MIN_MS = 30000;
const TIKTOK_RATE_LIMIT_MAX_MS = 5 * 60 * 1000;
const TIKTOK_RETRY_AFTER_CAP_MS = 15 * 60 * 1000;
const TIKTOK_NOT_LIVE_MIN_MS = 20000;
const TIKTOK_NOT_LIVE_MAX_MS = 60000;
const TIKTOK_NOT_FOUND_MIN_MS = 60000;
const TIKTOK_NOT_FOUND_MAX_MS = 5 * 60 * 1000;
const TIKTOK_STABLE_MS = 60000;
// بعد هذا العدد من المحاولات الفاشلة المتتالية نرسل للعميل fatal:true —
// الواجهة تعرض عندها رسالة خطأ نهائية وتوقف "جاري الاتصال" بدل ما تظل
// تدور بلا نهاية. السيرفر يكمل المحاولة بالخلفية بالتراجع أعلاه، فلو رجعت
// الخدمة يتصل من نفسه ما دام العميل فاتحاً الصفحة.
const TIKTOK_MAX_CONSECUTIVE_FAILS = 4;
// مهلة connect() نفسه: بدونها لو علّق وعد المكتبة (طلب HTTP لا يُحسم)
// تبقى الغرفة بحالة 'connecting' للأبد وما تصل الواجهة أي إشارة — وهذا
// أحد أسباب "جاري الاتصال" اللانهائي. (نفس علاج KICK_CONNECT_TIMEOUT_MS لكيك.)
const TIKTOK_CONNECT_TIMEOUT_MS = 25000;

// بوابة التوقيع المشتركة: حصة Euler لكل مفتاح/IP وليست لكل غرفة، فأول 429 يوقف
// كل الغرف عن طلب توقيع جديد حتى ينتهي التراجع — بدل ما تضرب عشر غرف الخدمة
// نفسها وتطيل الحظر.
const tiktokSignGate = { until: 0, hits: 0 };

// jitter عشوائي يُضاف لكل تأخير إعادة محاولة حتى لا تُعيد كل الغرف الاتصال في
// نفس اللحظة (thundering herd) فتضرب خدمة التوقيع دفعة واحدة وتستهلك الحد.
function withJitter(base) { return base + Math.floor(Math.random() * 4000); }

// jitter متناسب خاص بتيك توك: ±25% من التأخير (بدل إضافة ثابتة) — يفرّق
// الغرف عن بعضها بدون ما يضاعف التأخيرات القصيرة. withJitter الأصلية بقيت
// كما هي بالضبط ليوتيوب/كيك.
function withTikTokJitter(base) {
  return Math.max(1000, Math.round(base * (0.75 + Math.random() * 0.5)));
}

// يسابق أي وعد بمهلة زمنية. ضروري لأي وعد قادم من مكتبة خارجية قد لا يُحسم
// أبداً (راجع ملاحظة connect() بصنف KickRoom تحت) — بدونه تعلّق الغرفة للأبد
// بحالة 'connecting' ولا تُعيد المحاولة إطلاقاً.
function withTimeout(promise, ms, timeoutMessage) {
  let timer = null;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

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
// tiktok-live-connector (2.4.x/2.5.0) لا تحتوي uniqueId إطلاقاً؛ اليوزرنيم الحقيقي
// في displayId. الصورة في avatarThumb/avatarMedium/... .urlList (مو profilePicture.urls).
// followStatus يرجع كنص ("0"/"1"/"2")، فالمقارنة الرقمية المباشرة كانت تفشل
// دائماً حتى للمتابعين الحقيقيين.
// المتابعة الحقيقية (هذا المشاهد متابع للستريمر) تجي بحقل مستقل بالرسالة نفسها:
// WebcastChatMessage.userIdentity.isFollowerOfAnchor (وكذلك WebcastGiftMessage) —
// مؤكد من تعريفات tiktok-live-proto v3 بالمكتبة 2.4.x/2.5.0. أما user.followInfo.followStatus
// فهو حقل من FollowInfo بجانب followingCount/followerCount (بيانات الملف العام)،
// وما يعبّر عن علاقة المشاهد بالستريمر — الاعتماد عليه وحده كان يحجب المتابعين
// الحقيقيين بـ"لازم تسوي فولو". نأخذ الاثنين (أيهما إيجابي = متابع)، ونرسل
// followKnown: true فقط لو وصلنا دليل صريح، حتى تفرّق الواجهة بين "غير متابع"
// و"غير معروف" (الأخيرة ما تُحجب بصمت).
// الأفتار: كائن User بـtiktok-live-proto v3 (المكتبة 2.5.0) فيه أربعة مقاسات،
// كل واحد ImageModel { urlList: string[] }: avatarThumb (~100px) ثم avatarMedium
// (~720px) ثم avatarLarge (~1080px) ثم avatarJpg. نبدأ بـavatarThumb لأنه
// يطابق أحجام العرض بالموقع (26–120px) وهو الأخف لما يكون فيه مئات اللاعبين،
// ونرجع للأكبر فقط لو كان الأصغر فاضياً. من كل قائمة نختار أول رابط https؛
// لو ما فيه إلا http أو رابط بلا بروتوكول نحوّله لـhttps (الموقع https، ورابط
// http كان يُحجب كمحتوى مختلط).
const TIKTOK_AVATAR_FIELDS = ['avatarThumb', 'avatarMedium', 'avatarLarge', 'avatarJpg'];

function toHttpsUrl(raw) {
  if (typeof raw !== 'string') return '';
  const url = raw.trim();
  if (/^https:\/\//i.test(url)) return url;
  if (/^http:\/\//i.test(url)) return 'https://' + url.slice(7);
  if (url.indexOf('//') === 0) return 'https:' + url;
  return '';
}

function pickTikTokAvatar(user) {
  if (!user) return '';
  for (const field of TIKTOK_AVATAR_FIELDS) {
    const list = user[field] && Array.isArray(user[field].urlList) ? user[field].urlList : [];
    const direct = list.find((u) => typeof u === 'string' && /^https:\/\//i.test(u.trim()));
    if (direct) return direct.trim();
    for (const u of list) {
      const fixed = toHttpsUrl(u);
      if (fixed) return fixed;
    }
  }
  // احتياط لأشكال قديمة/مسطّحة (profilePictureUrl نصي مباشرة)
  return toHttpsUrl(user.profilePictureUrl) || toHttpsUrl(user.avatarUrl) || '';
}

function extractTikTokUser(user, identity) {
  if (!user) {
    return { uniqueId: '?', nickname: '?', profilePictureUrl: '', avatar: '', avatarUrl: '', followRole: 0, isFollower: false, followKnown: false, followInfo: { followStatus: 0 } };
  }
  const uniqueId = user.displayId || user.uniqueId || user.userId || user.id || '?';
  const nickname = user.nickname || uniqueId;
  const avatar = pickTikTokAvatar(user);

  const followStatus = Number((user.followInfo && user.followInfo.followStatus) || 0);
  const byStatus = followStatus === 1 || followStatus === 2;
  const hasIdentity = !!identity && typeof identity === 'object';
  const byIdentity = hasIdentity && !!(identity.isFollowerOfAnchor || identity.isMutualFollowingWithAnchor || identity.isAnchor);
  const following = byIdentity || byStatus;

  return {
    uniqueId: String(uniqueId),
    nickname: String(nickname),
    // profilePictureUrl هو ما تقرأه extractUser() أولاً؛ avatar/avatarUrl نسختان
    // مطابقتان للتوافق مع أي مستهلك قديم.
    profilePictureUrl: avatar,
    avatar,
    avatarUrl: avatar,
    followRole: following ? 1 : 0,
    isFollower: following,
    followKnown: hasIdentity || byStatus,
    followInfo: { followStatus: following ? 1 : 0 },
  };
}

// عيّنة من الحقول الخام لأول رسائل كل غرفة باللوغات (تشخيص حقول المتابعة على بث
// حقيقي بدون أي أداة إضافية). العدد قابل للتغيير بمتغيّر البيئة، و0 = بدون تسجيل.
const FOLLOW_LOG_SAMPLES = Number(process.env.BRIDGE_LOG_FOLLOW_SAMPLES || 5);
function followFieldsSample(data) {
  const u = (data && data.user) || {};
  const id = data && data.userIdentity;
  return '@' + (u.displayId || u.uniqueId || '?') +
    ' followStatus=' + JSON.stringify(u.followInfo ? u.followInfo.followStatus : null) +
    ' userIdentity=' + (id ? JSON.stringify({ follower: !!id.isFollowerOfAnchor, mutual: !!id.isMutualFollowingWithAnchor, anchor: !!id.isAnchor, mod: !!id.isModeratorOfAnchor }) : 'غائب');
}

// data.content مو data.comment — تحقق فعلي من بث لايف حقيقي (WebcastChatMessage
// بالمكتبة المثبتة يستخدم content). هذا الحقل هو الأهم بكل الملف لأن كل لعبة
// تقرأ نص الشات منه لمطابقة الكلمات/الأوامر.
function buildTikTokComment(data) {
  const user = extractTikTokUser(data.user, data.userIdentity);
  const text = data.content || data.comment || '';
  return { type: 'WebcastChatMessage', comment: text, user, timestamp: Date.now() };
}

// data.gift (مو data.giftDetails — تحقق من tiktok-live-proto v3 WebcastGiftMessage:
// الحقل الصحيح gift: Gift، وGift.name/diamondCount/type).
function buildTikTokGift(data) {
  const user = extractTikTokUser(data.user, data.userIdentity);
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
  // حدث المتابعة نفسه دليل صريح إن هذا المشاهد صار متابعاً الآن.
  const user = Object.assign(extractTikTokUser(data.user), { isFollower: true, followKnown: true, followRole: 1, followInfo: { followStatus: 1 } });
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

// يقبل يوزرنيم كيك مجرد أو رابط kick.com/username ويرجّع اليوزر المجرّد
// بحروف صغيرة — kick-live-connector تحتاج الاسم وحده، وتحل بيانات القناة
// وغرفة الشات منه داخلياً (بدل إدخال chatroomId يدوياً كما كان سابقاً).
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

// المعرّف الموحَّد لكيك — نقطة الحقيقة الوحيدة المستخدمة لمفتاح الغرفة
// ولفحص التفعيل/التعطيل بـ Firestore، حتى لا يختلف الاثنان أبداً.
function canonicalKickId(rawIdentifier) {
  return parseKickIdentifier(rawIdentifier) || (rawIdentifier || '').trim().toLowerCase();
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
    this.seq = 0;
    this.replay = []; // [{ seq, at, msg }]
  }

  addClient(ws, since) {
    if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null; }
    this.clients.add(ws);
    this.sendTo(ws, buildStatus(this.state, this.messageForState(this.state, this.lastExtra), this.lastExtra));
    this.replaySince(ws, since);
  }

  removeClient(ws, abnormal) {
    if (!this.clients.delete(ws)) return;
    if (this.clients.size === 0 && !this.closeTimer) {
      this.closeTimer = setTimeout(() => this.teardown(), abnormal ? ROOM_ABNORMAL_GRACE_MS : ROOM_IDLE_GRACE_MS);
    }
  }

  // يوسم كل حدث بـid ويحفظه بمخزن الإعادة ثم يبثه.
  broadcastEvents(messages) {
    const now = Date.now();
    for (const msg of messages) {
      msg.id = BOOT_ID + '.' + (++this.seq);
      this.replay.push({ seq: this.seq, at: now, msg });
    }
    while (this.replay.length > REPLAY_MAX || (this.replay.length && now - this.replay[0].at > REPLAY_WINDOW_MS)) this.replay.shift();
    this.broadcast({ messages });
  }

  replaySince(ws, since) {
    const m = /^([a-z0-9]+)\.(\d+)$/.exec(String(since || ''));
    if (!m || m[1] !== BOOT_ID) return;
    const after = Number(m[2]);
    const cutoff = Date.now() - REPLAY_WINDOW_MS;
    const missed = this.replay.filter((e) => e.seq > after && e.at >= cutoff).map((e) => e.msg);
    if (missed.length) {
      log('info', this.key + ' — إعادة إرسال ' + missed.length + ' حدث فات العميل أثناء الانقطاع');
      this.sendTo(ws, { messages: missed, replay: true });
    }
  }

  messageForState(state, extra) {
    const id = this.displayId;
    if (state === 'error' && extra && extra.code === 'user_not_found') {
      return id + ' — يوزرنيم/قناة غير موجودة، تأكد من كتابته صح';
    }
    // fatal:true يرسله TikTokRoom وحده بعد عدة محاولات فاشلة متتالية —
    // رسالة نهائية واضحة بدل "جاري الاتصال" اللانهائي. يوتيوب/كيك ما
    // يرسلان fatal إطلاقاً فلا تتغير أي رسالة عندهما.
    if (state === 'error' && extra && extra.fatal) {
      if (extra.code === 'rate_limited') {
        return 'خدمة تيك توك مزدحمة الآن ورفضت طلبات الربط — انتظر دقيقة وحاول مرة ثانية';
      }
      if (extra.code === 'sign_failed') {
        return 'خدمة توقيع اتصال تيك توك ترفض الطلبات بعد عدة محاولات — نكمل المحاولة بالخلفية، حاول لاحقاً';
      }
      if (extra.code === 'blocked') {
        return 'تيك توك يحجب طلبات سيرفر الربط مؤقتاً بعد عدة محاولات — نكمل المحاولة بالخلفية، حاول لاحقاً';
      }
      return 'تعذّر الاتصال بـ ' + id + ' بعد عدة محاولات — تأكد إن البث مفتوح فعلاً وحاول لاحقاً';
    }
    // retryInSec (تيك توك فقط) = متى المحاولة القادمة، حتى ما تكون الرسالة صامتة/مبهمة.
    const when = extra && extra.retryInSec ? 'بعد ~' + extra.retryInSec + 'ث' : 'بعد قليل';
    if (state === 'error' && extra && extra.code === 'rate_limited') {
      return 'المنصة مزدحمة مؤقتاً على خدمة تيك توك — سنعيد المحاولة تلقائياً ' + when + '، ابقَ في الصفحة';
    }
    if (state === 'error' && extra && extra.code === 'sign_failed') {
      return 'تعذّر توقيع الاتصال بتيك توك مؤقتاً — إعادة المحاولة تلقائياً ' + when;
    }
    if (state === 'error' && extra && extra.code === 'blocked') {
      return 'تيك توك يحجب طلبات سيرفر الربط مؤقتاً — إعادة المحاولة تلقائياً ' + when;
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

// ------------------------------------------------------------------ تيك توك (tiktok-live-connector 2.5.x)

// إحصاءات بسيطة تظهر بـ/health (بدون أي يوزرنيمات).
const tiktokStats = { connectAttempts: 0, connectsOk: 0, errors: {} };

function errText(err) {
  if (!err) return 'خطأ غير معروف';
  if (typeof err === 'string') return err;
  return err.message || String(err);
}

// تصنيف أخطاء connect(). الأصناف تم التحقق منها من كود المكتبة المثبتة 2.5.0:
//   - UserOfflineError: fetchRoomInfo رجّع status 4 (البث مقفل).
//   - SignatureRateLimitError (reason 'Rate Limited'): Euler رد 429، وretryAfter بالمللي ثانية.
//   - SignAPIError بباقي أسبابه (Sign Error/Empty Cookies/Connect Error/Premium Feature): فشل التوقيع.
//   - InvalidUniqueIdError: اليوزر نفسه غير صالح الصيغة.
//   - InvalidResponseCompositeError "Failed to retrieve Room ID from all sources": تفاصيله الحقيقية
//     في err.config.requestErrs (صفحة HTML ← api-live ← Euler). سابقاً كان يُعامل دائماً كـ
//     "يوزر غير موجود" مع إن أشيع أسبابه حجب IP السيرفر أو 429 من Euler — والواجهة تعرض
//     user_not_found كخطأ نهائي فوراً، فكان الستريمر يشوف "يوزرنيم غلط" وهو صح.
// الأنماط النصية احتياط لرسائل لا تأتي بصنف معروف (نسخ أقدم/أخطاء شبكة خام).
const TT_RATE_LIMIT_RE = /retry-after|rate.?limit|too many|\b429\b/i;
const TT_NOT_FOUND_RE = /user[ _-]?not[ _-]?(found|exist)|doesn'?t exist|does not exist|19881007/i;
const TT_BLOCKED_RE = /captcha|might be blocked|\bblocked\b|access denied|\b403\b/i;
const TT_SIGN_RE = /sign server|signature|eulerstream|euler stream/i;

function classifyTikTokError(err) {
  if (isErr(err, UserOfflineError)) return { kind: 'offline' };
  if (isErr(err, SignatureRateLimitError) || (err && err.reason === 'Rate Limited')) {
    return { kind: 'rate_limited', retryAfterMs: Number(err.retryAfter) || 0 };
  }
  if (isErr(err, InvalidUniqueIdError)) return { kind: 'user_not_found' };
  if (isErr(err, SignAPIError)) return { kind: 'sign_failed' };

  const inner = err && err.config && Array.isArray(err.config.requestErrs) ? err.config.requestErrs : null;
  if (inner && inner.length) {
    const texts = inner.map(errText);
    if (inner.some((e) => isErr(e, SignatureRateLimitError)) || texts.some((t) => TT_RATE_LIMIT_RE.test(t))) {
      return { kind: 'rate_limited', retryAfterMs: 0 };
    }
    if (texts.some((t) => TT_NOT_FOUND_RE.test(t))) return { kind: 'user_not_found' };
    if (texts.some((t) => TT_BLOCKED_RE.test(t))) return { kind: 'blocked' };
    // الحساب موجود لكن ما له غرفة بث (ما فتح لايف) — هذا "مو لايف"، مو خطأ.
    if (texts.some((t) => /extract room id/i.test(t))) return { kind: 'offline' };
    return { kind: 'transient' };
  }

  const text = errText(err);
  if (TT_RATE_LIMIT_RE.test(text)) return { kind: 'rate_limited', retryAfterMs: Number(err && err.retryAfter) || 0 };
  if (TT_NOT_FOUND_RE.test(text)) return { kind: 'user_not_found' };
  if (TT_SIGN_RE.test(text)) return { kind: 'sign_failed' };
  if (TT_BLOCKED_RE.test(text)) return { kind: 'blocked' };
  return { kind: 'transient' };
}

// فك اتصال مكتبة تيك توك بأمان: disconnect() غير متزامنة، ورفضها بدون catch
// كان يصير unhandledRejection.
function safeTikTokDisconnect(conn) {
  if (!conn) return;
  try { conn.removeAllListeners(); } catch (e) { /* ignore */ }
  try {
    const p = conn.disconnect();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) { /* ignore */ }
}

class TikTokRoom extends BaseRoom {
  constructor(uniqueId) {
    super('tiktok:' + uniqueId, '@' + uniqueId);
    this.uniqueId = uniqueId;
    this.firstCommentSeen = false;
    this.followSamples = 0;
    // عدّادات سياسة إعادة المحاولة (راجع الثوابت أعلى الملف):
    this.failStreak = 0;      // فشل متتالٍ (اتصال فشل، أو نجح وانقطع قبل TIKTOK_STABLE_MS)
    this.rateLimitStreak = 0; // 429 متتالية — التراجع يتضاعف معها
    this.notLiveRetries = 0;  // "مو لايف" متتالية — تباعد تدريجي حتى دقيقة
    this.notFoundStreak = 0;  // "يوزر غير موجود" متتالية
    this.connectToken = 0;    // يُبطل نتيجة أي محاولة اتصال قديمة
    this.connectedAt = 0;
    this.stableTimer = null;
    this.lastLibErrorLogAt = 0;
  }

  async start() {
    if (this.connection) return;
    this.stopped = false;

    // بوابة التوقيع المشتركة: سيرفرنا أخذ 429 قبل قليل (من أي غرفة) — ننتظر
    // انتهاء التراجع بدل ما نستهلك طلباً جديداً نعرف مسبقاً إنه بيُرفض.
    const gateWait = tiktokSignGate.until - Date.now();
    if (gateWait > 0) {
      this.setState('error', this.failExtra('rate_limited', { retryInSec: Math.ceil(gateWait / 1000) }));
      this.scheduleReconnect(gateWait + Math.floor(Math.random() * 5000));
      return;
    }

    this.setState('connecting');

    // token يميّز هذه المحاولة بالذات: لو انتهت مهلتها أو أُغلقت الغرفة أثناءها،
    // ثم نجحت متأخرة، نفكّها فوراً بدل ما تبقى اتصالاً يتيماً مفتوحاً بلا غرفة.
    const token = ++this.connectToken;
    const fresh = () => !this.stopped && this.connectToken === token;

    const connOptions = { processInitialData: false };
    if (EULER_API_KEY) connOptions.signApiKey = EULER_API_KEY;
    let conn;
    try {
      conn = new TikTokLiveConnection(this.uniqueId, connOptions);
    } catch (err) {
      // المُنشئ يرمي InvalidUniqueIdError لو صيغة اليوزر غير صالحة
      this.handleConnectError(err);
      return;
    }
    this.connection = conn;
    tiktokStats.connectAttempts++;
    const mine = () => this.connection === conn && !this.stopped;

    conn.on(ControlEvent.CONNECTED, () => {
      if (!mine()) return;
      this.connectedAt = Date.now();
      this.notLiveRetries = 0;
      this.notFoundStreak = 0;
      this.rateLimitStreak = 0; // التوقيع نجح فعلاً
      tiktokSignGate.hits = 0;
      tiktokStats.connectsOk++;
      // failStreak لا يُصفَّر هنا — فقط بعد ثبات الاتصال TIKTOK_STABLE_MS. لو كان
      // تيك توك يقبل ثم يقطع فوراً، التراجع يكمل تصاعده بدل حلقة كل ثانيتين.
      this.clearStableTimer();
      this.stableTimer = setTimeout(() => {
        this.stableTimer = null;
        if (mine()) this.failStreak = 0;
      }, TIKTOK_STABLE_MS);
      if (this.stableTimer.unref) this.stableTimer.unref();
      log('info', '@' + this.uniqueId + ' — متصل ببث فعلي (ConnectEvent)');
      this.setState('connected');
    });

    conn.on(ControlEvent.DISCONNECTED, (info) => {
      if (!mine()) return; // اتصال قديم، أو STREAM_END عالجه قبلنا، أو الغرفة أُغلقت
      const lived = this.connectedAt ? Date.now() - this.connectedAt : 0;
      this.clearStableTimer();
      this.connection = null;
      if (lived < TIKTOK_STABLE_MS) this.failStreak++;
      else this.failStreak = 0;
      const delay = withTikTokJitter(this.nextRetryDelay());
      log('info', '@' + this.uniqueId + ' — انفصل (' + ((info && info.code) || '?') + ') بعد ' + Math.round(lived / 1000) +
        'ث — إعادة المحاولة بعد ' + Math.round(delay / 1000) + 'ث' + (this.failStreak ? ' (انقطاع سريع #' + this.failStreak + ')' : ''));
      this.setState('reconnecting');
      this.scheduleReconnect(delay);
    });

    // أخطاء ما بعد الاتصال (فك رسالة/ويب سوكيت) — للتشخيص فقط، بحد سطر كل 30ث.
    // أخطاء connect() نفسها تُعالج بالـcatch تحت. (المكتبة ما تطلق 'error'
    // أصلاً لو ما فيه مستمع، فهذا لا يغيّر سلوكها.)
    conn.on(ControlEvent.ERROR, (e) => {
      if (!mine() || this.state !== 'connected') return;
      const now = Date.now();
      if (now - this.lastLibErrorLogAt < 30000) return;
      this.lastLibErrorLogAt = now;
      log('warn', '@' + this.uniqueId + ' — خطأ من المكتبة أثناء البث (' + ((e && e.info) || '') + '): ' + errText(e && e.exception));
    });

    conn.on(WebcastEvent.CHAT, (data) => {
      if (!mine()) return;
      if (!this.firstCommentSeen) {
        this.firstCommentSeen = true;
        log('info', '@' + this.uniqueId + ' — أول CommentEvent فعلي وصل: "' + String(data.content || data.comment || '').slice(0, 40) + '"');
      }
      if (this.followSamples < FOLLOW_LOG_SAMPLES) {
        this.followSamples++;
        log('info', '@' + this.uniqueId + ' — عيّنة حقول المتابعة #' + this.followSamples + ': ' + followFieldsSample(data));
      }
      this.broadcastEvents([buildTikTokComment(data)]);
    });

    conn.on(WebcastEvent.GIFT, (data) => {
      if (!mine()) return;
      // الهدايا القابلة للتتابع (streak, gift.type===1) ترسل عدة أحداث أثناء
      // التتابع؛ repeatEnd (0/1) يشير لآخر حدث بالتتابع — نبث مرة وحدة فقط
      // عند انتهائه حتى لا تُحتسب الهدية مضاعفة بالألعاب.
      const giftType = data.gift && data.gift.type;
      if (giftType === 1 && !data.repeatEnd) return;
      this.broadcastEvents([buildTikTokGift(data)]);
    });

    conn.on(WebcastEvent.FOLLOW, (data) => {
      if (!mine()) return;
      this.broadcastEvents([buildTikTokFollow(data)]);
    });

    conn.on(WebcastEvent.LIKE, (data) => {
      if (!mine()) return;
      this.broadcast({ messages: [buildTikTokLike(data)] });
    });

    conn.on(WebcastEvent.ROOM_USER, (data) => {
      if (!mine()) return;
      this.broadcast({ messages: [buildTikTokViewer(data.totalUser)] });
    });

    conn.on(WebcastEvent.STREAM_END, () => {
      if (!mine()) return;
      // المكتبة تستدعي disconnect() بنفسها بعد هذا الحدث، فيوصل DISCONNECTED —
      // نفصل الاتصال عن الغرفة أولاً حتى يتجاهله (كان يلغي انتظار "مو لايف"
      // ويعيد المحاولة بعد 1.5ث ويقلب الحالة لـreconnecting).
      this.clearStableTimer();
      this.connection = null;
      this.failStreak = 0;
      this.notLiveRetries++;
      const delay = withTikTokJitter(this.notLiveDelay());
      log('info', '@' + this.uniqueId + ' — انتهى البث — فحص بعد ' + Math.round(delay / 1000) + 'ث');
      this.setState('not_live');
      this.scheduleReconnect(delay);
    });

    let abandoned = false;
    const connectPromise = conn.connect();
    // لو تخلّينا عن هذه المحاولة (مهلة/إغلاق الغرفة) ثم نجحت لاحقاً: نفكّها.
    connectPromise.then(() => { if (abandoned) safeTikTokDisconnect(conn); }, () => {});
    try {
      await withTimeout(connectPromise, TIKTOK_CONNECT_TIMEOUT_MS, 'انتهت مهلة الاتصال بتيك توك (@' + this.uniqueId + ')');
      if (!fresh()) { abandoned = true; safeTikTokDisconnect(conn); }
    } catch (err) {
      abandoned = true;
      safeTikTokDisconnect(conn);
      if (this.connection === conn) this.connection = null;
      if (!fresh()) return;
      this.handleConnectError(err);
    }
  }

  clearStableTimer() {
    if (this.stableTimer) { clearTimeout(this.stableTimer); this.stableTimer = null; }
  }

  // فشل عابر: 2ث ← 4ث ← 8ث … حتى دقيقة، ثم وضع التهدئة (5 دقائق) بعد
  // TIKTOK_PARK_AFTER_FAILS فشلاً متتالياً.
  nextRetryDelay() {
    if (this.failStreak >= TIKTOK_PARK_AFTER_FAILS) return TIKTOK_PARKED_RETRY_MS;
    const step = Math.pow(2, Math.max(0, this.failStreak - 1));
    return Math.min(TIKTOK_FIRST_RETRY_MS * step, TIKTOK_MAX_RETRY_MS);
  }

  notLiveDelay() {
    const step = Math.pow(1.5, Math.max(0, this.notLiveRetries - 1));
    return Math.min(TIKTOK_NOT_LIVE_MIN_MS * step, TIKTOK_NOT_LIVE_MAX_MS);
  }

  // يضيف fatal:true بعد TIKTOK_MAX_CONSECUTIVE_FAILS محاولات فاشلة متتالية،
  // فتعرض الواجهة رسالة نهائية واضحة بدل "جاري الاتصال" بلا نهاية.
  failExtra(code, more) {
    const extra = Object.assign({ code }, more || {});
    if (this.failStreak >= TIKTOK_MAX_CONSECUTIVE_FAILS) extra.fatal = true;
    return extra;
  }

  handleConnectError(err) {
    const { kind, retryAfterMs } = classifyTikTokError(err);
    // أخطاء "كل المصادر" تُسجَّل بأسبابها الداخلية (HTML/api-live/Euler) — بدونها
    // ما تنعرف من لوغ Render إن كان حجب IP أو 429 أو يوزر غلط.
    const inner = err && err.config && Array.isArray(err.config.requestErrs) ? err.config.requestErrs : [];
    const detail = errText(err) + (inner.length ? ' ← ' + inner.map((e) => errText(e).replace(/\s+/g, ' ').slice(0, 160)).join(' | ') : '');
    tiktokStats.errors[kind] = (tiktokStats.errors[kind] || 0) + 1;

    if (kind === 'offline') {
      // "مو لايف" ليست فشل اتصال — ما تُحتسب بسلسلة الفشل ولا تُعلن نهائية،
      // لأن المطلوب فعلاً هو انتظار فتح البث ثم الاتصال تلقائياً.
      this.notLiveRetries++;
      this.notFoundStreak = 0;
      const delay = withTikTokJitter(this.notLiveDelay());
      log('info', '@' + this.uniqueId + ' — غير مباشر حالياً — فحص بعد ' + Math.round(delay / 1000) + 'ث');
      this.setState('not_live');
      this.scheduleReconnect(delay);
      return;
    }

    if (kind === 'user_not_found') {
      this.notFoundStreak++;
      const delay = withTikTokJitter(Math.min(TIKTOK_NOT_FOUND_MIN_MS * Math.pow(2, this.notFoundStreak - 1), TIKTOK_NOT_FOUND_MAX_MS));
      log('info', '@' + this.uniqueId + ' — يوزرنيم غير موجود — فحص بعد ' + Math.round(delay / 1000) + 'ث. التفاصيل: ' + detail);
      this.setState('error', { code: 'user_not_found' });
      this.scheduleReconnect(delay);
      return;
    }

    this.failStreak++;

    if (kind === 'rate_limited') {
      this.rateLimitStreak++;
      // retry-after من Euler (بالمللي ثانية) نحترمه حرفياً ضمن حدود معقولة؛
      // غير ذلك 30ث ثم يتضاعف مع كل 429 متتالية حتى 5 دقائق.
      const backoff = retryAfterMs > 0
        ? Math.min(Math.max(retryAfterMs, TIKTOK_RATE_LIMIT_MIN_MS), TIKTOK_RETRY_AFTER_CAP_MS)
        : Math.min(TIKTOK_RATE_LIMIT_MIN_MS * Math.pow(2, this.rateLimitStreak - 1), TIKTOK_RATE_LIMIT_MAX_MS);
      tiktokSignGate.until = Math.max(tiktokSignGate.until, Date.now() + backoff);
      tiktokSignGate.hits++;
      log('warn', '@' + this.uniqueId + ' — تجاوز حد خدمة التوقيع (429) #' + this.rateLimitStreak + ' — كل الغرف تنتظر ' +
        Math.round(backoff / 1000) + 'ث.' + (EULER_API_KEY ? '' : ' السبب المرجّح: EULER_API_KEY غير مضبوط (طبقة مجانية لكل IP).') + ' التفاصيل: ' + detail);
      this.setState('error', this.failExtra('rate_limited', { retryInSec: Math.ceil(backoff / 1000) }));
      this.scheduleReconnect(withTikTokJitter(backoff));
      return;
    }

    this.rateLimitStreak = 0; // الفشل الحالي مو 429 — تنقطع سلسلة تضاعف تراجع الـ rate limit
    const code = kind === 'transient' ? 'connect_failed' : kind; // sign_failed | blocked | connect_failed
    const base = this.nextRetryDelay();
    const delay = withTikTokJitter(base);
    if (base === TIKTOK_PARKED_RETRY_MS) {
      log('warn', '@' + this.uniqueId + ' — ' + this.failStreak + ' محاولات فاشلة متتالية — وضع التهدئة: محاولة كل ' + Math.round(base / 60000) + ' دقائق');
    }
    log('warn', '@' + this.uniqueId + ' — فشل الاتصال [' + code + '] #' + this.failStreak + ' — إعادة المحاولة بعد ' +
      Math.round(delay / 1000) + 'ث. التفاصيل: ' + detail);
    this.setState('error', this.failExtra(code, { retryInSec: Math.ceil(delay / 1000) }));
    this.scheduleReconnect(delay);
  }

  disconnect() {
    this.clearStableTimer();
    this.connectToken++; // أي connect() جارٍ يصير "متروكاً" ويُفك لو نجح لاحقاً
    safeTikTokDisconnect(this.connection);
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

// ------------------------------------------------------------------ كيك (kick-live-connector — يوزر القناة فقط، بدون أي توكن/تسجيل دخول)
//
// المكتبة تحل كل شيء داخلياً انطلاقاً من اسم القناة فقط: تجيب بيانات البث
// (livestream) وبيانات غرفة الشات (chatroom id) وبيانات القناة (channel id)
// من واجهات kick.com العامة، ثم تفتح الويب سوكيت وتشترك بالقنوات الصحيحة.
// لا chatroomId يدوي ولا أي reverse-engineering من طرفنا بعد اليوم.
//
// ⚠️ ملاحظتان مهمتان عن سلوك المكتبة (نسخة 1.0.0) — هذا الصنف مبني للتعامل
//    معهما، فلا تُبسّطه بحسن نية:
//    1) connect() لا يُحسم أبداً (لا resolve ولا reject) لو فشل أي جلب أولي
//       لبيانات القناة، لأن المكتبة ترمي داخل `new Promise(async …)` —
//       الاستثناء يضيع ويصير unhandledRejection والوعد يعلّق للأبد. لذلك
//       نسابقه بمهلة KICK_CONNECT_TIMEOUT_MS بدل انتظاره.
//    2) لا يوجد أي إعادة اتصال داخل المكتبة إطلاقاً — حدث disconnected يُطلق
//       ويتوقف كل شيء. إعادة الاتصال التلقائية كلها من مسؤوليتنا هنا عبر
//       scheduleReconnect الموجود بـ BaseRoom.
//
// مهلة الاتصال سخيّة عمداً: كل محاولة connect() تشغّل متصفح Chromium
// (Playwright) ثلاث مرات لجلب البيانات الأولية، وهذا بطيء بطبيعته.
const KICK_CONNECT_TIMEOUT_MS = 90000;

// نص مقروء لأي خطأ يجي من المكتبة — مهم لأن المكتبة ترفض أحياناً بسلسلة نصية
// عادية (`"<user> is offline"`) وليس بكائن Error، فـ err.message يكون undefined.
function kickErrorText(err) {
  if (!err) return 'خطأ غير معروف';
  if (typeof err === 'string') return err;
  return err.message || String(err);
}

class KickRoom extends BaseRoom {
  constructor(rawIdentifier) {
    const channelName = parseKickIdentifier(rawIdentifier);
    super('kick:' + rawIdentifier.toLowerCase(), '@' + (channelName || rawIdentifier));
    this.rawIdentifier = rawIdentifier;
    this.channelName = channelName;
    // رمز المحاولة الحالية — يبطل مستمعي أي عميل قديم فوراً، فما يقدر عميل
    // ميت يغيّر حالة الغرفة أو يبث رسائل بعد ما استبدلناه بمحاولة جديدة.
    this.connectToken = 0;
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

    const token = ++this.connectToken;
    const fresh = () => !this.stopped && token === this.connectToken;

    let client;
    try {
      client = new KickConnection(this.channelName);
    } catch (err) {
      this.handleConnectError(err);
      return;
    }
    this.connection = client;

    // لازم يكون مستمع 'error' مربوطاً دائماً: EventEmitter يرمي استثناءً
    // قاتلاً لو أُطلق حدث 'error' بلا مستمع، وهذا كان يسقط السيرفر كله.
    client.on(KickEvents.Error, (err) => {
      if (!fresh()) return;
      this.handleConnectError(err);
    });

    client.on(KickEvents.Connected, (data) => {
      if (!fresh()) return;
      log('info', 'kick:' + this.channelName + ' — متصل (roomID: ' + ((data && data.roomID) || '?') + ')');
      this.setState('connected');
    });

    client.on(KickEvents.ChatMessage, (data) => {
      if (!fresh()) return;
      this.broadcast({ messages: [buildKickComment(data)] });
    });

    // المكتبة ما تعيد الاتصال بنفسها — نحن من يعيده.
    client.on(KickEvents.Disconnected, () => {
      if (!fresh()) return;
      log('info', 'kick:' + this.channelName + ' — انقطع الاتصال، إعادة المحاولة تلقائياً');
      this.setState('reconnecting');
      this.disconnect();
      this.scheduleReconnect(withJitter(RECONNECT_DELAY_MS));
    });

    // انتهاء البث ليس خطأ: نبقى بالغرفة ونعيد المحاولة بوتيرة أهدأ حتى يرجع.
    client.on(KickEvents.StreamEnd, () => {
      if (!fresh()) return;
      log('info', 'kick:' + this.channelName + ' — انتهى البث');
      this.setState('not_live');
      this.disconnect();
      this.scheduleReconnect(withJitter(NOT_LIVE_RETRY_DELAY_MS));
    });

    // ملاحظة مقصودة: ما نشترك بحدث viewerCount إطلاقاً. المكتبة تشغّل
    // Chromium من جديد كل 60 ثانية لجلبه لو وُجد مستمع واحد فقط — كلفة
    // ضخمة بلا فائدة، وكيك أصلاً ما كانت ترسل عدد المشاهدين للفرونت إند.

    try {
      const result = await withTimeout(
        client.connect(),
        KICK_CONNECT_TIMEOUT_MS,
        'انتهت مهلة الاتصال بكيك (' + this.channelName + ')'
      );
      // المكتبة ترجّع {roomID:''} بدل ما ترمي لو فشل الإقلاع مبكراً.
      if (fresh() && result && result.roomID === '') {
        this.handleConnectError(new Error('تعذّر جلب بيانات قناة كيك'));
      }
    } catch (err) {
      if (fresh()) this.handleConnectError(err);
    }
  }

  handleConnectError(err) {
    const text = kickErrorText(err);

    // "<username> is offline" — القناة موجودة لكن ما فيها بث الآن.
    if (/is offline/i.test(text)) {
      log('info', 'kick:' + this.channelName + ' — ما عنده بث مباشر الآن');
      this.setState('not_live');
      this.disconnect();
      this.scheduleReconnect(withJitter(NOT_LIVE_RETRY_DELAY_MS));
      return;
    }

    // 404 من واجهة kick.com = يوزر/قناة غير موجودة أصلاً.
    if ((err && err.status === 404) || /\b404\b/.test(text)) {
      log('info', 'kick:' + this.channelName + ' — يوزرنيم/قناة غير موجودة');
      this.setState('error', { code: 'user_not_found' });
      this.disconnect();
      this.scheduleReconnect(withJitter(NOT_LIVE_RETRY_DELAY_MS));
      return;
    }

    // أي شيء آخر (فشل جلب أولي، تعذّر تشغيل المتصفح، مهلة، شبكة…) — خطأ
    // مؤقت: نُعلم العملاء ونعيد المحاولة، بدون ما يسقط السيرفر أو تعلّق الغرفة.
    log('warn', 'kick:' + this.channelName + ' — خطأ: ' + text);
    this.setState('error', { code: 'connect_failed' });
    this.disconnect();
    this.scheduleReconnect(withJitter(RECONNECT_DELAY_MS));
  }

  disconnect() {
    const client = this.connection;
    this.connection = null;
    // إبطال مستمعي العميل القديم قبل إغلاقه، حتى لا يرتد حدث disconnected
    // الناتج عن إغلاقنا نحن فيُطلق دورة إعادة اتصال ثانية بالتوازي.
    this.connectToken++;
    if (!client) return;
    try { client.removeAllListeners(); } catch (e) { /* ignore */ }
    // مستمع خطأ صامت يبقى بعد إزالة الباقي — أي حدث 'error' متأخر من
    // ويب سوكيت يُغلق الآن ما يرمي استثناءً قاتلاً.
    try { client.on(KickEvents.Error, () => {}); } catch (e) { /* ignore */ }
    try { client.disconnect(); } catch (e) { /* ignore */ }
  }
}

// rooms: 'platform:معرّف'(lowercase) -> BaseRoom
const rooms = new Map();

function getOrCreateRoom(platform, rawIdentifier) {
  // كيك: نوحّد المعرّف قبل أي شيء (يوزر مجرّد أو رابط kick.com/يوزر ينتهيان
  // لنفس الاسم). بدون هذا التوحيد يفتح "xqc" و"https://kick.com/xqc" غرفتين
  // منفصلتين ومعهما اتصالان كاملان لنفس القناة — وكل اتصال يشغّل Chromium.
  const canonical = platform === 'kick' ? canonicalKickId(rawIdentifier) : rawIdentifier.toLowerCase();
  const key = platform + ':' + canonical;
  let room = rooms.get(key);
  if (room) return room;

  if (platform === 'youtube') room = new YoutubeRoom(rawIdentifier);
  else if (platform === 'kick') room = new KickRoom(canonical);
  else room = new TikTokRoom(canonical); // 'tiktok' والافتراضي

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
function healthSnapshot() {
  const byPlatform = {};
  for (const room of rooms.values()) {
    const platform = room.key.split(':')[0];
    const p = byPlatform[platform] || (byPlatform[platform] = { rooms: 0, clients: 0, states: {} });
    p.rooms++;
    p.clients += room.clients.size;
    p.states[room.state] = (p.states[room.state] || 0) + 1;
  }
  const gateWait = Math.max(0, tiktokSignGate.until - Date.now());
  return {
    ok: true,
    uptimeSec: Math.round((Date.now() - BOOT_AT) / 1000),
    bootId: BOOT_ID,
    node: process.version,
    tiktokLiveConnector: TIKTOK_LIB_VERSION,
    eulerApiKey: EULER_API_KEY ? 'set' : 'missing',
    wsClients: wss.clients.size,
    rooms: rooms.size,
    platforms: byPlatform,
    tiktok: {
      connectAttempts: tiktokStats.connectAttempts,
      connectsOk: tiktokStats.connectsOk,
      errors: tiktokStats.errors,
      signCooldownSec: Math.ceil(gateWait / 1000),
    },
    memoryMb: Math.round(process.memoryUsage().rss / 1048576),
  };
}

const server = http.createServer(async (req, res) => {
  const path = (req.url || '').split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, profileCorsHeaders());
    res.end();
    return;
  }

  if (path === '/healthz') {
    // ترويسات CORS هنا مقصودة: الموقع يطلب هذا المسار عند تحميل الصفحة
    // ليوقظ الخدمة مبكراً (Cold Start على Render) قبل أول اتصال WebSocket فعلي.
    res.writeHead(200, profileCorsHeaders({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }));
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  if (path === '/health') {
    // حالة تفصيلية للمراقبة (UptimeRobot/لوحة Render) — أعداد فقط، بدون أي يوزرنيمات.
    // /healthz أعلاه يبقى كما هو بالضبط لأن الواجهة تعتمد عليه للإيقاظ واختيار السيرفر.
    res.writeHead(200, profileCorsHeaders({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }));
    res.end(JSON.stringify(healthSnapshot()));
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
  // لازم يطابق تماماً المعرّف الذي تُسجَّل به الغرفة (canonicalKickId لكيك).
  // لو فحصنا النص الخام هنا، كان أي حساب معطّل يتخطّى الحظر بلصق رابط قناته
  // (kick.com/user) بدل يوزره المجرّد، لأن مستند bridgeStreamers مخزّن باليوزر.
  const checkId = platform === 'kick' ? canonicalKickId(rawUser) : rawUser.toLowerCase();
  const enabled = await isStreamerEnabled(checkId);
  if (!enabled) {
    log('info', platform + ':' + checkId + ' — الاتصال مرفوض (الحساب معطّل من المالك)');
    ws.close(4403, 'هذا الحساب معطّل من إدارة المنصة');
    return;
  }

  log('info', platform + ':' + checkId + ' — عميل جديد اتصل');
  const room = getOrCreateRoom(platform, rawUser);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  room.addClient(ws, url.searchParams.get('since'));

  ws.on('close', (code) => {
    // 1000/1001 = العميل قفل عمداً (خرج/بدّل الحساب) — غير ذلك انقطاع يستاهل مهلة أطول
    room.removeClient(ws, code !== 1000 && code !== 1001);
    log('info', platform + ':' + checkId + ' — عميل انفصل (' + code + ')');
  });

  ws.on('error', () => {
    room.removeClient(ws, true);
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
  // 5 دقائق بدل 10: مهلة خمول Render هي ~15 دقيقة، ومع نبضة كل 10 دقائق
  // يكفي فشل نبضتين متتاليتين (شبكة/مهلة) لتنام الخدمة ويرجع Cold Start.
  // ثلاث نبضات داخل كل نافذة خمول تجعل المسألة محتملة الفشل بشكل أقل بكثير.
  const intervalMs = 5 * 60 * 1000;
  const https = require('https');
  const timer = setInterval(() => {
    try {
      const req = https.get(url, (res) => { res.resume(); });
      req.on('error', () => {});
      req.setTimeout(15000, () => { try { req.destroy(); } catch (e) {} });
    } catch (e) { /* best-effort */ }
  }, intervalMs);
  timer.unref();
  log('info', 'Keep-Alive مفعّل — ' + url + ' كل 5 دقائق');
}

const heartbeatTimer = setInterval(() => {
  const ping = JSON.stringify({ type: 'bridge_ping', t: Date.now() });
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { try { ws.terminate(); } catch (e) { /* ignore */ } continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* ignore */ }
    if (ws.readyState === WebSocket.OPEN) { try { ws.send(ping); } catch (e) { /* ignore */ } }
  }
}, HEARTBEAT_MS);
heartbeatTimer.unref();

initFirestore();
server.listen(PORT, () => {
  log('info', 'خادم جسر البث يعمل على المنفذ ' + PORT + ' (WebSocket: /ws?platform=tiktok|youtube|kick&u=username)');
  log('info', 'tiktok-live-connector ' + TIKTOK_LIB_VERSION + ' على Node ' + process.version);
  // تشخيص مباشر لأشيع سبب لـ429: المفتاح غير مضبوط أصلاً على المستضيف.
  if (EULER_API_KEY) {
    log('info', 'مفتاح EulerStream مضبوط (من ' + EULER_KEY_ENV + ') — حد طلبات التوقيع المرفوع فعّال');
  } else {
    log('warn', '⚠️ EULER_API_KEY غير مضبوط — تيك توك يعمل على الطبقة المجانية من EulerStream (حد طلبات لكل IP، وIP خدمات Render مشترك) ومعرّض لـ429. أضف EULER_API_KEY في Environment Variables على Render.');
  }
  startKeepAlive();
});

// ------------------------------------------------------------------ شبكة أمان على مستوى العملية
// مكتبة kick-live-connector ترمي داخل `new Promise(async …)`، فأي فشل بجلب
// بيانات القناة يتحول لـ unhandledRejection — وسلوك Node الافتراضي عليه هو
// إسقاط العملية. الغرف تتعافى بنفسها عبر scheduleReconnect، فإسقاط السيرفر
// كله (ويقطع كل الستريمرز على كل المنصات) هو أسوأ رد ممكن.
process.on('unhandledRejection', (reason) => {
  log('warn', 'وعد مرفوض بلا معالجة (تم احتواؤه): ' + ((reason && reason.message) || String(reason)));
});

process.on('uncaughtException', (err) => {
  log('warn', 'استثناء غير ملتقط (تم احتواؤه): ' + ((err && err.stack) || String(err)));
});

function shutdown(signal) {
  log('info', 'إيقاف السيرفر (' + signal + ')…');
  for (const room of rooms.values()) room.teardown();

  // لازم نغلق سوكيتات العملاء صراحةً: server.close() ينتظر انتهاء كل اتصال
  // مفتوح، واتصال WebSocket لا ينتهي من نفسه أبداً — فبدون هذا السطر ما تخرج
  // العملية إطلاقاً وتظل معلّقة حتى يقتلها المستضيف بـSIGKILL عند كل نشر.
  for (const ws of wss.clients) {
    try { ws.close(1001, 'السيرفر يُعاد تشغيله'); } catch (e) { /* ignore */ }
  }
  try { wss.close(); } catch (e) { /* ignore */ }

  let done = false;
  server.close(() => { if (!done) { done = true; process.exit(0); } });
  // حزام أمان: لو بقي شيء متعلّقاً لأي سبب، نخرج بنظافة بدل ما ننتظر للأبد.
  const force = setTimeout(() => { if (!done) { done = true; process.exit(0); } }, 5000);
  force.unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
