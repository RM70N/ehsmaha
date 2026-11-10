// رسم مخطط علوي (SVG→PNG) للمراجعة: node draw-map.mjs dump.json mapId out.png [lv]
import fs from 'node:fs'; import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
const [dumpf, mid, out, lvs] = process.argv.slice(2); const lv = Number(lvs || 0); const d = JSON.parse(fs.readFileSync(dumpf))[mid]; const m = d.map; const S = 22;
const X = (x) => 10 + (x + m.w / 2) * S, Z = (z) => 10 + (z + m.d / 2) * S; const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${m.w * S + 20}" height="${m.d * S + 20}"><rect width="100%" height="100%" fill="#181426"/>`;
for (const r of m.rooms) if ((r.lv || 0) === lv) s += `<rect x="${X(r.x0)}" y="${Z(r.z0)}" width="${(r.x1 - r.x0) * S}" height="${(r.z1 - r.z0) * S}" fill="${hex(r.c1)}"/><text x="${X(r.x0) + 4}" y="${Z(r.z0) + 14}" font-size="11" fill="#000">${r.id}</text>`;
const nxz = d.nx * d.nz; for (const k of d.seen || []) { if (Math.floor(k / nxz) !== lv) continue; const j = Math.floor((k % nxz) / d.nx), i = k % d.nx; s += `<rect x="${X(i * 0.4 - m.w / 2) - 1}" y="${Z(j * 0.4 - m.d / 2) - 1}" width="2" height="2" fill="#78ffa0"/>`; }
const rect = (o, f) => { if (![lv, 2].includes(o.lv || 0)) return; s += `<rect x="${X(o.x - o.w / 2)}" y="${Z(o.z - o.d / 2)}" width="${o.w * S}" height="${o.d * S}" fill="${f}"/>`; };
m.solids.forEach((o) => rect(o, '#4682dc')); m.walls.forEach((o) => rect(o, '#e6e6f0'));
for (const o of m.doors) { if (![lv, 2].includes(o.lv || 0)) continue; const hw = o.ax === 'x' ? o.w / 2 : 0.25, hd = o.ax === 'z' ? o.w / 2 : 0.25; s += `<rect x="${X(o.x - hw)}" y="${Z(o.z - hd)}" width="${hw * 2 * S}" height="${hd * 2 * S}" fill="none" stroke="#ffd23c"/>`; }
for (const st of m.stairs) s += `<rect x="${X(st.x0)}" y="${Z(st.z0)}" width="${(st.x1 - st.x0) * S}" height="${(st.z1 - st.z0) * S}" fill="none" stroke="#ff783c" stroke-width="2"/>`;
for (const p of m.props) if ((p.lv || 0) === lv) s += `<circle cx="${X(p.x)}" cy="${Z(p.z)}" r="5" fill="#fa5a8c"/>`;
s += `<circle cx="${X(m.gate.x)}" cy="${Z(m.gate.z)}" r="9" fill="none" stroke="#ff0" stroke-width="3"/></svg>`;
const b = await chromium.launch({ args: ['--no-sandbox'] }); const pg = await b.newPage({ viewport: { width: m.w * S + 20, height: m.d * S + 20 } }); await pg.setContent('<body style="margin:0">' + s); await pg.screenshot({ path: out }); await b.close();
