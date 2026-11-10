// جمعتنا — مين المتنكر؟ (عميل 3D). الخادم هو المرجع: هنا عرض + تنبؤ محلي بالحركة فقط.
// المفتش لا يملك أي معلومة تميّز المتنكر عن الأثاث — كل ما يصله قائمة أغراض بصيغة واحدة.
import { MAPS, KINDS, PROP, stepMove } from '../shared/prop-sim.js';
import { createStage, addLights, kit, h, fmtTime, esc } from '../shared/three-kit.js';
import { sfx, ambience, stopAmb } from '../shared/audio.js';

export function mount(ctx) {
  const { THREE, el, net, isHost } = ctx; const K = kit(THREE);
  const stage = createStage(THREE, el, { fov: 50 }); const { scene, camera } = stage;
  scene.background = new THREE.Color(0x0b0716); const lights = addLights(THREE, stage, { amb: 0.7, int: 0.85, size: 34, x: 14, y: 30, z: 10, sky: 0xe8dcff, ground: 0x2a1f47 });
  let world = null; // مجموعة الجولة الحالية (تُحرَّر بالكامل عند الجولة التالية)
  const S = { setup: null, map: null, role: 'watch', me: { x: 0, z: 0, rot: 0 }, props: new Map(), seekers: new Map(), you: {}, yaw: 0, jx: 0, jy: 0, target: null, endAt: 0, hideEnd: 0, phase: 'hide', over: false, fx: [], names: new Map(), lastSend: 0, lastIn: [9, 9], left: 0, keys: {} };
  let disposed = false; const timers = new Set(); const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); if (!disposed) fn(); }, ms); timers.add(t); };
  const geoCache = new Map();

  // ------------------------------------------------------------ مجسمات الأغراض (أصلية، مدمجة، مخزّنة لكل نوع)
  const P = { wood: 0x8a5a3c, woodD: 0x6b4a2f, metal: 0x9ca3af, dark: 0x2b2540, white: 0xf1f0f7, red: 0xe5484d, blue: 0x3b82f6, yellow: 0xf5c451, green: 0x34d399, pink: 0xf472b6, purple: 0x8b5cf6, orange: 0xfb923c, teal: 0x2dd4bf, glass: 0x9fd3ff, gold: 0xd4a84a, cream: 0xe9dfd2 };
  const legs = (w, d, hh, c, r = 0.05) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => K.cyl(r, r, hh, c, a * w, hh / 2, b * d, 6));
  const BUILD = {
    shelf: () => [K.box(1.9, 2.1, 0.08, P.metal, 0, 1.05, -0.26), K.box(0.08, 2.1, 0.6, P.dark, -0.94, 1.05, 0), K.box(0.08, 2.1, 0.6, P.dark, 0.94, 1.05, 0), ...[0.12, 0.7, 1.28, 1.86].map((y) => K.box(1.84, 0.06, 0.6, P.white, 0, y, 0)), ...[0.15, 0.73, 1.31].flatMap((y, r) => [0, 1, 2, 3, 4].map((i) => K.rbox(0.3, 0.34 + ((i + r) % 3) * 0.06, 0.4, [P.red, P.yellow, P.green, P.blue, P.orange, P.pink][(i * 2 + r) % 6], -0.7 + i * 0.35, y + 0.2 + ((i + r) % 3) * 0.03, 0.05, 0, 0.06)))],
    cart: () => [K.rbox(0.8, 0.5, 1.0, P.metal, 0, 0.75, 0, 0, 0.1), K.box(0.7, 0.4, 0.9, P.dark, 0, 0.82, 0), K.cyl(0.03, 0.03, 0.8, P.red, 0, 1.08, -0.6, 6, 0, Math.PI / 2), ...legs(0.32, 0.4, 0.5, P.metal, 0.03), K.sph(0.08, P.dark, -0.32, 0.08, -0.4), K.sph(0.08, P.dark, 0.32, 0.08, 0.4)],
    box: () => [K.rbox(0.8, 0.7, 0.8, 0xc49a6c, 0, 0.35, 0, 0, 0.05), K.box(0.82, 0.06, 0.2, 0xe9d3a8, 0, 0.71, 0), K.box(0.3, 0.2, 0.02, P.red, 0, 0.4, 0.41)],
    fridge: () => [K.rbox(1.4, 2.0, 0.8, P.white, 0, 1.0, 0, 0, 0.1), K.box(1.2, 1.5, 0.06, P.glass, 0, 1.05, 0.4), K.box(1.1, 0.04, 0.5, P.metal, 0, 0.7, 0.1), K.box(1.1, 0.04, 0.5, P.metal, 0, 1.3, 0.1), K.box(1.4, 0.24, 0.82, P.teal, 0, 1.92, 0)],
    sign: () => [K.cyl(0.3, 0.34, 0.1, P.dark, 0, 0.05, 0, 10), K.cyl(0.04, 0.04, 1.3, P.metal, 0, 0.7, 0, 6), K.rbox(0.8, 0.5, 0.08, P.yellow, 0, 1.5, 0, 0, 0.06), K.box(0.5, 0.1, 0.02, P.red, 0, 1.56, 0.06), K.box(0.36, 0.08, 0.02, P.dark, 0, 1.4, 0.06)],
    register: () => [K.rbox(1.5, 0.95, 0.8, P.purple, 0, 0.48, 0, 0, 0.1), K.box(1.56, 0.08, 0.86, P.white, 0, 0.98, 0), K.rbox(0.5, 0.36, 0.4, P.dark, -0.35, 1.2, 0, 0, 0.05), K.box(0.4, 0.26, 0.02, P.glass, -0.35, 1.24, 0.21), K.box(0.6, 0.02, 0.5, P.dark, 0.35, 1.03, 0)],
    crate: () => [K.rbox(1.0, 0.85, 1.0, P.wood, 0, 0.43, 0, 0, 0.04), K.box(1.04, 0.1, 1.04, P.woodD, 0, 0.1, 0), K.box(1.04, 0.1, 1.04, P.woodD, 0, 0.78, 0), K.box(0.1, 0.85, 1.04, P.woodD, -0.47, 0.43, 0), K.box(0.1, 0.85, 1.04, P.woodD, 0.47, 0.43, 0)],
    barrel: () => [K.cyl(0.42, 0.42, 1.05, P.blue, 0, 0.53, 0, 14), K.cyl(0.45, 0.45, 0.07, P.metal, 0, 0.2, 0, 14), K.cyl(0.45, 0.45, 0.07, P.metal, 0, 0.86, 0, 14), K.cyl(0.36, 0.36, 0.03, 0x1e3a8a, 0, 1.06, 0, 14)],
    desk: () => [K.rbox(1.15, 0.08, 0.7, 0xd9b38c, 0, 0.8, 0, 0, 0.06), K.box(0.9, 0.16, 0.5, P.metal, 0, 0.66, 0), ...legs(0.5, 0.28, 0.76, P.metal, 0.035)],
    chair: () => [K.rbox(0.5, 0.07, 0.5, P.pink, 0, 0.5, 0, 0, 0.08), K.rbox(0.5, 0.5, 0.07, P.pink, 0, 0.82, -0.22, 0, 0.03), ...legs(0.2, 0.2, 0.48, P.metal, 0.03)],
    board: () => [K.rbox(1.8, 1.1, 0.08, 0x14532d, 0, 1.5, 0, 0, 0.03), K.box(1.9, 0.08, 0.12, P.wood, 0, 0.93, 0), K.box(1.9, 0.08, 0.12, P.wood, 0, 2.07, 0), K.cyl(0.04, 0.04, 2.0, P.metal, -0.8, 1.0, 0, 6), K.cyl(0.04, 0.04, 2.0, P.metal, 0.8, 1.0, 0, 6), K.box(0.9, 0.05, 0.3, P.metal, -0.8, 0.03, 0, Math.PI / 2), K.box(0.9, 0.05, 0.3, P.metal, 0.8, 0.03, 0, Math.PI / 2), K.box(0.8, 0.04, 0.02, P.white, -0.2, 1.7, 0.05), K.box(0.5, 0.04, 0.02, P.white, 0, 1.45, 0.05)],
    locker: () => [K.rbox(0.9, 1.95, 0.6, P.teal, 0, 0.98, 0, 0, 0.05), K.box(0.02, 1.8, 0.02, P.dark, 0, 0.98, 0.31), K.box(0.3, 0.12, 0.02, P.dark, -0.22, 1.6, 0.31), K.box(0.3, 0.12, 0.02, P.dark, 0.22, 1.6, 0.31), K.box(0.05, 0.14, 0.04, P.metal, -0.08, 1.0, 0.32), K.box(0.05, 0.14, 0.04, P.metal, 0.08, 1.0, 0.32)],
    bookshelf: () => [K.rbox(1.7, 2.2, 0.5, P.wood, 0, 1.1, 0, 0, 0.05), ...[0.3, 0.85, 1.4, 1.9].flatMap((y, r) => [0, 1, 2, 3, 4, 5].map((i) => K.box(0.2, 0.36 + ((i * 7 + r) % 3) * 0.04, 0.34, [P.red, P.blue, P.yellow, P.green, P.purple, P.orange][(i + r) % 6], -0.62 + i * 0.25, y, 0.1)))],
    labtable: () => [K.rbox(1.7, 0.1, 0.9, P.dark, 0, 0.95, 0, 0, 0.06), K.rbox(1.5, 0.85, 0.7, P.white, 0, 0.45, 0, 0, 0.05), K.cyl(0.1, 0.14, 0.3, P.green, -0.5, 1.15, 0, 8), K.cyl(0.05, 0.05, 0.2, P.glass, -0.5, 1.4, 0, 8), K.cyl(0.09, 0.09, 0.26, P.pink, 0.1, 1.13, 0.15, 8), K.cyl(0.08, 0.12, 0.34, P.blue, 0.5, 1.17, -0.1, 8)],
    globe: () => [K.cyl(0.26, 0.3, 0.08, P.wood, 0, 0.04, 0, 12), K.cyl(0.04, 0.04, 0.5, P.gold, 0, 0.3, 0, 6), K.sph(0.36, P.blue, 0, 0.82, 0), K.sph(0.2, P.green, 0.14, 0.9, 0.2, 1, 0.8, 1), K.sph(0.16, P.green, -0.2, 0.74, 0.16, 1, 1, 0.8)],
    plant: () => [K.cyl(0.32, 0.24, 0.5, P.orange, 0, 0.25, 0, 12), K.sph(0.42, 0x2fae82, 0, 0.95, 0, 1, 1.15, 1), K.sph(0.3, P.green, 0.22, 1.2, 0.1), K.sph(0.28, P.green, -0.2, 1.1, -0.12)],
    sofa: () => [K.rbox(2.0, 0.45, 0.9, P.purple, 0, 0.42, 0, 0, 0.14), K.rbox(2.0, 0.7, 0.28, 0x7c3aed, 0, 0.82, -0.34, 0, 0.1), K.rbox(0.28, 0.5, 0.9, 0x7c3aed, -0.9, 0.62, 0, 0, 0.1), K.rbox(0.28, 0.5, 0.9, 0x7c3aed, 0.9, 0.62, 0, 0, 0.1), K.rbox(0.5, 0.2, 0.4, P.yellow, -0.4, 0.74, 0.05, 0.3, 0.1)],
    armchair: () => [K.rbox(0.95, 0.42, 0.85, P.red, 0, 0.42, 0, 0, 0.14), K.rbox(0.95, 0.75, 0.25, 0xb91c1c, 0, 0.86, -0.32, 0, 0.1), K.rbox(0.22, 0.4, 0.85, 0xb91c1c, -0.42, 0.66, 0, 0, 0.08), K.rbox(0.22, 0.4, 0.85, 0xb91c1c, 0.42, 0.66, 0, 0, 0.08), ...legs(0.36, 0.3, 0.2, P.gold, 0.04)],
    dtable: () => [K.cyl(1.05, 1.05, 0.08, 0x7a4b2a, 0, 0.82, 0, 22), K.cyl(0.14, 0.2, 0.78, P.woodD, 0, 0.4, 0, 10), K.cyl(0.5, 0.56, 0.06, P.woodD, 0, 0.03, 0, 14), K.cyl(0.2, 0.2, 0.02, P.white, 0.5, 0.87, 0, 12), K.cyl(0.2, 0.2, 0.02, P.white, -0.5, 0.87, 0, 12), K.cyl(0.06, 0.08, 0.3, P.gold, 0, 1.0, 0, 8)],
    bed: () => [K.rbox(1.7, 0.4, 2.3, P.wood, 0, 0.3, 0, 0, 0.08), K.rbox(1.6, 0.26, 2.1, P.white, 0, 0.62, 0, 0, 0.14), K.rbox(1.62, 0.12, 1.3, P.pink, 0, 0.74, 0.4, 0, 0.1), K.rbox(0.6, 0.16, 0.4, P.cream, -0.4, 0.8, -0.75, 0, 0.1), K.rbox(0.6, 0.16, 0.4, P.cream, 0.4, 0.8, -0.75, 0, 0.1), K.rbox(1.8, 1.0, 0.14, P.woodD, 0, 0.7, -1.15, 0, 0.06)],
    statue: () => [K.rbox(0.7, 0.4, 0.7, P.cream, 0, 0.2, 0, 0, 0.05), K.cyl(0.2, 0.26, 0.9, P.white, 0, 0.85, 0, 10), K.sph(0.24, P.white, 0, 1.5, 0), K.cyl(0.07, 0.07, 0.6, P.white, 0.26, 1.1, 0, 6, 0, 0.5), K.cyl(0.07, 0.07, 0.6, P.white, -0.28, 0.95, 0, 6, 0, -0.2)],
    vase: () => [K.part(new THREE.LatheGeometry([[0.12, 0], [0.26, 0.2], [0.3, 0.5], [0.16, 0.8], [0.2, 0.95]].map((a) => new THREE.Vector2(a[0], a[1])), 14), P.blue), K.sph(0.14, P.pink, 0.05, 1.12, 0), K.sph(0.12, P.yellow, -0.1, 1.06, 0.05), K.sph(0.1, P.red, 0.02, 1.2, -0.08)],
    lamp: () => [K.cyl(0.24, 0.28, 0.06, P.gold, 0, 0.03, 0, 12), K.cyl(0.03, 0.03, 1.4, P.gold, 0, 0.75, 0, 6), K.part(new THREE.CylinderGeometry(0.16, 0.34, 0.42, 12, 1, true), P.cream, 0, 1.6, 0), K.sph(0.09, 0xfff3b0, 0, 1.5, 0)],
    curtain: () => [K.cyl(0.03, 0.03, 1.4, P.gold, 0, 2.3, 0, 6, 0, Math.PI / 2), ...[-0.5, -0.25, 0, 0.25, 0.5].map((x, i) => K.cyl(0.14, 0.17, 2.25, i % 2 ? 0x9f1239 : 0xbe123c, x, 1.15, 0, 8)), K.cyl(0.05, 0.05, 2.3, P.gold, -0.68, 1.15, 0, 6), K.cyl(0.2, 0.2, 0.05, P.gold, -0.68, 0.03, 0, 10)],
    arcade: () => [K.rbox(0.9, 1.9, 0.9, P.purple, 0, 0.95, 0, 0, 0.08), K.box(0.7, 0.55, 0.06, 0x0f172a, 0, 1.4, 0.44, 0, -0.2), K.box(0.6, 0.42, 0.02, P.teal, 0, 1.4, 0.48, 0, -0.2), K.box(0.8, 0.1, 0.4, P.dark, 0, 0.98, 0.5, 0, 0.3), K.sph(0.06, P.red, -0.15, 1.08, 0.56), K.sph(0.05, P.yellow, 0.12, 1.06, 0.58), K.box(0.92, 0.24, 0.92, P.pink, 0, 1.86, 0)],
    kiosk: () => [K.rbox(1.7, 1.0, 1.3, P.cream, 0, 0.5, 0, 0, 0.08), K.box(1.74, 0.08, 1.36, P.wood, 0, 1.02, 0), ...[-0.78, 0.78].flatMap((x) => [K.cyl(0.04, 0.04, 1.1, P.metal, x, 1.6, 0.58, 6), K.cyl(0.04, 0.04, 1.1, P.metal, x, 1.6, -0.58, 6)]), ...[-0.68, -0.34, 0, 0.34, 0.68].map((x, i) => K.box(0.34, 0.12, 1.6, i % 2 ? P.white : P.red, x, 2.2, 0))],
    bench: () => [K.box(1.5, 0.08, 0.5, P.wood, 0, 0.5, 0), K.box(1.5, 0.4, 0.07, P.wood, 0, 0.82, -0.22, 0, -0.15), K.box(0.08, 0.5, 0.5, P.dark, -0.62, 0.25, 0), K.box(0.08, 0.5, 0.5, P.dark, 0.62, 0.25, 0)],
    mascot: () => [K.sph(0.5, 0xc98a4b, 0, 0.6, 0, 1, 1.1, 1), K.sph(0.38, 0xc98a4b, 0, 1.35, 0), K.sph(0.13, 0xc98a4b, -0.28, 1.68, 0), K.sph(0.13, 0xc98a4b, 0.28, 1.68, 0), K.sph(0.16, P.cream, 0, 1.28, 0.3), K.sph(0.05, P.dark, -0.13, 1.44, 0.33), K.sph(0.05, P.dark, 0.13, 1.44, 0.33), K.sph(0.3, P.cream, 0, 0.56, 0.3, 1, 1.1, 0.6), K.sph(0.17, 0xc98a4b, -0.5, 0.8, 0.1), K.sph(0.17, 0xc98a4b, 0.5, 0.8, 0.1)],
    toyblock: () => [K.rbox(0.8, 0.8, 0.8, P.yellow, 0, 0.4, 0, 0, 0.1), K.box(0.4, 0.4, 0.02, P.red, 0, 0.4, 0.41), K.box(0.02, 0.4, 0.4, P.blue, 0.41, 0.4, 0), K.box(0.4, 0.02, 0.4, P.green, 0, 0.81, 0)],
    horse: () => [K.cyl(0.5, 0.56, 0.1, P.gold, 0, 0.05, 0, 14), K.cyl(0.04, 0.04, 1.9, P.gold, 0, 0.95, 0, 6), K.rbox(0.36, 0.4, 0.95, P.white, 0, 0.85, 0, 0, 0.15), K.rbox(0.26, 0.5, 0.3, P.white, 0, 1.2, 0.42, 0, 0.1), K.rbox(0.22, 0.24, 0.4, P.white, 0, 1.38, 0.62, 0, 0.08), K.box(0.4, 0.1, 0.4, P.pink, 0, 1.08, -0.05), ...[[-0.12, 0.3], [0.12, 0.3], [-0.12, -0.3], [0.12, -0.3]].map(([x, z]) => K.cyl(0.05, 0.05, 0.5, P.white, x, 0.42, z, 6))],
  };
  function propMesh(kind) { let g = geoCache.get(kind); if (!g) { g = K.merge((BUILD[kind] || BUILD.box)()); geoCache.set(kind, g); } const m = new THREE.Mesh(g, K.mat()); m.castShadow = true; m.receiveShadow = true; return m; }

  // ------------------------------------------------------------ الواجهة
  const hud = h('div', 'g-hud'); el.appendChild(hud);
  hud.innerHTML = `<div class="g-top"><span class="g-chip" id="p-round"><small>الجولة</small><b>—</b></span><span class="g-chip g-timer" id="p-timer">0:00</span><span class="g-chip" id="p-left"><small>متنكرين باقين</small><b>—</b></span></div>
    <div class="g-mission" id="p-info" hidden></div><div class="g-spacer"></div>`;
  const $ = (s) => el.querySelector(s);
  const stick = h('div', 'g-stick', '<i></i>'); const actions = h('div', 'g-actions'); const feed = h('div', 'g-feed'); const flash = h('div', 'g-flash'); const vign = h('div', ''); vign.style.cssText = 'position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 120px 30px rgba(239,68,68,.0);transition:box-shadow 1s';
  const qbtn = h('button', 'g-btn g-quality', '<span id="p-ql"></span>'); el.append(vign, feed, flash, stick, actions, qbtn); stick.hidden = true;
  const QL = { low: 'جودة خفيفة', medium: 'جودة متوسطة', high: 'جودة عالية' }; stage.onQuality = (l) => { qbtn.firstChild.textContent = QL[l]; }; qbtn.style.cssText += ';min-height:34px;min-width:0;font-size:12px;padding:0 10px;border-radius:10px;inset-inline-end:auto;left:12px;right:auto;bottom:auto;top:calc(58px + env(safe-area-inset-top,0px))'; qbtn.onclick = () => { const o = ['low', 'medium', 'high']; stage.setQuality(o[(o.indexOf(stage.level) + 1) % 3], true); };
  function banner(text, sub) { const b = h('div', 'g-banner', `<div>${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`); el.appendChild(b); later(1900, () => b.remove()); }
  function say(text) { const d = h('div', '', esc(text)); feed.appendChild(d); while (feed.children.length > 4) feed.firstChild.remove(); later(4500, () => d.remove()); }
  function info(html) { const i = $('#p-info'); i.hidden = !html; if (html) i.innerHTML = html; }
  const ICON = { inspect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>', radar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l6-6"/></svg>', swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>', lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>', decoy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="10" height="10" rx="2"/><path d="M16 12h5M18 9l3 3-3 3"/></svg>' };
  const btns = {};
  function mkBtn(id, label, main, fn) { const b = h('button', 'g-btn' + (main ? ' is-main' : ''), `${ICON[id]}<span>${label}</span><i class="cd"></i>`); b.onclick = () => { fn(); }; btns[id] = b; actions.appendChild(b); return b; }
  function buildActions() {
    actions.innerHTML = ''; for (const k in btns) delete btns[k]; stick.hidden = S.role === 'watch';
    if (S.role === 'seek') { mkBtn('radar', 'رادار', false, () => net.g({ k: 'radar' })); mkBtn('inspect', 'فحص', true, () => { if (S.target) { net.g({ k: 'inspect', pid: S.target.pid }); sfx.inspect(); } else ctx.toast('قرّب من غرض عشان تفحصه'); }); }
    if (S.role === 'hide') { mkBtn('decoy', 'طعم', false, () => net.g({ k: 'decoy' })); mkBtn('lock', 'تثبيت', false, () => net.g({ k: 'lock', v: !S.you.lock })); mkBtn('swap', 'تبديل', true, () => { if (S.target) net.g({ k: 'swap', pid: S.target.pid }); else ctx.toast('قرّب من غرض عشان تتحول له'); }); }
  }
  // عصا التحريك (يسار) + سحب الكاميرا (باقي الشاشة) + لوحة مفاتيح للكمبيوتر
  let stickId = null; const knob = stick.firstChild;
  const stickMove = (e) => { const r = stick.getBoundingClientRect(); let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } S.jx = dx; S.jy = -dy; knob.style.transform = `translate(${dx * 38}px,${dy * 38}px)`; };
  stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e); });
  const stickUp = (e) => { if (e.pointerId !== stickId) return; stickId = null; S.jx = S.jy = 0; knob.style.transform = ''; }; stick.addEventListener('pointerup', stickUp); stick.addEventListener('pointercancel', stickUp);
  const cv = stage.canvas; cv.style.touchAction = 'none'; let lookId = null, lx = 0;
  cv.addEventListener('pointerdown', (e) => { lookId = e.pointerId; lx = e.clientX; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => { if (e.pointerId !== lookId) return; S.yaw -= (e.clientX - lx) * 0.007; lx = e.clientX; });
  const lookUp = (e) => { if (e.pointerId === lookId) lookId = null; }; cv.addEventListener('pointerup', lookUp); cv.addEventListener('pointercancel', lookUp);
  const onKey = (e) => { const d = e.type === 'keydown'; const k = e.code; if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE'].includes(k)) { S.keys[k] = d; e.preventDefault(); } if (d && k === 'Space') { const b = btns.inspect || btns.swap; if (b) b.click(); e.preventDefault(); } };
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);

  // ------------------------------------------------------------ بناء الجولة
  function clearWorld() { if (world) { scene.remove(world); world.traverse((o) => { if (o.geometry && !geoCache.has(o.userData.kind)) { /* الهندسة المخزّنة تُحرَّر عند الخروج */ } if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } }); if (world.userData.own) world.userData.own.forEach((g) => g.dispose()); } world = new THREE.Group(); world.userData.own = []; scene.add(world); S.props.clear(); S.seekers.clear(); S.fx.length = 0; S.target = null; }
  function addProp(o, mine) { const m = propMesh(o.kind); m.position.set(o.x, 0, o.z); m.rotation.y = o.rot || 0; world.add(m); const p = { pid: o.pid, kind: o.kind, x: o.x, z: o.z, rot: o.rot || 0, r: KINDS[o.kind].r, m, mate: !!o.mate, mine: !!mine, moveT: 0 }; S.props.set(o.pid, p); if (o.mate && !mine) { const lb = K.label('متنكر معك', { h: 0.45, bg: 'rgba(52,211,153,.9)', color: '#04241a' }); lb.position.y = KINDS[o.kind].h + 0.6; m.add(lb); } return p; }
  function setKind(p, kind) { if (p.kind === kind) return; const old = p.m; const m = propMesh(kind); m.position.copy(old.position); m.rotation.copy(old.rotation); old.children.slice().forEach((c) => m.add(c)); world.remove(old); world.add(m); p.m = m; p.kind = kind; p.r = KINDS[kind].r; puff(p.x, p.z, 0xc4b0ff); }
  function puff(x, z, color, big) { const n = big ? 26 : 12; const g = new THREE.BufferGeometry(); const a = new Float32Array(n * 3), v = []; for (let i = 0; i < n; i++) { a[i * 3] = x; a[i * 3 + 1] = 0.8; a[i * 3 + 2] = z; const an = Math.random() * 6.28; v.push([Math.cos(an) * (1 + Math.random() * 3), 1 + Math.random() * 4, Math.sin(an) * (1 + Math.random() * 3)]); } g.setAttribute('position', new THREE.BufferAttribute(a, 3)); const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: big ? 0.34 : 0.24, transparent: true })); world.add(pts); world.userData.own.push(g); let life = 0; const f = (dt) => { life += dt; const at = g.attributes.position; for (let i = 0; i < n; i++) { at.setXYZ(i, at.getX(i) + v[i][0] * dt, at.getY(i) + v[i][1] * dt, at.getZ(i) + v[i][2] * dt); v[i][1] -= 9 * dt; } at.needsUpdate = true; pts.material.opacity = Math.max(0, 1 - life / 0.9); if (life > 0.9) { world.remove(pts); pts.material.dispose(); S.fx.splice(S.fx.indexOf(f), 1); } }; S.fx.push(f); }
  function buildMap(mapId) {
    const map = S.map = MAPS[mapId]; const p = []; const hw = map.w / 2, hd = map.d / 2;
    p.push(K.box(map.w + 2, 0.3, map.d + 2, map.floor, 0, -0.15, 0));
    for (let i = -Math.floor(hw / 2); i < hw / 2; i++) for (let j = -Math.floor(hd / 2); j < hd / 2; j++) if ((i + j) % 2 === 0) p.push(K.box(1.96, 0.02, 1.96, 0xffffff, i * 2 + 1, 0.011, j * 2 + 1));
    const tiles = K.mesh(p.splice(1), { cast: false, material: new THREE.MeshStandardMaterial({ color: map.floor, roughness: 0.9, transparent: true, opacity: 0.22 }) }); world.add(tiles); world.userData.own.push(tiles.geometry);
    const wc = map.wall; p.push(K.box(map.w + 1, 2.6, 0.5, wc, 0, 1.3, -hd - 0.25), K.box(0.5, 2.6, map.d + 1, wc, -hw - 0.25, 1.3, 0), K.box(0.5, 2.6, map.d + 1, wc, hw + 0.25, 1.3, 0), K.box(map.w + 1, 1.0, 0.5, wc, 0, 0.5, hd + 0.25));
    p.push(K.box(map.w + 1, 0.16, 0.56, map.accent, 0, 2.68, -hd - 0.25), K.box(0.56, 0.16, map.d + 1, map.accent, -hw - 0.25, 2.68, 0), K.box(0.56, 0.16, map.d + 1, map.accent, hw + 0.25, 2.68, 0));
    for (const w of map.walls) p.push(K.box(w[2], 2.1, w[3], wc, w[0], 1.05, w[1]), K.box(w[2] + 0.06, 0.12, w[3] + 0.06, map.accent, w[0], 2.16, w[1]));
    // بوابة المفتشين
    p.push(K.cyl(2.6, 2.6, 0.04, map.accent, map.gate[0], 0.03, map.gate[1], 24));
    const base = K.mesh(p, { cast: false }); world.add(base); world.userData.own.push(base.geometry);
    scene.fog = new THREE.Fog(0x0b0716, 40, 110);
  }
  function addSeeker(id, x, z, rot) { const me = id === ctx.me.id; const ch = K.character(me ? 0xf5c451 : 0x38bdf8, { hat: true, hatColor: 0x1d4ed8, scale: 1 }); ch.position.set(x, 0, z); ch.rotation.y = rot; world.add(ch); ch.traverse((o) => { if (o.geometry) world.userData.own.push(o.geometry); });
    const lb = K.label(S.names.get(id) || 'مفتش', { h: 0.5 }); lb.position.y = 2.6; ch.add(lb); const s = { id, m: ch, x, z, rot, px: x, pz: z }; S.seekers.set(id, s); return s; }
  function onSetup(d) {
    const first = !S.setup || S.setup.round !== d.round; S.setup = d; S.role = d.you.role; S.you = Object.assign({}, d.you); S.phase = d.phase; S.hideEnd = d.hideEnd; S.endAt = d.endAt; S.over = false;
    d.roles.forEach((r) => S.names.set(r.id, r.name)); S.left = d.roles.filter((r) => r.role === 'hide' && !r.found).length;
    clearWorld(); buildMap(d.map); el.querySelectorAll('.g-end,.g-wait').forEach((n) => n.remove());
    (d.props || []).forEach((o) => addProp(o)); (d.mates || []).forEach((o) => addProp(o));
    if (S.role === 'hide') { S.me = { x: d.you.x, z: d.you.z, rot: d.you.rot }; S.mine = addProp({ pid: d.you.pid, kind: d.you.kind, x: d.you.x, z: d.you.z, rot: d.you.rot }, true); const lb = K.label('أنت', { h: 0.5, bg: 'rgba(245,196,81,.95)', color: '#2a1a00' }); lb.position.y = KINDS[d.you.kind].h + 0.7; S.mine.m.add(lb); }
    if (S.role === 'seek') { S.me = { x: d.you.x, z: d.you.z, rot: d.you.rot }; S.yaw = 0; }
    buildActions(); $('#p-round b').textContent = d.round + ' / ' + d.of; $('#p-left b').textContent = S.left; vign.style.boxShadow = 'inset 0 0 120px 30px rgba(239,68,68,0)';
    if (first) { stopAmb(); ambience('room'); banner(MAPS[d.map].name, S.role === 'hide' ? 'أنت متنكر — اختبئ!' : S.role === 'seek' ? 'أنت مفتش — استعد' : `الجولة ${d.round}`); sfx.go(); if (S.role === 'hide') S.yaw = Math.atan2(-d.you.x, -d.you.z); }
    phaseUi();
  }
  function phaseUi() {
    el.querySelectorAll('.g-wait').forEach((n) => n.remove());
    if (S.phase === 'hide') {
      if (S.role === 'hide') info(`<small>مرحلة الاختباء</small>أنت الحين <b>${esc(KINDS[S.you.kind].n)}</b> — دوّر لك مكان يناسبك قبل ما تنفتح البوابة!`);
      else { const w = h('div', 'g-wait', `<div><h3>${S.role === 'seek' ? 'البوابة مقفلة' : 'المتنكرين يختبون...'}</h3><p>${S.role === 'seek' ? 'المتنكرين قاعدين يختبون... بتنفتح بعد' : 'يبدأ البحث بعد'} <b id="p-hidecd">25</b> ثانية</p></div>`); w.style.pointerEvents = 'none'; w.style.background = S.role === 'seek' ? 'rgba(5,3,10,.94)' : 'rgba(5,3,10,.55)'; el.appendChild(w); info(''); }
    } else if (S.role === 'hide') info(`<small>البحث بدأ!</small>لا تتحرك قدام المفتشين — الثبات 5 ثواني يخفيك عن الرادار.`);
    else if (S.role === 'seek') info(`<small>ابحث عن المتنكرين</small>قرّب من الغرض المشبوه واضغط «فحص». عندك <b id="p-att">${S.you.att}</b> محاولات.`);
    else info(isHost ? `<small>${esc(S.map.name)}</small>المفتشين يدورون... أي غرض ممكن يكون لاعب!` : `<small>انكشفت!</small>تابع الجولة كمشاهد.`);
  }

  // ------------------------------------------------------------ حلقة الرسم
  const circlesFor = () => { const c = []; S.props.forEach((p) => { if (!p.mine && !p.decoy) c.push({ id: p.pid, x: p.x, z: p.z, r: p.r }); }); return c; };
  let circ = [], circAt = 0;
  stage.onFrame = (dt, t) => {
    const now = net.now(); if (!S.map) return;
    // إدخال اللاعب → تنبؤ محلي بنفس دالة حركة الخادم
    let jx = S.jx, jy = S.jy; if (S.keys.KeyA || S.keys.ArrowLeft) jx -= 1; if (S.keys.KeyD || S.keys.ArrowRight) jx += 1; if (S.keys.KeyW || S.keys.ArrowUp) jy += 1; if (S.keys.KeyS || S.keys.ArrowDown) jy -= 1; if (S.keys.KeyQ) S.yaw += dt * 2; if (S.keys.KeyE) S.yaw -= dt * 2;
    const jl = Math.hypot(jx, jy); if (jl > 1) { jx /= jl; jy /= jl; }
    const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw); let mx = fx * jy - fz * jx, mz = fz * jy + fx * jx;
    const can = !S.over && S.role !== 'watch' && !(S.role === 'seek' && S.phase !== 'seek') && !(S.role === 'hide' && S.you.lock);
    if (!can) { mx = mz = 0; }
    if (S.role !== 'watch') {
      if (t - circAt > 0.25) { circ = circlesFor(); circAt = t; }
      const moving = Math.hypot(mx, mz) > 0.05;
      if (moving) { const sp = S.role === 'seek' ? PROP.SPEED_SEEKER : PROP.SPEED_HIDER; const r = S.role === 'seek' ? 0.45 : KINDS[S.you.kind].r; const np = stepMove(S.map, S.me.x, S.me.z, mx * sp * dt, mz * sp * dt, r, circ, null); S.me.x = np.x; S.me.z = np.z; S.me.rot = Math.atan2(mx, mz); }
      // إرسال الإدخال: عند التغيّر أو كل 200ms (ليس كل إطار)
      const q = [Math.round(mx * 20) / 20, Math.round(mz * 20) / 20]; if ((q[0] !== S.lastIn[0] || q[1] !== S.lastIn[1]) && now - S.lastSend > 60 || now - S.lastSend > 200) { if (q[0] !== S.lastIn[0] || q[1] !== S.lastIn[1] || moving) net.g({ k: 'in', x: q[0], z: q[1] }); S.lastIn = q; S.lastSend = now; }
      if (S.role === 'hide' && S.mine) { const m = S.mine.m; S.mine.x = S.me.x; S.mine.z = S.me.z; m.position.x = S.me.x; m.position.z = S.me.z; if (moving) { m.rotation.y = S.me.rot; S.mine.moveT += dt; if (Math.floor(S.mine.moveT * 4) !== Math.floor((S.mine.moveT - dt) * 4)) sfx.scoot(); } wobble(m, moving, t); }
      if (S.role === 'seek') { let s = S.seekers.get(ctx.me.id); if (!s) s = addSeeker(ctx.me.id, S.me.x, S.me.z, 0); const m = s.m; m.position.x = S.me.x; m.position.z = S.me.z; if (moving) { let dr = S.me.rot - m.rotation.y; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; m.rotation.y += dr * Math.min(1, dt * 12); } K.animate(m, dt, moving ? PROP.SPEED_SEEKER : 0); }
    }
    // الآخرون: استيفاء ناعم نحو آخر لقطة
    S.seekers.forEach((s) => { if (s.id === ctx.me.id) return; const m = s.m; const k = Math.min(1, dt * 10); const px = m.position.x, pz = m.position.z; m.position.x += (s.x - px) * k; m.position.z += (s.z - pz) * k; let dr = s.rot - m.rotation.y; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; m.rotation.y += dr * k; K.animate(m, dt, Math.hypot(m.position.x - px, m.position.z - pz) / Math.max(dt, 0.001)); });
    S.props.forEach((p) => { if (p.mine) return; const m = p.m; const dx = p.x - m.position.x, dz = p.z - m.position.z; const d = Math.hypot(dx, dz); if (d > 0.01) { const k = Math.min(1, dt * 9); m.position.x += dx * k; m.position.z += dz * k; let dr = p.rot - m.rotation.y; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; m.rotation.y += dr * k; } wobble(m, d > 0.04, t); });
    // الهدف القريب (للفحص/التبديل)
    if (S.role !== 'watch' && !S.over) { let best = null, bd = 1e9; const range = S.role === 'seek' ? PROP.INSPECT_RANGE : PROP.SWAP_RANGE; S.props.forEach((p) => { if (p.mine || (S.role === 'hide' && (p.mate || p.decoy))) return; const d = Math.hypot(p.x - S.me.x, p.z - S.me.z) - p.r - (S.role === 'hide' ? KINDS[S.you.kind].r : 0); if (d < range * (S.role === 'seek' ? 0.92 : 0.95) && d < bd) { const ang = Math.atan2(p.x - S.me.x, p.z - S.me.z); let da = Math.abs(ang - S.yaw) % 6.283; if (da > Math.PI) da = 6.283 - da; const sc = d + da * 0.8; if (sc < bd) { bd = sc; best = p; } } }); S.target = (S.role === 'seek' && S.phase !== 'seek') ? null : best; ring.visible = !!S.target; if (S.target) { ring.position.set(S.target.m.position.x, 0.06, S.target.m.position.z); ring.scale.setScalar(S.target.r + 0.3); ring.rotation.z = t * 2; } } else ring.visible = false;
    // الكاميرا
    if (S.role === 'watch') { const a = t * 0.07; const R = Math.max(S.map.w, S.map.d) * 0.72; camera.position.set(Math.sin(a) * R * 0.55, R * 0.95, Math.cos(a) * R * 0.55 + 6); camera.lookAt(0, 0, 0); }
    else { const dist = 8.6, ph = 0.72; const tx = S.me.x - fx * dist * Math.cos(ph), tz = S.me.z - fz * dist * Math.cos(ph); const k = Math.min(1, dt * 8); camera.position.x += (tx - camera.position.x) * k; camera.position.z += (tz - camera.position.z) * k; camera.position.y = dist * Math.sin(ph); camera.lookAt(S.me.x, 1, S.me.z); }
    for (const f of S.fx.slice()) f(dt, t);
    // العدادات
    const tm = $('#p-timer'); if (S.over) { /* ثابت */ } else if (S.phase === 'hide') { const left = S.hideEnd - now; tm.textContent = fmtTime(left); const c = $('#p-hidecd'); if (c) c.textContent = Math.max(0, Math.ceil(left / 1000)); } else { const left = S.endAt - now; tm.textContent = fmtTime(left); tm.classList.toggle('is-low', left < 60000); }
    const cd = (b, until, total) => { if (!b) return; const left = Math.max(0, until - now); b.querySelector('.cd').style.height = Math.min(100, left / total * 100) + '%'; };
    cd(btns.swap, S.you.extra ? 0 : S.you.swapAt || 0, 40000); cd(btns.decoy, S.you.decoyAt || 0, 45000); cd(btns.radar, S.you.radarAt || 0, 30000); if (btns.lock) btns.lock.style.borderColor = S.you.lock ? '#34d399' : '';
  };
  // حركة الغرض: قفزات صغيرة بوزن واحتكاك، ثم يثبت تمامًا
  function wobble(m, moving, t) { const u = m.userData; u.w = (u.w || 0) + ((moving ? 1 : 0) - (u.w || 0)) * 0.2; m.position.y = Math.abs(Math.sin(t * 13)) * 0.13 * u.w; m.rotation.z = Math.sin(t * 13) * 0.07 * u.w; m.rotation.x = Math.cos(t * 6.5) * 0.04 * u.w; }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffffff })); ring.rotation.x = Math.PI / 2; ring.visible = false; scene.add(ring);

  // ------------------------------------------------------------ رسائل الخادم
  function onSnap(d) {
    if (d.me && S.role !== 'watch') { const ex = d.me[0] - S.me.x, ez = d.me[1] - S.me.z; const err = Math.hypot(ex, ez); if (err > 1.6) { S.me.x = d.me[0]; S.me.z = d.me[1]; } else if (err > 0.05) { S.me.x += ex * 0.12; S.me.z += ez * 0.12; } } // مصالحة مع الخادم
    const seen = new Set(); for (const s of d.seek || []) { seen.add(s[0]); if (s[0] === ctx.me.id) continue; let k = S.seekers.get(s[0]); if (!k) k = addSeeker(s[0], s[1], s[2], s[3]); k.x = s[1]; k.z = s[2]; k.rot = s[3]; }
    for (const m of d.mv || []) { let p = S.props.get(m[0]); if (!p) { p = addProp({ pid: m[0], kind: m[1], x: m[2], z: m[3], rot: m[4], mate: S.role === 'hide' && S.phase === 'hide' }); if (S.role === 'hide' && S.phase === 'seek') p.decoy = true; } else if (p.kind !== m[1]) { setKind(p, m[1]); if (S.role !== 'hide') sfx.swap(); } p.x = m[2]; p.z = m[3]; p.rot = m[4]; }
  }
  function removeProp(pid, pop) { const p = S.props.get(pid); if (!p) return null; if (pop) puff(p.x, p.z, 0xffffff); world.remove(p.m); S.props.delete(pid); if (S.target === p) S.target = null; return p; }
  const QUAD = ['الزاوية البعيدة يمين', 'الزاوية البعيدة يسار', 'الزاوية القريبة يمين', 'الزاوية القريبة يسار'];
  function onOver(d) {
    S.over = true; ring.visible = false; stick.hidden = true; actions.innerHTML = ''; info('');
    d.reveal.forEach((r) => { if (r.found) return; const p = S.props.get(r.pid); const x = p ? p.x : r.x, z = p ? p.z : r.z; const b = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 4), new THREE.MeshBasicMaterial({ color: 0x34d399 })); b.rotation.x = Math.PI; b.position.set(x, KINDS[r.kind].h + 1.6, z); world.add(b); world.userData.own.push(b.geometry); const lb = K.label(S.names.get(r.id) || '', { h: 0.6 }); lb.position.set(x, KINDS[r.kind].h + 2.8, z); world.add(lb); S.fx.push((dt, t) => { b.position.y = KINDS[r.kind].h + 1.6 + Math.sin(t * 4) * 0.2; b.rotation.y = t * 2; }); });
    const iWon = d.winner && ((S.setup.roles.find((r) => r.id === ctx.me.id) || {}).role === d.winner); if (d.winner) (isHost || iWon ? sfx.win : sfx.lose)();
    const title = d.winner === 'hide' ? 'فاز المتنكرين!' : d.winner === 'seek' ? 'فاز المفتشين!' : 'انتهت الجولة'; const why = { all_found: 'انكشف الجميع', time: 'انتهى الوقت وبقي متنكر', no_attempts: 'خلصت محاولات المفتشين', aborted: 'خرج لاعبون' }[d.why] || '';
    const mine = d.results.find((r) => r.id === ctx.me.id);
    const end = h('div', 'g-end', `<h3>${title}</h3><div class="g-awards"><span>${esc(why)}</span>${mine ? `<span>نقاطك بالجولة: ${mine.pts}${mine.lines.length ? ' (' + mine.lines.map((l) => esc(l[0]) + ' +' + l[1]).join('، ') + ')' : ''}</span>` : ''}</div>
      <ol class="g-rank">${d.results.slice().sort((a, b) => b.score - a.score).map((p, i) => `<li><i>${i + 1}</i><span>${esc(p.name)} · ${p.role === 'seek' ? 'مفتش' : p.found ? 'متنكر انكشف' : 'متنكر نجا'}</span><b>${p.score}</b></li>`).join('')}</ol><p style="color:#B5A9D9;font-weight:700;margin:0">${d.round < d.of ? 'الجولة الجاية تبدأ بعد لحظات وتتبدل الأدوار...' : 'نحسب النتيجة النهائية...'}</p>`); el.appendChild(end);
    if (d.best && isHost) later(2600, () => playReplay(d.best));
  }
  // أفضل لقطة: إعادة تمثيل قصيرة من إحداثيات الخادم (بدون تسجيل فيديو)
  function playReplay(b) {
    if (disposed || !b.frames.length) return; const cap = h('div', 'g-banner', `<div style="animation:none;font-size:clamp(18px,3vw,30px);align-self:start;margin-top:90px">أفضل لقطة<small>${esc(b.seeker)} مرّ جنب ${esc(b.hider)} وما انتبه!</small></div>`); el.appendChild(cap);
    const ghost = K.character(0x38bdf8, { hat: true, hatColor: 0x1d4ed8 }); world.add(ghost); const pm = propMesh(b.frames[0][7] || 'box'); world.add(pm); S.props.forEach((p) => { if (Math.hypot(p.x - b.frames[0][4], p.z - b.frames[0][5]) < 0.4) p.m.visible = false; }); S.seekers.forEach((s) => { s.m.visible = false; });
    const t0 = performance.now(), start = b.frames[0][0], endT = b.frames[b.frames.length - 1][0]; const f = () => { const tt = start + (performance.now() - t0) * 0.8; let i = 0; while (i < b.frames.length - 2 && b.frames[i + 1][0] < tt) i++; const a = b.frames[i], c = b.frames[i + 1] || a; const k = Math.max(0, Math.min(1, (tt - a[0]) / (c[0] - a[0] || 1))); const L = (j) => a[j] + (c[j] - a[j]) * k; const px = ghost.position.x, pz = ghost.position.z; ghost.position.set(L(1), 0, L(2)); ghost.rotation.y = a[3]; K.animate(ghost, 0.016, Math.hypot(ghost.position.x - px, ghost.position.z - pz) * 60); pm.position.set(L(4), 0, L(5)); pm.rotation.y = a[6]; camera.position.set(L(4) + 5, 6, L(5) + 7); camera.lookAt(L(4), 1, L(5)); if (tt >= endT + 600) { S.fx.splice(S.fx.indexOf(f), 1); cap.remove(); world.remove(ghost); world.remove(pm); } }; S.fx.push(f);
  }
  function onFinal(d) {
    S.over = true; S.final = true; el.querySelectorAll('.g-end').forEach((n) => n.remove()); hud.style.display = 'none'; clearWorld(); S.map = null; scene.fog = null;
    // مسرح دوّار بكشافات (احتفال مختلف عن المدينة)
    const g = new THREE.Group(); scene.add(g); world.add(g); const st = K.mesh([K.cyl(9, 9.6, 0.8, 0x2a1230, 0, 0.4, 0, 36), K.cyl(7.6, 7.6, 0.2, 0xf472b6, 0, 0.9, 0, 36), K.cyl(11.5, 11.5, 0.2, 0x150d2b, 0, 0.0, 0, 40)]); g.add(st); world.userData.own.push(st.geometry);
    const top = d.ranking.slice(0, 3); const xs = [0, -3.6, 3.6], zs = [0, 1.4, 1.4], sc = [1.9, 1.5, 1.5];
    top.forEach((p, i) => { const ch = K.character([0xf5c451, 0x8b5cf6, 0x34d399][i], { hat: i === 0, hatColor: 0xf472b6, scale: sc[i] }); ch.position.set(xs[i], 1.0, zs[i]); g.add(ch); const lb = K.label((i + 1) + ' · ' + p.name, { h: 0.9 }); lb.position.set(xs[i], 1.0 + sc[i] * 2.4 + 0.6, zs[i]); g.add(lb); S.fx.push((dt, t) => { K.animate(ch, dt, i === 0 ? 3 : 0.01); ch.rotation.y = Math.sin(t * 2 + i) * 0.5; }); });
    const beams = []; [0xf472b6, 0xfde68a, 0x8b5cf6].forEach((c, i) => { const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 16, 18, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })); cone.position.set((i - 1) * 6, 8, -1); world.add(cone); world.userData.own.push(cone.geometry); beams.push(cone); });
    S.fx.push((dt, t) => { g.rotation.y = Math.sin(t * 0.4) * 0.35; beams.forEach((b, i) => { b.rotation.z = Math.sin(t * 1.3 + i * 2) * 0.35; }); camera.position.set(Math.sin(t * 0.15) * 4, 7.5, 17); camera.lookAt(0, 3, 0); });
    S.role = 'final'; sfx.win(); const me = d.ranking.findIndex((r) => r.id === ctx.me.id); const co = d.ranking.filter((r) => r.tiedTop).map((r) => r.name);
    const end = h('div', 'g-end', `<h3>${d.ranking[0] ? 'الفائز: ' + esc(d.ranking[0].name) + (co.length ? ' و' + co.map(esc).join(' و') : '') + ' · ' + d.ranking[0].score + ' نقطة' : 'انتهت المباراة'}</h3>${!isHost && me >= 0 ? `<div class="g-awards"><span>ترتيبك ${me + 1} من ${d.ranking.length}</span></div>` : ''}
      <ol class="g-rank">${d.ranking.map((p, i) => `<li><i>${i + 1}</i><span>${esc(p.name)} · كشف ${p.stats ? p.stats.reveals : 0} · صمد ${p.stats ? Math.round(p.stats.surviveMs / 1000) : 0} ث</span><b>${p.score}</b></li>`).join('')}</ol><div class="g-awards"><span>${esc(d.tieRule)}</span></div>
      ${isHost ? '<div class="j3-row"><button class="j3-btn j3-btn-main" id="p-again">مباراة جديدة بنفس اللاعبين</button><button class="j3-btn j3-btn-quiet" id="p-exit">إنهاء الغرفة</button></div>' : '<p style="color:#B5A9D9;font-weight:700;margin:0">ننتظر المضيف يبدأ مباراة جديدة...</p>'}`);
    el.appendChild(end); stick.hidden = true; actions.innerHTML = ''; qbtn.hidden = true; if (isHost) { end.querySelector('#p-again').onclick = ctx.again; end.querySelector('#p-exit').onclick = ctx.exit; }
  }
  function onMsg(d) {
    if (disposed) return;
    if (d.k === 'setup') return onSetup(d);
    if (d.k === 'final') return onFinal(d);
    if (!S.setup || !S.map) return;
    if (d.k === 'snap') return onSnap(d);
    if (d.k === 'phase') { S.phase = d.phase; S.endAt = d.endAt; phaseUi(); banner(S.role === 'hide' ? 'انفتحت البوابة!' : 'ابدأ البحث!', S.role === 'hide' ? 'اثبت مكانك' : 'أي غرض ممكن يكون لاعب'); sfx.go(); S.props.forEach((p) => { if (p.mate) p.decoy = false; }); return; }
    if (d.k === 'you') { const wasKind = S.you.kind; Object.assign(S.you, d); if (d.kind && d.kind !== wasKind && S.mine) { setKind(S.mine, d.kind); sfx.swap(); ctx.toast('تحولت إلى ' + KINDS[d.kind].n); const lb = S.mine.m.children[0]; if (lb) lb.position.y = KINDS[d.kind].h + 0.7; } if ('lock' in d) ctx.toast(d.lock ? 'ثبّتت نفسك — ما راح تتحرك بالغلط' : 'فكّيت التثبيت'); if (d.extra) ctx.toast('عندك تبديل شكل إضافي!'); return; }
    if (d.k === 'deny') return ctx.toast({ far: 'بعيد — قرّب أكثر', cooldown: 'لسا ما جهزت، انتظر شوي' }[d.why] || 'ما ينفع الحين');
    if (d.k === 'insp') { if ('att' in d) { S.you.att = d.att; const a = $('#p-att'); if (a) a.textContent = d.att; } if (d.ok) { banner('كشفته!', '+' + d.pts); } else if (d.gone) ctx.toast('انكشف قبلك بلحظة'); else { sfx.bad(); ctx.toast(d.decoy ? 'طعم! خسرت محاولة' : `غرض عادي... باقي ${d.att} ${d.att === 1 ? 'محاولة' : 'محاولات'}`); if (d.att === 0) info('<small>خلصت محاولاتك</small>تقدر تتحرك وتراقب وتدل فريقك، بس ما تقدر تفحص.'); } return; }
    if (d.k === 'radar') { S.you.radarAt = d.radarAt; sfx.radar(); if (!d.blips.length) ctx.toast('الرادار ما لقط نشاط قريب'); d.blips.forEach(([x, z]) => { const r = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.0, 28), new THREE.MeshBasicMaterial({ color: 0xf5c451, transparent: true, side: THREE.DoubleSide, depthTest: false })); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.1, z); r.renderOrder = 4; world.add(r); world.userData.own.push(r.geometry); let life = 0; const f = (dt) => { life += dt; r.scale.setScalar(1 + Math.sin(life * 5) * 0.15); r.material.opacity = Math.max(0, 1 - life / 4.5); if (life > 4.5) { world.remove(r); r.material.dispose(); S.fx.splice(S.fx.indexOf(f), 1); } }; S.fx.push(f); }); return; }
    if (d.k === 'found') { const p = removeProp(d.pid); puff(d.x, d.z, 0xfde68a, true); flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); sfx.reveal(); S.left = d.left; $('#p-left b').textContent = d.left;
      const ch = K.character(0xf472b6, { scale: 1.1 }); ch.position.set(d.x, 0, d.z); world.add(ch); let life = 0; const f = (dt, t) => { life += dt; ch.position.y = Math.abs(Math.sin(life * 7)) * 0.5; ch.rotation.y += dt * 6; K.animate(ch, dt, 3); if (life > 2.4) { world.remove(ch); S.fx.splice(S.fx.indexOf(f), 1); } }; S.fx.push(f);
      say(`${d.by.name} كشف ${d.hider.name}! +75`); if (d.hider.id === ctx.me.id) banner('انكشفت!', 'كشفك ' + d.by.name); else if (isHost) banner('انكشف ' + d.hider.name, 'كشفه ' + d.by.name + ' · +75'); return; }
    if (d.k === 'gone') { removeProp(d.pid, d.pop); if ('left' in d) { S.left = d.left; $('#p-left b').textContent = d.left; } return; }
    if (d.k === 'fx') { const p = S.props.get(d.pid); if (p) puff(p.x, p.z, 0x9ca3af); if (d.by !== ctx.me.id) sfx.inspect(); return; }
    if (d.k === 'lastmin') { banner('آخر دقيقة!', 'الحماس الحين'); sfx.lastmin(); vign.style.boxShadow = 'inset 0 0 140px 34px rgba(239,68,68,.34)'; return; }
    if (d.k === 'lasthider') { later(2000, () => { banner('باقي متنكر واحد!'); sfx.lastmin(); }); return; }
    if (d.k === 'hot') { say('نشاط مشبوه جهة: ' + QUAD[d.q]); return; }
    if (d.k === 'over') return onOver(d);
  }
  stage.start();
  return {
    onMsg,
    unmount() { disposed = true; timers.forEach(clearTimeout); stopAmb(); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); geoCache.forEach((g) => g.dispose()); clearWorld(); stage.dispose(); [hud, stick, actions, feed, flash, vign, qbtn].forEach((n) => n.remove()); el.querySelectorAll('.g-end,.g-banner,.g-wait').forEach((n) => n.remove()); },
    debug: () => Object.assign(stage.info(), { props: S.props.size, seekers: S.seekers.size, role: S.role, phase: S.phase }),
    _S: S, _stage: stage,
  };
}
