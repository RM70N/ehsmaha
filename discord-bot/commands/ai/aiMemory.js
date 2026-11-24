'use strict';

// /ذاكرة_المساعد — (للإدارة) تعلّم مساعد احسمها بدون تعديل كود:
//   تعليمة  ← أمر إضافي يمشي عليه دائماً (مثل: "لو أحد سأل عن المسابقة قل الأسبوع الجاي")
//   علمه    ← سؤال وجوابه المعتمد (يرد فيه لو أحد سأل نفس السؤال أو بمعناه)
//   عرض · حذف · مسح · الحالة (مفاتيح Gemini: أي مفتاح شغّال وأيها خلص حده)
// ونفس الشي بالمنشن: "@احسمها تعلم: السؤال = الجواب" و"@احسمها تعليمة: ...".

const { SlashCommandBuilder, InteractionContextType, AttachmentBuilder } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const aiMemory = require('../../services/aiMemory');
const gemini = require('../../services/gemini');
const { guardAdmin, withStorageNotice } = require('../../utils/adminPermissions');
const { logModeration } = require('../../utils/moderation');
const logger = require('../../utils/logger');

const NAME = 'ذاكرة_المساعد';
const KIND_LABEL = { instruction: 'تعليمة', qa: 'سؤال' };
const COOL_LABEL = { RATE_LIMIT: 'خلص حده مؤقتاً', AUTH: 'المفتاح غلط/موقوف', BILLING: 'الرصيد خلص', SERVER: 'ضغط عند جوجل', MODEL_NOT_FOUND: 'النموذج غير متاح' };

const oneLine = (t, max) => eb.clip(String(t || '').replace(/\s+/g, ' '), max);

function listText({ instructions, qa }, { full = false } = {}) {
  const max = full ? 2000 : 110;
  const parts = [];
  parts.push(`**📜 التعليمات (${instructions.length}/${aiMemory.LIMITS.instruction})**`);
  parts.push(instructions.length ? instructions.map((r) => `\`#${r.id}\` ${oneLine(r.content, max)}`).join('\n') : '_ما فيه تعليمات_');
  parts.push('');
  parts.push(`**❓ الأسئلة المعتمدة (${qa.length}/${aiMemory.LIMITS.qa})**`);
  parts.push(qa.length ? qa.map((r) => `\`#${r.id}\` **س:** ${oneLine(r.question, full ? 300 : 60)}\n　**ج:** ${oneLine(r.content, max)}`).join('\n') : '_ما فيه أسئلة_');
  return parts.join('\n');
}

function statusText() {
  const s = gemini.status();
  const keys = s.keys
    .map((k) => `${k.active ? '🟢' : k.cooling ? '🔴' : '⚪'} مفتاح ${k.index}${k.active ? ' (النشط)' : ''}${k.cooling ? ` — ${COOL_LABEL[k.cooling.code] || k.cooling.code} (يرجع بعد ~${Math.max(1, Math.ceil(k.cooling.seconds / 60))} د)` : ''}`)
    .join('\n');
  return (
    `**🤖 النموذج:** \`${s.model}\`` +
    (s.fallbackModels.length ? `\n**🛟 الاحتياطي:** ${s.fallbackModels.map((m) => `\`${m}\``).join('، ')}` : '') +
    `\n\n**🔑 مفاتيح Gemini (${s.keys.length}):**\n${keys}\n\n` +
    'لو خلص حد مفتاح، البوت يتحول تلقائياً للي بعده. تضيف مفاتيح من تبويب **Env** بالاستضافة: `GEMINI_API_KEY_2` و`GEMINI_API_KEY_3` و`GEMINI_API_KEY_4` (وأعد تشغيل البوت).'
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName(NAME)
    .setDescription('🧠 (للإدارة) علّم المساعد الذكي أجوبة وتعليمات جديدة بدون تعديل كود')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('علمه')
        .setDescription('سؤال وجوابه المعتمد — يرد فيه لو أحد سأل نفس السؤال أو بمعناه')
        .addStringOption((o) => o.setName('السؤال').setDescription('السؤال مثل ما يكتبه الناس').setRequired(true).setMaxLength(aiMemory.MAX_QUESTION))
        .addStringOption((o) => o.setName('الجواب').setDescription('الجواب اللي تبيه يرد فيه').setRequired(true).setMaxLength(aiMemory.MAX_ANSWER))
    )
    .addSubcommand((s) =>
      s
        .setName('تعليمة')
        .setDescription('أمر إضافي يمشي عليه المساعد دائماً (أسلوب، معلومة، شي يسويه أو ما يسويه)')
        .addStringOption((o) => o.setName('النص').setDescription('التعليمة').setRequired(true).setMaxLength(aiMemory.MAX_INSTRUCTION))
    )
    .addSubcommand((s) => s.setName('عرض').setDescription('كل التعليمات والأسئلة اللي تعلّمها المساعد'))
    .addSubcommand((s) =>
      s
        .setName('حذف')
        .setDescription('يحذف تعليمة أو سؤال برقمه (الرقم من "عرض")')
        .addIntegerOption((o) => o.setName('الرقم').setDescription('رقم التعليمة/السؤال').setRequired(true).setMinValue(1))
    )
    .addSubcommand((s) =>
      s
        .setName('مسح')
        .setDescription('يمسح الذاكرة كاملة أو نوع منها')
        .addStringOption((o) =>
          o
            .setName('النوع')
            .setDescription('وش تمسح؟')
            .setRequired(true)
            .addChoices({ name: '📜 التعليمات', value: 'instruction' }, { name: '❓ الأسئلة', value: 'qa' }, { name: '🗑️ الكل', value: 'all' })
        )
    )
    .addSubcommand((s) => s.setName('الحالة').setDescription('حالة مفاتيح Gemini والذاكرة')),

  async execute(interaction) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction))) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'علمه') {
        const q = interaction.options.getString('السؤال');
        const a = interaction.options.getString('الجواب');
        const r = await aiMemory.addQa(guildId, q, a, interaction.user.id);
        await logModeration({ guildId, action: 'ai_memory_qa', moderatorId: interaction.user.id, reason: oneLine(q, 200) });
        return respond.send(interaction, withStorageNotice({
          embeds: [eb.success(`**س:** ${oneLine(q, 300)}\n**ج:** ${eb.clip(a, 1500)}\n\nلو أحد سأل نفس السؤال (أو بمعناه) بيرد بهالجواب.`, r.updated ? `✏️ تحدّث الجواب (#${r.id})` : `🧠 تعلّمها (#${r.id})`)],
          allowedMentions: { parse: [] }
        }));
      }

      if (sub === 'تعليمة') {
        const text = interaction.options.getString('النص');
        const r = await aiMemory.addInstruction(guildId, text, interaction.user.id);
        await logModeration({ guildId, action: 'ai_memory_instruction', moderatorId: interaction.user.id, reason: oneLine(text, 200) });
        return respond.send(interaction, withStorageNotice({
          embeds: [eb.success(`> ${eb.clip(text, 1000)}\n\nالمساعد بيمشي عليها من الحين بالمنشن والتكتات.`, `📜 انحفظت التعليمة (#${r.id})`)],
          allowedMentions: { parse: [] }
        }));
      }

      if (sub === 'عرض') {
        const data = await aiMemory.list(guildId);
        const text = listText(data);
        const payload = { embeds: [eb.info(eb.clip(text, 4000), '🧠 ذاكرة المساعد')], allowedMentions: { parse: [] } };
        if (text.length > 4000 || data.qa.length + data.instructions.length > 25) {
          payload.files = [new AttachmentBuilder(Buffer.from(listText(data, { full: true }).replace(/\*\*/g, ''), 'utf8'), { name: 'ai-memory.txt' })];
        }
        return respond.send(interaction, payload);
      }

      if (sub === 'حذف') {
        const id = interaction.options.getInteger('الرقم');
        const removed = await aiMemory.remove(guildId, id);
        if (!removed) return respond.send(interaction, { embeds: [eb.error(`ما لقيت شي برقم #${id} — شوف الأرقام بـ\`/${NAME} عرض\`.`)] });
        await logModeration({ guildId, action: 'ai_memory_remove', moderatorId: interaction.user.id, reason: `#${id}` });
        const what = removed.kind === 'qa' ? `**س:** ${oneLine(removed.question, 200)}` : `> ${oneLine(removed.content, 300)}`;
        return respond.send(interaction, { embeds: [eb.success(what, `🗑️ انحذف ${KIND_LABEL[removed.kind] || ''} #${id}`)], allowedMentions: { parse: [] } });
      }

      if (sub === 'مسح') {
        const kind = interaction.options.getString('النوع');
        const n = await aiMemory.clear(guildId, kind === 'all' ? null : kind);
        await logModeration({ guildId, action: `ai_memory_clear_${kind}`, moderatorId: interaction.user.id });
        return respond.send(interaction, { embeds: [eb.success(`انمسح ${n} عنصر من ذاكرة المساعد.`, '🗑️ تم المسح')] });
      }

      // الحالة
      const data = await aiMemory.list(guildId);
      return respond.send(interaction, {
        embeds: [eb.info(`${statusText()}\n\n**🧠 الذاكرة:** ${data.instructions.length} تعليمة · ${data.qa.length} سؤال معتمد`, '🤖 حالة المساعد الذكي')]
      });
    } catch (err) {
      if (!err.userFacing) logger.error('🧠 خطأ بأمر ذاكرة المساعد', { guildId, sub, error: err });
      return respond.send(interaction, { embeds: [eb.error(err.userFacing ? err.message : 'ما قدرت أكمل الحين — جرّب مرة ثانية.')] });
    }
  }
};
