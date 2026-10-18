'use strict';
// جلسة شات كيك واحدة فوق مكتبة kichat.js (غير رسمية: Pusher + kick.com/api/v2/channels/{slug}/info).
//
// لماذا لا نعتمد على إعادة اتصال المكتبة نفسها (reconnect:false عمداً):
//   • reconnect() داخل المكتبة ينتظر مؤقتاً ثم يستدعي connect() حتى لو أُغلق العميل بعدها — يعني اتصال «شبح»
//     يبقى حياً بعد خروج الستريمر ويسرّب الذاكرة. نحن نستبدل العميل بالكامل بدل ما نعيد استخدامه.
//   • ما فيه كشف لاتصال ميت بصمت (لا إغلاق ولا خطأ): نضيف watchdog على الإطارات الواردة (pong كل ~120ث).
//   • join() ما يفرّق بين «القناة غير موجودة» (404) و«محجوب من Cloudflare» (403) — كله «Failed to fetch» — ويجلب
//     نفس الرابط مرتين. نفحص القناة بأنفسنا أولاً بحالة واضحة، ونمرّر النتيجة للمكتبة بدل جلب ثانٍ.
//
// الأحداث (EventEmitter): 'state' {state, code?, live?} · 'message' (unified) · 'blocked' {code, detail} · 'fatal' {code} · 'gaveup'
//   state: connecting | connected | not_live | reconnecting | error
const { EventEmitter } = require('events');
const { backoffDelay } = require('./backoff');
const { normalizeSlug, slugVariants, toUnified, MessageGate } = require('./kick-adapter');

const INFO_URL = (slug) => 'https://kick.com/api/v2/channels/' + encodeURIComponent(slug) + '/info';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const DEFAULTS = {
  maxAttempts: 10,          // محاولات فاشلة متتالية قبل الاستسلام (تُصفَّر عند أول نجاح)
  backoffBaseMs: 1000, backoffMaxMs: 60000,
  preflightTimeoutMs: 15000, connectTimeoutMs: 15000, joinTimeoutMs: 12000,
  idleLimitMs: 190000,      // pusher activity_timeout=120ث → أي صمت أطول من هذا = اتصال ميت
  watchdogEveryMs: 15000,
  flushMs: 50,              // دفعات الإرسال: مئات الرسائل/ثانية تُجمَّع بإطار واحد بدل إطار لكل رسالة
  queueMax: 3000,           // سقف الطابور عند ضغط هائل (نحذف الأقدم)
};

// فحص القناة قبل الاتصال. يرجّع { ok:true, info, slug, live } أو { ok:false, code, detail }
//   code: not_found (404) | blocked (403/429/صفحة تحدّي Cloudflare) | unavailable (شبكة/5xx/مهلة/JSON تالف)
async function checkChannel(rawSlug, deps) {
  const fetchImpl = (deps && deps.fetch) || globalThis.fetch;
  const norm = normalizeSlug(rawSlug);
  if (!norm.ok) return { ok: false, code: 'invalid', detail: norm.reason };
  let last = { ok: false, code: 'not_found', detail: '404' };
  for (const slug of slugVariants(norm.slug)) {
    let res;
    try {
      res = await fetchImpl(INFO_URL(slug), { headers: { 'user-agent': BROWSER_UA, accept: 'application/json' }, signal: deps && deps.signal });
    } catch (e) {
      return { ok: false, code: 'unavailable', detail: (e && e.message) || String(e) };
    }
    if (res.status === 404) { last = { ok: false, code: 'not_found', detail: '404' }; continue; }
    if (res.status === 403 || res.status === 429) return { ok: false, code: 'blocked', detail: String(res.status) };
    if (!res.ok) return { ok: false, code: 'unavailable', detail: String(res.status) };
    let info;
    try { info = await res.json(); } catch (e) { return { ok: false, code: 'blocked', detail: 'non_json' }; } // صفحة HTML بدل JSON = تحدّي حماية
    if (!info || !info.chatroom || info.chatroom.id == null || !info.slug) return { ok: false, code: 'unavailable', detail: 'bad_shape' };
    return { ok: true, info, slug: String(info.slug), live: !!info.livestream };
  }
  return last;
}

class KickChatSession extends EventEmitter {
  // opts.KiChatjs: صنف المكتبة (يُحقن بالاختبار). opts.fetch. opts.timers = { now, set(fn,ms), clear(h) }.
  constructor(rawSlug, opts) {
    super();
    const o = Object.assign({}, DEFAULTS, opts || {});
    this.o = o;
    this.rawSlug = rawSlug;
    this.timers = o.timers || { now: Date.now, set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) };
    this.KiChatjs = o.KiChatjs || require('kichat.js').KiChatjs;
    this.fetch = o.fetch || globalThis.fetch;
    this.gate = new MessageGate(Object.assign({ now: this.timers.now }, o.gate || {}));
    this.gen = 0;            // يُبطل أحداث أي عميل قديم
    this.stopped = false;
    this.client = null;
    this.attempts = 0;
    this.lastRawAt = 0;
    this.retryTimer = null; this.watchdog = null; this.flushTimer = null;
    this.queue = [];
    this.state = 'idle';
    this.live = null;
    this.counters = { received: 0, delivered: 0, dupId: 0, dupText: 0, rateLimited: 0, dropped: 0, reconnects: 0, stale: 0 };
  }

  _setState(state, extra) {
    this.state = state;
    this.emit('state', Object.assign({ state }, extra || {}));
  }

  start() {
    if (this.stopped) return Promise.resolve();
    this._setState('connecting');
    return this._attempt();
  }

  async _attempt() {
    if (this.stopped) return;
    const gen = ++this.gen;
    const alive = () => !this.stopped && gen === this.gen;
    this._dispose();

    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const pf = await this._withTimeout(checkChannel(this.rawSlug, { fetch: this.fetch, signal: ac && ac.signal }), this.o.preflightTimeoutMs, 'preflight_timeout').catch((e) => {
      if (ac) { try { ac.abort(); } catch (x) { /* ignore */ } }
      return { ok: false, code: 'unavailable', detail: (e && e.message) || String(e) };
    });
    if (!alive()) return;
    if (!pf.ok) {
      if (pf.code === 'not_found' || pf.code === 'invalid') { this._setState('error', { code: 'user_not_found' }); this.emit('fatal', { code: 'user_not_found', detail: pf.detail }); return; }
      if (pf.code === 'blocked') { this.emit('blocked', { code: pf.code, detail: pf.detail }); return; } // الغرفة تقرّر: رجوع للناقل القديم
      return this._failed('preflight:' + pf.detail);
    }

    let client;
    try {
      client = new this.KiChatjs({ reconnect: false, subscribePusher: { channel: true, chatRoom: true, predictions: false } });
    } catch (e) { return this._failed('ctor:' + ((e && e.message) || e)); }
    this.client = client;
    // نمرّر نتيجة فحصنا للمكتبة (تجلب نفس الرابط مرتين وبلا User-Agent) — لا جلب إضافي ولا فرق بين 403 و404
    client.fetchUserInfo = async () => pf.info;
    client.fetchChatRoom = async () => pf.info;
    this.slug = pf.slug;
    this.live = pf.live;

    const fresh = (fn) => (...a) => { if (alive()) fn(...a); };
    client.on('socketError', fresh((err) => this._lost('socketError:' + ((err && err.message) || err))));
    client.on('error', fresh((err) => this._lost('error:' + ((err && err.message) || err))));
    client.on('disconnected', fresh((why) => this._lost('disconnected:' + why)));
    client.on('raw', fresh(() => { this.lastRawAt = this.timers.now(); }));
    client.on('message', fresh((m, ch) => this._onMessage(m, ch)));
    client.on('streamerIsLive', fresh(() => { this.live = true; this._setState('connected', { live: true }); }));
    client.on('stopStreamBroadcast', fresh(() => { this.live = false; this._setState('not_live'); }));
    // أحداث عادية أخرى نتجاهلها عمداً (اشتراكات/تحديثات…) — الألعاب تحتاج الشات فقط.

    try {
      const connected = new Promise((resolve, reject) => {
        const onC = () => { client.off('connected', onC); resolve(); };
        client.on('connected', onC);
        client.on('socketError', (e) => reject(e instanceof Error ? e : new Error(String(e))));
      });
      client.connect();
      await this._withTimeout(connected, this.o.connectTimeoutMs, 'connect_timeout');
      if (!alive()) return;
      await this._withTimeout(client.join(pf.slug), this.o.joinTimeoutMs, 'join_timeout');
      if (!alive()) return;
    } catch (e) {
      if (!alive()) return;
      return this._failed('connect:' + ((e && e.message) || e));
    }
    this.attempts = 0;
    this.lastRawAt = this.timers.now();
    this._startWatchdog(gen);
    this._setState(this.live ? 'connected' : 'not_live', { live: !!this.live });
  }

  _onMessage(m, channel) {
    this.counters.received++;
    const u = toUnified(m, channel, this.timers.now());
    if (!u) return;
    const r = this.gate.check(u);
    if (!r.pass) {
      if (r.reason === 'dup_id') this.counters.dupId++; else if (r.reason === 'dup_text') this.counters.dupText++; else this.counters.rateLimited++;
      return;
    }
    // وصلت رسالة = القناة حيّة فعلاً حتى لو لم يصلنا حدث streamerIsLive
    if (this.state === 'not_live') { this.live = true; this._setState('connected', { live: true }); }
    if (this.queue.length >= this.o.queueMax) { this.queue.shift(); this.counters.dropped++; }
    this.queue.push(u);
    if (!this.flushTimer) this.flushTimer = this.timers.set(() => this._flush(), this.o.flushMs);
  }

  _flush() {
    this.flushTimer = null;
    if (this.stopped || !this.queue.length) { this.queue = []; return; }
    const batch = this.queue; this.queue = [];
    this.counters.delivered += batch.length;
    this.emit('messages', batch);
  }

  _lost(why) {
    // أي فقدان بعد/أثناء الاتصال → استبدال العميل بالكامل مع تراجع أسّي
    if (this.stopped) return;
    this._failed(why);
  }

  _failed(why) {
    this._dispose();
    this.gen++; // أبطل أي أحداث متأخرة من العميل المُتخلّى عنه
    this.attempts++;
    if (this.attempts > this.o.maxAttempts) {
      this._setState('error', { code: 'connect_failed', detail: why });
      this.emit('gaveup', { attempts: this.attempts - 1, detail: why });
      return;
    }
    this.counters.reconnects++;
    const delay = backoffDelay(this.attempts, { baseMs: this.o.backoffBaseMs, maxMs: this.o.backoffMaxMs, rng: this.o.rng || Math.random });
    this._setState('reconnecting', { attempt: this.attempts, delayMs: delay, detail: why });
    if (this.retryTimer) this.timers.clear(this.retryTimer);
    this.retryTimer = this.timers.set(() => { this.retryTimer = null; this._attempt(); }, delay);
  }

  _startWatchdog(gen) {
    if (this.watchdog) this.timers.clear(this.watchdog);
    const tick = () => {
      if (this.stopped || gen !== this.gen) return;
      if (this.timers.now() - this.lastRawAt > this.o.idleLimitMs) { this.counters.stale++; this._failed('stale_connection'); return; }
      this.watchdog = this.timers.set(tick, this.o.watchdogEveryMs);
    };
    this.watchdog = this.timers.set(tick, this.o.watchdogEveryMs);
  }

  // يوقف ويفرّغ كل شيء: لا مؤقتات ولا سوكيت ولا مستمعين.
  stop() {
    this.stopped = true;
    this.gen++;
    this._dispose();
    if (this.retryTimer) { this.timers.clear(this.retryTimer); this.retryTimer = null; }
    this.queue = [];
    this.removeAllListeners();
  }

  _dispose() {
    if (this.watchdog) { this.timers.clear(this.watchdog); this.watchdog = null; }
    if (this.flushTimer) { this.timers.clear(this.flushTimer); this.flushTimer = null; }
    const c = this.client;
    this.client = null;
    if (!c) return;
    try { if (c.listeners && c.listeners.clear) c.listeners.clear(); } catch (e) { /* ignore */ }
    // مستمع صامت: أي حدث error متأخر بعد التفريغ ما يرمي استثناءً قاتلاً (EventEmitter المكتبة يرمي بلا مستمع)
    try { c.on('error', () => {}); c.on('socketError', () => {}); } catch (e) { /* ignore */ }
    try { c.wasCloseCalled = true; } catch (e) { /* ignore */ }
    try { if (c.pingInterval) clearInterval(c.pingInterval); } catch (e) { /* ignore */ }
    try { c.close(); } catch (e) { /* ignore */ }
    try { if (c.socket && typeof c.socket.terminate === 'function') c.socket.terminate(); } catch (e) { /* ignore */ }
  }

  _withTimeout(p, ms, label) {
    let h;
    const t = new Promise((_, rej) => { h = this.timers.set(() => rej(new Error(label)), ms); });
    return Promise.race([Promise.resolve(p), t]).finally(() => { this.timers.clear(h); });
  }
}

module.exports = { KickChatSession, checkChannel, DEFAULTS };
