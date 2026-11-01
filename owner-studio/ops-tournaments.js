/* صانع البطولات: بطولة خروج المغلوب (Single Elimination) على الألعاب المتوافقة فعلياً (طبقة Compatibility).
 * البيانات: opsTournaments/{tid} (المعلومات) + /participants + /matches + /log + /paid. كل اعتماد نتيجة أو صرف جائزة
 * يمرّ بمعاملة (transaction) تمنع الاحتساب مرتين. النتيجة «معتمدة» فقط بعد ضغط المالك (مع اقتراح تلقائي من اللعبة). */
(function () {
  'use strict';
  const { esc, icon, fmt, $, $$ } = UI; const O = window.Ops; const L = Studio.live; const G = L.G; const H = O.host;

  /* ---------- طبقة التوافق: ما تدعمه كل لعبة فعلاً ---------- */
  const COMPAT = {
    xo: { title: 'إكس أو', perMatch: 2, formats: ['single_elim'], bestOf: [1, 3, 5], launch: 'xo', note: 'مواجهة ثنائية (لاعب ضد لاعب) داخل اللعبة الأصلية' }
  };
  const FORMATS = { single_elim: 'خروج المغلوب', groups: 'مجموعات ثم تصفيات', league: 'دوري نقاط' };
  const STATUS = { registration: ['التسجيل مفتوح', 'ok'], closed: ['التسجيل مغلق', 'warn'], running: ['جارية', 'violet'], completed: ['مكتملة', 'ok'], cancelled: ['ملغاة', 'bad'], archived: ['مؤرشفة', ''] };
  const TABS = [['upcoming', 'القادمة'], ['running', 'الجارية'], ['completed', 'المكتملة'], ['archived', 'المؤرشفة']];
  const M = { list: {}, sel: null, det: {}, tab: 'upcoming', ready: false, err: null };
  let stops = []; let detStop = null;

  /* ---------- منطق جدول المواجهات (نقي ويُختبر) ---------- */
  const pow2 = (n) => { let p = 2; while (p < n) p *= 2; return p; };
  function seedOrder(size) { let o = [1, 2]; while (o.length < size) { const m = o.length * 2 + 1; o = o.flatMap((x) => [x, m - x]); } return o; }
  const mid = (r, i) => 'r' + r + 'm' + i;
  function buildBracket(players) { // players مرتّبة حسب الـSeed (الأول = الأقوى)
    const n = players.length; if (n < 2) throw new Error('يلزم مشاركان على الأقل');
    const size = pow2(n); const R = Math.log2(size); const slots = seedOrder(size).map((s) => players[s - 1] || null); const mt = {};
    for (let r = 1; r <= R; r++) for (let i = 0; i < size / Math.pow(2, r); i++) mt[mid(r, i)] = { r, i, a: null, b: null, status: 'pending', next: r < R ? { m: mid(r + 1, Math.floor(i / 2)), s: i % 2 ? 'b' : 'a' } : null };
    for (let i = 0; i < size / 2; i++) { const m = mt[mid(1, i)]; m.a = slots[2 * i]; m.b = slots[2 * i + 1]; }
    // أدوار الراحة (Bye): المتأهل تلقائي، ثم نمرّر لأعلى
    const settle = () => { let ch = true; while (ch) { ch = false; Object.values(mt).forEach((m) => {
      if (m.status !== 'pending') return;
      if (m.a && m.b) { m.status = 'ready'; ch = true; return; }
      if (m.r === 1 && (m.a || m.b)) { const w = m.a || m.b; finish(mt, m, w, { bye: true }); ch = true; }
    }); } };
    settle(); return mt;
  }
  function finish(mt, m, winner, extra) {
    m.status = extra && extra.bye ? 'bye' : 'done'; m.winner = winner.id; m.result = Object.assign({ winner: winner.id }, extra || {});
    if (m.next) { const nx = mt[m.next.m]; nx[m.next.s] = winner; if (nx.a && nx.b && nx.status === 'pending') nx.status = 'ready'; }
  }
  function standings(mt, players) {
    const R = Math.max.apply(null, Object.values(mt).map((m) => m.r)); const fin = mt[mid(R, 0)]; if (!fin || fin.status !== 'done') return null;
    const byId = {}; players.forEach((p) => { byId[p.id] = p; });
    const loser = (m) => (m.a && m.b ? (m.a.id === m.winner ? m.b : m.a) : null);
    const out = [{ place: 1, p: byId[fin.winner] || (fin.a && fin.a.id === fin.winner ? fin.a : fin.b) }, { place: 2, p: loser(fin) }];
    if (R >= 2) Object.values(mt).filter((m) => m.r === R - 1 && m.status === 'done').forEach((m) => { const l = loser(m); if (l) out.push({ place: 3, p: l }); });
    return out;
  }
  const handleKey = (h) => String(h || '').trim().replace(/^@+/, '').replace(/^(tiktok|twitch|kick|youtube)[:_]/i, '').toLowerCase();

  /* ---------- مسارات التخزين ---------- */
  const P = (tid, sub) => 'opsTournaments/' + tid + (sub ? '/' + sub : '');
  const st = () => O.store();
  const tlog = (tid, text) => st() && st().push(P(tid, 'log'), { t: O.SV(), by: (O.me().email || '').slice(0, 60), text: String(text).slice(0, 200) }).catch(() => {});

  /* ---------- عمليات الحالة (كلها بمعاملات/تحقق) ---------- */
  async function startTournament(tid) {
    const T = M.det[tid]; if (!T || !T.meta) throw new Error('بطولة غير موجودة');
    if (!['registration', 'closed'].includes(T.meta.status)) throw new Error('لا يمكن بدء بطولة في حالتها الحالية');
    const reg = O.list(T.participants).filter((p) => p.status === 'registered').sort((a, b) => (a.seed || 9999) - (b.seed || 9999) || (a.at || 0) - (b.at || 0));
    if (reg.length < 2) throw new Error('يلزم مشاركان مسجَّلان على الأقل');
    const max = +T.meta.max || reg.length; const players = reg.slice(0, max).map((p, i) => ({ id: p._k, name: p.name, handle: p.handle || '', seed: i + 1 }));
    const bracket = buildBracket(players);
    const res = await st().txn(P(tid, 'meta'), (m) => { if (!m || !['registration', 'closed'].includes(m.status)) return undefined; return Object.assign({}, m, { status: 'running', startedAt: O.SV(), bracketSize: pow2(players.length), nPlayers: players.length }); });
    if (!res.committed) throw new Error('تغيّرت حالة البطولة، أعد المحاولة');
    await st().set(P(tid, 'matches'), bracket); await Promise.all(players.map((p) => st().update(P(tid, 'participants/' + p.id), { seed: p.seed })));
    await tlog(tid, 'بدأت البطولة بـ ' + players.length + ' مشاركاً'); await O.audit('tournament.start', { tid, n: players.length }); return bracket;
  }
  /* اعتماد نتيجة: معاملة على المباراة نفسها — النتيجة تُعتمد مرة واحدة فقط (إعادة الإرسال لا تُحتسب) */
  async function approve(tid, mId, winnerId, scores, source) {
    const T = M.det[tid]; const meta = T.meta; if (meta.status !== 'running') throw new Error('البطولة ليست جارية');
    const key = tid + ':' + mId; let outcome = 'none';
    const res = await st().txn(P(tid, 'matches/' + mId), (m) => {
      if (!m) return undefined; if (m.status === 'done') { outcome = (m.winner === winnerId) ? 'dup' : 'conflict'; return undefined; }
      if (m.status !== 'ready') { outcome = 'notready'; return undefined; }
      if (!m.a || !m.b || ![m.a.id, m.b.id].includes(winnerId)) { outcome = 'badwinner'; return undefined; }
      outcome = 'ok'; return Object.assign({}, m, { status: 'done', winner: winnerId, result: { winner: winnerId, scoreA: scores ? scores[0] : null, scoreB: scores ? scores[1] : null, by: (O.me().email || '').slice(0, 60), at: O.SV(), src: source || 'owner', key } });
    });
    if (outcome === 'dup') return { dup: true }; if (outcome === 'conflict') throw new Error('هذه المباراة اعتُمدت سابقاً بفائز آخر'); if (outcome === 'notready') throw new Error('المباراة غير جاهزة'); if (outcome === 'badwinner') throw new Error('الفائز ليس من لاعبي المباراة'); if (!res.committed) throw new Error('تعذّر الاعتماد');
    const m = res.value; await advance(tid, mId, m); await tlog(tid, 'اعتماد نتيجة ' + mId + ' — الفائز ' + ((m.a && m.a.id === winnerId ? m.a : m.b).name)); await O.audit('tournament.result', { tid, mId, winnerId, source: source || 'owner' }); await checkComplete(tid); return { ok: true };
  }
  async function advance(tid, mId, m) { // يمرّر الفائز للمباراة التالية (idempotent)
    const winner = m.a && m.a.id === m.winner ? m.a : m.b; if (!m.next || !winner) return;
    await st().txn(P(tid, 'matches/' + m.next.m), (nx) => { if (!nx) return undefined; const cur = nx[m.next.s]; if (cur && cur.id === winner.id) return undefined; nx = Object.assign({}, nx); nx[m.next.s] = winner; if (nx.a && nx.b && nx.status === 'pending') nx.status = 'ready'; return nx; });
  }
  async function reconcile(tid) { // يعيد تمرير كل المباريات المنتهية (استعادة بعد انقطاع بين الخطوتين)
    const ms = await st().get(P(tid, 'matches')); if (!ms) return; for (const k of Object.keys(ms)) { const m = ms[k]; if (m.status === 'done' || m.status === 'bye') await advance(tid, k, m); }
  }
  async function checkComplete(tid) {
    const ms = await st().get(P(tid, 'matches')); if (!ms) return; const R = Math.max.apply(null, Object.values(ms).map((m) => m.r)); const fin = ms[mid(R, 0)];
    if (fin && fin.status === 'done') { await st().txn(P(tid, 'meta'), (m) => { if (!m || m.status !== 'running') return undefined; return Object.assign({}, m, { status: 'completed', completedAt: O.SV(), champion: fin.winner }); }); await tlog(tid, 'اكتملت البطولة'); }
  }
  async function withdraw(tid, pid, why) {
    const T = M.det[tid]; const p = T.participants && T.participants[pid]; if (!p) return;
    await st().update(P(tid, 'participants/' + pid), { status: why === 'dq' ? 'disqualified' : 'withdrawn', at2: O.SV() });
    if (T.meta.status === 'running') { // انسحاب أثناء البطولة: المنافس يتأهل بالانسحاب (سياسة walkover)
      const ms = await st().get(P(tid, 'matches')); for (const k of Object.keys(ms || {})) { const m = ms[k]; if (m.status === 'ready' && ((m.a && m.a.id === pid) || (m.b && m.b.id === pid))) { const opp = m.a.id === pid ? m.b : m.a; const res = await st().txn(P(tid, 'matches/' + k), (x) => { if (!x || x.status !== 'ready') return undefined; return Object.assign({}, x, { status: 'done', winner: opp.id, result: { winner: opp.id, walkover: true, at: O.SV(), by: (O.me().email || '').slice(0, 60) } }); }); if (res.committed) { await advance(tid, k, res.value); } } }
      await checkComplete(tid);
    } else if (T.meta.status !== 'completed') { // قبل البدء: ترقية أول منتظر
      const w = O.list(T.participants).filter((x) => x.status === 'waitlist').sort((a, b) => (a.at || 0) - (b.at || 0))[0]; if (w) await st().update(P(tid, 'participants/' + w._k), { status: 'registered' });
    }
    await tlog(tid, (why === 'dq' ? 'استبعاد ' : 'انسحاب ') + p.name); await O.audit('tournament.withdraw', { tid, pid, why });
  }
  async function payout(tid, place, pid) { // صرف جائزة مرة واحدة: حجز ← منح ← تأكيد
    const T = M.det[tid]; const prize = T.meta.prizes && T.meta.prizes[place]; if (!prize || prize.type !== 'frame') throw new Error('لا جائزة معرّفة لهذا المركز'); const p = T.participants[pid]; if (!p) throw new Error('المشارك غير موجود');
    const key = place + ':' + pid; let state = 'none';
    const r = await st().txn(P(tid, 'paid/' + key), (c) => { if (c && (c.state === 'paid' || c.state === 'paying')) { state = c.state; return undefined; } state = 'reserved'; return { state: 'paying', at: O.SV(), frame: prize.ref, by: (O.me().email || '').slice(0, 60) }; });
    if (state === 'paid') return { dup: true }; if (state === 'paying') throw new Error('الصرف قيد التنفيذ أو لم يكتمل — راجع السجل ثم أعد التعيين يدوياً');
    try {
      const target = p.username || p.handle || p.name; const keys = await H.ownerResolveGrantTargetKeys(target); if (!keys.length) throw new Error('تعذّر تحديد حساب المستلم');
      let ok = 0; for (const k of keys) { try { await H.framesGrantToUser(k, prize.ref); ok++; } catch (e) { /* أفضل جهد لباقي المفاتيح */ } }
      if (!ok) throw new Error('فشل المنح لكل مفاتيح الحساب');
      await st().update(P(tid, 'paid/' + key), { state: 'paid', at: O.SV(), keys: keys.length }); await tlog(tid, 'صُرفت جائزة المركز ' + place + ' إلى ' + p.name); await O.audit('tournament.prize', { tid, place, pid, frame: prize.ref }); return { ok: true };
    } catch (e) { await st().update(P(tid, 'paid/' + key), { state: 'failed', err: String(e.message || e).slice(0, 120) }); await st().remove(P(tid, 'paid/' + key)); throw e; }
  }

  /* ---------- الواجهة ---------- */
  const dt = (v) => (v ? new Date(v).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const tabOf = (m) => (m.status === 'running' ? 'running' : m.status === 'completed' ? 'completed' : (m.status === 'archived' || m.status === 'cancelled') ? 'archived' : 'upcoming');
  function listView() {
    const L2 = O.list(M.list).map((x) => Object.assign({ tid: x._k }, x.meta || x)).filter((m) => m.name && tabOf(m) === M.tab).sort((a, b) => (b.startAt || 0) - (a.startAt || 0));
    return L2.length ? `<div class="ops-grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))">${L2.map((m) => { const [t, k] = STATUS[m.status] || ['', '']; return `<button class="ops-row" style="flex-direction:column;align-items:flex-start" data-tid="${esc(m.tid)}"><span class="ops-bar" style="margin:0;width:100%"><b class="grow">${esc(m.name)}</b>${UI.badge(t, k)}</span><span class="muted small">${esc((COMPAT[m.game] || {}).title || m.game)} · ${esc(FORMATS[m.format] || m.format)} · بداية ${esc(dt(m.startAt))}</span></button>`; }).join('')}</div>` : O.empty('trophy', 'لا بطولات في هذا القسم', M.tab === 'upcoming' ? 'اضغط «إنشاء بطولة» لإعداد أول بطولة.' : '');
  }
  function mainView() {
    if (!O.owner()) return O.denied(); if (!O.store()) return O.noStore(); if (M.err) return O.error(M.err, 'tm-retry'); if (!M.ready) return O.skel(4);
    if (M.sel) return detailView();
    return `<div class="ops-bar"><div class="ops-tabs" role="group" aria-label="أقسام البطولات">${TABS.map(([v, t]) => `<button class="chip ${M.tab === v ? 'on' : ''}" data-tt="${v}" aria-pressed="${M.tab === v}">${t}</button>`).join('')}</div><span class="grow"></span><button class="btn btn-primary" data-act="tm-new">${icon('plus')}إنشاء بطولة</button></div>${listView()}`;
  }
  function matchCard(T, m, k) {
    const nm = (x) => (x ? esc(x.name) : '<span class="muted">—</span>'); const win = (x) => m.winner && x && x.id === m.winner ? 'style="font-weight:900;color:#C4B5FD"' : '';
    const sug = m.suggest && m.status !== 'done' ? `<span class="muted small">اقتراح اللعبة: ${esc((m.suggest.winnerName || m.suggest.winner || ''))}</span>` : '';
    return `<div class="panel stack-s" style="padding:10px 12px;min-width:210px" data-m="${esc(k)}"><div class="ops-bar" style="margin:0"><b class="grow small">${esc(k)}</b>${UI.badge(({ pending: 'بانتظار', ready: 'جاهزة', bye: 'راحة', done: 'انتهت' })[m.status] || m.status, m.status === 'done' ? 'ok' : m.status === 'ready' ? 'violet' : '')}</div>
      <div ${win(m.a)}>${nm(m.a)}${m.result && m.result.scoreA != null ? ' <span class="num muted">' + fmt(m.result.scoreA) + '</span>' : ''}</div><div ${win(m.b)}>${nm(m.b)}${m.result && m.result.scoreB != null ? ' <span class="num muted">' + fmt(m.result.scoreB) + '</span>' : ''}</div>
      ${m.result && m.result.walkover ? '<span class="muted small">فوز بالانسحاب</span>' : ''}${sug}
      ${m.status === 'ready' && T.meta.status === 'running' ? `<div class="cluster">${COMPAT[T.meta.game] && COMPAT[T.meta.game].launch ? `<button class="btn btn-ghost btn-sm" data-ms="${esc(k)}">${icon('play')}بدء المواجهة</button>` : ''}<button class="btn btn-primary btn-sm" data-ma="${esc(k)}">${icon('check')}اعتماد النتيجة</button></div>` : ''}</div>`;
  }
  function detailView() {
    const T = M.det[M.sel]; if (!T || !T.meta) return O.skel(4); const m = T.meta; const [stT, stK] = STATUS[m.status] || ['', ''];
    const parts = O.list(T.participants).sort((a, b) => (a.seed || 9999) - (b.seed || 9999) || (a.at || 0) - (b.at || 0)); const ms = T.matches || {};
    const rounds = {}; Object.keys(ms).forEach((k) => { (rounds[ms[k].r] = rounds[ms[k].r] || []).push(Object.assign({ k }, ms[k])); });
    const R = Object.keys(rounds).length; const stand = R ? standings(ms, parts.map((p) => ({ id: p._k, name: p.name }))) : null; const canEdit = ['registration', 'closed'].includes(m.status);
    const link = (location.origin || '') + '/?tour=' + M.sel;
    return `<div class="ops-bar"><button class="btn btn-ghost btn-sm" data-act="tm-back">${icon('arrowr')}القائمة</button><h2 class="h2 grow" style="font-size:26px;margin:0">${esc(m.name)}</h2>${UI.badge(stT, stK)}</div>
      <div class="ops-cols"><div class="stack">
        <div class="panel"><div class="section-label">المعلومات</div><dl class="ops-kv">${[['اللعبة', (COMPAT[m.game] || {}).title || m.game], ['النظام', FORMATS[m.format]], ['موعد البداية', dt(m.startAt)], ['إغلاق التسجيل', dt(m.regClose)], ['سياسة الانضمام', ({ open: 'مفتوح للمستخدمين', invite: 'بالدعوة', list: 'قائمة مؤهلة' })[m.policy]], ['الحد الأقصى', m.max], ['عدد الجولات لكل مواجهة', m.bestOf], ['حسم التعادل', ({ replay: 'إعادة المباراة', seed: 'الأعلى تصنيفاً' })[m.tiebreak]], ['مهلة الحضور', m.checkin ? m.checkin + ' دقيقة' : '—'], ['سياسة الانسحاب', 'يتأهل المنافس تلقائياً (فوز بالانسحاب)']].filter((r) => r[1]).map((r) => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>${m.desc ? `<p class="muted">${esc(m.desc)}</p>` : ''}${m.policy === 'open' && canEdit ? `<p class="ops-note">رابط التسجيل: <code dir="ltr">${esc(link)}</code> <button class="btn btn-quiet btn-sm" data-copy="${esc(link)}">${icon('copy')}نسخ</button></p>` : ''}
          <div class="cluster">${canEdit ? `<button class="btn btn-ghost btn-sm" data-act="tm-edit">${icon('pen')}تعديل</button>${m.status === 'registration' ? `<button class="btn btn-ghost btn-sm" data-act="tm-close">${icon('lock')}إغلاق التسجيل</button>` : ''}<button class="btn btn-ghost btn-sm" data-act="tm-postpone">${icon('clock')}تأجيل</button><button class="btn btn-primary btn-sm" data-act="tm-start">${icon('play')}بدء البطولة</button>` : ''}${['registration', 'closed', 'running'].includes(m.status) ? `<button class="btn btn-danger btn-sm" data-act="tm-cancel">${icon('ban')}إلغاء البطولة</button>` : ''}${['completed', 'cancelled'].includes(m.status) ? `<button class="btn btn-ghost btn-sm" data-act="tm-archive">${icon('layers')}أرشفة</button>` : ''}</div></div>
        ${R ? `<div class="panel"><div class="section-label">جدول المواجهات</div><div style="overflow:auto"><div style="display:flex;gap:18px;align-items:stretch;min-width:max-content;padding:4px">${Object.keys(rounds).sort((a, b) => a - b).map((r) => `<div class="stack-s" style="justify-content:space-around"><b class="muted small">${+r === R ? 'النهائي' : +r === R - 1 && R > 1 ? 'نصف النهائي' : 'الدور ' + r}</b>${rounds[r].sort((a, b) => a.i - b.i).map((x) => matchCard(T, x, x.k)).join('')}</div>`).join('')}</div></div></div>` : ''}
        ${m.status === 'completed' && stand ? `<div class="panel"><div class="section-label">النتائج النهائية والمكافآت</div><div class="stack-s">${stand.map((s) => { const pz = m.prizes && m.prizes[s.place]; const paid = T.paid && T.paid[s.place + ':' + (s.p && s.p.id)]; return `<div class="ops-row" style="cursor:default"><span class="t"><b>${s.place === 1 ? 'البطل' : s.place === 2 ? 'المركز الثاني' : 'المركز الثالث'} — ${esc(s.p ? s.p.name : '—')}</b><span class="muted small">${pz ? 'الجائزة: إطار ' + esc(pz.ref) : 'لا جائزة معرّفة'}</span></span>${pz && s.p ? (paid && paid.state === 'paid' ? UI.badge('صُرفت', 'ok') : `<button class="btn btn-primary btn-sm" data-pay="${s.place}:${esc(s.p.id)}">${icon('gift')}صرف الجائزة</button>`) : ''}</div>`; }).join('')}</div></div>` : ''}
      </div><div class="stack">
        <div class="panel"><div class="ops-bar" style="margin:0 0 10px"><div class="section-label grow" style="margin:0">المشاركون <span class="badge">${fmt(parts.filter((p) => p.status === 'registered').length)}${m.max ? '/' + fmt(m.max) : ''}</span></div>${canEdit ? `<button class="btn btn-ghost btn-sm" data-act="tm-addp">${icon('userplus')}إضافة</button>` : ''}</div>
          ${parts.length ? `<div class="stack-s">${parts.map((p) => `<div class="ops-row" style="cursor:default"><span class="t"><b>${p.seed ? '#' + fmt(p.seed) + ' ' : ''}${esc(p.name)}</b><span class="muted small">${esc(p.handle ? '@' + p.handle : '')} · ${esc(({ registered: 'مسجَّل', waitlist: 'قائمة انتظار', withdrawn: 'منسحب', disqualified: 'مستبعد' })[p.status] || p.status)}</span></span>${['registered', 'waitlist'].includes(p.status) && m.status !== 'completed' && m.status !== 'cancelled' ? `<button class="btn btn-quiet btn-sm" data-wd="${esc(p._k)}">${icon('ban')}انسحاب/استبعاد</button>` : ''}</div>`).join('')}</div>` : O.empty('users', 'لا مشاركين بعد', m.policy === 'open' ? 'شارك رابط التسجيل مع اللاعبين.' : 'أضف المشاركين يدوياً.')}</div>
        <div class="panel"><div class="section-label">السجل</div>${T.log ? `<div class="ops-tl" style="max-height:260px">${O.list(T.log).sort((a, b) => b.t - a.t).slice(0, 40).map((x) => `<div class="ops-ev" style="cursor:default"><span class="ops-dot ok"></span><span>${esc(x.text)}</span><span class="muted small num">${esc(O.clock(x.t))}</span></div>`).join('')}</div>` : '<p class="muted">لا سجل بعد.</p>'}</div>
      </div></div>`;
  }
  function paint(v) { const m = $('#tm-main', v); if (m) m.innerHTML = mainView(); }

  /* ---------- معالج الإنشاء/التعديل (خمس خطوات) ---------- */
  function wizard(existing) {
    const W = Object.assign({ name: '', desc: '', game: 'xo', cover: '', startAt: '', policy: 'open', max: 16, regClose: '', format: 'single_elim', bestOf: 1, tiebreak: 'replay', checkin: 10, prizes: {} }, existing || {});
    let step = 0; const titles = ['المعلومات', 'المشاركون', 'نظام البطولة', 'إعدادات المباريات', 'الجوائز'];
    const frames = (() => { try { return (H.framesEffectiveCatalog ? H.framesEffectiveCatalog() : []).filter((f) => !f.ownerOnly).map((f) => ({ id: f.id, name: f.name || f.id })); } catch (e) { return []; } })();
    const loc = (v) => { if (!v) return ''; const d = new Date(v); const p = (n) => ('0' + n).slice(-2); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
    const draw = (sc) => {
      const body = [
        `<div class="field"><label class="label" for="w-name">اسم البطولة</label><input class="input" id="w-name" maxlength="60" value="${esc(W.name)}" data-required="اسم البطولة مطلوب"></div><div class="field"><label class="label" for="w-desc">الوصف</label><textarea class="textarea" id="w-desc" maxlength="400">${esc(W.desc)}</textarea></div>
         <div class="field"><label class="label" for="w-game">اللعبة</label><select class="select" id="w-game">${Object.keys(COMPAT).map((g) => `<option value="${g}" ${W.game === g ? 'selected' : ''}>${esc(COMPAT[g].title)} — ${esc(COMPAT[g].note)}</option>`).join('')}</select><p class="hint">تظهر هنا الألعاب المتوافقة فعلياً مع نظام البطولات فقط.</p></div>
         <div class="field"><label class="label" for="w-cover">رابط صورة الغلاف (اختياري، https)</label><input class="input" id="w-cover" dir="ltr" value="${esc(W.cover)}"></div><div class="field"><label class="label" for="w-start">موعد البداية</label><input class="input" id="w-start" type="datetime-local" value="${esc(loc(W.startAt))}"></div>`,
        `<div class="field"><span class="label">سياسة الانضمام</span><div class="stack-s">${[['open', 'تسجيل مفتوح للمستخدمين (برابط)'], ['invite', 'بالدعوة (يضيفهم المالك)'], ['list', 'اختيار من قائمة مؤهلة (حسابات مرتبطة بتيك توك)']].map(([v, t]) => `<label class="ops-row" style="cursor:pointer"><input type="radio" name="w-pol" value="${v}" ${W.policy === v ? 'checked' : ''}><span class="t"><b>${t}</b></span></label>`).join('')}</div></div>
         <div class="field"><label class="label" for="w-max">الحد الأقصى للمشاركين (٢–٦٤)</label><input class="input" id="w-max" type="number" min="2" max="64" value="${esc(W.max)}"></div><div class="field"><label class="label" for="w-reg">موعد إغلاق التسجيل (اختياري)</label><input class="input" id="w-reg" type="datetime-local" value="${esc(loc(W.regClose))}"></div><p class="hint">من يتجاوز الحد الأقصى يدخل قائمة الانتظار تلقائياً.</p>`,
        `<div class="field"><label class="label" for="w-fmt">نظام البطولة</label><select class="select" id="w-fmt">${Object.keys(FORMATS).map((f) => { const ok = (COMPAT[W.game] || { formats: [] }).formats.includes(f); return `<option value="${f}" ${W.format === f ? 'selected' : ''} ${ok ? '' : 'disabled'}>${esc(FORMATS[f])}${ok ? '' : ' — غير مدعوم لهذه اللعبة بعد'}</option>`; }).join('')}</select><p class="hint">لا يُفعَّل نظام إلا إذا كانت اللعبة تدعم آليته فعلياً (طبقة التوافق).</p></div>`,
        `<div class="field"><label class="label" for="w-bo">عدد الجولات لكل مواجهة</label><select class="select" id="w-bo">${(COMPAT[W.game] || { bestOf: [1] }).bestOf.map((n) => `<option value="${n}" ${+W.bestOf === n ? 'selected' : ''}>أفضل من ${n}</option>`).join('')}</select></div>
         <div class="field"><label class="label" for="w-tb">حسم التعادل</label><select class="select" id="w-tb"><option value="replay" ${W.tiebreak === 'replay' ? 'selected' : ''}>إعادة المباراة (لا يُعتمد تعادل)</option><option value="seed" ${W.tiebreak === 'seed' ? 'selected' : ''}>يفوز الأعلى تصنيفاً</option></select></div><div class="field"><label class="label" for="w-ck">مهلة حضور المشاركين (دقائق)</label><input class="input" id="w-ck" type="number" min="0" max="60" value="${esc(W.checkin)}"></div><p class="hint">سياسة الانسحاب: يتأهل المنافس تلقائياً بفوز بالانسحاب.</p>`,
        `<p class="hint">الجوائز مرتبطة بنظام الإطارات الحقيقي (يُمنح الإطار للحساب مرة واحدة فقط). لا أنواع جوائز أخرى حتى يُنفَّذ منطق منحها.</p>${[1, 2, 3].map((pl) => `<div class="field"><label class="label" for="w-pz${pl}">${pl === 1 ? 'البطل' : pl === 2 ? 'المركز الثاني' : 'المركز الثالث (خاسرا نصف النهائي)'}</label><select class="select" id="w-pz${pl}"><option value="">بلا جائزة</option>${frames.map((f) => `<option value="${esc(f.id)}" ${W.prizes && W.prizes[pl] && W.prizes[pl].ref === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div>`).join('')}`
      ][step];
      sc.querySelector('.dialog-body').innerHTML = `<div class="ops-bar"><div class="ops-tabs">${titles.map((t, i) => `<span class="chip ${i === step ? 'on' : ''}">${i + 1}. ${t}</span>`).join('')}</div></div><div class="stack" data-form="w">${body}</div>`;
      sc.querySelector('.dialog-foot') && (sc.querySelector('.dialog-foot').innerHTML = `${step > 0 ? '<button class="btn btn-ghost" data-prev>السابق</button>' : ''}<button class="btn btn-primary" data-next>${step === 4 ? (existing ? 'حفظ التعديلات' : 'إنشاء البطولة') : 'التالي'}</button><button class="btn btn-quiet" data-x>إلغاء</button>`);
    };
    const read = (sc) => {
      const g = (id) => sc.querySelector('#' + id);
      if (step === 0) { W.name = g('w-name').value.trim(); W.desc = g('w-desc').value.trim(); W.game = g('w-game').value; W.cover = g('w-cover').value.trim(); W.startAt = g('w-start').value ? new Date(g('w-start').value).getTime() : 0; }
      if (step === 1) { W.policy = (sc.querySelector('input[name="w-pol"]:checked') || {}).value || 'open'; W.max = +g('w-max').value; W.regClose = g('w-reg').value ? new Date(g('w-reg').value).getTime() : 0; }
      if (step === 2) { W.format = g('w-fmt').value; }
      if (step === 3) { W.bestOf = +g('w-bo').value; W.tiebreak = g('w-tb').value; W.checkin = +g('w-ck').value || 0; }
      if (step === 4) { W.prizes = {}; [1, 2, 3].forEach((pl) => { const v = g('w-pz' + pl).value; if (v) W.prizes[pl] = { type: 'frame', ref: v }; }); }
    };
    const validate = () => {
      if (step === 0) { if (!W.name) return 'اسم البطولة مطلوب'; if (!COMPAT[W.game]) return 'لعبة غير متوافقة'; if (!W.startAt) return 'حدّد موعد البداية'; if (W.cover && !/^https:\/\//.test(W.cover)) return 'رابط الغلاف يجب أن يبدأ بـ https'; }
      if (step === 1) { if (!(W.max >= 2 && W.max <= 64)) return 'الحد الأقصى بين ٢ و٦٤'; if (W.regClose && W.startAt && W.regClose > W.startAt) return 'إغلاق التسجيل يجب أن يسبق البداية'; }
      if (step === 2) { if (!(COMPAT[W.game].formats.includes(W.format))) return 'هذا النظام غير مدعوم للعبة المختارة'; }
      return null;
    };
    return new Promise((res) => {
      const m = UI.modal({ title: existing ? 'تعديل البطولة' : 'إنشاء بطولة', wide: true, html: '', foot: ' ' }); const sc = m.el; draw(sc);
      sc.addEventListener('change', (e) => { if (e.target.id === 'w-game') { read(sc); W.format = COMPAT[W.game].formats[0]; W.bestOf = COMPAT[W.game].bestOf[0]; } });
      sc.addEventListener('click', (e) => {
        if (e.target.closest('[data-x]') && !e.target.closest('.dialog-head')) { m.close(); res(null); return; }
        if (e.target.closest('[data-prev]')) { read(sc); step--; draw(sc); return; }
        if (e.target.closest('[data-next]')) { read(sc); const er = validate(); if (er) { UI.toast(er, 'bad'); return; } if (step < 4) { step++; draw(sc); return; } m.close(); res(W); }
      });
    });
  }
  async function createFlow(existingTid) {
    const old = existingTid && M.det[existingTid] && M.det[existingTid].meta; const W = await wizard(old ? Object.assign({}, old) : null); if (!W) return;
    const me = O.me(); const meta = Object.assign({}, W, { status: old ? old.status : 'registration', createdBy: me.email || me.uid, v: ((old && old.v) || 0) + 1 });
    if (old) { meta.createdAt = old.createdAt; await st().set(P(existingTid, 'meta'), meta); await tlog(existingTid, 'تعديل بيانات البطولة'); await O.audit('tournament.edit', { tid: existingTid }); UI.toast('تم حفظ التعديلات'); return; }
    meta.createdAt = O.SV(); const tid = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await st().set(P(tid, 'meta'), meta); await tlog(tid, 'إنشاء البطولة'); await O.audit('tournament.create', { tid, name: W.name, game: W.game }); UI.toast('تم إنشاء البطولة'); M.sel = tid; openDetail(tid);
  }
  function openDetail(tid) { M.sel = tid; if (detStop) detStop(); const v = document.getElementById('view-tournaments'); if (!v) return; const subs = ['meta', 'participants', 'matches', 'log', 'paid']; const cur = (M.det[tid] = M.det[tid] || {}); const stopFns = subs.map((s) => O.sub(v, P(tid, s), O.throttle((val) => { cur[s] = val || (s === 'meta' ? null : {}); if (v.isConnected) paint(v); }, 250))); detStop = () => stopFns.forEach((f) => f()); paint(v); reconcile(tid).catch(() => {}); }
  async function addParticipants(tid) {
    const T = M.det[tid]; const m = T.meta;
    const txt = await new Promise((res) => { const md = UI.modal({ title: 'إضافة مشاركين', html: `<div class="field"><label class="label" for="ap-t">يوزر لكل سطر (يوزر تيك توك أو الموقع)</label><textarea class="textarea" id="ap-t" rows="6" dir="ltr"></textarea></div>${m.policy === 'list' ? `<div class="field"><span class="label">أو اختر من الحسابات المرتبطة بتيك توك</span><div class="stack-s" style="max-height:200px;overflow:auto">${(G('ownerUsersCache') || []).filter((u) => u.linkedTiktokUsername).slice(0, 80).map((u) => `<label class="ops-row"><input type="checkbox" data-pick="${esc(u.linkedTiktokUsername)}|${esc(u.username || '')}"><span class="t"><b>${esc(u.username || u.linkedTiktokUsername)}</b><span class="muted small">@${esc(u.linkedTiktokUsername)}</span></span></label>`).join('') || '<p class="muted">لا حسابات مرتبطة.</p>'}</div></div>` : ''}`, foot: '<button class="btn btn-primary" data-ok>إضافة</button><button class="btn btn-ghost" data-x>إلغاء</button>' }); md.el.querySelector('[data-ok]').onclick = () => { const lines = md.el.querySelector('#ap-t').value.split(/\n/).map((x) => x.trim()).filter(Boolean).map((x) => ({ handle: x, username: '' })); $$('[data-pick]', md.el).filter((c) => c.checked).forEach((c) => { const [h, u] = c.dataset.pick.split('|'); lines.push({ handle: h, username: u }); }); md.close(); res(lines); }; md.el.addEventListener('click', (e) => { if (e.target === md.el || e.target.closest('[data-x]')) res(null); }); });
    if (!txt) return; const have = new Set(O.list(T.participants).map((p) => handleKey(p.handle))); let added = 0; let wl = 0; let cnt = O.list(T.participants).filter((p) => p.status === 'registered').length;
    for (const it of txt) { const h = handleKey(it.handle); if (!h || have.has(h)) continue; have.add(h); const full = m.max && cnt >= m.max; await st().push(P(tid, 'participants'), { name: it.username || h, handle: h, username: it.username || '', status: full ? 'waitlist' : 'registered', at: O.SV(), src: 'owner' }); if (full) wl++; else { added++; cnt++; } }
    await tlog(tid, 'إضافة مشاركين: ' + added + (wl ? ' + ' + wl + ' بقائمة الانتظار' : '')); UI.toast('أُضيف ' + added + (wl ? ' (و' + wl + ' بقائمة الانتظار)' : ''));
  }
  async function startMatch(tid, k) {
    const T = M.det[tid]; const m = T.matches[k]; const comp = COMPAT[T.meta.game];
    if (!comp || comp.launch !== 'xo') { UI.toast('لا يوجد ربط تشغيل لهذه اللعبة', 'bad'); return; }
    if (typeof H.homeHasActiveConnection === 'function' && !H.homeHasActiveConnection()) { UI.toast('اربط بثك أولاً من الصفحة الرئيسية ثم أعد المحاولة', 'bad'); return; }
    const a = m.a, b = m.b; const ha = handleKey(a.handle), hb = handleKey(b.handle); if (!ha || !hb) { UI.toast('لا بد من يوزر بث لكل لاعب (تيك توك) لربط النتيجة', 'bad'); return; }
    const core = O.core(); if (core && core.setActiveMatch) core.setActiveMatch({ tid, mid: k, a: ha, b: hb, aId: a.id, bId: b.id, aName: a.name, bName: b.name });
    try { H.goSetupXo(); const kw = H.document.getElementById('xo-join-kw'); if (kw) kw.value = 'مواجهة'; H.launchXo(); } catch (e) { UI.toast('تعذّر فتح اللعبة: ' + e.message, 'bad'); return; }
    const okReady = await new Promise((r) => { let n = 0; const t = setInterval(() => { try { const api = H.xoApi && H.xoApi(); if (api && api.getState && api.getState().phase) { clearInterval(t); r(api); } } catch (e) {} if (++n > 100) { clearInterval(t); r(null); } }, 100); });
    if (!okReady) { UI.toast('لم تجهز اللعبة بعد — اضغط «بدء المواجهة» مجدداً', 'bad'); return; }
    okReady.join({ uniqueId: 'tiktok:' + ha, nickname: a.name }); okReady.join({ uniqueId: 'tiktok:' + hb, nickname: b.name });
    await st().update(P(tid, 'matches/' + k), { live: true, liveAt: O.SV() }); await tlog(tid, 'بدء المواجهة ' + k); O.owner() && UI.toast('جُهّزت المواجهة داخل لعبة إكس أو — ابدأها من لوحة اللعبة');
  }
  async function approveFlow(tid, k) {
    const T = M.det[tid]; const m = T.matches[k]; const bo = +T.meta.bestOf || 1; const need = Math.ceil(bo / 2);
    const out = await new Promise((res) => { const md = UI.modal({ title: 'اعتماد نتيجة ' + k, html: `<p class="lead">${esc(m.a.name)} ضد ${esc(m.b.name)}</p>${m.suggest ? `<p class="ops-note">اقتراح اللعبة: الفائز <b>${esc(m.suggest.winnerName || '')}</b> — يُعتمد فقط بعد تأكيدك.</p>` : ''}<div class="cluster"><div class="field"><label class="label" for="ar-a">جولات ${esc(m.a.name)}</label><input class="input" id="ar-a" type="number" min="0" max="${need}" value="${m.suggest && m.suggest.winner === m.a.id ? need : 0}"></div><div class="field"><label class="label" for="ar-b">جولات ${esc(m.b.name)}</label><input class="input" id="ar-b" type="number" min="0" max="${need}" value="${m.suggest && m.suggest.winner === m.b.id ? need : 0}"></div></div><p class="hint">أفضل من ${bo}: يفوز من يبلغ ${need} جولات.</p>`, foot: '<button class="btn btn-primary" data-ok>اعتماد</button><button class="btn btn-ghost" data-x>تراجع</button>' }); md.el.querySelector('[data-ok]').onclick = () => { const a = +md.el.querySelector('#ar-a').value, b = +md.el.querySelector('#ar-b').value; md.close(); res([a, b]); }; md.el.addEventListener('click', (e) => { if (e.target === md.el || e.target.closest('[data-x]')) res(null); }); });
    if (!out) return; let [a, b] = out; let win = a >= need && a > b ? m.a.id : b >= need && b > a ? m.b.id : null;
    if (!win && a === b && a >= 0 && T.meta.tiebreak === 'seed') { const pa = (T.participants[m.a.id] || {}).seed || 999, pb = (T.participants[m.b.id] || {}).seed || 999; win = pa < pb ? m.a.id : m.b.id; }
    if (!win) { UI.toast(a === b ? 'لا يُعتمد تعادل — أعد المباراة' : 'لم يبلغ أي لاعب عدد الجولات اللازم (' + need + ')', 'bad'); return; }
    try { const r = await approve(tid, k, win, [a, b], m.suggest ? 'game+owner' : 'owner'); UI.toast(r.dup ? 'هذه النتيجة معتمدة سابقاً — لم تُحتسب مرتين' : 'اعتُمدت النتيجة'); const T2 = M.det[tid]; } catch (e) { UI.toast(e.message || 'تعذّر الاعتماد', 'bad'); }
  }
  function celebrate(tid) {
    const T = M.det[tid]; const ms = T.matches || {}; const stand = standings(ms, O.list(T.participants).map((p) => ({ id: p._k, name: p.name }))); if (!stand) return;
    UI.modal({ title: 'بطل ' + T.meta.name, html: `<div class="stack" style="text-align:center"><div style="font-size:42px;font-weight:900;font-family:var(--f-display);color:#C4B5FD">${esc(stand[0].p.name)}</div><p class="lead">بطل البطولة</p><div class="stack-s">${stand.slice(1).map((s) => `<div class="ops-row" style="cursor:default"><b>المركز ${s.place === 2 ? 'الثاني' : 'الثالث'}</b><span class="t">${esc(s.p ? s.p.name : '—')}</span></div>`).join('')}</div></div>` });
  }

  Studio.actions['tm-new'] = () => createFlow(null);
  Studio.actions['tm-back'] = () => { M.sel = null; if (detStop) { detStop(); detStop = null; } const v = document.getElementById('view-tournaments'); if (v) paint(v); };
  Studio.actions['tm-retry'] = () => { const v = document.getElementById('view-tournaments'); if (v) subscribe(v); };
  Studio.actions['tm-edit'] = () => createFlow(M.sel);
  Studio.actions['tm-close'] = async () => { const tid = M.sel; const r = await st().txn(P(tid, 'meta'), (m) => (m && m.status === 'registration' ? Object.assign({}, m, { status: 'closed' }) : undefined)); if (r.committed) { await tlog(tid, 'إغلاق التسجيل'); await O.audit('tournament.close', { tid }); UI.toast('أُغلق التسجيل'); } };
  Studio.actions['tm-start'] = async () => { const tid = M.sel; const ok = await UI.confirm({ title: 'بدء البطولة', text: 'سيُبنى جدول المواجهات من المشاركين المسجَّلين ويُغلق التسجيل نهائياً.', label: 'بدء' }); if (!ok) return; try { await startTournament(tid); UI.toast('بدأت البطولة'); } catch (e) { UI.toast(e.message, 'bad'); } };
  Studio.actions['tm-cancel'] = async () => { const tid = M.sel; const ok = await UI.confirm({ title: 'إلغاء البطولة', text: 'ستتوقف البطولة ولن تُصرف أي جوائز.', label: 'إلغاء البطولة', danger: true }); if (!ok) return; await st().txn(P(tid, 'meta'), (m) => (m && ['registration', 'closed', 'running'].includes(m.status) ? Object.assign({}, m, { status: 'cancelled', cancelledAt: O.SV() }) : undefined)); await tlog(tid, 'إلغاء البطولة'); await O.audit('tournament.cancel', { tid }); };
  Studio.actions['tm-archive'] = async () => { const tid = M.sel; await st().txn(P(tid, 'meta'), (m) => (m && ['completed', 'cancelled'].includes(m.status) ? Object.assign({}, m, { status: 'archived' }) : undefined)); await tlog(tid, 'أرشفة'); await O.audit('tournament.archive', { tid }); };
  Studio.actions['tm-postpone'] = async () => { const tid = M.sel; const v = await new Promise((res) => { const md = UI.modal({ title: 'تأجيل موعد البداية', html: '<div class="field"><label class="label" for="pp-d">الموعد الجديد</label><input class="input" id="pp-d" type="datetime-local"></div>', foot: '<button class="btn btn-primary" data-ok>تأجيل</button><button class="btn btn-ghost" data-x>تراجع</button>' }); md.el.querySelector('[data-ok]').onclick = () => { const x = md.el.querySelector('#pp-d').value; md.close(); res(x ? new Date(x).getTime() : null); }; md.el.addEventListener('click', (e) => { if (e.target === md.el || e.target.closest('[data-x]')) res(null); }); }); if (!v) return; await st().txn(P(tid, 'meta'), (m) => (m && ['registration', 'closed'].includes(m.status) ? Object.assign({}, m, { startAt: v }) : undefined)); await tlog(tid, 'تأجيل البداية إلى ' + dt(v)); await O.audit('tournament.postpone', { tid, to: v }); };
  Studio.actions['tm-addp'] = () => addParticipants(M.sel);

  function subscribe(v) { stops.forEach((f) => f()); stops = []; M.ready = false; M.err = null; if (!O.store()) { paint(v); return; } let first = true; stops.push(O.sub(v, 'opsTournaments', (val, err) => { if (err) { M.err = err.message || 'خطأ'; paint(v); return; } M.list = val || {}; if (first) { first = false; M.ready = true; } if (!M.sel) paint(v); }, {})); }
  Studio.register({ id: 'tournaments', title: 'صانع البطولات', en: 'TOURNAMENT BUILDER', icon: 'trophy', desc: 'أنشئ بطولات احترافية ونظّم المواجهات والجوائز من مكان واحد',
    html() { return `<div id="tm-main">${mainView()}</div>`; },
    mount(v) {
      subscribe(v);
      v.addEventListener('click', async (e) => {
        const t = e.target.closest('[data-tt]'); if (t) { M.tab = t.dataset.tt; paint(v); return; }
        const d = e.target.closest('[data-tid]'); if (d) { openDetail(d.dataset.tid); return; }
        const c = e.target.closest('[data-copy]'); if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); UI.toast('نُسخ الرابط'); } catch (er) { UI.toast('تعذّر النسخ', 'bad'); } return; }
        const w = e.target.closest('[data-wd]'); if (w) { const T = M.det[M.sel]; const p = T.participants[w.dataset.wd]; const ok = await UI.confirm({ title: 'انسحاب/استبعاد', text: (T.meta.status === 'running' ? 'سيتأهل منافسه الحالي تلقائياً. ' : '') + 'المشارك: ' + p.name, label: 'تأكيد', danger: true }); if (ok) withdraw(M.sel, w.dataset.wd, 'wd').catch((er) => UI.toast(er.message, 'bad')); return; }
        const ms = e.target.closest('[data-ms]'); if (ms) { startMatch(M.sel, ms.dataset.ms).catch((er) => UI.toast(er.message, 'bad')); return; }
        const ma = e.target.closest('[data-ma]'); if (ma) { approveFlow(M.sel, ma.dataset.ma); return; }
        const pay = e.target.closest('[data-pay]'); if (pay) { const [pl, pid] = [pay.dataset.pay.split(':')[0], pay.dataset.pay.split(':').slice(1).join(':')]; const ok = await UI.confirm({ title: 'صرف الجائزة', text: 'تُصرف الجائزة مرة واحدة فقط ولا يمكن التراجع.', label: 'صرف' }); if (!ok) return; payout(M.sel, +pl, pid).then((r) => UI.toast(r.dup ? 'صُرفت سابقاً — لم تُكرَّر' : 'صُرفت الجائزة'), (er) => UI.toast(er.message, 'bad')); }
      });
      // احتفال عند اكتمال بطولة أثناء فتحها (مرة لكل بطولة بالجلسة)
      O.every(v, 1500, () => { const T = M.det[M.sel]; if (T && T.meta && T.meta.status === 'completed' && !T._cel) { T._cel = true; if (T._wasRunning) celebrate(M.sel); } if (T && T.meta && T.meta.status === 'running') T._wasRunning = true; });
    } });
  window.OpsTournaments = { COMPAT, buildBracket, standings, seedOrder, startTournament, approve, withdraw, payout, reconcile, handleKey, _M: M, openDetail, createFlow, startMatch };
})();
