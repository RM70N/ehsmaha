'use strict';

// /اعداد_رتب_الدعم [رتبة1..رتبة5] [مسح] — رتب فريق الدعم اللي تشوف كل التكتات
// الجديدة وترد فيها. تُحفظ بجدول guild_config وتنطبق على كل تكت بعدها.
//   • بدون أي رتبة: يعرض الرتب الحالية.
//   • مسح:true: يمسح القائمة.

const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const store = require('../../database/botStore');
const tickets = require('../../services/tickets');
const { guardAdmin } = require('../../utils/adminPermissions');
const { logModeration } = require('../../utils/moderation');

const OPTION_NAMES = ['رتبة1', 'رتبة2', 'رتبة3', 'رتبة4', 'رتبة5'];

function rolesText(ids) {
  return ids.length ? ids.map((id) => `<@&${id}>`).join(' ') : 'لا يوجد';
}

module.exports = {
  data: (() => {
    const b = new SlashCommandBuilder()
      .setName('اعداد_رتب_الدعم')
      .setDescription('🛡️ (للإدارة) يحدد رتب فريق الدعم اللي تشوف التكتات (حتى 5 رتب)')
      .setContexts(InteractionContextType.Guild);
    OPTION_NAMES.forEach((n, i) => b.addRoleOption((o) => o.setName(n).setDescription(`رتبة دعم ${i + 1} (اختياري)`).setRequired(false)));
    b.addBooleanOption((o) => o.setName('مسح').setDescription('يمسح كل رتب الدعم الحالية').setRequired(false));
    return b;
  })(),

  async execute(interaction) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction))) return;

    const guild = interaction.guild;
    const clear = interaction.options.getBoolean('مسح') === true;
    const picked = OPTION_NAMES.map((n) => interaction.options.getRole(n)).filter(Boolean);

    if (clear) {
      await store.guildConfig.set(guild.id, tickets.SUPPORT_ROLES_KEY, [], interaction.user.id);
      await logModeration({ guildId: guild.id, action: 'support_roles_set', moderatorId: interaction.user.id, details: { roles: [] } });
      return respond.send(interaction, { embeds: [eb.success('تم مسح رتب الدعم — التكتات الجديدة بيشوفها صاحبها والإدارة فقط.', '🎫 رتب الدعم')] });
    }

    if (!picked.length) {
      const current = await tickets.getSupportRoleIds(guild);
      return respond.send(interaction, {
        embeds: [eb.info(`رتب الدعم الحالية: ${rolesText(current)}\n\nلتغييرها: \`/اعداد_رتب_الدعم رتبة1:@الدعم رتبة2:@المشرفين\``, '🎫 رتب الدعم')]
      });
    }

    const invalid = picked.filter((r) => r.id === guild.id || r.managed);
    if (invalid.length) {
      return respond.send(interaction, {
        embeds: [eb.error('ما يمكن استخدام **@everyone** أو رتب البوتات كرتب دعم — كذا الكل بيشوف تكتات غيره.', '⛔ مرفوض')]
      });
    }

    const ids = [...new Set(picked.map((r) => r.id))];
    await store.guildConfig.set(guild.id, tickets.SUPPORT_ROLES_KEY, ids, interaction.user.id);
    await logModeration({ guildId: guild.id, action: 'support_roles_set', moderatorId: interaction.user.id, details: { roles: ids } });
    return respond.send(interaction, {
      embeds: [eb.success(`رتب الدعم الحين: ${rolesText(ids)}\nبتنطبق تلقائياً على كل تكت جديد (تشوفه وترد فيه).`, '🎫 تم حفظ رتب الدعم')],
      allowedMentions: { parse: [] }
    });
  }
};
