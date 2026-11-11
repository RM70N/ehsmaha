import test from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, client } from './helpers/env.js';

let env, owner, admin;
test.before(async () => { env = await startEnv({ firebase: false, discord: false, botDb: false }); owner = client(env.base); admin = client(env.base); await owner.login('owner'); await admin.login('admin'); });
test.after(async () => { await env.close(); });
const nav = async (c) => (await c.get('/api/me')).json;
const acts = async (c, s) => (await c.get(`/api/actions?section=${s}`));

test('الأدمن لا يرى أقسام/إجراءات المالك ولا يستطيع استدعاءها', async () => {
  const me = await nav(admin); assert.ok(!me.sections.some((s) => s.id === 'access'), 'قسم الصلاحيات مخفي');
  for (const id of ['access.apply_preset', 'access.set_section', 'security.block_ip', 'settings.rollback', 'security.create_backup']) { const r = await admin.run(id, {}); assert.equal(r.status, 403, id); }
  assert.equal((await admin.get('/api/access/matrix')).status, 403);
  assert.equal((await admin.get('/api/views/access/matrix')).status, 404);
});

test('افتراضياً: الأدمن يُسمح له بالقراءة والخطورة المنخفضة فقط', async () => {
  const r = await acts(admin, 'alerts'); const ids = r.json.actions.map((a) => a.shortId);
  assert.ok(ids.includes('raise_manual') && ids.includes('export_alerts')); assert.ok(!ids.includes('ack_all'), 'متوسطة الخطورة غير مسموحة افتراضياً');
  const denied = await admin.run('alerts.ack_all', { severity: 'all' }); assert.equal(denied.status, 403);
});

test('المالك يمنح الأدمن إجراءً محدداً فيعمل فوراً، ثم يسحبه فيُرفض فوراً (حتى بطلب يدوي)', async () => {
  let r = await owner.run('access.set_action', { action: 'alerts.ack_all', enabled: true }); assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal((await admin.run('alerts.ack_all', { severity: 'all' })).status, 200);
  r = await owner.run('access.set_action', { action: 'alerts.ack_all', enabled: false }); assert.equal(r.status, 200);
  assert.equal((await admin.run('alerts.ack_all', { severity: 'all' })).status, 403);
  const aud = env.svc.audit.list({ where: { action: 'alerts.ack_all', status: 'denied' }, limit: 2 }); assert.ok(aud.length >= 1, 'المحاولة المرفوضة سُجّلت');
});

test('إخفاء قسم كامل: يختفي من التنقل وتُرفض كل واجهاته وإجراءاته', async () => {
  assert.ok((await nav(admin)).sections.some((s) => s.id === 'alerts'));
  assert.equal((await owner.run('access.set_section', { section: 'alerts', enabled: false })).status, 200);
  const me = await nav(admin); assert.ok(!me.sections.some((s) => s.id === 'alerts'));
  assert.equal((await acts(admin, 'alerts')).status, 403);
  assert.equal((await admin.get('/api/views/alerts/open')).status, 404);
  assert.equal((await admin.run('alerts.raise_manual', { title: 'x', severity: 'info' })).status, 403);
  assert.equal((await owner.run('access.set_section', { section: 'alerts', enabled: true })).status, 200);
  assert.ok((await nav(admin)).sections.some((s) => s.id === 'alerts'));
});

test('إخفاء مساحة كاملة (ديسكورد) عن الأدمن', async () => {
  assert.ok((await nav(admin)).workspaces.includes('discord'));
  await owner.run('access.set_workspace', { workspace: 'discord', enabled: false });
  const me = await nav(admin); assert.ok(!me.workspaces.includes('discord')); assert.ok(!me.sections.some((s) => s.workspace === 'discord'));
  assert.equal((await admin.run('server.send_message', { channelId: '500000000000000001', content: 'x' })).status, 403);
  await owner.run('access.set_workspace', { workspace: 'discord', enabled: true });
});

test('نمط «قراءة فقط» يمنع كل الإجراءات المغيّرة ويُبقي القراءة', async () => {
  assert.equal((await owner.run('access.apply_preset', { preset: 'readonly' })).status, 200);
  assert.equal((await admin.run('alerts.raise_manual', { title: 'x', severity: 'info' })).status, 403);
  const r = await admin.run('audit.summary', {}); assert.equal(r.status, 403, 'قسم audit غير مرئي افتراضياً');
  const h = await admin.run('health.uptime_report', {}); assert.equal(h.status, 200);
});

test('التراجع عن النمط يستعيد اللقطة السابقة', async () => {
  const before = JSON.stringify(env.svc.perms.get().actions);
  const r = await owner.run('access.apply_preset', { preset: 'locked' }); assert.equal(r.status, 200); assert.equal(r.json.undoAvailable, true);
  assert.equal((await nav(admin)).workspaces.filter((w) => w !== 'control').length, 0);
  assert.equal((await owner.post(`/api/audit/${r.json.auditId}/undo`)).status, 200);
  assert.ok((await nav(admin)).workspaces.includes('website'));
  void before;
});

test('إعادة الافتراضي + إنهاء جلسات الأدمن', async () => {
  assert.equal((await owner.run('access.reset_defaults', {})).status, 200);
  assert.equal((await owner.run('access.revoke_admin_sessions', {})).status, 200);
  assert.equal((await admin.get('/api/me')).status, 401);
  await admin.login('admin');
});

test('الأدمن لا يستطيع إنهاء جلسات غيره ولا الاطلاع على مصفوفة الصلاحيات', async () => {
  await owner.run('access.set_section', { section: 'security', enabled: true });
  await owner.run('access.set_action', { action: 'security.revoke_session', enabled: true });
  const ownerSid = env.svc.sessions.listActive().find((s) => s.account === 'OWNER').fullId;
  const r = await admin.run('security.revoke_session', { sessionId: ownerSid }); assert.equal(r.status, 403);
});

test('مصفوفة الصلاحيات تحمي من التعارض (إصدار) وتحفظ التغييرات عبر إعادة بناء الخدمات', async () => {
  const cur = env.svc.perms.get();
  const stale = env.svc.perms.update({ expectedVersion: cur.version - 1, actions: { 'players.unban': true } }, 'x'); assert.equal(stale.conflict, true);
  await owner.run('access.set_action', { action: 'players.unban', enabled: true });
  const { createPermissions } = await import('../server/auth/permissions.js');
  const p2 = createPermissions({ store: env.svc.store, registry: env.svc.registry }); assert.equal(p2.canRunAction({ role: 'admin' }, 'players.unban'), true);
});
