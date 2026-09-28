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
  defaultMode: 'live',     // live | not_live | rate_limited | user_not_found | fail | hang
  mode: {},                // uniqueId -> mode
  connectDelayMs: 0,
  connectCalls: 0,
  connectCallsByUser: {},
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
    if (ctl.connectDelayMs) await wait(ctl.connectDelayMs);
    const mode = ctl.mode[this.uniqueId] || ctl.defaultMode;
    if (mode === 'hang') return new Promise(() => {});
    if (mode === 'not_live') throw new real.UserOfflineError('The requested user isn\'t online :(');
    // نفس نص الاستثناء اللي ترميه 2.4.x عند 429 (راجع تعليق السيرفر عن باگ retry-after)
    if (mode === 'rate_limited') throw new Error("Cannot read properties of undefined (reading 'retry-after')");
    if (mode === 'user_not_found') throw new Error('Failed to retrieve room id from page source. User not found');
    if (mode === 'fail') throw new Error('Websocket connection failed');
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

function buildChat({ viewer, nickname, text, identity, followStatus }) {
  const user = empty(real.User);
  user.displayId = viewer;
  user.nickname = nickname || viewer;
  user.followInfo = Object.assign(empty(real.FollowInfo), { followStatus: String(followStatus == null ? 0 : followStatus) });
  user.avatarThumb = Object.assign(empty(real.ImageModel), { urlList: ['https://example.invalid/' + viewer + '.webp'] });
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
