'use strict';

// /حذف_تحذير عضو:<عضو> [الإنذار:<أول|ثاني|ثالث>] [رقم_التحذير:<رقم>]
//   • الإنذار (قائمة بالثلاث) أو رقم_التحذير 1/2/3 ← يشيل رتبة الإنذار المقابلة (أول/ثاني/ثالث) من العضو
//     ويحذف آخر تحذير مسجّل بنفس الرتبة من السجل.
//   • رقم_التحذير أكبر من 3 ← يحذف التحذير ذي الرقم التسلسلي من /سجل_تحذيرات (#1 = الأقدم) بدون تغيير الرتب.
// بدون أي منهما: يعرض الثلاث رتب وحالة العضو ويطلب الاختيار.

const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const logger = require('../../utils/logger');
const store = require('../../database/botStore');
const { guardAdmin } = require('../../utils/adminPermissions');
const { missingBotPermissions, botPermissionsPayload } = require('../../utils/permissions');
const { logModeration, dmWarningRemoved } = require('../../utils/moderation');
const { ensureWarningRoles, LABELS } = require('../../utils/warningRoles');

const LEVELS = ['w1', 'w2', 'w3'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('حذف_تحذير')
    .setDescription('🛡️ (للإدارة) يشيل رتبة إنذار من عضو (أول/ثاني/ثالث) ويحذفه من سجله')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('عضو').setDescription('العضو').setRequired(true))
    .addStringOption((o) =>
      o
        .setName('الإنذار')
        .setDescription('أي إنذار تشيله؟')
        .setRequired(false)
        .addChoices({ name: 'إنذار أول', value: 'w1' }, { name: 'إنذار ثاني', value: 'w2' }, { name: 'إنذار ثالث', value: 'w3' })
    )
    .addIntegerOption((o) =>
      o.setName('رقم_التحذير').setDescription('1 = إنذار أول · 2 = ثاني · 3 = ثالث (أكبر من 3 = رقم بالسجل /سجل_تحذيرات)').setRequired(false).setMinValue(1)
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction))) return;

    const guild = interaction.guild;
    const user = interaction.options.getUser('عضو', true);
    const member = interaction.options.getMember('عضو');
    const pick = interaction.options.getString('الإنذار');
    const num = interaction.options.getInteger('رقم_التحذير');

    let level = pick ? LEVELS.indexOf(pick) : -1;
    if (level < 0 && num && num >= 1 && num <= 3) level = num - 1;

    // رقم بالسجل (أكبر من 3): السلوك القديم بدون تغيير الرتب
    if (level < 0 && num && num > 3) {
      const removed = await store.warnings.removeBySeq(guild.id, user.id, num);
      const total = await store.warnings.count(guild.id, user.id);
      if (!removed) {
        return respond.send(interaction, {
          embeds: [eb.warning(total ? `ما فيه تحذير رقم **${num}** بالسجل — عنده ${total} تحذير.` : 'هذا العضو ما عنده أي تحذير مسجّل.', '🔎 غير موجود')]
        });
      }
      await logModeration({ guildId: guild.id, action: 'warn_delete', targetId: user.id, moderatorId: interaction.user.id, channelId: interaction.channelId, reason: removed.reason, details: { seq: num, warningId: removed.id, role: removed.warning_role_given } });
      await dmWarningRemoved(user, guild, { label: `التحذير #${num}`, reason: removed.reason, by: interaction.user.tag || interaction.user.username });
      return respond.send(interaction, {
        embeds: [eb.success(`تم حذف التحذير **#${num}** من سجل ${user}.`, '🗑️ تم حذف التحذير').addFields(eb.field('📝 سببه', eb.clip(removed.reason, 300), false), eb.field('🔢 العدد الفعلي الآن', `**${total}** تحذير`))]
      });
    }

    const ensured = await ensureWarningRoles(guild);
    if (ensured.error) return respond.send(interaction, { embeds: [eb.error(ensured.error, '⚠️ رتب الإنذار')] });

    // ما اختار: نعرض الثلاث رتب ووضع العضو الحالي
    if (level < 0) {
      const lines = ensured.roles.map((r, i) => `${member && member.roles.cache.has(r.id) ? '✅ عنده' : '▫️ ما عنده'} — **${LABELS[i]}** (${r.name})`);
      return respond.send(interaction, {
        embeds: [eb.info(`${lines.join('\n')}\n\nاختر الإنذار من خيار **الإنذار** (أول/ثاني/ثالث)، أو اكتب **رقم_التحذير** 1 أو 2 أو 3.`, `🗑️ أي إنذار تبي تشيله من ${user.username}؟`)]
      });
    }

    const role = ensured.roles[level];
    const missing = missingBotPermissions(guild, ['ManageRoles']);
    if (missing.length) return respond.send(interaction, botPermissionsPayload(missing));

    // 1) رتبة الإنذار من العضو
    let hadRole = false;
    let roleError = null;
    if (member && member.roles.cache.has(role.id)) {
      hadRole = true;
      try {
        await member.roles.remove(role, `حذف ${LABELS[level]} — بواسطة ${interaction.user.tag || interaction.user.username}`);
      } catch (err) {
        roleError = err;
        logger.error('تعذّر إزالة رتبة الإنذار', { guildId: guild.id, targetId: user.id, code: err.code, error: err });
      }
    }
    // 2) آخر تحذير مسجّل بنفس الرتبة
    const record = await store.warnings.removeLatestByRole(guild.id, user.id, role.name);
    const total = await store.warnings.count(guild.id, user.id);

    await logModeration({
      guildId: guild.id,
      action: 'warn_delete',
      targetId: user.id,
      moderatorId: interaction.user.id,
      channelId: interaction.channelId,
      reason: `${LABELS[level]}${record ? ` — ${record.reason}` : ''}`,
      details: { level: level + 1, role: role.name, roleRemoved: hadRole && !roleError, recordRemoved: !!record }
    });

    // إشعار خاص للعضو بحذف الإنذار
    let dmOk = false;
    if (hadRole || record) dmOk = await dmWarningRemoved(user, guild, { label: LABELS[level], reason: record && record.reason, by: interaction.user.tag || interaction.user.username, channel: interaction.channel });

    if (!hadRole && !record) {
      return respond.send(interaction, { embeds: [eb.warning(`${user} ما عنده رتبة **${role.name}** ولا تحذير مسجّل بها.`, '🔎 ما فيه شي يتحذف')] });
    }
    const embed = eb
      .success(`تم حذف **${LABELS[level]}** من ${user}.`, '🗑️ تم حذف الإنذار')
      .addFields(
        eb.field('🏷️ الرتبة', roleError ? '⚠️ تعذّر إزالتها (تحقق من ترتيب رتبة البوت)' : hadRole ? `أُزيلت **${role.name}**` : 'ما كانت عنده'),
        eb.field('📋 السجل', record ? `انحذف: ${eb.clip(record.reason, 200)}` : 'ما فيه تحذير مسجّل بهذي الرتبة'),
        eb.field('🔢 العدد الفعلي الآن', `**${total}** تحذير`)
      );
    if (dmOk === 'channel') embed.addFields(eb.field('ℹ️ ملاحظة', 'رسائله الخاصة مغلقة — أُرسل الإشعار بمنشنه بنفس الروم.', false));
    else if (!dmOk) embed.addFields(eb.field('ℹ️ ملاحظة', 'تعذر إرسال إشعار للعضو (رسائله الخاصة مغلقة).', false));
    return respond.send(interaction, { embeds: [embed] });
  }
};
