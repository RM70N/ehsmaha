'use strict';

// ردود آمنة على التفاعلات: تختار reply / editReply / followUp حسب حالة
// التفاعل، وتبلع أخطاء Discord المعروفة (تفاعل منتهي، رسالة محذوفة) بدل
// ما تتحول لاستثناء يوقف البوت.

const { MessageFlags } = require('discord.js');
const logger = require('./logger');

// أكواد Discord اللي معناها "ما عاد فيه تفاعل ترد عليه" — نتجاهلها بهدوء
const IGNORABLE_CODES = new Set([10062 /* Unknown interaction */, 40060 /* already acknowledged */, 10008 /* Unknown message */]);

function withEphemeral(payload, ephemeral) {
  const p = typeof payload === 'string' ? { content: payload } : { ...payload };
  if (ephemeral) p.flags = (p.flags || 0) | MessageFlags.Ephemeral;
  return p;
}

/**
 * يرد على التفاعل مهما كانت حالته.
 * ملاحظة: بعد deferReply ما يمكن تغيير خاصية ephemeral — تُحدد وقت الـdefer.
 */
async function send(interaction, payload, { ephemeral = false } = {}) {
  try {
    if (interaction.deferred && !interaction.replied) {
      const { flags, ...rest } = withEphemeral(payload, false);
      return await interaction.editReply(rest);
    }
    if (interaction.replied) {
      return await interaction.followUp(withEphemeral(payload, ephemeral));
    }
    return await interaction.reply(withEphemeral(payload, ephemeral));
  } catch (err) {
    if (IGNORABLE_CODES.has(err && err.code)) {
      logger.debug('Interaction no longer available', { code: err.code, id: interaction.id });
      return null;
    }
    throw err;
  }
}

// defer آمن — لو التفاعل انتهى قبل ما نوصله (نادر) نرجع false
async function defer(interaction, { ephemeral = false } = {}) {
  if (interaction.deferred || interaction.replied) return true;
  try {
    await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
    return true;
  } catch (err) {
    if (IGNORABLE_CODES.has(err && err.code)) return false;
    throw err;
  }
}

// deferUpdate للأزرار (يحدّث نفس الرسالة بدل رسالة جديدة)
async function deferUpdate(interaction) {
  if (interaction.deferred || interaction.replied) return true;
  try {
    await interaction.deferUpdate();
    return true;
  } catch (err) {
    if (IGNORABLE_CODES.has(err && err.code)) return false;
    throw err;
  }
}

module.exports = { send, defer, deferUpdate, IGNORABLE_CODES };
