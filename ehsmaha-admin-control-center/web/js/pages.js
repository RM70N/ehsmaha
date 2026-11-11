import { get, post, newKey } from './api.js';
import { esc, icon, $, $$, fmtN, fmtDate, ago, toast, modal, btn, setBusy, skeleton, empty, errorBox, download, chartSvg } from './ui.js';
import { openAction } from './forms.js';

const SEV = { critical: ['حرج', 'bad'], warning: ['تحذير', 'warn'], info: ['معلومة', ''] };
const STATUS_LBL = { up: ['يعمل', 'up'], down: ['معطّل', 'down'], unconfigured: ['غير مُهيّأ', ''], unknown: ['لم يُفحص', ''] };
const nav = (h) => { location.hash = h; };

// ---------- مركز القيادة الرئيسي (OVERVIEW) ----------
export async function pageOverview(root, me) {
  root.innerHTML = `<div class="page-head"><div><h1>مركز القيادة</h1><p>مؤشرات حقيقية من مصادرها — تُظهر كل بطاقة المصدر ووقت التحديث، وإن تعذّر المصدر تظهر «غير متاح» بدل أرقام قديمة.</p></div><button class="btn" id="ov-r">${icon('rotate')}<span>تحديث</span></button></div><div id="ov">${skeleton(8)}</div>`;
  const load = async (force) => {
    const box = $('#ov', root); if (!force) box.innerHTML = skeleton(8);
    try {
      const d = await get('/api/overview');
      const stat = (m) => {
        if (m.status !== 'ok') return `<div class="stat na"><div class="lbl">${esc(m.label)}</div><div class="val">غير متاح</div><div class="muted">${esc(m.reason || '')}</div><div class="src">${esc(m.source)} · ${ago(m.updatedAt)}</div></div>`;
        const v = m.value; let val;
        if (typeof v === 'number') val = fmtN(v);
        else if (m.id === 'bridgeStreamers') val = `${fmtN(v.enabled)} <small class="muted">من ${fmtN(v.total)}</small>`;
        else if (m.id === 'events') val = `${fmtN(v.streamerEvents)}${v.event100 ? ` <small class="muted">+ عدد جديد (${esc(v.event100)})</small>` : ''}`;
        else if (m.id === 'botHealth') val = `<span class="chip ok">متصل</span> <small class="muted">ping ${v.ping ?? '—'}ms · تشغيل ${v.uptime != null ? Math.round(v.uptime / 60) + 'د' : '—'}</small>`;
        else if (m.id === 'guild') val = `${fmtN(v.members)} <small class="muted">عضو · ${fmtN(v.online)} متصل</small>`;
        else if (m.id === 'commands') val = `${fmtN(v.inFiles)} <small class="muted">أمر في ملفات البوت</small>`;
        else val = esc(JSON.stringify(v));
        return `<div class="stat"><div class="lbl">${esc(m.label)}</div><div class="val">${val}</div><div class="src">${esc(m.source)} · ${ago(m.updatedAt)}</div></div>`;
      };
      box.innerHTML = `
        <div class="panel mb18"><div class="panel-h"><h3>صحة الخدمات</h3><a href="#/s/health/now">التفاصيل</a></div><div class="panel-b grid g-auto">${d.services.map((s) => { const [l, c] = STATUS_LBL[s.status] || STATUS_LBL.unknown; return `<div class="svc"><span class="dot ${c}"></span><div><div class="n">${esc(s.label)}</div><div class="d">${l}${s.checkedAt ? ' · ' + ago(s.checkedAt) : ''}</div></div><span class="ms">${s.ms != null ? s.ms + 'ms' : ''}</span></div>`; }).join('')}</div></div>
        ${d.workspaces.map((w) => `<h3 class="muted h-sub">${esc(w.label)}</h3><div class="grid g-auto">${w.metrics.map(stat).join('')}</div>`).join('')}
        <div class="grid g-2 mt22">
          <div class="panel"><div class="panel-h"><h3>التنبيهات المفتوحة <span class="chip ${d.alerts.open ? 'bad' : 'ok'}">${d.alerts.open}</span></h3><a href="#/s/alerts/open">الكل</a></div><div class="panel-b">${d.alerts.latest.length ? d.alerts.latest.map((a) => `<div class="svc mb8"><span class="chip ${SEV[a.severity]?.[1] || ''}">${SEV[a.severity]?.[0] || ''}</span><div class="n">${esc(a.title)}</div><span class="ms">×${a.count} · ${ago(a.lastAt)}</span></div>`).join('') : '<div class="muted">لا توجد تنبيهات مفتوحة 🎉</div>'}</div></div>
          <div class="panel"><div class="panel-h"><h3>الأمان (24 ساعة)</h3><a href="#/s/security/logins">السجل</a></div><div class="panel-b grid g-auto"><div class="stat"><div class="lbl">محاولات دخول فاشلة</div><div class="val">${fmtN(d.security.failedLogins24h)}</div></div><div class="stat"><div class="lbl">جلسات نشطة</div><div class="val">${fmtN(d.security.activeSessions)}</div></div></div></div>
        </div>
        ${d.recent.length ? `<div class="panel mt18"><div class="panel-h"><h3>آخر العمليات الإدارية</h3><a href="#/audit">سجل التدقيق</a></div><div class="tbl-wrap"><table class="tbl"><tbody>${d.recent.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.target || '')}</td><td>${esc(r.actorName)}</td><td><span class="chip ${r.status === 'success' ? 'ok' : r.status === 'saved_pending_apply' ? 'warn' : 'bad'}">${esc(r.status)}</span></td><td class="muted">${ago(r.ts)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    } catch (e) { box.innerHTML = errorBox(e.message); }
  };
  $('#ov-r', root).addEventListener('click', () => load(false)); load();
}

// ---------- صفحة قسم عامة (جداول + إجراءات) ----------
export async function pageSection(root, me, secId, tab) {
  const sec = me.sections.find((s) => s.id === secId);
  if (!sec) { root.innerHTML = empty('القسم غير متاح لحسابك', 'قد يكون المالك أخفى هذا القسم عنك.', 'lock'); return; }
  const views = sec.views; const hasActions = sec.actionCount > 0;
  const cur = tab || (views[0]?.id ?? 'actions');
  root.innerHTML = `<div class="page-head"><div><h1>${icon(sec.icon || 'bolt')} ${esc(sec.label)}</h1><p>${esc(sec.description)}</p></div></div>
    <div class="tabs" role="tablist">${views.map((v) => `<button class="tab ${v.available ? '' : 'na'}" role="tab" aria-selected="${cur === v.id}" data-t="${v.id}">${esc(v.label)}</button>`).join('')}${hasActions ? `<button class="tab" role="tab" aria-selected="${cur === 'actions'}" data-t="actions">${icon('bolt')} الإجراءات <span class="chip violet">${sec.actionCount}</span></button>` : ''}</div><div id="tab-body"></div>`;
  $$('.tab', root).forEach((t) => t.addEventListener('click', () => nav(`#/s/${secId}/${t.dataset.t}`)));
  const body = $('#tab-body', root);
  if (secId === 'access' && cur === 'matrix') return pageAccess(body, me);
  if (secId === 'audit') return pageAudit(body, me, cur);
  if (cur === 'actions') return actionsTab(body, me, sec);
  const v = views.find((x) => x.id === cur); if (!v) { body.innerHTML = empty('العرض غير موجود'); return; }
  return viewTab(body, secId, v);
}

async function viewTab(body, secId, v, state = { q: '', cursor: null, page: 0, stack: [] }) {
  if (!v.available) { body.innerHTML = errorBox(`غير متاح: ${v.unavailableReason}`, 'warn'); return; }
  body.innerHTML = `<div class="toolbar">${v.search ? `<input class="input" id="vq" placeholder="${esc(v.placeholder || 'بحث…')}" value="${esc(state.q)}">` : ''}<button class="btn" id="vr">${icon('rotate')}<span>تحديث</span></button></div><div id="vb">${skeleton(6)}</div>`;
  const run = async () => {
    const out = $('#vb', body); out.innerHTML = skeleton(6);
    try {
      const qs = new URLSearchParams({ q: state.q, page: state.page }); if (state.cursor) qs.set('cursor', state.cursor);
      const d = await get(`/api/views/${secId}/${v.id}?${qs}`);
      const rows = d.rows || [];
      const cell = (c, r) => { const val = r[c.key]; if (c.type === 'date') return fmtDate(val); if (c.mono) return `<span class="mono">${esc(val ?? '—')}</span>`; return esc(val ?? '—'); };
      const chart = v.chart && rows.length ? `<div class="panel mb14"><div class="panel-b">${chartSvg(rows, v.chart)}</div></div>` : '';
      out.innerHTML = `${chart}${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${v.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${v.columns.map((c) => `<td>${cell(c, r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : empty(d.meta?.note || 'لا توجد بيانات', state.q ? 'جرّب تغيير كلمة البحث' : '', 'file')}
        <div class="meta-line"><span>المصدر: ${esc(d.source || '—')}</span><span>آخر تحديث: ${ago(d.updatedAt)}</span>${d.total != null ? `<span>الإجمالي: ${fmtN(d.total)}</span>` : ''}<span>${d.ms}ms</span>${d.meta?.note && rows.length ? `<span>${esc(d.meta.note)}</span>` : ''}${d.meta?.stats ? `<span>${esc(JSON.stringify(d.meta.stats))}</span>` : ''}${d.meta?.total != null ? `<span>المجموع: ${fmtN(d.meta.total)}</span>` : ''}${d.meta?.open != null ? `<span>مفتوحة: ${d.meta.open} · مغلقة: ${d.meta.closed} · متوسط الإغلاق: ${d.meta.avgCloseMinutes ?? '—'} دقيقة</span>` : ''}</div>
        <div class="pager">${state.page > 0 || state.stack.length ? '<button class="btn sm" id="pp">السابق</button>' : ''}${d.nextCursor || (d.total != null && (state.page + 1) * 25 < d.total) ? '<button class="btn sm" id="pn">التالي</button>' : ''}</div>`;
      $('#pn', out)?.addEventListener('click', () => { if (d.nextCursor) { state.stack.push(state.cursor); state.cursor = d.nextCursor; } else state.page++; run(); });
      $('#pp', out)?.addEventListener('click', () => { if (state.stack.length) state.cursor = state.stack.pop(); else state.page = Math.max(0, state.page - 1); run(); });
    } catch (e) { out.innerHTML = errorBox(e.status === 503 ? `غير متاح: ${e.message}` : e.message, e.status === 503 ? 'warn' : 'err'); }
  };
  let t; $('#vq', body)?.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; state.cursor = null; state.page = 0; state.stack = []; run(); }, 350); });
  $('#vr', body).addEventListener('click', run); run();
}

async function actionsTab(body, me, sec) {
  body.innerHTML = skeleton(6);
  let list; try { list = (await get(`/api/actions?section=${sec.id}`)).actions; } catch (e) { body.innerHTML = errorBox(e.message); return; }
  const render = (q = '') => {
    const t = q.trim().toLowerCase(); const groups = {};
    for (const a of list.filter((a) => !t || (a.label + a.description + a.group).toLowerCase().includes(t))) (groups[a.group] ||= []).push(a);
    $('#ag', body).innerHTML = Object.keys(groups).length ? Object.entries(groups).map(([g, items]) => `<div class="act-group"><h3>${esc(g)}</h3><div class="act-grid">${items.map((a) => `<button class="act ${a.danger === 'critical' ? 'danger' : a.danger}" data-a="${a.id}" ${a.available ? '' : 'disabled'} title="${esc(a.available ? a.description : 'غير متاح: ' + a.unavailableReason)}"><span class="ic">${icon(a.icon)}</span><span><b>${esc(a.label)}</b><small>${esc(a.available ? a.description : 'غير متاح: ' + a.unavailableReason)}</small><span class="badges">${a.kind === 'read' ? '<span class="chip">قراءة</span>' : `<span class="chip ${{ low: 'ok', medium: 'warn', high: 'bad', critical: 'bad' }[a.danger]}">${{ low: 'خطورة منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة' }[a.danger]}</span>`}${a.reversible ? '<span class="chip violet">قابل للتراجع</span>' : ''}${a.apply === 'restart' ? '<span class="chip warn">يحتاج إعادة تشغيل البوت</span>' : a.apply === 'ttl' ? '<span class="chip">≤10د</span>' : ''}</span></span></button>`).join('')}</div></div>`).join('') : empty('لا توجد إجراءات مطابقة');
    $$('.act', body).forEach((b) => b.addEventListener('click', () => openAction(list.find((a) => a.id === b.dataset.a), { onDone: () => {} })));
  };
  body.innerHTML = `<div class="toolbar"><input class="input" id="aq" placeholder="ابحث في الإجراءات…"><span class="muted">${list.length} إجراء — كل زر ينفّذ عملية حقيقية ويتحقق منها من المصدر الأصلي</span></div><div id="ag"></div>`;
  $('#aq', body).addEventListener('input', (e) => render(e.target.value)); render();
}

// ---------- سجل التدقيق ----------
async function pageAudit(body, me, tab) {
  if (tab === 'actions') return actionsTab(body, me, me.sections.find((s) => s.id === 'audit'));
  body.innerHTML = `<div class="toolbar"><input class="input" id="aq" placeholder="بحث (عملية، هدف، مسؤول…)"><select class="input mw150" id="as"><option value="">كل الحالات</option><option value="success">نجاح</option><option value="failed">فشل</option><option value="denied">مرفوض</option><option value="saved_pending_apply">معلّق التطبيق</option></select><input class="input mw150" id="asec" placeholder="القسم (مثل players)"><button class="btn" id="ac">${icon('download')}<span>CSV</span></button><button class="btn" id="aj">${icon('download')}<span>JSON</span></button></div><div id="ab">${skeleton(6)}</div>`;
  let page = 0;
  const qs = () => { const p = new URLSearchParams({ page, limit: 25 }); const q = $('#aq', body).value.trim(), s = $('#as', body).value, sec = $('#asec', body).value.trim(); if (q) p.set('q', q); if (s) p.set('status', s); if (sec) p.set('section', sec); return p; };
  const run = async () => {
    const out = $('#ab', body); out.innerHTML = skeleton(6);
    try {
      const d = await get(`/api/audit?${qs()}`);
      out.innerHTML = `${d.rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الوقت</th><th>المسؤول</th><th>العملية</th><th>الهدف</th><th>الحالة</th><th></th></tr></thead><tbody>${d.rows.map((r) => `<tr class="clickable" data-id="${esc(r.id)}"><td>${fmtDate(r.ts)}</td><td>${esc(r.actorName)}</td><td>${esc(r.label)}<div class="faint mono">${esc(r.action)}</div></td><td>${esc(r.target || '—')}</td><td><span class="chip ${r.status === 'success' ? 'ok' : r.status === 'saved_pending_apply' ? 'warn' : 'bad'}">${esc(r.status)}</span></td><td>${r.undo ? icon('history') : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('لا توجد عمليات مطابقة')}<div class="meta-line"><span>الإجمالي: ${fmtN(d.total)}</span><span>سجل غير قابل للتعديل (سلسلة تجزئة)</span></div><div class="pager">${page > 0 ? '<button class="btn sm" id="pp">السابق</button>' : ''}${(page + 1) * 25 < d.total ? '<button class="btn sm" id="pn">التالي</button>' : ''}</div>`;
      $('#pn', out)?.addEventListener('click', () => { page++; run(); }); $('#pp', out)?.addEventListener('click', () => { page--; run(); });
      $$('tr.clickable', out).forEach((tr) => tr.addEventListener('click', () => auditDetail(d.rows.find((r) => r.id === tr.dataset.id), run)));
    } catch (e) { out.innerHTML = errorBox(e.message); }
  };
  let t; for (const id of ['#aq', '#as', '#asec']) $(id, body).addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { page = 0; run(); }, 350); });
  $('#ac', body).addEventListener('click', async () => { const r = await fetch(`/api/audit/export?format=csv&${qs()}`, { credentials: 'same-origin' }); if (r.ok) download('audit.csv', 'text/csv', await r.text()); else toast('تعذّر التصدير', 'bad'); });
  $('#aj', body).addEventListener('click', async () => { const r = await fetch(`/api/audit/export?format=json&${qs()}`, { credentials: 'same-origin' }); if (r.ok) download('audit.json', 'application/json', await r.text()); else toast('تعذّر التصدير', 'bad'); });
  run();
}
function auditDetail(r, refresh) {
  const kv = [['المعرّف', r.id], ['الوقت', fmtDate(r.ts)], ['المسؤول', `${r.actorName} (${r.actor})`], ['القسم', r.section], ['العملية', `${r.label} — ${r.action}`], ['الهدف', r.target], ['الحالة', r.status], ['السبب', r.reason], ['الخطأ', r.errorMessage || r.error], ['طلب', r.requestId], ['IP (مقنّع)', r.ip], ['الجهاز', r.device], ['المدة', r.ms != null ? r.ms + 'ms' : null], ['البصمة', r.hash?.slice(0, 20)]].filter(([, v]) => v);
  const html = `<dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${r.params ? `<h4>المدخلات</h4><pre class="json">${esc(JSON.stringify(r.params, null, 2))}</pre>` : ''}${r.before ? `<h4>قبل</h4><pre class="json">${esc(JSON.stringify(r.before, null, 2))}</pre>` : ''}${r.after ? `<h4>بعد</h4><pre class="json">${esc(JSON.stringify(r.after, null, 2))}</pre>` : ''}${r.pending ? `<div class="errbox warn">${esc(r.pending)}</div>` : ''}`;
  const foot = []; if (r.undo && ['success', 'saved_pending_apply'].includes(r.status)) foot.push(btn('تراجع عن هذه العملية', { cls: 'danger', ic: 'history', onClick: async (e) => { if (!confirm('تنفيذ العكس المسجّل لهذه العملية؟')) return; setBusy(e.currentTarget, true); try { const u = await post(`/api/audit/${r.id}/undo`); toast(u.message || 'تم التراجع'); m.close(true); refresh?.(); } catch (err) { toast(err.message, 'bad'); setBusy(e.currentTarget, false); } } }));
  foot.push(btn('إغلاق', { onClick: () => m.close() }));
  const m = modal({ title: 'تفاصيل العملية', body: html, footer: foot, wide: true });
}

// ---------- صلاحيات الأدمن (للمالك) ----------
async function pageAccess(body, me) {
  body.innerHTML = skeleton(8);
  const load = async () => {
    let mx; try { mx = await get('/api/access/matrix'); } catch (e) { body.innerHTML = errorBox(e.message); return; }
    const sw = (id, on, kind, label, extra = '') => `<label class="switch" title="${esc(label)}"><input type="checkbox" ${on ? 'checked' : ''} data-k="${kind}" data-id="${esc(id)}" ${extra} aria-label="${esc(label)}"><i></i></label>`;
    body.innerHTML = `<div class="panel mb18"><div class="panel-b"><p class="muted mt0">أنت المالك: كل شيء متاح لك دائماً. من هنا تحدّد ما <b>يراه</b> الأدمن وما <b>يستطيع تنفيذه</b>. تُفرض هذه القواعد في الخادم عند كل طلب (لا يكفي إخفاء الزر)، وكل تغيير يُسجَّل في سجل التدقيق ويمكن التراجع عنه. الإصدار الحالي: <b>${mx.version}</b>${mx.updatedBy ? ` · آخر تعديل: ${esc(mx.updatedBy)} ${ago(mx.updatedAt)}` : ''}</p>
      <div class="presets"><button class="btn sm" data-p="full">${icon('unlock')}<span>كل الصلاحيات</span></button><button class="btn sm" data-p="readonly">${icon('eye')}<span>قراءة فقط</span></button><button class="btn sm" data-p="discord_only">${icon('bot')}<span>ديسكورد فقط</span></button><button class="btn sm" data-p="website_only">${icon('gamepad')}<span>الموقع فقط</span></button><button class="btn sm danger" data-p="locked">${icon('lock')}<span>إغلاق كامل</span></button><button class="btn sm" data-p="_reset">${icon('rotate')}<span>الافتراضي</span></button><button class="btn sm" data-p="_revoke">${icon('logout')}<span>إنهاء جلسات الأدمن الآن</span></button></div>
      <div class="grid g-auto"><div class="svc"><div class="n">مساحة الموقع</div><span class="ms">${sw('website', mx.workspaces.website, 'ws', 'مساحة الموقع')}</span></div><div class="svc"><div class="n">مساحة ديسكورد والبوت</div><span class="ms">${sw('discord', mx.workspaces.discord, 'ws', 'مساحة ديسكورد')}</span></div></div></div></div>
      ${['website', 'discord', 'control'].map((w) => `<h3 class="muted h-sub">${{ website: 'أقسام الموقع', discord: 'أقسام ديسكورد والبوت', control: 'الأقسام المشتركة' }[w]}</h3>${mx.sections.filter((s) => s.workspace === w).map((s) => `<div class="acc-sec"><div class="acc-row"><div class="t"><b>${esc(s.label)}</b><small>${s.ownerOnly ? '🔒 للمالك فقط — لا يمكن منحه' : `${s.actions.filter((a) => a.enabled).length} من ${s.actions.length} إجراء مسموح`}</small></div>${s.ownerOnly ? '' : `<button class="btn sm ghost" data-bulk="${s.id}" data-v="1">السماح بالكل</button><button class="btn sm ghost" data-bulk="${s.id}" data-v="0">منع الكل</button>${sw(s.id, s.enabled, 'sec', 'إظهار القسم للأدمن')}<button class="btn sm ghost icon" data-exp="${s.id}" aria-label="الإجراءات">${icon('chevd')}</button>`}</div>${s.ownerOnly ? '' : `<div class="acc-acts hidden" data-acts="${s.id}">${s.actions.filter((a) => !a.ownerOnly).map((a) => `<div class="acc-act"><span class="t">${esc(a.label)} <span class="chip ${{ low: 'ok', medium: 'warn', high: 'bad', critical: 'bad' }[a.danger] || ''}">${a.danger}</span></span>${sw(a.id, a.enabled, 'act', a.label)}</div>`).join('')}${s.actions.some((a) => a.ownerOnly) ? '<div class="faint pt6">إجراءات أخرى مقصورة على المالك.</div>' : ''}</div>`}</div>`).join('')}`).join('')}`;
    const run = async (id, params, label) => {
      try { const d = await get(`/api/actions?section=access`); const a = d.actions.find((x) => x.shortId === id); const res = await post(`/api/actions/access/${id}/run`, { params, idempotencyKey: newKey(), confirm: true, reason: undefined }); toast(res.message, 'ok'); load(); return res; } catch (e) { toast(e.message, 'bad', 6000); load(); }
    };
    $$('input[data-k]', body).forEach((el) => el.addEventListener('change', () => { const k = el.dataset.k, id = el.dataset.id; if (k === 'ws') run('set_workspace', { workspace: id, enabled: el.checked }); else if (k === 'sec') run('set_section', { section: id, enabled: el.checked }); else run('set_action', { action: id, enabled: el.checked }); }));
    $$('[data-exp]', body).forEach((b) => b.addEventListener('click', () => $(`[data-acts="${b.dataset.exp}"]`, body).classList.toggle('hidden')));
    $$('[data-bulk]', body).forEach((b) => b.addEventListener('click', () => run('set_section_actions', { section: b.dataset.bulk, enabled: b.dataset.v === '1', scope: 'all' })));
    $$('[data-p]', body).forEach((b) => b.addEventListener('click', async () => { const p = b.dataset.p; if (!confirm('تأكيد تنفيذ هذا التغيير على صلاحيات الأدمن؟')) return; if (p === '_reset') run('reset_defaults', {}); else if (p === '_revoke') run('revoke_admin_sessions', {}); else run('apply_preset', { preset: p }); }));
  };
  load();
}

// ---------- البحث الشامل ----------
export async function pageSearch(root, me, q) {
  root.innerHTML = `<div class="page-head"><div><h1>نتائج البحث: «${esc(q)}»</h1><p>البحث يشمل الأقسام المصرّح لحسابك بعرضها فقط.</p></div></div><div id="sr">${skeleton(6)}</div>`;
  try {
    const d = await get(`/api/search?q=${encodeURIComponent(q)}`);
    const groups = {}; for (const r of d.results) (groups[r.type] ||= []).push(r);
    $('#sr', root).innerHTML = (Object.keys(groups).length ? Object.entries(groups).map(([t, items]) => `<div class="sr-group"><h3 class="muted">${esc(t)}</h3>${items.map((r) => `<button class="sr-item" data-s="${esc(r.section)}" data-v="${esc(r.view || '')}" data-t="${esc(r.type)}" data-id="${esc(r.id || '')}"><span class="chip violet">${esc(t)}</span><span><b>${esc(r.title)}</b><div class="muted mono">${esc(r.subtitle || '')}</div></span></button>`).join('')}</div>`).join('') : empty('لا نتائج', d.note || 'جرّب كلمة أخرى', 'search')) + (d.notes?.length ? errorBox('تعذّر البحث في بعض المصادر: ' + d.notes.join(' · '), 'warn') : '');
    $$('.sr-item', root).forEach((b) => b.addEventListener('click', () => { if (b.dataset.t === 'إجراء') nav(`#/s/${b.dataset.s}/actions`); else if (b.dataset.t === 'سجل عملية') nav('#/audit'); else nav(`#/s/${b.dataset.s}/${b.dataset.v || ''}`); }));
  } catch (e) { $('#sr', root).innerHTML = errorBox(e.message); }
}

// ---------- صحة الأنظمة / التكامل: عرض مخصص أعلى الجداول ----------
export async function pageIntegrationMap(root) {
  try {
    const d = await get('/api/integration');
    root.insertAdjacentHTML('afterbegin', `<div class="panel mb18"><div class="panel-h"><h3>خريطة التكامل (حيّة)</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>النظام</th><th>المصدر ← الوجهة</th><th>الحالة</th><th>الفحص</th></tr></thead><tbody>${d.links.map((l) => `<tr><td><b>${esc(l.name)}</b></td><td>${esc(l.source)}<div class="faint">${esc(l.destination)}</div></td><td>${l.available ? '<span class="chip ok">مُهيّأ</span>' : `<span class="chip warn" title="${esc(l.reason)}">غير مُهيّأ</span><div class="faint">${esc(l.reason || '')}</div>`}</td><td>${l.health ? `<span class="dot ${l.health.status === 'up' ? 'up' : l.health.status === 'down' ? 'down' : ''}"></span> ${l.health.ms != null ? l.health.ms + 'ms' : ''} <span class="faint">${l.health.checkedAt ? ago(l.health.checkedAt) : ''}</span>` : '—'}</td></tr>`).join('')}</tbody></table></div><div class="panel-b muted">طرق تطبيق التغييرات على البوت: <b>فوري</b> = يقرؤه البوت من قاعدته عند كل حدث · <b>≤10د</b> = كاش داخلي · <b>إعادة تشغيل</b> = يُحمَّل عند الإقلاع فقط.</div></div>`);
  } catch { /* */ }
}
