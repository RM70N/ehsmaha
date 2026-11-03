'use strict';

// أدوات تربط المالك بأنظمة البوت الأصلية (قراءة فقط) — تعيد استخدام الخدمات الموجودة
// بدل ما تعيد كتابتها: التكتات، ألعاب ديسكورد، أسلوب المساعد، حالة البوت والمفاتيح.

const store = require('../../../database/botStore');
const gamesConfig = require('../../../config/games');
const gemini = require('../../gemini');
const kit = require('../toolKit');

const { defineTool } = kit;

const ticketsStatus = defineTool({
  name: 'tickets_status',
  label: 'حالة التكتات',
  description: 'يعرض عدد تكتات الدعم المفتوحة وأحدثها.',
  risk: 'read',
  schema: { type: 'object', properties: {} },
  describe: () => 'حالة التكتات',
  async run(ctx) {
    const n = await store.tickets.openCount(ctx.guild.id);
    const list = await store.tickets.openList(ctx.guild.id, 5);
    const lines = list.map((t) => `• تكت #${t.id} — <@${t.discord_id}>${t.channel_id ? ` (<#${t.channel_id}>)` : ''}`);
    return { outputs: { count: n }, done: `🎫 التكتات المفتوحة: **${n}**${lines.length ? `\n${lines.join('\n')}` : ''}`, doneVerb: 'عرضت حالة التكتات' };
  },
  failVerb: 'أعرض التكتات'
});

const gamesList = defineTool({
  name: 'games_list',
  label: 'ألعاب البوت',
  description: 'يعرض ألعاب ديسكورد الموجودة بالبوت.',
  risk: 'read',
  schema: { type: 'object', properties: {} },
  describe: () => 'ألعاب البوت',
  async run() {
    const games = (Array.isArray(gamesConfig) ? gamesConfig : []).filter((g) => g && g.name);
    const lines = games.map((g) => `• **${g.name}**${g.command ? ` (\`${g.command}\`)` : ''}`);
    return { outputs: { count: games.length }, done: `🎮 ألعاب البوت (${games.length}):\n${lines.join('\n') || 'ما فيه ألعاب.'}`, doneVerb: 'عرضت الألعاب' };
  },
  failVerb: 'أعرض الألعاب'
});

const aiStyleStatus = defineTool({
  name: 'ai_style_status',
  label: 'حالة تعلّم الأسلوب',
  description: 'يعرض حالة تعلّم أسلوب المساعد (عدد الأمثلة المحفوظة).',
  risk: 'read',
  schema: { type: 'object', properties: {} },
  describe: () => 'حالة تعلّم الأسلوب',
  async run(ctx) {
    const s = await store.guildSettings.get(ctx.guild.id);
    const n = await store.aiStyle.count(ctx.guild.id);
    return { outputs: { count: n }, done: `🎨 تعلّم الأسلوب: ${s.ai_style_enabled ? 'شغّال' : 'متوقف'} · الأمثلة المحفوظة: ${n} / ${store.aiStyle.MAX}`, doneVerb: 'عرضت حالة تعلّم الأسلوب' };
  },
  failVerb: 'أعرض حالة الأسلوب'
});

const botStatus = defineTool({
  name: 'bot_status',
  label: 'حالة البوت',
  description: 'يعرض حالة البوت: زمن الاستجابة، مدة التشغيل، عدد السيرفرات، وحالة مفاتيح Gemini (بدون المفاتيح نفسها).',
  risk: 'read',
  schema: { type: 'object', properties: {} },
  describe: () => 'حالة البوت',
  async run(ctx) {
    const c = ctx.client || {};
    const g = gemini.status();
    const cooling = g.keys.filter((k) => k.cooling).length;
    const up = c.uptime ? `${Math.floor(c.uptime / 3600000)} ساعة` : '—';
    return {
      outputs: {},
      done: `🤖 البوت شغّال · الاستجابة ${c.ws && c.ws.ping >= 0 ? `${Math.round(c.ws.ping)}ms` : '—'} · التشغيل ${up} · السيرفرات ${c.guilds && c.guilds.cache ? c.guilds.cache.size : '—'}\n🔑 مفاتيح Gemini: ${g.keys.length} (النشط رقم ${g.activeKey}${cooling ? ` · ${cooling} ترتاح بسبب الحد` : ''}) · النموذج ${g.model}`,
      doneVerb: 'عرضت حالة البوت'
    };
  },
  failVerb: 'أعرض حالة البوت'
});

module.exports = [ticketsStatus, gamesList, aiStyleStatus, botStatus];
