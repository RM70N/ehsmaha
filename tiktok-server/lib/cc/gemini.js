'use strict';
// موجّه Gemini للعبة «انصب علي» (مركز الاتصالات): مفاتيح متعددة بالتناوب، تبريد عند 429، تعطيل المفتاح المرفوض، نماذج احتياطية.
// المفاتيح تُقرأ من بيئة Render فقط (لا تُرسل للمتصفح ولا تظهر باللوغ — المعرّف آخر ٤ خانات فقط).
//   GEMINI_API_KEY | GEMINI_API_KEY_2.._N | GEMINI_API_KEYS=k1,k2 | GOOGLE_API_KEY | GOOGLE_GENERATIVE_AI_API_KEY (وأي تركيبة بفواصل/أسطر)
//   GEMINI_CHAT_MODELS / GEMINI_STT_MODELS / GEMINI_TTS_MODELS (قوائم بفواصل) — GEMINI_API_BASE لاختبار محلي فقط.

// يقبل صيغة AIza… وأي صيغة مفاتيح Google الأحدث (حروف/أرقام/نقطة/شرطات، ٢٠+ خانة)؛ ونتجاوز بادئة NAME= لو انلصقت مع القيمة
const KEY_RE = /^[0-9A-Za-z][0-9A-Za-z._-]{19,}$/;
const NAME_RE = /^(GEMINI_API_KEY|GEMINI_KEY|GOOGLE_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY)(S|_?\d+)?$/;

function cleanKey(s) { return String(s || '').trim().replace(/^["'`]+|["'`]+$/g, '').trim().replace(/^[A-Z_0-9]*KEY[A-Z_0-9]*\s*[:=]\s*/i, '').replace(/^["'`]+|["'`]+$/g, ''); }

// يرجع { keys:[{id,key}], names:[...] } — كل متغير يقبل قائمة (فواصل/أسطر/مسافات)، والتكرار يُحذف.
function loadGeminiKeys(env) {
  const seen = new Set(), keys = [], names = [];
  Object.keys(env || {}).filter((n) => NAME_RE.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).forEach((n) => {
    const parts = String(env[n] || '').split(/[\s,;]+/).map(cleanKey).filter(Boolean);
    parts.forEach((k) => {
      if (!KEY_RE.test(k) || seen.has(k)) return;
      seen.add(k); keys.push({ key: k, id: 'key#' + (keys.length + 1) + ' …' + k.slice(-4), src: n });
      if (names.indexOf(n) < 0) names.push(n);
    });
  });
  return { keys, names };
}

function listEnv(v, def) { const l = String(v || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean); return l.length ? l : def; }

// WAV من PCM 16-bit mono (Gemini TTS يرجع L16 24kHz) — المتصفح يفك WAV مباشرة بـdecodeAudioData.
function pcmToWav(pcm, rate) {
  const r = rate || 24000, h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(r, 24); h.writeUInt32LE(r * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

class GeminiError extends Error {
  constructor(kind, message, extra) { super(message); this.kind = kind; Object.assign(this, extra || {}); }
}

class GeminiRouter {
  constructor(opts) {
    opts = opts || {};
    const env = opts.env || process.env;
    this.fetch = opts.fetch || globalThis.fetch;
    this.now = opts.now || (() => Date.now());
    this.base = String(env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    const l = loadGeminiKeys(env);
    this.keys = l.keys.map((k) => Object.assign(k, { ok: 0, fail: 0, disabled: null, cooldown: {} }));
    this.sources = l.names;
    this.models = {
      // أسماء النماذج تتغير عند Google: لو الأول غير متاح (404) ينتقل تلقائياً للتالي، وتُبدَّل كلها بمتغيرات البيئة دون تعديل كود.
      // الافتراضي: الأرخص (flash-lite: أرخص سعراً وأعلى حصة طلبات)، وبعده الأقوى كاحتياط لو انتهت حصته أو ما توفّر
      chat: listEnv(env.GEMINI_CHAT_MODELS || env.GEMINI_MODEL, ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest']),
      stt: listEnv(env.GEMINI_STT_MODELS, ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest']),
      tts: listEnv(env.GEMINI_TTS_MODELS, ['gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-tts']),
    };
    this.rr = 0;
    this.stats = { requests: 0, ok: 0, switches: 0, waits: [] };
    this.timeoutMs = Number(env.GEMINI_TIMEOUT_MS) || 14000;
  }

  get hasKeys() { return this.keys.length > 0; }
  liveKeys() { return this.keys.filter((k) => !k.disabled || k.disabled.until <= this.now()); }

  cooling(k, model) { const c = k.cooldown[model]; return !!c && c.until > this.now(); }

  // يجرّب المفاتيح بالتناوب × النماذج بالترتيب. ينتهي بـGeminiError(kind) لو فشل الكل.
  async generate(kind, body, opts) {
    opts = opts || {};
    if (!this.hasKeys) throw new GeminiError('no_keys', 'مفاتيح Gemini غير مضبوطة');
    const models = this.models[kind] || this.models.chat;
    const t0 = this.now();
    let last = null, tried = 0, rateLimited = 0, invalid = 0;
    const n = this.keys.length;
    for (const model of models) {
      for (let i = 0; i < n; i++) {
        const k = this.keys[(this.rr + i) % n];
        if (k.disabled && k.disabled.until > this.now()) { if (k.disabled.reason === 'invalid_key') invalid++; continue; }
        if (this.cooling(k, model)) { rateLimited++; continue; }
        if (opts.signal && opts.signal.aborted) throw new GeminiError('aborted', 'أُلغي الطلب');
        if (opts.budgetMs && tried && this.now() - t0 >= opts.budgetMs) throw last || new GeminiError('timeout', 'انتهت ميزانية الوقت');
        tried++;
        this.stats.requests++;
        try {
          const data = await this._call(k, model, body, opts.signal, opts.timeoutMs);
          k.ok++; this.stats.ok++; this.rr = (this.rr + i + 1) % n;
          this.stats.waits.push(this.now() - t0); if (this.stats.waits.length > 200) this.stats.waits.shift();
          return { data, model, keyId: k.id };
        } catch (e) {
          k.fail++; last = e;
          if (e.kind === 'aborted') throw e;
          this.stats.switches++;
          if (e.kind === 'rate_limited') { k.cooldown[model] = { until: this.now() + (e.retryAfterMs || 30000), reason: e.daily ? 'الحد اليومي' : 'حد الطلبات' }; rateLimited++; }
          else if (e.kind === 'invalid_key') { k.disabled = { until: this.now() + 6 * 3600e3, reason: 'invalid_key' }; invalid++; slogHook(this, 'invalid_key', k); }
          else if (e.kind === 'model_missing') { k.cooldown[model] = { until: this.now() + 3600e3, reason: 'النموذج غير متاح' }; }
          else if (e.kind === 'bad_request') throw e; // الطلب نفسه غلط: لا فائدة من مفتاح ثانٍ
        }
      }
    }
    if (last && !tried) last = null;
    if (!tried) {
      if (invalid && invalid >= n) throw new GeminiError('invalid_key', 'كل مفاتيح Gemini مرفوضة');
      throw new GeminiError('rate_limited', 'كل مفاتيح Gemini بحالة تهدئة', { retryAfterMs: this._soonestReady(models) });
    }
    throw last || new GeminiError('unavailable', 'خدمة Gemini غير متاحة');
  }

  _soonestReady(models) {
    let best = null;
    this.keys.forEach((k) => models.forEach((m) => { const c = k.cooldown[m]; if (c && c.until > this.now()) best = best == null ? c.until : Math.min(best, c.until); }));
    return best ? Math.max(1000, best - this.now()) : 5000;
  }

  async _call(k, model, body, outerSignal, timeoutMs) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs || this.timeoutMs);
    const onAbort = () => ctl.abort();
    if (outerSignal) outerSignal.addEventListener('abort', onAbort);
    // 2.5-flash «يفكّر» افتراضياً (بطيء/مكلف): الحوار القصير لا يحتاجه. (TTS لا يقبل الإعداد)
    if (/gemini-2\.5-flash(?!.*tts)/.test(model) && body.generationConfig && !body.generationConfig.thinkingConfig) body = Object.assign({}, body, { generationConfig: Object.assign({}, body.generationConfig, { thinkingConfig: { thinkingBudget: 0 } }) });
    let res;
    try {
      res = await this.fetch(this.base + '/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k.key }, body: JSON.stringify(body), signal: ctl.signal,
      });
    } catch (e) {
      if (outerSignal && outerSignal.aborted) throw new GeminiError('aborted', 'أُلغي الطلب');
      throw new GeminiError(ctl.signal.aborted ? 'timeout' : 'network', ctl.signal.aborted ? 'انتهت مهلة Gemini' : 'تعذّر الوصول لـGemini');
    } finally { clearTimeout(timer); if (outerSignal) outerSignal.removeEventListener('abort', onAbort); }
    let j = null;
    try { j = await res.json(); } catch (e) { /* ليس JSON */ }
    if (res.ok) return j || {};
    const err = (j && j.error) || {}, msg = String(err.message || ('HTTP ' + res.status)), status = String(err.status || '');
    if (res.status === 429 || status === 'RESOURCE_EXHAUSTED') {
      let ra = 0;
      const det = Array.isArray(err.details) ? err.details.find((d) => d && d.retryDelay) : null;
      if (det) ra = Math.ceil(parseFloat(String(det.retryDelay)) * 1000) || 0;
      const h = Number(res.headers && res.headers.get && res.headers.get('retry-after')); if (h) ra = Math.max(ra, h * 1000);
      const daily = /per ?day|daily|PerDay/i.test(msg + JSON.stringify(err.details || ''));
      throw new GeminiError('rate_limited', msg, { retryAfterMs: Math.min(daily ? 30 * 60e3 : 120e3, Math.max(ra, daily ? 30 * 60e3 : 15000)), daily });
    }
    if (res.status === 401 || res.status === 403 || /api key (not valid|expired)|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg + status)) throw new GeminiError('invalid_key', msg);
    if (res.status === 404) throw new GeminiError('model_missing', msg);
    if (res.status === 400) throw new GeminiError('bad_request', msg);
    throw new GeminiError('unavailable', msg, { status: res.status });
  }

  // لوحة المالك: معرّفات وحالات فقط (لا مفاتيح)
  report() {
    const t = this.now(), groups = [{ id: 'default', keys: this.keys.length, disabled: null, cooldowns: [] }];
    this.keys.forEach((k) => Object.keys(k.cooldown).forEach((m) => { const c = k.cooldown[m]; if (c.until > t) groups[0].cooldowns.push({ model: m + ' (' + k.id.split(' ')[0] + ')', reason: c.reason, secondsLeft: Math.ceil((c.until - t) / 1000) }); }));
    const waits = this.stats.waits.slice().sort((a, b) => a - b);
    return {
      router: { keys: this.keys.map((k) => ({ id: k.id, group: 'default', projectKnown: true, status: k.disabled && k.disabled.until > t ? 'disabled' : 'active', reason: k.disabled && k.disabled.until > t ? k.disabled.reason : '', ok: k.ok, fail: k.fail })), groups },
      routerStats: { requests: this.stats.requests, ok: this.stats.ok, switches: this.stats.switches, queueWaitP95: waits.length ? waits[Math.floor(waits.length * 0.95)] : null },
    };
  }

  // اختبار محدود: طلب صغير لكل مفتاح (بدون كشفه)
  async testKeys() {
    const results = [];
    for (const k of this.keys) {
      try { await this._call(k, this.models.chat[0], { contents: [{ role: 'user', parts: [{ text: 'قل: تمام' }] }], generationConfig: { maxOutputTokens: 8 } }); results.push({ id: k.id, ok: true }); }
      catch (e) { results.push({ id: k.id, ok: false, kind: e.kind }); if (e.kind === 'invalid_key') k.disabled = { until: this.now() + 6 * 3600e3, reason: 'invalid_key' }; }
    }
    return results;
  }
}

function slogHook(router, ev, k) { if (router.onEvent) { try { router.onEvent(ev, { id: k.id }); } catch (e) { /* */ } } }

module.exports = { GeminiRouter, GeminiError, loadGeminiKeys, pcmToWav, KEY_RE };
