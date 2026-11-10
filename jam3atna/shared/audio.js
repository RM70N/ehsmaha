// جمعتنا — مؤثرات صوتية أصلية مولّدة بـ WebAudio (بدون ملفات). تُفعَّل بعد أول تفاعل للمستخدم فقط.
let ctx = null, master = null, on = true, vol = 0.7, amb = null;
try { on = localStorage.getItem('j3:sound') !== '0'; const v = parseFloat(localStorage.getItem('j3:vol')); if (v >= 0 && v <= 1) vol = v; } catch (e) {}
function ac() {
  if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); master = ctx.createGain(); master.gain.value = on ? vol : 0; master.connect(ctx.destination); }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
const unlock = () => { ac(); };
window.addEventListener('pointerdown', unlock, { passive: true }); window.addEventListener('keydown', unlock);

function tone(f, d, type = 'sine', g = 0.2, at = 0, f2 = null) {
  if (!on || !ctx || ctx.state !== 'running') return; const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), a = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(g, t + 0.012); a.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(a); a.connect(master); o.start(t); o.stop(t + d + 0.03);
}
function noise(d, g = 0.15, freq = 1200, at = 0, q = 1) {
  if (!on || !ctx || ctx.state !== 'running') return; const t = ctx.currentTime + at; const n = Math.floor(ctx.sampleRate * d);
  const b = ctx.createBuffer(1, n, ctx.sampleRate), c = b.getChannelData(0); for (let i = 0; i < n; i++) c[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(); s.buffer = b; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const a = ctx.createGain(); a.gain.value = g; s.connect(f); f.connect(a); a.connect(master); s.start(t);
}
export const sfx = {
  tap: () => tone(420, 0.06, 'triangle', 0.12),
  join: () => { tone(520, 0.09, 'sine', 0.16); tone(780, 0.12, 'sine', 0.14, 0.08); },
  ready: () => tone(660, 0.1, 'triangle', 0.14),
  count: () => tone(440, 0.12, 'square', 0.1),
  go: () => { tone(520, 0.1, 'square', 0.1); tone(1040, 0.3, 'square', 0.1, 0.1); },
  ok: () => { tone(660, 0.1, 'sine', 0.2); tone(880, 0.1, 'sine', 0.2, 0.09); tone(1320, 0.22, 'sine', 0.18, 0.18); },
  bad: () => { tone(220, 0.18, 'sawtooth', 0.12, 0, 140); },
  bonus: () => { [880, 1175, 1568].forEach((f, i) => tone(f, 0.12, 'triangle', 0.14, i * 0.06)); },
  low: () => tone(880, 0.07, 'square', 0.07),
  win: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.28, 'triangle', 0.16, i * 0.11)); noise(0.5, 0.06, 4000, 0.5); },
  lose: () => { [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sine', 0.14, i * 0.16)); },
  // المدينة
  event: () => { tone(300, 0.4, 'sine', 0.12, 0, 600); },
  // المتنكر
  scoot: () => noise(0.07, 0.07, 500, 0, 3),
  step: (kind, vol = 1) => { const f = { tile: [2200, 0.05], vinyl: [1800, 0.045], epoxy: [2600, 0.05], wood: [900, 0.06], carpet: [380, 0.035], marble: [3000, 0.055], concrete: [700, 0.05], grass: [500, 0.04], court: [1400, 0.06] }[kind] || [1500, 0.05]; noise(0.06, f[1] * vol, f[0], 0, 1.4); },
  swap: () => { noise(0.22, 0.12, 1800, 0, 2); tone(300, 0.2, 'sine', 0.1, 0, 900); },
  inspect: () => { tone(900, 0.05, 'square', 0.08); noise(0.12, 0.1, 2600); },
  reveal: () => { noise(0.3, 0.18, 900); tone(200, 0.4, 'sawtooth', 0.1, 0, 800); tone(1200, 0.3, 'sine', 0.14, 0.25); },
  radar: () => { tone(1400, 0.5, 'sine', 0.12, 0, 500); tone(1400, 0.5, 'sine', 0.06, 0.35, 500); },
  lastmin: () => { tone(330, 0.16, 'square', 0.1); tone(330, 0.16, 'square', 0.1, 0.24); tone(440, 0.3, 'square', 0.1, 0.48); },
};
/** صوت محيطي خفيف جدًا (مدينة/غرفة). يرجع دالة إيقاف. */
export function ambience(kind) {
  stopAmb(); if (!ac()) return stopAmb; const g = ctx.createGain(); g.gain.value = kind === 'city' ? 0.02 : 0.012; g.connect(master);
  const n = ctx.sampleRate * 2; const b = ctx.createBuffer(1, n, ctx.sampleRate), c = b.getChannelData(0); let last = 0;
  for (let i = 0; i < n; i++) { last = (last + (Math.random() * 2 - 1) * 0.04) * 0.985; c[i] = last * 6; }
  const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'city' ? 500 : 260;
  s.connect(f); f.connect(g); s.start(); amb = { s, g }; return stopAmb;
}
export function stopAmb() { if (amb) { try { amb.s.stop(); amb.g.disconnect(); } catch (e) {} amb = null; } }
export const sound = {
  get on() { return on; }, get vol() { return vol; },
  set(v) { on = !!v; try { localStorage.setItem('j3:sound', on ? '1' : '0'); } catch (e) {} if (master) master.gain.value = on ? vol : 0; },
  setVol(v) { vol = Math.max(0, Math.min(1, v)); try { localStorage.setItem('j3:vol', String(vol)); } catch (e) {} if (master && on) master.gain.value = vol; },
};
