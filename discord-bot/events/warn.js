'use strict';

const { Events } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  name: Events.Warn,
  execute(ctx, message) {
    logger.warn('Discord client warning', { detail: message });
  }
};
