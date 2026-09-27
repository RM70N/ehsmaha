'use strict';

// /اسلوب_المساعد [إجراء] [المالك] — (للإدارة) المساعد الذكي يتعلم أسلوب كلام
// صاحب احسمها مع اللاعبين (ردوده بالتكتات + الـReply على اللاعبين) ويرد مثله.
//   حالة (افتراضي) · تشغيل · إيقاف · مسح (يمسح كل اللي تعلّمه)
//   المالك: مين يتعلم المساعد أسلوبه (مالك السيرفر فقط يغيّره — الافتراضي مالك السيرفر)

const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const store = require('../../database/botStore');
const aiStyle = require('../../services/aiStyle');
const { guardAdmin, withStorageNotice } = require('../../utils/adminPermissions');
const { logModeration } = require('../../utils/moderation');

const NAME = 'اسلوب_المساعد';

module.exports = {
  data: new SlashCommandBuilder()
    .setName(NAME)
    .setDescription('🎨 (للإدارة) المساعد الذكي يتعلم أسلوبك بالكلام مع اللاعبين ويرد مثلك')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName('إجراء')
        .setDescription('وش تبي تسوي؟')
        .setRequired(false)
        .addChoices(
          { name: '📊 الحالة', value: 'status' },
          { name: '✅ تشغيل التعلّم', value: 'on' },
          { name: '⏸️ إيقاف التعلّم', value: 'off' },
          { name: '🗑️ مسح كل اللي تعلّمه', value: 'clear' }
        )
    )
    .addUserOption((o) => o.setName('المالك').setDescription('مين يتعلم المساعد أسلوبه (لمالك السيرفر فقط)').setRequired(false)),

  async execute(interaction) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction))) return;
    const guild = interaction.guild;
    const action = interaction.options.getString('إجراء') || 'status';
    const newOwner = interaction.options.getUser('المالك');

    if (newOwner) {
      if (interaction.user.id !== guild.ownerId) {
        return respond.send(interaction, { embeds: [eb.error('تغيير صاحب الأسلوب لمالك السيرفر فقط.')] });
      }
      if (newOwner.bot) return respond.send(interaction, { embeds: [eb.error('اختر شخص، مو بوت.')] });
      await store.guildSettings.update(guild.id, { ai_style_owner_id: newOwner.id }, interaction.user.id);
      await logModeration({ guildId: guild.id, action: 'ai_style_owner', moderatorId: interaction.user.id, targetId: newOwner.id });
      aiStyle.invalidate(guild.id);
    }

    if (action === 'on' || action === 'off') {
      await store.guildSettings.update(guild.id, { ai_style_enabled: action === 'on' }, interaction.user.id);
      await logModeration({ guildId: guild.id, action: `ai_style_${action}`, moderatorId: interaction.user.id });
      aiStyle.invalidate(guild.id);
    } else if (action === 'clear') {
      const n = await store.aiStyle.clear(guild.id);
      await logModeration({ guildId: guild.id, action: 'ai_style_clear', moderatorId: interaction.user.id });
      aiStyle.invalidate(guild.id);
      return respond.send(interaction, withStorageNotice({ embeds: [eb.success(`انمسح ${n} مثال — المساعد رجع لأسلوبه الافتراضي.`, '🗑️ تم مسح الأسلوب')] }));
    }

    const s = await store.guildSettings.get(guild.id);
    const ownerId = s.ai_style_owner_id || guild.ownerId;
    const count = await store.aiStyle.count(guild.id);
    const recent = await store.aiStyle.recent(guild.id, 3);
    const preview = recent.length ? recent.map((r) => `> ${eb.clip(r.reply_text, 120)}`).join('\n') : '_ما فيه أمثلة للحين_';
    const title = action === 'on' ? '✅ تم تشغيل تعلّم الأسلوب' : action === 'off' ? '⏸️ تم إيقاف تعلّم الأسلوب' : '🎨 أسلوب المساعد';
    return respond.send(interaction, withStorageNotice({
      embeds: [eb.info(
        `**الحالة:** ${s.ai_style_enabled ? '✅ شغّال' : '⏸️ متوقف'}\n` +
          `**صاحب الأسلوب:** ${ownerId ? `<@${ownerId}>` : '—'}\n` +
          `**الأمثلة المحفوظة:** ${count} / ${store.aiStyle.MAX}\n\n` +
          '**كيف يتعلم؟** من ردود صاحب الأسلوب **فقط**: رسائله داخل تكتات الدعم، وأي رد (Reply) يسويه على رسالة لاعب. ' +
          'رسائل باقي الإدارة واللاعبين ما تنحفظ، والروابط والمنشنات تنشال.\n\n' +
          `**آخر اللي تعلّمه:**\n${preview}`,
        title
      )]
    }));
  }
};
