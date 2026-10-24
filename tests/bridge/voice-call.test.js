'use strict';
// «انصب علي»: المكالمة الواردة + المايك كتجربة كاملة (إذن ← التقاط ← تحويل لنص ← إرسال ← رد المتصل) داخل إطار الموقع مع سيرفري Render محليين ومحاكي Gemini.
// يحتاج: محاكي Gemini + السيرفران (راجع رأس callcenter.test.js). يشغّل Chromium بمايك مزيف (ملف صوتي مولّد: كلام ووقفة قصيرة ثم سكوت).
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/voice-call.test.js
const H = require('./harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 500) : '')); };
const MOCK = 'http://127.0.0.1:' + (process.env.MOCK_GEMINI_PORT || 19500);
const PORTS = { 'ehsmaha-wbkn.onrender.com': 18081, 'ehsmaha.onrender.com': 18082 };
const cfg = (o) => fetch(MOCK + '/__cfg', { method: 'POST', body: JSON.stringify(o) });
const mockCalls = () => fetch(MOCK + '/__calls').then((r) => r.json());
const ID_ASK = /(من|مين|منو)\s*(أنت|انت|معي)|عرّف(ني)?\s*بنفسك|وش\s*اسمك/;

// ملف صوتي مولّد: ٠٫٤ث سكوت، ١٫٤ث «كلام» (نغمات مضمّنة)، ٠٫٤ث وقفة، ١ث «كلام»، ثم ٥ث سكوت (يتكرر)
function genWav(file) {
  const sr = 16000, seg = (sec, f) => { const n = Math.round(sec * sr), a = new Int16Array(n); if (f) for (let i = 0; i < n; i++) { const t = i / sr, env = 0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * t); a[i] = Math.round(8000 * env * (Math.sin(2 * Math.PI * 180 * t) + 0.6 * Math.sin(2 * Math.PI * 360 * t) + 0.3 * Math.sin(2 * Math.PI * 720 * t))); } return a; };
  const parts = [seg(0.4, 0), seg(1.4, 1), seg(0.4, 0), seg(1.0, 1), seg(5, 0)], len = parts.reduce((s, p) => s + p.length, 0), buf = Buffer.alloc(44 + len * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + len * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(len * 2, 40);
  let o = 44; parts.forEach((p) => p.forEach((v) => { buf.writeInt16LE(v, o); o += 2; }));
  fs.writeFileSync(file, buf);
}

async function newVoicePage(browser, init, mode) {
  const page = await H.newPage(browser, { query: '?debug=0', init });
  const hits = []; page._cc = hits; page._mode = Object.assign({ down: {} }, mode || {});
  await page.route(/onrender\.com\/cc\/v1\//, async (route) => {
    const req = route.request(), u = new URL(req.url()), port = PORTS[u.host];
    hits.push(u.pathname);
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, Authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS' } });
    if (page._mode.down[u.host]) return route.abort('connectionrefused');
    try {
      const r = await fetch('http://127.0.0.1:' + port + u.pathname, { method: req.method(), headers: req.headers(), body: req.method() === 'POST' ? req.postData() : undefined });
      const buf = Buffer.from(await r.arrayBuffer()); const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
      await route.fulfill({ status: r.status, headers: h, body: buf });
    } catch (e) { await route.abort('connectionrefused'); }
  });
  await page.addStyleTag({ content: '#auth-loader{display:none!important}' });
  await page.setViewportSize({ width: 1280, height: 800 });
  return page;
}
const fr = (page) => page.frames().find((f) => /callcenter3d\.html/.test(f.url()));
async function waitFrame(page, fn, arg, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { const f = fr(page); if (f) { const v = await f.evaluate(fn, arg).catch(() => null); if (v) return v; } await sleep(120); } return null; }
const q = (page, fn, arg) => fr(page).evaluate(fn, arg);
async function boot(page) {
  await page.evaluate(() => goCallCenter());
  await waitFrame(page, () => window.CC && CC.state && CC.state.phase === 'menu', null, 90000);
  await q(page, () => document.getElementById('mn-play').click());
  await waitFrame(page, () => CC.state.phase === 'intro', null, 15000);
  await q(page, () => document.getElementById('di-go').click());
  await waitFrame(page, () => CC.state.phase === 'shift', null, 20000);
  await q(page, () => { const S = CC.state.snap; CC.game.clockPause && 0; });
  // سبايات: كل طلبات المحادثة ومدخلات تحويل الصوت
  await q(page, () => {
    window.__turns = []; window.__stt = []; window.__ops = [];
    const a = CC.auth, oc = a.call.bind(a), os = a.stt.bind(a);
    a.call = function (op, body) { window.__ops.push(op); if (op === 'call/turn') window.__turns.push(JSON.parse(JSON.stringify(body))); return oc(op, body); };
    a.stt = function (blob, mime, dur) { window.__stt.push({ mime, size: blob.size, type: blob.type, dur }); return os(blob, mime, dur); };
  });
}
async function freshCall(page) {
  await q(page, () => { window.__turns.length = 0; window.__stt.length = 0; });
  await q(page, () => { const K = CC.calls; if (K.state === 'active') K.hangup(); });
  await waitFrame(page, () => { const K = CC.calls; if (K.state === 'ended') K.clear(); return K.state === 'idle'; }, null, 10000);
  await q(page, () => { CC.game.clockPause && 0; });
  await q(page, () => { const d = CC.state.snap.day; });
  await q(page, () => CC.calls.ring());
  const ringing = await q(page, () => ({ st: CC.calls.state, log: CC.calls.log.length, voice: !!(CC.audio.voicePlaying && CC.audio.voicePlaying()) }));
  await q(page, () => CC.calls.answer());
  await waitFrame(page, () => CC.calls.state === 'active' && !!CC.calls.call, null, 15000);
  await sleep(250);
  return ringing;
}
async function box(page, sel) {
  await q(page, (s) => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: 'center', behavior: 'instant' }); }, sel); await sleep(60);
  const b = await q(page, (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { x: r.x + r.width / 2, y: r.y + r.height / 2, hit: !!t && (e === t || e.contains(t) || t.contains(e)), dis: !!e.disabled }; }, sel);
  if (!b) return null;
  const f = await (await page.$('#callcenter-frame')).boundingBox(); return Object.assign(b, { px: f.x + b.x, py: f.y + b.y });
}
async function mclick(page, sel) { const b = await box(page, sel); if (!b) return 'missing'; if (!b.hit) return 'covered'; if (b.dis) return 'disabled'; await page.mouse.click(b.px, b.py); await sleep(120); return 'ok'; }
const micState = (page) => q(page, () => CC.mic.state);
const waitMic = (page, st, ms) => waitFrame(page, (s) => CC.mic.state === s, st, ms || 8000);
const playerLines = (page) => q(page, () => CC.calls.log.filter((l) => l.r === 'p').map((l) => l.text));
const callerLines = (page) => q(page, () => CC.calls.log.filter((l) => l.r === 'c').map((l) => l.text));
const statusText = (page) => q(page, () => (document.getElementById('cp-state') ? document.getElementById('cp-state').textContent : '') + '|' + ((document.querySelector('.cp-status') || {}).textContent || ''));
const chatCalls = async () => ((await mockCalls()).counts || {}).chat || 0;
const sttCalls = async () => ((await mockCalls()).counts || {}).stt || 0;
// مايك اصطناعي ثابت التوقيت (WebAudio → MediaStream): ما يعتمد على ساعة جهاز Chromium المزيف اللي تتأثر بحمل رسم ثلاثي الأبعاد.
// pattern: speech (كلام ١٫٤ث + وقفة ٠٫٤ث + كلام ١ث ثم سكوت) · continuous · noise (ضوضاء خفيفة فقط) · silence
// يبدأ المايك ويستنى كلام فعلي ملتقط (أو صوت بأي نمط) ثم يوقفه يدوياً: ما نعتمد على sleep لأن الصفحة ثقيلة وتتأخر
async function speakThenStop(page, opt) {
  opt = opt || {};
  if (opt.pattern !== false) await q(page, (p) => { window.__gum.pattern = p; }, opt.pattern || 'continuous');
  if ((await mclick(page, '#cp-mic')) !== 'ok') return 'noclick';
  if (!(await waitMic(page, 'rec', 15000))) return 'norec';
  if (opt.waitSpeech !== false) await waitFrame(page, () => CC.mic.speechMs > 900 || CC.mic.state !== 'rec', null, 15000);
  else await waitFrame(page, () => CC.mic.audioMs > 1500 || CC.mic.state !== 'rec', null, 15000);
  if ((await micState(page)) === 'rec') await mclick(page, '#cp-mic');
  return 'ok';
}
const GUM_STUB = (mode) => `(() => { const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); window.__gum = { mode: ${JSON.stringify(mode || 'synth')}, delay: 0, streams: [], calls: 0, pattern: 'speech' };
  function synth() { const ctx = new AudioContext(), dest = ctx.createMediaStreamDestination(), g = ctx.createGain(); g.gain.value = 0; ctx.resume();
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.frequency.value = 180; o2.frequency.value = 363; o1.connect(g); o2.connect(g); g.connect(dest); o1.start(); o2.start();
    const t = ctx.currentTime, p = window.__gum.pattern;
    if (p === 'speech') [[0.8, 2.6], [3.0, 4.2]].forEach((x) => { g.gain.setValueAtTime(0.3, t + x[0]); g.gain.setValueAtTime(0, t + x[1]); });
    else if (p === 'continuous') g.gain.setValueAtTime(0.3, t + 0.2);
    else if (p === 'noise') { const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.012; const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true; ns.connect(dest); ns.start(); }
    const s = dest.stream; s.getTracks().forEach((tr) => { const st = tr.stop.bind(tr); tr.stop = () => { st(); try { o1.stop(); o2.stop(); ctx.close(); } catch (e) { /* */ } }; }); return s; }
  navigator.mediaDevices.getUserMedia = async function (c) { window.__gum.calls++; const m = window.__gum; if (m.delay) await new Promise((r) => setTimeout(r, m.delay));
    if (c && c.audio && c.audio.deviceId) throw new DOMException('device gone', 'OverconstrainedError');
    if (m.mode === 'denied') throw new DOMException('Permission denied', 'NotAllowedError'); if (m.mode === 'nodevice') throw new DOMException('no device', 'NotFoundError'); if (m.mode === 'busy') throw new DOMException('busy', 'NotReadableError');
    const s = m.mode === 'real' ? await real(c) : synth(); m.streams.push(s); return s; }; })();`;

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']);
  await cfg({ reset: true });
  let page = await newVoicePage(browser, GUM_STUB('synth'));
  await boot(page);
  const renew = async () => { await page.close(); page = await newVoicePage(browser, GUM_STUB('synth')); await boot(page); }; // يوم جديد لكل مجموعة (الدوام له مدة)

  // ===== 1) دورة المكالمة الواردة =====
  const ringing = await freshCall(page);
  check('الرنين أول: بدون سجل مكالمة ولا صوت المتصل قبل الرد', ringing.st === 'ringing' && ringing.log === 0 && !ringing.voice, ringing);
  const info = await q(page, () => ({ dir: CC.calls.call.direction, st: CC.calls.state, log: CC.calls.log.filter((l) => l.r === 'c').length, name: CC.calls.call.caller.name }));
  check('بعد «رد»: المكالمة واردة (direction: incoming) والمتصل يفتتح بجملته', info.dir === 'incoming' && info.st === 'active' && info.log === 1, info);
  const opening = (await callerLines(page))[0];
  check('افتتاحية المتصل تطرح مشكلة (مو «وش عندك؟» ولا «مين معي؟»)', opening && !/وش عندك|مين معي/.test(opening) && opening.length > 25, opening);
  // ما نبدأ مكالمتين: ring أثناء مكالمة نشطة ما يغيّر الحالة
  await q(page, () => CC.calls.ring());
  check('ما تبدأ مكالمة ثانية أثناء مكالمة نشطة', await q(page, () => CC.calls.state === 'active'));
  // بعد الإنهاء يرجع الانتظار ثم مكالمة جديدة بنفس المسار
  await q(page, () => CC.calls.hangup());
  await waitFrame(page, () => CC.calls.state === 'ended', null, 8000);
  await q(page, () => CC.calls.clear());
  check('نهاية المكالمة ← الهاتف يرجع للانتظار (idle) وجدولة مكالمة جديدة', await q(page, () => CC.calls.state === 'idle' && CC.calls.nextRingAt > 0));
  const gapShort = await q(page, () => { CC.settings.gap = 'short'; CC.calls.schedule(); const a = CC.calls.nextRingAt - CC.game.clockNow(); CC.settings.gap = 'long'; CC.calls.schedule(); const b = CC.calls.nextRingAt - CC.game.clockNow(); CC.settings.gap = 'normal'; return { a, b }; });
  check('الفاصل بين المكالمات قابل للضبط (قصير < طويل)', gapShort.a <= 6.1 && gapShort.b >= 14.9 && gapShort.b <= 30.1, gapShort);

  // ===== 2) المايك: المسار الكامل (إذن ← «يسمعك» بعد الالتقاط ← إيقاف ← تفريغ ← رسالة مرة وحدة ← رد) =====
  await cfg({ reset: true, sttText: 'السلام عليكم معك مشاري من الدعم الفني، وش المشكلة؟' });
  await freshCall(page);
  await q(page, () => { window.__gum.delay = 700; });
  const n0 = await chatCalls(), s0 = await sttCalls();
  check('الإعداد الافتراضي: ضغطة واحدة (toggle) وإرسال تلقائي بدون مراجعة', await q(page, () => CC.settings.mic.mode === 'toggle' && CC.settings.mic.review === false));
  check('زر المايك متاح بوضع الخادم', (await mclick(page, '#cp-mic')) === 'ok');
  await sleep(250);
  check('أثناء انتظار الإذن الحالة «ينتظر إذن المايك» وما تظهر «يسمعك» قبل الالتقاط', (await micState(page)) === 'perm' && /ينتظر إذن المايك/.test(await statusText(page)) && !/يسمعك/.test(await statusText(page)), await statusText(page));
  check('بعد نجاح الالتقاط الحالة «يسمعك»', !!(await waitMic(page, 'rec', 6000)) && /يسمعك/.test(await statusText(page)), await statusText(page));
  await waitFrame(page, () => CC.mic.speechMs > 1000, null, 15000);
  const lvl = await q(page, () => ({ meterOk: CC.mic.meterOk, speech: Math.round(CC.mic.speechMs) }));
  check('مقياس الصوت يلتقط كلام فعلي (مو مجرد تشغيل المؤشر)', lvl.meterOk && lvl.speech > 900, lvl);
  await waitFrame(page, () => CC.mic.speechMs > 2600 || CC.mic.state !== 'rec', null, 20000);
  check('وقفة قصيرة وسط الكلام ما قصّت التسجيل (التقط الجزء الثاني من الكلام بعدها)', (await q(page, () => CC.mic.speechMs > 2600)), await q(page, () => ({ sp: CC.mic.speechMs, st: CC.mic.state })));
  const sawStt = await waitMic(page, 'stt', 15000); // الإيقاف التلقائي بعد سكوت مناسب
  await waitFrame(page, () => CC.mic.state === 'idle' && CC.calls.log.some((l) => l.r === 'p') && !CC.calls.pending && CC.calls.log.filter((l) => l.r === 'c').length >= 2, null, 25000);
  const pl = await playerLines(page), cl = await callerLines(page);
  check('الكلام تحوّل لنص وظهر كرسالة اللاعب مرة وحدة', pl.length === 1 && /معك مشاري/.test(pl[0]), pl);
  check('أُرسل للمحرك دور واحد فقط (بدون نسخ يدوي) ورد المتصل نصاً', (await q(page, () => window.__turns.length)) === 1 && cl.length >= 2, { turns: await q(page, () => window.__turns), cl });
  const rep = cl[cl.length - 1];
  check('رد المتصل مبني على كلامه: ما يرجع «من أنت؟» بعد التعريف', !ID_ASK.test(rep), rep);
  const stt = await q(page, () => window.__stt[0]);
  check('صيغة التسجيل الفعلية (mimeType) هي اللي تروح للخادم، والخادم يقبلها', stt && /^audio\/(webm|ogg|mp4)/.test(stt.type) && (await sttCalls()) === s0 + 1 && (await chatCalls()) === n0 + 1, stt);
  check('المسار فاضي بعدها (جاهز) وموارد المايك محررة', (await micState(page)) === 'idle' && (await q(page, () => window.__gum.streams.every((s) => s.getTracks().every((t) => t.readyState === 'ended')))));
  await q(page, () => { window.__gum.delay = 0; });

  // ===== 3) إيقاف تلقائي بعد سكوت مناسب =====
  await cfg({ reset: true, sttText: 'أبشر، خلني أوضح لك الموضوع' });
  await freshCall(page);
  await mclick(page, '#cp-mic'); await waitMic(page, 'rec', 6000);
  const t0 = Date.now(); const auto = await waitFrame(page, () => CC.mic.state !== 'rec', null, 12000); const dt = Date.now() - t0;
  check('الإيقاف التلقائي بعد السكوت (بعد كلام ووقفة)، مو قبل ما يخلص كلامه', !!auto && dt > 2000 && dt < 9000, dt);
  await waitFrame(page, () => CC.mic.state === 'idle' && CC.calls.log.some((l) => l.r === 'p') && !CC.calls.pending && CC.calls.log.filter((l) => l.r === 'c').length >= 2, null, 25000);
  check('التسجيل التلقائي انتهى برسالة واحدة ورد', (await playerLines(page)).length === 1 && (await callerLines(page)).length >= 2);

  // ===== 4) الإذن: رفض ثم إعادة المحاولة، لا يوجد مايك، المايك مشغول =====
  await freshCall(page);
  await q(page, () => { window.__gum.mode = 'denied'; });
  await mclick(page, '#cp-mic'); await waitMic(page, 'err', 4000);
  check('رفض الإذن: «تعذر التشغيل» مع سبب مفهوم، والكتابة تبقى شغالة', /تعذر التشغيل/.test(await statusText(page)) && /الإذن مرفوض/.test(await statusText(page)) && (await q(page, () => !document.getElementById('cp-text').disabled)), await statusText(page));
  check('الزر يبقى متاح لإعادة المحاولة بعد الرفض', (await q(page, () => !document.getElementById('cp-mic').disabled)));
  await q(page, () => { window.__gum.mode = 'synth'; });
  await mclick(page, '#cp-mic');
  check('إعادة المحاولة بعد قبول الإذن تنجح (يسمعك)', !!(await waitMic(page, 'rec', 6000)));
  await mclick(page, '#cp-mic'); await waitMic(page, 'idle', 12000);
  await q(page, () => CC.mic.cancel());
  await q(page, () => { window.__gum.mode = 'nodevice'; });
  await mclick(page, '#cp-mic'); await waitMic(page, 'err', 4000);
  check('لا يوجد مايك: رسالة واضحة', /ما لقينا مايك/.test(await statusText(page)), await statusText(page));
  await q(page, () => { window.__gum.mode = 'busy'; });
  await mclick(page, '#cp-mic'); await waitMic(page, 'err', 4000);
  check('المايك مشغول بتطبيق ثاني: رسالة واضحة', /مستخدم من تطبيق ثاني|غير متاح/.test(await statusText(page)), await statusText(page));
  await q(page, () => { window.__gum.mode = 'synth'; CC.mic.cancel(); });

  await renew();
  // ===== 5) إيقاف قبل رجوع الإذن، ضغط سريع، تشغيل قديم يرجع بعد جديد =====
  await freshCall(page);
  await q(page, () => { window.__gum.delay = 5000; window.__gum.streams.length = 0; });
  await mclick(page, '#cp-mic'); await sleep(200); const p1 = await micState(page);
  await mclick(page, '#cp-mic'); await sleep(150);
  check('الإلغاء أثناء انتظار الإذن يرجع الحالة «جاهز» فوراً', p1 === 'perm' && (await micState(page)) === 'idle', { p1 });
  await sleep(5500);
  check('الإذن اللي رجع بعد الإلغاء حُررت موارده ولا بدأ تسجيل', (await micState(page)) === 'idle' && (await q(page, () => window.__gum.streams.length > 0 && window.__gum.streams.every((s) => s.getTracks().every((t) => t.readyState === 'ended')))));
  await q(page, () => { window.__gum.delay = 0; });
  const b = await box(page, '#cp-mic'); await page.mouse.dblclick(b.px, b.py); await sleep(1000);
  check('نقرة مزدوجة سريعة: ما تعلق الحالة ولا ترسل شي', ['idle', 'perm', 'rec'].includes(await micState(page)) && (await q(page, () => window.__turns.length)) === 0);
  await q(page, () => CC.mic.cancel()); await sleep(200);

  // ===== 6) نص فاضي وضوضاء فقط =====
  await cfg({ reset: true });
  await q(page, () => { window.__gum.pattern = 'noise'; });
  await freshCall(page);
  const st0 = await sttCalls();
  await speakThenStop(page, { waitSpeech: false, pattern: false });
  await waitMic(page, 'idle', 12000); await sleep(400);
  check('ضوضاء فقط: «ما سمعنا كلام واضح» بدون استدعاء تحويل ولا دور بالمحادثة', /ما سمعنا كلام/.test(await statusText(page)) && (await sttCalls()) === st0 && (await playerLines(page)).length === 0 && (await q(page, () => window.__turns.length)) === 0, await statusText(page));
  await q(page, () => { window.__gum.pattern = 'silence'; });
  await cfg({ reset: true, noSpeech: true });
  await speakThenStop(page, { waitSpeech: false, pattern: false });
  await waitMic(page, 'idle', 12000); await sleep(600);
  check('سكوت تام والخادم يرجع «بلا كلام»: رسالة واضحة وما يدخل دور', /ما سمعنا كلام|ما قدرنا نحوّل الصوت/.test(await statusText(page)) && (await playerLines(page)).length === 0 && (await q(page, () => window.__turns.length)) === 0, await statusText(page));
  await q(page, () => { window.__gum.pattern = 'speech'; });
  await cfg({ reset: true });

  // ===== 7) فشل تحويل الصوت لحاله: لا تعليق على «يحوّل»، والكتابة شغالة =====
  await cfg({ reset: true, fail: { stt: true } });
  await freshCall(page);
  await speakThenStop(page);
  await waitMic(page, 'err', 15000);
  check('فشل STT: «تعذر التشغيل» مع سبب (مو معلّق على يحوّل)', /تعذر التشغيل/.test(await statusText(page)) && (await playerLines(page)).length === 0, await statusText(page));
  await cfg({ reset: true });
  await q(page, () => { document.getElementById('cp-text').value = 'معك مشاري من الدعم الفني، وش المشكلة؟'; CC.calls.send(); });
  await waitFrame(page, () => CC.calls.log.filter((l) => l.r === 'c').length >= 2, null, 12000);
  check('فشل الصوت ما يوقف الكتابة: الدور يمر بنفس المسار', (await playerLines(page)).length === 1 && (await q(page, () => window.__turns.length)) === 1);

  // ===== 8) مهلة تحويل الصوت: ما يعلق =====
  await cfg({ reset: true, delay: { stt: 4000 } });
  await q(page, () => { CC.MIC_STT_TIMEOUT_MS = 1200; });
  await freshCall(page);
  await speakThenStop(page);
  const toErr = await waitMic(page, 'err', 8000);
  check('بطء/مهلة التحويل: ينفك بخطأ واضح بدل التعليق', !!toErr && /تأخر/.test(await statusText(page)), await statusText(page));
  await sleep(3500);
  check('النتيجة المتأخرة بعد المهلة تُتجاهل (ما ينضاف نص)', (await playerLines(page)).length === 0 && (await q(page, () => window.__turns.length)) === 0);
  await q(page, () => { CC.MIC_STT_TIMEOUT_MS = 24000; CC.mic.cancel(); }); await cfg({ reset: true });

  // ===== 9) انتهاء المكالمة أثناء التسجيل وأثناء التحويل =====
  await freshCall(page);
  await mclick(page, '#cp-mic'); await waitMic(page, 'rec', 6000);
  const sttBefore = await sttCalls();
  await q(page, () => CC.calls.hangup());
  await waitFrame(page, () => CC.calls.state === 'ended', null, 8000); await sleep(500);
  check('نهاية المكالمة أثناء التسجيل: يتوقف المايك ولا يُرسل تحويل', (await micState(page)) === 'idle' && (await sttCalls()) === sttBefore && (await q(page, () => window.__gum.streams.every((s) => s.getTracks().every((t) => t.readyState === 'ended')))));
  await cfg({ reset: true, delay: { stt: 2500 }, sttText: 'كلام مكالمة قديمة' });
  await freshCall(page);
  await speakThenStop(page); await waitMic(page, 'stt', 3000);
  await q(page, () => CC.calls.hangup()); await waitFrame(page, () => CC.calls.state === 'ended', null, 8000);
  await q(page, () => CC.calls.clear()); await freshCall(page);
  await sleep(3200);
  check('نهاية المكالمة أثناء التحويل: نتيجة المكالمة القديمة ما تدخل المكالمة الجديدة', (await playerLines(page)).length === 0 && (await q(page, () => window.__turns.length)) === 0 && (await micState(page)) === 'idle', await playerLines(page));
  await cfg({ reset: true });

  await renew();
  // ===== 10) مقاطعة صوت المتصل =====
  await q(page, () => { window.__gum.pattern = 'continuous'; });
  await freshCall(page);
  await q(page, () => { window.__vp = false; window.__stopped = 0; CC.audio.voicePlaying = () => window.__vp; const sv = CC.audio.stopVoice; CC.audio.stopVoice = function () { window.__stopped++; window.__vp = false; return sv.apply(CC.audio, arguments); }; });
  await sleep(2500); // يخلص صوت الافتتاحية الحقيقي أول
  await q(page, () => { window.__stopped = 0; window.__vp = true; }); // المتصل «يتكلم» لحظة الضغط
  await mclick(page, '#cp-mic'); await waitMic(page, 'rec', 15000);
  check('ضغط المايك وقت كلام المتصل: يوقف صوته أول ثم يبدأ الاستماع', (await q(page, () => window.__stopped >= 1 && CC.calls.interrupted === true)));
  await cfg({ reset: true, sttText: 'خلني أكمل، معك مشاري من الدعم الفني' });
  await waitFrame(page, () => CC.mic.speechMs > 900 || CC.mic.state !== 'rec', null, 15000); if ((await micState(page)) === 'rec') await mclick(page, '#cp-mic'); await waitFrame(page, () => window.__turns.length >= 1, null, 20000);
  check('الدور المرسل يعلّم إن جملة المتصل انقطعت (interrupted)', (await q(page, () => window.__turns[0].interrupted === true && window.__turns[0].via === 'voice')));
  await q(page, () => { delete CC.audio.voicePlaying; });

  // ===== 11) مراجعة النص قبل الإرسال =====
  await cfg({ reset: true, sttText: 'أنا أسمعك كمل' });
  await freshCall(page);
  await q(page, () => { CC.settings.mic.review = true; CC.settings.mic.set = true; });
  await speakThenStop(page);
  await waitMic(page, 'idle', 12000); await sleep(500);
  const rv = await q(page, () => ({ ta: document.getElementById('cp-text').value, turns: window.__turns.length, st: (document.querySelector('.cp-status') || {}).textContent }));
  check('مفعّل «راجع النص»: النص ينتظر بخانة الكتابة وما يُرسل، والرسالة توضح ذلك', /أسمعك/.test(rv.ta) && rv.turns === 0 && /ينتظر إرسالك/.test(rv.st || ''), rv);
  await q(page, () => { CC.settings.mic.review = false; });

  // ===== 12) تغيير جهاز الصوت أثناء التسجيل + جهاز محفوظ مفقود =====
  await freshCall(page);
  await mclick(page, '#cp-mic'); await waitMic(page, 'rec', 6000);
  await q(page, () => navigator.mediaDevices.dispatchEvent(new Event('devicechange')));
  await sleep(300);
  check('تغيّر جهاز الصوت أثناء التسجيل: يتوقف بأمان مع رسالة', (await micState(page)) === 'idle' && /تغير جهاز الصوت/.test(await statusText(page)));
  await q(page, () => { CC.settings.mic.deviceId = 'device-that-vanished'; });
  await mclick(page, '#cp-mic');
  check('جهاز محفوظ مفقود: يرجع للافتراضي ويكمل', !!(await waitMic(page, 'rec', 6000)) && (await q(page, () => CC.settings.mic.deviceId === '')));
  await q(page, () => CC.mic.cancel());

  // ===== 13) التنقل بين الهاتف و«نصب» أثناء التسجيل =====
  await freshCall(page);
  await mclick(page, '#cp-mic'); await waitMic(page, 'rec', 6000);
  await q(page, () => { CC.game.sitDown(); });
  await waitFrame(page, () => CC.os.on === true, null, 15000);
  await q(page, () => { CC.os.open('tx', { noDock: true }); CC.os.minimize('tx'); CC.os.open('phone', { noDock: true }); });
  await sleep(500);
  check('فتح «نصب» والرجوع للهاتف ما يقطع التسجيل', (await micState(page)) === 'rec');
  await q(page, () => CC.mic.cancel());

  await renew();
  // ===== 14) فشل رد المحادثة: ما تتكرر الرسالة ولا تتأثر الثقة =====
  await cfg({ reset: true, sttText: 'معك مشاري من الدعم الفني' });
  await freshCall(page);
  const trust0 = await q(page, () => CC.calls.call.mood.trust);
  await cfg({ fail: { chat: true } });
  await speakThenStop(page);
  await waitFrame(page, () => window.__turns.length >= 1 && !CC.calls.pending, null, 20000); await sleep(500);
  const trust1 = await q(page, () => CC.calls.call.mood.trust);
  check('فشل توليد الرد: الثقة ما تتغير والرسالة معلّمة بإعادة إرسال', trust1 === trust0 && (await q(page, () => !!document.querySelector('.cp-status.err'))), { trust0, trust1 });
  await cfg({ reset: true });
  const before = await q(page, () => window.__turns.length);
  await q(page, () => { const b = document.querySelector('.cp-status button'); if (b) b.click(); });
  await waitFrame(page, () => CC.calls.log.filter((l) => l.r === 'c').length >= 2, null, 15000);
  const t2 = await q(page, () => window.__turns.slice(-2));
  check('إعادة الإرسال بنفس msgId (بدون رسالة مكررة بالسجل)', t2.length === 2 && t2[0].msgId === t2[1].msgId && (await playerLines(page)).length === 1, t2);

  // ===== 15) فشل صوت الرد (TTS) ما يمسح الرد النصي ولا يكرر الدور =====
  await cfg({ reset: true, fail: { tts: true }, sttText: 'معك مشاري من الدعم الفني، وش المشكلة؟' });
  await freshCall(page);
  await q(page, () => { window.__turns.length = 0; });
  const chatBefore = await chatCalls();
  await speakThenStop(page);
  await waitFrame(page, () => CC.calls.log.filter((l) => l.r === 'c').length >= 2, null, 15000); await sleep(1500);
  check('فشل TTS: الرد النصي يبقى ولا يتولد الدور مرة ثانية', (await callerLines(page)).length >= 2 && (await chatCalls()) === chatBefore + 1, { calls: (await chatCalls()) - chatBefore });
  await cfg({ reset: true });

  // ===== 16) صوت وكتابة بنفس المسار، ورقم الدور =====
  await freshCall(page);
  await q(page, () => { window.__turns.length = 0; document.getElementById('cp-text').value = 'تمام كمل'; CC.calls.send(); });
  await waitFrame(page, () => window.__turns.length === 1 && !CC.calls.pending, null, 12000);
  const t = await q(page, () => window.__turns[0]);
  check('الكتابة تدخل مسار call/turn بنفس الحقول (via: text)', t.via === 'text' && !!t.msgId && !!t.callId && typeof t.interrupted === 'boolean', t);

  // ===== 17) إذن المايك داخل الإطار =====
  const allow = await page.evaluate(() => document.getElementById('callcenter-frame').getAttribute('allow'));
  check('إطار الموقع يسمح بالمايك (allow=microphone)', /microphone/.test(allow), allow);

  // ===== 18) وضع التدريب المحلي (تعرّف الجهاز) بنفس حالات الواجهة =====
  await page.close();
  const fakeSR = `(() => { class SR { constructor(){ this.lang=''; } start(){ window.__sr = this; setTimeout(() => this.onaudiostart && this.onaudiostart(), 150); setTimeout(() => { this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'السلام عليكم معك مشاري من الدعم الفني' }], { isFinal: true })] }); }, 900); setTimeout(() => this.onend && this.onend(), 1000); } stop(){} abort(){ this.aborted = true; } } window.SpeechRecognition = SR; })();`;
  const lp = await newVoicePage(browser, GUM_STUB('synth') + fakeSR, { down: { 'ehsmaha-wbkn.onrender.com': true, 'ehsmaha.onrender.com': true } });
  await boot(lp);
  await freshCall(lp);
  check('التدريب المحلي: المكالمة واردة ومايكها يعتمد تعرّف الجهاز', await q(lp, () => CC.auth.kind === 'local' && CC.calls.call.direction === 'incoming'));
  await mclick(lp, '#cp-mic');
  check('التدريب المحلي: «يسمعك» بعد بدء الالتقاط فعلاً', !!(await waitMic(lp, 'rec', 4000)));
  await waitFrame(lp, () => CC.calls.log.some((l) => l.r === 'p'), null, 8000);
  await waitFrame(lp, () => !CC.calls.pending && CC.calls.log.filter((l) => l.r === 'c').length >= 2, null, 10000);
  const lpl = await playerLines(lp), lcl = await callerLines(lp);
  check('التدريب المحلي: التفريغ يظهر مرة وحدة ويرد المتصل بدون «من أنت؟»', lpl.length === 1 && !ID_ASK.test(lcl[lcl.length - 1]), { lpl, lcl });
  check('بلا أخطاء JS بصفحة اللعبة', lp._errors.length === 0, lp._errors);
  await lp.close();

  await browser.close();
  const bad = results.filter((x) => !x).length;
  console.log('\n' + (results.length - bad) + '/' + results.length + ' passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
