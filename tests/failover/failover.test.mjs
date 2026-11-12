import test from 'node:test';
import assert from 'node:assert/strict';
import { installFsFailover, mirrorPathOf, encKey, decKey, applyWrite, matchesWhere, isQuotaError } from '../../fs-failover.js';
import { makeFakeFirestore, makeFakeRtdb, makeStorage, FakeTimestamp } from './fakes.mjs';

const tick = () => new Promise((r) => setTimeout(r, 5));

function setup(opts) {
  const f = makeFakeFirestore();
  const r = makeFakeRtdb();
  const storage = makeStorage();
  const fb = Object.assign({ db: {}, auth: { currentUser: { uid: 'u1' } } }, f.api, r.api);
  const timers = [];
  const api = installFsFailover(fb, Object.assign({
    storage, Timestamp: FakeTimestamp, log: () => {},
    setTimeout: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; },
    clearTimeout: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); }
  }, opts || {}));
  return { f, r, fb, api, storage, timers, S: f.S, rget: r.get };
}

test('encKey/decKey + mirrorPath للمجموعات الفرعية', () => {
  assert.equal(decKey(encKey('a.b/c$d#e[f]%g')), 'a.b/c$d#e[f]%g');
  assert.equal(mirrorPathOf('users/u1'), 'fsMirror/users/u1');
  assert.equal(mirrorPathOf('event100/current/grid/state'), 'fsMirror/event100/current/__sub_grid/state');
  assert.equal(mirrorPathOf('streamerEvents/e1/sessions/k.1'), 'fsMirror/streamerEvents/e1/__sub_sessions/k%2E1');
});

test('applyWrite: set/merge/update/increment/arrayUnion/deleteField', () => {
  const { fb } = setup();
  const now = 1000;
  assert.deepEqual(applyWrite(null, { k: 'set', d: { a: 1, n: fb.increment(2), t: fb.serverTimestamp() } }, now), { a: 1, n: 2, t: { __ts: 1000 } });
  assert.deepEqual(applyWrite({ a: 1, m: { x: 1, y: 2 } }, { k: 'merge', d: { m: { y: 9, z: 3 }, b: 2 } }, now), { a: 1, m: { x: 1, y: 9, z: 3 }, b: 2 });
  assert.deepEqual(applyWrite({ c: 5, l: [1] }, { k: 'update', d: { c: fb.increment(3), l: fb.arrayUnion(1, 2) } }, now), { c: 8, l: [1, 2] });
  assert.deepEqual(applyWrite({ a: { b: 1, c: 2 } }, { k: 'update', d: { 'a.b': 7 } }, now), { a: { b: 7, c: 2 } });
  assert.deepEqual(applyWrite({ a: 1, b: 2 }, { k: 'update', d: { a: fb.deleteField() } }, now), { b: 2 });
  assert.equal(applyWrite({ a: 1 }, { k: 'delete' }, now), null);
});

test('matchesWhere', () => {
  assert.ok(matchesWhere({ a: 1 }, ['a', '==', 1]));
  assert.ok(!matchesWhere({ a: 1 }, ['a', '==', 2]));
  assert.ok(matchesWhere({ a: { b: 5 } }, ['a.b', '>', 4]));
  assert.ok(matchesWhere({ l: ['x'] }, ['l', 'array-contains', 'x']));
  assert.ok(matchesWhere({ a: 2 }, ['a', 'in', [1, 2]]));
  assert.ok(isQuotaError({ code: 'resource-exhausted' }));
  assert.ok(isQuotaError(new Error('Quota exceeded.')));
  assert.ok(!isQuotaError({ code: 'permission-denied' }));
});

test('الوضع العادي: الكتابة تذهب لـFirestore وتُنسخ لـRTDB (write-through)', async () => {
  const { fb, S, rget, api } = setup();
  await fb.setDoc(fb.doc(fb.db, 'config', 'homeStats'), { visitors: 5, at: fb.serverTimestamp() });
  await fb.updateDoc(fb.doc(fb.db, 'config', 'homeStats'), { visitors: fb.increment(2) });
  await fb.setDoc(fb.doc(fb.db, 'levels', 'k1'), { xp: 10, tags: { a: 1 } }, { merge: true });
  await tick();
  assert.equal(S.docs.get('config/homeStats').visitors, 7);
  assert.equal(rget('fsMirror/config/homeStats').visitors, 7);
  assert.equal(rget('fsMirror/levels/k1').tags.a, 1);
  assert.equal(api.mode(), 'firestore');
  await fb.deleteDoc(fb.doc(fb.db, 'levels', 'k1'));
  await tick();
  assert.equal(rget('fsMirror/levels/k1'), null);
});

test('الوضع العادي: مجموعات write-through المستثناة (presence) لا تُنسخ', async () => {
  const { fb, rget } = setup();
  await fb.setDoc(fb.doc(fb.db, 'presence', 'u1'), { online: true });
  await tick();
  assert.equal(rget('fsMirror/presence/u1'), null);
});

test('زرع النسخة (seed) عند القراءة لمستند موجود فقط بـFirestore', async () => {
  const { fb, S, rget } = setup();
  S.docs.set('config/discordServer', { url: 'x' });
  S.docs.set('users/u1', { username: 'me', usernameLower: 'me' });
  S.docs.set('users/u2', { username: 'other' });
  await fb.getDoc(fb.doc(fb.db, 'config', 'discordServer'));
  await fb.getDoc(fb.doc(fb.db, 'users', 'u1'));
  await fb.getDoc(fb.doc(fb.db, 'users', 'u2'));
  await tick();
  assert.equal(rget('fsMirror/config/discordServer').url, 'x');
  assert.equal(rget('fsMirror/users/u1').username, 'me');
  assert.equal(rget('fsMirror/users/u2'), null, 'مستخدمو غيرنا لا يُزرعون');
});

test('seed لا يكتب فوق مستند موجود بالنسخة (ما يرجّع قيمة قديمة)', async () => {
  const { fb, S, rget, r } = setup();
  S.docs.set('config/a', { v: 'old' });
  await r.api.rtdbSet(r.api.rtdbRef(null, 'fsMirror/config/a'), { v: 'fresh' });
  await fb.getDoc(fb.doc(fb.db, 'config', 'a'));
  await tick();
  assert.equal(rget('fsMirror/config/a').v, 'fresh');
});

test('انتهاء الحصة: getDoc يتحوّل تلقائياً للنسخة، والوضع يصير rtdb', async () => {
  const { fb, S, api } = setup();
  await fb.setDoc(fb.doc(fb.db, 'config', 'homeStats'), { visitors: 5, at: fb.serverTimestamp() });
  await tick();
  S.quota = true;
  const snap = await fb.getDoc(fb.doc(fb.db, 'config', 'homeStats'));
  assert.equal(api.mode(), 'rtdb');
  assert.ok(snap.exists());
  assert.equal(snap.data().visitors, 5);
  assert.equal(typeof snap.data().at.toMillis(), 'number', 'Timestamp يرجع بـtoMillis');
  assert.equal(snap.id, 'homeStats');
});

test('وضع rtdb: كتابات (set/merge/update/increment/arrayUnion/delete) تُطبّق على النسخة وتدخل الطابور', async () => {
  const { fb, S, api, rget } = setup();
  S.quota = true;
  await fb.setDoc(fb.doc(fb.db, 'users', 'u1'), { username: 'me', points: 1 });          // يقلب الوضع أثناء الكتابة
  assert.equal(api.mode(), 'rtdb');
  await fb.updateDoc(fb.doc(fb.db, 'users', 'u1'), { points: fb.increment(4), tags: fb.arrayUnion('a', 'b') });
  await fb.setDoc(fb.doc(fb.db, 'users', 'u1'), { prof: { bio: 'hi' } }, { merge: true });
  assert.deepEqual(rget('fsMirror/users/u1'), { username: 'me', points: 5, tags: ['a', 'b'], prof: { bio: 'hi' } });
  const s = await fb.getDoc(fb.doc(fb.db, 'users', 'u1'));
  assert.equal(s.data().points, 5);
  assert.equal(api.pending(), 3);
  await fb.deleteDoc(fb.doc(fb.db, 'users', 'u1'));
  assert.equal((await fb.getDoc(fb.doc(fb.db, 'users', 'u1'))).exists(), false);
});

test('وضع rtdb: getDocs لمجموعة + where + مجموعة فرعية', async () => {
  const { fb, S } = setup();
  S.quota = true;
  await fb.setDoc(fb.doc(fb.db, 'shopProducts', 'a'), { price: 10, kind: 'frame' });
  await fb.setDoc(fb.doc(fb.db, 'shopProducts', 'b'), { price: 50, kind: 'frame' });
  await fb.setDoc(fb.doc(fb.db, 'shopProducts', 'c'), { price: 5, kind: 'badge' });
  await fb.setDoc(fb.doc(fb.db, 'event100', 'current', 'streamers', 's.1'), { name: 'x' });
  const all = await fb.getDocs(fb.collection(fb.db, 'shopProducts'));
  assert.equal(all.size, 3);
  const frames = await fb.getDocs(fb.query(fb.collection(fb.db, 'shopProducts'), fb.where('kind', '==', 'frame'), fb.where('price', '>', 20)));
  assert.deepEqual(frames.docs.map((d) => d.id), ['b']);
  const sub = await fb.getDocs(fb.collection(fb.db, 'event100', 'current', 'streamers'));
  assert.deepEqual(sub.docs.map((d) => d.id), ['s.1']);
  assert.equal(sub.docs[0].data().name, 'x');
  const cnt = await fb.getCountFromServer(fb.collection(fb.db, 'shopProducts'));
  assert.equal(cnt.data().count, 3);
  // المستند الأب ما يتأثر بالمجموعة الفرعية
  assert.equal((await fb.getDoc(fb.doc(fb.db, 'event100', 'current'))).exists(), false);
});

test('onSnapshot: يبدأ على Firestore، يتحوّل لـRTDB عند خطأ الحصة، ويستقبل التحديثات', async () => {
  const { fb, S, api } = setup();
  await fb.setDoc(fb.doc(fb.db, 'config', 'homeStats'), { visitors: 1 });
  await fb.setDoc(fb.doc(fb.db, 'levels', 'a'), { xp: 1 });
  await tick();
  const docSeen = [], colSeen = [], errs = [];
  fb.onSnapshot(fb.doc(fb.db, 'config', 'homeStats'), (s) => docSeen.push(s.data() && s.data().visitors), (e) => errs.push(e));
  fb.onSnapshot(fb.collection(fb.db, 'levels'), (s) => colSeen.push(s.docs.map((d) => d.id).sort().join(',')), (e) => errs.push(e));
  await tick();
  assert.deepEqual(docSeen, [1]);
  assert.deepEqual(colSeen, ['a']);
  S.quota = true;
  // أي كتابة تقلب الوضع؛ نكتب للنسخة عبر مسار rtdb
  await fb.setDoc(fb.doc(fb.db, 'config', 'homeStats'), { visitors: 2 });
  await fb.setDoc(fb.doc(fb.db, 'levels', 'b'), { xp: 2 });
  await tick();
  assert.equal(api.mode(), 'rtdb');
  assert.equal(errs.length, 0, 'ما يظهر خطأ للمستمع');
  assert.equal(docSeen[docSeen.length - 1], 2);
  assert.equal(colSeen[colSeen.length - 1], 'a,b');
});

test('onSnapshot: خطأ حصة داخل المستمع نفسه يحوّله للنسخة بدون خطأ للمستدعي', async () => {
  const { fb, S, api, rget } = setup();
  await fb.setDoc(fb.doc(fb.db, 'config', 'x'), { v: 1 });
  await tick();
  const seen = [], errs = [];
  fb.onSnapshot(fb.doc(fb.db, 'config', 'x'), (s) => seen.push(s.data().v), (e) => errs.push(e));
  await tick();
  S.quota = true;
  S.listeners.forEach((l) => l.fire());   // Firestore يبلّغ المستمع بخطأ الحصة
  await tick();
  assert.equal(api.mode(), 'rtdb');
  assert.equal(errs.length, 0);
  assert.equal(rget('fsMirror/config/x').v, 1);
  assert.equal(seen[seen.length - 1], 1);
});

test('docChanges للمجموعات بوضع rtdb', async () => {
  const { fb, S } = setup();
  S.quota = true;
  await fb.setDoc(fb.doc(fb.db, 'levels', 'a'), { xp: 1 });
  const log = [];
  fb.onSnapshot(fb.collection(fb.db, 'levels'), (s) => log.push(s.docChanges().map((c) => c.type + ':' + c.doc.id).join('|')));
  await tick();
  await fb.setDoc(fb.doc(fb.db, 'levels', 'b'), { xp: 2 });
  await fb.setDoc(fb.doc(fb.db, 'levels', 'a'), { xp: 3 });
  await fb.deleteDoc(fb.doc(fb.db, 'levels', 'b'));
  await tick();
  assert.deepEqual(log, ['added:a', 'added:b', 'modified:a', 'removed:b']);
});

test('المعاملات: حجز يوزرنيم بالوضع العادي (تنعكس للنسخة) وبوضع rtdb', async () => {
  const { fb, S, api, rget } = setup();
  const reserve = (uid, name) => fb.runTransaction(fb.db, async (tx) => {
    const ur = fb.doc(fb.db, 'usernames', name);
    const s = await tx.get(ur);
    if (s.exists() && s.data().uid !== uid) throw new Error('USERNAME_TAKEN');
    if (!s.exists()) tx.set(ur, { uid });
    tx.set(fb.doc(fb.db, 'users', uid), { username: name, createdAt: fb.serverTimestamp() }, { merge: true });
  });
  await reserve('u1', 'ali');
  await tick();
  assert.equal(S.docs.get('usernames/ali').uid, 'u1');
  assert.equal(rget('fsMirror/usernames/ali').uid, 'u1');
  S.quota = true;
  await assert.rejects(() => reserve('u2', 'ali'), /USERNAME_TAKEN/);
  assert.equal(api.mode(), 'rtdb');
  await reserve('u2', 'sara');
  assert.equal(rget('fsMirror/usernames/sara').uid, 'u2');
  assert.equal(rget('fsMirror/users/u2').username, 'sara');
  assert.equal(api.pending(), 2);
});

test('خطأ غير الحصة (permission-denied) يمرّ للمستدعي ولا يقلب الوضع', async () => {
  const { fb, S, api } = setup();
  S.docs.set('config/a', { v: 1 });
  const orig = S.docs;
  fb.__failover._real.getDoc = async () => { throw Object.assign(new Error('denied'), { code: 'permission-denied' }); };
  await assert.rejects(() => fb.getDoc(fb.doc(fb.db, 'config', 'a')), /denied/);
  assert.equal(api.mode(), 'firestore');
  assert.equal(orig, S.docs);
});

test('الفحص الدوري: رجوع Firestore → يرجّع الوضع ويُرحّل الطابور بما فيه increment وserverTimestamp', async () => {
  const { fb, S, api, timers, storage } = setup();
  await fb.setDoc(fb.doc(fb.db, 'users', 'u1'), { username: 'me', points: 1 });
  await tick();
  S.quota = true;
  await fb.updateDoc(fb.doc(fb.db, 'users', 'u1'), { points: fb.increment(5) });
  await fb.setDoc(fb.doc(fb.db, 'config', 'flag'), { on: true, at: fb.serverTimestamp() });
  assert.equal(api.mode(), 'rtdb');
  assert.equal(api.pending(), 2);
  // الحصة ما زالت منتهية: الفحص يفشل ويعيد الجدولة
  assert.equal(await api.probe(), false);
  assert.equal(api.mode(), 'rtdb');
  assert.ok(timers.length >= 1);
  S.quota = false;
  assert.equal(await api.probe(), true);
  assert.equal(api.mode(), 'firestore');
  assert.equal(api.pending(), 0);
  assert.equal(S.docs.get('users/u1').points, 6);
  assert.equal(S.docs.get('config/flag').on, true);
  assert.ok(S.docs.get('config/flag').at instanceof FakeTimestamp);
  assert.equal(JSON.parse(storage.getItem('ehs_fs_failover')).tripUntil, 0);
});

test('بعد الرجوع: المستمعون الأحياء يرجعون لـFirestore تلقائياً', async () => {
  const { fb, S, api } = setup();
  await fb.setDoc(fb.doc(fb.db, 'config', 'c'), { v: 1 });
  await tick();
  const seen = [];
  fb.onSnapshot(fb.doc(fb.db, 'config', 'c'), (s) => seen.push(s.data().v));
  await tick();
  S.quota = true;
  await fb.setDoc(fb.doc(fb.db, 'config', 'c'), { v: 2 });
  await tick();
  assert.equal(seen[seen.length - 1], 2);
  S.quota = false;
  await api.probe();
  await tick();
  assert.equal(api.mode(), 'firestore');
  // تعديل مباشر بـFirestore الآن يصل للمستمع
  await fb.setDoc(fb.doc(fb.db, 'config', 'c'), { v: 3 });
  await tick();
  assert.equal(seen[seen.length - 1], 3);
});

test('الحالة تبقى بعد إعادة تحميل الصفحة (tripUntil بالتخزين المحلي)', async () => {
  const s1 = setup();
  s1.S.quota = true;
  await s1.fb.setDoc(s1.fb.doc(s1.fb.db, 'config', 'a'), { v: 1 });
  assert.equal(s1.api.mode(), 'rtdb');
  // صفحة جديدة بنفس التخزين
  const f = makeFakeFirestore(); f.S.quota = true;
  const fb2 = Object.assign({ db: {}, auth: { currentUser: { uid: 'u1' } } }, f.api, s1.r.api);
  const api2 = installFsFailover(fb2, { storage: s1.storage, Timestamp: FakeTimestamp, log: () => {}, setTimeout: () => ({}), clearTimeout: () => {} });
  assert.equal(api2.mode(), 'rtdb', 'تبدأ مباشرة على النسخة بدون محاولة Firestore');
  assert.equal(f.S.reads, 0);
  const d = await fb2.getDoc(fb2.doc(fb2.db, 'config', 'a'));
  assert.equal(d.data().v, 1);
  assert.equal(f.S.reads, 0);
});

test('بدون RTDB (fb.rtdb غير معرّف): السلوك القديم تماماً (الخطأ يمرّ)', async () => {
  const f = makeFakeFirestore();
  const fb = Object.assign({ db: {}, auth: { currentUser: { uid: 'u1' } } }, f.api);
  const api = installFsFailover(fb, { storage: makeStorage(), Timestamp: FakeTimestamp, log: () => {} });
  f.S.quota = true;
  await assert.rejects(() => fb.getDoc(fb.doc(fb.db, 'config', 'a')), (e) => e.code === 'resource-exhausted');
  assert.equal(api.mode(), 'firestore');
});

test('Timestamp بالنسخة يرجع كائن Timestamp حقيقي ويقبل where بالأرقام', async () => {
  const { fb, S } = setup();
  S.quota = true;
  await fb.setDoc(fb.doc(fb.db, 'storeSales', 'x'), { until: new FakeTimestamp(5000), n: 3 });
  const s = await fb.getDoc(fb.doc(fb.db, 'storeSales', 'x'));
  assert.ok(s.data().until instanceof FakeTimestamp);
  assert.equal(s.data().until.toMillis(), 5000);
  const q = await fb.getDocs(fb.query(fb.collection(fb.db, 'storeSales'), fb.where('until', '>', 4000)));
  assert.equal(q.size, 1);
});

test('مفاتيح بها رموز ممنوعة بـRTDB (نقطة/شرطة مائلة) تُحفظ وترجع كما هي', async () => {
  const { fb, S } = setup();
  S.quota = true;
  await fb.setDoc(fb.doc(fb.db, 'config', 'weird.id'), { 'a.b': 1, nested: { 'x/y': 2 } });
  const s = await fb.getDoc(fb.doc(fb.db, 'config', 'weird.id'));
  assert.deepEqual(s.data(), { 'a.b': 1, nested: { 'x/y': 2 } });
});

test('الطابور: كل مستخدم يرحّل عملياته فقط، وعمليات غيره تبقى', async () => {
  const { fb, S, api } = setup();
  S.quota = true;
  await fb.setDoc(fb.doc(fb.db, 'users', 'u1'), { a: 1 });
  fb.auth.currentUser = { uid: 'u2' };
  await fb.setDoc(fb.doc(fb.db, 'users', 'u2'), { b: 2 });
  assert.equal(api.pending(), 2);
  S.quota = false;
  await api.probe();               // الحالي u2
  assert.equal(S.docs.has('users/u2'), true);
  assert.equal(S.docs.has('users/u1'), false);
  assert.equal(api.pending(), 1);
  fb.auth.currentUser = { uid: 'u1' };
  await api.replayPending();
  assert.equal(S.docs.has('users/u1'), true);
  assert.equal(api.pending(), 0);
});
