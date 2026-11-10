// جمعتنا — المدينة المصغّرة: محاكاة مشتركة بين الخادم والعميل (حتمية، بدون أي اعتماد على المتصفح).
// الخادم هو المرجع: يولّد المدينة من seed ويرسل وصفها، والعميل يحرّك العناصر بنفس الدوال من وقت الخادم.
// لا يوجد في هذا الملف أي معلومة عن «الإجابة الصحيحة» — الأهداف يختارها الخادم ويحتفظ بها عنده.

export const CITY = { N: 4, BLOCK: 16, ROAD: 8, CYCLE: 12, LANE: 1.7 };
const PITCH = CITY.BLOCK + CITY.ROAD;
export const CITY_SIZE = CITY.N * CITY.BLOCK + (CITY.N + 1) * CITY.ROAD;
const HALF = CITY_SIZE / 2;

export function rng32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** إحداثي مركز خط الطريق رقم i (0..N). */
export function roadAt(i) { return -HALF + CITY.ROAD / 2 + i * PITCH; }
/** إحداثي مركز البلوك رقم i (0..N-1). */
export function blockAt(i) { return -HALF + CITY.ROAD + CITY.BLOCK / 2 + i * PITCH; }

export const COLORS = {
  red: { hex: 0xe5484d, m: 'أحمر', f: 'حمراء' },
  blue: { hex: 0x3b82f6, m: 'أزرق', f: 'زرقاء' },
  yellow: { hex: 0xf5c451, m: 'أصفر', f: 'صفراء' },
  green: { hex: 0x34d399, m: 'أخضر', f: 'خضراء' },
  white: { hex: 0xf1f0f7, m: 'أبيض', f: 'بيضاء' },
  black: { hex: 0x26232f, m: 'أسود', f: 'سوداء' },
  orange: { hex: 0xfb923c, m: 'برتقالي', f: 'برتقالية' },
  pink: { hex: 0xf472b6, m: 'وردي', f: 'وردية' },
  purple: { hex: 0x8b5cf6, m: 'بنفسجي', f: 'بنفسجية' },
  teal: { hex: 0x2dd4bf, m: 'تركوازي', f: 'تركوازية' },
};
const COLOR_KEYS = Object.keys(COLORS);

export const BUILDING_KINDS = {
  apartment: 'عمارة سكنية', house: 'بيت', shop: 'محل', restaurant: 'مطعم', cafe: 'مقهى', school: 'مدرسة',
  hospital: 'مستشفى', gas: 'محطة وقود', parking: 'مواقف', mall: 'مركز تسوق', park: 'حديقة', plaza: 'ساحة مشاة',
};
const CAR_SUBS = { car: { n: 'سيارة', g: 'f' }, bus: { n: 'باص', g: 'm' }, van: { n: 'سيارة توصيل', g: 'f' }, service: { n: 'سيارة خدمات', g: 'f' }, bike: { n: 'دراجة', g: 'f' } };
const PROP_SUBS = { mailbox: { n: 'صندوق بريد', g: 'm' }, bench: { n: 'كرسي حديقة', g: 'm' }, hydrant: { n: 'صنبور حريق', g: 'm' }, billboard: { n: 'لوحة إعلانات', g: 'f' }, parkedbike: { n: 'دراجة واقفة', g: 'f' }, kiosk: { n: 'كشك', g: 'm' } };

/** حالة الإشارة عند التقاطع (i,j) بالوقت t: 'ns' أخضر للمحور الشمالي-الجنوبي، 'ew' للشرقي-الغربي، 'y' أصفر. */
export function lightState(i, j, t) {
  const off = ((i * 3 + j * 5) % 4) * 3;
  const p = (((t + off) % CITY.CYCLE) + CITY.CYCLE) % CITY.CYCLE;
  if (p < 5) return 'ns';
  if (p < 6) return 'y';
  if (p < 11) return 'ew';
  return 'y';
}
/** متى يقدر جسم يتحرك على المحور axis ('ns'|'ew') يعبر التقاطع (i,j) لو وصل بالوقت t. يرجع t نفسه لو أخضر. */
function nextGreen(i, j, axis, t) {
  let tt = t;
  for (let k = 0; k < 60; k++) { if (lightState(i, j, tt) === axis) return tt; tt = Math.floor(tt * 2 + 1) / 2; }
  return tt;
}

/** يبني جدول حركة حتمي (keyframes) لسيارة تدور حول المستطيل (i0,j0)-(i1,j1) مع احترام الإشارات. */
function buildCarLoop(i0, j0, i1, j1, speed, slot) {
  // رؤوس المستطيل باتجاه واحد (يمين الطريق): نمر على كل تقاطع بالطريق.
  const pts = [];
  for (let i = i0; i < i1; i++) pts.push([i, j0, 'ew', 1, 0]);
  for (let j = j0; j < j1; j++) pts.push([i1, j, 'ns', 0, 1]);
  for (let i = i1; i > i0; i--) pts.push([i, j1, 'ew', -1, 0]);
  for (let j = j1; j > j0; j--) pts.push([i0, j, 'ns', 0, -1]);
  const kf = []; let t = 0;
  const lane = CITY.LANE, stopBack = CITY.ROAD / 2 + 1.2 + slot * 3.2;
  const n = pts.length;
  const pos = (k) => {
    const [i, j, , dx, dz] = pts[k];
    // الإزاحة لليمين من اتجاه الحركة
    return [roadAt(i) - dz * lane, roadAt(j) + dx * lane];
  };
  let cur = pos(0); kf.push([0, cur[0], cur[1], Math.atan2(pts[0][3], pts[0][4])]);
  for (let k = 0; k < n; k++) {
    const nk = (k + 1) % n; const [, , axis, dx, dz] = pts[k]; const [ni, nj] = pts[nk];
    const rot = Math.atan2(dx, dz);
    // نقطة التوقف قبل التقاطع التالي
    const ix = roadAt(ni), iz = roadAt(nj);
    const stop = [ix - dx * stopBack - dz * lane, iz - dz * stopBack + dx * lane];
    const d1 = Math.hypot(stop[0] - cur[0], stop[1] - cur[1]);
    t += d1 / speed; kf.push([t, stop[0], stop[1], rot]);
    const g = nextGreen(ni, nj, axis, t);
    if (g > t) { t = g; kf.push([t, stop[0], stop[1], rot]); }
    const nxt = pos(nk); const nrot = Math.atan2(pts[nk][3], pts[nk][4]);
    // عبور التقاطع إلى بداية الضلع التالي (لو فيه انعطاف نمر بمركز المسار الجديد)
    const mid = [ix - dz * lane, iz + dx * lane];
    const d2 = Math.hypot(mid[0] - stop[0], mid[1] - stop[1]); t += d2 / speed; kf.push([t, mid[0], mid[1], rot]);
    const d3 = Math.hypot(nxt[0] - mid[0], nxt[1] - mid[1]);
    if (d3 > 0.01) { t += d3 / speed; kf.push([t, nxt[0], nxt[1], nrot]); }
    cur = nxt;
  }
  const period = Math.ceil(t / CITY.CYCLE) * CITY.CYCLE;
  if (period > t) kf.push([period, cur[0], cur[1], kf[kf.length - 1][3]]);
  return { kf, period };
}

function buildWalkLoop(bi, bj, inset, speed, ccw) {
  const cx = blockAt(bi), cz = blockAt(bj), h = CITY.BLOCK / 2 + inset;
  let c = [[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h]];
  if (ccw) c = c.reverse();
  const kf = []; let t = 0;
  for (let k = 0; k <= 4; k++) {
    const a = c[k % 4], b = c[(k + 1) % 4];
    kf.push([t, a[0], a[1], Math.atan2(b[0] - a[0], b[1] - a[1])]);
    t += Math.hypot(b[0] - a[0], b[1] - a[1]) / speed;
  }
  return { kf, period: kf[4][0] };
}

function sampleKf(kf, period, t) {
  let tt = ((t % period) + period) % period;
  let lo = 0, hi = kf.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (kf[m][0] <= tt) lo = m; else hi = m; }
  const a = kf[lo], b = kf[hi]; const span = b[0] - a[0];
  const f = span > 0 ? Math.min(1, Math.max(0, (tt - a[0]) / span)) : 0;
  const moving = span > 0 && (a[1] !== b[1] || a[2] !== b[2]);
  return { x: a[1] + (b[1] - a[1]) * f, z: a[2] + (b[2] - a[2]) * f, rot: a[3], moving };
}

/**
 * موضع أي عنصر بالوقت t (ثواني محاكاة). pauses: [{t0,dur,ids:Set|array}] نوافذ «ازدحام» تجمّد وقت بعض السيارات.
 */
export function entState(ent, t, pauses) {
  if (!ent.kf) return { x: ent.x, z: ent.z, rot: ent.rot || 0, moving: false };
  let te = t + (ent.phase || 0);
  let frozen = false;
  if (pauses && pauses.length) {
    for (const p of pauses) {
      if (!p.ids || (p.ids.has ? !p.ids.has(ent.id) : p.ids.indexOf(ent.id) < 0)) continue;
      const over = Math.min(Math.max(t - p.t0, 0), p.dur);
      te -= over; if (t >= p.t0 && t < p.t0 + p.dur) frozen = true;
    }
  }
  const s = sampleKf(ent.kf, ent.period, te);
  if (frozen) s.moving = false;
  return s;
}

/** توليد المدينة كاملة من seed. نفس الـ seed يعطي نفس المدينة تمامًا على الخادم والعميل. */
export function genCity(seed) {
  const R = rng32(seed);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const buildings = []; const ents = []; let nid = 0;
  const id = (p) => p + (nid++).toString(36);

  // ---- المباني: كل بلوك له «طابع» ويُقسَّم لقطع ----
  const special = ['school', 'hospital', 'gas', 'mall', 'park', 'parking', 'plaza', 'park'];
  const order = []; for (let i = 0; i < CITY.N; i++) for (let j = 0; j < CITY.N; j++) order.push([i, j]);
  for (let k = order.length - 1; k > 0; k--) { const m = Math.floor(R() * (k + 1)); [order[k], order[m]] = [order[m], order[k]]; }
  const blockKind = {};
  special.forEach((s, k) => { blockKind[order[k].join()] = s; });
  const shopSubs = ['shop', 'restaurant', 'cafe', 'shop'];
  const wallColors = [0xe9dfd2, 0xd9c7b8, 0xc9d6df, 0xdfe7d6, 0xe6d3df, 0xd7d2ea, 0xf0e4c8, 0xcfd8cf];
  const signColors = ['red', 'blue', 'yellow', 'green', 'orange', 'pink', 'purple', 'teal'];
  let signIx = 0;
  for (let bi = 0; bi < CITY.N; bi++) for (let bj = 0; bj < CITY.N; bj++) {
    const cx = blockAt(bi), cz = blockAt(bj), B = CITY.BLOCK - 3; const k = blockKind[bi + ',' + bj];
    if (k) {
      const h = k === 'hospital' ? 9 : k === 'mall' ? 7 : k === 'school' ? 5 : k === 'gas' ? 3.2 : 0;
      buildings.push({ id: id('b'), kind: k, x: cx, z: cz, w: B, d: B, h, color: pick(wallColors), sign: signColors[signIx++ % signColors.length], bi, bj });
      continue;
    }
    // بلوك عادي: 4 قطع (2×2) مزيج سكني/تجاري
    const commercial = R() < 0.5;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const w = B / 2 - 0.8, kind = commercial ? pick(shopSubs) : (R() < 0.55 ? 'apartment' : 'house');
      const h = kind === 'apartment' ? 6 + Math.floor(R() * 5) * 1.5 : kind === 'house' ? 3 : 3.6;
      buildings.push({ id: id('b'), kind, x: cx + (a - 0.5) * (B / 2 + 0.4), z: cz + (b - 0.5) * (B / 2 + 0.4), w, d: w, h, color: pick(wallColors), sign: signColors[signIx++ % signColors.length], roof: pick([0x7c3aed, 0xb45309, 0x475569, 0x9f1239, 0x0f766e]), bi, bj });
    }
  }

  // ---- السيارات المتحركة: حلقات مستطيلة متنوعة ----
  const combos = [];
  for (const sub of ['car', 'car', 'car', 'bus', 'van', 'service']) for (const c of COLOR_KEYS) combos.push([sub, c]);
  for (let k = combos.length - 1; k > 0; k--) { const m = Math.floor(R() * (k + 1)); [combos[k], combos[m]] = [combos[m], combos[k]]; }
  let ci = 0; const loops = [];
  for (let i0 = 0; i0 < CITY.N; i0++) for (let j0 = 0; j0 < CITY.N; j0++) {
    loops.push([i0, j0, i0 + 1, j0 + 1]);
    if (i0 + 2 <= CITY.N && j0 + 2 <= CITY.N && (i0 + j0) % 2 === 0) loops.push([i0, j0, i0 + 2, j0 + 2]);
  }
  loops.push([0, 0, CITY.N, CITY.N]);
  for (let k = loops.length - 1; k > 0; k--) { const m = Math.floor(R() * (k + 1)); [loops[k], loops[m]] = [loops[m], loops[k]]; }
  loops.slice(0, 22).forEach((l, k) => {
    const [sub, color] = combos[ci++ % combos.length];
    const sp = sub === 'bus' ? 5 : 6.5 + R() * 2;
    const { kf, period } = buildCarLoop(l[0], l[1], l[2], l[3], sp, k % 2);
    ents.push({ id: id('c'), t: 'car', sub, color, kf, period, phase: Math.floor(R() * (period / CITY.CYCLE)) * CITY.CYCLE, loop: l });
  });

  // ---- سيارات واقفة: بمواقف نظامية + مخالفات (بمكان ممنوع: فوق ممر مشاة/رصيف) ----
  const parkSpots = [];
  for (let i = 0; i <= CITY.N; i++) for (let bj = 0; bj < CITY.N; bj++) for (const s of [-4.5, 0, 4.5]) {
    parkSpots.push({ x: roadAt(i) + (CITY.ROAD / 2 - 0.9), z: blockAt(bj) + s, rot: 0, legal: true });
  }
  for (let k = parkSpots.length - 1; k > 0; k--) { const m = Math.floor(R() * (k + 1)); [parkSpots[k], parkSpots[m]] = [parkSpots[m], parkSpots[k]]; }
  parkSpots.slice(0, 14).forEach((s) => { const [sub, color] = combos[ci++ % combos.length]; ents.push({ id: id('c'), t: 'car', sub: sub === 'bus' ? 'car' : sub, color, x: s.x, z: s.z, rot: s.rot, parked: true }); });
  // مخالفات: واقفة على الرصيف بزاوية عند زاوية بلوك
  const illegalColors = COLOR_KEYS.slice().sort(() => R() - 0.5).slice(0, 5);
  illegalColors.forEach((color, k) => {
    const bi = Math.floor(R() * CITY.N), bj = Math.floor(R() * CITY.N); const sx = R() < 0.5 ? -1 : 1, sz = R() < 0.5 ? -1 : 1;
    ents.push({ id: id('c'), t: 'car', sub: 'car', color, x: blockAt(bi) + sx * (CITY.BLOCK / 2 + 0.6), z: blockAt(bj) + sz * (CITY.BLOCK / 2 + 0.6) + k * 0.01, rot: 0.6 + R(), parked: true, illegal: true });
  });

  // ---- المشاة ----
  const shirts = COLOR_KEYS.filter((c) => c !== 'black');
  let pi = 0;
  for (let bi = 0; bi < CITY.N; bi++) for (let bj = 0; bj < CITY.N; bj++) {
    const cnt = 1 + Math.floor(R() * 2);
    for (let k = 0; k < cnt; k++) {
      const { kf, period } = buildWalkLoop(bi, bj, 0.9 + k * 0.7, 1.3 + R() * 0.7, R() < 0.5);
      ents.push({ id: id('p'), t: 'person', color: shirts[pi % shirts.length], hat: (pi++ % 3) === 0, kf, period, phase: R() * period });
    }
  }
  // جالسون بالحدائق والساحات
  buildings.filter((b) => b.kind === 'park' || b.kind === 'plaza').forEach((b) => {
    for (let k = 0; k < 3; k++) {
      const x = b.x + (R() - 0.5) * (b.w - 4), z = b.z + (R() - 0.5) * (b.d - 4);
      ents.push({ id: id('r'), t: 'prop', sub: 'bench', color: pick(['green', 'orange', 'blue', 'purple']), x, z, rot: Math.floor(R() * 4) * Math.PI / 2 });
      if (k < 2) ents.push({ id: id('p'), t: 'person', color: shirts[pi++ % shirts.length], hat: k === 0, x, z: z + 0.01, rot: 0, sit: true });
    }
  });

  // ---- عناصر الشارع ----
  const propSubs = ['mailbox', 'hydrant', 'billboard', 'parkedbike', 'kiosk'];
  const propColors = { mailbox: ['red', 'blue', 'yellow', 'green'], hydrant: ['red', 'yellow', 'blue'], billboard: ['pink', 'teal', 'orange', 'purple', 'green'], parkedbike: ['red', 'blue', 'green', 'orange', 'white'], kiosk: ['teal', 'pink', 'yellow'] };
  propSubs.forEach((sub) => propColors[sub].forEach((color) => {
    const bi = Math.floor(R() * CITY.N), bj = Math.floor(R() * CITY.N); const side = Math.floor(R() * 4), off = (R() - 0.5) * (CITY.BLOCK - 4);
    const e = CITY.BLOCK / 2 + 0.2; const px = [off, e, off, -e][side], pz = [-e, off, e, off][side];
    ents.push({ id: id('r'), t: 'prop', sub, color, x: blockAt(bi) + px, z: blockAt(bj) + pz, rot: side * Math.PI / 2 });
  }));

  return { seed, size: CITY_SIZE, buildings, ents };
}

/** مفتاح وصف العنصر — يُستخدم لتوليد نص المهمة والتأكد أن الوصف فريد داخل المدينة. */
export function descKey(e) {
  if (e.t === 'car') return ['car', e.sub, e.color, e.illegal ? 'illegal' : e.parked ? 'parked' : 'moving'].join(':');
  if (e.t === 'person') return ['person', e.color, e.hat ? 'hat' : 'nohat', e.sit ? 'sit' : 'walk'].join(':');
  if (e.t === 'prop') return ['prop', e.sub, e.color].join(':');
  return 'x:' + e.id;
}

/** نص المهمة باللهجة السعودية من مفتاح الوصف. */
export function describe(key) {
  const p = key.split(':');
  if (p[0] === 'car') {
    const s = CAR_SUBS[p[1]] || CAR_SUBS.car; const col = COLORS[p[2]][s.g];
    if (p[3] === 'illegal') return `فيه ${s.n} ${col} واقفة بمكان ممنوع فوق الرصيف، دوّر عليها وحددها!`;
    if (p[3] === 'parked') return `دوّر على ${s.n} ${col} واقف${s.g === 'f' ? 'ة' : ''} بالمواقف على جنب الشارع وحدد${s.g === 'f' ? 'ها' : 'ه'}.`;
    return `فيه ${s.n} ${col} ${s.g === 'f' ? 'تمشي' : 'يمشي'} بشوارع المدينة، الحق${s.g === 'f' ? 'ها' : 'ه'} وحدد${s.g === 'f' ? 'ها' : 'ه'}!`;
  }
  if (p[0] === 'person') {
    const col = COLORS[p[1]].m;
    return `دوّر على شخص لابس ${col}${p[2] === 'hat' ? ' وعليه قبعة' : ' وبدون قبعة'}${p[3] === 'sit' ? ' وجالس بالحديقة' : ' ويتمشى بالشارع'}.`;
  }
  if (p[0] === 'prop') { const s = PROP_SUBS[p[1]]; return `وين ${s.n} ال${COLORS[p[2]][s.g]}؟ حدد${s.g === 'f' ? 'ها' : 'ه'} بسرعة.`; }
  return '';
}

/** العناصر التي وصفها فريد تمامًا داخل المدينة — فقط هذي تصلح أهدافًا لمهمات «العثور». */
export function uniqueFindables(world) {
  const count = new Map();
  for (const e of world.ents) { const k = descKey(e); count.set(k, (count.get(k) || 0) + 1); }
  return world.ents.filter((e) => count.get(descKey(e)) === 1).map((e) => ({ id: e.id, key: descKey(e) }));
}

export function buildingLabel(b) { return BUILDING_KINDS[b.kind] || 'مبنى'; }
