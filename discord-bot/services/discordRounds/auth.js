'use strict';

// تسجيل الدخول بحساب ديسكورد (OAuth2 Authorization Code + PKCE + state) وجلسات موقّعة.
//   • أقل صلاحية: scope=identify فقط. ما نحفظ access token أبداً (نستخدمه مرة لقراءة الهوية ونرميه).
//   • عضوية السيرفر تتحقق من البوت نفسه (مصدر موثوق) — مو من المتصفح.
//   • الجلسة كوكي HttpOnly موقّعة HMAC (بدون حالة على الخادم)، والهوية الوحيدة المعتبرة هي Discord User ID.
//   • مفتاح التوقيع: ROUNDS_SESSION_SECRET، وإلا مشتق (HKDF) من DISCORD_CLIENT_SECRET — ما ينكتب بأي مكان.

const crypto = require('node:crypto');

const SESSION_COOKIE = 'ehs_rs';
const FLOW_COOKIE = 'ehs_ro';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FLOW_TTL_MS = 10 * 60 * 1000;
const b64 = (buf) => Buffer.from(buf).toString('base64url');

function createAuth({ clientId, clientSecret, publicUrl, sessionSecret, apiBase = 'https://discord.com/api/v10', authorizeUrl = 'https://discord.com/oauth2/authorize', fetchImpl = fetch, now = Date.now }) {
  const key = crypto.hkdfSync('sha256', Buffer.from(sessionSecret || clientSecret || ''), Buffer.from('ehsmaha-rounds'), Buffer.from('session-v1'), 32);
  const secure = String(publicUrl || '').startsWith('https://');
  const redirectUri = `${publicUrl}/auth/discord/callback`;

  const sign = (payload) => {
    const body = b64(JSON.stringify(payload));
    const mac = b64(crypto.createHmac('sha256', Buffer.from(key)).update(body).digest());
    return `${body}.${mac}`;
  };
  function verify(token) {
    if (typeof token !== 'string' || token.length > 2000) return null;
    const [body, mac] = token.split('.');
    if (!body || !mac) return null;
    const expect = b64(crypto.createHmac('sha256', Buffer.from(key)).update(body).digest());
    const a = Buffer.from(mac);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      return p && p.exp > now() ? p : null;
    } catch {
      return null;
    }
  }

  function parseCookies(header) {
    const out = {};
    for (const part of String(header || '').split(';')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      const k = part.slice(0, i).trim();
      if (!(k in out)) out[k] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }

  const cookie = (name, value, { maxAgeMs, path = '/' }) =>
    `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure ? '; Secure' : ''}`;
  const clearCookie = (name, path = '/') => `${name}=; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;

  /** الجلسة الحالية من هيدر الكوكي: { uid, name } أو null */
  function sessionFrom(cookieHeader) {
    const p = verify(parseCookies(cookieHeader)[SESSION_COOKIE]);
    return p && p.uid ? { uid: String(p.uid), name: p.name || null } : null;
  }

  /** بداية الدخول: يرجّع رابط ديسكورد + كوكي الحالة (state + PKCE verifier + الراوند) */
  function beginLogin(roundId) {
    const state = b64(crypto.randomBytes(18));
    const verifier = b64(crypto.randomBytes(32));
    const challenge = b64(crypto.createHash('sha256').update(verifier).digest());
    const url = new URL(authorizeUrl);
    url.search = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'identify',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'none' // إذا سبق وافق ما نطلب منه تفويض ثاني
    }).toString();
    const flow = sign({ state, verifier, rid: roundId, exp: now() + FLOW_TTL_MS });
    return { url: url.toString(), setCookie: cookie(FLOW_COOKIE, flow, { maxAgeMs: FLOW_TTL_MS, path: '/auth' }) };
  }

  /** نهاية الدخول: يتحقق من state ويبدّل الكود بهوية. يرمي Error(code) عند أي خلل. */
  async function finishLogin({ code, state, cookieHeader }) {
    const flow = verify(parseCookies(cookieHeader)[FLOW_COOKIE]);
    const stateOk = flow && typeof state === 'string' && state.length === flow.state.length && crypto.timingSafeEqual(Buffer.from(state), Buffer.from(flow.state));
    if (!stateOk) throw Object.assign(new Error('state غير صالح'), { code: 'BAD_STATE' });
    if (typeof code !== 'string' || !code || code.length > 200) throw Object.assign(new Error('code غير صالح'), { code: 'BAD_CODE' });

    const tokenRes = await fetchImpl(`${apiBase}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: flow.verifier
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!tokenRes.ok) throw Object.assign(new Error('فشل تبديل الكود'), { code: 'TOKEN_EXCHANGE_FAILED', status: tokenRes.status });
    const tok = await tokenRes.json();
    if (!tok || typeof tok.access_token !== 'string') throw Object.assign(new Error('رد توكن غير صالح'), { code: 'TOKEN_EXCHANGE_FAILED' });
    const meRes = await fetchImpl(`${apiBase}/users/@me`, { headers: { Authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(10000) });
    if (!meRes.ok) throw Object.assign(new Error('تعذّر قراءة الحساب'), { code: 'IDENTITY_FAILED', status: meRes.status });
    const me = await meRes.json();
    if (!me || !/^\d{17,20}$/.test(String(me.id))) throw Object.assign(new Error('هوية غير صالحة'), { code: 'IDENTITY_FAILED' });
    // التوكن يُرمى هنا — ما نحفظه
    const name = String(me.global_name || me.username || '').slice(0, 32);
    return {
      uid: String(me.id),
      name,
      roundId: flow.rid,
      setCookies: [cookie(SESSION_COOKIE, sign({ uid: String(me.id), name, exp: now() + SESSION_TTL_MS }), { maxAgeMs: SESSION_TTL_MS }), clearCookie(FLOW_COOKIE, '/auth')]
    };
  }

  return {
    sessionFrom,
    beginLogin,
    finishLogin,
    logoutCookies: () => [clearCookie(SESSION_COOKIE)],
    // للاختبارات
    _internal: { sign, verify, parseCookies, SESSION_COOKIE, FLOW_COOKIE, redirectUri }
  };
}

module.exports = { createAuth, SESSION_COOKIE, FLOW_COOKIE };
