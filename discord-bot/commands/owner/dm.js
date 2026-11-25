'use strict';

// /رسالة_خاصة — (لمالك البوت فقط) يرسل رسالة خاصة من البوت لأي شخص.
//   • الشخص: خيار «الى» (يختار عضو) أو «المعرف» (ID لأي حساب حتى لو مو بالسيرفر)، وبدون اختيار ← ترسل لنفسك.
//   • الأمر مخفي عن الأعضاء العاديين (صلاحية Administrator فقط للظهور)، والتحقق الحقيقي بالكود: هوية المالك.
//   • يشتغل بالسيرفر وبخاص البوت. نص الرسالة ما يتسجّل بأي سجل (بس طولها).

const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const logger = require('../../utils/logger');
const { isOwnerId } = require('../../services/ownerAI/ownerGuard');

const MAX = 2000;
const SNOWFLAKE = /^\d{17,20}$/;

const deny = (interaction) => respond.send(interaction, { embeds: [eb.error('هذا الأمر مخصص لمالك البوت فقط.')] }, { ephemeral: true });

module.exports = {
  data: new SlashCommandBuilder()
    .setName('رسالة_خاصة')
    .setDescription('✉️ (لمالك البوت فقط) أرسل رسالة خاصة من البوت لأي شخص — أو لنفسك')
    .setDefaultMemberPermissions(0n) // مخفي عن الجميع إلا Administrator؛ والتحقق الفعلي بالكود
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .addStringOption((o) => o.setName('الرسالة').setDescription('نص الرسالة').setRequired(true).setMaxLength(MAX))
    .addUserOption((o) => o.setName('الى').setDescription('الشخص (اتركه فاضي لترسل لنفسك)').setRequired(false))
    .addStringOption((o) => o.setName('المعرف').setDescription('معرّف (ID) حساب — لشخص مو بالسيرفر').setRequired(false).setMaxLength(20))
    .addBooleanOption((o) => o.setName('بإطار').setDescription('إرسالها داخل إطار البوت بدل نص عادي').setRequired(false)),

  async execute(interaction) {
    if (!isOwnerId(interaction.user.id)) {
      logger.warn('محاولة استخدام /رسالة_خاصة من غير المالك', { userId: interaction.user.id, guildId: interaction.guildId });
      return deny(interaction);
    }
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;

    const text = String(interaction.options.getString('الرسالة', true)).trim();
    if (!text) return respond.send(interaction, { embeds: [eb.warning('اكتب نص الرسالة.')] });
    const pickedUser = interaction.options.getUser('الى');
    const rawId = (interaction.options.getString('المعرف') || '').trim();
    if (rawId && !SNOWFLAKE.test(rawId)) return respond.send(interaction, { embeds: [eb.warning('المعرّف لازم يكون أرقام فقط (ID حساب ديسكورد).')] });

    // الهدف: عضو مختار ← معرّف ← نفسك
    const targetId = pickedUser ? pickedUser.id : rawId || interaction.user.id;
    let user = pickedUser || null;
    if (!user) {
      user = await interaction.client.users.fetch(targetId).catch(() => null);
      if (!user) return respond.send(interaction, { embeds: [eb.error('ما لقيت هذا الحساب — تأكد من المعرّف.')] });
    }
    if (user.bot) return respond.send(interaction, { embeds: [eb.warning('ما أقدر أرسل رسالة خاصة لبوت.')] });

    const payload = interaction.options.getBoolean('بإطار')
      ? { embeds: [eb.brand({ tone: 'deep', title: '', description: text })], allowedMentions: { parse: [] } }
      : { content: text, allowedMentions: { parse: [] } };
    try {
      await user.send(payload);
    } catch (err) {
      logger.info('تعذّر إرسال رسالة المالك الخاصة', { targetId: user.id, code: err && err.code });
      const closed = err && (err.code === 50007 || /Cannot send messages/i.test(err.message || ''));
      return respond.send(interaction, { embeds: [eb.error(closed ? `ما قدرت أرسل لـ${user} — رسائله الخاصة مغلقة أو حاظر البوت.` : 'تعذّر الإرسال حالياً، جرّب بعد شوي.')], allowedMentions: { parse: [] } });
    }
    logger.info('✉️ رسالة خاصة من المالك', { targetId: user.id, self: user.id === interaction.user.id, chars: text.length });
    return respond.send(interaction, {
      embeds: [eb.success(`وصلت الرسالة إلى ${user.id === interaction.user.id ? 'نفسك' : user} ✅`, '✉️ تم الإرسال').addFields(eb.field('📝 الرسالة', eb.clip(text, 900), false))],
      allowedMentions: { parse: [] }
    });
  }
};
