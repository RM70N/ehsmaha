'use strict';

// روليت الإقصاء (/روليت) — الروليت يختار لاعب، وهذا اللاعب يطرد واحد غيره خلال 15 ثانية.
// آخر واحد يبقى هو الفائز. الاختيار والقرعة من الخادم فقط.

const { createElimination } = require('./elimination');

const engine = createElimination({
  key: 'roulette',
  selfPick: false,
  timings: { afterPickMs: 2500 },
  choices: (round, chooserId) => round.game.alive.filter((id) => id !== chooserId).map((id) => ({ value: id })),
  resolve: (round, value) => (typeof value === 'string' ? value : null)
});

module.exports = {
  ...engine,
  key: 'roulette',
  meta: {
    key: 'roulette',
    command: '/روليت',
    name: 'روليت الإقصاء',
    emoji: '🎯',
    minPlayers: 3,
    maxPlayers: 25,
    intro: 'الروليت يدور ويختار لاعب، واللاعب المختار يطرد واحد غيره. آخر واحد يبقى يفوز.'
  }
};
