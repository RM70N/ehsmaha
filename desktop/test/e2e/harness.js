'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');

const DESKTOP = path.join(__dirname, '..', '..');
function loadPlaywright() {
  for (const base of [DESKTOP, '/opt/node-tools/', process.cwd()]) {
    try { return createRequire(path.join(base, 'x.js'))('playwright'); } catch (e) { /* next */ }
  }
  throw new Error('playwright غير متوفر');
}

/** سيرفر «الموقع الحيّ» الوهمي: يخدم مجلداً قابلاً للتبديل مع content-manifest.json. */
function startFakeSite(dir) {
  const state = { dir, hits: [], down: false };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    state.hits.push(u.pathname);
    if (state.down) { res.writeHead(503); return res.end(); }
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
    const f = path.join(state.dir, rel);
    if (!f.startsWith(state.dir) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': f.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, state, origin: 'http://127.0.0.1:' + server.address().port, setDir: (d) => { state.dir = d; }, close: () => server.close() })));
}

async function launchApp({ siteOrigin, userData, extraEnv = {}, args = [] } = {}) {
  const { _electron } = loadPlaywright();
  userData = userData || fs.mkdtempSync(path.join(os.tmpdir(), 'ehs-ud-'));
  const app = await _electron.launch({
    executablePath: require(path.join(DESKTOP, 'node_modules', 'electron')),
    args: ['--no-sandbox', '--disable-gpu', DESKTOP, ...args],
    env: { ...process.env, EHSMAHA_E2E: '1', EHSMAHA_USER_DATA: userData, EHSMAHA_SITE_ORIGIN: siteOrigin || 'http://127.0.0.1:1', ...extraEnv },
    timeout: 60000,
  });
  return { app, userData };
}

module.exports = { DESKTOP, loadPlaywright, startFakeSite, launchApp };
