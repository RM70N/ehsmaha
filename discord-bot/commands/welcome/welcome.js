'use strict';

// أوامر نظام الترحيب (للإدارة — checkAdminPermission):
//   /قناة_الترحيب [قناة] [قناة_الرسالة] [تعطيل]   تحديد قناة بطاقة الترحيب (والرسالة)
//   /تخصيص_رسالة_الترحيب [نص] [افتراضي]         نص رسالة المنشن ({يوزر} ← منشن العضو)
//   /تجربة_الترحيب                               يرسل ترحيب تجريبي لك بالقناة المحددة

const { SlashCommandBuilder, InteractionContextType, ChannelType } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const store = require('../../database/botStore');
const welcome = require('../../services/welcome');
const { guardAdmin, withStorageNotice } = require('../../utils/adminPermissions');
const { missingBotPermissions, botPermissionsPayload } = require('../../utils/permissions');
const { logModeration } = require('../../utils/moderation');

const CHANNEL = 'قناة_الترحيب';
const MESSAGE = 'تخصيص_رسالة_الترحيب';
const TEST = 'تجربة_الترحيب';
const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

const INTENT_NOTE =
  '\n\n⚠️ **Server Members Intent غير مفعّل** — البوت ما يدري إن أحد دخل السيرفر، فالترحيب التلقائي ما بيشتغل لين تفعّله:\n' +
  'discord.com/developers → تطبيق احسمها → **Bot** → فعّل **Server Members Intent** → Save.';

async function resolveChannel(guild, picked) {
  if (!picked) return null;
  return guild.channels.cache.get(picked.id) || (await guild.channels.fetch(picked.id).catch(() => null));
}

function describe(settings) {
  const ch = settings.welcome_channel_id ? `<#${settings.welcome_channel_id}>` : 'غير محددة';
  const msgCh = settings.welcome_message_channel_id ? `<#${settings.welcome_message_channel_id}>` : 'نفس قناة الصورة';
  return `🖼️ **قناة البطاقة:** ${ch}\n💬 **قناة رسالة المنشن:** ${msgCh}\n📝 **النص:** ${settings.welcome_message ? 'مخصّص' : 'الافتراضي'}`;
}

module.exports = {
  data: [
    new SlashCommandBuilder()
      .setName(CHANNEL)
      .setDescription('🛡️ (للإدارة) يحدد قناة الترحيب بالأعضاء الجدد (بطاقة + منشن)')
      .setContexts(InteractionContextType.Guild)
      .addChannelOption((o) => o.setName('قناة').setDescription('قناة بطاقة الترحيب').setRequired(false).addChannelTypes(...TEXT_CHANNELS))
      .addChannelOption((o) => o.setName('قناة_الرسالة').setDescription('(اختياري) قناة ثانية لرسالة المنشن — الافتراضي نفس القناة').setRequired(false).addChannelTypes(...TEXT_CHANNELS))
      .addBooleanOption((o) => o.setName('تعطيل').setDescription('يوقف الترحيب بالسيرفر').setRequired(false)),
    new SlashCommandBuilder()
      .setName(MESSAGE)
      .setDescription('🛡️ (للإدارة) يخصص نص رسالة الترحيب — {يوزر} يصير منشن للعضو')
      .setContexts(InteractionContextType.Guild)
      .addStringOption((o) => o.setName('نص').setDescription('مثال: نورت السيرفر يا {يوزر}! 🎉 (اكتب \\n لسطر جديد)').setRequired(false).setMaxLength(welcome.MAX_MESSAGE_LENGTH))
      .addBooleanOption((o) => o.setName('افتراضي').setDescription('يرجّع النص الافتراضي').setRequired(false)),
    new SlashCommandBuilder()
      .setName(TEST)
      .setDescription('🛡️ (للإدارة) يرسل ترحيب تجريبي باسمك بقناة الترحيب')
      .setContexts(InteractionContextType.Guild)
  ],

  async execute(interaction, ctx) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction))) return;
    const guild = interaction.guild;
    const intentNote = ctx && ctx.membersIntent === false ? INTENT_NOTE : '';

    // ---------- /قناة_الترحيب ----------
    if (interaction.commandName === CHANNEL) {
      if (interaction.options.getBoolean('تعطيل') === true) {
        await store.guildSettings.update(guild.id, { welcome_channel_id: null, welcome_message_channel_id: null }, interaction.user.id);
        await logModeration({ guildId: guild.id, action: 'welcome_disabled', moderatorId: interaction.user.id });
        return respond.send(interaction, withStorageNotice({ embeds: [eb.success('تم إيقاف الترحيب بالأعضاء الجدد.', '👋 الترحيب')] }));
      }
      const channel = await resolveChannel(guild, interaction.options.getChannel('قناة'));
      const msgChannel = await resolveChannel(guild, interaction.options.getChannel('قناة_الرسالة'));
      if (!channel) {
        const current = await store.guildSettings.get(guild.id);
        return respond.send(interaction, {
          embeds: [eb.info(`${describe(current)}\n\nللتحديد: \`/قناة_الترحيب قناة:#الترحيب\`${intentNote}`, '👋 إعدادات الترحيب')]
        });
      }
      const missing = missingBotPermissions(guild, ['ViewChannel', 'SendMessages', 'AttachFiles'], channel);
      if (missing.length) return respond.send(interaction, botPermissionsPayload(missing, channel.toString()));
      if (msgChannel) {
        const missingMsg = missingBotPermissions(guild, ['ViewChannel', 'SendMessages'], msgChannel);
        if (missingMsg.length) return respond.send(interaction, botPermissionsPayload(missingMsg, msgChannel.toString()));
      }
      const saved = await store.guildSettings.update(
        guild.id,
        { welcome_channel_id: channel.id, welcome_message_channel_id: msgChannel && msgChannel.id !== channel.id ? msgChannel.id : null },
        interaction.user.id
      );
      await logModeration({ guildId: guild.id, action: 'welcome_channel', moderatorId: interaction.user.id, channelId: channel.id });
      return respond.send(interaction, withStorageNotice({
        embeds: [eb.success(`${describe(saved)}\n\nجرّبه الحين بـ\`/تجربة_الترحيب\` ✨${intentNote}`, '👋 تم تحديد قناة الترحيب')]
      }));
    }

    // ---------- /تخصيص_رسالة_الترحيب ----------
    if (interaction.commandName === MESSAGE) {
      const reset = interaction.options.getBoolean('افتراضي') === true;
      const raw = interaction.options.getString('نص');
      if (!reset && !raw) {
        const current = await store.guildSettings.get(guild.id);
        return respond.send(interaction, {
          embeds: [eb.info(
            `**النص الحالي:**\n${current.welcome_message || welcome.DEFAULT_MESSAGE}\n\n**معاينة:**\n${welcome.formatMessage(current.welcome_message, interaction.member)}\n\n` +
              'المتغيرات: `{يوزر}` منشن العضو · `{السيرفر}` اسم السيرفر · `{العدد}` عدد الأعضاء',
            '📝 رسالة الترحيب'
          )],
          allowedMentions: { parse: [] }
        });
      }
      const text = reset ? null : raw.replace(/\\n/g, '\n').trim();
      if (!reset && !text) return respond.send(interaction, { embeds: [eb.warning('النص فاضي.')] });
      await store.guildSettings.update(guild.id, { welcome_message: text }, interaction.user.id);
      await logModeration({ guildId: guild.id, action: 'welcome_message', moderatorId: interaction.user.id, details: { reset } });
      const hint = text && !/\{(يوزر|user)\}/i.test(text) ? '\n\n💡 النص ما فيه `{يوزر}` — العضو ما بيتمنشن.' : '';
      return respond.send(interaction, withStorageNotice({
        embeds: [eb.success(`**معاينة:**\n${welcome.formatMessage(text, interaction.member)}${hint}`, reset ? '📝 رجع النص الافتراضي' : '📝 تم حفظ رسالة الترحيب')],
        allowedMentions: { parse: [] }
      }));
    }

    // ---------- /تجربة_الترحيب ----------
    const settings = await store.guildSettings.get(guild.id);
    if (!settings.welcome_channel_id) {
      return respond.send(interaction, { embeds: [eb.warning('حدد قناة الترحيب أول: `/قناة_الترحيب قناة:#الترحيب`')] });
    }
    const r = await welcome.welcomeMember(interaction.member, { settings });
    if (r.skipped === 'CHANNEL_MISSING') return respond.send(interaction, { embeds: [eb.error('قناة الترحيب انحذفت أو البوت ما يشوفها — حددها من جديد.')] });
    const lines = [
      `🖼️ البطاقة: ${r.image ? 'انرسلت ✅' : 'ما انرسلت ❌'}`,
      `💬 رسالة المنشن: ${r.text ? 'انرسلت ✅' : 'ما انرسلت ❌'}`
    ];
    if (r.errors.some((e) => e.startsWith('MISSING_PERMS'))) lines.push('🔧 البوت يحتاج صلاحية **إرفاق الملفات (Attach Files)** بقناة الترحيب.');
    return respond.send(interaction, {
      embeds: [(r.image && r.text ? eb.success : eb.warning)(`${lines.join('\n')}\nشوف <#${settings.welcome_channel_id}>${intentNote}`, '👋 تجربة الترحيب')]
    });
  }
};
