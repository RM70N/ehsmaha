'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildManifest, MANIFEST_NAME } = require('../scripts/site-manifest');

function tmp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

/** يبني موقعاً صغيراً بملفات ويكتب manifest. files = {rel: content} */
function makeSite(files) {
  const dir = tmp('site-');
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  const manifest = buildManifest(dir);
  fs.writeFileSync(path.join(dir, MANIFEST_NAME), JSON.stringify(manifest));
  return { dir, manifest };
}

/** fetchBuffer وهمي يخدم موقعاً من مجلد، مع إمكان تخريب ملف. */
function fakeFetch(siteDir, { corrupt = {}, fail = new Set(), counter } = {}) {
  return async (url) => {
    const u = new URL(url);
    const rel = decodeURIComponent(u.pathname.replace(/^\//, ''));
    if (counter) counter.push(rel);
    if (fail.has(rel)) throw new Error('network down');
    if (corrupt[rel]) return Buffer.from(corrupt[rel]);
    return fs.readFileSync(path.join(siteDir, rel));
  };
}

const BASE = {
  'index.html': '<!doctype html><html><head><script src="/lib/app.js"></script></head><body><div class="page active" id="pg-home"></div></body></html>',
  'lib/app.js': 'console.log(1)',
  'game1.html': '<!doctype html><html><body>g1</body></html>',
};

module.exports = { tmp, makeSite, fakeFetch, BASE };
