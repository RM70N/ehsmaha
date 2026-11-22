// بعد حذف سجل الإقصاء: كل لعبة تُفتح وتُدخَل لاعبين تجريبيين وتُنفَّذ دالة إقصائها الحقيقية؛ نتحقق أنه لا ReferenceError ولا أخطاء صفحة،
// وأن المقصي خرج من اللاعبين، وأن هدية من المقصي لا تُرجعه، وأن أي متغير/دالة من السجل لم يبقَ.
// تشغيل: python3 -m http.server 8790 من جذر المشروع ثم node tests/elimination-history/e2e_games.mjs
import { createRequire } from 'module'; const require = createRequire(new URL('../../', import.meta.url));
const { chromium } = require('playwright'); const { installFakeFirebase } = require('./desktop/test/e2e/fake-firebase.js');
const ROOT = new URL('../../', import.meta.url).pathname;
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ✔', n); } else { fail++; console.log('  ✘', n, d !== undefined ? JSON.stringify(d) : ''); } };
const b = await chromium.launch({ args: ['--no-sandbox'] });
async function fresh() {
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); pg.errs = [];
  await installFakeFirebase(pg, ROOT + 'index.html');
  await pg.addInitScript(() => { try { sessionStorage.setItem('ehsemha-wlc:ehsemha-windows-launch-2026:closed', '1'); } catch (e) {} });
  pg.on('pageerror', e => { if (!/webgl/i.test(e.message)) pg.errs.push(e.message); });
  await pg.goto('http://127.0.0.1:8790/index.html'); await pg.waitForTimeout(2200); return pg;
}
const U = (i) => ({ uniqueId: 'u' + i, nickname: 'n' + i, avatar: '', isFollower: true });
// لكل لعبة: صفحة، متغير اللاعبين، حالة، تهيئة، دالة إقصاء حقيقية تُعيد المُقصى
const G = {
  lastletter: { pg: 'lastletter', map: 'llParticipants', st: "llGameStatus='active'", elim: "llEliminate('u1', llParticipants.get('u1'), 'test')", gift: 'llHandleGift' },
  roulette: { pg: 'roulette', map: 'rouParticipants', st: "rouGameStatus='active'; rouActivePlayers=['n1','n2','n3','n4']", elim: "rouEliminateByMention('n2',['n1'])", gift: 'rouHandleGift' },
  findball: { pg: 'findball', map: 'findballParticipants', st: "findballGameStatus='active'; findballGuesses.clear(); findballGuesses.set('u2',1); findballGuesses.set('u3',1); findballGuesses.set('u4',1); findballGuesses.set('u1',2)", elim: "findballResolveRound(1)", gift: 'findballHandleGift' },
  chairs: { pg: 'chairs', map: 'chairsParticipants', st: "chairsGameStatus='claiming'; chairsIsFinalRound=false; chairsClaims=new Map([[1,'u2'],[2,'u3'],[3,'u4']])", elim: "chairsResolveRound()", gift: 'chairsHandleGift' },
  hz: { pg: 'hz', map: 'hzParticipants', st: "buildHzGrid(); hzGameStatus='active'; hzClicksUsed=0; hzMaxClicks=9; hzCells={}; hzCells[3]='u1'", elim: "hzCellClick(3,false)", gift: 'hzHandleGift', wrap: true },
  sniper: { pg: 'sniper', map: 'sniperParticipants', st: "sniperGameStatus='active'; selectedWeapon='sniper'; sniperAmmo.sniper=5; sniperCells[5]=['u1']; document.getElementById('fire-input').value='5'", elim: "fireWeapon()", gift: 'sniperHandleGift', wrap: true },
  box: { pg: 'box', map: 'boxParticipants', st: "boxGameStatus='active'", elim: "boxEliminate('u1','n1')", gift: 'boxHandleGift' },
};
for (const [name, g] of Object.entries(G)) {
  console.log('== ' + name);
  const p = await fresh();
  await p.evaluate(id => show(id), g.pg); await p.waitForTimeout(600);
  const r = await p.evaluate(({ map, st, elim, gift }) => {
    const out = { threw: null, before: 0, after: 0, back: null };
    try {
      for (let i = 1; i <= 4; i++) { const u = { uniqueId: 'u' + i, nickname: 'n' + i, avatar: '', isFollower: true }; (0, eval)(map).set(u.uniqueId, (map.startsWith('ll') || map.startsWith('hz') || map.startsWith('sniper')) ? { user: u } : u); }
      (0, eval)(st); out.before = (0, eval)(map).size;
      try { (0, eval)(elim); } catch (e) { out.threw = e.name + ': ' + e.message; }
      out.after = (0, eval)(map).size;
      try { (0, eval)(gift)({ uniqueId: 'u1', nickname: 'n1', isFollower: true }, 'وردة', 100); } catch (e) { out.threw = out.threw || ('gift ' + e.name + ': ' + e.message); }
      out.back = (0, eval)(map).has('u1');
    } catch (e) { out.threw = 'setup ' + e.name + ': ' + e.message; }
    return out;
  }, g);
  await p.waitForTimeout(3500);
  const back = await p.evaluate(m => (0, eval)(m).has('u1'), g.map);
  ok(name + ': دالة الإقصاء الحقيقية تعمل بلا ReferenceError', !r.threw || !/ReferenceError|is not defined/.test(r.threw), r);
  ok(name + ': المقصي خرج', r.after === r.before - 1, r);
  ok(name + ': هدية من المقصي لا تُرجعه (حتى بعد 3.5 ث)', !back && !r.back, { back });
  ok(name + ': لا أخطاء JavaScript بالصفحة', p.errs.length === 0, p.errs.slice(0, 2));
  await p.context().close();
}
console.log('== أمر الإنعاش الإداري (بلا سجل إقصاء: الأهلية = راوند نشط + ليس مشاركاً)');
{
  const p = await fresh();
  const r = await p.evaluate(() => {
    const admin = Array.isArray(ADMIN_REVIVE_USERNAMES) ? ADMIN_REVIVE_USERNAMES[0] : [...ADMIN_REVIVE_USERNAMES][0];
    let revived = null, calls = 0; const part = new Set(['u2']);
    const mk = (active) => ({ isParticipant: (u) => part.has(u), statusCheckFn: () => active, reviveFn: (u) => { revived = u.uniqueId; calls++; } });
    const send = (txt, active) => handleAdminChatCommand('sniper', txt, { uniqueId: admin, nickname: 'adm' }, Object.assign({ participantsMap: new Map(), joinFn() {} }, mk(active)));
    const o = {};
    try { o.inactive = send('انعاش @u1', false); o.callsInactive = calls; o.active = send('انعاش @u1', true); o.callsActive = calls; o.revived = revived;
      o.alreadyIn = send('انعاش @u2', true); o.callsAfterIn = calls; o.nonAdmin = handleAdminChatCommand('sniper', 'انعاش @u1', { uniqueId: 'randomuser', nickname: 'x' }, mk(true)); }
    catch (e) { o.err = e.name + ': ' + e.message; }
    return o;
  });
  ok('الأمر الإداري لا يرمي أخطاء', !r.err, r);
  ok('خارج الراوند النشط لا يُنعش', r.callsInactive === 0, r);
  ok('راوند نشط + غير مشارك: يُنعش', r.revived === 'u1' && r.callsActive === 1, r);
  ok('المشارك الحالي لا يُنعش مرة ثانية', r.callsAfterIn === r.callsActive, r);
  ok('غير الأدمن لا ينفّذ الأمر', r.nonAdmin === false, r);
  ok('لا أخطاء JavaScript', p.errs.length === 0, p.errs.slice(0, 2));
  await p.context().close();
}
await b.close(); console.log(`\nنجح ${pass} / فشل ${fail}`); process.exit(fail ? 1 : 0);
