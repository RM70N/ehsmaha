/* مختبر الألعاب: يشغّل نسخة الموقع الحقيقية (منطق الألعاب الفعلي) داخل iframe معزول (index.html?opslab=1):
 * التخزين في الذاكرة، كل كتابات Firebase والطلبات غير GET محجوبة ومُسجَّلة، والمقابس صورية — لا بث ولا هدايا حقيقية.
 * يُحقن لاعبون افتراضيون بنفس مسار أحداث الشات الحقيقي (homeDispatchToGameListeners) ثم تُنفَّذ السيناريوهات.
 * النتائج حقيقية: كل سيناريو إما نجح بدليل، أو فشل بتفصيل، أو «تخطّي» مع سببه — ولا نسبة نجاح إلا من المنفَّذ فعلاً. */
(function () {
  'use strict';
  const { esc, icon, fmt, $, $$ } = UI; const O = window.Ops; const L = Studio.live;
  const GIFT_FN = { sniper: 'handleSniperTikTokEvent', rou: 'handleRouTikTokEvent', bomb: 'handleBombTikTokEvent', box: 'handleBoxTikTokEvent', ll: 'handleLLTikTokEvent', cw: 'cwHandleEvent', findball: 'findballHandleEvent', chairs: 'chairsHandleEvent' };
  const SCEN = [
    ['join', 'دخول اللاعبين'], ['dup', 'منع تكرار المستخدم'], ['start', 'بدء اللعبة'], ['late-new', 'لاعب متأخر جديد'], ['late-excl', 'منع عودة المستبعد'],
    ['reconnect', 'إعادة الاتصال'], ['gift', 'هدايا TikTok'], ['end', 'انتهاء الراوند']
  ];
  const Z = { sel: null, last: {}, ready: false, running: null, q: '' };
  const games = () => { try { return (O.host.EHS_OPS_GAMES || []).slice(); } catch (e) { return []; } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, ms, step) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) {} await sleep(step || 80); } return false; }
  const supports = (g) => !!(g.lab && g.lab.isIn && g.lab.start && g.launch);
  const kind = (g) => (g.lab && g.lab.kind === 'native' ? 'لعبة بواجهة مستقلة' : 'لعبة مشاركين بالشات');

  /* =============== المشغّل =============== */
  async function run(g, opt, ui) {
    const T0 = Date.now(); const rows = []; const errors = []; const tag = g.tag; const lab = g.lab || {};
    const mark = (id, name, status, detail, ms) => { const r = { id, name, status, detail: String(detail == null ? '' : detail).slice(0, 400), ms: ms || 0 }; rows.push(r); ui.row(r); return r; };
    const log = (m) => ui.log(m);
    const frame = ui.frame; let w = null;
    try {
      frame.src = '/index.html?opslab=1&debug=0';
      const loaded = await waitFor(() => { try { w = frame.contentWindow; return w && w.document && w.document.readyState === 'complete' && typeof w.homeDispatchToGameListeners === 'function' && typeof w[g.launch] === 'function'; } catch (e) { return false; } }, 60000, 150);
      if (!loaded) { mark('boot', 'تحميل بيئة الاختبار', 'fail', 'لم تكتمل الصفحة المعزولة أو لم تُعرَّف دالة التشغيل ' + g.launch); return finish(); }
      w.confirm = () => true; w.alert = () => {}; w.prompt = () => '';
      w.addEventListener('error', (e) => errors.push(String(e.message || e).slice(0, 200))); w.addEventListener('unhandledrejection', (e) => errors.push('رفض غير معالج: ' + String(e.reason && e.reason.message || e.reason).slice(0, 160)));
      const lg = w.__opsLab; if (!lg || !w.EhsOps || !w.EhsOps.lab) { mark('iso', 'التحقق من عزل البيئة', 'fail', 'وضع المختبر غير مفعّل داخل الإطار — أُوقف الاختبار حفاظاً على بيانات الإنتاج'); return finish(); }
      mark('iso', 'التحقق من عزل البيئة', 'pass', 'التخزين معزول، الكتابات والمقابس محجوبة');
      await sleep(600);
      // اتصال بث صوري + إعدادات المشغّل
      w.eval(`(function(){ try{ localStorage.setItem(STREAMER_USER_STORAGE_KEY,'labstreamer'); localStorage.setItem(HOME_CONNECTED_PLATFORM_KEY,'tiktok'); }catch(e){} homeConnections.tiktok={ws:{readyState:1,close(){},send(){}},attempts:0,timer:null,username:'labstreamer'}; try{homeConnSetState('tiktok','connected')}catch(e){} try{goHome()}catch(e){} })()`);
      await sleep(250);
      const N = Math.max(1, Math.min(200, opt.players | 0)); const cap = lab.cap ? lab.cap[1] : null; const expect = cap ? Math.min(N, cap) : N;
      const inputs = Object.assign({}, g.inputs || {}); if (lab.cap) inputs[lab.cap[0]] = String(lab.cap[1]);
      Object.keys(inputs).forEach((id) => { const el = w.document.getElementById(id); if (el) el.value = inputs[id]; });
      if (g.pre) w.eval(g.pre);
      if (tag === 'gw') { const el = w.document.getElementById('gw-inp-word'); if (el) el.value = 'مختبر' + Math.floor(Math.random() * 9999); }
      let launchErr = null; try { await w[g.launch](); } catch (e) { launchErr = e.message; }
      const listening = await waitFor(() => w.eval('!!homeGameListeners[' + JSON.stringify(tag) + ']'), lab.heavy ? 60000 : 12000);
      if (launchErr || !listening) { mark('launch', 'تشغيل اللعبة', 'fail', launchErr || (w.eval("(function(){var e=document.querySelector('.status-msg.err');return e?e.textContent.trim():''})()") || 'لم يُسجَّل مستمع أحداث للعبة'), Date.now() - T0); return finish(); }
      if (lab.heavy) await sleep(1500);
      const kw = lab.kwVal || (lab.noKw ? 'مرحبا' : (g.kw || (lab.kwVar ? w.eval(lab.kwVar) : '')));
      const isInF = w.eval('(function(uid){ try { return !!(' + lab.isIn + ') } catch(e) { return false } })');
      const isIn = (id) => isInF('tiktok:' + id);
      const sizeNow = () => { if (!g.pmap) return null; try { const m = w.eval(g.pmap); return m && (m.size != null ? m.size : Object.keys(m).length); } catch (e) { return null; } };
      const say = (id, text) => w.homeDispatchToGameListeners({ messages: [{ type: 'WebcastChatMessage', comment: text, user: { uniqueId: 'tiktok:' + id, nickname: id, profilePictureUrl: '', followRole: 1, isFollower: true, followKnown: true, followInfo: { followStatus: 1 } } }], sourcePlatform: 'tiktok' });
      const ids = Array.from({ length: expect }, (_, i) => 'lab' + tag.replace(/[^a-z0-9]/g, '') + '_' + i);
      const want = (id) => opt.scen.includes(id);
      const SKN = Object.fromEntries(SCEN);
      const sk = (id) => { if (lab.skip && lab.skip[id] && opt.scen.includes(id)) { mark(id, SKN[id], 'skip', lab.skip[id]); return true; } return false; };
      let started = false;

      /* join */
      const noPre = lab.n === 0;
      if (want('join') && noPre) mark('join', 'دخول اللاعبين', 'skip', 'هذه اللعبة لا تسجّل مشاركين قبل بدء الجولة (يشاركون بالشات أثناء اللعب)');
      else if (want('join')) {
        const t = Date.now(); let thrown = null;
        try { for (let i = 0; i < ids.length; i++) { say(ids[i], kw); if (i % 10 === 9) await sleep(25); } } catch (e) { thrown = e.message; }
        const all = await waitFor(() => ids.every(isIn) || sizeNow() === expect, 8000 + N * 40);
        const got = Math.max(ids.filter(isIn).length, sizeNow() || 0);
        mark('join', 'دخول اللاعبين', all && !thrown ? 'pass' : 'fail', all ? `دخل ${got} من ${expect}${cap && N > cap ? ' (حد اللعبة ' + cap + ')' : ''}` : `دخل ${got} فقط من ${expect}${thrown ? ' — ' + thrown : ''}`, Date.now() - t);
        if (lab.afterJoin) { for (let i = 0; i < ids.length; i++) say(ids[i], String(3 + (i % 40))); await sleep(300); }
      }
      /* dup */
      if (want('dup')) {
        const t = Date.now(); const before = sizeNow();
        if (noPre) mark('dup', 'منع تكرار المستخدم', 'skip', 'لا مشاركين مسجَّلين مسبقاً في هذه اللعبة');
        else if (before == null) mark('dup', 'منع تكرار المستخدم', 'skip', 'اللعبة بلا خريطة مشاركين قابلة للعدّ من الخارج');
        else { for (let i = 0; i < Math.min(3, ids.length); i++) say(ids[i], kw); await sleep(500); const after = sizeNow(); mark('dup', 'منع تكرار المستخدم', after === before ? 'pass' : 'fail', `العدد قبل ${before} وبعد إعادة كتابة الكلمة ${after}`, Date.now() - t); }
      }
      /* start */
      if (sk('start')) { /* مُتخطّى */ }
      else if (want('start')) {
        const t = Date.now(); let err = null; try { w.eval(lab.start); } catch (e) { err = e.message; }
        const open = await waitFor(() => { try { w.eval('__lateJoin.tick()'); return !!w.eval('__lateJoin.state(' + JSON.stringify(tag) + ').open'); } catch (e) { return false; } }, lab.heavy ? 60000 : 15000);
        started = open; mark('start', 'بدء اللعبة', open && !err ? 'pass' : 'fail', open ? 'بدأ الراوند والتُقطت بدايته (نظام الجولات)' : (err || 'لم تنتقل اللعبة لحالة الجولة'), Date.now() - t);
      } else if (!(lab.skip && lab.skip.start)) { try { w.eval(lab.start); started = await waitFor(() => { w.eval('__lateJoin.tick()'); return !!w.eval('__lateJoin.state(' + JSON.stringify(tag) + ').open'); }, 15000); } catch (e) {} }
      /* late */
      const skLN = sk('late-new'), skLE = sk('late-excl');
      const needLate = (want('late-new') && !skLN) || (want('late-excl') && !skLE);
      let ljOpen = false;
      if (needLate) {
        if (lab.lateStaged) { if (want('late-new') && !skLN) mark('late-new', 'لاعب متأخر جديد', 'skip', 'القبول المتأخر مشروط بمرحلة محددة داخل هذه اللعبة ولا يُختبر آلياً بعد'); if (want('late-excl') && !skLE) mark('late-excl', 'منع عودة المستبعد', 'skip', 'القبول المتأخر مشروط بمرحلة محددة داخل هذه اللعبة'); }
        else if (!started) { if (want('late-new') && !skLN) mark('late-new', 'لاعب متأخر جديد', 'skip', 'لم يبدأ الراوند'); if (want('late-excl') && !skLE) mark('late-excl', 'منع عودة المستبعد', 'skip', 'لم يبدأ الراوند'); }
        else {
          const btn = lab.openBtn ? null : w.document.getElementById('lj-btn');
          if (btn) { btn.click(); await sleep(800); ljOpen = true; }
          else if (lab.openBtn) { try { const b = w.eval(lab.openBtn); if (b) { b.click(); await sleep(800); ljOpen = true; } } catch (e) {} }
          if (want('late-new') && !skLN) {
            const t = Date.now();
            if (!ljOpen) mark('late-new', 'لاعب متأخر جديد', 'skip', 'لا يوجد زر «لاعب متأخر» لهذه اللعبة', Date.now() - t);
            else { const nid = 'late_' + tag.replace(/[^a-z0-9]/g, '') + '_new'; say(nid, kw); const ok = await waitFor(() => isIn(nid), 4000); mark('late-new', 'لاعب متأخر جديد', ok ? 'pass' : 'fail', ok ? 'دخل لاعب لم يشارك سابقاً بعد فتح نافذة المتأخرين' : 'لم يدخل رغم فتح النافذة', Date.now() - t); }
          }
          if (want('late-excl') && !skLE) {
            const t = Date.now();
            if (!lab.elim) mark('late-excl', 'منع عودة المستبعد', 'skip', 'لا دالة استبعاد معرّفة لهذه اللعبة', Date.now() - t);
            else if (!ljOpen) mark('late-excl', 'منع عودة المستبعد', 'skip', 'لا يوجد زر «لاعب متأخر» لهذه اللعبة', Date.now() - t);
            else { const f = w.eval('(function(uid){ ' + lab.elim + ' })'); try { f('tiktok:' + ids[0]); } catch (e) {} await sleep(200); const chk = lab.elimCheck ? w.eval('(function(uid){ try { return !!(' + lab.elimCheck + ') } catch(e) { return false } })') : null; const outNow = chk ? chk('tiktok:' + ids[0]) : !isIn(ids[0]); say(ids[0], kw); await sleep(700); const back = chk ? !chk('tiktok:' + ids[0]) : isIn(ids[0]); mark('late-excl', 'منع عودة المستبعد', outNow && !back ? 'pass' : 'fail', !outNow ? 'تعذّر استبعاد اللاعب للاختبار' : back ? 'عاد اللاعب المستبعد للعبة' : 'بقي المستبعد خارج اللعبة', Date.now() - t); }
          }
        }
      }
      /* reconnect */
      if (want('reconnect') && noPre) mark('reconnect', 'إعادة الاتصال', 'skip', 'لعبة بلا قائمة مشاركين مسجَّلين؛ كل رسالة تُحتسب مشاركة');
      else if (want('reconnect')) {
        const t = Date.now(); const before = sizeNow(); const inBefore = ids.filter(isIn).length;
        try { w.homeConnSetState('tiktok', 'reconnecting'); await sleep(300); w.homeConnSetState('tiktok', 'connected'); await sleep(300); say(ids[Math.min(2, ids.length - 1)], kw); } catch (e) { errors.push('reconnect: ' + e.message); }
        await sleep(600); const after = sizeNow(); const inAfter = ids.filter(isIn).length;
        const okSize = before == null || before === after;
        mark('reconnect', 'إعادة الاتصال', okSize && inAfter >= inBefore ? 'pass' : 'fail', `المشاركون قبل ${before == null ? inBefore : before} وبعد ${after == null ? inAfter : after}؛ لا لاعب مكرر ولا فقد حالة`, Date.now() - t);
      }
      /* gift */
      if (want('gift')) {
        const t = Date.now(); const fn = GIFT_FN[tag];
        if (!fn || typeof w[fn] !== 'function') mark('gift', 'هدايا TikTok', 'skip', 'اللعبة لا تدعم الإنعاش/الهدايا');
        else {
          const before = sizeNow(); let thrown = null;
          const gift = (id, n) => ({ type: 'WebcastGiftMessage', giftName: 'Rose', diamondCount: 1, repeatCount: n || 1, msgId: 'lab-' + id, user: { uniqueId: 'tiktok:' + id, nickname: id, followRole: 1, isFollower: true } });
          try { w[fn](gift('gift_outsider', 1)); w[fn](gift('gift_outsider', 1)); w[fn](gift(ids[0], 3)); w[fn](gift(ids[1] || ids[0], 1)); } catch (e) { thrown = e.message; }
          await sleep(500); const after = sizeNow();
          let rev = ''; try { const sc = w.eval('MOD_SETTINGS_SCHEMA')[tag === 'rou' ? 'roulette' : tag === 'll' ? 'lastletter' : tag === 'cw' ? 'countrywar' : tag]; const f = sc && sc.fields.find((x) => x.key === 'revivalEnabled'); rev = f ? (f.default ? 'الإنعاش مفعّل افتراضياً' : 'الإنعاش معطّل افتراضياً (لا اختبار استرجاع)') : 'لا إنعاش'; } catch (e) {}
          mark('gift', 'هدايا TikTok', !thrown && (before == null || after === before) ? 'pass' : 'fail', thrown ? 'استثناء: ' + thrown : `أُرسلت هدايا متزامنة ومكررة بنفس المعرّف دون أخطاء، ولم يتغير عدد المشاركين (${before == null ? '—' : before}→${after == null ? '—' : after}). ${rev}`, Date.now() - t);
        }
      }
      /* end */
      if (sk('end')) { /* مُتخطّى */ }
      else if (want('end')) {
        const t = Date.now();
        if (!lab.lobby || !started) mark('end', 'انتهاء الراوند', 'skip', !started ? 'لم يبدأ الراوند' : 'لا إجراء إنهاء معرّف لهذه اللعبة');
        else { let err = null; try { w.eval(lab.lobby); } catch (e) { err = e.message; } await sleep(400); try { const y = w.document.getElementById('gd-modal-yes'); if (y) y.click(); } catch (e) {} const closed = await waitFor(() => { try { w.eval('__lateJoin.tick()'); return !w.eval('__lateJoin.state(' + JSON.stringify(tag) + ').open'); } catch (e) { return false; } }, lab.heavy ? 30000 : 10000); mark('end', 'انتهاء الراوند', closed && !err ? 'pass' : 'fail', closed ? 'أُنهي الراوند وعادت اللعبة لحالة الانتظار' : (err || 'لم يُغلق الراوند'), Date.now() - t); }
      }
    } catch (e) { mark('fatal', 'خطأ غير متوقع في المشغّل', 'fail', e && e.message); }
    return finish();

    async function finish() {
      let iso = { blocked: 0, sockets: 0, net: 0, names: [] };
      try { const lg = w && w.__opsLab; if (lg) iso = { blocked: lg.blocked.length, sockets: lg.sockets.length, net: lg.net.length, names: Array.from(new Set(lg.blocked.map((b) => b.fn))) }; } catch (e) {}
      const parent = await parentSnapshot();
      const dirty = parent && ui.parentBefore && JSON.stringify(parent) !== JSON.stringify(ui.parentBefore);
      mark('iso2', 'عدم تعديل بيانات الإنتاج', dirty ? 'fail' : 'pass', dirty ? 'تغيّرت أعداد سجلات الإنتاج أثناء الاختبار' : `لم تتغير سجلات الإنتاج؛ كتابات محجوبة ${iso.blocked}، مقابس صورية ${iso.sockets}، طلبات POST محجوبة ${iso.net}`);
      const passed = rows.filter((r) => r.status === 'pass').length, failed = rows.filter((r) => r.status === 'fail').length, skipped = rows.filter((r) => r.status === 'skip').length;
      const rep = { tag, title: g.title, t: Date.now(), players: opt.players, scenarios: rows, passed, failed, skipped, errors: errors.slice(0, 30), ms: Date.now() - T0, env: { ua: navigator.userAgent.slice(0, 120), viewport: innerWidth + 'x' + innerHeight, isolation: iso, heavy: !!lab.heavy } };
      return rep;
    }
  }
  async function parentSnapshot() { const s = O.store(); if (!s) return null; try { const [a, b, c] = await Promise.all([s.get('opsEvents'), s.get('opsSessions'), s.get('opsJourney')]); return { e: Object.keys(a || {}).length, s: Object.keys(b || {}).length, j: JSON.stringify(c || {}).length }; } catch (e) { return null; } }

  /* =============== الواجهة =============== */
  function summaryOf(tag) { return Z.last[tag]; }
  function cards() {
    const q = Z.q.toLowerCase(); const list = games().filter((g) => !q || (g.title + g.tag).toLowerCase().includes(q));
    if (!list.length) return O.empty('gamepad', 'لا ألعاب مطابقة');
    return `<div class="ops-grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))">${list.map((g) => { const s = summaryOf(g.tag); const ok = supports(g);
      return `<article class="panel stack-s" data-fx="up"><div class="ops-bar" style="margin:0"><h3 class="h2 grow" style="font-size:19px;margin:0">${esc(g.title)}</h3>${UI.badge(ok ? 'يدعم الاختبار' : 'غير مدعوم', ok ? 'ok' : '')}</div>
        <p class="muted small" style="margin:0">${esc(kind(g))}${g.lab && g.lab.heavy ? ' · ثقيلة (واجهة ثلاثية الأبعاد)' : ''}${g.lab && g.lab.cap ? ' · حد المشاركين ' + g.lab.cap[1] : ''}</p>
        <dl class="ops-kv"><dt>آخر اختبار</dt><dd>${s ? esc(O.ago(s.t)) : 'لم يُختبر'}</dd><dt>نتيجته</dt><dd>${s ? esc(`${s.passed} نجح · ${s.failed} فشل · ${s.skipped} تخطّي`) : '—'}</dd><dt>عدد الاختبارات</dt><dd class="num">${s ? fmt(s.runs || 1) : 0}</dd></dl>
        <button class="btn btn-primary btn-sm" data-lab="${esc(g.tag)}" ${ok ? '' : 'disabled'}>${icon('play')}بدء اختبار</button></article>`; }).join('')}</div>`;
  }
  function body() { if (!O.owner()) return O.denied(); if (!O.store()) return O.noStore(); if (!games().length) return O.error('سجل الألعاب غير متاح.', 'lab-retry');
    return `<div class="ops-bar"><label class="search grow"><span class="sr-only">ابحث عن لعبة</span>${icon('search')}<input class="input" id="lab-q" placeholder="ابحث عن لعبة…" value="${esc(Z.q)}" autocomplete="off"></label><button class="btn btn-ghost btn-sm" data-act="lab-reports">${icon('list')}تقارير الاختبارات</button></div>
      <p class="ops-note" style="margin-bottom:14px">كل اختبار يعمل داخل نسخة معزولة من الموقع بمنطق اللعبة الحقيقي: لا اتصال ببث ولا هدايا حقيقية، وتُحجب كل كتابات Firebase والشبكة، ويُتحقق بعد كل اختبار أن بيانات الإنتاج لم تتغير. المحاكاة لا تحتاج حساباً أو بثاً.</p>${cards()}`; }
  function repaint(v) { const m = $('#lab-main', v); if (m) m.innerHTML = body(); }
  function loadSummary(v) { const s = O.store(); if (!s) return; O.sub(v, 'opsLab/summary', (val) => { Z.last = val || {}; if (!Z.running && v.isConnected) { const c = $('#lab-main .ops-grid', v); if (c) c.outerHTML = cards(); } }); }

  function setup(g) {
    const m = UI.modal({ title: 'إعداد اختبار: ' + g.title, wide: true, html: `<div class="stack"><div class="field"><span class="label">عدد اللاعبين الافتراضيين</span><div class="ops-tabs" role="group" aria-label="عدد اللاعبين">${[10, 50, 100].map((n) => `<button class="chip ${n === 10 ? 'on' : ''}" data-pn="${n}" aria-pressed="${n === 10}">${n}</button>`).join('')}<input class="input" id="lab-custom" type="number" min="1" max="200" placeholder="مخصص (١–٢٠٠)" style="width:150px"></div>${g.lab.cap ? `<p class="hint">لهذه اللعبة حد مشاركين ${g.lab.cap[1]}؛ يُضبط ويُقارن به.</p>` : ''}</div>
      <div class="field"><span class="label">السيناريوهات</span><div class="stack-s">${SCEN.map(([id, t]) => `<label class="ops-row" style="cursor:pointer"><input type="checkbox" data-sc="${id}" checked><span class="t"><b>${esc(t)}</b></span></label>`).join('')}</div></div></div>`,
      foot: '<button class="btn btn-primary" data-go>بدء الاختبار</button><button class="btn btn-ghost" data-x>إلغاء</button>',
      onMount(sc, close) { let n = 10; sc.addEventListener('click', (e) => { const p = e.target.closest('[data-pn]'); if (p) { n = +p.dataset.pn; $$('[data-pn]', sc).forEach((b) => { const on = b === p; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); $('#lab-custom', sc).value = ''; } }); sc.querySelector('[data-go]').onclick = () => { const cu = parseInt($('#lab-custom', sc).value, 10); const players = isFinite(cu) && cu > 0 ? Math.min(200, cu) : n; const scen = $$('[data-sc]', sc).filter((x) => x.checked).map((x) => x.dataset.sc); close(); execute(g, { players, scen }); }; } });
    return m;
  }
  const badge = { pass: ['نجح', 'ok'], fail: ['فشل', 'bad'], skip: ['تخطّي', ''] };
  async function execute(g, opt) {
    if (Z.running) { UI.toast('اختبار آخر قيد التشغيل', 'bad'); return; }
    Z.running = g.tag; let tick = null; const t0 = Date.now();
    const m = UI.modal({ title: 'اختبار: ' + g.title, wide: true, html: `<div class="ops-cols"><div class="stack"><div class="ops-bar" style="margin:0"><span class="live-tag"><span class="ops-dot warn"></span>قيد التشغيل</span><span class="muted small">المدة <b class="num" id="lab-t">0 ث</b></span><span class="muted small">اللاعبون ${fmt(opt.players)}</span></div>
      <iframe id="lab-frame" title="مشهد اللعبة المعزول" style="width:100%;height:340px;border:1px solid rgba(167,139,255,.25);border-radius:14px;background:#0b0518" loading="eager"></iframe></div>
      <div class="stack"><div class="section-label">السيناريوهات</div><div class="stack-s" id="lab-rows" aria-live="polite"></div><div class="section-label">سجل الأحداث</div><div class="ops-tl" id="lab-log" style="max-height:170px"></div></div></div>`,
      foot: '<button class="btn btn-ghost" data-x>إغلاق</button>' });
    const rowsEl = $('#lab-rows', m.el), logEl = $('#lab-log', m.el), frame = $('#lab-frame', m.el);
    tick = setInterval(() => { const e = $('#lab-t', m.el); if (e) e.textContent = O.dur(Date.now() - t0); }, 500);
    const ui = { frame, parentBefore: await parentSnapshot(), log: (msg) => { logEl.insertAdjacentHTML('afterbegin', `<div class="muted small">${esc(O.clock(Date.now()))} — ${esc(msg)}</div>`); },
      row: (r) => { rowsEl.insertAdjacentHTML('beforeend', `<div class="ops-row" style="cursor:default"><span class="ops-dot ${r.status === 'pass' ? 'ok' : r.status === 'fail' ? 'bad' : 'off'}"></span><span class="t"><b>${esc(r.name)}</b><span class="muted small">${esc(r.detail)}</span></span>${UI.badge(badge[r.status][0], badge[r.status][1])}</div>`); ui.log(r.name + ' — ' + badge[r.status][0]); } };
    let rep; try { rep = await run(g, opt, ui); } catch (e) { rep = { tag: g.tag, title: g.title, t: Date.now(), players: opt.players, scenarios: [{ id: 'fatal', name: 'خطأ المشغّل', status: 'fail', detail: e.message }], passed: 0, failed: 1, skipped: 0, errors: [], ms: Date.now() - t0, env: {} }; }
    clearInterval(tick); Z.running = null;
    const s = O.store(); const prevRuns = (Z.last[g.tag] && Z.last[g.tag].runs) || 0;
    if (s) { try { await s.push('opsLab/reports', rep); await s.set('opsLab/summary/' + g.tag, { t: O.SV(), passed: rep.passed, failed: rep.failed, skipped: rep.skipped, runs: prevRuns + 1 }); O.audit('lab.run', { tag: g.tag, players: opt.players, passed: rep.passed, failed: rep.failed }); } catch (e) { ui.log('تعذّر حفظ التقرير: ' + e.message); } }
    const tot = rep.passed + rep.failed;
    const head = `<div class="panel stack-s" style="margin-top:12px"><b>${rep.failed ? 'اكتمل الاختبار مع إخفاقات' : tot ? 'نجحت كل السيناريوهات المنفَّذة' : 'لم يُنفَّذ أي سيناريو'}</b><span class="muted small">نجح ${rep.passed} · فشل ${rep.failed} · تخطّي ${rep.skipped}${tot ? ' · نسبة النجاح من المنفَّذ ' + O.pctText(O.pct(rep.passed, tot)) : ''} · المدة ${O.dur(rep.ms)}${rep.errors.length ? ' · أخطاء JS مكتشفة ' + rep.errors.length : ''}</span><div class="cluster"><button class="btn btn-ghost btn-sm" data-ex="json">${icon('save')}JSON</button><button class="btn btn-ghost btn-sm" data-ex="csv">${icon('save')}CSV</button></div></div>`;
    const body2 = m.el.querySelector('.dialog-body'); if (body2) body2.insertAdjacentHTML('beforeend', head);
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-ex]'); if (!b) return; if (b.dataset.ex === 'json') O.download('lab-' + g.tag + '-' + Date.now() + '.json', JSON.stringify(rep, null, 2)); else O.download('lab-' + g.tag + '-' + Date.now() + '.csv', O.csv([['السيناريو', 'النتيجة', 'التفاصيل', 'المدة(م.ث)']].concat(rep.scenarios.map((r) => [r.name, r.status, r.detail, r.ms])))); });
    const e = $('#lab-frame', m.el); if (e) e.src = 'about:blank';
    window.OpsLab._lastReport = rep;
  }
  async function showReports() {
    const s = O.store(); if (!s) return; const all = await s.get('opsLab/reports').catch(() => null); const L2 = O.list(all).sort((a, b) => b.t - a.t).slice(0, 30);
    UI.modal({ title: 'تقارير الاختبارات', wide: true, html: L2.length ? `<table class="ops-table"><thead><tr><th>اللعبة</th><th>التاريخ</th><th>لاعبون</th><th>نجح</th><th>فشل</th><th>تخطّي</th></tr></thead><tbody>${L2.map((r) => `<tr><td>${esc(r.title)}</td><td>${esc(O.date(r.t))}</td><td class="num">${fmt(r.players)}</td><td>${fmt(r.passed)}</td><td>${r.failed ? UI.badge(String(r.failed), 'bad') : '0'}</td><td>${fmt(r.skipped)}</td></tr>`).join('')}</tbody></table>` : O.empty('list', 'لا تقارير بعد', 'شغّل اختباراً ليظهر تقريره هنا.') });
  }
  Studio.actions['lab-reports'] = showReports; Studio.actions['lab-retry'] = () => { const v = document.getElementById('view-lab'); if (v) repaint(v); };
  Studio.register({ id: 'lab', title: 'مختبر الألعاب', en: 'GAME TESTING LAB', icon: 'cube', desc: 'اختبر الألعاب والراوندات والاتصالات قبل إطلاق التحديثات',
    html() { return `<div id="lab-main">${body()}</div>`; },
    mount(v) { loadSummary(v); v.addEventListener('input', (e) => { if (e.target.id === 'lab-q') { Z.q = e.target.value.trim(); const c = $('#lab-main .ops-grid, #lab-main .state', v); if (c) c.outerHTML = cards(); } }); v.addEventListener('click', (e) => { const b = e.target.closest('[data-lab]'); if (b) { const g = games().find((x) => x.tag === b.dataset.lab); if (g) setup(g); } }); } });
  window.OpsLab = { run, supports, _Z: Z, execute };
})();
