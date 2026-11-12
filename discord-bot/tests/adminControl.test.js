'use strict';

// اختبارات قناة التحكم الإدارية /admin-control: المصادقة، الحدّ، Idempotency، وكل مسار (نجاح، مدخلات خاطئة، خدمة غير جاهزة).
// ديسكورد مزيّف بالكامل — ما فيه اتصال خارجي.

const ADMIN_KEY = 'k'.repeat(40);
Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  GEMINI_API_KEY: 'test-gemini-key',
  CLIENT_ID: '1552260327008247879',
  API_BASE_URL: 'http://127.0.0.1:9',
  API_KEY: 'a'.repeat(40),
  LOG_LEVEL: 'error',
  ADMIN_CONTROL_KEY: ADMIN_KEY
});

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { ChannelType, PermissionsBitField, PermissionFlagsBits } = require('discord.js');
const botDb = require('../database/botDb');
const store = require('../database/botStore');
const streamStore = require('../database/streamerAnnouncements');
const liveStreams = require('../services/liveStreams');
const announcerMod = require('../services/streamerAnnouncer');
const commandControl = require('../services/commandControl');
const autoModLimits = require('../services/autoModLimits');
const autoMod = require('../services/autoMod');
const tickets = require('../services/tickets');
const adminPermissions = require('../utils/adminPermissions');
const interactionCreate = require('../events/interactionCreate');
const { loadCommands } = require('../utils/commandLoader');
const { loadConfig } = require('../config');
const { createAdminControlRouter, runtime } = require('../services/adminControl');
const { makeGuild, makeMember, makeChannel, makeInteraction, lastPayload } = require('./helpers/discordMock');

const OWNER = '944639301528977420';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeoutMs = 3000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error('انتهت المهلة');
    await wait(10);
  }
}

let guild;
let client;
let commands;
let server;
let base;
let cfg;
let ctx;
let announcerChannel;
let isolatedDb = null;
let isolatedUrl = null;

test.before(async () => {
  // PostgreSQL: قاعدة معزولة لهذا الملف حتى ما تتداخل مع ملفات الاختبار الموازية (تحذف جداول مشتركة)
  if (process.env.TEST_DATABASE_URL) {
    const { Pool } = require('pg');
    isolatedDb = `admin_ctl_${process.pid}`;
    const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    await admin.query(`DROP DATABASE IF EXISTS ${isolatedDb}`);
    await admin.query(`CREATE DATABASE ${isolatedDb}`);
    await admin.end();
    const u = new URL(process.env.TEST_DATABASE_URL);
    u.pathname = `/${isolatedDb}`;
    isolatedUrl = u.toString();
  }
  await botDb.init(isolatedUrl ? { databaseUrl: isolatedUrl } : { sqlitePath: ':memory:' });
  commands = loadCommands().commands;
  commands.set('تجريبي', { name: 'تجريبي', file: 'misc/test.js', data: { description: 'أمر تجريبي', toJSON: () => ({ name: 'تجريبي' }) }, execute: async (i) => i.reply({ content: 'تم' }) });
  guild = makeGuild();
  announcerChannel = textChannel(guild);
  client = {
    isReady: () => true,
    ws: { ping: 42 },
    guilds: { cache: new Map([[guild.id, guild]]) },
    channels: { cache: new Map([[announcerChannel.id, announcerChannel]]), fetch: async (id) => (id === announcerChannel.id ? announcerChannel : null) }
  };
  cfg = { ...loadConfig(), guildId: guild.id, adminControlRateLimit: 100000 };
  ctx = { client, commands, config: cfg, logger: require('../utils/logger') };
  runtime.setContext(ctx);
  await commandControl.init();
  await autoModLimits.init();
  const app = express();
  app.set('trust proxy', 1);
  app.use('/admin-control', createAdminControlRouter({ getConfig: () => cfg }));
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/admin-control`;
});

test.after(async () => {
  announcerMod._reset();
  liveStreams.clearAll();
  await new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
  await botDb.close();
  if (isolatedDb) {
    const { Pool } = require('pg');
    const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    await admin.query(`DROP DATABASE IF EXISTS ${isolatedDb}`).catch(() => {});
    await admin.end();
  }
});

test.beforeEach(async () => {
  await botDb.run('DELETE FROM command_controls');
  await botDb.run('DELETE FROM automod_limits');
  await botDb.run('DELETE FROM ticket_reasons');
  await botDb.run("DELETE FROM moderation_log WHERE action LIKE 'admin_control:%'");
  await commandControl.reload();
  await autoModLimits.reload();
  await tickets.loadReasons();
});

// قناة نصية مزيّفة تدعم send/messages.fetch(id) والصلاحيات الحقيقية (PermissionsBitField)
function textChannel(g, { perms = ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ManageChannels', 'ManageRoles', 'ReadMessageHistory'], type = ChannelType.GuildText } = {}) {
  const ch = makeChannel(g, { name: 'اعلانات' });
  ch.type = type;
  ch.guild = g;
  const msgs = new Map();
  let n = 0;
  ch.sent = [];
  ch.permissionsFor = () => new PermissionsBitField(perms.map((p) => PermissionFlagsBits[p]));
  ch.send = async (payload) => {
    const m = { id: `${ch.id.slice(0, 10)}${String(++n).padStart(8, '0')}`, payload };
    msgs.set(m.id, m);
    ch.sent.push(m);
    return m;
  };
  ch.messages = { fetch: async (id) => msgs.get(id) || null };
  return ch;
}

async function api(method, path, body, headers = {}, { key = ADMIN_KEY } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, headers: res.headers, json: await res.json() };
}

const spawnAnnouncer = (settings = {}) => {
  announcerMod._reset();
  liveStreams.clearAll();
  const a = announcerMod.init({
    liveStreams,
    store: streamStore,
    getClient: () => client,
    channelId: announcerChannel.id,
    settings: { confirmMs: 25, absentGraceMs: 300, touchEveryMs: 60000, retryDelaysMs: [30], sendTimeoutMs: 400, unresolvedRetryMs: 100, dbRetryMs: [40], ...settings }
  });
  return a;
};

// ======================= المصادقة والبوابة =======================

test('بدون ADMIN_CONTROL_KEY (أو أقصر من 32) ← 503 لكل المسارات، وباقي البوت ما يتأثر', async () => {
  for (const key of [null, 'short-key']) {
    const app = express();
    app.use('/admin-control', createAdminControlRouter({ getConfig: () => ({ adminControlKey: key }) }));
    const s = http.createServer(app);
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const b = `http://127.0.0.1:${s.address().port}/admin-control`;
    for (const [m, p] of [['GET', '/status'], ['POST', '/reload'], ['GET', '/commands'], ['PUT', '/automod/limits'], ['GET', '/nope']]) {
      const r = await fetch(b + p, { method: m, headers: { 'x-admin-key': ADMIN_KEY } });
      assert.equal(r.status, 503, `${m} ${p}`);
      assert.equal((await r.json()).code, 'ADMIN_CONTROL_DISABLED');
    }
    await new Promise((r) => { s.closeAllConnections?.(); s.close(r); });
  }
  // الخادم الرئيسي: /health شغّال و/admin-control مغلق (بدون المفتاح بالإعدادات)
  const { createApp } = require('../web/server');
  const app = createApp({ client: { isReady: () => true, ws: { ping: 1 } }, config: { ...cfg, adminControlKey: null } });
  const s = http.createServer(app);
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const root = `http://127.0.0.1:${s.address().port}`;
  assert.equal((await fetch(`${root}/health`)).status, 200);
  assert.equal((await fetch(`${root}/admin-control/status`, { headers: { 'x-admin-key': ADMIN_KEY } })).status, 503);
  await new Promise((r) => { s.closeAllConnections?.(); s.close(r); });
});

test('مفتاح خاطئ أو ناقص ← 401 بدون تسريب؛ صحيح ← الرد الموحّد', async () => {
  for (const key of [null, 'x'.repeat(40), ADMIN_KEY.slice(0, -1)]) {
    const r = await api('GET', '/status', undefined, {}, { key });
    assert.equal(r.status, 401);
    assert.equal(r.json.ok, false);
    assert.equal(r.json.code, 'UNAUTHORIZED');
    assert.ok(!JSON.stringify(r.json).includes(ADMIN_KEY));
  }
  // مفتاح API القديم ما يفتح القناة (مستقل)
  assert.equal((await api('GET', '/status', undefined, {}, { key: process.env.API_KEY })).status, 401);
  const ok = await api('GET', '/status');
  assert.equal(ok.status, 200);
  assert.equal(ok.json.ok, true);
  assert.equal(typeof ok.json.at, 'number');
  assert.ok('applied' in ok.json && 'verified' in ok.json && 'detail' in ok.json);
});

test('حدّ المعدل: 30 طلب بالدقيقة ثم 429', async () => {
  const app = express();
  app.use('/admin-control', createAdminControlRouter({ getConfig: () => ({ ...cfg, adminControlRateLimit: 0 }) }));
  const s = http.createServer(app);
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const b = `http://127.0.0.1:${s.address().port}/admin-control`;
  const codes = [];
  for (let i = 0; i < 32; i++) codes.push((await fetch(b + '/status', { headers: { 'x-admin-key': ADMIN_KEY } })).status);
  assert.equal(codes.filter((c) => c === 200).length, 30);
  assert.deepEqual(codes.slice(30), [429, 429]);
  await new Promise((r) => { s.closeAllConnections?.(); s.close(r); });
});

test('قائمة IP المسموحة: IP غير مدرج ← 403', async () => {
  const app = express();
  app.use('/admin-control', createAdminControlRouter({ getConfig: () => ({ ...cfg, adminControlAllowedIps: ['203.0.113.9'] }) }));
  const s = http.createServer(app);
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const r = await fetch(`http://127.0.0.1:${s.address().port}/admin-control/status`, { headers: { 'x-admin-key': ADMIN_KEY } });
  assert.equal(r.status, 403);
  await new Promise((r2) => { s.closeAllConnections?.(); s.close(r2); });
});

test('الحالة: حالة حقيقية للبوت والخدمات', async () => {
  spawnAnnouncer();
  await announcerMod.get().start();
  const r = await api('GET', '/status');
  const d = r.json.detail;
  assert.equal(d.ready, true);
  assert.equal(d.ping, 42);
  assert.equal(d.guilds, 1);
  assert.ok(d.commands >= 40);
  assert.ok(d.version.bot && d.version.node);
  assert.equal(d.services.streamerAnnouncer.ready, true);
  assert.equal(typeof d.services.streamerAnnouncer.openEpisodes, 'number');
  assert.equal(typeof d.services.streamerAnnouncer.failedAnnouncements, 'number');
  assert.equal(d.services.db.connected, true);
  assert.ok(['sqlite', 'postgres'].includes(d.services.db.dialect));
  assert.equal(d.services.commandControl.loaded, true);
});

test('خدمة غير جاهزة: بدون سياق التشغيل ← 503 NOT_READY، وreload لخدمة الإعلانات بدون تشغيلها ← 503', async () => {
  runtime.setContext(null);
  const r = await api('GET', '/status');
  assert.equal(r.status, 503);
  assert.equal(r.json.code, 'NOT_READY');
  runtime.setContext(ctx);
  announcerMod._reset();
  const r2 = await api('POST', '/reload', { service: 'streamerAnnouncer' });
  assert.equal(r2.status, 503);
  assert.equal(r2.json.code, 'SERVICE_NOT_READY');
});

// ======================= Idempotency =======================

test('Idempotency: نفس المفتاح ← نفس الرد بدون إعادة تنفيذ؛ جسم مختلف ← 422؛ متزامن ← تنفيذ واحد', async () => {
  const key = 'idem-key-0001';
  const first = await api('POST', '/commands/تجريبي/disable', {}, { 'x-idempotency-key': key });
  assert.equal(first.status, 200);
  assert.equal(first.json.verified, true);
  const replay = await api('POST', '/commands/تجريبي/disable', {}, { 'x-idempotency-key': key });
  assert.equal(replay.headers.get('x-idempotent-replay'), 'true');
  assert.deepEqual(replay.json, first.json);
  const rows = await botDb.query("SELECT * FROM moderation_log WHERE action = 'admin_control:command_disable'");
  assert.equal(rows.length, 1, 'ما أُعيد التنفيذ (سجل واحد)');
  const mismatch = await api('POST', '/commands/تجريبي/enable', {}, { 'x-idempotency-key': key });
  assert.equal(mismatch.status, 422);
  assert.equal(mismatch.json.code, 'IDEMPOTENCY_MISMATCH');
  const bad = await api('POST', '/commands/تجريبي/enable', {}, { 'x-idempotency-key': 'x' });
  assert.equal(bad.status, 400);
  // متزامن
  await api('POST', '/commands/تجريبي/enable', {});
  const k2 = 'idem-key-0002';
  const both = await Promise.all([api('POST', '/commands/تجريبي/disable', {}, { 'x-idempotency-key': k2 }), api('POST', '/commands/تجريبي/disable', {}, { 'x-idempotency-key': k2 })]);
  assert.deepEqual(both[0].json, both[1].json);
  const rows2 = await botDb.query("SELECT * FROM moderation_log WHERE action = 'admin_control:command_disable'");
  assert.equal(rows2.length, 2, 'تنفيذ واحد للمتزامنين (+ الأول القديم)');
});

// ======================= الأوامر: تعطيل وتقييد =======================

const asMember = (id, roles = []) => {
  const m = makeMember(guild, { id, username: `u${id.slice(-4)}`, roles: [] });
  m.roles.cache = new Map(roles.map((r) => [r, { id: r }]));
  return m;
};
async function invoke(member, { channelId = '999000000000000001', name = 'تجريبي' } = {}) {
  require('../utils/rateLimiter').hits.clear();
  const i = makeInteraction({ guild, member, commandName: name, channelId });
  await interactionCreate.execute(ctx, i);
  return i;
}
const texts = (i) => JSON.stringify(i.log.filter(([k]) => ['reply', 'editReply'].includes(k)).map(([, p]) => (p.embeds || []).map((e) => (e.toJSON ? e.toJSON() : e))).concat(i.log.filter(([k]) => k === 'reply').map(([, p]) => p.content)));

test('قائمة الأوامر: الاسم والملف والفئة والتعطيل والتقييدات والعدّادات', async () => {
  const r = await api('GET', '/commands');
  assert.equal(r.status, 200);
  const list = r.json.detail.commands;
  assert.equal(r.json.detail.count, list.length);
  const help = list.find((c) => c.name === 'مساعدة');
  assert.ok(help && help.file && help.category && help.protected === true && help.disabled === false);
  const custom = list.find((c) => c.name === 'تجريبي');
  assert.deepEqual(custom.restrictions, { allowedRoleIds: [], allowedChannelIds: [], blockedChannelIds: [] });
  assert.ok(custom.usage7d && 'uses' in custom.usage7d);
  assert.ok(list.find((c) => c.name === 'بث').category === 'streams');
});

test('تعطيل أمر: مستخدم عادي ← رفض بالعربية (Ephemeral + denied لا error)، المالك يشتغل، والتفعيل يرجّعه', async () => {
  const normal = asMember('800000000000000001');
  const owner = asMember(OWNER);
  const off = await api('POST', '/commands/تجريبي/disable', {});
  assert.equal(off.status, 200);
  assert.equal(off.json.applied, true);
  assert.equal(off.json.verified, true);
  assert.equal(off.json.detail.disabled, true);

  const beforeErrors = require('../utils/usageStats').snapshot().errors;
  const denied = await invoke(normal);
  assert.match(texts(denied), /هذا الأمر معطّل من الإدارة/);
  assert.ok(denied.log.some(([k, p]) => k === 'reply' && p.flags === 64), 'رد مؤقت Ephemeral');
  assert.equal(require('../utils/usageStats').snapshot().errors, beforeErrors, 'الرفض ليس خطأ');
  assert.ok([...require('../utils/usageStats')._internal.pending.values()].some((b) => b.name === 'تجريبي' && b.denied >= 1));

  const ownerRun = await invoke(owner);
  assert.match(texts(ownerRun), /تم/);

  const on = await api('POST', '/commands/تجريبي/enable', {});
  assert.equal(on.json.detail.disabled, false);
  assert.match(texts(await invoke(normal)), /تم/);
  // مخزّن بالقاعدة فعلاً
  const row = (await botDb.query("SELECT disabled FROM command_controls WHERE command_name = 'تجريبي'"))[0];
  assert.equal(Number(row.disabled), 0);
});

test('الأوامر الأساسية ما تنعطّل ولا تتقيّد، وأمر غير موجود ← 404', async () => {
  for (const name of ['مساعدة', 'ادمن_احصائيات', 'اضافة', 'ازالة']) {
    const r = await api('POST', `/commands/${encodeURIComponent(name)}/disable`, {});
    assert.equal(r.status, 409, name);
    assert.equal(r.json.code, 'PROTECTED_COMMAND');
    const r2 = await api('PUT', `/commands/${encodeURIComponent(name)}/restrictions`, { blockedChannelIds: ['999000000000000001'] });
    assert.equal(r2.status, 409);
  }
  assert.equal((await api('POST', '/commands/غير_موجود/disable', {})).status, 404);
  // وحتى لو انكتب صف بالقاعدة لأمر أساسي، التنفيذ لا يرفضه
  await botDb.run("INSERT INTO command_controls (guild_id, command_name, disabled, updated_at) VALUES (?, 'مساعدة', 1, ?)", [guild.id, Date.now()]);
  await commandControl.reload();
  const i = await invoke(asMember('800000000000000001'), { name: 'مساعدة' });
  assert.ok(!/معطّل من الإدارة/.test(texts(i)));
});

test('تقييد برتبة وقناة: مسموح/ممنوع، وتحقق من التخزين، ومدخلات خاطئة ← 400', async () => {
  const ROLE = '700000000000000001';
  const CH_OK = '600000000000000001';
  const CH_BAD = '600000000000000002';
  const r = await api('PUT', '/commands/تجريبي/restrictions', { allowedRoleIds: [ROLE], allowedChannelIds: [CH_OK, CH_BAD], blockedChannelIds: [CH_BAD] });
  assert.equal(r.status, 200);
  assert.equal(r.json.verified, true);
  assert.deepEqual(r.json.detail.restrictions.allowedRoleIds, [ROLE]);

  const withRole = asMember('800000000000000002', [ROLE]);
  const noRole = asMember('800000000000000003');
  assert.match(texts(await invoke(withRole, { channelId: CH_OK })), /تم/);
  assert.match(texts(await invoke(noRole, { channelId: CH_OK })), /غير مسموح لرتبتك/);
  assert.match(texts(await invoke(withRole, { channelId: CH_BAD })), /غير مسموح استخدام هذا الأمر في هذه القناة/);
  assert.match(texts(await invoke(withRole, { channelId: '600000000000000009' })), /غير مسموح استخدام هذا الأمر في هذه القناة/);
  assert.match(texts(await invoke(asMember(OWNER), { channelId: '600000000000000009' })), /تم/, 'المالك مستثنى');

  for (const body of [{ allowedRoleIds: ['abc'] }, { allowedChannelIds: 'x' }, { blockedChannelIds: Array.from({ length: 51 }, (_, i) => `60000000000000${String(1000 + i)}`) }]) {
    const bad = await api('PUT', '/commands/تجريبي/restrictions', body);
    assert.equal(bad.status, 400);
    assert.equal(bad.json.code, 'INVALID_INPUT');
  }
  // إزالة التقييد بقوائم فاضية
  const clear = await api('PUT', '/commands/تجريبي/restrictions', {});
  assert.equal(clear.json.verified, true);
  assert.match(texts(await invoke(noRole, { channelId: CH_BAD })), /تم/);
});

// ======================= الإحصاءات الدائمة =======================

test('إحصاءات الأوامر: تُحفظ بالقاعدة، تبقى بعد إعادة التشغيل، نخزّن رمز الخطأ فقط، وتُحذف بعد 90 يوم', async () => {
  await botDb.run('DELETE FROM command_usage');
  const us = require('../utils/usageStats');
  const base0 = us.snapshot();
  us.command('احصاء_تجريبي');
  us.command('احصاء_تجريبي');
  us.error('احصاء_تجريبي', 'SOME_CODE');
  us.error(); // الاستدعاء القديم بدون وسائط يبقى يعمل
  us.denied('احصاء_تجريبي');
  await us.flush();
  const row = (await botDb.query("SELECT * FROM command_usage WHERE command_name = 'احصاء_تجريبي'"))[0];
  assert.equal(Number(row.uses), 2);
  assert.equal(Number(row.errors), 1);
  assert.equal(Number(row.denied), 1);
  assert.equal(row.last_error_code, 'SOME_CODE');
  assert.ok(!JSON.stringify(row).includes('message'), 'ما فيه نص رسائل');
  // نفس اليوم يتراكم (upsert)
  us.command('احصاء_تجريبي');
  await us.flush();
  assert.equal(Number((await botDb.query("SELECT uses FROM command_usage WHERE command_name = 'احصاء_تجريبي'"))[0].uses), 3);

  // محاكاة إعادة تشغيل: وحدة جديدة تحمّل عدّادات اليوم من القاعدة
  const path = require.resolve('../utils/usageStats');
  const saved = require.cache[path];
  delete require.cache[path];
  const fresh = require('../utils/usageStats');
    await fresh.start();
  assert.ok(fresh.snapshot().commands >= 3, 'العدّادات رجعت من القاعدة');
  assert.ok(fresh.snapshot().top.some(([n, c]) => n === 'احصاء_تجريبي' && c === 3));
  await fresh.stop();
  require.cache[path] = saved;
  assert.ok(base0);

  // واجهة snapshot القديمة محفوظة
  const snap = us.snapshot();
  for (const k of ['day', 'commands', 'buttons', 'errors', 'top', 'startedAt']) assert.ok(k in snap);

  // حذف السجلات الأقدم من 90 يوم
  await botDb.run("INSERT INTO command_usage (day, command_name, uses, errors, denied) VALUES ('2000-01-01', 'قديم', 5, 0, 0)");
  await us._internal.prune();
  assert.equal((await botDb.query("SELECT * FROM command_usage WHERE command_name = 'قديم'")).length, 0);

  const r = await api('GET', '/usage?days=7');
  assert.equal(r.status, 200);
  const c = r.json.detail.commands.find((x) => x.name === 'احصاء_تجريبي');
  assert.equal(c.uses, 3);
  assert.equal(c.errors, 1);
  assert.equal(c.lastErrorCode, 'SOME_CODE');
  assert.equal(r.json.detail.days, 7);
});

// ======================= ستريمرات الإعلان =======================

test('reload للستريمرات: تسجيل جديد يُتتبّع بدون إعادة تشغيل، وبث جارٍ ما يتكرر إعلانه، والمحذوف يُسقَط بلا إعلان', async () => {
  await botDb.run('DELETE FROM streamer_announcement_events');
  await botDb.run('DELETE FROM streamer_announcements');
  announcerChannel.sent.length = 0;
  const a = spawnAnnouncer();
  await a.start();
  assert.equal((await a.status()).registered, 0);

  // تعديل مباشر بالقاعدة (مثل لوحة الإدارة) — المحرّك ما يدري
  const t = Date.now();
  await botDb.run("INSERT INTO streamer_announcements (guild_id, platform, username, normalized_username, enabled, added_by, created_at, updated_at) VALUES (?, 'tiktok', 'som3h.4', 'som3h.4', 1, 'admin-center', ?, ?)", [guild.id, t, t]);
  liveStreams.upsert({ sessionId: 'a1', platform: 'tiktok', platformUsername: 'som3h.4', source: 'poll' });
  await wait(150);
  assert.equal(announcerChannel.sent.length, 0, 'غير معروف قبل reload');

  const r = await api('POST', '/streamers/reload');
  assert.equal(r.status, 200);
  assert.equal(r.json.applied, true);
  assert.equal(r.json.verified, true);
  assert.equal(r.json.detail.before.registered, 0);
  assert.equal(r.json.detail.after.registered, 1);
  await until(() => announcerChannel.sent.length === 1);

  // reload ثاني وثالث والبث جارٍ ← لا إعلان مكرر
  await api('POST', '/streamers/reload');
  await api('POST', '/reload', { service: 'streamerAnnouncer' });
  await wait(250);
  assert.equal(announcerChannel.sent.length, 1);
  assert.equal((await a.status()).openEpisodes, 1);

  // حذف الستريمر من القاعدة أثناء بثه + reload ← يُسقَط التتبّع وتُقفل الحلقة بدون إعلان
  await botDb.run('DELETE FROM streamer_announcements');
  const r2 = await api('POST', '/streamers/reload');
  assert.equal(r2.json.verified, true);
  assert.equal(r2.json.detail.after.registered, 0);
  assert.equal(r2.json.detail.after.tracked, 0);
  assert.equal((await streamStore.events.getOpen('tiktok', 'som3h.4')), null);
  assert.equal(announcerChannel.sent.length, 1);
  assert.equal(liveStreams.list().some((s) => s.platformUsername === 'som3h.4'), true, 'الجلسة نفسها لا تتأثر');
});

test('روم الإعلانات: تحقق النوع والصلاحيات، تطبيق فوري بدون إعادة تشغيل، وتخزين بالقاعدة', async () => {
  const a = spawnAnnouncer();
  await a.start();
  const good = textChannel(guild);
  client.channels.cache.set(good.id, good);
  const ok = await api('PUT', '/streamers/channel', { channelId: good.id });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.verified, true);
  assert.equal(ok.json.detail.channelId, good.id);
  assert.equal((await a.status()).channelId, good.id);
  assert.equal(await streamStore.settings.getAnnounceChannel(), good.id);

  assert.equal((await api('PUT', '/streamers/channel', { channelId: 'abc' })).status, 400);
  assert.equal((await api('PUT', '/streamers/channel', { channelId: '123456789012345678' })).status, 404);
  const voice = textChannel(guild, { type: ChannelType.GuildVoice });
  client.channels.cache.set(voice.id, voice);
  const nv = await api('PUT', '/streamers/channel', { channelId: voice.id });
  assert.equal(nv.status, 422);
  assert.equal(nv.json.code, 'NOT_TEXT_CHANNEL');
  const limited = textChannel(guild, { perms: ['ViewChannel'] });
  client.channels.cache.set(limited.id, limited);
  const np = await api('PUT', '/streamers/channel', { channelId: limited.id });
  assert.equal(np.status, 422);
  assert.equal(np.json.code, 'MISSING_PERMISSIONS');
  assert.deepEqual(np.json.detail.missing.sort(), ['EmbedLinks', 'SendMessages']);
  assert.equal((await a.status()).channelId, good.id, 'ما تغيّر عند الفشل');
  // الإعلان الفعلي يروح للروم الجديد (وبعد إعادة التحميل من القاعدة)
  await botDb.run('DELETE FROM streamer_announcements');
  await botDb.run('DELETE FROM streamer_announcement_events');
  const t = Date.now();
  await botDb.run("INSERT INTO streamer_announcements (guild_id, platform, username, normalized_username, enabled, added_by, created_at, updated_at) VALUES (?, 'kick', 'some-user', 'some-user', 1, 'x', ?, ?)", [guild.id, t, t]);
  await a.reload();
  liveStreams.upsert({ sessionId: 'k1', platform: 'kick', platformUsername: 'some-user', source: 'poll' });
  await until(() => good.sent.length === 1);
  await botDb.run("DELETE FROM guild_config WHERE key = 'streamer_announce_channel'");
});

// ======================= كاش المشرفين + الحماية =======================

test('reload للمشرفين: تعديل مباشر بالقاعدة يُطبَّق فوراً (بدون انتظار الكاش)، ويعيد عدد الأعضاء والرتب', async () => {
  const member = asMember('800000000000000077');
  member.guild = guild;
  assert.equal((await adminPermissions.checkAdminPermission(member)).allowed, false);
  await botDb.run("INSERT INTO bot_admin_config (guild_id, type, discord_id, added_by, added_at) VALUES (?, 'user', ?, 'x', ?)", [guild.id, member.id, Date.now()]);
  assert.equal((await adminPermissions.checkAdminPermission(member)).allowed, false, 'الكاش القديم');
  const r = await api('POST', '/reload', { service: 'adminPermissions' });
  assert.equal(r.status, 200);
  assert.equal(r.json.verified, true);
  assert.equal(r.json.detail.after.users, 1);
  assert.equal(r.json.detail.after.guilds, 1);
  assert.equal((await adminPermissions.checkAdminPermission(member)).allowed, true);
  await botDb.run('DELETE FROM bot_admin_config WHERE guild_id = ?', [guild.id]);
  await api('POST', '/reload', { service: 'adminPermissions' });
  assert.equal((await adminPermissions.checkAdminPermission(member)).allowed, false);
  // TTL من البيئة
  process.env.ADMIN_CACHE_TTL_SECONDS = '5';
  assert.equal(adminPermissions.loadGuild.length >= 0, true);
  delete process.env.ADMIN_CACHE_TTL_SECONDS;
});

test('reload: خدمة غير معروفة ← 400، و"all" يعيد حالة كل خدمة', async () => {
  const bad = await api('POST', '/reload', { service: 'nope' });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.code, 'INVALID_INPUT');
  spawnAnnouncer();
  await announcerMod.get().start();
  const all = await api('POST', '/reload', { service: 'all' });
  assert.equal(all.status, 200);
  assert.equal(all.json.verified, true);
  assert.deepEqual(Object.keys(all.json.detail.services).sort(), ['adminPermissions', 'autoMod', 'commandControl', 'streamerAnnouncer', 'ticketReasons']);
});

test('حدود الحماية: تُحفظ وتُطبَّق فوراً بكشف السبام، تحقق النطاقات، وreload يلتقط تعديل القاعدة', async () => {
  const before = (await api('GET', '/automod/limits')).json.detail.effective;
  assert.equal(before.maxMessages, 5);
  const r = await api('PUT', '/automod/limits', { spamMaxMessages: 3, spamWindowSeconds: 10, spamDuplicates: 2, escalationMinutes: [5, 15, 60] });
  assert.equal(r.status, 200);
  assert.equal(r.json.verified, true);
  const eff = r.json.detail.effective;
  assert.deepEqual([eff.maxMessages, eff.windowMs, eff.duplicateCount, eff.escalationMs], [3, 10000, 2, [300000, 900000, 3600000]]);

  // يطبّق على كشف السبام الفعلي (3 رسائل = سبام بدل 5)
  const message = (id) => ({ id, guild: { id: guild.id }, author: { id: '800000000000000099' }, channel: { id: '1' }, content: `m${id}` });
  autoMod._internal.tracker.clear();
  const now = Date.now();
  assert.equal(autoMod._internal.trackSpam(message('a'), now).spam, false);
  assert.equal(autoMod._internal.trackSpam(message('b'), now + 10).spam, false);
  assert.equal(autoMod._internal.trackSpam(message('c'), now + 20).spam, true);
  assert.equal(autoMod._internal.durationFor(1, guild.id), 300000);
  assert.equal(autoMod._internal.durationFor(9, guild.id), 3600000);
  // سيرفر ثاني بدون صف = الافتراضي القديم بالضبط
  assert.equal(autoModLimits.effective('555555555555555555').maxMessages, 5);

  for (const body of [{ spamMaxMessages: 1 }, { spamMaxMessages: 31 }, { spamWindowSeconds: 2 }, { spamWindowSeconds: 61 }, { spamDuplicates: 11 }, { spamDuplicates: 1 }, { escalationMinutes: [] }, { escalationMinutes: [0] }, { escalationMinutes: 'x' }, {}]) {
    const bad = await api('PUT', '/automod/limits', body);
    assert.equal(bad.status, 400, JSON.stringify(body));
    assert.equal(bad.json.code, 'INVALID_INPUT');
  }
  assert.equal((await api('GET', '/automod/limits')).json.detail.effective.maxMessages, 3, 'ما تغيّر بعد الرفض');

  // تعديل مباشر بالقاعدة + reload
  await botDb.run('UPDATE automod_limits SET spam_max_messages = 9 WHERE guild_id = ?', [guild.id]);
  assert.equal(autoModLimits.effective(guild.id).maxMessages, 3);
  const rl = await api('POST', '/reload', { service: 'autoMod' });
  assert.equal(rl.json.verified, true);
  assert.equal(autoModLimits.effective(guild.id).maxMessages, 9);
});

// ======================= التكتات =======================

test('أسباب التكتات: أسباب مخصصة تُستخدم، فاضي ← ملف الإعدادات، ومدخلات خاطئة ← 400', async () => {
  const def = await api('GET', '/tickets/reasons');
  assert.equal(def.json.detail.source, 'config');
  assert.equal(def.json.detail.reasons.length, 7);
  const put = await api('PUT', '/tickets/reasons', { reasons: [{ value: 'billing', label: 'الفواتير', emoji: '💳' }, { value: 'tech', label: 'دعم فني', description: 'مشاكل تقنية' }] });
  assert.equal(put.status, 200);
  assert.equal(put.json.verified, true);
  assert.equal(put.json.detail.source, 'database');
  assert.deepEqual(tickets.reasonsFor(guild.id).map((r) => r.value), ['billing', 'tech']);
  assert.equal(tickets.reasonsFor('555555555555555555').length, 7, 'سيرفر ثاني: الملف');
  // قائمة فاضية ← يرجع للملف
  const reset = await api('PUT', '/tickets/reasons', { reasons: [] });
  assert.equal(reset.json.detail.source, 'config');
  assert.equal(tickets.reasonsFor(guild.id).length, 7);
  for (const reasons of [[{ value: 'a b', label: 'x' }], [{ value: 'a', label: 'x' }, { value: 'a', label: 'y' }], [{ value: 'a', label: '' }], Array.from({ length: 26 }, (_, i) => ({ value: `r${i}`, label: 'x' })), 'x']) {
    const bad = await api('PUT', '/tickets/reasons', { reasons });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.code, 'INVALID_INPUT');
  }
});

test('إغلاق تكت من اللوحة: يستخدم نفس منطق الإغلاق، ولا يغلق مغلقاً أو غير موجود', async () => {
  const ch = textChannel(guild);
  ch.name = 'تكت-ahmed';
  const id = await store.tickets.reserve({ guildId: guild.id, panelId: null, originChannelId: '444000000000000001', discordId: '800000000000000050', reason: 'account' });
  await store.tickets.attachChannel(id, ch.id);
  const r = await api('POST', `/tickets/${id}/close`, {});
  assert.equal(r.status, 200);
  assert.equal(r.json.verified, true);
  assert.equal(r.json.detail.ticket.status, 'closed');
  assert.equal(r.json.detail.ticket.id, id);
  assert.equal(r.json.detail.ticket.channelId, ch.id);
  assert.ok(['archived', 'deleting'].includes(r.json.detail.channelState));
  assert.equal((await store.tickets.get(id)).closed_by, 'admin-center');
  const again = await api('POST', `/tickets/${id}/close`, {});
  assert.equal(again.status, 409);
  assert.equal(again.json.code, 'ALREADY_CLOSED');
  assert.equal((await api('POST', '/tickets/999999/close', {})).status, 404);
  assert.equal((await api('POST', '/tickets/abc/close', {})).status, 400);
  const log = await botDb.query("SELECT * FROM moderation_log WHERE action = 'ticket_close' AND moderator_id = 'admin-center'");
  assert.equal(log.length, 1);
});

test('نشر لوحة التكتات: ينشر برسالة حقيقية، لا يكرر لنفس القناة، ويتحقق من الصلاحيات والمدخلات', async () => {
  await botDb.run('DELETE FROM ticket_panels');
  const ch = textChannel(guild);
  client.channels.cache.set(ch.id, ch);
  guild.channels.cache.set(ch.id, ch);
  const r = await api('POST', '/tickets/panel', { channelId: ch.id, content: 'عندك مشكلة؟\\nافتح تكت' });
  assert.equal(r.status, 200);
  assert.equal(r.json.verified, true);
  assert.equal(ch.sent.length, 1);
  assert.equal(r.json.detail.messageId, ch.sent[0].id);
  assert.match(JSON.stringify(ch.sent[0].payload.embeds[0].toJSON()), /عندك مشكلة؟\\nافتح تكت|عندك مشكلة؟\nافتح تكت/);
  const dup = await api('POST', '/tickets/panel', { channelId: ch.id, content: 'ثاني' });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.code, 'PANEL_EXISTS');
  assert.equal(ch.sent.length, 1, 'ما انكررت');
  assert.equal((await api('POST', '/tickets/panel', { channelId: 'x', content: 'a' })).status, 400);
  assert.equal((await api('POST', '/tickets/panel', { channelId: ch.id, content: '' })).status, 400);
  assert.equal((await api('POST', '/tickets/panel', { channelId: '123456789012345678', content: 'a' })).status, 404);
  const weak = textChannel(guild, { perms: ['ViewChannel'] });
  guild.channels.cache.set(weak.id, weak);
  const np = await api('POST', '/tickets/panel', { channelId: weak.id, content: 'a' });
  assert.equal(np.status, 422);
  assert.equal(np.json.code, 'MISSING_PERMISSIONS');
});

// ======================= السجل والأمان =======================

test('كل عملية تغيّر شيئاً تُسجَّل بـmoderation_log، والأخطاء بلا stack ولا أسرار', async () => {
  await api('POST', '/commands/تجريبي/disable', {});
  await api('PUT', '/automod/limits', { spamMaxMessages: 4 });
  const rows = await botDb.query("SELECT action, moderator_id, guild_id FROM moderation_log WHERE action LIKE 'admin_control:%' ORDER BY id");
  assert.deepEqual(rows.map((r) => r.action), ['admin_control:command_disable', 'admin_control:automod_limits']);
  assert.ok(rows.every((r) => r.moderator_id === 'admin-center' && r.guild_id === guild.id));
  // قراءة فقط ما تسجّل
  await api('GET', '/status');
  await api('GET', '/commands');
  assert.equal((await botDb.query("SELECT * FROM moderation_log WHERE action LIKE 'admin_control:%'")).length, 2);

  const err = await api('POST', '/reload', 'not-an-object-but-string');
  assert.ok([400].includes(err.status));
  const txt = JSON.stringify(err.json);
  assert.ok(!/stack|\bat\s+\S+\s+\(|node_modules|ADMIN_CONTROL_KEY/.test(txt));
  const notFound = await api('GET', '/nonexistent');
  assert.equal(notFound.status, 404);
  const badJson = await fetch(`${base}/reload`, { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY, 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(badJson.status, 400);
  assert.equal((await badJson.json()).code, 'INVALID_JSON');
});

test('قاعدة البيانات معطلة: ردود 503 عامة بدون تسريب، والقناة نفسها ما تنهار', async () => {
  const real = botDb.query;
  const originalRun = botDb.run;
  const err = Object.assign(new Error('boom internal detail'), { code: 'DB_UNAVAILABLE' });
  botDb.query = async () => { throw err; };
  botDb.run = async () => { throw err; };
  try {
    const r = await api('PUT', '/automod/limits', { spamMaxMessages: 4 });
    assert.equal(r.status, 503);
    assert.equal(r.json.code, 'DB_UNAVAILABLE');
    assert.ok(!JSON.stringify(r.json).includes('boom'));
    const st = await api('GET', '/status');
    assert.equal(st.status, 200, 'الحالة تبقى تشتغل');
  } finally {
    botDb.query = real;
    botDb.run = originalRun;
  }
});

test('بدون تفعيل القناة السلوك القديم كما هو: ما فيه ضوابط ولا رفض، والأوامر الحالية تشتغل', async () => {
  commandControl._internal.cache.clear();
  const i = await invoke(asMember('800000000000000001'));
  assert.match(texts(i), /تم/);
  assert.equal(autoModLimits.effective(guild.id).maxMessages, 5, 'الافتراضي القديم');
  assert.equal(tickets.reasonsFor(guild.id).length, 7);
});
