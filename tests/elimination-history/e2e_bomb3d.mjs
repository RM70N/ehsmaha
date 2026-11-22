// القنبلة المتحركة 3D: جولة كاملة بلاعبين تجريبيين بعد حذف سجل الإقصاء: إقصاء سليم، هدية المقصي لا تُرجعه، المقصي لا ينضم متأخراً، لا أخطاء.
// تشغيل: python3 -m http.server 8790 من جذر المشروع ثم node tests/elimination-history/e2e_bomb3d.mjs
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ✔', n); } else { fail++; console.log('  ✘', n, d !== undefined ? JSON.stringify(d) : ''); } };
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await (await b.newContext({ viewport: { width: 1100, height: 700 } })).newPage(); const errs = [];
pg.on('pageerror', e => { if (!/webgl|WebGL/i.test(e.message)) errs.push(e.message); });
await pg.goto('http://127.0.0.1:8790/bomb3d.html'); await pg.waitForTimeout(1500);
const st = () => pg.evaluate(() => EhsemhaBomb3D.getState());
ok('الإعدادات لا تحوي خيار الإنعاش', await pg.evaluate(() => !('revivalEnabled' in EhsemhaBomb3D.settings()) ));
await pg.evaluate(() => { for (const u of ['a', 'b', 'c', 'd']) EhsemhaBomb3D.join(u, 'ن' + u, '', true); EhsemhaBomb3D.settings({ keyword: 'دخول' }); EhsemhaBomb3D.start(); });
await pg.waitForTimeout(800);
let s = await st(); const n0 = s.players.length; ok('بدأت الجولة', s.status === 'active' && n0 >= 4, { s: s.status, n: n0 });
// إقصاء لاعب بانفجار فعلي
const victim = await pg.evaluate(() => { const G = __B3D.G; const h = G.holder || [...G.part.keys()][0]; __B3D.explode(h); return h; });
await pg.waitForTimeout(1500);
s = await st(); ok('المقصي خرج من اللاعبين', !s.players.some(p => p.id === victim) && s.players.length === n0 - 1, { n: s.players.length });
ok('قائمة المقصين تُشتق من سجل الجولة (elimLog) بلا سجل إقصاء منفصل', Array.isArray(s.eliminated) && s.eliminated.includes(victim));
// هدية من المقصي لا تُرجعه
await pg.evaluate(v => EhsemhaBomb3D.gift(v, 'ن', '', 'وردة', 100), victim); await pg.waitForTimeout(3600);
s = await st(); ok('هدية المقصي لا تُرجعه للعبة', !s.players.some(p => p.id === victim), { n: s.players.length });
// المقصي لا ينضم متأخراً
await pg.evaluate(v => { EhsemhaBomb3D.setLateMode(true); EhsemhaBomb3D.chat({ uid: v, name: 'ن', avatar: '', isFollower: true }, 'دخول', 'tiktok'); }, victim); await pg.waitForTimeout(500);
s = await st(); ok('المقصي لا يعود بالانضمام المتأخر', !s.players.some(p => p.id === victim));
// إكمال الجولة حتى الفائز
for (let i = 0; i < 16; i++) { s = await st(); if (s.status === 'finished' || s.players.length <= 1) break; await pg.evaluate(() => { const G = __B3D.G; const h = G.holder || [...G.part.keys()][0]; if (h) __B3D.explode(h); }); await pg.waitForTimeout(1700); }
await pg.waitForTimeout(3500); s = await st(); ok('انتهت الجولة بفائز', s.status === 'finished' || s.winner, { st: s.status });
ok('لا أخطاء JavaScript', errs.length === 0, errs.slice(0, 3));
await b.close(); console.log(`\nنجح ${pass} / فشل ${fail}`); process.exit(fail ? 1 : 0);
