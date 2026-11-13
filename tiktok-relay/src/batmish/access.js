'use strict';
// بوابة وصول BATMISH (الخادم هو المرجع الوحيد؛ إخفاء الزر في الواجهة ليس حماية).
// الشرطان معاً:
//   1) هوية الحساب: uid التوكن يطابق uid المثبَّت للستريمر _zvd4 (تثبيت من المالك أو متغيّر بيئة).
//      سبب التثبيت: أي مستخدم يقدر يتصل بجسر البث بيوزر _zvd4 كمشاهد، فاتصاله لا يثبت أنه صاحب الحساب.
//   2) ربط البث الآن: جلسة جسر مفتوحة ومصادَقة (توكن Firebase) لنفس الـuid على غرفة _zvd4 (مفتوحة فعلاً).
import { normalizeTikTokUsername } from '../normalize.js';
import { STREAMER_ID } from './schema.js';

export class BatmishAccess {
  constructor({ store, streamerId = STREAMER_ID, envPinUid = '', autoClaim = false, log = () => {} } = {}) {
    this.store = store;
    this.streamerId = streamerId;
    this.envPinUid = envPinUid || '';
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

  hasLiveSession(uid) {
    for (const s of this.sessions) {
      if (s.uid === uid && s.uniqueId === this.streamerId && (s.ws.readyState === undefined || s.ws.readyState === 1)) return true;
    }
    return false;
  }

  async pinnedUid() {
    if (this.envPinUid) return this.envPinUid;
    const p = await this.store.getPin();
    return p && p.uid ? p.uid : '';
  }

  async check(uid) {
    if (!uid) return { allowed: false, reason: 'unauthenticated' };
    let pin = await this.pinnedUid();
    if (!pin && this.autoClaim && this.hasLiveSession(uid)) {
      await this.store.setPin({ uid, at: Date.now(), by: 'autoclaim' });
      this.log('warn', 'batmish_autoclaim', { uid });
      pin = uid;
    }
    if (!pin) return { allowed: false, reason: 'not_bound' };
    if (pin !== uid) return { allowed: false, reason: 'not_streamer' };
    if (!this.hasLiveSession(uid)) return { allowed: false, reason: 'not_linked' };
    return { allowed: true, reason: 'ok' };
  }

  async bind(uid, by) {
    if (!uid || typeof uid !== 'string') throw new Error('uid مطلوب');
    await this.store.setPin({ uid, at: Date.now(), by: by || 'owner' });
    this._notify(uid);
  }
  async unbind() { await this.store.setPin(null); }
}
