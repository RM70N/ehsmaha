'use strict';
// جسر تيك توك "متوافق قديم" — بروتوكول الأسلاك مطابق حرفياً لما يرسله tiktok-server/server.js
// الحالي ({type:'bridge_status',...} لحالة الاتصال، و{messages:[{type:'WebcastChatMessage'|...,
// user:{uniqueId,nickname,profilePictureUrl,followRole,isFollower,followInfo},...}]} للأحداث)،
// حتى لا تحتاج أي من الـ38 لعبة بـindex.html أي تعديل — extractUser() بالموقع تفهم هذا الشكل
// بالضبط بغض النظر عن مصدر الحدث (راجع تعليق أعلى tiktok-server/server.js نفسه).
//
// الفرق الوحيد عن القديم: المزوّد الفعلي هنا piratetok-live-js (بلا مفتاح/حصة مشتركة)، فلا حاجة
// لطابور اتصال (ConnectQueue) أو تجمّع مزودين — هذا الـTIKTOK_BRIDGE_SERVERS بالموقع يبقى على
// سيرفر tiktok-server القديم (Euler) كاحتياطي بالفشل التلقائي (failover) الموجود أصلاً بالفرونت
// إند (tiktokOpenWS)، فلا داعٍ لتكرار نفس شبكة الأمان هنا.
//
// حقول User وWebcastChatMessage/WebcastGiftMessage/WebcastLikeMessage/WebcastSocialMessage/
// WebcastRoomUserSeqMessage تأكدت أنها مطابقة حرفياً لمخطط tiktok-live-connector من
// node_modules/piratetok-live-js/dist/proto/schema.js (كلا المكتبتين تفكّان نفس بروتوكول تيك توك
// الثنائي) — لا تخمين، قراءة مباشرة للحقول المسجَّلة.
import { WebSocketServer } from 'ws';
import {
  TikTokLiveClient,
  EventType,
} from 'piratetok-live-js';
import { classify } from './providers/piratetokProvider.js';
import { normalizeTikTokUsername, InvalidUsernameError } from './normalize.js';
import { backoffDelay } from './backoff.js';

const BRIDGE_PROTOCOL_VERSION = 2; // نفس رقم بروتوكول tiktok-server — الواجهة تستخدمه لكشف سيرفر قديم لا يرسله
const ROOM_IDLE_GRACE_MS = 10_000;      // آخر عميل غادر بإغلاق عادي (1000)
const ROOM_RELOAD_GRACE_MS = 20_000;    // إغلاق 1001 (إعادة تحميل الصفحة)
const ROOM_ABNORMAL_GRACE_MS = 45_000;  // أي إغلاق آخر (شبكة/نوم الجهاز)
const NOT_LIVE_RETRY_MS = 30_000;       // إعادة المحاولة لو الحساب مو مباشر الآن
const PERMANENT_RETRY_MS = 20 * 60_000; // يوزر غير موجود/جلسة مطلوبة: محاولة نادرة جداً فقط احتياطاً
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30_000;

function toHttpsUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const u = url.trim();
  if (!u) return '';
  if (/^https:\/\//i.test(u)) return u;
  if (/^http:\/\//i.test(u)) return 'https://' + u.slice(7);
  if (u.indexOf('//') === 0) return 'https:' + u;
  return '';
}

const AVATAR_FIELDS = ['avatarThumb', 'avatarMedium', 'avatarLarge'];
function pickAvatar(user) {
  if (!user) return '';
  for (const field of AVATAR_FIELDS) {
    const list = user[field] && Array.isArray(user[field].urlList) ? user[field].urlList : [];
    const direct = list.find((u) => typeof u === 'string' && /^https:\/\//i.test(u.trim()));
    if (direct) return direct.trim();
    for (const u of list) { const fixed = toHttpsUrl(u); if (fixed) return fixed; }
  }
  return toHttpsUrl(user.profilePictureUrl) || toHttpsUrl(user.avatarUrl) || '';
}

// نفس extractTikTokUser بـtiktok-server/server.js حرفياً (شكل user الذي تفهمه extractUser()
// بـindex.html) — فقط منقول لـESM بدل CommonJS.
export function extractUser(user, identity) {
  if (!user) {
    return { uniqueId: '?', nickname: '?', profilePictureUrl: '', avatar: '', avatarUrl: '', followRole: 0, isFollower: false, followKnown: false, followInfo: { followStatus: 0 } };
  }
  const uniqueId = user.displayId || user.uniqueId || user.userId || user.id || '?';
  const nickname = user.nickname || uniqueId;
  const avatar = pickAvatar(user);
  const followStatus = Number((user.followInfo && user.followInfo.followStatus) || 0);
  const byStatus = followStatus === 1 || followStatus === 2;
  const hasIdentity = !!identity && typeof identity === 'object';
  const byIdentity = hasIdentity && !!(identity.isFollowerOfAnchor || identity.isMutualFollowingWithAnchor || identity.isAnchor);
  const following = byIdentity || byStatus;
  return {
    uniqueId: String(uniqueId),
    nickname: String(nickname),
    profilePictureUrl: avatar,
    avatar,
    avatarUrl: avatar,
    followRole: following ? 1 : 0,
    isFollower: following,
    followKnown: hasIdentity || byStatus,
    followInfo: { followStatus: following ? 1 : 0 },
  };
}

export function buildComment(data) {
  const user = extractUser(data.user, data.userIdentity);
  const text = data.content || data.comment || '';
  return { type: 'WebcastChatMessage', comment: text, user, timestamp: Date.now() };
}

export function buildGift(data) {
  const user = extractUser(data.user, data.userIdentity);
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

export function buildFollow(data) {
  const user = Object.assign(extractUser(data.user), { isFollower: true, followKnown: true, followRole: 1, followInfo: { followStatus: 1 } });
  return { type: 'WebcastSocialMessage', displayType: 'follow', user, timestamp: Date.now() };
}

export function buildLike(data) {
  const user = extractUser(data.user);
  return { type: 'WebcastLikeMessage', likeCount: Number(data.count) || 0, totalLikeCount: Number(data.total) || 0, user, timestamp: Date.now() };
}

export function buildViewer(count) {
  return { type: 'WebcastRoomUserSeqMessage', viewerCount: count || 0, timestamp: Date.now() };
}

// إغلاق WS بكود مخصّص + سبب نصي: بروتوكول WS يرفض أي سبب يتجاوز 123 بايت UTF-8 ويرمي استثناءً
// غير ملتقط يُسقط عملية Node كاملة (تأكّد فعلياً بالاختبار: نص عربي عادي بالحجم الطبيعي يتجاوز
// الحد بسهولة فيكرّر "crash الخادم" لكل بقية الستريمرز المتصلين بسبب يوزر واحد غير صالح). نقصّ
// بوحدات UTF-8 (لا أحرف JS) ونغلّف بـtry/catch دائماً.
function closeSafely(ws, code, reason) {
  let r = String(reason || '');
  while (Buffer.byteLength(r, 'utf8') > 120) r = r.slice(0, -1);
  try { ws.close(code, r); } catch (e) { try { ws.terminate(); } catch (e2) { /* best-effort */ } }
}

function buildStatus(state, message, extra) {
  return Object.assign({ type: 'bridge_status', state, message, timestamp: Date.now(), srv: BRIDGE_PROTOCOL_VERSION }, extra || {});
}

function messageForState(id, state, code, extra) {
  if (state === 'connecting' || state === 'reconnecting') {
    let t = (state === 'reconnecting' ? 'انقطع الاتصال — نعيد الربط بـ ' : 'جاري الاتصال بـ ') + id + '…';
    if (code === 'retrying') t += ' محاولة ' + (extra.attempt || 1) + (extra.retryInSec ? ' — التالية بعد ' + extra.retryInSec + 'ث' : '');
    else if (extra.attempt > 1) t += ' محاولة ' + extra.attempt;
    return t;
  }
  const map = {
    connected: 'متصل بالبث المباشر ✅',
    not_live: id + ' مو مفتوح بث الآن',
    error: 'خطأ بالاتصال',
  };
  return map[state] || '';
}

// غرفة واحدة لكل يوزر تيك توك — تُنشأ عند أول عميل WS وتُغلق بعد مهلة سماح من غياب آخر عميل.
// state machine: connecting -> connected -> (reconnecting -> connected)* ، أو not_live/error.
export class LegacyTikTokRoom {
  constructor(uniqueId, { log = () => {}, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, clientFactory, rng = Math.random } = {}) {
    this.uniqueId = uniqueId;
    this.key = 'tiktok:' + uniqueId;
    this.log = log;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.rng = rng;
    // clientFactory قابل للحقن للاختبار (بدل اتصال شبكة حقيقي بكل اختبار).
    this.clientFactory = clientFactory || ((username) => new TikTokLiveClient(username));

    this.clients = new Set();
    this.state = 'connecting';
    this.lastExtra = {};
    this.client = null;
    this.stopped = false;
    this.closeTimer = null;
    this.reconnectTimer = null;
    this.attemptNo = 0;
    this.failStreak = 0;
    this.wasConnected = false;
    this.connectToken = 0;
  }

  // ---------------------------------------------------------------- عملاء الغرفة
  addClient(ws) {
    if (this.closeTimer) { this.clearTimer(this.closeTimer); this.closeTimer = null; }
    this.clients.add(ws);
    this.sendTo(ws, buildStatus(this.state, messageForState(this.uniqueId, this.state, this.lastExtra.code, this.lastExtra), this.lastExtra));
    if (!this.client && !this.reconnectTimer && !this.stopped) this.start();
  }

  removeClient(ws, code) {
    if (!this.clients.delete(ws)) return;
    if (this.clients.size === 0 && !this.closeTimer) {
      const grace = code === 1000 ? ROOM_IDLE_GRACE_MS : (code === 1001 ? ROOM_RELOAD_GRACE_MS : ROOM_ABNORMAL_GRACE_MS);
      this.closeTimer = this.setTimer(() => this.teardown(), grace);
      if (this.closeTimer && this.closeTimer.unref) this.closeTimer.unref();
    }
  }

  sendTo(ws, payload) {
    if (ws.readyState === ws.OPEN) { try { ws.send(JSON.stringify(payload)); } catch (e) { /* best-effort */ } }
  }

  broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const ws of this.clients) { if (ws.readyState === ws.OPEN) { try { ws.send(data); } catch (e) { /* best-effort */ } } }
  }

  setState(state, extra) {
    this.state = state;
    this.lastExtra = extra || {};
    this.broadcast(buildStatus(state, messageForState(this.uniqueId, state, this.lastExtra.code, this.lastExtra), this.lastExtra));
  }

  teardown() {
    this.stopped = true;
    this.log('info', 'tiktok:' + this.uniqueId + ' — إغلاق الغرفة (لا عملاء متبقّين)');
    if (this.reconnectTimer) { this.clearTimer(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.client) { try { this.client.disconnect(); } catch (e) { /* best-effort */ } this.client = null; }
    if (this.onTeardown) this.onTeardown(this.key);
  }

  // ---------------------------------------------------------------- دورة الاتصال
  async start() {
    if (this.client || this.stopped) return;
    this.attemptNo++;
    const token = ++this.connectToken;
    const mine = () => this.connectToken === token && !this.stopped;
    this.setState(this.wasConnected ? 'reconnecting' : 'connecting', { code: 'connecting', attempt: this.attemptNo });
    this.log('info', 'tiktok:' + this.uniqueId + ' — محاولة اتصال #' + this.attemptNo + ' (piratetok)');

    const client = this.clientFactory(this.uniqueId);
    this.client = client;
    this.bind(client, mine);

    try {
      await client.connect();
      if (!mine()) { try { client.disconnect(); } catch (e) { /* best-effort */ } return; }
      this.wasConnected = true;
      this.attemptNo = 0;
      this.failStreak = 0;
      this.log('info', 'tiktok:' + this.uniqueId + ' — متصل (piratetok)');
      this.setState('connected', {});
    } catch (err) {
      if (!mine()) return;
      this.client = null;
      this.handleFailure(classify(err));
    }
  }

  bind(client, mine) {
    client.on(EventType.chat, (data) => { if (mine()) this.broadcast({ messages: [buildComment(data)] }); });
    client.on(EventType.gift, (data) => {
      if (!mine()) return;
      // هدايا قابلة للتتابع (combo): نبث فقط عند انتهاء التتابع حتى لا تُحتسب مضاعفة بالألعاب
      // (نفس سياسة tiktok-server الحالية لمزوّد Euler).
      if (data.gift && data.gift.combo && !data.repeatEnd) return;
      this.broadcast({ messages: [buildGift(data)] });
    });
    client.on(EventType.follow, (data) => { if (mine()) this.broadcast({ messages: [buildFollow(data)] }); });
    client.on(EventType.like, (data) => { if (mine()) this.broadcast({ messages: [buildLike(data)] }); });
    client.on(EventType.roomUserSeq, (data) => { if (mine()) this.broadcast({ messages: [buildViewer(data.totalUser)] }); });
    client.on(EventType.liveEnded, () => { if (mine()) this.handleLiveEnded(); });
    // reconnecting: إعادة اتصال داخلية خاصة بـpiratetok-live-js نفسه (حتى 5 محاولات افتراضياً) —
    // شفافة من طرفنا، لا نغيّر الحالة المعروضة للعميل حتى لا تتقلّب الواجهة بلا داعٍ.
    client.on(EventType.reconnecting, () => {});
    // disconnected: استنفدت مكتبة piratetok-live-js محاولاتها الداخلية — الاتصال انقطع فعلياً
    // ونحتاج محاولة جديدة من طرفنا (عميل TikTokLiveClient جديد بالكامل).
    client.on(EventType.disconnected, () => { if (mine()) this.handleDropped(); });
    // المكتبة لا ترمي EventEmitter الافتراضي طالما فيه مستمع 'error' (راجع emitError بالمكتبة).
    client.on('error', () => {});
  }

  handleFailure(cls) {
    const kind = cls.kind;
    this.log(kind === 'offline' ? 'info' : 'warn', 'tiktok:' + this.uniqueId + ' — فشل الاتصال (' + kind + ')');
    if (kind === 'offline') {
      this.failStreak = 0;
      this.setState('not_live', { code: 'not_live' });
      this.scheduleRetry(NOT_LIVE_RETRY_MS);
      return;
    }
    if (kind === 'permanent') {
      this.setState('error', { code: cls.reason || 'user_not_found', fatal: true });
      this.scheduleRetry(PERMANENT_RETRY_MS);
      return;
    }
    // blocked | network: تراجع أسّي
    this.failStreak++;
    const delay = backoffDelay(this.failStreak, { baseMs: RETRY_BASE_MS, maxMs: RETRY_MAX_MS, rng: this.rng });
    this.setState(this.wasConnected ? 'reconnecting' : 'connecting', { code: 'retrying', attempt: this.attemptNo, retryInSec: Math.ceil(delay / 1000) });
    this.scheduleRetry(delay);
  }

  handleDropped() {
    this.client = null;
    this.failStreak++;
    const delay = backoffDelay(this.failStreak, { baseMs: RETRY_BASE_MS, maxMs: RETRY_MAX_MS, rng: this.rng });
    this.log('info', 'tiktok:' + this.uniqueId + ' — انقطع الاتصال، إعادة محاولة بعد ' + Math.round(delay / 1000) + 'ث');
    this.setState('reconnecting', { code: 'retrying', reason: 'dropped', retryInSec: Math.ceil(delay / 1000) });
    this.scheduleRetry(delay);
  }

  handleLiveEnded() {
    try { this.client && this.client.disconnect(); } catch (e) { /* best-effort */ }
    this.client = null;
    this.failStreak = 0;
    this.setState('not_live', { code: 'not_live' });
    this.scheduleRetry(NOT_LIVE_RETRY_MS);
  }

  scheduleRetry(delay) {
    if (this.reconnectTimer) this.clearTimer(this.reconnectTimer);
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      if (!this.stopped && this.clients.size > 0) this.start();
    }, delay);
    if (this.reconnectTimer && this.reconnectTimer.unref) this.reconnectTimer.unref();
  }
}

// ---------------------------------------------------------------- خادم الجسر (تسجيل الغرف + ترقية WS)
export class LegacyBridgeServer {
  // verifyToken/onSession اختياريان: لو وصل توكن Firebase بالرابط (t=) وصحّ، تُسجَّل جلسة موثَّقة (uid + يوزر الغرفة)
  // لبوابة BATMISH. غياب التوكن أو فشله لا يغيّر سلوك الاتصال القديم إطلاقاً.
  constructor({ log = () => {}, isStreamerEnabled = async () => true, verifyToken = null, onSession = null } = {}) {
    this.log = log;
    this.isStreamerEnabled = isStreamerEnabled;
    this.verifyToken = verifyToken;
    this.onSession = onSession;
    this.rooms = new Map(); // uniqueId -> LegacyTikTokRoom
    this.wss = new WebSocketServer({ noServer: true });
  }

  getOrCreateRoom(uniqueId) {
    let room = this.rooms.get(uniqueId);
    if (!room) {
      room = new LegacyTikTokRoom(uniqueId, { log: this.log });
      room.onTeardown = () => this.rooms.delete(uniqueId);
      this.rooms.set(uniqueId, room);
    }
    return room;
  }

  // المرفوضات (4400/4403/4404) تُرسَل بعد إتمام مصافحة WS كاملة، لا برفض HTTP خام — الفرونت إند
  // (connectTikTok/tiktokOpenWS) يقرأ كود onclose المخصّص هذا تحديداً، تماماً كسلوك tiktok-server
  // الحالي (wss.on('connection') يكمل المصافحة دائماً ثم يقرر ws.close(كود) لاحقاً).
  async handleUpgrade(req, socket, head) {
    const url = new URL(req.url, 'http://localhost');
    const rawUser = (url.searchParams.get('u') || url.searchParams.get('uniqueId') || '').trim().replace(/^@/, '');

    if (!rawUser) {
      this.wss.handleUpgrade(req, socket, head, (ws) => closeSafely(ws, 4400, 'اكتب يوزر/رابط البث'));
      return;
    }
    let uniqueId;
    try {
      uniqueId = normalizeTikTokUsername(rawUser);
    } catch (e) {
      this.log('info', 'tiktok — يوزر بصيغة غير صالحة ("' + rawUser.slice(0, 40) + '")');
      const reason = e instanceof InvalidUsernameError ? e.message : 'يوزر غير صالح';
      this.wss.handleUpgrade(req, socket, head, (ws) => closeSafely(ws, 4404, reason));
      return;
    }

    const enabled = await this.isStreamerEnabled(uniqueId);
    if (socket.destroyed || !socket.writable) return; // العميل أغلق أثناء فحص التفعيل
    if (!enabled) {
      this.log('info', 'tiktok:' + uniqueId + ' — الاتصال مرفوض (الحساب معطّل من المالك)');
      this.wss.handleUpgrade(req, socket, head, (ws) => closeSafely(ws, 4403, 'هذا الحساب معطّل من إدارة المنصة'));
      return;
    }

    let authUser = null;
    const tok = url.searchParams.get('t') || '';
    if (tok && this.verifyToken && this.onSession) {
      try { authUser = await Promise.race([this.verifyToken(tok), new Promise((r) => setTimeout(() => r(null), 3000))]); } catch (e) { authUser = null; }
      if (socket.destroyed || !socket.writable) return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.log('info', 'tiktok:' + uniqueId + ' — عميل جديد اتصل (piratetok)');
      if (authUser && authUser.uid) { try { this.onSession(authUser.uid, uniqueId, ws); } catch (e) { /* لا يؤثر على الاتصال */ } }
      const room = this.getOrCreateRoom(uniqueId);
      room.addClient(ws);
      ws.on('close', (code) => { room.removeClient(ws, code); this.log('info', 'tiktok:' + uniqueId + ' — عميل انفصل (' + code + ')'); });
      ws.on('error', () => { room.removeClient(ws, 1006); });
    });
  }

  closeAll() {
    for (const room of this.rooms.values()) room.teardown();
    this.rooms.clear();
  }
}
