'use strict';

// /دول — "لعبة الدول" الجماعية (المحرّك بـservices/countriesGame.js، والأمر
// والأزرار من المصنع المشترك utils/gameCommand.js — نفس /روليت بالضبط).

const countries = require('../../services/countriesGame');
const { createGameCommand } = require('../../utils/gameCommand');

module.exports = createGameCommand(countries, {
  name: 'دول',
  description: '🌍 لعبة الدول — كل لاعب له دولة سرية، وآخر واحد يبقى يفوز'
});
