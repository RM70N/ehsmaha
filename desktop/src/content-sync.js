'use strict';

const { net } = require('electron');
const { SITE_ORIGIN } = require('./config');

/**
 * مزامنة المحتوى: يجلب أحدث نسخة من صفحة الموقع الحيّة بالخلفية ويحفظها
 * لتُستخدم في التشغيل التالي. هذا ما يجعل التطبيق "نسخة من الموقع" تبقى
 * محدَّثة دائماً بدون إعادة بناء ملف تثبيت جديد مع كل تعديل بسيط بالموقع.
 *
 * لا يمسّ Firebase ولا أي كود باك اند — مجرد GET لصفحة HTML عامة.
 */

const FETCH_TIMEOUT_MS = 45000;
const MAX_BYTES = 25 * 1024 * 1024;

function fetchSiteHtml(url) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, arg) => { if (!settled) { settled = true; fn(arg); } };

    let request;
    try {
      request = net.request({ method: 'GET', url, redirect: 'follow', useSessionCookies: false });
    } catch (err) {
      return done(reject, err);
    }
    request.setHeader('Accept', 'text/html,application/xhtml+xml');
    request.setHeader('Cache-Control', 'no-cache');

    const timer = setTimeout(() => {
      try { request.abort(); } catch (e) { /* تجاهل */ }
      done(reject, new Error('انتهت مهلة الاتصال أثناء جلب المحتوى'));
    }, FETCH_TIMEOUT_MS);

    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        clearTimeout(timer);
        response.resume();
        return done(reject, new Error('HTTP ' + response.statusCode));
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          clearTimeout(timer);
          try { request.abort(); } catch (e) { /* تجاهل */ }
          return done(reject, new Error('حجم المحتوى أكبر من المتوقع'));
        }
        chunks.push(chunk);
      });
      response.on('end', () => { clearTimeout(timer); done(resolve, Buffer.concat(chunks)); });
      response.on('error', (err) => { clearTimeout(timer); done(reject, err); });
    });
    request.on('error', (err) => { clearTimeout(timer); done(reject, err); });
    request.end();
  });
}

/**
 * @param {import('./content').ContentStore} store
 * @param {(payload: object) => void} notify  لإرسال حالة المزامنة للواجهة
 */
async function syncContent(store, notify, log) {
  try {
    const buf = await fetchSiteHtml(SITE_ORIGIN + '/?desktop=1');
    const result = store.saveDownloaded(buf);
    if (result.saved) {
      log && log('تم تنزيل نسخة أحدث من محتوى الموقع — ستُطبَّق عند إعادة التشغيل');
      notify && notify({ type: 'content-updated' });
    } else {
      log && log('محتوى الموقع محدَّث بالفعل (' + result.reason + ')');
    }
    return result;
  } catch (err) {
    log && log('تعذّرت مزامنة المحتوى: ' + (err && err.message));
    return { saved: false, reason: 'error', error: err && err.message };
  }
}

module.exports = { syncContent, fetchSiteHtml };
