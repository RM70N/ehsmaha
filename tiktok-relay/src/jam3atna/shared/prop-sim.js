// جمعتنا — مين المتنكر؟: الخرائط والتصادم (مشترك بين الخادم والعميل، حتمي).
// الخادم يولّد توزيع الأغراض لكل جولة ويرسله؛ العميل يستخدم نفس دالة الحركة للتنبؤ المحلي فقط.
import { rng32 } from './city-sim.js';
import { KINDS, lvMatch, levelY, stairAt, stairT, updateLevel, LH, WH, T } from './prop-core.js';
import { hospital } from './maps/hospital.js';
import { house } from './maps/house.js';
import { school } from './maps/school.js';
import { market } from './maps/market.js';
import { hotel } from './maps/hotel.js';
import { funland } from './maps/funland.js';

export { KINDS, levelY, stairAt, stairT, updateLevel, LH, WH, T };
export const MAPS = { hospital: hospital(), house: house(), school: school(), market: market(), hotel: hotel(), funland: funland() };
export const MAP_IDS = Object.keys(MAPS);
export const PROP = { SPEED_HIDER: 4.2, SPEED_SEEKER: 5.2, INSPECT_RANGE: 3.4, SWAP_RANGE: 3.2, TICK: 1000 / 15 };

const rectHit = (w, x, z, r) => { const dx = Math.max(Math.abs(x - w.x) - w.w / 2, 0), dz = Math.max(Math.abs(z - w.z) - w.d / 2, 0); return dx * dx + dz * dz < r * r; };
export function hitsWall(map, x, z, r, lv = 0) {
  if (Math.abs(x) > map.w / 2 - r || Math.abs(z) > map.d / 2 - r) return true;
  for (const w of map.walls) if (lvMatch(w, lv) && rectHit(w, x, z, r)) return true;
  for (const s of map.solids) if (s.hit !== false && lvMatch(s, lv) && rectHit(s, x, z, r)) return true;
  return false;
}
function hitsCircles(circles, x, z, r, skipId, lv) {
  for (const c of circles) {
    if (skipId != null && c.id === skipId) continue; if ((c.lv || 0) !== lv) continue;
    const rr = r + c.r, dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz < rr * rr) return true;
  }
  return false;
}
/** خطوة حركة مع انزلاق على الجدران والأغراض. circles: [{id,x,z,r,lv}]. */
export function stepMove(map, x, z, dx, dz, r, circles, skipId, lv = 0) {
  const ok = (px, pz) => !hitsWall(map, px, pz, r, lv) && !hitsCircles(circles, px, pz, r, skipId, lv);
  if (ok(x + dx, z + dz)) return { x: x + dx, z: z + dz };
  if (dx && ok(x + dx, z)) return { x: x + dx, z };
  if (dz && ok(x, z + dz)) return { x, z: z + dz };
  return { x, z };
}

/** توزيع أغراض الخريطة لجولة: التخطيط المعماري ثابت، مع حذف عشوائي بسيط حتى لا يصير «النقص» دليلاً. */
export function genLayout(mapId, seed) {
  const map = MAPS[mapId]; const R = rng32(seed); const out = [];
  for (const p of map.props) { if (R() < 0.07 && !p.keep) continue; out.push({ kind: p.kind, x: p.x, z: p.z, rot: +(p.rot + (R() - 0.5) * 0.1).toFixed(2), lv: p.lv || 0, r: KINDS[p.kind].r }); }
  return out;
}
/** مكان خالٍ قريب من نقطة (لولادة اللاعبين). */
export function freeSpotNear(map, circles, x, z, r, R, lv = 0) {
  for (let k = 0; k < 300; k++) {
    const a = R() * Math.PI * 2, d = (k / 300) * 10;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (!hitsWall(map, px, pz, r + 0.1, lv) && !hitsCircles(circles, px, pz, r + 0.25, null, lv)) return { x: px, z: pz, lv };
  }
  return { x, z, lv };
}
/** نقطة ولادة عشوائية داخل غرفة حقيقية (لا خارج الخريطة ولا داخل أثاث). */
export function randomSpot(map, circles, r, R) {
  const rooms = map.rooms.filter((q) => (q.spawn !== false) && (q.x1 - q.x0) * (q.z1 - q.z0) > 12);
  for (let k = 0; k < 80; k++) {
    const q = rooms[Math.floor(R() * rooms.length)]; const x = q.x0 + 1 + R() * (q.x1 - q.x0 - 2), z = q.z0 + 1 + R() * (q.z1 - q.z0 - 2);
    if (Math.hypot(x - map.gate.x, z - map.gate.z) < 6 && q.lv === 0) continue; if (stairAt(map, x, z)) continue;
    if (!hitsWall(map, x, z, r + 0.15, q.lv) && !hitsCircles(circles, x, z, r + 0.3, null, q.lv)) return { x, z, lv: q.lv };
  }
  return freeSpotNear(map, circles, 0, 0, r, R, 0);
}
