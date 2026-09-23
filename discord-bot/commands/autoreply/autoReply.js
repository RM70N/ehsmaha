'use strict';

// /الردود_التلقائية — لوحة للإدارة لإدارة الردود التلقائية:
//   ➕ رد مطابق   ← نافذة بنص الشاشة: "الكلمة" + "رد البوت" (الرسالة كاملة لازم تساويها)
//   ➕ رد يحتوي   ← نفس النافذة، بس البوت يرد لو الكلمة موجودة داخل أي رسالة
//   🗑️ حذف        ← قائمة تختار منها ردود تحذفها
// كل الأزرار/النوافذ بمعرّفات ثابتة (ar:...) — تشتغل حتى بعد إعادة التشغيل.

const {
  SlashCommandBuilder,
  InteractionContextType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const customId = require('../../utils/customId');
const store = require('../../database/botStore');
const autoReply = require('../../services/autoReply');
const { guardAdmin, checkAdminPermission, denyPayload, withStorageNotice } = require('../../utils/adminPermissions');
const { logModeration } = require('../../utils/moderation');

const SHOWN = 25;
const TYPE_LABEL = { exact: '🎯 مطابق', contains: '🔎 يحتوي' };

const INTENT_NOTE =
  '\n\n⚠️ **Message Content Intent غير مفعّل** — البوت ما يقدر يقرأ الرسائل فما بيرد لين تفعّله: discord.com/developers → احسمها → Bot → **Message Content Intent**.';

function clip(text, max) {
  const t = String(text).replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

// ---------------- اللوحة ----------------
function panel(list, { note = null, deletePage = null, intentOff = false } = {}) {
  const lines = list.slice(0, SHOWN).map(
    (r, i) => `\`${i + 1}\` ${TYPE_LABEL[r.match_type]} **${eb.safeName(clip(r.trigger_text, 40))}** ← ${eb.safeName(clip(r.response, 60))}`
  );
  const embed = eb.brand({
    tone: 'primary',
    title: `💬 الردود التلقائية (${list.length}/${autoReply.MAX_REPLIES})`,
    description:
      (note ? `${note}\n\n` : '') +
      (lines.length ? lines.join('\n') : 'ما فيه ردود بعد — اضغط **➕** تحت وأضف أول رد.') +
      (list.length > SHOWN ? `\n…و **${list.length - SHOWN}** رد ثاني` : '') +
      '\n\n🎯 **مطابق:** يرد لو الرسالة كاملة هي الكلمة (مثل: السلام عليكم)\n' +
      '🔎 **يحتوي:** يرد لو الكلمة موجودة داخل الرسالة (مثل: احسمها)\n' +
      '`{يوزر}` بالرد = منشن للعضو' +
      (intentOff ? INTENT_NOTE : '')
  });

  const full = list.length >= autoReply.MAX_REPLIES;
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(customId.build('ar', 'add', 'exact')).setStyle(ButtonStyle.Success).setLabel('رد مطابق').setEmoji('➕').setDisabled(full),
      new ButtonBuilder().setCustomId(customId.build('ar', 'add', 'contains')).setStyle(ButtonStyle.Primary).setLabel('رد يحتوي').setEmoji('➕').setDisabled(full),
      new ButtonBuilder().setCustomId(customId.build('ar', 'del', 0)).setStyle(ButtonStyle.Danger).setLabel('حذف').setEmoji('🗑️').setDisabled(!list.length),
      new ButtonBuilder().setCustomId(customId.build('ar', 'refresh')).setStyle(ButtonStyle.Secondary).setEmoji('🔄')
    )
  ];

  // قائمة الحذف (25 خيار بالصفحة — حد ديسكورد)
  if (deletePage !== null && list.length) {
    const pages = Math.ceil(list.length / 25);
    const page = Math.min(Math.max(0, deletePage), pages - 1);
    const slice = list.slice(page * 25, page * 25 + 25);
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(customId.build('ar', 'delsel', page))
          .setPlaceholder('اختر الردود اللي تبي تحذفها')
          .setMinValues(1)
          .setMaxValues(slice.length)
          .addOptions(
            slice.map((r) => ({
              label: clip(r.trigger_text, 100),
              description: clip(`${r.match_type === 'exact' ? 'مطابق' : 'يحتوي'} ← ${r.response}`, 100),
              value: String(r.id)
            }))
          )
      )
    );
    if (pages > 1) {
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(customId.build('ar', 'del', page - 1)).setStyle(ButtonStyle.Secondary).setLabel('السابق').setDisabled(page === 0),
          new ButtonBuilder().setCustomId(customId.build('ar', 'pg', page)).setStyle(ButtonStyle.Secondary).setLabel(`${page + 1} / ${pages}`).setDisabled(true),
          new ButtonBuilder().setCustomId(customId.build('ar', 'del', page + 1)).setStyle(ButtonStyle.Secondary).setLabel('التالي').setDisabled(page >= pages - 1)
        )
      );
    }
  }
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

function modal(type) {
  return new ModalBuilder()
    .setCustomId(customId.build('ar', 'modal', type))
    .setTitle(type === 'exact' ? 'رد تلقائي — مطابق' : 'رد تلقائي — يحتوي')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('trigger')
          .setLabel(type === 'exact' ? 'وش يكتب العضو؟' : 'الكلمة اللي لو انكتبت يرد البوت')
          .setPlaceholder(type === 'exact' ? 'السلام عليكم' : 'احسمها')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(autoReply.MAX_TRIGGER)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('response')
          .setLabel('وش يرد البوت؟')
          .setPlaceholder('وعليكم السلام ورحمة الله {يوزر} 🌹')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(1)
          .setMaxLength(autoReply.MAX_RESPONSE)
          .setRequired(true)
      )
    );
}

async function isAdmin(interaction) {
  try {
    return (await checkAdminPermission(interaction.member)).allowed;
  } catch (_) {
    return false;
  }
}

// تحديث رسالة اللوحة (المكان اللي انضغط فيه الزر)، وإلا رد جديد مخفي
async function showPanel(interaction, payload) {
  if (interaction.isButton() || interaction.isStringSelectMenu() || (interaction.isModalSubmit() && interaction.isFromMessage && interaction.isFromMessage())) {
    return interaction.update(payload);
  }
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('الردود_التلقائية')
    .setDescription('🛡️ (للإدارة) إضافة وحذف ردود تلقائية (مثل: السلام عليكم ← وعليكم السلام)')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, ctx) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction))) return;
    const list = await store.autoReplies.list(interaction.guildId);
    return respond.send(interaction, withStorageNotice(panel(list, { intentOff: ctx && ctx.messageContentIntent === false })));
  },

  buttons: {
    // ar:add:<type> | ar:modal:<type> | ar:del:<page> | ar:delsel:<page> | ar:refresh
    async ar(interaction, args, ctx) {
      if (!interaction.inGuild()) return;
      const [action, arg] = args;
      if (!(await isAdmin(interaction))) {
        return interaction.reply({ ...denyPayload('admin'), flags: MessageFlags.Ephemeral });
      }
      const guildId = interaction.guildId;
      const intentOff = ctx && ctx.messageContentIntent === false;

      if (action === 'add') {
        const type = arg === 'contains' ? 'contains' : 'exact';
        if ((await store.autoReplies.count(guildId)) >= autoReply.MAX_REPLIES) {
          return showPanel(interaction, panel(await store.autoReplies.list(guildId), { note: `⚠️ وصلت الحد (${autoReply.MAX_REPLIES} رد) — احذف ردود قبل ما تضيف.`, intentOff }));
        }
        return interaction.showModal(modal(type)); // النافذة بنص الشاشة
      }

      if (action === 'modal') {
        const type = arg === 'contains' ? 'contains' : 'exact';
        const trigger = interaction.fields.getTextInputValue('trigger').trim();
        const response = interaction.fields.getTextInputValue('response').trim();
        const norm = autoReply.normalize(trigger);
        let note;
        if (!norm || !response) {
          note = '⚠️ الكلمة أو الرد فاضي — جرّب مرة ثانية.';
        } else if ((await store.autoReplies.count(guildId)) >= autoReply.MAX_REPLIES) {
          note = `⚠️ وصلت الحد (${autoReply.MAX_REPLIES} رد).`;
        } else {
          const id = await store.autoReplies.add({ guildId, trigger, triggerNorm: norm, response, matchType: type, createdBy: interaction.user.id });
          if (id) {
            autoReply.invalidate(guildId);
            await logModeration({ guildId, action: 'autoreply_add', moderatorId: interaction.user.id, details: { id, trigger, type } });
            note = `✅ تمت الإضافة: ${TYPE_LABEL[type]} **${eb.safeName(clip(trigger, 60))}** ← ${eb.safeName(clip(response, 80))}`;
          } else {
            note = `⚠️ **${eb.safeName(clip(trigger, 60))}** مضافة من قبل — احذف القديمة لو تبي تغيّر ردها.`;
          }
        }
        return showPanel(interaction, withStorageNotice(panel(await store.autoReplies.list(guildId), { note, intentOff })));
      }

      if (action === 'del') {
        return showPanel(interaction, panel(await store.autoReplies.list(guildId), { deletePage: Number.parseInt(arg, 10) || 0, intentOff }));
      }

      if (action === 'delsel') {
        const ids = (interaction.values || []).map((v) => Number.parseInt(v, 10)).filter(Number.isSafeInteger);
        const removed = await store.autoReplies.remove(guildId, ids);
        autoReply.invalidate(guildId);
        if (removed.length) {
          await logModeration({ guildId, action: 'autoreply_remove', moderatorId: interaction.user.id, details: { ids: removed.map((r) => r.id) } });
        }
        const note = removed.length
          ? `🗑️ انحذف: ${removed.map((r) => `**${eb.safeName(clip(r.trigger_text, 40))}**`).join('، ')}`
          : '⚠️ ما لقيت الردود المختارة (يمكن انحذفت من قبل).';
        return showPanel(interaction, withStorageNotice(panel(await store.autoReplies.list(guildId), { note, intentOff })));
      }

      if (action === 'refresh') {
        return showPanel(interaction, panel(await store.autoReplies.list(guildId), { intentOff }));
      }
      return undefined;
    }
  },

  _internal: { panel, modal }
};
