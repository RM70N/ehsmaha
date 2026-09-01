'use strict';

/**
 * تسجيل دخول قوقل من داخل تطبيق سطح المكتب — عبر متصفح النظام الافتراضي
 * بدل نافذة Electron المدمجة.
 *
 * قوقل تمنع رسمياً تسجيل الدخول بحسابها من أي "متصفح مدمج" (embedded
 * browser/WebView) — بما فيه Chromium الخاص بـ Electron — بصرف النظر عن أي
 * إعداد نطاق في Firebase. الحل الوحيد المعتمد من قوقل لتطبيقات سطح المكتب هو
 * فتح تسجيل الدخول بمتصفح الجهاز العادي (Chrome/Edge/Firefox...) والعودة
 * للتطبيق تلقائياً بعد نجاح الدخول.
 *
 * التنفيذ هنا يتبع توصية قوقل/RFC 8252 لتطبيقات سطح المكتب: تدفّق
 * Authorization Code + PKCE مع عنوان إعادة توجيه محلي (loopback) على
 * 127.0.0.1 بمنفذ عشوائي حر — بدون الحاجة لتسجيل بروتوكول مخصص (custom
 * protocol) أو أي إعداد إضافي على مستوى نظام التشغيل. عميل الـ OAuth يجب أن
 * يكون من نوع "Desktop app" في Google Cloud Console (نفس مشروع Firebase)
 * حتى يقبل قوقل أي منفذ على 127.0.0.1 بدون تسجيله مسبقاً — انظر
 * GOOGLE_DESKTOP_OAUTH_CLIENT_ID في config.js.
 */

const crypto = require('crypto');
const http = require('http');
const { shell } = require('electron');

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const TIMEOUT_MS = 5 * 60 * 1000; // خمس دقائق كحد أقصى لإكمال الدخول بالمتصفح

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function successHtml() {
  return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
  <title>تم تسجيل الدخول</title>
  <body style="font-family:system-ui,sans-serif;background:#0b0518;color:#f4ecff;
    display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
    <div>
      <div style="font-size:48px">✅</div>
      <h2>تم تسجيل الدخول بنجاح</h2>
      <p>يمكنك إغلاق هذه النافذة والعودة إلى تطبيق احسمها.</p>
    </div>
  </body></html>`;
}

function errorHtml(message) {
  return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
  <title>تعذّر تسجيل الدخول</title>
  <body style="font-family:system-ui,sans-serif;background:#0b0518;color:#f4ecff;
    display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
    <div>
      <div style="font-size:48px">⚠️</div>
      <h2>تعذّر تسجيل الدخول</h2>
      <p>${message}</p>
      <p>ارجع لتطبيق احسمها وحاول مرة أخرى.</p>
    </div>
  </body></html>`;
}

let inFlight = null; // يمنع فتح أكثر من محاولة تسجيل دخول بنفس الوقت

/**
 * @param {{clientId: string, clientSecret?: string}} opts
 * @returns {Promise<{idToken: string}>}
 */
function googleSignInViaSystemBrowser(opts) {
  if (inFlight) return inFlight;

  const clientId = opts && opts.clientId;
  if (!clientId) {
    return Promise.reject(new Error('desktop-oauth-not-configured'));
  }

  inFlight = new Promise((resolve, reject) => {
    const codeVerifier = base64url(crypto.randomBytes(48));
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    const state = base64url(crypto.randomBytes(24));

    let settled = false;
    let server = null;
    let timeoutTimer = null;

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (server) { try { server.close(); } catch (e) { /* تجاهل */ } }
      if (err) reject(err); else resolve(value);
    };

    server = http.createServer((req, res) => {
      let url;
      try {
        url = new URL(req.url, 'http://127.0.0.1');
      } catch (e) {
        res.writeHead(400).end();
        return;
      }
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }

      const returnedState = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const oauthError = url.searchParams.get('error');

      if (oauthError) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(errorHtml('قوقل رفض الطلب: ' + oauthError));
        finish(new Error('oauth-denied:' + oauthError));
        return;
      }
      if (!returnedState || returnedState !== state || !code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(errorHtml('استجابة غير متوقعة.'));
        finish(new Error('oauth-bad-response'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(successHtml());

      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      exchangeCodeForToken({ clientId, clientSecret: opts.clientSecret, code, codeVerifier, redirectUri })
        .then((idToken) => finish(null, { idToken }))
        .catch((e) => finish(e));
    });

    server.on('error', (e) => finish(e));

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const authUrl = new URL(AUTH_ENDPOINT);
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'openid email profile');
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('prompt', 'select_account');
      shell.openExternal(authUrl.toString()).catch((e) => finish(e));
    });

    timeoutTimer = setTimeout(() => finish(new Error('timeout')), TIMEOUT_MS);
  }).finally(() => { inFlight = null; });

  return inFlight;
}

async function exchangeCodeForToken({ clientId, clientSecret, code, codeVerifier, redirectUri }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });
  if (clientSecret) body.set('client_secret', clientSecret);

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.id_token) {
    throw new Error('token-exchange-failed: ' + (json.error_description || json.error || res.status));
  }
  return json.id_token;
}

module.exports = { googleSignInViaSystemBrowser };
