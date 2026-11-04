'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ContentStore } = require('../src/content-store');
const { syncContent } = require('../src/content-sync');
const { UpdateCoordinator, DEFER_TOAST } = require('../src/update-coordinator');
const { classify } = require('../src/safe-point');
const { tmp, makeSite, fakeFetch, BASE } = require('./helpers');

const ORIGIN = 'https://example.test';

function setup() {
  const bundled = makeSite(BASE);
  const store = new ContentStore(bundled.dir, tmp('ud-'));
  return { bundled, store };
}

test('manifest of bundled = active version, no pending', () => {
  const { bundled, store } = setup();
  assert.equal(store.activeVersion(), bundled.manifest.version);
  assert.equal(store.resolveServeDir().source, 'bundled');
  assert.equal(store.hasPending(), false);
});

test('scenario 1: new game added on the site is staged, verified and then served', async () => {
  const { store } = setup();
  const next = makeSite({ ...BASE, 'game2.html': '<!doctype html><html><body>NEW GAME</body></html>' });
  const fetched = [];
  const r = await syncContent({ store, origin: ORIGIN, fetchBuffer: fakeFetch(next.dir, { counter: fetched }) });
  assert.equal(r.status, 'staged');
  assert.deepEqual(r.diff.added, ['game2.html']);
  assert.equal(r.downloaded, 1, 'only the new file is downloaded');
  assert.equal(r.reused, 3);
  assert.ok(store.hasPending());
  // not served yet
  assert.equal(store.resolveServeDir().source, 'bundled');
  const resolved = store.promotePending();
  assert.equal(resolved.version, next.manifest.version);
  assert.ok(fs.existsSync(path.join(resolved.dir, 'game2.html')));
  // idempotent re-sync
  const again = await syncContent({ store, origin: ORIGIN, fetchBuffer: fakeFetch(next.dir) });
  assert.equal(again.status, 'up-to-date');
});

test('tampered file (sha mismatch) is rejected; current version untouched', async () => {
  const { bundled, store } = setup();
  const next = makeSite({ ...BASE, 'lib/app.js': 'console.log(2)' });
  const r = await syncContent({ store, origin: ORIGIN, fetchBuffer: fakeFetch(next.dir, { corrupt: { 'lib/app.js': 'evil()' } }) });
  assert.equal(r.status, 'error');
  assert.match(r.error, /حجم|بصمة/);
  assert.equal(store.hasPending(), false);
  assert.equal(store.activeVersion(), bundled.manifest.version);
  assert.equal(fs.existsSync(store.stagingDir) ? fs.readdirSync(store.stagingDir).length : 0, 0);
});

test('network failure mid-download leaves no partial state', async () => {
  const { bundled, store } = setup();
  const next = makeSite({ ...BASE, 'game2.html': '<!doctype html><html></html>' });
  const r = await syncContent({ store, origin: ORIGIN, fetchBuffer: fakeFetch(next.dir, { fail: new Set(['game2.html']) }) });
  assert.equal(r.status, 'error');
  assert.equal(store.hasPending(), false);
  assert.equal(store.activeVersion(), bundled.manifest.version);
});

test('missing dependency referenced by index.html blocks the update', async () => {
  const { store } = setup();
  const next = makeSite({ ...BASE, 'index.html': BASE['index.html'].replace('/lib/app.js', '/lib/missing.js') });
  const r = await syncContent({ store, origin: ORIGIN, fetchBuffer: fakeFetch(next.dir) });
  assert.equal(r.status, 'error');
  assert.match(r.error, /تبعيات مفقودة/);
});

test('path traversal in manifest is rejected', async () => {
  const { store } = setup();
  const next = makeSite(BASE);
  const evil = JSON.parse(JSON.stringify(next.manifest));
  evil.files.push({ path: '../evil.js', size: 1, sha256: 'a'.repeat(64) });
  const fetchBuffer = async (url) => (url.includes('content-manifest.json') ? Buffer.from(JSON.stringify(evil)) : Buffer.from(''));
  const r = await syncContent({ store, origin: ORIGIN, fetchBuffer });
  assert.equal(r.status, 'error');
});

function coordinator(store, { idleSnap, healthOk = true } = {}) {
  const toasts = []; const serveDirs = []; let reloads = 0; const snap = { current: idleSnap };
  const c = new UpdateCoordinator({
    store,
    probe: async () => snap.current,
    setServeDir: (d) => serveDirs.push(d),
    reloadAndCheck: async () => { reloads++; return typeof healthOk === 'function' ? healthOk(reloads) : healthOk; },
    toast: (m, k) => toasts.push([m, k]),
    pollMs: 20,
  });
  return { c, toasts, serveDirs, snap, reloads: () => reloads };
}

const IDLE = { pageId: 'pg-home', connections: 0, gameListeners: 0, frames: 0, gameFrame: false, path: '/' };
const ROUND = { pageId: 'pg-roulette', connections: 1, gameListeners: 2, frames: 0, gameFrame: false, path: '/' };

test('classify: idle vs active round vs unknown', () => {
  assert.equal(classify(IDLE).idle, true);
  assert.equal(classify(ROUND).idle, false);
  assert.equal(classify({ ...IDLE, connections: 1 }).idle, false, 'live stream connected');
  assert.equal(classify({ ...IDLE, gameFrame: true }).idle, false, 'game iframe visible');
  assert.equal(classify({ ...IDLE, path: '/roulette3d.html' }).idle, false);
  assert.equal(classify(null).idle, false, 'unknown => busy');
  assert.equal(classify({ ...IDLE, pageId: 'pg-unknown' }).idle, false);
});

test('scenario 2: update during active round is deferred, no reload, toast once, applied after round', async () => {
  const { store } = setup();
  const next = makeSite({ ...BASE, 'game2.html': '<!doctype html><html></html>' });
  await syncContent({ store, origin: ORIGIN, fetchBuffer: fakeFetch(next.dir) });
  const k = coordinator(store, { idleSnap: ROUND });
  const r1 = await k.c.consider();
  assert.equal(r1.action, 'deferred');
  await k.c.consider(); await k.c.consider();
  assert.equal(k.reloads(), 0, 'page must NOT be reloaded during a round');
  assert.equal(k.toasts.filter(([m]) => m === DEFER_TOAST).length, 1, 'toast shown exactly once');
  assert.equal(store.activeVersion() !== next.manifest.version, true, 'old version still served');
  // round ends
  k.snap.current = IDLE;
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(store.activeVersion(), next.manifest.version);
  assert.equal(k.reloads(), 1);
  k.c.dispose();
});

test('user consent applies even during a round', async () => {
  const { store } = setup();
  const next = makeSite({ ...BASE, 'game2.html': '<!doctype html><html></html>' });
  await syncContent({ store, origin: ORIGIN, fetchBuffer: fakeFetch(next.dir) });
  const k = coordinator(store, { idleSnap: ROUND });
  await k.c.consider();
  const r = await k.c.applyByConsent();
  assert.equal(r.action, 'applied');
  assert.equal(store.activeVersion(), next.manifest.version);
  k.c.dispose();
});

test('scenario 3: failed health check rolls back to previous version and blacklists the bad one', async () => {
  const { bundled, store } = setup();
  const v2 = makeSite({ ...BASE, 'game2.html': '<!doctype html><html></html>' });
  await syncContent({ store, origin: ORIGIN, fetchBuffer: fakeFetch(v2.dir) });
  const k = coordinator(store, { idleSnap: IDLE, healthOk: (n) => n > 1 }); // first reload (new version) fails
  const r = await k.c.consider();
  assert.equal(r.action, 'rolled-back');
  assert.equal(store.activeVersion(), bundled.manifest.version);
  assert.ok(store.readState().badVersions.includes(v2.manifest.version));
  assert.ok(k.toasts.some(([, kind]) => kind === 'error'));
  // the bad version is not staged again
  const again = await syncContent({ store, origin: ORIGIN, fetchBuffer: fakeFetch(v2.dir) });
  assert.equal(again.status, 'error');
  assert.match(again.error, /محظور/);
  k.c.dispose();
});

test('corrupted stored version falls back to bundled content', async () => {
  const { bundled, store } = setup();
  const v2 = makeSite({ ...BASE, 'game2.html': '<!doctype html><html></html>' });
  await syncContent({ store, origin: ORIGIN, fetchBuffer: fakeFetch(v2.dir) });
  const resolved = store.promotePending();
  fs.writeFileSync(path.join(resolved.dir, 'index.html'), 'broken');
  assert.equal(store.resolveServeDir().source, 'bundled');
  assert.equal(store.activeVersion(), bundled.manifest.version);
});

test('prune keeps only current/previous', async () => {
  const { store } = setup();
  for (let i = 0; i < 3; i++) {
    const v = makeSite({ ...BASE, 'lib/app.js': 'v' + i });
    await syncContent({ store, origin: ORIGIN, fetchBuffer: fakeFetch(v.dir) });
    store.promotePending();
  }
  assert.ok(fs.readdirSync(store.versionsDir).length <= 2);
});
