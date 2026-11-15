'use strict';

// رتبة تلقائية لكل عضو يدخل السيرفر. الرتبة من AUTO_ROLE_ID (افتراضياً رتبة احسمها الرسمية)، و`AUTO_ROLE_ID=off` يوقفها.
// البوت يتحقق قبل ما يعطي: الرتبة موجودة بهالسيرفر، عنده صلاحية إدارة الرتب، والرتبة أدنى من أعلى رتبة له (وإلا ديسكورد يرفض)،
// وما هي رتبة مدارة (بوت/اشتراك). أي فشل يتسجّل بسبب واضح ولا يوقف الترحيب ولا غيره.

const { PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');

const DEFAULT_ROLE_ID = '1552259562369851394';
const RETRY_DELAY_MS = 1500;

const roleIdFromEnv = () => {
  const raw = String(process.env.AUTO_ROLE_ID === undefined ? DEFAULT_ROLE_ID : process.env.AUTO_ROLE_ID).trim();
  if (!raw || ['off', 'false', '0', 'no'].includes(raw.toLowerCase())) return null;
  return /^\d{17,20}$/.test(raw) ? raw : null;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * يعطي العضو الجديد الرتبة. ما يرمي أبداً.
 * @returns {Promise<{ok:boolean, reason:string}>} reason: assigned | already | disabled | bot | no-role | no-permission | role-too-high | managed-role | failed
 */
async function assignOnJoin(member) {
  try {
    const roleId = roleIdFromEnv();
    if (!roleId) return { ok: false, reason: 'disabled' };
    if (!member || !member.guild || (member.user && member.user.bot)) return { ok: false, reason: 'bot' };
    const guild = member.guild;
    if (member.roles && member.roles.cache && member.roles.cache.has(roleId)) return { ok: true, reason: 'already' };

    const role = (guild.roles.cache && guild.roles.cache.get(roleId)) || (typeof guild.roles.fetch === 'function' ? await guild.roles.fetch(roleId).catch(() => null) : null);
    if (!role) {
      logger.debug('رتبة الدخول التلقائي غير موجودة بهذا السيرفر', { guildId: guild.id, roleId });
      return { ok: false, reason: 'no-role' };
    }
    if (role.managed) {
      logger.warn('رتبة الدخول التلقائي مدارة (بوت/اشتراك) — ما تنعطى يدوياً', { guildId: guild.id, roleId });
      return { ok: false, reason: 'managed-role' };
    }
    const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
    if (!me || !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      logger.warn('ما أقدر أعطي رتبة الدخول: ينقص البوت صلاحية إدارة الرتب (Manage Roles)', { guildId: guild.id, roleId });
      return { ok: false, reason: 'no-permission' };
    }
    if (me.roles.highest.position <= role.position) {
      logger.warn('ما أقدر أعطي رتبة الدخول: الرتبة أعلى من (أو مساوية) أعلى رتبة للبوت — ارفع رتبة البوت فوقها', { guildId: guild.id, roleId });
      return { ok: false, reason: 'role-too-high' };
    }

    const reason = 'رتبة تلقائية عند دخول السيرفر';
    try {
      await member.roles.add(role, reason);
    } catch (err) {
      if (err && err.code === 50013) {
        logger.warn('ديسكورد رفض إعطاء رتبة الدخول (صلاحيات)', { guildId: guild.id, roleId, code: err.code });
        return { ok: false, reason: 'no-permission' };
      }
      await sleep(RETRY_DELAY_MS); // خطأ مؤقت (شبكة/5xx): محاولة ثانية وحيدة
      await member.roles.add(role, reason);
    }
    logger.info('رتبة الدخول التلقائي انعطت', { guildId: guild.id, userId: member.id, roleId });
    return { ok: true, reason: 'assigned' };
  } catch (err) {
    logger.warn('تعذّر إعطاء رتبة الدخول التلقائي', { guildId: member && member.guild && member.guild.id, userId: member && member.id, error: err && err.message });
    return { ok: false, reason: 'failed' };
  }
}

module.exports = { assignOnJoin, roleIdFromEnv, DEFAULT_ROLE_ID };
