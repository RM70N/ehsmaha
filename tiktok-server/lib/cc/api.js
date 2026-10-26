'use strict';
// واجهة «انصب علي» (مركز الاتصالات) على سيرفر Render: /cc/v1/*
// الخادم هو المرجع الرسمي للعبة: يشغّل نفس وحدات اللعبة (cc-content/rules/session) و«عقل» Gemini، ويوقّع نقاط الحفظ.
// العقد (كما يستدعيه ملف اللعبة): config · session · الأوامر (state/day/call/shop/...) · stt · tts · admin/{status,test-keys}.
// الأمان: المفاتيح بالخادم فقط، نقاط الحفظ موقّعة HMAC ومربوطة بحساب اللاعب، حدود معدّل لكل جلسة/IP/يوم، حدود حجم للطلبات.

const crypto = require('crypto');
const C = require('./cc-content.js');
const R = require('./cc-rules.js');
const S = require('./cc-session.js');
const { GeminiBrain } = require('./brain.js');
const { pcmToWav } = require('./gemini.js');

const MAX_BODY = 64 * 1024, MAX_AUDIO_BODY = 2.2 * 1024 * 1024;
const SESSION_TTL_MS = 40 * 60 * 1000, MAX_SESSIONS = 800;
const OPS = {
  'state': (s) => { s.tick(); return {}; },
  'day/begin': (s) => s.beginDay(), 'day/retry': (s) => s.retryDay(),
  'day/pause': (s, b) => s.pause(!!b.paused),
  'day/end': (s, b) => s.endDay(b), 'day/after': (s) => s.afterReview(),
  'call/start': (s, b) => s.startCall(b), 'call/tool': (s, b) => s.tool(b),
  'call/file': (s, b) => s.openFile(b), 'call/end': (s, b) => s.endCall(b), 'call/clear': (s) => s.clearCall(),
  'event': (s, b) => s.event(b), 'coffee': (s) => s.coffee(), 'app': (s, b) => s.appOpened(b.app),
  'op/method': (s, b) => s.setMethod(b), 'op/collect': (s, b) => s.collect(b),
  'shop/buy': (s, b) => s.buy(b), 'shop/deliver': (s, b) => s.deliver(b),
  'progress/reset': (s, b) => (b.confirm === 'RESET' ? s.resetProgress() : { error: 'confirm' }),
};

function createCCApi(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const router = opts.router;
  const now = opts.now || (() => Date.now());
  const log = opts.log || function () {};
  const verifyToken = opts.verifyToken || (async () => null);
  const stage = ['internal', 'beta', 'public'].indexOf(env.CC_STAGE) >= 0 ? env.CC_STAGE : 'public';
  const ownerEmail = String(env.CC_OWNER_EMAIL || 'malshaifan1@gmail.com').toLowerCase();
  const dailyCap = Number(env.CC_DAILY_TURNS) || 20000;
  const sttOn = String(env.CC_STT || '1') !== '0', ttsOn = String(env.CC_TTS || '1') !== '0';
  const secret = env.CC_SECRET || (router && router.keys.length ? crypto.createHash('sha256').update('cc3d|' + router.keys.map((k) => k.key).join('|')).digest('hex') : crypto.randomBytes(32).toString('hex'));

  const sessions = new Map();
  const issued = new Map(); // method:digits -> { sid, opId, at } — رمز صادر لمكالمة ثانية ممنوع على هذه
  const day = { key: '', turns: 0 };
  const metrics = { turns: [], tokens: [], cacheHits: 0, ttsReq: 0, ttsHit: 0 };
  const ipBuckets = new Map();
  const ttsCache = new Map(); let ttsBytes = 0;

  const dayKey = () => new Date(now()).toISOString().slice(0, 10);
  function countTurn() { const k = dayKey(); if (day.key !== k) { day.key = k; day.turns = 0; } day.turns++; }
  const overBudget = () => { const k = dayKey(); return day.key === k && day.turns >= dailyCap; };

  const caps = () => ({ chat: !!(router && router.hasKeys) && !overBudget(), stt: !!(router && router.hasKeys) && sttOn, tts: !!(router && router.hasKeys) && ttsOn });

  // ---------------- نقاط الحفظ الموقّعة ----------------
  const sign = (uid, ts, data) => crypto.createHmac('sha256', secret).update(uid + '|' + ts + '|' + JSON.stringify(data)).digest('hex').slice(0, 40);
  function makeCheckpoint(uid, data) { const ts = now(); return { d: data, u: uid || '', t: ts, s: sign(uid || '', ts, data) }; }
  function readCheckpoint(cp, uid) {
    if (!cp || typeof cp !== 'object' || !cp.d || typeof cp.s !== 'string') return null;
    if ((cp.u || '') !== (uid || '')) return null;
    const want = sign(cp.u || '', cp.t, cp.d);
    const a = Buffer.from(want), b = Buffer.from(cp.s);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return cp.d;
  }

  // ---------------- أدوات HTTP ----------------
  function send(res, status, obj, extra) {
    const body = Buffer.isBuffer(obj) ? obj : Buffer.from(JSON.stringify(obj));
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Expose-Headers': 'X-CC-Cached' }, extra || {}));
    res.end(body);
  }
  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      let size = 0, over = false; const chunks = [];
      // تجاوز الحد: نرد 413 فوراً ونصرف بقية الجسم (بدون تخزينه) — الحماية من الإغراق بحدّ أعلى للقطع المستهلكة.
      req.on('data', (c) => {
        size += c.length;
        if (over) { if (size > limit * 8) { try { req.destroy(); } catch (e) { /* */ } } return; }
        if (size > limit) { over = true; chunks.length = 0; reject(Object.assign(new Error('too_large'), { code: 413 })); return; }
        chunks.push(c);
      });
      req.on('end', () => { if (over) return; try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(Object.assign(new Error('bad_json'), { code: 400 })); } });
      req.on('error', reject);
    });
  }
  function clientIp(req) { const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); return f || (req.socket && req.socket.remoteAddress) || 'x'; }
  function ipAllow(ip, kind, max, perMs) {
    const k = kind + '|' + ip, t = now(); let b = ipBuckets.get(k);
    if (!b || t - b.at > perMs) b = { at: t, n: 0 };
    b.n++; ipBuckets.set(k, b);
    if (ipBuckets.size > 5000) for (const [kk, v] of ipBuckets) { if (t - v.at > perMs) ipBuckets.delete(kk); }
    return b.n <= max;
  }
  async function authOf(req) {
    const h = String(req.headers.authorization || '');
    const m = /^Bearer\s+(.+)$/i.exec(h);
    if (!m) return { uid: '', owner: false, hasToken: false };
    try {
      const u = await verifyToken(m[1].trim());
      if (!u || !u.uid) return { uid: '', owner: false, hasToken: true };
      return { uid: String(u.uid), owner: !!(u.email && String(u.email).toLowerCase() === ownerEmail && u.emailVerified), hasToken: true };
    } catch (e) { return { uid: '', owner: false, hasToken: true }; }
  }

  // ---------------- الجلسات ----------------
  function touchIssued(op, sid) {
    if (!op) return;
    const t = now();
    (JSON.stringify(op.data || {}).match(/[0-9]{3,}/g) || []).concat(Object.keys(op.shown || {}).map((k) => String(op.shown[k]).replace(/\D/g, '')).filter((x) => x.length >= 3)).forEach((d) => issued.set(op.method + ':' + d, { sid, opId: op.id, at: t }));
    if (issued.size > 4000) for (const [k, v] of issued) { if (t - v.at > 2 * 3600e3) issued.delete(k); }
  }
  function newSession(auth) {
    if (sessions.size >= MAX_SESSIONS) {
      let oldest = null; for (const r of sessions.values()) if (!oldest || r.lastAt < oldest.lastAt) oldest = r;
      if (oldest) sessions.delete(oldest.id);
    }
    const id = 'ccs_' + crypto.randomBytes(12).toString('hex');
    const rec = { id, uid: auth.uid, owner: auth.owner, lastAt: now(), createdAt: now(), turnTimes: [], lines: {}, cp: null };
    rec.session = new S.Session({
      brain: new GeminiBrain(router, { onUsage: (u) => { metrics.tokens.push(u.out + u.prompt); if (metrics.tokens.length > 300) metrics.tokens.shift(); if (u.cached) metrics.cacheHits++; } }),
      mode: 'remote',
      onCheckpoint: (kind, data) => { rec.cp = makeCheckpoint(rec.uid, data); },
      onOpIssued: (op) => touchIssued(op, id),
      isForeign: (method, digits) => { const e = issued.get(method + ':' + digits); const cur = rec.session.call && rec.session.call.op; return !!e && (e.sid !== id || (cur && e.opId !== cur.id)); },
    });
    sessions.set(id, rec);
    return rec;
  }
  const sweep = setInterval(() => { const t = now(); for (const [id, r] of sessions) if (t - r.lastAt > SESSION_TTL_MS) sessions.delete(id); }, 60000);
  if (sweep.unref) sweep.unref();

  function captureLines(rec, out) {
    const call = rec.session.call;
    [out.opening, out.reply, out.line].forEach((l) => { if (l && l.id && l.text) { rec.lines[l.id] = { text: l.speak || l.text, personaId: call && call.personaId }; } });
    const ks = Object.keys(rec.lines); if (ks.length > 80) delete rec.lines[ks[0]];
  }

  function stateOut(rec, r) {
    const out = Object.assign({ ok: !r.error }, r, { state: rec.session.snapshot() });
    if (rec.cp) { out.checkpoint = rec.cp; rec.cp = null; }
    return out;
  }

  // ---------------- المسارات ----------------
  async function handleSession(req, res) {
    const ip = clientIp(req);
    if (!ipAllow(ip, 'session', 40, 60000)) return send(res, 429, { ok: false, error: 'rate_limited', msg: 'طلبات كثيرة. انتظر دقيقة وجرب.' });
    let body; try { body = await readBody(req, MAX_BODY * 4); } catch (e) { return send(res, e.code || 400, { ok: false, error: e.message }); }
    const auth = await authOf(req);
    const rec = newSession(auth);
    let restoreNote = null, restoredDay = false, restored = false;
    if (body.checkpoint) {
      const data = readCheckpoint(body.checkpoint, auth.uid);
      if (!data) restoreNote = 'invalid_save';
      else { const r = rec.session.restore(data); if (!r.ok) restoreNote = 'invalid_save'; else { restored = true; restoredDay = !!r.restoredDay; } }
    }
    // checkpoint حديث دائماً: حتى لو بدأ لاعب جديد، تُحفظ أول نقطة على جهازه
    if (!rec.cp) rec.cp = makeCheckpoint(rec.uid, rec.session.checkpointData());
    const out = { ok: true, sessionId: rec.id, caps: caps(), owner: rec.owner, stage, restored, restoredDay, restoreNote, state: rec.session.snapshot(), checkpoint: rec.cp };
    rec.cp = null;
    return send(res, 200, out);
  }

  async function handleOp(req, res, op) {
    let body; try { body = await readBody(req, MAX_BODY); } catch (e) { return send(res, e.code || 400, { ok: false, error: e.message }); }
    const rec = sessions.get(String(body.sessionId || ''));
    if (!rec) return send(res, 410, { ok: false, error: 'session_gone', msg: 'انتهت الجلسة عند الخادم.' });
    rec.lastAt = now();
    const s = rec.session;
    if (op === 'call/turn') {
      const t = now(); rec.turnTimes = rec.turnTimes.filter((x) => t - x < 60000);
      if (rec.turnTimes.length >= 24) return send(res, 429, { ok: false, error: 'rate_limited', retryable: true, msg: 'رسائل كثيرة بوقت قصير. خذ نفس وكمّل.', retryAfter: 10 });
      if (overBudget()) return send(res, 200, stateOut(rec, { error: 'busy', retryable: true, msg: 'خدمة المحادثة وصلت حدها اليومي. جرب بوضع التدريب أو بكرة.' }));
      rec.turnTimes.push(t); countTurn();
      const t0 = now();
      const r = await s.turn(body);
      if (!r.error) { metrics.turns.push(now() - t0); if (metrics.turns.length > 300) metrics.turns.shift(); }
      captureLines(rec, r);
      return send(res, 200, stateOut(rec, r));
    }
    const fn = OPS[op];
    if (!fn) return send(res, 404, { ok: false, error: 'unknown_op' });
    let r;
    try { r = fn(s, body) || {}; } catch (e) { log('warn', 'cc op ' + op + ' فشل: ' + e.message); return send(res, 200, { ok: false, error: 'server_error', msg: 'خطأ داخلي بالخادم.', state: s.snapshot() }); }
    captureLines(rec, r);
    return send(res, 200, stateOut(rec, r));
  }

  async function handleStt(req, res) {
    let body; try { body = await readBody(req, MAX_AUDIO_BODY); } catch (e) { return send(res, e.code || 400, { ok: false, error: e.message }); }
    const rec = sessions.get(String(body.sessionId || ''));
    if (!rec) return send(res, 410, { ok: false, error: 'session_gone' });
    rec.lastAt = now();
    if (!caps().stt) return send(res, 200, { ok: false, error: 'stt_off', msg: 'تحويل الصوت لنص غير متاح بالخادم الحين. الكتابة شغالة.' });
    const mime = String(body.mime || '').split(';')[0];
    if (!/^audio\/(webm|ogg|mp4|mpeg|mp3|wav|x-wav|aac|flac)$/.test(mime)) return send(res, 200, { ok: false, error: 'bad_mime', msg: 'صيغة الصوت غير مدعومة.' });
    const audio = String(body.audio || '');
    if (!audio || audio.length > 2.0 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(audio)) return send(res, 200, { ok: false, error: 'bad_audio', msg: 'المقطع غير صالح أو طويل.' });
    const t = now(); rec.turnTimes = rec.turnTimes.filter((x) => t - x < 60000);
    if (!ipAllow(clientIp(req), 'stt', 40, 60000)) return send(res, 429, { ok: false, error: 'rate_limited' });
    const durMs = Math.max(0, Number(body.durationMs) || 0);
    const PROMPT = 'اكتب حرفياً الكلام العربي المنطوق في هذا المقطع الصوتي (لهجة سعودية غالباً) كما قيل بدون أي إضافة أو تشكيل أو ترجمة أو شرح. أرجع النص فقط. لو ما فيه كلام بشري مفهوم أرجع بالضبط: [[NOSPEECH]]';
    // طلب «مُحوَّط»: نبدأ بنموذج واحد (يعني استهلاك واحد بالحالة العادية)، ولو تأخر عن HEDGE_MS أو رجع فاضي/فشل نبدأ النموذج التالي
    // بالتوازي والأسرع اللي يرجع نصاً يفوز. فاضي من نموذجين = «ما فيه كلام»؛ أخطاء من الجميع = خطأ واضح بالرمز.
    const HEDGE_MS = 4000;
    const ask = async (model) => {
      const r = await router.generate('stt', {
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: audio } }, { text: PROMPT }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024 },
      }, { timeoutMs: 10000, budgetMs: 10500, only: [model] });
      const cand = r.data && r.data.candidates && r.data.candidates[0];
      const raw = (cand && cand.content && cand.content.parts && cand.content.parts.map((x) => x.text || '').join('')) || '';
      return { model: r.model, text: parseStt(raw), finish: String((cand && cand.finishReason) || (r.data && r.data.promptFeedback && r.data.promptFeedback.blockReason) || 'none'), raw };
    };
    const race = (models) => new Promise((resolve) => {
      let idx = 0, inflight = 0, empties = 0, lastErr = null, lastEmpty = '', settled = false, timer = null;
      const finishWith = (v) => { if (settled) return; settled = true; clearTimeout(timer); resolve(v); };
      const arm = () => { clearTimeout(timer); if (!settled && idx < models.length) timer = setTimeout(launch, HEDGE_MS); };
      const next = () => {
        if (settled) return;
        const stop = empties >= 2 || (empties >= 1 && durMs < 1200);
        if (!stop && idx < models.length) return launch();
        if (inflight === 0) finishWith({ win: null, empties, lastErr, lastEmpty });
      };
      function launch() {
        if (settled || idx >= models.length) return;
        const m = models[idx++]; inflight++;
        ask(m).then((v) => {
          inflight--;
          if (v.text) return finishWith({ win: v });
          empties++; lastEmpty = 'empty:' + v.finish;
          log('warn', 'cc stt فاضي من ' + v.model + ' (' + v.finish + ') مقطع=' + Math.round(audio.length * 0.75 / 1024) + 'KB ' + durMs + 'ms ' + mime + ' خام=' + JSON.stringify(String(v.raw).slice(0, 60)));
          next();
        }, (e) => { inflight--; lastErr = e; next(); });
        arm();
      }
      launch();
    });
    try {
      const r = await race((router.models.stt || []).slice(0, 4));
      if (r.win) return send(res, 200, { ok: true, text: r.win.text, model: r.win.model });
      if (r.empties) return send(res, 200, { ok: true, text: '', noSpeech: true, detail: r.lastEmpty });
      throw r.lastErr || new Error('stt_failed');
    } catch (e) {
      log('warn', 'cc stt فشل: ' + (e && e.kind) + ' ' + String((e && e.message) || '').slice(0, 120));
      return send(res, 200, { ok: false, error: e.kind || 'stt_error', detail: e.kind || 'stt_error', msg: e.kind === 'rate_limited' ? 'الخدمة مزدحمة، جرب بعد لحظات أو اكتب رسالتك.' : C.STRINGS.sttFail });
    }
  }

  // يقبل نصاً صرفاً أو JSON قديم {text, noSpeech}؛ يرجع '' لو ما فيه كلام
  function parseStt(raw) {
    let t = String(raw || '').trim();
    if (!t || /\[\[\s*NOSPEECH\s*\]\]/i.test(t)) return '';
    if (t[0] === '{') { try { const j = JSON.parse(t); if (j && j.noSpeech) return ''; t = j && typeof j.text === 'string' ? j.text : ''; } catch (e) { const m = /"text"\s*:\s*"([^"]*)/.exec(t); t = m ? m[1] : ''; } }
    t = t.replace(/^```[a-z]*\s*/, '').replace(/\s*```$/, '').trim().replace(/^["'«»]+|["'«»]+$/g, '').replace(/\s+/g, ' ').trim();
    return t.slice(0, 600);
  }

  async function handleTts(req, res) {
    let body; try { body = await readBody(req, MAX_BODY); } catch (e) { return send(res, e.code || 400, { ok: false, error: e.message }); }
    const rec = sessions.get(String(body.sessionId || ''));
    if (!rec) return send(res, 410, { ok: false, error: 'session_gone' });
    rec.lastAt = now();
    if (!caps().tts) return send(res, 200, { ok: false, error: 'tts_off' });
    let text = '', voice = 'Kore';
    if (body.lineKey) {
      const m = /^manager_call:(\d+)$/.exec(String(body.lineKey));
      const line = m && C.MANAGER.call[Number(m[1])];
      if (!line) return send(res, 200, { ok: false, error: 'bad_line' });
      text = line.replace('{player}', 'يا موظف'); voice = (C.MANAGER.voice && C.MANAGER.voice.tts) || 'Orus';
    } else {
      const l = rec.lines[String(body.replyId || '')];
      if (!l) return send(res, 200, { ok: false, error: 'bad_line' });
      text = l.text; const p = l.personaId && R.persona(l.personaId); voice = (p && p.voice && p.voice.tts) || 'Kore';
    }
    text = String(text).slice(0, 300);
    if (!ipAllow(clientIp(req), 'tts', 90, 60000)) return send(res, 429, { ok: false, error: 'rate_limited' });
    metrics.ttsReq++;
    const key = voice + '|' + text, hit = ttsCache.get(key);
    if (hit) { metrics.ttsHit++; ttsCache.delete(key); ttsCache.set(key, hit); return send(res, 200, hit, { 'Content-Type': 'audio/wav', 'X-CC-Cached': '1' }); }
    try {
      const r = await router.generate('tts', {
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      });
      const part = r.data && r.data.candidates && r.data.candidates[0] && r.data.candidates[0].content && r.data.candidates[0].content.parts && r.data.candidates[0].content.parts.find((x) => x.inlineData && x.inlineData.data);
      if (!part) return send(res, 200, { ok: false, error: 'no_audio' });
      const rate = Number((/rate=(\d+)/.exec(part.inlineData.mimeType || '') || [])[1]) || 24000;
      const wav = pcmToWav(Buffer.from(part.inlineData.data, 'base64'), rate);
      ttsCache.set(key, wav); ttsBytes += wav.length;
      while (ttsBytes > 24 * 1024 * 1024 || ttsCache.size > 300) { const k = ttsCache.keys().next().value; ttsBytes -= ttsCache.get(k).length; ttsCache.delete(k); }
      return send(res, 200, wav, { 'Content-Type': 'audio/wav', 'X-CC-Cached': '0' });
    } catch (e) { return send(res, 200, { ok: false, error: e.kind || 'tts_error' }); }
  }

  let diagCache = null;
  async function handleAdmin(req, res, what) {
    const auth = await authOf(req);
    if (!auth.owner) return send(res, 403, { ok: false, error: 'owner_only', msg: 'للمالك فقط.' });
    if (what === 'status') {
      const rep = router.report(), tt = metrics.turns.slice().sort((a, b) => a - b), pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null);
      const warnings = [];
      if (!router.hasKeys) warnings.push('ما فيه أي مفتاح Gemini مضبوط بمتغيرات Render (GEMINI_API_KEY).');
      if (rep.router.keys.length && !rep.router.keys.some((k) => k.status === 'active')) warnings.push('كل مفاتيح Gemini معطلة حالياً.');
      if (!env.CC_SECRET) warnings.push('CC_SECRET غير مضبوط: التوقيع مشتق من المفاتيح، وتغيير المفاتيح يبطل نقاط الحفظ القديمة.');
      return send(res, 200, {
        ok: true, stage, warnings, models: router.models,
        metrics: { activeSessions: sessions.size, activeCalls: [...sessions.values()].filter((r) => r.session.call && r.session.call.status === 'active').length, turns: { p50ms: pct(tt, 0.5), p95ms: pct(tt, 0.95), total: day.turns }, avgTokensPerTurn: metrics.tokens.length ? Math.round(metrics.tokens.reduce((a, b) => a + b, 0) / metrics.tokens.length) : null, cachedRatio: null, ttsCache: { ratio: metrics.ttsReq ? metrics.ttsHit / metrics.ttsReq : null }, estCostToday: null, note: 'تقدير التكلفة غير متاح: الحصة المجانية/المدفوعة تُراجَع من لوحة Google AI Studio.' },
        router: rep.router, routerStats: rep.routerStats,
      });
    }
    if (what === 'test-keys') return send(res, 200, { ok: true, results: await router.testKeys() });
    return send(res, 404, { ok: false, error: 'unknown_admin' });
  }

  // نقطة الدخول: يرجع true لو المسار يخص اللعبة (وتولّى الرد)
  async function handle(req, res) {
    const path = (req.url || '').split('?')[0];
    if (path.indexOf('/cc/v1/') !== 0 && path !== '/cc/v1') return false;
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400' }); res.end(); return true; }
    const sub = path.slice('/cc/v1/'.length).replace(/\/+$/, '');
    try {
      if (sub === 'config' && req.method === 'GET') { send(res, 200, { ok: true, service: 'cc', contentVersion: C.CONTENT_VERSION, stage, caps: caps() }); return true; }
      if (sub === 'diag' && req.method === 'GET') {
        const nowT = Date.now();
        if (!diagCache || nowT - diagCache.t > 20000) diagCache = { t: nowT, p: router.diagnose().catch((e) => ({ ok: false, error: String(e && e.message) })) };
        send(res, 200, Object.assign({ ok: true, contentVersion: C.CONTENT_VERSION }, await diagCache.p)); return true;
      }
      if (req.method !== 'POST') { send(res, 405, { ok: false, error: 'method' }); return true; }
      if (sub === 'session') await handleSession(req, res);
      else if (sub === 'stt') await handleStt(req, res);
      else if (sub === 'tts') await handleTts(req, res);
      else if (sub.indexOf('admin/') === 0) await handleAdmin(req, res, sub.slice(6));
      else await handleOp(req, res, sub);
    } catch (e) {
      log('warn', 'cc ' + sub + ' خطأ: ' + (e && e.message));
      if (!res.headersSent) send(res, 500, { ok: false, error: 'server_error', msg: 'خطأ داخلي بالخادم.' });
    }
    return true;
  }

  return { handle, sessions, caps, _internals: { readCheckpoint, makeCheckpoint, issued, ttsCache, metrics } };
}

module.exports = { createCCApi };
