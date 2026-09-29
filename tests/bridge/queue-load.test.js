'use strict';
// اختبار حمل: N ستريمر (50/200/500) يربطون بنفس اللحظة على سيرفر الجسر، ومزوّد توقيع محاكى بحد معدل صارم
// (token bucket لكل مفتاح: يرمي 429 حقيقي SignatureRateLimitError عند التجاوز).
// يقارن "قبل" (server.js من commit 0461fef: بلا طابور) و"بعد" (الطابور + AIMD + قواطع) بنفس الحد.
//   node tests/bridge/queue-load.test.js [sizes=50,200,500] [--baseline] [--out=file.json]
// ⚠️ الأرقام لمزوّد محاكى بحدود أحددها أنا؛ حد Euler الحقيقي لخطتك مجهول — اضبط TIKTOK_CONNECT_RATE_PER_MIN عليه.
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const WebSocket = require(path.join(__dirname, '../../tiktok-server/node_modules/ws'));

const args = process.argv.slice(2);
const sizes = ((args.find((a) => /^\d+(,\d+)*$/.test(a)) || '50,200,500')).split(',').map(Number);
const withBaseline = args.includes('--baseline');
const outFile = (args.find((a) => a.startsWith('--out=')) || '').slice(6);
const WINDOW_MS = Number(process.env.LOAD_WINDOW_MS || 180000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let nextPort = 18600;

async function startBridge(env, serverFile) {
  const port = nextPort++, ctlPort = port + 1000;
  const child = spawn(process.execPath, [path.join(__dirname, 'start-server.js')], {
    env: Object.assign({}, process.env, { PORT: String(port), CTL_PORT: String(ctlPort), BRIDGE_HEARTBEAT_MS: '20000', BRIDGE_SERVER_FILE: serverFile || 'server.js', EULER_API_KEY: '', EULER_SIGN_API_KEY: '', SIGN_API_KEY: '', EULER_API_KEYS: '', TIKTOK_PROXIES: '', TIKTOK_SIGN_FALLBACK_URLS: '' }, env || {}),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 100; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/healthz'); if (r.ok) break; } catch (e) { /* not yet */ } await sleep(100); }
  return {
    port, ctlPort, log: () => log,
    ctl: (b) => fetch('http://127.0.0.1:' + ctlPort + '/ctl', { method: 'POST', body: JSON.stringify(b) }).then((r) => r.json()),
    stats: () => fetch('http://127.0.0.1:' + ctlPort + '/stats').then((r) => r.json()),
    health: () => fetch('http://127.0.0.1:' + port + '/health').then((r) => r.json()).catch(() => null),
    stop: () => { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } },
  };
}

const pct = (arr, p) => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };

async function run(label, n, env, mock, serverFile) {
  const b = await startBridge(env, serverFile);
  await b.ctl({ cmd: 'euler', perSec: mock.perSec, burst: mock.burst, latencyMs: mock.latencyMs, retryAfterSec: mock.retryAfterSec });
  const t0 = Date.now();
  const cs = [];
  for (let i = 0; i < n; i++) {
    const ws = new WebSocket('ws://127.0.0.1:' + b.port + '/ws?u=load' + i);
    const c = { ws, i, at: null, fatal: false, errorSeen: false, badText: false, queued: false };
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.type !== 'bridge_status') return;
      if (m.state === 'connected' && c.at == null) c.at = Date.now() - t0;
      if (m.fatal) c.fatal = true;
      if (m.state === 'error') c.errorSeen = true;
      if (/مزدحمة|انتظر دقيقة/.test(m.message || '')) c.badText = true;
      if (m.code === 'queued') c.queued = true;
    });
    ws.on('error', () => {});
    cs.push(c);
  }
  let peakWaiting = 0, peakRss = 0;
  const sampler = setInterval(async () => { const h = await b.health(); if (h) { peakWaiting = Math.max(peakWaiting, h.queue ? h.queue.waiting : 0); peakRss = Math.max(peakRss, h.memoryMb || 0); } }, 1000);
  while (Date.now() - t0 < WINDOW_MS && cs.some((c) => c.at == null)) await sleep(200);
  clearInterval(sampler);
  const st = await b.stats();
  const h = await b.health();
  const times = cs.filter((c) => c.at != null).map((c) => c.at);
  const calls = Object.values(st.eulerCalls).reduce((a, x) => a + x, 0);
  const rejected = Object.values(st.euler429).reduce((a, x) => a + x, 0);
  const res = {
    label, streamers: n, successPct: Math.round((times.length / n) * 1000) / 10, connected: times.length,
    timeToConnectedSec: { avg: times.length ? Math.round(times.reduce((a, x) => a + x, 0) / times.length / 100) / 10 : null, p50: times.length ? pct(times, 0.5) / 1000 : null, p95: times.length ? pct(times, 0.95) / 1000 : null, max: times.length ? Math.max(...times) / 1000 : null },
    providerCalls: calls, providerRejected429: rejected, rejectedPct: calls ? Math.round((rejected / calls) * 1000) / 10 : 0,
    peakInflightSignCalls: st.eulerInflightMax, peakQueueWaiting: peakWaiting, peakRssMb: peakRss || (h && h.memoryMb),
    maxConnectionsPerUser: Math.max(0, ...Object.values(st.maxActiveByUser)), peakLiveUpstream: st.peakLive,
    usersSawFatal: cs.filter((c) => c.fatal).length, usersSawErrorState: cs.filter((c) => c.errorSeen).length, usersSawBusyText: cs.filter((c) => c.badText).length, usersSawQueuePosition: cs.filter((c) => c.queued).length,
    serverRate429Log: (b.log().match(/kind=rate_limited/g) || []).length,
  };
  cs.forEach((c) => { try { c.ws.terminate(); } catch (e) { /* ignore */ } });
  b.stop();
  await sleep(300);
  return res;
}

function row(r) {
  return [r.label.padEnd(30), String(r.streamers).padStart(4), (r.successPct + '%').padStart(7), String(r.timeToConnectedSec.avg).padStart(6) + 's', String(r.timeToConnectedSec.p95).padStart(6) + 's', String(r.timeToConnectedSec.max).padStart(6) + 's', String(r.providerCalls).padStart(6), String(r.providerRejected429).padStart(5), String(r.peakInflightSignCalls).padStart(4), String(r.peakQueueWaiting).padStart(4), String(r.maxConnectionsPerUser).padStart(3), String(r.usersSawFatal).padStart(4)].join(' ');
}

(async () => {
  const all = [];
  // حد المزوّد المحاكى: 20 طلب/ث (دفعة 20)، زمن استجابة 120ms، retry-after=1ث
  const MOCK = { perSec: 20, burst: 20, latencyMs: 120, retryAfterSec: 1 };
  // ضبط السيرفر "بعد": 900 طلب/د لكل مزود (=15/ث، 75% من الحد)، دفعة 10، 8 طلبات متزامنة
  const AFTER_A = { TIKTOK_CONNECT_RATE_PER_MIN: '900', TIKTOK_FREE_RATE_PER_MIN: '900', TIKTOK_CONNECT_BURST: '10', TIKTOK_CONNECT_INFLIGHT: '8', TIKTOK_PROGRESS_TICK_MS: '2000' };
  // ضبط خاطئ متعمّد (أعلى من حد المزود بـ 3 أضعاف): يثبت أن AIMD والقاطع يتكيفان بدل الفشل
  const AFTER_B = { TIKTOK_CONNECT_RATE_PER_MIN: '3600', TIKTOK_FREE_RATE_PER_MIN: '3600', TIKTOK_CONNECT_BURST: '60', TIKTOK_CONNECT_INFLIGHT: '30', TIKTOK_BREAKER_COOLDOWN_MS: '1000', TIKTOK_PROGRESS_TICK_MS: '2000' };

  if (withBaseline) {
    execSync('git show 0461fef:tiktok-server/server.js > ' + JSON.stringify(path.join(__dirname, '../../tiktok-server/server.baseline.tmp.js')), { cwd: path.join(__dirname, '../..') });
  }
  try {
    console.log(['السيناريو'.padEnd(30), 'N'.padStart(4), 'نجاح'.padStart(7), 'متوسط'.padStart(7), 'p95'.padStart(7), 'أقصى'.padStart(7), 'طلبات'.padStart(6), '429'.padStart(5), 'تزامن'.padStart(4), 'طابور'.padStart(4), 'لكل'.padStart(3), 'fatal'.padStart(4)].join(' '));
    for (const n of sizes) {
      if (withBaseline) { const r = await run('قبل (بلا طابور)', n, { TIKTOK_MAX_ATTEMPTS: '' }, MOCK, 'server.baseline.tmp.js'); all.push(r); console.log(row(r)); }
      const a = await run('بعد (ضبط سليم)', n, AFTER_A, MOCK); all.push(a); console.log(row(a));
    }
    const nB = sizes.includes(200) ? 200 : sizes[sizes.length - 1];
    const b2 = await run('بعد (ضبط أعلى 3× من الحد)', nB, AFTER_B, MOCK); all.push(b2); console.log(row(b2));
  } finally {
    if (withBaseline) { try { fs.unlinkSync(path.join(__dirname, '../../tiktok-server/server.baseline.tmp.js')); } catch (e) { /* ignore */ } }
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ mock: MOCK, windowSec: WINDOW_MS / 1000, results: all }, null, 2));
  const after = all.filter((r) => r.label.startsWith('بعد'));
  const ok = after.every((r) => r.successPct >= 99 && r.maxConnectionsPerUser <= 1 && r.usersSawFatal === 0 && r.usersSawBusyText === 0);
  console.log(ok ? 'LOAD OK (>=99% success, 1 connection/user, no fatal, no busy text)' : 'LOAD CRITERIA NOT MET');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
