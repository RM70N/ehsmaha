'use strict';
// زر «ابدأ الراوند» يطابق حالة اللعبة دائماً: بدء → «الراوند شغال» ، انتهاء → زر راوند جديد ، بدء جديد → «شغال» من جديد.
const fs = require('fs'); const H = require('./harness'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const U = 'rbstreamer';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
(async () => {
  await H.serveSite(); const b = await H.launchBrowser(); let page = await H.newPage(b, { query: '?debug=0' }); await page.setViewportSize({ width: 1280, height: 800 }); await sleep(2500);
  await H.linkAccount(page, U); await sleep(500);
  const specs = await page.evaluate(() => window.EHS_OPS_GAMES);
  const say = async (v, t) => { await H.ctl(H.PRIMARY, { cmd: 'chat', user: U, viewer: v, text: t, identity: { isFollowerOfAnchor: true } }); await sleep(350); };
  const snap = (st) => page.evaluate((st) => { const b = document.querySelector('.page.active [id$="btn-round"]'); let s = null; try { s = (0, eval)(st); } catch (e) {} return b ? { status: s, text: b.textContent.trim().slice(0, 28), disabled: b.disabled } : null; }, st);
  const bad = []; const rows = [];
  for (const sp of specs) {
    if (ONLY.length && !ONLY.includes(sp.tag)) continue; if (!sp.st) continue;
    const row = { tag: sp.tag, p1: null, p2: null, p3: null, p4: null };
    try {
      await page.evaluate(() => { show('home'); homeClearGameListeners(); }); await sleep(250);
      await page.evaluate(async (g) => { document.querySelector('.gcard[data-tag="' + g.tag + '"]').click(); for (const [id, v] of Object.entries(g.inputs || {})) { const el = document.getElementById(id); if (el) el.value = v; } await window[g.launch](); }, sp);
      await sleep(sp.lab && sp.lab.heavy ? 3500 : 1300);
      const kw = (sp.lab && sp.lab.kwVal) || sp.kw || 'ادخل'; for (const v of ['q1', 'q2', 'q3']) await say(v, kw);
      const hasBtn = await page.evaluate(() => !!document.querySelector('.page.active [id$="btn-round"]')); if (!hasBtn) { row.note = 'no-btn'; rows.push(row); console.log('SKIP ' + sp.tag + ' (لا زر راوند)'); continue; }
      row.p0 = await snap(sp.st); const gp = await page.evaluate(() => document.querySelector('.page.active').id.replace(/^pg-/, ''));
      await page.evaluate(() => document.querySelector('.page.active [id$="btn-round"]').click()); await sleep(1300); row.p1 = await snap(sp.st);
      const ff = sp.tag === 'main' ? 'mainForceWin' : sp.tag + 'ForceWin'; const hasFF = await page.evaluate((ff) => typeof window[ff] === 'function', ff);
      if (hasFF) { await page.evaluate((ff) => window[ff]({ uniqueId: 'tiktok:q1', nickname: 'q1' }), ff); await sleep(1800); await page.evaluate((gp) => show(gp), gp); await sleep(600); row.p2 = await snap(sp.st);
        await page.evaluate(() => { const b = document.querySelector('.page.active [id$="btn-round"]'); if (b && !b.disabled) b.click(); }); await sleep(1500); row.p3 = await snap(sp.st);
        if (row.p3 && row.p3.status === 'waiting') { for (const v of ['q1', 'q2', 'q3']) await say(v, kw); await page.evaluate(() => { const b = document.querySelector('.page.active [id$="btn-round"]'); if (b && !b.disabled) b.click(); }); await sleep(1500); row.p4 = await snap(sp.st); } }
    } catch (e) { row.note = 'استثناء: ' + e.message.slice(0, 80); try { await page.close(); } catch (x) {} page = await H.newPage(b, { query: '?debug=0' }); await sleep(2500); await H.linkAccount(page, U).catch(() => {}); }
    // اتساق: status active ⇔ نص «شغال» وزر معطّل
    const incons = [['p1', row.p1], ['p2', row.p2], ['p3', row.p3], ['p4', row.p4]].filter(([k, p]) => p && ((p.status === 'active') !== (p.disabled && /شغ[اّ]ل/.test(p.text)) && !(p.status !== 'active' && !p.disabled)));
    rows.push(row); console.log((incons.length ? 'BAD  ' : 'OK   ') + sp.tag + ' p1=' + JSON.stringify(row.p1) + ' p2=' + JSON.stringify(row.p2) + ' p3=' + JSON.stringify(row.p3) + ' p4=' + JSON.stringify(row.p4) + (row.note ? ' ' + row.note : '')); if (incons.length) bad.push(sp.tag);
  }
  console.log('inconsistent: ' + bad.join(',') + ' | total ' + rows.length); await b.close(); process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.log('FATAL', e.message); process.exit(2); });
