import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountResolver, isQuota } from '../src/accountLookup.js';

const quotaErr = () => Object.assign(new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.'), { code: 8 });
function mk({ fs, rtdb, byEmail }) {
  const admin = {
    auth: () => ({ getUserByEmail: async (e) => { if (byEmail[e]) return { uid: byEmail[e] }; throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' }); } }),
    database: () => ({ ref: (p) => ({ get: async () => { const v = rtdb[p]; return { exists: () => !!v, val: () => v }; } }) }),
  };
  const db = { collection: () => ({ doc: (k) => ({ get: async () => { if (fs === 'quota') throw quotaErr(); const v = fs[k]; return { exists: !!v, data: () => v }; } }) }) };
  return createAccountResolver({ admin, db });
}

test('isQuota recognises Firestore quota errors', () => { assert.equal(isQuota(quotaErr()), true); assert.equal(isQuota(new Error('boom')), false); });
test('username via Firestore; unknown → null; result cached', async () => {
  const fs = { sultan: { uid: 'u1' } };
  const r = mk({ fs, rtdb: {}, byEmail: {} });
  assert.equal(await r('sultan'), 'u1'); delete fs.sultan; assert.equal(await r('sultan'), 'u1'); assert.equal(await r('nobody'), null);
});
test('email resolves through Auth even when Firestore quota is exhausted', async () => {
  const r = mk({ fs: 'quota', rtdb: {}, byEmail: { 'a@b.com': 'uE' } });
  assert.equal(await r('a@b.com'), 'uE'); assert.equal(await r('x@y.com'), null);
});
test('quota: falls back to RTDB pendingUsernames, else lookup_unavailable', async () => {
  const r = mk({ fs: 'quota', rtdb: { 'pendingUsernames/newbie': { uid: 'uN' } }, byEmail: {} });
  assert.equal(await r('newbie'), 'uN');
  await assert.rejects(() => r('other'), (e) => e.code === 'lookup_unavailable');
});
test('non-quota Firestore errors are not masked', async () => {
  const admin = { auth: () => ({}), database: () => ({}) };
  const db = { collection: () => ({ doc: () => ({ get: async () => { throw new Error('permission-denied'); } }) }) };
  await assert.rejects(() => createAccountResolver({ admin, db })('x'), /permission-denied/);
});
