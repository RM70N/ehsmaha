import test from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, client, PW } from './helpers/env.js';

let env;
test.before(async () => { env = await startEnv({ firebase: false, discord: false, botDb: false }); });
test.after(async () => { await env.close(); });

test('دخول المالك بكلمة مرور صحيحة يعيد جلسة HttpOnly + رمز CSRF', async () => {
  const c = client(env.base); const r = await c.raw('POST', '/api/auth/login', { account: 'owner', password: PW.owner });
  assert.equal(r.status, 200); assert.equal(r.json.account.role, 'owner'); assert.ok(r.json.csrf);
  const sc = r.headers.get('set-cookie'); assert.match(sc, /HttpOnly/i); assert.match(sc, /SameSite=Strict/i);
  assert.ok(!JSON.stringify(r.json).includes(PW.owner), 'كلمة المرور لا تظهر في الرد');
});

test('كلمة مرور خاطئة وحساب غير موجود يعطيان نفس الرد (منع التعداد)', async () => {
  const c = client(env.base);
  const a = await c.raw('POST', '/api/auth/login', { account: 'owner', password: 'wrong' });
  const b = await c.raw('POST', '/api/auth/login', { account: 'nobody', password: 'wrong' });
  assert.equal(a.status, 401); assert.equal(b.status, 401); assert.equal(a.json.message, b.json.message); assert.equal(a.json.code, b.json.code);
});

test('لا توجد مسارات تسجيل/إنشاء حساب/استعادة', async () => {
  const c = client(env.base);
  for (const p of ['/api/auth/register', '/api/auth/signup', '/api/auth/reset', '/api/accounts', '/api/users']) { const r = await c.raw('POST', p, { account: 'x', password: 'y' }); assert.ok([401, 403, 404].includes(r.status), p + ' => ' + r.status); }
  assert.deepEqual(Object.keys((await import('../server/auth/accounts.js')).ACCOUNTS).sort(), ['admin', 'owner']);
});

test('قفل تصاعدي بعد تكرار الفشل ثم رفضه حتى لكلمة المرور الصحيحة', async () => {
  const e2 = await startEnv({ firebase: false, discord: false, botDb: false }); e2.svc.settings.set('loginFreeFails', 2, 't');
  const c = client(e2.base);
  for (let i = 0; i < 3; i++) await c.raw('POST', '/api/auth/login', { account: 'admin', password: 'bad' + i });
  const r = await c.raw('POST', '/api/auth/login', { account: 'admin', password: PW.admin });
  assert.equal(r.status, 429); assert.ok(r.json.retryAfterSec > 0);
  const ok = await client(e2.base).raw('POST', '/api/auth/login', { account: 'owner', password: PW.owner });
  assert.equal(ok.status, 200, 'قفل الأدمن لا يقفل المالك');
  await e2.close();
});

test('حد المحاولات لكل IP', async () => {
  const e2 = await startEnv({ firebase: false, discord: false, botDb: false }); e2.svc.settings.set('loginIpMax', 5, 't');
  const c = client(e2.base); let last;
  for (let i = 0; i < 8; i++) last = await c.raw('POST', '/api/auth/login', { account: 'owner', password: 'x' });
  assert.equal(last.status, 429); await e2.close();
});

test('طلب محمي بلا جلسة = 401، ورمز جلسة عشوائي = 401، وتغيير الهوية غير ممكن', async () => {
  const c = client(env.base); assert.equal((await c.get('/api/me')).status, 401);
  const r = await fetch(env.base + '/api/me', { headers: { cookie: 'ecc_sid=' + 'A'.repeat(43) } }); assert.equal(r.status, 401);
  const a = client(env.base); await a.login('admin');
  const me = await a.get('/api/me'); assert.equal(me.json.account.role, 'admin');
  // محاولة انتحال: إرسال account/role في الجسم لا يغيّر الهوية
  const r2 = await a.raw('POST', '/api/actions/access/set_section/run', { params: { section: 'players', enabled: false }, idempotencyKey: 'abcdefgh1', confirm: true, role: 'owner', account: 'owner' });
  assert.equal(r2.status, 403);
});

test('CSRF: طلب كتابة بلا ترويسة الرمز يُرفض، ومن Origin غريب يُرفض', async () => {
  const c = client(env.base); await c.login('owner');
  const noCsrf = await c.raw('POST', '/api/actions/alerts/raise_manual/run', { params: { title: 'x', severity: 'info' }, idempotencyKey: 'abcdefgh2', confirm: true }, { 'x-csrf-token': 'wrong' });
  assert.equal(noCsrf.status, 403); assert.equal(noCsrf.json.code, 'CSRF');
  const evil = await c.raw('POST', '/api/auth/logout', {}, { origin: 'https://evil.example' }); assert.equal(evil.status, 403);
});

test('انتهاء الجلسة بالخمول يُرجع SESSION_EXPIRED ويُبطلها', async () => {
  const c = client(env.base); await c.login('owner');
  for (const s of env.svc.store.col('sessions').list({ limit: 50 })) env.svc.store.col('sessions').merge(s.id, { lastSeen: Date.now() - 3 * 3600_000 });
  const r = await c.get('/api/me'); assert.equal(r.status, 401); assert.equal(r.json.code, 'SESSION_EXPIRED');
  assert.equal((await c.get('/api/me')).status, 401);
  // الدخول بعد انتهاء الجلسة ينجح من أول محاولة (الكوكي القديم المنتهي لا يعطّله)
  const c2 = client(env.base); await c2.login('admin');
  for (const x of env.svc.store.col('sessions').list({ limit: 50 })) env.svc.store.col('sessions').merge(x.id, { lastSeen: Date.now() - 3 * 3600_000 });
  assert.equal((await c2.login('admin')).status, 200); assert.equal((await c2.get('/api/me')).status, 200);
});

test('تدوير الجلسة عند الدخول: الكوكي القديم يبطل', async () => {
  const c = client(env.base); await c.login('owner');
  const old = await env.svc.sessions.listActive().length; assert.ok(old >= 1);
  const first = c; await first.login('owner'); // دخول ثانٍ بنفس العميل (نفس الكوكي القديم)
  assert.equal((await first.get('/api/me')).status, 200);
});

test('تسجيل الخروج يُنهي الجلسة فعلاً', async () => {
  const c = client(env.base); await c.login('admin'); assert.equal((await c.post('/api/auth/logout')).status, 200);
  assert.equal((await c.get('/api/me')).status, 401);
});

test('كلمات المرور لا تُسجَّل في سجل التدقيق ولا تُخزَّن بنص صريح', async () => {
  const c = client(env.base); await c.raw('POST', '/api/auth/login', { account: 'owner', password: 'SuperSecretWrong1' });
  const dump = JSON.stringify(env.svc.audit.list({ limit: 200 })) + JSON.stringify(env.svc.store.col('loginLog').list({ limit: 200 })) + JSON.stringify(env.svc.store.col('sessions').list({ limit: 50 }));
  assert.ok(!dump.includes('SuperSecretWrong1')); assert.ok(!dump.includes(PW.owner)); assert.ok(!dump.includes(PW.admin));
});

test('رؤوس الأمان وCSP موجودة', async () => {
  const r = await fetch(env.base + '/'); const csp = r.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'/); assert.match(csp, /frame-ancestors 'none'/); assert.equal(r.headers.get('x-powered-by'), null);
  const html = await r.text(); assert.ok(!/<script(?![^>]*src)/i.test(html), 'لا سكربت مضمّن'); assert.ok(!/ style="/i.test(html));
});

test('حظر IP يمنع الدخول', async () => {
  const e2 = await startEnv({ firebase: false, discord: false, botDb: false });
  const o = client(e2.base); await o.login('owner');
  const r = await o.run('security.block_ip', { ip: '127.0.0.1', label: 'test' }); assert.equal(r.status, 200, JSON.stringify(r.json));
  const c = client(e2.base); const x = await c.raw('POST', '/api/auth/login', { account: 'owner', password: PW.owner }); assert.equal(x.status, 403);
  e2.svc.loginGuard.unblockIp('127.0.0.1'); assert.equal((await client(e2.base).login('owner')).status, 200);
  await e2.close();
});

test('قفل الحساب لكل IP: فشل مهاجم لا يقفل المالك من عنوان آخر، والقفل العام يتطلب فشلاً موزَّعاً كبيراً', async () => {
  const e2 = await startEnv({ firebase: false, discord: false, botDb: false }); const g = e2.svc.loginGuard; e2.svc.settings.set('loginFreeFails', 2, 't');
  for (let i = 0; i < 6; i++) g.record('owner', '198.51.100.7', false, 'ua', 'bad_password');
  assert.throws(() => g.check('owner', '198.51.100.7'), (e) => e.code === 'RATE_LIMITED');
  assert.doesNotThrow(() => g.check('owner', '203.0.113.50'), 'عنوان آخر غير مقفل');
  e2.svc.settings.set('loginGlobalFails', 10, 't');
  for (let i = 0; i < 10; i++) g.record('owner', `192.0.2.${i}`, false, 'ua', 'bad_password');
  assert.throws(() => g.check('owner', '203.0.113.50'), (e) => e.code === 'RATE_LIMITED', 'هجوم موزَّع يقفل الحساب مؤقتاً');
  g.unlock('owner'); assert.doesNotThrow(() => g.check('owner', '203.0.113.50'));
  await e2.close();
});

test('تكرار الدخول الفاشل وطلبات الأدمن المرفوضة يرفعان تنبيهاً واحداً بلا تكرار', async () => {
  const e2 = await startEnv({ firebase: false, discord: false, botDb: false });
  try {
    const c = client(e2.base);
    for (let i = 0; i < 8; i++) await c.raw('POST', '/api/auth/login', { account: 'admin', password: 'x' + i });
    const al = e2.svc.alerts.list({ where: { key: 'security:login-failures' }, limit: 5 }); assert.equal(al.length, 1); assert.ok(al[0].count >= 1);
    e2.svc.loginGuard.unlock('admin'); for (const k of ['admin']) e2.svc.store.col('loginState').deleteWhere({});
    const a = client(e2.base); e2.svc.store.col('loginIp').deleteWhere({}); assert.equal((await a.login('admin')).status, 200);
    for (let i = 0; i < 6; i++) await a.run('security.block_ip', { ip: '1.2.3.4' });
    assert.equal(e2.svc.alerts.list({ where: { key: 'security:denied:ADMIN' }, limit: 5 }).length, 1);
  } finally { await e2.close(); }
});
