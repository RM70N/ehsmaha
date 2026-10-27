'use strict';
// حرف النجاة (harf-alnajat3d.html — لعبة مستقلة مضمّنة بإطار) داخل الموقع الحقيقي عبر جسر تيك توك المزيّف:
//   - الملف المنسوخ مطابق حرفياً للأصل (SHA-256 + الحجم) بدون أي تعديل.
//   - الكرت (تسجيل + رسم + أمر الشات) وصفحة الإعداد، وبث غير مربوط، وإطلاق اللعبة وربط الشات وحالة الاتصال.
//   - انضمام المتابعين بالكلمة (صيغ، تكرار، شرط الفولو، دفعة كبيرة)، وسير المباراة: دور ← إجابة بالشات ← حكم الستريمر ← إقصاء ← فوز رسمي.
//   - الخروج يرجع للرئيسية ويفرّغ الإطار، وبلا أخطاء JavaScript.
//   PLAYWRIGHT_PATH=... node tests/bridge/harfnajat.test.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const STREAMER = 'streamer1';
const ORIGINAL_SHA256 = '652318c06b212c43'; // بداية بصمة الملف الأصلي المرسل
const ORIGINAL_SIZE = 838112;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 600) : '')); };
const say = (viewer, text, nick, follower = true) => H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer, nickname: nick || viewer, text, identity: { isFollowerOfAnchor: follower } });
async function waitFor(page, fn, arg, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) { /* */ } await sleep(100); }
  return false;
}
const frame = (page) => page.frames().find((x) => /harf-alnajat3d\.html/.test(x.url()));
const F = (page, fn, arg) => { const f = frame(page); return f ? f.evaluate(fn, arg) : Promise.resolve(null); };
async function fwait(page, fn, arg, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await F(page, fn, arg)) return true; } catch (e) { /* */ } await sleep(100); }
  return false;
}
const state = (page) => F(page, () => window.HarfAlNajat.getState());
const clickId = (page, id) => F(page, (i) => { const b = document.getElementById(i); if (b && !b.disabled) { b.click(); return true; } return false; }, id);
const wins = (page) => page.evaluate(() => window.__wins.slice());

(async () => {
  // ===== 0) الملف مطابق حرفياً للأصل =====
  const file = fs.readFileSync(path.join(__dirname, '..', '..', 'harf-alnajat3d.html'));
  const sha = crypto.createHash('sha256').update(file).digest('hex');
  check('الملف المنسوخ مطابق للأصل بدون أي تعديل (SHA-256 + الحجم ٨٣٨٬١١٢ بايت)', sha.startsWith(ORIGINAL_SHA256) && file.length === ORIGINAL_SIZE, { sha: sha.slice(0, 16), size: file.length });

  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=0' });
  await page.setViewportSize({ width: 480, height: 300 }); // نافذة صغيرة: الرسم البرمجي ببيئة الاختبار بطيء جداً
  // بيئة الاختبار بلا بطاقة رسوم (رسم برمجي): نطلب أخف جودة من اللعبة نفسها عبر الباراميتر q=low بدل تعديل أي ملف
  await page.addInitScript(() => { const d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src'); Object.defineProperty(HTMLIFrameElement.prototype, 'src', { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, /harf-alnajat3d/.test(String(v)) ? v + '&q=low' : v); } }); });
  await H.linkAccount(page, STREAMER);
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.remove(); });
  await page.evaluate(() => { window.__wins = []; const o = window.recordWin; window.recordWin = function (u, g) { window.__wins.push({ id: u && u.uniqueId, g }); return o.apply(this, arguments); }; });

  // ===== 1) الكرت والتسجيل =====
  await page.evaluate(() => show('home')); await sleep(600);
  const reg = await page.evaluate(() => {
    const card = document.querySelector('.gcard[data-tag="harfnajat"]');
    const lib = [...document.querySelectorAll('#hlob-grid .hlob-card')].find((n) => n.getAttribute('data-tag') === 'harfnajat');
    return {
      gcard: !!card, name: card && card.querySelector('.gcard-name').textContent, num: card && card.querySelector('.gcard-num').textContent,
      lib: !!lib, art: !!(lib && lib.querySelector('svg')), artRich: !!(lib && lib.querySelectorAll('svg path').length > 8 && lib.querySelectorAll('svg circle').length > 8),
      cmd: lib ? lib.innerText.replace(/\s+/g, ' ') : '', reg: !!TST_GAME_REGISTRY['harfnajat'],
      fns: ['launchHarfNajat', 'goSetupHarfNajat', 'ehsHnjGoHome', 'ehsHnjOnShow'].filter((f) => typeof window[f] !== 'function'),
      others: ['xo', 'tug', 'bomb', 'roulette3d', 'wesh', 'hq', 'cannon', 'latatayeh'].filter((t) => !document.querySelector('.gcard[data-tag="' + t + '"]')),
    };
  });
  check('الكرت مسجّل بالمكتبة باسم «حرف النجاة» ورسم غني (بركان + حرف + فئات) وأمر الشات، ودوالها معرّفة، وبقية الألعاب سليمة', reg.gcard && reg.name === 'حرف النجاة' && reg.lib && reg.art && reg.artRich && /إجابة تبدأ بالحرف/.test(reg.cmd) && reg.reg && reg.fns.length === 0 && reg.others.length === 0, reg);
  await page.evaluate(() => homeApplyFilter('3d')); await sleep(300);
  const f3d = await page.evaluate(() => [...document.querySelectorAll('#hlob-grid .hlob-card')].map((c) => c.dataset.tag));
  check('فلتر ثلاثية الأبعاد يعرض «حرف النجاة»', f3d.includes('harfnajat') && f3d.includes('latatayeh') && f3d.includes('bomb'), f3d);
  await page.evaluate(() => homeApplyFilter('all')); await sleep(200);

  // ===== 2) صفحة الإعداد =====
  await page.evaluate(() => goSetupHarfNajat()); await sleep(500);
  const su = await page.evaluate(() => ({ active: document.querySelector('.page.active').id, hero: !!document.querySelector('#hnj-hero svg'), txt: document.getElementById('pg-setup-harfnajat').innerText, btn: !!document.getElementById('btn-harfnajat-launch') }));
  check('صفحة الإعداد: صورة القمة البركانية + شرح التشغيل + كلمة «أنا» + حكم الستريمر + زر ابدأ اللعبة', su.active === 'pg-setup-harfnajat' && su.hero && su.btn && /أنا/.test(su.txt) && /موافقة/.test(su.txt) && /اللافا/.test(su.txt), { active: su.active, hero: su.hero });

  // ===== 3) بث غير مربوط =====
  await page.evaluate(() => { localStorage.removeItem(STREAMER_USER_STORAGE_KEY); });
  const unl = await page.evaluate(() => { launchHarfNajat(); return { t: document.getElementById('harfnajat-status').textContent, a: document.querySelector('.page.active').id }; });
  check('بث غير مربوط: رسالة «اربط بثك» ولا تفتح اللعبة', /اربط بثك/.test(unl.t) && unl.a === 'pg-setup-harfnajat', unl);
  await page.evaluate((u) => localStorage.setItem(STREAMER_USER_STORAGE_KEY, u), STREAMER);
  await page.evaluate(() => followGateSetRequired(false));

  // ===== 4) الإطلاق =====
  await page.evaluate(() => { goSetupHarfNajat(); launchHarfNajat(); });
  const ready = await waitFor(page, () => { const a = window.harfnajatApi && window.harfnajatApi(); return !!a && document.querySelector('.page.active').id === 'pg-harfnajat'; }, null, 120000);
  check('الإطلاق: فتح صفحة اللعبة وجهوزية واجهة HarfAlNajat داخل الإطار', ready);
  const L = await page.evaluate(() => ({ listeners: Object.keys(homeGameListeners).filter((t) => t !== 'bridge-fate'), user: document.getElementById('harfnajat-live-user').textContent, src: document.getElementById('harfnajat-frame').src }));
  check('معالج شات واحد مسجّل للعبة، ويوزر الستريمر ظاهر، والإطار يحمّل الملف المنسوخ', L.listeners.join() === 'harfnajat' && L.user === '@' + STREAMER && /harf-alnajat3d\.html/.test(L.src), L);
  check('شاشة اللعبة الأولى (حرف النجاة) وزر «ابدأ الإعداد» بعد زوال شاشة التحميل', await fwait(page, () => { const ld = document.getElementById('hn-load'); const b = document.getElementById('b-start'); return (!ld || ld.hidden || getComputedStyle(ld).display === 'none' || getComputedStyle(ld).opacity === '0') && !!b && b.offsetParent !== null; }, null, 120000));
  check('حالة الاتصال دُفعت للعبة (link = true) من الموقع', await waitFor(page, () => window.harfnajatApi().getState().link === true, null, 8000));

  // ===== 5) الإعداد داخل اللعبة وفتح الانتظار =====
  await clickId(page, 'b-start'); await sleep(500);
  check('إعداد المباراة داخل اللعبة: كلمة الانضمام الافتراضية «أنا»', await F(page, () => document.getElementById('f-join').value === 'أنا'));
  await clickId(page, 'b-open'); await sleep(600);
  const lobby = await state(page);
  check('الانتظار مفتوح (lobby) ولا لاعبين بعد', lobby && lobby.phase === 'lobby' && lobby.players.length === 0, lobby);

  // ===== 6) الانضمام بالشات =====
  for (const [i, t] of ['أنا', 'أنا😍', '‏أنا', 'أنا!!', 'أَنَا', ' أنا '].entries()) await say('hn_form_' + i, t);
  await say('hn_other', 'مرحبا'); await say('hn_a', 'أنا'); await say('hn_b', 'أنا'); await say('hn_c', 'أنا');
  for (let i = 0; i < 4; i++) await say('hn_a', 'أنا'); // تكرار
  await waitFor(page, () => window.harfnajatApi().getState().players.length >= 9, null, 30000); await sleep(800);
  let s = await state(page);
  check('الانضمام بصيغ الكلمة (إيموجي/علامات/تشكيل/رمز مخفي/مسافات) وبلا تكرار، وغير الكلمة لا ينضم (٩ لاعبين)', s.players.length === 9 && !s.players.some((p) => p.userId === 'tiktok:hn_other') && new Set(s.players.map((p) => p.userId)).size === 9, { n: s.players.length, ids: s.players.map((p) => p.userId) });
  check('شارة الاتصال داخل اللعبة تعرض «متصل بالبث» وعدد الرسائل (بث حقيقي لا تجريبي)', await F(page, () => /متصل بالبث/.test((document.getElementById('c-link-t') || {}).textContent || '')), await F(page, () => (document.getElementById('c-link-t') || {}).textContent));

  // شرط الفولو
  await page.evaluate(() => followGateSetRequired(true));
  await say('hn_nf', 'أنا', 'hn_nf', false); await sleep(2500);
  s = await state(page);
  check('شرط الفولو مفعّل: غير المتابع لا ينضم', !s.players.some((p) => p.userId === 'tiktok:hn_nf'), s.players.length);
  await say('hn_fol', 'أنا', 'hn_fol', true); await waitFor(page, () => window.harfnajatApi().getState().players.some((p) => p.userId === 'tiktok:hn_fol'), null, 15000);
  s = await state(page);
  check('شرط الفولو مفعّل: المتابع ينضم', s.players.some((p) => p.userId === 'tiktok:hn_fol'), s.players.length);
  await page.evaluate(() => followGateSetRequired(false));
  await say('hn_nf', 'أنا', 'hn_nf', false); await waitFor(page, () => window.harfnajatApi().getState().players.some((p) => p.userId === 'tiktok:hn_nf'), null, 15000);
  s = await state(page);
  check('شرط الفولو مطفي: غير المتابع ينضم', s.players.some((p) => p.userId === 'tiktok:hn_nf'), s.players.length);

  // دفعة كبيرة من المتابعين
  const before = s.players.length;
  await H.ctl(H.PRIMARY, { cmd: 'burst', user: STREAMER, count: 60, prefix: 'hn_p', text: 'أنا', identity: { isFollowerOfAnchor: true }, perMs: 40 });
  await waitFor(page, (b) => window.harfnajatApi().getState().players.length >= b + 60, before, 40000);
  s = await state(page);
  check('دفعة ٦٠ متابعاً بالكلمة: دخلوا كلهم', s.players.length === before + 60, { before, now: s.players.length });

  // ===== 7) مباراة صغيرة: نُبقي ٣ لاعبين فقط (الإزالة في غرفة الانتظار متاحة) =====
  const keep = ['tiktok:hn_a', 'tiktok:hn_b', 'tiktok:hn_c'];
  await page.evaluate((k) => { const a = window.harfnajatApi(); a.getState().players.filter((p) => !k.includes(p.userId)).forEach((p) => a.removeParticipant(p.userId)); }, keep);
  await sleep(500);
  s = await state(page);
  check('إبقاء ٣ لاعبين فقط لمباراة الاختبار', s.players.length === 3 && keep.every((k) => s.players.some((p) => p.userId === k)), s.players.map((p) => p.userId));
  await F(page, () => { const t = document.getElementById('t-fast'); if (t) t.click(); }); // تسريع المؤقتات
  check('زر «ابدأ المباراة» يعمل ويبدأ سحب الدور', (await clickId(page, 'b-go')) && await fwait(page, () => ['picking', 'letter', 'ready', 'answer'].includes(window.HarfAlNajat.getState().phase), null, 120000));
  check('الدور يصل لمرحلة الإجابة (answer) مع فئة وحرف', await fwait(page, () => { const s = window.HarfAlNajat.getState(); return s.phase === 'answer' && s.turn && s.turn.letter && s.turn.category; }, null, 300000));
  s = await state(page);
  const t1 = s.turn;
  const cur1 = t1.userId.replace('tiktok:', '');
  const other1 = keep.map((k) => k.replace('tiktok:', '')).find((k) => k !== cur1);
  await say(other1, 'جواب من غير صاحب الدور'); await sleep(900);
  s = await state(page);
  check('إجابة من غير صاحب الدور تُتجاهل (لا إجابة مسجّلة، يبقى الدور)', s.phase === 'answer' && !s.turn.answer && s.turn.userId === t1.userId, s.turn);
  await say(cur1, 'إجابة صاحب الدور'); await waitFor(page, () => { const s = window.harfnajatApi().getState(); return s.phase !== 'answer' || (s.turn && s.turn.answer); }, null, 60000);
  s = await state(page);
  check('إجابة صاحب الدور بالشات تصل للعبة وتظهر شاشة حكم الستريمر', s.phase === 'judge' || s.phase === 'verdict' || (s.turn && s.turn.answer === 'إجابة صاحب الدور'), { phase: s.phase, turn: s.turn });
  // الحكم: موافقة
  await F(page, () => window.HarfAlNajat._ctl && window.HarfAlNajat._ctl.judge('accept'));
  check('حكم الستريمر «موافقة»: يعدّ مقبولة وينتقل لدور تالٍ', await fwait(page, () => { const s = window.HarfAlNajat.getState(); return s.players.some((p) => p.accepted >= 1) || s.phase === 'picking' || s.phase === 'answer'; }, null, 240000));
  // دور ثانٍ: رفض ← إقصاء (لافا)
  await fwait(page, () => { const s = window.HarfAlNajat.getState(); return s.phase === 'answer' && s.turn && !s.turn.answer; }, null, 300000);
  s = await state(page);
  const cur2 = s.turn.userId;
  await say(cur2.replace('tiktok:', ''), 'جواب خاطئ'); await sleep(1000);
  await F(page, () => window.HarfAlNajat._ctl && window.HarfAlNajat._ctl.judge('reject'));
  check('حكم «رفض»: اللاعب يُقصى (status = out)', await fwait(page, (u) => window.HarfAlNajat.getState().players.some((p) => p.userId === u && p.status === 'out'), cur2, 300000));
  // دور ثالث: رفض ← يبقى لاعب واحد ويفوز
  await fwait(page, () => { const s = window.HarfAlNajat.getState(); return (s.phase === 'answer' && s.turn && !s.turn.answer) || s.phase === 'win' || s.phase === 'win-walk'; }, null, 300000);
  s = await state(page);
  if (s.phase === 'answer') {
    const cur3 = s.turn.userId;
    await say(cur3.replace('tiktok:', ''), 'جواب ثالث'); await sleep(1000);
    await F(page, () => window.HarfAlNajat._ctl && window.HarfAlNajat._ctl.judge('reject'));
  }
  check('آخر لاعب باقٍ يفوز (مرحلة win)', await fwait(page, () => window.HarfAlNajat.getState().phase === 'win', null, 360000), (await state(page)).phase);
  s = await state(page);
  await sleep(1500);
  const w = await wins(page);
  check('الفوز سُجّل رسمياً مرة وحدة باسم اللعبة للفائز الحقيقي (بلا لاعبي المحاكاة)', w.length === 1 && w[0].g === 'حرف النجاة' && w[0].id === s.winner && keep.includes(w[0].id), { w, winner: s.winner });

  // ===== 8) الخروج =====
  check('لا أخطاء JS بالصفحة والإطار', page._errors.length === 0, page._errors.slice(0, 3));
  await page.evaluate(() => ehsHnjGoHome()); await sleep(600);
  const ex = await page.evaluate(() => ({ active: document.querySelector('.page.active').id, src: document.getElementById('harfnajat-frame').getAttribute('src'), listeners: Object.keys(homeGameListeners).filter((t) => t !== 'bridge-fate') }));
  check('الخروج: يرجع للرئيسية ويفرّغ الإطار ويفكّ معالج الشات', ex.active === 'pg-home' && /about:blank/.test(ex.src || '') && ex.listeners.length === 0, ex);

  await browser.close();
  const pass = results.filter(Boolean).length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
