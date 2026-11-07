/* صحة الأنظمة: فحوصات حيّة من متصفح المالك (طالما القسم مفتوح) تُحفظ مجمّعة في RTDB (opsHealth) لبناء السجل والمخططات.
 *
 * مصادر الإشارة (لا شيء مفترض):
 *   - خادم الجسر: GET /health (أعداد حقيقية: غرف/عملاء/حالات المنصات/نجاح اتصالات تيك توك) وإلا /healthz.
 *   - Firebase Auth: تحديث رمز المستخدم الحالي (طلب شبكة فعلي).  Firestore: قراءة من السيرفر.  RTDB: كتابة ثم قراءة.
 *   - ديسكورد: طلب no-cors (ينجح إن كان السيرفر يستجيب، ويفشل عند انقطاع الشبكة/التوقف).
 * حدود معروفة: لا مراقبة خلفية مستقلة — الفحص يعمل أثناء فتح هذا القسم؛ المنصات الخارجية (YouTube/Twitch/Kick/TikTok)
 * تُقرأ من حالة غرف الجسر فقط ولا توجد لها نقطة صحة عامة، فتظهر «غير معروفة» عند عدم وجود بث عليها. */
(function () {
  'use strict';
  const { esc, icon, fmt, $, $$ } = UI; const O = window.Ops; const L = Studio.live; const G = L.G;
  const PROBE_MS = 60000; const SLOW_MS = 2500; const STALE_MS = 5 * 60000;
  const SVC = [
    { id: 'bridge1', name: 'خادم ربط البث (الأساسي)', ic: 'link', kind: 'bridge', idx: 0 },
    { id: 'bridge2', name: 'خادم ربط البث (الاحتياطي)', ic: 'link', kind: 'bridge', idx: 1 },
    { id: 'tiktok', name: 'TikTok', ic: 'radio', kind: 'plat', plat: 'tiktok' },
    { id: 'youtube', name: 'YouTube', ic: 'radio', kind: 'plat', plat: 'youtube' },
    { id: 'twitch', name: 'Twitch', ic: 'radio', kind: 'plat', plat: 'twitch' },
    { id: 'kick', name: 'Kick', ic: 'radio', kind: 'plat', plat: 'kick' },
    { id: 'auth', name: 'Firebase Authentication', ic: 'lock', kind: 'auth' },
    { id: 'firestore', name: 'Firestore', ic: 'layers', kind: 'fs' },
    { id: 'rtdb', name: 'Realtime Database', ic: 'bolt', kind: 'rtdb' },
    { id: 'events', name: 'استقبال أحداث الألعاب', ic: 'gamepad', kind: 'events' },
    { id: 'discord', name: 'خادم ديسكورد', ic: 'chat', kind: 'discord' }
  ];
  const STATUS = { up: ['تعمل', 'ok'], slow: ['أداء منخفض', 'warn'], down: ['متوقفة', 'bad'], unknown: ['غير معروفة', ''], maint: ['صيانة', 'violet'] };
  const H = { hist: {}, state: {}, agg: {}, recent: {}, inc: {}, log: {}, bridge: [null, null], period: '24h', err: null, ready: false, last: 0, running: false, sel: null };
  const bucketOf = (t) => Math.floor(t / 3600e3);
  const PERIODS = { '1h': 3600e3, '24h': 86400e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3 };

  const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  const timed = async (fn) => { const t0 = performance.now(); try { const r = await fn(); return Object.assign({ ok: true, ms: Math.round(performance.now() - t0) }, r || {}); } catch (e) { return { ok: false, ms: Math.round(performance.now() - t0), note: String(e && e.message || e).slice(0, 120) }; } };

  async function probeBridge(idx) {
    const list = G('TIKTOK_BRIDGE_SERVERS') || []; const ws = list[idx]; if (!ws) return { ok: null, note: 'غير مهيّأ' };
    const origin = ws.replace(/^ws/, 'http').replace(/\/ws$/, '');
    const r = await timed(async () => { const res = await timeout(fetch(origin + '/health', { cache: 'no-store' }), 7000); if (!res.ok) throw new Error('HTTP ' + res.status); return { data: await res.json() }; });
    if (!r.ok) { const r2 = await timed(async () => { const res = await timeout(fetch(origin + '/healthz', { cache: 'no-store' }), 5000); if (!res.ok) throw new Error('HTTP ' + res.status); return { data: await res.json(), light: true }; }); return r2.ok ? r2 : r; }
    return r;
  }
  function fromBridge(plat) {
    const d = (H.bridge[0] && H.bridge[0].ok ? H.bridge[0] : H.bridge[1]); const data = d && d.data; if (!data) return { ok: null, note: 'لا بيانات من خادم الجسر' };
    if (data.light) return { ok: null, note: 'الخادم يرد لكن بلا تفاصيل المنصات' };
    const p = data.platforms && data.platforms[plat];
    if (plat === 'tiktok' && data.tiktok) {
      const t = data.tiktok; const rate = t.connectAttempts ? Math.round((t.connectsOk / t.connectAttempts) * 100) : null;
      if (!p && !t.connectAttempts) return { ok: null, note: 'لا بثوث ولا محاولات اتصال منذ إقلاع الخادم', data: { rate } };
      const conn = p ? (p.states.connected || 0) : 0; const rooms = p ? p.rooms : 0;
      const bad = (rate != null && rate < 60 && t.connectAttempts >= 5);
      return { ok: !bad, slow: rate != null && rate < 85 && t.connectAttempts >= 5, note: 'نجاح الاتصال ' + (rate == null ? '—' : rate + '٪') + ' · غرف ' + rooms + ' · متصلة ' + conn + ' · تخلّى ' + (t.gaveUp || 0), data: { rate, rooms, conn, clients: p ? p.clients : 0 } };
    }
    if (!p || !p.rooms) return { ok: null, note: 'لا بثوث على هذه المنصة حالياً — لا دليل كافٍ للحكم', data: { rooms: 0, clients: 0 } };
    const conn = p.states.connected || 0; const total = p.rooms; const ratio = conn / total;
    return { ok: conn > 0, slow: ratio < 1, note: 'غرف ' + total + ' · متصلة ' + conn + ' · حالات: ' + Object.keys(p.states).map((k) => k + '=' + p.states[k]).join('،'), data: { rooms: total, conn, clients: p.clients } };
  }
  async function probe(s) {
    const f = Ops.host.__fb; const me = O.me();
    switch (s.kind) {
      case 'bridge': { const r = await probeBridge(s.idx); H.bridge[s.idx] = r; return r.ok === null ? r : { ok: r.ok, ms: r.ms, note: r.ok ? ('غرف ' + (r.data.rooms != null ? r.data.rooms : '—') + ' · عملاء ' + (r.data.wsClients != null ? r.data.wsClients : '—')) : r.note, data: r.data }; }
      case 'plat': return fromBridge(s.plat);
      case 'auth': if (!f || !f.auth || !f.auth.currentUser) return { ok: null, note: 'لا جلسة مستخدم' }; return timed(async () => { await timeout(f.auth.currentUser.getIdToken(true), 8000); });
      case 'fs': if (!f || !f.getDocFromServer || !me.uid) return { ok: null, note: 'غير متاح' }; return timed(async () => { try { await timeout(f.getDocFromServer(f.doc(f.db, 'presence', me.uid)), 8000); } catch (e) { if (e && e.code === 'permission-denied') return; throw e; } });
      case 'rtdb': { const st = O.store(); if (!st) return { ok: null, note: 'RTDB غير مهيّأة' }; return timed(async () => { await timeout(st.get('opsHealth/ping'), 8000); }); }
      case 'events': { const st = O.store(); if (!st) return { ok: null, note: 'RTDB غير مهيّأة' }; return timed(async () => { const v = Date.now(); await timeout(st.set('opsHealth/ping', { t: O.SV(), v }), 8000); const back = await timeout(st.get('opsHealth/ping'), 8000); if (!back || back.v !== v) throw new Error('القيمة المقروءة لا تطابق المكتوبة'); }); }
      case 'discord': { const u = G('DISCORD_RELAY_SERVER_URL'); if (!u) return { ok: null, note: 'غير مهيّأ' }; return timed(async () => { await timeout(fetch(u + '/healthz', { mode: 'no-cors', cache: 'no-store' }), 8000); }); }
    }
    return { ok: null };
  }

  function statusOf(s) {
    const st = H.state[s.id] || {}; if (st.maint) return 'maint';
    const h = H.hist[s.id] || []; const last = h[h.length - 1];
    if (!last || Date.now() - last.t > STALE_MS) return st.status && !last ? 'unknown' : 'unknown';
    if (last.ok === null) return 'unknown';
    const l3 = h.slice(-3); if (l3.length >= 3 && l3.every((x) => x.ok === false)) return 'down';
    if (last.ok === false) return 'slow';
    if (last.slow || last.ms > SLOW_MS) return 'slow';
    if (h.slice(-5).filter((x) => x.ok === false).length >= 2) return 'slow';
    return 'up';
  }

  async function runProbes(v, manual) {
    if (H.running) return; H.running = true; const st = O.store(); const now = Date.now();
    try {
      for (const s of SVC.filter((x) => x.kind === 'bridge')) await doOne(s, st, now);
      await Promise.all(SVC.filter((x) => x.kind !== 'bridge').map((s) => doOne(s, st, now)));
      H.last = Date.now(); H.err = null;
    } catch (e) { H.err = e.message; }
    H.running = false; H.ready = true; if (v && v.isConnected) paint(v); if (manual) UI.toast('اكتمل الفحص');
  }
  async function doOne(s, st, now) {
    const r = await probe(s).catch((e) => ({ ok: false, ms: 0, note: String(e.message || e) }));
    const rec = { t: Date.now(), ok: r.ok, ms: r.ms || 0, note: r.note || '', slow: !!r.slow, data: r.data };
    const h = (H.hist[s.id] = H.hist[s.id] || []); h.push(rec); if (h.length > 30) h.shift();
    const status = statusOf(s); const prev = (H.state[s.id] || {}).status;
    if (!st || !O.owner()) return;
    const SVV = O.SV(); const b = bucketOf(rec.t);
    st.txn('opsHealth/agg/' + s.id + '/' + b, (c) => { c = c || { n: 0, ok: 0, fail: 0, lat: 0, max: 0, unk: 0 }; c.n++; if (rec.ok === true) { c.ok++; c.lat += rec.ms; c.max = Math.max(c.max, rec.ms); } else if (rec.ok === false) c.fail++; else c.unk++; return c; }).catch(() => {});
    st.set('opsHealth/recent/' + s.id + '/' + (Math.floor(rec.t / PROBE_MS) % 60), { t: rec.t, ok: rec.ok, ms: rec.ms }).catch(() => {});
    const patch = { status, last: SVV, ms: rec.ms, note: rec.note.slice(0, 160) }; if (rec.ok === true) patch.lastOk = SVV;
    st.update('opsHealth/state/' + s.id, patch).catch(() => {});
    if (prev !== status) {
      st.push('opsHealth/log/' + s.id, { t: SVV, from: prev || '', to: status, note: rec.note.slice(0, 160) }).catch(() => {});
      const cur = H.state[s.id] || {};
      if (status === 'down' && !cur.inc) st.push('opsHealth/incidents', { svc: s.id, name: s.name, state: 'open', start: SVV, cause: rec.note || 'فشل متتالٍ في ثلاثة فحوصات' }).then((id) => { st.update('opsHealth/state/' + s.id, { inc: id }).catch(() => {}); }).catch(() => {});
      else if ((status === 'up' || status === 'slow') && cur.inc) { st.update('opsHealth/incidents/' + cur.inc, { state: 'closed', end: SVV }).catch(() => {}); st.update('opsHealth/state/' + s.id, { inc: null }).catch(() => {}); }
    }
    H.state[s.id] = Object.assign(H.state[s.id] || {}, { status });
  }

  /* ---------- مقاييس الفترة ---------- */
  function periodStats(id) {
    const span = PERIODS[H.period]; const from = Date.now() - span; let n = 0, ok = 0, fail = 0, lat = 0, latN = 0; const series = [];
    if (H.period === '1h') {
      const rs = O.list(H.recent[id]).filter((x) => x.t >= from).sort((a, b) => a.t - b.t);
      rs.forEach((x) => { n++; if (x.ok === true) { ok++; lat += x.ms; latN++; } else if (x.ok === false) fail++; series.push(x.ok === true ? x.ms : null); });
    } else {
      const bs = O.list(H.agg[id]).filter((x) => +x._k >= bucketOf(from)).sort((a, b) => a._k - b._k);
      bs.forEach((x) => { n += x.n; ok += x.ok; fail += x.fail; lat += x.lat; latN += x.ok; series.push(x.ok ? Math.round(x.lat / x.ok) : null); });
    }
    const outages = O.list(H.inc).filter((i) => i.svc === id && i.start >= from).length;
    return { n, ok, fail, avg: latN ? Math.round(lat / latN) : null, rate: (ok + fail) ? O.pct(ok, ok + fail) : null, outages, series };
  }

  function card(s) {
    const k = statusOf(s); const [t, c] = STATUS[k]; const h = H.hist[s.id] || []; const last = h[h.length - 1]; const stt = H.state[s.id] || {}; const ps = periodStats(s.id);
    const lastOk = [...h].reverse().find((x) => x.ok === true); const lastFail = [...h].reverse().find((x) => x.ok === false);
    const aff = last && last.data ? (last.data.clients != null ? last.data.clients : (last.data.wsClients != null ? last.data.wsClients : null)) : null;
    return `<article class="panel stack-s" data-fx="up"><div class="ops-bar" style="margin:0"><span class="gi" style="display:inline-grid;place-items:center;width:34px;height:34px;border-radius:10px;background:rgba(167,139,255,.14)">${icon(s.ic)}</span><h3 class="h2 grow" style="font-size:19px;margin:0">${esc(s.name)}</h3>${UI.badge(t, c)}</div>
      <dl class="ops-kv"><dt>آخر اختبار ناجح</dt><dd>${esc(lastOk ? O.ago(lastOk.t) : (stt.lastOk ? 'سابق' : '—'))}</dd><dt>وقت آخر اختبار</dt><dd>${esc(last ? O.clock(last.t) : '—')}</dd><dt>زمن الاستجابة</dt><dd class="num">${last && last.ok !== null ? fmt(last.ms) + ' م.ث' : '—'}</dd><dt>الأخطاء (${esc(({ '1h': 'ساعة', '24h': '٢٤ ساعة', '7d': '٧ أيام', '30d': '٣٠ يوماً' })[H.period])})</dt><dd class="num">${fmt(ps.fail)}</dd><dt>نسبة النجاح</dt><dd class="num">${esc(O.pctText(ps.rate))}</dd><dt>اتصالات متأثرة</dt><dd>${aff == null ? '—' : fmt(aff)}</dd></dl>
      ${O.spark(ps.series, { label: 'زمن الاستجابة ' + s.name, color: c === 'bad' ? '#EF4444' : c === 'warn' ? '#F59E0B' : '#A78BFA' })}
      <p class="muted small" style="margin:0">${esc(last && last.note ? last.note : k === 'unknown' ? 'لا توجد بيانات حديثة كافية للحكم.' : '')}${lastFail && k !== 'up' ? ' · آخر عطل: ' + esc(O.ago(lastFail.t) + ' — ' + (lastFail.note || '')) : ''}</p>
      <div class="cluster"><button class="btn btn-ghost btn-sm" data-hl="${s.id}">${icon('list')}سجل الحالة</button><button class="btn btn-quiet btn-sm" data-hm="${s.id}" aria-pressed="${!!stt.maint}">${icon('settings')}${stt.maint ? 'إنهاء الصيانة' : 'وضع صيانة'}</button></div></article>`;
  }
  function summary() {
    const arr = SVC.map((s) => statusOf(s)); const c = (k) => arr.filter((x) => x === k).length; const openInc = O.list(H.inc).filter((i) => i.state === 'open').length;
    return `<div class="ops-grid">${[['check', 'تعمل', c('up'), 'ok'], ['alert', 'أداء منخفض', c('slow'), 'warn'], ['ban', 'متوقفة', c('down'), 'bad'], ['search', 'غير معروفة', c('unknown'), ''], ['bell', 'أعطال مفتوحة', openInc, openInc ? 'bad' : '']].map(([ic, t, n, k]) => `<div class="panel ops-kpi"><span class="l">${icon(ic)} ${t}</span><span class="v num">${fmt(n)}</span></div>`).join('')}</div>`;
  }
  function charts() {
    const ids = SVC.filter((s) => ['bridge1', 'rtdb', 'firestore', 'auth'].includes(s.id));
    const sum = SVC.map((s) => periodStats(s.id));
    const tot = sum.reduce((a, x) => ({ ok: a.ok + x.ok, fail: a.fail + x.fail, out: a.out + x.outages }), { ok: 0, fail: 0, out: 0 });
    return `<div class="panel"><div class="ops-bar"><div class="section-label grow" style="margin:0">مخططات الأداء</div><div class="ops-tabs" role="group" aria-label="الفترة">${Object.keys(PERIODS).map((p) => `<button class="chip ${H.period === p ? 'on' : ''}" data-hp="${p}" aria-pressed="${H.period === p}">${({ '1h': 'آخر ساعة', '24h': 'آخر ٢٤ ساعة', '7d': 'آخر ٧ أيام', '30d': 'آخر ٣٠ يوماً' })[p]}</button>`).join('')}</div></div>
      <div class="ops-grid">${ids.map((s) => { const p = periodStats(s.id); return `<div class="stack-s"><b>${esc(s.name)}</b>${O.spark(p.series, { label: 'متوسط زمن الاستجابة' })}<span class="muted small">نجاح ${esc(O.pctText(p.rate))} · متوسط ${p.avg == null ? '—' : fmt(p.avg) + ' م.ث'} · أخطاء ${fmt(p.fail)} · انقطاعات ${fmt(p.outages)}</span></div>`; }).join('')}</div>
      <p class="ops-note" style="margin-top:12px">إجمالي فحوصات الفترة: ناجحة ${fmt(tot.ok)} · فاشلة ${fmt(tot.fail)} · انقطاعات مؤكدة ${fmt(tot.out)}. التغطية مرتبطة بفترات فتح هذا القسم (لا مراقبة خلفية مستقلة)؛ الفجوات تُحسب «غير معروفة» لا «تعمل».</p></div>`;
  }
  function incidents() {
    const L2 = O.list(H.inc).sort((a, b) => (b.start || 0) - (a.start || 0)).slice(0, 12);
    return `<div class="panel"><div class="section-label">خط زمني للأعطال</div>${L2.length ? `<table class="ops-table"><caption class="sr-only">الأعطال</caption><thead><tr><th>الخدمة</th><th>بدأ</th><th>آخر تحديث</th><th>التعافي</th><th>السبب</th></tr></thead><tbody>${L2.map((i) => `<tr><td>${esc(i.name || i.svc)}</td><td>${esc(O.date(i.start))}</td><td>${esc(O.date(i.end || H.last))}</td><td>${i.state === 'open' ? UI.badge('مفتوح', 'bad') : esc('عادت بعد ' + O.dur((i.end || 0) - (i.start || 0)))}</td><td>${esc(i.cause || '')}</td></tr>`).join('')}</tbody></table>` : O.empty('check', 'لا أعطال مسجّلة', 'لم تُسجَّل أي خدمة متوقفة ضمن البيانات المتاحة.')}</div>`;
  }
  function body() {
    if (!O.owner()) return O.denied(); if (H.err && !H.ready) return O.error(H.err, 'hl-retry'); if (!H.ready) return O.skel(6);
    return `${summary()}<div class="ops-grid" style="margin-top:16px;grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr))">${SVC.map(card).join('')}</div><div class="stack" style="margin-top:16px">${charts()}${incidents()}</div>`;
  }
  function bar() { return `<div class="ops-bar" id="hl-bar"><span class="live-tag ${H.running ? '' : 'off'}"><span class="ops-dot ${H.running ? 'warn' : 'ok'}"></span>${H.running ? 'جارِ الفحص…' : 'الفحص الدوري كل ٦٠ ثانية'}</span><span class="muted small">آخر فحص: <b class="num">${esc(O.clock(H.last))}</b></span><span class="grow"></span><button class="btn btn-ghost btn-sm" data-act="hl-now">${icon('refresh')}افحص الآن</button></div>`; }
  function paint(v) { const b = $('#hl-bar', v), m = $('#hl-main', v); if (b) b.outerHTML = bar(); if (m) m.innerHTML = body(); }

  function logModal(s) {
    const st = O.store(); const open = (lg) => { const L3 = O.list(lg).sort((a, b) => b.t - a.t).slice(0, 50); UI.modal({ title: 'سجل حالة: ' + s.name, wide: true, html: L3.length ? `<table class="ops-table"><thead><tr><th>الوقت</th><th>من</th><th>إلى</th><th>ملاحظة</th></tr></thead><tbody>${L3.map((x) => `<tr><td class="num">${esc(O.date(x.t))}</td><td>${esc((STATUS[x.from] || ['—'])[0])}</td><td>${esc((STATUS[x.to] || ['—'])[0])}</td><td>${esc(x.note || '')}</td></tr>`).join('')}</tbody></table>` : O.empty('list', 'لا تغيّرات حالة مسجّلة', 'يُسجَّل كل انتقال بين الحالات هنا.') }); };
    if (!st) { open(null); return; } st.get('opsHealth/log/' + s.id).then(open, () => open(null));
  }

  Studio.actions['hl-now'] = () => { const v = document.getElementById('view-health'); if (v) { runProbes(v, true); paint(v); } };
  Studio.actions['hl-retry'] = Studio.actions['hl-now'];
  Studio.register({ id: 'health', title: 'صحة الأنظمة', en: 'SYSTEM HEALTH MONITOR', icon: 'shield', desc: 'راقب استقرار خدمات احسمها واكتشف الأعطال قبل أن تؤثر على اللاعبين',
    html() { return `${bar()}<div id="hl-main" aria-live="polite">${body()}</div>`; },
    mount(v) {
      const st = O.store();
      if (st) {
        H.hist = H.hist; ['agg', 'recent', 'inc', 'state'].forEach((k) => {
          const path = { agg: 'opsHealth/agg', recent: 'opsHealth/recent', inc: 'opsHealth/incidents', state: 'opsHealth/state' }[k];
          O.sub(v, path, O.throttle((val) => { if (k === 'state') { Object.keys(val || {}).forEach((id) => { H.state[id] = Object.assign(H.state[id] || {}, val[id]); }); } else H[k] = val || {}; if (v.isConnected && H.ready) paint(v); }, 800), k === 'inc' ? { limitLast: 100 } : {});
        });
      }
      runProbes(v); O.every(v, PROBE_MS, () => runProbes(v));
      v.addEventListener('click', (e) => {
        const p = e.target.closest('[data-hp]'); if (p) { H.period = p.dataset.hp; paint(v); return; }
        const l = e.target.closest('[data-hl]'); if (l) { logModal(SVC.find((s) => s.id === l.dataset.hl)); return; }
        const m = e.target.closest('[data-hm]'); if (m) { const s = SVC.find((x) => x.id === m.dataset.hm); const cur = !!(H.state[s.id] || {}).maint; const stt = O.store();
          UI.confirm({ title: cur ? 'إنهاء وضع الصيانة' : 'تفعيل وضع الصيانة', text: cur ? 'ستعود الخدمة «' + s.name + '» لتُقيَّم بالفحوصات.' : 'ستظهر الخدمة «' + s.name + '» بحالة صيانة ولن تُنشأ لها تنبيهات.', label: cur ? 'إنهاء' : 'تفعيل' }).then((ok) => { if (!ok) return; H.state[s.id] = Object.assign(H.state[s.id] || {}, { maint: !cur }); if (stt) { stt.update('opsHealth/state/' + s.id, { maint: !cur }).catch(() => {}); O.audit('health.maintenance', { svc: s.id, on: !cur }); } paint(v); }); }
      });
    } });
  window.OpsHealth = { SVC, statusOf: (id) => statusOf(SVC.find((s) => s.id === id)), _H: H, _classify: statusOf, _probe: probe, _run: runProbes };
})();
