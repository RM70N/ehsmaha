'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { NotificationManager } = require('../src/notifications');
const { Settings, DEFAULTS } = require('../src/settings');
const { Logger, redact } = require('../src/logger');
const { navigationScript, resolveTarget } = require('../src/deeplinks');
const { tmp } = require('./helpers');

class FakeN extends EventEmitter {
  static shown = [];
  static isSupported() { return true; }
  constructor(o) { super(); this.opts = o; }
  show() { FakeN.shown.push(this); }
}

function mgr(over = {}) {
  FakeN.shown = [];
  const clicks = [];
  let t = 1_000_000;
  const ws = { visible: false, focused: false, minimized: false, inTray: true, ...(over.ws || {}) };
  const notif = { ...DEFAULTS.notif, ...(over.notif || {}) };
  const m = new NotificationManager({
    getSettings: () => notif, getWindowState: () => ws, NotificationClass: FakeN,
    onClick: (x) => clicks.push(x), now: () => t,
  });
  return { m, clicks, ws, notif, advance: (ms) => { t += ms; }, now: () => t };
}
const ev = (o = {}) => ({ kind: 'broadcast', id: 'x1', title: 'عنوان', body: 'نص', target: 'home', ...o });

test('shows when app is in tray/minimized, click opens target', () => {
  const k = mgr();
  const r = k.m.handle(ev());
  assert.equal(r.shown, true); assert.equal(r.windowState, 'tray');
  FakeN.shown[0].emit('click');
  assert.deepEqual(k.clicks, ['home']);
});

test('minimized state reported honestly', () => {
  const k = mgr({ ws: { visible: true, minimized: true, inTray: false } });
  assert.equal(k.m.handle(ev()).windowState, 'minimized');
});

test('no OS toast while window is focused', () => {
  const k = mgr({ ws: { visible: true, focused: true } });
  assert.equal(k.m.handle(ev()).reason, 'window-focused');
  assert.equal(FakeN.shown.length, 0);
});

test('dedup: same event twice shows once', () => {
  const k = mgr();
  assert.equal(k.m.handle(ev()).shown, true);
  assert.equal(k.m.handle(ev()).reason, 'duplicate');
  assert.equal(FakeN.shown.length, 1);
});

test('global toggle and per-category toggle respected', () => {
  assert.equal(mgr({ notif: { enabled: false } }).m.handle(ev()).reason, 'disabled');
  assert.equal(mgr({ notif: { events: false } }).m.handle(ev()).reason, 'category-disabled');
  assert.equal(mgr({ notif: { newGame: false } }).m.handle(ev({ kind: 'new-game' })).reason, 'category-disabled');
});

test('sound toggle maps to silent', () => {
  const k = mgr({ notif: { sound: false } });
  k.m.handle(ev());
  assert.equal(FakeN.shown[0].opts.silent, true);
});

test('stale events ignored; rate limit enforced', () => {
  const k = mgr();
  assert.equal(k.m.handle(ev({ id: 'old', sentAt: k.now() - 11 * 60 * 1000 })).reason, 'stale');
  for (let i = 0; i < 5; i++) assert.equal(k.m.handle(ev({ id: 'n' + i })).shown, true);
  assert.equal(k.m.handle(ev({ id: 'n6' })).reason, 'rate-limited');
  k.advance(61000);
  assert.equal(k.m.handle(ev({ id: 'n7' })).shown, true);
});

test('personal messages never leak content to lock screen', () => {
  const k = mgr();
  k.m.handle(ev({ kind: 'personal', id: 'p1', body: 'سر خاص' }));
  assert.ok(!FakeN.shown[0].opts.body.includes('سر'));
});

test('unknown kind / invalid payload rejected; control chars stripped', () => {
  const k = mgr();
  assert.equal(k.m.handle({ kind: 'evil', id: 'a', title: 't' }).reason, 'unknown-kind');
  assert.equal(k.m.handle(null).reason, 'invalid');
  k.m.handle(ev({ id: 'c', title: 'a‮b\u0000c', body: 'x'.repeat(1000) }));
  assert.equal(FakeN.shown[0].opts.title, 'a b c');
  assert.ok(FakeN.shown[0].opts.body.length <= 200);
});

test('settings: defaults, validation, clamp; startup OFF by default', () => {
  const store = { d: {}, get(k, f) { return k in this.d ? this.d[k] : f; }, set(k, v) { this.d[k] = v; } };
  const s = new Settings(store);
  assert.equal(s.getAll().startWithWindows, false);
  assert.equal(s.getAll().notif.enabled, true);
  const u = s.update({ zoomFactor: 99, bogus: 1, notif: { sound: false, enabled: 'yes', evil: true }, startWithWindows: 'x' });
  assert.equal(u.zoomFactor, 1.5); assert.equal(u.notif.sound, false); assert.equal(u.notif.enabled, true);
  assert.equal(u.startWithWindows, false); assert.equal('bogus' in u, false);
});

test('logger redacts secrets', () => {
  const samples = [
    'Authorization: Bearer abc.def.ghi', 'url=https://x/?access_token=SECRET123&a=1',
    '{"password":"hunter2"}', 'key AIzaSyA1234567890123456789012345678901', 'id eyJhbGciOiJI.eyJzdWIiOiIx.SflKxwRJSMeKKF2QT4fw',
    'ya29.a0AfH6SMBxyz', 'code=4/0Abc&state=zz',
  ];
  for (const s of samples) {
    const r = redact(s);
    assert.ok(!/SECRET123|hunter2|AIzaSyA|eyJhbGci|ya29\.a0|abc\.def|4\/0Abc/.test(r), r);
  }
  const l = new Logger(tmp('log-'));
  l.error('t', new Error('boom token=abc123'));
  assert.ok(!l.tail().includes('abc123'));
});

test('deeplinks: whitelist only', () => {
  assert.equal(resolveTarget('profile'), 'pg-profile');
  assert.equal(resolveTarget('javascript:alert(1)'), 'pg-home');
  assert.ok(navigationScript('"+alert(1)+"').includes('"home"'));
  assert.equal(resolveTarget('__proto__'), 'pg-home');
});
