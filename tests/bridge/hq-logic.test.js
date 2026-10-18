'use strict';
// اختبارات منطق «حلّها قبلي» (تقييم الرمز + قواعد المراحل) — تستخرج المنطق من hallaha-qabli.html نفسه:
//   node tests/bridge/hq-logic.test.js
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../../hallaha-qabli.html'), 'utf8');
const a = html.indexOf('/* منطق «حلّها قبلي»'), b = html.indexOf('/* واجهة «حلّها قبلي» */');
if (a < 0 || b < 0) throw new Error('logic block not found');
const code = html.slice(a, b);
const L = (function () { const g = {}; new Function('globalThis', code.replace('})(typeof window !== \'undefined\' ? window : globalThis);', '})(globalThis);'))(g); return g.HqLogic; })();
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));
/* التقييم */
eq(L.evaluate('583', '538'), { exact: 1, mis: 2 }, 'example 538');
eq(L.evaluate('583', '590'), { exact: 1, mis: 0 }, 'example 590');
eq(L.evaluate('583', '583'), { exact: 3, mis: 0 }, 'full');
eq(L.evaluate('583', '358'), { exact: 0, mis: 3 }, 'all misplaced');
eq(L.evaluate('583', '582'), { exact: 2, mis: 0 }, 'two exact');
eq(L.evaluate('583', '012'), { exact: 0, mis: 0 }, 'zero');
eq(L.evaluate('047', '470'), { exact: 0, mis: 3 }, 'leading zero');
eq(L.evaluate('047', '047'), { exact: 3, mis: 0 }, 'leading zero full');
eq(L.evaluate('583', '853'), { exact: 1, mis: 2 }, 'swap');
/* كل الأزواج (720×720) */
const all = []; for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) for (let c = 0; c < 10; c++) if (a !== b && a !== c && b !== c) all.push('' + a + b + c);
ok(all.length === 720, '720 codes');
let bad = 0;
for (const s of all) for (const g of all) {
  const r = L.evaluate(s, g); let ex = 0, common = 0;
  for (let i = 0; i < 3; i++) if (s[i] === g[i]) ex++;
  for (const ch of g) if (s.includes(ch)) common++;
  if (r.exact !== ex || r.exact + r.mis !== common || r.exact + r.mis > 3 || r.mis < 0) bad++;
  if (s === g && !(r.exact === 3 && r.mis === 0)) bad++;
}
ok(bad === 0, 'all 518400 pairs consistent: ' + bad);
/* قراءة المحاولة */
const P = t => L.parseAttempt(t);
eq(P('583'), { ok: true, code: '583' }, 'plain'); eq(P('٥٨٣'), { ok: true, code: '583' }, 'arabic digits'); eq(P('۵۸۳').code, '583', 'persian');
eq(P('047').code, '047', 'leading zero string'); eq(P('5 8 3').code, '583', 'spaced'); eq(P('5-8-3').code, '583', 'dashed'); eq(P('٥،٨،٣').code, '583', 'arabic comma');
eq(P(' 583 ').code, '583', 'trim'); eq(P('‏٥٨٣‏').code, '583', 'rtl marks');
for (const t of ['58', '5831', '588', '5 8 8', '112', '583 123', 'اظن 583', '583 صح؟', '5 8', '58 3', '1234567']) ok(!P(t).ok, 'reject ' + t);
eq(P('588').reason, 'dup', 'dup reason'); eq(P('58').reason, 'format', 'short reason'); eq(P('هلا').reason, 'chat', 'chat');
/* لعبة كاملة بساعة وهمية */
let T = 1000; const clock = () => T; const adv = ms => { T += ms; M.tick(); };
let M;
function mk(cfg, seed) { T = 1000; let s = seed || 7; const rng = () => (s = (s * 16807) % 2147483647) / 2147483647; M = L.create({ now: clock, rng, cfg: Object.assign({ debug: true, vaults: 2, collectSec: 20, readSec: 8, maxStages: 3, joinWord: 'انضم' }, cfg || {}) }); M.openLobby(); return M; }
const chat = (id, text, eid) => M.receiveChat({ userId: id, nickname: 'N' + id, text, eid });
const toCollect = () => { adv(2300); };
mk(); ok(M.G.phase === 'lobby', 'lobby');
eq(chat('a', 'انضم').reason, 'joined', 'join'); eq(chat('a', 'انضم').reason, 'already', 'join twice'); chat('b', 'انضم'); chat('c', 'أنضم ');
ok(M.G.players.size === 3, '3 players (normalized word)'); eq(chat('x', '123').reason, 'notopen', 'attempt in lobby rejected');
ok(M.startMatch().ok, 'start'); ok(M.G.phase === 'intro', 'intro'); eq(chat('a', '123').reason, 'notopen', 'attempt in intro'); toCollect(); ok(M.G.phase === 'collect', 'collect');
const secret = M.debugSecret(); ok(/^\d{3}$/.test(secret) && new Set(secret).size === 3, 'secret valid ' + secret);
const snap0 = JSON.stringify(M.snapshot()); ok(!snap0.includes('"' + secret + '"') && M.snapshot().result === null, 'snapshot hides secret during collect');
eq(chat('a', 'هلا والله').reason, 'chat', 'chat ignored'); eq(chat('a', '58').reason, 'format', 'bad format');
eq(chat('a', '112').reason, 'dup', 'dup digits'); ok(M.G.cur.attempts.size === 0, 'invalid did not consume');
const wrong = secret === '012' ? '345' : '012'; eq(chat('a', wrong).reason, 'accepted', 'accepted'); eq(chat('a', '987').reason, 'already', 'second attempt ignored');
eq(chat('zz', '987').reason, 'notjoined', 'not joined ignored'); ok(!M.G.players.has('zz'), 'not secretly registered');
ok(M.snapshot().submitted === 1, 'count 1');
eq(chat('b', wrong, 'e1').reason, 'accepted', 'b accepted'); eq(chat('c', '987', 'e1').reason, 'dupevent', 'duplicate event id');
ok(M.snapshot().hist.length === 0, 'no results before lock'); ok(M.G.cur.solved.length === 0, 'no win before lock');
adv(20100); ok(M.G.phase === 'locked', 'locked'); eq(chat('c', secret).reason, 'closed', 'late message rejected');
adv(1400); ok(M.G.phase === 'reveal', 'reveal'); eq(chat('c', secret).reason, 'closed', 'message during reveal rejected');
let sn = M.snapshot(); ok(sn.hist.length === 1 && sn.hist[0].rows.length === 1 && sn.hist[0].rows[0].n === 2, 'grouped same code n=2'); ok(M.G.players.get('b').score === 0, 'no points yet');
adv(8100); ok(M.G.phase === 'collect' && M.G.stage === 2, 'next stage same secret'); ok(M.debugSecret() === secret, 'secret persists'); eq(chat('a', '987').reason, 'accepted', 'attempt restored next stage');
/* حل متعدد في نفس المرحلة */
chat('b', secret); chat('c', secret); adv(20100); ok(M.G.phase === 'locked', 'locked2'); ok(M.G.players.get('b').score === 0, 'no award during lock');
adv(1400); adv(8100); ok(M.G.phase === 'opening', 'opening'); ok(M.G.players.get('b').score === 100 && M.G.players.get('c').score === 100 && M.G.players.get('a').score === 0, 'both solvers 100, others 0');
sn = M.snapshot(); ok(sn.result.code === secret && sn.result.winners.length === 2, 'result reveals code and winners');
adv(7000); ok(M.G.phase === 'intro' && M.G.vaultNo === 2, 'vault 2'); const s2 = M.debugSecret();
toCollect(); ok(M.snapshot().result === null && !JSON.stringify(M.snapshot()).includes(s2), 'secret hidden again');
/* صمدت + لا نقاط */
for (let st = 0; st < 3; st++) { chat('a', st === 0 ? '012' : '345'); adv(20100); adv(1400); adv(8100); }
ok(M.G.phase === 'held', 'held after max stages'); sn = M.snapshot(); ok(sn.result.status === 'held' && sn.result.winners.length === 0, 'no invented winner');
ok(M.G.players.get('a').score === 0, 'no points on held'); adv(5300); ok(M.G.phase === 'final', 'final after vault 2'); ok(M.leaders().length === 2, 'tie b,c');
/* تعادل: فاصلة */
ok(M.startTiebreak().ok, 'tiebreak'); toCollect(); eq(chat('a', '123').reason, 'notinvolved', 'a not in tiebreak'); const tbs = M.debugSecret(); chat('b', tbs); adv(20100); adv(1400); adv(8100); adv(7000);
ok(M.G.phase === 'final' && M.leaders().length === 1 && M.leaders()[0].id === 'b', 'tiebreak winner b'); ok(M.G.players.get('b').score === 200, 'b = 200');
/* جولة بلا محاولات */
mk({ vaults: 1, maxStages: 2 }); chat('a', 'انضم'); M.startMatch(); toCollect(); adv(20100); adv(1400); ok(M.snapshot().hist[0].count === 0, 'empty stage ok'); adv(8100); ok(M.G.phase === 'collect' && M.G.stage === 2, 'continues'); adv(20100); adv(1400); adv(8100); ok(M.G.phase === 'held', 'held empty');
/* انضمام متأخر */
mk({ vaults: 1, maxStages: 4 }); chat('a', 'انضم'); M.startMatch(); toCollect(); eq(chat('l', 'انضم').reason, 'late', 'late join'); ok(M.G.players.has('l'), 'late registered'); const ss = M.debugSecret(); eq(chat('l', ss).reason, 'late_wait', 'late waits for next stage');
chat('a', '012'); adv(20100); ok(M.G.players.get('l').score === 0, 'closed stage unchanged'); adv(1400); adv(8100); eq(chat('l', '345').reason, 'accepted', 'late joiner plays next stage');
mk({ late: false }); chat('a', 'انضم'); M.startMatch(); toCollect(); eq(chat('l', 'انضم').reason, 'late_off', 'late off setting');
/* إغلاق مبكر / تمديد / إيقاف */
mk({ vaults: 1 }); chat('a', 'انضم'); M.startMatch(); toCollect(); ok(M.extend(10000).ok, 'extend'); adv(25000); ok(M.G.phase === 'collect', 'still collecting after extend'); ok(M.pause().ok, 'pause'); eq(chat('a', '012').reason, 'paused', 'paused rejects'); adv(100000); ok(M.G.phase === 'collect', 'paused no tick'); ok(M.resume().ok, 'resume'); adv(6000); ok(M.G.phase === 'locked', 'closed after remaining time');
mk({ vaults: 1 }); chat('a', 'انضم'); M.startMatch(); toCollect(); chat('a', '012'); ok(M.closeEarly().ok, 'close early'); ok(M.G.phase === 'locked', 'locked early'); ok(!M.closeEarly().ok, 'close early twice no-op');
/* انقطاع واستئناف */
mk({ vaults: 2 }); chat('a', 'انضم'); M.startMatch(); toCollect(); chat('a', '012'); const sec = M.debugSecret(); M.setLink(false); ok(M.G.paused && M.G.linkDown, 'auto pause'); adv(60000); ok(M.G.phase === 'collect', 'held during outage'); M.setLink(true); ok(M.G.paused, 'stays paused after reconnect'); eq(chat('a', sec).reason, 'paused', 'no processing while paused'); ok(M.resume().ok, 'resume after link'); ok(M.debugSecret() === sec && M.G.cur.attempts.size === 1, 'secret + attempts kept');
M.setLink(false); ok(!M.resume().ok, 'resume blocked while down'); M.setLink(true); M.resume(); ok(M.replayStage().ok && M.G.cur.attempts.size === 0 && M.debugSecret() === sec, 'replay stage same secret'); ok(M.G.players.get('a').score === 0, 'no points added by replay');
/* لا مضاعفة نقاط عند إعادة */
mk({ vaults: 1 }); chat('a', 'انضم'); chat('b', 'انضم'); M.startMatch(); toCollect(); chat('a', M.debugSecret()); adv(20100); adv(1400); adv(8100); ok(M.G.players.get('a').score === 100, '100 once'); adv(7000); ok(M.G.phase === 'final', 'final'); M.restartMatch(true); ok(M.G.players.get('a').score === 0 && M.G.phase === 'lobby', 'restart resets'); M.startMatch(); toCollect(); chat('a', M.debugSecret()); adv(20100); adv(1400); adv(8100); ok(M.G.players.get('a').score === 100, 'second match 100 not 200');
/* debug guard */
const M2 = L.create({ cfg: {} }); let thr = false; try { M2.debugSecret(); } catch (e) { thr = true; } ok(thr, 'debugSecret guarded');
/* توزيع الرمز: كل الـ720 ممكنة */
{ const seen = new Set(); for (let i = 0; i < 6000; i++) { const X = L.create({ cfg: { debug: true } }); X.openLobby(); X.addPlayer('p', 'p'); X.startMatch(); seen.add(X.debugSecret()); } ok(seen.size > 600, 'secret variety ' + seen.size); }
console.log(fails ? 'FAILS ' + fails + '/' + n : 'ALL PASS ' + n);
