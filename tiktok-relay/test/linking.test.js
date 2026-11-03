import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LinkingService, AlreadyLinkedError, NotOwnerError } from '../src/linking.js';
import { FakeFirestore } from './fakeFirestore.js';

test('حجز اليوزر: الأول يربح', async () => {
  const svc = new LinkingService(new FakeFirestore());
  const u = await svc.link('@Streamer1', 'uidA');
  assert.equal(u, 'streamer1');
  assert.equal(await svc.ownerOf('streamer1'), 'uidA');
});

test('محاولة حجز مزدوج: الثاني يُرفض', async () => {
  const svc = new LinkingService(new FakeFirestore());
  await svc.link('streamer1', 'uidA');
  await assert.rejects(() => svc.link('streamer1', 'uidB'), AlreadyLinkedError);
  assert.equal(await svc.ownerOf('streamer1'), 'uidA'); // بقي لصاحبه الأول
});

test('نفس المالك يعيد ربط نفس اليوزر بلا خطأ (idempotent)', async () => {
  const svc = new LinkingService(new FakeFirestore());
  await svc.link('streamer1', 'uidA');
  await svc.link('streamer1', 'uidA');
  assert.equal(await svc.ownerOf('streamer1'), 'uidA');
});

test('فك الربط: صاحبه فقط يقدر', async () => {
  const svc = new LinkingService(new FakeFirestore());
  await svc.link('streamer1', 'uidA');
  await assert.rejects(() => svc.unlink('streamer1', 'uidB'), NotOwnerError);
  await svc.unlink('streamer1', 'uidA');
  assert.equal(await svc.ownerOf('streamer1'), null);
});

test('بعد فك الربط يقدر حساب آخر يحجز نفس اليوزر', async () => {
  const svc = new LinkingService(new FakeFirestore());
  await svc.link('streamer1', 'uidA');
  await svc.unlink('streamer1', 'uidA');
  await svc.link('streamer1', 'uidB');
  assert.equal(await svc.ownerOf('streamer1'), 'uidB');
});

test('listLinkedUsernames يرجع كل المحجوزين', async () => {
  const svc = new LinkingService(new FakeFirestore());
  await svc.link('a1', 'uidA');
  await svc.link('b2', 'uidB');
  const list = (await svc.listLinkedUsernames()).sort();
  assert.deepEqual(list, ['a1', 'b2']);
});
