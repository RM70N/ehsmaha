'use strict';

// /مسح قناة:<قناة> عدد:<1-500> — حذف آخر رسائل قناة على دفعات.
//
// قيود ديسكورد: الحذف الجماعي حتى 100 رسالة بالطلب، وفقط رسائل أعمارها أقل
// من 14 يوم. فنقرأ الرسائل على دفعات 100، ونحذف الحديثة منها، ونعدّ القديمة
// (والرسائل غير القابلة للحذف مثل رسائل النظام) بشكل منفصل حتى يعرف المشرف
// بالضبط ليش ما انحذف جزء. تأخير 500ms بين الدفعات لتفادي Rate Limit.

const { SlashCommandBuilder, ChannelType, InteractionContextType } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const logger = require('../../utils/logger');
const { guardAdmin } = require('../../utils/adminPermissions');
const { missingBotPermissions, botPermissionsPayload } = require('../../utils/permissions');
const { logModeration } = require('../../utils/moderation');

const BATCH = 100;
const DELAY_MS = 500;
const BULK_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000 - 60 * 1000; // هامش دقيقة لفرق الساعات
const ERR_TOO_OLD = 50034; // "You can only bulk delete messages that are under 14 days old"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ينفّذ المسح ويرجّع ملخص دقيق.
 * @returns {Promise<{ requested, scanned, deleted, tooOld, undeletable, failed }>}
 */
async function purgeChannel(channel, requested) {
  const result = { requested, scanned: 0, deleted: 0, tooOld: 0, undeletable: 0, failed: 0 };
  let before;
  while (result.scanned < requested) {
    const limit = Math.min(BATCH, requested - result.scanned);
    const batch = await channel.messages.fetch({ limit, ...(before ? { before } : {}), cache: false });
    if (!batch.size) break;
    result.scanned += batch.size;
    before = batch.last().id;

    const cutoff = Date.now() - BULK_MAX_AGE_MS;
    const fresh = [];
    for (const m of batch.values()) {
      if (m.createdTimestamp <= cutoff) result.tooOld += 1;
      else if (m.deletable === false) result.undeletable += 1;
      else fresh.push(m);
    }

    if (fresh.length) {
      try {
        const deleted = await channel.bulkDelete(fresh, true);
        result.deleted += deleted.size;
        result.failed += fresh.length - deleted.size;
      } catch (err) {
        if (err && err.code === ERR_TOO_OLD) {
          // ديسكورد رفض الدفعة بسبب رسائل قديمة (حالة حدّية على مهلة الـ14 يوم)
          result.tooOld += fresh.length;
        } else {
          throw err;
        }
      }
    }

    if (batch.size < limit) break; // القناة خلصت
    if (result.scanned < requested) await sleep(DELAY_MS);
  }
  return result;
}

function summaryEmbed(channel, r) {
  const lines = [`تم حذف **${r.deleted}** رسالة من أصل **${r.requested}** مطلوبة في ${channel}.`];
  const notDeleted = r.requested - r.deleted;
  if (notDeleted > 0) {
    lines.push('', '**سبب اللي ما انحذف:**');
    if (r.tooOld) lines.push(`• ${r.tooOld} رسالة أقدم من 14 يوم — ديسكورد ما يسمح بحذفها جماعياً.`);
    if (r.undeletable) lines.push(`• ${r.undeletable} رسالة نظام غير قابلة للحذف.`);
    if (r.failed) lines.push(`• ${r.failed} رسالة تعذّر حذفها (غالباً انحذفت أثناء العملية).`);
    const missing = r.requested - r.scanned;
    if (missing > 0) lines.push(`• القناة ما فيها غير ${r.scanned} رسالة.`);
  }
  return notDeleted > 0 && r.deleted === 0
    ? eb.warning(lines.join('\n'), '🧹 المسح')
    : eb.success(lines.join('\n'), '🧹 تم المسح');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('مسح')
    .setDescription('🛡️ (للإدارة) يحذف آخر الرسائل من قناة (حتى 500 رسالة)')
    .setContexts(InteractionContextType.Guild)
    .addChannelOption((o) =>
      o
        .setName('قناة')
        .setDescription('القناة المراد مسح رسائلها')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.GuildVoice)
    )
    .addIntegerOption((o) => o.setName('عدد').setDescription('عدد الرسائل (1 - 500)').setRequired(true).setMinValue(1).setMaxValue(500)),

  async execute(interaction) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction))) return;

    const guild = interaction.guild;
    const picked = interaction.options.getChannel('قناة', true);
    const count = interaction.options.getInteger('عدد', true);
    if (!Number.isInteger(count) || count < 1 || count > 500) {
      return respond.send(interaction, { embeds: [eb.warning('العدد لازم يكون بين 1 و 500.')] });
    }
    const channel = guild.channels.cache.get(picked.id) || (await guild.channels.fetch(picked.id).catch(() => null));
    if (!channel || typeof channel.bulkDelete !== 'function') {
      return respond.send(interaction, { embeds: [eb.warning('هذي القناة ما تدعم مسح الرسائل.')] });
    }

    const missing = missingBotPermissions(guild, ['ViewChannel', 'ReadMessageHistory', 'ManageMessages'], channel);
    if (missing.length) return respond.send(interaction, botPermissionsPayload(missing, channel.toString()));

    let result;
    try {
      result = await purgeChannel(channel, count);
    } catch (err) {
      logger.error('فشل المسح', { guildId: guild.id, channelId: channel.id, code: err.code, error: err });
      const msg = err.code === 50013
        ? 'ديسكورد رفض الحذف — تأكد إن البوت يملك **إدارة الرسائل** بهذي القناة.'
        : 'حصل خطأ أثناء المسح، جرّب بعد قليل.';
      return respond.send(interaction, { embeds: [eb.error(msg)] });
    }

    await logModeration({
      guildId: guild.id,
      action: 'purge',
      moderatorId: interaction.user.id,
      channelId: channel.id,
      details: result
    });
    return respond.send(interaction, { embeds: [summaryEmbed(channel, result)] });
  },

  _internal: { purgeChannel, summaryEmbed }
};
