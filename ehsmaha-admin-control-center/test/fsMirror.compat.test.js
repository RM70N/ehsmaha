// يتأكد أن تنسيق نسخة RTDB التي تكتبها اللوحة مطابق حرفياً لما تقرؤه/تكتبه طبقة الموقع (fs-failover.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as panel from '../server/adapters/fsMirror.js';

const siteFile = path.resolve('../fs-failover.js');
const site = fs.existsSync(siteFile) ? await import(siteFile) : null;
const T = (n, f) => test(n, { skip: !site && 'fs-failover.js غير موجود في هذا المستودع' }, f);

T('ترميز المفاتيح والمسارات مطابق للموقع', () => {
  for (const k of ['a.b', 'x/y', 'p%q', '#$[]', 'عربي', 'plain']) { assert.equal(panel.encKey(k), site.encKey(k)); assert.equal(panel.decKey(panel.encKey(k)), k); }
  for (const p of ['shopProducts/p1', 'streamerEvents/e1/sessions/s.1', 'users/u1', 'config/home.Stats']) assert.equal(panel.mirrorPathOf(p), site.mirrorPathOf(p, 'fsMirror'));
});
T('تطبيق الكتابة (set/merge/update/delete) + الترميز/فك الترميز مطابق للموقع', () => {
  const now = 1_700_000_000_000;
  const cur = { name: 'x', price: 5, tags: ['a'], nested: { a: 1 }, t: { __ts: 1 } };
  const ops = [{ k: 'set', d: { a: 1, 'b.c': 2, arr: [1, { z: 2 }], when: new Date(now) } }, { k: 'merge', d: { price: 9, nested: { b: 2 } } }, { k: 'update', d: { 'nested.a': 7, price: 10 } }, { k: 'delete' }];
  for (const op of ops) {
    const a = panel.applyWrite(cur, op, now), b = site.applyWrite(cur, op, now);
    assert.deepEqual(a, b);
    if (a) { const enc = panel.encodeForRtdb(a); assert.deepEqual(enc, site.encodeForRtdb(b)); assert.deepEqual(panel.decodeFromRtdb(enc), site.decodeFromRtdb(enc)); }
  }
});
T('where مطابق للموقع', () => {
  const d = { status: 'active', n: 5, tags: ['x', 'y'], t: { __ts: 100 } };
  for (const w of [['status', '==', 'active'], ['n', '>', 3], ['n', '<=', 4], ['tags', 'array-contains', 'y'], ['status', 'in', ['a', 'active']], ['t', '>=', 50], ['missing', '==', 1]]) assert.equal(panel.matchesWhere(d, w), site.matchesWhere(d, w), JSON.stringify(w));
});
