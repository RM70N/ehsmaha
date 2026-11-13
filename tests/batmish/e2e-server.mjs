// خادم اختبار BATMISH: نفس وحدات الخادم الحقيقية (بوابة + خدمة + مسارات HTTP + جسر /ws يسجّل جلسات موثَّقة)
// لكن التحقق من التوكن يفك توكن محاكي Firebase (غير موقّع). يُستخدم فقط مع محاكيات Firebase بالاختبار.
import http from 'node:http';
import { MemoryStore } from '../../tiktok-relay/src/batmish/store.js';
import { BatmishService } from '../../tiktok-relay/src/batmish/service.js';
import { BatmishAccess } from '../../tiktok-relay/src/batmish/access.js';
import { createBatmishHandler } from '../../tiktok-relay/src/batmish/http.js';
import { LegacyBridgeServer } from '../../tiktok-relay/src/legacyBridge.js';

const OWNER = 'malshaifan1@gmail.com';
const decode = async (t) => { try { const p = JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url').toString()); return p.user_id ? { uid: p.user_id, email: p.email || '' } : null; } catch (e) { return null; } };
export async function startBatmishTestServer(port = 0) {
  const store = new MemoryStore();
  const service = new BatmishService({ store });
  const access = new BatmishAccess({ store });
  const readJsonBody = async (req, limit = 10000) => { let n = 0; const c = []; for await (const x of req) { n += x.length; if (n > limit) throw new Error('الجسم كبير جداً'); c.push(x); } const t = Buffer.concat(c).toString('utf8'); return t ? JSON.parse(t) : {}; };
  const handler = createBatmishHandler({ verifyToken: decode, service, access, ownerEmail: OWNER, readJsonBody });
  const bridge = new LegacyBridgeServer({ log: () => {}, isStreamerEnabled: async () => true, verifyToken: decode, onSession: (u, id, ws) => access.registerSession(u, id, ws) });
  bridge.getOrCreateRoom = () => ({ addClient(ws) { ws.send(JSON.stringify({ type: 'bridge_status', state: 'connected' })); }, removeClient() {} });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
    if (url.pathname === '/__bind' && req.method === 'POST') { const b = await readJsonBody(req); await access.bind(b.uid, 'test'); res.writeHead(200); return res.end('{}'); }
    if (url.pathname === '/__unbind' && req.method === 'POST') { await access.unbind(); res.writeHead(200); return res.end('{}'); }
    if (!(await handler(req, res, url.pathname, url))) { res.writeHead(404); res.end(); }
  });
  server.on('upgrade', (req, socket, head) => { if (new URL(req.url, 'http://localhost').pathname === '/ws') bridge.handleUpgrade(req, socket, head); else socket.destroy(); });
  await new Promise((r) => server.listen(port, r));
  return { server, port: server.address().port, service, access };
}
if (process.argv[1] && process.argv[1].endsWith('e2e-server.mjs')) { const s = await startBatmishTestServer(Number(process.env.PORT || 8791)); console.log('batmish test server on', s.port); }
