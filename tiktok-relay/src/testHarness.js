'use strict';
// أداة اختبار مباشرة (بدون أي مصادقة Firebase ولا حجز حساب) — غرضها الوحيد تجربة نظام
// الربط الجديد (piratetok-live-js + احتياطي Euler) على بث حقيقي قبل وضعه بالموقع الرئيسي.
// مسار منفصل تماماً عن /relay الإنتاجي: لا يلمس LinkingService ولا Firebase، ويُستدعى
// manager.track() مباشرة بنفس يوزر الاختبار. يُستخدم فقط من صفحة test.html بهذا الريبو.
import { WebSocketServer } from 'ws';
import { normalizeTikTokUsername, InvalidUsernameError } from './normalize.js';

export class TestHarness {
  constructor({ manager, log = () => {} } = {}) {
    this.manager = manager;
    this.log = log;
    this.rooms = new Map(); // username -> Set<WebSocket>
    this.wss = new WebSocketServer({ noServer: true });
    this.statsTimer = setInterval(() => this._broadcastStats(), 2000);
    if (this.statsTimer.unref) this.statsTimer.unref();
  }

  handleUpgrade(req, socket, head) {
    const url = new URL(req.url, 'http://localhost');
    let username;
    try {
      username = normalizeTikTokUsername(url.searchParams.get('u') || '');
    } catch (e) {
      return this._reject(socket, 400, e instanceof InvalidUsernameError ? e.message : 'يوزر غير صالح');
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      ws.testUsername = username;
      let set = this.rooms.get(username);
      if (!set) { set = new Set(); this.rooms.set(username, set); }
      set.add(ws);
      this.log('info', 'test_client_connected', { username, roomSize: set.size });
      this._send(ws, { type: '_test_status', message: 'متصل بأداة الاختبار — يبدأ الربط الفعلي الآن' });
      this.manager.track(username);
      this._send(ws, this._statsFor(username));
      ws.on('close', () => {
        set.delete(ws);
        if (set.size === 0) {
          this.rooms.delete(username);
          // لا عميل اختبار متبقٍ لهذا اليوزر — نوقف التتبّع حتى لا يبقى يحاول للأبد بالخلفية.
          this.manager.untrack(username);
          this.log('info', 'test_room_closed', { username });
        }
      });
      ws.on('error', () => {});
    });
  }

  _reject(socket, code, message) {
    try { socket.write(`HTTP/1.1 ${code} ${message}\r\nConnection: close\r\n\r\n`); } catch (e) { /* best-effort */ }
    socket.destroy();
  }

  _send(ws, obj) {
    if (ws.readyState === ws.OPEN) { try { ws.send(JSON.stringify(obj)); } catch (e) { /* best-effort */ } }
  }

  // يُستدعى من index.js لكل حدث موحّد يصدره المدير — يبث فقط لغرفة الاختبار المطابقة.
  forwardEvent(ev) {
    const set = this.rooms.get(ev && ev.streamer);
    if (!set || set.size === 0) return;
    for (const ws of set) this._send(ws, ev);
  }

  _statsFor(username) {
    const snap = this.manager.snapshot();
    return {
      type: '_test_stats',
      username,
      active: this.manager.isActive(username),
      managerSnapshot: snap,
    };
  }

  _broadcastStats() {
    for (const username of this.rooms.keys()) {
      const stats = this._statsFor(username);
      for (const ws of this.rooms.get(username)) this._send(ws, stats);
    }
  }

  closeAll() {
    clearInterval(this.statsTimer);
    for (const set of this.rooms.values()) for (const ws of set) { try { ws.close(1001, 'shutdown'); } catch (e) { /* best-effort */ } }
    this.rooms.clear();
  }
}
