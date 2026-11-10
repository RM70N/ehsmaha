// جمعتنا — المدينة المصغّرة (عميل 3D). العرض فقط: المدينة تُبنى من seed الخادم بنفس المحاكاة المشتركة،
// والإجابة الصحيحة غير موجودة هنا إطلاقًا — نرسل «اختياري هو كذا» والخادم يحكم.
import { genCity, entState, lightState, roadAt, blockAt, COLORS, CITY, CITY_SIZE, buildingLabel } from '../shared/city-sim.js';
import { createStage, addLights, kit, h, fmtTime, esc } from '../shared/three-kit.js';
import { sfx, ambience, stopAmb } from '../shared/audio.js';
import { createCityArt, DISTRICT_NAME, DISTRICT_GRID } from './city/city-arch.js';
import { createCrowd } from './city/crowd.js';
import { createEventFx } from './city/events-fx.js';

const HALF = CITY_SIZE / 2;
const ENT_NAME = { car: 'سيارة', person: 'شخص', prop: 'غرض', bus: 'باص', van: 'سيارة توصيل', service: 'سيارة خدمات', mailbox: 'صندوق بريد', bench: 'كرسي حديقة', hydrant: 'صنبور حريق', billboard: 'لوحة إعلانات', parkedbike: 'دراجة واقفة', kiosk: 'كشك' };

export function mount(ctx) {
  const { THREE, el, net, isHost } = ctx; const K = kit(THREE);
  const stage = createStage(THREE, el, { fov: 42 }); const { scene, camera } = stage;
  stage.renderer.toneMapping = THREE.ACESFilmicToneMapping; stage.renderer.toneMappingExposure = 0.95; const art = createCityArt(THREE, stage.renderer, stage.level);
  const lights = addLights(THREE, stage, { amb: 0.55, int: 1.0, size: 80 });
  let todMode = (new URLSearchParams(location.search).get('tod')) || 'morning'; const applyTod = () => { const t = art.applyTod(todMode, scene, lights, stage.renderer); S_base.sun = t.sun[1]; S_base.hemi = t.hemi[2]; }; const S_base = { sun: 1, hemi: 0.62 };
  const S = { world: null, t0: 0, ents: new Map(), bld: new Map(), actors: new Map(), pauses: [], round: null, sel: null, score: 0, done: false, lights: [], seed: 0, final: false, fx: [], rainOn: false, changed: new Map() };
  const cam = { tx: 0, tz: 0, yaw: 0.7, pitch: 0.95, dist: 150, g: null, auto: isHost };
  let disposed = false; const timers = new Set(); const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); if (!disposed) fn(); }, ms); timers.add(t); };

  // ------------------------------------------------------------ الواجهة
  const hud = h('div', 'g-hud'); el.appendChild(hud);
  hud.innerHTML = `<div class="g-top"><span class="g-chip" id="c-round"><small>الجولة</small><b>—</b></span><span class="g-chip g-timer" id="c-timer">0:00</span><span class="g-chip" id="c-score"><small>${isHost ? 'اللاعبين' : 'نقاطك'}</small><b>0</b></span></div>
    <div class="g-mission" id="c-mission" hidden></div><div class="g-spacer"></div>
    <div class="g-confirm" id="c-confirm" hidden><span id="c-sel"></span><button class="j3-btn j3-btn-main j3-btn-sm" id="c-yes">تأكيد</button><button class="j3-btn j3-btn-quiet" id="c-no">إلغاء</button></div>
    <div class="g-bottom"><button class="g-btn" id="c-reset" aria-label="إعادة تمركز الكاميرا"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>تمركز</button>
      <button class="g-btn" id="c-t" aria-label="وقت اليوم"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><span id="c-tl"></span></button>
      <button class="g-btn" id="c-q" aria-label="جودة الرسومات"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 18V9M10 18V5M16 18v-7M22 18v-4"/></svg><span id="c-ql"></span></button></div>`;
  const $ = (s) => hud.querySelector(s);
  const board = h('div', 'g-board'); const feed = h('div', 'g-feed'); const flash = h('div', 'g-flash'); el.append(feed, flash); if (isHost) el.appendChild(board);
  const QL = { low: 'خفيفة', medium: 'متوسطة', high: 'عالية' }; stage.onQuality = (l) => { $('#c-ql').textContent = QL[l]; };
  $('#c-q').onclick = () => { const o = ['low', 'medium', 'high']; stage.setQuality(o[(o.indexOf(stage.level) + 1) % 3], true); sfx.tap(); };
  $('#c-reset').onclick = () => { flyTo(0, 0, 120, 0.7, 0.95, 0.7); sfx.tap(); };
  const TL = { morning: 'صباح', sunset: 'غروب', night: 'ليل' }; $('#c-tl').textContent = TL[todMode] || 'صباح'; $('#c-t').onclick = () => { const o = ['morning', 'sunset', 'night']; todMode = o[(o.indexOf(todMode) + 1) % 3]; $('#c-tl').textContent = TL[todMode]; applyTod(); sfx.tap(); };
  $('#c-no').onclick = () => select(null);
  $('#c-yes').onclick = () => { if (!S.sel || !S.round || S.done) return; net.g({ k: 'pick', id: S.sel.id, round: S.round.round }); sfx.tap(); select(null); };
  function banner(text, sub) { const b = h('div', 'g-banner', `<div>${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`); el.appendChild(b); later(1900, () => b.remove()); }
  function say(text) { const d = h('div', '', esc(text)); feed.appendChild(d); while (feed.children.length > 4) feed.firstChild.remove(); later(4200, () => d.remove()); }
  function countdown(n) { if (n <= 0) { sfx.go(); return; } const c = h('div', 'g-count', `<b>${n}</b>`); el.appendChild(c); sfx.count(); later(900, () => { c.remove(); countdown(n - 1); }); }
  function drawBoard() { if (!isHost) return; const r = ctx.room(); if (!r) return; const ps = r.players.slice().sort((a, b) => b.score - a.score).slice(0, 8); board.innerHTML = '<h4>الترتيب</h4>' + ps.map((p) => `<div><span>${esc(p.name)}</span><b>${p.score}</b></div>`).join(''); $('#c-score b').textContent = r.players.length; }

  // ------------------------------------------------------------ بناء المدينة
  function carMesh(e) {
    const c = COLORS[e.color].hex, dark = 0x17131f, glass = 0x9fd3ff; const p = [];
    const Wl = []; const wheels = (zs, w) => zs.forEach((z) => Wl.push([z, w]));
    if (e.sub === 'bus') { p.push(K.rbox(2.1, 2.0, 6.4, c, 0, 1.45, 0, 0, 0.3), K.box(2.14, 0.7, 5.6, glass, 0, 1.75, 0), K.box(1.7, 0.5, 0.1, glass, 0, 1.7, 3.2)); wheels([-2.1, 2.1], 1.0); }
    else if (e.sub === 'van') { p.push(K.rbox(1.9, 1.7, 4.0, c, 0, 1.25, -0.2, 0, 0.25), K.rbox(1.8, 1.0, 1.2, c, 0, 0.9, 2.2, 0, 0.2), K.box(1.6, 0.55, 0.1, glass, 0, 1.55, 1.82), K.box(1.2, 0.5, 0.06, 0xffffff, 0.96, 1.4, -0.4, Math.PI / 2)); wheels([-1.3, 1.9], 0.9); }
    else if (e.sub === 'service') { p.push(K.rbox(1.9, 1.0, 4.2, c, 0, 0.95, 0, 0, 0.25), K.rbox(1.7, 0.8, 1.6, c, 0, 1.7, 0.6, 0, 0.2), K.box(1.5, 0.5, 0.1, glass, 0, 1.75, 1.42), K.box(1.0, 0.18, 0.3, 0xf59e0b, 0, 2.2, 0.6), K.box(1.6, 0.5, 1.6, 0x57534e, 0, 1.5, -1.2)); wheels([-1.4, 1.4], 0.9); }
    else { p.push(K.rbox(1.8, 0.75, 4.0, c, 0, 0.8, 0, 0, 0.3), K.rbox(1.6, 0.7, 2.0, c, 0, 1.45, -0.15, 0, 0.3), K.box(1.45, 0.48, 0.08, glass, 0, 1.5, 0.87), K.box(1.45, 0.48, 0.08, glass, 0, 1.5, -1.17), K.box(1.64, 0.4, 1.5, glass, 0, 1.5, -0.15)); wheels([-1.25, 1.25], 0.86); p.push(K.box(0.4, 0.16, 0.06, 0xfff3b0, -0.55, 0.85, 2.01), K.box(0.4, 0.16, 0.06, 0xfff3b0, 0.55, 0.85, 2.01), K.box(0.4, 0.16, 0.06, 0xef4444, -0.55, 0.85, -2.01), K.box(0.4, 0.16, 0.06, 0xef4444, 0.55, 0.85, -2.01)); }
    const body = K.mesh(p); body.userData.axles = Wl.map(([z, w]) => { const g = new THREE.Group(); g.position.set(0, 0.36, z); const inner = K.mesh([K.cyl(0.36, 0.36, 0.26, dark, -w, 0, 0, 12, 0, Math.PI / 2), K.cyl(0.36, 0.36, 0.26, dark, w, 0, 0, 12, 0, Math.PI / 2), K.box(0.05, 0.5, 0.08, 0xcfd3d6, -w - 0.14, 0, 0), K.box(0.05, 0.5, 0.08, 0xcfd3d6, w + 0.14, 0, 0), K.box(0.05, 0.08, 0.5, 0xcfd3d6, -w - 0.14, 0, 0), K.box(0.05, 0.08, 0.5, 0xcfd3d6, w + 0.14, 0, 0)]); g.add(inner); body.add(g); return { g, inner, z }; });
    return body;
  }
  function personMesh(e) {
    const c = COLORS[e.color].hex; const y = e.sit ? -0.28 : 0; const p = [K.cyl(0.26, 0.3, 0.7, c, 0, 0.95 + y, 0, 10), K.sph(0.27, 0xf6c9a0, 0, 1.55 + y, 0), K.sph(0.3, c, 0, 0.62 + y, 0, 1, 0.5, 1)];
    if (e.sit) p.push(K.box(0.2, 0.2, 0.55, 0x2b2148, -0.13, 0.42, 0.25), K.box(0.2, 0.2, 0.55, 0x2b2148, 0.13, 0.42, 0.25)); else p.push(K.cyl(0.11, 0.1, 0.6, 0x2b2148, -0.13, 0.3, 0, 8), K.cyl(0.11, 0.1, 0.6, 0x2b2148, 0.13, 0.3, 0, 8));
    if (e.hat) p.push(K.cyl(0.18, 0.26, 0.2, 0x1a1230, 0, 1.86 + y, 0, 10), K.cyl(0.36, 0.36, 0.05, 0x1a1230, 0, 1.78 + y, 0, 12)); else p.push(K.sph(0.28, 0x3b2314, 0, 1.63 + y, -0.04, 1, 0.75, 1));
    const m = K.mesh(p); m.scale.setScalar(1.25); return m;
  }
  function propMesh(e) {
    const c = COLORS[e.color].hex; const p = [];
    if (e.sub === 'mailbox') p.push(K.cyl(0.08, 0.08, 1.0, 0x57534e, 0, 0.5, 0, 8), K.rbox(0.6, 0.55, 0.45, c, 0, 1.2, 0, 0, 0.14), K.box(0.36, 0.05, 0.02, 0x1a1230, 0, 1.28, 0.24));
    else if (e.sub === 'hydrant') p.push(K.cyl(0.2, 0.24, 0.7, c, 0, 0.35, 0, 10), K.sph(0.22, c, 0, 0.74, 0), K.cyl(0.08, 0.08, 0.6, c, 0, 0.45, 0, 8, 0, Math.PI / 2));
    else if (e.sub === 'billboard') p.push(K.cyl(0.1, 0.1, 3.2, 0x57534e, -1.1, 1.6, 0, 8), K.cyl(0.1, 0.1, 3.2, 0x57534e, 1.1, 1.6, 0, 8), K.rbox(3.2, 1.7, 0.2, c, 0, 3.6, 0, 0, 0.08), K.box(2.2, 0.2, 0.05, 0xffffff, 0, 3.9, 0.13), K.box(1.5, 0.2, 0.05, 0xffffff, 0, 3.4, 0.13));
    else if (e.sub === 'parkedbike') { const tor = (x) => K.part(new THREE.TorusGeometry(0.34, 0.05, 6, 14), 0x17131f, x, 0.38, 0, Math.PI / 2); p.push(tor(-0.55), tor(0.55), K.box(1.1, 0.07, 0.07, c, 0, 0.72, 0, 0, 0, 0.1), K.box(0.07, 0.5, 0.07, c, 0.1, 0.62, 0, 0, 0, 0.3), K.box(0.3, 0.07, 0.14, 0x1a1230, 0.2, 0.92, 0), K.box(0.07, 0.07, 0.5, 0x57534e, -0.5, 0.95, 0)); }
    else if (e.sub === 'kiosk') p.push(K.rbox(1.6, 1.2, 1.3, 0xe9dfd2, 0, 0.6, 0, 0, 0.1), K.box(1.9, 0.14, 1.7, c, 0, 2.2, 0), K.cyl(0.05, 0.05, 1.0, 0x57534e, -0.7, 1.7, 0.55, 6), K.cyl(0.05, 0.05, 1.0, 0x57534e, 0.7, 1.7, 0.55, 6), K.box(1.3, 0.3, 0.05, c, 0, 1.0, 0.66));
    else p.push(K.box(1.5, 0.1, 0.5, c, 0, 0.5, 0), K.box(1.5, 0.5, 0.1, c, 0, 0.85, -0.22), K.box(0.1, 0.5, 0.45, 0x57534e, -0.6, 0.25, 0), K.box(0.1, 0.5, 0.45, 0x57534e, 0.6, 0.25, 0));
    return K.mesh(p);
  }
  function buildingMesh(b) {
    const p = []; const w = b.w, d = b.d, hh = b.h; const sign = COLORS[b.sign].hex; const win = (lit) => (lit ? 0xffd98a : 0x4a4370);
    const winGrid = (face, rows, cols, y0, y1) => { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const y = y0 + (r + 0.5) * (y1 - y0) / rows, u = (c + 0.5) / cols - 0.5; const lit = ((r * 7 + c * 5 + Math.round(b.x)) % 3) !== 0; const ww = Math.min(1.1, w / cols * 0.55), hh2 = Math.min(1.1, (y1 - y0) / rows * 0.55);
      if (face === 0) p.push(K.box(ww, hh2, 0.08, win(lit), u * w, y, d / 2 + 0.02)); else if (face === 1) p.push(K.box(ww, hh2, 0.08, win(lit), u * w, y, -d / 2 - 0.02)); else if (face === 2) p.push(K.box(0.08, hh2, ww, win(lit), w / 2 + 0.02, y, u * d)); else p.push(K.box(0.08, hh2, ww, win(lit), -w / 2 - 0.02, y, u * d)); } };
    const all = (rows, cols, y0, y1) => [0, 1, 2, 3].forEach((f) => winGrid(f, rows, cols, y0, y1));
    if (b.kind === 'apartment') { p.push(K.rbox(w, hh, d, b.color, 0, hh / 2, 0, 0, 0.3), K.box(w * 0.9, 0.3, d * 0.9, 0x57534e, 0, hh + 0.15, 0), K.box(1.2, 0.8, 1.2, 0x9ca3af, w * 0.2, hh + 0.6, -d * 0.15), K.box(1.4, 2.0, 0.1, 0x3b2314, 0, 1.0, d / 2 + 0.03)); all(Math.max(2, Math.round(hh / 1.9)), 3, 2.4, hh - 0.6); }
    else if (b.kind === 'house') { p.push(K.rbox(w * 0.86, hh, d * 0.8, b.color, 0, hh / 2, 0, 0, 0.2)); const roof = K.part(new THREE.ConeGeometry(w * 0.72, 2.2, 4), b.roof || 0x9f1239, 0, hh + 1.1, 0, Math.PI / 4); p.push(roof, K.box(0.9, 1.7, 0.1, 0x3b2314, -w * 0.15, 0.85, d * 0.4 + 0.03), K.box(0.9, 0.9, 0.1, 0xffd98a, w * 0.2, 1.7, d * 0.4 + 0.03), K.box(0.6, 1.4, 0.6, 0x7c2d12, w * 0.22, hh + 1.5, -d * 0.1), K.box(w, 0.5, 0.12, 0xf1f0f7, 0, 0.25, d / 2 - 0.1)); }
    else if (b.kind === 'shop' || b.kind === 'restaurant' || b.kind === 'cafe') { p.push(K.rbox(w, hh, d, b.color, 0, hh / 2, 0, 0, 0.2), K.box(w * 0.92, 1.5, 0.1, 0x9fd3ff, 0, 1.2, d / 2 + 0.03), K.box(w * 1.02, 0.25, 1.3, sign, 0, 2.35, d / 2 + 0.55, 0, 0.35), K.rbox(w * 0.7, 0.8, 0.25, sign, 0, hh + 0.5, d / 2 - 0.3, 0, 0.08), K.box(w * 0.5, 0.16, 0.05, 0xffffff, 0, hh + 0.5, d / 2 - 0.16));
      if (b.kind === 'cafe') p.push(K.cyl(0.5, 0.5, 0.06, 0xf1f0f7, w * 0.3, 0.75, d / 2 + 1.5, 10), K.cyl(0.05, 0.05, 0.75, 0x57534e, w * 0.3, 0.38, d / 2 + 1.5, 6), K.cone(0.9, 0.5, sign, w * 0.3, 2.0, d / 2 + 1.5, 8));
      if (b.kind === 'restaurant') p.push(K.cyl(0.25, 0.25, 1.0, 0x9ca3af, -w * 0.3, hh + 0.5, -d * 0.2, 8)); }
    else if (b.kind === 'school') { p.push(K.rbox(w, hh, d * 0.6, b.color, 0, hh / 2, -d * 0.18, 0, 0.3), K.rbox(w * 0.3, hh + 2, d * 0.3, 0xe9dfd2, 0, (hh + 2) / 2, d * 0.1, 0, 0.2), K.cyl(0.7, 0.7, 0.1, 0xffffff, 0, hh + 0.8, d * 0.26, 14, Math.PI / 2), K.cyl(0.06, 0.06, 4, 0x9ca3af, w * 0.38, hh + 2, -d * 0.1, 6), K.box(1.3, 0.8, 0.05, 0x34d399, w * 0.38 + 0.65, hh + 3.5, -d * 0.1), K.box(w * 0.9, 0.06, d * 0.3, 0x9a6b4a, 0, 0.04, d * 0.32)); winGrid(0, 2, 6, 0.8, hh - 0.4); }
    else if (b.kind === 'hospital') { p.push(K.rbox(w * 0.8, hh, d * 0.7, 0xf1f0f7, 0, hh / 2, 0, 0, 0.3), K.rbox(w * 0.5, 2.6, d * 0.3, 0xdbe4ee, 0, 1.3, d * 0.42, 0, 0.2), K.box(2.4, 0.7, 0.12, 0xe5484d, 0, hh - 1.6, d * 0.35 + 0.05), K.box(0.7, 2.4, 0.12, 0xe5484d, 0, hh - 1.6, d * 0.35 + 0.05), K.cyl(1.6, 1.6, 0.1, 0x57534e, 0, hh + 0.06, 0, 16)); all(4, 4, 3, hh - 3.2); }
    else if (b.kind === 'gas') { p.push(K.box(w * 0.8, 0.3, d * 0.5, sign, 0, hh, 0), K.cyl(0.2, 0.2, hh, 0x9ca3af, -w * 0.3, hh / 2, 0, 8), K.cyl(0.2, 0.2, hh, 0x9ca3af, w * 0.3, hh / 2, 0, 8), K.rbox(0.6, 1.3, 0.5, 0xf1f0f7, -1.5, 0.65, 0, 0, 0.1), K.rbox(0.6, 1.3, 0.5, 0xf1f0f7, 1.5, 0.65, 0, 0, 0.1), K.rbox(w * 0.34, 2.4, d * 0.24, b.color, w * 0.25, 1.2, -d * 0.34, 0, 0.2), K.box(w * 0.3, 0.5, 0.08, sign, w * 0.25, 2.0, -d * 0.22)); }
    else if (b.kind === 'mall') { p.push(K.rbox(w, hh, d * 0.8, b.color, 0, hh / 2, -d * 0.08, 0, 0.4), K.box(w * 0.7, hh * 0.7, 0.12, 0x9fd3ff, 0, hh * 0.42, d * 0.32 + 0.03), K.rbox(w * 0.5, 1.2, 0.3, sign, 0, hh + 0.7, d * 0.2, 0, 0.1), K.box(w * 0.3, 0.2, 0.05, 0xffffff, 0, hh + 0.7, d * 0.2 + 0.17), K.box(w * 0.8, 0.2, 1.6, 0x57534e, 0, 3, d * 0.4)); winGrid(2, 2, 4, 1, hh - 0.6); winGrid(3, 2, 4, 1, hh - 0.6); }
    else if (b.kind === 'parking') { p.push(K.box(w, 0.08, d, 0x2b2540, 0, 0.04, 0)); for (let i = -2; i <= 2; i++) p.push(K.box(0.1, 0.02, d * 0.36, 0xcfc6ee, i * w / 6, 0.1, -d * 0.28), K.box(0.1, 0.02, d * 0.36, 0xcfc6ee, i * w / 6, 0.1, d * 0.28)); }
    else if (b.kind === 'park') { p.push(K.box(w, 0.14, d, 0x2f8f6a, 0, 0.07, 0), K.cyl(2.2, 2.2, 0.06, 0x7dd3fc, w * 0.18, 0.17, -d * 0.15, 18), K.box(w * 0.9, 0.04, 1.2, 0xd6c7a1, 0, 0.16, d * 0.2)); for (let i = 0; i < 7; i++) { const a = i * 2.4 + b.x, tx = Math.cos(a) * w * 0.36, tz = Math.sin(a * 1.3) * d * 0.36; p.push(K.cyl(0.14, 0.18, 1.3, 0x6b4a2f, tx, 0.65, tz, 6), K.sph(1.0, i % 2 ? 0x34d399 : 0x2fae82, tx, 2.0, tz, 1, 1.1, 1)); } }
    else { p.push(K.box(w, 0.1, d, 0x4a3f78, 0, 0.05, 0)); for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if ((i + j) % 2 === 0) p.push(K.box(w / 5.4, 0.02, d / 5.4, 0x5b4f90, i * w / 5.2, 0.12, j * d / 5.2)); p.push(K.cyl(1.8, 2.0, 0.5, 0x9ca3af, 0, 0.3, 0, 16), K.cyl(1.5, 1.5, 0.1, 0x7dd3fc, 0, 0.56, 0, 16), K.cyl(0.25, 0.4, 1.4, 0x9ca3af, 0, 1.0, 0, 8), K.sph(0.4, 0x7dd3fc, 0, 1.8, 0)); }
    const m = K.mesh(p); m.position.set(b.x, 0.16, b.z); return m;
  }
  function buildWorld(seed) {
    const world = S.world = genCity(seed); S.seed = seed; const p = [];
    scene.add(art.groundParts({ CITY, roadAt, blockAt, CITY_SIZE })); applyTod();
    // سكة القطار المرتفعة (يمر عليها القطار في حدث «مرور قطار»)
    const tz = roadAt(2) + 2.6; p.push(K.box(CITY_SIZE + 24, 0.4, 2.2, 0x8a8f94, 0, 7.5, tz)); for (let x = -HALF; x <= HALF; x += PITCH_) p.push(K.cyl(0.4, 0.5, 7.4, 0x8a8f94, x + 0.2, 3.7, tz, 8));
    const base = K.mesh(p, { cast: false }); scene.add(base);
    for (const b of world.buildings) { const m = art.buildingMesh(b); m.userData.pick = { id: b.id, kind: 'b', label: buildingLabel(b), h: Math.max(b.h, 1.5) + 2 }; scene.add(m); S.bld.set(b.id, m); }
    for (const e of world.ents) addEnt(e);
    S.ambient = art.createAmbient(world, scene);
    S.crowd = createCrowd(THREE, scene, { world, CITY, blockAt, roadAt, lightState, DISTRICT_GRID, seed }); S.fx2 = createEventFx(THREE, scene, art, { world, CITY, roadAt, blockAt, CITY_SIZE, DISTRICT_GRID, crowd: S.crowd });
    // لمبات الإشارات: كرتان لكل تقاطع (محور شمال-جنوب، محور شرق-غرب) بثلاث مواد مشتركة
    const mats = { g: new THREE.MeshBasicMaterial({ color: 0x34d399 }), r: new THREE.MeshBasicMaterial({ color: 0xef4444 }), y: new THREE.MeshBasicMaterial({ color: 0xf5c451 }) }; S.lmat = mats; const bulb = new THREE.SphereGeometry(0.34, 8, 6); const poles = [];
    for (let i = 0; i <= CITY.N; i++) for (let j = 0; j <= CITY.N; j++) { const o = CITY.ROAD / 2 + 0.5; const a = new THREE.Mesh(bulb, mats.r), b2 = new THREE.Mesh(bulb, mats.r); a.position.set(roadAt(i) + o, 3.6, roadAt(j) - o); b2.position.set(roadAt(i) - o, 3.6, roadAt(j) - o - 0.01); b2.position.z = roadAt(j) + o; scene.add(a, b2); S.lights.push({ i, j, ns: a, ew: b2 }); poles.push(K.cyl(0.08, 0.1, 3.4, 0x5a6068, a.position.x, 1.7, a.position.z, 6), K.cyl(0.08, 0.1, 3.4, 0x5a6068, b2.position.x, 1.7, b2.position.z, 6), K.box(0.5, 0.9, 0.5, 0x2a2f36, a.position.x, 3.6, a.position.z), K.box(0.5, 0.9, 0.5, 0x2a2f36, b2.position.x, 3.6, b2.position.z)); }
    scene.add(K.mesh(poles, { cast: false }));
    // القطار + المطر + رقعة الظلام (مخفية حتى يقع الحدث)
    const tr = []; for (let c = 0; c < 4; c++) tr.push(K.rbox(7.4, 2.6, 2.0, c ? 0x294b70 : 0xe8873a, -c * 7.9, 9.1, tz, 0, 0.5), K.box(6.2, 0.8, 2.06, 0x9fd3ff, -c * 7.9, 9.5, tz)); S.train = K.mesh(tr); S.train.visible = false; scene.add(S.train);
    const rg = new THREE.BufferGeometry(); const N = 700; const rp = new Float32Array(N * 3); for (let i = 0; i < N; i++) { rp[i * 3] = (Math.random() - 0.5) * CITY_SIZE; rp[i * 3 + 1] = Math.random() * 60; rp[i * 3 + 2] = (Math.random() - 0.5) * CITY_SIZE; } rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); S.rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: 0xbfd9ff, size: 0.5, transparent: true, opacity: 0.55 })); S.rain.visible = false; scene.add(S.rain);
    S.dark = new THREE.Mesh(new THREE.BoxGeometry(HALF, 26, HALF), new THREE.MeshBasicMaterial({ color: 0x05030a, transparent: true, opacity: 0, depthWrite: false })); S.dark.visible = false; S.dark.renderOrder = 3; scene.add(S.dark);
    // حلقة التحديد + منارة الكشف
    S.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffffff })); S.ring.rotation.x = Math.PI / 2; S.ring.visible = false; scene.add(S.ring);
    S.beacon = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.6, 4), new THREE.MeshBasicMaterial({ color: 0xf5c451 })); S.beacon.rotation.x = Math.PI; S.beacon.visible = false; scene.add(S.beacon);
  }
  const PITCH_ = CITY.BLOCK + CITY.ROAD;
  function addEnt(e, actor) {
    const m = e.t === 'car' ? carMesh(e) : e.t === 'person' ? (actor || (e.kf && !e.sit) ? K.character(COLORS[e.color].hex, { hat: e.hat, scale: 1.3 }) : personMesh(e)) : propMesh(e);
    m.userData.pick = { id: e.id, kind: e.t, label: ENT_NAME[e.sub] || ENT_NAME[e.t], h: e.t === 'car' ? 3 : e.t === 'person' ? 3 : 4, r: e.t === 'car' ? 2.6 : 1.4 }; m.userData.e = e;
    if (!e.kf && !actor) { m.position.set(e.x, 0.17, e.z); m.rotation.y = e.rot || 0; }
    if (actor && e.marker) { const ar = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); ar.rotation.x = Math.PI; ar.position.y = 3.4; m.add(ar); m.userData.arrow = ar; }
    scene.add(m); (actor ? S.actors : S.ents).set(e.id, m); return m;
  }
  function recolor(id, color) { const m = S.ents.get(id); if (!m) return; const e = Object.assign({}, m.userData.e, { color }); const n = e.t === 'car' ? carMesh(e) : propMesh(e); n.position.copy(m.position); n.rotation.copy(m.rotation); n.userData.pick = m.userData.pick; n.userData.e = e; scene.remove(m); m.geometry.dispose(); scene.add(n); S.ents.set(id, n); }

  // ------------------------------------------------------------ الكاميرا واللمس
  function flyTo(tx, tz, dist, yaw, pitch, sec = 1.2) { cam.g = { t: 0, sec, f: { tx: cam.tx, tz: cam.tz, dist: cam.dist, yaw: cam.yaw, pitch: cam.pitch }, to: { tx, tz, dist, yaw: yaw == null ? cam.yaw : yaw, pitch: pitch == null ? cam.pitch : pitch } }; }
  function camUpdate(dt) {
    if (cam.g) { const g = cam.g; g.t = Math.min(1, g.t + dt / g.sec); const k = g.t < 0.5 ? 4 * g.t ** 3 : 1 - (-2 * g.t + 2) ** 3 / 2; for (const key of ['tx', 'tz', 'dist', 'yaw', 'pitch']) cam[key] = g.f[key] + (g.to[key] - g.f[key]) * k; if (g.t >= 1) cam.g = null; }
    else if (cam.auto) cam.yaw += dt * 0.05;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch); camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, sp * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist); camera.lookAt(cam.tx, 0, cam.tz);
  }
  const ptrs = new Map(); let pinch = 0, moved = 0, downAt = 0, lastMid = null;
  const cv = stage.canvas; cv.style.touchAction = 'none';
  const onDown = (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (ptrs.size === 1) { moved = 0; downAt = performance.now(); } pinch = 0; lastMid = null; cam.g = null; if (!isHost) cam.auto = false; };
  const onMove = (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 1) { if (e.buttons === 2 || e.shiftKey) pan(dx, dy); else { cam.yaw -= dx * 0.006; cam.pitch = Math.max(0.35, Math.min(1.45, cam.pitch + dy * 0.005)); } }
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (pinch) cam.dist = Math.max(18, Math.min(190, cam.dist * pinch / d)); if (lastMid) pan(mid[0] - lastMid[0], mid[1] - lastMid[1]); pinch = d; lastMid = mid; }
  };
  function pan(dx, dy) { const k = cam.dist * 0.0016; cam.tx -= (Math.cos(cam.yaw) * dx + Math.sin(cam.yaw) * dy) * k; cam.tz -= (-Math.sin(cam.yaw) * dx + Math.cos(cam.yaw) * dy) * k; cam.tx = Math.max(-HALF, Math.min(HALF, cam.tx)); cam.tz = Math.max(-HALF, Math.min(HALF, cam.tz)); }
  const onUp = (e) => { const was = ptrs.size; ptrs.delete(e.pointerId); pinch = 0; lastMid = null; if (was === 1 && moved < 9 && performance.now() - downAt < 450) tap(e.clientX, e.clientY); }; // السحب لا يُحتسب اختيارًا
  const onWheel = (e) => { e.preventDefault(); cam.dist = Math.max(18, Math.min(190, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); cam.g = null; };
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp); cv.addEventListener('wheel', onWheel, { passive: false }); cv.addEventListener('contextmenu', (e) => e.preventDefault());

  const ray = new THREE.Raycaster(), v2 = new THREE.Vector2(), v3 = new THREE.Vector3();
  function tap(cx, cy) {
    if (isHost || !S.round || S.done || S.round.watching) return; const r = cv.getBoundingClientRect(); const kind = S.round.pickKind;
    if (kind !== 'building') { // الأقرب على الشاشة ضمن نصف قطر لمس مريح (العناصر صغيرة)
      let best = null, bd = 34; const test = (m) => { if (!m.visible) return; const pk = m.userData.pick; if (kind === 'car' && pk.kind !== 'car') return; v3.copy(m.position); v3.y += 1; v3.project(camera); if (v3.z > 1) return; const d = Math.hypot((v3.x * 0.5 + 0.5) * r.width + r.left - cx, (-v3.y * 0.5 + 0.5) * r.height + r.top - cy); if (d < bd) { bd = d; best = m; } };
      S.ents.forEach(test); S.actors.forEach(test); if (best) return select(best);
      return;
    }
    v2.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(v2, camera); const hit = ray.intersectObjects([...S.bld.values()], false)[0]; if (hit) select(hit.object);
  }
  function select(m) { S.sel = m ? { id: m.userData.pick.id, m } : null; $('#c-confirm').hidden = !m; S.ring.visible = !!m; if (m) { const pk = m.userData.pick; $('#c-sel').textContent = pk.kind === 'b' ? pk.label : pk.label; const b = pk.kind === 'b' ? S.world.buildings.find((x) => x.id === pk.id) : null; S.ring.scale.setScalar(b ? Math.max(b.w, b.d) * 0.62 : pk.r || 1.5); sfx.tap(); } }

  // ------------------------------------------------------------ حلقة الرسم
  const simT = () => (net.now() - S.t0) / 1000;
  stage.onFrame = (dt, t) => {
    if (!S.world) { camUpdate(dt); return; } const st = simT(); const now = net.now();
    S.ents.forEach((m) => { const e = m.userData.e; if (!e.kf) return; const s = entState(e, st, S.pauses); const px = m.position.x, pz = m.position.z, pr = m.rotation.y; m.position.set(s.x, 0.17 + (e.t === 'person' && !m.userData.rig && s.moving ? Math.abs(Math.sin(st * 8 + e.phase)) * 0.12 : 0), s.z); m.rotation.y = s.rot;
      const dist = Math.hypot(s.x - px, s.z - pz); if (m.userData.rig) K.animate(m, dt, dt > 0 ? dist / dt : 0);
      if (m.userData.axles && dt > 0 && dist < 5) { let dr = s.rot - pr; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; const steer = Math.max(-0.5, Math.min(0.5, dr / dt * 0.45)); m.userData.spin = (m.userData.spin || 0) + dist / 0.36; for (const a of m.userData.axles) { a.inner.rotation.x = m.userData.spin; if (a.z > 0) a.g.rotation.y += (steer - a.g.rotation.y) * Math.min(1, dt * 10); } } });
    if (S.crowd) S.crowd.update(st, dt); if (S.ambient) S.ambient.update(st); if (S.fx2) S.fx2.update(now, t, dt);
    for (const L of S.lights) { const ls = lightState(L.i, L.j, st); L.ns.material = ls === 'ns' ? S.lmat.g : ls === 'y' ? S.lmat.y : S.lmat.r; L.ew.material = ls === 'ew' ? S.lmat.g : ls === 'y' ? S.lmat.y : S.lmat.r; }
    S.actors.forEach((m) => { const a = m.userData.net; if (!a) return; const k = Math.min(1, dt * 9); const px = m.position.x, pz = m.position.z; m.position.x += (a.x - px) * k; m.position.z += (a.z - pz) * k; m.position.y = 0.17; m.visible = !!a.vis; let dr = a.rot - m.rotation.y; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; m.rotation.y += dr * k; if (m.userData.rig) K.animate(m, dt, Math.hypot(m.position.x - px, m.position.z - pz) / Math.max(dt, 0.001)); if (m.userData.arrow) m.userData.arrow.position.y = 3.4 + Math.sin(t * 5) * 0.25; });
    if (S.sel) { S.ring.position.set(S.sel.m.position.x, 0.4, S.sel.m.position.z); S.ring.rotation.z = t * 2; if (!S.sel.m.visible) select(null); }
    if (S.beacon.visible) { S.beacon.position.y = S.beaconY + Math.sin(t * 4) * 0.5; S.beacon.rotation.y = t * 2; }
    // الأحداث المحيطية
    const ev = S.event; if (ev) { const on = now >= ev.at && now < ev.at + ev.dur; if (on && !ev.started) { ev.started = true; startEvent(ev); } if (!on && ev.started && !ev.ended) { ev.ended = true; endEvent(ev); }
      if (ev.type === 'train' && on) { S.train.position.x = -HALF - 30 + (now - ev.at) / ev.dur * (CITY_SIZE + 90); } }
    if (S.rain.visible) { const a = S.rain.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 45; if (y < 0) y += 60; a.setY(i, y); } a.needsUpdate = true; }
    if (S.dark.visible) { const m = S.dark.material; m.opacity += ((S.darkOn ? 0.62 : 0) - m.opacity) * Math.min(1, dt * 4); if (!S.darkOn && m.opacity < 0.02) S.dark.visible = false; }
    for (const f of S.fx) f(dt, t);
    if (S.round && !S.done) { const left = S.round.endAt - now; const tm = $('#c-timer'); tm.textContent = fmtTime(left); const low = left < 10000 && left > 0; if (low !== tm.classList.contains('is-low')) tm.classList.toggle('is-low', low); if (low && Math.floor(left / 1000) !== S.lastBeep) { S.lastBeep = Math.floor(left / 1000); sfx.low(); } }
    camUpdate(dt);
  };
  const EV = { blackout: ['انقطعت الكهرباء!', 'جزء من المدينة صار ظلام'], rain: ['بدأ المطر', 'الرؤية صارت أصعب شوي'], train: ['قطار يمر!', 'ممكن يغطي عليك لثواني'], jam: ['زحمة مفاجئة!', 'السيارات واقفة بالتقاطع'], rush: ['ساعة الذروة!', 'ازدحام كبير في وسط المدينة'], convoy: ['موكب يمر!', 'مركبات مميزة تعبر أحد الشوارع'], festival: ['مهرجان المدينة!', 'الناس يتجمعون في الساحة'], market: ['سوق نشط!', 'حركة كبيرة في المنطقة التجارية'], closure: ['إغلاق شارع!', 'السيارات تنتظر عند التقاطع'] };
  function startEvent(ev) { banner(EV[ev.type][0], EV[ev.type][1]); sfx.event();
    if (ev.type === 'blackout') { S.dark.position.set((ev.qx ? 1 : -1) * HALF / 2, 13, (ev.qz ? 1 : -1) * HALF / 2); S.dark.visible = true; S.darkOn = true; }
    if (ev.type === 'rain') { S.rain.visible = true; lights.sun.intensity = 0.55; lights.hemi.intensity = 0.48; }
    if (ev.type === 'train') S.train.visible = true;
    if (S.fx2) S.fx2.start(ev); if (ev.type === 'jam' || ev.type === 'rush' || ev.type === 'closure') S.pauses.push({ t0: ev.t0, dur: ev.dur / 1000, ids: new Set(ev.ids) }); }
  function endEvent(ev) { if (S.fx2) S.fx2.end(ev); if (ev.type === 'blackout') S.darkOn = false; if (ev.type === 'rain') { S.rain.visible = false; lights.sun.intensity = S_base.sun; lights.hemi.intensity = S_base.hemi; } if (ev.type === 'train') S.train.visible = false; }

  // ------------------------------------------------------------ رسائل الخادم
  function clearActors() { S.actors.forEach((m) => { scene.remove(m); m.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }); S.actors.clear(); }
  function onMission(d) {
    S.round = d; S.done = !!d.done; S.event = d.event ? Object.assign({}, d.event) : null; S.beacon.visible = false; select(null); clearActors(); S.lastBeep = -1;
    $('#c-round b').textContent = d.type === 'tie' ? 'فاصل' : d.round + ' / ' + d.of; const ms = $('#c-mission'); ms.hidden = false;
    if (isHost) { ms.innerHTML = `<small>${esc(d.title)}</small>${d.shared ? 'مهمة مشتركة للجميع — الأسرع يكسب مكافأة!' : 'كل لاعب عنده هدف سري بجواله'}`; cam.auto = true; flyTo(0, 0, 125, cam.yaw, 0.95, 1.4); }
    else if (d.watching) ms.innerHTML = `<small>${esc(d.title)}</small>أنت خارج المنافسة حاليًا — تابع الجولة.`;
    else { ms.innerHTML = `<small>${esc(d.title)}</small>${esc(d.text)}`; if (d.done) ms.innerHTML += '<br><small>خلّصت هذي الجولة</small>'; }
    banner(d.title, d.type === 'tie' ? 'أول إجابة صح تحسمها' : `الجولة ${d.round}`); sfx.go();
  }
  function reveal(d) {
    S.done = true; select(null); $('#c-timer').textContent = '0:00'; $('#c-timer').classList.remove('is-low');
    const mine = d.results.find((r) => r.id === ctx.me.id); const tid = d.shared || (mine && mine.target) || (d.results.find((r) => r.ok) || d.results[0] || {}).target;
    const m = tid && (S.ents.get(tid) || S.actors.get(tid) || S.bld.get(tid));
    if (m) { m.visible = true; const pk = m.userData.pick; S.beaconY = pk.h + 2; S.beacon.position.set(m.position.x, S.beaconY, m.position.z); S.beacon.visible = true; cam.auto = false; flyTo(m.position.x, m.position.z, pk.kind === 'b' ? 46 : 30, cam.yaw + 0.5, 0.8, 1.6); }
    const ms = $('#c-mission');
    if (isHost) { ms.innerHTML = `<small>نهاية الجولة</small>${d.firsts.length ? 'أول من حسمها: ' + d.firsts.slice(0, 3).map(esc).join('، ') : 'ما أحد قدر عليها!'}${d.eliminated ? `<br><small>طلع من المنافسة: ${esc(d.eliminated.name)}</small>` : ''}`; drawBoard(); }
    else if (mine) { ms.innerHTML = `<small>نهاية الجولة</small>${mine.ok ? `صح عليك! ${mine.pts > 0 ? '+' + mine.pts : mine.pts}` : 'هذا كان الهدف الصحيح'}${d.eliminated && d.eliminated.id === ctx.me.id ? '<br><small>طلعت من المنافسة</small>' : ''}`; }
    later(3200, () => { if (!S.final) clearActors(); });
  }
  function final(d) {
    S.final = true; S.round = null; hud.querySelector('.g-top').style.display = 'none'; $('#c-mission').hidden = true; $('#c-confirm').hidden = true; hud.querySelector('.g-bottom').style.display = 'none'; board.remove(); S.beacon.visible = false;
    // منصة التتويج 3D
    const px = 0, pz = HALF + 22; const pod = [K.rbox(26, 0.6, 12, 0x241b3d, px, 0.3, pz, 0, 1.5)]; const hs = [4.2, 3, 2.2], xs = [0, -6.4, 6.4], cs = [0xf5c451, 0xcbd5e1, 0xd08a4a];
    d.ranking.slice(0, 3).forEach((p, i) => { pod.push(K.rbox(5.6, hs[i], 5, cs[i], px + xs[i], 0.6 + hs[i] / 2, pz, 0, 0.5)); const ch = K.character([0x8b5cf6, 0xf472b6, 0x34d399][i], { scale: 2, hat: i === 0, hatColor: 0xf5c451 }); ch.position.set(px + xs[i], 0.6 + hs[i], pz); scene.add(ch); const lb = K.label((i + 1) + ' · ' + p.name, { h: 1.5 }); lb.position.set(px + xs[i], 0.6 + hs[i] + 5.4, pz); scene.add(lb); S.fx.push((dt, t) => { K.animate(ch, dt, i === 0 ? 2.5 : 0); ch.position.y = 0.6 + hs[i] + (i === 0 ? Math.abs(Math.sin(t * 5)) * 0.8 : 0); }); });
    scene.add(K.mesh(pod));
    const N = stage.level === 'low' ? 120 : 320; const cg = new THREE.BufferGeometry(); const cp = new Float32Array(N * 3), cc = new Float32Array(N * 3), vel = []; const pal = [0xf5c451, 0x34d399, 0x8b5cf6, 0xf472b6, 0x38bdf8]; const c = new THREE.Color();
    for (let i = 0; i < N; i++) { cp[i * 3] = px + (Math.random() - 0.5) * 26; cp[i * 3 + 1] = 10 + Math.random() * 22; cp[i * 3 + 2] = pz + (Math.random() - 0.5) * 12; c.set(pal[i % 5]); cc[i * 3] = c.r; cc[i * 3 + 1] = c.g; cc[i * 3 + 2] = c.b; vel.push(2 + Math.random() * 4); }
    cg.setAttribute('position', new THREE.BufferAttribute(cp, 3)); cg.setAttribute('color', new THREE.BufferAttribute(cc, 3)); const conf = new THREE.Points(cg, new THREE.PointsMaterial({ size: 0.55, vertexColors: true })); scene.add(conf);
    S.fx.push((dt, t) => { const a = cg.attributes.position; for (let i = 0; i < N; i++) { let y = a.getY(i) - vel[i] * dt; if (y < 0.5) y = 26; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t * 2 + i) * dt); } a.needsUpdate = true; });
    cam.auto = false; flyTo(px, pz, 44, 0, 0.42, 2.2); sfx.win();
    const me = d.ranking.findIndex((r) => r.id === ctx.me.id);
    const end = h('div', 'g-end', `<h3>${d.ranking[0] ? 'الفائز: ' + esc(d.ranking[0].name) + ' · ' + d.ranking[0].score + ' نقطة' : 'انتهت المباراة'}</h3>${!isHost && me >= 0 ? `<div class="g-awards"><span>ترتيبك ${me + 1} من ${d.ranking.length}</span></div>` : ''}
      <div class="g-awards">${d.awards.fastest ? `<span>الأسرع: ${esc(d.awards.fastest.name)} (${d.awards.fastest.sec} ث بالمتوسط)</span>` : ''}${d.awards.sharp ? `<span>الأدق: ${esc(d.awards.sharp.name)} (${d.awards.sharp.ok} صح / ${d.awards.sharp.wrong} غلط)</span>` : ''}</div>
      <ol class="g-rank">${d.ranking.map((p, i) => `<li><i>${i + 1}</i><span>${esc(p.name)}${p.out ? ' · خرج' : ''}</span><b>${p.score}</b></li>`).join('')}</ol>
      ${isHost ? '<div class="j3-row"><button class="j3-btn j3-btn-main" id="c-again">مباراة جديدة بنفس اللاعبين</button><button class="j3-btn j3-btn-quiet" id="c-exit">إنهاء الغرفة</button></div>' : '<p style="color:#B5A9D9;font-weight:700;margin:0">ننتظر المضيف يبدأ مباراة جديدة...</p>'}`);
    el.appendChild(end); if (isHost) { end.querySelector('#c-again').onclick = ctx.again; end.querySelector('#c-exit').onclick = ctx.exit; }
  }
  function onMsg(d) {
    if (disposed) return;
    if (d.k === 'init') { if (S.seed === d.seed) return; S.t0 = d.t0; buildWorld(d.seed); stopAmb(); ambience('city'); cam.dist = 230; cam.pitch = 1.35; flyTo(0, 0, isHost ? 125 : 105, 0.7, 0.95, 4.2); banner('المدينة المصغّرة', 'استعدوا...'); later(3300, () => countdown(3)); drawBoard(); return; }
    if (!S.world) return;
    if (d.k === 'mission' || d.k === 'round') return onMission(d);
    if (d.k === 'spawn') { clearActors(); d.ents.forEach((e) => { const m = addEnt(e, true); m.visible = false; }); return; }
    if (d.k === 'act') { for (const a of d.a) { const m = S.actors.get(a[0]); if (!m) continue; if (!m.userData.net) { m.position.set(a[1], 0.17, a[2]); m.rotation.y = a[3]; } m.userData.net = { x: a[1], z: a[2], rot: a[3], vis: a[4] }; } return; }
    if (d.k === 'change') { if (!d.quiet) { flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); sfx.event(); if (!isHost) say('تغيّر شي بالمدينة... وش هو؟'); } recolor(d.id, d.color); return; }
    if (d.k === 'picked') {
      if (d.ignored) return ctx.toast(d.early ? 'انتظر شوي... لسا ما صار شي' : d.pickKind === 'building' ? 'المطلوب مبنى — اضغط على مبنى' : 'المطلوب مو مبنى');
      S.score = d.score; $('#c-score b').textContent = d.score;
      if (d.ok) { S.done = true; sfx.ok(); if (d.first) sfx.bonus(); banner('صح عليك!', '+' + d.pts + (d.first ? ' · أول واحد' : '')); $('#c-mission').innerHTML += '<br><small>خلّصت — انتظر نهاية الجولة</small>'; }
      else { sfx.bad(); if (d.locked) { S.done = true; banner('خلصت محاولاتك', 'انتظر الجولة الجاية'); } else ctx.toast(`غلط! ${d.pts ? d.pts + ' نقطة · ' : ''}باقي لك ${d.left} ${d.left === 1 ? 'محاولة' : 'محاولات'}`); }
      return;
    }
    if (d.k === 'solved') { if (isHost) { say(`${d.name} حسمها${d.first ? ' أول واحد!' : ''}`); sfx.ok(); } return; }
    if (d.k === 'reveal') return reveal(d);
    if (d.k === 'final') return final(d);
  }
  stage.start();
  return {
    onMsg, onRoom: drawBoard,
    unmount() { disposed = true; timers.forEach(clearTimeout); stopAmb(); stage.dispose(); art.dispose(); if (S.crowd) S.crowd.dispose(); if (S.ambient) S.ambient.dispose(); if (S.fx2) S.fx2.dispose(); hud.remove(); board.remove(); feed.remove(); flash.remove(); el.querySelectorAll('.g-end,.g-banner,.g-count').forEach((n) => n.remove()); },
    debug: () => Object.assign(stage.info(), { ents: S.ents.size, actors: S.actors.size, round: S.round && S.round.round }),
    _S: S, _cam: cam, _stage: stage,
  };
}
