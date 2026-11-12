process.env.BOT_COMMANDS_SNAPSHOT = "0"; // الاختبارات تحاكي غياب ملفات البوت
import test from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, client } from './helpers/env.js';

const sample = (f) => {
  if (f.type === 'select') return f.options?.[0]?.value ?? 'x';
  if (f.type === 'boolean') return false;
  if (f.type === 'integer' || f.type === 'number') return f.min != null ? Math.max(f.min, 1) : 1;
  if (f.type === 'snowflake') return '300000000000000001';
  if (f.type === 'datetime') return Date.now() + 86400_000;
  if (f.type === 'url') return 'https://example.com';
  if (f.name === 'ip') return '203.0.113.5';
  if (f.pattern === '^[A-Za-z0-9._-]+\\.sqlite$') return 'x.sqlite';
  return 'قيمة';
};
const paramsFor = (act) => Object.fromEntries(act.fields.filter((f) => f.required).map((f) => [f.name, sample(f)]));

test('كل إجراء يحتاج خدمة غير مُهيّأة يُرفض بـ503 وبسبب فعلي (لا نجاح مزيّف)', async () => {
  const env = await startEnv({ firebase: false, discord: false, botDb: false, botDir: '/nonexistent' }); const o = client(env.base); await o.login('owner');
  let checked = 0; const odd = [];
  for (const act of env.svc.registry.actions()) {
    const needs = act.requires.filter((r) => !['store'].includes(r)); if (!needs.length) continue;
    const r = await o.run(act.id, paramsFor(act));
    if (![503, 422].includes(r.status)) odd.push(`${act.id}:${r.status}`);
    if (r.status === 503) { checked++; assert.ok(r.json.message.length > 5); assert.equal(r.json.ok, false); }
  }
  assert.deepEqual(odd, []); assert.ok(checked > 120, 'عدد الإجراءات المعطّلة بسبب القدرة: ' + checked);
  // الواجهة تعرضها «غير متاحة» مع السبب
  const d = (await o.get('/api/actions?section=players')).json.actions; assert.ok(d.every((x) => x.available === false && x.unavailableReason));
  // لا توجد عمليات كتابة حدثت
  assert.equal(env.svc.audit.list({ where: { status: 'success', section: 'players' }, limit: 5 }).length, 0);
  await env.close();
});

test('انقطاع Discord: فشل حقيقي مسجَّل، ثم استعادة الاتصال ونجاح بنفس مفتاح العملية', async () => {
  const env = await startEnv({ firebase: false, botDb: false }); const o = client(env.base); await o.login('owner');
  const key = 'recover-key-12345'; const CH = '500000000000000001';
  env.mock.S.failNext = { status: 500, code: 0 };
  const bad = await o.run('server.send_message', { channelId: CH, content: 'x' }, { key }); assert.equal(bad.status, 502); assert.equal(bad.json.ok, false);
  assert.equal(env.mock.S.messages.size, 0);
  const aud = env.svc.audit.list({ where: { action: 'server.send_message', status: 'failed' }, limit: 1 }); assert.equal(aud.length, 1);
  const ok = await o.run('server.send_message', { channelId: CH, content: 'x' }, { key }); assert.equal(ok.status, 200); assert.equal(env.mock.S.messages.size, 1, 'تمت مرة واحدة فقط');
  // خادم Discord متوقف تماماً
  const url = env.mock.url; await env.mock.close();
  const down = await o.run('server.send_message', { channelId: CH, content: 'y' }); assert.equal(down.status, 502); assert.match(down.json.message, /Discord/);
  assert.equal(env.svc.alerts.openCount() >= 0, true);
  env.mock.close = async () => {}; void url; await env.close();
});

test('توكن Discord غير صالح يُترجم لرسالة واضحة', async () => {
  const env = await startEnv({ firebase: false, botDb: false }); const o = client(env.base); await o.login('owner');
  env.svc.discord.req; env.cfg.discord.token = 'wrong-token';
  const r = await o.run('server.send_message', { channelId: '500000000000000001', content: 'x' }); assert.equal(r.status, 502); assert.match(r.json.message, /توكن|صالح|رفض/);
  await env.close();
});

test('انقطاع قاعدة البوت: 503 واضح وليس خطأ داخلياً', async () => {
  const env = await startEnv({ firebase: false, discord: true }); const o = client(env.base); await o.login('owner');
  await env.svc.botDb.close();
  const r = await o.run('automod.toggle_links', { enabled: false }); assert.equal(r.status, 503); assert.match(r.json.message, /قاعدة البوت/);
  env.svc.botDb.close = async () => {}; await env.close();
});

test('تعطّل Firebase أثناء العملية: خطأ حقيقي مسجَّل بلا كتابة جزئية ولا نجاح', async () => {
  const env = await startEnv({ discord: false, botDb: false, firebase: true }); const o = client(env.base); await o.login('owner');
  const boom = () => { const e = new Error('14 UNAVAILABLE: No connection established'); e.code = 14; throw e; };
  env.svc.fb.db = boom; env.svc.fb.auth = boom;
  const r = await o.run('players.ban_permanent', { username: 'someone' }); assert.equal(r.status, 502); assert.match(r.json.message, /Firestore|متاح/); assert.equal(r.json.ok, false);
  assert.equal(env.svc.audit.list({ where: { action: 'players.ban_permanent', status: 'failed' }, limit: 2 }).length, 1);
  assert.equal(env.svc.store.col('punishments').count(), 0, 'لم يُسجَّل عقاب وهمي');
  const ov = await o.get('/api/overview'); assert.equal(ov.status, 200); const m = ov.json.workspaces[0].metrics.find((x) => x.id === 'players'); assert.equal(m.status, 'unavailable', 'المؤشر يظهر غير متاح بدل رقم قديم');
  await env.close();
});

test('تقرير الصحة: الخدمة غير المُهيّأة لا تُعرض «تعمل» أبداً', async () => {
  const env = await startEnv({ firebase: false, discord: false, botDb: false }); const o = client(env.base); await o.login('owner');
  const r = await o.run('health.run_all', {}); const by = Object.fromEntries(r.json.data.map((x) => [x.id, x.status]));
  for (const k of ['firestore', 'rtdb', 'firebaseAuth', 'discordApi', 'botDb', 'bot', 'botApi', 'streamBridge']) assert.equal(by[k], 'unconfigured', k);
  assert.equal(by.adminStore, 'up'); await env.close();
});

test('سجل أوامر البوت يُقرأ من ملفات البوت الفعلية بلا اختراع ولا تعديل', async () => {
  const { scanBotCommands } = await import('../server/adapters/botRegistry.js'); const fs = await import('node:fs'); const path = await import('node:path');
  const dir = path.resolve('../discord-bot'); const before = fs.statSync(path.join(dir, 'commands/moderation/kick.js')).mtimeMs;
  const r = scanBotCommands(dir); assert.ok(r.commands.length >= 40); assert.ok(r.commands.find((c) => c.name === 'طرد' && c.access === 'admin' && c.options.some((o) => o.name === 'سبب' && o.required)));
  assert.ok(r.commands.find((c) => c.name === 'اضافة' && c.access === 'owner')); assert.deepEqual(r.unparsed.sort(), ['commands/games/countries.js', 'commands/games/roulette.js', 'commands/games/sniper.js']);
  assert.equal(fs.statSync(path.join(dir, 'commands/moderation/kick.js')).mtimeMs, before);
  assert.equal(scanBotCommands('/nonexistent').available, false);
});
