'use strict';

// أسماء المجموعات بمكان واحد.
//
// ─── مجموعات الموقع القائمة (قراءة فقط من هذي الطبقة) ───
//   usernames/{usernameLower}   { uid } — فهرس اليوزرات (فريد، أحرف صغيرة)
//   users/{uid}                 username, usernameLower, createdAt, onlinePoints,
//                               soloWinCount, onlineWinCount, linkedTiktok*, bestRoundPoints
//   levels/{key}                xp, level, roundsPlayed, gamesPlayCount, activityLog,
//                               avatar, username, updatedAt  (key = levelsKey(يوزر))
//   leaderboards/{streamer}     { [viewerId]: { nickname, wins, games } }
//   streamerEvents/{id}         فعاليات "أفضل ستريمر" (status: active/ended)
//   event100/current            فعالية "عدد جديد"
//
// ─── مجموعات خاصة بالبوت (تكتبها هذي الطبقة فقط) ───
//   discordApiStats/{YYYY-MM-DD}                   عدّادات استدعاءات الـAPI اليومية
//   discordWeeklyBaselines/{weekKey}(/chunks/{n})  لقطة XP بداية كل أسبوع (للمتصدرين الأسبوعي)
//
// Firestore بلا مخطط (schemaless)، فما فيه migrations؛ وكل الاستعلامات المستخدمة
// على حقل واحد فقط، فتغطيها الفهارس التلقائية بدون أي Composite Index يدوي.

module.exports = Object.freeze({
  USERS: 'users',
  USERNAMES: 'usernames',
  LEVELS: 'levels',
  LEADERBOARDS: 'leaderboards',
  STREAMER_EVENTS: 'streamerEvents',
  EVENT100: 'event100',
  DISCORD_API_STATS: 'discordApiStats',
  DISCORD_WEEKLY_BASELINES: 'discordWeeklyBaselines'
});
