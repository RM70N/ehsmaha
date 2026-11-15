'use strict';
// خدمة إعدادات وسجل SPECIAL EVENTS. مفتاح التخزين دائماً uid الموثَّق → لعبة → حدث (عزل تام بين الحسابات).
// لا تعرف شيئاً عن HTTP. القرار التنفيذي للحدث داخل الجولة يتم في متصفح الستريمر (حيث تعمل اللعبة)، والخادم هنا
// مرجع الإعدادات (يتحقق ويخزّن) وسجل التنفيذ (يتحقق من الشكل ويمنع التكرار بمفتاح idempotency).
import { EVENT_GAMES, EVENT_BY_ID, GAME_FIELDS } from './catalog.js';

const MAX_HISTORY = 500, MAX_SEEN = 400, MAX_PROFILES_PER_GAME = 10;
export class EvError extends Error { constructor(code, detail) { super(code); this.code = code; this.detail = detail; } }
const clone = (o) => JSON.parse(JSON.stringify(o));
const emptyDoc = () => ({ rev: 0, games: {}, profiles: {}, history: [], seen: [], updatedAt: 0 });
let seq = 0;
const newId = (now) => now().toString(36) + '-' + (++seq).toString(36) + '-' + Math.random().toString(36).slice(2, 6);

export function validateField(f, v) {
  if (f.type === 'toggle') { if (typeof v !== 'boolean') throw new EvError('invalid_type', { key: f.key }); return v; }
  if (f.type === 'number') {
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) throw new EvError('invalid_type', { key: f.key });
    if (v < f.min || v > f.max) throw new EvError('out_of_range', { key: f.key, min: f.min, max: f.max });
    return v;
  }
  if (f.type === 'select') { if (!f.options.includes(v)) throw new EvError('invalid_option', { key: f.key }); return v; }
  throw new EvError('invalid_type', { key: f.key });
}
function validateValues(fields, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new EvError('invalid_values');
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    const f = fields.find((x) => x.key === k);
    if (!f) throw new EvError('unknown_setting', { key: k });
    out[k] = validateField(f, v);
  }
  return out;
}

export class EventsService {
  constructor({ store, now = Date.now } = {}) { if (!store) throw new Error('store مطلوب'); this.store = store; this.now = now; this.locks = new Map(); }
  async _tx(uid, fn) {
    if (!uid || typeof uid !== 'string') throw new EvError('invalid_uid');
    const prev = this.locks.get(uid) || Promise.resolve(); let release; const mine = new Promise((r) => { release = r; });
    this.locks.set(uid, prev.then(() => mine)); await prev;
    try { const doc = (await this.store.load(uid)) || emptyDoc(); return await fn(doc); } finally { release(); }
  }
  async _commit(uid, doc, bump = true) { if (bump) doc.rev = (doc.rev || 0) + 1; doc.updatedAt = this.now(); await this.store.save(uid, doc); return doc.rev; }
  _game(doc, tag) { if (!EVENT_GAMES[tag]) throw new EvError('unknown_game'); return (doc.games[tag] = doc.games[tag] || { events: {} }); }
  _checkRev(doc, baseRev) { if (baseRev != null && baseRev !== doc.rev) { const e = new EvError('conflict'); e.rev = doc.rev; throw e; } }

  async getState(uid) { return this._tx(uid, async (doc) => ({ rev: doc.rev, games: clone(doc.games), profiles: clone(doc.profiles) })); }

  // إعدادات اللعبة العامة (النمط/القوة/الفاصل/الحد الأقصى)
  async setGame(uid, tag, values, { baseRev = null } = {}) {
    return this._tx(uid, async (doc) => {
      this._checkRev(doc, baseRev);
      const clean = validateValues(GAME_FIELDS, values); const g = this._game(doc, tag);
      Object.assign(g, clean); const rev = await this._commit(uid, doc); return { rev, game: clone(g) };
    });
  }
  // إعدادات حدث واحد. التفعيل مسموح فقط لحدث مربوط فعلاً بمحرك لعبته.
  async setEvent(uid, tag, eventId, values, { baseRev = null } = {}) {
    return this._tx(uid, async (doc) => {
      this._checkRev(doc, baseRev);
      const ev = EVENT_BY_ID[eventId]; if (!ev || ev.tag !== tag) throw new EvError('unknown_event');
      if (values && values.enabled === true && !ev.implemented) throw new EvError('event_not_supported');
      const clean = validateValues(ev.fields.length ? ev.fields : [{ key: 'enabled', type: 'toggle' }], values);
      if (clean.fromSec != null || clean.toSec != null) {
        const cur = (this._game(doc, tag).events[eventId]) || {};
        const from = clean.fromSec ?? cur.fromSec ?? 5, to = clean.toSec ?? cur.toSec ?? 0;
        if (to !== 0 && to < from) throw new EvError('invalid_window');
      }
      const g = this._game(doc, tag); g.events[eventId] = { ...(g.events[eventId] || {}), ...clean };
      const rev = await this._commit(uid, doc); return { rev, event: clone(g.events[eventId]) };
    });
  }
  async resetGame(uid, tag, { baseRev = null } = {}) { return this._tx(uid, async (doc) => { this._checkRev(doc, baseRev); this._game(doc, tag); delete doc.games[tag]; return { rev: await this._commit(uid, doc) }; }); }

  // ---- مجموعات الأحداث (لكل لعبة؛ لا تُطبَّق على لعبة أخرى)
  async profileOp(uid, op, p = {}) {
    return this._tx(uid, async (doc) => {
      const own = (id) => { const x = doc.profiles[id]; if (!x) throw new EvError('not_found'); return x; };
      const nameOf = (n) => { const s = String(n == null ? '' : n).trim(); if (!s || s.length > 40) throw new EvError('invalid_name'); return s; };
      if (op === 'create') {
        const tag = String(p.tag || ''); const g = this._game(doc, tag);
        const nm = nameOf(p.name);
        const mine = Object.values(doc.profiles).filter((x) => x.tag === tag);
        if (mine.length >= MAX_PROFILES_PER_GAME) throw new EvError('too_many_profiles');
        if (mine.some((x) => x.name === nm)) throw new EvError('duplicate_name');
        const id = newId(this.now);
        doc.profiles[id] = { id, tag, name: nm, mode: g.mode, intensity: g.intensity, minGapSec: g.minGapSec, maxPerRound: g.maxPerRound, events: clone(g.events || {}), createdAt: this.now() };
        await this._commit(uid, doc, false); return { profile: clone(doc.profiles[id]) };
      }
      if (op === 'rename') { const x = own(String(p.id || '')); const nm = nameOf(p.name); if (Object.values(doc.profiles).some((y) => y.tag === x.tag && y.id !== x.id && y.name === nm)) throw new EvError('duplicate_name'); x.name = nm; await this._commit(uid, doc, false); return { profile: clone(x) }; }
      if (op === 'update') { const x = own(String(p.id || '')); const g = this._game(doc, x.tag); Object.assign(x, { mode: g.mode, intensity: g.intensity, minGapSec: g.minGapSec, maxPerRound: g.maxPerRound, events: clone(g.events || {}) }); await this._commit(uid, doc, false); return { profile: clone(x) }; }
      if (op === 'duplicate') {
        const x = own(String(p.id || '')); let nm = x.name + ' (نسخة)'; let n = 2; while (Object.values(doc.profiles).some((y) => y.tag === x.tag && y.name === nm)) nm = x.name + ' (نسخة ' + (n++) + ')';
        if (Object.values(doc.profiles).filter((y) => y.tag === x.tag).length >= MAX_PROFILES_PER_GAME) throw new EvError('too_many_profiles');
        const id = newId(this.now); doc.profiles[id] = { ...clone(x), id, name: nm.slice(0, 40), createdAt: this.now() }; await this._commit(uid, doc, false); return { profile: clone(doc.profiles[id]) };
      }
      if (op === 'delete') { own(String(p.id || '')); delete doc.profiles[p.id]; await this._commit(uid, doc, false); return { ok: true }; }
      if (op === 'apply') {
        const x = own(String(p.id || '')); if (p.tag && p.tag !== x.tag) throw new EvError('profile_wrong_game');   // لا تطبيق على لعبة أخرى
        this._checkRev(doc, p.baseRev ?? null);
        const g = this._game(doc, x.tag);
        const evs = clone(x.events || {});
        for (const [id, v] of Object.entries(evs)) { const ev = EVENT_BY_ID[id]; if (!ev || ev.tag !== x.tag || (v.enabled && !ev.implemented)) delete evs[id]; }
        Object.assign(g, { mode: x.mode, intensity: x.intensity, minGapSec: x.minGapSec, maxPerRound: x.maxPerRound, events: evs });
        const rev = await this._commit(uid, doc); return { rev, game: clone(g) };
      }
      throw new EvError('invalid_op');
    });
  }

  // ---- سجل التنفيذ. key = مفتاح idempotency من المحرك (مثلاً roundId:eventId:n) فلا يتكرر لو أُعيد الإرسال
  async record(uid, e) {
    return this._tx(uid, async (doc) => {
      const ev = EVENT_BY_ID[String(e && e.eventId)]; if (!ev || ev.tag !== (e && e.tag)) throw new EvError('unknown_event');
      const key = String((e && e.key) || ''); if (!key || key.length > 120) throw new EvError('invalid_key');
      if (!['completed', 'cancelled', 'failed'].includes(e.status)) throw new EvError('invalid_status');
      if (e.status === 'failed' && !String(e.reason || '').trim()) throw new EvError('reason_required');
      if (doc.seen.includes(key)) return { duplicate: true };
      const row = { id: newId(this.now), key, tag: ev.tag, eventId: ev.id, status: e.status, reason: e.status === 'completed' ? '' : String(e.reason || '').slice(0, 200), effect: String(e.effect || '').slice(0, 240), roundId: String(e.roundId || '').slice(0, 60), mode: String(e.mode || '').slice(0, 12), startedAt: Number(e.startedAt) || this.now(), durationMs: Math.max(0, Number(e.durationMs) || 0), at: this.now() };
      doc.history.push(row); if (doc.history.length > MAX_HISTORY) doc.history = doc.history.slice(-MAX_HISTORY);
      doc.seen.push(key); if (doc.seen.length > MAX_SEEN) doc.seen = doc.seen.slice(-MAX_SEEN);
      await this._commit(uid, doc, false); return { id: row.id };
    });
  }
  async history(uid, { tag, status, from, to, limit = 200 } = {}) {
    return this._tx(uid, async (doc) => {
      let h = doc.history; if (tag) h = h.filter((x) => x.tag === tag); if (status) h = h.filter((x) => x.status === status);
      if (from) h = h.filter((x) => x.startedAt >= from); if (to) h = h.filter((x) => x.startedAt <= to);
      const stats = { total: doc.history.length, completed: 0, cancelled: 0, failed: 0 }; doc.history.forEach((x) => { stats[x.status]++; });
      return { history: clone(h.slice(-Math.min(500, limit)).reverse()), stats };
    });
  }
}
