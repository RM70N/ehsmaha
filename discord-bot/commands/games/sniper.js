'use strict';

// /قناص — راوند ويب مرتبط بديسكورد (services/discordRounds). الأمر ينشئ الراوند ويرسل رابطه،
// والدخول واللعب والمشاهدة من الرابط (OAuth ديسكورد).

const { createRoundCommand } = require('../../services/discordRounds/command');

module.exports = createRoundCommand({
  gameType: 'sniper',
  name: 'قناص',
  description: '🔫 لعبة القناص — راوند ويب: قناص يصيد والباقين يختبئون بمربعات سرية'
});
