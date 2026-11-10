// أدوات DOM: كل نص قادم من المستخدمين يدخل عبر textContent فقط (ما فيه innerHTML أبداً).
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

// replaceChildren بدون "null" نصياً
export const fill = (el, ...kids) => { el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false)); return el; };

export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

// صورة ديسكورد (رابطها محقق من الخادم) مع حرف احتياطي
export function avatar(p, cls = '') {
  const el = h('span', { class: `av ${cls}` }, (p && p.name ? [...p.name][0] : '?'));
  if (p && p.avatarUrl) {
    const img = h('img', { src: p.avatarUrl, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => img.remove());
    el.append(img);
  }
  return el;
}

// تحديث قائمة بمفاتيح بدون إعادة بناء العناصر الموجودة
export function reconcile(container, items, keyOf, create, update) {
  const existing = new Map([...container.children].map((c) => [c.dataset.key, c]));
  let prev = null;
  for (const item of items) {
    const key = String(keyOf(item));
    let el = existing.get(key);
    if (el) { existing.delete(key); update(el, item); } else { el = create(item); el.dataset.key = key; update(el, item); }
    const want = prev ? prev.nextSibling : container.firstChild;
    if (el !== want) container.insertBefore(el, want);
    prev = el;
  }
  for (const el of existing.values()) el.remove();
}

export function toast(msg, err = false) {
  const box = document.getElementById('toasts');
  const t = h('div', { class: `toast${err ? ' err' : ''}`, text: msg });
  box.append(t);
  setTimeout(() => t.remove(), 3800);
}

// مؤقت واحد لكل العدادات: عنصر فيه data-deadline (بوقت الخادم) يعرض الوقت المتبقي، و data-bar يرسم الشريط
let clockOffset = 0;
export const setClockOffset = (o) => { clockOffset = o; };
export const serverNow = () => Date.now() + clockOffset;
export const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

setInterval(() => {
  if (document.hidden) return;
  const now = serverNow();
  for (const el of document.querySelectorAll('[data-deadline]')) {
    el.textContent = fmt(Number(el.dataset.deadline) - now);
  }
  for (const el of document.querySelectorAll('[data-bar-end]')) {
    const end = Number(el.dataset.barEnd); const start = Number(el.dataset.barStart);
    el.style.transform = `scaleX(${Math.min(1, Math.max(0, (end - now) / Math.max(1, end - start)))})`;
  }
  for (const el of document.querySelectorAll('[data-count-end]')) {
    el.textContent = String(Math.max(0, Math.ceil((Number(el.dataset.countEnd) - now) / 1000)));
  }
}, 200);
document.addEventListener('visibilitychange', () => document.body.classList.toggle('hidden-tab', document.hidden));
