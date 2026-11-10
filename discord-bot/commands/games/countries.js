'use strict';

// /دول — راوند ويب مرتبط بديسكورد (services/discordRounds). الأمر ينشئ الراوند ويرسل رابطه،
// والدخول واللعب والمشاهدة من الرابط (OAuth ديسكورد).

const { createRoundCommand } = require('../../services/discordRounds/command');

module.exports = createRoundCommand({
  gameType: 'countries',
  name: 'دول',
  description: '🌍 لعبة الدول — راوند ويب: كل لاعب له دولة سرية وآخر واحد يبقى يفوز'
});
