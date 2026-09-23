'use strict';

// أخطاء عميل discord.js العامة (مثلاً فشل WebSocket) — نسجلها فقط؛ المكتبة
// تتكفل بإعادة المحاولة وما نبي أي خطأ هنا يطيّح العملية.

const { Events } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  name: Events.Error,
  execute(ctx, error) {
    logger.error('Discord client error', { error });
  }
};
