'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { buildCsp, PREFERRED_PORT, PORT_ATTEMPTS } = require('./config');

/**
 * سيرفر ثابت محلي (127.0.0.1 فقط) يخدم نسخة الموقع المضمّنة داخل التطبيق.
 *
 * ليش سيرفر محلي بدل file:// ؟
 *  - Firebase Auth يرفض الأصل "null" الذي يعطيه file:// ، بينما localhost
 *    مضاف افتراضياً في Authorized domains لأي مشروع Firebase.
 *  - localStorage / IndexedDB (حفظ الجلسة) تعمل بشكل طبيعي مع أصل http.
 *  - مسارات الموقع مثل /games/shad-al-habl تشتغل عبر SPA fallback.
 */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
};

function securityHeaders(origin, isDocument) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer-when-downgrade',
    'Cache-Control': 'no-store',
  };
  if (isDocument) headers['Content-Security-Policy'] = buildCsp(origin);
  return headers;
}

class LocalSiteServer {
  constructor() {
    this.server = null;
    this.port = null;
    this.rootDir = null;
  }

  get origin() {
    return this.port ? `http://localhost:${this.port}` : null;
  }

  /** تبديل مجلد المحتوى بدون إعادة تشغيل السيرفر (بعد تحديث المحتوى). */
  setRootDir(dir) { this.rootDir = dir; }

  /**
   * @param {string} rootDir مجلد المحتوى
   * @param {number} [startPort] المنفذ المفضّل (يُحفظ بين الجلسات)
   */
  async start(rootDir, startPort) {
    this.rootDir = rootDir;
    this.server = http.createServer((req, res) => this._handle(req, res));

    const first = Number(startPort) || PREFERRED_PORT;
    let lastErr = null;
    for (let i = 0; i < PORT_ATTEMPTS; i++) {
      const port = first + i;
      try {
        await this._listen(port);
        this.port = port;
        return port;
      } catch (err) {
        lastErr = err;
        if (err && err.code !== 'EADDRINUSE') throw err;
      }
    }
    // آخر محاولة: أي منفذ حر يعطيه النظام (قد يُفقد حفظ الجلسة لكن التطبيق يعمل)
    await this._listen(0);
    this.port = this.server.address().port;
    if (!this.port) throw lastErr || new Error('تعذّر تشغيل السيرفر المحلي');
    return this.port;
  }

  _listen(port) {
    return new Promise((resolve, reject) => {
      const onError = (err) => { this.server.removeListener('listening', onListening); reject(err); };
      const onListening = () => { this.server.removeListener('error', onError); resolve(); };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen(port, '127.0.0.1');
    });
  }

  stop() {
    try { if (this.server) this.server.close(); } catch (e) { /* تجاهل */ }
    this.server = null;
    this.port = null;
  }

  _handle(req, res) {
    // لا نقبل إلا الطلبات المحلية — السيرفر أصلاً مربوط على 127.0.0.1 فقط.
    const host = String(req.headers.host || '');
    const hostname = host.split(':')[0];
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '[::1]') {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('forbidden');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch (e) {
      pathname = '/';
    }

    // منع الخروج من مجلد المحتوى
    const safe = path.normalize(pathname).replace(/^([/\\])+/, '');
    const target = path.join(this.rootDir, safe);
    const withinRoot = target === this.rootDir || target.startsWith(this.rootDir + path.sep);

    let filePath = null;
    if (withinRoot && safe !== '') {
      try {
        const st = fs.statSync(target);
        if (st.isFile()) filePath = target;
        else if (st.isDirectory() && fs.existsSync(path.join(target, 'index.html'))) {
          filePath = path.join(target, 'index.html');
        }
      } catch (e) { /* غير موجود — ننزل لـ SPA fallback */ }
    }

    // SPA fallback: أي مسار غير موجود (مثل /games/shad-al-habl) يخدم index.html
    // بنفس سلوك استضافة الموقع الحيّ.
    if (!filePath) filePath = path.join(this.rootDir, 'index.html');

    const ext = path.extname(filePath).toLowerCase();
    const isDocument = ext === '.html' || ext === '.htm';
    let data;
    try {
      data = fs.readFileSync(filePath);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('not found');
    }

    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      ...securityHeaders(`http://localhost:${this.port}`, isDocument),
    });
    if (req.method === 'HEAD') return res.end();
    return res.end(data);
  }
}

module.exports = { LocalSiteServer };
