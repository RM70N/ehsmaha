// اختبار هيدر الستريمر: 39 لعبة × (انتظار + راوند) + نقرات حقيقية + تجاوب + تطابق حرفي للملفات.
// التشغيل: python3 -m http.server 8790 (من جذر المشروع) ثم: node tests/stream-header/e2e_header.mjs
import { createRequire } from 'module'; import crypto from 'crypto'; import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright'); const { installFakeFirebase } = require('../../desktop/test/e2e/fake-firebase.js');
const ROOT = new URL('../../', import.meta.url).pathname;
let pass = 0, fail = 0; const bad = [];
const ok = (c, m) => { if (c) pass++; else { fail++; bad.push(m); console.log('  ✗', m); } };
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(ROOT + f)).digest('hex');

// 1) الملفان منسوخان حرفياً من ملف التصميم (هاش السطور المستخرجة من الملف المرفوع)
ok(sha('ehsmaha-stream-header.css') === process.env.CSS_SHA || sha('ehsmaha-stream-header.css') === '1dba541e96c7a8c40d5df88f088a6b87875969729bc7aefc30a31bbd01f4825c', 'css sha');
ok(sha('ehsmaha-stream-header.js') === process.env.JS_SHA || sha('ehsmaha-stream-header.js') === 'eacd5dc11cf510b08686c353fd6cee45cd07be714f94b391d0fe5315d0999df6', 'js sha');

const EXP = {}; // الأزرار المتوقعة لكل لعبة
const FULL = 'home,kick,late,reset';
'cannon cr ev sniper roulette timer lastletter whoami reverseword priceguess crownsteal letterscramble countrywar box chairs wordrace draw rlgl maze volcanic-lands hz ig'.split(' ').forEach(g => EXP[g] = FULL);
'dash guessword battery'.split(' ').forEach(g => EXP[g] = 'home,late,reset');
'tt10 glz roulette3d'.split(' ').forEach(g => EXP[g] = 'home,late');
'bomb findball tug xo ek almeezan wesh hq latatayeh harfnajat spaceodyssey'.split(' ').forEach(g => EXP[g] = 'home');
const IFR = new Set('bomb findball tug xo ek almeezan wesh hq latatayeh harfnajat spaceodyssey roulette3d'.split(' '));
ok(Object.keys(EXP).length === 39, '39 games');

const b = await chromium.launch();
const errs = [];
async function open(w, h) {
  const pg = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  await installFakeFirebase(pg, ROOT + 'index.html');
  await pg.addInitScript(() => { try { sessionStorage.setItem('ehsemha-wlc:ehsemha-windows-launch-2026:closed', '1'); } catch (e) {} });
  pg.on('pageerror', e => { if (!/webgl/i.test(e.message)) errs.push(e.message); });
  await pg.goto('http://127.0.0.1:8790/index.html'); await pg.waitForTimeout(2200);
  return pg;
}
const pg = await open(1280, 720);
for (const [g, exp] of Object.entries(EXP)) {
  await pg.evaluate(id => show(id), g); await pg.waitForTimeout(700);
  const r = await pg.evaluate(id => {
    const p = document.getElementById('pg-' + id), h = p.querySelector('.ehsmaha-stream-header'), hr = h && h.getBoundingClientRect();
    const mid = document.elementFromPoint(innerWidth / 2, 6);
    const lj = document.getElementById('lj-btn');
    const src = {}; p.querySelectorAll('[data-ehsh-src]').forEach(e => { (src[e.dataset.ehshSrc] = src[e.dataset.ehshSrc] || []).push(getComputedStyle(e).display); });
    return { n: p.querySelectorAll('.ehsmaha-stream-header').length, btns: h ? [...h.querySelectorAll('.eh-btn')].map(x => x.dataset.act).join(',') : '', top: hr && hr.top, hh: hr && hr.height,
      over: !!(mid && mid.closest('.ehsmaha-stream-header')), src, ljIn: !!(lj && p.contains(lj)), plaque: !![...p.querySelectorAll('.rf-badge-logo')].find(e => getComputedStyle(e).display !== 'none') };
  }, g);
  ok(r.n === 1, g + ': header مرة واحدة'); ok(r.btns === exp, `${g}: الأزرار ${r.btns} == ${exp}`);
  ok(r.top === 0 && r.hh >= 56, g + ': أعلى الصفحة'); ok(r.over, g + ': الهيدر فوق المحتوى');
  ok(!r.plaque, g + ': لوحة اللوقو القديمة مخفية');
  ok(exp.includes('late') === r.ljIn, g + ': زر المتأخر يظهر فقط حيث النظام الأصلي موجود');
  for (const k of ['home', 'kick', 'reset']) if (exp.includes(k)) ok(r.src[k] && r.src[k].every(d => d === 'none'), `${g}: الأصل المكرّر (${k}) مخفي`);
  // نقرات حقيقية: نعترض الأزرار الأصلية بدل تنفيذها (لا ننتقل ولا نمسح شيئاً)، ونتأكد أن كل زر في الهيدر يضغط الأصل
  for (const k of exp.split(',')) {
    const res = await pg.evaluate(async ({ id, k }) => {
      const p = document.getElementById('pg-' + id); let hit = 0; const undo = [];
      const sel = k === 'late' ? ['#lj-btn'] : [`[data-ehsh-src="${k}"]`];
      if (k === 'late') { const m = document.getElementById('lj-modal'); }
      const els = k === 'late' ? [] : [...p.querySelectorAll(sel[0])];
      els.forEach(e => { const f = ev => { ev.stopImmediatePropagation(); ev.preventDefault(); hit++; }; e.addEventListener('click', f, true); undo.push(() => e.removeEventListener('click', f, true)); });
      const hb = p.querySelector(`.ehsmaha-stream-header .eh-btn[data-act="${k}"]`); hb.click();
      await new Promise(r => setTimeout(r, 150));
      let modal = false;
      if (k === 'late') { const m = document.getElementById('lj-modal'); modal = !!(m && !m.hidden); if (modal) { const x = document.getElementById('lj-x'); x && x.click(); } }
      undo.forEach(u => u()); return { hit, modal };
    }, { id: g, k });
    ok(k === 'late' ? res.modal : res.hit >= 1, `${g}: زر ${k} يشغّل الأصل (${JSON.stringify(res)})`);
  }
  // الراوند: المسرح تحت الهيدر
  if (!IFR.has(g)) {
    await pg.evaluate(id => document.getElementById('pg-' + id).classList.add('rd-live'), g); await pg.waitForTimeout(500);
    const lv = await pg.evaluate(id => { const p = document.getElementById('pg-' + id), h = p.querySelector('.ehsmaha-stream-header').getBoundingClientRect();
      const st = p.querySelector('.gs-stage'); const mid = document.elementFromPoint(innerWidth / 2, 6);
      return { gs: p.classList.contains('gs-live'), pad: st ? parseFloat(getComputedStyle(st).paddingTop) : null, hb: h.bottom, over: !!(mid && mid.closest('.ehsmaha-stream-header')), foot: st ? getComputedStyle(p.querySelector('.gs-foot')).display : null }; }, g);
    ok(lv.over, g + ': الهيدر ظاهر داخل الراوند');
    if (lv.gs && lv.pad != null) { ok(lv.pad >= lv.hb, `${g}: مسرح الراوند يبدأ تحت الهيدر (${lv.pad} ≥ ${lv.hb})`); ok(lv.foot === 'none', g + ': شريط الأزرار المخفي الأصلي مُزال'); }
    await pg.evaluate(id => document.getElementById('pg-' + id).classList.remove('rd-live'), g);
  }
}
// ألعاب iframe: الإطار يبدأ تحت الهيدر
for (const g of IFR) {
  await pg.evaluate(id => show(id), g); await pg.waitForTimeout(500);
  const r = await pg.evaluate(id => { const p = document.getElementById('pg-' + id), f = p.querySelector('iframe'), h = p.querySelector('.ehsmaha-stream-header').getBoundingClientRect();
    return { ft: f ? f.getBoundingClientRect().top : null, hb: h.bottom }; }, g);
  ok(r.ft != null && Math.abs(r.ft - r.hb) <= 1, `${g}: الإطار تحت الهيدر (${r.ft} vs ${r.hb})`);
}
// تجاوب: عرض الجوال والتابلت والهاتف الأفقي
for (const [w, h] of [[390, 844], [820, 1180], [844, 390]]) {
  const p2 = await open(w, h);
  for (const g of ['sniper', 'roulette', 'cannon', 'tt10', 'tug']) {
    await p2.evaluate(id => show(id), g); await p2.waitForTimeout(500);
    const r = await p2.evaluate(id => { const p = document.getElementById('pg-' + id), hd = p.querySelector('.ehsmaha-stream-header'); const bs = [...hd.querySelectorAll('.eh-btn')].map(x => x.getBoundingClientRect());
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, inside: bs.every(x => x.left >= -1 && x.right <= innerWidth + 1), hh: hd.getBoundingClientRect().height, v: getComputedStyle(p).getPropertyValue('--ehsh-h') }; }, g);
    ok(r.sw <= r.iw, `${w}x${h} ${g}: لا تمرير أفقي`); ok(r.inside, `${w}x${h} ${g}: الأزرار داخل الشاشة`); ok(Math.abs(parseFloat(r.v) - r.hh) <= 1, `${w}x${h} ${g}: المساحة المحجوزة = ارتفاع الهيدر`);
  }
}
ok(errs.length === 0, 'لا أخطاء JS: ' + [...new Set(errs)].slice(0, 3).join(' | '));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
