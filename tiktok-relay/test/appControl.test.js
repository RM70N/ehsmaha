import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppControlService, sanitizeConfig, sanitizeNotification, createDownloadsFetcher } from '../src/appControl.js';

const ID = (c) => c.repeat(32);
function svc(extra = {}) {
  let t = 1_000_000; const mem = {};
  const store = { get: async (p) => (p in mem ? mem[p] : null), set: async (p, v) => { mem[p] = JSON.parse(JSON.stringify(v)); } };
  const s = new AppControlService({ store, now: () => t, fetchDownloads: async () => ({ total: 42, releases: [{ tag: 'v1.1.2', count: 40 }, { tag: 'v1.0.1', count: 2 }] }), ...extra });
  return { s, mem, advance: (ms) => { t += ms; } };
}

test('hello registers installs (valid ids only) with version/platform; persisted on first sight', async () => {
  const { s, mem } = svc();
  assert.equal(s.registerHello({ installId: 'bad', version: '1.1.2' }), null);
  s.registerHello({ installId: ID('a'), version: '1.1.2', platform: 'win32' });
  s.registerHello({ installId: ID('b'), version: '1.0.1', platform: 'win32' });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(Object.keys(mem).filter((k) => k.startsWith('appControl/installs/')).length, 2);
  const st = await s.stats();
  assert.equal(st.installs, 2); assert.deepEqual(st.byVersion, { '1.1.2': 1, '1.0.1': 1 }); assert.equal(st.byPlatform.win, 2);
});

test('online = live connections; disconnect removes; stale-replace safe', async () => {
  const { s } = svc(); const ws1 = {}, ws2 = {};
  s.registerHello({ installId: ID('a'), version: '1.1.2', platform: 'win32' });
  s.connected(ID('a'), ws1, { version: '1.1.2' });
  assert.equal((await s.stats()).onlineNow, 1);
  s.connected(ID('a'), ws2, { version: '1.1.2' }); s.disconnected(ID('a'), ws1); // الاتصال القديم لا يُسقط الجديد
  assert.equal((await s.stats()).onlineNow, 1);
  s.disconnected(ID('a'), ws2); assert.equal((await s.stats()).onlineNow, 0);
});

test('active24h / active7d windows', async () => {
  const { s, advance } = svc();
  s.registerHello({ installId: ID('a'), version: '1.1.2' }); advance(2 * 24 * 3600e3);
  s.registerHello({ installId: ID('b'), version: '1.1.2' });
  const st = await s.stats(); assert.equal(st.active24h, 1); assert.equal(st.active7d, 2);
});

test('notify sanitises, counts deliveries, keeps last for late joiners (10 min)', () => {
  const { s, advance } = svc(); const pushed = [];
  const r = s.notify({ title: ' مرحبا‮ ', body: 'نص'.repeat(200), target: '__proto__' }, (m) => { pushed.push(m); return 3; });
  assert.equal(r.ok, true); assert.equal(r.delivered, 3);
  assert.equal(pushed[0].title, 'مرحبا'); assert.ok(pushed[0].body.length <= 240); assert.equal(pushed[0].target, 'home');
  assert.equal(s.notify({ title: '  ' }, () => 0).ok, false);
  assert.equal(s.welcome(ID('c')).some((m) => m.type === 'notify'), true);
  advance(11 * 60 * 1000); assert.equal(s.welcome(ID('c')).some((m) => m.type === 'notify'), false);
});

test('config sanitise + persist; bad values ignored', async () => {
  const { s, mem } = svc();
  const c = await s.setConfig({ motd: { text: ' صيانة قريبة ', active: true }, minVersion: '1.1.2', notificationsEnabled: 'x', codeLoginEnabled: false, evil: 1 });
  assert.equal(c.motd.text, 'صيانة قريبة'); assert.equal(c.motd.active, true); assert.equal(c.minVersion, '1.1.2');
  assert.equal(c.notificationsEnabled, true, 'non-boolean ignored'); assert.equal(c.codeLoginEnabled, false); assert.equal('evil' in c, false);
  assert.equal(mem['appControl/config'].minVersion, '1.1.2');
  assert.equal(sanitizeConfig({ minVersion: 'abc' }).minVersion, '');
  assert.equal(sanitizeConfig({ motd: { text: '', active: true } }).motd.active, false);
  const s2 = svc().s; s2.store = { get: async (p) => (p === 'appControl/config' ? { minVersion: '2.0.0' } : null), set: async () => {} };
  await s2.load(); assert.equal(s2.config.minVersion, '2.0.0');
});

test('downloads from GitHub releases (exe only), cached, failure tolerant', async () => {
  const f = createDownloadsFetcher(async () => ({ ok: true, json: async () => ([
    { tag_name: 'v1.1.2', assets: [{ name: 'ehsmaha-setup.exe', download_count: 7 }, { name: 'ehsmaha-x64.dmg', download_count: 99 }] },
    { tag_name: 'v1.0.1', assets: [{ name: 'ehsmaha-setup.exe', download_count: 3 }] }]) }));
  assert.deepEqual(await f(), { total: 10, releases: [{ tag: 'v1.1.2', count: 7 }, { tag: 'v1.0.1', count: 3 }] });
  const { s } = svc({ fetchDownloads: async () => { throw new Error('rate'); } });
  assert.equal((await s.stats()).downloads.total, 0);
});
