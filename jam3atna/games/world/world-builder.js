// جمعتنا — بنّاء العالم ثلاثي الأبعاد من تعريف الخريطة: أرضيات بخامات، جدران بحواف وأفاريز، أسقف بإنارة،
// أبواب مفصلية/منزلقة، نوافذ، أثاث صلب، ديكور، أغراض قابلة للتنكر (Instancing)، وتصادم كاميرا.
import { WH, LH, KINDS } from '../../shared/prop-core.js';
import { levelY } from '../../shared/prop-sim.js';
import { common } from './assets/common.js';

const ceil = (map) => (map.theme && map.theme.ceil) || 0xf5f7f8;
const WALLMOUNT = new Set(['window', 'winCurtain', 'clock', 'painting', 'sign', 'doorNum', 'tv', 'poster2', 'mirror', 'menu', 'board', 'vent', 'shelfw', 'pictureFrame']);

export async function loadAssets(K, mapId) {
  let mod = null; try { mod = await import(`./assets/${mapId}.js`); } catch (e) { mod = null; }
  const own = mod && mod[mapId] ? mod[mapId](K) : { kinds: {}, solids: {}, deco: {} }; const com = common(K);
  return { kinds: Object.assign({}, com.kinds, own.kinds), solids: own.solids || {}, deco: Object.assign({}, com.deco || {}, own.deco || {}) };
}

export function buildWorld({ THREE, K, kit, map, assets, scene, quality, renderer }) {
  const env = K.makeEnv(renderer, map.theme.envTop || 0xaab6c8, map.theme.envMid || 0x8d96a3, map.theme.envBot || 0x3d424e); const th = map.theme; const own = [];            // own: هندسات تُحرَّر
  const root = new THREE.Group(); root.name = 'world-' + map.id; scene.add(root);
  const lvGroups = [new THREE.Group(), new THREE.Group()]; lvGroups.forEach((g) => root.add(g));
  const ceilings = []; const anims = []; const doorsDyn = []; const labels = [];
  const yOf = (lv) => (lv >= 1 ? LH : 0); const grp = (lv) => lvGroups[lv >= 1 ? 1 : 0];
  const addMesh = (parts, lv, o = {}) => { if (!parts.length) return null; const { geometry, keys } = K.mergeMulti(parts); own.push(geometry); const m = new THREE.Mesh(geometry, K.matList(keys, env)); m.castShadow = !!o.cast; m.receiveShadow = o.receive !== false; m.frustumCulled = o.cull !== false; m.position.y = yOf(lv); grp(lv).add(m); return m; };
  const wallCol = th.wall || 0xeeeeee, baseCol = th.base || 0xb0b0b0, trimCol = th.trim || 0x888888, trimWhite = th.crown || 0xffffff;

  // ---------- أرضيات
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(map.w + 40, map.d + 40), new THREE.MeshStandardMaterial({ color: th.ground || 0x555566, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06; ground.receiveShadow = true; root.add(ground); own.push(ground.geometry);
  const slabParts = [[], []];
  for (const r of map.rooms) {
    const W = r.x1 - r.x0, D = r.z1 - r.z0; const tex = K.floorTex(r.floor, renderer.capabilities.getMaxAnisotropy ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 2); const size = tex.userData.size;
    const g = new THREE.PlaneGeometry(W, D); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / size, uv.getY(i) * D / size);
    const mat = new THREE.MeshStandardMaterial({ map: tex, color: new THREE.Color(r.c1).multiplyScalar(th.floorMul || 0.78), roughness: tex.userData.rough, metalness: 0.04, envMap: env, envMapIntensity: tex.userData.rough < 0.3 ? 0.55 : 0.15 });
    const m = new THREE.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.set((r.x0 + r.x1) / 2, yOf(r.lv) + 0.004, (r.z0 + r.z1) / 2); m.receiveShadow = true; grp(r.lv).add(m); own.push(g); own.push(mat);
    if (r.lv >= 1) slabParts[1].push(K.box(W, 0.3, D, 0x8a8a90, (r.x0 + r.x1) / 2, -0.3, (r.z0 + r.z1) / 2)); // سماكة بلاطة الطابق (ترى من تحت)
    if (!r.noCeiling) { // سقف يُرى من الداخل فقط (وجهه للأسفل): لا يحجب كاميرا المضيف العلوية
      const cg = new THREE.PlaneGeometry(W, D); const cm = new THREE.MeshStandardMaterial({ color: r.ceil || ceil(map), roughness: 0.95, side: THREE.FrontSide }); const c = new THREE.Mesh(cg, cm); c.rotation.x = Math.PI / 2; c.position.set((r.x0 + r.x1) / 2, yOf(r.lv) + WH, (r.z0 + r.z1) / 2); grp(r.lv).add(c); ceilings.push(c); own.push(cg, cm);
      if (th.panels !== false && W > 3 && D > 3) { const lp = []; const nx = Math.max(1, Math.floor(W / 4.5)), nz = Math.max(1, Math.floor(D / 4.5)); for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const px = r.x0 + (i + 0.5) * W / nx, pz = r.z0 + (j + 0.5) * D / nz; lp.push(K.box(1.1, 0.05, 0.5, r.lamp || th.lamp || 0xffffff, px, WH - 0.05, pz, { m: 'emis' }), K.box(1.2, 0.03, 0.6, 0xdddddd, px, WH - 0.02, pz, { m: 'metal' })); } const lm = addMesh(lp, r.lv, { cast: false, receive: false }); if (lm) ceilings.push(lm); }
    }
  }
  if (slabParts[1].length) addMesh(slabParts[1], 1, { cast: true });

  // ---------- جدران
  const doorBy = map.doors;
  for (const w of map.walls) {
    const along = w.w >= w.d; const L = along ? w.w : w.d, Tk = along ? w.d : w.w; const lv = w.lv; const h = w.h || WH; const col = w.c || wallCol; const full = [], low = [];
    const mk = (parts, bw, bh, bd, c, x, y, z, m) => parts.push(along ? K.box(bw, bh, bd, c, x, y, z, { m }) : K.box(bd, bh, bw, c, z, y, x, { m }));
    if (w.glass) { mk(full, L, h, Tk * 0.4, 0xbfe6f5, 0, 0, 0, 'glass'); mk(full, L, 0.08, Tk, 0x9aa5ad, 0, 0, 0, 'metal'); mk(full, L, 0.08, Tk, 0x9aa5ad, 0, h - 0.08, 0, 'metal'); }
    else {
      mk(full, L, h, Tk, col, 0, 0, 0, 'base'); mk(full, L + 0.02, 0.14, Tk + 0.05, baseCol, 0, 0, 0, 'gloss'); if (th.band !== false) mk(full, L + 0.01, 0.1, Tk + 0.03, trimCol, 0, 1.05, 0, 'gloss'); mk(full, L + 0.02, 0.1, Tk + 0.08, trimWhite, 0, h - 0.1, 0, 'base');
      mk(low, L, 1.0, Tk, col, 0, 0, 0, 'base'); mk(low, L + 0.02, 0.14, Tk + 0.05, baseCol, 0, 0, 0, 'gloss'); mk(low, L + 0.02, 0.06, Tk + 0.06, trimWhite, 0, 1.0, 0, 'base');
    }
    for (const p of full) p.translate(w.x, 0, w.z); for (const p of low) p.translate(w.x, 0, w.z); w._full = full; w._low = low;
  }
  const buildWallMeshes = (key, lvNo) => { const parts = []; for (const w of map.walls) { if (!(w.lv === lvNo || w.lv === 2)) continue; for (const g of w[key] || []) parts.push(g.clone()); } return parts; };
  // الأبواب: عتبات علوية (lintel) + إطارات
  const lintel = [[], []], frames = [[], []];
  for (const d of doorBy) { const lvs = d.lv === 2 ? [0, 1] : [d.lv]; for (const L of lvs) { const along = d.ax === 'x'; const hh = d.t === 'double' || d.t === 'glass' ? 2.5 : 2.2; const addB = (arr, bw, bh, bd, c, x, y, z, m) => arr.push(along ? K.box(bw, bh, bd, c, x, y, z, { m }) : K.box(bd, bh, bw, c, x, y, z, { m }));
      if (hh < WH) addB(lintel[L], d.w + 0.1, WH - hh, 0.4, wallCol, d.x, hh, d.z, 'base');
      addB(frames[L], 0.09, hh, 0.5, th.doorFrame || 0xf4f4f4, along ? d.x - d.w / 2 + 0.045 : d.x, 0, along ? d.z : d.z - d.w / 2 + 0.045, 'gloss');
      addB(frames[L], 0.09, hh, 0.5, th.doorFrame || 0xf4f4f4, along ? d.x + d.w / 2 - 0.045 : d.x, 0, along ? d.z : d.z + d.w / 2 - 0.045, 'gloss');
      addB(frames[L], d.w, 0.09, 0.5, th.doorFrame || 0xf4f4f4, d.x, hh - 0.09, d.z, 'gloss'); addB(frames[L], d.w - 0.1, 0.012, 0.46, th.threshold || 0x9aa5ad, d.x, 0, d.z, 'metal'); } }
  const fullMeshes = [], lowMeshes = [];
  for (const L of [0, 1]) { const fm = addMesh(buildWallMeshes('_full', L).concat(lintel[L]), L, { cast: true }); if (fm) fullMeshes.push(fm); const lm = addMesh(buildWallMeshes('_low', L), L, { cast: false }); if (lm) { lm.visible = false; lowMeshes.push(lm); } addMesh(frames[L], L, { cast: false }); }

  // ---------- مجسمات صلبة + ديكور
  const statics = [[], []];
  const wallNear = (x, z) => { let best = null, bd = 0.7; for (const w of map.walls) { const dx = Math.max(Math.abs(x - w.x) - w.w / 2, 0), dz = Math.max(Math.abs(z - w.z) - w.d / 2, 0); const d = Math.hypot(dx, dz); if (d < bd) { bd = d; best = w; } } return best; };
  const place = (parts, x, y, z, ry, L) => { const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1)); for (const p of parts) { p.applyMatrix4(m); statics[L >= 1 ? 1 : 0].push(p); } };
  for (const s of map.solids) {
    const fn = assets.solids[s.style]; const L = s.lv === 2 ? 0 : s.lv; let parts;
    try { parts = fn ? fn({ w: s.w, d: s.d, h: s.h, c: s.c, med: s.med }) : [K.box(s.w, s.h, s.d, s.c || 0x8888aa, 0, 0, 0)]; } catch (e) { parts = [K.box(s.w, s.h, s.d, 0xaa4444, 0, 0, 0)]; }
    place(parts, s.x, 0, s.z, 0, L);
  }
  const decoMeshes = [];
  for (const d of map.deco) {
    const L = d.lv === 2 ? 0 : d.lv; const st = d.style;
    if (st === 'rug') { const g = []; g.push(K.box(d.w, 0.012, d.d, d.c2 || 0x777777, 0, 0.004, 0, { m: 'fabric' }), K.box(d.w - 0.3, 0.016, d.d - 0.3, d.c || 0x999999, 0, 0.004, 0, { m: 'fabric' }), K.box(d.w - 0.7, 0.02, d.d - 0.7, d.c2 || 0x777777, 0, 0.004, 0, { m: 'fabric' })); place(g, d.x, 0, d.z, d.rot || 0, L); continue; }
    if (st === 'strip') { place([K.box(d.x1 - d.x0, 0.006, d.z1 - d.z0, d.c || 0x4fb3d1, (d.x0 + d.x1) / 2, 0.008, (d.z0 + d.z1) / 2, { m: 'gloss' })], 0, 0, 0, 0, L); continue; }
    if (st === 'light') { const m = new THREE.Mesh(new THREE.CircleGeometry(d.r || 4, 28), new THREE.MeshBasicMaterial({ color: d.c || 0xffffff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(d.x, yOf(L) + 0.02, d.z); grp(L).add(m); own.push(m.geometry, m.material); continue; }
    const fn = assets.deco[st]; if (!fn) continue; let parts; try { parts = fn(d); } catch (e) { continue; }
    let x = d.x, z = d.z, ry = d.rot || 0; const y = d.y || 0;
    if (WALLMOUNT.has(st)) { const w = wallNear(d.x, d.z); if (w) { const along = w.w >= w.d; const n = along ? Math.sign(d.z - w.z) || 1 : Math.sign(d.x - w.x) || 1; if (along) { z = w.z + n * (w.d / 2 + 0.012); ry = n > 0 ? 0 : Math.PI; } else { x = w.x + n * (w.w / 2 + 0.012); ry = n > 0 ? Math.PI / 2 : -Math.PI / 2; } } }
    place(parts, x, y, z, ry, L);
    // عناصر متحركة بسيطة: شاشات/تلفزيون/ساعة
    if (d.anim || st === 'clock') { const wp = new THREE.Vector3(x, yOf(L) + y, z); const nrm = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)); if (st === 'clock') { const mk = (len, wd, c) => { const g = new THREE.Mesh(new THREE.BoxGeometry(wd, len, 0.012), new THREE.MeshBasicMaterial({ color: c })); g.geometry.translate(0, len / 2, 0); const gg = new THREE.Group(); gg.add(g); gg.position.copy(wp).addScaledVector(nrm, 0.07); gg.rotation.y = ry; grp(L).add(gg); own.push(g.geometry, g.material); return gg; }; anims.push({ t: 'clock', h: mk(0.14, 0.02, 0x222222), m: mk(0.2, 0.012, 0x222222), x, z, lv: L }); }
      else { const w = st === 'tv' ? 0.82 : (d.w || 0.8) - 0.1, hh = st === 'tv' ? 0.44 : 0.3; const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshBasicMaterial({ color: d.c || 0x66ccff, toneMapped: false })); pl.position.copy(wp).addScaledVector(nrm, 0.04); if (st === 'screen') { pl.position.y += 0.08; pl.position.addScaledVector(nrm, 0.02); } pl.rotation.y = ry; grp(L).add(pl); own.push(pl.geometry, pl.material); anims.push({ t: d.anim, mesh: pl, x, z, lv: L, base: d.c || 0x66ccff, seed: Math.random() * 9 }); } }
  }
  for (const L of [0, 1]) { const sm = addMesh(statics[L], L, { cast: true }); if (sm) sm.userData.static = true; }

  // ---------- تسميات اللافتات
  for (const l of map.labels) { const sp = kit.label(l.text, { h: 0.5, bg: 'rgba(20,28,36,.78)', color: l.c || '#ffffff' }); sp.position.set(l.x, yOf(l.lv) + (l.y || 3.0), l.z); grp(l.lv).add(sp); labels.push(sp); own.push(sp.material.map, sp.material); }

  // ---------- أبواب ديناميكية (مفصلية/منزلقة)
  for (const d of doorBy) {
    const L = d.lv === 2 ? 0 : d.lv; const along = d.ax === 'x'; const hh = d.t === 'double' || d.t === 'glass' ? 2.5 : 2.2; const leaves = []; const mats = (k) => K.matFor(k, env); const g = new THREE.Group(); g.position.set(d.x, yOf(L), d.z); if (!along) g.rotation.y = Math.PI / 2; grp(L).add(g);
    const wood = th.door || 0xb98b5e; const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.14), mats('metal')); const mkLeaf = (w0, glass) => { const mp = glass ? [K.box(w0, hh - 0.1, 0.03, 0xbfe6f5, 0, 0.05, 0, { m: 'glass' }), K.box(w0, 0.06, 0.05, 0x9aa5ad, 0, 0.05, 0, { m: 'metal' }), K.box(w0, 0.06, 0.05, 0x9aa5ad, 0, hh - 0.11, 0, { m: 'metal' }), K.box(0.05, hh - 0.1, 0.05, 0x9aa5ad, -w0 / 2 + 0.025, 0.05, 0, { m: 'metal' }), K.box(0.05, hh - 0.1, 0.05, 0x9aa5ad, w0 / 2 - 0.025, 0.05, 0, { m: 'metal' })]
      : [K.rbox(w0, hh - 0.08, 0.05, wood, 0, 0.04, 0, { r: 0.015, bev: 0.01, m: 'gloss' }), K.box(w0 * 0.6, 0.3, 0.056, 0xdfe9ee, 0, 1.45, 0, { m: 'glass' }), K.box(0.04, 0.04, 0.12, 0xc5ccd3, w0 / 2 - 0.1, 1.0, 0.04, { m: 'metal' })]; const { geometry, keys } = K.mergeMulti(mp); own.push(geometry); const m = new THREE.Mesh(geometry, K.matList(keys, env)); m.castShadow = false; return m; };
    if (d.t === 'door') { const w0 = d.w - 0.12; const piv = new THREE.Group(); piv.position.x = -d.w / 2 + 0.06; const lf = mkLeaf(w0, false); lf.position.x = w0 / 2; piv.add(lf); g.add(piv); doorsDyn.push({ d, L, kind: 'hinge', piv, o: 0 }); }
    else if (d.t === 'double') { const w0 = d.w / 2 - 0.08; const a = new THREE.Group(), b = new THREE.Group(); a.position.x = -d.w / 2 + 0.06; b.position.x = d.w / 2 - 0.06; const la = mkLeaf(w0, true); la.position.x = w0 / 2; const lb = mkLeaf(w0, true); lb.position.x = -w0 / 2; a.add(la); b.add(lb); g.add(a, b); doorsDyn.push({ d, L, kind: 'double', a, b, o: 0 }); }
    else if (d.t === 'glass') { const w0 = d.w / 2 - 0.04; const a = mkLeaf(w0, true), b = mkLeaf(w0, true); a.position.x = -w0 / 2 - 0.02; b.position.x = w0 / 2 + 0.02; g.add(a, b); doorsDyn.push({ d, L, kind: 'slide', a, b, w0, o: 0, ax: -w0 / 2 - 0.02, bx: w0 / 2 + 0.02 }); }
    own.push(handle.geometry);
  }

  // ---------- مسبح الأغراض (Instancing)
  const geoCache = new Map(); const pools = new Map();
  const fallbackKind = (kind) => { const k = KINDS[kind] || { r: 0.4, h: 0.8 }; return [K.rbox(k.r * 1.6, k.h, k.r * 1.6, 0x9a8f80, 0, 0, 0, { r: 0.05 })]; };
  function geoFor(kind) { let g = geoCache.get(kind); if (!g) { let parts; try { parts = assets.kinds[kind] ? assets.kinds[kind]() : fallbackKind(kind); } catch (e) { parts = fallbackKind(kind); } g = K.mergeMulti(parts); geoCache.set(kind, g); own.push(g.geometry); } return g; }
  function poolFor(kind, lv) {
    const key = kind + '|' + (lv >= 1 ? 1 : 0); let p = pools.get(key); if (p) return p;
    const cap = 24; const { geometry, keys } = geoFor(kind); const mesh = new THREE.InstancedMesh(geometry, K.matList(keys, env), cap); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.count = 0; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.userData.pool = true;
    p = { mesh, cap, free: [], used: 0, kind, lv: lv >= 1 ? 1 : 0 }; grp(lv).add(mesh); pools.set(key, p); return p;
  }
  function growPool(p) { const old = p.mesh; const ncap = p.cap * 2; const mesh = new THREE.InstancedMesh(old.geometry, old.material, ncap); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < p.used; i++) { const m = new THREE.Matrix4(); old.getMatrixAt(i, m); mesh.setMatrixAt(i, m); } mesh.count = p.used; grp(p.lv).add(mesh); grp(p.lv).remove(old); old.dispose(); p.mesh = mesh; p.cap = ncap; for (const h of handles) if (h.pool === p) h.mesh = mesh; }
  const handles = new Set(); const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _z = new THREE.Vector3(0, 0, 0);
  /** إضافة غرض: يرجع مقبض {set(x,y,z,rot,wobZ,wobX), remove(), kind}. */
  function addProp(kind, lv, x, z, rot) {
    const p = poolFor(kind, lv); let idx; if (p.free.length) idx = p.free.pop(); else { if (p.used >= p.cap) growPool(p); idx = p.used++; p.mesh.count = p.used; }
    const h = { pool: p, mesh: p.mesh, idx, kind, lv, alive: true };
    h.set = (px, py, pz, ry, wz = 0, wx = 0) => { _e.set(wx, ry, wz, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p.set(px, py + yOf(lv), pz), _q, _s); h.pool.mesh.setMatrixAt(h.idx, _m); h.pool.mesh.instanceMatrix.needsUpdate = true; };
    h.remove = () => { if (!h.alive) return; h.alive = false; _m.compose(_p.set(0, -50, 0), _q.identity(), _z); h.pool.mesh.setMatrixAt(h.idx, _m); h.pool.mesh.instanceMatrix.needsUpdate = true; h.pool.free.push(h.idx); handles.delete(h); };
    handles.add(h); h.set(x, 0, z, rot); return h;
  }

  // ---------- كاميرا: قصّ المسار قبل اختراق جدار أو مجسم طويل
  const camBoxes = [[], []]; const addBox = (o, L) => camBoxes[L >= 1 ? 1 : 0].push([o.x - o.w / 2 - 0.35, o.z - o.d / 2 - 0.35, o.x + o.w / 2 + 0.35, o.z + o.d / 2 + 0.35]);
  for (const w of map.walls) { if ((w.h || WH) < 2.2) continue; if (w.lv === 2) { addBox(w, 0); addBox(w, 1); } else addBox(w, w.lv); }
  for (const s of map.solids) if (s.h >= 1.9) { if (s.lv === 2) { addBox(s, 0); addBox(s, 1); } else addBox(s, s.lv); }
  function camT(px, pz, tx, tz, lv) { // أقرب تقاطع للقطعة (px,pz)→(tx,tz) مع صناديق الجدران؛ يرجع t∈[0,1]
    let best = 1; const dx = tx - px, dz = tz - pz; for (const b of camBoxes[lv >= 1 ? 1 : 0]) {
      if (px > b[0] && px < b[2] && pz > b[1] && pz < b[3]) continue; // نقطة الارتكاز داخل صندوق (قريبة جدًا من جدار): تجاهل
      let t0 = 0, t1 = best; for (const [p0, d0, mn, mx] of [[px, dx, b[0], b[2]], [pz, dz, b[1], b[3]]]) { if (Math.abs(d0) < 1e-6) { if (p0 < mn || p0 > mx) { t0 = 2; break; } } else { let a = (mn - p0) / d0, c = (mx - p0) / d0; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) break; } }
      if (t0 <= t1 && t0 < best) best = t0; } return Math.max(0.12, best);
  }

  // ---------- تحديث دوري: أبواب، شاشات، ساعات (فقط ما هو قريب من الكاميرا)
  function update(dt, t, camPos, ents, lvView) {
    for (const d of doorsDyn) { const ref = d.d; if (Math.abs(ref.x - camPos.x) > 34 || Math.abs(ref.z - camPos.z) > 34) continue; let near = false; for (const e of ents) { if ((ref.lv === 2 || e[2] === ref.lv || e[2] === undefined) && Math.hypot(e[0] - ref.x, e[1] - ref.z) < (d.kind === 'slide' ? 3.0 : 2.1)) { near = true; break; } }
      d.o += ((near ? 1 : 0) - d.o) * Math.min(1, dt * 7); const o = d.o; if (d.kind === 'hinge') d.piv.rotation.y = -o * 1.65; else if (d.kind === 'double') { d.a.rotation.y = -o * 1.5; d.b.rotation.y = o * 1.5; } else { d.a.position.x = d.ax - o * d.w0 * 0.92; d.b.position.x = d.bx + o * d.w0 * 0.92; } }
    if (quality !== 'low') for (const a of anims) { if (Math.abs(a.x - camPos.x) > 30 || Math.abs(a.z - camPos.z) > 30) continue;
      if (a.t === 'clock') { const s = Date.now() / 1000; a.m.rotation.z = -((s / 60) % 60) / 60 * 6.283; a.h.rotation.z = -((s / 3600) % 12) / 12 * 6.283; }
      else if (a.t === 'tv') { const k = t * 0.4 + a.seed; a.mesh.material.color.setHSL((k % 1), 0.55, 0.55 + Math.sin(t * 2 + a.seed) * 0.08); }
      else if (a.t === 'blink') { const on = (Math.floor(t * 1.5 + a.seed) % 5) !== 0; a.mesh.material.color.setHex(on ? a.base : 0x13202a); } }
  }
  /** وضع العرض: لاعب (جدران كاملة وأسقف، طابقه فقط) أو مضيف (جدران منخفضة بلا أسقف، طابق واحد في كل مرة). */
  function setView({ host = false, lv = 0 }) {
    lvGroups[0].visible = host ? lv === 0 : lv === 0; lvGroups[1].visible = lv === 1; if (host && lv === 1) lvGroups[0].visible = false;
    fullMeshes.forEach((m) => { m.visible = !host; }); lowMeshes.forEach((m) => { m.visible = host; }); ceilings.forEach((c) => { c.visible = !host; });
  }
  function dispose() { scene.remove(root); for (const o of own) { try { o.dispose && o.dispose(); } catch (e) {} } pools.forEach((p) => p.mesh.dispose()); geoCache.clear(); pools.clear(); handles.clear(); root.traverse((n) => { if (n.geometry) n.geometry.dispose(); }); }
  return { root, lvGroups, addProp, update, setView, camT, dispose, ceilings, anims, doorsDyn, levelY: (x, z, lv) => levelY(map, x, z, lv) };
}
