'use strict';
// بديل tiktok-live-connector للاختبار فقط — يُحقن مكان المكتبة الحقيقية قبل
// تحميل tiktok-server/server.js (راجع start-server.js). كل شيء آخر بالسيرفر
// يشتغل كما هو (الغرف، الحالات، التراجع، الـWebSocket).
//
// الدقة: أحداث الشات تُبنى بترميز Protobuf حقيقي ثم فكّه بنفس تعريفات المكتبة
// (WebcastChatMessage.encode/decode)، فالكائن اللي يوصل للسيرفر مطابق لشكل
// ما تطلقه المكتبة الحقيقية بحدث 'chat' (processDecodedData ← emit('chat', data)).
const path = require('path');
const EventEmitter = require('events');
const real = require(path.join(__dirname, '../../tiktok-server/node_modules/tiktok-live-connector'));

const ctl = {
  // live | not_live | rate_limited | user_not_found | fail | hang
  // + أخطاء 2.5.0 بأصنافها الحقيقية: rate_limited_typed | sign_failed | composite_blocked
  //   | composite_no_room | composite_not_found | quick_drop (يتصل ثم ينقطع بعد 100ms)
  defaultMode: 'live',
  mode: {},                // uniqueId -> mode
  connectDelayMs: 0,
  connectCalls: 0,
  connectCallsByUser: {},
  connectTimesByUser: {},  // uniqueId -> [ms منذ الإقلاع لكل استدعاء connect()] لقياس التراجع
  live: new Set(),         // الاتصالات upstream المفتوحة فعلياً
  signOptions: [],
};

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

class TikTokLiveConnection extends EventEmitter {
  constructor(uniqueId, options) {
    super();
    this.uniqueId = String(uniqueId).toLowerCase();
    this.options = options || {};
    this.isConnected = false;
    ctl.signOptions.push(!!this.options.signApiKey);
  }

  async connect() {
    ctl.connectCalls++;
    ctl.connectCallsByUser[this.uniqueId] = (ctl.connectCallsByUser[this.uniqueId] || 0) + 1;
    (ctl.connectTimesByUser[this.uniqueId] = ctl.connectTimesByUser[this.uniqueId] || []).push(Date.now());
    if (ctl.connectDelayMs) await wait(ctl.connectDelayMs);
    const mode = ctl.mode[this.uniqueId] || ctl.defaultMode;
    if (mode === 'hang') return new Promise(() => {});
    if (mode === 'not_live') throw new real.UserOfflineError('The requested user isn\'t online :(');
    // نص الاستثناء القديم اللي كانت ترميه 2.4.x عند 429 (باگ retry-after) — السيرفر ما زال يفهمه
    if (mode === 'rate_limited') throw new Error("Cannot read properties of undefined (reading 'retry-after')");
    if (mode === 'user_not_found') throw new Error('Failed to retrieve room id from page source. User not found');
    if (mode === 'fail') throw new Error('Websocket connection failed');
    // نفس ما ترميه fetchSignedWebSocketFromEulerRoute عند 429 (response.headers فيها retry-after بالثواني)
    if (mode === 'rate_limited_typed') throw new real.SignatureRateLimitError(null, 'Too many connections started, try again later.', { headers: { 'retry-after': String(ctl.retryAfterSec || 45) } });
    if (mode === 'sign_failed') throw new real.SignAPIError('Empty Cookies', undefined, undefined, '[fetchSignedWebSocketFromEulerRoute] No cookies received from sign server.');
    const composite = (errs) => new real.InvalidResponseCompositeError({ routeId: 'fetchRoomIdRoute', requestErrs: errs }, 'Failed to retrieve Room ID from all sources.');
    if (mode === 'composite_blocked') throw composite([new Error('[fetchRoomInfoHtmlRoute] Failed to extract the SIGI_STATE HTML tag, you might be blocked by TikTok.'), new Error('[fetchRoomInfoApiLiveRoute] Invalid response from API: {}'), new Error('[fetchRoomIdRoute] Failed to retrieve Room ID from Euler due to an error: Unauthorized')]);
    if (mode === 'composite_no_room') throw composite([new Error('[fetchRoomIdRoute] Failed to extract Room ID from HTML.'), new Error('[fetchRoomIdRoute] Failed to extract Room ID from API.'), new Error('[fetchRoomIdRoute] Failed to extract Room ID from Euler.')]);
    if (mode === 'composite_not_found') throw composite([new Error('[fetchRoomInfoHtmlRoute] Failed to extract the LiveRoom object from SIGI_STATE.'), new Error('[fetchRoomInfoApiLiveRoute] API Error 19881007 (user_not_found)')]);
    if (mode === 'quick_drop') {
      this.isConnected = true; ctl.live.add(this);
      setImmediate(() => this.emit(real.ControlEvent.CONNECTED, { isConnected: true, roomId: '1' }));
      setTimeout(() => { if (!this.isConnected) return; this.isConnected = false; ctl.live.delete(this); this.emit(real.ControlEvent.DISCONNECTED, { code: 1006, reason: '' }); }, 100);
      return { isConnected: true };
    }
    this.isConnected = true;
    ctl.live.add(this);
    setImmediate(() => this.emit(real.ControlEvent.CONNECTED, { isConnected: true, roomId: '1' }));
    return { isConnected: true };
  }

  async disconnect() {
    if (!this.isConnected) return;
    this.isConnected = false;
    ctl.live.delete(this);
    this.emit(real.ControlEvent.DISCONNECTED, { code: 1000, reason: 'client' });
  }
}

function connsFor(user) {
  user = String(user).toLowerCase();
  return [...ctl.live].filter((c) => c.uniqueId === user);
}

// identity: undefined = الحقل غائب (غير معروف) | {isFollowerOfAnchor, isMutualFollowingWithAnchor}
// رسالة Protobuf بقيمها الافتراضية الكاملة (decode لبفر فاضي) — encode يحتاج
// كل الحقول الرقمية (int64) معرّفة.
const empty = (T) => T.decode(new Uint8Array(0));

// avatars (اختياري): { avatarThumb: [...], avatarMedium: [...], ... } لاختبار اختيار الأفتار.
function buildUser({ viewer, nickname, followStatus, avatars }) {
  const user = empty(real.User);
  user.displayId = viewer;
  user.nickname = nickname || viewer;
  user.followInfo = Object.assign(empty(real.FollowInfo), { followStatus: String(followStatus == null ? 0 : followStatus) });
  const lists = avatars || { avatarThumb: ['https://example.invalid/' + viewer + '.webp'] };
  for (const field of Object.keys(lists)) user[field] = Object.assign(empty(real.ImageModel), { urlList: lists[field] });
  return user;
}

function buildChat({ viewer, nickname, text, identity, followStatus, avatars }) {
  const user = buildUser({ viewer, nickname, followStatus, avatars });
  const msg = empty(real.WebcastChatMessage);
  msg.user = user;
  msg.content = text;
  if (identity) msg.userIdentity = Object.assign(empty(real.UserIdentity), identity);
  const bytes = real.WebcastChatMessage.encode(msg).finish();
  return real.WebcastChatMessage.decode(bytes);
}

ctl.chat = function (streamer, chat) {
  const conns = connsFor(streamer);
  const data = buildChat(chat);
  conns.forEach((c) => c.emit(real.WebcastEvent.CHAT, data));
  return conns.length;
};
// هدية بترميز Protobuf حقيقي (WebcastGiftMessage) — نهاية تتابع مباشرة (repeatEnd=1)
ctl.gift = function (streamer, { viewer, nickname, avatars, giftName, diamondCount, repeatCount }) {
  const conns = connsFor(streamer);
  const msg = empty(real.WebcastGiftMessage);
  msg.user = buildUser({ viewer, nickname, avatars });
  msg.gift = Object.assign(empty(real.Gift), { name: giftName || 'Rose', diamondCount: diamondCount || 1, type: 1 });
  msg.repeatCount = repeatCount || 1;
  msg.repeatEnd = 1;
  const data = real.WebcastGiftMessage.decode(real.WebcastGiftMessage.encode(msg).finish());
  conns.forEach((c) => c.emit(real.WebcastEvent.GIFT, data));
  return conns.length;
};
ctl.follow = function (streamer, viewer) {
  const conns = connsFor(streamer);
  conns.forEach((c) => c.emit(real.WebcastEvent.FOLLOW, { user: { displayId: viewer, nickname: viewer } }));
  return conns.length;
};
// انقطاع upstream (تيك توك قطع) — السيرفر يفترض يعيد الاتصال بنفسه
ctl.dropUpstream = function (streamer) {
  const conns = connsFor(streamer);
  conns.forEach((c) => { c.isConnected = false; ctl.live.delete(c); c.emit(real.ControlEvent.DISCONNECTED, { code: 1006 }); });
  return conns.length;
};
ctl.streamEnd = function (streamer) {
  const conns = connsFor(streamer);
  conns.forEach((c) => { c.emit(real.WebcastEvent.STREAM_END, { action: 3 }); c.disconnect(); });
  return conns.length;
};

module.exports = Object.assign({}, real, { TikTokLiveConnection, __ctl: ctl, __buildChat: buildChat });
