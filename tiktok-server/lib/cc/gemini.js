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
    // الأسماء تتبدل عند Google وبعض النماذج تُسحب من الحسابات الجديدة (404 «no longer available to new users»):
    // 1) متغيرات البيئة تغلب دائماً. 2) وإلا نكتشف المتاح فعلاً من ListModels (الأرخص أولاً). 3) وإلا هذي الأسماء المستعارة (-latest) اللي تتبع النموذج الحالي عند Google.
    const cheap = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
    this.pinned = {
      chat: !!(env.GEMINI_CHAT_MODELS || env.GEMINI_MODEL), stt: !!env.GEMINI_STT_MODELS, tts: !!env.GEMINI_TTS_MODELS,
    };
    this.models = {
      chat: listEnv(env.GEMINI_CHAT_MODELS || env.GEMINI_MODEL, cheap),
      stt: listEnv(env.GEMINI_STT_MODELS, cheap),
      tts: listEnv(env.GEMINI_TTS_MODELS, ['gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-tts']),
    };
    this.disc = { at: 0, inflight: null, found: null, error: null };
    this.rr = 0;
    this.stats = { requests: 0, ok: 0, switches: 0, waits: [] };
    this.timeoutMs = Number(env.GEMINI_TIMEOUT_MS) || 14000;
  }

  get hasKeys() { return this.keys.length > 0; }
  liveKeys() { return this.keys.filter((k) => !k.disabled || k.disabled.until <= this.now()); }

  cooling(k, model) { const c = k.cooldown[model]; return !!c && c.until > this.now(); }

  // اكتشاف النماذج المتاحة لمفاتيحك فعلاً (ListModels) وترتيبها: الأرخص أولاً (lite ثم flash)، الأحدث المستقر قبل التجريبي.
  rank(list, kind) {
    const bad = /embed|aqa|imagen|veo|image|live|robotics|computer-use|learnlm|gemma|exp(?!ress)|customtools/i;
    const rows = (list || []).filter((m) => m && /generateContent/.test((m.supportedGenerationMethods || []).join(',')) || (m && !m.supportedGenerationMethods))
      .map((m) => String(m.name || '').replace(/^models\//, '')).filter((n) => /^gemini-/.test(n));
    const ver = (n) => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    const stable = (n) => (/preview|exp|-\d{2}-\d{2}$/.test(n) ? 0 : 1);
    const sorter = (a, b) => (ver(b) - ver(a)) || (stable(b) - stable(a)) || a.length - b.length;
    if (kind === 'tts') return rows.filter((n) => /tts/.test(n)).sort(sorter);
    const ok = rows.filter((n) => !/tts/.test(n) && !bad.test(n) && !/-latest$/.test(n));
    const lite = ok.filter((n) => /flash-lite/.test(n)).sort(sorter);
    const flash = ok.filter((n) => /flash/.test(n) && !/flash-lite/.test(n)).sort(sorter);
    return lite.concat(flash);
  }

  // قياس سرعة أول المرشحين فعلياً (طلب صغير بالتوازي): الأسرع الشغّال أولاً، والفاشل/البطيء يتأخر. بعض النماذج المعاينة بطيئة جداً.
  async probe(k, list) {
    const cand = list.filter((n) => /flash-lite/.test(n)).slice(0, 3).concat(list.filter((n) => !/flash-lite/.test(n)).slice(0, 1));
    const body = { contents: [{ role: 'user', parts: [{ text: 'قل: تمام' }] }], generationConfig: { maxOutputTokens: 16 } };
    const rows = await Promise.all(cand.map(async (m) => {
      const t = Date.now();
      try { await this._call(k, m, body, null, 9000); return { model: m, ok: true, ms: Date.now() - t }; }
      catch (e) { return { model: m, ok: false, ms: Date.now() - t, kind: e && e.kind }; }
    }));
    const good = rows.filter((r) => r.ok && r.ms < 8000).sort((a, b) => a.ms - b.ms).map((r) => r.model);
    return { rows, order: good };
  }

  async discover(force) {
    if (!this.hasKeys) return null;
    const now = this.now();
    if (!force && this.disc.at && now - this.disc.at < 6 * 3600e3) return this.disc.found;
    if (this.disc.inflight) return this.disc.inflight;
    this.disc.inflight = (async () => {
      const live = this.liveKeys();
      for (const k of live.slice(0, 2)) {
        const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 6000);
        try {
          const r = await this.fetch(this.base + '/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': k.key }, signal: ctl.signal });
          const j = await r.json().catch(() => null);
          if (r.ok && j && Array.isArray(j.models)) {
            const found = { chat: this.rank(j.models, 'chat'), tts: this.rank(j.models, 'tts'), total: j.models.length };
            found.probe = await this.probe(k, found.chat);
            if (found.probe.order.length) found.chat = found.probe.order.concat(found.chat.filter((x) => found.probe.order.indexOf(x) < 0));
            this.disc.found = found; this.disc.error = null; this.disc.at = this.now();
            const merge = (kind, fb) => { const list = found[kind === 'tts' ? 'tts' : 'chat']; if (!this.pinned[kind] && list.length) this.models[kind] = list.concat(fb.filter((x) => list.indexOf(x) < 0)); };
            merge('chat', this.models.chat); merge('stt', this.models.stt); merge('tts', this.models.tts);
            return found;
          }
          this.disc.error = 'HTTP ' + r.status;
        } catch (e) { this.disc.error = ctl.signal.aborted ? 'timeout' : 'network'; }
        finally { clearTimeout(tm); }
      }
      this.disc.at = this.now() - 5.5 * 3600e3; // فشل الاكتشاف: نعيد المحاولة بعد نصف ساعة تقريباً
      return null;
    })().finally(() => { this.disc.inflight = null; });
    return this.disc.inflight;
  }

  // يجرّب المفاتيح بالتناوب × النماذج بالترتيب. ينتهي بـGeminiError(kind) لو فشل الكل.
  async generate(kind, body, opts) {
    opts = opts || {};
    if (!this.hasKeys) throw new GeminiError('no_keys', 'مفاتيح Gemini غير مضبوطة');
    if (!this.pinned[kind]) { try { await this.discover(false); } catch (e) { /* نكمل بالأسماء الافتراضية */ } }
    try { return await this._generate(kind, body, opts); }
    catch (e) {
      // كل النماذج «غير متاحة»: نعيد الاكتشاف مرة وحدة ونجرّب القائمة الجديدة
      if (e && (e.kind === 'model_missing' || (e.kind === 'rate_limited' && this.onlyMissingCooldowns())) && !this.pinned[kind] && this.now() - (this.disc.forcedAt || 0) > 60e3) {
        this.disc.forcedAt = this.now();
        this.keys.forEach((k) => { k.cooldown = {}; });
        const f = await this.discover(true).catch(() => null);
        if (f) return this._generate(kind, body, opts);
      }
      throw e;
    }
  }

  onlyMissingCooldowns() {
    const t = this.now(); let any = false;
    for (const k of this.keys) for (const m of Object.keys(k.cooldown)) { const c = k.cooldown[m]; if (c.until > t) { any = true; if (c.reason !== 'النموذج غير متاح') return false; } }
    return any;
  }

  async _generate(kind, body, opts) {
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
          else if (e.kind === 'model_missing') { k.cooldown[model] = { until: this.now() + 600e3, reason: 'النموذج غير متاح' }; }
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

  async _call(k, model, body, outerSignal, timeoutMs, noRetry) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs || this.timeoutMs);
    const onAbort = () => ctl.abort();
    if (outerSignal) outerSignal.addEventListener('abort', onAbort);
    // 2.5-flash «يفكّر» افتراضياً (بطيء/مكلف): الحوار القصير لا يحتاجه. (TTS لا يقبل الإعداد)
    // النماذج «المفكّرة» بطيئة بدون داعي للحوار القصير: 2.5 بميزانية صفر، و3.x+ بأقل مستوى تفكير.
    const noThink = noRetry || !body.generationConfig || body.generationConfig.thinkingConfig || /tts/.test(model) ? null
      : /gemini-2\.5-flash/.test(model) ? { thinkingBudget: 0 }
        : /gemini-(?:[3-9]|\d{2})/.test(model) || /-latest$/.test(model) ? { thinkingLevel: 'minimal' } : null;
    if (noThink) body = Object.assign({}, body, { generationConfig: Object.assign({}, body.generationConfig, { thinkingConfig: noThink }) });
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
    if (res.status === 400 && noThink && !noRetry && /think/i.test(msg)) {
      const g = Object.assign({}, body.generationConfig); delete g.thinkingConfig;
      return this._call(k, model, Object.assign({}, body, { generationConfig: g }), outerSignal, timeoutMs, true);
    }
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

  // تشخيص عام بلا أسرار: زمن الوصول للشبكة (بدون مفتاح) + طلب صغير لكل مفتاح على أول نموذج دردشة، بالتوازي.
  async diagnose() {
    const timed = async (fn) => { const t = Date.now(); try { const v = await fn(); return Object.assign({ ms: Date.now() - t }, v); } catch (e) { return { ms: Date.now() - t, ok: false, kind: e && e.kind ? e.kind : 'error', msg: String((e && e.message) || '').slice(0, 120) }; } };
    const net = await timed(async () => {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 8000);
      try { const r = await this.fetch(this.base + '/v1beta/models', { signal: ctl.signal }); return { ok: true, status: r.status }; }
      catch (e) { throw new GeminiError(ctl.signal.aborted ? 'timeout' : 'network', e && e.message); } finally { clearTimeout(tm); }
    });
    await this.discover(true).catch(() => null);
    const model = this.models.chat[0];
    const keys = await Promise.all(this.keys.map((k) => timed(async () => {
      await this._call(k, model, { contents: [{ role: 'user', parts: [{ text: 'قل: تمام' }] }], generationConfig: { maxOutputTokens: 8 } }, null, 8000);
      return { ok: true };
    }).then((r) => Object.assign({ id: k.id, model }, r))));
    return { node: process.version, base: this.base, models: this.models, pinned: this.pinned, discovered: this.disc.found, discoveryError: this.disc.error, net, keys, okKeys: keys.filter((x) => x.ok).length };
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
