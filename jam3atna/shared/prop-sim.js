// جمعتنا — مين المتنكر؟: تعريف الخرائط والأغراض والتصادم (مشترك بين الخادم والعميل، حتمي).
// الخادم يولّد توزيع الأغراض لكل جولة ويرسله؛ العميل يستخدم نفس دالة الحركة للتنبؤ المحلي فقط.
import { rng32 } from './city-sim.js';

/** r: نصف قطر التصادم، h: الارتفاع التقريبي (للكاميرا/الواجهة). */
export const KINDS = {
  shelf: { n: 'رف بضائع', r: 1.0, h: 2.2 }, cart: { n: 'عربة تسوق', r: 0.6, h: 1.1 }, box: { n: 'كرتون', r: 0.5, h: 0.8 },
  fridge: { n: 'ثلاجة عرض', r: 0.8, h: 2.1 }, sign: { n: 'لوحة أسعار', r: 0.4, h: 1.7 }, register: { n: 'كاشير', r: 0.8, h: 1.2 },
  crate: { n: 'صندوق خشب', r: 0.6, h: 0.9 }, barrel: { n: 'برميل', r: 0.5, h: 1.1 },
  desk: { n: 'طاولة مدرسية', r: 0.65, h: 0.9 }, chair: { n: 'كرسي', r: 0.4, h: 1.0 }, board: { n: 'سبورة', r: 0.9, h: 2.0 },
  locker: { n: 'خزانة', r: 0.5, h: 2.0 }, bookshelf: { n: 'رف كتب', r: 0.9, h: 2.2 }, labtable: { n: 'طاولة مختبر', r: 0.9, h: 1.0 },
  globe: { n: 'مجسم كرة أرضية', r: 0.4, h: 1.2 }, plant: { n: 'نبتة', r: 0.45, h: 1.4 },
  sofa: { n: 'كنبة', r: 1.0, h: 1.0 }, armchair: { n: 'كرسي فخم', r: 0.6, h: 1.1 }, dtable: { n: 'طاولة طعام', r: 1.1, h: 0.9 },
  bed: { n: 'سرير', r: 1.2, h: 0.9 }, statue: { n: 'تمثال', r: 0.5, h: 2.0 }, vase: { n: 'مزهرية', r: 0.35, h: 1.0 },
  lamp: { n: 'أباجورة', r: 0.35, h: 1.8 }, curtain: { n: 'ستارة', r: 0.6, h: 2.4 },
  arcade: { n: 'جهاز ألعاب', r: 0.6, h: 2.0 }, kiosk: { n: 'كشك', r: 1.0, h: 2.2 }, bench: { n: 'مقعد', r: 0.8, h: 0.9 },
  mascot: { n: 'مجسم دبدوب', r: 0.6, h: 1.8 }, toyblock: { n: 'مكعب ألعاب', r: 0.5, h: 0.9 }, horse: { n: 'حصان دوّار', r: 0.6, h: 1.5 },
};

const W = 44, D = 32;
// الجدران: مستطيلات [x مركز, z مركز, عرض, عمق]. الفتحات (الأبواب) هي الفراغات بينها.
export const MAPS = {
  market: {
    name: 'السوبرماركت', w: W, d: D, floor: 0x2a2440, wall: 0x4b3f78, accent: 0x34d399,
    walls: [[10, -6, 0.6, 20], [10, 12, 0.6, 8], [16, 2, 12, 0.6]],
    gate: [-19, 13], hide: [0, 0],
    rows: [
      { kind: 'shelf', x0: -15, z0: -11, nx: 5, nz: 4, dx: 5, dz: 4.6, rot: 0 },
      { kind: 'register', x0: -14, z0: 9, nx: 4, nz: 1, dx: 5, dz: 0, rot: 0 },
      { kind: 'fridge', x0: -20.6, z0: -12, nx: 1, nz: 6, dx: 0, dz: 3.2, rot: Math.PI / 2 },
      { kind: 'crate', x0: 13, z0: -13, nx: 4, nz: 2, dx: 2.2, dz: 2.2, rot: 0 },
    ],
    scatter: [['cart', 9], ['box', 12], ['sign', 6], ['barrel', 5], ['crate', 6], ['plant', 3]],
  },
  school: {
    name: 'المدرسة', w: W, d: D, floor: 0x2b2a3a, wall: 0x5b4a8a, accent: 0xf5c451,
    walls: [[-8, -3, 28, 0.6], [14, -3, 8, 0.6], [0, -11, 0.6, 10], [-8, 3, 28, 0.6], [16, 3, 12, 0.6], [2, 11, 0.6, 10]],
    gate: [20, 0], hide: [0, 0],
    rows: [
      { kind: 'desk', x0: -19, z0: -13.5, nx: 4, nz: 3, dx: 4.4, dz: 3.2, rot: 0, chair: true },
      { kind: 'desk', x0: 4, z0: -13.5, nx: 4, nz: 3, dx: 4.4, dz: 3.2, rot: 0, chair: true },
      { kind: 'locker', x0: -20, z0: 0, nx: 9, nz: 1, dx: 1.3, dz: 0, rot: 0 },
      { kind: 'bookshelf', x0: -19, z0: 6.5, nx: 4, nz: 3, dx: 5, dz: 3.4, rot: 0 },
      { kind: 'labtable', x0: 6, z0: 7, nx: 3, nz: 2, dx: 5.4, dz: 5, rot: 0 },
    ],
    scatter: [['chair', 10], ['board', 4], ['globe', 5], ['plant', 5], ['box', 5]],
  },
  palace: {
    name: 'القصر', w: W, d: D, floor: 0x2c1f33, wall: 0x6b3f6e, accent: 0xf472b6,
    walls: [[-6, -8, 0.6, 16], [-6, 11, 0.6, 10], [8, -11, 0.6, 10], [8, 8, 0.6, 16], [-14, 2, 16, 0.6], [16, -2, 12, 0.6]],
    gate: [0, 13.5], hide: [0, 0],
    rows: [
      { kind: 'bookshelf', x0: -20.5, z0: -14, nx: 1, nz: 4, dx: 0, dz: 3, rot: Math.PI / 2 },
      { kind: 'curtain', x0: -3, z0: -15, nx: 4, nz: 1, dx: 3, dz: 0, rot: 0 },
      { kind: 'statue', x0: -3.5, z0: -5, nx: 2, nz: 3, dx: 9, dz: 5, rot: 0 },
    ],
    scatter: [['sofa', 6], ['armchair', 9], ['dtable', 4], ['bed', 3], ['vase', 9], ['lamp', 8], ['plant', 5], ['chair', 8], ['statue', 3]],
  },
  funland: {
    name: 'مدينة الألعاب', w: W, d: D, floor: 0x1f2a44, wall: 0x3b5aa0, accent: 0xfb923c,
    walls: [[-10, -9, 0.6, 14], [-10, 11, 0.6, 10], [10, -11, 0.6, 10], [10, 9, 0.6, 14]],
    gate: [0, -13.5], hide: [0, 0],
    rows: [
      { kind: 'arcade', x0: -20.5, z0: -13, nx: 1, nz: 7, dx: 0, dz: 2.2, rot: Math.PI / 2 },
      { kind: 'arcade', x0: 20.5, z0: -5, nx: 1, nz: 7, dx: 0, dz: 2.2, rot: -Math.PI / 2 },
      { kind: 'horse', x0: -3, z0: -2, nx: 3, nz: 2, dx: 3, dz: 3.4, rot: 0 },
      { kind: 'kiosk', x0: -16, z0: 10, nx: 2, nz: 1, dx: 30, dz: 0, rot: 0 },
    ],
    scatter: [['bench', 8], ['mascot', 7], ['toyblock', 12], ['barrel', 5], ['sign', 5], ['plant', 4], ['kiosk', 2]],
  },
};
export const MAP_IDS = Object.keys(MAPS);

function hitsWall(map, x, z, r) {
  if (Math.abs(x) > map.w / 2 - r || Math.abs(z) > map.d / 2 - r) return true;
  for (const w of map.walls) {
    const dx = Math.max(Math.abs(x - w[0]) - w[2] / 2, 0), dz = Math.max(Math.abs(z - w[1]) - w[3] / 2, 0);
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}
function hitsCircles(circles, x, z, r, skipId) {
  for (const c of circles) {
    if (skipId != null && c.id === skipId) continue;
    const rr = r + c.r, dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz < rr * rr) return true;
  }
  return false;
}

/** خطوة حركة مع انزلاق على الجدران والأغراض. circles: [{id,x,z,r}]. يرجع {x,z}. */
export function stepMove(map, x, z, dx, dz, r, circles, skipId) {
  let nx = x + dx, nz = z + dz;
  if (!hitsWall(map, nx, nz, r) && !hitsCircles(circles, nx, nz, r, skipId)) return { x: nx, z: nz };
  if (dx && !hitsWall(map, x + dx, z, r) && !hitsCircles(circles, x + dx, z, r, skipId)) return { x: x + dx, z };
  if (dz && !hitsWall(map, x, z + dz, r) && !hitsCircles(circles, x, z + dz, r, skipId)) return { x, z: z + dz };
  return { x, z };
}

/** توزيع أغراض الخريطة لجولة واحدة من seed. يرجع [{kind,x,z,rot,r}] (بدون معرّفات — الخادم يعطيها معرّفات عشوائية). */
export function genLayout(mapId, seed) {
  const map = MAPS[mapId]; const R = rng32(seed); const out = [];
  const free = (x, z, r) => !hitsWall(map, x, z, r + 0.15) && !hitsCircles(out, x, z, r + 0.25) && Math.hypot(x - map.gate[0], z - map.gate[1]) > 4.5;
  const put = (kind, x, z, rot) => { const r = KINDS[kind].r; if (!free(x, z, r)) return false; out.push({ kind, x: +x.toFixed(2), z: +z.toFixed(2), rot: +rot.toFixed(2), r }); return true; };
  for (const row of map.rows) for (let a = 0; a < row.nx; a++) for (let b = 0; b < row.nz; b++) {
    if (R() < 0.12) continue; // فراغات عشوائية حتى لا يكون «النقص» دليلاً
    const x = row.x0 + a * row.dx + (R() - 0.5) * 0.3, z = row.z0 + b * row.dz + (R() - 0.5) * 0.3;
    put(row.kind, x, z, row.rot + (R() - 0.5) * 0.12);
    if (row.chair && R() < 0.8) put('chair', x, z + 1.4, Math.PI + (R() - 0.5) * 0.5);
  }
  for (const [kind, n] of map.scatter) for (let k = 0; k < n; k++) {
    for (let tries = 0; tries < 30; tries++) {
      const x = (R() - 0.5) * (map.w - 3), z = (R() - 0.5) * (map.d - 3);
      if (put(kind, x, z, R() * Math.PI * 2)) break;
    }
  }
  return out;
}

/** مكان خالٍ قريب من نقطة (لولادة اللاعبين). */
export function freeSpotNear(map, circles, x, z, r, R) {
  for (let k = 0; k < 200; k++) {
    const a = R() * Math.PI * 2, d = (k / 200) * 9;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (!hitsWall(map, px, pz, r + 0.1) && !hitsCircles(circles, px, pz, r + 0.2)) return { x: px, z: pz };
  }
  return { x, z };
}
export const PROP = { SPEED_HIDER: 4.2, SPEED_SEEKER: 5.2, INSPECT_RANGE: 3.4, SWAP_RANGE: 3.2, TICK: 1000 / 15 };
