'use strict';
// بوابة وصول BATMISH (الخادم هو المرجع الوحيد؛ إخفاء الزر في الواجهة ليس حماية).
// الشرطان معاً:
//   1) هوية الحساب: uid التوكن يطابق uid المثبَّت للستريمر _zvd4 (تثبيت من المالك أو متغيّر بيئة).
//      سبب التثبيت: أي مستخدم يقدر يتصل بجسر البث بيوزر _zvd4 كمشاهد، فاتصاله لا يثبت أنه صاحب الحساب.
//   2) ربط البث الآن: جلسة جسر مفتوحة ومصادَقة (توكن Firebase) لنفس الـuid على غرفة _zvd4 (مفتوحة فعلاً).
import { normalizeTikTokUsername } from '../normalize.js';
import { STREAMER_ID, STREAMERS, SITE_USERS, OWNER_DISPLAY } from './schema.js';

export class BatmishAccess {
  constructor({ store, streamerId = STREAMER_ID, streamers = STREAMERS, siteUsers = SITE_USERS, resolveUid = null, ownerEmail = '', envPinUid = '', envPins = {}, autoClaim = false, log = () => {} } = {}) {
    this.store = store;
    this.streamerId = streamerId;
    this.streamers = streamers.includes(streamerId) ? streamers : [streamerId, ...streamers];
    this.envPins = { ...envPins }; if (envPinUid) this.envPins[streamerId] = envPinUid;
    this.envPinUid = envPinUid || '';
    this.ownerEmail = String(ownerEmail || '').toLowerCase();
    this.siteUsers = Array.isArray(siteUsers) ? Object.fromEntries(siteUsers.map((n) => [n, streamerId])) : { ...siteUsers }; this.resolveUid = resolveUid; this._siteCache = new Map();
    this.autoClaim = !!autoClaim;
    this.log = log;
    this.sessions = new Set(); // { uid, uniqueId, ws }
    this.listeners = new Set();
  }

  // يُستدعى من الجسر عند اتصال WS مصادَق. يرجّع دالة إلغاء.
  registerSession(uid, rawUniqueId, ws) {
    let uniqueId = '';
    try { uniqueId = normalizeTikTokUsername(rawUniqueId); } catch (e) { return () => {}; }
    const s = { uid, uniqueId, ws };
    this.sessions.add(s);
    const off = () => { if (this.sessions.delete(s)) this._notify(uid); };
    try { ws.on('close', off); ws.on('error', off); } catch (e) { /* ws وهمي */ }
    this._notify(uid);
    return off;
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _notify(uid) { for (const f of this.listeners) { try { f(uid); } catch (e) { /* ignore */ } } }

  hasLiveSession(uid, sid = this.streamerId) {
    for (const s of this.sessions) {
      if (s.uid === uid && s.uniqueId === sid && (s.ws.readyState === undefined || s.ws.readyState === 1)) return true;
    }
    return false;
  }

  async pinnedUid(sid = this.streamerId) {
    if (this.envPins[sid]) return this.envPins[sid];
    const p = await this.store.getPin(sid);
    return p && p.uid ? p.uid : '';
  }

  // هل uid هو حساب احسمها المسمّى (مثل mish)؟ التحقق من الخادم عبر سجل أسماء المستخدمين، مع كاش قصير.
  async siteUserOf(uid) {
    if (!this.resolveUid) return '';
    for (const name of Object.keys(this.siteUsers)) {
      const c = this._siteCache.get(name);
      let u;
      if (c && Date.now() - c.at < 60000) u = c.uid;
      else { try { u = String((await this.resolveUid(name)) || ''); } catch (e) { u = (c && c.uid) || ''; } this._siteCache.set(name, { uid: u, at: Date.now() }); }
      if (u && u === uid) return name;
    }
    return '';
  }

  // ctx.email: بريد الحساب من توكن Firebase المتحقَّق منه في الخادم (لا من الواجهة)
  async check(uid, ctx = {}) {
    if (!uid) return { allowed: false, reason: 'unauthenticated' };
    if (this.ownerEmail && String((ctx && ctx.email) || '').toLowerCase() === this.ownerEmail) return { allowed: true, reason: 'ok', streamerId: OWNER_DISPLAY, via: 'account' };
    const su = await this.siteUserOf(uid);
    if (su) return { allowed: true, reason: 'ok', streamerId: this.siteUsers[su] || this.streamerId, via: 'account' };   // حساب الموقع mish = نفس الشخص صاحب بث _zvd4
    let pin = await this.pinnedUid();
    if (!pin && this.autoClaim && this.hasLiveSession(uid)) {
      await this.store.setPin({ uid, at: Date.now(), by: 'autoclaim' });
      this.log('warn', 'batmish_autoclaim', { uid });
      pin = uid;
    }
    // أي ستريمر مسموح مثبَّت عليه هذا الحساب؟ (التثبيت يخص ستريمراً واحداً، والبث المربوط لازم يكون باسمه)
    let anyPin = !!pin, matched = '';
    for (const sid of this.streamers) {
      const p = sid === this.streamerId ? pin : await this.pinnedUid(sid);
      if (p) anyPin = true;
      if (p === uid) { matched = matched || sid; if (this.hasLiveSession(uid, sid)) return { allowed: true, reason: 'ok', streamerId: sid, via: 'stream' }; }
    }
    if (!anyPin) return { allowed: false, reason: 'not_bound' };
    if (!matched) return { allowed: false, reason: 'not_streamer' };
    return { allowed: false, reason: 'not_linked' };
  }

  async bind(uid, by, sid = this.streamerId) {
    if (!uid || typeof uid !== 'string') throw new Error('uid مطلوب');
    if (!this.streamers.includes(sid)) throw new Error('ستريمر غير مسموح');
    await this.store.setPin({ uid, at: Date.now(), by: by || 'owner' }, sid);
    this._notify(uid);
  }
  async unbind(sid = this.streamerId) { if (!this.streamers.includes(sid)) throw new Error('ستريمر غير مسموح'); await this.store.setPin(null, sid); }
}
