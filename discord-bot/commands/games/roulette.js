'use strict';

// /روليت — لعبة "روليت الإقصاء" الجماعية (المحرّك بـservices/roulette.js،
// والأمر والأزرار من المصنع المشترك utils/gameCommand.js).

const roulette = require('../../services/roulette');
const { createGameCommand } = require('../../utils/gameCommand');

module.exports = createGameCommand(roulette, {
  name: 'روليت',
  description: '🎯 روليت الإقصاء — لعبة جماعية: آخر واحد يبقى يفوز'
});
