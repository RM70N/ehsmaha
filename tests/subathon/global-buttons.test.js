'use strict';
// أي زر ظاهر بالموقع (شريط علوي/قوائم/أزرار عائمة/نافذة/إطار) يُضغط بكتابة اسمه، حتى لو خارج الصفحة الحالية.
const H = require('../bridge/harness'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const U = 'gbstreamer';
(async () => {
  await H.serveSite(); const b = await H.launchBrowser(); const page = await H.newPage(b, { query: '?debug=0' }); await page.setViewportSize({ width: 1280, height: 800 }); await sleep(2500);
  await H.linkAccount(page, U); await sleep(500);
  await page.evaluate(() => { const S = Subathon._store(); S.add({ platform: 'tiktok', username: 'viewer1', verified: true }); const s = Subathon._session(); s.cfg.minGapMs = 20; s.cfg.rateMax = 80; s.cfg.dedupeMs = 50; if (s.activate) s.activate(); });
  const say = async (v, t) => { await H.ctl(H.PRIMARY, { cmd: 'chat', user: U, viewer: v, text: t, identity: { isFollowerOfAnchor: true } }); await sleep(500); };
  const page_ = () => page.evaluate(() => document.querySelector('.page.active').id);
  let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
  // 1) افتح لعبة ثم اضغط زراً من الشريط العلوي/الخارجي بالاسم
  await say('viewer1', 'افتح الروليت'); await sleep(800);
  const inGame = await page_(); ok(inGame !== 'pg-home', 'فتح لعبة: ' + inGame);
  const gl = await page.evaluate(() => JSON.stringify({ page: SubathonEngine.registry(false).map((t) => t.label), glob: SubathonEngine.registry(true).map((t) => t.label) }));
  const { page: pl, glob } = JSON.parse(gl); const extra = glob.filter((l) => !pl.includes(l));
  console.log('extra global labels:', extra.slice(0, 12).join(' | '));
  ok(extra.length > 0, 'السجل العام فيه أزرار خارج الصفحة الحالية (' + extra.length + ')');
  // 2) نضغط أول زر عام فريد خارج الصفحة (ليس ممنوعاً) ونتحقق أن الضغط وصل (نتتبع click)
  const target = extra.find((l) => l && l.length >= 3 && !/(الخروج|حذف)/.test(l));
  if (target) {
    await page.evaluate((t) => { window.__gb = 0; const c = SubathonEngine.registry; document.addEventListener('click', () => { window.__gb++; }, true); }, target);
    await say('viewer1', target); await sleep(700);
    const n = await page.evaluate(() => window.__gb); ok(n >= 1, 'ضغط «' + target + '» بالاسم من خارج الصفحة (click=' + n + ')');
  }
  // 3) الأمان: ما زال ممنوعاً الدفع/الحساب/المالك
  const blocked = await page.evaluate(() => SubathonEngine.registry(true).map((t) => t.label).filter((l) => /(مالك|owner|الدفع|تسجيل الخروج|حذف الحساب)/i.test(l)));
  ok(blocked.length === 0, 'أزرار المالك/الدفع/الخروج/حذف الحساب غير موجودة بالسجل (' + blocked.join(',') + ')');
  console.log(pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FATAL', e.message); process.exit(2); });
