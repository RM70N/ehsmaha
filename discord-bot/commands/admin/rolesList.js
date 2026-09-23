'use strict';

// /عرض_الرتب — كل رتب السيرفر مرتبة تنازلياً حسب موضعها، مع عدد أعضاء كل رتبة
// و🛡️ بجانب الرتب المسجّلة كرتب إدارية بالبوت (admin_roles).
// عدّ الأعضاء يحتاج Server Members Intent (Developer Portal → Bot) — بدونه يظهر "—".

const { SlashCommandBuilder, InteractionContextType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const customId = require('../../utils/customId');
const logger = require('../../utils/logger');
const { guardAdmin, loadGuild, checkAdminPermission, denyPayload } = require('../../utils/adminPermissions');

const PAGE_SIZE = 20;
const MEMBERS_FETCH_TTL_MS = 5 * 60 * 1000;
const lastMembersFetch = new Map(); // guildId -> ms

// جلب كل الأعضاء مرة كل 5 دقائق كحد أقصى (لعدّ دقيق لأعضاء كل رتبة)
async function ensureMembers(guild, enabled) {
  if (!enabled) return false;
  const last = lastMembersFetch.get(guild.id) || 0;
  if (Date.now() - last < MEMBERS_FETCH_TTL_MS) return true; // الكاش حديث — الأعضاء الجدد يوصلون بأحداث GuildMembers
  try {
    await guild.members.fetch({ time: 20_000 });
    lastMembersFetch.set(guild.id, Date.now());
    return true;
  } catch (err) {
    logger.warn('تعذّر جلب أعضاء السيرفر لعدّ الرتب', { guildId: guild.id, code: err.code });
    return false;
  }
}

async function buildPage(guild, page, ownerId, counted) {
  const cfg = await loadGuild(guild.id);
  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id) // @everyone
    .sort((a, b) => b.position - a.position);
  const totalPages = Math.max(1, Math.ceil(roles.length / PAGE_SIZE));
  const current = Math.min(Math.max(0, page), totalPages - 1);
  const slice = roles.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const lines = slice.map((r) => {
    const admin = cfg.roles.has(r.id) ? '🛡️ ' : '';
    const bot = r.managed ? ' 🤖' : '';
    const count = counted ? `**${r.members.size}** عضو` : '—';
    return `${admin}${r} — ${count}${bot}`;
  });

  const adminRoleCount = roles.filter((r) => cfg.roles.has(r.id)).length;
  const embed = eb.brand({
    tone: 'primary',
    title: `🎭 رتب السيرفر (${roles.length})`,
    description:
      `🛡️ = رتبة إدارية مسجّلة بالبوت (**${adminRoleCount}**) · 🤖 = رتبة بوت/تكامل\n` +
      (counted ? '' : '⚠️ عدد الأعضاء غير متاح — فعّل **Server Members Intent** من Discord Developer Portal → Bot.\n') +
      '\n' +
      (lines.join('\n') || 'لا توجد رتب.')
  });
  if (current === 0) {
    const users = [...cfg.users];
    embed.addFields(eb.field(`👤 الأدمن المضافين بالبوت (${users.length})`, users.length ? users.slice(0, 30).map((id) => `<@${id}>`).join(' ') : 'لا يوجد', false));
  }
  if (totalPages > 1) embed.setAuthor({ name: `صفحة ${current + 1} من ${totalPages}` });

  const components = [];
  if (totalPages > 1) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(customId.build('rl', 'page', current - 1, ownerId)).setStyle(ButtonStyle.Secondary).setLabel('السابق').setEmoji('◀️').setDisabled(current === 0),
        new ButtonBuilder().setCustomId(customId.build('rl', 'noop', current)).setStyle(ButtonStyle.Secondary).setLabel(`${current + 1} / ${totalPages}`).setDisabled(true),
        new ButtonBuilder().setCustomId(customId.build('rl', 'page', current + 1, ownerId)).setStyle(ButtonStyle.Secondary).setLabel('التالي').setEmoji('▶️').setDisabled(current >= totalPages - 1)
      )
    );
  }
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('عرض_الرتب')
    .setDescription('🛡️ (للإدارة) يعرض رتب السيرفر وعدد أعضائها ويميّز الرتب الإدارية')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, ctx) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction))) return;
    const counted = await ensureMembers(interaction.guild, !!(ctx && ctx.membersIntent));
    return respond.send(interaction, await buildPage(interaction.guild, 0, interaction.user.id, counted));
  },

  buttons: {
    // rl:page:<page>:<ownerId>
    async rl(interaction, args, ctx) {
      const [action, pageRaw, ownerId] = args;
      if (action !== 'page' || !interaction.inGuild()) return;
      if (ownerId !== interaction.user.id) {
        return respond.send(interaction, { embeds: [eb.warning('هذي القائمة لشخص ثاني — استخدم **`/عرض_الرتب`**.')] }, { ephemeral: true });
      }
      if (!(await checkAdminPermission(interaction.member)).allowed) return respond.send(interaction, denyPayload('admin'), { ephemeral: true });
      if (!(await respond.deferUpdate(interaction))) return;
      const counted = await ensureMembers(interaction.guild, !!(ctx && ctx.membersIntent));
      return respond.send(interaction, await buildPage(interaction.guild, Number.parseInt(pageRaw, 10) || 0, ownerId, counted));
    }
  },

  _internal: { buildPage }
};
