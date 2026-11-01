'use strict';
// أداء غرفة العمليات تحت ضغط: ٢٠٠ جلسة حيّة + ٣٠٠ حدث + سيل تحديثات؛ نقيس عدد مرات إعادة الرسم وأطول مهمة على خيط الواجهة (أرقام فعلية مطبوعة).
const { boot, mkCheck, sleep } = require('./ops-studio-harness');
const { check, done } = mkCheck();
(async () => {
  const T = await boot(); const { go, fe, he } = T;
  await he(() => { const s = EhsOps.store(); const now = Date.now(); const ss = {}; for (let i = 0; i < 200; i++) ss['s' + i] = { uid: 'u' + i, streamer: 'st' + i, platform: 'tiktok', state: 'live', start: now - 600000, last: now, game: 'rou', nRounds: 1, nDone: 0, parts: 20, rounds: { 1: { game: 'rou', start: now - 300000, state: 'running' } } }; s._root().opsSessions = ss; const ev = {}; for (let i = 0; i < 300; i++) ev['e' + String(i).padStart(4, '0')] = { t: now - i * 1000, type: 'round_start', sev: 'info', game: 'rou', streamer: 'st' + (i % 200), sid: 's' + (i % 200) }; s._root().opsEvents = ev; });
  await fe(() => { window.__paints = 0; window.__lt = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({ entryTypes: ['longtask'] }); } catch (e) {} const sec = Studio.sections.ops; });
  const t0 = Date.now(); await go('ops', 1500); const first = Date.now() - t0;
  const kp = await fe(() => [...document.querySelectorAll('#ops-main .ops-kpi .v')].map((x) => x.textContent.trim()));
  check('تحميل غرفة العمليات بـ٢٠٠ جلسة/٣٠٠ حدث: الأرقام صحيحة (٢٠٠ ستريمر/٢٠٠ راوند/٤٠٠٠ مشارك)', kp[1] === '200' && kp[4] === '200' && /4[,٬]?000/.test(kp[5]), kp);
  // سيل تحديثات: ٢٠٠ تحديث خلال ~٤ ثوانٍ
  await fe(() => { const v = document.getElementById('view-ops'); window.__mut = 0; const obs = new MutationObserver(() => { window.__mut++; }); obs.observe(document.getElementById('ops-main'), { childList: true }); });
  await he(async () => { const s = EhsOps.store(); for (let i = 0; i < 200; i++) { s.update('opsSessions/s' + (i % 200), { last: Date.now(), parts: 20 + (i % 5) }); EhsOps.emit('round_start', { sid: 's' + (i % 200), game: 'rou', k: 'k' + i, dedupeMs: 0 }); await new Promise((r) => setTimeout(r, 20)); } });
  await sleep(1200);
  const stat = await fe(() => ({ repaints: window.__mut, long: window.__lt.length, maxLong: Math.round(Math.max.apply(null, window.__lt.concat([0]))), subs: Ops.liveSubCount() }));
  console.log('أرقام الأداء:', JSON.stringify({ تحميل_أول_ms: first, ...stat }));
  check('التجميع: ٢٠٠ تحديث في ~٤ثوانٍ لا تسبب أكثر من ~٦٠ إعادة رسم (تجميع ٤٠٠م.ث) ', stat.repaints <= 60, stat);
  check('لا مهام طويلة تتجاوز ٥٠٠م.ث على خيط الواجهة أثناء السيل', stat.maxLong < 500, stat);
  check('عدد الاشتراكات ثابت (٣ + اتصال) وليس تراكمياً', stat.subs <= 4, stat);
  await go('home', 300); await sleep(2600);
  check('تنظيف الاشتراكات بعد المغادرة (٠)', (await fe(() => Ops.liveSubCount())) === 0);
  check('بدون أخطاء JS', T.perr.length === 0 && T.ferr.length === 0, { p: T.perr, f: T.ferr });
  await T.browser.close(); process.exit(done() ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
