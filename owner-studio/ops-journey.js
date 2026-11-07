/* رحلة اللاعب: تحليلات مبنية على أحداث حقيقية مجمّعة بمعرّف عشوائي غير مرتبط بالهوية (opsJourney/days/{يوم}/{معرّف}).
 * المراحل: فتح الموقع ← قائمة الألعاب ← اختيار لعبة ← محاولة التشغيل ← بدء مشاركة ← إكمال راوند. «العودة» تُحسب من أيام ظهور المعرّف.
 * حدود صريحة: يُسجَّل المستخدمون المسجَّلون الدخول فقط؛ زيارة بلا دخول لا تُحصى. */
(function () {
  'use strict';
  const { esc, icon, fmt, $, $$ } = UI; const O = window.Ops; const L = Studio.live;
  const STAGES = [['open', 'فتح الموقع'], ['games', 'فتح قائمة الألعاب'], ['select', 'اختيار لعبة'], ['try', 'محاولة تشغيل اللعبة'], ['start', 'بدء المشاركة'], ['complete', 'إكمال راوند']];
  const DEV = { d: 'الكمبيوتر', m: 'الجوال', t: 'الجهاز اللوحي' };
  const J = { period: 7, days: null, users: null, ready: false, loading: false, err: null, loadedAt: 0 };
  const dayStr = (t) => { const d = new Date(t); return d.getUTCFullYear() + ('0' + (d.getUTCMonth() + 1)).slice(-2) + ('0' + d.getUTCDate()).slice(-2); };
  const dayNum = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 86400000;
  const addDays = (s, n) => dayStr((dayNum(s) + n) * 86400000);
  const yesterday = () => addDays(dayStr(Date.now()), -1);

  /* ---------- الحسابات (نقية، قابلة للاختبار) ---------- */
  function reached(rec) { // أعلى مرحلة بلغها المعرّف ذلك اليوم (بلوغ مرحلة لاحقة يعني اجتياز السابقة)
    const s = rec.s || {}; const g = rec.g || {}; const has = {}; STAGES.forEach(([k]) => { has[k] = !!s[k]; });
    Object.keys(g).forEach((t) => { STAGES.forEach(([k]) => { if (g[t][k]) has[k] = true; }); });
    let top = -1; STAGES.forEach(([k], i) => { if (has[k]) top = i; }); return top;
  }
  function compute(days, users, period, now) {
    const today = dayStr(now || Date.now()); const from = addDays(today, -(period - 1)); const inWin = Object.keys(days).filter((d) => d >= from && d <= today);
    const top = {}; const devOf = {}; const errU = new Set(); const games = {}; const perDay = {};
    inWin.forEach((d) => { perDay[d] = { n: 0, nw: 0, ret: 0 }; Object.keys(days[d] || {}).forEach((a) => { const rec = days[d][a]; const t = reached(rec); if (t < 0) return; top[a] = Math.max(top[a] == null ? -1 : top[a], t); devOf[a] = rec.dev || devOf[a] || 'd';
      perDay[d].n++; const first = users && users[a] && users[a].first; if (first === d) perDay[d].nw++; else perDay[d].ret++;
      Object.keys(rec.g || {}).forEach((tag) => { const x = rec.g[tag]; const G = (games[tag] = games[tag] || { select: new Set(), try: new Set(), start: new Set(), complete: new Set(), err: new Set() }); ['select', 'try', 'start', 'complete', 'err'].forEach((k) => { if (x[k]) G[k].add(a); }); if (x.err) errU.add(a); }); }); });
    const ids = Object.keys(top); const steps = STAGES.map(([k, name], i) => ({ k, name, n: ids.filter((a) => top[a] >= i).length }));
    const exits = steps.slice(0, -1).map((s, i) => ({ from: s.name, to: steps[i + 1].name, lost: s.n - steps[i + 1].n, base: s.n, errUsers: i === 3 ? ids.filter((a) => errU.has(a) && top[a] === 3).length : null }));
    // العودة: دفعات حسب أول ظهور، مع استبعاد الدفعات التي لم تكتمل فترة قياسها
    const yd = yesterday(); const cohort = { d1: { n: 0, r: 0, elig: 0 }, d7: { n: 0, r: 0, elig: 0 }, d30: { n: 0, r: 0, elig: 0 } };
    const active = {}; Object.keys(days).forEach((d) => { Object.keys(days[d] || {}).forEach((a) => { (active[a] = active[a] || new Set()).add(d); }); });
    const byDevRet = {};
    const cFrom = addDays(today, -60); // دفعات العودة: كل من ظهر خلال ٦٠ يوماً (ليتسنى قياس ٣٠ يوماً بغض النظر عن فترة العرض)
    Object.keys(users || {}).forEach((a) => { const f = users[a].first; if (!f || f < cFrom || f > today) return; const set = active[a] || new Set(); const dv = users[a].dev || 'd'; byDevRet[dv] = byDevRet[dv] || { n: 0, r: 0 };
      [['d1', 1, 1], ['d7', 1, 7], ['d30', 1, 30]].forEach(([k, lo, hi]) => { if (addDays(f, hi) > yd) return; cohort[k].elig++; let back = false; for (let i = lo; i <= hi; i++) if (set.has(addDays(f, i))) { back = true; break; } if (back) cohort[k].r++; if (k === 'd1') { byDevRet[dv].n++; if (back) byDevRet[dv].r++; } }); });
    const newU = Object.keys(users || {}).filter((a) => users[a].first >= from && users[a].first <= today).length;
    const retU = ids.filter((a) => !(users && users[a] && users[a].first >= from)).length;
    const devs = {}; ids.forEach((a) => { const d = devOf[a] || 'd'; const x = (devs[d] = devs[d] || { n: 0, start: 0, complete: 0, err: 0 }); x.n++; if (top[a] >= 4) x.start++; if (top[a] >= 5) x.complete++; if (errU.has(a)) x.err++; });
    const gl = Object.keys(games).map((t) => ({ tag: t, select: games[t].select.size, try: games[t].try.size, start: games[t].start.size, complete: games[t].complete.size, err: games[t].err.size })).sort((a, b) => b.select - a.select);
    return { steps, exits, cohort, byDevRet, newU, retU, devs, games: gl, perDay, users: ids.length, from, today };
  }

  /* ---------- جلب البيانات ---------- */
  async function load() {
    const st = O.store(); if (!st) throw new Error('no-store'); J.loading = true;
    const today = dayStr(Date.now()); const span = Math.max(J.period, 1) + 31; const ds = Array.from({ length: Math.min(span, 70) }, (_, i) => addDays(today, -i));
    const days = {}; for (let i = 0; i < ds.length; i += 10) { await Promise.all(ds.slice(i, i + 10).map((d) => st.get('opsJourney/days/' + d).then((v) => { if (v) days[d] = v; }))); }
    J.days = days; J.users = (await st.get('opsJourney/users')) || {}; J.ready = true; J.loading = false; J.loadedAt = Date.now(); J.err = null;
  }
  const pct = O.pctText;
  function body() {
    if (!O.owner()) return O.denied(); if (!O.store()) return O.noStore(); if (J.err) return O.error(J.err, 'jr-retry'); if (!J.ready) return O.skel(5);
    const C = compute(J.days, J.users, J.period); const none = !C.users;
    const bar = `<div class="ops-bar"><div class="ops-tabs" role="group" aria-label="الفترة">${[[7, 'آخر ٧ أيام'], [14, 'آخر ١٤ يوماً'], [30, 'آخر ٣٠ يوماً']].map(([v, t]) => `<button class="chip ${J.period === v ? 'on' : ''}" data-jp="${v}" aria-pressed="${J.period === v}">${t}</button>`).join('')}</div><span class="grow"></span><span class="muted small">آخر تحديث ${esc(O.clock(J.loadedAt))}</span><button class="btn btn-ghost btn-sm" data-act="jr-refresh">${icon('refresh')}تحديث</button><button class="btn btn-ghost btn-sm" data-act="jr-export">${icon('save')}CSV</button></div>`;
    if (none) return bar + O.empty('chart', 'لا أحداث رحلة في هذه الفترة بعد', 'تُسجَّل الأحداث تلقائياً من تفاعل المستخدمين المسجَّلين مع الموقع والألعاب. ' + 'لا أرقام وهمية هنا.') + privacy();
    const worst = C.exits.slice().sort((a, b) => b.lost - a.lost)[0];
    return `${bar}<div class="ops-grid"><div class="panel ops-kpi"><span class="l">${icon('users')} مستخدمون فريدون</span><span class="v num">${fmt(C.users)}</span></div><div class="panel ops-kpi"><span class="l">${icon('userplus')} جدد</span><span class="v num">${fmt(C.newU)}</span></div><div class="panel ops-kpi"><span class="l">${icon('refresh')} عائدون</span><span class="v num">${fmt(C.retU)}</span></div><div class="panel ops-kpi"><span class="l">${icon('flag')} أكملوا راوداً</span><span class="v num">${fmt(C.steps[5].n)}</span><span class="muted small">${pct(O.pct(C.steps[5].n, C.steps[0].n))} من الزوار</span></div></div>
    <div class="ops-cols" style="margin-top:16px"><div class="stack"><div class="panel"><div class="section-label">مسار التحويل</div>${O.funnel(C.steps)}<p class="ops-note" style="margin-top:12px">كل رقم = مستخدمون فريدون بلغوا هذه المرحلة على الأقل (بلوغ مرحلة لاحقة يعني اجتياز ما قبلها). المستخدم المتكرر لا يُحتسب مرتين.</p></div>
      <div class="panel"><div class="section-label">تحليل الخروج</div><table class="ops-table"><caption class="sr-only">الخروج بين المراحل</caption><thead><tr><th>من</th><th>إلى</th><th>وصلوا</th><th>لم ينتقلوا</th><th>نسبة الخروج</th><th>أخطاء مرتبطة</th></tr></thead><tbody>${C.exits.map((e) => `<tr ${worst && e === worst && e.lost > 0 ? 'style="background:rgba(239,68,68,.08)"' : ''}><td>${esc(e.from)}</td><td>${esc(e.to)}</td><td class="num">${fmt(e.base)}</td><td class="num">${fmt(e.lost)}</td><td>${pct(O.pct(e.lost, e.base))}</td><td>${e.errUsers == null ? '—' : fmt(e.errUsers) + ' مستخدم فشل بدء لعبته'}</td></tr>`).join('')}</tbody></table>${worst && worst.lost > 0 ? `<p class="muted small" style="margin-top:8px">أكبر خروج: بين «${esc(worst.from)}» و«${esc(worst.to)}» (${fmt(worst.lost)} مستخدم). الأرقام تصف ما حدث لا سببه.</p>` : ''}<p class="muted small">«لم ينتقلوا» ضمن نافذة القياس الحالية؛ قد ينتقل بعضهم لاحقاً.</p></div>
      <div class="panel"><div class="section-label">الألعاب</div>${C.games.length ? `<table class="ops-table"><thead><tr><th>اللعبة</th><th>اختاروها</th><th>حاولوا التشغيل</th><th>بدأوا</th><th>أكملوا</th><th>معدل الإكمال</th><th>أخطاء الدخول</th></tr></thead><tbody>${C.games.slice(0, 40).map((g) => `<tr><td>${esc(O.gameTitle(g.tag))}</td><td class="num">${fmt(g.select)}</td><td class="num">${fmt(g.try)}</td><td class="num">${fmt(g.start)}</td><td class="num">${fmt(g.complete)}</td><td>${pct(g.start ? Math.min(100, O.pct(g.complete, g.start)) : null)}</td><td class="num">${fmt(g.err)}</td></tr>`).join('')}</tbody></table>` : O.empty('gamepad', 'لا أحداث ألعاب بعد')}</div></div>
      <div class="stack"><div class="panel"><div class="section-label">العودة (الدفعات)</div><table class="ops-table"><thead><tr><th>القياس</th><th>عادوا</th><th>الدفعة المؤهلة</th><th>المعدل</th></tr></thead><tbody>${[['d1', 'اليوم التالي'], ['d7', 'خلال ٧ أيام'], ['d30', 'خلال ٣٠ يوماً']].map(([k, t]) => `<tr><td>${t}</td><td class="num">${fmt(C.cohort[k].r)}</td><td class="num">${fmt(C.cohort[k].elig)}</td><td>${C.cohort[k].elig ? pct(O.pct(C.cohort[k].r, C.cohort[k].elig)) : '<span class="muted">لم تكتمل الفترة</span>'}</td></tr>`).join('')}</tbody></table><p class="muted small">تُستبعد الدفعات التي لم تكتمل فترة قياسها بعد (لا معدل احتفاظ لفترة غير مكتملة). تعريف العودة: ظهور المعرّف في يوم لاحق بعد أول ظهور.</p></div>
        <div class="panel"><div class="section-label">المقارنة بين الأجهزة</div><table class="ops-table"><thead><tr><th>الجهاز</th><th>مستخدمون</th><th>بدأوا لعباً</th><th>أكملوا راوداً</th><th>أخطاء</th><th>عودة اليوم التالي</th></tr></thead><tbody>${Object.keys(C.devs).map((d) => { const x = C.devs[d]; const r = C.byDevRet[d]; return `<tr><td>${DEV[d] || d}</td><td class="num">${fmt(x.n)}</td><td>${pct(O.pct(x.start, x.n))}</td><td>${pct(O.pct(x.complete, x.n))}</td><td class="num">${fmt(x.err)}</td><td>${r && r.n ? pct(O.pct(r.r, r.n)) : '—'}</td></tr>`; }).join('')}</tbody></table><p class="muted small">تحديد الجهاز اللوحي تقريبي (من وكيل المتصفح وأبعاد الشاشة).</p></div>
        <div class="panel"><div class="section-label">المستخدمون يومياً</div>${O.bars(Object.keys(C.perDay).sort().map((d) => C.perDay[d].n), { label: 'مستخدمون فريدون يومياً' })}<div class="legend"><span class="muted small">من ${esc(C.from)} إلى ${esc(C.today)}</span></div></div></div></div>${privacy()}`;
  }
  function privacy() {
    return `<div class="panel" style="margin-top:16px"><div class="section-label">الخصوصية والاحتفاظ</div><ul class="muted" style="margin:0 0 10px;padding-inline-start:18px;line-height:1.9"><li>يُسجَّل معرّف عشوائي لكل جهاز لا يرتبط بحسابك أو بريدك، ولا أي كلمات مرور أو رموز جلسات أو محتوى محادثات.</li><li>تُحفظ أوقات المراحل ونوع الجهاز فقط، والنتائج هنا مجمّعة.</li><li>الوصول لهذه البيانات للمالك فقط (قواعد قاعدة البيانات).</li><li>الاحتفاظ: ٩٠ يوماً — الحذف يدوي بالزر أدناه (لا حذف تلقائي بلا خادم).</li><li>يُسجَّل المستخدمون المسجَّلون الدخول فقط.</li></ul><button class="btn btn-ghost btn-sm" data-act="jr-purge">${icon('trash')}حذف الأحداث الأقدم من ٩٠ يوماً</button></div>`;
  }
  function paint(v) { const m = $('#jr-main', v); if (m) m.innerHTML = body(); }
  async function refresh(v) { try { await load(); } catch (e) { J.err = e.message === 'no-store' ? null : (e.message || 'خطأ'); J.loading = false; } if (v.isConnected) paint(v); }
  Studio.actions['jr-refresh'] = () => { const v = document.getElementById('view-journey'); if (v) { J.ready = false; paint(v); refresh(v); } };
  Studio.actions['jr-retry'] = Studio.actions['jr-refresh'];
  Studio.actions['jr-export'] = () => { if (!J.ready) return; const C = compute(J.days, J.users, J.period); O.download('journey-' + J.period + 'd.csv', O.csv([['المرحلة', 'مستخدمون فريدون']].concat(C.steps.map((s) => [s.name, s.n])).concat([[], ['اللعبة', 'اختاروها', 'حاولوا', 'بدأوا', 'أكملوا', 'أخطاء']]).concat(C.games.map((g) => [O.gameTitle(g.tag), g.select, g.try, g.start, g.complete, g.err]))), 'text/csv'); };
  Studio.actions['jr-purge'] = async () => {
    const ok = await UI.confirm({ title: 'حذف أحداث الرحلة القديمة', text: 'سيُحذف كل ما هو أقدم من ٩٠ يوماً من أيام الرحلة نهائياً.', label: 'حذف', danger: true }); if (!ok) return;
    const st = O.store(); const cut = addDays(dayStr(Date.now()), -90); const all = await st.get('opsJourney/days'); const old = Object.keys(all || {}).filter((d) => d < cut);
    for (const d of old) await st.remove('opsJourney/days/' + d); await O.audit('journey.purge', { before: cut, days: old.length }); UI.toast('حُذف ' + old.length + ' يوماً قديماً');
  };
  Studio.register({ id: 'journey', title: 'رحلة اللاعب', en: 'PLAYER JOURNEY ANALYTICS', icon: 'chart', desc: 'افهم كيف يتفاعل اللاعبون مع احسمها وأين تتحسن تجربتهم',
    html() { return `<div id="jr-main">${body()}</div>`; },
    mount(v) { if (O.store() && O.owner()) refresh(v); v.addEventListener('click', (e) => { const p = e.target.closest('[data-jp]'); if (p) { J.period = +p.dataset.jp; paint(v); } }); } });
  window.OpsJourney = { compute, reached, dayStr, addDays };
})();
