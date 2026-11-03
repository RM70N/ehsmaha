'use strict';
// مزوّد احتياطي: tiktok-live-connector، بلا مفتاح API (الطبقة المجانية العامة لخادم Euler الافتراضي
// — لا نضع signApiKey ولا eulerApiInstance، فتستخدم المكتبة إعدادها الافتراضي العام). يُفعَّل فقط
// عند ENABLE_FALLBACK=1 وفتح قاطع المزوّد الأساسي. أسماء الأصناف وحقول البيانات هنا من
// tiktok-live-connector@2.5.0 المثبّتة فعلياً في tiktok-server، مطابقة لتعليقات التحقق الفعلي
// الموجودة في tiktok-server/server.js (buildTikTokComment/buildTikTokGift/buildTikTokLike).
import {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent,
  UserOfflineError,
  InvalidUniqueIdError,
  SignatureRateLimitError,
  PremiumFeatureError,
  ConnectTimeoutError,
  SignAPIError,
} from 'tiktok-live-connector';
import { buildEvent, mapUser } from '../eventMap.js';

export const name = 'euler-free';

export function classify(err) {
  if (err instanceof UserOfflineError) return { kind: 'offline' };
  if (err instanceof InvalidUniqueIdError) return { kind: 'permanent', reason: 'user_not_found' };
  if (err instanceof SignatureRateLimitError) return { kind: 'blocked', retryAfterMs: Number(err.retryAfter) || 0 };
  if (err instanceof PremiumFeatureError) return { kind: 'blocked', reason: 'premium_feature' };
  if (err instanceof ConnectTimeoutError) return { kind: 'network', reason: 'timeout' };
  if (err instanceof SignAPIError) return { kind: 'network', reason: err.reason || err.message };
  return { kind: 'network', reason: err && err.message };
}

export async function connect(username, { onEvent } = {}) {
  // لا apiKey ولا eulerApiInstance عمداً: الطبقة المجانية العامة، بلا أي توثيق حساب.
  const conn = new TikTokLiveConnection(username, { processInitialData: false });

  // data.content (مو comment) — راجع تعليق buildTikTokComment في tiktok-server/server.js
  conn.on(WebcastEvent.CHAT, (data) => onEvent && onEvent(buildEvent('chat', username, { user: mapUser(data.user), text: data.content || '' })));
  conn.on(WebcastEvent.GIFT, (data) => {
    const giftType = data.gift && data.gift.type;
    if (giftType === 1 && !data.repeatEnd) return; // تتابع هدية: نبث عند الانتهاء فقط
    const gift = data.gift || {};
    const diamonds = Number(gift.diamondCount) || 0;
    onEvent && onEvent(buildEvent('gift', username, {
      user: mapUser(data.user),
      gift: { id: String(data.giftId || 0), name: gift.name || 'هدية', count: data.repeatCount || 1, diamonds: diamonds * (data.repeatCount || 1) },
    }));
  });
  // data.count/data.total (مو likeCount/totalLikeCount) — راجع تعليق buildTikTokLike
  conn.on(WebcastEvent.LIKE, (data) => onEvent && onEvent(buildEvent('like', username, { user: mapUser(data.user), count: Number(data.count) || 0, total: Number(data.total) || 0 })));
  conn.on(WebcastEvent.FOLLOW, (data) => onEvent && onEvent(buildEvent('follow', username, { user: mapUser(data.user) })));
  conn.on(WebcastEvent.SHARE, (data) => onEvent && onEvent(buildEvent('share', username, { user: mapUser(data.user) })));
  conn.on(WebcastEvent.MEMBER, (data) => onEvent && onEvent(buildEvent('join', username, { user: mapUser(data.user) })));
  conn.on(WebcastEvent.STREAM_END, () => onEvent && onEvent(buildEvent('liveEnded', username, {})));
  conn.on(ControlEvent.ERROR, () => {});

  await conn.connect();
  return {
    disconnect() { try { conn.disconnect(); } catch (e) { /* best-effort */ } },
  };
}
