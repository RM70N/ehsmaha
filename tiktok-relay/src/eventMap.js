'use strict';
// صيغة الحدث الموحّدة الداخلية (القسم 4 من المهمة): {type, streamer, user:{id,name,avatar}, text|gift, ts}
export function buildEvent(type, streamer, extra) {
  return { type, streamer, ts: Date.now(), ...extra };
}

// حقول المستخدم مأخوذة من الكود المثبّت فعلياً، لمزوّدين مختلفين:
//   - piratetok-live-js (proto/schema.js): User.id، User.nickname، User.avatarThumb.urlList[0]
//   - tiktok-live-connector (مُتحقَّق منه بتعليقات tiktok-server/server.js): user.displayId/uniqueId،
//     user.nickname، user.avatarThumb/avatarMedium/avatarLarge.urlList
export function mapUser(u) {
  if (!u) return { id: '', name: '', avatar: '' };
  const id = u.displayId || u.uniqueId || u.id || u.userId || '';
  const name = u.nickname || u.displayId || u.uniqueId || '';
  let avatar = '';
  for (const field of ['avatarThumb', 'avatarMedium', 'avatarLarge']) {
    const list = u[field] && Array.isArray(u[field].urlList) ? u[field].urlList : [];
    const found = list.find((x) => typeof x === 'string' && x);
    if (found) { avatar = found; break; }
  }
  return { id: String(id), name: String(name), avatar };
}
