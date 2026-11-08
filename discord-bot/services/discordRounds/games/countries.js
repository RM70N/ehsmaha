'use strict';

// لعبة الدول (/دول) — كل لاعب يأخذ دولة سرية (ولا حتى هو يعرفها). صاحب الدور يختار دولة
// يقصيها من الدول الباقية (بدون أسماء لاعبين)، ولو طلعت دولته أقصى نفسه.
// السرية: خريطة (لاعب ← دولة) بحالة الخادم فقط، والعميل يستلم رموز عشوائية لكل دولة
// ما تكشف صاحبها. دولة اللاعب ما تنكشف إلا لحظة إقصائه (أو لفائز اللعبة بالنهاية).

const crypto = require('node:crypto');
const rules = require('../rules');
const { createElimination } = require('./elimination');

const ctry = (c) => (c ? { name: c.name, flag: c.flagEmoji, flagImageUrl: c.flagImageUrl } : null);

// الدول الباقية مرتبة أبجدياً (مستقل عن ترتيب اللاعبين) — ما يكشف مين صاحب أي دولة
function countriesLeft(round, keyName) {
  const g = round.game;
  return Object.entries(g.tokens)
    .filter(([, id]) => g.alive.includes(id))
    .map(([token, id]) => ({ [keyName]: token, ...ctry(g.countries[id]) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

const engine = createElimination({
  key: 'countries',
  selfPick: true,
  timings: { afterPickMs: 3500 },
  onStart(round, env) {
    const g = round.game;
    g.countries = rules.assignCountries(g.alive, env.countryList || rules.COUNTRIES, env.random); // playerId -> country (سري)
    g.tokens = {}; // رمز عشوائي -> playerId (سري)
    for (const id of g.alive) {
      let t;
      do t = crypto.randomBytes(4).toString('hex');
      while (g.tokens[t]);
      g.tokens[t] = id;
    }
  },
  publicExtra: (round) => ({ countriesLeft: countriesLeft(round, 'token'), selfPickAllowed: true }),
  choices: (round) => countriesLeft(round, 'value'),
  resolve: (round, value) => (round.game.tokens && round.game.tokens[String(value)]) || null,
  revealOf: (round, id) => ctry(round.game.countries && round.game.countries[id]),
  resultExtra(round) {
    const g = round.game;
    const w = g.alive.length === 1 ? g.alive[0] : null;
    return { winnerCountry: w ? ctry(g.countries[w]) : null };
  }
});

module.exports = {
  ...engine,
  key: 'countries',
  meta: {
    key: 'countries',
    command: '/دول',
    name: 'لعبة الدول',
    emoji: '🌍',
    minPlayers: 3,
    maxPlayers: 50,
    intro: 'كل لاعب يأخذ دولة سرية — حتى هو ما يعرف دولته! 🤫 الروليت يختار صاحب الدور، ويقصي دولة من الباقي. آخر دولة تبقى تفوز.'
  }
};
