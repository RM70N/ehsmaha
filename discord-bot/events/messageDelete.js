'use strict';

// أي رسالة تنحذف بالسيرفر ← تقرير بالخاص للمالك (services/deleteLog.js). يشتغل تلقائياً.

const { Events } = require('discord.js');
const deleteLog = require('../services/deleteLog');

module.exports = [
  {
    name: Events.MessageDelete,
    async execute(ctx, message) {
      await deleteLog.onDelete(ctx.client || (message && message.client), message);
    }
  },
  {
    name: Events.MessageBulkDelete,
    async execute(ctx, messages, channel) {
      await deleteLog.onBulk(ctx.client || (channel && channel.client), messages, channel);
    }
  }
];
