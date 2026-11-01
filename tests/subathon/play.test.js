'use strict';
// لعب فعلي: المتحكم يفتح اللعبة ويبدأها بالتعليقات، ثم يدخل مشاهد عادي والمتحكم نفسه كلاعبين بكلمة الدخول،
// ثم المتحكم يبدأ الراوند. التحقق بمنطق اللعبة نفسه (isIn من سجل ops) لا بالمظهر.
const fs = require('fs'); const H = require('../bridge/harness');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const U = 'playstreamer';
const OUT = process.env.PLAY_OUT || '/tmp/subathon-play.json'; const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
(async () => {
  await H.serveSite(); const b = await H.launchBrowser(); let page = await H.newPage(b, { query: '?debug=0' }); await page.setViewportSize({ width: 1280, height: 800 }); await sleep(2500);
  await H.linkAccount(page, U); await sleep(500);
  const setup = () => page.evaluate(() => { const S = Subathon._store(); if (!S.get('tiktok:viewer1')) S.add({ platform: 'tiktok', username: 'viewer1', verified: true }); const s = Subathon._session(); if (!s.active) { s.cfg.minGapMs = 20; s.cfg.rateMax = 50; s.cfg.dedupeMs = 50; s.activate({ mode: 'leader' }); } });
  await setup();
  const say = async (viewer, text) => { await H.ctl(H.PRIMARY, { cmd: 'chat', user: U, viewer, text, identity: { isFollowerOfAnchor: true } }); await sleep(380); };
  const cards = await page.evaluate(() => SubathonEngine.games()); const specs = await page.evaluate(() => window.EHS_OPS_GAMES);
  const isIn = (e, uid) => page.evaluate(([e, uid]) => { try { return !!(0, eval)('(function(uid){return ' + e + '})')(uid); } catch (x) { return false; } }, [e, uid]);
  const waitIn = async (e, uid, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await isIn(e, uid)) return true; await sleep(250); } return false; };
  const rows = [];
  for (const sp of specs) {
    const card = cards.find((c) => c.tag === sp.tag); if (!card) continue; if (ONLY.length && !ONLY.includes(sp.tag)) continue;
    const row = { tag: sp.tag, name: card.name, opened: false, started: false, viewerJoined: false, controllerJoined: false, roundStarted: null, note: '' };
    try {
      await page.evaluate(() => { try { show('home'); } catch (e) {} homeClearGameListeners(); }); await sleep(250);
      const heavy = !!(sp.lab && sp.lab.heavy); const kw = (sp.lab && sp.lab.kwVal) || sp.kw || 'ادخل';
      await say('viewer1', 'افتح ' + card.name); row.opened = await page.evaluate(() => /^pg-setup/.test(document.querySelector('.page.active').id) || document.querySelector('.page.active').id !== 'pg-home');
      await say('viewer1', 'ابدأ'); await sleep(heavy ? 3500 : 1200);
      row.started = await page.evaluate(() => Object.keys(homeGameListeners || {}).length > 0 || !/^pg-setup/.test(document.querySelector('.page.active').id));
      const isInE = sp.lab.isIn; const wait = heavy ? 30000 : 7000;
      await say('p_viewer', kw); row.viewerJoined = await waitIn(isInE, 'tiktok:p_viewer', wait);
      await say('viewer1', kw); row.controllerJoined = await waitIn(isInE, 'tiktok:viewer1', wait);
      const before = await page.evaluate(() => Subathon._session().stats().ok);
      await say('viewer1', 'ابدأ الراوند'); await sleep(900);
      const last = await page.evaluate(() => Subathon._session().audit.filter((e) => e.status === 'done' || e.status === 'failed').slice(-1)[0] || null);
      row.roundStarted = !!(last && last.status === 'done' && last.cmd === 'startRound'); row.roundDetail = last && (last.detail || last.reason);
    } catch (e) { row.note = 'استثناء: ' + e.message.slice(0, 80); try { await page.close(); } catch (x) {} page = await H.newPage(b, { query: '?debug=0' }); await sleep(2500); await H.linkAccount(page, U).catch(() => {}); await setup(); }
    rows.push(row); const ok = row.opened && row.started && row.viewerJoined && row.controllerJoined;
    console.log((ok ? 'OK   ' : 'PART ') + row.tag + ' | ' + row.name + ' | open ' + +row.opened + ' start ' + +row.started + ' viewer ' + +row.viewerJoined + ' ctl ' + +row.controllerJoined + ' round ' + row.roundStarted + (row.roundDetail ? ' (' + row.roundDetail + ')' : '') + (row.note ? ' ' + row.note : ''));
  }
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  const full = rows.filter((r) => r.opened && r.started && r.viewerJoined && r.controllerJoined).length;
  console.log('full ' + full + '/' + rows.length + ' roundStarted ' + rows.filter((r) => r.roundStarted).length); await b.close(); process.exit(0);
})().catch((e) => { console.log('FATAL', e.message); process.exit(2); });
