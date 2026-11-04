// رمز ربط تطبيق احسمها لويندوز: مستخدم مسجّل دخوله في الموقع (المتصفح) يطلب رمزاً قصيراً،
// يكتبه في التطبيق، فيستلم التطبيق Custom Token ويدخل بنفس حسابه.
//
// الأمان: الرمز لا يُنشأ إلا لمن يحمل Firebase ID Token صالحاً (verifyToken)؛ ثماني خانات
// من أبجدية بلا حروف ملتبسة (~8.5 تريليون احتمال)، صلاحية دقيقتين، استخدام واحد، حد لإصدار
// الرموز لكل حساب، وحد صارم للمحاولات الفاشلة لكل IP وعلى مستوى الخدمة كلها.
// الرموز بالذاكرة فقط (لا تُخزَّن ولا تُسجَّل).
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 8;
export const CODE_TTL_MS = 2 * 60 * 1000;

export function normalizeCode(input) {
  return String(input == null ? '' : input).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function newCode() {
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

class Window {
  constructor(max, ms, now) { this.max = max; this.ms = ms; this.now = now; this.hits = []; }
  count() { const t = this.now(); this.hits = this.hits.filter((x) => t - x < this.ms); return this.hits.length; }
  full() { return this.count() >= this.max; }
  add() { this.hits.push(this.now()); }
}

export class DesktopAuthService {
  /** @param {{ createCustomToken:(uid:string)=>Promise<string>, now?:()=>number }} d */
  constructor({ createCustomToken, resolveUid = async () => null, push = () => 0, now = Date.now } = {}) {
    this.createCustomToken = createCustomToken;
    this.resolveUid = resolveUid; // usernameLower -> uid | null
    this.push = push;             // (uid, msg) -> عدد الجلسات التي وصلتها الرسالة
    this.reqByIp = new Map();
    this.reqByName = new Map();
    this.now = now;
    this.codes = new Map(); // code -> { uid, exp }
    this.issueByUid = new Map();
    this.failByIp = new Map();
    this.failGlobal = new Window(60, 60 * 1000, now);
  }

  _win(map, key, max, ms) {
    let w = map.get(key);
    if (!w) { w = new Window(max, ms, this.now); map.set(key, w); if (map.size > 5000) map.delete(map.keys().next().value); }
    return w;
  }

  _sweep() { const t = this.now(); for (const [c, v] of this.codes) if (v.exp <= t) this.codes.delete(c); }

  /** @returns {{ok:true, code:string, expiresInSec:number}|{ok:false, error:string}} */
  issue(uid, { skipLimit = false } = {}) {
    if (!uid) return { ok: false, error: 'unauthorized' };
    if (!skipLimit) {
      const w = this._win(this.issueByUid, uid, 5, 60 * 1000);
      if (w.full()) return { ok: false, error: 'rate_limited' };
      w.add();
    }
    this._sweep();
    for (const [c, v] of this.codes) if (v.uid === uid) this.codes.delete(c); // رمز واحد فعّال لكل حساب
    let code; do { code = newCode(); } while (this.codes.has(code));
    this.codes.set(code, { uid, exp: this.now() + CODE_TTL_MS });
    return { ok: true, code, expiresInSec: Math.round(CODE_TTL_MS / 1000) };
  }

  /**
   * التطبيق يرسل اليوزر فقط؛ الرمز يُدفع إلى جلسات الموقع المفتوحة لهذا الحساب (لا يعود للمُرسِل أبداً).
   * @returns {Promise<{ok:true, delivered:boolean, expiresInSec?:number}|{ok:false, error:string}>}
   */
  async requestByUsername(rawName, ip) {
    const name = String(rawName == null ? '' : rawName).trim().replace(/^@/, '').toLowerCase();
    if (!/^[\p{L}\p{N}_.\-]{2,32}$/u.test(name)) return { ok: false, error: 'invalid_username' };
    const wi = this._win(this.reqByIp, String(ip || 'unknown'), 6, 60 * 1000);
    const wn = this._win(this.reqByName, name, 3, 60 * 1000);
    if (wi.full() || wn.full()) return { ok: false, error: 'rate_limited' };
    wi.add(); wn.add();
    let uid = null;
    try { uid = await this.resolveUid(name); } catch (e) { return { ok: false, error: 'internal' }; }
    if (!uid) return { ok: true, delivered: false }; // لا نكشف وجود الحساب
    const r = this.issue(uid, { skipLimit: true });
    const delivered = this.push(uid, { type: 'code', code: r.code, expiresInSec: r.expiresInSec }) > 0;
    if (!delivered) this.codes.delete(r.code); // لا جلسة لتستلمه: لا نترك رمزاً معلّقاً
    return { ok: true, delivered, expiresInSec: delivered ? r.expiresInSec : undefined };
  }

  /** @returns {Promise<{ok:true, customToken:string}|{ok:false, error:string}>} */
  async redeem(rawCode, ip) {
    const fw = this._win(this.failByIp, String(ip || 'unknown'), 8, 5 * 60 * 1000);
    if (fw.full() || this.failGlobal.full()) return { ok: false, error: 'rate_limited' };
    const code = normalizeCode(rawCode);
    this._sweep();
    const entry = code.length === CODE_LEN ? this.codes.get(code) : null;
    if (!entry || entry.exp <= this.now()) { fw.add(); this.failGlobal.add(); return { ok: false, error: 'invalid_code' }; }
    this.codes.delete(code); // استخدام واحد
    try {
      const customToken = await this.createCustomToken(entry.uid);
      return { ok: true, customToken };
    } catch (e) {
      return { ok: false, error: 'internal' };
    }
  }
}

export const ALLOWED_ORIGINS = new Set(['https://ehsmaha.com', 'https://www.ehsmaha.com']);

export function corsHeaders(origin) {
  if (!ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

/** جلسات الموقع المفتوحة (WebSocket) لاستلام الرمز: المصادقة برسالة أولى (لا توكن في الرابط). */
export class DesktopLinkHub {
  constructor({ verifyToken, log = () => {} } = {}) {
    this.verifyToken = verifyToken; this.log = log;
    this.subs = new Map(); // uid -> Set<ws>
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  }

  push(uid, msg) {
    const set = this.subs.get(uid); let n = 0;
    if (!set) return 0;
    const data = JSON.stringify(msg);
    for (const ws of set) { if (ws.readyState === 1) { try { ws.send(data); n++; } catch (e) { /* */ } } }
    return n;
  }

  handleUpgrade(req, socket, head) {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      const timer = setTimeout(() => ws.close(4001, 'auth timeout'), 10000);
      let uid = null;
      ws.on('message', async (raw) => {
        if (uid) return;
        let m; try { m = JSON.parse(String(raw)); } catch (e) { return ws.close(4002, 'bad'); }
        if (!m || m.type !== 'auth') return ws.close(4002, 'bad');
        const user = await this.verifyToken(m.token);
        if (!user) return ws.close(4003, 'unauthorized');
        clearTimeout(timer);
        uid = user.uid;
        let set = this.subs.get(uid); if (!set) { set = new Set(); this.subs.set(uid, set); }
        if (set.size >= 5) { const old = set.values().next().value; try { old.close(4004, 'replaced'); } catch (e) { /* */ } set.delete(old); }
        set.add(ws);
        ws.send(JSON.stringify({ type: 'ready' }));
      });
      const ping = setInterval(() => { try { ws.ping(); } catch (e) { /* */ } }, 25000);
      ws.on('close', () => {
        clearTimeout(timer); clearInterval(ping);
        if (uid) { const set = this.subs.get(uid); if (set) { set.delete(ws); if (!set.size) this.subs.delete(uid); } }
      });
      ws.on('error', () => {});
    });
  }
}
