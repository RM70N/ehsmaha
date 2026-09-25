'use strict';

// /قناص — "لعبة القناص" الجماعية (المحرّك بـservices/sniperGame.js، واللوبي
// والأمر والأزرار من lobbyManager + utils/gameCommand.js — نفس /روليت و/دول).

const sniper = require('../../services/sniperGame');
const { createGameCommand } = require('../../utils/gameCommand');

module.exports = createGameCommand(sniper, {
  name: 'قناص',
  description: '🎯 لعبة القناص — اختبئ بمربع سري، والقناص عنده 4 دقائق يصيدكم'
});
