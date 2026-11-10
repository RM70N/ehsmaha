// جمعتنا — خادم الغرف الموثوق (Authoritative). وحدة مستقلة تمامًا عن بقية الـ relay:
// مسار WebSocket خاص (/jam3atna/ws)، لا تلمس Firebase ولا أي نظام قائم.
// كل قرار رسمي (الأدوار، الوقت، النقاط، الفوز) يتخذه هذا الخادم؛ العميل يرسل «طلبات» فقط.
import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import { CityGame } from './city-game.js';
import { PropGame } from './prop-game.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون 0/O/1/I لتفادي اللبس
export const GAMES = {
  city: { min: 4, max: 20, Game: CityGame, defaults: { rounds: 5, missionSec: 45, knockout: false } },
  prop: { min: 4, max: 16, Game: PropGame, defaults: { rounds: 4, seekSec: 180, map: 'rotate' } },
};
const SETTING_RULES = {
  city: { rounds: [3, 4, 5, 6, 7], missionSec: [30, 45, 60], knockout: [true, false] },
  prop: { rounds: [2, 3, 4, 5, 6], seekSec: [120, 180, 240, 300], map: ['rotate', 'hospital', 'house', 'school', 'market', 'hotel', 'funland'] },
};

function cleanName(v) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}
function cleanAvatar(v) {
  const s = String(v == null ? '' : v);
  if (/^[0-9]{1,2}$/.test(s)) return s;                       // أفاتار مدمج برقم
  if (/^https:\/\/[^\s"'<>]{1,300}$/.test(s)) return s;       // صورة الحساب (https فقط)
  return '0';
}
const normName = (n) => n.toLowerCase().replace(/[ً-ْـ\s]/g, '');

export class Jam3atnaServer {
  /**
   * @param {object} [opts]
   * @param {object} [opts.cfg] تجاوزات للمدد (للاختبارات): lobbyGraceMs, playGraceMs, hostGraceMs, idleMs, min:{city,prop} + إعدادات الألعاب
   */
  constructor(opts = {}) {
    this.cfg = Object.assign({ lobbyGraceMs: 25000, playGraceMs: 90000, hostGraceMs: 45000, idleMs: 30 * 60000, endedMs: 10 * 60000, maxRooms: 400 }, opts.cfg || {});
    this.log = opts.log || (() => {});
    this.rooms = new Map();
    this.joinFails = new Map(); // ip → [timestamps] لمنع تخمين الأكواد
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
    this.wss.on('connection', (ws, req) => this._onConn(ws, req));
    this._sweep = setInterval(() => this._sweepRooms(), 30000); this._sweep.unref();
  }

  handleUpgrade(req, socket, head) { this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req)); }
  closeAll() { clearInterval(this._sweep); for (const r of this.rooms.values()) this._closeRoom(r, 'server'); this.wss.close(); }
  stats() { let players = 0; for (const r of this.rooms.values()) players += r.players.size; return { rooms: this.rooms.size, players }; }

  _newCode() {
    for (let k = 0; k < 50; k++) {
      let c = ''; for (let i = 0; i < 6; i++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(c)) return c;
    }
    throw new Error('code_space');
  }

  _onConn(ws, req) {
    const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim();
    ws.j = { ip, room: null, pid: null, n: 0, win: Date.now(), alive: true };
    ws.on('message', (data) => {
      const s = ws.j; const now = Date.now();
      if (now - s.win > 1000) { s.win = now; s.n = 0; }
      if (++s.n > 60) return; // حد أقصى للرسائل بالثانية لكل اتصال
      let m; try { m = JSON.parse(String(data)); } catch (e) { return; }
      if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
      try { this._onMsg(ws, m); } catch (e) { this.log('error', 'jam3atna_msg', { t: m.t, message: e && e.message }); }
    });
    ws.on('close', () => this._onClose(ws));
    ws.on('error', () => {});
  }

  _send(ws, m) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(m)); } catch (e) {} } }
  sendTo(p, m) { if (p && p.ws) this._send(p.ws, m); }
  broadcast(room, m, filter) { const s = JSON.stringify(m); for (const p of room.players.values()) if (p.ws && p.ws.readyState === 1 && (!filter || filter(p))) { try { p.ws.send(s); } catch (e) {} } }

  _roomView(room) {
    const g = GAMES[room.game];
    return {
      t: 'room', code: room.code, game: room.game, phase: room.phase, hostId: room.hostId, settings: room.settings,
      min: this._min(room.game), max: g.max,
      players: [...room.players.values()].filter((p) => !p.isHost || p.plays).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, ready: p.ready, on: !!p.ws, score: p.score })),
      hostOn: !!(room.players.get(room.hostId) || {}).ws,
    };
  }
  _min(game) { return (this.cfg.min && this.cfg.min[game]) || GAMES[game].min; }
  pushRoom(room) { this.broadcast(room, this._roomView(room)); }

  _failJoin(ws, code) {
    const a = this.joinFails.get(ws.j.ip) || []; a.push(Date.now()); this.joinFails.set(ws.j.ip, a.filter((t) => Date.now() - t < 60000));
    this._send(ws, { t: 'error', code });
  }

  _onMsg(ws, m) {
    const s = ws.j;
    if (m.t === 'ping') return this._send(ws, { t: 'pong', c: m.c, now: Date.now() });
    if (m.t === 'peek') { // التحقق من وجود الغرفة قبل إدخال الاسم
      const r = this.rooms.get(String(m.code || '').toUpperCase());
      if ((this.joinFails.get(s.ip) || []).filter((t) => Date.now() - t < 60000).length > 30) return this._send(ws, { t: 'error', code: 'slow_down' });
      if (!r || r.phase === 'closed') return this._failJoin(ws, 'not_found');
      return this._send(ws, { t: 'peek', code: r.code, game: r.game, phase: r.phase, count: [...r.players.values()].filter((p) => !p.isHost || p.plays).length, max: GAMES[r.game].max });
    }
    if (m.t === 'create') {
      if (s.room) return;
      const g = GAMES[m.game]; if (!g) return this._send(ws, { t: 'error', code: 'bad_game' });
      if (this.rooms.size >= this.cfg.maxRooms) return this._send(ws, { t: 'error', code: 'busy' });
      const code = this._newCode();
      const room = { code, game: m.game, phase: 'lobby', players: new Map(), settings: Object.assign({}, g.defaults), hostId: null, inst: null, createdAt: Date.now(), touched: Date.now(), hostTimer: null };
      const host = this._mkPlayer(ws, 'المضيف', '0'); host.isHost = true; room.hostId = host.id; if (m.plays) { host.plays = true; host.ready = true; const hn = cleanName(m.name); host.name = hn.length >= 2 ? hn : 'المضيف'; host.avatar = cleanAvatar(m.avatar); } room.players.set(host.id, host);
      this.rooms.set(code, room); s.room = code; s.pid = host.id;
      this._send(ws, { t: 'joined', code, you: { id: host.id, token: host.token, host: true, plays: !!host.plays, name: host.name }, now: Date.now() });
      this.pushRoom(room); this.log('info', 'jam3atna_room_created', { game: m.game });
      return;
    }
    if (m.t === 'join') {
      if (s.room) return;
      if ((this.joinFails.get(s.ip) || []).filter((t) => Date.now() - t < 60000).length > 30) return this._send(ws, { t: 'error', code: 'slow_down' });
      const room = this.rooms.get(String(m.code || '').toUpperCase());
      if (!room || room.phase === 'closed') return this._failJoin(ws, 'not_found');
      // إعادة اتصال بنفس الرمز السري (تحديث الصفحة / انقطاع / تبويب ثانٍ)
      if (m.token) {
        const p = [...room.players.values()].find((x) => x.token === m.token);
        if (p) return this._attach(ws, room, p, true);
      }
      if (room.phase !== 'lobby') return this._send(ws, { t: 'error', code: 'started' });
      if ([...room.players.values()].filter((p) => !p.isHost || p.plays).length >= GAMES[room.game].max) return this._send(ws, { t: 'error', code: 'full' });
      const name = cleanName(m.name); if (name.length < 2) return this._send(ws, { t: 'error', code: 'bad_name' });
      const nn = normName(name);
      if ([...room.players.values()].some((p) => (!p.isHost || p.plays) && normName(p.name) === nn)) return this._send(ws, { t: 'error', code: 'name_taken' });
      const p = this._mkPlayer(ws, name, cleanAvatar(m.avatar)); room.players.set(p.id, p);
      return this._attach(ws, room, p, false);
    }
    // ---- ما بعد هذا يتطلب عضوية بالغرفة ----
    const room = s.room && this.rooms.get(s.room); const me = room && room.players.get(s.pid);
    if (!room || !me || me.ws !== ws) return;
    room.touched = Date.now();
    const isHost = me.id === room.hostId;
    switch (m.t) {
      case 'ready': if (room.phase === 'lobby' && !isHost) { me.ready = !!m.v; this.pushRoom(room); } break;
      case 'leave': this._removePlayer(room, me, 'left'); break;
      case 'hostquit': { // المضيف اللاعب يطلع من اللعب ويكمل كشاشة مشاهدة (الغرفة تبقى)
        if (!isHost || !me.plays || room.phase === 'closed') break;
        me.plays = false; me.ready = false; if (room.inst && room.phase === 'playing') room.inst.onLeave(me);
        this.sendTo(me, { t: 'you', plays: false, name: me.name }); this.pushRoom(room);
        if (room.inst && room.phase !== 'lobby') room.inst.onRejoin(me); break; }
      case 'hostplay': { // المضيف يقرر يلعب معهم أو يكتفي بالمشاهدة (قبل البدء فقط)
        if (!isHost || room.phase !== 'lobby') break; const on = !!m.v;
        if (on) { const hn = cleanName(m.name); const nm = hn.length >= 2 ? hn : (me.name !== 'المضيف' ? me.name : 'المضيف'); if ([...room.players.values()].some((p) => p !== me && (!p.isHost || p.plays) && normName(p.name) === normName(nm))) return this.sendTo(me, { t: 'error', code: 'name_taken' }); if ([...room.players.values()].filter((p) => !p.isHost || p.plays).length >= GAMES[room.game].max) return this.sendTo(me, { t: 'error', code: 'full' }); me.name = nm; if (m.avatar != null) me.avatar = cleanAvatar(m.avatar); me.plays = true; me.ready = true; } else { me.plays = false; me.ready = false; }
        this.sendTo(me, { t: 'you', plays: !!me.plays, name: me.name }); this.pushRoom(room); break; }
      case 'settings': {
        if (!isHost || room.phase !== 'lobby' || !m.s || typeof m.s !== 'object') break;
        const rules = SETTING_RULES[room.game];
        for (const k of Object.keys(rules)) if (k in m.s && rules[k].includes(m.s[k])) room.settings[k] = m.s[k];
        this.pushRoom(room); break;
      }
      case 'kick': {
        if (!isHost) break; // أمر مضيف — يُرفض بصمت من غيره
        const t = room.players.get(String(m.id)); if (t && !t.isHost) this._removePlayer(room, t, 'kicked');
        break;
      }
      case 'start': {
        if (!isHost || room.phase !== 'lobby') break; // الضغط مرتين: الثانية تُتجاهل لأن الحالة تغيّرت
        const active = [...room.players.values()].filter((p) => !p.isHost || p.plays);
        if (active.length < this._min(room.game)) { this.sendTo(me, { t: 'error', code: 'need_players', min: this._min(room.game) }); break; }
        room.phase = 'playing';
        for (const p of active) { p.score = 0; p.ready = false; }
        room.inst = new GAMES[room.game].Game(this, room, Object.assign({}, this.cfg[room.game] || {}));
        this.pushRoom(room); room.inst.start();
        break;
      }
      case 'cancel': if (isHost) this._closeRoom(room, 'cancelled'); break;
      case 'again': {
        if (!isHost || room.phase !== 'ended') break;
        room.phase = 'lobby'; if (room.inst) { room.inst.stop(); room.inst = null; }
        for (const p of room.players.values()) { p.score = 0; p.ready = false; }
        // من انقطع نهائيًا أثناء المباراة يُزال الآن
        for (const p of [...room.players.values()]) if (!p.ws && !p.isHost) room.players.delete(p.id);
        this.pushRoom(room); break;
      }
      case 'g': if (room.phase === 'playing' && room.inst && m.d && typeof m.d === 'object') room.inst.onMessage(me, m.d); break;
      default: break;
    }
  }

  _mkPlayer(ws, name, avatar) {
    return { id: crypto.randomBytes(5).toString('hex'), token: crypto.randomBytes(18).toString('base64url'), name, avatar, ready: false, score: 0, ws, isHost: false, dropTimer: null, joinedAt: Date.now() };
  }

  _attach(ws, room, p, rejoin) {
    if (p.ws && p.ws !== ws) { // نفس اللاعب من تبويبين: الأحدث يأخذ المكان
      const old = p.ws; old.j.room = null; old.j.pid = null; this._send(old, { t: 'replaced' }); try { old.close(4001, 'replaced'); } catch (e) {}
    }
    clearTimeout(p.dropTimer); p.dropTimer = null; p.ws = ws; ws.j.room = room.code; ws.j.pid = p.id;
    if (p.id === room.hostId) { clearTimeout(room.hostTimer); room.hostTimer = null; }
    this._send(ws, { t: 'joined', code: room.code, you: { id: p.id, token: p.token, host: p.id === room.hostId, plays: !!p.plays, name: p.name }, now: Date.now(), rejoin });
    this.pushRoom(room);
    if (rejoin && room.inst && room.phase !== 'lobby') room.inst.onRejoin(p);
  }

  _onClose(ws) {
    const s = ws.j; const room = s.room && this.rooms.get(s.room); if (!room) return;
    const p = room.players.get(s.pid); if (!p || p.ws !== ws) return;
    p.ws = null; p.ready = false;
    if (p.id === room.hostId) {
      // سياسة خروج المضيف: مهلة للعودة، ثم إنهاء الغرفة بشكل منظم (المباراة تستمر خلال المهلة لأن الخادم هو المرجع)
      room.hostTimer = setTimeout(() => this._closeRoom(room, 'host_left'), this.cfg.hostGraceMs);
    } else {
      const grace = room.phase === 'lobby' ? this.cfg.lobbyGraceMs : this.cfg.playGraceMs;
      p.dropTimer = setTimeout(() => this._removePlayer(room, p, 'timeout'), grace);
    }
    if (room.inst && room.phase === 'playing') room.inst.onDrop(p);
    this.pushRoom(room);
  }

  _removePlayer(room, p, why) {
    if (!room.players.has(p.id)) return;
    if (p.id === room.hostId) return this._closeRoom(room, 'host_left');
    clearTimeout(p.dropTimer); room.players.delete(p.id);
    if (p.ws) { const ws = p.ws; p.ws = null; ws.j.room = null; ws.j.pid = null; this._send(ws, { t: 'removed', why }); }
    if (room.inst && room.phase === 'playing') room.inst.onLeave(p);
    this.pushRoom(room);
  }

  _closeRoom(room, why) {
    if (room.phase === 'closed') return;
    room.phase = 'closed'; clearTimeout(room.hostTimer);
    if (room.inst) { try { room.inst.stop(); } catch (e) {} room.inst = null; }
    for (const p of room.players.values()) { clearTimeout(p.dropTimer); if (p.ws) { const ws = p.ws; ws.j.room = null; ws.j.pid = null; this._send(ws, { t: 'closed', why }); } }
    this.rooms.delete(room.code);
  }

  /** تستدعيها اللعبة عند انتهاء المباراة. */
  endMatch(room) { room.phase = 'ended'; room.endedAt = Date.now(); this.pushRoom(room); }

  _sweepRooms() {
    const now = Date.now();
    for (const r of [...this.rooms.values()]) {
      if (now - r.touched > this.cfg.idleMs || (r.phase === 'ended' && now - r.endedAt > this.cfg.endedMs)) this._closeRoom(r, 'idle');
    }
    for (const [ip, a] of this.joinFails) { const f = a.filter((t) => now - t < 60000); if (f.length) this.joinFails.set(ip, f); else this.joinFails.delete(ip); }
  }
}
