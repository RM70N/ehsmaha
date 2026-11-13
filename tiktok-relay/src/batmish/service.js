'use strict';
// منطق BATMISH: إعدادات لكل ستريمر (uid → لعبة → مفتاح)، المجموعات المحفوظة، سجل التعديلات، ولقطة الراوند.
// لا يعرف شيئاً عن HTTP أو الواجهة. كل عملية تأخذ uid موثَّقاً وتعمل على مستند ذلك الـuid فقط.
import { GAMES } from './schema.js';
import { ValidationError, validateValues, validateValue, fieldOf, defaultsOf, sameValue, validateName } from './validation.js';

const MAX_HISTORY = 300;
const MAX_PRESETS_PER_GAME = 20;

export class ConflictError extends Error { constructor(rev) { super('conflict'); this.code = 'conflict'; this.rev = rev; } }
export class NotFoundError extends Error { constructor(what) { super('not_found'); this.code = 'not_found'; this.what = what; } }

const emptyDoc = () => ({ rev: 0, config: {}, presets: {}, defaultPresets: {}, history: [], updatedAt: 0 });
const clone = (o) => JSON.parse(JSON.stringify(o));
let seq = 0;
const newId = (now) => now().toString(36) + '-' + (++seq).toString(36) + '-' + Math.random().toString(36).slice(2, 6);

export class BatmishService {
  constructor({ store, now = Date.now } = {}) {
    if (!store) throw new Error('store مطلوب');
    this.store = store;
    this.now = now;
    this.locks = new Map(); // uid -> Promise (تسلسل الكتابات لكل حساب)
  }

  // ---- قفل تسلسلي لكل uid: لا سباق بين كتابتين على نفس المستند
  async _tx(uid, fn) {
    if (!uid || typeof uid !== 'string') throw new ValidationError('invalid_uid');
    const prev = this.locks.get(uid) || Promise.resolve();
    let release;
    const mine = new Promise((r) => { release = r; });
    this.locks.set(uid, prev.then(() => mine));
    await prev;
    try {
      const doc = (await this.store.load(uid)) || emptyDoc();
      const res = await fn(doc);
      return res;
    } finally {
      release();
    }
  }

  async _commit(uid, doc, baseRev) {
    doc.rev = (doc.rev || 0) + 1;
    doc.updatedAt = this.now();
    if (doc.history.length > MAX_HISTORY) doc.history = doc.history.slice(-MAX_HISTORY);
    await this.store.save(uid, doc);
    return doc.rev;
  }

  _effective(doc, tag, key) {
    const ov = doc.config[tag] && doc.config[tag][key];
    if (ov !== undefined) return clone(ov);
    return clone(fieldOf(tag, key).default);
  }

  _setKey(doc, tag, key, value) {
    const f = fieldOf(tag, key);
    if (sameValue(value, f.default)) { if (doc.config[tag]) { delete doc.config[tag][key]; if (!Object.keys(doc.config[tag]).length) delete doc.config[tag]; } return; }
    if (!doc.config[tag]) doc.config[tag] = {};
    doc.config[tag][key] = clone(value);
  }

  _log(doc, entry) { doc.history.push({ id: newId(this.now), ts: this.now(), appliesFrom: 'next-round', ...entry }); }

  // ---------------------------------------------------------------- القراءة
  async getState(uid) {
    return this._tx(uid, async (doc) => ({ ...clone(doc), history: undefined }));
  }

  async overlay(uid) {
    return this._tx(uid, async (doc) => ({ rev: doc.rev, config: clone(doc.config) }));
  }

  // لقطة ثابتة لراوند: دمج الافتراضي + تخصيص هذا الستريمر، تُنسخ نسخة مستقلة (لا تتأثر بتعديل لاحق)
  async resolveRound(uid, tag) {
    return this._tx(uid, async (doc) => {
      const values = defaultsOf(tag);
      Object.assign(values, clone(doc.config[tag] || {}));
      return Object.freeze({ tag, rev: doc.rev, at: this.now(), values: Object.freeze(values) });
    });
  }

  async history(uid, { tag, limit = 100 } = {}) {
    return this._tx(uid, async (doc) => {
      let h = doc.history;
      if (tag) h = h.filter((e) => e.tag === tag);
      return clone(h.slice(-Math.min(Math.max(1, limit), MAX_HISTORY)).reverse());
    });
  }

  // ---------------------------------------------------------------- الكتابة
  async applyChanges(uid, tag, values, { source = 'manual', presetId = null, presetName = null, baseRev = null } = {}) {
    const clean = validateValues(tag, values);
    return this._tx(uid, async (doc) => {
      if (baseRev != null && baseRev !== doc.rev) throw new ConflictError(doc.rev);
      const changes = [];
      for (const [key, nv] of Object.entries(clean)) {
        const ov = this._effective(doc, tag, key);
        if (sameValue(ov, nv)) continue;
        this._setKey(doc, tag, key, nv);
        const entry = { tag, key, old: ov, new: clone(nv), source, status: 'saved' };
        if (presetId) { entry.presetId = presetId; entry.preset = presetName; }
        this._log(doc, entry);
        changes.push(entry);
      }
      if (!changes.length) return { rev: doc.rev, changes: [] };
      const rev = await this._commit(uid, doc);
      return { rev, changes };
    });
  }

  async resetKey(uid, tag, key, { baseRev = null } = {}) {
    const f = fieldOf(tag, key);
    return this._tx(uid, async (doc) => {
      if (baseRev != null && baseRev !== doc.rev) throw new ConflictError(doc.rev);
      const ov = this._effective(doc, tag, key);
      if (sameValue(ov, f.default)) return { rev: doc.rev, changes: [] };
      this._setKey(doc, tag, key, f.default);
      const e = { tag, key, old: ov, new: clone(f.default), source: 'reset', status: 'reset' };
      this._log(doc, e);
      return { rev: await this._commit(uid, doc), changes: [e] };
    });
  }

  async resetGame(uid, tag, { baseRev = null, source = 'reset' } = {}) {
    if (!GAMES[tag]) throw new ValidationError('unknown_game', { tag });
    return this._tx(uid, async (doc) => {
      if (baseRev != null && baseRev !== doc.rev) throw new ConflictError(doc.rev);
      const changes = [];
      for (const f of GAMES[tag].fields) {
        const ov = this._effective(doc, tag, f.key);
        if (sameValue(ov, f.default)) continue;
        this._setKey(doc, tag, f.key, f.default);
        const e = { tag, key: f.key, old: ov, new: clone(f.default), source, status: 'reset' };
        this._log(doc, e); changes.push(e);
      }
      if (!changes.length) return { rev: doc.rev, changes: [] };
      return { rev: await this._commit(uid, doc), changes };
    });
  }

  // ---------------------------------------------------------------- المجموعات المحفوظة (Presets)
  async createPreset(uid, tag, name, values = null) {
    if (!GAMES[tag]) throw new ValidationError('unknown_game', { tag });
    const nm = validateName(name);
    const clean = values == null ? null : validateValues(tag, values);
    return this._tx(uid, async (doc) => {
      const mine = Object.values(doc.presets).filter((p) => p.tag === tag);
      if (mine.length >= MAX_PRESETS_PER_GAME) throw new ValidationError('too_many_presets');
      if (mine.some((p) => p.name.toLowerCase() === nm.toLowerCase())) throw new ValidationError('duplicate_name');
      const snapshot = clean || clone(doc.config[tag] || {});
      const p = { id: newId(this.now), tag, name: nm, values: snapshot, createdAt: this.now(), updatedAt: this.now() };
      doc.presets[p.id] = p;
      await this._commit(uid, doc);
      return clone(p);
    });
  }

  async updatePreset(uid, id, { name, values } = {}) {
    return this._tx(uid, async (doc) => {
      const p = doc.presets[id];
      if (!p) throw new NotFoundError('preset');
      if (name !== undefined) {
        const nm = validateName(name);
        if (Object.values(doc.presets).some((q) => q.id !== id && q.tag === p.tag && q.name.toLowerCase() === nm.toLowerCase())) throw new ValidationError('duplicate_name');
        p.name = nm;
      }
      if (values !== undefined) p.values = validateValues(p.tag, values);
      p.updatedAt = this.now();
      await this._commit(uid, doc);
      return clone(p);
    });
  }

  async duplicatePreset(uid, id) {
    return this._tx(uid, async (doc) => {
      const p = doc.presets[id];
      if (!p) throw new NotFoundError('preset');
      const mine = Object.values(doc.presets).filter((q) => q.tag === p.tag);
      if (mine.length >= MAX_PRESETS_PER_GAME) throw new ValidationError('too_many_presets');
      let nm = p.name + ' COPY'; let i = 2;
      while (mine.some((q) => q.name.toLowerCase() === nm.toLowerCase())) nm = p.name + ' COPY ' + (i++);
      const c = { id: newId(this.now), tag: p.tag, name: nm.slice(0, 40), values: clone(p.values), createdAt: this.now(), updatedAt: this.now() };
      doc.presets[c.id] = c;
      await this._commit(uid, doc);
      return clone(c);
    });
  }

  async deletePreset(uid, id) {
    return this._tx(uid, async (doc) => {
      const p = doc.presets[id];
      if (!p) throw new NotFoundError('preset');
      delete doc.presets[id];
      if (doc.defaultPresets[p.tag] === id) delete doc.defaultPresets[p.tag];
      await this._commit(uid, doc);
      return { ok: true };
    });
  }

  async setDefaultPreset(uid, id) {
    return this._tx(uid, async (doc) => {
      const p = doc.presets[id];
      if (!p) throw new NotFoundError('preset');
      doc.defaultPresets[p.tag] = id;
      await this._commit(uid, doc);
      return { ok: true, tag: p.tag, id };
    });
  }

  // تطبيق مجموعة على لعبتها فقط: قيم المجموعة تصير هي التخصيص (المفاتيح غير المذكورة ترجع للافتراضي)
  async applyPreset(uid, id, { baseRev = null } = {}) {
    return this._tx(uid, async (doc) => {
      const p = doc.presets[id];
      if (!p) throw new NotFoundError('preset');
      if (baseRev != null && baseRev !== doc.rev) throw new ConflictError(doc.rev);
      const tag = p.tag;
      const target = { ...defaultsOf(tag), ...clone(p.values) };
      const changes = [];
      for (const f of GAMES[tag].fields) {
        const ov = this._effective(doc, tag, f.key);
        const nv = target[f.key];
        if (sameValue(ov, nv)) continue;
        this._setKey(doc, tag, f.key, nv);
        const e = { tag, key: f.key, old: ov, new: clone(nv), source: 'preset', status: 'saved', presetId: p.id, preset: p.name };
        this._log(doc, e); changes.push(e);
      }
      if (!changes.length) return { rev: doc.rev, changes: [] };
      return { rev: await this._commit(uid, doc), changes };
    });
  }

  // ---------------------------------------------------------------- التراجع
  // يرجّع إعداداً واحداً لقيمته القديمة في سجل معيّن. لا يلمس جولات انتهت: الإعداد يُقرأ عند بداية الراوند فقط.
  async revertEntry(uid, entryId, { baseRev = null } = {}) {
    return this._tx(uid, async (doc) => {
      if (baseRev != null && baseRev !== doc.rev) throw new ConflictError(doc.rev);
      const e = doc.history.find((x) => x.id === entryId);
      if (!e) throw new NotFoundError('history');
      if (e.status === 'reverted-entry') throw new ValidationError('already_reverted');
      const f = fieldOf(e.tag, e.key);
      const old = validateValue(f, e.old);
      const cur = this._effective(doc, e.tag, e.key);
      if (sameValue(cur, old)) return { rev: doc.rev, changes: [] };
      this._setKey(doc, e.tag, e.key, old);
      e.reverted = true;
      const ne = { tag: e.tag, key: e.key, old: cur, new: clone(old), source: 'revert', status: 'reverted', revertOf: e.id };
      this._log(doc, ne);
      return { rev: await this._commit(uid, doc), changes: [ne] };
    });
  }
}
