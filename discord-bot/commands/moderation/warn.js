'use strict';

// /تحذير عضو:<عضو> سبب:<نص> رتبة_التحذير:<تحذير1|تحذير2|تحذير3>
//
// منطق تبديل رتب التحذير (بالترتيب الصحيح):
//   1) نفحص أي رتبة تحذير من الثلاث يملكها العضو حالياً (غير المختارة)
//   2) نزيلها أولاً (member.roles.remove)
//   3) ثم نمنح الرتبة المختارة (member.roles.add)
// فما يصير عنده رتبتا تحذير بنفس الوقت أبداً. الرتبة يختارها المشرف يدوياً —
// الأمر يطبّق اختياره فقط، والرد يعرض بشكل منفصل العدد **الفعلي** لتحذيرات
// العضو من جدول warnings (عدّ حقيقي بالاستعلام) حتى يظهر أي اختلاف.

const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const logger = require('../../utils/logger');
const store = require('../../database/botStore');
const { guardAdmin } = require('../../utils/adminPermissions');
const { missingBotPermissions, botPermissionsPayload } = require('../../utils/permissions');
const { hierarchyProblem, tryDm, dmEmbed, logModeration } = require('../../utils/moderation');
const { ensureWarningRoles } = require('../../utils/warningRoles');

const LEVELS = ['w1', 'w2', 'w3'];

/**
 * يبدّل رتب التحذير: يزيل الأخرى أولاً ثم يمنح المختارة.
 * @returns {{ removed: string[], added: boolean }}
 */
async function switchWarningRole(member, roles, chosen, reason) {
  const others = roles.filter((r) => r.id !== chosen.id && member.roles.cache.has(r.id));
  if (others.length) await member.roles.remove(others, reason);
  let added = false;
  if (!member.roles.cache.has(chosen.id)) {
    await member.roles.add(chosen, reason);
    added = true;
  }
  return { removed: others.map((r) => r.name), added };
}

module.exports = {
  // الخيارات تمثّل مستوى التحذير (1/2/3)؛ الرتبة الفعلية بالسيرفر حسب WARNING_ROLE_NAMES
  data: new SlashCommandBuilder()
    .setName('تحذير')
    .setDescription('🛡️ (للإدارة) تحذير عضو ومنحه رتبة تحذير')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('عضو').setDescription('العضو المراد تحذيره').setRequired(true))
    .addStringOption((o) => o.setName('سبب').setDescription('سبب التحذير').setRequired(true).setMaxLength(400))
    .addStringOption((o) =>
      o
        .setName('رتبة_التحذير')
        .setDescription('رتبة التحذير اللي تبي تعطيها للعضو')
        .setRequired(true)
        .addChoices({ name: 'تحذير1', value: 'w1' }, { name: 'تحذير2', value: 'w2' }, { name: 'تحذير3', value: 'w3' })
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction))) return;

    const guild = interaction.guild;
    const target = interaction.options.getMember('عضو');
    const reason = interaction.options.getString('سبب', true).trim();
    const level = LEVELS.indexOf(interaction.options.getString('رتبة_التحذير', true));
    if (level < 0) return respond.send(interaction, { embeds: [eb.warning('رتبة تحذير غير معروفة.')] });

    const missing = missingBotPermissions(guild, ['ManageRoles']);
    if (missing.length) return respond.send(interaction, botPermissionsPayload(missing));

    // منح الرتب يتطلب أن رتبة البوت فوق رتب التحذير (مو فوق العضو) — يتحقق منه ensureWarningRoles
    const problem = hierarchyProblem(guild, interaction.member, target, { requireBotAbove: false });
    if (problem) return respond.send(interaction, { embeds: [eb.error(problem, '⛔ ما يمكن التحذير')] });

    const ensured = await ensureWarningRoles(guild);
    if (ensured.error) return respond.send(interaction, { embeds: [eb.error(ensured.error, '⚠️ رتب التحذير')] });
    const chosen = ensured.roles[level];

    // 1) تسجيل التحذير (السجل هو المرجع حتى لو تعثّر تعديل الرتب)
    await store.warnings.add({ guildId: guild.id, discordId: target.id, reason, role: chosen.name, issuedBy: interaction.user.id });

    // 2) تبديل الرتب: إزالة أي رتبة تحذير ثانية أولاً، ثم منح المختارة
    let switched = null;
    let roleError = null;
    try {
      switched = await switchWarningRole(target, ensured.roles, chosen, `تحذير: ${reason} — بواسطة ${interaction.user.tag || interaction.user.username}`);
    } catch (err) {
      roleError = err;
      logger.error('تعذّر تبديل رتب التحذير', { guildId: guild.id, targetId: target.id, code: err.code, error: err });
    }

    // 3) العدد الفعلي من الجدول
    const total = await store.warnings.count(guild.id, target.id);

    const dmOk = await tryDm(target.user, {
      embeds: [dmEmbed({ title: '⚠️ وصلك تحذير', guild, lines: [`**السيرفر:** ${guild.name}`, `**الرتبة:** ${chosen.name}`, `**السبب:** ${reason}`, `**عدد تحذيراتك:** ${total}`] })]
    });

    await logModeration({
      guildId: guild.id,
      action: 'warn',
      targetId: target.id,
      moderatorId: interaction.user.id,
      channelId: interaction.channelId,
      reason,
      details: { role: chosen.name, removedRoles: switched ? switched.removed : null, total }
    });

    const embed = eb
      .brand({ tone: 'gold', title: '⚠️ تم التحذير', description: `تم تحذير ${target}.` })
      .addFields(
        eb.field('🏷️ الرتبة المُعطاة الآن', `**${chosen.name}**\n(كما اختارها المشرف)`),
        eb.field('🔢 العدد الفعلي لتحذيراته', `**${total}** تحذير\n(من سجل التحذيرات)`),
        eb.field('📝 السبب', reason, false)
      );
    const notes = [];
    if (total !== level + 1) {
      notes.push(`الرتبة المختارة (**${chosen.name}**) لا تطابق العدد الفعلي لتحذيراته (**${total}**) — تأكد إن هذا مقصود.`);
    }
    if (switched && switched.removed.length) notes.push(`أُزيلت رتبة ${switched.removed.join('، ')} قبل منح الرتبة الجديدة.`);
    if (roleError) notes.push('⚠️ التحذير انسجل، لكن تعذّر تعديل رتب العضو — تحقق من ترتيب رتبة البوت.');
    if (ensured.created.length) notes.push(`أُنشئت تلقائياً رتب: ${ensured.created.join('، ')}.`);
    if (!dmOk) notes.push('تعذر إرسال إشعار خاص للعضو.');
    if (notes.length) embed.addFields(eb.field('ℹ️ ملاحظات', notes.join('\n'), false));
    return respond.send(interaction, { embeds: [embed] });
  },

  _internal: { switchWarningRole, LEVELS }
};
