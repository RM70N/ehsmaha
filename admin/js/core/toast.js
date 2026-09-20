// ==================== تنبيهات سريعة (Toast) ====================
// تأكيد بصري بعد كل عملية حقيقية (نجاح/فشل) بدل الاعتماد على alert() —
// تُستخدم من كل الأقسام. تدعم صوت تنبيه اختياري (قسم 30.5).
let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'admin-toast-stack';
  document.body.appendChild(container);
  return container;
}

let soundEnabled = false;
export function setToastSoundEnabled(v) { soundEnabled = !!v; }

function playSound(kind) {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = kind === 'error' ? 220 : kind === 'warn' ? 320 : 440;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 140);
  } catch (err) { /* بيئات ما تدعم AudioContext — تجاهل */ }
}

export function toast(message, kind, opts) {
  const el = document.createElement('div');
  el.className = `admin-toast admin-toast--${kind || 'info'}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  ensureContainer().appendChild(el);
  playSound(kind);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  const ttl = (opts && opts.ttl) || 4200;
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 220);
  }, ttl);
  return el;
}

export const AdminToast = {
  success: (msg, opts) => toast(msg, 'success', opts),
  error: (msg, opts) => toast(msg, 'error', opts),
  warn: (msg, opts) => toast(msg, 'warn', opts),
  info: (msg, opts) => toast(msg, 'info', opts)
};

window.AdminToast = AdminToast;
