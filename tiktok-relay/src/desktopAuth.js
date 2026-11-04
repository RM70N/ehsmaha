// رمز ربط تطبيق احسمها لويندوز: مستخدم مسجّل دخوله في الموقع (المتصفح) يطلب رمزاً قصيراً،
// يكتبه في التطبيق، فيستلم التطبيق Custom Token ويدخل بنفس حسابه.
//
// الأمان: الرمز لا يُنشأ إلا لمن يحمل Firebase ID Token صالحاً (verifyToken)؛ ثماني خانات
// من أبجدية بلا حروف ملتبسة (~8.5 تريليون احتمال)، صلاحية دقيقتين، استخدام واحد، حد لإصدار
// الرموز لكل حساب، وحد صارم للمحاولات الفاشلة لكل IP وعلى مستوى الخدمة كلها.
// الرموز بالذاكرة فقط (لا تُخزَّن ولا تُسجَّل).
import crypto from 'node:crypto';

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
  constructor({ createCustomToken, now = Date.now } = {}) {
    this.createCustomToken = createCustomToken;
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
  issue(uid) {
    if (!uid) return { ok: false, error: 'unauthorized' };
    const w = this._win(this.issueByUid, uid, 5, 60 * 1000);
    if (w.full()) return { ok: false, error: 'rate_limited' };
    w.add();
    this._sweep();
    for (const [c, v] of this.codes) if (v.uid === uid) this.codes.delete(c); // رمز واحد فعّال لكل حساب
    let code; do { code = newCode(); } while (this.codes.has(code));
    this.codes.set(code, { uid, exp: this.now() + CODE_TTL_MS });
    return { ok: true, code, expiresInSec: Math.round(CODE_TTL_MS / 1000) };
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
