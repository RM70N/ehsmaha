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
  TikTokLiveConnection, WebcastEvent, ControlEvent,
} = tiktokLib;
const tiktokSdk = require('tiktok-live-api-sdk');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { LiveChat: YoutubeLiveChat } = require('youtube-chat');
const { KickConnection, Events: KickEvents } = require('kick-live-connector');
// kichat.js (Pusher مباشر، بلا متصفح) = الناقل الأول لكيك؛ kick-live-connector (Playwright) يبقى احتياطاً.
const { KickChatSession } = require('./lib/kichat-session');
const kickAdapter = require('./lib/kick-adapter');
const { normalizeTikTokId } = require('./lib/tiktok-id');
// KICK_TRANSPORT: auto (الافتراضي: kichat ثم رجوع للقديم لو كيك حجب الطلبات) | kichat (فقط) | connector (القديم فقط — مفتاح إيقاف طوارئ)
const KICK_TRANSPORT = ['auto', 'kichat', 'connector'].includes(String(process.env.KICK_TRANSPORT || 'auto').toLowerCase()) ? String(process.env.KICK_TRANSPORT || 'auto').toLowerCase() : 'auto';

const { classifyTikTokError, errText, isProviderFault } = require('./lib/error-classifier');
const { backoffDelay } = require('./lib/backoff');
const { ProviderPool, loadProviderDefs, buildConnectionOptions } = require('./lib/providers');
const { ConnectQueue } = require('./lib/connect-queue');
const { Metrics } = require('./lib/metrics');

const TIKTOK_LIB_VERSION = tiktokLib.VERSION || 'unknown';
const BOOT_AT = Date.now();

// قراءة رقم موجب من متغير بيئة (بدونه أو بقيمة غير صالحة ← الافتراضي).
function envNum(name, def) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
}

const PORT = process.env.PORT || 8080;
const RECONNECT_DELAY_MS = 5000;
const NOT_LIVE_RETRY_DELAY_MS = 20000;
// مهلة بقاء الغرفة (واتصال تيك توك) بعد خروج آخر عميل — كل إعادة فتح للغرفة = طلب توقيع جديد من
// حصة المزود، فالمهلة تُختار حسب سبب الانقطاع:
//   1000 (إغلاق مقصود: بدّل الحساب/فصل) ← قصيرة.
//   1001 (المتصفح يُغلق الصفحة: إعادة تحميل/تبويب) ← متوسطة: غالباً يرجع خلال ثوانٍ.
//   غير ذلك (شبكة/نوم جهاز/نبض ميت) ← أطول: يرجع فيلقى نفس الغرفة ويستلم ما فاته.
const ROOM_IDLE_GRACE_MS = envNum('BRIDGE_ROOM_IDLE_GRACE_MS', 5000);
const ROOM_RELOAD_GRACE_MS = envNum('BRIDGE_ROOM_RELOAD_GRACE_MS', 30000);
const ROOM_ABNORMAL_GRACE_MS = envNum('BRIDGE_ROOM_ABNORMAL_GRACE_MS', 60000);

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

// ---------------- سياسة الاتصال بتيك توك — تيك توك فقط ----------------
// يوتيوب/كيك يكملان على RECONNECT_DELAY_MS/NOT_LIVE_RETRY_DELAY_MS + withJitter بلا أي تغيير.
//
// كل محاولة اتصال بتيك توك (أول اتصال أو إعادة) تمر من طابور مركزي (lib/connect-queue.js) يضبط المعدل
// والتزامن لكل مزود توقيع ويبدّل المزود عند أعطاله (lib/providers.js) — فلا حلقات سريعة ولا ازدحام
// يُعرض للمستخدم كفشل: الطلبات الزائدة تنتظر بالطابور، والواجهة تعرض "جاري الاتصال… محاولة N/موقعك".
//   - فشل عابر: 2ث ← 4ث ← 8ث… حتى دقيقة (±25% jitter).
//   - عطل مزود (429/توقيع/رفض): تبديل فوري لمزود بديل إن وُجد؛ وإلا ينتظر القاطع (retry-after إن وصل).
//   - اتصال نجح ثم انقطع قبل TIKTOK_STABLE_MS يُحتسب فشلاً (لا يُصفّر العداد) — لا حلقة "اتصل ← انقطع".
//   - "مو لايف": 20ث ← 30ث ← 45ث ← 60ث. يوزر غير موجود: 60ث ← 120ث… حتى 5 دقائق.
//   - الاستسلام (fatal:true, code:'gave_up') فقط بعد TIKTOK_MAX_ATTEMPTS محاولة فاشلة أو TIKTOK_GIVE_UP_MS
//     منذ أول فشل، وبعد استنفاد كل المزودين؛ الغرفة تبقى تحاول كل 5 دقائق بالخلفية، وأي عميل جديد
//     (زر "إعادة المحاولة") يوقظها فوراً.
const TIKTOK_RETRY_BASE_MS = envNum('TIKTOK_RETRY_BASE_MS', 2000);
const TIKTOK_RETRY_MAX_MS = envNum('TIKTOK_RETRY_MAX_MS', 60000);
const TIKTOK_NOT_LIVE_BASE_MS = 20000;
const TIKTOK_NOT_LIVE_MAX_MS = 60000;
const TIKTOK_NOT_FOUND_BASE_MS = 60000;
const TIKTOK_NOT_FOUND_MAX_MS = 5 * 60 * 1000;
const TIKTOK_STABLE_MS = envNum('TIKTOK_STABLE_MS', 60000);
const TIKTOK_MAX_ATTEMPTS = envNum('TIKTOK_MAX_ATTEMPTS', 12);
const TIKTOK_GIVE_UP_MS = envNum('TIKTOK_GIVE_UP_MS', 8 * 60 * 1000);
const TIKTOK_PARKED_RETRY_MS = envNum('TIKTOK_PARKED_RETRY_MS', 5 * 60 * 1000);
const TIKTOK_REVIVE_MIN_GAP_MS = 10000;
// مهلة connect() نفسه: بدونها لو علّق وعد المكتبة (طلب HTTP لا يُحسم) تبقى الغرفة
// بحالة 'connecting' للأبد. تشمل جلب رقم الغرفة (حتى 3 مصادر) + التوقيع + فتح الويب سوكيت.
const TIKTOK_CONNECT_TIMEOUT_MS = envNum('TIKTOK_CONNECT_TIMEOUT_MS', 30000);
const TIKTOK_SIGN_TIMEOUT_MS = envNum('TIKTOK_SIGN_TIMEOUT_MS', 15000);
// لا بيانات من تيك توك إطلاقاً (ولا نبض) هذي المدة = اتصال ميت بصمت ← نعيده.
const TIKTOK_UPSTREAM_SILENCE_MS = envNum('TIKTOK_UPSTREAM_SILENCE_MS', 120000);
// كم مرة نعيد بث حالة "جاري الاتصال" (موقع الطابور/العدّ التنازلي) للعملاء.
const TIKTOK_PROGRESS_TICK_MS = envNum('TIKTOK_PROGRESS_TICK_MS', 3000);

// jitter عشوائي يُضاف لكل تأخير إعادة محاولة حتى لا تُعيد كل الغرف الاتصال في
// نفس اللحظة (thundering herd) فتضرب خدمة التوقيع دفعة واحدة وتستهلك الحد.
function withJitter(base) { return base + Math.floor(Math.random() * 4000); }

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

// سطر لوغ منظّم (logfmt): event=... key=value — سهل الـgrep والتجميع بلوغات Render.
// القيم النصية تُقتطع وتُقتبس؛ لا يُمرَّر هنا أي مفتاح/عنوان بروكسي أبداً.
// أسرار الإعداد (مفاتيح/عناوين بروكسي بأسمائها الكاملة) تُحجب من أي سطر منظّم حتى لو ظهرت داخل نص خطأ.
let LOG_SECRETS = [];
function redactSecrets(text) {
  let out = String(text).replace(/\/\/[^\s/@:]+:[^\s/@]+@/g, '//***@'); // user:pass@ داخل أي رابط
  for (const secret of LOG_SECRETS) out = out.split(secret).join('***');
  return out;
}

function slog(level, event, fields) {
  const parts = ['event=' + event];
  for (const k of Object.keys(fields || {})) {
    const v = fields[k];
    if (v === undefined || v === null || v === '') continue;
    const str = redactSecrets(String(v).replace(/\s+/g, ' ').slice(0, 300));
    parts.push(k + '=' + (/[\s"=]/.test(str) ? JSON.stringify(str) : str));
  }
  log(level, parts.join(' '));
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

// srv: نسخة بروتوكول الجسر. 2 = طابور الاتصال (حالات queued/retrying وحقول التقدّم). الواجهة تستخدمها لكشف
// سيرفر Render القديم (لا يرسلها) وتنبّه المستخدم بدل فشل غامض.
const BRIDGE_PROTOCOL_VERSION = 2;
function buildStatus(state, message, extra) {
  return Object.assign({ type: 'bridge_status', state, message, timestamp: Date.now(), srv: BRIDGE_PROTOCOL_VERSION }, extra || {});
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
  const r = kickAdapter.normalizeSlug(raw);
  return r.ok ? r.slug : null;
}

// المعرّف الموحَّد لكيك — نقطة الحقيقة الوحيدة المستخدمة لمفتاح الغرفة
// ولفحص التفعيل/التعطيل بـ Firestore، حتى لا يختلف الاثنان أبداً.
function canonicalKickId(rawIdentifier) {
  return parseKickIdentifier(rawIdentifier) || (rawIdentifier || '').trim().toLowerCase();
}

// المعرّف الموحَّد لتيك توك (نفس فكرة كيك): مفتاح الغرفة وفحص التعطيل والاتصال كلها من نقطة واحدة، فكل صيغ
// نفس اليوزر (رابط/@/حروف كبيرة/رموز خفية) = غرفة واحدة واتصال واحد. null = صيغة لا يمكن أن تكون يوزر تيك توك.
function canonicalTikTokId(rawIdentifier) {
  const r = normalizeTikTokId(rawIdentifier);
  return r.ok ? r.id : null;
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
    const extra = this.statusExtra();
    this.sendTo(ws, buildStatus(this.state, this.messageForState(this.state, extra), extra));
    this.replaySince(ws, since);
    this.onClientAdded(ws);
  }

  // الحالة الإضافية التي تُرسل لعميل جديد (تيك توك يجدّد موقع الطابور/العدّ التنازلي).
  statusExtra() { return this.lastExtra; }
  onClientAdded() { /* تيك توك: إيقاظ غرفة مستسلمة */ }

  // code = كود إغلاق سوكيت العميل: يحدد مهلة إبقاء الغرفة (راجع ROOM_*_GRACE_MS).
  removeClient(ws, code) {
    if (!this.clients.delete(ws)) return;
    if (this.clients.size === 0 && !this.closeTimer) {
      const grace = code === 1000 ? ROOM_IDLE_GRACE_MS : (code === 1001 ? ROOM_RELOAD_GRACE_MS : ROOM_ABNORMAL_GRACE_MS);
      this.closeTimer = setTimeout(() => this.teardown(), grace);
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
    const code = extra && extra.code;
    // fatal:true يرسله TikTokRoom وحده بعد استنفاد كل المحاولات والمزودين — الحالة النهائية الوحيدة.
    // (يوتيوب/كيك ما يرسلان fatal إطلاقاً فلا تتغير أي رسالة عندهما.)
    if (state === 'error' && extra && extra.fatal) {
      if (extra.reason === 'invalid_key') {
        return 'مفتاح API الخاص بخدمة الربط غير صالح (Euler رفضه بخطأ 401) — على مالك الموقع تصحيحه في إعدادات Render، وبعدها يعمل الاتصال تلقائياً';
      }
      if (extra.reason === 'daily_limit') {
        return 'خدمة الربط وصلت حدها اليومي — سيُعاد الاتصال تلقائياً بمجرد تجدد الحد أو إضافة مفتاح جديد، أو اضغط "إعادة المحاولة" لاحقاً';
      }
      const why = FATAL_REASON_TEXT[extra.reason] || FATAL_REASON_TEXT.transient;
      return 'تعذّر الاتصال بـ ' + id + ' بعد ' + (extra.attempt || 'عدة') + ' محاولات تلقائية (' + why + ') — اضغط "إعادة المحاولة"';
    }
    // حالات "جاري الاتصال" التي يرسلها TikTokRoom: طابور / إعادة محاولة / محاولة جارية.
    if ((state === 'connecting' || state === 'reconnecting') && (code === 'queued' || code === 'retrying' || code === 'connecting')) {
      let t = (state === 'reconnecting' ? 'انقطع الاتصال — نعيد الربط بـ ' : 'جاري الاتصال بـ ') + id + '…';
      if (code === 'queued' && extra.queuePosition) {
        t += ' موقعك في الطابور ' + extra.queuePosition + ' من ' + extra.queueSize + (extra.etaSec ? ' (~' + extra.etaSec + 'ث)' : '');
      } else if (code === 'retrying') {
        t += ' محاولة ' + (extra.attempt || 1) + (extra.retryInSec ? ' — التالية بعد ' + extra.retryInSec + 'ث' : '');
      } else if (extra.attempt > 1) {
        t += ' محاولة ' + extra.attempt;
      }
      return t;
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

// ------------------------------------------------------------------ تيك توك (tiktok-live-connector 2.5.x) — طابور + مزودون + تعافٍ

// ---- البنية المشتركة لكل غرف تيك توك ----
const metrics = new Metrics();

// المزودون: مفاتيح Euler / عناوين توقيع بديلة / بروكسي — كلها من متغيرات البيئة (راجع .env.example).
const providerConfig = loadProviderDefs(process.env, { signUrl: (tiktokLib.SignConfig && tiktokLib.SignConfig.basePath) || 'https://api.eulerstream.com' });
LOG_SECRETS = providerConfig.defs.flatMap((d) => [d.apiKey, d.proxyUrl]).filter((x) => x && x.length >= 6);
const providerPool = new ProviderPool(providerConfig.defs, {
  ratePerMin: envNum('TIKTOK_CONNECT_RATE_PER_MIN', 120),
  freeRatePerMin: envNum('TIKTOK_FREE_RATE_PER_MIN', 60),
  minRatePerMin: envNum('TIKTOK_CONNECT_MIN_RATE_PER_MIN', 6),
  burst: envNum('TIKTOK_CONNECT_BURST', 6),
  inFlight: envNum('TIKTOK_CONNECT_INFLIGHT', 4),
  breakerThreshold: envNum('TIKTOK_BREAKER_THRESHOLD', 3),
  breakerCooldownMs: envNum('TIKTOK_BREAKER_COOLDOWN_MS', 30000),
  breakerMaxCooldownMs: envNum('TIKTOK_BREAKER_MAX_COOLDOWN_MS', 300000),
  deniedCooldownMs: envNum('TIKTOK_DENIED_COOLDOWN_MS', 600000),
  dailyCooldownMs: envNum('TIKTOK_DAILY_LIMIT_COOLDOWN_MS', 1800000),
});
// فحص "هل البث مفتوح" (room/info) قبل التوقيع يذهب لتيك توك مباشرة من IP السيرفر، وقد يُحجب من IP خدمات
// الاستضافة فيفشل الاتصال كله رغم سلامة التوقيع. TIKTOK_FETCH_ROOM_INFO=0 يتجاوزه (للتشخيص فقط).
const FETCH_ROOM_INFO = String(process.env.TIKTOK_FETCH_ROOM_INFO || '1') !== '0';
const providerDeps = { lib: tiktokLib, fetchRoomInfoOnConnect: FETCH_ROOM_INFO, sdk: tiktokSdk, HttpsProxyAgent, signTimeoutMs: TIKTOK_SIGN_TIMEOUT_MS };
const connectQueue = new ConnectQueue(providerPool, {
  onDispatch: (entry, waitedMs, provider) => {
    metrics.observe('queue_wait', waitedMs);
    metrics.inc('connect_attempts_total', { provider: provider.name });
  },
  onSettle: (entry, outcome, provider, tookMs, info) => {
    if (outcome && outcome.skipped) return; // غرفة أُغلقت قبل بدء المحاولة: لا تُحسب
    // "المفتاح خلص" / "رجع": سطر واضح باللوغ + عدّاد، وبعده ينتقل الاتصال تلقائياً للمفتاح التالي
    if (info && info.opened) {
      metrics.inc('provider_down_total', { provider: provider.name });
      if (outcome && outcome.invalidKey) slog('error', 'invalid_api_key', { provider: provider.name, hint: 'Euler رفض المفتاح (401): تأكد من نسخه كاملاً بلا مسافات/علامات اقتباس، ومن أنه مفعّل في لوحة Euler' });
      slog('warn', 'provider_down', { provider: provider.name, kind: outcome && outcome.kind, cooldownSec: Math.round(info.cooldownMs / 1000), next: (providerPool.pick().provider || {}).name || 'none-ready' });
    }
    if (info && info.recovered) slog('info', 'provider_recovered', { provider: provider.name });
    if (outcome && !outcome.ok) recordFailure(outcome, provider);
    metrics.observe('attempt_duration', tookMs);
    metrics.inc(outcome && outcome.ok ? 'connect_success_total' : 'connect_failure_total', outcome && outcome.ok ? { provider: provider.name } : { kind: (outcome && outcome.kind) || 'transient', provider: provider.name });
  },
});
// مصادر رقم الغرفة الاحتياطية عبر Euler تستهلك حصة إضافية؛ التعطيل: TIKTOK_ROOMID_EULER_FALLBACK=0
if (String(process.env.TIKTOK_ROOMID_EULER_FALLBACK || '1') === '0' && tiktokLib.RoomIdRouteConfig) {
  tiktokLib.RoomIdRouteConfig.skipFetchRoomIdFromEulerRoute = true;
}

// إغلاق upstream قديم لنفس اليوزر يجب أن ينتهي قبل فتح جديد — لا اتصالان لنفس الستريمر بنفس اللحظة
// حتى لو أُغلقت الغرفة وأُعيد فتحها خلال ثوانٍ (إعادة تحميل الصفحة).
const upstreamClosing = new Map(); // room key -> Promise
const capPromise = (p, ms) => Promise.race([p, new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); })]);

// فك اتصال مكتبة تيك توك بأمان: disconnect() غير متزامنة (حتى ~2ث)، ورفضها بدون catch
// كان يصير unhandledRejection. يرجع وعداً ينتهي عند اكتمال الإغلاق.
function safeTikTokDisconnect(conn) {
  if (!conn) return Promise.resolve();
  try { conn.removeAllListeners(); } catch (e) { /* ignore */ }
  try {
    const p = conn.disconnect();
    return capPromise(Promise.resolve(p).catch(() => {}), 4000);
  } catch (e) { return Promise.resolve(); }
}

// آخر أعطال الاتصال (للتشخيص فقط، بدون أسرار): تُعرض بـ/diag المحمي بكلمة سر لأنها قد تحوي يوزرنيمات.
const RECENT_FAILURES_MAX = 30;
const recentFailures = [];
function recordFailure(outcome, provider) {
  recentFailures.push({
    at: new Date().toISOString(),
    kind: outcome.kind,
    provider: provider && provider.name,
    detail: redactSecrets(describeError(outcome.error)).slice(0, 500),
  });
  if (recentFailures.length > RECENT_FAILURES_MAX) recentFailures.shift();
}

const FATAL_REASON_TEXT = {
  daily_limit: 'خدمة الربط وصلت حدها اليومي',
  invalid_key: 'مفتاح خدمة الربط غير صالح',
  rate_limited: 'خدمة الربط رفضت الطلبات مؤقتاً',
  sign_failed: 'تعذّر الوصول لخدمة توقيع الاتصال',
  provider_denied: 'مفتاح خدمة الربط مرفوض أو غير صالح',
  blocked: 'تيك توك يحجب سيرفر الربط',
  timeout: 'انتهت مهلة الاتصال',
  dropped: 'الاتصال ينقطع فور نجاحه',
  transient: 'خطأ اتصال متكرر',
};

// وصف الخطأ للوغ، مع الأسباب الداخلية لأخطاء "كل المصادر" (HTML/api-live/Euler) — بدونها ما
// تنعرف من لوغ Render إن كان حجب IP أو 429 أو يوزر غلط.
function describeError(err) {
  const inner = err && err.config && Array.isArray(err.config.requestErrs) ? err.config.requestErrs : [];
  return errText(err) + (inner.length ? ' ← ' + inner.map((e) => errText(e).replace(/\s+/g, ' ').slice(0, 160)).join(' | ') : '');
}

class TikTokRoom extends BaseRoom {
  constructor(uniqueId) {
    super('tiktok:' + uniqueId, '@' + uniqueId);
    this.uniqueId = uniqueId;
    this.firstCommentSeen = false;
    this.followSamples = 0;
    // عدّادات سياسة التعافي (تُصفّر عند ثبات الاتصال أو "إعادة المحاولة"):
    this.attemptNo = 0;       // رقم المحاولة الفعلية الحالية (يُعرض للمستخدم)
    this.failStreak = 0;      // محاولات فاشلة + انقطاعات سريعة متتالية (أساس الاستسلام)
    this.firstFailAt = 0;
    this.notLiveRetries = 0;
    this.notFoundStreak = 0;
    this.excluded = new Set(); // مزودون فشلوا بهذه الجولة (لا نعيدهم قبل تجربة البقية)
    this.connectToken = 0;
    this.attemptPromise = null;
    this.connectedAt = 0;
    this.stableTimer = null;
    this.wasConnected = false;
    this.parked = false;      // استسلمنا (fatal) ونعيد المحاولة كل 5 دقائق
    this.lastReviveAt = 0;
    this.retryAt = 0;         // موعد المحاولة التالية (للعدّ التنازلي)
    this.requestedAt = 0;     // بدء طلب الاتصال الحالي (لقياس زمن الوصول للاتصال)
    this.progressCode = 'queued';
    this.progressReason = '';
    this.progressTimer = null;
    this.lastProgressSig = '';
    this.lastProgressSentAt = 0;
    this.lastFailKind = 'transient';
    this.sawInvalidKey = false; // مزود رفض المفتاح (401) بهذه الجولة
    this.lastUpstreamAt = 0;
    this.lastLibErrorLogAt = 0;
  }

  // ---------------------------------------------------------------- الحالة المعروضة للعملاء
  progressExtra(code, reason) {
    const pos = connectQueue.position(this.key);
    const ex = { code, attempt: this.attemptNo };
    if (pos > 0) {
      const waiting = connectQueue.stats().waiting;
      const rate = providerPool.totalRatePerSec();
      ex.code = 'queued';
      ex.queuePosition = pos;
      ex.queueSize = waiting;
      const readyMs = providerPool.earliestReadyMs(this.excluded);
      const etaMs = Math.max(readyMs, rate > 0 ? (pos / rate) * 1000 : 0);
      if (etaMs >= 1500) ex.etaSec = Math.ceil(etaMs / 1000);
    }
    if (this.retryAt) {
      const left = Math.ceil((this.retryAt - Date.now()) / 1000);
      if (left > 0) ex.retryInSec = left;
    }
    if (reason) ex.reason = reason;
    return ex;
  }

  setProgress(code, reason) {
    this.progressCode = code;
    this.progressReason = reason || '';
    const state = this.wasConnected ? 'reconnecting' : 'connecting';
    const extra = this.progressExtra(code, reason);
    const sig = JSON.stringify([state, extra.code, extra.attempt, extra.queuePosition, extra.retryInSec, extra.reason]);
    // نتجاوز المكرر، لكن نعيد الإرسال كل 10ث على الأقل: الواجهة تعتبر صمت السيرفر 30ث عطلاً، وأثناء محاولة
    // جارية (حتى 30ث) لا يتغير شيء بالحالة.
    const now = Date.now();
    if (sig === this.lastProgressSig && this.state === state && now - this.lastProgressSentAt < 10000) return;
    this.lastProgressSig = sig;
    this.lastProgressSentAt = now;
    this.setState(state, extra);
  }

  // للعميل الذي ينضم أثناء الانتظار: موقعه/العدّ التنازلي الحاليان لا القديمان.
  statusExtra() {
    if (this.state === 'connecting' || this.state === 'reconnecting') return this.progressExtra(this.progressCode, this.progressReason);
    return this.lastExtra;
  }

  startProgressTicker() {
    if (this.progressTimer) return;
    this.progressTimer = setInterval(() => {
      if (this.stopped || this.clients.size === 0) return;
      if (this.state !== 'connecting' && this.state !== 'reconnecting') return;
      // ميزانية الوقت: لو كل المزودين معطّلين (قواطع مفتوحة) ما تصير محاولات جديدة فما يُقيَّم الاستسلام
      // بنتيجة فشل — نقيّمه هنا حتى لا ينتظر المستخدم أكثر من TIKTOK_GIVE_UP_MS بلا نتيجة نهائية.
      if (this.failStreak > 0 && this.shouldGiveUp() && !this.parked) {
        connectQueue.cancel(this.key);
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        return this.giveUp(this.lastFailKind);
      }
      this.setProgress(this.progressCode, this.progressReason);
    }, TIKTOK_PROGRESS_TICK_MS);
    if (this.progressTimer.unref) this.progressTimer.unref();
  }

  stopProgressTicker() {
    if (this.progressTimer) { clearInterval(this.progressTimer); this.progressTimer = null; }
    this.lastProgressSig = '';
    this.lastProgressSentAt = 0;
  }

  // ---------------------------------------------------------------- الاتصال عبر الطابور
  async start() {
    if (this.connection || connectQueue.has(this.key)) return;
    this.stopped = false;
    // upstream قديم لنفس اليوزر ما زال يُغلق (إغلاق/فتح سريع): ننتظره أولاً — اتصال واحد لكل يوزر.
    const closing = upstreamClosing.get(this.key);
    if (closing) { await closing; if (this.stopped) return; }
    this.enqueue();
  }

  enqueue(opts) {
    if (this.stopped || this.connection || connectQueue.has(this.key)) return;
    if (!this.requestedAt) this.requestedAt = Date.now();
    this.setProgress('queued', this.progressReason);
    this.startProgressTicker();
    connectQueue.request(this.key, {
      priority: this.wasConnected ? 0 : 1, // ستريمر كان على الهواء يسبق اتصالاً جديداً
      front: !!(opts && opts.front),
      exclude: this.excluded,
      dispatch: (provider) => this.attempt(provider),
    }).then((res) => this.onAttemptResult(res)).catch((e) => log('warn', this.key + ' — خطأ بمعالجة نتيجة المحاولة: ' + errText(e)));
  }

  attempt(provider) {
    const p = this._attempt(provider);
    this.attemptPromise = p;
    p.then(() => { if (this.attemptPromise === p) this.attemptPromise = null; });
    return p;
  }

  // يرجع دائماً كائن نتيجة ولا يرمي: {ok:true} | {kind, retryAfterMs, error}
  async _attempt(provider) {
    if (this.stopped) return { ok: true, skipped: true };
    this.attemptNo++;
    this.retryAt = 0;
    this.setProgress('connecting', this.progressReason);
    slog('info', 'connect_attempt', { room: this.uniqueId, attempt: this.attemptNo, provider: provider.name, queueWaitMs: this.requestedAt ? Date.now() - this.requestedAt : 0 });

    const token = ++this.connectToken;
    const fresh = () => !this.stopped && this.connectToken === token;
    let conn;
    try {
      conn = new TikTokLiveConnection(this.uniqueId, buildConnectionOptions(provider, providerDeps));
    } catch (err) {
      // المُنشئ يرمي InvalidUniqueIdError لو صيغة اليوزر غير صالحة
      return Object.assign(classifyTikTokError(err, tiktokLib), { error: err });
    }
    this.connection = conn;
    this.bindConnection(conn);

    let abandoned = false;
    const connectPromise = conn.connect();
    // لو تخلّينا عن هذه المحاولة (مهلة/إغلاق الغرفة) ثم نجحت لاحقاً: نفكّها بدل اتصال يتيم.
    connectPromise.then(() => { if (abandoned) safeTikTokDisconnect(conn); }, () => {});
    try {
      await withTimeout(connectPromise, TIKTOK_CONNECT_TIMEOUT_MS, 'انتهت مهلة الاتصال بتيك توك (@' + this.uniqueId + ')');
      if (!fresh()) { abandoned = true; safeTikTokDisconnect(conn); }
      return { ok: true };
    } catch (err) {
      abandoned = true;
      safeTikTokDisconnect(conn);
      if (this.connection === conn) this.connection = null;
      return Object.assign(classifyTikTokError(err, tiktokLib), { error: err });
    }
  }

  bindConnection(conn) {
    const mine = () => this.connection === conn && !this.stopped;

    conn.on(ControlEvent.CONNECTED, () => {
      if (!mine()) return;
      const now = Date.now();
      this.connectedAt = now;
      this.lastUpstreamAt = now;
      this.wasConnected = true;
      this.parked = false;
      this.notLiveRetries = 0;
      this.notFoundStreak = 0;
      this.firstFailAt = 0;
      this.attemptNo = 0;
      this.retryAt = 0;
      this.excluded.clear();
      this.sawInvalidKey = false;
      if (this.requestedAt) { metrics.observe('time_to_connected', now - this.requestedAt); this.requestedAt = 0; }
      // failStreak لا يُصفَّر هنا — فقط بعد ثبات الاتصال TIKTOK_STABLE_MS. لو كان تيك توك يقبل
      // ثم يقطع فوراً، التراجع يكمل تصاعده بدل حلقة "اتصل ← انقطع" التي تحرق الحصة.
      this.clearStableTimer();
      this.stableTimer = setTimeout(() => {
        this.stableTimer = null;
        if (mine()) this.failStreak = 0;
      }, TIKTOK_STABLE_MS);
      if (this.stableTimer.unref) this.stableTimer.unref();
      this.stopProgressTicker();
      slog('info', 'connected', { room: this.uniqueId });
      this.setState('connected');
    });

    conn.on(ControlEvent.DISCONNECTED, (info) => {
      if (!mine()) return; // اتصال قديم، أو STREAM_END عالجه قبلنا، أو الغرفة أُغلقت
      const lived = this.connectedAt ? Date.now() - this.connectedAt : 0;
      this.clearStableTimer();
      this.connection = null;
      this.wasConnected = true;
      this.requestedAt = Date.now();
      if (lived < TIKTOK_STABLE_MS) { this.failStreak++; if (!this.firstFailAt) this.firstFailAt = Date.now(); } else { this.failStreak = 0; this.firstFailAt = 0; }
      slog('info', 'upstream_disconnected', { room: this.uniqueId, code: info && info.code, livedSec: Math.round(lived / 1000), quickDrops: this.failStreak });
      metrics.inc('upstream_disconnects_total');
      if (this.shouldGiveUp()) return this.giveUp('dropped');
      const delay = backoffDelay(Math.max(1, this.failStreak), { baseMs: TIKTOK_RETRY_BASE_MS, maxMs: TIKTOK_RETRY_MAX_MS });
      this.retryAt = Date.now() + delay;
      this.setProgress('retrying', 'dropped');
      this.startProgressTicker();
      this.scheduleReconnect(delay);
    });

    // أخطاء ما بعد الاتصال (فك رسالة/ويب سوكيت) — للتشخيص فقط، بحد سطر كل 30ث. أخطاء connect() نفسها
    // تُعالج بنتيجة المحاولة. (المكتبة ما تطلق 'error' أصلاً لو ما فيه مستمع، فهذا لا يغيّر سلوكها.)
    conn.on(ControlEvent.ERROR, (e) => {
      if (!mine() || this.state !== 'connected') return;
      const now = Date.now();
      if (now - this.lastLibErrorLogAt < 30000) return;
      this.lastLibErrorLogAt = now;
      log('warn', '@' + this.uniqueId + ' — خطأ من المكتبة أثناء البث (' + ((e && e.info) || '') + '): ' + errText(e && e.exception));
    });

    // أي بيانات من تيك توك (حتى النبض) تثبت أن الاتصال حي — أساس كشف الاتصال الميت بصمت.
    conn.on(ControlEvent.WEBSOCKET_DATA, () => { this.lastUpstreamAt = Date.now(); });

    conn.on(WebcastEvent.CHAT, (data) => {
      if (!mine()) return;
      this.lastUpstreamAt = Date.now();
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
      this.lastUpstreamAt = Date.now();
      // الهدايا القابلة للتتابع (streak, gift.type===1) ترسل عدة أحداث أثناء
      // التتابع؛ repeatEnd (0/1) يشير لآخر حدث بالتتابع — نبث مرة وحدة فقط
      // عند انتهائه حتى لا تُحتسب الهدية مضاعفة بالألعاب.
      const giftType = data.gift && data.gift.type;
      if (giftType === 1 && !data.repeatEnd) return;
      this.broadcastEvents([buildTikTokGift(data)]);
    });

    conn.on(WebcastEvent.FOLLOW, (data) => {
      if (!mine()) return;
      this.lastUpstreamAt = Date.now();
      this.broadcastEvents([buildTikTokFollow(data)]);
    });

    conn.on(WebcastEvent.LIKE, (data) => {
      if (!mine()) return;
      this.lastUpstreamAt = Date.now();
      this.broadcast({ messages: [buildTikTokLike(data)] });
    });

    conn.on(WebcastEvent.ROOM_USER, (data) => {
      if (!mine()) return;
      this.lastUpstreamAt = Date.now();
      this.broadcast({ messages: [buildTikTokViewer(data.totalUser)] });
    });

    conn.on(WebcastEvent.STREAM_END, () => {
      if (!mine()) return;
      // المكتبة تستدعي disconnect() بنفسها بعد هذا الحدث، فيوصل DISCONNECTED — نفصل الاتصال عن
      // الغرفة أولاً حتى يتجاهله (كان يلغي انتظار "مو لايف" ويعيد المحاولة بعد 1.5ث).
      this.clearStableTimer();
      this.connection = null;
      this.failStreak = 0;
      this.firstFailAt = 0;
      this.notLiveRetries++;
      const delay = backoffDelay(this.notLiveRetries, { baseMs: TIKTOK_NOT_LIVE_BASE_MS, maxMs: TIKTOK_NOT_LIVE_MAX_MS, factor: 1.5 });
      slog('info', 'stream_ended', { room: this.uniqueId, recheckSec: Math.round(delay / 1000) });
      this.stopProgressTicker();
      this.setState('not_live');
      this.scheduleReconnect(delay);
    });
  }

  // ---------------------------------------------------------------- نتائج المحاولات
  onAttemptResult(res) {
    if (!res || res.cancelled || this.stopped) return;
    const { outcome, provider } = res;
    if (outcome.ok) { this.excluded.clear(); return; }
    this.handleAttemptFailure(outcome, provider);
  }

  shouldGiveUp() {
    return this.failStreak >= TIKTOK_MAX_ATTEMPTS || (this.firstFailAt > 0 && Date.now() - this.firstFailAt >= TIKTOK_GIVE_UP_MS);
  }

  handleAttemptFailure(outcome, provider) {
    const kind = outcome.kind;
    const level = (kind === 'offline' || kind === 'user_not_found') ? 'info' : 'warn';
    slog(level, 'connect_fail', { room: this.uniqueId, kind, provider: provider && provider.name, attempt: this.attemptNo, detail: describeError(outcome.error) });

    if (kind === 'offline') {
      // "مو لايف" ليست فشل اتصال — ما تُحتسب بسلسلة الفشل ولا تُعلن نهائية، لأن المطلوب فعلاً هو
      // انتظار فتح البث ثم الاتصال تلقائياً.
      this.failStreak = 0; this.firstFailAt = 0; this.excluded.clear(); this.notFoundStreak = 0;
      this.notLiveRetries++;
      const delay = backoffDelay(this.notLiveRetries, { baseMs: TIKTOK_NOT_LIVE_BASE_MS, maxMs: TIKTOK_NOT_LIVE_MAX_MS, factor: 1.5 });
      this.stopProgressTicker();
      this.setState('not_live');
      this.scheduleReconnect(delay);
      return;
    }

    if (kind === 'user_not_found') {
      this.notFoundStreak++;
      this.excluded.clear();
      const delay = backoffDelay(this.notFoundStreak, { baseMs: TIKTOK_NOT_FOUND_BASE_MS, maxMs: TIKTOK_NOT_FOUND_MAX_MS });
      this.stopProgressTicker();
      this.setState('error', { code: 'user_not_found' });
      this.scheduleReconnect(delay);
      return;
    }

    this.failStreak++;
    if (outcome.invalidKey) this.sawInvalidKey = true;
    this.lastFailKind = outcome.daily ? 'daily_limit' : kind;
    if (!this.firstFailAt) this.firstFailAt = Date.now();
    if (this.shouldGiveUp()) return this.giveUp(this.lastFailKind);
    // الحد اليومي: لو ما فيه أي مزود يجهز خلال 5 دقائق (كلهم انتهى حدهم) ننتظر ساعات — نعلن السبب فوراً بدل
    // "جاري الاتصال" لدقائق بلا فائدة. (الغرفة تبقى تحاول بالخلفية، وأي مفتاح جديد/تجدد الحد يوصلها تلقائياً.)
    if (outcome.daily && providerPool.earliestReadyMs() > 5 * 60 * 1000) return this.giveUp('daily_limit');
    // مفتاح مرفوض (401/403) ولا يوجد أي مزود بديل جاهز: إعلان فوري بدل دقائق "جاري الاتصال" بلا فائدة.
    if (kind === 'provider_denied' && providerPool.earliestReadyMs() > 5 * 60 * 1000) return this.giveUp('provider_denied');

    // هل يوجد مزود/مسار بديل لم نجربه بهذه الجولة؟ (عطل المزود: هو وحده، حجب تيك توك: كل مساره)
    if (provider && isProviderFault(kind)) this.excluded.add(provider.id);
    else if (provider && kind === 'blocked') providerPool.byRoute(provider.route).forEach((p) => this.excluded.add(p.id));
    const failover = provider && (isProviderFault(kind) || kind === 'blocked') && this.excluded.size < providerPool.size;
    if (failover) {
      metrics.inc('provider_switch_total', { kind });
      slog('info', 'provider_switch', { room: this.uniqueId, from: provider.name, kind });
      this.setProgress('retrying', kind);
      this.startProgressTicker();
      this.enqueue({ front: true }); // فوراً بمزود بديل — بلا انتظار تراجع
      return;
    }
    this.excluded.clear();
    metrics.inc('retries_total', { kind });
    // 429: القاطع يحمل retry-after الحقيقي — الطابور نفسه ينتظره. غير ذلك: تراجع أسّي.
    const delay = kind === 'rate_limited' ? 0 : backoffDelay(this.failStreak, { baseMs: TIKTOK_RETRY_BASE_MS, maxMs: TIKTOK_RETRY_MAX_MS });
    this.retryAt = Date.now() + Math.max(delay, kind === 'rate_limited' ? providerPool.earliestReadyMs() : 0);
    this.setProgress('retrying', kind);
    this.startProgressTicker();
    if (delay <= 0) this.enqueue(); else this.scheduleReconnect(delay);
  }

  // الاستسلام النهائي (بعد استنفاد المحاولات والبدائل): رسالة واضحة + زر "إعادة المحاولة" بالواجهة،
  // والغرفة تكمل كل TIKTOK_PARKED_RETRY_MS بالخلفية لو بقي عميل.
  giveUp(reason) {
    // لو سبب الفشل الجذري مفتاح مرفوض (401) فهو الأولى بالإعلان (الأكثر قابلية للإصلاح) حتى لو انضم له حد يومي مجاني
    if (this.sawInvalidKey && (reason === 'daily_limit' || reason === 'provider_denied')) reason = 'invalid_key';
    this.parked = true;
    this.stopProgressTicker();
    this.excluded.clear();
    metrics.inc('give_up_total', { reason });
    slog('warn', 'gave_up', { room: this.uniqueId, reason, attempts: this.attemptNo, failStreak: this.failStreak });
    this.retryAt = 0;
    this.failStreak = Math.max(0, TIKTOK_MAX_ATTEMPTS - 1); // فشل واحد بعد الاستيقاظ يعيدنا للاستسلام
    this.setState('error', { code: 'gave_up', reason, fatal: true, attempt: this.attemptNo });
    this.scheduleReconnect(withJitter(TIKTOK_PARKED_RETRY_MS));
  }

  // عميل جديد دخل على غرفة مستسلمة (زر "إعادة المحاولة" يعيد فتح الاتصال) ← نحاول من جديد فوراً.
  onClientAdded() {
    if (!this.parked || this.stopped) return;
    const now = Date.now();
    if (now - this.lastReviveAt < TIKTOK_REVIVE_MIN_GAP_MS) return;
    this.lastReviveAt = now;
    slog('info', 'revive', { room: this.uniqueId });
    this.parked = false;
    this.failStreak = 0; this.firstFailAt = 0; this.attemptNo = 0; this.excluded.clear();
    this.requestedAt = 0;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.enqueue();
  }

  // ---------------------------------------------------------------- اتصال ميت بصمت
  checkSilence() {
    if (this.stopped || this.state !== 'connected' || !this.connection || !this.lastUpstreamAt) return;
    if (Date.now() - this.lastUpstreamAt < TIKTOK_UPSTREAM_SILENCE_MS) return;
    slog('warn', 'upstream_silent', { room: this.uniqueId, silentSec: Math.round((Date.now() - this.lastUpstreamAt) / 1000) });
    metrics.inc('upstream_silent_total');
    const conn = this.connection;
    this.connection = null;
    this.clearStableTimer();
    this.wasConnected = true;
    this.requestedAt = Date.now();
    this.failStreak = 0; this.firstFailAt = 0;
    const closing = safeTikTokDisconnect(conn);
    upstreamClosing.set(this.key, closing);
    closing.then(() => { if (upstreamClosing.get(this.key) === closing) upstreamClosing.delete(this.key); });
    const delay = backoffDelay(1, { baseMs: TIKTOK_RETRY_BASE_MS, maxMs: TIKTOK_RETRY_MAX_MS });
    this.retryAt = Date.now() + delay;
    this.setProgress('retrying', 'silent');
    this.startProgressTicker();
    this.scheduleReconnect(delay);
  }

  clearStableTimer() {
    if (this.stableTimer) { clearTimeout(this.stableTimer); this.stableTimer = null; }
  }

  disconnect() {
    this.clearStableTimer();
    this.stopProgressTicker();
    this.connectToken++; // أي connect() جارٍ يصير "متروكاً" ويُفك لو نجح لاحقاً
    connectQueue.cancel(this.key); // غرفة بالانتظار أُغلقت: لا تستهلك طلب توقيع
    const conn = this.connection;
    this.connection = null;
    const pending = this.attemptPromise;
    if (!conn && !pending) return;
    const closing = capPromise(Promise.all([pending ? pending.catch(() => {}) : null, safeTikTokDisconnect(conn)]), TIKTOK_CONNECT_TIMEOUT_MS + 5000);
    upstreamClosing.set(this.key, closing);
    closing.then(() => { if (upstreamClosing.get(this.key) === closing) upstreamClosing.delete(this.key); });
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
    this.useKichat = KICK_TRANSPORT !== 'connector';
    this.gaveUp = false;
  }

  // kichat.js: جلسة واحدة لكل قناة تخدم كل عملاء الغرفة (بوابة مشتركة، لا اتصال مكرر). راجع lib/kichat-session.js.
  startKichat() {
    const session = new KickChatSession(this.channelName, {});
    this.connection = session;
    this.gaveUp = false;
    session.on('state', (st) => {
      if (st.state === 'connected') { log('info', 'kick:' + this.channelName + ' — متصل (kichat)'); this.setState('connected'); }
      else if (st.state === 'not_live') this.setState('not_live');
      else if (st.state === 'reconnecting') { log('info', 'kick:' + this.channelName + ' — انقطع/فشل (' + (st.detail || '?') + ') — محاولة ' + st.attempt + ' بعد ' + st.delayMs + 'ms'); this.setState('reconnecting'); }
      else if (st.state === 'connecting') this.setState('connecting');
    });
    session.on('messages', (batch) => {
      const events = [];
      for (const u of batch) events.push(kickAdapter.toBridgeEvent(u));
      if (events.length) this.broadcastEvents(events);
    });
    session.on('fatal', () => {
      log('info', 'kick:' + this.channelName + ' — يوزرنيم/قناة غير موجودة');
      this.setState('error', { code: 'user_not_found' });
      this.disconnect();
      this.scheduleReconnect(withJitter(NOT_LIVE_RETRY_DELAY_MS));
    });
    session.on('blocked', (b) => {
      if (KICK_TRANSPORT === 'auto') {
        log('warn', 'kick:' + this.channelName + ' — kichat محجوب (' + b.detail + ') — تحويل للناقل الاحتياطي kick-live-connector');
        this.useKichat = false;
        this.disconnect();
        this.start();
        return;
      }
      log('warn', 'kick:' + this.channelName + ' — محجوب من كيك (' + b.detail + ')');
      this.setState('error', { code: 'connect_failed' });
      this.disconnect();
      this.scheduleReconnect(withJitter(RECONNECT_DELAY_MS * 6));
    });
    session.on('gaveup', (g) => {
      log('warn', 'kick:' + this.channelName + ' — استسلمت المحاولات التلقائية (' + g.attempts + ') — ننتظر عميلاً جديداً');
      this.gaveUp = true; // الحالة 'error/connect_failed' أُرسلت من حدث state؛ عميل جديد يوقظ الغرفة
      this.setState('error', { code: 'connect_failed' });
    });
    return session.start();
  }

  onClientAdded() {
    if (this.gaveUp && !this.stopped && this.useKichat) { this.gaveUp = false; this.disconnect(); this.start(); }
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

    if (this.useKichat) { await this.startKichat(); return; }

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
    if (client instanceof KickChatSession) { this.connectToken++; try { client.stop(); } catch (e) { /* ignore */ } return; }
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
metrics.gauge('queue_waiting', () => connectQueue.stats().waiting);
metrics.gauge('queue_running', () => connectQueue.stats().running);
metrics.gauge('rooms', () => rooms.size);
metrics.gauge('providers_breaker_open', () => providerPool.snapshot().filter((p) => p.breaker !== 'closed').length);

function getOrCreateRoom(platform, rawIdentifier) {
  // كيك: نوحّد المعرّف قبل أي شيء (يوزر مجرّد أو رابط kick.com/يوزر ينتهيان
  // لنفس الاسم). بدون هذا التوحيد يفتح "xqc" و"https://kick.com/xqc" غرفتين
  // منفصلتين ومعهما اتصالان كاملان لنفس القناة — وكل اتصال يشغّل Chromium.
  const canonical = platform === 'kick' ? canonicalKickId(rawIdentifier) : platform === 'tiktok' ? (canonicalTikTokId(rawIdentifier) || rawIdentifier.toLowerCase()) : rawIdentifier.toLowerCase();
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
  const q = connectQueue.stats();
  const snap = metrics.snapshot();
  const counterSum = (prefix) => Object.keys(snap.counters).filter((k) => k === prefix || k.indexOf(prefix + '{') === 0).reduce((n, k) => n + snap.counters[k], 0);
  return {
    ok: true,
    uptimeSec: Math.round((Date.now() - BOOT_AT) / 1000),
    bootId: BOOT_ID,
    node: process.version,
    tiktokLiveConnector: TIKTOK_LIB_VERSION,
    eulerApiKey: providerConfig.keyCount > 0 ? 'set' : 'missing',
    wsClients: wss.clients.size,
    rooms: rooms.size,
    platforms: byPlatform,
    // طابور اتصال تيك توك: طول الانتظار، الجاري الآن، أقدم طلب منتظر
    queue: { waiting: q.waiting, running: q.running, oldestWaitSec: Math.round(q.oldestWaitMs / 1000) },
    // حالة كل مزود توقيع (بلا مفاتيح/عناوين): قاطع الدائرة، المعدل التكيّفي، العدّادات
    providers: providerPool.snapshot(),
    tiktok: {
      connectAttempts: counterSum('connect_attempts_total'),
      connectsOk: counterSum('connect_success_total'),
      failures: counterSum('connect_failure_total'),
      retries: counterSum('retries_total'),
      providerSwitches: counterSum('provider_switch_total'),
      gaveUp: counterSum('give_up_total'),
      queueWaitMs: snap.timings.queue_wait || null,
      attemptDurationMs: snap.timings.attempt_duration || null,
      timeToConnectedMs: snap.timings.time_to_connected || null,
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

  if (path === '/diag') {
    // تشخيص مفصّل (آخر أعطال الاتصال بأسبابها الحقيقية). مغلق تماماً ما لم تضبط BRIDGE_DIAG_TOKEN، ويتطلب ?token=.
    // (لا نعرضه بـ/health لأن تلك عامة وقد تحوي الأعطال يوزرنيمات ستريمرز.)
    const token = process.env.BRIDGE_DIAG_TOKEN || '';
    const given = new URL(req.url, 'http://localhost').searchParams.get('token') || '';
    if (!token || given !== token) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, profileCorsHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }));
    res.end(JSON.stringify({ health: healthSnapshot(), recentFailures: recentFailures.slice().reverse() }, null, 2));
    return;
  }

  if (path === '/metrics') {
    // صيغة Prometheus النصية (عدّادات المحاولات/الفشل بالنوع/المزود، أزمنة الطابور والاتصال).
    res.writeHead(200, profileCorsHeaders({ 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'no-store' }));
    res.end(metrics.prometheus());
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
const clipForMessage = (s) => String(s || '').replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '').slice(0, 30);

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
  let checkId = platform === 'kick' ? canonicalKickId(rawUser) : rawUser.toLowerCase();
  if (platform === 'tiktok') {
    const tk = canonicalTikTokId(rawUser);
    if (!tk) {
      // صيغة مستحيلة كيوزر تيك توك (عربي/مسافات/رابط غير بروفايل…): رد فوري بالسبب بدل فتح غرفة واتصال يحرقان حصة التوقيع.
      log('info', 'tiktok — يوزر بصيغة غير صالحة ("' + rawUser.slice(0, 40) + '")');
      try { ws.send(JSON.stringify(buildStatus('error', '@' + clipForMessage(rawUser) + ' — يوزرنيم/قناة غير موجودة، تأكد من كتابته صح', { code: 'user_not_found' }))); } catch (e) { /* ignore */ }
      ws.close(4404, 'يوزر تيك توك غير صالح');
      return;
    }
    checkId = tk;
  }
  const enabled = await isStreamerEnabled(checkId);
  if (!enabled) {
    log('info', platform + ':' + checkId + ' — الاتصال مرفوض (الحساب معطّل من المالك)');
    ws.close(4403, 'هذا الحساب معطّل من إدارة المنصة');
    return;
  }
  // العميل أغلق (ريفرش/ضغطتين) أثناء فحص التفعيل: لا نفتح غرفة/طلب توقيع لسوكيت ميت.
  if (ws.readyState !== WebSocket.OPEN) return;

  log('info', platform + ':' + checkId + ' — عميل جديد اتصل');
  const room = getOrCreateRoom(platform, rawUser);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  room.addClient(ws, url.searchParams.get('since'));

  ws.on('close', (code) => {
    // 1000 = قفل مقصود (بدّل الحساب/فصل) ← مهلة قصيرة؛ 1001 = صفحة تُغلق/تُعاد ← متوسطة؛ غير ذلك
    // انقطاع (شبكة/نوم/نبض ميت) ← الأطول (راجع ROOM_*_GRACE_MS).
    room.removeClient(ws, code);
    log('info', platform + ':' + checkId + ' — عميل انفصل (' + code + ')');
  });

  ws.on('error', () => {
    room.removeClient(ws, 1006);
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

// كل 15ث: فحص اتصالات تيك توك الميتة بصمت، وكل 30ث سطر لوغ منظّم عن الطابور لو فيه نشاط.
let statsTick = 0;
const maintenanceTimer = setInterval(() => {
  for (const room of rooms.values()) { if (room instanceof TikTokRoom) { try { room.checkSilence(); } catch (e) { /* ignore */ } } }
  if (++statsTick % 2 === 0) {
    const q = connectQueue.stats();
    if (q.waiting || q.running) slog('info', 'queue', { waiting: q.waiting, running: q.running, oldestWaitSec: Math.round(q.oldestWaitMs / 1000), rooms: rooms.size, providers: providerPool.snapshot().map((p) => p.name + ':' + p.breaker + ':' + p.ratePerMin + '/m').join(',') });
  }
}, envNum('TIKTOK_MAINTENANCE_MS', 15000));
maintenanceTimer.unref();

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
  slog('info', 'providers', { count: providerPool.size, strategy: providerConfig.sequential ? 'sequential' : 'balanced', keys: providerConfig.keyCount, keySource: providerConfig.keySource, proxies: providerConfig.proxyCount, fallbackUrls: providerConfig.fallbackCount, names: providerPool.snapshot().map((p) => p.name).join(',') });
  slog('info', 'connect_policy', { ratePerMinPerProvider: envNum('TIKTOK_CONNECT_RATE_PER_MIN', 120), burst: envNum('TIKTOK_CONNECT_BURST', 6), inFlightPerProvider: envNum('TIKTOK_CONNECT_INFLIGHT', 4), maxAttempts: TIKTOK_MAX_ATTEMPTS, giveUpSec: Math.round(TIKTOK_GIVE_UP_MS / 1000) });
  // تشخيص مباشر لأشيع سبب لـ429: المفتاح غير مضبوط أصلاً على المستضيف.
  if (providerConfig.keyCount > 0) {
    log('info', 'مفاتيح EulerStream: ' + providerConfig.keyCount + ' مفتاح مقروء من ' + providerConfig.keySource + ' — بالترتيب: ' + providerConfig.keyTails.join(' ، ') + ' (آخر ٤ خانات فقط) — حد طلبات التوقيع المرفوع فعّال');
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
  connectQueue.stop();
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
