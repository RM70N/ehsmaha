'use strict';
// ألعاب الـiframe/الثلاثية: المتحكم يعبر شاشات الإعداد داخل الإطار بأسماء الأزرار، ثم يدخل مشاهد عادي والمتحكم كلاعبين.
const H = require('../bridge/harness'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const U = 'ifrstreamer';
const FRAME = (g, call) => `(function(){const f=document.querySelector('.page.active iframe');const w=f&&f.contentWindow;try{return JSON.stringify(${call})}catch(e){return ''}})()`;
const GAMES = [
  { tag: 'harfnajat', name: 'حرف النجاة', steps: ['ابدأ الإعداد', 'فتح غرفة الانتظار'], st: 'JSON.stringify(window.harfnajatApi().getState())' },
  { tag: 'almeezan', name: 'الميزان', steps: ['إعداد الجولة', 'فتح الانضمام'], st: FRAME('', 'w.AlmeezanGame.getState()') },
  { tag: 'wesh', name: 'وش تغيّر؟', steps: ['ابدأ', 'افتح الردهة'], st: FRAME('', 'w.WeshTaghayarGame.getState()') },
  { tag: 'hq', name: 'حلّها قبلي', steps: ['ابدأ', 'افتح الانضمام'], st: FRAME('', 'w.HallahaGame.snapshot()') },
  { tag: 'xo', name: 'إكس أو', steps: ['الإعداد', 'دخول شاشة الانتظار'], st: 'JSON.stringify(window.xoApi().getState())' },
  { tag: 'latatayeh', name: 'لا تطيّحه', steps: ['ابدأ', 'فتح الانتظار'], st: 'JSON.stringify(window.latatayehApi().getState())' },
  { tag: 'ek', name: 'اكذب عليّ', steps: ['إعداد المباراة', 'افتح قاعة الانضمام'], st: FRAME('', 'w.EkthebAlayGame.getState()') },
  { tag: 'bomb', name: 'القنبلة المتحركة', steps: [], st: 'JSON.stringify(bombApi().getState())', words: ['دخول'] }
];
(async () => {
  await H.serveSite(); const b = await H.launchBrowser(); const page = await H.newPage(b, { query: '?debug=0' }); await page.setViewportSize({ width: 1280, height: 800 }); await sleep(2500);
  await H.linkAccount(page, U); await sleep(500);
  await page.evaluate(() => { const S = Subathon._store(); S.add({ platform: 'tiktok', username: 'viewer1', verified: true }); const s = Subathon._session(); s.cfg.minGapMs = 20; s.cfg.rateMax = 80; s.cfg.dedupeMs = 50; s.activate({ mode: 'leader' }); });
  const say = async (v, t) => { await H.ctl(H.PRIMARY, { cmd: 'chat', user: U, viewer: v, text: t, identity: { isFollowerOfAnchor: true } }); await sleep(420); };
  const has = (st, id) => page.evaluate(([st, id]) => { try { const s = (0, eval)(st); return String(s).includes(id); } catch (e) { return false; } }, [st, id]);
  const res = [];
  for (const g of GAMES) {
    const r = { tag: g.tag, opened: false, steps: [], viewer: false, controller: false, word: null, startOk: null };
    await page.evaluate(() => { show('home'); homeClearGameListeners(); }); await sleep(300);
    await say('viewer1', 'افتح ' + g.name); r.opened = await page.evaluate((t) => /^pg-/.test(document.querySelector('.page.active').id) && document.querySelector('.page.active').id !== 'pg-home', g.tag);
    await say('viewer1', 'ابدأ'); await sleep(g.tag === 'bomb' ? 4500 : 3500);
    for (const s of g.steps) { await say('viewer1', s); let a; for (let i = 0; i < 12; i++) { await sleep(300); a = await page.evaluate(() => Subathon._session().audit.filter((e) => e.status === 'done' || e.status === 'failed').slice(-1)[0]); if (a && a.text === s) break; } await sleep(700); r.steps.push(s + ':' + (a && a.text === s ? a.status : 'none')); }
    for (const w of g.words || ['ادخل', 'العب', 'انا', 'دخول', 'انضم']) { await say('kv1', w); let ok = false; for (let i = 0; i < 8 && !ok; i++) { await sleep(300); ok = await has(g.st, 'kv1'); } if (ok) { r.viewer = true; r.word = w; break; } }
    if (r.viewer) { await say('viewer1', r.word); for (let i = 0; i < 8 && !r.controller; i++) { await sleep(300); r.controller = await has(g.st, 'viewer1'); } }
    res.push(r); console.log((r.opened && r.viewer && r.controller ? 'OK   ' : 'PART ') + g.tag + ' | opened ' + r.opened + ' steps ' + r.steps.join(' > ') + ' | word ' + r.word + ' viewer ' + r.viewer + ' controller ' + r.controller);
  }
  console.log('full ' + res.filter((r) => r.opened && r.viewer && r.controller).length + '/' + res.length); await b.close(); process.exit(0);
})().catch((e) => { console.log('FATAL', e.message); process.exit(2); });
