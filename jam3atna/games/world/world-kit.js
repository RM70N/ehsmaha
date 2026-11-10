// جمعتنا — عدّة بناء العوالم الداخلية: مواد متعددة (خشب/معدن/زجاج/قماش/مضيء)، خامات إجرائية للأرضيات،
// دمج المجسمات بمجموعات مواد (Draw Call واحد لكل مجموعة)، بيئة انعكاس، وشخصية بشرية مفصلية.
// كل الأصول مولّدة بالكود وتُدمج وقت التحميل (لا ملفات ثنائية خارجية).

const MAT_KEYS = ['base', 'gloss', 'metal', 'glass', 'emis', 'fabric', 'rubber'];

export function makeWorldKit(THREE, quality = 'medium') {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  /** يضع الهندسة بمكانها مع لون رؤوس ومفتاح مادة. */
  function part(geo, color, mat = 'base', x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (geo.index) geo.dispose();
    e.set(rx, ry, rz, 'YXZ'); q.setFromEuler(e); m4.compose(v.set(x, y, z), q, s.set(sx, sy, sz)); g.applyMatrix4(m4);
    col.set(color); col.convertSRGBToLinear(); const n = g.attributes.position.count; const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv'); g.userData.m = mat; return g;
  }
  const box = (w, h, d, c, x = 0, y = 0, z = 0, o = {}) => part(new THREE.BoxGeometry(w, h, d), c, o.m, x, y + h / 2, z, o.ry || 0, o.rx || 0, o.rz || 0);   // y = القاعدة
  const cyl = (rt, rb, h, c, x = 0, y = 0, z = 0, o = {}) => part(new THREE.CylinderGeometry(rt, rb, h, o.seg || 14), c, o.m, x, y + h / 2, z, o.ry || 0, o.rx || 0, o.rz || 0);
  const sph = (r, c, x = 0, y = 0, z = 0, o = {}) => part(new THREE.SphereGeometry(r, o.ws || 14, o.hs || 10), c, o.m, x, y, z, 0, 0, 0, o.sx || 1, o.sy || 1, o.sz || 1);
  const tor = (r, t, c, x = 0, y = 0, z = 0, o = {}) => part(new THREE.TorusGeometry(r, t, 8, o.seg || 18), c, o.m, x, y, z, o.ry || 0, o.rx === undefined ? Math.PI / 2 : o.rx, o.rz || 0);
  const lathe = (pts, c, x = 0, y = 0, z = 0, o = {}) => part(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), o.seg || 16), c, o.m, x, y, z);
  /** صندوق بحواف مشطوفة ناعمة (مرتبة، وسائد، أسطح) — y = القاعدة. */
  function rbox(w, h, d, c, x = 0, y = 0, z = 0, o = {}) {
    const rr = Math.min(o.r === undefined ? 0.06 : o.r, w / 2 - 0.005, d / 2 - 0.005); const sh = new THREE.Shape(); const hw = w / 2, hd = d / 2;
    sh.moveTo(-hw + rr, -hd); sh.lineTo(hw - rr, -hd); sh.quadraticCurveTo(hw, -hd, hw, -hd + rr); sh.lineTo(hw, hd - rr); sh.quadraticCurveTo(hw, hd, hw - rr, hd); sh.lineTo(-hw + rr, hd); sh.quadraticCurveTo(-hw, hd, -hw, hd - rr); sh.lineTo(-hw, -hd + rr); sh.quadraticCurveTo(-hw, -hd, -hw + rr, -hd);
    const bev = Math.min(o.bev === undefined ? 0.03 : o.bev, h / 3); const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, h - bev * 2), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: Math.min(bev, rr), bevelSegments: 2, curveSegments: 4 });
    g.rotateX(-Math.PI / 2); g.translate(0, bev, 0); return part(g, c, o.m, x, y, z, o.ry || 0, 0, o.rz || 0);
  }
  const plane = (w, d, c, x, y, z, o = {}) => part(new THREE.PlaneGeometry(w, d), c, o.m, x, y, z, o.ry || 0, o.rx === undefined ? -Math.PI / 2 : o.rx, o.rz || 0);

  /** دمج متعدد المواد: يرجع {geometry, mats:[keys]} بمجموعات (groups) لكل مادة. */
  function mergeMulti(parts) {
    const by = {}; for (const p of parts) { if (!p) continue; (by[p.userData.m || 'base'] = by[p.userData.m || 'base'] || []).push(p); }
    const keys = MAT_KEYS.filter((k) => by[k]); let n = 0; for (const k of keys) for (const p of by[k]) n += p.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), cc = new Float32Array(n * 3); const g = new THREE.BufferGeometry(); let o = 0;
    for (const k of keys) { const start = o / 3; for (const p of by[k]) { pos.set(p.attributes.position.array, o); nor.set(p.attributes.normal.array, o); cc.set(p.attributes.color.array, o); o += p.attributes.position.count * 3; p.dispose(); } g.addGroup(start, o / 3 - start, keys.indexOf(k)); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); g.computeBoundingSphere(); g.computeBoundingBox();
    return { geometry: g, keys };
  }

  // ---------------------------------------------------------------- المواد المشتركة
  let env = null; const mats = {};
  function matFor(key, envMap) {
    const k = key + (envMap ? '+' : ''); if (mats[k]) return mats[k];
    const vc = { vertexColors: true }; let m;
    if (key === 'gloss') m = new THREE.MeshStandardMaterial({ ...vc, roughness: 0.28, metalness: 0.05 });
    else if (key === 'metal') m = new THREE.MeshStandardMaterial({ ...vc, roughness: 0.34, metalness: 0.85 });
    else if (key === 'glass') m = new THREE.MeshStandardMaterial({ ...vc, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.38, depthWrite: false });
    else if (key === 'emis') m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    else if (key === 'fabric') m = new THREE.MeshStandardMaterial({ ...vc, roughness: 1, metalness: 0 });
    else if (key === 'rubber') m = new THREE.MeshStandardMaterial({ ...vc, roughness: 0.92, metalness: 0 });
    else m = new THREE.MeshStandardMaterial({ ...vc, roughness: 0.72, metalness: 0.03 });
    if (envMap && 'envMap' in m) { m.envMap = envMap; m.envMapIntensity = key === 'metal' ? 1.1 : key === 'glass' ? 1.3 : key === 'gloss' ? 0.7 : 0.25; }
    return (mats[k] = m);
  }
  const matList = (keys, envMap) => keys.map((k) => matFor(k, envMap));
  function disposeMats() { for (const k in mats) { mats[k].dispose(); delete mats[k]; } if (env) { env.dispose(); env = null; } for (const k in texCache) { texCache[k].dispose(); delete texCache[k]; } }

  /** بيئة انعكاس بسيطة (سماء دافئة/أرض) عبر PMREM — مرة واحدة لكل مسرح. */
  function makeEnv(renderer, top = 0xaab6c8, mid = 0x8d96a3, bottom = 0x3d424e) {
    if (env) return env;
    try {
      const sc = new THREE.Scene(); const g = new THREE.SphereGeometry(50, 16, 12); const c = new Float32Array(g.attributes.position.count * 3); const a = new THREE.Color(top), b = new THREE.Color(bottom), m = new THREE.Color(mid), t = new THREE.Color();
      for (let i = 0; i < g.attributes.position.count; i++) { const y = g.attributes.position.getY(i) / 50; if (y > 0) t.copy(m).lerp(a, y); else t.copy(m).lerp(b, -y); c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3)); sc.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }))); [[-30, 40, 10, 0xffffff], [30, 30, -20, 0xfff2dd]].forEach(([x, y, z, k]) => { const l = new THREE.Mesh(new THREE.BoxGeometry(18, 1, 10), new THREE.MeshBasicMaterial({ color: k })); l.position.set(x, y, z); sc.add(l); });
      const pm = new THREE.PMREMGenerator(renderer); env = pm.fromScene(sc, 0.04).texture; pm.dispose(); g.dispose();
    } catch (err) { env = null; }
    return env;
  }

  // ---------------------------------------------------------------- خامات الأرضيات الإجرائية
  const texCache = {};
  function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /** خامة رمادية الدرجات قابلة للتكرار؛ اللون النهائي يأتي من لون المادة (tint). size = حجم البلاطة بالمتر. */
  function floorTex(kind, anisotropy = 4) {
    if (texCache[kind]) return texCache[kind];
    const N = quality === 'low' ? 128 : 256; const cv = document.createElement('canvas'); cv.width = cv.height = N; const x = cv.getContext('2d'); const R = rnd(kind.length * 977 + kind.charCodeAt(0));
    x.fillStyle = '#fff'; x.fillRect(0, 0, N, N); const sp = (n, a, lo = 0, hi = 255) => { for (let i = 0; i < n; i++) { const v = lo + Math.floor(R() * (hi - lo)); x.fillStyle = `rgba(${v},${v},${v},${a})`; x.fillRect(R() * N, R() * N, 1 + R() * 2, 1 + R() * 2); } };
    let size = 2, rough = 0.5;
    if (kind === 'tile') { sp(900, 0.05, 150, 255); x.strokeStyle = 'rgba(120,130,140,.55)'; x.lineWidth = 3; x.strokeRect(0, 0, N, N); x.strokeStyle = 'rgba(120,130,140,.25)'; x.lineWidth = 1; x.beginPath(); x.moveTo(N / 2, 0); x.lineTo(N / 2, N); x.moveTo(0, N / 2); x.lineTo(N, N / 2); x.stroke(); size = 2; rough = 0.22; }
    else if (kind === 'vinyl') { sp(2200, 0.1, 170, 255); sp(500, 0.12, 90, 140); x.strokeStyle = 'rgba(0,0,0,.08)'; x.lineWidth = 2; x.strokeRect(0, 0, N, N); size = 2.4; rough = 0.34; }
    else if (kind === 'epoxy') { const g = x.createRadialGradient(N / 2, N / 2, 10, N / 2, N / 2, N * 0.8); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#dcdcdc'); x.fillStyle = g; x.fillRect(0, 0, N, N); sp(600, 0.06, 190, 255); x.strokeStyle = 'rgba(0,0,0,.05)'; x.strokeRect(0, 0, N, N); size = 4; rough = 0.16; }
    else if (kind === 'wood') { for (let i = 0; i < 8; i++) { const y0 = (i * N) / 8; const v = 175 + Math.floor(R() * 80); x.fillStyle = `rgb(${v},${v - 14},${v - 34})`; x.fillRect(0, y0, N, N / 8); for (let k = 0; k < 40; k++) { x.strokeStyle = `rgba(90,60,30,${0.05 + R() * 0.07})`; x.lineWidth = 1; x.beginPath(); const yy = y0 + R() * (N / 8); x.moveTo(0, yy); x.bezierCurveTo(N * 0.3, yy + R() * 5 - 2.5, N * 0.7, yy + R() * 5 - 2.5, N, yy); x.stroke(); } x.fillStyle = 'rgba(40,25,10,.35)'; x.fillRect(0, y0, N, 2); x.fillRect(R() * N, y0, 2, N / 8); } size = 2.6; rough = 0.5; }
    else if (kind === 'stone') { x.fillStyle = '#d9d9d9'; x.fillRect(0, 0, N, N); const k = 4, cs = N / k; for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { const v = 205 + Math.floor(R() * 45); x.fillStyle = `rgb(${v},${v - 2},${v - 5})`; x.fillRect(i * cs, j * cs, cs, cs); for (let q = 0; q < 3; q++) { x.strokeStyle = `rgba(90,90,100,${0.05 + R() * 0.1})`; x.lineWidth = 1; x.beginPath(); x.moveTo(i * cs + R() * cs, j * cs); x.lineTo(i * cs + R() * cs, j * cs + cs); x.stroke(); } } x.strokeStyle = 'rgba(70,70,74,.38)'; x.lineWidth = 2; for (let i = 0; i <= k; i++) { x.beginPath(); x.moveTo(i * cs, 0); x.lineTo(i * cs, N); x.moveTo(0, i * cs); x.lineTo(N, i * cs); x.stroke(); } sp(1400, 0.07, 120, 255); size = 2.6; rough = 0.3; }
    else if (kind === 'parquet') { const k = 4, cs = N / k; for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { const v = 175 + Math.floor(R() * 75); x.fillStyle = `rgb(${v},${v - 18},${v - 40})`; x.fillRect(i * cs, j * cs, cs, cs); x.strokeStyle = 'rgba(70,40,15,.22)'; x.lineWidth = 1; for (let q = 0; q < 9; q++) { x.beginPath(); if ((i + j) % 2) { x.moveTo(i * cs, j * cs + q * cs / 9); x.lineTo(i * cs + cs, j * cs + q * cs / 9); } else { x.moveTo(i * cs + q * cs / 9, j * cs); x.lineTo(i * cs + q * cs / 9, j * cs + cs); } x.stroke(); } x.strokeStyle = 'rgba(30,15,5,.5)'; x.lineWidth = 2; x.strokeRect(i * cs, j * cs, cs, cs); } size = 2.4; rough = 0.38; }
    else if (kind === 'diamond') { x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, N, N); x.fillStyle = 'rgba(0,0,0,.28)'; for (const [cx, cy] of [[N / 2, N / 2], [0, 0], [N, 0], [0, N], [N, N]]) { x.beginPath(); x.moveTo(cx, cy - N * 0.4); x.lineTo(cx + N * 0.4, cy); x.lineTo(cx, cy + N * 0.4); x.lineTo(cx - N * 0.4, cy); x.closePath(); x.fill(); x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.moveTo(cx, cy - N * 0.22); x.lineTo(cx + N * 0.22, cy); x.lineTo(cx, cy + N * 0.22); x.lineTo(cx - N * 0.22, cy); x.closePath(); x.fill(); x.fillStyle = 'rgba(0,0,0,.28)'; } sp(5000, 0.12, 120, 255); size = 2.5; rough = 1; }
    else if (kind === 'confetti') { x.fillStyle = '#d6d6d6'; x.fillRect(0, 0, N, N); const cl = ['#ff5fa2', '#ffd23f', '#3fc1ff', '#9d6bff', '#ffffff', '#4ade80']; for (let i = 0; i < 80; i++) { x.fillStyle = cl[i % 6]; x.globalAlpha = 0.5; x.save(); x.translate(R() * N, R() * N); x.rotate(R() * 6); x.fillRect(-4, -2, 8, 4); x.restore(); } x.globalAlpha = 1; sp(2500, 0.1, 100, 220); size = 2.6; rough = 0.6; }
    else if (kind === 'carpet') { sp(5000, 0.18, 120, 255); sp(2000, 0.1, 60, 110); size = 3; rough = 1; }
    else if (kind === 'marble') { x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, N, N); for (let i = 0; i < 18; i++) { x.strokeStyle = `rgba(120,120,135,${0.06 + R() * 0.16})`; x.lineWidth = 0.6 + R() * 1.8; x.beginPath(); let px = R() * N, py = 0; x.moveTo(px, py); for (let k = 0; k < 8; k++) { px += (R() - 0.5) * 50; py += N / 8; x.lineTo(px, py); } x.stroke(); } sp(500, 0.05, 200, 255); x.strokeStyle = 'rgba(150,150,160,.35)'; x.lineWidth = 2; x.strokeRect(0, 0, N, N); size = 2.4; rough = 0.14; }
    else if (kind === 'concrete') { sp(5000, 0.12, 120, 255); for (let i = 0; i < 4; i++) { x.strokeStyle = 'rgba(70,70,70,.18)'; x.beginPath(); x.moveTo(R() * N, R() * N); x.lineTo(R() * N, R() * N); x.stroke(); } size = 3; rough = 0.88; }
    else if (kind === 'grass') { sp(7000, 0.2, 140, 255); sp(2000, 0.15, 60, 110); size = 3; rough = 1; }
    else if (kind === 'court') { sp(1500, 0.08, 150, 255); x.fillStyle = 'rgba(0,0,0,.06)'; for (let i = 0; i < N; i += N / 8) x.fillRect(i, 0, 2, N); size = 3; rough = 0.45; }
    else if (kind === 'checker') { x.fillStyle = '#fff'; x.fillRect(0, 0, N, N); x.fillStyle = '#cfcfcf'; x.fillRect(0, 0, N / 2, N / 2); x.fillRect(N / 2, N / 2, N / 2, N / 2); size = 2; rough = 0.3; }
    else { sp(1000, 0.1, 150, 255); }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = anisotropy; t.userData = { size, rough }; return (texCache[kind] = t);
  }

  /** مجموعة جسم بشري مفصلية (مفتش): فخذ/ساق/ذراع/ساعد بمفاصل، رأس بملامح، قبعة، سترة، حذاء. */
  function humanoid(opts = {}) {
    const shirt = opts.shirt || 0x2563eb, pants = opts.pants || 0x1f2937, skin = opts.skin || 0xf0c29b, hair = opts.hair || 0x2b1b12, hat = opts.hat === false ? null : (opts.hatColor || 0x1e3a8a), shoe = 0x111827;
    const root = new THREE.Group(); const mk = (parts, shadow = true) => { const { geometry, keys } = mergeMulti(parts); const m = new THREE.Mesh(geometry, matList(keys, env)); m.castShadow = shadow; m.receiveShadow = false; return m; };
    const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
    const torso = new THREE.Group(); hips.add(torso);
    const dark = (c, k) => { const o = new THREE.Color(c); o.multiplyScalar(k); return o.getHex(); };
    torso.add(mk([rbox(0.5, 0.34, 0.3, pants, 0, -0.14, 0, { r: 0.1, bev: 0.04, m: 'fabric' }), box(0.545, 0.06, 0.335, 0x2a1d14, 0, 0.02, 0, { m: 'rubber' }), box(0.1, 0.06, 0.02, 0xd9b24a, 0, 0.02, 0.17, { m: 'metal' }),
      rbox(0.54, 0.56, 0.32, shirt, 0, 0.1, 0, { r: 0.12, bev: 0.05, m: 'fabric' }), rbox(0.6, 0.2, 0.34, shirt, 0, 0.5, 0, { r: 0.1, bev: 0.05, m: 'fabric' }), rbox(0.57, 0.1, 0.345, opts.vest || 0xf59e0b, 0, 0.1, 0, { r: 0.05, bev: 0.02, m: 'fabric' }),
      box(0.04, 0.5, 0.02, dark(shirt, 0.7), 0, 0.14, 0.165, { m: 'fabric' }), ...[0.18, 0.3, 0.42].map((y) => sph(0.016, 0xf3efe6, 0, y, 0.18, { m: 'gloss' })),
      box(0.16, 0.14, 0.04, 0xffe08a, 0.15, 0.42, 0.175, { m: 'metal' }), box(0.1, 0.03, 0.05, dark(shirt, 0.6), -0.15, 0.4, 0.175, { m: 'fabric' }),
      box(0.12, 0.05, 0.1, 0xf4f1ea, -0.07, 0.68, 0.1, { ry: 0.5, m: 'fabric' }), box(0.12, 0.05, 0.1, 0xf4f1ea, 0.07, 0.68, 0.1, { ry: -0.5, m: 'fabric' }), cyl(0.085, 0.105, 0.12, skin, 0, 0.68, 0, { seg: 10 }),
      sph(0.1, shirt, -0.31, 0.64, 0, { m: 'fabric' }), sph(0.1, shirt, 0.31, 0.64, 0, { m: 'fabric' })]));
    const head = new THREE.Group(); head.position.set(0, 0.8, 0); torso.add(head);
    const irisC = opts.eye || 0x3a2a1a, brow = opts.brow || dark(hair, 0.8);
    const hp = [sph(0.215, skin, 0, 0.2, 0, { sy: 1.06, ws: 18, hs: 14 }), sph(0.2, skin, 0, 0.12, 0.01, { sy: 0.8, ws: 14, hs: 10 }),
      sph(0.048, 0xffffff, -0.082, 0.225, 0.172, { sy: 1.15, sz: 0.55 }), sph(0.048, 0xffffff, 0.082, 0.225, 0.172, { sy: 1.15, sz: 0.55 }),
      sph(0.028, irisC, -0.082, 0.222, 0.196, { sz: 0.5 }), sph(0.028, irisC, 0.082, 0.222, 0.196, { sz: 0.5 }), sph(0.014, 0x0b0a10, -0.082, 0.222, 0.206, { sz: 0.5 }), sph(0.014, 0x0b0a10, 0.082, 0.222, 0.206, { sz: 0.5 }), sph(0.007, 0xffffff, -0.074, 0.23, 0.21, { m: 'emis', sz: 0.5 }), sph(0.007, 0xffffff, 0.09, 0.23, 0.21, { m: 'emis', sz: 0.5 }),
      box(0.085, 0.02, 0.025, brow, -0.082, 0.275, 0.18, { rz: 0.12 }), box(0.085, 0.02, 0.025, brow, 0.082, 0.275, 0.18, { rz: -0.12 }),
      sph(0.032, dark(skin, 0.94), 0, 0.165, 0.215, { sz: 0.8 }), sph(0.03, 0xe58a8a, -0.13, 0.14, 0.15, { sz: 0.3, sy: 0.7, m: 'fabric' }), sph(0.03, 0xe58a8a, 0.13, 0.14, 0.15, { sz: 0.3, sy: 0.7, m: 'fabric' }),
      box(0.05, 0.014, 0.02, 0x8a3b2e, -0.03, 0.095, 0.2, { rz: -0.35 }), box(0.05, 0.014, 0.02, 0x8a3b2e, 0.03, 0.095, 0.2, { rz: 0.35 }), box(0.06, 0.012, 0.02, 0xf4eae0, 0, 0.088, 0.202),
      sph(0.045, skin, -0.215, 0.19, 0, { sy: 1.2, sz: 0.7 }), sph(0.045, skin, 0.215, 0.19, 0, { sy: 1.2, sz: 0.7 })];
    if (opts.hairStyle !== 'none') { hp.push(sph(0.225, hair, 0, 0.27, -0.025, { sy: 0.78, ws: 16, hs: 10, m: 'fabric' }), sph(0.2, hair, 0, 0.18, -0.09, { sy: 1.05, m: 'fabric' })); if (opts.hairStyle === 'long') hp.push(box(0.4, 0.34, 0.1, hair, 0, -0.1, -0.15, { m: 'fabric' }), box(0.05, 0.3, 0.1, hair, -0.2, -0.05, -0.04, { m: 'fabric' }), box(0.05, 0.3, 0.1, hair, 0.2, -0.05, -0.04, { m: 'fabric' })); else hp.push(box(0.3, 0.07, 0.07, hair, 0, 0.37, 0.12, { rx: 0.3, m: 'fabric' })); }
    if (hat) hp.push(cyl(0.225, 0.245, 0.11, hat, 0, 0.32, 0, { m: 'fabric' }), cyl(0.235, 0.235, 0.025, dark(hat, 0.6), 0, 0.34, 0, { m: 'fabric' }), box(0.34, 0.03, 0.24, dark(hat, 0.55), 0, 0.33, 0.2, { m: 'gloss' }), box(0.075, 0.06, 0.02, 0xfacc15, 0, 0.39, 0.235, { m: 'metal' }), cyl(0.17, 0.2, 0.05, hat, 0, 0.42, 0, { m: 'fabric' }));
    head.add(mk(hp));
    const limb = (upper, lower, color, len1, len2, r, handColor, x, y, isArm) => { const g = new THREE.Group(); g.position.set(x, y, 0); const g2 = new THREE.Group(); g2.position.y = -len1; g.add(mk([cyl(r, r * 0.9, len1, color, 0, -len1, 0, { seg: 10, m: 'fabric' }), sph(r * 1.05, color, 0, -len1 + 0.01, 0, { m: 'fabric' })]));
      const lo = [cyl(r * 0.9, r * 0.78, len2, lower, 0, -len2, 0, { seg: 10, m: 'fabric' })]; if (isArm) lo.push(cyl(r * 0.86, r * 0.86, 0.05, dark(lower, 0.8), 0, -len2 + 0.0, 0, { seg: 10, m: 'fabric' }), rbox(0.1, 0.1, 0.06, handColor, 0, -len2 - 0.1, 0, { r: 0.03, bev: 0.02 }), box(0.025, 0.06, 0.03, handColor, 0.055, -len2 - 0.07, 0.015, { rz: -0.3 })); else lo.push(cyl(r * 0.8, r * 0.82, 0.07, dark(lower, 0.75), 0, -len2 + 0.0, 0, { seg: 10, m: 'fabric' }));
      g2.add(mk(lo)); g.add(g2); return { g, g2 }; };
    const aL = limb(0, 0, shirt, 0.3, 0.28, 0.065, skin, -0.35, 0.64, true), aR = limb(0, 0, shirt, 0.3, 0.28, 0.065, skin, 0.35, 0.64, true); torso.add(aL.g, aR.g);
    const lL = limb(0, 0, pants, 0.46, 0.46, 0.09, shoe, -0.14, -0.1, false), lR = limb(0, 0, pants, 0.46, 0.46, 0.09, shoe, 0.14, -0.1, false);
    const shoeP = [rbox(0.15, 0.1, 0.3, shoe, 0, -0.47, 0.06, { r: 0.06, bev: 0.025, m: 'gloss' }), box(0.155, 0.03, 0.32, 0xe9e6df, 0, -0.485, 0.065, { m: 'rubber' }), sph(0.065, shoe, 0, -0.43, 0.19, { sy: 0.7, m: 'gloss' }), box(0.09, 0.015, 0.1, 0xf4f1ea, 0, -0.415, 0.1, { m: 'fabric' })];
    hips.add(lL.g, lR.g); lL.g2.add(mk(shoeP)); lR.g2.add(mk(shoeP.map((g) => g.clone())));
    root.userData.rig = { hips, torso, head, aL, aR, lL, lR, phase: Math.random() * 6, spd: 0, lean: 0, turn: 0, lastRot: 0, step: 0 };
    return root;
  }
  /** تحريك: وقوف (تنفس) / مشي / ركض حسب السرعة الفعلية، مع ميل وانعطاف وتخفيف عند التوقف. يرجع true عند خطوة (لصوت الخطوات). */
  function animateHuman(h, dt, speed, rotVel = 0) {
    const r = h.userData.rig; r.spd += (speed - r.spd) * Math.min(1, dt * 9); const w = Math.min(1, r.spd / 2.2), run = Math.max(0, Math.min(1, (r.spd - 2.6) / 2.4));
    const prev = r.phase; r.phase += dt * (3.2 + r.spd * 1.5) * (w > 0.04 ? 1 : 0.25); const sw = Math.sin(r.phase) * (0.55 + run * 0.45) * w;
    r.lL.g.rotation.x = sw; r.lR.g.rotation.x = -sw; r.lL.g2.rotation.x = Math.max(0, -Math.sin(r.phase + 0.9)) * (0.7 + run * 0.6) * w; r.lR.g2.rotation.x = Math.max(0, Math.sin(r.phase + 0.9)) * (0.7 + run * 0.6) * w;
    r.aL.g.rotation.x = -sw * 0.9; r.aR.g.rotation.x = sw * 0.9; r.aL.g2.rotation.x = -(0.15 + run * 0.9) * w; r.aR.g2.rotation.x = -(0.15 + run * 0.9) * w;
    r.hips.position.y = 0.95 - 0.02 * w + Math.abs(Math.cos(r.phase)) * 0.045 * w * (1 + run) + Math.sin(performance.now() * 0.0016) * 0.006 * (1 - w);
    r.lean += ((run * 0.22 + w * 0.06) - r.lean) * Math.min(1, dt * 6); r.torso.rotation.x = r.lean; r.turn += (Math.max(-0.4, Math.min(0.4, -rotVel * 0.12)) - r.turn) * Math.min(1, dt * 8); r.torso.rotation.z = r.turn; r.head.rotation.y = Math.sin(performance.now() * 0.0007) * 0.18 * (1 - w); r.head.rotation.x = -r.lean * 0.7;
    const stepNow = Math.floor((r.phase + Math.PI / 2) / Math.PI) !== Math.floor((prev + Math.PI / 2) / Math.PI); return stepNow && w > 0.3;
  }
  function disposeObject(o) { o.traverse((n) => { if (n.geometry) n.geometry.dispose(); }); }
  return { quality, THREE, part, box, cyl, sph, tor, lathe, rbox, plane, mergeMulti, matFor, matList, makeEnv, floorTex, humanoid, animateHuman, disposeMats, disposeObject, getEnv: () => env };
}
