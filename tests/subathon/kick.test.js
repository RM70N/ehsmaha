'use strict';
// «اطرد لاعب»: المتحكم يكتب الأمر فتظهر قائمة بأرقام كبيرة؛ يكتب رقماً فيُطرد اللاعب وتُغلق القائمة ويستمر الراوند.
const fs = require('fs'); const H = require('../bridge/harness');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const U = 'kickstreamer';
const OUT = process.env.KICK_OUT || '/tmp/subathon-kick.json'; const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
(async () => {
  await H.serveSite(); const b = await H.launchBrowser(); let page = await H.newPage(b, { query: '?debug=0' }); await page.setViewportSize({ width: 1280, height: 800 }); await sleep(2500);
  await H.linkAccount(page, U); await sleep(500);
  const setup = () => page.evaluate(() => { const S = Subathon._store(); if (!S.get('tiktok:viewer1')) S.add({ platform: 'tiktok', username: 'viewer1', verified: true }); const s = Subathon._session(); if (!s.active) { s.cfg.minGapMs = 20; s.cfg.rateMax = 80; s.cfg.dedupeMs = 50; s.activate({ mode: 'leader' }); } });
  await setup();
  const say = async (viewer, text) => { await H.ctl(H.PRIMARY, { cmd: 'chat', user: U, viewer, text, identity: { isFollowerOfAnchor: true } }); await sleep(380); };
  const cards = await page.evaluate(() => SubathonEngine.games()); const specs = await page.evaluate(() => window.EHS_OPS_GAMES);
  const isIn = (e, uid) => page.evaluate(([e, uid]) => { try { return !!(0, eval)('(function(uid){return ' + e + '})')(uid); } catch (x) { return false; } }, [e, uid]);
  const waitIn = async (e, uid, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await isIn(e, uid)) return true; await sleep(250); } return false; };
  const rows = [];
  for (const sp of specs) {
    const card = cards.find((c) => c.tag === sp.tag); if (!card || (ONLY.length && !ONLY.includes(sp.tag))) continue;
    const row = { tag: sp.tag, name: card.name, joined: 0, listShown: null, numbers: 0, kickedOk: null, othersKept: null, overlayClosed: null, pageSame: null, note: '' };
    try {
      await page.evaluate(() => { try { show('home'); } catch (e) {} homeClearGameListeners(); }); await sleep(250);
      const heavy = !!(sp.lab && sp.lab.heavy); let kw = (sp.lab && sp.lab.kwVal) || sp.kw || 'ادخل'; if (sp.tag === 'battery') kw = 'اشحن';
      await say('viewer1', 'افتح ' + card.name); await say('viewer1', 'ابدأ'); await sleep(heavy ? 3500 : 1200);
      if (sp.lab && sp.lab.kwVar) { const v = await page.evaluate((n) => { try { return (0, eval)(n); } catch (e) { return null; } }, sp.lab.kwVar); if (v && typeof v === 'string') kw = v; }
      const ids = ['kp1', 'kp2', 'kp3']; const isInE = sp.lab.isIn;
      for (let i = 0; i < ids.length; i++) { await say(ids[i], sp.tag === 'tug' ? (i % 2 ? 'ازرق' : 'احمر') : kw); }
      for (const id of ids) if (await waitIn(isInE, 'tiktok:' + id, heavy ? 20000 : 6000)) row.joined++;
      if (sp.tag !== 'sniper') { await say('viewer1', 'ابدأ الراوند'); await sleep(900); }
      const pg0 = await page.evaluate(() => document.querySelector('.page.active').id);
      await say('viewer1', 'اطرد لاعب'); await sleep(500);
      const ov = await page.evaluate(() => { const o = document.getElementById('subathon-kick'); if (!o) return null; return [...o.querySelectorAll('.sk-c')].map((c) => ({ n: c.querySelector('i').innerText, name: c.querySelector('b').innerText })); });
      row.audit = await page.evaluate(() => { const a = Subathon._session().audit.filter((e) => e.cmd === 'kick').slice(-1)[0]; return a ? a.status + ':' + (a.reason || '') + ':' + (a.detail || '') : null; }); row.hasBtn = await page.evaluate(() => !!document.querySelector('.page.active .btn-kick, .page.active [onclick*="OpenKickModal"]')); row.listShown = !!ov; row.numbers = ov ? ov.length : 0; row.cardList = ov;
      if (ov && ov.length) {
        const target = ov.find((c) => /^kp\d$/.test(c.name)) || ov[0]; row.kicked = target.name;
        await say('viewer1', target.n); await sleep(600);
        row.overlayClosed = await page.evaluate(() => !document.getElementById('subathon-kick') && !document.getElementById('kick-modal-overlay')?.classList.contains('visible'));
        const gone = !(await isIn(isInE, 'tiktok:' + target.name)); const others = ids.filter((i) => i !== target.name); let kept = 0; for (const o of others) if (await isIn(isInE, 'tiktok:' + o)) kept++;
        row.kickedOk = gone; row.othersKept = kept === others.filter((o) => ov.some((c) => c.name === o) || true).length || kept >= row.joined - 1;
        row.pageSame = (await page.evaluate(() => document.querySelector('.page.active').id)) === pg0;
      }
    } catch (e) { row.note = 'استثناء: ' + e.message.slice(0, 80); try { await page.close(); } catch (x) {} page = await H.newPage(b, { query: '?debug=0' }); await sleep(2500); await H.linkAccount(page, U).catch(() => {}); await setup(); }
    rows.push(row); row.unsupported = !row.listShown && /no-kick/.test(row.audit || ''); const ok = row.unsupported || (row.listShown && row.kickedOk && row.overlayClosed && row.pageSame);
    console.log((row.unsupported ? 'NOKICK ' : ok ? 'OK   ' : 'PART ') + row.tag + ' | ' + row.name + ' | joined ' + row.joined + ' list ' + row.numbers + ' kicked ' + row.kickedOk + ' closed ' + row.overlayClosed + ' page ' + row.pageSame + ' btn ' + row.hasBtn + ' audit ' + row.audit + (row.note ? ' ' + row.note : ''));
  }
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  console.log('full ' + rows.filter((r) => r.listShown && r.kickedOk && r.overlayClosed && r.pageSame).length + '/' + rows.length + ' unsupported ' + rows.filter((r) => r.unsupported).length); await b.close(); process.exit(0);
})().catch((e) => { console.log('FATAL', e.message); process.exit(2); });
