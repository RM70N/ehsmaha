'use strict';

// /قناة_اخبار_الادمن [قناة] [تعطيل] — (للإدارة) القناة اللي يوصلها ملخص كل تكت
// دعم ينقفل (من مساعد احسمها الذكي). بدون خيارات = يعرض الإعداد الحالي.
// + زر "أريد التحدث مع فريق الدعم" برسالة ترحيب المساعد بالتكت (ai:human:<ticketId>).

const { SlashCommandBuilder, InteractionContextType, ChannelType } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const store = require('../../database/botStore');
const aiAssistant = require('../../services/aiAssistant');
const { guardAdmin, withStorageNotice } = require('../../utils/adminPermissions');
const { missingBotPermissions, botPermissionsPayload } = require('../../utils/permissions');
const { logModeration } = require('../../utils/moderation');

const NAME = 'قناة_اخبار_الادمن';
const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

module.exports = {
  data: new SlashCommandBuilder()
    .setName(NAME)
    .setDescription('🛡️ (للإدارة) القناة اللي يوصلها ملخص المساعد الذكي لكل تكت ينقفل')
    .setContexts(InteractionContextType.Guild)
    .addChannelOption((o) => o.setName('قناة').setDescription('قناة أخبار الأدمن').setRequired(false).addChannelTypes(...TEXT_CHANNELS))
    .addBooleanOption((o) => o.setName('تعطيل').setDescription('يوقف إرسال ملخصات التكتات').setRequired(false)),

  async execute(interaction) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction))) return;
    const guild = interaction.guild;

    if (interaction.options.getBoolean('تعطيل') === true) {
      await store.guildSettings.update(guild.id, { admin_news_channel_id: null }, interaction.user.id);
      await logModeration({ guildId: guild.id, action: 'admin_news_disabled', moderatorId: interaction.user.id });
      return respond.send(interaction, withStorageNotice({ embeds: [eb.success('تم إيقاف ملخصات التكتات.', '📰 أخبار الأدمن')] }));
    }
    const picked = interaction.options.getChannel('قناة');
    if (!picked) {
      const s = await store.guildSettings.get(guild.id);
      return respond.send(interaction, {
        embeds: [eb.info(
          `📰 **القناة الحالية:** ${s.admin_news_channel_id ? `<#${s.admin_news_channel_id}>` : 'غير محددة'}\n\n` +
            'كل تكت دعم ينقفل يوصل ملخصه هنا (المشكلة، كيف تعامل معها المساعد، وهل انحلت).\n' +
            `للتحديد: \`/${NAME} قناة:#اخبار-الادمن\``,
          '📰 قناة أخبار الأدمن'
        )]
      });
    }
    const channel = guild.channels.cache.get(picked.id) || (await guild.channels.fetch(picked.id).catch(() => null));
    if (!channel) return respond.send(interaction, { embeds: [eb.error('ما قدرت أوصل للقناة.')] });
    const missing = missingBotPermissions(guild, ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles'], channel);
    if (missing.length) return respond.send(interaction, botPermissionsPayload(missing, channel.toString()));
    await store.guildSettings.update(guild.id, { admin_news_channel_id: channel.id }, interaction.user.id);
    await logModeration({ guildId: guild.id, action: 'admin_news_channel', moderatorId: interaction.user.id, channelId: channel.id });
    return respond.send(interaction, withStorageNotice({
      embeds: [eb.success(`ملخص كل تكت ينقفل بيوصل لـ${channel} 📋`, '📰 تم تحديد قناة أخبار الأدمن')]
    }));
  },

  buttons: {
    // ai:human:<ticketId>
    async ai(interaction, args) {
      if (!interaction.inGuild()) return undefined;
      if (args[0] === 'human') return aiAssistant.onHumanButton(interaction);
      return undefined;
    }
  }
};
