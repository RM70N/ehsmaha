// جمعتنا — مين المتنكر؟ (عميل 3D داخلي). الخادم هو المرجع الرسمي؛ هنا عرض + تنبؤ محلي بالحركة.
// كاميرا منظور ثالث قريبة، تحكم لمس (عصا يسار + سحب يمين) وماوس/لوحة مفاتيح، عوالم معمارية كاملة بطوابق.
// السرّية: المفتش لا يملك أي معلومة تميّز المتنكر عن الأثاث؛ لا أسماء فوق الأغراض.
import { MAPS, KINDS, PROP, stepMove, levelY, updateLevel, LH, WH } from '../shared/prop-sim.js';
import { createStage, kit, h, fmtTime, esc } from '../shared/three-kit.js';
import { makeWorldKit } from './world/world-kit.js';
import { loadAssets, buildWorld } from './world/world-builder.js';
import { sfx, ambience, stopAmb } from '../shared/audio.js';

export function mount(ctx) {
  const { THREE, el, net, isHost } = ctx; const KT = kit(THREE);
  const stage = createStage(THREE, el, { fov: 62 }); const { scene, camera } = stage; const K = makeWorldKit(THREE, stage.level);
  stage.renderer.toneMapping = THREE.ACESFilmicToneMapping; stage.renderer.toneMappingExposure = 0.84;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888899, 0.7); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(20, 40, 14); sun.shadow.camera.left = -22; sun.shadow.camera.right = 22; sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22; sun.shadow.camera.far = 90; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0005; scene.add(sun, sun.target); stage.sun = sun;
  const fill = new THREE.PointLight(0xfff1dd, 0.0, 16, 1.6); scene.add(fill);
  const S = { setup: null, map: null, mapId: null, world: null, role: 'watch', me: { x: 0, z: 0, lv: 0, rot: 0, vx: 0, vz: 0 }, props: new Map(), seekers: new Map(), you: {}, yaw: 0, pitch: 0.28, jx: 0, jy: 0, ix: 0, iz: 0, target: null, endAt: 0, hideEnd: 0, loadMin: 0, phase: 'load', over: false, fx: [], names: new Map(), lastSend: 0, lastIn: [9, 9], left: 0, keys: {}, loaded: false, building: false, hostLv: 0, hostLvAt: 0, camPos: new THREE.Vector3(), camInit: false, sens: 1, tour: null, intro: 0 };
  try { S.sens = Math.max(0.4, Math.min(2.2, parseFloat(localStorage.getItem('j3:sens')) || 1)); } catch (e) {}
  let disposed = false; const timers = new Set(); const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); if (!disposed) fn(); }, ms); timers.add(t); };
  const own = []; const holders = [];

  // ------------------------------------------------------------ الواجهة
  const hud = h('div', 'g-hud'); el.appendChild(hud);
  hud.innerHTML = `<div class="g-top"><span class="g-chip" id="p-round"><small>الجولة</small><b>—</b></span><span class="g-chip g-timer" id="p-timer">0:00</span><span class="g-chip" id="p-left"><small>متنكرين باقين</small><b>—</b></span></div>
    <div class="g-mission" id="p-info" hidden></div><div class="g-spacer"></div>`;
  const $ = (s) => el.querySelector(s);
  const stick = h('div', 'g-stick', '<i></i>'); const actions = h('div', 'g-actions'); const feed = h('div', 'g-feed'); const flash = h('div', 'g-flash'); const vign = h('div', ''); vign.style.cssText = 'position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 120px 30px rgba(239,68,68,0);transition:box-shadow 1s';
  const gear = h('button', 'g-btn g-gear', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>'); const panel = h('div', 'g-panel'); panel.hidden = true;
  panel.innerHTML = `<label>حساسية الكاميرا<input type="range" min="0.4" max="2.2" step="0.1" id="p-sens"></label><div class="g-qrow"><span>الجودة</span><button data-q="low">خفيفة</button><button data-q="medium">متوسطة</button><button data-q="high">عالية</button></div>`;
  el.append(vign, feed, flash, stick, actions, gear, panel); stick.hidden = true;
  const sensIn = panel.querySelector('#p-sens'); sensIn.value = S.sens; sensIn.oninput = () => { S.sens = parseFloat(sensIn.value); try { localStorage.setItem('j3:sens', String(S.sens)); } catch (e) {} };
  const syncQ = () => panel.querySelectorAll('[data-q]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === stage.level))); stage.onQuality = syncQ; syncQ();
  panel.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => stage.setQuality(b.dataset.q, true); }); gear.onclick = () => { panel.hidden = !panel.hidden; };
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
  // ---- عصا الحركة (يسار) — تُرسل لاتجاه الكاميرا
  let stickId = null; const knob = stick.firstChild;
  const stickMove = (e) => { const r = stick.getBoundingClientRect(); let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } S.jx = dx; S.jy = -dy; knob.style.transform = `translate(${dx * 38}px,${dy * 38}px)`; };
  stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); e.stopPropagation(); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e); });
  const stickUp = (e) => { if (e.pointerId !== stickId) return; stickId = null; S.jx = S.jy = 0; knob.style.transform = ''; }; stick.addEventListener('pointerup', stickUp); stick.addEventListener('pointercancel', stickUp);
  // ---- تدوير الكاميرا: لمس (النصف الأيمن، أو أي مكان خارج العصا والأزرار) / ماوس (سحب أو قفل المؤشر)
  const cv = stage.canvas; cv.style.touchAction = 'none'; const looks = new Map();
  cv.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.3 && S.role !== 'watch') return; looks.set(e.pointerId, [e.clientX, e.clientY]); cv.setPointerCapture(e.pointerId); if (e.pointerType === 'mouse' && S.role !== 'watch' && cv.requestPointerLock && !document.pointerLockElement) { try { cv.requestPointerLock(); } catch (er) {} } });
  const look = (dx, dy) => { S.yaw -= dx * 0.0052 * S.sens; S.pitch = Math.max(-0.12, Math.min(0.85, S.pitch + dy * 0.0042 * S.sens)); };
  cv.addEventListener('pointermove', (e) => { if (document.pointerLockElement === cv) { look(e.movementX, e.movementY); return; } const p = looks.get(e.pointerId); if (!p) return; look(e.clientX - p[0], e.clientY - p[1]); p[0] = e.clientX; p[1] = e.clientY; });
  const lookUp = (e) => { looks.delete(e.pointerId); }; cv.addEventListener('pointerup', lookUp); cv.addEventListener('pointercancel', lookUp);
  const onKey = (e) => { const d = e.type === 'keydown'; const k = e.code; if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'ShiftLeft'].includes(k)) { S.keys[k] = d; e.preventDefault(); } if (d && k === 'Space') { const b = btns.inspect || btns.swap; if (b) b.click(); e.preventDefault(); } if (d && k === 'KeyR' && btns.radar) btns.radar.click(); if (d && k === 'KeyF' && btns.lock) btns.lock.click(); if (d && k === 'KeyC' && btns.decoy) btns.decoy.click(); };
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);

  // ------------------------------------------------------------ تحميل العالم (كسول لكل جولة)
  const THEME_STEP = (m) => (m.theme && m.theme.step) || 'tile';
  function applyTheme(m) {
    const t = m.theme; scene.background = new THREE.Color(t.sky || 0x0b0716); scene.fog = new THREE.Fog(t.fog || 0x0b0716, t.fogN || 40, t.fogF || 120);
    hemi.color.set(t.ambSky || 0xffffff); hemi.groundColor.set(t.ambGround || 0x666677); hemi.intensity = t.amb || 0.75; sun.color.set(t.sun || 0xffffff); sun.intensity = stage.level === 'low' ? (t.sunI || 0.9) * 0.9 : t.sunI || 0.9;
    fill.color.set(t.fillC || 0xfff1dd); fill.intensity = stage.level === 'low' ? 0 : (t.fillI === undefined ? 0.35 : t.fillI);
  }
  function clearWorld() {
    S.props.forEach((p) => p.h && p.h.remove()); S.props.clear(); S.seekers.forEach((s) => { scene.remove(s.m); K.disposeObject(s.m); }); S.seekers.clear(); S.fx.length = 0; S.target = null; S.mine = null;
    if (S.world) { S.world.dispose(); S.world = null; } K.disposeMats(); S.loaded = false; S.camInit = false;
  }
  async function buildMapNow(d) {
    const map = MAPS[d.map]; S.map = map; S.mapId = d.map; S.building = true; el.querySelectorAll('.g-end,.g-wait,.g-loaderr').forEach((n) => n.remove());
    try {
      clearWorld(); applyTheme(map); const assets = await loadAssets(K, d.map); if (disposed) return;
      S.world = buildWorld({ THREE, K, kit: KT, map, assets, scene, quality: stage.level, renderer: stage.renderer }); if (stage.sun) stage.sun.castShadow = stage.level === 'high';
      (d.props || []).forEach((o) => addProp(o)); (d.mates || []).forEach((o) => addProp(o, true));
      if (S.role === 'hide') { S.mine = addProp({ pid: d.you.pid, kind: d.you.kind, x: d.you.x, z: d.you.z, rot: d.you.rot, lv: d.you.lv }, false, true); }
      if (S.role === 'seek') ensureSeeker(ctx.me.id, S.me.x, S.me.z, S.me.rot, S.me.lv);
      S.loaded = true; S.world.setView({ host: isHost || S.role === 'watch', lv: S.me.lv }); S.building = false;
      later(60, () => { if (S.phase === 'load') net.g({ k: 'ready' }); });
    } catch (err) {
      console.error('[جمعتنا] map build failed', err); S.building = false; const b = h('div', 'g-wait g-loaderr', `<div><h3>تعذّر تحميل الخريطة</h3><p>تأكد من الاتصال وجرّب مرة ثانية.</p><button class="j3-btn j3-btn-main" id="p-retry">إعادة المحاولة</button></div>`); el.appendChild(b); b.querySelector('#p-retry').onclick = () => { b.remove(); buildMapNow(d); };
    }
  }
  function addProp(o, mate, mine) {
    const hd = S.world.addProp(o.kind, o.lv || 0, o.x, o.z, o.rot || 0); const p = { pid: o.pid, kind: o.kind, x: o.x, z: o.z, rot: o.rot || 0, lv: o.lv || 0, r: KINDS[o.kind].r, h: hd, mate: !!mate, mine: !!mine, moveT: 0, w: 0, cx: o.x, cz: o.z, cr: o.rot || 0 }; S.props.set(o.pid, p);
    if (mine) { const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 28), new THREE.MeshBasicMaterial({ color: 0xf5c451, transparent: true, opacity: 0.85, depthTest: false })); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 4; scene.add(ring); p.ring = ring; own.push(ring.geometry, ring.material); }
    if (mate) { const mk = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 24), new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.6, depthTest: false })); mk.rotation.x = -Math.PI / 2; mk.renderOrder = 4; scene.add(mk); p.ring = mk; own.push(mk.geometry, mk.material); }
    return p;
  }
  function removeProp(pid, pop) { const p = S.props.get(pid); if (!p) return null; if (pop) puff(p.x, p.z, p.lv, 0xffffff); p.h.remove(); if (p.ring) scene.remove(p.ring); S.props.delete(pid); if (S.target === p) S.target = null; return p; }
  function setKind(p, kind) { if (p.kind === kind) return; const lv = p.lv; p.h.remove(); p.h = S.world.addProp(kind, lv, p.x, p.z, p.rot); p.kind = kind; p.r = KINDS[kind].r; puff(p.x, p.z, lv, 0xc4b0ff); }
  function ensureSeeker(id, x, z, rot, lv) { let s = S.seekers.get(id); if (s) return s; const me = id === ctx.me.id; const m = K.humanoid({ shirt: me ? 0x1d4ed8 : 0x2563eb, vest: me ? 0xf59e0b : 0xf97316, hair: 0x2b1b12, hatColor: me ? 0x111827 : 0x1e3a8a }); m.position.set(x, levelY(S.map, x, z, lv), z); m.rotation.y = rot; scene.add(m); s = { id, m, x, z, rot, lv, px: x, pz: z, lastStep: 0 }; S.seekers.set(id, s); return s; }
  function puff(x, z, lv, color) { if (!S.world || stage.level === 'low') return; const n = 14; const g = new THREE.BufferGeometry(); const a = new Float32Array(n * 3), v = []; const y0 = levelY(S.map, x, z, lv) + 0.7; for (let i = 0; i < n; i++) { a[i * 3] = x; a[i * 3 + 1] = y0; a[i * 3 + 2] = z; const an = Math.random() * 6.28; v.push([Math.cos(an) * (0.8 + Math.random() * 2.2), 0.6 + Math.random() * 2.4, Math.sin(an) * (0.8 + Math.random() * 2.2)]); } g.setAttribute('position', new THREE.BufferAttribute(a, 3)); const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.2, transparent: true })); scene.add(pts); let life = 0; const f = (dt) => { life += dt; const at = g.attributes.position; for (let i = 0; i < n; i++) { at.setXYZ(i, at.getX(i) + v[i][0] * dt, at.getY(i) + v[i][1] * dt, at.getZ(i) + v[i][2] * dt); v[i][1] -= 7 * dt; } at.needsUpdate = true; pts.material.opacity = Math.max(0, 1 - life / 0.8); if (life > 0.8) { scene.remove(pts); g.dispose(); pts.material.dispose(); S.fx.splice(S.fx.indexOf(f), 1); } }; S.fx.push(f); }

  function onSetup(d) {
    const newRound = !S.setup || S.setup.round !== d.round; S.setup = d; S.role = d.you.role; S.you = Object.assign({}, d.you); S.phase = d.phase; S.hideEnd = d.hideEnd; S.endAt = d.endAt; S.loadMin = d.loadMin || 0; S.over = false;
    d.roles.forEach((r) => S.names.set(r.id, r.name)); S.left = d.roles.filter((r) => r.role === 'hide' && !r.found).length;
    if (S.role !== 'watch' && d.you.x !== undefined) { S.me = { x: d.you.x, z: d.you.z, lv: d.you.lv || 0, rot: d.you.rot || 0, vx: 0, vz: 0 }; S.ix = S.iz = 0; }
    buildActions(); $('#p-round b').textContent = d.round + ' / ' + d.of; $('#p-left b').textContent = S.left; vign.style.boxShadow = 'inset 0 0 120px 30px rgba(239,68,68,0)';
    if (newRound) { sfx.go(); S.yaw = Math.atan2(-S.me.x, -S.me.z); S.pitch = 0.28; S.intro = performance.now(); showIntro(d); }
    const same = S.mapId === d.map && S.loaded && !newRound; if (!same && !S.building) buildMapNow(d);
    else if (same) { /* إعادة اتصال/تحديث نفس الجولة: أعد بناء الأغراض فقط */ S.props.forEach((p) => { p.h.remove(); if (p.ring) scene.remove(p.ring); }); S.props.clear(); (d.props || []).forEach((o) => addProp(o)); (d.mates || []).forEach((o) => addProp(o, true)); if (S.role === 'hide') S.mine = addProp({ pid: d.you.pid, kind: d.you.kind, x: d.you.x, z: d.you.z, rot: d.you.rot, lv: d.you.lv }, false, true); S.world.setView({ host: isHost || S.role === 'watch', lv: S.me.lv }); }
    phaseUi();
  }
  function showIntro(d) {
    const m = MAPS[d.map]; el.querySelectorAll('.g-intro').forEach((n) => n.remove());
    const roleLine = S.role === 'hide' ? 'أنت متنكر — اختبئ بين الأغراض' : S.role === 'seek' ? 'أنت مفتش — دوّر على المتنكرين' : `الجولة ${d.round} من ${d.of}`;
    const c = h('div', 'g-intro', `<div class="gi-card"><small>الجولة ${d.round} من ${d.of}</small><h2>${esc(m.name)}</h2><p>«${esc(m.line)}»</p><span>${esc(roleLine)}</span></div>`); el.appendChild(c); later(3300, () => c.classList.add('out')); later(3900, () => c.remove());
  }
  function phaseUi() {
    el.querySelectorAll('.g-wait:not(.g-loaderr)').forEach((n) => n.remove());
    if (S.phase === 'load') { info(''); return; }
    if (S.phase === 'hide') {
      if (S.role === 'hide') info(`<small>مرحلة الاختباء</small>أنت الحين <b>${esc(KINDS[S.you.kind].n)}</b> — دوّر لك مكان يناسبك قبل ما تنفتح البوابة!`);
      else { const w = h('div', 'g-wait', `<div><h3>${S.role === 'seek' ? 'البوابة مقفلة' : 'المتنكرين يختبون...'}</h3><p>${S.role === 'seek' ? 'المتنكرين قاعدين يختبون... بتنفتح بعد' : 'يبدأ البحث بعد'} <b id="p-hidecd">25</b> ثانية</p></div>`); w.style.pointerEvents = 'none'; w.style.background = S.role === 'seek' ? 'rgba(5,3,10,.55)' : 'rgba(5,3,10,.35)'; el.appendChild(w); info(''); }
    } else if (S.role === 'hide') info(`<small>البحث بدأ!</small>لا تتحرك قدام المفتشين — الثبات 5 ثواني يخفيك عن الرادار.`);
    else if (S.role === 'seek') info(`<small>ابحث عن المتنكرين</small>قرّب من الغرض المشبوه واضغط «فحص». عندك <b id="p-att">${S.you.att}</b> محاولات.`);
    else info(isHost ? `<small>${esc(S.map ? S.map.name : '')}</small>المفتشين يدورون... أي غرض ممكن يكون لاعب!` : `<small>انكشفت!</small>تابع الجولة كمشاهد.`);
  }

  // ------------------------------------------------------------ حلقة الرسم
  const circlesFor = () => { const c = []; S.props.forEach((p) => { if (!p.mine && !p.decoy) c.push({ id: p.pid, x: p.x, z: p.z, r: p.r, lv: p.lv }); }); return c; };
  let circ = [], circAt = 0; const lookAt = new THREE.Vector3(), desired = new THREE.Vector3(), ents = [];
  const wobble = (p, moving, t) => { p.w += ((moving ? 1 : 0) - p.w) * 0.2; return [Math.abs(Math.sin(t * 13)) * 0.12 * p.w, Math.sin(t * 13) * 0.06 * p.w, Math.cos(t * 6.5) * 0.04 * p.w]; };
  stage.onFrame = (dt, t) => {
    const now = net.now(); const map = S.map;
    if (!map || !S.world || !S.loaded) { camera.position.set(0, 30, 40); camera.lookAt(0, 0, 0); return; }
    const hostView = isHost || S.role === 'watch';
    // ---- إدخال: ثم تنعيم (تسارع/تباطؤ) ثم حركة بنفس دالة الخادم
    let jx = S.jx, jy = S.jy; if (S.keys.KeyA || S.keys.ArrowLeft) jx -= 1; if (S.keys.KeyD || S.keys.ArrowRight) jx += 1; if (S.keys.KeyW || S.keys.ArrowUp) jy += 1; if (S.keys.KeyS || S.keys.ArrowDown) jy -= 1;
    if (S.keys.KeyQ) S.yaw += dt * 2; if (S.keys.KeyE) S.yaw -= dt * 2; const jl = Math.hypot(jx, jy); if (jl > 1) { jx /= jl; jy /= jl; } if (S.keys.ShiftLeft === false) { /* مشي */ }
    const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw); let tx = fx * jy - fz * jx, tz = fz * jy + fx * jx;
    const can = !S.over && S.role !== 'watch' && S.phase !== 'load' && !(S.role === 'seek' && S.phase !== 'seek') && !(S.role === 'hide' && S.you.lock); if (!can) { tx = tz = 0; }
    const acc = Math.min(1, dt * (Math.hypot(tx, tz) > Math.hypot(S.ix, S.iz) ? 9 : 12)); S.ix += (tx - S.ix) * acc; S.iz += (tz - S.iz) * acc; if (Math.hypot(S.ix, S.iz) < 0.02 && !tx && !tz) S.ix = S.iz = 0;
    const speedNow = Math.hypot(S.ix, S.iz); let moved = 0;
    if (S.role !== 'watch' && S.role !== 'final') {
      if (t - circAt > 0.25) { circ = circlesFor(); circAt = t; }
      if (speedNow > 0.03) { const sp = S.role === 'seek' ? PROP.SPEED_SEEKER : PROP.SPEED_HIDER; const r = S.role === 'seek' ? 0.45 : KINDS[S.you.kind].r; const m0x = S.me.x, m0z = S.me.z; const np = stepMove(map, S.me.x, S.me.z, S.ix * sp * dt, S.iz * sp * dt, r, circ, null, S.me.lv); S.me.x = np.x; S.me.z = np.z; updateLevel(map, S.me); moved = Math.hypot(S.me.x - m0x, S.me.z - m0z) / dt; if (moved > 0.2) { let dr = Math.atan2(S.ix, S.iz) - S.me.rot; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; S.me.rot += dr * Math.min(1, dt * 12); } }
      const q = [Math.round(S.ix * 20) / 20, Math.round(S.iz * 20) / 20]; const ch = q[0] !== S.lastIn[0] || q[1] !== S.lastIn[1]; if ((ch && now - S.lastSend > 55) || (speedNow > 0.03 && now - S.lastSend > 200)) { net.g({ k: 'in', x: q[0], z: q[1] }); S.lastIn = q; S.lastSend = now; } else if (!ch && !q[0] && !q[1] && S.lastSend && now - S.lastSend > 600) { /* خمول */ }
    }
    const myY = levelY(map, S.me.x, S.me.z, S.me.lv);
    // ---- اللاعب نفسه: مفتش (شخصية بشرية) أو غرض
    if (S.role === 'seek') { const s = ensureSeeker(ctx.me.id, S.me.x, S.me.z, S.me.rot, S.me.lv); const m = s.m; m.position.set(S.me.x, myY, S.me.z); let dr = S.me.rot - m.rotation.y; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; m.rotation.y += dr * Math.min(1, dt * 12); if (K.animateHuman(m, dt, moved, dr / Math.max(dt, 0.001) * 0.02)) sfx.step(THEME_STEP(map), 0.9); }
    if (S.role === 'hide' && S.mine) { const p = S.mine; p.x = S.me.x; p.z = S.me.z; p.lv = S.me.lv; if (moved > 0.2) { p.rot = S.me.rot; p.moveT += dt; if (Math.floor(p.moveT * 4) !== Math.floor((p.moveT - dt) * 4)) sfx.scoot(); } const w = wobble(p, moved > 0.2, t); p.h.set(S.me.x, myY + w[0], S.me.z, p.rot, w[1], w[2]); if (p.ring) { p.ring.position.set(S.me.x, myY + 0.03, S.me.z); p.ring.scale.setScalar(KINDS[p.kind].r / 0.5 + 0.2); } }
    // ---- الآخرون: استيفاء ناعم
    ents.length = 0; if (S.role !== 'watch') ents.push([S.me.x, S.me.z, S.me.lv]);
    S.seekers.forEach((s) => { if (s.id === ctx.me.id) return; const m = s.m; const k = Math.min(1, dt * 10); const px = m.position.x, pz = m.position.z; m.position.x += (s.x - px) * k; m.position.z += (s.z - pz) * k; m.position.y += (levelY(map, s.x, s.z, s.lv) - m.position.y) * Math.min(1, dt * 8); let dr = s.rot - m.rotation.y; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; m.rotation.y += dr * k; const vis = hostView ? s.lv === (S.hostLv) : s.lv === S.me.lv; m.visible = vis || (map.stairs.length && Math.abs(m.position.y - myY) < 2.2); const sp = Math.hypot(m.position.x - px, m.position.z - pz) / Math.max(dt, 0.001); if (K.animateHuman(m, dt, sp, 0) && m.visible && Math.hypot(m.position.x - S.me.x, m.position.z - S.me.z) < 16) sfx.step(THEME_STEP(map), 0.5); ents.push([s.x, s.z, s.lv]); });
    S.props.forEach((p) => { if (p.mine) return; const dx = p.x - p.cx, dz = p.z - p.cz; const d = Math.hypot(dx, dz); if (d > 0.005) { const k = Math.min(1, dt * 9); p.cx += dx * k; p.cz += dz * k; let dr = p.rot - p.cr; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; p.cr += dr * k; const w = wobble(p, d > 0.04, t); p.h.set(p.cx, w[0], p.cz, p.cr, w[1], w[2]); } else if (p.w > 0.01) { const w = wobble(p, false, t); p.h.set(p.cx, w[0], p.cz, p.cr, w[1], w[2]); } if (p.ring) p.ring.position.set(p.cx, levelY(map, p.cx, p.cz, p.lv) + 0.03, p.cz); });
    // ---- الهدف القريب (للفحص/التبديل)
    if (S.role !== 'watch' && !S.over) { let best = null, bs = 1e9; const range = S.role === 'seek' ? PROP.INSPECT_RANGE : PROP.SWAP_RANGE; S.props.forEach((p) => { if (p.mine || p.lv !== S.me.lv || (S.role === 'hide' && (p.mate || p.decoy))) return; const d = Math.hypot(p.cx - S.me.x, p.cz - S.me.z) - p.r - (S.role === 'hide' ? KINDS[S.you.kind].r : 0); if (d < range * 0.95) { const ang = Math.atan2(p.cx - S.me.x, p.cz - S.me.z); let da = Math.abs(ang - S.yaw) % 6.283; if (da > Math.PI) da = 6.283 - da; if (da > 1.35) return; const sc = d + da * 1.1; if (sc < bs) { bs = sc; best = p; } } }); S.target = (S.role === 'seek' && S.phase !== 'seek') ? null : best; ring.visible = !!S.target; if (S.target) { ring.position.set(S.target.cx, levelY(map, S.target.cx, S.target.cz, S.target.lv) + 0.05, S.target.cz); ring.scale.setScalar(S.target.r + 0.25); ring.rotation.z = t * 2; } } else ring.visible = false;
    // ---- الكاميرا
    const intro = S.phase === 'load' && map.tour && S.loadMin; const th = map.theme;
    if (hostView && S.role !== 'final') {
      if (map.stairs.length && now - S.hostLvAt > 12000) { S.hostLv = S.hostLv ? 0 : 1; S.hostLvAt = now; S.world.setView({ host: true, lv: S.hostLv }); } else if (!S.hostInit) { S.hostInit = true; S.world.setView({ host: true, lv: 0 }); }
      const a = t * 0.05 + (S.mapId.length), R = Math.max(map.w, map.d) * 0.62; desired.set(Math.sin(a) * R * 0.5, R * 0.95, Math.cos(a) * R * 0.5 + 4 + (S.hostLv ? 0 : 0)); if (!S.camInit) { camera.position.copy(desired); S.camInit = true; } camera.position.lerp(desired, Math.min(1, dt * 1.2)); camera.lookAt(0, S.hostLv * LH * 0.6, 0);
    } else if (intro && S.role !== 'final') { // مقدمة سينمائية داخل المكان
      const total = Math.max(2500, S.loadMin - S.intro0); const u = Math.min(1, (performance.now() - S.intro) / 3400); const tour = map.tour; const f = u * (tour.length - 1); const i = Math.min(tour.length - 2, Math.floor(f)); const k = f - i; const e = k * k * (3 - 2 * k); const A = tour[i], B = tour[i + 1];
      camera.position.set(A[0] + (B[0] - A[0]) * e, A[2] + (B[2] - A[2]) * e, A[1] + (B[1] - A[1]) * e); lookAt.set(A[3] + (B[3] - A[3]) * e, A[5] + (B[5] - A[5]) * e, A[4] + (B[4] - A[4]) * e); camera.lookAt(lookAt); S.camInit = false;
    } else if (S.role !== 'final') {
      const dist = S.role === 'hide' ? 3.9 + KINDS[S.you.kind].h * 0.9 : 3.3; const pivY = myY + (S.role === 'hide' ? Math.max(0.9, KINDS[S.you.kind].h * 0.8) : 1.55); const cp = Math.cos(S.pitch), sp2 = Math.sin(S.pitch);
      const px = S.me.x, pz = S.me.z; const tx2 = px - Math.sin(S.yaw) * cp * dist, tz2 = pz - Math.cos(S.yaw) * cp * dist; const tt = S.world.camT(px, pz, tx2, tz2, S.me.lv); const cx = px + (tx2 - px) * tt, cz = pz + (tz2 - pz) * tt; let cy = pivY + sp2 * dist * tt; cy = Math.min(cy, myY + WH - 0.28); cy = Math.max(cy, myY + 0.45);
      desired.set(cx, cy, cz); if (!S.camInit) { camera.position.copy(desired); S.camInit = true; } const kk = tt < 0.99 ? 1 : Math.min(1, dt * 16); camera.position.lerp(desired, kk); lookAt.set(px - Math.sin(S.yaw) * 0.0, pivY - 0.12, pz); camera.lookAt(lookAt);
      fill.position.set(px, myY + WH - 0.6, pz); sun.position.set(px + 20, myY + 42, pz + 14); sun.target.position.set(px, myY, pz); S.world.setView({ host: false, lv: S.me.lv });
    }
    S.world.update(dt, t, camera.position, ents); for (const f of S.fx.slice()) f(dt, t);
    // ---- العدادات
    const tm = $('#p-timer'); if (S.over) { /* ثابت */ } else if (S.phase === 'load') tm.textContent = '--:--'; else if (S.phase === 'hide') { const left = S.hideEnd - now; tm.textContent = fmtTime(left); const c = $('#p-hidecd'); if (c) c.textContent = Math.max(0, Math.ceil(left / 1000)); } else { const left = S.endAt - now; tm.textContent = fmtTime(left); tm.classList.toggle('is-low', left < 60000); }
    const cd = (b, until, total) => { if (!b) return; const left = Math.max(0, until - now); b.querySelector('.cd').style.height = Math.min(100, left / total * 100) + '%'; };
    cd(btns.swap, S.you.extra ? 0 : S.you.swapAt || 0, 40000); cd(btns.decoy, S.you.decoyAt || 0, 45000); cd(btns.radar, S.you.radarAt || 0, 30000); if (btns.lock) btns.lock.style.borderColor = S.you.lock ? '#34d399' : '';
  };
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 })); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 5; ring.visible = false; scene.add(ring); own.push(ring.geometry, ring.material);

  // ------------------------------------------------------------ رسائل الخادم
  function onSnap(d) {
    if (d.me && S.role !== 'watch') { const ex = d.me[0] - S.me.x, ez = d.me[1] - S.me.z; const err = Math.hypot(ex, ez); if (d.me[2] !== undefined && d.me[2] !== S.me.lv) { S.me.lv = d.me[2]; S.me.x = d.me[0]; S.me.z = d.me[1]; } else if (err > 1.4) { S.me.x = d.me[0]; S.me.z = d.me[1]; } else if (err > 0.04) { S.me.x += ex * 0.12; S.me.z += ez * 0.12; } }
    for (const s of d.seek || []) { if (s[0] === ctx.me.id || !S.world) continue; const k = ensureSeeker(s[0], s[1], s[2], s[3], s[4] || 0); k.x = s[1]; k.z = s[2]; k.rot = s[3]; k.lv = s[4] || 0; }
    if (!S.world) return; for (const m of d.mv || []) { let p = S.props.get(m[0]); if (!p) { p = addProp({ pid: m[0], kind: m[1], x: m[2], z: m[3], rot: m[4], lv: m[5] || 0 }); if (S.role === 'hide' && S.phase === 'seek') p.decoy = true; } else if (p.kind !== m[1]) { setKind(p, m[1]); if (S.role !== 'hide') sfx.swap(); } p.x = m[2]; p.z = m[3]; p.rot = m[4]; p.lv = m[5] || 0; }
  }
  const QUAD = ['الزاوية البعيدة يمين', 'الزاوية البعيدة يسار', 'الزاوية القريبة يمين', 'الزاوية القريبة يسار'];
  function onOver(d) {
    S.over = true; ring.visible = false; stick.hidden = true; actions.innerHTML = ''; info('');
    d.reveal.forEach((r) => { if (r.found) return; const p = S.props.get(r.pid); const x = p ? p.cx : r.x, z = p ? p.cz : r.z; const lv = p ? p.lv : r.lv || 0; const y = levelY(S.map, x, z, lv); const b = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 4), new THREE.MeshBasicMaterial({ color: 0x34d399, depthTest: false })); b.rotation.x = Math.PI; b.renderOrder = 6; scene.add(b); own.push(b.geometry, b.material); const lb = KT.label(S.names.get(r.id) || '', { h: 0.4, depthTest: false }); lb.renderOrder = 7; scene.add(lb); own.push(lb.material.map, lb.material); const base = y + KINDS[r.kind].h + 0.8; S.fx.push((dt, t) => { b.position.set(x, base + Math.sin(t * 4) * 0.12, z); b.rotation.y = t * 2; lb.position.set(x, base + 0.7, z); }); });
    const iWon = d.winner && ((S.setup.roles.find((r) => r.id === ctx.me.id) || {}).role === d.winner); if (d.winner) (isHost || iWon ? sfx.win : sfx.lose)();
    const title = d.winner === 'hide' ? 'فاز المتنكرين!' : d.winner === 'seek' ? 'فاز المفتشين!' : 'انتهت الجولة'; const why = { all_found: 'انكشف الجميع', time: 'انتهى الوقت وبقي متنكر', no_attempts: 'خلصت محاولات المفتشين', aborted: 'خرج لاعبون' }[d.why] || '';
    const mine = d.results.find((r) => r.id === ctx.me.id); const nextMap = d.round < d.of;
    const end = h('div', 'g-end', `<h3>${title}</h3><div class="g-awards"><span>${esc(why)}</span>${mine ? `<span>نقاطك بالجولة: ${mine.pts}${mine.lines.length ? ' (' + mine.lines.map((l) => esc(l[0]) + ' +' + l[1]).join('، ') + ')' : ''}</span>` : ''}</div>
      <ol class="g-rank">${d.results.slice().sort((a, b) => b.score - a.score).map((p, i) => `<li><i>${i + 1}</i><span>${esc(p.name)} · ${p.role === 'seek' ? 'مفتش' : p.found ? 'متنكر انكشف' : 'متنكر نجا'}</span><b>${p.score}</b></li>`).join('')}</ol><p style="color:#B5A9D9;font-weight:700;margin:0">${nextMap ? 'الجولة الجاية بخريطة ثانية وتتبدل الأدوار...' : 'نحسب النتيجة النهائية...'}</p>`); el.appendChild(end);
    if (d.best && isHost) later(2600, () => playReplay(d.best));
  }
  function playReplay(b) {
    if (disposed || !S.world || !b.frames.length) return; const cap = h('div', 'g-banner', `<div style="animation:none;font-size:clamp(18px,3vw,30px);align-self:start;margin-top:90px">أفضل لقطة<small>${esc(b.seeker)} مرّ جنب ${esc(b.hider)} وما انتبه!</small></div>`); el.appendChild(cap);
    const ghost = K.humanoid({}); scene.add(ghost); const hd = S.world.addProp(b.frames[0][7] || 'plant', 0, b.frames[0][4], b.frames[0][5], 0); S.props.forEach((p) => { if (Math.hypot(p.x - b.frames[0][4], p.z - b.frames[0][5]) < 0.4) p.h.set(0, -50, 0); });
    const t0 = performance.now(), start = b.frames[0][0], endT = b.frames[b.frames.length - 1][0]; S.hostReplay = true;
    const f = () => { const tt = start + (performance.now() - t0) * 0.8; let i = 0; while (i < b.frames.length - 2 && b.frames[i + 1][0] < tt) i++; const a = b.frames[i], c = b.frames[i + 1] || a; const k = Math.max(0, Math.min(1, (tt - a[0]) / (c[0] - a[0] || 1))); const L = (j) => a[j] + (c[j] - a[j]) * k; const px = ghost.position.x, pz = ghost.position.z; ghost.position.set(L(1), 0, L(2)); ghost.rotation.y = a[3]; K.animateHuman(ghost, 0.016, Math.hypot(ghost.position.x - px, ghost.position.z - pz) * 60, 0); hd.set(L(4), 0, L(5), a[6]); camera.position.set(L(4) + 3.2, 2.2, L(5) + 4.2); camera.lookAt(L(4), 0.9, L(5)); if (tt >= endT + 600) { S.fx.splice(S.fx.indexOf(f), 1); cap.remove(); scene.remove(ghost); K.disposeObject(ghost); hd.remove(); S.hostReplay = false; } }; S.fx.push(f);
  }
  function onFinal(d) {
    S.over = true; S.role = 'final'; el.querySelectorAll('.g-end,.g-wait,.g-intro').forEach((n) => n.remove()); hud.style.display = 'none'; stick.hidden = true; actions.innerHTML = ''; gear.hidden = true; clearWorld(); S.map = null;
    scene.background = new THREE.Color(0x0e0820); scene.fog = null; hemi.intensity = 0.55; hemi.color.set(0xd8c8ff); hemi.groundColor.set(0x241036); sun.intensity = 0.85; sun.color.set(0xfff0e0); fill.intensity = 0;
    const g = new THREE.Group(); scene.add(g); const st = K.mergeMulti([K.cyl(9, 9.6, 0.8, 0x2a1230, 0, 0, 0, { seg: 40, m: 'gloss' }), K.cyl(7.6, 7.6, 0.2, 0xf472b6, 0, 0.8, 0, { seg: 40, m: 'gloss' }), K.cyl(12, 12, 0.2, 0x150d2b, 0, -0.2, 0, { seg: 40 })]); const sm = new THREE.Mesh(st.geometry, K.matList(st.keys, K.makeEnv(stage.renderer, 0x8f6bd8))); sm.receiveShadow = true; g.add(sm); own.push(st.geometry);
    const top = d.ranking.slice(0, 3); const xs = [0, -3.6, 3.6], zs = [0, 1.4, 1.4], sc = [1.25, 1.1, 1.1];
    top.forEach((p, i) => { const ch = K.humanoid({ shirt: [0xf5c451, 0x8b5cf6, 0x34d399][i], vest: 0xffffff, hatColor: [0xf472b6, 0x1e3a8a, 0x1e3a8a][i], hat: i === 0 }); ch.scale.setScalar(sc[i]); ch.position.set(xs[i], 1.0, zs[i]); g.add(ch); const lb = KT.label((i + 1) + ' · ' + p.name, { h: 0.7 }); lb.position.set(xs[i], 1.0 + sc[i] * 2.1 + 0.4, zs[i]); g.add(lb); own.push(lb.material.map, lb.material); S.fx.push((dt, t) => { K.animateHuman(ch, dt, i === 0 ? 0.01 : 0, 0); ch.rotation.y = Math.sin(t * 1.6 + i) * 0.5; ch.position.y = 1.0 + (i === 0 ? Math.abs(Math.sin(t * 5)) * 0.35 : 0); }); });
    const beams = []; [0xf472b6, 0xfde68a, 0x8b5cf6].forEach((c, i) => { const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 16, 18, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })); cone.position.set((i - 1) * 6, 8, -1); scene.add(cone); own.push(cone.geometry, cone.material); beams.push(cone); });
    S.fx.push((dt, t) => { g.rotation.y = Math.sin(t * 0.4) * 0.3; beams.forEach((b, i) => { b.rotation.z = Math.sin(t * 1.3 + i * 2) * 0.35; }); camera.position.set(Math.sin(t * 0.15) * 4, 4.4, 14); camera.lookAt(0, 2.6, 0); });
    sfx.win(); const me = d.ranking.findIndex((r) => r.id === ctx.me.id); const co = d.ranking.filter((r) => r.tiedTop).map((r) => r.name);
    const end = h('div', 'g-end', `<h3>${d.ranking[0] ? 'الفائز: ' + esc(d.ranking[0].name) + (co.length ? ' و' + co.map(esc).join(' و') : '') + ' · ' + d.ranking[0].score + ' نقطة' : 'انتهت المباراة'}</h3>${!isHost && me >= 0 ? `<div class="g-awards"><span>ترتيبك ${me + 1} من ${d.ranking.length}</span></div>` : ''}
      <ol class="g-rank">${d.ranking.map((p, i) => `<li><i>${i + 1}</i><span>${esc(p.name)} · كشف ${p.stats ? p.stats.reveals : 0} · صمد ${p.stats ? Math.round(p.stats.surviveMs / 1000) : 0} ث</span><b>${p.score}</b></li>`).join('')}</ol><div class="g-awards"><span>${esc(d.tieRule)}</span></div>
      ${isHost ? '<div class="j3-row"><button class="j3-btn j3-btn-main" id="p-again">مباراة جديدة بنفس اللاعبين</button><button class="j3-btn j3-btn-quiet" id="p-exit">إنهاء الغرفة</button></div>' : '<p style="color:#B5A9D9;font-weight:700;margin:0">ننتظر المضيف يبدأ مباراة جديدة...</p>'}`);
    el.appendChild(end); if (isHost) { end.querySelector('#p-again').onclick = ctx.again; end.querySelector('#p-exit').onclick = ctx.exit; }
  }
  function onMsg(d) {
    if (disposed) return;
    if (d.k === 'setup') return onSetup(d);
    if (d.k === 'final') return onFinal(d);
    if (!S.setup) return;
    if (d.k === 'snap') return onSnap(d);
    if (d.k === 'phase') { S.phase = d.phase; if (d.phase === 'hide') { S.hideEnd = d.hideEnd; S.camInit = false; } else S.endAt = d.endAt; phaseUi(); if (d.phase === 'hide') { banner(S.role === 'hide' ? 'اختبئ!' : 'استعدوا', S.role === 'hide' ? 'دوّر لك مكان مناسب' : 'البوابة بتنفتح قريب'); sfx.go(); stopAmb(); ambience('room'); } else { banner(S.role === 'hide' ? 'انفتحت البوابة!' : 'ابدأ البحث!', S.role === 'hide' ? 'اثبت مكانك' : 'أي غرض ممكن يكون لاعب'); sfx.go(); S.props.forEach((p) => { if (p.mate) { p.decoy = false; if (p.ring) { scene.remove(p.ring); p.ring = null; } } }); } return; }
    if (!S.world) return;
    if (d.k === 'you') { const wasKind = S.you.kind; Object.assign(S.you, d); if (d.kind && d.kind !== wasKind && S.mine) { setKind(S.mine, d.kind); sfx.swap(); ctx.toast('تحولت إلى ' + KINDS[d.kind].n); } if ('lock' in d) ctx.toast(d.lock ? 'ثبّتت نفسك — ما راح تتحرك بالغلط' : 'فكّيت التثبيت'); if (d.extra) ctx.toast('عندك تبديل شكل إضافي!'); return; }
    if (d.k === 'deny') return ctx.toast({ far: 'بعيد — قرّب أكثر', cooldown: 'لسا ما جهزت، انتظر شوي' }[d.why] || 'ما ينفع الحين');
    if (d.k === 'insp') { if ('att' in d) { S.you.att = d.att; const a = $('#p-att'); if (a) a.textContent = d.att; } if (d.ok) { banner('كشفته!', '+' + d.pts); } else if (d.gone) ctx.toast('انكشف قبلك بلحظة'); else { sfx.bad(); ctx.toast(d.decoy ? 'طعم! خسرت محاولة' : `غرض عادي... باقي ${d.att} ${d.att === 1 ? 'محاولة' : 'محاولات'}`); if (d.att === 0) info('<small>خلصت محاولاتك</small>تقدر تتحرك وتراقب وتدل فريقك، بس ما تقدر تفحص.'); } return; }
    if (d.k === 'radar') { S.you.radarAt = d.radarAt; sfx.radar(); if (!d.blips.length) ctx.toast('الرادار ما لقط نشاط قريب'); d.blips.forEach(([x, z]) => { const y = levelY(S.map, S.me.x, S.me.z, S.me.lv); const r = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.8, 28), new THREE.MeshBasicMaterial({ color: 0xf5c451, transparent: true, side: THREE.DoubleSide, depthTest: false })); r.rotation.x = -Math.PI / 2; r.position.set(x, y + 0.08, z); r.renderOrder = 4; scene.add(r); own.push(r.geometry, r.material); let life = 0; const f = (dt) => { life += dt; r.scale.setScalar(1 + Math.sin(life * 5) * 0.15); r.material.opacity = Math.max(0, 1 - life / 4.5); if (life > 4.5) { scene.remove(r); S.fx.splice(S.fx.indexOf(f), 1); } }; S.fx.push(f); }); return; }
    if (d.k === 'found') { const p = removeProp(d.pid); puff(d.x, d.z, d.lv || 0, 0xfde68a); flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); sfx.reveal(); S.left = d.left; $('#p-left b').textContent = d.left;
      const ch = K.humanoid({ shirt: 0xf472b6, vest: 0xffffff, hat: false }); const y0 = levelY(S.map, d.x, d.z, d.lv || 0); ch.position.set(d.x, y0, d.z); scene.add(ch); let life = 0; const f = (dt) => { life += dt; ch.position.y = y0 + Math.abs(Math.sin(life * 7)) * 0.35; ch.rotation.y += dt * 6; K.animateHuman(ch, dt, 3, 0); if (life > 2.4) { scene.remove(ch); K.disposeObject(ch); S.fx.splice(S.fx.indexOf(f), 1); } }; S.fx.push(f);
      say(`${d.by.name} كشف ${d.hider.name}! +75`); if (d.hider.id === ctx.me.id) banner('انكشفت!', 'كشفك ' + d.by.name); else if (isHost) banner('انكشف ' + d.hider.name, 'كشفه ' + d.by.name + ' · +75'); return; }
    if (d.k === 'gone') { removeProp(d.pid, d.pop); if ('left' in d) { S.left = d.left; $('#p-left b').textContent = d.left; } return; }
    if (d.k === 'fx') { const p = S.props.get(d.pid); if (p) puff(p.x, p.z, p.lv, 0x9ca3af); if (d.by !== ctx.me.id) sfx.inspect(); return; }
    if (d.k === 'lastmin') { banner('آخر دقيقة!', 'الحماس الحين'); sfx.lastmin(); vign.style.boxShadow = 'inset 0 0 140px 34px rgba(239,68,68,.34)'; return; }
    if (d.k === 'lasthider') { later(2000, () => { banner('باقي متنكر واحد!'); sfx.lastmin(); }); return; }
    if (d.k === 'hot') { say('نشاط مشبوه جهة: ' + QUAD[d.q]); return; }
    if (d.k === 'over') return onOver(d);
  }
  stage.start();
  return {
    onMsg,
    unmount() { disposed = true; timers.forEach(clearTimeout); stopAmb(); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); try { if (document.pointerLockElement === cv) document.exitPointerLock(); } catch (e) {} clearWorld(); own.forEach((o) => { try { o.dispose && o.dispose(); } catch (e) {} }); stage.dispose(); [hud, stick, actions, feed, flash, vign, gear, panel].forEach((n) => n.remove()); el.querySelectorAll('.g-end,.g-banner,.g-wait,.g-intro').forEach((n) => n.remove()); },
    debug: () => Object.assign(stage.info(), { props: S.props.size, seekers: S.seekers.size, role: S.role, phase: S.phase, map: S.mapId, lv: S.me.lv }),
    _S: S, _stage: stage,
  };
}
