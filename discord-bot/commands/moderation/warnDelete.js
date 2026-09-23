'use strict';

// /حذف_تحذير عضو:<عضو> رقم_التحذير:<رقم> — يصحّح تحذير أُضيف بالخطأ.
// الرقم هو نفس الرقم التسلسلي الظاهر بـ/سجل_تحذيرات (#1 = الأقدم).
// ما يغيّر رتب العضو تلقائياً — المشرف يقرر (ويقدر يعيد /تحذير بالرتبة الصحيحة).

const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const store = require('../../database/botStore');
const { guardAdmin } = require('../../utils/adminPermissions');
const { logModeration } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('حذف_تحذير')
    .setDescription('🛡️ (للإدارة) يحذف تحذير معيّن من سجل عضو')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('عضو').setDescription('العضو').setRequired(true))
    .addIntegerOption((o) => o.setName('رقم_التحذير').setDescription('رقم التحذير كما يظهر بـ/سجل_تحذيرات').setRequired(true).setMinValue(1)),

  async execute(interaction) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction))) return;

    const user = interaction.options.getUser('عضو', true);
    const seq = interaction.options.getInteger('رقم_التحذير', true);
    const removed = await store.warnings.removeBySeq(interaction.guildId, user.id, seq);
    if (!removed) {
      const total = await store.warnings.count(interaction.guildId, user.id);
      return respond.send(interaction, {
        embeds: [eb.warning(total ? `ما فيه تحذير رقم **${seq}** — عنده ${total} تحذير (من #1 إلى #${total}).` : 'هذا العضو ما عنده أي تحذير مسجّل.', '🔎 غير موجود')]
      });
    }
    const total = await store.warnings.count(interaction.guildId, user.id);
    await logModeration({
      guildId: interaction.guildId,
      action: 'warn_delete',
      targetId: user.id,
      moderatorId: interaction.user.id,
      channelId: interaction.channelId,
      reason: removed.reason,
      details: { seq, warningId: removed.id, role: removed.warning_role_given }
    });
    return respond.send(interaction, {
      embeds: [
        eb
          .success(`تم حذف التحذير **#${seq}** من سجل ${user}.`, '🗑️ تم حذف التحذير')
          .addFields(
            eb.field('📝 سببه', eb.clip(removed.reason, 300), false),
            eb.field('🏷️ رتبته وقتها', removed.warning_role_given),
            eb.field('🔢 العدد الفعلي الآن', `**${total}** تحذير`),
            eb.field('ℹ️ ملاحظة', 'رتب العضو ما تغيّرت — لو تبي تعدّلها استخدم `/تحذير` بالرتبة الصحيحة. أرقام التحذيرات الأحدث نزلت رقم واحد.', false)
          )
      ]
    });
  }
};
