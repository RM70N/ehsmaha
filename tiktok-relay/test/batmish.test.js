import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { GAMES, STREAMER_ID, SITE_TAG } from '../src/batmish/schema.js';
import { validateValue, validateValues, defaultsOf, ValidationError, fieldOf } from '../src/batmish/validation.js';
import { BatmishService, ConflictError } from '../src/batmish/service.js';
import { MemoryStore } from '../src/batmish/store.js';
import { BatmishAccess } from '../src/batmish/access.js';
import { createBatmishHandler, RateLimiter } from '../src/batmish/http.js';
import { LegacyBridgeServer } from '../src/legacyBridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OWNER = 'malshaifan1@gmail.com';

// ----------------------------------------------------------------------------------- تطابق الكتالوج مع الموقع
function siteSchema() {
  const s = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const i = s.indexOf('const MOD_SETTINGS_SCHEMA = {');
  let d = 0, end = -1;
  for (let k = i + 'const MOD_SETTINGS_SCHEMA = '.length; k < s.length; k++) {
    if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (d === 0) { end = k; break; } }
  }
  return JSON.parse(JSON.stringify(vm.runInNewContext('(' + s.slice(i + 'const MOD_SETTINGS_SCHEMA = '.length, end + 1) + ')')));
}

test('كتالوج BATMISH يغطي كل حقل إعدادات متقدمة موجود فعلاً في index.html بنفس المفتاح والافتراضي والمدى', () => {
  const site = siteSchema();
  let n = 0;
  for (const [tag, g] of Object.entries(site)) {
    assert.ok(GAMES[tag], 'لعبة ناقصة: ' + tag);
    for (const f of g.fields) {
      const b = GAMES[tag].fields.find((x) => x.key === f.key);
      assert.ok(b, `حقل ناقص ${tag}.${f.key}`);
      assert.equal(b.type, f.type, `${tag}.${f.key} type`);
      assert.deepEqual(b.default, f.default, `${tag}.${f.key} default`);
      assert.equal(b.min, f.min, `${tag}.${f.key} min`);
      assert.equal(b.max, f.max, `${tag}.${f.key} max`);
      n++;
    }
  }
  assert.ok(n >= 80, 'عدد الحقول: ' + n);
});

test('كل حقل في الكتالوج مقروء فعلاً في index.html عبر modGetSetting (لا إعدادات شكلية)', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const missing = [];
  for (const [tag, g] of Object.entries(GAMES)) {
    if (tag === SITE_TAG) continue;
    for (const f of g.fields) {
      const re = new RegExp("modGetSetting\\(\\s*'" + tag + "'\\s*,\\s*'" + f.key + "'");
      if (!re.test(s)) missing.push(tag + '.' + f.key);
    }
  }
  assert.deepEqual(missing, []);
});

// ----------------------------------------------------------------------------------- التحقق من القيم
test('validation: أنواع/مدى/أعداد صحيحة/ترتيب تنازلي', () => {
  const f = fieldOf('whoami', 'maxAttempts');
  assert.equal(validateValue(f, 5), 5);
  assert.throws(() => validateValue(f, 0), (e) => e.code === 'out_of_range');
  assert.throws(() => validateValue(f, 11), (e) => e.code === 'out_of_range');
  assert.throws(() => validateValue(f, '5'), (e) => e.code === 'invalid_type');
  assert.throws(() => validateValue(f, 2.5), (e) => e.code === 'not_integer');
  assert.throws(() => validateValue(f, NaN), (e) => e.code === 'invalid_type');
  assert.equal(validateValue(fieldOf('whoami', 'timerEnabled'), true), true);
  assert.throws(() => validateValue(fieldOf('whoami', 'timerEnabled'), 1), (e) => e.code === 'invalid_type');
  const times = fieldOf('bomb', 'times');
  assert.deepEqual(validateValue(times, [15, 12, 10, 7, 5, 4]), [15, 12, 10, 7, 5, 4]);
  assert.throws(() => validateValue(times, [1, 2, 3, 4, 5, 6]), (e) => e.code === 'not_descending');
  assert.throws(() => validateValue(times, [15, 12]), (e) => e.code === 'invalid_length');
  assert.throws(() => validateValues('nope', {}), (e) => e.code === 'unknown_game');
  assert.throws(() => validateValues('bomb', { nope: 1 }), (e) => e.code === 'unknown_setting');
  assert.throws(() => validateValues('bomb', null), ValidationError);
  assert.equal(defaultsOf('harfnajat').answerSeconds, 20);
});

// ----------------------------------------------------------------------------------- الخدمة: العزل والمنطق
const mk = () => { let t = 1000; const store = new MemoryStore(); return { store, svc: new BatmishService({ store, now: () => ++t }) }; };

test('عزل الستريمرات: تعديل _zvd4 لا يظهر لأي حساب آخر ولا يغيّر الافتراضي', async () => {
  const { svc } = mk();
  const defaultsBefore = JSON.stringify(GAMES);
  await svc.applyChanges('uidA', 'sniper', { ammoSniper: 12 });
  const a = await svc.overlay('uidA');
  const b = await svc.overlay('uidB');
  assert.equal(a.config.sniper.ammoSniper, 12);
  assert.deepEqual(b.config, {});
  assert.equal((await svc.resolveRound('uidB', 'sniper')).values.ammoSniper, defaultsOf('sniper').ammoSniper);
  assert.equal((await svc.resolveRound('uidA', 'sniper')).values.ammoSniper, 12);
  assert.equal(JSON.stringify(GAMES), defaultsBefore, 'الكتالوج الافتراضي لم يتغيّر');
  assert.deepEqual((await svc.history('uidB')), []);
  assert.equal((await svc.history('uidA')).length, 1);
});

test('لقطة الراوند ثابتة: تعديل لاحق لا يغيّر لقطة أُخذت قبله', async () => {
  const { svc } = mk();
  await svc.applyChanges('u', 'whoami', { maxAttempts: 4 });
  const snap = await svc.resolveRound('u', 'whoami');
  await svc.applyChanges('u', 'whoami', { maxAttempts: 9 });
  assert.equal(snap.values.maxAttempts, 4);
  assert.throws(() => { 'use strict'; snap.values.maxAttempts = 1; });
  assert.equal((await svc.resolveRound('u', 'whoami')).values.maxAttempts, 9);
});

test('applyChanges: يتجاهل الأكواد غير المتغيّرة، يرفض غير الصالح بلا حفظ جزئي', async () => {
  const { svc } = mk();
  const r0 = await svc.applyChanges('u', 'whoami', { maxAttempts: 3 });           // مساوي للافتراضي
  assert.equal(r0.changes.length, 0);
  await assert.rejects(() => svc.applyChanges('u', 'whoami', { maxAttempts: 5, timerSeconds: 999 }), (e) => e.code === 'out_of_range');
  assert.deepEqual((await svc.overlay('u')).config, {}, 'ما انحفظ شيء من الطلب المرفوض');
  const r = await svc.applyChanges('u', 'whoami', { maxAttempts: 5, timerEnabled: true });
  assert.equal(r.changes.length, 2);
  assert.deepEqual((await svc.overlay('u')).config.whoami, { maxAttempts: 5, timerEnabled: true });
});

test('تعارض الإصدار (baseRev): تبويبان مفتوحان لا يكتبان فوق بعض', async () => {
  const { svc } = mk();
  const r1 = await svc.applyChanges('u', 'whoami', { maxAttempts: 4 });
  await svc.applyChanges('u', 'whoami', { maxAttempts: 6 });
  await assert.rejects(() => svc.applyChanges('u', 'whoami', { maxAttempts: 8 }, { baseRev: r1.rev }), ConflictError);
});

test('كتابات متزامنة لنفس الحساب تتسلسل بلا فقدان', async () => {
  const { svc } = mk();
  await Promise.all(['ammoSniper', 'ammoBomb', 'ammoNuke'].map((k, i) => svc.applyChanges('u', 'sniper', { [k]: i + 7 })));
  const c = (await svc.overlay('u')).config.sniper;
  assert.deepEqual(c, { ammoSniper: 7, ammoBomb: 8, ammoNuke: 9 });
});

test('إعادة الافتراضي: مفتاح ولعبة كاملة، وسجل يوثّقها', async () => {
  const { svc } = mk();
  await svc.applyChanges('u', 'whoami', { maxAttempts: 7, timerEnabled: true });
  await svc.applyChanges('u', 'priceguess', { maxAttempts: 4 });
  await svc.resetKey('u', 'whoami', 'maxAttempts');
  assert.deepEqual((await svc.overlay('u')).config.whoami, { timerEnabled: true });
  await svc.resetGame('u', 'whoami');
  const c = (await svc.overlay('u')).config;
  assert.equal(c.whoami, undefined);
  assert.equal(c.priceguess.maxAttempts, 4, 'لعبة ثانية ما تأثرت');
  const h = await svc.history('u', { tag: 'whoami' });
  assert.ok(h.some((e) => e.status === 'reset'));
});

test('المجموعات: إنشاء/تطبيق على لعبتها فقط/نسخ/تسمية/افتراضية/حذف', async () => {
  const { svc } = mk();
  await svc.applyChanges('u', 'sniper', { ammoSniper: 9, ammoBomb: 5 });
  const p = await svc.createPreset('u', 'sniper', 'FAST ROUND');
  assert.deepEqual(p.values, { ammoSniper: 9, ammoBomb: 5 });
  await svc.applyChanges('u', 'whoami', { maxAttempts: 8 });
  await svc.resetGame('u', 'sniper');
  const ap = await svc.applyPreset('u', p.id);
  assert.equal(ap.changes.length, 2);
  const cfg = (await svc.overlay('u')).config;
  assert.deepEqual(cfg.sniper, { ammoSniper: 9, ammoBomb: 5 });
  assert.equal(cfg.whoami.maxAttempts, 8, 'تطبيق مجموعة لعبة لا يغيّر لعبة أخرى');
  await assert.rejects(() => svc.createPreset('u', 'sniper', 'fast round'), (e) => e.code === 'duplicate_name');
  const c = await svc.duplicatePreset('u', p.id);
  assert.equal(c.name, 'FAST ROUND COPY');
  const u = await svc.updatePreset('u', c.id, { name: 'COMPETITIVE MODE', values: { ammoSniper: 20 } });
  assert.equal(u.name, 'COMPETITIVE MODE');
  await svc.setDefaultPreset('u', c.id);
  assert.equal((await svc.getState('u')).defaultPresets.sniper, c.id);
  await svc.deletePreset('u', c.id);
  assert.equal((await svc.getState('u')).defaultPresets.sniper, undefined);
  await assert.rejects(() => svc.applyPreset('other', p.id), (e) => e.code === 'not_found', 'مجموعة ستريمر ثاني لا تُرى');
  await assert.rejects(() => svc.createPreset('u', 'sniper', 'x', { nope: 1 }), (e) => e.code === 'unknown_setting');
});

test('السجل والتراجع: تراجع عن تعديل محدد يرجّع القيمة القديمة فقط ويُسجَّل', async () => {
  const { svc } = mk();
  await svc.applyChanges('u', 'whoami', { maxAttempts: 5 });
  await svc.applyChanges('u', 'whoami', { maxAttempts: 8 });
  const h = await svc.history('u', { tag: 'whoami' });
  assert.equal(h[0].old, 5); assert.equal(h[0].new, 8);
  const r = await svc.revertEntry('u', h[0].id);
  assert.equal(r.changes[0].new, 5);
  assert.equal((await svc.overlay('u')).config.whoami.maxAttempts, 5);
  const h2 = await svc.history('u', { tag: 'whoami' });
  assert.equal(h2[0].status, 'reverted');
  await assert.rejects(() => svc.revertEntry('other', h[0].id), (e) => e.code === 'not_found', 'سجل ستريمر ثاني لا يُرى');
});

test('السجل محدود الحجم', async () => {
  const { svc } = mk();
  for (let i = 0; i < 320; i++) await svc.applyChanges('u', 'whoami', { maxAttempts: (i % 2) + 4 });
  assert.ok((await svc.history('u', { limit: 1000 })).length <= 300);
});

// ----------------------------------------------------------------------------------- البوابة
const fakeWs = () => { const h = {}; return { readyState: 1, on(e, f) { (h[e] = h[e] || []).push(f); }, close() { this.readyState = 3; (h.close || []).forEach((f) => f()); } }; };

test('البوابة: تحتاج تثبيت الهوية + جلسة بث موثَّقة على _zvd4 الآن', async () => {
  const store = new MemoryStore();
  const acc = new BatmishAccess({ store });
  assert.deepEqual(await acc.check('u1'), { allowed: false, reason: 'not_bound' });
  await acc.bind('u1', 'owner');
  assert.equal((await acc.check('u1')).reason, 'not_linked');
  const ws = fakeWs();
  acc.registerSession('u1', 'SomeoneElse', ws);
  assert.equal((await acc.check('u1')).reason, 'not_linked', 'مربوط بيوزر آخر');
  const ws2 = fakeWs();
  acc.registerSession('u1', '@_ZVD4', ws2);                                    // توحيد حالة الأحرف و@
  assert.deepEqual(await acc.check('u1'), { allowed: true, reason: 'ok', streamerId: '_zvd4', via: 'stream' });
  assert.equal((await acc.check('u2')).reason, 'not_streamer', 'حساب غير المثبَّت');
  assert.equal((await acc.check('')).reason, 'unauthenticated');
  ws2.close();                                                                 // انقطع الربط → تختفي فوراً
  assert.equal((await acc.check('u1')).reason, 'not_linked');
});

test('البوابة: حساب مختلف متصل بغرفة _zvd4 كمشاهد لا يفتح اللوحة (التثبيت هو المرجع)', async () => {
  const acc = new BatmishAccess({ store: new MemoryStore() });
  await acc.bind('realStreamer', 'owner');
  acc.registerSession('viewerX', '_zvd4', fakeWs());
  assert.equal((await acc.check('viewerX')).reason, 'not_streamer');
});

test('البوابة: autoClaim معطّل افتراضياً، ويثبّت أول جلسة فقط عند تفعيله', async () => {
  const a1 = new BatmishAccess({ store: new MemoryStore() });
  a1.registerSession('u', '_zvd4', fakeWs());
  assert.equal((await a1.check('u')).reason, 'not_bound');
  const a2 = new BatmishAccess({ store: new MemoryStore(), autoClaim: true });
  a2.registerSession('first', '_zvd4', fakeWs());
  assert.equal((await a2.check('first')).allowed, true);
  a2.registerSession('second', '_zvd4', fakeWs());
  assert.equal((await a2.check('second')).reason, 'not_streamer');
});

test('البوابة: تثبيت من متغيّر بيئة', async () => {
  const acc = new BatmishAccess({ store: new MemoryStore(), envPinUid: 'pinned' });
  acc.registerSession('pinned', '_zvd4', fakeWs());
  assert.equal((await acc.check('pinned')).allowed, true);
});

// ----------------------------------------------------------------------------------- HTTP كامل (خادم حقيقي)
const TOKENS = { 'tok-zvd': { uid: 'uid-zvd', email: 'z@x.com' }, 'tok-other': { uid: 'uid-other', email: 'o@x.com' }, 'tok-owner': { uid: 'uid-owner', email: OWNER } };
async function startApi(opts = {}) {
  const store = new MemoryStore();
  const service = new BatmishService({ store });
  const access = new BatmishAccess({ store, ...(opts.access || {}) });
  const readJsonBody = async (req, limit = 10000) => { let n = 0; const c = []; for await (const x of req) { n += x.length; if (n > limit) throw new Error('الجسم كبير جداً'); c.push(x); } const t = Buffer.concat(c).toString('utf8'); return t ? JSON.parse(t) : {}; };
  const handler = createBatmishHandler({ verifyToken: async (t) => TOKENS[t] || null, resolveUid: async (n) => (n === 'zvd_site_name' ? 'uid-zvd' : null), service, access, ownerEmail: OWNER, limiter: new RateLimiter({ perMinute: opts.rate || 1000 }), readJsonBody });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!(await handler(req, res, url.pathname, url))) { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (method, p, tok, body, headers = {}) => {
    const r = await fetch(base + p, { method, headers: { ...(tok ? { Authorization: 'Bearer ' + tok } : {}), 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) { /* 204 */ }
    return { status: r.status, body: j };
  };
  return { server, call, access, service, store };
}

test('HTTP: غير مسجّل = 401، حساب غير مثبَّت = 403 على كل المسارات المحمية', async () => {
  const { server, call, access } = await startApi();
  try {
    assert.equal((await call('GET', '/batmish/access', null)).status, 401);
    assert.equal((await call('GET', '/batmish/access', 'bad-token')).status, 401);
    await access.bind('uid-zvd', 'owner');
    access.registerSession('uid-zvd', '_zvd4', fakeWs());
    const protectedCalls = [['GET', '/batmish/bootstrap'], ['GET', '/batmish/overlay'], ['GET', '/batmish/resolve?tag=sniper'], ['GET', '/batmish/history'],
      ['POST', '/batmish/config', { tag: 'sniper', values: { ammoSniper: 9 } }], ['POST', '/batmish/reset', { tag: 'sniper' }], ['POST', '/batmish/presets', { op: 'create', tag: 'sniper', name: 'x' }],
      ['POST', '/batmish/history/revert', { id: 'x' }], ['POST', '/batmish/history/restore-game', { tag: 'sniper' }]];
    for (const [m, p, b] of protectedCalls) {
      const r = await call(m, p, 'tok-other', b);
      assert.equal(r.status, 403, m + ' ' + p + ' → ' + r.status);
      assert.equal(r.body.reason, 'not_streamer');
    }
    assert.deepEqual((await call('GET', '/batmish/access', 'tok-other')).body, { allowed: false, reason: 'not_streamer' });
    const ok = await call('GET', '/batmish/access', 'tok-zvd');
    assert.deepEqual(ok.body, { allowed: true, reason: 'ok', streamerId: '_zvd4', via: 'stream' });
  } finally { server.close(); }
});

test('HTTP: لا يمكن انتحال uid عبر الجسم أو الرابط — الهوية من التوكن فقط', async () => {
  const { server, call, access, service } = await startApi();
  try {
    await access.bind('uid-zvd', 'owner');
    access.registerSession('uid-zvd', '_zvd4', fakeWs());
    const r = await call('POST', '/batmish/config?uid=uid-other', 'tok-zvd', { uid: 'uid-other', tag: 'whoami', values: { maxAttempts: 9 } });
    assert.equal(r.status, 200);
    assert.equal((await service.overlay('uid-zvd')).config.whoami.maxAttempts, 9);
    assert.deepEqual((await service.overlay('uid-other')).config, {});
  } finally { server.close(); }
});

test('HTTP: تدفق كامل: bootstrap، تعديل، حفظ يبقى، سجل، تراجع، مجموعة، reset', async () => {
  const { server, call, access } = await startApi();
  try {
    await access.bind('uid-zvd', 'owner');
    access.registerSession('uid-zvd', '_zvd4', fakeWs());
    const boot = (await call('GET', '/batmish/bootstrap', 'tok-zvd')).body;
    assert.ok(Object.keys(boot.games).length >= 18);
    assert.equal(boot.state.rev, 0);
    const w = await call('POST', '/batmish/config', 'tok-zvd', { tag: 'harfnajat', values: { answerSeconds: 40 }, baseRev: 0 });
    assert.equal(w.status, 200); assert.equal(w.body.rev, 1);
    assert.equal((await call('POST', '/batmish/config', 'tok-zvd', { tag: 'harfnajat', values: { answerSeconds: 41 }, baseRev: 0 })).status, 409);
    const bad = await call('POST', '/batmish/config', 'tok-zvd', { tag: 'harfnajat', values: { answerSeconds: 4 } });
    assert.equal(bad.status, 400); assert.equal(bad.body.error, 'out_of_range');
    assert.equal((await call('POST', '/batmish/config', 'tok-zvd', { tag: 'nope', values: {} })).body.error, 'unknown_game');
    assert.equal((await call('GET', '/batmish/overlay', 'tok-zvd')).body.config.harfnajat.answerSeconds, 40);   // يبقى بعد "تحديث"
    const snap = (await call('GET', '/batmish/resolve?tag=harfnajat', 'tok-zvd')).body;
    assert.equal(snap.values.answerSeconds, 40);
    const hist = (await call('GET', '/batmish/history?tag=harfnajat', 'tok-zvd')).body.history;
    assert.equal(hist.length, 1);
    const rv = await call('POST', '/batmish/history/revert', 'tok-zvd', { id: hist[0].id });
    assert.equal(rv.status, 200);
    assert.equal((await call('GET', '/batmish/overlay', 'tok-zvd')).body.config.harfnajat, undefined);
    await call('POST', '/batmish/config', 'tok-zvd', { tag: 'sniper', values: { ammoSniper: 11 } });
    const pr = (await call('POST', '/batmish/presets', 'tok-zvd', { op: 'create', tag: 'sniper', name: 'DARK CHALLENGE' })).body.preset;
    await call('POST', '/batmish/reset', 'tok-zvd', { tag: 'sniper' });
    assert.equal((await call('GET', '/batmish/overlay', 'tok-zvd')).body.config.sniper, undefined);
    await call('POST', '/batmish/presets', 'tok-zvd', { op: 'apply', id: pr.id });
    assert.equal((await call('GET', '/batmish/overlay', 'tok-zvd')).body.config.sniper.ammoSniper, 11);
    assert.equal((await call('POST', '/batmish/presets', 'tok-zvd', { op: 'zzz' })).status, 400);
    assert.equal((await call('POST', '/batmish/history/restore-game', 'tok-zvd', { tag: 'sniper' })).status, 200);
  } finally { server.close(); }
});

test('HTTP: ربط البث يسقط → كل المسارات المحمية ترجع 403 فوراً', async () => {
  const { server, call, access } = await startApi();
  try {
    await access.bind('uid-zvd', 'owner');
    const ws = fakeWs();
    access.registerSession('uid-zvd', '_zvd4', ws);
    assert.equal((await call('GET', '/batmish/overlay', 'tok-zvd')).status, 200);
    ws.close();
    const r = await call('GET', '/batmish/overlay', 'tok-zvd');
    assert.equal(r.status, 403); assert.equal(r.body.reason, 'not_linked');
  } finally { server.close(); }
});

test('HTTP: مسارات المالك للتثبيت (bind/unbind/status) للمالك فقط', async () => {
  const { server, call, access } = await startApi();
  try {
    assert.equal((await call('POST', '/batmish/admin/bind', 'tok-zvd', { uid: 'uid-zvd' })).status, 403);
    assert.equal((await call('GET', '/batmish/admin/status', 'tok-other')).status, 403);
    assert.equal((await call('GET', '/batmish/admin/status', 'tok-owner')).body.pinnedUid, null);
    assert.equal((await call('POST', '/batmish/admin/bind', 'tok-owner', { uid: 'uid-zvd' })).status, 200);
    assert.equal((await call('GET', '/batmish/admin/status', 'tok-owner')).body.pinnedUid, 'uid-zvd');
    access.registerSession('uid-zvd', '_zvd4', fakeWs());
    assert.equal((await call('GET', '/batmish/access', 'tok-zvd')).body.allowed, true);
    await call('POST', '/batmish/admin/unbind', 'tok-owner', {});
    assert.equal((await call('POST', '/batmish/admin/bind', 'tok-owner', { username: 'nobody' })).status, 404);
    assert.equal((await call('POST', '/batmish/admin/bind', 'tok-owner', {})).status, 400);
    assert.equal((await call('POST', '/batmish/admin/bind', 'tok-owner', { username: 'zvd_site_name' })).body.pinnedUid, 'uid-zvd');
    assert.equal((await call('GET', '/batmish/access', 'tok-zvd')).body.allowed, true);
    await call('POST', '/batmish/admin/unbind', 'tok-owner', {});
    assert.equal((await call('GET', '/batmish/access', 'tok-zvd')).body.allowed, false);
  } finally { server.close(); }
});

test('HTTP: حدّ الطلبات، JSON تالف، أصل مرفوض، CORS', async () => {
  const { server, call, access } = await startApi({ rate: 5 });
  try {
    await access.bind('uid-zvd', 'owner'); access.registerSession('uid-zvd', '_zvd4', fakeWs());
    const r = await fetch(server.address ? 'http://127.0.0.1:' + server.address().port + '/batmish/config' : '', { method: 'POST', headers: { Authorization: 'Bearer tok-zvd', 'content-type': 'application/json' }, body: '{bad' });
    assert.equal(r.status, 400);
    const bad = await fetch('http://127.0.0.1:' + server.address().port + '/batmish/access', { headers: { Authorization: 'Bearer tok-zvd', Origin: 'https://evil.example' } });
    assert.equal(bad.status, 403);
    const good = await fetch('http://127.0.0.1:' + server.address().port + '/batmish/access', { headers: { Authorization: 'Bearer tok-zvd', Origin: 'https://ehsmaha.com' } });
    assert.equal(good.headers.get('access-control-allow-origin'), 'https://ehsmaha.com');
    let limited = 0;
    for (let i = 0; i < 8; i++) if ((await call('GET', '/batmish/access', 'tok-zvd')).status === 429) limited++;
    assert.ok(limited >= 1);
  } finally { server.close(); }
});

// ----------------------------------------------------------------------------------- الجسر يسجّل جلسات موثَّقة فقط عند توكن صحيح
test('جسر /ws: توكن صحيح يسجّل جلسة للبوابة، بدون توكن أو بتوكن خاطئ لا يسجّل، وسلوك الاتصال القديم لا يتغيّر', async () => {
  const store = new MemoryStore();
  const access = new BatmishAccess({ store });
  await access.bind('uid-zvd', 'owner');
  const bridge = new LegacyBridgeServer({ log: () => {}, isStreamerEnabled: async () => true, verifyToken: async (t) => TOKENS[t] || null, onSession: (u, id, ws) => access.registerSession(u, id, ws) });
  bridge.getOrCreateRoom = () => ({ addClient(ws) { ws.send(JSON.stringify({ type: 'bridge_status', state: 'connecting' })); }, removeClient() {} });
  const server = http.createServer((q, s) => { s.writeHead(404); s.end(); });
  server.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const open = (qs) => new Promise((resolve, reject) => { const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?${qs}`); ws.on('message', () => resolve(ws)); ws.on('error', reject); setTimeout(() => reject(new Error('timeout')), 4000); });
  try {
    const anon = await open('u=_zvd4');
    assert.equal((await access.check('uid-zvd')).reason, 'not_linked', 'اتصال بلا توكن لا يعدّ ربطاً');
    const wrong = await open('u=_zvd4&t=garbage');
    assert.equal((await access.check('uid-zvd')).reason, 'not_linked');
    const other = await open('u=_zvd4&t=tok-other');
    assert.equal((await access.check('uid-other')).reason, 'not_streamer');
    const good = await open('u=_zvd4&t=tok-zvd');
    assert.equal((await access.check('uid-zvd')).allowed, true);
    good.close();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal((await access.check('uid-zvd')).reason, 'not_linked');
    [anon, wrong, other].forEach((w) => w.close());
  } finally { server.close(); }
});

test('البوابة: ستريمران بث (_zvd4 وother) — لكل واحد تثبيت مستقل، ولا يُفتح لأحدهما ببث الآخر', async () => {
  const store = new MemoryStore();
  const acc = new BatmishAccess({ store, streamers: ['_zvd4', 'mish'], siteUsers: [] });
  await acc.bind('uZ', 'owner', '_zvd4');
  await acc.bind('uM', 'owner', 'mish');
  acc.registerSession('uM', '@Mish', fakeWs());                      // توحيد حالة الأحرف و@
  assert.deepEqual(await acc.check('uM'), { allowed: true, reason: 'ok', streamerId: 'mish', via: 'stream' });
  assert.equal((await acc.check('uZ')).reason, 'not_linked');        // uZ ما اتصل ببثه
  acc.registerSession('uZ', 'mish', fakeWs());                       // uZ متصل بغرفة mish فقط → لا يكفي
  assert.equal((await acc.check('uZ')).allowed, false);
  acc.registerSession('uZ', '_zvd4', fakeWs());
  assert.equal((await acc.check('uZ')).streamerId, '_zvd4');
  acc.registerSession('uOther', 'mish', fakeWs());
  assert.equal((await acc.check('uOther')).reason, 'not_streamer');
  await assert.rejects(() => acc.bind('uX', 'owner', 'someoneelse'));
  await acc.unbind('mish');
  assert.equal((await acc.check('uM')).allowed, false);
  assert.equal((await acc.check('uZ')).allowed, true);               // إلغاء تثبيت mish لا يمس _zvd4
});

test('البوابة: حساب احسمها المسمّى (mish) يفتح اللوحة بمجرد الدخول بدون بث، والخادم يتحقق من uid الحساب', async () => {
  const names = { mish: 'uM' };
  const acc = new BatmishAccess({ store: new MemoryStore(), resolveUid: async (n) => names[n] || '' });
  assert.deepEqual(await acc.check('uM'), { allowed: true, reason: 'ok', streamerId: '_zvd4', via: 'account' });
  assert.equal((await acc.check('uOther')).allowed, false, 'حساب آخر لا يفتح');
  assert.equal((await acc.check('uOther')).reason, 'not_bound');
  // _zvd4 ما تأثر: يحتاج تثبيت + بث
  await acc.bind('uZ', 'owner');
  assert.equal((await acc.check('uZ')).reason, 'not_linked');
  acc.registerSession('uZ', '_zvd4', fakeWs());
  assert.deepEqual(await acc.check('uZ'), { allowed: true, reason: 'ok', streamerId: '_zvd4', via: 'stream' });
  // فشل محلّل الأسماء لا يفتح لأحد ولا يكسر الباقي
  const bad = new BatmishAccess({ store: new MemoryStore(), resolveUid: async () => { throw new Error('down'); } });
  assert.equal((await bad.check('uM')).allowed, false);
});

// ----------------------------------------------------------------------------------- تخزين مرن (Firestore → RTDB)
import { ResilientStore } from '../src/batmish/store.js';
function fakeDb(fail) {
  const m = new Map();
  return { m, collection: (c) => ({ doc: (id) => ({
    get: async () => { if (fail.on) throw Object.assign(new Error('8 RESOURCE_EXHAUSTED: Quota exceeded'), { code: 8 }); const v = m.get(c + '/' + id); return { exists: v !== undefined, data: () => v }; },
    set: async (d) => { if (fail.on) throw new Error('quota'); m.set(c + '/' + id, JSON.parse(JSON.stringify(d))); },
    delete: async () => { if (fail.on) throw new Error('quota'); m.delete(c + '/' + id); },
  }) }) };
}
function fakeRtdb(fail) {
  const m = new Map();
  return { m, ref: (p) => ({
    get: async () => { if (fail.on) throw new Error('rtdb down'); const v = m.get(p); return { exists: () => v !== undefined, val: () => v }; },
    set: async (v) => { if (fail.on) throw new Error('rtdb down'); m.set(p, JSON.parse(JSON.stringify(v))); },
    remove: async () => { if (fail.on) throw new Error('rtdb down'); m.delete(p); },
  }) };
}
test('تخزين BATMISH المرن: نفاد حصة Firestore لا يعطّل القراءة/الكتابة (يرجع لـRTDB) وعند عودته تُعتمد الأحدث', async () => {
  const fsF = { on: false }, rtF = { on: false };
  const st = new ResilientStore({ db: fakeDb(fsF), rtdb: fakeRtdb(rtF) });
  const svc = new BatmishService({ store: st });
  await svc.getState('u1');                                         // بدون مستند: يرجع الافتراضي
  await svc.applyChanges('u1', 'bomb', { revivalMaxUses: 4 });
  fsF.on = true;                                                    // نفدت حصة Firestore
  const s1 = await svc.getState('u1');
  assert.ok(s1 && typeof s1.rev === 'number', 'القراءة تعمل رغم فشل Firestore');
  await svc.applyChanges('u1', 'bomb', { revivalMaxUses: 5 }, { baseRev: s1.rev });   // كتابة تذهب لـRTDB
  fsF.on = false;                                                   // Firestore رجع (ببيانات أقدم)
  const s2 = await svc.getState('u1');
  assert.equal(s2.config.bomb.revivalMaxUses, 5, 'تُعتمد النسخة الأحدث');
  rtF.on = true; fsF.on = true;                                     // الاثنان معطّلان → خطأ صريح
  await assert.rejects(() => svc.getState('u1'));
});

test('البوابة: حساب المالك mzx يفتح اللوحة بإعداداته المنفصلة ويُعرض باسمه، وmish يبقى باسم _zvd4', async () => {
  const names = { mish: 'uM', mzx: 'uX' };
  const acc = new BatmishAccess({ store: new MemoryStore(), resolveUid: async (n) => names[n] || '' });
  assert.deepEqual(await acc.check('uX'), { allowed: true, reason: 'ok', streamerId: 'mzx', via: 'account' });
  assert.equal((await acc.check('uM')).streamerId, '_zvd4');
  assert.equal((await acc.check('uRandom')).allowed, false);
});
