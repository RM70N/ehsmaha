// يشغّل طبقة بيانات الأدمن الحقيقية (admin-center/admin-data.js) على القواعد الحقيقية بالمُحاكي: المالك يعيّن، الأدمن يمنح، الإيقاف يقطع.
import { createRequire } from 'module'; import fs from 'fs'; import vm from 'vm';
const require = createRequire((process.env.FBEMU || '/tmp/fbemu') + '/');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const fsdk = require('firebase/firestore'); const rdb = require('firebase/database');
const ROOT = new URL('../../', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✔', n); } else { fail++; console.log('  ✘', n, d === undefined ? '' : JSON.stringify(d).slice(0, 200)); } };
const rejects = async (n, p, pred) => { try { await p; ok(n, false, 'لم يُرفض'); } catch (e) { ok(n, pred ? pred(e) : true, String(e && e.message).slice(0, 120)); } };

const env = await initializeTestEnvironment({ projectId: 'demo-ehsmaha', firestore: { host: '127.0.0.1', port: 8085, rules: fs.readFileSync(ROOT + 'firestore.rules', 'utf8') }, database: { host: '127.0.0.1', port: 9005, rules: fs.readFileSync(ROOT + 'database.rules.json', 'utf8') } });
const mkFb = (uid, email) => { const c = env.authenticatedContext(uid, { email }); return { db: c.firestore(), rtdb: c.database(), auth: { currentUser: { uid, email, displayName: uid } },
  doc: fsdk.doc, getDoc: fsdk.getDoc, setDoc: fsdk.setDoc, deleteDoc: fsdk.deleteDoc, collection: fsdk.collection, query: fsdk.query, where: fsdk.where, getDocs: fsdk.getDocs, writeBatch: fsdk.writeBatch, serverTimestamp: fsdk.serverTimestamp, arrayUnion: fsdk.arrayUnion,
  rtdbRef: rdb.ref, rtdbGet: rdb.get, rtdbSet: rdb.set, rtdbUpdate: rdb.update, rtdbRemove: rdb.remove }; };
const owner = mkFb('owner1', 'malshaifan1@gmail.com'), admin = mkFb('adm1', 'a1@x.com');
globalThis.window = { EhsAdminPerms: require(ROOT + 'admin-center/permissions.js') };
vm.runInThisContext(fs.readFileSync(ROOT + 'admin-center/admin-data.js', 'utf8'));
const D = window.EhsAdminData, P = window.EhsAdminPerms;
const as = (fb) => { window.__fb = fb; };
const isDenied = (e) => D.isDenied(e);

console.log('== المالك يعيّن (القاعدتان)');
as(owner);
const rec = { userId: 'adm1', username: 'Admin One', status: 'active', permissions: P.toStoreMap(['admin.dashboard.view', 'admin.frames.view', 'admin.frames.grant', 'admin.frames.redeem_code', 'admin.frames.history']), frameGrantScope: { mode: 'allowlist', frameIds: ['fx1', 'fx2'] } };
const r = await D.save(rec);
ok('الحفظ في Firestore وRTDB', r.ok && r.fs && r.rtdb, r);
ok('القاعدتان متطابقتان', (await D.checkSync('adm1')).ok);
ok('القائمة تعرض الأدمن', (await D.list()).some((x) => x.userId === 'adm1'));

console.log('== الأدمن يمنح');
as(admin);
const mine = await D.getMine();
ok('الأدمن يقرأ سجله وصلاحياته', mine && P.has(mine, 'admin.frames.grant') && P.framesAllowed(mine).join() === 'fx1,fx2', mine);
const user = { uid: 'tuid1', username: 'Target', usernameLower: 'target', tiktok: 'tt_target' };
const g = await D.grantFrame(user, 'fx1');
ok('منح باليوزر يكتب مفتاحي المستفيد (الموقع + تيك توك)', g.ok && g.keys.length === 2, g);
as(owner);
ok('الإطار ظاهر في ملكية الحسابين (قراءة المالك)', (await D.owns(user, 'fx1')).all);
as(admin);
const g2 = await D.grantFrame(user, 'fx1');
ok('منح مكرر لا يضاعف ويُبلَّغ «مملوك مسبقاً»', g2.ok && g2.already === true, g2);
await rejects('إطار خارج النطاق مرفوض من الخادم', D.grantFrame(user, 'fx9'), isDenied);
const g3 = await D.grantFrame({ uid: 'tuid2', username: 'Solo', usernameLower: 'solo', tiktok: '' }, 'fx2');
ok('مستخدم بلا تيك توك مربوط: مفتاح واحد فقط', g3.ok && g3.keys.length === 1, g3);
const h = await D.history({});
ok('سجل الأدمن يحوي عمليتي المنح ويُقرأ لصاحبه', h.filter((x) => x.action === 'frame.grant').length >= 3, h.length);
ok('السجل بوقت الخادم', h.every((x) => x._ts > 0));

console.log('== الأكواد السرية');
as(owner);
await rdb.update(rdb.ref(owner.rtdb), { 'secretCodes/vip1': { name: 'v', frameId: 'fx2', frameName: 'F2', durationDays: 0, maxUses: 1, usedCount: 0, active: true, createdAt: 1, createdBy: 'owner1', createdByUsername: 'o', expiresAt: Date.now() + 99999999 }, 'secretCodes/bad': { name: 'b', frameId: 'fx9', frameName: 'F9', durationDays: 0, maxUses: 3, usedCount: 0, active: true, createdAt: 1, createdBy: 'owner1', createdByUsername: 'o', expiresAt: Date.now() + 99999999 } });
as(admin);
ok('تحقق الكود: صالح', (await D.checkCode('VIP1')).ok === true || (await D.checkCode('vip1')).ok === true);
ok('كود غير موجود', (await D.checkCode('nope')).reason === 'NOTFOUND');
const u3 = { uid: 'tuid3', username: 'CodeUser', usernameLower: 'codeuser', tiktok: '' };
const chk = await D.checkCode('vip1');
const rr = await D.redeemCodeFor(u3, chk);
ok('استرداد الكود لمستخدم يمنحه الإطار ويحسب الاستخدام', rr.redeemed && rr.ok, rr);
as(owner);
const code = (await rdb.get(rdb.ref(owner.rtdb, 'secretCodes/vip1'))).val();
ok('العدّاد = 1 والمستخدم مسجّل باسم الأدمن', code.usedCount === 1 && code.usedBy.tuid3 && code.usedBy.tuid3.by === 'adm1', code);
ok('الإطار عند المستفيد', (await D.owns(u3, 'fx2')).all);
as(admin);
ok('الكود وصل حدّه فيُرفض لمستخدم ثانٍ', (await D.checkCode('vip1')).reason === 'MAXED');
const chk2 = await D.checkCode('bad');
ok('كود إطاره خارج نطاق الأدمن يظهر صالحاً للقراءة', chk2.ok === true);
await rejects('لكن استرداده مرفوض من الخادم (الإطار خارج النطاق)', D.redeemCodeFor({ uid: 'tuid4', username: 'X', usernameLower: 'x', tiktok: '' }, chk2), isDenied);
as(owner);
ok('ولم يُستهلك الكود', (await rdb.get(rdb.ref(owner.rtdb, 'secretCodes/bad/usedCount'))).val() === 0);

console.log('== الإيقاف والإزالة تقطع فوراً');
await D.save(Object.assign({}, (await D.get('adm1')), { status: 'suspended' }));
as(admin);
await rejects('أدمن موقوف: المنح مرفوض', D.grantFrame({ uid: 'tuid5', username: 'Y', usernameLower: 'y', tiktok: '' }, 'fx1'), isDenied);
await rejects('أدمن موقوف: لا يكتب سجلاً', (async () => { const ok2 = await D.log('frame.grant'); if (!ok2) throw Object.assign(new Error('denied'), { code: 'permission-denied' }); })(), isDenied);
as(owner);
const rem = await D.remove('adm1');
ok('المالك يزيل الأدمن من القاعدتين', rem.ok, rem);
as(admin);
await rejects('بعد الإزالة: المنح مرفوض', D.grantFrame({ uid: 'tuid6', username: 'Z', usernameLower: 'z', tiktok: '' }, 'fx1'), isDenied);
ok('بعد الإزالة لا سجل للأدمن', (await D.getMine()) === null);

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
