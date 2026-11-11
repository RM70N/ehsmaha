// تشغيل أي إجراء: نموذج مولَّد من تعريف الخادم ← تأكيد متناسب مع الخطورة ← تنفيذ ← عرض النتيجة الحقيقية (نجاح/معلّق/فشل) مع التحقق.
import { get, post, newKey, ApiError } from './api.js';
import { esc, icon, modal, btn, setBusy, toast, download, fmtDate, $ } from './ui.js';

const DANGER = { low: ['منخفضة', 'ok'], medium: ['متوسطة', 'warn'], high: ['عالية', 'bad'], critical: ['حرجة', 'bad'] };
const APPLY = { live: 'يُطبَّق فوراً في البوت (يقرأ قاعدته عند كل حدث)', ttl: 'يُطبَّق خلال ≤10 دقائق (كاش داخل البوت)', restart: 'لا يُطبَّق في البوت الجاري حتى إعادة تشغيله' };
const lookupCache = new Map();

async function lookup(kind) { if (!lookupCache.has(kind)) lookupCache.set(kind, get(`/api/lookup/${kind}`).then((r) => r.items).catch(() => null)); return lookupCache.get(kind); }
export const clearLookups = () => lookupCache.clear();

function fieldHtml(f) {
  const id = `f-${f.name}`; const req = f.required ? ' required' : '';
  let ctl;
  if (f.type === 'boolean') ctl = `<label class="switch"><input type="checkbox" id="${id}" name="${f.name}" ${f.default ? 'checked' : ''}><i></i></label>`;
  else if (f.type === 'select') ctl = `<select class="input" id="${id}" name="${f.name}"${req}>${f.required ? '' : '<option value="">—</option>'}${(f.options || []).map((o) => `<option value="${esc(o.value)}" ${String(f.default) === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  else if (f.type === 'textarea') ctl = `<textarea class="input" id="${id}" name="${f.name}" maxlength="${f.max || 4000}"${req} placeholder="${esc(f.placeholder || '')}"></textarea>`;
  else if (f.type === 'datetime') ctl = `<input class="input ltr" type="datetime-local" id="${id}" name="${f.name}"${req}>`;
  else if (['number', 'integer'].includes(f.type)) ctl = `<input class="input ltr" type="number" inputmode="decimal" id="${id}" name="${f.name}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} step="${f.type === 'integer' ? 1 : 'any'}" value="${f.default ?? ''}"${req}>`;
  else if (f.optionsFrom) ctl = `<select class="input" id="${id}" name="${f.name}" data-from="${f.optionsFrom}"${req}><option value="">جارٍ التحميل…</option></select>`;
  else ctl = `<input class="input ${f.type === 'snowflake' || f.type === 'url' ? 'ltr' : ''}" id="${id}" name="${f.name}" maxlength="${f.max || 200}" autocomplete="off" placeholder="${esc(f.placeholder || '')}"${req}>`;
  return `<div class="field" data-f="${f.name}"><label for="${id}">${esc(f.label)}${f.required ? ' <span class="faint">*</span>' : ''}</label>${ctl}${f.help ? `<div class="help">${esc(f.help)}</div>` : ''}<div class="err" data-err></div></div>`;
}

async function fillLookups(root, descriptor) {
  for (const sel of root.querySelectorAll('select[data-from]')) {
    const kind = sel.dataset.from; const f = descriptor.fields.find((x) => x.name === sel.name);
    if (kind === 'members') { // بحث لحظي: نقلب الحقل إلى إدخال + قائمة اقتراحات
      const inp = document.createElement('input'); inp.className = 'input ltr'; inp.name = sel.name; inp.id = sel.id; inp.required = sel.required; inp.autocomplete = 'off'; inp.placeholder = 'ابحث بالاسم أو الصق معرّف العضو'; const dl = document.createElement('datalist'); dl.id = `dl-${sel.name}`; inp.setAttribute('list', dl.id);
      let t; inp.addEventListener('input', () => { clearTimeout(t); const v = inp.value.trim(); if (v.length < 2 || /^\d{16,21}$/.test(v)) return; t = setTimeout(async () => { try { const r = await get(`/api/lookup/members?q=${encodeURIComponent(v)}`); dl.innerHTML = r.items.map((i) => `<option value="${esc(i.value)}">${esc(i.label)}</option>`).join(''); } catch { /* */ } }, 300); });
      sel.replaceWith(inp, dl); continue;
    }
    const items = await lookup(kind);
    if (!items) { const inp = document.createElement('input'); inp.className = 'input ltr'; inp.name = sel.name; inp.id = sel.id; inp.required = sel.required; inp.placeholder = f?.type === 'snowflake' ? 'الصق المعرّف (تعذّر تحميل القائمة)' : 'اكتب القيمة'; sel.replaceWith(inp); continue; }
    sel.innerHTML = `<option value="">— اختر —</option>${items.map((i) => `<option value="${esc(i.value)}">${esc(i.label)}</option>`).join('')}`;
  }
}

function collect(form, descriptor) {
  const params = {};
  for (const f of descriptor.fields) {
    const el = form.elements[f.name]; if (!el) continue;
    if (f.type === 'boolean') params[f.name] = el.checked;
    else if (f.type === 'datetime') { if (el.value) params[f.name] = new Date(el.value).getTime(); }
    else if (['number', 'integer'].includes(f.type)) { if (el.value !== '') params[f.name] = Number(el.value); }
    else if (el.value !== '') params[f.name] = el.value.trim();
  }
  return params;
}

function dataTable(data) {
  if (Array.isArray(data) && data.length && typeof data[0] === 'object') {
    const cols = [...new Set(data.slice(0, 30).flatMap((r) => Object.keys(r)))].slice(0, 8);
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${data.slice(0, 100).map((r) => `<tr>${cols.map((c) => `<td>${esc(typeof r[c] === 'object' ? JSON.stringify(r[c]) : /(^ts$|At$|^at$)/.test(c) && typeof r[c] === 'number' ? fmtDate(r[c]) : r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  return `<pre class="json">${esc(JSON.stringify(data, null, 2))}</pre>`;
}

function resultView(res, descriptor) {
  const pending = res.status === 'saved_pending_apply';
  const kv = [];
  if (res.after) kv.push(['القيمة المقروءة من المصدر بعد التنفيذ', `<pre class="json">${esc(JSON.stringify(res.after, null, 2))}</pre>`]);
  if (res.before && descriptor.kind !== 'read') kv.push(['القيمة السابقة', `<pre class="json">${esc(JSON.stringify(res.before, null, 2))}</pre>`]);
  const detail = res.detail && Array.isArray(res.detail) ? dataTable(res.detail) : res.detail ? `<pre class="json">${esc(JSON.stringify(res.detail, null, 2))}</pre>` : '';
  return `<div class="result ${pending ? 'pending' : 'ok'}"><h4>${icon(pending ? 'warn' : 'check')} ${esc(pending ? 'محفوظة — بانتظار التطبيق' : descriptor.kind === 'read' ? 'تم' : 'نُفِّذت وتم التحقق منها')}</h4><div>${esc(res.message || '')}</div>${descriptor.kind !== 'read' ? `<div class="meta-line"><span>${icon('check')} تحقق من المصدر الأصلي</span><span>معرّف التدقيق: <span class="mono">${esc(res.auditId || '—')}</span></span><span>${res.ms}ms</span>${res.replayed ? '<span class="chip warn">نتيجة مكررة (نفس الطلب)</span>' : ''}</div>` : ''}${kv.length ? `<dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}${detail}${res.data ? dataTable(res.data) : ''}</div>`;
}

export function openAction(descriptor, { onDone, prefill = {} } = {}) {
  const key = newKey(); let dirty = false; let busy = false;
  const form = document.createElement('form'); form.noValidate = false; form.autocomplete = 'off';
  const [dl, dk] = DANGER[descriptor.danger] || DANGER.low;
  const needsConfirm = descriptor.kind !== 'read' && descriptor.danger !== 'low';
  form.innerHTML = `<p class="muted">${esc(descriptor.description)}</p>${descriptor.fields.map(fieldHtml).join('')}<div class="field ${descriptor.reasonRequired || (needsConfirm && descriptor.kind !== 'read') ? '' : 'hidden'}" data-f="_reason"><label for="f-_reason">${descriptor.reasonRequired ? 'سبب العملية *' : 'سبب العملية (اختياري)'}</label><input class="input" id="f-_reason" name="_reason" maxlength="500" placeholder="يُسجَّل في سجل التدقيق" ${descriptor.reasonRequired ? 'required minlength="3"' : ''}><div class="err" data-err></div></div><div data-confirm class="hidden"></div><div data-out></div>`;
  form.addEventListener('input', () => { dirty = true; });
  for (const [k, v] of Object.entries(prefill)) { const el = form.elements[k]; if (el) el.value = v; }

  const submit = btn(descriptor.kind === 'read' ? 'عرض' : needsConfirm ? 'متابعة للتأكيد' : 'تنفيذ', { cls: descriptor.danger === 'critical' || descriptor.danger === 'high' ? 'danger' : 'primary', ic: descriptor.kind === 'read' ? 'eye' : 'bolt', type: 'submit' });
  const cancel = btn('إغلاق', { cls: 'ghost', onClick: () => m.close() });
  const m = modal({ title: descriptor.label, body: form, footer: [cancel, submit], dirty: () => dirty && !done, wide: descriptor.kind === 'read' });
  fillLookups(form, descriptor);
  let done = false, stage = 'form';

  const showErrors = (fields) => { for (const e of form.querySelectorAll('[data-err]')) e.textContent = ''; for (const [k, msg] of Object.entries(fields || {})) { const el = form.querySelector(`[data-f="${k}"] [data-err]`); if (el) el.textContent = msg; } };

  async function execute() {
    busy = true; setBusy(submit, true, 'جارٍ التنفيذ والتحقق…'); const out = $('[data-out]', form); out.innerHTML = '';
    try {
      const res = await post(`/api/actions/${descriptor.section}/${descriptor.shortId}/run`, { params: collect(form, descriptor), idempotencyKey: key, confirm: true, reason: form.elements._reason?.value || undefined });
      done = true; stage = 'done';
      out.innerHTML = resultView(res, descriptor);
      if (res.download) { const d = res.download; out.appendChild(btn('تنزيل الملف', { cls: 'primary', ic: 'download', onClick: () => download(d.filename, d.mime, d.text) })); }
      const foot = [btn('إغلاق', { cls: '', onClick: () => m.close(true) })];
      if (res.undoAvailable && res.auditId) foot.unshift(btn('تراجع عن العملية', { cls: 'danger', ic: 'history', onClick: async (e) => { if (!confirm('هل تريد التراجع عن هذه العملية؟')) return; setBusy(e.currentTarget, true, 'جارٍ التراجع…'); try { const u = await post(`/api/audit/${res.auditId}/undo`); toast(u.message || 'تم التراجع', 'ok'); onDone?.(); m.close(true); } catch (err) { toast(err.message, 'bad'); setBusy(e.currentTarget, false); } } }));
      m.setFooter(foot);
      $('[data-confirm]', form).classList.add('hidden'); form.querySelectorAll('input,select,textarea').forEach((el) => { el.disabled = true; });
      toast(res.status === 'saved_pending_apply' ? 'حُفظت — لكنها تحتاج تطبيقاً من البوت' : descriptor.kind === 'read' ? 'تم' : 'نُفِّذت وتم التحقق منها', res.status === 'saved_pending_apply' ? 'warn' : 'ok');
      onDone?.(res);
    } catch (e) {
      busy = false; setBusy(submit, false); stage = 'form';
      if (e.body?.fields) showErrors(e.body.fields);
      out.innerHTML = `<div class="result fail"><h4>${icon('warn')} ${esc(e.status === 403 ? 'مرفوضة' : e.status === 503 ? 'غير متاحة' : 'لم تنجح العملية')}</h4><div>${esc(e.message)}</div>${e.body?.auditId ? `<div class="meta-line"><span>سُجّلت المحاولة: <span class="mono">${esc(e.body.auditId)}</span></span></div>` : ''}</div>`;
      toast(e.message, 'bad', 6000);
    }
  }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault(); if (busy || done) return;
    if (!form.reportValidity()) return;
    if (needsConfirm && stage === 'form') {
      const params = collect(form, descriptor); const conf = $('[data-confirm]', form);
      const target = descriptor.fields.filter((f) => params[f.name] !== undefined && !['textarea'].includes(f.type)).map((f) => `${f.label}: ${f.type === 'select' ? (f.options.find((o) => String(o.value) === String(params[f.name]))?.label ?? params[f.name]) : params[f.name]}`).join(' · ');
      conf.className = `confirm-box ${descriptor.danger === 'critical' ? 'critical' : descriptor.danger === 'high' ? 'high' : ''}`;
      conf.innerHTML = `<div class="row"><span>العملية</span><b>${esc(descriptor.label)}</b></div><div class="row"><span>الهدف</span><span>${esc(target || '—')}</span></div><div class="row"><span>الأثر</span><span>${esc(descriptor.effect || '—')}</span></div><div class="row"><span>الخطورة</span><span class="chip ${dk}">${dl}</span></div><div class="row"><span>التراجع</span><span>${descriptor.reversible ? '✔ يمكن التراجع عنها بعد التنفيذ' : '✖ لا يمكن التراجع عنها'}</span></div>${descriptor.apply ? `<div class="row"><span>التطبيق</span><span>${esc(APPLY[descriptor.apply])}</span></div>` : ''}`;
      stage = 'confirm'; submit.querySelector('span').textContent = 'تأكيد وتنفيذ'; cancel.querySelector('span').textContent = 'رجوع'; cancel.onclick = null;
      cancel.addEventListener('click', function back(e) { if (stage !== 'confirm') return; e.stopImmediatePropagation(); stage = 'form'; conf.className = 'hidden'; submit.querySelector('span').textContent = 'متابعة للتأكيد'; cancel.querySelector('span').textContent = 'إغلاق'; }, { capture: true, once: true });
      return;
    }
    execute();
  });
  return m;
}
