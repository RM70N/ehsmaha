'use strict';
// بث الأحداث الموحّدة إلى عملاء اللعبة عبر WebSocket خاص بنا (منفصل عن أي بروتوكول مزوّد)،
// بقناة (room) لكل ستريمر. كل عميل يُصادَق بحساب احسمها الحالي (توكن Firebase) ولا يستقبل إلا
// أحداث قناته.
import { WebSocketServer } from 'ws';

export class RelayBroadcaster {
  constructor({ verifyToken, log = () => {} } = {}) {
    if (typeof verifyToken !== 'function') throw new Error('verifyToken دالة مطلوبة');
    this.verifyToken = verifyToken;
    this.log = log;
    this.rooms = new Map(); // streamer -> Set<WebSocket>
    this.wss = new WebSocketServer({ noServer: true });
  }

  // يُستدعى من حدث 'upgrade' على خادم http العام لهذا المسار فقط (مثلاً '/relay').
  async handleUpgrade(req, socket, head) {
    const url = new URL(req.url, 'http://localhost');
    const streamer = (url.searchParams.get('streamer') || '').trim().toLowerCase();
    const token = url.searchParams.get('token') || '';
    if (!streamer) return this._reject(socket, 400, 'streamer مطلوب');

    const user = await this.verifyToken(token);
    if (!user) return this._reject(socket, 401, 'توكن غير صالح');

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      ws.ehsmahaUid = user.uid;
      ws.streamer = streamer;
      let set = this.rooms.get(streamer);
      if (!set) { set = new Set(); this.rooms.set(streamer, set); }
      set.add(ws);
      this.log('info', 'relay_client_connected', { streamer, uid: user.uid, roomSize: set.size });
      ws.on('close', () => {
        set.delete(ws);
        if (set.size === 0) this.rooms.delete(streamer);
        this.log('info', 'relay_client_disconnected', { streamer, uid: user.uid });
      });
      ws.on('error', () => {});
    });
  }

  _reject(socket, code, message) {
    try {
      socket.write(`HTTP/1.1 ${code} ${message}\r\nConnection: close\r\n\r\n`);
    } catch (e) { /* best-effort */ }
    socket.destroy();
  }

  // بث حدث لقناة ستريمر واحد فقط — لا يصل لأي قناة أخرى.
  broadcast(streamer, event) {
    const set = this.rooms.get(streamer);
    if (!set || set.size === 0) return 0;
    const text = JSON.stringify(event);
    let sent = 0;
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) { ws.send(text); sent++; }
    }
    return sent;
  }

  roomSize(streamer) {
    const set = this.rooms.get(streamer);
    return set ? set.size : 0;
  }

  closeAll() {
    for (const set of this.rooms.values()) for (const ws of set) { try { ws.close(1001, 'shutdown'); } catch (e) { /* best-effort */ } }
    this.rooms.clear();
  }
}
