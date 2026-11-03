'use strict';

// أدوات معلومات السيرفر (قراءة فقط): إحصائيات، شجرة الرومات.

const { ChannelType } = require('discord.js');
const kit = require('../toolKit');

const { defineTool } = kit;

const serverStats = defineTool({
  name: 'server_stats',
  label: 'إحصائيات السيرفر',
  description: 'يعرض إحصائيات السيرفر: الأعضاء، الرومات، الرتب، البوستات.',
  risk: 'read',
  schema: { type: 'object', properties: {} },
  describe: () => 'إحصائيات السيرفر',
  async run(ctx) {
    const g = ctx.guild;
    const all = [...g.channels.cache.values()];
    const count = (types) => all.filter((c) => types.includes(c.type)).length;
    const lines = [
      `📊 **${g.name}**`,
      `👥 الأعضاء: ${g.memberCount !== undefined ? g.memberCount : g.members.cache.size}`,
      `💬 رومات كتابية: ${count([ChannelType.GuildText, ChannelType.GuildAnnouncement])} · 🔊 صوتية: ${count([ChannelType.GuildVoice, ChannelType.GuildStageVoice])} · 📁 أقسام: ${count([ChannelType.GuildCategory])}`,
      `🎭 الرتب: ${Math.max(0, g.roles.cache.size - 1)}`,
      g.premiumSubscriptionCount !== undefined ? `💎 البوستات: ${g.premiumSubscriptionCount} (المستوى ${g.premiumTier || 0})` : null
    ].filter(Boolean);
    return { outputs: { count: all.length }, done: lines.join('\n'), doneVerb: 'عرضت إحصائيات السيرفر' };
  },
  failVerb: 'أعرض إحصائيات السيرفر'
});

const listChannels = defineTool({
  name: 'list_channels',
  label: 'عرض الرومات',
  description: 'يعرض الرومات مرتبة حسب الأقسام.',
  risk: 'read',
  schema: { type: 'object', properties: { category: { type: 'string', 'x-entity': 'category', description: 'قسم محدد (اختياري)' } } },
  describe: () => 'عرض الرومات',
  async run(ctx, a) {
    const all = [...ctx.guild.channels.cache.values()].filter((c) => c.type !== ChannelType.PublicThread && c.type !== ChannelType.PrivateThread && c.type !== ChannelType.AnnouncementThread);
    const cats = all.filter((c) => c.type === ChannelType.GuildCategory && (!a.category || c.id === a.category.id)).sort((x, y) => (x.position || 0) - (y.position || 0));
    const out = [];
    const children = (parentId) => all.filter((c) => c.parentId === parentId && c.type !== ChannelType.GuildCategory).sort((x, y) => (x.position || 0) - (y.position || 0));
    for (const cat of cats) {
      out.push(`📁 **${cat.name}**`);
      for (const ch of children(cat.id)) out.push(`  ${ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice ? '🔊' : '#'} <#${ch.id}>`);
    }
    if (!a.category) {
      const loose = children(null).concat(children(undefined)).filter((c, i, arr) => arr.indexOf(c) === i);
      if (loose.length) {
        out.push('**بدون قسم:**');
        for (const ch of loose) out.push(`  ${ch.type === ChannelType.GuildVoice ? '🔊' : '#'} <#${ch.id}>`);
      }
    }
    return { outputs: { count: all.length }, done: out.length ? `🗂️ الرومات:\n${out.slice(0, 80).join('\n')}${out.length > 80 ? '\n…' : ''}` : 'ما فيه رومات.', doneVerb: 'عرضت الرومات' };
  },
  failVerb: 'أعرض الرومات'
});

module.exports = [serverStats, listChannels];
