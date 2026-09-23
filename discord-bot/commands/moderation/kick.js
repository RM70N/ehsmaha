'use strict';

// /طرد عضو:<عضو> سبب:<نص> — طرد عضو من السيرفر (يقدر يرجع برابط دعوة).
// قبل الطرد: فحص صلاحية المشرف، صلاحية البوت، ترتيب الرتب، و member.kickable،
// ثم محاولة إرسال DM بالسبب (فشلها ما يوقف الطرد).

const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const logger = require('../../utils/logger');
const { guardAdmin } = require('../../utils/adminPermissions');
const { missingBotPermissions, botPermissionsPayload } = require('../../utils/permissions');
const { hierarchyProblem, tryDm, dmEmbed, logModeration } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('طرد')
    .setDescription('🛡️ (للإدارة) طرد عضو من السيرفر')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('عضو').setDescription('العضو المراد طرده').setRequired(true))
    .addStringOption((o) => o.setName('سبب').setDescription('سبب الطرد').setRequired(true).setMaxLength(400)),

  async execute(interaction) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction))) return;

    const guild = interaction.guild;
    const target = interaction.options.getMember('عضو');
    const reason = interaction.options.getString('سبب', true).trim() || 'بدون سبب محدد';

    const missing = missingBotPermissions(guild, ['KickMembers']);
    if (missing.length) return respond.send(interaction, botPermissionsPayload(missing));

    const problem = hierarchyProblem(guild, interaction.member, target);
    if (problem) return respond.send(interaction, { embeds: [eb.error(problem, '⛔ ما يمكن الطرد')] });
    if (!target.kickable) {
      return respond.send(interaction, { embeds: [eb.error('ديسكورد ما يسمح للبوت بطرد هذا العضو (تحقق من ترتيب الرتب وصلاحية **طرد الأعضاء**).', '⛔ ما يمكن الطرد')] });
    }

    // الـDM قبل الطرد — بعده ما يعود البوت يشارك العضو أي سيرفر فيفشل غالباً
    const dmOk = await tryDm(target.user, {
      embeds: [
        dmEmbed({
          title: '👢 تم طردك من السيرفر',
          guild,
          lines: [`**السيرفر:** ${guild.name}`, `**السبب:** ${reason}`, `**بواسطة:** ${interaction.user.tag || interaction.user.username}`]
        })
      ]
    });

    const tag = target.user.tag || target.user.username;
    try {
      await target.kick(`${reason} — بواسطة ${interaction.user.tag || interaction.user.username}`);
    } catch (err) {
      logger.error('فشل الطرد', { guildId: guild.id, targetId: target.id, code: err.code, error: err });
      return respond.send(interaction, { embeds: [eb.error(err.code === 50013 ? 'ديسكورد رفض الطرد — تحقق من ترتيب رتبة البوت وصلاحية **طرد الأعضاء**.' : 'تعذّر تنفيذ الطرد، جرّب بعد قليل.')] });
    }

    await logModeration({ guildId: guild.id, action: 'kick', targetId: target.id, moderatorId: interaction.user.id, channelId: interaction.channelId, reason });

    const embed = eb
      .brand({ tone: 'gold', title: '👢 تم الطرد', description: `تم طرد **${eb.safeName(tag)}** من السيرفر.` })
      .addFields(eb.field('👤 العضو', `${eb.safeName(tag)}\n\`${target.id}\``), eb.field('🛡️ بواسطة', `${interaction.user}`), eb.field('📝 السبب', reason, false));
    if (!dmOk) embed.addFields(eb.field('ℹ️ ملاحظة', 'تعذر إرسال إشعار خاص للعضو قبل الطرد (رسائله الخاصة مغلقة).', false));
    return respond.send(interaction, { embeds: [embed] });
  }
};
