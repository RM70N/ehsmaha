// اختبار متصفحات حقيقي لـ«جمعتنا»: مضيف + 3 جوالات (سياقات مستقلة) على خادم الغرف الفعلي — مباراتان كاملتان حتى التتويج.
// التشغيل: node tests/jam3atna/e2e.mjs   (يحتاج playwright + chromium)
import { createRequire } from 'node:module'; import fs from 'node:fs'; import { startDev } from './dev-server.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const THREE = new URL('../bridge/fixtures/three-r128/build/three.min.js', import.meta.url).pathname;
let pass = 0, fail = 0; const ok = (name, c, extra = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const d = await startDev(0, { min: { city: 2, prop: 2 }, city: { introMs: 1200, revealMs: 1200, memorizeMs: 500, timeScale: 0.15 }, prop: { hideMs: 90000, introMs: 300, resultMs: 1500, timeScale: 0.12 } });
const base = `http://127.0.0.1:${d.port}/jam3atna/`, srv = `srv=ws://127.0.0.1:${d.port}/jam3atna/ws`;
const b = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); const errs = [];
const mk = async (vp, mobile) => { const c = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile }); await c.route(/three(\.min)?\.js/, (r) => r.fulfill({ body: fs.readFileSync(THREE), contentType: 'text/javascript' })); const p = await c.newPage(); p.on('pageerror', (e) => errs.push(String(e).slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); }); return p; };
const inst = (p, f) => p.evaluate(f);
async function lobby(game, n) {
  const host = await mk({ width: 1280, height: 720 }, false); await host.goto(base + '?' + srv + '#/' + game); await host.click('#j3-create'); await host.waitForSelector('.j3-qr svg'); const code = await host.evaluate(() => window.__j3.st.room.code);
  const qr = await host.evaluate(() => { const s = document.querySelector('.j3-qr svg'); return !!s && s.querySelectorAll('rect,path').length > 0; });
  const ph = []; for (let i = 0; i < n; i++) { const p = await mk({ width: 390, height: 844 }, true); await p.goto(base + '?r=' + code + '&' + srv); await p.fill('#j3-name', 'لاعب' + (i + 1)); await p.click('#j3-nameform button.j3-btn-main'); await p.waitForSelector('#j3-ready'); await p.click('#j3-ready'); ph.push(p); }
  await host.waitForFunction((k) => document.querySelectorAll('.j3-player.is-ready').length === k, n);
  return { host, ph, code, room: d.j.rooms.get(code), qr };
}
try {
  // ---------------- المدينة المصغّرة ----------------
  { const L = await lobby('city', 3); ok('city: QR حقيقي + كود + 3 لاعبين جاهزين', L.qr && /^[A-Z2-9]{6}$/.test(L.code));
    await L.host.click(`.j3-seg[data-k=rounds] button[data-v='3']`); await L.host.click(`.j3-seg[data-k=missionSec] button[data-v='30']`); await L.host.waitForTimeout(150); await L.host.click('#j3-start');
    for (const p of [L.host, ...L.ph]) await p.waitForFunction(() => window.__j3.st.inst && window.__j3.st.inst._S.world, null, { timeout: 30000 });
    ok('city: كل الأجهزة بنت نفس المدينة من seed الخادم', new Set(await Promise.all([L.host, ...L.ph].map((p) => inst(p, () => window.__j3.st.inst._S.seed)))).size === 1);
    const ids = await Promise.all(L.ph.map((p) => p.evaluate(() => window.__j3.st.me.id))); const g = L.room.inst; const seen = new Set();
    for (let guard = 0; guard < 400 && L.room.phase === 'playing'; guard++) { const r = g.round; if (r && !r.done && !seen.has(r.n + r.type) && Date.now() >= r.openAt) { seen.add(r.n + r.type);
        await L.ph[0].evaluate(([id, n]) => window.__j3.net.g({ k: 'pick', id, round: n }), [r.per.get(ids[0]).target, r.n]);
        if (r.n === 1) await L.ph[1].evaluate(([id, n]) => window.__j3.net.g({ k: 'pick', id, round: n }), [r.per.get(ids[1]).target, r.n]); } await L.host.waitForTimeout(100); }
    await L.host.waitForSelector('.g-end #c-again', { timeout: 20000 });
    ok('city: 3 جولات ثم منصة التتويج على المضيف', L.room.phase === 'ended' && seen.size >= 3, [...seen].join(','));
    ok('city: النقاط متزامنة بين الخادم وجوال اللاعب', (await L.ph[0].evaluate(() => window.__j3.st.inst._S.score)) === L.room.players.get(ids[0]).score, String(L.room.players.get(ids[0]).score));
    ok('city: الفائز هو الأعلى نقاطًا', (await L.host.evaluate(() => document.querySelector('.g-rank li span').textContent)).includes('لاعب1'));
    await L.ph[2].waitForSelector('.g-end'); ok('city: شاشة النهاية تظهر للاعب', true);
    await L.host.click('#c-again'); for (const p of L.ph) await p.waitForSelector('#j3-ready', { timeout: 8000 });
    ok('city: مباراة جديدة ترجع الجميع للوبي وتحرّر WebGL', (await Promise.all([L.host, ...L.ph].map((p) => p.evaluate(() => document.querySelectorAll('canvas').length)))).every((n) => n === 0));
    await L.ph[2].click('#j3-leave'); await L.ph[2].waitForSelector('.j3-card'); await L.host.waitForFunction(() => document.querySelectorAll('.j3-player').length === 2); ok('city: خروج لاعب يظهر فورًا عند المضيف', true);
    await L.host.click('#j3-cancel'); await L.host.click('#j3-yes'); await L.ph[0].waitForSelector('.j3-card', { timeout: 8000 }); ok('city: إلغاء الغرفة يرجّع اللاعبين للقسم', d.j.rooms.size === 0);
    for (const p of [L.host, ...L.ph]) await p.context().close(); }
  // ---------------- مين المتنكر؟ ----------------
  { const L = await lobby('prop', 3); await L.host.click(`.j3-seg[data-k=rounds] button[data-v='2']`); await L.host.click(`.j3-seg[data-k=seekSec] button[data-v='120']`); await L.host.waitForTimeout(150); await L.host.click('#j3-start');
    for (const p of L.ph) await p.waitForFunction(() => window.__j3.st.inst && window.__j3.st.inst._S.setup, null, { timeout: 30000 });
    const roles = await Promise.all(L.ph.map((p) => inst(p, () => window.__j3.st.inst._S.role))); ok('prop: مفتش واحد ومتنكران', roles.filter((r) => r === 'seek').length === 1 && roles.filter((r) => r === 'hide').length === 2, roles.join());
    const seeker = L.ph[roles.indexOf('seek')]; ok('prop: المفتش لا يملك أي غرض أثناء الاختباء', (await inst(seeker, () => { const S = window.__j3.st.inst._S; return S.phase === 'seek' || S.props.size === 0; })));
    await seeker.waitForFunction(() => window.__j3.st.inst._S.phase === 'seek' && window.__j3.st.inst._S.props.size > 40, null, { timeout: 45000 });
    ok('prop: قائمة المفتش لا تحتوي أي علامة تميّز المتنكر', await inst(seeker, () => { let m = 0; window.__j3.st.inst._S.props.forEach((p) => { if (p.mate || p.mine) m++; }); return m === 0; }));
    // كشف حقيقي بزر «فحص» في الجولة الأولى
    const rs = L.room.inst.rs; const ids = await Promise.all(L.ph.map((p) => p.evaluate(() => window.__j3.st.me.id))); const sid = ids[roles.indexOf('seek')], hid = ids[roles.indexOf('hide')]; const hh = rs.st.get(hid), sk = rs.st.get(sid);
    sk.x = hh.x + hh.r + 1.1; sk.z = hh.z; await seeker.waitForTimeout(700); await seeker.evaluate((pid) => { const S = window.__j3.st.inst._S; const p = S.props.get(pid); S.yaw = Math.atan2(p.x - S.me.x, p.z - S.me.z); }, hh.pid); await seeker.waitForTimeout(300);
    await seeker.tap('.g-actions .g-btn.is-main'); await L.host.waitForFunction(() => /1/.test(document.querySelector('#p-left b').textContent), null, { timeout: 5000 });
    ok('prop: الفحص بالزر كشف المتنكر (+75) وتحدّث العدّاد على المضيف', hh.found && L.room.players.get(sid).score === 75);
    await L.host.waitForSelector('.g-end #p-again', { timeout: 150000 }); ok('prop: جولتان ثم مسرح التتويج', L.room.phase === 'ended');
    const turns = [...L.room.players.values()].filter((p) => !p.isHost).length; ok('prop: الترتيب النهائي يشمل كل اللاعبين', (await L.host.evaluate(() => document.querySelectorAll('.g-rank li').length)) === turns);
    await L.host.click('#p-again'); await L.ph[0].waitForSelector('#j3-ready', { timeout: 8000 }); ok('prop: مباراة جديدة → اللوبي بدون تسريب canvas', (await L.host.evaluate(() => document.querySelectorAll('canvas').length)) === 0);
    for (const p of [L.host, ...L.ph]) await p.context().close(); }
  ok('لا أخطاء JavaScript في أي جلسة', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) { fail++; console.log('FAIL استثناء: ' + String(e && e.stack || e).slice(0, 600)); if (errs.length) console.log(errs.slice(0, 4).join('\n')); }
console.log(`\n${pass}/${pass + fail} passed`); await b.close(); d.close(); process.exit(fail ? 1 : 0);
