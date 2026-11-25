'use strict';

// /فك_كتم عضو:<عضو> سبب:[نص] — يزيل الكتم المؤقت (Discord Timeout). متاح للإدارة ولصاحب رتبة «إداري».

const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const logger = require('../../utils/logger');
const { guardAdmin, STAFF_ROLE_RE } = require('../../utils/adminPermissions');
const { missingBotPermissions, botPermissionsPayload } = require('../../utils/permissions');
const { hierarchyProblem, dmUnmuted, logModeration } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('فك_كتم')
    .setDescription('🔊 (للإدارة/الإداريين) فك الكتم عن عضو')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('عضو').setDescription('العضو المراد فك كتمه').setRequired(true))
    .addStringOption((o) => o.setName('السبب').setDescription('سبب فك الكتم (اختياري)').setRequired(false).setMaxLength(400)),

  async execute(interaction) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction, { roleNameRe: STAFF_ROLE_RE }))) return;

    const guild = interaction.guild;
    const target = interaction.options.getMember('عضو');
    const reason = (interaction.options.getString('السبب') || '').trim() || 'بدون سبب محدد';
    if (!target) return respond.send(interaction, { embeds: [eb.warning('العضو غير موجود بالسيرفر.')] });

    const missing = missingBotPermissions(guild, ['ModerateMembers']);
    if (missing.length) return respond.send(interaction, botPermissionsPayload(missing));

    const problem = hierarchyProblem(guild, interaction.member, target);
    if (problem) return respond.send(interaction, { embeds: [eb.error(problem, '⛔ ما يمكن فك الكتم')] });
    if (!target.moderatable) {
      return respond.send(interaction, { embeds: [eb.error('ديسكورد ما يسمح بتعديل كتم هذا العضو.', '⛔ ما يمكن فك الكتم')] });
    }
    const muted = typeof target.isCommunicationDisabled === 'function' && target.isCommunicationDisabled();
    if (!muted) return respond.send(interaction, { embeds: [eb.info(`${target} مو مكتوم حالياً.`, 'ℹ️ ما فيه كتم')] });

    try {
      await target.timeout(null, `${reason} — بواسطة ${interaction.user.tag || interaction.user.username}`);
    } catch (err) {
      logger.error('فشل فك الكتم', { guildId: guild.id, targetId: target.id, code: err.code, error: err });
      return respond.send(interaction, { embeds: [eb.error(err.code === 50013 ? 'ديسكورد رفض العملية — تحقق من ترتيب رتبة البوت وصلاحية **كتم الأعضاء**.' : 'تعذّر فك الكتم، جرّب بعد قليل.')] });
    }

    const dmOk = await dmUnmuted(target.user, guild, { reason, by: interaction.user.tag || interaction.user.username });
    await logModeration({ guildId: guild.id, action: 'unmute', targetId: target.id, moderatorId: interaction.user.id, channelId: interaction.channelId, reason });

    const embed = eb
      .brand({ tone: 'gold', title: '🔊 تم فك الكتم', description: `${target} يقدر يتكلم الحين.` })
      .addFields(eb.field('👤 العضو', `${target.user.tag || target.user.username}\n\`${target.id}\``), eb.field('📝 السبب', reason, false));
    if (!dmOk) embed.addFields(eb.field('ℹ️ ملاحظة', 'تعذر إرسال إشعار خاص للعضو (رسائله الخاصة مغلقة).', false));
    return respond.send(interaction, { embeds: [embed] });
  }
};
