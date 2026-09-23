'use strict';

// رتب التحذير الثلاث (تحذير1/تحذير2/تحذير3 — أسماؤها من WARNING_ROLE_NAMES).
// تُبحث بالاسم بالسيرفر، ولو ناقصة تنشأ تلقائياً (بدون أي صلاحيات) إذا البوت
// يملك "إدارة الرتب". الرتب المنشأة تنحط تحت رتبة البوت تلقائياً فيقدر يمنحها.

const { PermissionsBitField } = require('discord.js');
const { loadConfig } = require('../config');
const logger = require('./logger');

const COLORS = [0xf5b301, 0xf97316, 0xef4444]; // ذهبي ← برتقالي ← أحمر

function findRole(guild, name) {
  const wanted = name.trim().toLowerCase();
  return guild.roles.cache.find((r) => r.name.trim().toLowerCase() === wanted) || null;
}

/**
 * يرجّع { roles: [r1, r2, r3], created: [names] } أو { error }
 */
async function ensureWarningRoles(guild) {
  const names = loadConfig().warningRoleNames;
  const roles = [];
  const created = [];
  for (let i = 0; i < names.length; i++) {
    let role = findRole(guild, names[i]);
    if (!role) {
      try {
        role = await guild.roles.create({
          name: names[i],
          color: COLORS[i],
          permissions: new PermissionsBitField(0n),
          mentionable: false,
          hoist: false,
          reason: 'رتب نظام التحذيرات لبوت احسمها'
        });
        created.push(names[i]);
        logger.info('أُنشئت رتبة تحذير', { guildId: guild.id, role: names[i] });
      } catch (err) {
        return { error: `رتبة **${names[i]}** غير موجودة، وتعذّر إنشاؤها تلقائياً. أنشئها يدوياً أو أعطِ البوت صلاحية **إدارة الرتب**.` };
      }
    }
    if (!role.editable) {
      return { error: `رتبة البوت لازم تكون **فوق** رتبة **${role.name}** حتى يقدر يمنحها ويزيلها — عدّل ترتيب الرتب من إعدادات السيرفر.` };
    }
    roles.push(role);
  }
  return { roles, created };
}

module.exports = { ensureWarningRoles };
