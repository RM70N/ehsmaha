// خادم تجربة محلي لـ«جمعتنا»: ملفات الموقع الثابتة + خادم الغرف الحقيقي على نفس المنفذ.
// التشغيل: node tests/jam3atna/dev-server.mjs [port]  ثم افتح http://127.0.0.1:PORT/jam3atna/?srv=ws://127.0.0.1:PORT/jam3atna/ws
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { Jam3atnaServer } from '../../tiktok-relay/src/jam3atna/server.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
export function startDev(port = 0, cfg = {}, three = null) {
  const j = new Jam3atnaServer({ cfg });
  const server = http.createServer((q, res) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    if (three && p === '/__three.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return fs.createReadStream(three).pipe(res); }
    const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
  });
  server.on('upgrade', (q, s, h) => { if (new URL(q.url, 'http://x').pathname === '/jam3atna/ws') j.handleUpgrade(q, s, h); else s.destroy(); });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r({ j, server, port: server.address().port, close: () => { j.closeAll(); server.close(); } })));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) startDev(Number(process.argv[2]) || 8770, { min: { city: Number(process.env.MIN) || 4, prop: Number(process.env.MIN) || 4 } }).then((d) => console.log('http://127.0.0.1:' + d.port + '/jam3atna/?srv=ws://127.0.0.1:' + d.port + '/jam3atna/ws'));
