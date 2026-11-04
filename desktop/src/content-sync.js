'use strict';

const { MANIFEST_NAME, validateManifest } = require('../scripts/site-manifest');
const { ContentStore } = require('./content-store');

/**
 * مزامنة محتوى الموقع عبر Content Manifest.
 *   1) جلب content-manifest.json (بدون كاش)
 *   2) إن تطابق إصداره مع الفعّال/الجاهز → لا شيء
 *   3) وإلا: تنزيل الملفات المتغيرة فقط، تحقق SHA-256، تحقق التبعيات، تجهيز الإصدار (pending)
 * لا يطبّق شيئاً — التطبيق مسؤولية update-coordinator عند نقطة آمنة.
 *
 * fetchBuffer(url) → Promise<Buffer> قابل للحقن (للاختبار بدون شبكة).
 */

const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

function electronFetchBuffer(timeoutMs = 45000, maxBytes = 60 * 1024 * 1024) {
  const { net } = require('electron');
  return (url) => new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, arg) => { if (!settled) { settled = true; fn(arg); } };
    let request;
    try { request = net.request({ method: 'GET', url, redirect: 'follow', useSessionCookies: false }); } catch (e) { return done(reject, e); }
    request.setHeader('Cache-Control', 'no-cache');
    const timer = setTimeout(() => { try { request.abort(); } catch (e) { /* */ } done(reject, new Error('انتهت مهلة الاتصال')); }, timeoutMs);
    request.on('response', (res) => {
      if (res.statusCode !== 200) { clearTimeout(timer); res.resume(); return done(reject, new Error('HTTP ' + res.statusCode)); }
      const chunks = []; let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > maxBytes) { clearTimeout(timer); try { request.abort(); } catch (e) { /* */ } return done(reject, new Error('حجم أكبر من المسموح')); }
        chunks.push(c);
      });
      res.on('end', () => { clearTimeout(timer); done(resolve, Buffer.concat(chunks)); });
      res.on('error', (e) => { clearTimeout(timer); done(reject, e); });
    });
    request.on('error', (e) => { clearTimeout(timer); done(reject, e); });
    request.end();
  });
}

function encodePath(p) { return p.split('/').map(encodeURIComponent).join('/'); }

/**
 * @returns {Promise<{status:'up-to-date'|'staged'|'error', version?, diff?, error?}>}
 */
async function syncContent({ store, fetchBuffer, origin, log = () => {} }) {
  store.writeState({ lastCheckAt: new Date().toISOString() });
  try {
    const raw = await fetchBuffer(origin + '/' + MANIFEST_NAME + '?t=' + Date.now());
    if (raw.length > MAX_MANIFEST_BYTES) throw new Error('manifest أكبر من المسموح');
    let manifest;
    try { manifest = JSON.parse(raw.toString('utf8')); } catch (e) { throw new Error('manifest ليس JSON صالحاً'); }
    const invalid = validateManifest(manifest);
    if (invalid) throw new Error('manifest مرفوض: ' + invalid);

    const state = store.readState();
    if (manifest.version === store.activeVersion() || (manifest.version === state.pending && store.hasPending())) {
      return { status: 'up-to-date', version: manifest.version };
    }
    const diff = ContentStore.diff(store.activeManifest(), manifest);
    const res = await store.stage(manifest, (rel) => fetchBuffer(origin + '/' + encodePath(rel) + '?v=' + manifest.version));
    log('جُهّز إصدار المحتوى ' + manifest.version + ' (جديد ' + res.downloaded + '، معاد استخدامه ' + res.reused + ')');
    return { status: 'staged', version: manifest.version, diff, ...res };
  } catch (err) {
    const msg = (err && err.message) || String(err);
    store.writeState({ lastError: msg });
    log('تعذّرت مزامنة المحتوى: ' + msg);
    return { status: 'error', error: msg };
  }
}

module.exports = { syncContent, electronFetchBuffer };
