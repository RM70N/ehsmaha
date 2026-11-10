// المدينة المصغّرة — سكان المدينة (ديكور حي): أشخاص بأطراف متحركة يُرسمون بـInstancing (7 Draw Calls لكل الحشد).
// حتمي بالكامل من (seed, الوقت): لا شبكة ولا فيزياء. ألوان ملابسهم باهتة/ترابية عمدًا حتى لا تتطابق مع ألوان المهمات.
// سلوك: متنزهون على الأرصفة مع وقفات، عابرون يعبرون الشارع عند الإشارة الحمراء للسيارات، جالسون بالمقاهي، متنزهو الحديقة، وتجمّع الاحتفال.

const SKIN = [0xf0c29b, 0xd9a07a, 0xb97a56, 0x8a5a3c, 0xf6d2b4]; const HAIR = [0x2b1b12, 0x14100c, 0x6a4a2a, 0x3a2a1a, 0x8a6a3a];
const SHIRTS = [0x6b7f5a, 0x8a6a4a, 0x5a6a7a, 0x7a5a58, 0x9a8f78, 0x4a5a52, 0x7f6f8a, 0xa08a5a, 0x5f7f86];
const PANTS = [0x3a3f4a, 0x4a3f36, 0x2f3a3f, 0x5a5448, 0x3a3a3a];

export function createCrowd(THREE, scene, o) {
  const { world, CITY, blockAt, roadAt, lightState, DISTRICT_GRID, seed, quality } = o;
  const R = (() => { let a = (seed ^ 0x9e3779b9) >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  const pick = (a) => a[Math.floor(R() * a.length)];
  const agents = []; const HALFB = CITY.BLOCK / 2 - 0.5; const PER = 8 * HALFB;
  const perim = (cx, cz, s, rev) => { s = ((s % PER) + PER) % PER; if (rev) s = PER - s; const L = 2 * HALFB; const q = Math.floor(s / L), u = s - q * L; let x, z, hx, hz; if (q === 0) { x = -HALFB + u; z = -HALFB; hx = 1; hz = 0; } else if (q === 1) { x = HALFB; z = -HALFB + u; hx = 0; hz = 1; } else if (q === 2) { x = HALFB - u; z = HALFB; hx = -1; hz = 0; } else { x = -HALFB; z = HALFB - u; hx = 0; hz = -1; } if (rev) { hx = -hx; hz = -hz; } return [cx + x, cz + z, Math.atan2(hx, hz)]; };
  const mk = (extra) => Object.assign({ shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKIN), hair: pick(HAIR), ph: R() * 6.28, long: R() < 0.35, scale: 0.92 + R() * 0.18 }, extra);
  // متنزهون على أرصفة البلوكات (بلوك واحد لكل 2 من البلوكات تقريبًا، أكثر في التجاري والوسط)
  for (let i = 0; i < CITY.N; i++) for (let j = 0; j < CITY.N; j++) { const d = DISTRICT_GRID[i][j]; const n = d === 'shop' || d === 'down' ? 3 : d === 'park' ? 1 : d === 'ind' ? 1 : 2; for (let k = 0; k < n; k++) agents.push(mk({ kind: 'walk', cx: blockAt(i), cz: blockAt(j), s0: R() * PER, v: 1.1 + R() * 0.7, rev: R() < 0.5, walkT: 9 + R() * 6, pauseT: 2 + R() * 4, dist: d })); }
  // عابرو الشوارع
  for (let i = 0; i <= CITY.N; i++) for (let j = 0; j <= CITY.N; j++) if ((i * 7 + j * 3) % 3 === 0) for (let k = 0; k < 2; k++) agents.push(mk({ kind: 'cross', i, j, side: k ? 1 : -1, off: k * 0.9, dir: 0 }));
  // جالسون بالمقاهي والمطاعم + متنزهون بالحدائق
  for (const b of world.buildings) { const d = DISTRICT_GRID[b.bi][b.bj]; if ((b.kind === 'cafe' || b.kind === 'restaurant') && d !== 'ind') for (const s of [-1, 1]) agents.push(mk({ kind: 'sit', x: b.x + s * b.w * 0.3 + s * 0.7, z: b.z + b.d / 2 + 1.9 + (s > 0 ? 0.15 : -0.1), yaw: s > 0 ? -Math.PI / 2 : Math.PI / 2 }));
    if (b.kind === 'park') for (let k = 0; k < 3; k++) agents.push(mk({ kind: 'ring', cx: b.x - b.w * 0.22, cz: b.z - b.d * 0.2, r: 3.4 + k * 1.1, w: (R() < 0.5 ? 1 : -1) * (0.18 + R() * 0.1), ph0: R() * 6.28 }));
    if (b.kind === 'plaza') for (let k = 0; k < 4; k++) agents.push(mk({ kind: 'ring', cx: b.x, cz: b.z, r: 4 + k * 0.9, w: (k % 2 ? 1 : -1) * (0.14 + R() * 0.08), ph0: R() * 6.28, plaza: true })); }
  const plaza = world.buildings.find((b) => b.kind === 'plaza');
  // مجموعة الاحتفال: عدد من المتنزهين ينجذبون للساحة
  agents.filter((a) => a.kind === 'walk').forEach((a, i) => { a.fest = i % 3 === 0; a.fx = (R() - 0.5) * 7; a.fz = (R() - 0.5) * 7; });
  if (quality === 'low') { const keep = agents.filter((a, i) => i % 2 === 0 || a.kind === 'sit'); agents.length = 0; agents.push(...keep); }
  const N = agents.length; const fest = { on: 0, k: 0 }; let mkt = { on: 0, k: 0, d: 'shop' };

  // ---------------- الهندسة المشتركة (قطع بشرية مثبتة على نقطة المفصل)
  const G = (w, h, d, ox, oy, oz) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(ox, oy, oz); return g; };
  const geos = { torso: G(0.5, 0.66, 0.3, 0, 1.12, 0), head: new THREE.SphereGeometry(0.22, quality === 'low' ? 7 : 10, quality === 'low' ? 5 : 8), hair: new THREE.SphereGeometry(0.235, quality === 'low' ? 7 : 10, quality === 'low' ? 4 : 7, 0, 6.283, 0, 1.75), leg: G(0.19, 0.78, 0.22, 0, -0.39, 0), arm: G(0.13, 0.62, 0.15, 0, -0.3, 0) };
  geos.head.translate(0, 1.72, 0.0); geos.hair.translate(0, 1.76, -0.02);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  const mesh = {}; const C = new THREE.Color();
  for (const k of ['torso', 'head', 'hair', 'legL', 'legR', 'armL', 'armR']) { const g = geos[k] || geos[k.slice(0, -1).toLowerCase()] || geos.leg; const im = new THREE.InstancedMesh(g, mat, N); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = false; scene.add(im); mesh[k] = im; }
  agents.forEach((a, i) => { const set = (k, c) => { C.setHex(c); mesh[k].setColorAt(i, C); }; set('torso', a.shirt); set('head', a.skin); set('hair', a.hair); set('legL', a.pants); set('legR', a.pants); set('armL', a.shirt); set('armR', a.shirt); });
  for (const k in mesh) if (mesh[k].instanceColor) mesh[k].instanceColor.needsUpdate = true;
  const base = new THREE.Matrix4(), m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4(), mr = new THREE.Matrix4(), ms = new THREE.Matrix4(); const hide = new THREE.Matrix4().makeScale(0, 0, 0);

  function state(a, t) { // → [x, z, yaw, speed, sit, mode]
    if (a.kind === 'walk') { const cyc = a.walkT + a.pauseT; const k = Math.floor(t / cyc), r = t - k * cyc; const wt = k * a.walkT + Math.min(r, a.walkT); const moving = r < a.walkT; const p = perim(a.cx, a.cz, a.s0 + a.v * wt, a.rev);
      if (a.fest && fest.k > 0.01) { const px = plaza.x + a.fx, pz = plaza.z + a.fz; const x = p[0] + (px - p[0]) * fest.k, z = p[1] + (pz - p[1]) * fest.k; return [x, z, fest.k > 0.9 ? Math.atan2(plaza.x - x, plaza.z - z) : p[2], fest.k > 0.9 ? 0 : a.v, 0]; }
      return [p[0], p[1], p[2], moving ? a.v : 0, 0]; }
    if (a.kind === 'cross') { const off = ((a.i * 3 + a.j * 5) % 4) * 3; const tt = t + off + a.off * 0.8; const k = Math.floor(tt / CITY.CYCLE), p = tt - k * CITY.CYCLE; const dirA = (k + (a.side > 0 ? 1 : 0)) % 2 ? 1 : -1; const half = 4.3; const z = roadAt(a.j) + (a.side > 0 ? 4.9 : -4.9) + (a.off ? 0.35 : 0); const cx = roadAt(a.i); const dur = 4.6;
      let u = p < 6 ? 0 : p < 6 + dur ? (p - 6) / dur : 1; const x0 = cx + dirA * -half, x1 = cx + dirA * half; return [x0 + (x1 - x0) * u, z, Math.atan2(x1 - x0, 0), u > 0 && u < 1 ? 1.5 : 0, 0]; }
    if (a.kind === 'sit') return [a.x, a.z, a.yaw, 0, 1];
    if (a.kind === 'ring') { const ang = a.ph0 + a.w * t; const r = a.r; const x = a.cx + Math.cos(ang) * r, z = a.cz + Math.sin(ang) * r; const sp = Math.abs(a.w) * r; const hd = ang + (a.w > 0 ? Math.PI / 2 : -Math.PI / 2); return [x, z, Math.atan2(-Math.sin(ang) * Math.sign(a.w), Math.cos(ang) * Math.sign(a.w)), sp * (a.plaza && fest.k > 0.5 ? 0.3 : 1), 0]; }
    return [0, 0, 0, 0, 0]; }

  const cull = { x: 0, z: 0, r2: 1e9 }; let simT = 0;
  function update(t, dt) {
    fest.k += ((fest.on ? 1 : 0) - fest.k) * Math.min(1, dt * 0.7);
    for (let i = 0; i < N; i++) { const a = agents[i]; const [x, z, yaw, sp, sit] = state(a, t); const w = Math.min(1, sp / 1.2); const ph = a.ph + t * (3 + sp * 2.2); const sw = Math.sin(ph) * 0.7 * w; const bob = Math.abs(Math.cos(ph)) * 0.04 * w; const S = a.scale;
      ms.makeScale(S, S, S); base.makeTranslation(x, 0.17 + bob - (sit ? 0.42 : 0), z); mr.makeRotationY(yaw); base.multiply(mr).multiply(ms);
      mesh.torso.setMatrixAt(i, base); mesh.head.setMatrixAt(i, base); mesh.hair.setMatrixAt(i, base);
      const limb = (im, lx, ly, ang, rz = 0) => { m1.makeTranslation(lx, ly, 0); m2.makeRotationX(ang); m1.multiply(m2); if (rz) { mr.makeRotationZ(rz); m1.multiply(mr); } im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(base, m1)); };
      const legA = sit ? -1.45 : sw, legB = sit ? -1.45 : -sw; limb(mesh.legL, -0.13, 0.78, legA); limb(mesh.legR, 0.13, 0.78, legB);
      const arm = sit ? -0.9 + Math.sin(t * 0.9 + a.ph) * 0.15 : -sw * 0.9; limb(mesh.armL, -0.33, 1.42, arm, 0.06); limb(mesh.armR, 0.33, 1.42, sit ? -0.6 : sw * 0.9, -0.06); }
    for (const k in mesh) mesh[k].instanceMatrix.needsUpdate = true; }
  return { update, setFestival: (on) => { fest.on = on ? 1 : 0; }, setMarket: (on) => { mkt.on = on ? 1 : 0; }, count: N, dispose() { for (const k in mesh) { scene.remove(mesh[k]); mesh[k].dispose(); } for (const k in geos) geos[k].dispose(); mat.dispose(); } };
}
