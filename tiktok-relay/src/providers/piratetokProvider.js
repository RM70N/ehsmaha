'use strict';
// مزوّد أساسي: piratetok-live-js — بلا خادم توقيع ولا مفتاح API.
// أسماء الأحداث والأخطاء هنا مأخوذة من الحزمة المثبّتة فعلياً (dist/index.d.ts، dist/http/api.d.ts،
// dist/proto/schema.js) لا من التخمين.
import {
  TikTokLiveClient,
  EventType,
  HostNotOnlineError,
  UserNotFoundError,
  TikTokBlockedError,
  DeviceBlockedError,
  TikTokApiError,
  InvalidResponseError,
  SessionRequiredError,
} from 'piratetok-live-js';
import { buildEvent, mapUser } from '../eventMap.js';

export const name = 'piratetok';

// الأحداث التي نحوّلها لصيغتنا الموحّدة؛ الباقي (64 حدثاً) يصل لكن لا نحوّله حالياً — لا نفقد شيئاً،
// فقط لا نخرّط أحداثاً ثانوية غير مطلوبة بالقسم 4 من المهمة.
const CHAT = EventType.chat;
const GIFT = EventType.gift;
const LIKE = EventType.like;
const FOLLOW = EventType.follow;
const SHARE = EventType.share;
const JOIN = EventType.join;
const LIVE_ENDED = EventType.liveEnded;

// يصنّف خطأ الحزمة إلى: offline (مو مباشر) | permanent (يوزر غير موجود) | blocked (حظر/معدّل) | network (غير ذلك)
export function classify(err) {
  if (err instanceof HostNotOnlineError) return { kind: 'offline' };
  if (err instanceof UserNotFoundError) return { kind: 'permanent', reason: 'user_not_found' };
  if (err instanceof TikTokBlockedError) return { kind: 'blocked', statusCode: err.statusCode };
  if (err instanceof DeviceBlockedError) return { kind: 'blocked', reason: 'device_blocked' };
  if (err instanceof SessionRequiredError) return { kind: 'permanent', reason: 'session_required' };
  if (err instanceof TikTokApiError || err instanceof InvalidResponseError) return { kind: 'network', reason: err.message };
  return { kind: 'network', reason: err && err.message };
}

// واجهة المزوّد: connect(username, {onEvent}) -> Promise<{disconnect()}>
// onEvent(unifiedEvent) يُستدعى لكل حدث موحّد. يرمي عند الفشل (يُصنَّف عبر classify أعلاه).
export async function connect(username, { onEvent } = {}) {
  const client = new TikTokLiveClient(username);

  client.on(CHAT, (data) => onEvent && onEvent(buildEvent('chat', username, { user: mapUser(data.user), text: data.content || '' })));
  client.on(GIFT, (data) => {
    // الهدايا القابلة للتتابع (combo) ترسل عدة أحداث؛ نبث عند انتهاء التتابع فقط (repeatEnd) حتى لا
    // تُحتسب الهدية مضاعفة — نفس سياسة tiktok-server الحالية لمزوّد Euler.
    if (data.gift && data.gift.combo && !data.repeatEnd) return;
    const diamonds = (data.gift && data.gift.diamondCount) || 0;
    onEvent && onEvent(buildEvent('gift', username, {
      user: mapUser(data.user),
      gift: { id: String((data.gift && data.gift.id) ?? data.giftId ?? ''), name: (data.gift && data.gift.name) || '', count: data.repeatCount || 1, diamonds: diamonds * (data.repeatCount || 1) },
    }));
  });
  client.on(LIKE, (data) => onEvent && onEvent(buildEvent('like', username, { user: mapUser(data.user), count: data.count || 1, total: Number(data.total || 0) })));
  client.on(FOLLOW, (data) => onEvent && onEvent(buildEvent('follow', username, { user: mapUser(data.user) })));
  client.on(SHARE, (data) => onEvent && onEvent(buildEvent('share', username, { user: mapUser(data.user) })));
  client.on(JOIN, (data) => onEvent && onEvent(buildEvent('join', username, { user: mapUser(data.user) })));
  client.on(LIVE_ENDED, () => onEvent && onEvent(buildEvent('liveEnded', username, {})));
  // أخطاء غير متوقعة أثناء البث (بعد نجاح الاتصال) — EventEmitter يرمي لو ما فيه مستمع 'error'،
  // فنسجّلها فقط دون رمي.
  client.on('error', () => {});

  await client.connect(); // يرمي الأخطاء المصنَّفة أعلاه لو فشل (غير مباشر/غير موجود/حظر/عطل)
  return {
    disconnect() { try { client.disconnect(); } catch (e) { /* best-effort */ } },
  };
}
