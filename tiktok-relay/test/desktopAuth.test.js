import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DesktopAuthService, normalizeCode, corsHeaders, CODE_TTL_MS } from '../src/desktopAuth.js';

function svc() {
  let t = 1_000_000;
  const s = new DesktopAuthService({ createCustomToken: async (uid) => 'tok-' + uid, now: () => t });
  return { s, advance: (ms) => { t += ms; } };
}

test('issue then redeem once → custom token for the right uid; second redeem fails', async () => {
  const { s } = svc();
  const r = s.issue('uidA');
  assert.equal(r.ok, true); assert.match(r.code, /^[A-HJKMNP-Z2-9]{8}$/);
  const ok = await s.redeem(r.code.slice(0, 4) + '-' + r.code.slice(4).toLowerCase(), '1.1.1.1');
  assert.deepEqual(ok, { ok: true, customToken: 'tok-uidA' });
  assert.equal((await s.redeem(r.code, '1.1.1.1')).error, 'invalid_code');
});

test('expires after 2 minutes', async () => {
  const { s, advance } = svc();
  const { code } = s.issue('u');
  advance(CODE_TTL_MS + 1);
  assert.equal((await s.redeem(code, 'ip')).error, 'invalid_code');
});

test('new code replaces the previous one for the same account', async () => {
  const { s } = svc();
  const a = s.issue('u').code; const b = s.issue('u').code;
  assert.equal((await s.redeem(a, 'ip')).error, 'invalid_code');
  assert.equal((await s.redeem(b, 'ip')).ok, true);
});

test('brute force: per-IP failures are throttled, even a correct code is refused afterwards', async () => {
  const { s } = svc();
  const { code } = s.issue('victim');
  for (let i = 0; i < 8; i++) assert.equal((await s.redeem('AAAAAAAA', '6.6.6.6')).error, 'invalid_code');
  assert.equal((await s.redeem(code, '6.6.6.6')).error, 'rate_limited');
  assert.equal((await s.redeem(code, '7.7.7.7')).ok, true); // مستخدم آخر لا يتأثر
});

test('issue is rate-limited per account; unauthenticated issue refused', () => {
  const { s } = svc();
  for (let i = 0; i < 5; i++) assert.equal(s.issue('u').ok, true);
  assert.equal(s.issue('u').error, 'rate_limited');
  assert.equal(s.issue('').error, 'unauthorized');
});

test('malformed input never redeems', async () => {
  const { s } = svc();
  s.issue('u');
  for (const bad of [null, undefined, '', '1234', {}, 'x'.repeat(5000)]) assert.equal((await s.redeem(bad, 'ip2')).ok, false);
  assert.equal(normalizeCode(' ab-cd 12 '), 'ABCD12');
});

test('CORS only for ehsmaha.com origins', () => {
  assert.equal(corsHeaders('https://ehsmaha.com')['Access-Control-Allow-Origin'], 'https://ehsmaha.com');
  assert.deepEqual(corsHeaders('https://evil.com'), {});
  assert.deepEqual(corsHeaders(''), {});
});

test('requestByUsername: pushes code to the account\'s open sessions only; never returns it; limits', async () => {
  let t = 1_000_000; const pushed = [];
  const s = new DesktopAuthService({
    createCustomToken: async (uid) => 'tok-' + uid, now: () => t,
    resolveUid: async (n) => (n === 'sultan' ? 'uidS' : null),
    push: (uid, msg) => { pushed.push([uid, msg]); return uid === 'uidS' ? 1 : 0; },
  });
  const r = await s.requestByUsername('@Sultan', '1.1.1.1');
  assert.equal(r.ok, true); assert.equal(r.delivered, true); assert.ok(!('code' in r));
  assert.equal(pushed[0][0], 'uidS');
  const code = pushed[0][1].code;
  assert.equal((await s.redeem(code, '2.2.2.2')).customToken, 'tok-uidS');
  // مستخدم غير موجود: نفس الشكل، لا دفع
  const n = await s.requestByUsername('nobody', '1.1.1.1');
  assert.deepEqual([n.ok, n.delivered], [true, false]); assert.equal(pushed.length, 1);
  // بلا جلسة مفتوحة: لا رمز معلّق
  const off = new DesktopAuthService({ createCustomToken: async () => 'x', resolveUid: async () => 'u', push: () => 0, now: () => t });
  assert.equal((await off.requestByUsername('someone', 'i')).delivered, false); assert.equal(off.codes.size, 0);
  // حد لكل يوزر (3/دقيقة) ثم يُرفض
  for (let i = 0; i < 2; i++) await s.requestByUsername('sultan', '3.3.3.3');
  assert.equal((await s.requestByUsername('sultan', '4.4.4.4')).error, 'rate_limited');
  assert.equal((await s.requestByUsername('a b!', 'ip')).error, 'invalid_username');
});
