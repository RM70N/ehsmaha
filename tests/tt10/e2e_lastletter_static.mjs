// آخر حرف: الشاشة ثابتة أثناء الإقصاءات (24 لاعباً). تشغيل: python3 -m http.server 8790 ثم node tests/tt10/e2e_lastletter_static.mjs
import { createRequire } from 'module';
const require = createRequire(new URL('../../', import.meta.url));
const { chromium } = require('playwright');
const { installFakeFirebase } = require('./desktop/test/e2e/fake-firebase.js');
const BASE = process.env.BASE || 'http://127.0.0.1:8790/index.html';
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ✔', n); } else { fail++; console.log('  ✘', n, JSON.stringify(d)); } };
const b = await chromium.launch();
console.log('== LL) آخر حرف: ثبات الشاشة');
for (const [w, h] of [[1280, 720], [1920, 1080], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } }); const pg = await ctx.newPage();
  await installFakeFirebase(pg, new URL('../../index.html', import.meta.url).pathname);
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(BASE); await pg.waitForTimeout(2500);
  const r = await pg.evaluate(async () => {
    show('lastletter'); llStartWord = 'كتاب';
    for (let i = 0; i < 24; i++) llJoinParticipant({ uniqueId: 'u' + i, nickname: 'لاعب رقم ' + i, isFollower: true, followKnown: true });
    await new Promise(r => setTimeout(r, 500)); startLastLetterRound(); await new Promise(r => setTimeout(r, 1500));
    const q = s => document.querySelector(s), seen = new Set();
    const snap = () => { const st = q('#ll-stage').getBoundingClientRect(), ch = q('#ll-chain-wrap').getBoundingClientRect(); seen.add([Math.round(st.top), Math.round(ch.top), q('#pg-lastletter .gs-stage') ? q('#pg-lastletter .gs-stage').scrollTop : 0].join('/')); };
    snap();
    for (let i = 0; i < 12; i++) { const uid = llQueue[llCurrentIdx]; llEliminate(uid, llParticipants.get(uid), 'تجربة'); await new Promise(r => setTimeout(r, 1500)); snap(); addWordToChain('كلمة' + i, true); snap(); }
    return [...seen];
  });
  ok(`${w}×${h}: لا شيء يتحرك خلال 12 إقصاء وإضافة كلمات`, r.length === 1, r);
  ok('لا أخطاء JS', errs.filter(e => !/webgl/i.test(e)).length === 0, errs); await ctx.close();
}
console.log(`\nنجح ${pass} / فشل ${fail}`); await b.close(); process.exit(fail ? 1 : 0);
