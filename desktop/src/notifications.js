'use strict';

/**
 * مدير إشعارات ويندوز: يقرر هل يُعرض إشعار نظام، ويمنع التكرار، ويحدّ المعدل،
 * ويحترم إعدادات المستخدم. المصدر (page-bridge) موثوق فقط من مستندات يملك
 * صلاحية الكتابة عليها حساب المالك (انظر AUDIT.md §4).
 *
 * الاعتماديات تُحقن (NotificationClass/getWindowState/onClick) ليسهل الاختبار
 * بدون Electron.
 */

const KIND_TO_SETTING = Object.freeze({
  broadcast: 'events',
  'new-game': 'newGame',
  event: 'events',
  streamer: 'streamer',
  update: 'updates',
  account: 'account',
  personal: 'account',
});

// نوع => نص عام يظهر على شاشة القفل بدل المحتوى الحساس.
const PRIVATE_BODY = Object.freeze({ personal: 'لديك رسالة جديدة في احسمها', account: 'لديك إشعار جديد على حسابك' });

const MAX_AGE_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 5;
const SEEN_MAX = 300;

function clean(str, max) {
  return String(str == null ? '' : str)
    .replace(/[\u0000-\u001F\u007F‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

class NotificationManager {
  /**
   * @param {object} d
   * @param {() => object} d.getSettings          يرجع settings.notif
   * @param {() => ({visible:boolean, focused:boolean, minimized:boolean, inTray:boolean})} d.getWindowState
   * @param {Function} d.NotificationClass        Electron Notification (أو وهمي)
   * @param {(target:string) => void} d.onClick   يفتح النافذة ويوجّه للوجهة
   * @param {{get:Function,set:Function}} [d.store] تخزين مفاتيح التكرار
   * @param {() => number} [d.now]
   * @param {string} [d.icon]
   * @param {(m:string)=>void} [d.log]
   */
  constructor(d) {
    Object.assign(this, { now: Date.now, log: () => {}, store: null, icon: undefined }, d);
    this.recent = [];
    const saved = this.store ? this.store.get('notifSeen', []) : [];
    this.seen = new Set(Array.isArray(saved) ? saved.slice(-SEEN_MAX) : []);
    this.active = new Set(); // نحتفظ بمراجع الإشعارات الظاهرة حتى لا تُجمَع من GC فتفقد click
  }

  _remember(key) {
    this.seen.add(key);
    if (this.seen.size > SEEN_MAX) this.seen.delete(this.seen.values().next().value);
    if (this.store) this.store.set('notifSeen', [...this.seen]);
  }

  /**
   * @param {{kind:string,id:string,title:string,body?:string,target?:string,sentAt?:number}} ev
   * @returns {{shown:boolean, reason:string, windowState?:string}}
   */
  handle(ev) {
    if (!ev || typeof ev !== 'object') return { shown: false, reason: 'invalid' };
    const kind = String(ev.kind || '');
    const settingKey = KIND_TO_SETTING[kind];
    if (!settingKey) return { shown: false, reason: 'unknown-kind' };
    const id = clean(ev.id, 120);
    if (!id) return { shown: false, reason: 'no-id' };
    const title = clean(ev.title, 80);
    if (!title) return { shown: false, reason: 'no-title' };

    const settings = this.getSettings() || {};
    if (!settings.enabled) return { shown: false, reason: 'disabled' };
    if (!settings[settingKey]) return { shown: false, reason: 'category-disabled' };

    const sentAt = Number(ev.sentAt);
    if (Number.isFinite(sentAt) && sentAt > 0 && this.now() - sentAt > MAX_AGE_MS) return { shown: false, reason: 'stale' };

    const key = kind + ':' + id;
    if (this.seen.has(key)) return { shown: false, reason: 'duplicate' };

    const ws = this.getWindowState();
    this._remember(key); // نسجّله حتى لو كانت النافذة بالواجهة: لا نكرر لاحقاً
    if (ws.visible && ws.focused && !ws.minimized) {
      // المستخدم يرى التطبيق الآن؛ الواجهة نفسها تعرض الرسالة. لا نزعجه بإشعار نظام.
      return { shown: false, reason: 'window-focused' };
    }

    const t = this.now();
    this.recent = this.recent.filter((x) => t - x < RATE_WINDOW_MS);
    if (this.recent.length >= RATE_MAX) return { shown: false, reason: 'rate-limited' };

    if (!this.NotificationClass || (this.NotificationClass.isSupported && !this.NotificationClass.isSupported())) {
      return { shown: false, reason: 'unsupported' };
    }
    const body = PRIVATE_BODY[kind] || clean(ev.body, 200);
    let n;
    try {
      n = new this.NotificationClass({ title, body, icon: this.icon, silent: !settings.sound, timeoutType: 'default' });
    } catch (e) {
      this.log('تعذّر إنشاء الإشعار: ' + (e && e.message));
      return { shown: false, reason: 'error' };
    }
    this.recent.push(t);
    this.active.add(n);
    const target = ev.target;
    n.on('click', () => { this.active.delete(n); try { this.onClick(target); } catch (e) { this.log('click: ' + (e && e.message)); } });
    n.on('close', () => this.active.delete(n));
    n.on('failed', (_e, err) => { this.active.delete(n); this.log('فشل الإشعار: ' + err); });
    n.show();
    return { shown: true, reason: 'ok', windowState: ws.minimized ? 'minimized' : (!ws.visible ? (ws.inTray ? 'tray' : 'hidden') : 'background') };
  }
}

module.exports = { NotificationManager, KIND_TO_SETTING, clean };
