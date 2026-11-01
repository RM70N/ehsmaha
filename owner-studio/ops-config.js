/* إعدادات الألعاب المتقدمة: افتراضيات عامة لكل لعبة (opsConfig) مستخرجة من مخطط الإعدادات الحقيقي في الموقع
 * (MOD_SETTINGS_SCHEMA — نفس الحقول/الحدود/الافتراضيات التي تقرؤها الألعاب فعلياً عبر modGetSetting).
 * الأولوية عند بدء راوند: إعداد الستريمر الشخصي ← افتراضي المالك هنا ← الافتراضي المبرمج. تُطبَّق على الراوندات الجديدة فقط. */
(function () {
  'use strict';
  const { esc, icon, fmt, $, $$ } = UI; const O = window.Ops; const L = Studio.live; const G = L.G;
  const C = { sel: null, cur: {}, hist: {}, ready: false, saving: false, filter: '' };
  let stops = [];
  const schema = () => G('MOD_SETTINGS_SCHEMA') || {};
  const games = () => Object.keys(schema()).map((t) => ({ tag: t, name: schema()[t].name, fields: schema()[t].fields }));
  const inputId = (k, i) => 'gc-' + k + (i != null ? '-' + i : '');
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /* القيمة الفعّالة العامة لحقل: إعداد المالك إن وُجد وإلا الافتراضي المبرمج */
  const effective = (tag, f) => { const v = (C.cur[tag] && C.cur[tag].values) ? C.cur[tag].values[f.key] : undefined; return v === undefined ? f.default : v; };
  const disp = (f, v) => (f.unitDivisor ? v / f.unitDivisor : v);

  function readForm(v, game) {
    const out = {}; const errs = [];
    game.fields.forEach((f) => {
      if (f.type === 'toggle') { const el = $('#' + inputId(f.key), v); out[f.key] = !!(el && el.checked); return; }
      if (f.type === 'numberArray') {
        const arr = []; for (let i = 0; i < f.length; i++) { const el = $('#' + inputId(f.key, i), v); const n = parseFloat(el && el.value); if (!isFinite(n)) { errs.push(f.label + ' (' + (i + 1) + '): قيمة غير صالحة'); arr.push(f.default[i]); } else { if (n < f.min || n > f.max) errs.push(f.label + ' (' + (i + 1) + '): الحد بين ' + f.min + ' و' + f.max); arr.push(Math.round(n)); } }
        out[f.key] = arr; return;
      }
      const el = $('#' + inputId(f.key), v); const raw = parseFloat(el && el.value); const div = f.unitDivisor || 1;
      if (!isFinite(raw)) { errs.push(f.label + ': قيمة غير صالحة'); out[f.key] = f.default; return; }
      const n = Math.round(raw * div);
      if (n < f.min || n > f.max) errs.push(f.label + ': الحد بين ' + disp(f, f.min) + ' و' + disp(f, f.max));
      out[f.key] = n;
    });
    return { values: out, errs };
  }
  /* نخزّن فقط ما يختلف عن الافتراضي المبرمج (الباقي يبقى «طبيعي») */
  const sparse = (game, vals) => { const o = {}; game.fields.forEach((f) => { if (!eq(vals[f.key], f.default)) o[f.key] = vals[f.key]; }); return o; };
  const fmtVal = (f, v) => (f.type === 'toggle' ? (v ? 'مفعّل' : 'معطّل') : f.type === 'numberArray' ? v.map((x) => disp(f, x)).join(' ، ') : String(disp(f, v)));

  function fieldHtml(tag, f) {
    const cur = effective(tag, f); const changed = !eq(cur, f.default);
    const head = `<div class="field ${changed ? 'gc-changed' : ''}"><label class="label" for="${inputId(f.key, f.type === 'numberArray' ? 0 : null)}">${esc(f.label)}${changed ? ' ' + UI.badge('معدَّل عن الافتراضي', 'violet') : ''}</label><p class="hint">${esc(f.hint || '')}</p>`;
    if (f.type === 'toggle') return `${head}<label class="switch"><input type="checkbox" id="${inputId(f.key)}" ${cur ? 'checked' : ''}><span class="knob"></span><span class="sr-only">${esc(f.label)}</span></label><span class="muted small">الافتراضي: ${f.default ? 'مفعّل' : 'معطّل'}</span></div>`;
    if (f.type === 'numberArray') return `${head}<div class="cluster">${cur.map((x, i) => `<input class="input" style="width:84px" type="number" id="${inputId(f.key, i)}" value="${esc(disp(f, x))}" min="${f.min}" max="${f.max}" aria-label="${esc(f.label)} ${i + 1}">`).join('')}</div><span class="muted small">الافتراضي: ${esc(fmtVal(f, f.default))} · الحد ${f.min}–${f.max}</span></div>`;
    return `${head}<input class="input" style="max-width:160px" type="number" id="${inputId(f.key)}" value="${esc(disp(f, cur))}" min="${disp(f, f.min)}" max="${disp(f, f.max)}" step="${f.unitDivisor ? '0.1' : '1'}"><span class="muted small"> الافتراضي: ${esc(fmtVal(f, f.default))} · الحد ${disp(f, f.min)}–${disp(f, f.max)}</span></div>`;
  }
  function list() {
    const q = C.filter.toLowerCase();
    return `<div class="stack-s">${games().filter((g) => !q || (g.name + g.tag).toLowerCase().includes(q)).map((g) => { const c = C.cur[g.tag]; return `<button class="ops-row" data-gc="${esc(g.tag)}" aria-selected="${C.sel === g.tag}"><span class="t"><b>${esc(g.name)}</b><span class="muted small">${c ? 'الإصدار ' + fmt(c.v) + ' · ' + fmt(Object.keys(c.values || {}).length) + ' إعداد معدَّل' : 'الافتراضي المبرمج'}</span></span>${c && Object.keys(c.values || {}).length ? UI.badge('معدَّلة', 'violet') : ''}</button>`; }).join('')}</div>`;
  }
  function editor() {
    const g = games().find((x) => x.tag === C.sel); if (!g) return O.empty('sliders', 'اختر لعبة', 'ستظهر إعداداتها القابلة للتحكم هنا.');
    const c = C.cur[g.tag]; const hist = O.list(C.hist[g.tag]).sort((a, b) => (b.v || 0) - (a.v || 0));
    return `<article class="panel stack" data-form="gc"><div class="ops-bar" style="margin:0"><h3 class="h2 grow" style="font-size:24px;margin:0">${esc(g.name)}</h3>${c ? UI.badge('الإصدار ' + fmt(c.v), 'violet') : UI.badge('لا تعديلات عامة')}</div>
      <p class="ops-note">تُطبَّق التغييرات على الراوندات الجديدة فقط ولا تمسّ أي راوند جارٍ. إعداد الستريمر الشخصي (لوحة المشرف) يتغلّب على هذا الافتراضي العام. القيم تُقيَّد بحدود اللعبة عند القراءة داخل الموقع.</p>
      ${g.fields.map((f) => fieldHtml(g.tag, f)).join('')}
      <div class="cluster"><button class="btn btn-primary" data-act="gc-save">${icon('save')}معاينة وحفظ التغييرات</button><button class="btn btn-ghost" data-act="gc-reset">${icon('refresh')}الإعداد الطبيعي لكل الحقول</button></div>
      <div class="section-label">سجل الإصدارات</div>
      ${hist.length ? `<div class="stack-s">${hist.slice(0, 15).map((h) => `<div class="ops-row" style="cursor:default"><span class="t"><b>الإصدار ${fmt(h.v)}${h.restoredFrom ? ' (استعادة من ' + fmt(h.restoredFrom) + ')' : ''}</b><span class="muted small">${esc(O.date(h.t))} · ${esc(h.by || '')} · ${esc(Object.keys(h.values || {}).length ? Object.keys(h.values).map((k) => { const f = g.fields.find((x) => x.key === k); return (f ? f.label : k) + '=' + (f ? fmtVal(f, h.values[k]) : JSON.stringify(h.values[k])); }).join(' | ') : 'كل الحقول طبيعية')}</span></span>${c && c.v === h.v ? UI.badge('الحالي', 'ok') : `<button class="btn btn-ghost btn-sm" data-gc-restore="${esc(h._k)}">${icon('refresh')}استعادة</button>`}</div>`).join('')}</div>` : '<p class="muted">لا إصدارات سابقة بعد.</p>'}
    </article>`;
  }
  function body() {
    if (!O.owner()) return O.denied(); if (!O.store()) return O.noStore(); if (!Object.keys(schema()).length) return O.error('تعذّر قراءة مخطط إعدادات الألعاب من الموقع.', 'gc-retry'); if (!C.ready) return O.skel(5);
    return `<div class="ops-cols"><div class="stack"><div class="ops-bar"><label class="search grow"><span class="sr-only">ابحث عن لعبة</span>${icon('search')}<input class="input" id="gc-q" placeholder="ابحث عن لعبة…" value="${esc(C.filter)}" autocomplete="off"></label></div><div id="gc-list">${list()}</div></div><aside class="sticky" id="gc-ed">${editor()}</aside></div>`;
  }
  function paint(v, onlyList) { const m = $('#gc-main', v); if (!m) return; if (!$('#gc-list', m)) { m.innerHTML = body(); return; } $('#gc-list', m).innerHTML = list(); if (!onlyList) $('#gc-ed', m).innerHTML = editor(); }

  async function save(v, valuesFull, restoredFrom) {
    const g = games().find((x) => x.tag === C.sel); const st = O.store(); if (!g || !st || C.saving) return;
    const prev = C.cur[g.tag]; const prevEff = {}; g.fields.forEach((f) => { prevEff[f.key] = effective(g.tag, f); });
    const diffs = g.fields.filter((f) => !eq(prevEff[f.key], valuesFull[f.key]));
    if (!diffs.length) { UI.toast('لا توجد تغييرات للحفظ'); return; }
    const ok = await new Promise((res) => {
      const m = UI.modal({ title: 'مراجعة التغييرات', html: `<table class="ops-table"><thead><tr><th>الإعداد</th><th>القيمة السابقة</th><th>القيمة الجديدة</th></tr></thead><tbody>${diffs.map((f) => `<tr><td>${esc(f.label)}</td><td>${esc(fmtVal(f, prevEff[f.key]))}</td><td><b>${esc(fmtVal(f, valuesFull[f.key]))}</b></td></tr>`).join('')}</tbody></table>`, foot: '<button class="btn btn-primary" data-ok>حفظ التغييرات</button><button class="btn btn-ghost" data-no>تراجع</button>' });
      m.el.querySelector('[data-ok]').onclick = () => { m.close(); res(true); }; m.el.querySelector('[data-no]').onclick = () => { m.close(); res(false); };
      m.el.addEventListener('click', (e) => { if (e.target === m.el || e.target.closest('[data-x]')) res(false); });
    });
    if (!ok) return;
    C.saving = true; const me = O.me(); const vals = sparse(g, valuesFull); const expect = prev ? prev.v : 0;
    try {
      const res = await st.txn('opsConfig/current/' + g.tag, (cur) => { const cv = cur ? cur.v : 0; if (cv !== expect) return undefined; return { v: cv + 1, values: vals, by: me.email || me.uid, t: O.SV() }; });
      if (!res.committed) { UI.toast('تغيّرت إعدادات هذه اللعبة من جهة أخرى — أُعيد التحميل', 'bad'); C.saving = false; return; }
      const nv = res.value.v;
      await st.push('opsConfig/history/' + g.tag, Object.assign({ v: nv, values: vals, by: me.email || me.uid, t: O.SV(), prevV: expect }, restoredFrom ? { restoredFrom } : {}));
      await O.audit('gameconfig.' + (restoredFrom ? 'restore' : 'save'), { tag: g.tag, v: nv, changed: diffs.map((f) => f.key) });
      UI.toast('تم الحفظ — يُطبَّق على الراوندات الجديدة (الإصدار ' + nv + ')');
      const c = O.core(); if (c && c.configPreload) c.configPreload();
    } catch (e) { UI.toast('فشل الحفظ — ' + (e && e.message || 'خطأ'), 'bad'); }
    C.saving = false;
  }
  function subscribe(v) {
    stops.forEach((f) => f()); stops = []; C.ready = false;
    if (!O.store()) return; let n = 0; const one = () => { if (++n >= 2) { C.ready = true; paint(v); } };
    let a = true, b = true;
    stops.push(O.sub(v, 'opsConfig/current', (val) => { C.cur = val || {}; if (a) { a = false; one(); } else paint(v, !!$('#gc-ed .field:focus-within', v)); }));
    stops.push(O.sub(v, 'opsConfig/history', (val) => { C.hist = val || {}; if (b) { b = false; one(); } else paint(v, !!$('#gc-ed .field:focus-within', v)); }));
  }
  Studio.actions['gc-retry'] = () => { const v = document.getElementById('view-gconf'); if (v) subscribe(v); };
  Studio.actions['gc-save'] = () => { const v = document.getElementById('view-gconf'); const g = games().find((x) => x.tag === C.sel); if (!v || !g) return; const r = readForm(v, g); if (r.errs.length) { UI.toast(r.errs[0], 'bad'); return; } save(v, r.values); };
  Studio.actions['gc-reset'] = () => { const v = document.getElementById('view-gconf'); const g = games().find((x) => x.tag === C.sel); if (!v || !g) return; const full = {}; g.fields.forEach((f) => { full[f.key] = f.default; }); save(v, full); };
  Studio.register({ id: 'gconf', title: 'إعدادات الألعاب', en: 'ADVANCED GAME CONFIGURATION', icon: 'sliders', desc: 'تحكم في إعدادات كل لعبة بشكل مستقل وآمن',
    html() { return `<div id="gc-main">${body()}</div>`; },
    mount(v) {
      subscribe(v);
      v.addEventListener('input', (e) => { if (e.target.id === 'gc-q') { C.filter = e.target.value.trim(); const l = $('#gc-list', v); if (l) l.innerHTML = list(); } });
      v.addEventListener('click', (e) => {
        const b = e.target.closest('[data-gc]'); if (b) { C.sel = b.dataset.gc; paint(v); if (innerWidth < 980) $('#gc-ed', v).scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        const r = e.target.closest('[data-gc-restore]'); if (r) { const g = games().find((x) => x.tag === C.sel); const h = C.hist[g.tag] && C.hist[g.tag][r.dataset.gcRestore]; if (!h) return; const full = {}; g.fields.forEach((f) => { const cv = O.core() && O.core().clampField ? O.core().clampField(g.tag, f.key, (h.values || {})[f.key]) : undefined; full[f.key] = cv === undefined ? f.default : cv; }); save(v, full, h.v); }
      });
    } });
  window.OpsConfig = { _C: C, games, effective };
})();
