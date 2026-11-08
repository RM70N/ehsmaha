'use strict';

// مدير راوندات ألعاب ديسكورد — المصدر الوحيد لحالة الراوند (البوت والويب يقرآن منه فقط).
//
// دورة حياة الراوند:
//   waiting  → المضيف يبدأ (بقرار صريح فقط، ما فيه بدء تلقائي) →
//   starting → قائمة اللاعبين مقفولة، عدّاد قصير والواجهات تنتقل →
//   running  → محرّك اللعبة (games/*) يشتغل بمؤقت واحد على deadline المرحلة الحالية →
//   finished | cancelled
//
// كل العمليات متزامنة داخل JS (ما فيه await بين الفحص والتعديل) فهي ذرّية: ضغطتين على "بدء" =
// بدء واحد، وانضمامين بنفس اللحظة ما يتجاوزون الحد. التخزين والبث والرسائل تحصل بعد التعديل.

const EventEmitter = require('node:events');
const crypto = require('node:crypto');
const games = require('./games');
const logger = require('../../utils/logger');

const DEFAULTS = Object.freeze({
  lobbyTtlMs: 10 * 60 * 1000, // راوند ما بدأ خلال 10 دقائق ← يتلغى (ما يعلّق القناة)
  startingMs: 3000, // مدة انتقال "جاري البدء" قبل أول مرحلة
  playerGraceMs: 20 * 1000, // لاعب بالانتظار انقطع اتصاله كل هالمدة ← ينشال
  hostGraceMs: 3 * 60 * 1000, // المضيف انقطع كل هالمدة بالانتظار ← الراوند يتلغى
  retireMs: 10 * 60 * 1000, // بعد النهاية نبقي الحالة للعرض ثم نحرر الذاكرة والاتصالات
  saveDebounceMs: 250,
  maxEvents: 200
});

const ID_RE = /^[A-Za-z0-9_-]{22}$/;
const newId = () => crypto.randomBytes(16).toString('base64url');

// اسم/صورة قادمة من ديسكورد — ننظّفها قبل الحفظ والعرض
function cleanProfile(p) {
  const name = String((p && (p.name || p.displayName || p.username)) || 'لاعب')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮]/g, '')
    .trim()
    .slice(0, 32) || 'لاعب';
  let avatarUrl = null;
  try {
    const u = new URL(p && p.avatarUrl);
    if (u.protocol === 'https:' && /(^|\.)discordapp\.(com|net)$|(^|\.)discord\.com$/.test(u.hostname)) avatarUrl = u.href;
  } catch {
    /* بدون صورة */
  }
  return { id: String(p.id), name, username: String(p.username || '').slice(0, 40), avatarUrl };
}

class RoundManager extends EventEmitter {
  constructor({ store, random = Math.random, now = Date.now, settings = {}, countryList = null } = {}) {
    super();
    if (!store) throw new Error('RoundManager يحتاج store');
    this.store = store;
    this.random = random;
    this.now = now;
    this.cfg = { ...DEFAULTS, ...settings };
    this.countryList = countryList;
    this.rounds = new Map(); // roundId -> round (الراوندات الحية + المنتهية للعرض)
    this.byChannel = new Map(); // channelId -> roundId (النشطة فقط)
    this.seenSockets = 0;
  }

  // ---------------- أدوات ----------------
  get(id) {
    return ID_RE.test(String(id)) ? this.rounds.get(id) || null : null;
  }
  getByChannel(channelId) {
    const id = this.byChannel.get(channelId);
    return id ? this.rounds.get(id) || null : null;
  }
  isActive(r) {
    return r.status === 'waiting' || r.status === 'starting' || r.status === 'running';
  }
  list() {
    return [...this.rounds.values()];
  }

  _rt() {
    return { conns: new Set(), timer: null, graceTimers: new Map(), hostGrace: null, hostSeen: false, saveTimer: null, saving: Promise.resolve(), flushQueued: false, pending: [], retireTimer: null };
  }

  _env(round) {
    return {
      random: this.random,
      now: this.now,
      countryList: this.countryList,
      timings: (this.cfg.timings && this.cfg.timings[round.gameType]) || null, // للاختبارات فقط
      emit: (type, payload) => this._event(round, type, payload),
      finish: (result) => this._finish(round, result)
    };
  }

  _event(round, eventType, payload = {}) {
    round.seq += 1;
    const ev = { eventId: `${round.roundId.slice(0, 6)}-${round.seq}`, roundId: round.roundId, eventType, sequence: round.seq, serverTimestamp: this.now(), payload };
    round.events.push(ev);
    if (round.events.length > this.cfg.maxEvents) round.events.splice(0, round.events.length - this.cfg.maxEvents);
    round.rt.pending.push(ev);
    return ev;
  }

  toRecord(round) {
    const { rt, ...rec } = round; // eslint-disable-line no-unused-vars
    return rec;
  }

  // ---------------- العرض (ما ينرسل للعميل غير هذا) ----------------
  viewFor(round, viewerId = null) {
    const game = games.get(round.gameType);
    const meta = game.meta;
    const connected = new Set([...round.rt.conns].filter((c) => c.userId).map((c) => c.userId));
    const spectators = [...round.rt.conns].filter((c) => !c.userId || !round.players.some((p) => p.id === c.userId)).length;
    const isPlayer = !!viewerId && round.players.some((p) => p.id === viewerId);
    return {
      v: 1,
      serverNow: this.now(),
      roundId: round.roundId,
      gameType: round.gameType,
      game: { key: meta.key, name: meta.name, emoji: meta.emoji, intro: meta.intro, command: meta.command },
      status: round.status,
      cancelReason: round.cancelReason || null,
      host: round.players.find((p) => p.id === round.hostDiscordId) || round.hostProfile,
      minPlayers: round.minPlayers,
      maxPlayers: round.maxPlayers,
      createdAt: round.createdAt,
      startedAt: round.startedAt,
      endedAt: round.endedAt,
      startingEndsAt: round.status === 'starting' ? round.startingEndsAt : null,
      lobbyExpiresAt: round.status === 'waiting' ? round.lobbyExpiresAt : null,
      players: round.players.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl, isHost: p.id === round.hostDiscordId, connected: connected.has(p.id) })),
      spectators,
      seq: round.seq,
      me: { id: viewerId, isHost: !!viewerId && viewerId === round.hostDiscordId, isPlayer, kicked: !!viewerId && round.kicked.includes(viewerId) },
      state: round.game && (round.status === 'running' || round.status === 'finished') ? game.view(round, viewerId) : null,
      result: round.result
    };
  }

  // ---------------- إنشاء ----------------
  create({ gameType, guildId, channelId, host }) {
    const game = games.get(gameType);
    if (!game) return { ok: false, reason: 'UNKNOWN_GAME' };
    const existing = this.getByChannel(channelId);
    if (existing) return { ok: false, reason: 'CHANNEL_BUSY', round: existing };
    const hostProfile = cleanProfile(host);
    const now = this.now();
    const round = {
      roundId: newId(),
      gameType,
      platform: 'discord',
      guildId: String(guildId),
      channelId: String(channelId),
      hostDiscordId: hostProfile.id,
      hostProfile,
      status: 'waiting',
      players: [{ ...hostProfile, joinedAt: now }],
      kicked: [],
      createdAt: now,
      startedAt: null,
      endedAt: null,
      startingEndsAt: null,
      lobbyExpiresAt: now + this.cfg.lobbyTtlMs,
      lobbyMessageId: null,
      liveMessageId: null,
      resultAnnounced: false,
      maxPlayers: game.meta.maxPlayers,
      minPlayers: game.meta.minPlayers,
      version: 1,
      seq: 0,
      events: [],
      game: null,
      result: null,
      cancelReason: null
    };
    round.rt = this._rt();
    this.rounds.set(round.roundId, round);
    this.byChannel.set(round.channelId, round.roundId);
    this._event(round, 'round:created', { gameType, hostId: hostProfile.id });
    this._changed(round, { immediateSave: true });
    return { ok: true, round };
  }

  // ---------------- الانتظار ----------------
  join(roundId, profile) {
    const r = this.get(roundId);
    if (!r) return { ok: false, reason: 'NOT_FOUND' };
    const p = cleanProfile(profile);
    if (r.kicked.includes(p.id)) return { ok: false, reason: 'KICKED' };
    if (r.status !== 'waiting') return { ok: false, reason: this.isActive(r) ? 'STARTED' : 'ENDED' };
    const existing = r.players.find((x) => x.id === p.id);
    if (existing) {
      Object.assign(existing, { name: p.name, username: p.username, avatarUrl: p.avatarUrl }); // تحديث الاسم/الصورة
      this._changed(r);
      return { ok: true, already: true };
    }
    if (r.players.length >= r.maxPlayers) return { ok: false, reason: 'FULL' };
    r.players.push({ ...p, joinedAt: this.now() });
    this._event(r, 'round:joined', { playerId: p.id, count: r.players.length });
    this._armPlayerGrace(r, p.id);
    this._changed(r);
    return { ok: true };
  }

  leave(roundId, userId) {
    const r = this.get(roundId);
    if (!r) return { ok: false, reason: 'NOT_FOUND' };
    if (r.status !== 'waiting') return { ok: false, reason: 'STARTED' };
    if (userId === r.hostDiscordId) return { ok: false, reason: 'HOST_CANNOT_LEAVE' };
    if (!this._removeWaiting(r, userId, 'left')) return { ok: false, reason: 'NOT_JOINED' };
    return { ok: true };
  }

  kick(roundId, byId, targetId) {
    const r = this.get(roundId);
    if (!r) return { ok: false, reason: 'NOT_FOUND' };
    if (byId !== r.hostDiscordId) return { ok: false, reason: 'NOT_HOST' };
    if (r.status !== 'waiting') return { ok: false, reason: 'STARTED' };
    if (targetId === r.hostDiscordId) return { ok: false, reason: 'CANNOT_KICK_HOST' };
    const target = r.players.find((p) => p.id === targetId);
    if (!target) return { ok: false, reason: 'NOT_JOINED' };
    r.kicked.push(targetId);
    this._removeWaiting(r, targetId, 'kicked');
    // اللاعب المطرود ينفصل فوراً من الواجهة ولا يستطيع تنفيذ أي قرار بعدها
    for (const c of [...r.rt.conns]) {
      if (c.userId !== targetId) continue;
      this._safeSend(c, { t: 'kicked' });
      this._safeClose(c, 4003, 'kicked');
      r.rt.conns.delete(c);
    }
    this.emit('kicked', r, target);
    return { ok: true, target };
  }

  _removeWaiting(r, userId, why) {
    const i = r.players.findIndex((p) => p.id === userId);
    if (i < 0) return false;
    r.players.splice(i, 1);
    this._clearPlayerGrace(r, userId);
    this._event(r, why === 'kicked' ? 'round:kicked' : 'round:left', { playerId: userId, count: r.players.length, why });
    this._changed(r);
    return true;
  }

  cancel(roundId, byId) {
    const r = this.get(roundId);
    if (!r) return { ok: false, reason: 'NOT_FOUND' };
    if (byId !== r.hostDiscordId) return { ok: false, reason: 'NOT_HOST' };
    if (r.status !== 'waiting') return { ok: false, reason: 'STARTED' };
    this._cancel(r, 'host');
    return { ok: true };
  }

  _cancel(r, reason) {
    if (!this.isActive(r)) return;
    r.status = 'cancelled';
    r.cancelReason = reason;
    r.endedAt = this.now();
    this._endCleanup(r);
    this._event(r, 'round:cancelled', { reason });
    this._changed(r, { immediateSave: true });
    this.emit('cancelled', r, reason);
  }

  // ---------------- البدء (بقرار المضيف فقط) ----------------
  start(roundId, byId) {
    const r = this.get(roundId);
    if (!r) return { ok: false, reason: 'NOT_FOUND' };
    if (byId !== r.hostDiscordId) return { ok: false, reason: 'NOT_HOST' };
    if (r.status === 'starting' || r.status === 'running') return { ok: false, reason: 'ALREADY_STARTED' };
    if (r.status !== 'waiting') return { ok: false, reason: 'ENDED' };
    if (r.players.length < r.minPlayers) return { ok: false, reason: 'NOT_ENOUGH', need: r.minPlayers - r.players.length };
    // من هنا للآخر متزامن: أي ضغطة ثانية (ويب/ديسكورد) ترجع ALREADY_STARTED
    r.status = 'starting';
    r.startingEndsAt = this.now() + this.cfg.startingMs;
    for (const id of [...r.rt.graceTimers.keys()]) this._clearPlayerGrace(r, id); // القائمة انقفلت
    this._event(r, 'round:starting', { players: r.players.length, startingEndsAt: r.startingEndsAt });
    this._changed(r, { immediateSave: true });
    this.emit('starting', r);
    return { ok: true };
  }

  _begin(r) {
    if (r.status !== 'starting') return;
    if (r.players.length < 2) return this._cancel(r, 'not_enough');
    const game = games.get(r.gameType);
    r.status = 'running';
    r.startedAt = this.now();
    r.startingEndsAt = null;
    try {
      game.start(r, this._env(r));
    } catch (err) {
      logger.error('راوند: فشل بدء اللعبة', { roundId: r.roundId, game: r.gameType, error: err });
      r.status = 'starting';
      return this._cancel(r, 'start_failed');
    }
    this._event(r, 'round:started', { players: r.players.length });
    this._changed(r, { immediateSave: true });
    this.emit('started', r);
  }

  // ---------------- اللعب ----------------
  act(roundId, userId, type, payload) {
    const r = this.get(roundId);
    if (!r) return { ok: false, reason: 'NOT_FOUND' };
    if (r.status !== 'running') return { ok: false, reason: 'NOT_RUNNING' };
    if (!userId || !r.players.some((p) => p.id === userId)) return { ok: false, reason: 'NOT_PLAYER' };
    const game = games.get(r.gameType);
    let res;
    try {
      res = game.act(r, userId, String(type), payload && typeof payload === 'object' ? payload : {}, this._env(r));
    } catch (err) {
      logger.error('راوند: خطأ بتنفيذ حركة', { roundId, game: r.gameType, error: err });
      return { ok: false, reason: 'INTERNAL' };
    }
    if (res && res.ok) this._changed(r);
    return res || { ok: false, reason: 'BAD_ACTION' };
  }

  // لاعب غادر السيرفر
  removeMember(guildId, userId) {
    for (const r of [...this.rounds.values()]) {
      if (r.guildId !== guildId || !this.isActive(r) || !r.players.some((p) => p.id === userId)) continue;
      if (userId === r.hostDiscordId && r.status === 'waiting') {
        this._cancel(r, 'host_left_server');
      } else if (r.status === 'running') {
        try {
          games.get(r.gameType).removePlayer(r, userId, this._env(r));
        } catch (err) {
          logger.error('راوند: خطأ بإزالة عضو غادر', { roundId: r.roundId, error: err });
        }
        this._changed(r);
      } else {
        r.players = r.players.filter((p) => p.id !== userId);
        this._clearPlayerGrace(r, userId);
        this._event(r, 'round:left', { playerId: userId, count: r.players.length, why: 'left_server' });
        this._changed(r);
      }
    }
  }

  _finish(r, result) {
    if (r.status !== 'running') return;
    const byId = new Map(r.players.map((p) => [p.id, p]));
    r.status = 'finished';
    r.endedAt = this.now();
    r.result = { ...result, winners: (result.winnerIds || []).map((id) => (byId.get(id) ? { id, name: byId.get(id).name, avatarUrl: byId.get(id).avatarUrl } : { id })), participants: r.players.length };
    this._endCleanup(r);
    this._event(r, 'round:finished', { outcome: r.result.outcome, winnerIds: r.result.winnerIds || [] });
    this._changed(r, { immediateSave: true });
    // الإعلان يطلق بعد ما تنتهي دورة التعديل الحالية
    setImmediate(() => this.emit('finished', r));
  }

  _endCleanup(r) {
    if (this.byChannel.get(r.channelId) === r.roundId) this.byChannel.delete(r.channelId);
    clearTimeout(r.rt.timer);
    r.rt.timer = null;
    for (const t of r.rt.graceTimers.values()) clearTimeout(t);
    r.rt.graceTimers.clear();
    clearTimeout(r.rt.hostGrace);
    r.rt.hostGrace = null;
    clearTimeout(r.rt.retireTimer);
    r.rt.retireTimer = setTimeout(() => this._retire(r), this.cfg.retireMs);
    if (r.rt.retireTimer.unref) r.rt.retireTimer.unref();
  }

  _retire(r) {
    for (const c of [...r.rt.conns]) this._safeClose(c, 1000, 'round-ended');
    r.rt.conns.clear();
    clearTimeout(r.rt.saveTimer);
    this.rounds.delete(r.roundId);
  }

  // ---------------- المؤقت الوحيد للراوند ----------------
  _deadline(r) {
    if (r.status === 'waiting') return r.lobbyExpiresAt;
    if (r.status === 'starting') return r.startingEndsAt;
    if (r.status === 'running') return games.get(r.gameType).nextDeadline(r);
    return null;
  }

  _rearm(r) {
    clearTimeout(r.rt.timer);
    r.rt.timer = null;
    const d = this._deadline(r);
    if (d == null) return;
    const delay = Math.min(Math.max(0, d - this.now()), 2 ** 31 - 1);
    r.rt.timer = setTimeout(() => this._onTimer(r), delay);
    if (r.rt.timer.unref) r.rt.timer.unref();
  }

  _onTimer(r) {
    r.rt.timer = null;
    try {
      for (let i = 0; i < 6 && this.isActive(r); i++) {
        const d = this._deadline(r);
        if (d == null || d > this.now() + 5) break;
        if (r.status === 'waiting') this._cancel(r, 'timeout');
        else if (r.status === 'starting') this._begin(r);
        else games.get(r.gameType).tick(r, this._env(r));
      }
    } catch (err) {
      logger.error('راوند: خطأ بمؤقت اللعبة', { roundId: r.roundId, error: err });
    }
    if (this.isActive(r)) this._changed(r);
  }

  // ---------------- حضور المتصلين ----------------
  _armPlayerGrace(r, userId) {
    if (userId === r.hostDiscordId) return;
    this._clearPlayerGrace(r, userId);
    if ([...r.rt.conns].some((c) => c.userId === userId)) return;
    const t = setTimeout(() => {
      r.rt.graceTimers.delete(userId);
      if (r.status === 'waiting' && ![...r.rt.conns].some((c) => c.userId === userId)) this._removeWaiting(r, userId, 'disconnected');
    }, this.cfg.playerGraceMs);
    if (t.unref) t.unref();
    r.rt.graceTimers.set(userId, t);
  }
  _clearPlayerGrace(r, userId) {
    const t = r.rt.graceTimers.get(userId);
    if (t) clearTimeout(t);
    r.rt.graceTimers.delete(userId);
  }

  /**
   * اتصال جديد (WebSocket). userId=null ← مشاهد. sink: { send(str), close(code, reason) }
   * @returns {{ok, conn?, disconnect?}}
   */
  connect(roundId, userId, sink, { since = null } = {}) {
    const r = this.get(roundId);
    if (!r) return { ok: false, reason: 'NOT_FOUND' };
    if (userId && r.kicked.includes(userId)) return { ok: false, reason: 'KICKED' };
    const conn = { id: ++this.seenSockets, userId: userId || null, sink };
    r.rt.conns.add(conn);
    if (userId) {
      this._clearPlayerGrace(r, userId);
      if (userId === r.hostDiscordId) {
        r.rt.hostSeen = true;
        clearTimeout(r.rt.hostGrace);
        r.rt.hostGrace = null;
      }
    }
    // الحالة الكاملة فوراً + الأحداث الفائتة (لو يعيد الاتصال)
    const missed = since == null ? [] : r.events.filter((e) => e.sequence > Number(since));
    this._safeSend(conn, { t: 'state', state: this.viewFor(r, conn.userId), events: missed, hello: true });
    this._queueFlush(r); // باقي المتصلين يشوفون إنه دخل/اتصل
    return { ok: true, conn, disconnect: () => this._disconnect(r, conn) };
  }

  _disconnect(r, conn) {
    if (!r.rt.conns.delete(conn)) return;
    const uid = conn.userId;
    if (uid && r.status === 'waiting' && r.players.some((p) => p.id === uid) && ![...r.rt.conns].some((c) => c.userId === uid)) {
      if (uid === r.hostDiscordId) {
        if (r.rt.hostSeen && !r.rt.hostGrace) {
          r.rt.hostGrace = setTimeout(() => {
            r.rt.hostGrace = null;
            if (r.status === 'waiting' && ![...r.rt.conns].some((c) => c.userId === uid)) this._cancel(r, 'host_disconnected');
          }, this.cfg.hostGraceMs);
          if (r.rt.hostGrace.unref) r.rt.hostGrace.unref();
        }
      } else {
        this._armPlayerGrace(r, uid);
      }
    }
    this._queueFlush(r);
  }

  // ---------------- البث + الحفظ ----------------
  _safeSend(conn, obj) {
    try {
      conn.sink.send(JSON.stringify(obj));
    } catch (err) {
      logger.debug('راوند: تعذّر الإرسال لاتصال', { error: err && err.message });
    }
  }
  _safeClose(conn, code, reason) {
    try {
      conn.sink.close(code, reason);
    } catch {
      /* مقفول أصلاً */
    }
  }

  _queueFlush(r) {
    if (r.rt.flushQueued) return;
    r.rt.flushQueued = true;
    setImmediate(() => {
      r.rt.flushQueued = false;
      const events = r.rt.pending.splice(0);
      for (const c of [...r.rt.conns]) this._safeSend(c, { t: 'state', state: this.viewFor(r, c.userId), events });
    });
  }

  _changed(r, { immediateSave = false } = {}) {
    this._rearm(r);
    this._queueFlush(r);
    this._scheduleSave(r, immediateSave);
    this.emit('change', r);
  }

  _scheduleSave(r, immediate) {
    clearTimeout(r.rt.saveTimer);
    const run = () => {
      r.rt.saveTimer = null;
      const rec = this.toRecord(r);
      r.rt.saving = r.rt.saving.then(() => this.store.save(rec)).catch((err) => logger.warn('راوند: تعذّر حفظ الحالة', { roundId: r.roundId, error: err && err.message }));
    };
    if (immediate) run();
    else {
      r.rt.saveTimer = setTimeout(run, this.cfg.saveDebounceMs);
      if (r.rt.saveTimer.unref) r.rt.saveTimer.unref();
    }
  }

  async flush() {
    await Promise.all(this.list().map((r) => {
      clearTimeout(r.rt.saveTimer);
      const rec = this.toRecord(r);
      r.rt.saving = r.rt.saving.then(() => this.store.save(rec)).catch(() => {});
      return r.rt.saving;
    }));
  }

  // ---------------- الاستعادة بعد إعادة التشغيل ----------------
  async restore() {
    const recs = await this.store.listActive();
    const out = { restored: 0, aborted: 0 };
    for (const rec of recs) {
      try {
        if (rec.corrupt || !rec.roundId || !games.get(rec.gameType)) throw new Error('سجل راوند غير صالح');
        const r = { ...rec, rt: this._rt() };
        r.kicked = r.kicked || [];
        r.events = r.events || [];
        this.rounds.set(r.roundId, r);
        this.byChannel.set(r.channelId, r.roundId);
        if (r.status === 'waiting') {
          // اللاعبين بدون اتصالات بعد الإقلاع: ينشالون لو ما رجعوا خلال مهلة الاتصال
          for (const p of r.players) this._armPlayerGrace(r, p.id);
        }
        this._changed(r);
        this.emit('restored', r);
        out.restored += 1;
      } catch (err) {
        out.aborted += 1;
        logger.warn('راوند: تعذّرت استعادة راوند — يُنهى بأمان', { roundId: rec && rec.roundId, error: err && err.message });
        if (rec && rec.roundId && !rec.corrupt) {
          rec.status = 'cancelled';
          rec.cancelReason = 'restore_failed';
          rec.endedAt = this.now();
          await this.store.save(rec).catch(() => {});
          this.emit('aborted', rec);
        }
      }
    }
    for (const rec of await this.store.listUnannounced().catch(() => [])) {
      const r = { ...rec, rt: this._rt() };
      this.rounds.set(r.roundId, r);
      r.rt.retireTimer = setTimeout(() => this._retire(r), this.cfg.retireMs);
      if (r.rt.retireTimer.unref) r.rt.retireTimer.unref();
      setImmediate(() => this.emit('finished', r));
    }
    return out;
  }

  // إيقاف نظيف: كل المؤقتات والاتصالات
  async shutdown({ persist = true } = {}) {
    if (persist) await this.flush().catch(() => {});
    for (const r of this.rounds.values()) {
      clearTimeout(r.rt.timer);
      clearTimeout(r.rt.saveTimer);
      clearTimeout(r.rt.hostGrace);
      clearTimeout(r.rt.retireTimer);
      for (const t of r.rt.graceTimers.values()) clearTimeout(t);
      for (const c of r.rt.conns) this._safeClose(c, 1001, 'shutdown');
      r.rt.conns.clear();
    }
    this.rounds.clear();
    this.byChannel.clear();
  }
}

module.exports = { RoundManager, DEFAULTS, ID_RE, cleanProfile };
