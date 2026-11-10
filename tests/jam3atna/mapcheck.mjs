// فحص معماري آلي للخرائط: اتصال الغرف، وصول المفتش لكل غرض، تداخل الأغراض، حدود الخريطة، الدرج.
// node tests/jam3atna/mapcheck.mjs [mapId] [--dump out.json]
import fs from 'node:fs';
import { MAPS, MAP_IDS, KINDS, PROP, hitsWall, updateLevel, stairAt, LH } from '../../jam3atna/shared/prop-sim.js';
const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null; const dump = process.argv.includes('--dump') ? process.argv[process.argv.indexOf('--dump') + 1] : null;
export function analyze(id) {
  const map = MAPS[id]; const issues = []; const G = 0.4, R = 0.45; const nx = Math.ceil(map.w / G), nz = Math.ceil(map.d / G);
  const circles = map.props.map((p, i) => ({ i, x: p.x, z: p.z, r: KINDS[p.kind].r, lv: p.lv || 0, kind: p.kind }));
  // 1) الأغراض: داخل الحدود، لا تتداخل مع الجدران/المجسمات، ولا مع بعضها
  for (const c of circles) {
    if (hitsWall(map, c.x, c.z, c.r - 0.03, c.lv)) issues.push(`غرض داخل جدار/مجسم/خارج الحدود: ${c.kind} @(${c.x},${c.z}) lv${c.lv}`);
    for (const d of circles) if (d.i > c.i && d.lv === c.lv && Math.hypot(c.x - d.x, c.z - d.z) < c.r + d.r - 0.05) issues.push(`تداخل أغراض: ${c.kind}/${d.kind} @(${c.x},${c.z})`);
  }
  const free = (x, z, lv) => !hitsWall(map, x, z, R, lv) && !circles.some((c) => (c.lv === lv) && Math.hypot(x - c.x, z - c.z) < R + c.r - 0.05);
  // 2) تدفق (BFS) من البوابة عبر الطوابق
  const key = (i, j, lv) => (lv * nz + j) * nx + i; const seen = new Set(); const q = [];
  const gi = Math.round((map.gate.x + map.w / 2) / G), gj = Math.round((map.gate.z + map.d / 2) / G); const start = [gi, gj, map.gate.lv || 0];
  if (!free(map.gate.x, map.gate.z, start[2])) issues.push('البوابة داخل عائق');
  q.push(start); seen.add(key(...start));
  while (q.length) {
    const [i, j, lv] = q.shift(); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue; const x = ni * G - map.w / 2, z = nj * G - map.d / 2;
      let L = lv; const st = stairAt(map, x, z); const p = { x, z, lv: L }; if (st) L = updateLevel(map, p);
      if (!free(x, z, L)) continue; if (di && dj && (!free(i * G - map.w / 2 + di * G, j * G - map.d / 2, L) || !free(i * G - map.w / 2, j * G - map.d / 2 + dj * G, L))) continue;
      const k = key(ni, nj, L); if (seen.has(k)) continue; seen.add(k); q.push([ni, nj, L]);
    }
  }
  // 3) كل غرض يصله المفتش (خلية مجاورة بمدى الفحص) + كل غرفة فيها خلايا مفتوحة قابلة للوصول
  let unreach = 0; for (const c of circles) { let ok = false; for (let a = 0; a < 16 && !ok; a++) for (const rr of [c.r + 0.7, c.r + 1.4, c.r + 2.4]) { const x = c.x + Math.cos(a / 16 * 6.283) * rr, z = c.z + Math.sin(a / 16 * 6.283) * rr; const i = Math.round((x + map.w / 2) / G), j = Math.round((z + map.d / 2) / G); if (seen.has(key(i, j, c.lv)) && !hitsWall(map, x, z, R, c.lv)) { ok = true; break; } } if (!ok) { unreach++; issues.push(`غرض لا يصله المفتش: ${c.kind} @(${c.x},${c.z}) lv${c.lv}`); } }
  const roomRep = []; for (const r of map.rooms) { let n = 0, tot = 0; const bad = []; for (let x = r.x0 + 0.6; x < r.x1 - 0.6; x += 0.8) for (let z = r.z0 + 0.6; z < r.z1 - 0.6; z += 0.8) { if (!free(x, z, r.lv)) continue; tot++; const i = Math.round((x + map.w / 2) / G), j = Math.round((z + map.d / 2) / G); let near = false; for (let a = -1; a <= 1 && !near; a++) for (let c = -1; c <= 1; c++) if (seen.has(key(i + a, j + c, r.lv))) { near = true; break; } if (near) n++; else bad.push([+x.toFixed(1), +z.toFixed(1)]); } roomRep.push([r.id, n, tot]); if (tot > 3 && n / tot < 0.9) issues.push(`غرفة غير متصلة: ${r.id} (${n}/${tot}) مثال: ${JSON.stringify(bad.slice(0, 4))}`); if (tot <= 3 && r.spawn !== false && (r.x1 - r.x0) * (r.z1 - r.z0) > 12) issues.push(`غرفة شبه مسدودة: ${r.id}`); }
  // 4) تغطية: نسبة المساحة القابلة للسير وكثافة الأغراض
  let walk = 0, lvTot = [0, 0]; for (const k of seen) { walk++; lvTot[Math.floor(k / (nx * nz))]++; }
  // 5) الدرج: لا يوجد طابق 1 بدون وصول
  if (map.rooms.some((r) => r.lv === 1) && lvTot[1] < 30) issues.push('الطابق العلوي غير قابل للوصول');
  const stats = { props: map.props.length, walls: map.walls.length, solids: map.solids.length, doors: map.doors.length, rooms: map.rooms.length, kinds: new Set(map.props.map((p) => p.kind)).size, walkM2: Math.round(walk * G * G), lv: lvTot.map((v) => Math.round(v * G * G)) };
  return { id, issues, stats, roomRep, seen: dump ? [...seen] : null, nx, nz };
}
if (process.argv[1].endsWith('mapcheck.mjs')) {
  let bad = 0; const out = {};
  for (const id of only ? [only] : MAP_IDS) { const r = analyze(id); console.log((r.issues.length ? 'FAIL ' : 'PASS ') + id, JSON.stringify(r.stats)); r.issues.slice(0, 25).forEach((x) => console.log('   - ' + x)); if (r.issues.length > 25) console.log('   ... +' + (r.issues.length - 25)); bad += r.issues.length; out[id] = { map: MAPS[id], seen: r.seen, nx: r.nx, nz: r.nz }; }
  if (dump) fs.writeFileSync(dump, JSON.stringify(out)); process.exit(bad ? 1 : 0);
}
