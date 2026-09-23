'use strict';

// نفس قائمة الإنجازات والشارات بالموقع (index.html → PROFILE_ACHIEVEMENTS)
// وبنفس شروطها بالضبط، محسوبة من بيانات اللاعب المدمجة.

const ACHIEVEMENTS = Object.freeze([
  { id: 'lvl5', name: 'الخطوة الأولى', icon: '🥉', check: (d) => d.level >= 5 },
  { id: 'lvl10', name: 'لاعب نشيط', icon: '🥈', check: (d) => d.level >= 10 },
  { id: 'lvl20', name: 'محترف', icon: '🥇', check: (d) => d.level >= 20 },
  { id: 'lvl30', name: 'أسطورة', icon: '👑', check: (d) => d.level >= 30 },
  { id: 'rounds10', name: 'بداية الطريق', icon: '🎮', check: (d) => d.roundsPlayed >= 10 },
  { id: 'rounds50', name: 'مدمن ألعاب', icon: '🕹️', check: (d) => d.roundsPlayed >= 50 },
  { id: 'rounds200', name: 'محترف الراوندات', icon: '🏆', check: (d) => d.roundsPlayed >= 200 },
  { id: 'solo5', name: 'بطل الفردي', icon: '⚔️', check: (d) => d.soloWinCount >= 5 },
  { id: 'solo20', name: 'أسطورة الفردي', icon: '🗡️', check: (d) => d.soloWinCount >= 20 },
  { id: 'online5', name: 'بطل الأونلاين', icon: '🌐', check: (d) => d.onlineWinCount >= 5 },
  { id: 'online20', name: 'أسطورة الأونلاين', icon: '💠', check: (d) => d.onlineWinCount >= 20 },
  { id: 'frames1', name: 'مزيّن', icon: '🖼️', check: (d) => d.ownedFramesCount >= 1 },
  { id: 'games3', name: 'متنوع', icon: '🎲', check: (d) => d.gamesVariety >= 3 },
  { id: 'games8', name: 'مستكشف الألعاب', icon: '🧭', check: (d) => d.gamesVariety >= 8 }
]);

function earnedAchievements(data) {
  const earned = ACHIEVEMENTS.filter((a) => a.check(data)).map(({ id, name, icon }) => ({ id, name, icon }));
  return { earned, total: ACHIEVEMENTS.length };
}

module.exports = { ACHIEVEMENTS, earnedAchievements };
