/* غرفة العمليات المباشرة + مراقب البثوث + صحة الأنظمة.
 * مصادر البيانات (كلها حقيقية): opsSessions / opsEvents / opsHealth (RTDB عبر EhsOps)، وحضور Firestore (presence)،
 * وفحوصات حيّة من متصفح المالك لخدمات الجسر وFirebase. */
(function () {
  'use strict';
  const { esc, icon, fmt, $, $$ } = UI; const O = window.Ops; const L = Studio.live; const G = L.G;
  const FRESH_MS = 90000; // نبضة الجلسة كل 20ث: بعد 90ث بلا نبضة = تأخر في إرسال البيانات

  /* ======================= غرفة العمليات ======================= */
  const R = { sess: {}, ev: {}, inc: {}, online: null, onlineAt: 0, paused: false, conn: null, got: 0, last: 0, sel: null, filter: 'all', limit: 150, evShown: 40, err: null, ready: false };
  let stops = [];

  function sessions() { return O.list(R.sess).map((s) => Object.assign(s, { sid: s._k })); }
  function fresh(s) { return s.state === 'live' && s.last && Date.now() - s.last < FRESH_MS; }
  function lastConn(s) { const c = O.list(s.conn).sort((a, b) => (a.t || 0) - (b.t || 0)); return c.length ? c[c.length - 1] : null; }
  function runningRounds() {
    const out = [];
    sessions().forEach((s) => { O.list(s.rounds).forEach((r) => { if (r.state === 'running' && (s.state === 'live')) out.push({ s, r, idx: r._k, fresh: fresh(s), rid: s.sid + '_' + r.game + '_' + r._k }); }); });
    return out.sort((a, b) => (b.r.start || 0) - (a.r.start || 0));
  }
  function events() { return O.list(R.ev).sort((a, b) => (b.t || 0) - (a.t || 0)); }

  function alerts() {
    const A = []; const now = Date.now();
    O.list(R.inc).forEach((i) => { if (i.state === 'open') A.push({ k: 'inc:' + i._k, kind: 'bad', cat: 'خطأ مؤكد', title: 'خدمة متوقفة: ' + (i.name || i.svc), svc: i.name || i.svc, t: i.start, cause: i.cause || 'فشل متتالٍ مؤكد في فحوصات الخدمة', go: 'health' }); });
    sessions().forEach((s) => {
      if (s.state === 'lost' && s.ended && now - s.ended < 30 * 60000) A.push({ k: 'lost:' + s.sid, kind: 'warn', cat: 'انقطاع مؤكد', title: 'انقطعت جلسة ' + (s.streamer || 'ستريمر'), svc: 'جلسة البث', t: s.ended, cause: 'فُقد اتصال متصفح الستريمر بقاعدة البيانات (إغلاق الصفحة أو انقطاع الإنترنت)', go: 'sessions', sel: s.sid });
      else if (s.state === 'live' && s.last && now - s.last >= FRESH_MS && now - s.last < 15 * 60000) A.push({ k: 'stale:' + s.sid, kind: 'warn', cat: 'تأخر في إرسال البيانات', title: 'جلسة ' + (s.streamer || 'ستريمر') + ' لا ترسل نبضات', svc: 'جلسة البث', t: s.last, cause: 'لم تصل نبضة منذ ' + O.dur(now - s.last) + ' — الحالة غير مؤكدة (قد يكون تبويب الستريمر في الخلفية)', go: 'sessions', sel: s.sid });
    });
    events().forEach((e) => {
      if (now - (e.t || 0) > 15 * 60000) return;
      if (e.type === 'launch_fail') A.push({ k: 'ev:' + e._k, kind: 'bad', cat: 'خطأ مؤكد', title: 'فشل بدء ' + O.gameTitle(e.game), svc: 'اللعبة', t: e.t, cause: e.msg || 'لم يبدأ الراوند', go: 'sessions', sel: e.sid });
      if (e.type === 'conn_failed') A.push({ k: 'ev:' + e._k, kind: 'bad', cat: 'خطأ مؤكد', title: 'فشل اتصال البث ' + (O.PLAT[e.platform] || e.platform || ''), svc: 'اتصال البث', t: e.t, cause: e.msg || '', go: 'sessions', sel: e.sid });
    });
    return A.sort((a, b) => (b.t || 0) - (a.t || 0));
  }

  function kpis() {
    const live = sessions().filter(fresh); const rr = runningRounds().filter((x) => x.fresh);
    const hourAgo = Date.now() - 3600e3; const errs = events().filter((e) => e.sev === 'error' && (e.t || 0) > hourAgo).length;
    const bc = live.filter((s) => { const c = lastConn(s); return c && c.to === 'connected'; }).length;
    return [
      ['users', 'المستخدمون المتصلون الآن', R.online == null ? '—' : fmt(R.online), R.online == null ? 'قراءة الحضور غير متاحة' : 'من حضور Firestore (آخر ٣ دقائق)'],
      ['mic', 'الستريمرز المتصلون', fmt(live.length), 'جلسات بنبضة حديثة'],
      ['radio', 'البثوث النشطة', fmt(bc), 'اتصال بث مؤكد'],
      ['gamepad', 'الألعاب الجارية', fmt(new Set(rr.map((x) => x.r.game)).size), 'ألعاب مختلفة'],
      ['flag', 'الراوندات النشطة', fmt(rr.length), 'راوند قيد التشغيل'],
      ['users', 'إجمالي المشاركين', fmt(live.reduce((n, s) => n + (+s.parts || 0), 0)), 'من نبضات الجلسات'],
      ['alert', 'أخطاء آخر ساعة', fmt(errs), 'أحداث بخطورة خطأ'],
      ['bell', 'التنبيهات النشطة', fmt(alerts().length), 'مؤكدة وغير مؤكدة']
    ];
  }

  function evRow(e) {
    const nm = O.evName(e.type); const sev = e.sev === 'error' ? 'error' : e.sev === 'warn' ? 'warn' : '';
    return `<button class="ops-ev ${sev}" data-ev="${esc(e._k)}"><span class="ops-dot ${sev === 'error' ? 'bad' : sev === 'warn' ? 'warn' : 'ok'}" aria-hidden="true"></span><span><b>${esc(nm)}</b> <span class="muted small">${esc([e.streamer, e.game ? O.gameTitle(e.game) : '', O.PLAT[e.platform] || e.platform].filter(Boolean).join(' · '))}</span></span><span class="muted small num">${esc(O.clock(e.t))}</span></button>`;
  }

  function body() {
    if (!O.owner()) return O.denied();
    if (!O.store()) return O.noStore();
    if (R.err) return O.error(R.err, 'ops-retry');
    if (!R.ready) return O.skel(6);
    const K = kpis(); const rr = runningRounds(); const al = alerts();
    let ev = events(); if (R.filter !== 'all') ev = ev.filter((e) => e.sev === R.filter);
    const shown = ev.slice(0, R.evShown);
    return `<div class="ops-grid" data-fx="up">${K.map((k) => `<div class="panel ops-kpi"><span class="l">${icon(k[0])} ${esc(k[1])}</span><span class="v num">${esc(k[2])}</span><span class="muted small">${esc(k[3])}</span></div>`).join('')}</div>
    <div class="ops-cols" style="margin-top:16px">
      <div class="stack">
        <div class="panel"><div class="section-label">الراوندات المباشرة <span class="badge">${rr.length}</span></div>
          ${rr.length ? `<div class="stack-s">${rr.map((x) => `<button class="ops-row" data-rd="${esc(x.rid)}"><span class="ops-dot ${x.fresh ? 'ok' : 'warn'}" aria-hidden="true"></span><span class="t"><b>${esc(O.gameTitle(x.r.game))} — ${esc(x.s.streamer || 'ستريمر')}</b><span class="muted small">${x.fresh ? 'يعمل' : 'حالة غير مؤكدة (تأخر النبضة)'} · منذ ${esc(O.dur(Date.now() - (x.r.start || Date.now())))} · مشاركون ${fmt(+x.s.parts || 0)}</span></span><code class="muted small">${esc(x.rid.slice(-18))}</code>${icon('arrowl')}</button>`).join('')}</div>` : O.empty('flag', 'لا توجد راوندات نشطة الآن', 'يظهر الراوند هنا لحظة بدء أي ستريمر لعبة.')}
        </div>
        <div class="panel"><div class="ops-bar"><div class="section-label grow" style="margin:0">الخط الزمني للأحداث</div>
          <div class="ops-tabs" role="group" aria-label="تصفية الأحداث">${[['all', 'الكل'], ['warn', 'تحذيرات'], ['error', 'أخطاء']].map(([v, t]) => `<button class="chip ${R.filter === v ? 'on' : ''}" data-evf="${v}" aria-pressed="${R.filter === v}">${t}</button>`).join('')}</div></div>
          ${shown.length ? `<div class="ops-tl">${shown.map(evRow).join('')}${ev.length > shown.length ? `<button class="btn btn-ghost btn-sm" data-act="ops-more">${icon('down')}عرض المزيد (${fmt(ev.length - shown.length)})</button>` : ''}${ev.length >= R.limit && ev.length <= R.evShown ? `<button class="btn btn-quiet btn-sm" data-act="ops-older">تحميل أحداث أقدم</button>` : ''}</div>` : O.empty('list', 'لا أحداث بعد', 'الأحداث تُسجَّل تلقائياً من جلسات الستريمرز الحقيقية.')}
        </div>
      </div>
      <div class="panel"><div class="section-label">التنبيهات <span class="badge ${al.length ? 'warn' : ''}">${al.length}</span></div>
        ${al.length ? `<div class="stack-s">${al.map((a) => `<button class="ops-row" data-al="${esc(a.k)}"><span class="ops-dot ${a.kind}" aria-hidden="true"></span><span class="t"><b>${esc(a.title)}</b><span class="muted small">${esc(a.cat)} · ${esc(a.svc)} · ${esc(O.ago(a.t))}</span></span>${icon('arrowl')}</button>`).join('')}</div>` : O.empty('check', 'لا تنبيهات نشطة', 'لا توجد مشكلة مؤكدة أو متأخرة حالياً.')}
        <p class="ops-note" style="margin-top:12px">التفريق بين الحالات: «مؤكد» = دليل مباشر (حدث فشل أو انقطاع من السيرفر)، «تأخر» = غياب نبضة فقط وقد لا يكون عطلاً.</p>
      </div>
    </div>`;
  }

  function bar() {
    const c = R.conn; const dot = c === true ? 'ok' : c === false ? 'bad' : 'off';
    return `<div class="ops-bar" id="ops-bar"><span class="live-tag ${c ? '' : 'off'}"><span class="ops-dot ${dot}" aria-hidden="true"></span>${c === true ? 'الاتصال المباشر نشط' : c === false ? 'الاتصال المباشر مقطوع' : 'جارِ الاتصال…'}</span>
      <span class="muted small">آخر تحديث ناجح: <b class="num">${esc(O.clock(R.last))}</b></span><span class="muted small">أحداث مستقبَلة: <b class="num">${fmt(R.got)}</b></span><span class="grow"></span>
      <button class="btn btn-ghost btn-sm" data-act="ops-refresh">${icon('refresh')}تحديث</button>
      <button class="btn btn-quiet btn-sm" data-act="ops-pause" aria-pressed="${R.paused}">${icon(R.paused ? 'play' : 'stop')}${R.paused ? 'استئناف العرض' : 'إيقاف العرض مؤقتاً'}</button></div>`;
  }
  function paint(v) { const b = $('#ops-bar', v), m = $('#ops-main', v); if (!b || !m) return; if (R.paused) { return; } b.outerHTML = bar(); m.innerHTML = body(); }
  function paintBar(v) { const b = $('#ops-bar', v); if (b) b.outerHTML = bar(); }

  function evModal(e) {
    UI.modal({ title: O.evName(e.type), html: `<dl class="ops-kv">${[['الوقت', O.date(e.t)], ['النوع', e.type], ['الخطورة', e.sev === 'error' ? 'خطأ' : e.sev === 'warn' ? 'تحذير' : 'معلومة'], ['المصدر', e.src], ['الستريمر', e.streamer], ['المنصة', O.PLAT[e.platform] || e.platform], ['اللعبة', e.game ? O.gameTitle(e.game) : ''], ['معرّف الراوند', e.rid], ['معرّف الجلسة', e.sid], ['التفاصيل', e.msg]].filter((r) => r[1]).map((r) => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>`, foot: `${e.sid ? `<button class="btn btn-primary" data-go-s="${esc(e.sid)}">${icon('eye')}فتح الجلسة</button>` : ''}`, onMount(sc, close) { const b = sc.querySelector('[data-go-s]'); if (b) b.onclick = () => { close(); L.go('sessions', { sel: b.dataset.goS }); }; } });
  }
  function roundModal(x) {
    const evs = events().filter((e) => e.rid === x.rid || (e.sid === x.s.sid && e.game === x.r.game)).slice(0, 25); const c = lastConn(x.s);
    UI.modal({ title: O.gameTitle(x.r.game), wide: true, html: `<dl class="ops-kv">${[['الستريمر', x.s.streamer], ['المنصة', O.PLAT[x.s.platform] || x.s.platform], ['معرّف الراوند', x.rid], ['الحالة', x.fresh ? 'قيد التشغيل' : 'قيد التشغيل — الإشارة متأخرة'], ['وقت البداية', O.date(x.r.start)], ['المدة', O.dur(Date.now() - (x.r.start || Date.now()))], ['عدد المشاركين (آخر نبضة)', fmt(+x.s.parts || 0)], ['آخر نبضة', O.ago(x.s.last)], ['حالة الاتصال بالمصدر', c ? (O.evName('conn_' + c.to) + ' — ' + O.ago(c.t)) : 'لا أحداث اتصال بعد']].filter((r) => r[1]).map((r) => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>
      <p class="ops-note" style="margin:14px 0">قائمة المشاركين التفصيلية (فرداً فرداً) وأعداد المستبعدين لا تُرسَل للسيرفر لأنها تُدار داخل ذاكرة صفحة الستريمر ولا يوجد لها مصدر مركزي؛ المتاح فعلياً هو إجمالي المشاركين من نبضة الجلسة.</p>
      <div class="section-label">سجل أحداث الراوند</div>${evs.length ? `<div class="ops-tl">${evs.map(evRow).join('')}</div>` : O.empty('list', 'لا أحداث لهذا الراوند')}`,
      foot: `<button class="btn btn-primary" data-open-s>${icon('eye')}تفاصيل جلسة الستريمر</button>`, onMount(sc, close) { sc.querySelector('[data-open-s]').onclick = () => { close(); L.go('sessions', { sel: x.s.sid }); }; sc.addEventListener('click', (e) => { const b = e.target.closest('[data-ev]'); if (b && R.ev[b.dataset.ev]) evModal(Object.assign({ _k: b.dataset.ev }, R.ev[b.dataset.ev])); }); } });
  }

  function opsSubscribe(v) {
    stops.forEach((f) => f()); stops = []; R.ready = false; R.err = null;
    const s = O.store(); if (!s) { $('#ops-main', v).innerHTML = body(); return; }
    let n = 0; const need = 3; const one = () => { if (++n >= need && !R.ready) { R.ready = true; R.last = Date.now(); paint(v); } };
    const upd = O.throttle(() => { R.last = Date.now(); paint(v); }, 400);
    let first = { s: true, e: true, i: true };
    stops.push(O.sub(v, 'opsSessions', (val, err) => { if (err) { R.err = 'تعذّر قراءة الجلسات: ' + (err.message || ''); paint(v); return; } R.sess = val || {}; R.last = Date.now(); if (first.s) { first.s = false; one(); } else upd(); }, { orderBy: 'last', startAt: Date.now() - 6 * 3600e3 }));
    stops.push(O.sub(v, 'opsEvents', (val, err) => { if (err) { R.err = 'تعذّر قراءة الأحداث: ' + (err.message || ''); paint(v); return; } const before = Object.keys(R.ev).length; R.ev = val || {}; R.got += Math.max(0, Object.keys(R.ev).length - before); if (first.e) { first.e = false; R.got = 0; one(); } else upd(); }, { limitLast: R.limit }));
    stops.push(O.sub(v, 'opsHealth/incidents', (val) => { R.inc = val || {}; if (first.i) { first.i = false; one(); } else upd(); }, { limitLast: 50 }));
    if (s.connected) stops.push(s.connected((c) => { R.conn = c; if (v.isConnected) paintBar(v); }));
  }
  function readOnline() {
    try { const f = G('__fb') || (window.parent && window.parent.__fb); if (!f || !f.getDocs) return; const win = +G('SITE_PRESENCE_ONLINE_WINDOW_MS') || 180000;
      f.getDocs(f.collection(f.db, 'presence')).then((snap) => { let n = 0; const now = Date.now(); snap.forEach((d) => { const x = d.data(); const t = x.lastSeen && x.lastSeen.toMillis ? x.lastSeen.toMillis() : 0; if (t && now - t <= win) n++; }); R.online = n; R.onlineAt = now; }).catch(() => { R.online = null; });
    } catch (e) { R.online = null; }
  }

  Studio.actions['ops-refresh'] = () => { const v = document.getElementById('view-ops'); if (v) { readOnline(); opsSubscribe(v); UI.toast('جارِ التحديث…'); } };
  Studio.actions['ops-retry'] = Studio.actions['ops-refresh'];
  Studio.actions['ops-pause'] = () => { R.paused = !R.paused; const v = document.getElementById('view-ops'); if (v) { if (!R.paused) paint(v); else { const b = $('#ops-bar', v); if (b) b.outerHTML = bar(); } } };
  Studio.actions['ops-more'] = () => { R.evShown += 40; const v = document.getElementById('view-ops'); if (v) paint(v); };
  Studio.actions['ops-older'] = () => { R.limit += 150; R.evShown += 40; const v = document.getElementById('view-ops'); if (v) opsSubscribe(v); };

  Studio.register({ id: 'ops', title: 'غرفة العمليات', en: 'LIVE OPERATIONS CENTER', icon: 'radio', desc: 'راقب كل ما يحدث في احسمها لحظة بلحظة',
    html() { return `${bar()}<div id="ops-main" aria-live="polite">${body()}</div>`; },
    mount(v) {
      readOnline(); O.every(v, 45000, readOnline); O.every(v, 15000, () => { if (!R.paused) paint(v); });
      opsSubscribe(v);
      v.addEventListener('click', (e) => {
        const ev = e.target.closest('[data-ev]'); if (ev) { const x = R.ev[ev.dataset.ev]; if (x) evModal(Object.assign({ _k: ev.dataset.ev }, x)); return; }
        const f = e.target.closest('[data-evf]'); if (f) { R.filter = f.dataset.evf; R.evShown = 40; paint(v); return; }
        const rd = e.target.closest('[data-rd]'); if (rd) { const x = runningRounds().find((y) => y.rid === rd.dataset.rd); if (x) roundModal(x); return; }
        const al = e.target.closest('[data-al]'); if (al) { const a = alerts().find((y) => y.k === al.dataset.al); if (a) UI.modal({ title: a.title, html: `<dl class="ops-kv"><dt>التصنيف</dt><dd>${esc(a.cat)}</dd><dt>الخدمة المتأثرة</dt><dd>${esc(a.svc)}</dd><dt>وقت الاكتشاف</dt><dd>${esc(O.date(a.t))}</dd><dt>السبب المعروف</dt><dd>${esc(a.cause)}</dd></dl>`, foot: `<button class="btn btn-primary" data-g>${icon('eye')}فتح التفاصيل</button>`, onMount(sc, close) { sc.querySelector('[data-g]').onclick = () => { close(); L.go(a.go, a.sel ? { sel: a.sel } : {}); }; } }); }
      });
    }
  });

  /* ======================= مراقب البثوث ======================= */
  const S = { sess: {}, ev: {}, sel: null, ready: false, q: '', plat: 'all', err: null };
  let sstops = [];
  function sList() { return O.list(S.sess).map((s) => Object.assign(s, { sid: s._k })).sort((a, b) => (b.last || 0) - (a.last || 0)); }
  function sStatus(s) {
    if (s.state === 'ended') return ['انتهت', ''];
    if (s.state === 'lost') return ['منقطعة', 'bad'];
    if (fresh(s)) { const c = lastConn(s); if (c && /^(failed|disabled)$/.test(c.to)) return ['فشل اتصال', 'bad']; if (c && /^(reconnecting|down|disconnected|not_live)$/.test(c.to)) return ['اتصال غير مستقر', 'warn']; return ['متصلة', 'ok']; }
    return ['إشارة متأخرة', 'warn'];
  }
  function outages(s) {
    const c = O.list(s.conn).sort((a, b) => (a.t || 0) - (b.t || 0)); const out = []; let open = null;
    c.forEach((x) => { if (/^(reconnecting|down|disconnected|failed|not_live)$/.test(x.to) && !open) open = x; else if (x.to === 'connected' && open) { out.push({ from: open.t, to: x.t, why: open.to, platform: open.platform }); open = null; } });
    if (open) out.push({ from: open.t, to: null, why: open.to, platform: open.platform }); return out;
  }
  function sRows() {
    let L2 = sList(); if (S.plat !== 'all') L2 = L2.filter((s) => (s.platform || '') === S.plat); if (S.q) L2 = L2.filter((s) => String(s.streamer || '').toLowerCase().includes(S.q.toLowerCase()));
    if (!L2.length) return O.empty('mic', 'لا جلسات في آخر ٢٤ ساعة', 'تظهر جلسة كل ستريمر هنا بمجرد بدئه أول لعبة.');
    return `<div class="stack-s">${L2.slice(0, 120).map((s) => { const [t, k] = sStatus(s); const c = lastConn(s); const errs = O.list(S.ev).filter((e) => e.sid === s.sid && e.sev === 'error').length;
      return `<button class="ops-row" data-ss="${esc(s.sid)}" aria-selected="${S.sel === s.sid}"><span class="ops-dot ${k || 'off'}" aria-hidden="true"></span><span class="t"><b>${esc(s.streamer || 'ستريمر')} <span class="muted small">${esc(O.PLAT[s.platform] || s.platform || '')}</span></b><span class="muted small">${esc(s.game ? O.gameTitle(s.game) : 'بلا لعبة حالية')} · مدة ${esc(O.dur((s.ended || (fresh(s) ? Date.now() : s.last) || 0) - (s.start || 0)))} · مشاركون ${fmt(+s.parts || 0)} · راوندات ${fmt(+s.nDone || 0)}/${fmt(+s.nRounds || 0)} · أخطاء ${fmt(errs)}</span><span class="muted small">آخر اتصال ناجح: ${esc(c && c.to === 'connected' ? O.ago(c.t) : (O.list(s.conn).filter((x) => x.to === 'connected').sort((a, b) => b.t - a.t)[0] ? O.ago(O.list(s.conn).filter((x) => x.to === 'connected').sort((a, b) => b.t - a.t)[0].t) : '—'))}</span></span>${UI.badge(t, k)}</button>`; }).join('')}</div>`;
  }
  function sDetail() {
    const s = sList().find((x) => x.sid === S.sel); if (!s) return O.empty('mic', 'اختر جلسة', 'ستظهر هنا تفاصيل الجلسة والاتصال والراوندات.');
    const [t, k] = sStatus(s); const rounds = O.list(s.rounds).sort((a, b) => (a._k - b._k)); const done = rounds.filter((r) => r.end && r.start); const avg = done.length ? done.reduce((n, r) => n + (r.end - r.start), 0) / done.length : null;
    const outs = outages(s); const fails = O.list(S.ev).filter((e) => e.sid === s.sid && e.type === 'launch_fail').sort((a, b) => b.t - a.t);
    const evs = O.list(S.ev).filter((e) => e.sid === s.sid).sort((a, b) => b.t - a.t).slice(0, 30);
    return `<article class="panel stack"><div class="ops-bar" style="margin:0"><h3 class="h2 grow" style="font-size:24px;margin:0">${esc(s.streamer || 'ستريمر')}</h3>${UI.badge(t, k)}</div>
      <dl class="ops-kv">${[['معرّف الجلسة', s.sid], ['المنصة', O.PLAT[s.platform] || s.platform], ['وقت البدء', O.date(s.start)], ['مدة الاتصال', O.dur((s.ended || (fresh(s) ? Date.now() : s.last) || 0) - (s.start || 0))], ['آخر حدث', evs[0] ? O.evName(evs[0].type) + ' — ' + O.ago(evs[0].t) : 'لا أحداث'], ['الجهاز', ({ d: 'كمبيوتر', m: 'جوال', t: 'جهاز لوحي' })[s.dev] || ''], ['اللعبة الحالية', s.game ? O.gameTitle(s.game) : '—']].filter((r) => r[1]).map((r) => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>
      <div class="section-label">المشاركون</div><dl class="ops-kv"><dt>إجمالي المشاركين (آخر نبضة)</dt><dd class="num">${fmt(+s.parts || 0)}</dd><dt>النشطون / المستبعدون</dt><dd>غير متاح مركزياً</dd><dt>محاولات الانضمام (ناجحة/فاشلة)</dt><dd>غير مُسجَّلة لكل لعبة بعد</dd></dl>
      <p class="ops-note">لا نستنتج فشل انضمام لاعب من غيابه عن القائمة: الانضمام يُعالَج داخل صفحة الستريمر لكل لعبة على حدة ولا يُرسَل منه حدث موثوق للمصدر المركزي. المسجَّل فعلاً: فشل بدء اللعبة نفسها وأسبابه (أدناه).</p>
      <div class="section-label">الألعاب</div><dl class="ops-kv"><dt>راوندات مكتملة / مبدوءة</dt><dd class="num">${fmt(+s.nDone || 0)} / ${fmt(+s.nRounds || 0)}</dd><dt>الراوند الجاري</dt><dd>${esc(rounds.filter((r) => r.state === 'running').map((r) => O.gameTitle(r.game)).join('، ') || '—')}</dd><dt>متوسط مدة الراوند</dt><dd>${avg == null ? '—' : esc(O.dur(avg))}</dd><dt>مرات فشل بدء اللعبة</dt><dd class="num">${fmt(fails.length)}</dd><dt>آخر نتيجة</dt><dd>${esc((rounds.filter((r) => r.state === 'complete').slice(-1)[0] || {}).game ? 'اكتمل: ' + O.gameTitle(rounds.filter((r) => r.state === 'complete').slice(-1)[0].game) : '—')}</dd></dl>
      ${fails.length ? `<div class="section-label">أسباب فشل بدء اللعبة</div><div class="stack-s">${fails.map((e) => `<div class="ops-row" style="cursor:default"><span class="ops-dot bad"></span><span class="t"><b>${esc(O.gameTitle(e.game))}</b><span class="muted small">${esc(e.msg || '—')} · ${esc(O.date(e.t))}</span></span></div>`).join('')}</div>` : ''}
      <div class="section-label">سجل الاتصال</div>${O.list(s.conn).length ? `<table class="ops-table"><caption class="sr-only">سجل الاتصال</caption><thead><tr><th>الوقت</th><th>المنصة</th><th>الحالة</th></tr></thead><tbody>${O.list(s.conn).sort((a, b) => b.t - a.t).slice(0, 40).map((c) => `<tr><td class="num">${esc(O.clock(c.t))}</td><td>${esc(O.PLAT[c.platform] || c.platform)}</td><td>${esc(O.evName('conn_' + c.to))}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">لا أحداث اتصال مسجّلة بعد.</p>'}
      ${outs.length ? `<div class="section-label">فترات الانقطاع والتعافي</div><table class="ops-table"><thead><tr><th>بدأ</th><th>المدة</th><th>السبب</th><th>التعافي</th></tr></thead><tbody>${outs.map((o2) => `<tr><td class="num">${esc(O.clock(o2.from))}</td><td>${o2.to ? esc(O.dur(o2.to - o2.from)) : 'مستمر'}</td><td>${esc(O.evName('conn_' + o2.why))}</td><td>${o2.to ? 'تم' : 'لم يتعافَ بعد'}</td></tr>`).join('')}</tbody></table>` : ''}
      <button class="btn btn-ghost btn-sm" data-act="ss-export">${icon('save')}تصدير الجلسة (JSON)</button></article>`;
  }
  function sBody() {
    if (!O.owner()) return O.denied(); if (!O.store()) return O.noStore(); if (S.err) return O.error(S.err, 'ss-retry'); if (!S.ready) return O.skel(5);
    return `<div class="ops-cols"><div class="stack"><div class="ops-bar"><label class="search grow"><span class="sr-only">بحث بالستريمر</span>${icon('search')}<input class="input" id="ss-q" placeholder="ابحث باسم الستريمر…" value="${esc(S.q)}" autocomplete="off"></label>
      <div class="ops-tabs" role="group" aria-label="المنصة">${[['all', 'الكل'], ['tiktok', 'تيك توك'], ['twitch', 'تويتش'], ['kick', 'كيك'], ['youtube', 'يوتيوب']].map(([v, t]) => `<button class="chip ${S.plat === v ? 'on' : ''}" data-sp="${v}" aria-pressed="${S.plat === v}">${t}</button>`).join('')}</div></div><div id="ss-rows">${sRows()}</div></div><aside class="sticky" id="ss-det" aria-live="polite">${sDetail()}</aside></div>`;
  }
  function sSubscribe(v) {
    sstops.forEach((f) => f()); sstops = []; S.ready = false; S.err = null; if (!O.store()) { $('#ss-main', v).innerHTML = sBody(); return; }
    let n = 0; const one = () => { if (++n >= 2) { S.ready = true; repaintS(v, true); } }; const f = { a: true, b: true };
    const upd = O.throttle(() => repaintS(v), 500);
    sstops.push(O.sub(v, 'opsSessions', (val, err) => { if (err) { S.err = err.message || 'خطأ'; $('#ss-main', v).innerHTML = sBody(); return; } S.sess = val || {}; if (f.a) { f.a = false; one(); } else upd(); }, { orderBy: 'last', startAt: Date.now() - 24 * 3600e3 }));
    sstops.push(O.sub(v, 'opsEvents', (val) => { S.ev = val || {}; if (f.b) { f.b = false; one(); } else upd(); }, { limitLast: 400 }));
  }
  function repaintS(v, full) { const m = $('#ss-main', v); if (!m) return; if (full || !$('#ss-rows', m)) { m.innerHTML = sBody(); return; } $('#ss-rows', m).innerHTML = sRows(); const d = $('#ss-det', m); if (d) d.innerHTML = sDetail(); }
  Studio.actions['ss-retry'] = () => { const v = document.getElementById('view-sessions'); if (v) sSubscribe(v); };
  Studio.actions['ss-export'] = () => { const s = sList().find((x) => x.sid === S.sel); if (s) O.download('session-' + s.sid + '.json', JSON.stringify({ session: s, events: O.list(S.ev).filter((e) => e.sid === s.sid) }, null, 2)); };
  Studio.register({ id: 'sessions', title: 'مراقب البثوث', en: 'STREAMER SESSION MONITOR', icon: 'mic', desc: 'تابع جلسات الستريمرز والألعاب والمشاركين بشكل مباشر',
    html() { if (L.prefill && L.prefill.sel) { S.sel = L.prefill.sel; L.prefill = {}; } return `<div id="ss-main">${sBody()}</div>`; },
    mount(v) {
      sSubscribe(v);
      v.addEventListener('input', (e) => { if (e.target.id === 'ss-q') { S.q = e.target.value.trim(); const r = $('#ss-rows', v); if (r) r.innerHTML = sRows(); } });
      v.addEventListener('click', (e) => { const p = e.target.closest('[data-sp]'); if (p) { S.plat = p.dataset.sp; repaintS(v, true); return; } const b = e.target.closest('[data-ss]'); if (b) { S.sel = b.dataset.ss; const r = $('#ss-rows', v); if (r) r.innerHTML = sRows(); const d = $('#ss-det', v); if (d) d.innerHTML = sDetail(); if (innerWidth < 980 && d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    } });
})();
