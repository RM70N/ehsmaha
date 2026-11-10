// جمعتنا — عدّة Three.js المشتركة: مسرح بجودة تلقائية (Low/Medium/High)، دمج مجسمات بألوان رؤوس
// (Draw Call واحد للعناصر الثابتة)، شخصيات كرتونية متحركة، وملصقات. كل الموارد تُحرَّر عند الخروج.

/** مسرح العرض: يوقف الرسم عند إخفاء الصفحة، يخفّض الجودة تلقائيًا عند هبوط الأداء، ويحرّر GPU عند dispose. */
export function createStage(THREE, el, opts = {}) {
  const canvas = document.createElement('canvas'); el.appendChild(canvas);
  const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4, small = Math.min(innerWidth, innerHeight) < 500;
  let level = opts.quality || (() => { try { return localStorage.getItem('j3:q'); } catch (e) { return null; } })() || (mem <= 2 || cores <= 4 ? (small ? 'low' : 'medium') : small ? 'medium' : 'high');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: level === 'high', powerPreference: 'high-performance', alpha: false, stencil: false });
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(opts.fov || 45, 1, 0.5, 600);
  const stage = { renderer, scene, camera, canvas, level, auto: !opts.quality, fps: 60, onFrame: null, onQuality: null, sun: null };
  const Q = { low: { pr: 1, shadow: false }, medium: { pr: 1.5, shadow: false }, high: { pr: 2, shadow: true } };
  function apply() {
    const q = Q[stage.level]; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr) * (stage.level === 'low' ? 0.8 : 1));
    renderer.shadowMap.enabled = q.shadow; if (stage.sun) stage.sun.castShadow = q.shadow; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    resize(); if (stage.onQuality) stage.onQuality(stage.level);
  }
  function resize() { const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  stage.setQuality = (l, manual) => { if (!Q[l]) return; stage.level = l; if (manual) { stage.auto = false; try { localStorage.setItem('j3:q', l); } catch (e) {} } apply(); };
  let raf = 0, last = 0, slow = 0, acc = 0, n = 0, running = true;
  function frame(t) {
    raf = requestAnimationFrame(frame); const dt = Math.min(0.1, (t - last) / 1000 || 0.016); last = t;
    if (stage.onFrame) stage.onFrame(dt, t / 1000); renderer.render(scene, camera);
    acc += dt; n++; if (acc >= 1) { stage.fps = Math.round(n / acc); acc = 0; n = 0;
      // هبوط مستمر 3 ثوانٍ → درجة أقل، بدون إعادة تحميل
      if (stage.auto && stage.fps < (stage.level === 'high' ? 40 : 24)) { if (++slow >= 3) { slow = 0; if (stage.level === 'high') stage.setQuality('medium'); else if (stage.level === 'medium') stage.setQuality('low'); } } else slow = 0; }
  }
  const onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; running = false; } else if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', onVis); window.addEventListener('resize', resize);
  stage.start = () => { apply(); last = performance.now(); raf = requestAnimationFrame(frame); };
  stage.info = () => ({ fps: stage.fps, level: stage.level, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geoms: renderer.info.memory.geometries, tex: renderer.info.memory.textures });
  stage.dispose = () => {
    cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('resize', resize);
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); } });
    renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) {} canvas.remove();
  };
  return stage;
}

/** إضاءة موحّدة: محيطية + شمس بظل واحد فقط (حد الأضواء ذات الظلال = 1). */
export function addLights(THREE, stage, o = {}) {
  const hemi = new THREE.HemisphereLight(o.sky || 0xcfd8ff, o.ground || 0x2a1f47, o.amb || 0.6); stage.scene.add(hemi);
  const sun = new THREE.DirectionalLight(o.sun || 0xfff1dd, o.int || 0.95); sun.position.set(o.x || 40, o.y || 70, o.z || 30);
  const s = o.size || 70; sun.shadow.camera.left = -s; sun.shadow.camera.right = s; sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s; sun.shadow.camera.far = 220; sun.shadow.mapSize.set(1536, 1536); sun.shadow.bias = -0.0006;
  stage.scene.add(sun); stage.sun = sun; return { hemi, sun };
}

// ---------------------------------------------------------------- بناء ودمج المجسمات
export function kit(THREE) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const col = new THREE.Color();
  /** يحوّل geometry لنسخة غير مفهرسة موضوعة بمكانها مع لون رؤوس. */
  function part(geo, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (geo.index) geo.dispose();
    e.set(rx, ry, rz); q.setFromEuler(e); m4.compose(v.set(x, y, z), q, s.set(sx, sy, sz)); g.applyMatrix4(m4);
    col.set(color).convertSRGBToLinear(); const n = g.attributes.position.count; const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv'); return g;
  }
  const box = (w, h, d, color, x, y, z, ry, rx, rz) => part(new THREE.BoxGeometry(w, h, d), color, x, y, z, ry, rx, rz);
  const cyl = (rt, rb, h, color, x, y, z, seg = 12, rx, rz) => part(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, 0, rx, rz);
  const sph = (r, color, x, y, z, sx, sy, sz) => part(new THREE.SphereGeometry(r, 12, 9), color, x, y, z, 0, 0, 0, sx, sy, sz);
  const cone = (r, h, color, x, y, z, seg = 10) => part(new THREE.ConeGeometry(r, h, seg), color, x, y, z);
  /** صندوق بحواف ناعمة (شكل كرتوني) — مربع مشطوف مبثوق. */
  function rbox(w, h, d, color, x = 0, y = 0, z = 0, ry = 0, r = 0.12) {
    const rr = Math.min(r, w / 2 - 0.01, d / 2 - 0.01); const sh = new THREE.Shape(); const hw = w / 2, hd = d / 2;
    sh.moveTo(-hw + rr, -hd); sh.lineTo(hw - rr, -hd); sh.quadraticCurveTo(hw, -hd, hw, -hd + rr); sh.lineTo(hw, hd - rr); sh.quadraticCurveTo(hw, hd, hw - rr, hd); sh.lineTo(-hw + rr, hd); sh.quadraticCurveTo(-hw, hd, -hw, hd - rr); sh.lineTo(-hw, -hd + rr); sh.quadraticCurveTo(-hw, -hd, -hw + rr, -hd);
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelThickness: Math.min(0.06, h / 4), bevelSize: Math.min(0.06, rr), bevelSegments: 2, curveSegments: 4 });
    g.rotateX(-Math.PI / 2); g.translate(0, -h / 2, 0); return part(g, color, x, y, z, ry);
  }
  function merge(parts) {
    let n = 0; for (const p of parts) n += p.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), c = new Float32Array(n * 3); let o = 0;
    for (const p of parts) { pos.set(p.attributes.position.array, o); nor.set(p.attributes.normal.array, o); c.set(p.attributes.color.array, o); o += p.attributes.position.count * 3; p.dispose(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.computeBoundingSphere(); return g;
  }
  let shared = null;
  const mat = () => shared || (shared = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.04 }));
  function mesh(parts, o = {}) { const m = new THREE.Mesh(merge(parts), o.material || mat()); m.castShadow = o.cast !== false; m.receiveShadow = o.receive !== false; return m; }

  /** شخصية كرتونية: جسم ورأس وأطراف منفصلة للتحريك (مشي/وقوف/التفات) — 6 مجسمات صغيرة. */
  function character(shirt = 0x8b5cf6, o = {}) {
    const g = new THREE.Group(); const skin = o.skin || 0xf6c9a0, pants = o.pants || 0x2b2148; const sc = o.scale || 1;
    const body = mesh([cyl(0.3, 0.36, 0.62, shirt, 0, 0.95, 0, 14), sph(0.3, shirt, 0, 1.26, 0, 1, 0.55, 1), sph(0.36, shirt, 0, 0.64, 0, 1, 0.4, 1)]);
    const headParts = [sph(0.31, skin, 0, 1.72, 0), sph(0.05, 0x1a1230, -0.11, 1.75, 0.27), sph(0.05, 0x1a1230, 0.11, 1.75, 0.27), box(0.16, 0.035, 0.03, 0x7a3b2e, 0, 1.62, 0.29)];
    if (o.hat) headParts.push(cyl(0.2, 0.3, 0.2, o.hatColor || 0x7c3aed, 0, 1.98, 0, 12), cyl(0.38, 0.38, 0.05, o.hatColor || 0x7c3aed, 0, 1.9, 0, 14));
    else headParts.push(sph(0.32, o.hair || 0x2b1b12, 0, 1.8, -0.04, 1, 0.75, 1));
    const head = mesh(headParts);
    const limb = (color, len, r, x, y) => { const m = mesh([cyl(r, r * 0.85, len, color, 0, -len / 2, 0, 8), sph(r * 1.05, color === pants ? 0x1a1230 : skin, 0, -len, 0)]); m.position.set(x, y, 0); return m; };
    const armL = limb(shirt, 0.5, 0.09, -0.4, 1.3), armR = limb(shirt, 0.5, 0.09, 0.4, 1.3), legL = limb(pants, 0.55, 0.12, -0.15, 0.58), legR = limb(pants, 0.55, 0.12, 0.15, 0.58);
    g.add(body, head, armL, armR, legL, legR); g.scale.setScalar(sc); g.userData.rig = { body, head, armL, armR, legL, legR, phase: Math.random() * 6, speed: 0 };
    return g;
  }
  /** تحريك الشخصية حسب سرعتها الفعلية: دورة المشي تتناسب مع السرعة، مع انتقال ناعم للوقوف. */
  function animate(ch, dt, speed) {
    const r = ch.userData.rig; r.speed += (speed - r.speed) * Math.min(1, dt * 10); const k = Math.min(1, r.speed / 3); r.phase += dt * (4 + r.speed * 2.2) * (k > 0.05 ? 1 : 0.25);
    const sw = Math.sin(r.phase) * 0.9 * k; r.legL.rotation.x = sw; r.legR.rotation.x = -sw; r.armL.rotation.x = -sw * 0.8; r.armR.rotation.x = sw * 0.8;
    r.body.position.y = Math.abs(Math.cos(r.phase)) * 0.05 * k + Math.sin(r.phase * 0.25) * 0.012 * (1 - k); r.head.position.y = r.body.position.y; r.head.rotation.y = Math.sin(r.phase * 0.13) * 0.25 * (1 - k);
  }
  /** ملصق نصي (اسم لاعب/علامة) كـ Sprite من Canvas. */
  function label(text, o = {}) {
    const c = document.createElement('canvas'); const x = c.getContext('2d'); const fs = 44; x.font = `800 ${fs}px Cairo, Tajawal, sans-serif`; const w = Math.ceil(x.measureText(text).width) + 44;
    c.width = w; c.height = 72; x.font = `800 ${fs}px Cairo, Tajawal, sans-serif`; x.fillStyle = o.bg || 'rgba(12,7,26,.86)'; const rr = 22; x.beginPath(); x.moveTo(rr, 0); x.arcTo(w, 0, w, 72, rr); x.arcTo(w, 72, 0, 72, rr); x.arcTo(0, 72, 0, 0, rr); x.arcTo(0, 0, w, 0, rr); x.fill();
    x.fillStyle = o.color || '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl'; x.fillText(text, w / 2, 38);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: o.depthTest !== false ? true : false, transparent: true })); const h = o.h || 0.7; sp.scale.set(h * w / 72, h, 1); sp.renderOrder = 5; return sp;
  }
  return { part, box, rbox, cyl, sph, cone, merge, mesh, mat, character, animate, label };
}

/** عنصر واجهة مساعد. */
export function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
export const fmtTime = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
