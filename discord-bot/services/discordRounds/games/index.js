'use strict';

// سجل ألعاب الراوندات. لإضافة لعبة جديدة: ملف بـ{ key, meta, start, tick, act, removePlayer,
// view, summary, nextDeadline } هنا + أمرها — بدون أي تعديل على المدير أو الواجهة الأساسية.

const countries = require('./countries');
const roulette = require('./roulette');
const sniper = require('./sniper');

const GAMES = { countries, roulette, sniper };

module.exports = { GAMES, get: (key) => GAMES[key] || null, keys: () => Object.keys(GAMES) };
