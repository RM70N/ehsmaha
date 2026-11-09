// جمعتنا — المدينة المصغّرة: منطق المباراة على الخادم (المرجع الرسمي).
// الأهداف السرية تبقى هنا فقط: العميل يستلم نص المهمة، ولا يستلم معرّف الإجابة إلا بعد نهاية الجولة.
// «الممثلون» (الهارب/سيارات المخالفة/المتسوقون) تُبث مواضعهم لحظيًا من هنا بدون مساراتهم المستقبلية.
import crypto from 'node:crypto';
import { genCity, uniqueFindables, describe, lightState, roadAt, blockAt, CITY, CITY_SIZE } from './shared/city-sim.js';

const TYPES = ['find', 'rush', 'follow', 'violation', 'diff', 'watch'];
const SHARED = new Set(['rush', 'follow', 'violation', 'diff', 'watch']);
const TITLES = { find: 'مهمة سرية لكل لاعب', rush: 'المهمة الذهبية', follow: 'الهدف الهارب', violation: 'كشف مخالفة', diff: 'وش اللي تغيّر؟', watch: 'مهمة مراقبة', tie: 'تحدي فاصل' };
const PTS = { ok: 100, first: 50, fast: 25, wrong: 25, maxWrong: 3 };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a) => a[crypto.randomInt(a.length)];

export class CityGame {
  constructor(srv, room, cfg) {
    this.srv = srv; this.room = room;
    this.cfg = Object.assign({ introMs: 6500, revealMs: 7500, memorizeMs: 7000, actorMs: 200, timeScale: 1 }, cfg);
    this.timers = new Set(); this.out = new Set(); this.used = new Map(); this.round = null; this.n = 0; this.stopped = false;
    this.stats = new Map(); // pid → {ok, wrong, ms}
  }
  _after(ms, fn) { const t = setTimeout(() => { this.timers.delete(t); if (!this.stopped) fn(); }, ms); this.timers.add(t); return t; }
  stop() { this.stopped = true; for (const t of this.timers) clearTimeout(t); this.timers.clear(); if (this.actorTimer) clearInterval(this.actorTimer); }
  players() { return [...this.room.players.values()].filter((p) => !p.isHost); }
  active() { return this.players().filter((p) => !this.out.has(p.id)); }
  g(p, d) { this.srv.sendTo(p, { t: 'g', d }); }
  gall(d, filter) { this.srv.broadcast(this.room, { t: 'g', d }, filter); }
  simT(now = Date.now()) { return (now - this.t0) / 1000; }

  start() {
    this.seed = crypto.randomInt(1, 2 ** 31 - 1); this.world = genCity(this.seed); this.t0 = Date.now();
    this.findables = uniqueFindables(this.world);
    this.total = this.room.settings.rounds; this.missionMs = this.room.settings.missionSec * 1000 * this.cfg.timeScale;
    const rest = shuffle(TYPES.filter((t) => t !== 'find'));
    this.order = ['find', ...rest]; while (this.order.length < this.total) this.order.push(...shuffle(TYPES.slice()));
    for (const p of this.players()) this.stats.set(p.id, { ok: 0, wrong: 0, ms: 0 });
    this.gall(this._init());
    this._after(this.cfg.introMs, () => this._nextRound());
  }
  _init() { return { k: 'init', seed: this.seed, t0: this.t0, total: this.total, now: Date.now() }; }

  // ---------------------------------------------------------------- الجولات
  _nextRound(tieIds) {
    const act = tieIds ? this.active().filter((p) => tieIds.includes(p.id)) : this.active();
    if (!tieIds) this.n++;
    const type = tieIds ? 'tie' : this.order[this.n - 1];
    const now = Date.now(); const dur = tieIds ? Math.min(this.missionMs, 25000 * this.cfg.timeScale) : this.missionMs;
    const r = this.round = { n: this.n, type, startAt: now, endAt: now + dur, openAt: now, shared: null, per: new Map(), firsts: [], actors: [], tie: !!tieIds, pickKind: 'ent', done: false };
    let text = '';
    if (type === 'find') {
      const pool = shuffle(this.findables.slice());
      for (const p of act) {
        const mine = this.used.get(p.id) || new Set(); this.used.set(p.id, mine);
        const taken = new Set([...r.per.values()].map((x) => x.target));
        const t = pool.find((f) => !mine.has(f.id) && !taken.has(f.id)) || pool.find((f) => !taken.has(f.id)) || pool[0];
        mine.add(t.id); r.per.set(p.id, this._slot(t.id, describe(t.key)));
      }
    } else {
      if (type === 'rush' || type === 'tie') { const t = pick(this.findables); r.shared = t.id; text = describe(t.key); }
      else if (type === 'follow') text = this._setupFollow(r);
      else if (type === 'violation') text = this._setupViolation(r);
      else if (type === 'diff') text = this._setupDiff(r);
      else if (type === 'watch') text = this._setupWatch(r);
      for (const p of act) r.per.set(p.id, this._slot(r.shared, text));
    }
    r.half = r.openAt + (r.endAt - r.openAt) / 2;
    // حدث محيطي لا يجعل أي مهمة مستحيلة (بصري/تجميد سيارات فقط، والأهداف تُحدَّد بالمعرّف لا بالموضع)
    r.event = (!tieIds && crypto.randomInt(100) < 65) ? this._ambient(r) : null;
    const base = { round: r.n, of: this.total, type, title: TITLES[type], endAt: r.endAt, pickKind: r.pickKind, shared: SHARED.has(type) || r.tie, event: r.event, now };
    for (const p of this.players()) {
      const slot = r.per.get(p.id);
      this.g(p, Object.assign({ k: 'mission', text: slot ? slot.text : null, watching: !slot }, base));
    }
    this.g(this.room.players.get(this.room.hostId), Object.assign({ k: 'round' }, base));
    if (r.actors.length) {
      this.gall({ k: 'spawn', ents: r.actors.map((a) => a.def) });
      this.actorTimer = setInterval(() => this._tickActors(), this.cfg.actorMs);
    }
    r.endTimer = this._after(dur, () => this._endRound());
  }
  _slot(target, text) { return { target, text, ok: false, wrong: 0, pts: 0, locked: false, at: 0 }; }

  _ambient(r) {
    const kinds = ['blackout', 'rain', 'train', 'jam'];
    const type = pick(kinds); const at = Math.round(2000 + crypto.randomInt(6000));
    const ev = { type, at: r.startAt + at, dur: 9000 };
    if (type === 'blackout') { ev.qx = crypto.randomInt(2); ev.qz = crypto.randomInt(2); }
    if (type === 'rain') ev.dur = 16000;
    if (type === 'jam') {
      const i = 1 + crypto.randomInt(CITY.N - 1), j = 1 + crypto.randomInt(CITY.N - 1);
      ev.i = i; ev.j = j; ev.dur = CITY.CYCLE * 1000; // مدة = دورة إشارة كاملة حتى تبقى السيارات متوافقة مع الإشارات بعدها
      ev.ids = this.world.ents.filter((e) => e.t === 'car' && e.loop && i >= e.loop[0] && i <= e.loop[2] && j >= e.loop[1] && j <= e.loop[3]).map((e) => e.id);
      ev.t0 = this.simT(ev.at);
    }
    return ev;
  }

  // ---- الممثلون: مسارات على الخادم فقط ----
  _mkActor(def, kf) { const a = { def: Object.assign({ id: 'a' + crypto.randomBytes(3).toString('hex') }, def), kf }; return a; }
  _sample(a, ms) {
    const kf = a.kf; if (ms <= kf[0][0]) return kf[0];
    for (let i = 1; i < kf.length; i++) if (ms < kf[i][0]) { const p = kf[i - 1], q = kf[i], f = (ms - p[0]) / (q[0] - p[0] || 1); return [ms, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f, p[3], p[4]]; }
    return kf[kf.length - 1];
  }
  _tickActors() {
    const r = this.round; if (!r || r.done) return; const ms = Date.now() - r.startAt;
    this.gall({ k: 'act', a: r.actors.map((a) => { const s = this._sample(a, ms); return [a.def.id, +s[1].toFixed(2), +s[2].toFixed(2), +s[3].toFixed(2), s[4]]; }) });
  }
  _corner(c) { const h = CITY.BLOCK / 2 + 0.9; return [blockAt(c[0]) + c[2] * h, blockAt(c[1]) + c[3] * h]; }
  _walk(startMs, minMs, speed, fixed, maxMs) {
    // مشي على زوايا الأرصفة ينتهي بدخول مبنى حقيقي. fixed: مبنى محدد (يدور حول بلوكه ثم يدخله)، وإلا مشي حر بين البلوكات.
    // maxMs: حد أعلى مضمون لوقت الدخول — لو طال المسار يُسرَّع الممثل بدل أن تصبح المهمة مستحيلة.
    let c = fixed ? [fixed.bi, fixed.bj, pick([-1, 1]), pick([-1, 1])] : [crypto.randomInt(CITY.N), crypto.randomInt(CITY.N), pick([-1, 1]), pick([-1, 1])];
    let t = startMs; let last = -1;
    let p = this._corner(c); const kf = [[0, p[0], p[1], 0, 0], [t, p[0], p[1], 0, 1]];
    const bIn = (c) => this.world.buildings.filter((b) => b.bi === c[0] && b.bj === c[1] && b.h > 0);
    const go = (m) => {
      if (m === 0) c = [c[0], c[1], -c[2], c[3]]; else if (m === 1) c = [c[0], c[1], c[2], -c[3]];
      else if (m === 2) c = [c[0] + c[2], c[1], -c[2], c[3]]; else c = [c[0], c[1] + c[3], c[2], -c[3]];
      const q = this._corner(c); const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      kf[kf.length - 1][3] = Math.atan2(q[0] - p[0], q[1] - p[1]); t += d / speed * 1000; kf.push([t, q[0], q[1], kf[kf.length - 1][3], 1]); p = q;
    };
    for (let guard = 0; guard < 40 && t - startMs < minMs; guard++) {
      const moves = [0, 1];
      if (!fixed) { if (c[0] + c[2] >= 0 && c[0] + c[2] < CITY.N) moves.push(2); if (c[1] + c[3] >= 0 && c[1] + c[3] < CITY.N) moves.push(3); }
      const m = pick(moves.filter((x) => x !== last)); last = m; go(m);
    }
    if (!fixed && !bIn(c).length) { // البلوك الحالي بلا مبانٍ (حديقة/مواقف): اتجه مباشرة لأقرب بلوك فيه مبنى
      let best = null; for (const b of this.world.buildings) if (b.h > 0) { const d = Math.abs(b.bi - c[0]) + Math.abs(b.bj - c[1]); if (!best || d < best.d) best = { d, bi: b.bi, bj: b.bj }; }
      for (let guard = 0; guard < 20 && (c[0] !== best.bi || c[1] !== best.bj); guard++) {
        if (c[0] !== best.bi) { if (Math.sign(best.bi - c[0]) !== c[2]) go(0); go(2); } else { if (Math.sign(best.bj - c[1]) !== c[3]) go(1); go(3); }
      }
    }
    const bs = bIn(c); const b = fixed || bs.reduce((best, x) => (Math.hypot(x.x - p[0], x.z - p[1]) < Math.hypot(best.x - p[0], best.z - p[1]) ? x : best));
    const d = Math.hypot(b.x - p[0], b.z - p[1]); kf[kf.length - 1][3] = Math.atan2(b.x - p[0], b.z - p[1]); t += d / speed * 1000; kf.push([t, b.x, b.z, 0, 1]);
    if (maxMs && t > maxMs) { const f = (maxMs - startMs) / (t - startMs); for (const k of kf) if (k[0] > startMs) k[0] = startMs + (k[0] - startMs) * f; t = maxMs; }
    kf.push([t + 1, b.x, b.z, 0, 0]);
    return { kf, end: t, building: b };
  }
  _setupFollow(r) {
    const span = r.endAt - r.startAt; const w = this._walk(Math.min(1500, span * 0.05), span * 0.35, 3.4, null, span * 0.72);
    r.actors.push(this._mkActor({ t: 'person', color: 'red', hat: true, marker: true }, w.kf));
    r.shared = w.building.id; r.pickKind = 'building'; r.openAt = r.startAt;
    return 'شفت الشخص اللي فوقه سهم؟ لا يغيب عن عينك... وإذا دخل مبنى حدد المبنى اللي دخله!';
  }
  _setupWatch(r) {
    const span = r.endAt - r.startAt;
    // 3 مبانٍ مختلفة بعدد داخلين 3/2/1 — الإجابة (الأكثر) فريدة بالبناء
    const real = shuffle(this.world.buildings.filter((b) => b.h > 0)); const chosen = [];
    for (const b of real) { if (!chosen.some((c) => c.bi === b.bi && c.bj === b.bj)) chosen.push(b); if (chosen.length === 3) break; }
    const colors = shuffle(['blue', 'green', 'orange', 'pink', 'teal', 'yellow']); let i = 0;
    [3, 2, 1].forEach((n, bi) => { for (let k = 0; k < n; k++) {
      const w = this._walk(Math.min(800, span * 0.03) + crypto.randomInt(Math.max(1, Math.floor(span * 0.3))), span * 0.1 + crypto.randomInt(Math.max(1, Math.floor(span * 0.15))), 3.2, chosen[bi], span * 0.8);
      r.actors.push(this._mkActor({ t: 'person', color: colors[i % colors.length], hat: i % 2 === 0, marker: true }, w.kf)); i++;
    } });
    r.shared = chosen[0].id; r.pickKind = 'building';
    return 'راقب الناس اللي فوقهم علامة... أي مبنى دخلوه أكثر ناس؟ حدده!';
  }
  _setupViolation(r) {
    const half = CITY_SIZE / 2, speed = 7.5; const lines = shuffle([0, 1, 2, 3, 4].slice(0, CITY.N + 1)).slice(0, 3); const colors = shuffle(['white', 'black', 'orange', 'teal', 'pink']);
    const bad = crypto.randomInt(3); let badOk = false;
    const build = (line, axis, violate, delay) => {
      // axis 'ns': يتحرك على z من -half إلى +half على خط الطريق line
      const fixed = roadAt(line) + (axis === 'ns' ? -CITY.LANE : CITY.LANE); let pos = -half + 1; let t = delay; let ran = false;
      const P = (v) => (axis === 'ns' ? [fixed, v] : [v, fixed]); const rot = axis === 'ns' ? 0 : Math.PI / 2;
      const kf = [[0, ...P(pos), rot, 0], [t, ...P(pos), rot, 1]];
      for (let k = 0; k <= CITY.N; k++) {
        const stop = roadAt(k) - CITY.ROAD / 2 - 1.4; t += (stop - pos) / speed * 1000; pos = stop; kf.push([t, ...P(pos), rot, 1]);
        const i = axis === 'ns' ? line : k, j = axis === 'ns' ? k : line;
        const st = this.simT(r.startAt + t); let tt = st; let wait = 0;
        while (lightState(i, j, tt) !== axis && wait < 14) { tt += 0.25; wait += 0.25; }
        if (wait > 0) { if (violate && !ran && wait >= 2) ran = true; else { t += wait * 1000; kf.push([t, ...P(pos), rot, 1]); } }
      }
      t += (half - 2 - pos) / speed * 1000; kf.push([t, ...P(half - 2), rot, 1]);
      return { kf, ran };
    };
    const defs = [];
    lines.forEach((line, idx) => {
      const axis = idx % 2 ? 'ew' : 'ns'; let b = null;
      for (let d = 0; d < 12; d++) { b = build(line, axis, idx === bad, 1500 + d * 1000); if (idx !== bad || b.ran) break; }
      if (idx === bad) badOk = b.ran;
      defs.push(this._mkActor({ t: 'car', sub: 'car', color: colors[idx] }, b.kf));
    });
    if (!badOk) { // لم نجد لحظة حمراء لهذا المسار (نادر) — نستبدلها بمهمة ذهبية صحيحة بدل مهمة بلا إجابة
      const t = pick(this.findables); r.shared = t.id; r.type = 'rush'; return describe(t.key);
    }
    r.actors.push(...defs); r.shared = defs[bad].def.id; r.pickKind = 'car';
    return 'ركّز على الإشارات! فيه سيارة بتقطع الإشارة وهي حمراء... حددها!';
  }
  _setupDiff(r) {
    const cands = this.world.ents.filter((e) => !e.kf && (e.t === 'prop' || (e.t === 'car' && e.parked)));
    const e = pick(cands); const colors = ['red', 'blue', 'yellow', 'green', 'white', 'orange', 'pink', 'purple', 'teal'].filter((c) => c !== (this.changed && this.changed.get(e.id) || e.color));
    const color = pick(colors); r.shared = e.id; r.openAt = r.startAt + this.cfg.memorizeMs;
    this.changed = this.changed || new Map();
    this._after(this.cfg.memorizeMs, () => { if (this.round === r && !r.done) { this.changed.set(e.id, color); this.gall({ k: 'change', id: e.id, color }); } });
    return 'احفظ شكل المدينة زين... بعد ثواني بيتغير لون شي واحد فيها. حدده!';
  }

  // ---------------------------------------------------------------- الإجابات
  onMessage(p, d) {
    if (d.k !== 'pick' || p.isHost) return;
    const r = this.round; const now = Date.now();
    if (!r || r.done || d.round !== r.n || now >= r.endAt) return;     // إجابة متأخرة/من جولة سابقة: تُتجاهل
    const slot = r.per.get(p.id); if (!slot || slot.ok || slot.locked) return; // منع احتساب النقاط مرتين
    const id = String(d.id || '');
    const isB = id[0] === 'b';
    if ((r.pickKind === 'building') !== isB) return this.g(p, { k: 'picked', ignored: true, pickKind: r.pickKind });
    if (now < r.openAt) return this.g(p, { k: 'picked', ignored: true, early: true });
    const st = this.stats.get(p.id) || { ok: 0, wrong: 0, ms: 0 };
    if (id === slot.target) {
      let pts = PTS.ok; const first = (SHARED.has(r.type) || r.tie) && r.firsts.length === 0;
      if (first) pts += PTS.first; if (now <= r.half) pts += PTS.fast;
      slot.ok = true; slot.pts += pts; slot.at = now - r.startAt; p.score += pts; st.ok++; st.ms += slot.at; this.stats.set(p.id, st);
      r.firsts.push(p.id);
      this.g(p, { k: 'picked', ok: true, pts, score: p.score, first });
      this.gall({ k: 'solved', id: p.id, name: p.name, first, score: p.score });
      if (r.tie) return this._endRound();
    } else {
      slot.wrong++; const loss = Math.min(PTS.wrong, p.score); p.score -= loss; slot.pts -= loss; st.wrong++; this.stats.set(p.id, st);
      if (slot.wrong >= PTS.maxWrong) slot.locked = true;
      this.g(p, { k: 'picked', ok: false, pts: -loss, score: p.score, left: PTS.maxWrong - slot.wrong, locked: slot.locked });
    }
    if ([...r.per.entries()].every(([pid, s]) => s.ok || s.locked || !this.room.players.has(pid))) this._endRound();
  }

  _endRound() {
    const r = this.round; if (!r || r.done) return; r.done = true;
    clearTimeout(r.endTimer); if (this.actorTimer) { clearInterval(this.actorTimer); this.actorTimer = null; }
    const results = this.players().map((p) => { const s = r.per.get(p.id); return { id: p.id, name: p.name, ok: !!(s && s.ok), pts: s ? s.pts : 0, score: p.score, target: s ? s.target : null, out: this.out.has(p.id) }; });
    let eliminated = null;
    if (!r.tie && this.room.settings.knockout && r.n % 2 === 0 && r.n < this.total && this.active().length > 2) {
      const act = this.active().sort((a, b) => a.score - b.score || (this.stats.get(b.id).ms - this.stats.get(a.id).ms));
      const lo = act[0], nx = act[1];
      if (lo.score < nx.score || this.stats.get(lo.id).ms !== this.stats.get(nx.id).ms) { this.out.add(lo.id); eliminated = { id: lo.id, name: lo.name }; }
    }
    this.gall({ k: 'reveal', round: r.n, type: r.type, shared: r.shared, results, firsts: r.firsts.map((id) => (this.room.players.get(id) || {}).name).filter(Boolean), eliminated, hadActors: r.actors.length > 0 });
    this.srv.pushRoom(this.room);
    this._after(this.cfg.revealMs, () => {
      if (!r.tie && r.n < this.total) return this._nextRound();
      // نهاية المباراة أو تحدٍ فاصل عند تعادل المركز الأول
      const act = this.active(); const top = Math.max(0, ...act.map((p) => p.score)); const leaders = act.filter((p) => p.score === top);
      if (r.tie && r.firsts.length) { const w = this.room.players.get(r.firsts[0]); if (w) w.tieWin = true; return this._final(); }
      if (leaders.length > 1 && act.length > 1) return this._nextRound(leaders.map((p) => p.id));
      this._final();
    });
  }

  _final() {
    const ranking = this.players().sort((a, b) => (b.tieWin ? 1 : 0) - (a.tieWin ? 1 : 0) || b.score - a.score).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score, out: this.out.has(p.id) }));
    const st = [...this.stats.entries()].map(([id, s]) => ({ p: this.room.players.get(id), s })).filter((x) => x.p);
    const fastest = st.filter((x) => x.s.ok).sort((a, b) => a.s.ms / a.s.ok - b.s.ms / b.s.ok)[0];
    const sharp = st.filter((x) => x.s.ok).sort((a, b) => a.s.wrong - b.s.wrong || b.s.ok - a.s.ok)[0];
    for (const p of this.players()) delete p.tieWin;
    this.gall({ k: 'final', ranking, awards: { fastest: fastest ? { name: fastest.p.name, sec: +(fastest.s.ms / fastest.s.ok / 1000).toFixed(1) } : null, sharp: sharp ? { name: sharp.p.name, wrong: sharp.s.wrong, ok: sharp.s.ok } : null } });
    this.round = null; this.srv.endMatch(this.room);
  }

  onDrop() {}
  onLeave(p) { const r = this.round; if (r && !r.done && r.per.has(p.id)) { r.per.delete(p.id); if (r.per.size === 0 || [...r.per.values()].every((s) => s.ok || s.locked)) this._endRound(); } }
  onRejoin(p) {
    this.g(p, this._init()); const r = this.round;
    if (this.changed) for (const [id, color] of this.changed) this.g(p, { k: 'change', id, color, quiet: true });
    if (!r || r.done) return;
    const slot = r.per.get(p.id);
    const base = { round: r.n, of: this.total, type: r.type, title: TITLES[r.type], endAt: r.endAt, pickKind: r.pickKind, shared: SHARED.has(r.type) || r.tie, event: r.event, now: Date.now() };
    this.g(p, Object.assign(p.isHost ? { k: 'round' } : { k: 'mission', text: slot ? slot.text : null, watching: !slot, done: slot && (slot.ok || slot.locked) }, base));
    if (r.actors.length) this.g(p, { k: 'spawn', ents: r.actors.map((a) => a.def) });
  }
}
