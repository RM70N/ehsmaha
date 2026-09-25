'use strict';

// "روليت الإقصاء" — مبنية على المحرّك المشترك services/eliminationGame.js
// (اللوبي، العداد، الدوران، المهلات، المغادرة، وتنظيف المؤقتات كلها هناك).
// هنا بس نصوص اللعبة: الروليت يختار لاعب، وهذا اللاعب يطرد واحد غيره.

const { createEliminationGame, displayName } = require('./eliminationGame');

module.exports = createEliminationGame({
  key: 'roulette',
  logName: 'روليت',
  prefix: 'rt',
  command: '/روليت',
  title: '🎯 روليت الإقصاء',
  wheelTitle: '🎡 روليت الإقصاء',
  lobbyIntro: 'اضغط **انضمام** وادخل الروليت! كل جولة يدور ويختار لاعب، واللاعب المختار يطرد واحد — **آخر واحد يبقى يفوز 🏆**',
  allowSelfPick: false,
  optionEmoji: '👢',
  pickPlaceholder: 'اختر اللاعب اللي تبي تطرده',
  choosePrompt: () => 'اختر مين تطرد من القائمة تحت',
  pickNote: (game, by, target) => `💥 **${displayName(by)}** طرد **${displayName(target)}** من الروليت!`,
  orderLine: (game, e, i) =>
    `\`${i + 1}\` ${displayName(e)}${e.by ? ` — طرده ${displayName(e.by)}` : e.reason === 'left' ? ' — طلع من السيرفر' : ''}`,
  winnerTitle: '🏆 روليت الإقصاء — عندنا فائز!',
  winnerText: (game, w) => `🎉 مبروك <@${w.id}>! صمدت لآخر الروليت وفزت باللعبة 👑\n\nالعب ألعاب أكثر على ehsmaha.com`
});
