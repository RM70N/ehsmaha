'use strict';

// /سجل_تحذيرات عضو:<عضو> — كل تحذيرات العضو (الأحدث أولاً)، 10 بالصفحة.
// الرقم التسلسلي ثابت: #1 = أقدم تحذير — نفس الرقم المستخدم بأمر /حذف_تحذير.

const { SlashCommandBuilder, InteractionContextType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const customId = require('../../utils/customId');
const store = require('../../database/botStore');
const { guardAdmin, checkAdminPermission, denyPayload } = require('../../utils/adminPermissions');

const PAGE_SIZE = 10;

function buildPage(user, list, page, ownerId) {
  const newestFirst = [...list].reverse();
  const totalPages = Math.max(1, Math.ceil(newestFirst.length / PAGE_SIZE));
  const current = Math.min(Math.max(0, page), totalPages - 1);
  const slice = newestFirst.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const embed = eb.brand({
    tone: 'gold',
    title: `📋 سجل تحذيرات ${eb.safeName(user.username)}`,
    description: list.length
      ? `🔢 العدد الكلي: **${list.length}** تحذير`
      : 'ما عنده أي تحذير مسجّل ✅',
    thumbnail: user.displayAvatarURL ? user.displayAvatarURL({ size: 128 }) : undefined
  });
  if (slice.length) {
    embed.addFields(
      slice.map((w) =>
        eb.field(
          `#${w.seq} · ${w.warning_role_given}`,
          `📝 ${eb.clip(w.reason, 300)}\n🛡️ بواسطة <@${w.issued_by}> · 🕒 ${eb.discordDate(w.issued_at, 'f')}`,
          false
        )
      )
    );
  }
  if (totalPages > 1) embed.setAuthor({ name: `صفحة ${current + 1} من ${totalPages}` });

  const components = [];
  if (totalPages > 1) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(customId.build('wr', 'page', user.id, current - 1, ownerId)).setStyle(ButtonStyle.Secondary).setLabel('الأحدث').setEmoji('◀️').setDisabled(current === 0),
        new ButtonBuilder().setCustomId(customId.build('wr', 'noop', current)).setStyle(ButtonStyle.Secondary).setLabel(`${current + 1} / ${totalPages}`).setDisabled(true),
        new ButtonBuilder().setCustomId(customId.build('wr', 'page', user.id, current + 1, ownerId)).setStyle(ButtonStyle.Secondary).setLabel('الأقدم').setEmoji('▶️').setDisabled(current >= totalPages - 1)
      )
    );
  }
  return { embeds: [embed], components };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('سجل_تحذيرات')
    .setDescription('🛡️ (للإدارة) يعرض كل تحذيرات عضو')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('عضو').setDescription('العضو').setRequired(true)),

  async execute(interaction) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction))) return;
    const user = interaction.options.getUser('عضو', true);
    const list = await store.warnings.list(interaction.guildId, user.id);
    return respond.send(interaction, buildPage(user, list, 0, interaction.user.id));
  },

  buttons: {
    // wr:page:<targetId>:<page>:<ownerId>
    async wr(interaction, args) {
      const [action, targetId, pageRaw, ownerId] = args;
      if (action !== 'page' || !interaction.inGuild()) return;
      if (ownerId !== interaction.user.id) {
        return respond.send(interaction, { embeds: [eb.warning('هذا السجل لشخص ثاني — استخدم **`/سجل_تحذيرات`**.')] }, { ephemeral: true });
      }
      // الصلاحية تُفحص من جديد (ممكن انسحبت منه بعد فتح السجل)
      if (!(await checkAdminPermission(interaction.member)).allowed) return respond.send(interaction, denyPayload('admin'), { ephemeral: true });
      if (!(await respond.deferUpdate(interaction))) return;
      const user = await interaction.client.users.fetch(targetId).catch(() => ({ id: targetId, username: targetId }));
      const list = await store.warnings.list(interaction.guildId, targetId);
      return respond.send(interaction, buildPage(user, list, Number.parseInt(pageRaw, 10) || 0, ownerId));
    }
  },

  _internal: { buildPage }
};
