import { icon } from './icons.js';
export { icon };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const fmtN = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('ar-EG-u-nu-latn'));
export function fmtDate(t) { if (t == null || t === '' || t === 0) return '—'; const d = new Date(t); return Number.isNaN(+d) ? '—' : d.toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }); }
export function ago(t) { if (!t) return '—'; const s = Math.round((Date.now() - t) / 1000); if (s < 5) return 'الآن'; if (s < 60) return `قبل ${s} ثانية`; if (s < 3600) return `قبل ${Math.round(s / 60)} دقيقة`; if (s < 86400) return `قبل ${Math.round(s / 3600)} ساعة`; return `قبل ${Math.round(s / 86400)} يوم`; }

export function toast(msg, kind = 'ok', ms = 4200) {
  const el = document.createElement('div'); el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'ok' ? 'check' : kind === 'bad' ? 'warn' : 'info')}<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), ms);
}

// نافذة منبثقة بسيطة مع إغلاق بـEsc/النقر خارجها، وتأكيد عند وجود تغييرات غير محفوظة
export function modal({ title, body, footer, wide = false, dirty = () => false, onClose }) {
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  scrim.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h3>${esc(title)}</h3><button class="btn ghost icon sm" data-x aria-label="إغلاق">${icon('x')}</button></div><div class="modal-b"></div><div class="modal-f"></div></div>`;
  const box = $('.modal', scrim); const b = $('.modal-b', scrim); const f = $('.modal-f', scrim);
  if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
  if (footer) (Array.isArray(footer) ? footer : [footer]).forEach((x) => f.appendChild(x)); else f.remove();
  const prevFocus = document.activeElement;
  const close = (force) => { if (!force && dirty() && !confirm('لديك تغييرات غير محفوظة. هل تريد الإغلاق؟')) return false; scrim.remove(); document.removeEventListener('keydown', onKey); prevFocus?.focus?.(); onClose?.(); return true; };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(); });
  $('[data-x]', scrim).addEventListener('click', () => close());
  document.body.appendChild(scrim);
  (b.querySelector('input,select,textarea') || $('[data-x]', scrim)).focus();
  return { el: box, body: b, footer: f, close, setFooter(nodes) { f.replaceChildren(...nodes); } };
}

export function btn(label, { cls = '', ic = '', onClick, disabled = false, type = 'button' } = {}) {
  const b = document.createElement('button'); b.type = type; b.className = `btn ${cls}`; b.disabled = disabled;
  b.innerHTML = `${ic ? icon(ic) : ''}<span>${esc(label)}</span>`; if (onClick) b.addEventListener('click', onClick); return b;
}
export function setBusy(button, busy, label) { if (busy) { button.dataset.l = button.innerHTML; button.disabled = true; button.innerHTML = `<span class="spin"></span><span>${esc(label || 'جارٍ التنفيذ…')}</span>`; } else { button.disabled = false; if (button.dataset.l) button.innerHTML = button.dataset.l; } }

export const skeleton = (n = 5) => `<div class="skel" aria-busy="true" aria-label="جارٍ التحميل">${'<i></i>'.repeat(n)}</div>`;
export const empty = (title, text = '', ic = 'file') => `<div class="empty">${icon(ic)}<b>${esc(title)}</b><div>${esc(text)}</div></div>`;
export const errorBox = (msg, kind = 'err') => `<div class="errbox ${kind === 'warn' ? 'warn' : ''}">${icon(kind === 'warn' ? 'info' : 'warn')}<div>${esc(msg)}</div></div>`;

export function download(filename, mime, text) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` }); const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// رسم بياني بسيط (SVG) من بيانات حقيقية
export function chartSvg(rows, { type = 'bar', x, y }) {
  if (!rows.length) return '';
  const W = 640, H = 190, pad = { l: 34, r: 8, t: 10, b: 26 }; const vals = rows.map((r) => Number(r[y]) || 0); const max = Math.max(1, ...vals);
  const bw = (W - pad.l - pad.r) / rows.length; const sx = (i) => pad.l + i * bw; const sy = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, max / 2, max].map((v) => `<line class="axis" x1="${pad.l}" x2="${W - pad.r}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${pad.l - 6}" y="${sy(v) + 3}" text-anchor="end">${Math.round(v)}</text>`).join('');
  const every = Math.ceil(rows.length / 8);
  const labels = rows.map((r, i) => (i % every === 0 ? `<text x="${sx(i) + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(String(r[x]).slice(5))}</text>` : '')).join('');
  const body = type === 'line'
    ? `<polyline class="line" points="${rows.map((r, i) => `${sx(i) + bw / 2},${sy(Number(r[y]) || 0)}`).join(' ')}"/>${rows.map((r, i) => `<circle class="pt" cx="${sx(i) + bw / 2}" cy="${sy(Number(r[y]) || 0)}" r="3"><title>${esc(r[x])}: ${r[y]}</title></circle>`).join('')}`
    : rows.map((r, i) => `<rect class="bar" x="${sx(i) + 2}" y="${sy(Number(r[y]) || 0)}" width="${Math.max(2, bw - 4)}" height="${H - pad.b - sy(Number(r[y]) || 0)}" rx="3"><title>${esc(r[x])}: ${r[y]}</title></rect>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="رسم بياني">${ticks}${body}${labels}</svg>`;
}
