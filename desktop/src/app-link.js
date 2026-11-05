'use strict';

/**
 * ربط التطبيق بخادم احسمها (WebSocket مجهول) لثلاثة أشياء فقط:
 *   1) حضور التطبيق (كم تطبيق متصل الآن/كم تثبيت) — installId عشوائي لا يرتبط بحساب + الإصدار والمنصة.
 *   2) استقبال إشعارات يرسلها المالك للتطبيق فقط.
 *   3) إعدادات عن بُعد (رسالة داخل التطبيق، أقل إصدار، إخفاء زر الدخول بالرمز).
 * لا يُرسل أي محتوى شخصي أو توكنات. يعيد الاتصال تلقائياً بتأخير متزايد، ويمكن إيقافه من الإعدادات.
 */
const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function cmpVer(a, b) {
  const pa = String(a).split('.').map(Number); const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}

class AppLink {
  /**
   * @param {{WebSocketImpl:Function, url:string, installId:string, version:string, platform:string,
   *   onNotify:(m:object)=>void, onConfig:(c:object)=>void, log?:Function, setTimeoutImpl?:Function, clearTimeoutImpl?:Function}} d
   */
  constructor(d) {
    Object.assign(this, { log: () => {}, setTimeoutImpl: setTimeout, clearTimeoutImpl: clearTimeout }, d);
    this.ws = null; this.retry = 0; this.timer = null; this.stopped = true; this.connected = false;
    this.seen = new Set();
  }

  start() { if (!this.stopped) return; this.stopped = false; this._open(); }
  stop() { this.stopped = true; this.connected = false; this.clearTimeoutImpl(this.timer); if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch (e) { /* */ } this.ws = null; } }

  _open() {
    if (this.stopped) return;
    let ws;
    try { ws = new this.WebSocketImpl(this.url); } catch (e) { return this._schedule(); }
    this.ws = ws;
    ws.onopen = () => {
      try { ws.send(JSON.stringify({ type: 'hello', installId: this.installId, version: this.version, platform: this.platform })); } catch (e) { /* */ }
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch (e) { return; }
      if (!m || typeof m !== 'object') return;
      this.connected = true; this.retry = 0;
      if (m.type === 'notify') {
        if (typeof m.id !== 'string' || typeof m.title !== 'string' || this.seen.has(m.id)) return;
        this.seen.add(m.id); if (this.seen.size > 50) this.seen.delete(this.seen.values().next().value);
        this.onNotify({ id: m.id.slice(0, 40), title: m.title.slice(0, 80), body: String(m.body || '').slice(0, 240), target: String(m.target || 'home').slice(0, 20), sentAt: Number(m.sentAt) || 0 });
      } else if (m.type === 'config' && m.config && typeof m.config === 'object') {
        const c = m.config;
        this.onConfig({
          motd: c.motd && typeof c.motd === 'object' ? { text: String(c.motd.text || '').slice(0, 300), id: String(c.motd.id || '').slice(0, 40), active: !!c.motd.active } : { text: '', id: '', active: false },
          minVersion: VERSION_RE.test(String(c.minVersion || '')) ? c.minVersion : '',
          codeLoginEnabled: c.codeLoginEnabled !== false,
        });
      }
    };
    ws.onclose = () => { this.connected = false; this.ws = null; this._schedule(); };
    ws.onerror = () => { /* onclose يتولى إعادة الاتصال */ };
  }

  _schedule() {
    if (this.stopped) return;
    this.retry = Math.min(this.retry + 1, 8);
    const delay = Math.min(60000, 2000 * 2 ** (this.retry - 1)) + Math.floor(Math.random() * 1000);
    this.clearTimeoutImpl(this.timer);
    this.timer = this.setTimeoutImpl(() => this._open(), delay);
    if (this.timer && this.timer.unref) this.timer.unref();
  }
}

module.exports = { AppLink, cmpVer };
