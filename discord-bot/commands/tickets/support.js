'use strict';

// /دعم قناة:<قناة> رسالة:<نص> — ينشر لوحة الدعم (Embed + زر "افتح التكت") بالقناة.
// الزر يحمل معرّف اللوحة المرجعي (tk:open:<panelId>) المحفوظ بقاعدة البيانات،
// فيشتغل دائماً حتى بعد إعادة تشغيل البوت. باقي التدفق بـservices/tickets.js.
// اكتب \n داخل الرسالة لسطر جديد.

const { SlashCommandBuilder, InteractionContextType, ChannelType } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const logger = require('../../utils/logger');
const store = require('../../database/botStore');
const tickets = require('../../services/tickets');
const { guardAdmin, withStorageNotice } = require('../../utils/adminPermissions');
const { missingBotPermissions, botPermissionsPayload } = require('../../utils/permissions');
const { logModeration } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('دعم')
    .setDescription('🛡️ (للإدارة) ينشر لوحة تذاكر الدعم بقناة')
    .setContexts(InteractionContextType.Guild)
    .addChannelOption((o) => o.setName('قناة').setDescription('القناة اللي تنحط فيها لوحة الدعم').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((o) => o.setName('رسالة').setDescription('نص اللوحة (اكتب \\n لسطر جديد)').setRequired(true).setMaxLength(1500)),

  async execute(interaction) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction))) return;

    const guild = interaction.guild;
    const picked = interaction.options.getChannel('قناة', true);
    const channel = guild.channels.cache.get(picked.id) || (await guild.channels.fetch(picked.id).catch(() => null));
    if (!channel || typeof channel.send !== 'function') return respond.send(interaction, { embeds: [eb.warning('ما أقدر أرسل لهذي القناة.')] });
    const content = interaction.options.getString('رسالة', true).replace(/\\n/g, '\n').trim();

    // صلاحيات النشر بالقناة + صلاحيات إنشاء التكتات لاحقاً (نفحصها الحين بدل ما تفشل التكتات عند الأعضاء)
    const missingHere = missingBotPermissions(guild, ['ViewChannel', 'SendMessages', 'EmbedLinks'], channel);
    if (missingHere.length) return respond.send(interaction, botPermissionsPayload(missingHere, channel.toString()));
    const missingTickets = missingBotPermissions(guild, tickets.TICKET_BOT_PERMS);
    if (missingTickets.length) return respond.send(interaction, botPermissionsPayload(missingTickets, 'السيرفر (لإنشاء رومات التكتات)'));

    const panelId = await store.tickets.createPanel({ guildId: guild.id, channelId: channel.id, content, createdBy: interaction.user.id });
    let message;
    try {
      message = await channel.send(tickets.panelMessage(panelId, content));
    } catch (err) {
      await store.tickets.deletePanel(panelId).catch(() => {});
      logger.error('تعذّر نشر لوحة الدعم', { guildId: guild.id, channelId: channel.id, code: err.code });
      return respond.send(interaction, { embeds: [eb.error('تعذّر نشر اللوحة بالقناة — تأكد من صلاحيات البوت فيها.')] });
    }
    await store.tickets.setPanelMessage(panelId, message.id);
    await logModeration({ guildId: guild.id, action: 'ticket_panel', moderatorId: interaction.user.id, channelId: channel.id, details: { panelId, messageId: message.id } });

    const supportIds = await tickets.getSupportRoleIds(guild);
    return respond.send(interaction, withStorageNotice({
      embeds: [
        eb.success(
          `تم نشر لوحة الدعم في ${channel} ✅ ([فتح الرسالة](${message.url}))\n\n` +
            (supportIds.length
              ? `رتب الدعم الحالية: ${supportIds.map((id) => `<@&${id}>`).join(' ')}`
              : '⚠️ ما فيه رتب دعم مضبوطة بعد — التكتات بيشوفها صاحبها والإدارة فقط. اضبطها بـ`/اعداد_رتب_الدعم`.'),
          '🎫 لوحة الدعم'
        )
      ]
    }));
  },

  // كل أزرار/قوائم التكتات (tk:open / tk:reason / tk:close / tk:cfy / tk:cfn)
  buttons: {
    tk: (interaction, args) => tickets.handleComponent(interaction, args)
  }
};
