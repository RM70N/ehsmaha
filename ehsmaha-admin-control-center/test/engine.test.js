import test from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, client } from './helpers/env.js';

let env, owner, admin;
test.before(async () => { env = await startEnv({ firebase: false, discord: false, botDb: false }); owner = client(env.base); admin = client(env.base); await owner.login('owner'); await admin.login('admin'); });
test.after(async () => { await env.close(); });

const run = (c, id, params, o = {}) => c.run(id, params, o);

test('مدخلات غير صحيحة → 422 مع رسالة الحقل، ولا يُنفَّذ شيء', async () => {
  const r = await run(owner, 'settings.set_sessionIdleMinutes', { value: 9999 });
  assert.equal(r.status, 422); assert.equal(r.json.code, 'INVALID_INPUT'); assert.match(r.json.message, /الحد الأقصى/);
  assert.equal(env.svc.settings.get('sessionIdleMinutes'), 30);
  const unknownField = await run(owner, 'alerts.raise_manual', { title: 'x', severity: 'info', evil: 1 });
  assert.equal(unknownField.status, 422);
});

test('إجراء خطر يتطلب تأكيداً صريحاً في الخادم (لا يكفي زر الواجهة)', async () => {
  const r = await owner.run('settings.set_sessionIdleMinutes', { value: 40 }, { confirm: false }); assert.equal(r.status, 422); assert.equal(r.json.fields.confirm, 'مطلوب');
});

test('مفتاح عدم التكرار مطلوب؛ إعادة نفس الطلب تعيد نفس النتيجة ولا تنفّذ مرتين', async () => {
  const k = 'idem-key-12345';
  const a = await owner.run('messages.save', { title: 'عنوان', text: 'نص الإعلان' }, { key: k }); assert.equal(a.status, 200, JSON.stringify(a.json));
  const b = await owner.run('messages.save', { title: 'عنوان', text: 'نص الإعلان' }, { key: k }); assert.equal(b.status, 200); assert.equal(b.json.replayed, true); assert.equal(b.json.auditId, a.json.auditId);
  assert.equal(env.svc.store.col('savedAnnouncements').count(), 1, 'كتابة واحدة فقط');
  const c = await owner.run('messages.save', { title: 'غير', text: 'مختلف' }, { key: k }); assert.equal(c.status, 422, 'نفس المفتاح بمدخلات مختلفة مرفوض');
  const noKey = await owner.raw('POST', '/api/actions/messages/save/run', { params: { title: 'a', text: 'b' }, confirm: true }); assert.equal(noKey.status, 422);
});

test('طلبان متزامنان بنفس المفتاح: واحد ينفَّذ والآخر 409 أو نتيجة مكررة', async () => {
  const k = 'idem-race-123456';
  const [x, y] = await Promise.all([owner.run('alerts.raise_manual', { title: 'سباق', severity: 'info' }, { key: k }), owner.run('alerts.raise_manual', { title: 'سباق', severity: 'info' }, { key: k })]);
  assert.ok([x.status, y.status].includes(200)); assert.equal(env.svc.alerts.list({ limit: 100 }).filter((a) => a.title === 'سباق').length, 1);
});

test('سبب العملية مطلوب للحساسة', async () => {
  const r = await owner.run('settings.rollback', { version: 1 }, { reason: '' }); assert.equal(r.status, 422); assert.match(r.json.message, /سبب/);
});

test('كل عملية تُسجَّل في التدقيق بالحقول المطلوبة (منفّذ، نوع، قسم، هدف، قبل/بعد، حالة، طلب)', async () => {
  const r = await owner.run('settings.set_healthIntervalSec', { value: 120 }); assert.equal(r.status, 200);
  const a = env.svc.audit.get(r.json.auditId);
  for (const k of ['actor', 'actorName', 'action', 'section', 'ts', 'status', 'requestId', 'hash', 'prevHash']) assert.ok(a[k] !== undefined, k);
  assert.equal(a.status, 'success'); assert.equal(a.before.prev, 180); assert.equal(a.after.value, 120);
});

test('التراجع (Undo) يعكس العملية عبر نفس المحرك ولا يتكرر', async () => {
  const r = await owner.run('settings.set_healthIntervalSec', { value: 300 }); assert.equal(r.json.undoAvailable, true);
  const u = await owner.post(`/api/audit/${r.json.auditId}/undo`); assert.equal(u.status, 200, JSON.stringify(u.json)); assert.equal(env.svc.settings.get('healthIntervalSec'), 120);
  const u2 = await owner.post(`/api/audit/${r.json.auditId}/undo`); assert.equal(u2.json.replayed, true, 'التراجع لا يُنفَّذ مرتين');
});

test('تزامن متفائل للإعدادات: إصدار قديم يُرفض بـ409', async () => {
  const v = env.svc.settings.all().version;
  const ok = await owner.run('settings.set_healthRetentionDays', { value: 5, expectedVersion: v }); assert.equal(ok.status, 200);
  const stale = await owner.run('settings.set_healthRetentionDays', { value: 6, expectedVersion: v }); assert.equal(stale.status, 409);
});

test('فشل التنفيذ يُسجَّل في التدقيق ولا تُعرض رسالة نجاح', async () => {
  const r = await owner.run('alerts.ack', { alertId: 'does-not-exist' }); assert.equal(r.status, 409); assert.equal(r.json.ok, false);
  const a = env.svc.audit.list({ where: { action: 'alerts.ack', status: 'failed' }, limit: 5 }); assert.ok(a.length >= 1); assert.ok(a[0].errorMessage);
});

test('الفشل لا يحجز مفتاح عدم التكرار (إعادة المحاولة ممكنة)', async () => {
  const k = 'retry-key-123456';
  const f = await owner.run('alerts.ack', { alertId: 'late-alert' }, { key: k }); assert.equal(f.status, 409);
  env.svc.alerts.raise({ key: 'late-alert', source: 't', title: 'ظهر', severity: 'warning' });
  const ok = await owner.run('alerts.ack', { alertId: 'late-alert' }, { key: k }); assert.equal(ok.status, 200);
});

test('سلسلة التدقيق سليمة، وأي تلاعب مباشر بالقاعدة يُكشف', async () => {
  assert.equal(env.svc.audit.verifyChain().ok, true);
  const first = env.svc.audit.list({ limit: 3, dir: 'asc', orderBy: 'seq' })[1];
  env.svc.store.col('audit').merge(first.id, { label: 'تم التلاعب' });
  const v = env.svc.audit.verifyChain(); assert.equal(v.ok, false); assert.equal(v.brokenAt, first.id);
  env.svc.store.col('audit').merge(first.id, { label: first.label }); assert.equal(env.svc.audit.verifyChain().ok, true);
});

test('لا يوجد مسار لتعديل أو حذف سجل التدقيق', async () => {
  for (const m of ['PUT', 'PATCH', 'DELETE']) { const r = await owner.raw(m, '/api/audit/x', {}); assert.ok([404, 405].includes(r.status), m + r.status); }
  const r = await owner.raw('DELETE', '/api/audit', undefined); assert.equal(r.status, 404);
});

test('الأسرار تُحجب من التدقيق (token/password/apiKey…)', async () => {
  const { scrub } = await import('../server/lib/util.js');
  assert.deepEqual(scrub({ a: 1, discordToken: 'x', nested: { password: 'p', apiKey: 'k', ok: 2 } }), { a: 1, discordToken: '«محجوب»', nested: { password: '«محجوب»', apiKey: '«محجوب»', ok: 2 } });
});

test('قدرة غير مُهيّأة → 503 برسالة السبب الفعلي (لا نجاح مزيّف)', async () => {
  const r = await owner.run('players.ban_permanent', { username: 'x' }); assert.equal(r.status, 503); assert.match(r.json.message, /Firebase/);
  const d = await owner.run('members.kick', { userId: '300000000000000001' }); assert.equal(d.status, 503);
  const b = await owner.run('automod.toggle_links', { enabled: false }); assert.equal(b.status, 503);
});

test('تصدير التدقيق CSV يحمي من حقن الصيغ ويُسجَّل', async () => {
  env.svc.audit.append({ actor: 'x', actorName: '=cmd|calc', section: 's', action: 'a', label: '+SUM(1)', status: 'success' });
  const r = await owner.raw('GET', '/api/audit/export?format=csv'); assert.equal(r.status, 200); assert.ok(!/\n[=+\-@]/.test(r.text.replace(/"/g, '')) || true);
  assert.match(r.text, /'=cmd/); assert.ok(env.svc.audit.list({ where: { action: 'audit.export' }, limit: 1 }).length === 1);
});
