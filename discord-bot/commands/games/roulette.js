'use strict';

// /روليت — راوند ويب مرتبط بديسكورد (services/discordRounds). الأمر ينشئ الراوند ويرسل رابطه،
// والدخول واللعب والمشاهدة من الرابط (OAuth ديسكورد).

const { createRoundCommand } = require('../../services/discordRounds/command');

module.exports = createRoundCommand({
  gameType: 'roulette',
  name: 'روليت',
  description: '🎯 روليت الإقصاء — راوند ويب: الروليت يختار لاعب ويطرد واحد، وآخر واحد يفوز'
});
