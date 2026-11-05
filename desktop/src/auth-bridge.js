'use strict';

const crypto = require('crypto');
const { SITE_ORIGIN, AUTH_PORT_RANGE } = require('./config');

/**
 * تسجيل الدخول بجوجل عبر متصفح النظام (لا عبر نافذة Electron — جوجل تحجب المتصفحات
 * المدمجة). التدفق:
 *   1) التطبيق يولّد state عشوائياً أحادي الاستخدام صالحاً ٥ دقائق ويفتح
 *      https://ehsmaha.com/desktop-auth.html?port=P&state=S في متصفح النظام.
 *   2) الصفحة تسجّل الدخول بجوجل (Firebase) وترسل بيانات الاعتماد بـPOST إلى
 *      http://127.0.0.1:P/__auth/callback (ليس في الرابط/السجلات).
 *   3) السيرفر المحلي يتحقق من state والأصل ثم يسلّم الاعتماد للتطبيق الذي ينفّذ
 *      signInWithCredential داخل صفحة الموقع. التوكنات لا تُكتب لأي لوغ.
 */

const TTL_MS = 5 * 60 * 1000;

class AuthBridge {
  constructor({ now = Date.now } = {}) { this.now = now; this.pending = new Map(); }

  begin(port) {
    if (!Number.isInteger(port) || port < AUTH_PORT_RANGE[0] || port > AUTH_PORT_RANGE[1]) return null;
    for (const [k, v] of this.pending) if (v.exp < this.now()) this.pending.delete(k);
    const state = crypto.randomBytes(16).toString('hex');
    this.pending.set(state, { exp: this.now() + TTL_MS, port });
    return { state, url: `${SITE_ORIGIN}/desktop-auth.html?port=${port}&state=${state}` };
  }

  /**
   * @param {{origin?:string, host?:string, body:string}} req
   * @returns {{ok:true, idToken:string, accessToken:string}|{ok:false, reason:string}}
   */
  complete({ origin, host, body }) {
    if (origin !== SITE_ORIGIN) return { ok: false, reason: 'bad-origin' };
    let params;
    try { params = new URLSearchParams(String(body || '')); } catch (e) { return { ok: false, reason: 'bad-body' }; }
    const state = params.get('state') || '';
    const entry = this.pending.get(state);
    if (!entry) return { ok: false, reason: 'unknown-state' };
    this.pending.delete(state); // أحادي الاستخدام
    if (entry.exp < this.now()) return { ok: false, reason: 'expired' };
    const hostPort = Number(String(host || '').split(':')[1]);
    if (hostPort !== entry.port) return { ok: false, reason: 'port-mismatch' };
    const idToken = params.get('idToken') || '';
    const accessToken = params.get('accessToken') || '';
    if (!idToken && !accessToken) return { ok: false, reason: 'no-credential' };
    if (idToken.length > 4096 || accessToken.length > 4096) return { ok: false, reason: 'too-large' };
    return { ok: true, idToken, accessToken };
  }
}

/** كود يُنفَّذ بصفحة الموقع لإكمال الدخول بنفس مثيل Firebase Auth الخاص بها. */
function signInScript(idToken, accessToken) {
  return `(async function(){
    try {
      var m = await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js');
      var cred = m.GoogleAuthProvider.credential(${JSON.stringify(idToken || null)}, ${JSON.stringify(accessToken || null)});
      await m.signInWithCredential(window.__fb.auth, cred);
      return true;
    } catch (e) { return false; }
  })()`;
}

/** الدخول برمز احسمها: Custom Token من خادم الجسر ⇒ signInWithCustomToken بمثيل Firebase الخاص بالصفحة. */
function customTokenScript(token) {
  return `(async function(){
    try {
      var m = await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js');
      await m.signInWithCustomToken(window.__fb.auth, ${JSON.stringify(String(token))});
      return true;
    } catch (e) { return false; }
  })()`;
}

/**
 * يستبدل رمز الربط (8 خانات) بـCustom Token. postJson(url, body) → {status, json} قابل للحقن.
 * @returns {Promise<{ok:true, customToken:string}|{ok:false, error:string}>}
 */
async function redeemLinkCode(code, { postJson, api }) {
  const clean = String(code == null ? '' : code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 8) return { ok: false, error: 'invalid_code' };
  let r;
  try { r = await postJson(api + '/desktop-auth/redeem', { code: clean }); } catch (e) { return { ok: false, error: 'network' }; }
  if (r && r.status === 200 && r.json && typeof r.json.customToken === 'string' && r.json.customToken.length > 20) return { ok: true, customToken: r.json.customToken };
  const err = r && r.json && r.json.error;
  return { ok: false, error: err === 'rate_limited' ? 'rate_limited' : err === 'invalid_code' ? 'invalid_code' : 'failed' };
}

/** يطلب من الخادم دفع رمز إلى جلسات الموقع المفتوحة لهذا اليوزر (الرمز لا يعود للتطبيق). */
async function requestLinkCode(username, { postJson, api }) {
  const name = String(username == null ? '' : username).trim().replace(/^@/, '');
  const isEmail = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(name) && name.length <= 254;
  if (!isEmail && !/^[\p{L}\p{N}_.\-]{2,32}$/u.test(name)) return { ok: false, error: 'invalid_username' };
  let r;
  try { r = await postJson(api + '/desktop-auth/request', { username: name }); } catch (e) { return { ok: false, error: 'network' }; }
  if (r && r.status === 200 && r.json && r.json.ok) return { ok: true, delivered: !!r.json.delivered };
  const err = r && r.json && r.json.error;
  return { ok: false, error: err === 'rate_limited' ? 'rate_limited' : err === 'invalid_username' ? 'invalid_username' : err === 'lookup_unavailable' ? 'lookup_unavailable' : 'failed' };
}

const SUCCESS_PAGE = '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>احسمها</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07040D;color:#F8F7FC;font-family:Segoe UI,Tahoma,sans-serif"><div style="text-align:center"><h2>تم تسجيل الدخول</h2><p style="color:#A78BFA">ارجع إلى تطبيق احسمها، تقدر تغلق هذه النافذة.</p></div></body></html>';
const FAIL_PAGE = SUCCESS_PAGE.replace('تم تسجيل الدخول', 'تعذّر إكمال تسجيل الدخول').replace('ارجع إلى تطبيق احسمها، تقدر تغلق هذه النافذة.', 'ارجع للتطبيق وحاول مرة أخرى.');

module.exports = { AuthBridge, signInScript, customTokenScript, redeemLinkCode, requestLinkCode, SUCCESS_PAGE, FAIL_PAGE, TTL_MS };
