// جمعتنا — مين المتنكر؟: منطق المباراة على الخادم (المرجع الرسمي للحركة والفحص والنقاط).
// السرّية: المفتش لا يستلم أي شيء عن الأغراض أثناء مرحلة الاختباء، وبعدها يستلم قائمة واحدة
// يختلط فيها المتنكرون بالأثاث بنفس الصيغة ومعرّفات عشوائية — لا يوجد حقل يميّز اللاعب عن الغرض.
// تحديثات حركة المتنكر تُرسل للمفتش فقط إذا كان ضمن مدى رؤيته (ما كان يقدر يشوفه بعينه).
import crypto from 'node:crypto';
import { MAPS, MAP_IDS, KINDS, PROP, genLayout, stepMove, freeSpotNear, randomSpot, updateLevel } from './shared/prop-sim.js';
import { rng32 } from './shared/city-sim.js';

const PTS = { team: 100, per30: 20, reveal: 75, wrong: 15, last: 100 };
const VIEW = 18, MAX_ATT = 5;
const READY_MAPS = () => MAP_IDS.filter((id) => MAPS[id].ready);
const r2 = (v) => +v.toFixed(2);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rid = () => crypto.randomBytes(3).toString('base64url');

export class PropGame {
  constructor(srv, room, cfg) {
    this.srv = srv; this.room = room;
    this.cfg = Object.assign({ hideMs: 25000, introMs: 3600, loadMaxMs: 12000, resultMs: 9000, swapMs: 40000, decoyMs: 45000, radarMs: 30000, decoyLifeMs: 8000, stillMs: 5000, timeScale: 1 }, cfg);
    this.timers = new Set(); this.stopped = false; this.n = 0; this.turns = new Map(); this.rs = null;
    this.stats = new Map(); // pid → {reveals, wrong, surviveMs}
  }
  _after(ms, fn) { const t = setTimeout(() => { this.timers.delete(t); if (!this.stopped) fn(); }, ms); this.timers.add(t); return t; }
  stop() { this.stopped = true; for (const t of this.timers) clearTimeout(t); this.timers.clear(); clearInterval(this.tick); }
  players() { return [...this.room.players.values()].filter((p) => !p.isHost); }
  host() { return this.room.players.get(this.room.hostId); }
  g(p, d) { this.srv.sendTo(p, { t: 'g', d }); }
  gall(d, filter) { this.srv.broadcast(this.room, { t: 'g', d }, filter); }

  start() {
    this.total = this.room.settings.rounds; this.seekMs = this.room.settings.seekSec * 1000 * this.cfg.timeScale;
    this.mapQueue = []; this.lastMap = null;
    for (const p of this.players()) { this.turns.set(p.id, 0); this.stats.set(p.id, { reveals: 0, wrong: 0, surviveMs: 0 }); }
    this._round();
  }

  // ------------------------------------------------------------ بداية جولة
  /** دورة الخرائط: تُخلط مرة، ولا تتكرر خريطة قبل استهلاك كل الخرائط؛ وعند الدورة الجديدة لا تبدأ بآخر خريطة. */
  _nextMap() {
    const fixed = this.room.settings.map; if (fixed && fixed !== 'rotate' && MAPS[fixed]) return fixed;
    if (!this.mapQueue.length) { const all = READY_MAPS(); let q = shuffle(all.slice()); if (all.length > 1 && q[0] === this.lastMap) { const i = 1 + crypto.randomInt(q.length - 1); [q[0], q[i]] = [q[i], q[0]]; } this.mapQueue = q; }
    this.lastMap = this.mapQueue.shift(); return this.lastMap;
  }
  _round() {
    this.n++; const ps = this.players();
    const mapId = this._nextMap();
    const map = MAPS[mapId]; const seed = crypto.randomInt(1, 2 ** 31 - 1); const R = rng32(seed ^ 0x5bd1e995);
    const statics = genLayout(mapId, seed).map((o) => Object.assign({ pid: rid() }, o));
    // توزيع الأدوار: مفتش لكل ~3 متنكرين، والأقل لعبًا كمفتش يُقدَّم (التعادل يُحسم عشوائيًا بـ crypto)
    const nSeek = Math.max(1, Math.min(ps.length - 1, Math.round(ps.length / 4)));
    const sorted = shuffle(ps.slice()).sort((a, b) => (this.turns.get(a.id) || 0) - (this.turns.get(b.id) || 0));
    const seekers = sorted.slice(0, nSeek); seekers.forEach((p) => this.turns.set(p.id, (this.turns.get(p.id) || 0) + 1));
    const now = Date.now();
    // مرحلة «تحميل»: لا تبدأ الجولة قبل جاهزية كل الأجهزة (أو انتهاء مهلة قصوى) وقبل انتهاء المقدمة السينمائية.
    const rs = this.rs = { n: this.n, mapId, map, statics, st: new Map(), decoys: [], phase: 'load', loadMin: now + this.cfg.introMs * this.cfg.timeScale, loadMax: now + this.cfg.loadMaxMs, ready: new Set(), hideEnd: 0, seekStart: 0, endAt: 0, over: false, buf: [], best: null, lastMinSent: false, lastHiderSent: false, R };
    const kinds = [...new Set(statics.map((o) => o.kind))].filter((k) => map.hideKinds ? map.hideKinds.includes(k) : true);
    const circles = statics.map((o) => ({ id: o.pid, x: o.x, z: o.z, r: o.r, lv: o.lv }));
    const gate = map.gate;
    for (const p of ps) {
      const seeker = seekers.includes(p);
      if (seeker) {
        const sp = freeSpotNear(map, circles, gate.x, gate.z, 0.45, R, gate.lv || 0); circles.push({ id: p.id, x: sp.x, z: sp.z, r: 0.45, lv: sp.lv });
        rs.st.set(p.id, { role: 'seek', x: sp.x, z: sp.z, lv: sp.lv, rot: Math.PI, mx: 0, mz: 0, att: MAX_ATT, radarAt: 0, inspAt: 0, sent: new Map(), pts: 0 });
      } else {
        const kind = kinds[Math.floor(R() * kinds.length)]; const r = KINDS[kind].r;
        const sp = randomSpot(map, circles, r, R); const pid = rid(); circles.push({ id: pid, x: sp.x, z: sp.z, r, lv: sp.lv });
        rs.st.set(p.id, { role: 'hide', pid, kind, r, x: sp.x, z: sp.z, lv: sp.lv, rot: R() * 6.28, mx: 0, mz: 0, lock: false, stillAt: now, swapAt: 0, decoyAt: 0, found: false, foundAt: 0, extra: false, pts: 0 });
      }
    }
    for (const p of ps) this._sendSetup(p);
    this._sendSetup(this.host());
    clearInterval(this.tick); this.tickN = 0; this.lastTick = now;
    this.tick = setInterval(() => this._tick(), PROP.TICK);
    const check = () => { if (this.rs !== rs || rs.over || rs.phase !== 'load') return; const t = Date.now();
      const connected = ps.filter((p) => p.ws && this.room.players.has(p.id)); const all = connected.every((p) => rs.ready.has(p.id));
      if ((t >= rs.loadMin && all) || t >= rs.loadMax) return this._startHide(); this._after(150, check); };
    this._after(150, check);
  }
  _startHide() {
    const rs = this.rs; if (!rs || rs.over || rs.phase !== 'load') return; const now = Date.now();
    rs.phase = 'hide'; rs.hideEnd = now + this.cfg.hideMs * this.cfg.timeScale; for (const s of rs.st.values()) if (s.role === 'hide') s.stillAt = now;
    this.gall({ k: 'phase', phase: 'hide', hideEnd: rs.hideEnd, now });
    this._after(rs.hideEnd - now, () => { if (this.rs === rs) this._startSeek(); });
  }

  _roles() { const out = []; for (const [id, s] of this.rs.st) { const p = this.room.players.get(id); out.push({ id, name: p ? p.name : '', avatar: p ? p.avatar : '0', role: s.role, found: !!s.found }); } return out; }
  _hiderProps(exceptId) { const out = []; for (const [id, s] of this.rs.st) if (s.role === 'hide' && !s.found && id !== exceptId) out.push({ pid: s.pid, kind: s.kind, x: +s.x.toFixed(2), z: +s.z.toFixed(2), rot: +s.rot.toFixed(2), lv: s.lv, mate: true }); return out; }
  _mixedProps() { // القائمة التي يراها المفتش/المضيف: أثاث + متنكرون + طعوم بنفس الصيغة
    const rs = this.rs; const out = rs.statics.map((s) => ({ pid: s.pid, kind: s.kind, x: s.x, z: s.z, rot: s.rot, lv: s.lv }));
    for (const s of rs.st.values()) if (s.role === 'hide' && !s.found) out.push({ pid: s.pid, kind: s.kind, x: +s.x.toFixed(2), z: +s.z.toFixed(2), rot: +s.rot.toFixed(2), lv: s.lv });
    for (const d of rs.decoys) out.push({ pid: d.pid, kind: d.kind, x: +d.x.toFixed(2), z: +d.z.toFixed(2), rot: 0, lv: d.lv });
    return shuffle(out);
  }
  _sendSetup(p) {
    if (!p) return; const rs = this.rs; const s = rs.st.get(p.id); const now = Date.now();
    const base = { k: 'setup', round: rs.n, of: this.total, map: rs.mapId, phase: rs.phase, hideEnd: rs.hideEnd, endAt: rs.endAt, loadMin: rs.loadMin, now, roles: this._roles().map((r) => ({ id: r.id, name: r.name, avatar: r.avatar, role: r.role, found: r.found })) };
    if (s && s.role === 'hide' && !s.found) {
      this.g(p, Object.assign(base, { you: { role: 'hide', pid: s.pid, kind: s.kind, x: s.x, z: s.z, lv: s.lv, rot: s.rot, swapAt: s.swapAt, decoyAt: s.decoyAt, lock: s.lock }, props: rs.statics.map((o) => ({ pid: o.pid, kind: o.kind, x: o.x, z: o.z, rot: o.rot, lv: o.lv })), mates: this._hiderProps(p.id) }));
    } else if (s && s.role === 'seek') {
      // أثناء الاختباء: لا أغراض إطلاقًا للمفتش
      this.g(p, Object.assign(base, { you: { role: 'seek', x: s.x, z: s.z, lv: s.lv, rot: s.rot, att: s.att, radarAt: s.radarAt }, props: rs.phase === 'seek' ? this._mixedProps() : null }));
      s.sent.clear();
    } else {
      // المضيف والمتنكر المكشوف (مشاهد): نفس ما يراه المفتشون مجتمعين، بدون أي تمييز للمتنكرين
      this.g(p, Object.assign(base, { you: { role: 'watch' }, props: rs.phase === 'seek' ? this._mixedProps() : null }));
      if (!this.watchSent) this.watchSent = new Map(); this.watchSent.set(p.id, new Map());
    }
  }

  _startSeek() {
    const rs = this.rs; if (!rs || rs.over || rs.phase === 'seek') return; const now = Date.now();
    rs.phase = 'seek'; rs.seekStart = now; rs.endAt = now + this.seekMs;
    for (const s of rs.st.values()) if (s.role === 'hide') s.stillAt = Math.min(s.stillAt, now);
    for (const p of this.players()) this._sendSetup(p);
    this._sendSetup(this.host());
    this.gall({ k: 'phase', phase: 'seek', endAt: rs.endAt, now });
    this._after(this.seekMs, () => this._finish('time'));
    if (this.seekMs > 60000 * this.cfg.timeScale) this._after(this.seekMs - 60000 * this.cfg.timeScale, () => this._lastMinute());
  }

  _lastMinute() {
    const rs = this.rs; if (!rs || rs.over) return; rs.lastMin = true;
    this.gall({ k: 'lastmin' });
    const hint = () => {
      if (rs.over || this.rs !== rs) return;
      // تلميح عام: الربع الأكثر نشاطًا فقط (ليس موقعًا)
      const q = [0, 0, 0, 0]; for (const s of rs.st.values()) if (s.role === 'hide' && !s.found) q[(s.x > 0 ? 1 : 0) + (s.z > 0 ? 2 : 0)]++;
      const best = q.indexOf(Math.max(...q));
      this.gall({ k: 'hot', q: best }, (p) => { const s = rs.st.get(p.id); return !s || s.role === 'seek' || s.found; });
      this._after(15000 * this.cfg.timeScale, hint);
    };
    hint();
  }

  // ------------------------------------------------------------ المحاكاة
  _circles(skip) {
    const rs = this.rs; const c = rs.statics.map((s) => ({ id: s.pid, x: s.x, z: s.z, r: s.r, lv: s.lv }));
    for (const s of rs.st.values()) if (s.role === 'hide' && !s.found) c.push({ id: s.pid, x: s.x, z: s.z, r: s.r, lv: s.lv });
    return c;
  }
  _tick() {
    const rs = this.rs; if (!rs || rs.over) return; const now = Date.now(); const dt = Math.min(0.2, (now - this.lastTick) / 1000); this.lastTick = now; this.tickN++;
    const circles = this._circles();
    for (const [id, s] of rs.st) {
      if (s.found) continue;
      if (rs.phase === 'load' || (s.role === 'seek' && rs.phase !== 'seek')) continue; // التحميل/البوابة مقفلة
      const sp = s.role === 'seek' ? PROP.SPEED_SEEKER : PROP.SPEED_HIDER;
      let mx = s.mx, mz = s.mz; if (s.lock) mx = mz = 0;
      const len = Math.hypot(mx, mz);
      if (len > 0.05) {
        const k = Math.min(1, len) / len; // الخادم يفرض حد السرعة مهما أرسل العميل
        const r = s.role === 'seek' ? 0.45 : s.r;
        const np = stepMove(rs.map, s.x, s.z, mx * k * sp * dt, mz * k * sp * dt, r, circles, s.role === 'hide' ? s.pid : id, s.lv);
        if (np.x !== s.x || np.z !== s.z) { s.x = np.x; s.z = np.z; updateLevel(rs.map, s); s.rot = Math.atan2(mx, mz); if (s.role === 'hide') { s.stillAt = now; const c = circles.find((q) => q.id === s.pid); if (c) { c.x = s.x; c.z = s.z; c.lv = s.lv; } } }
      }
    }
    for (const d of rs.decoys) { const np = stepMove(rs.map, d.x, d.z, d.vx * dt, d.vz * dt, 0.3, circles, null, d.lv); d.x = np.x; d.z = np.z; }
    const expired = rs.decoys.filter((d) => now >= d.until);
    if (expired.length) { rs.decoys = rs.decoys.filter((d) => now < d.until); for (const d of expired) this.gall({ k: 'gone', pid: d.pid }, (p) => { const s = rs.st.get(p.id); return !s || s.role === 'seek' || s.found; }); }
    if (this.tickN % 3 === 0) this._record(now);
    if (this.tickN % 2 === 0) this._snapshots(now); // ~7.5 لقطة/ثانية
  }

  _snapshots(now) {
    const rs = this.rs; const seekers = []; const hiders = [];
    for (const [id, s] of rs.st) { if (s.role === 'seek') seekers.push([id, +s.x.toFixed(2), +s.z.toFixed(2), +s.rot.toFixed(2), s.lv]); else if (!s.found) hiders.push(s); }
    const movers = hiders.map((s) => ({ pid: s.pid, kind: s.kind, x: s.x, z: s.z, rot: s.rot, lv: s.lv })).concat(rs.decoys.map((d) => ({ pid: d.pid, kind: d.kind, x: d.x, z: d.z, rot: 0, lv: d.lv })));
    const delta = (sent, eyes) => {
      const out = [];
      for (const m of movers) {
        if (eyes && !eyes.some((e) => e[3] === m.lv && Math.hypot(e[1] - m.x, e[2] - m.z) <= VIEW)) continue;
        const sig = m.kind + '|' + m.x.toFixed(2) + '|' + m.z.toFixed(2) + '|' + m.rot.toFixed(1);
        if (sent.get(m.pid) !== sig) { sent.set(m.pid, sig); out.push([m.pid, m.kind, r2(m.x), r2(m.z), r2(m.rot), m.lv]); }
      }
      return out;
    };
    for (const p of this.players()) {
      const s = rs.st.get(p.id); if (!s || !p.ws) continue;
      if (s.role === 'hide' && !s.found) {
        this.g(p, { k: 'snap', me: [r2(s.x), r2(s.z), s.lv], seek: rs.phase === 'seek' ? seekers : [], mv: movers.filter((m) => m.pid !== s.pid).map((m) => [m.pid, m.kind, r2(m.x), r2(m.z), r2(m.rot), m.lv]), still: now - s.stillAt >= this.cfg.stillMs });
      } else if (s.role === 'seek') {
        if (rs.phase !== 'seek') continue;
        this.g(p, { k: 'snap', me: [r2(s.x), r2(s.z), s.lv], seek: seekers, mv: delta(s.sent, [[0, s.x, s.z, s.lv]]) });
      } else if (rs.phase === 'seek') this._watchSnap(p, seekers, delta);
    }
    if (rs.phase === 'seek') this._watchSnap(this.host(), seekers, delta);
    else { const h = this.host(); if (h) this.g(h, { k: 'snap', seek: [], mv: [] }); }
  }
  _watchSnap(p, seekers, delta) {
    if (!p || !p.ws) return; if (!this.watchSent) this.watchSent = new Map();
    let sent = this.watchSent.get(p.id); if (!sent) { sent = new Map(); this.watchSent.set(p.id, sent); }
    this.g(p, { k: 'snap', seek: seekers, mv: delta(sent, seekers.map((q) => [q[0], q[1], q[2], q[4]])) });
  }

  // ---- أفضل لقطة: أقرب اقتراب لمفتش من متنكر نجا منه ----
  _record(now) {
    const rs = this.rs; if (rs.phase !== 'seek') return; const f = { t: now, p: {} };
    for (const [id, s] of rs.st) if (!s.found) f.p[id] = [+s.x.toFixed(2), +s.z.toFixed(2), +s.rot.toFixed(2), s.role === 'hide' ? s.kind : 0];
    rs.buf.push(f); if (rs.buf.length > 60) rs.buf.shift();
    for (const [sid, a] of rs.st) if (a.role === 'seek') for (const [hid, h] of rs.st) if (h.role === 'hide' && !h.found) {
      const d = Math.hypot(a.x - h.x, a.z - h.z);
      if (d < 2.6 && (!rs.cand || d < rs.cand.d)) rs.cand = { d, sid, hid, at: now };
    }
    if (rs.cand && now - rs.cand.at > 3000) {
      const c = rs.cand; rs.cand = null; const h = rs.st.get(c.hid);
      if (h && !h.found && (!rs.best || c.d < rs.best.d)) {
        const frames = rs.buf.filter((x) => x.t >= c.at - 3500 && x.p[c.sid] && x.p[c.hid]).map((x) => [x.t - c.at, ...x.p[c.sid].slice(0, 3), ...x.p[c.hid]]);
        if (frames.length >= 8) rs.best = { d: c.d, sid: c.sid, hid: c.hid, frames };
      }
    }
  }

  // ------------------------------------------------------------ أوامر اللاعبين
  onMessage(p, d) {
    const rs = this.rs; if (!rs || rs.over || p.isHost) return; const s = rs.st.get(p.id); if (!s || s.found) return; const now = Date.now();
    if (d.k === 'ready') { if (rs.phase === 'load') rs.ready.add(p.id); return; }
    if (d.k === 'in') { const mx = Number(d.x), mz = Number(d.z); if (Number.isFinite(mx) && Number.isFinite(mz)) { s.mx = Math.max(-1, Math.min(1, mx)); s.mz = Math.max(-1, Math.min(1, mz)); } return; }
    if (s.role === 'hide') {
      if (d.k === 'lock') { s.lock = !!d.v; if (s.lock) { s.mx = s.mz = 0; } return this.g(p, { k: 'you', lock: s.lock }); }
      if (d.k === 'swap') {
        const t = rs.statics.find((o) => o.pid === String(d.pid)); // فقط أغراض موجودة فعلاً بالخريطة
        if (!t) return;
        if (t.lv !== s.lv || Math.hypot(t.x - s.x, t.z - s.z) > PROP.SWAP_RANGE + t.r + s.r) return this.g(p, { k: 'deny', why: 'far' });
        if (now < s.swapAt && !s.extra) return this.g(p, { k: 'deny', why: 'cooldown' });
        if (now < s.swapAt && s.extra) s.extra = false; else s.swapAt = now + this.cfg.swapMs * this.cfg.timeScale;
        s.kind = t.kind; s.r = KINDS[t.kind].r; s.stillAt = now;
        return this.g(p, { k: 'you', kind: s.kind, swapAt: s.swapAt, extra: s.extra });
      }
      if (d.k === 'decoy') {
        if (now < s.decoyAt || rs.phase !== 'seek') return this.g(p, { k: 'deny', why: 'cooldown' });
        s.decoyAt = now + this.cfg.decoyMs * this.cfg.timeScale;
        const small = ['supplybox', 'goodsbox', 'trashm', 'trashs', 'bin2', 'toyblock', 'basket', 'cushion', 'ball', 'stool', 'bag', 'suitcase', 'backpack', 'toybox', 'prizebox', 'ballbox'].filter((k) => rs.statics.some((o) => o.kind === k)); const kind = small[crypto.randomInt(small.length)] || rs.statics[0].kind;
        const a = s.rot; rs.decoys.push({ pid: rid(), kind, lv: s.lv, x: s.x + Math.sin(a) * (s.r + 0.5), z: s.z + Math.cos(a) * (s.r + 0.5), vx: Math.sin(a) * 2.4, vz: Math.cos(a) * 2.4, until: now + this.cfg.decoyLifeMs });
        return this.g(p, { k: 'you', decoyAt: s.decoyAt });
      }
      return;
    }
    if (s.role === 'seek' && rs.phase === 'seek') {
      if (d.k === 'radar') {
        if (now < s.radarAt) return this.g(p, { k: 'deny', why: 'cooldown' });
        s.radarAt = now + this.cfg.radarMs * this.cfg.timeScale; const blips = [];
        for (const h of rs.st.values()) if (h.role === 'hide' && !h.found && h.lv === s.lv && Math.hypot(h.x - s.x, h.z - s.z) <= 12) {
          const still = now - h.stillAt >= this.cfg.stillMs;
          if (still && crypto.randomInt(100) >= 35) continue; // الثبات يقلل احتمال الظهور
          blips.push([Math.round((h.x + (crypto.randomInt(600) - 300) / 100) / 2) * 2, Math.round((h.z + (crypto.randomInt(600) - 300) / 100) / 2) * 2]);
        }
        for (const dc of rs.decoys) if (dc.lv === s.lv && Math.hypot(dc.x - s.x, dc.z - s.z) <= 12) blips.push([Math.round(dc.x / 2) * 2, Math.round(dc.z / 2) * 2]);
        return this.g(p, { k: 'radar', blips, radarAt: s.radarAt, r: 12 });
      }
      if (d.k === 'inspect') {
        if (s.att <= 0 || now - s.inspAt < 600) return; s.inspAt = now;
        const pid = String(d.pid); let target = null, kind = 'static';
        for (const [hid, h] of rs.st) if (h.role === 'hide' && !h.found && h.pid === pid) { target = h; kind = 'hider'; target._id = hid; }
        if (!target) { const dc = rs.decoys.find((x) => x.pid === pid); if (dc) { target = dc; kind = 'decoy'; } }
        if (!target) { target = rs.statics.find((o) => o.pid === pid); }
        if (!target) return this.g(p, { k: 'insp', ok: false, gone: true, att: s.att }); // انكشف قبلك بلحظة: بلا عقوبة
        if ((target.lv || 0) !== s.lv || Math.hypot(target.x - s.x, target.z - s.z) > PROP.INSPECT_RANGE + (target.r || 0.4)) return this.g(p, { k: 'deny', why: 'far' });
        if (kind === 'hider') {
          target.found = true; target.foundAt = now; s.att = Math.min(MAX_ATT, s.att + 1); p.score += PTS.reveal; s.pts += PTS.reveal;
          const st = this.stats.get(p.id); if (st) st.reveals++;
          const hp = this.room.players.get(target._id);
          this.g(p, { k: 'insp', ok: true, att: s.att, pts: PTS.reveal, score: p.score });
          this.gall({ k: 'found', pid, kind: target.kind, x: target.x, z: target.z, lv: target.lv, hider: { id: target._id, name: hp ? hp.name : '' }, by: { id: p.id, name: p.name }, left: this._left() });
          if (hp) this._sendSetup(hp); // يتحول لمشاهد
          return this._check();
        }
        s.att--; const loss = Math.min(PTS.wrong, p.score); p.score -= loss; s.pts -= loss; const st = this.stats.get(p.id); if (st) st.wrong++;
        if (kind === 'decoy') { rs.decoys = rs.decoys.filter((x) => x !== target); this.gall({ k: 'gone', pid, pop: true }); }
        this.g(p, { k: 'insp', ok: false, att: s.att, pts: -loss, score: p.score, decoy: kind === 'decoy' });
        this.gall({ k: 'fx', type: 'miss', pid, by: p.id });
        return this._check();
      }
    }
  }
  _left() { let n = 0; for (const s of this.rs.st.values()) if (s.role === 'hide' && !s.found) n++; return n; }

  _check() {
    const rs = this.rs; if (rs.over) return; const left = this._left();
    const seekers = [...rs.st.values()].filter((s) => s.role === 'seek');
    if (left === 0) return this._finish('all_found');
    if (rs.phase === 'seek' && seekers.length && seekers.every((s) => s.att <= 0)) return this._finish('no_attempts');
    if (left === 1 && !rs.lastHiderSent && [...rs.st.values()].filter((s) => s.role === 'hide').length > 1) {
      rs.lastHiderSent = true; for (const [id, s] of rs.st) if (s.role === 'hide' && !s.found) { s.extra = true; this.g(this.room.players.get(id), { k: 'you', extra: true }); }
      this.gall({ k: 'lasthider' });
    }
  }

  _finish(why) {
    const rs = this.rs; if (!rs || rs.over) return; rs.over = true; clearInterval(this.tick); const now = Date.now();
    const hidersWin = why !== 'all_found'; const end = why === 'time' ? rs.endAt : (rs.seekStart ? Math.min(now, rs.endAt || now) : now); // عند انتهاء الوقت نعتمد الوقت الرسمي لا لحظة تنفيذ المؤقت
    const left = this._left();
    const results = [];
    for (const [id, s] of rs.st) {
      const p = this.room.players.get(id); if (!p) continue; let add = 0; const lines = [];
      if (s.role === 'hide') {
        const ms = rs.seekStart ? Math.max(0, (s.found ? s.foundAt : end) - rs.seekStart) : 0; const sv = Math.floor(ms / (30000 * this.cfg.timeScale)) * PTS.per30;
        if (sv) { add += sv; lines.push(['صمود', sv]); } const st = this.stats.get(id); if (st) st.surviveMs += ms;
        if (hidersWin && why !== 'aborted') { add += PTS.team; lines.push(['فوز الفريق', PTS.team]); }
        if (why === 'time' && !s.found && left === 1) { add += PTS.last; lines.push(['المتنكر الأخير', PTS.last]); }
      } else if (!hidersWin) { add += PTS.team; lines.push(['فوز الفريق', PTS.team]); }
      p.score += add; s.pts += add;
      results.push({ id, name: p.name, avatar: p.avatar, role: s.role, found: !!s.found, kind: s.kind || null, pts: s.pts, score: p.score, lines });
    }
    const best = rs.best ? { frames: rs.best.frames, seeker: (this.room.players.get(rs.best.sid) || {}).name, hider: (this.room.players.get(rs.best.hid) || {}).name } : null;
    this.gall({ k: 'over', round: rs.n, of: this.total, why, winner: why === 'aborted' ? null : (hidersWin ? 'hide' : 'seek'), results, reveal: [...rs.st.entries()].filter(([, s]) => s.role === 'hide').map(([id, s]) => ({ id, pid: s.pid, kind: s.kind, x: s.x, z: s.z, lv: s.lv, found: !!s.found })), best });
    this.srv.pushRoom(this.room); this.watchSent = null;
    this._after(this.cfg.resultMs + (best ? 6000 : 0), () => { if (this.n < this.total && this.players().length >= 2) this._round(); else this._final(); });
  }

  _final() {
    // معيار معلن للتعادل (بدون عشوائية): الأكثر كشفًا، ثم الأطول صمودًا، ثم الأقل فحصًا خاطئًا؛ وإن تساووا تمامًا فالفوز مشترك.
    const key = (p) => { const s = this.stats.get(p.id) || { reveals: 0, surviveMs: 0, wrong: 0 }; return [p.score, s.reveals, Math.round(s.surviveMs / 1000), -s.wrong]; };
    const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };
    const sorted = this.players().sort(cmp);
    const ranking = sorted.map((p, i) => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score, tiedTop: i > 0 && cmp(sorted[0], p) === 0, stats: this.stats.get(p.id) }));
    this.gall({ k: 'final', ranking, tieRule: 'عند التعادل: الأكثر كشفًا، ثم الأطول صمودًا، ثم الأقل أخطاء.' });
    this.rs = null; this.srv.endMatch(this.room);
  }

  onDrop(p) { const s = this.rs && this.rs.st.get(p.id); if (s) { s.mx = s.mz = 0; } }
  onLeave(p) {
    const rs = this.rs; if (!rs || rs.over) return; const s = rs.st.get(p.id); if (!s) return;
    if (s.role === 'hide' && !s.found) { s.found = true; s.foundAt = Date.now(); this.gall({ k: 'gone', pid: s.pid, left: this._left() }); }
    rs.st.delete(p.id);
    const seekers = [...rs.st.values()].filter((x) => x.role === 'seek').length; const hiders = [...rs.st.values()].filter((x) => x.role === 'hide').length;
    if (!seekers || !hiders) return this._finish('aborted');
    this._check();
  }
  onRejoin(p) { if (this.rs && !this.rs.over) this._sendSetup(p); }
}
