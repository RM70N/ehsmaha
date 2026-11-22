// اختبار قواعد الأمان الحقيقية (Firestore + RTDB) لنظام الأدمن على المُحاكي. لا mocks للقواعد.
import { createRequire } from 'module'; import fs from 'fs';
const require = createRequire((process.env.FBEMU || '/tmp/fbemu') + '/');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, arrayUnion, collection, query, where, getDocs } = require('firebase/firestore');
const { ref, set, get, update, remove } = require('firebase/database');
const ROOT = new URL('../../', import.meta.url).pathname;
const P = require(ROOT + 'admin-center/permissions.js');
const OWNER = 'malshaifan1@gmail.com';
let pass = 0, fail = 0;
const ok = async (name, p) => { try { await p; pass++; console.log('  ✔', name); } catch (e) { fail++; console.log('  ✘', name, String(e.message || e).slice(0, 160)); } };
const no = async (name, p) => { try { await assertFails(p); pass++; console.log('  ✔ (مرفوض)', name); } catch (e) { fail++; console.log('  ✘ (كان يجب رفضه)', name, String(e.message || e).slice(0, 160)); } };

const env = await initializeTestEnvironment({ projectId: 'demo-ehsmaha',
  firestore: { host: '127.0.0.1', port: 8085, rules: fs.readFileSync(ROOT + 'firestore.rules', 'utf8') },
  database: { host: '127.0.0.1', port: 9005, rules: fs.readFileSync(ROOT + 'database.rules.json', 'utf8') } });
const ownerC = env.authenticatedContext('owner1', { email: OWNER });
const adminC = env.authenticatedContext('adm1', { email: 'a1@x.com' });
const adm2C = env.authenticatedContext('adm2', { email: 'a2@x.com' });      // موقوف
const adm3C = env.authenticatedContext('adm3', { email: 'a3@x.com' });      // بلا صلاحية منح
const userC = env.authenticatedContext('usr1', { email: 'u@x.com' });
const fsO = ownerC.firestore(), fsA = adminC.firestore(), fsA2 = adm2C.firestore(), fsA3 = adm3C.firestore(), fsU = userC.firestore();
const dbO = ownerC.database(), dbA = adminC.database(), dbA2 = adm2C.database(), dbA3 = adm3C.database(), dbU = userC.database();

const permsFull = P.toStoreMap(['admin.dashboard.view', 'admin.streams.view', 'admin.connections.view', 'admin.connections.test', 'admin.rounds.view', 'admin.sessions.details', 'admin.sessions.observe', 'admin.frames.view', 'admin.frames.grant', 'admin.frames.redeem_code', 'admin.frames.history']);
const recFS = (uid, status, perms, frames) => ({ userId: uid, username: uid, role: 'admin', status, permissions: perms, frameGrantScope: { mode: 'allowlist', frameIds: frames }, createdBy: 'owner1', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), rev: 1 });
const recDB = (uid, status, perms, frames) => { const f = {}; frames.forEach((x) => (f[x] = true)); return { userId: uid, username: uid, role: 'admin', status, permissions: perms, frameGrantScope: { mode: 'allowlist', frameIds: f }, rev: 1 }; };

console.log('== 1) إدارة السجلات (المالك وحده)');
await ok('المالك يكتب adminAccess (Firestore)', setDoc(doc(fsO, 'adminAccess/adm1'), recFS('adm1', 'active', permsFull, ['fx1', 'fx2'])));
await ok('المالك يكتب أدمناً موقوفاً', setDoc(doc(fsO, 'adminAccess/adm2'), recFS('adm2', 'suspended', permsFull, ['fx1'])));
const noGrant = P.toStoreMap(['admin.dashboard.view', 'admin.frames.view']);
await ok('أدمن بلا صلاحية منح', setDoc(doc(fsO, 'adminAccess/adm3'), recFS('adm3', 'active', noGrant, ['fx1'])));
await no('الأدمن لا يعدّل صلاحياته', updateDoc(doc(fsA, 'adminAccess/adm1'), { status: 'active', permissions: P.toStoreMap(P.KEYS) }));
await no('الأدمن لا يعيّن أدمناً آخر', setDoc(doc(fsA, 'adminAccess/usr1'), recFS('usr1', 'active', permsFull, ['fx1'])));
await no('مستخدم عادي لا يكتب adminAccess لنفسه', setDoc(doc(fsU, 'adminAccess/usr1'), recFS('usr1', 'active', permsFull, ['fx1'])));
await ok('الأدمن يقرأ سجله', getDoc(doc(fsA, 'adminAccess/adm1')));
await no('الأدمن لا يقرأ سجل غيره', getDoc(doc(fsA, 'adminAccess/adm3')));
await no('مستخدم لا يقرأ adminAccess', getDoc(doc(fsU, 'adminAccess/adm1')));
await ok('المالك يقرأ الكل', getDoc(doc(fsO, 'adminAccess/adm2')));
await no('سجل بدور غير admin مرفوض', setDoc(doc(fsO, 'adminAccess/zzz'), { ...recFS('zzz', 'active', permsFull, []), role: 'owner' }));
await no('حقل زائد مرفوض', setDoc(doc(fsO, 'adminAccess/zzz'), { ...recFS('zzz', 'active', permsFull, []), isOwner: true }));

console.log('== 2) منح الإطارات (Firestore levels)');
const auditDoc = (fsx, aid, over = {}) => ({ actorId: fsx === fsA ? 'adm1' : fsx === fsA2 ? 'adm2' : 'adm3', actorName: 'a', action: 'frame.grant', resourceType: 'frame', resourceId: 'fx1', targetKey: 'kuser', targetName: 'kuser', result: 'success', reqId: 'r1', ts: serverTimestamp(), ...over });
async function grant(fsx, key, fid, over = {}, auditOver = {}) {
  const b = writeBatch(fsx); const aid = 'g_' + (fsx === fsA ? 'adm1' : fsx === fsA2 ? 'adm2' : 'adm3') + '_' + key + '_' + fid;
  b.set(doc(fsx, 'adminActionLog/' + aid), auditDoc(fsx, aid, { targetKey: key, resourceId: fid, ...auditOver }));
  b.set(doc(fsx, 'levels/' + key), { ownedFrames: arrayUnion(fid), ...over }, { merge: true });
  return b.commit();
}
await ok('منح إطار مسموح لمستند جديد (create)', grant(fsA, 'kuser', 'fx1'));
await ok('الإطار صار في مستند المستفيد', (async () => { const s = await getDoc(doc(fsO, 'levels/kuser')); if (!(s.data().ownedFrames || []).includes('fx1')) throw new Error('missing'); })());
await ok('منح إطار ثانٍ لمستند موجود (update)', grant(fsA, 'kuser', 'fx2'));
await no('إطار خارج النطاق المسموح', grant(fsA, 'kuser', 'fx9'));
await no('منح بلا سجل تدقيق', setDoc(doc(fsA, 'levels/knoaudit'), { ownedFrames: arrayUnion('fx1') }, { merge: true }));
await no('سجل التدقيق بنوع آخر/مورد آخر', grant(fsA, 'kuser2', 'fx1', {}, { resourceId: 'fx2' }));
await no('سجل بنتيجة فشل لا يكفي', grant(fsA, 'kuser3', 'fx1', {}, { result: 'failed' }));
await no('منح مع تغيير حقل آخر (xp)', grant(fsA, 'kuser4', 'fx1', { xp: 9999 }));
await no('أدمن موقوف', grant(fsA2, 'kuser5', 'fx1'));
await no('أدمن بلا صلاحية منح', grant(fsA3, 'kuser6', 'fx1'));
await no('مستخدم عادي يمنح غيره', (async () => { const b = writeBatch(fsU); b.set(doc(fsU, 'levels/kuserX'), { ownedFrames: arrayUnion('fx1') }, { merge: true }); await b.commit(); })());
await no('حذف إطار من مستفيد', (async () => { const b = writeBatch(fsA); b.update(doc(fsA, 'levels/kuser'), { ownedFrames: ['fx1'] }); await b.commit(); })());
await ok('سحب الصلاحية من المالك يوقف المنح فوراً', (async () => { await setDoc(doc(fsO, 'adminAccess/adm1'), recFS('adm1', 'active', P.toStoreMap(['admin.dashboard.view', 'admin.frames.view']), ['fx1', 'fx2'])); })());
await no('بعد السحب: المنح مرفوض', grant(fsA, 'kafter', 'fx1'));
await ok('المالك يعيد الصلاحية', setDoc(doc(fsO, 'adminAccess/adm1'), recFS('adm1', 'active', permsFull, ['fx1', 'fx2'])));
await ok('وبعد الإعادة يعمل', grant(fsA, 'kafter', 'fx1'));
await ok('نفس العملية (تكرار الإطار) لا تضاعفه', (async () => { const s = await getDoc(doc(fsO, 'levels/kafter')); if ((s.data().ownedFrames || []).filter((x) => x === 'fx1').length !== 1) throw new Error('dup'); })());

console.log('== 3) سجل الإجراءات (إضافة فقط)');
await ok('الأدمن يقرأ سجله فقط (استعلام)', getDocs(query(collection(fsA, 'adminActionLog'), where('actorId', '==', 'adm1'))));
await no('الأدمن لا يقرأ سجل غيره', getDocs(query(collection(fsA, 'adminActionLog'), where('actorId', '==', 'adm3'))));
await ok('المالك يقرأ كل السجل', getDocs(collection(fsO, 'adminActionLog')));
await no('الأدمن لا يعدّل حدثاً', updateDoc(doc(fsA, 'adminActionLog/g_adm1_kuser_fx1'), { result: 'failed' }));
await no('الأدمن لا يحذف حدثاً', deleteDoc(doc(fsA, 'adminActionLog/g_adm1_kuser_fx1')));
await no('المالك لا يحذف حدثاً أيضاً (سجل ثابت)', deleteDoc(doc(fsO, 'adminActionLog/g_adm1_kuser_fx1')));
await no('تزوير هوية الفاعل', setDoc(doc(fsA, 'adminActionLog/x1'), { ...auditDoc(fsA, 'x1'), actorId: 'adm3', action: 'view' }));
await no('وقت من المتصفح بدل الخادم', setDoc(doc(fsA, 'adminActionLog/x2'), { ...auditDoc(fsA, 'x2'), ts: new Date() }));
await no('مستخدم عادي لا يكتب سجلاً', setDoc(doc(fsU, 'adminActionLog/x3'), { ...auditDoc(fsA, 'x3'), actorId: 'usr1' }));
await no('موقوف لا يكتب سجلاً', setDoc(doc(fsA2, 'adminActionLog/x4'), { ...auditDoc(fsA2, 'x4') }));

console.log('== 4) عدم كسر القواعد القديمة');
await ok('المالك يمنح مباشرة كما قبل', setDoc(doc(fsO, 'levels/kowner'), { ownedFrames: arrayUnion('fxz') }, { merge: true }));
await ok('اللاعب يختار إطاره باللفل (ownedFrames + levelFrames)', setDoc(doc(fsU, 'levels/kself'), { ownedFrames: ['fxs'], levelFrames: ['fxs'] }, { merge: true }));
await no('اللاعب لا يضيف إطاراً لغيره بلا levelFrames', setDoc(doc(fsU, 'levels/kother2'), { ownedFrames: arrayUnion('fxs') }, { merge: true }));

console.log('== 5) Realtime Database');
await ok('المالك يكتب adminAccess (RTDB)', set(ref(dbO, 'adminAccess/adm1'), recDB('adm1', 'active', permsFull, ['fx1', 'fx2'])));
await ok('موقوف', set(ref(dbO, 'adminAccess/adm2'), recDB('adm2', 'suspended', permsFull, ['fx1'])));
await ok('بلا صلاحيات اتصال', set(ref(dbO, 'adminAccess/adm3'), recDB('adm3', 'active', P.toStoreMap(['admin.dashboard.view', 'admin.frames.view']), ['fx1'])));
await no('الأدمن لا يكتب adminAccess', set(ref(dbA, 'adminAccess/adm1/status'), 'active'));
await no('الأدمن لا يعيّن غيره', set(ref(dbA, 'adminAccess/usr1'), recDB('usr1', 'active', permsFull, [])));
await ok('الأدمن يقرأ سجله', get(ref(dbA, 'adminAccess/adm1')));
await no('الأدمن لا يقرأ سجل غيره', get(ref(dbA, 'adminAccess/adm3')));
await no('مستخدم لا يقرأ القائمة', get(ref(dbU, 'adminAccess')));
// بيانات مصدرها المواقع
await ok('ستريمر يكتب جلسته (قاعدة موجودة)', set(ref(env.authenticatedContext('str1', { email: 's@x.com' }).database(), 'opsSessions/str1_aa'), { uid: 'str1', state: 'live', streamer: 'str', last: 1 }));
await ok('أدمن بصلاحية يقرأ الجلسات', get(ref(dbA, 'opsSessions')));
await no('أدمن موقوف لا يقرأ الجلسات', get(ref(dbA2, 'opsSessions')));
await no('أدمن بلا صلاحية بثوث لا يقرأ الجلسات', get(ref(dbA3, 'opsSessions')));
await no('مستخدم عادي لا يقرأ الجلسات', get(ref(dbU, 'opsSessions')));
await ok('المالك يقرأ الجلسات', get(ref(dbO, 'opsSessions')));
await ok('أدمن بصلاحية يقرأ الأحداث', get(ref(dbA, 'opsEvents')));
await no('أدمن بلا صلاحية لا يقرأ الأحداث', get(ref(dbA3, 'opsEvents')));
// نتائج الجولات
const strDb = env.authenticatedContext('str1', { email: 's@x.com' }).database();
await ok('ستريمر يسجّل نتيجة جولته', set(ref(strDb, 'adminRounds/20261122/r1'), { uid: 'str1', game: 'xo', rid: 'r1', ts: 1, winners: [{ n: 'a' }] }));
await no('لا يسجّل باسم آخر', set(ref(strDb, 'adminRounds/20261122/r2'), { uid: 'other', game: 'xo', rid: 'r2', ts: 1 }));
await no('لا يعدّل نتيجة موجودة', set(ref(strDb, 'adminRounds/20261122/r1'), { uid: 'str1', game: 'xo', rid: 'r1', ts: 2 }));
await ok('أدمن بصلاحية يقرأ النتائج', get(ref(dbA, 'adminRounds')));
await no('أدمن بلا صلاحية نتائج لا يقرأ', get(ref(dbA3, 'adminRounds')));
await no('أدمن لا يكتب نتيجة باسم ستريمر آخر', set(ref(dbA, 'adminRounds/20261122/r3'), { uid: 'str1', game: 'xo', rid: 'r3', ts: 1 }));
// المراقبة
await ok('ستريمر ينشر لقطة جلسته', set(ref(strDb, 'adminObserve/str1_aa'), { game: 'xo', parts: 3, ts: 1 }));
await no('لا ينشر لقطة جلسة غيره', set(ref(strDb, 'adminObserve/other_zz'), { game: 'xo' }));
await ok('أدمن بصلاحية مراقبة يقرأ اللقطة', get(ref(dbA, 'adminObserve/str1_aa')));
await no('بلا صلاحية مراقبة لا يقرأ', get(ref(dbA3, 'adminObserve/str1_aa')));
await no('المراقب لا يكتب في لقطة اللعبة', set(ref(dbA, 'adminObserve/str1_aa/parts'), 99));
await ok('المراقب يسجّل دخوله باسمه', set(ref(dbA, 'adminObservers/str1_aa/adm1'), { at: 1 }));
await no('لا يسجّل دخول غيره', set(ref(dbA, 'adminObservers/str1_aa/adm3'), { at: 1 }));
// اختبار الاتصال + حدّ المعدل
const SV = { '.sv': 'timestamp' };
await ok('أدمن يبدأ اختباراً', update(ref(dbA), { 'adminConnTests/adm1/t1': { platform: 'tiktok', streamer: 'abc', status: 'running', startedAt: 1 }, 'adminConnTestMeta/adm1/last': SV }));
await no('اختبار ثانٍ فوراً مرفوض (حد 8 ث)', update(ref(dbA), { 'adminConnTests/adm1/t2': { platform: 'tiktok', streamer: 'abc', status: 'running', startedAt: 1 }, 'adminConnTestMeta/adm1/last': SV }));
await ok('تحديث حالة الاختبار نفسه مسموح', update(ref(dbA, 'adminConnTests/adm1/t1'), { status: 'done' }));
await no('بلا صلاحية اختبار', update(ref(dbA3), { 'adminConnTests/adm3/t1': { platform: 'tiktok', streamer: 'abc', status: 'running', startedAt: 1 }, 'adminConnTestMeta/adm3/last': SV }));
await no('اختبار باسم أدمن آخر', update(ref(dbA), { 'adminConnTests/adm3/t9': { platform: 'tiktok', streamer: 'abc', status: 'running', startedAt: 1 } }));
await no('لا يزوّر وقت الحد', set(ref(dbA, 'adminConnTestMeta/adm1/last'), 5));
await no('الأدمن لا يقرأ اختبارات غيره', get(ref(dbA, 'adminConnTests/adm3')));
await ok('يقرأ اختباراته', get(ref(dbA, 'adminConnTests/adm1')));
await ok('المالك يقرأ كل الاختبارات', get(ref(dbO, 'adminConnTests')));

console.log('== 6) أكواد سرية');
const code = (o = {}) => ({ name: 'c', frameId: 'fx1', frameName: 'F', durationDays: 7, maxUses: 2, usedCount: 0, active: true, createdAt: 1, createdBy: 'owner1', createdByUsername: 'o', expiresAt: Date.now() + 86400000, ...o });
await ok('المالك ينشئ أكواداً', update(ref(dbO), { 'secretCodes/good': code(), 'secretCodes/maxed': code({ maxUses: 1, usedCount: 1 }), 'secretCodes/expired': code({ expiresAt: Date.now() - 1000 }), 'secretCodes/stopped': code({ active: false }), 'secretCodes/other': code({ frameId: 'fx9' }) }));
const redeemAdmin = (db, k, tuid) => update(ref(db), { ['secretCodes/' + k + '/usedBy/' + tuid]: { username: tuid, usedAt: SV, by: 'adm1' }, ['secretCodes/' + k + '/usedCount']: 1 });
await ok('أدمن يسترد كوداً صالحاً لمستخدم', (async () => { await update(ref(dbA), { 'secretCodes/good/usedBy/t1': { username: 't1', usedAt: 1, by: 'adm1' }, 'secretCodes/good/usedCount': 1, 'secretCodes/good/lastAdminRedeem': { uid: 't1', by: 'adm1' } }); })());
await no('نفس المستخدم مرة ثانية', update(ref(dbA), { 'secretCodes/good/usedBy/t1': { username: 't1', usedAt: 1, by: 'adm1' }, 'secretCodes/good/usedCount': 2, 'secretCodes/good/lastAdminRedeem': { uid: 't1', by: 'adm1' } }));
await no('عدّاد لا يطابق عدد المستخدمين', update(ref(dbA), { 'secretCodes/good/usedBy/t2': { username: 't2', usedAt: 1, by: 'adm1' }, 'secretCodes/good/usedCount': 5, 'secretCodes/good/lastAdminRedeem': { uid: 't2', by: 'adm1' } }));
await ok('المستخدم الثاني (آخر استخدام متاح)', update(ref(dbA), { 'secretCodes/good/usedBy/t2': { username: 't2', usedAt: 1, by: 'adm1' }, 'secretCodes/good/usedCount': 2, 'secretCodes/good/lastAdminRedeem': { uid: 't2', by: 'adm1' } }));
await no('تجاوز الحد الأقصى', update(ref(dbA), { 'secretCodes/good/usedBy/t3': { username: 't3', usedAt: 1, by: 'adm1' }, 'secretCodes/good/usedCount': 3, 'secretCodes/good/lastAdminRedeem': { uid: 't3', by: 'adm1' } }));
await no('كود وصل الحد', update(ref(dbA), { 'secretCodes/maxed/usedBy/t1': { username: 't1', usedAt: 1, by: 'adm1' }, 'secretCodes/maxed/usedCount': 2, 'secretCodes/maxed/lastAdminRedeem': { uid: 't1', by: 'adm1' } }));
await no('كود منتهي', update(ref(dbA), { 'secretCodes/expired/usedBy/t1': { username: 't1', usedAt: 1, by: 'adm1' }, 'secretCodes/expired/usedCount': 1, 'secretCodes/expired/lastAdminRedeem': { uid: 't1', by: 'adm1' } }));
await no('كود متوقف', update(ref(dbA), { 'secretCodes/stopped/usedBy/t1': { username: 't1', usedAt: 1, by: 'adm1' }, 'secretCodes/stopped/usedCount': 1, 'secretCodes/stopped/lastAdminRedeem': { uid: 't1', by: 'adm1' } }));
await no('إطار الكود خارج نطاق الأدمن', update(ref(dbA), { 'secretCodes/other/usedBy/t1': { username: 't1', usedAt: 1, by: 'adm1' }, 'secretCodes/other/usedCount': 1, 'secretCodes/other/lastAdminRedeem': { uid: 't1', by: 'adm1' } }));
await no('أدمن بلا صلاحية كود', update(ref(dbA3), { 'secretCodes/other/usedBy/t1': { username: 't1', usedAt: 1, by: 'adm3' }, 'secretCodes/other/usedCount': 1, 'secretCodes/other/lastAdminRedeem': { uid: 't1', by: 'adm3' } }));
await no('أدمن موقوف', update(ref(dbA2), { 'secretCodes/good/usedBy/t9': { username: 't9', usedAt: 1, by: 'adm2' }, 'secretCodes/good/usedCount': 3, 'secretCodes/good/lastAdminRedeem': { uid: 't9', by: 'adm2' } }));
await no('مستخدم عادي يسجّل استخداماً لغيره', update(ref(dbU), { 'secretCodes/good/usedBy/t7': { username: 't7', usedAt: 1 }, 'secretCodes/good/usedCount': 3 }));
await no('الأدمن لا يغيّر إطار الكود', set(ref(dbA, 'secretCodes/good/frameId'), 'fx2'));
await no('الأدمن لا يقرأ قائمة الأكواد', get(ref(dbA, 'secretCodes')));
await ok('الأدمن يتحقق من كود معيّن (قراءة مفتاح واحد)', get(ref(dbA, 'secretCodes/good')));
await ok('أدمن يتراجع عن استرداده (حذف + إنقاص العدّاد) إن فشل المنح', update(ref(dbA), { 'secretCodes/good/usedBy/t2': null, 'secretCodes/good/usedCount': 1, 'secretCodes/good/lastAdminRedeem': null }));
await no('لا يمكن إنقاص العدّاد بلا سبب (بلا سجل استرداده)', update(ref(dbA), { 'secretCodes/good/usedCount': 0 }));
await ok('استرداد اللاعب العادي لنفسه ما زال يعمل', (async () => { await set(ref(dbO, 'secretCodes/selfc'), code({ maxUses: 5 })); await update(ref(dbU), { 'secretCodes/selfc/usedBy/usr1': { username: 'u', usedAt: 1 }, 'secretCodes/selfc/usedCount': 1 }); })());

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
