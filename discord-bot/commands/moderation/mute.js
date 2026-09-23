'use strict';

// /كتم عضو:<عضو> المدة:<رقم> الوحدة:<ثواني|دقائق|ساعات> السبب:[نص]
// كتم مؤقت (Discord Timeout). الحد الأقصى 28 يوم — لو تجاوزه المشرف نوضح له
// الحد الأقصى بنفس الوحدة ونطلب إعادة المحاولة بمدة أقل (بدل فشل صامت).

const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const logger = require('../../utils/logger');
const { guardAdmin } = require('../../utils/adminPermissions');
const { missingBotPermissions, botPermissionsPayload } = require('../../utils/permissions');
const { toDurationMs, formatDurationAr, hierarchyProblem, tryDm, dmEmbed, logModeration, DURATION_UNITS, MAX_TIMEOUT_MS } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('كتم')
    .setDescription('🛡️ (للإدارة) كتم عضو مؤقتاً (Timeout) — حتى 28 يوم')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('عضو').setDescription('العضو المراد كتمه').setRequired(true))
    .addIntegerOption((o) => o.setName('المدة').setDescription('رقم صحيح موجب').setRequired(true).setMinValue(1))
    .addStringOption((o) =>
      o
        .setName('الوحدة')
        .setDescription('وحدة المدة')
        .setRequired(true)
        .addChoices(
          { name: DURATION_UNITS.seconds.choice, value: 'seconds' },
          { name: DURATION_UNITS.minutes.choice, value: 'minutes' },
          { name: DURATION_UNITS.hours.choice, value: 'hours' }
        )
    )
    .addStringOption((o) => o.setName('السبب').setDescription('سبب الكتم (اختياري)').setRequired(false).setMaxLength(400)),

  async execute(interaction) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction))) return;

    const guild = interaction.guild;
    const target = interaction.options.getMember('عضو');
    const amount = interaction.options.getInteger('المدة', true);
    const unit = interaction.options.getString('الوحدة', true);
    const reason = (interaction.options.getString('السبب') || '').trim() || 'بدون سبب محدد';

    const d = toDurationMs(amount, unit);
    if (d.error === 'NOT_POSITIVE') {
      return respond.send(interaction, { embeds: [eb.warning('المدة لازم تكون رقم صحيح أكبر من صفر.')] });
    }
    if (d.error === 'TOO_LONG') {
      const u = DURATION_UNITS[unit];
      return respond.send(interaction, {
        embeds: [
          eb.warning(
            `المدة المطلوبة (${amount} ${u.label}) أطول من الحد الأقصى اللي يسمح به ديسكورد: **28 يوم**.\n` +
              `الحد الأقصى بهذي الوحدة: **${d.maxForUnit.toLocaleString('en-US')} ${u.label}**` +
              ` (أو ${Math.floor(MAX_TIMEOUT_MS / DURATION_UNITS.hours.ms)} ساعة).\n\n` +
              'أعد تنفيذ الأمر بمدة أقل من فضلك 🙏',
            '⏱️ المدة أطول من المسموح'
          )
        ]
      });
    }
    if (d.error) return respond.send(interaction, { embeds: [eb.warning('وحدة المدة غير صحيحة.')] });

    const missing = missingBotPermissions(guild, ['ModerateMembers']);
    if (missing.length) return respond.send(interaction, botPermissionsPayload(missing));

    const problem = hierarchyProblem(guild, interaction.member, target);
    if (problem) return respond.send(interaction, { embeds: [eb.error(problem, '⛔ ما يمكن الكتم')] });
    if (!target.moderatable) {
      return respond.send(interaction, {
        embeds: [eb.error('ديسكورد ما يسمح بكتم هذا العضو (غالباً يملك صلاحية **Administrator**).', '⛔ ما يمكن الكتم')]
      });
    }

    const wasMuted = typeof target.isCommunicationDisabled === 'function' && target.isCommunicationDisabled();
    try {
      await target.timeout(d.ms, `${reason} — بواسطة ${interaction.user.tag || interaction.user.username}`);
    } catch (err) {
      logger.error('فشل الكتم', { guildId: guild.id, targetId: target.id, code: err.code, error: err });
      return respond.send(interaction, { embeds: [eb.error(err.code === 50013 ? 'ديسكورد رفض الكتم — تحقق من ترتيب رتبة البوت وصلاحية **كتم الأعضاء**.' : 'تعذّر تنفيذ الكتم، جرّب بعد قليل.')] });
    }

    const endsAt = Date.now() + d.ms;
    const duration = formatDurationAr(d.ms);
    const dmOk = await tryDm(target.user, {
      embeds: [
        dmEmbed({
          title: '🔇 تم كتمك مؤقتاً',
          guild,
          lines: [`**السيرفر:** ${guild.name}`, `**المدة:** ${duration}`, `**ينتهي:** ${eb.discordDate(endsAt, 'f')} (${eb.discordDate(endsAt, 'R')})`, `**السبب:** ${reason}`, `**بواسطة:** ${interaction.user.tag || interaction.user.username}`]
        })
      ]
    });

    await logModeration({
      guildId: guild.id,
      action: 'mute',
      targetId: target.id,
      moderatorId: interaction.user.id,
      channelId: interaction.channelId,
      reason,
      details: { durationMs: d.ms, amount, unit, replacedExisting: wasMuted }
    });

    const embed = eb
      .brand({ tone: 'gold', title: '🔇 تم الكتم', description: `${target} ما يقدر يرسل أو يتكلم لين ينتهي الكتم.` })
      .addFields(
        eb.field('👤 العضو', `${target.user.tag || target.user.username}\n\`${target.id}\``),
        eb.field('⏱️ المدة', duration),
        eb.field('🕒 ينتهي', `${eb.discordDate(endsAt, 'f')}\n${eb.discordDate(endsAt, 'R')}`),
        eb.field('📝 السبب', reason, false)
      );
    const notes = [];
    if (wasMuted) notes.push('كان مكتوم مسبقاً — تم استبدال المدة بالجديدة.');
    if (!dmOk) notes.push('تعذر إرسال إشعار خاص للعضو (رسائله الخاصة مغلقة).');
    if (notes.length) embed.addFields(eb.field('ℹ️ ملاحظة', notes.join('\n'), false));
    return respond.send(interaction, { embeds: [embed] });
  }
};
