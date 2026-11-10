// عجلة الروليت: الخادم يحدد النتيجة (landIndex) ووقت البداية — العميل يرسم الحركة فقط.
// التقدّم يُحسب من وقت الخادم، فالمتأخر بالدخول يشوف نفس اللحظة بالضبط (ما ينفّذ قرعة محلية).
import { serverNow } from './dom.js';

const COLORS = ['#5b21b6', '#7c3aed', '#4c1d95', '#6d28d9', '#3b0764', '#8b5cf6'];
const ease = (t) => 1 - Math.pow(1 - t, 4);
const imgCache = new Map();
function img(url) {
  if (!url) return null;
  let i = imgCache.get(url);
  if (!i) { i = new Image(); i.referrerPolicy = 'no-referrer'; i.src = url; imgCache.set(url, i); }
  return i.complete && i.naturalWidth ? i : null;
}

export function createWheel(canvas, players) {
  const ctx = canvas.getContext('2d');
  let spin = null; let raf = 0; let angle = 0; let lastKey = '';
  const byId = new Map(players.map((p) => [p.id, p]));

  function size() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const s = Math.max(240, Math.round(r.width || 360));
    if (canvas.width !== s * dpr) { canvas.width = s * dpr; canvas.height = s * dpr; }
    return { s, dpr };
  }

  function draw(rot, order) {
    const { s, dpr } = size();
    const c = s * dpr; const R = c / 2 - 6 * dpr;
    ctx.clearRect(0, 0, c, c);
    ctx.save(); ctx.translate(c / 2, c / 2);
    const n = order.length; const seg = (Math.PI * 2) / n;
    ctx.rotate(rot);
    for (let i = 0; i < n; i++) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, i * seg - seg / 2 - Math.PI / 2, i * seg + seg / 2 - Math.PI / 2); ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length]; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = dpr; ctx.stroke();
      const p = byId.get(order[i]);
      ctx.save(); ctx.rotate(i * seg);
      const ay = -R * 0.74; const ar = Math.max(10 * dpr, Math.min(22 * dpr, (Math.PI * R * 0.74 / n) * 0.9));
      ctx.beginPath(); ctx.arc(0, ay, ar, 0, Math.PI * 2); ctx.fillStyle = '#1a1033'; ctx.fill();
      const im = p && img(p.avatarUrl);
      if (im) { ctx.save(); ctx.clip(); ctx.drawImage(im, -ar, ay - ar, ar * 2, ar * 2); ctx.restore(); }
      else { ctx.fillStyle = '#f6f3ff'; ctx.font = `700 ${ar}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p ? [...p.name][0] : '?', 0, ay); }
      ctx.restore();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(c / 2, c / 2, 26 * dpr, 0, Math.PI * 2); ctx.fillStyle = '#07040f'; ctx.fill();
    ctx.strokeStyle = '#f5b301'; ctx.lineWidth = 3 * dpr; ctx.stroke();
  }

  function frame() {
    if (!spin) return;
    const t = Math.min(1, (serverNow() - spin.startsAt) / spin.durationMs);
    // نلفّ 5 لفات كاملة ثم نقف بحيث يكون الفائز تحت المؤشر (أعلى العجلة)
    const n = spin.order.length; const seg = (Math.PI * 2) / n;
    const target = -(spin.landIndex * seg) - Math.PI * 2 * 5;
    angle = target * ease(t);
    draw(angle, spin.order);
    if (t < 1) raf = requestAnimationFrame(frame); else raf = 0;
  }

  return {
    // يحرّك لو تغيّر الدوران؛ يرجع للحالة النهائية مباشرة لو الوقت فات
    show(s) {
      const key = `${s.startsAt}:${s.landIndex}`;
      if (key === lastKey) return;
      lastKey = key; spin = s; cancelAnimationFrame(raf); frame();
    },
    redraw() { if (spin) draw(angle, spin.order); },
    destroy() { cancelAnimationFrame(raf); spin = null; }
  };
}
