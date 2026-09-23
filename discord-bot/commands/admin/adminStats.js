'use strict';

// /ادمن_احصائيات — إحصائيات عامة (للإدارة فقط): حسابات الموقع، اللاعبين، استدعاءات
// الـAPI اليوم، استخدام البوت، حالة الاتصال.
// الصلاحية: Administrator بالسيرفر، أو معرّف ضمن ADMIN_IDS بالـ.env.
// ما نستخدم setDefaultMemberPermissions هنا عمداً — لأنه يخفي الأمر عن أصحاب
// ADMIN_IDS اللي ما عندهم Administrator بالسيرفر. التحقق يصير داخل الأمر نفسه.

const { SlashCommandBuilder, version: djsVersion } = require('discord.js');
const api = require('../../utils/apiClient');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const usageStats = require('../../utils/usageStats');
const cache = require('../../utils/cache');
const logger = require('../../utils/logger');
const { isBotAdmin } = require('../../utils/permissions');
const { friendlyMessage } = require('../../utils/errors');

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d ? `${d} يوم` : null, h ? `${h} ساعة` : null, `${m} دقيقة`].filter(Boolean).join(' و');
}

module.exports = {
  data: new SlashCommandBuilder().setName('ادمن_احصائيات').setDescription('🛡️ (للإدارة) إحصائيات استخدام البوت والموقع'),

  async execute(interaction) {
    if (!isBotAdmin(interaction)) {
      logger.warn('محاولة استخدام أمر إداري بدون صلاحية', { userId: interaction.user.id, guildId: interaction.guildId });
      return respond.send(
        interaction,
        { embeds: [eb.error('هذا الأمر مخصص لإدارة البوت فقط 🛡️\nتحتاج صلاحية **Administrator** بالسيرفر أو تكون ضمن قائمة المشرفين.', '⛔ غير مصرّح')] },
        { ephemeral: true }
      );
    }

    if (!(await respond.defer(interaction, { ephemeral: true }))) return;

    const bot = usageStats.snapshot();
    const botCalls = api.usage();
    const client = interaction.client;

    let remote = null;
    let remoteError = null;
    try {
      remote = await api.getAdminStats();
    } catch (err) {
      remoteError = friendlyMessage(err);
    }

    const embed = eb.brand({ tone: 'gold', title: '🛡️ إحصائيات بوت احسمها', description: `📅 اليوم: **${bot.day}** (UTC)` });

    if (remote) {
      embed.addFields(
        eb.field('👥 حسابات الموقع', remote.registeredUsers != null ? `**${eb.formatNumber(remote.registeredUsers)}**` : '—'),
        eb.field('🎮 لاعبين لهم خبرة', remote.rankedPlayers != null ? `**${eb.formatNumber(remote.rankedPlayers)}**` : '—'),
        eb.field('🔥 نشطين اليوم', remote.activeToday != null ? `**${eb.formatNumber(remote.activeToday)}**` : '—'),
        eb.field('📡 استدعاءات الـAPI اليوم', `**${eb.formatNumber(remote.apiCallsToday)}**\nأخطاء: ${eb.formatNumber(remote.apiErrorsToday)}`),
        eb.field('🖥️ تشغيل الـAPI', formatUptime((remote.uptimeSeconds || 0) * 1000))
      );
    } else {
      embed.addFields(eb.field('📡 طبقة الـAPI', `⚠️ ${remoteError}`, false));
    }

    const topCommands = bot.top.length ? bot.top.map(([n, c]) => `\`/${n}\` × ${c}`).join('\n') : 'لا يوجد بعد';
    const cacheStats = cache.stats();
    embed.addFields(
      eb.field('⌨️ أوامر اليوم', `**${eb.formatNumber(bot.commands)}**\nأزرار: ${eb.formatNumber(bot.buttons)} · أخطاء: ${eb.formatNumber(bot.errors)}`),
      eb.field('📤 طلبات البوت للـAPI اليوم', `**${eb.formatNumber(botCalls.calls)}**\nفشل: ${eb.formatNumber(botCalls.failures)}`),
      eb.field('🏅 الأكثر استخداماً', topCommands),
      eb.field('🌍 السيرفرات', `**${eb.formatNumber(client.guilds.cache.size)}**`),
      eb.field('📶 Ping', `${Math.max(0, Math.round(client.ws.ping))}ms`),
      eb.field('⏱️ تشغيل البوت', formatUptime(Date.now() - bot.startedAt)),
      eb.field('🧠 الكاش', `إصابات: ${cacheStats.hits} · مفاتيح: ${cacheStats.keys}`),
      eb.field('🧩 الإصدارات', `Node ${process.version} · discord.js ${djsVersion}`)
    );

    return respond.send(interaction, { embeds: [embed] });
  },

  _internal: { formatUptime }
};
