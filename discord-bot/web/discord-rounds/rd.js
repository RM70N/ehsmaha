// أدوات شاشة الراوند — منقولة من ملف الموقع (rdGrad / rdChipInner / rdElimOverlay) مع تحويلها لـDOM آمن.
import { h } from './dom.js';

const HUES = [45, 300, 275, 330, 38, 285, 262, 320];
export const grad = (i) => {
  const hue = HUES[((i % HUES.length) + HUES.length) % HUES.length];
  return `linear-gradient(145deg,hsl(${hue} 72% 78%),hsl(${hue + 18} 58% 52%))`;
};
export const letter = (name) => {
  const s = String(name == null ? '' : name).replace(/^@/, '').trim() || '؟';
  const core = s.startsWith('ال') ? s.slice(2) : s;
  return [...core][0] || '؟';
};
export const hash = (str) => { let x = 0; for (const c of String(str || '')) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x; };

// محتوى دائرة الأفتار: صورة ديسكورد (رابطها محقق من الخادم) أو حرف الاسم
export function chipInner(p) {
  const frag = document.createDocumentFragment();
  const span = h('span', { text: letter(p && p.name) });
  frag.append(span);
  if (p && p.avatarUrl) {
    const img = h('img', { src: p.avatarUrl, alt: '', referrerpolicy: 'no-referrer', style: 'width:100%;height:100%;object-fit:cover;border-radius:inherit;position:absolute;inset:0' });
    img.addEventListener('error', () => img.remove());
    frag.append(img);
  }
  return frag;
}

// طبقة الإقصاء: تصفيق + طيران اللاعب + اسمه ثم "خــرج" (نفس أنيميشن الموقع) — تُزال تلقائياً
export function elimOverlay(stage, player, index, sub) {
  const prev = stage.querySelector('.rd-ov');
  if (prev) prev.remove();
  const sparks = h('div', { class: 'rd-sparks' });
  for (let i = 0; i < 12; i++) sparks.append(h('div', { class: 'rd-spark', style: `transform:rotate(${i * 30}deg)` }, h('i', { style: `animation:rdSpark 2.2s cubic-bezier(.16,1,.3,1) ${(i % 4) * 0.03}s both` })));
  const hand = (c) => h('div', { class: `rd-hand ${c}` }, h('i', { class: 'p' }), h('i', { class: 'f1' }), h('i', { class: 'f2' }), h('i', { class: 'f3' }), h('i', { class: 'f4' }), h('i', { class: 'th' }));
  const av = h('div', { class: 'rd-fly-av', style: `background:${grad(index)}` });
  av.append(chipInner(player));
  const ov = h('div', { class: 'rd-ov' }, h('div', { class: 'rd-ov-card' },
    h('div', { class: 'rd-ov-stage' }, h('div', { class: 'rd-shock' }), h('div', { class: 'rd-shock2' }), sparks, h('div', { class: 'rd-clapL' }, hand('gold')), h('div', { class: 'rd-clapR' }, hand('pink')), h('div', { class: 'rd-fly' }, av)),
    h('div', { class: 'rd-ov-name', text: (player && player.name) || '؟' }),
    h('div', { class: 'rd-ov-out', text: 'خــرج' }),
    h('div', { class: 'rd-ov-sub', text: sub || '' })));
  stage.append(ov);
  setTimeout(() => ov.remove(), 2250);
}

// هيكل مسرح الراوند (9:16) بنفس طبقات الموقع
export const stageShell = (id, inner) => h('div', { class: 'rd-stage', id }, h('div', { class: 'rd-l1' }), h('div', { class: 'rd-l2' }), h('div', { class: 'rd-l3' }), h('div', { class: 'rd-inner' }, inner));
