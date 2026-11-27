'use strict';
// نافذة «انتهى الوقت» بحرف النجاة (داخل iframe): هل يراها المتحكم ويضغط أزرارها بأسمائها؟
const H = require('../bridge/harness'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const U = 'tdstreamer';
(async () => {
  await H.serveSite(); const b = await H.launchBrowser(); const page = await H.newPage(b, { query: '?debug=0' }); await page.setViewportSize({ width: 430, height: 900 }); await sleep(2500);
  await H.linkAccount(page, U); await sleep(500);
  await page.evaluate(() => { const S = Subathon._store(); S.add({ platform: 'tiktok', username: 'viewer1', verified: true }); const s = Subathon._session(); s.cfg.minGapMs = 20; s.cfg.rateMax = 80; s.cfg.dedupeMs = 50; if (s.activate) s.activate(); });
  const say = async (v, t) => { await H.ctl(H.PRIMARY, { cmd: 'chat', user: U, viewer: v, text: t, identity: { isFollowerOfAnchor: true } }); await sleep(450); };
  await page.evaluate(() => { show('home'); homeClearGameListeners(); }); await sleep(300);
  await say('viewer1', 'افتح حرف النجاة'); await say('viewer1', 'ابدأ'); await sleep(3500);
  // إظهار نافذة انتهاء الوقت داخل الإطار
  const shown = await page.evaluate(() => { const f = document.querySelector('.page.active iframe'); const d = f && f.contentDocument; if (!d) return 'noframe'; const o = d.getElementById('ov-timeout'); if (!o) return 'nodlg'; window.__elim = 0; const el = d.getElementById('to-el'); el.addEventListener('click', () => { window.__elim++; }); o.classList.add('on'); return 'ok'; });
  console.log('dialog', shown);
  const reg = await page.evaluate(() => JSON.stringify(SubathonEngine.registry().map((t) => t.label)));
  console.log('registry', reg);
  await say('viewer1', 'إقصاء اللاعب'); await sleep(600);
  console.log('audit', JSON.stringify(await page.evaluate(() => Subathon._session().audit.slice(-3).map((e) => [e.status, e.reason, e.text || e.raw, e.detail]))));
  console.log('pressed إقصاء', await page.evaluate(() => window.__elim));
  // أزرار أخرى بالنافذة + عنصر div بلا onclick (مستمع JS فقط) داخل الإطار + كلام عادي لا يضغط شيئاً
  await page.evaluate(() => { const d = document.querySelector('.page.active iframe').contentDocument; window.__c = { redo: 0, cancel: 0, dv: 0, other: 0 };
    d.getElementById('to-redo').addEventListener('click', () => window.__c.redo++); d.getElementById('to-cancel').addEventListener('click', () => window.__c.cancel++);
    const dv = d.createElement('div'); dv.textContent = 'تحدي الليلة الأخيرة'; dv.style.cssText = 'position:fixed;left:10px;top:10px;width:160px;height:40px;cursor:pointer;z-index:99999;background:#333;color:#fff'; dv.addEventListener('click', () => window.__c.dv++); d.body.appendChild(dv); });
  const showDlg = () => page.evaluate(() => { document.querySelector('.page.active iframe').contentDocument.getElementById('ov-timeout').classList.add('on'); });
  await showDlg(); console.log('reg2', await page.evaluate(() => JSON.stringify(SubathonEngine.registry(true).map((t) => t.label)))); await say('viewer1', 'إعادة الدور بسبب مشكلة تقنية'); console.log('audit2', JSON.stringify(await page.evaluate(() => Subathon._session().audit.slice(-2).map((e) => [e.status, e.reason, e.text, e.detail])))); await showDlg(); await say('viewer1', 'إلغاء الدور بسبب خلل (بدون إقصاء)'); await showDlg(); await say('viewer1', 'تحدي الليلة الأخيرة'); await say('viewer1', 'السلام عليكم يا جماعة كيف الحال'); await sleep(500);
  const c = await page.evaluate(() => JSON.stringify(window.__c)); console.log('counts', c);
  const ok = JSON.parse(c); console.log(ok.redo === 1 && ok.cancel === 1 && ok.dv === 1 ? 'PASS all buttons by name' : 'FAIL');
  await b.close(); process.exit(0);
})().catch((e) => { console.log('FATAL', e.message); process.exit(2); });
