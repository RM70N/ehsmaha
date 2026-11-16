// توب 10 (ستريمر): بنك 700 سؤال + ثبات الشاشة + اللعب الكامل. تشغيل: python3 -m http.server 8790 ثم node tests/tt10/e2e_tt10.mjs
import { createRequire } from 'module';
const require = createRequire(new URL('../../', import.meta.url));
const { chromium } = require('playwright');
const { installFakeFirebase } = require('./desktop/test/e2e/fake-firebase.js');
const BASE = process.env.BASE || 'http://127.0.0.1:8790/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✔', n); } else { fail++; console.log('  ✘', n, d !== undefined ? JSON.stringify(d) : ''); } };
const b = await chromium.launch();
async function open(w, h) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } }); const pg = await ctx.newPage();
  await installFakeFirebase(pg, new URL('../../index.html', import.meta.url).pathname);
  pg._errs = []; pg.on('pageerror', e => pg._errs.push(String(e)));
  await pg.goto(BASE); await pg.waitForTimeout(2500); return { ctx, pg };
}
console.log('== TT10) توب 10 ستريمر');
{
  const { ctx, pg } = await open(1280, 720);
  const bank = await pg.evaluate(() => ({ n: TT10_QUESTIONS.length, bad: TT10_QUESTIONS.filter(q => !q.q || q.a.length !== 10 || new Set(q.a).size !== 10).length, uniq: new Set(TT10_QUESTIONS.map(q => q.q)).size, al: TT10_QUESTIONS.filter(q => q.al).length }));
  ok('البنك الجديد: 700 سؤال فريد، كل سؤال 10 إجابات غير مكررة', bank.n === 700 && bank.bad === 0 && bank.uniq === 700, bank);
  ok('البنك القديم محذوف: أول سؤال هو أول سؤال الملف الجديد', await pg.evaluate(() => TT10_QUESTIONS[0].q === 'وش أول شيء تسويه إذا صحيت من النوم؟' && !TT10_QUESTIONS.some(q => q.q === 'أشياء تاخذها معك قبل ما تطلع من البيت')));
  // مطابقة: نص + مرادف (alias) + لهجة + نقاط = الترتيب
  const m = await pg.evaluate(() => {
    const U = (i) => ({ uniqueId: 'u' + i, nickname: 'ن' + i, isFollower: true, followKnown: true });
    tt10Scores.clear(); tt10Participants.clear(); tt10Round = 0; tt10GameStatus = 'waiting'; tt10UsedQuestionIdx = [];
    show('tt10'); tt10StartRound();
    tt10CurrentQuestion = { q: TT10_QUESTIONS[0].q, items: TT10_QUESTIONS[0].a.map((v, i) => ({ rank: i + 1, value: v, aliases: TT10_QUESTIONS[0].al[i] || [], revealed: false })) };
    tt10ProcessAnswer(U(1), TT10_QUESTIONS[0].a[0]);                 // نص مطابق
    tt10ProcessAnswer(U(2), TT10_QUESTIONS[0].al[1][0]);             // alias
    tt10ProcessAnswer(U(3), 'سالفة ما لها علاقة');                    // خطأ
    tt10ProcessAnswer(U(1), TT10_QUESTIONS[0].a[0]);                 // مكرر
    return { s1: tt10Scores.get('u1') && tt10Scores.get('u1').score, s2: tt10Scores.get('u2') && tt10Scores.get('u2').score, s3: !!tt10Scores.get('u3'), rev: tt10CurrentQuestion.items.filter(i => i.revealed).length };
  });
  ok('النقاط = الترتيب (إجابة 1→1، alias إجابة 2→2)، الخطأ والمكرر لا يُحتسبان', m.s1 === 1 && m.s2 === 2 && !m.s3 && m.rev === 2, m);
  const syn = await pg.evaluate(() => { const q = TT10_QUESTIONS.find(x => x.a.some(a => a.includes('جوال'))); return tt10CanonWord('موبايل') === tt10CanonWord('جوال') && tt10CanonWord('جزمة') === tt10CanonWord('حذاء') && Object.keys(TT10_SYNONYMS).length > 40; });
  ok('مرادفات اللهجة مفعّلة (موبايل=جوال، جزمة=حذاء)', syn);
  // كل الأسئلة قابلة للعب: كل إجابة تُطابق نفسها
  const all = await pg.evaluate(() => { let bad = 0; for (const q of TT10_QUESTIONS) { tt10CurrentQuestion = { q: q.q, items: q.a.map((v, i) => ({ rank: i + 1, value: v, aliases: (q.al && q.al[i]) || [], revealed: false })) }; for (let i = 0; i < 10; i++) { const it = tt10FindMatch(q.a[i]); if (!it || it.rank !== i + 1) { bad++; break; } } } return bad; });
  ok('كل إجابة من الـ7000 تُطابق نفسها بترتيبها الصحيح', all === 0, all);
  ok('لا أخطاء JS (عدا WebGL غير المتاح بالمتصفح الآلي)', pg._errs.filter(e => !/webgl/i.test(e)).length === 0, pg._errs); await ctx.close();
}
for (const [w, h] of [[1280, 720], [1366, 768], [1920, 1080], [390, 844]]) {
  const { ctx, pg } = await open(w, h);
  const pos = await pg.evaluate(async () => {
    const U = (i) => ({ uniqueId: 'u' + i, nickname: 'لاعب طويل الاسم جداً رقم ' + i, isFollower: true, followKnown: true });
    tt10Scores.clear(); tt10Round = 0; tt10GameStatus = 'waiting'; show('tt10'); tt10StartRound(); await new Promise(r => setTimeout(r, 1000));
    const stage = document.querySelector('#pg-tt10 .gs-stage'); const g = document.getElementById('tt10-grid'), q = document.querySelector('#pg-tt10 .tt10-qbanner');
    const seen = new Set(), inv = [];
    const snap = () => { const gr = g.getBoundingClientRect(), qr = q.getBoundingClientRect(); seen.add(Math.round(gr.top) + '/' + Math.round(qr.top)); inv.push(stage.scrollTop, scrollY, document.querySelector('#pg-tt10 .panel').scrollTop); };
    snap();
    for (let i = 0; i < 10; i++) { tt10ProcessAnswer(U(i), tt10CurrentQuestion.items[i].value); await new Promise(r => setTimeout(r, 90)); snap(); }
    const lb = document.querySelector('#pg-tt10 .tt10-lb').getBoundingClientRect();
    return { seen: [...seen], scrolls: Math.max(...inv), lbBottom: Math.round(lb.bottom), vh: innerHeight, over: stage.scrollHeight - stage.clientHeight };
  });
  ok(`${w}×${h}: الشاشة ثابتة تماماً طوال 10 إجابات (موضع واحد فقط) وبلا تمرير`, pos.seen.length === 1 && pos.scrolls === 0, pos);
  await ctx.close();
}
{ // دورة كاملة 3 جولات حتى الفوز + المؤقت
  const { ctx, pg } = await open(1280, 720);
  const r = await pg.evaluate(async () => {
    const U = (i) => ({ uniqueId: 'u' + i, nickname: 'ن' + i, isFollower: true, followKnown: true });
    tt10Scores.clear(); tt10Round = 0; tt10UsedQuestionIdx = []; tt10GameStatus = 'waiting'; tt10RoundSeconds = 0;
    show('tt10'); const log = [];
    for (let r = 1; r <= 3; r++) {
      if (r === 1) tt10StartRound(); else tt10NextRound();
      await new Promise(x => setTimeout(x, 300));
      const gridBefore = document.getElementById('tt10-grid').getBoundingClientRect().top;
      for (let i = 0; i < 10; i++) tt10ProcessAnswer(U(r === 3 ? 7 : i % 3), tt10CurrentQuestion.items[i].value);
      await new Promise(x => setTimeout(x, 800));
      log.push({ r, status: tt10GameStatus, page: document.querySelector('.page.active').id });
    }
    tt10NextRound(); await new Promise(x => setTimeout(x, 600));
    return { log, final: tt10GameStatus, page: document.querySelector('.page.active') && document.querySelector('.page.active').id, scores: [...tt10Scores.values()].map(e => e.score) };
  });
  ok('3 جولات: كل جولة تنتهي بشاشة نهاية الجولة ثم النتيجة النهائية', r.log.every(x => x.status === 'roundover' && x.page === 'pg-tt10-roundwinner') && r.final === 'finished', r);
  ok('لا أخطاء JS أثناء الدورة الكاملة', pg._errs.filter(e => !/webgl/i.test(e)).length === 0, pg._errs);
  await ctx.close();
}
console.log(`\nنجح ${pass} / فشل ${fail}`); await b.close(); process.exit(fail ? 1 : 0);
