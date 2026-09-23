'use strict';

// /احداث — الفعاليات والبطولات النشطة حالياً بالموقع (فعالية "أفضل ستريمر"،
// فعالية "عدد جديد"...). لو ما فيه فعاليات — أو الـEndpoint غير متوفر أصلاً —
// نعرض رسالة أنيقة "لا توجد فعاليات نشطة حالياً" بدل رسالة خطأ.

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const api = require('../../utils/apiClient');
const eb = require('../../utils/embedBuilder');
const cache = require('../../utils/cache');
const respond = require('../../utils/respond');
const { friendlyMessage } = require('../../utils/errors');
const { loadConfig } = require('../../config');

const EVENTS_CACHE_SECONDS = 60;
const MAX_SHOWN = 10;

function noEventsMessage() {
  const config = loadConfig();
  const embed = eb
    .brand({
      tone: 'deep',
      title: '🎪 الفعاليات',
      description:
        '**لا توجد فعاليات نشطة حالياً** 🌙\n\n' +
        'تابع الموقع وسيرفر الديسكورد — أول ما تنطلق فعالية أو بطولة جديدة بتلقاها هنا ✨'
    })
    .setThumbnail(config.logoUrl);
  return { embeds: [embed], components: [siteRow(config.siteUrl)] };
}

function siteRow(url) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('زيارة الموقع').setEmoji('🌐').setURL(url)
  );
}

function eventsMessage(events) {
  const config = loadConfig();
  const embed = eb
    .brand({
      tone: 'gold',
      title: `🎪 الفعاليات النشطة (${events.length})`,
      url: config.siteUrl,
      description: 'الفعاليات والبطولات الشغّالة الحين بموقع احسمها:'
    })
    .setThumbnail(config.logoUrl);

  const fields = events.slice(0, MAX_SHOWN).map((ev) => {
    const lines = [];
    if (ev.description) lines.push(eb.clip(ev.description, 300));
    if (ev.statusLabel) lines.push(`📌 الحالة: **${ev.statusLabel}**`);
    if (ev.startsAt) lines.push(`🚀 بدأت ${eb.discordDate(ev.startsAt, 'R')}`);
    if (ev.endsAt) lines.push(`⏳ تنتهي ${eb.discordDate(ev.endsAt, 'R')} (${eb.discordDate(ev.endsAt, 'f')})`);
    return eb.field(`${ev.icon || '🏆'} ${ev.title || 'فعالية'}`, lines.join('\n') || 'فعالية نشطة الآن', false);
  });
  embed.addFields(fields);
  return { embeds: [embed], components: [siteRow(config.siteUrl)] };
}

module.exports = {
  data: new SlashCommandBuilder().setName('احداث').setDescription('يعرض الفعاليات والبطولات النشطة حالياً في احسمها'),

  async execute(interaction) {
    if (!(await respond.defer(interaction))) return;
    try {
      const data = await cache.remember('events:active', EVENTS_CACHE_SECONDS, () => api.getEvents());
      const events = Array.isArray(data && data.events) ? data.events : [];
      return respond.send(interaction, events.length ? eventsMessage(events) : noEventsMessage());
    } catch (err) {
      // الـEndpoint غير موجود بالسيرفر = ما فيه نظام فعاليات مفعّل → نفس رسالة "لا توجد"
      if (err.code === 'NOT_FOUND') return respond.send(interaction, noEventsMessage());
      return respond.send(interaction, { embeds: [eb.error(friendlyMessage(err))] });
    }
  },

  _internal: { eventsMessage, noEventsMessage }
};
