// التحكم بتطبيق احسمها لويندوز من لوحة المالك: إحصاءات (التثبيتات/المتصلون الآن/التحميلات)،
// إشعار يُرسل للتطبيق فقط، وإعدادات عن بُعد. الحالة الدائمة بـRTDB عبر admin؛ الحضور بالذاكرة (اتصال WebSocket حيّ).
//
// الأمان: العميل (التطبيق) مجهول: installId عشوائي لا يرتبط بحساب، يُسجَّل مع الإصدار والمنصة فقط.
// كل أوامر المالك (إحصاءات/إشعار/إعدادات) تتطلب ID Token لحساب المالك (بريده) وتُفحص بالخادم.
import { WebSocketServer } from 'ws';

export const OWNER_EMAIL = 'malshaifan1@gmail.com';
const ONLINE_MS = 3 * 60 * 1000;
const NOTIFY_KEEP_MS = 10 * 60 * 1000;
const INSTALL_ID_RE = /^[a-f0-9]{32}$/;
const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

export const DEFAULT_CONFIG = Object.freeze({
  motd: { text: '', id: '', active: false },     // رسالة تظهر داخل التطبيق
  minVersion: '',                                  // أقل إصدار مسموح (فارغ = لا إلزام)
  notificationsEnabled: true,                      // السماح بدفع إشعارات المالك للتطبيق
  codeLoginEnabled: true,                          // إظهار «الدخول برمز احسمها»
});

function cmpVer(a, b) {
  const pa = String(a).split('.').map(Number); const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}

export function sanitizeConfig(input, prev = DEFAULT_CONFIG) {
  const c = JSON.parse(JSON.stringify(prev));
  if (!input || typeof input !== 'object') return c;
  if (input.motd && typeof input.motd === 'object') {
    const text = String(input.motd.text || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 300);
    c.motd = { text, active: !!input.motd.active && !!text, id: String(input.motd.id || Date.now()).slice(0, 40) };
  }
  if (typeof input.minVersion === 'string') c.minVersion = VERSION_RE.test(input.minVersion.trim()) ? input.minVersion.trim() : '';
  if (typeof input.notificationsEnabled === 'boolean') c.notificationsEnabled = input.notificationsEnabled;
  if (typeof input.codeLoginEnabled === 'boolean') c.codeLoginEnabled = input.codeLoginEnabled;
  return c;
}

export function sanitizeNotification(input) {
  const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const title = clean(input && input.title, 80); const body = clean(input && input.body, 240);
  if (!title) return null;
  const target = ['home', 'store', 'profile', 'levels', 'leaderboard', 'frames'].includes(input && input.target) ? input.target : 'home';
  return { title, body, target };
}

export class AppControlService {
  /**
   * @param {{ store?: {get:(p:string)=>Promise<any>, set:(p:string,v:any)=>Promise<void>}, fetchDownloads?: ()=>Promise<{total:number, releases:{tag:string,count:number}[]}>, now?: ()=>number, log?: Function }} d
   */
  constructor({ store = null, fetchDownloads = async () => ({ total: 0, releases: [] }), now = Date.now, log = () => {} } = {}) {
    this.store = store; this.fetchDownloads = fetchDownloads; this.now = now; this.log = log;
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    this.installs = new Map(); // id -> { first, last, v, p }
    this.online = new Map();   // id -> { ws, v, p, since }
    this.lastNotify = null;    // { id, ts, msg }
    this.sent = [];            // سجل آخر الإشعارات المرسلة
    this.dl = { at: 0, val: { total: 0, releases: [] } };
    this.dirty = new Set();
  }

  async load() {
    if (!this.store) return;
    try { const c = await this.store.get('appControl/config'); if (c) this.config = sanitizeConfig(c); } catch (e) { this.log('warn', 'appctl_load_config_failed', { m: e && e.message }); }
    try {
      const all = await this.store.get('appControl/installs');
      if (all) for (const [id, v] of Object.entries(all)) if (INSTALL_ID_RE.test(id)) this.installs.set(id, { first: +v.first || 0, last: +v.last || 0, v: String(v.v || ''), p: String(v.p || '') });
    } catch (e) { this.log('warn', 'appctl_load_installs_failed', { m: e && e.message }); }
  }

  /** يُسجَّل التثبيت/النشاط. يُحفظ دائماً عند أول ظهور ثم كل 6 ساعات كحد أقصى. */
  registerHello({ installId, version, platform }) {
    if (!INSTALL_ID_RE.test(String(installId || ''))) return null;
    const v = VERSION_RE.test(String(version || '')) ? version : ''; const p = platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : platform === 'linux' ? 'linux' : '';
    const t = this.now(); const cur = this.installs.get(installId);
    const rec = cur ? { ...cur, last: t, v: v || cur.v, p: p || cur.p } : { first: t, last: t, v, p };
    this.installs.set(installId, rec);
    if (!cur || t - (cur.last || 0) > 6 * 3600e3 || cur.v !== rec.v) this._persist(installId, rec);
    return rec;
  }

  _persist(id, rec) { if (!this.store) return; this.store.set('appControl/installs/' + id, rec).catch((e) => this.log('warn', 'appctl_persist_failed', { m: e && e.message })); }

  connected(installId, ws, meta) { this.online.set(installId, { ws, v: meta.version || '', p: meta.platform || '', since: this.now() }); }
  disconnected(installId, ws) { const o = this.online.get(installId); if (o && o.ws === ws) this.online.delete(installId); }

  async stats() {
    const t = this.now();
    let total = this.installs.size, a24 = 0, a7 = 0; const byVersion = {}; const byPlatform = {};
    for (const r of this.installs.values()) {
      if (t - r.last < 24 * 3600e3) a24++; if (t - r.last < 7 * 24 * 3600e3) a7++;
      if (r.v) byVersion[r.v] = (byVersion[r.v] || 0) + 1; if (r.p) byPlatform[r.p] = (byPlatform[r.p] || 0) + 1;
    }
    const onlineVersions = {};
    for (const o of this.online.values()) if (o.v) onlineVersions[o.v] = (onlineVersions[o.v] || 0) + 1;
    if (t - this.dl.at > 10 * 60 * 1000) { try { this.dl = { at: t, val: await this.fetchDownloads() }; } catch (e) { this.dl.at = t - 9 * 60 * 1000; } }
    return { installs: total, onlineNow: this.online.size, active24h: a24, active7d: a7, byVersion, byPlatform, onlineVersions, downloads: this.dl.val, config: this.config, lastNotification: this.sent[0] || null, sent: this.sent.slice(0, 10), asOf: t };
  }

  getConfig() { return this.config; }
  async setConfig(input) {
    this.config = sanitizeConfig(input, this.config);
    if (this.store) { try { await this.store.set('appControl/config', this.config); } catch (e) { this.log('warn', 'appctl_save_config_failed', { m: e && e.message }); } }
    return this.config;
  }

  /** @returns {{ok:true, id:string, delivered:number}|{ok:false, error:string}} */
  notify(input, push) {
    const msg = sanitizeNotification(input); if (!msg) return { ok: false, error: 'invalid_notification' };
    const id = 'n' + this.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const full = { type: 'notify', id, ...msg, sentAt: this.now() };
    this.lastNotify = { ts: this.now(), msg: full };
    const delivered = push(full);
    this.sent.unshift({ id, title: msg.title, body: msg.body, at: this.now(), delivered });
    this.sent.length = Math.min(this.sent.length, 30);
    return { ok: true, id, delivered };
  }

  /** رسائل تُرسل للعميل عند اتصاله: الإعدادات + آخر إشعار (إن كان حديثاً). */
  welcome(installId) {
    const out = [{ type: 'config', config: this.config, minVersionOk: true }];
    if (this.lastNotify && this.now() - this.lastNotify.ts < NOTIFY_KEEP_MS) out.push(this.lastNotify.msg);
    return out;
  }
}

/** جلسات التطبيق (WebSocket مجهول): hello ثم دفع الإعدادات والإشعارات. */
export class AppLinkHub {
  constructor({ service, log = () => {} }) {
    this.service = service; this.log = log;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  }
  broadcast(msg) {
    let n = 0; const data = JSON.stringify(msg);
    if (!this.service.config.notificationsEnabled && msg.type === 'notify') return 0;
    for (const o of this.service.online.values()) if (o.ws.readyState === 1) { try { o.ws.send(data); n++; } catch (e) { /* */ } }
    return n;
  }
  broadcastConfig() { const data = JSON.stringify({ type: 'config', config: this.service.config }); for (const o of this.service.online.values()) if (o.ws.readyState === 1) { try { o.ws.send(data); } catch (e) { /* */ } } }
  handleUpgrade(req, socket, head) {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      let id = null; const timer = setTimeout(() => ws.close(4001, 'hello timeout'), 10000);
      ws.on('message', (raw) => {
        if (id) return;
        let m; try { m = JSON.parse(String(raw)); } catch (e) { return ws.close(4002, 'bad'); }
        if (!m || m.type !== 'hello') return ws.close(4002, 'bad');
        const rec = this.service.registerHello(m); if (!rec) return ws.close(4003, 'bad id');
        clearTimeout(timer); id = m.installId;
        const prev = this.service.online.get(id); if (prev) { try { prev.ws.close(4004, 'replaced'); } catch (e) { /* */ } }
        this.service.connected(id, ws, { version: rec.v, platform: rec.p });
        for (const w of this.service.welcome(id)) { if (w.type === 'notify' && !this.service.config.notificationsEnabled) continue; ws.send(JSON.stringify(w)); }
      });
      const ping = setInterval(() => { try { ws.ping(); } catch (e) { /* */ } }, 25000);
      ws.on('close', () => { clearTimeout(timer); clearInterval(ping); if (id) this.service.disconnected(id, ws); });
      ws.on('error', () => {});
    });
  }
}

export function createDownloadsFetcher(fetchImpl = fetch, repo = 'rm70n/ehsmaha') {
  return async () => {
    const r = await fetchImpl('https://api.github.com/repos/' + repo + '/releases?per_page=30', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ehsmaha-relay' } });
    if (!r.ok) throw new Error('github ' + r.status);
    const rels = await r.json(); const releases = []; let total = 0;
    for (const rel of rels) {
      const n = (rel.assets || []).filter((a) => /^ehsmaha-setup\.exe$/.test(a.name)).reduce((s, a) => s + (a.download_count || 0), 0);
      if (n || /^v\d/.test(rel.tag_name)) releases.push({ tag: rel.tag_name, count: n }); total += n;
    }
    return { total, releases };
  };
}
export { cmpVer };
