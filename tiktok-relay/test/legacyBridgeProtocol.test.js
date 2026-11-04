import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import { LegacyBridgeServer } from '../src/legacyBridge.js';

// اختبار تكامل حقيقي (سوكيت فعلي، لا محاكاة) لمسار /ws الكامل — اكتشف عطلاً حقيقياً: إغلاق WS
// بسبب نصي عربي يتجاوز 123 بايت UTF-8 (حد بروتوكول WS) كان يرمي استثناءً غير ملتقط يُسقط عملية
// Node بالكامل (كل الستريمرز المتصلين يسقطون بسبب يوزر واحد فقط كتب يوزرنيم غير صالح).
function startServer() {
  return new Promise((resolve) => {
    const bridge = new LegacyBridgeServer({ log: () => {}, isStreamerEnabled: async () => true });
    const server = http.createServer((req, res) => { res.writeHead(404); res.end(); });
    server.on('upgrade', (req, socket, head) => {
      if (new URL(req.url, 'http://localhost').pathname === '/ws') bridge.handleUpgrade(req, socket, head);
      else socket.destroy();
    });
    server.listen(0, () => resolve({ server, port: server.address().port, bridge }));
  });
}

test('/ws: يوزر بصيغة غير صالحة (عربي) يُغلَق بكود 4404 دون إسقاط السيرفر (سبب الإغلاق يتجاوز 123 بايت UTF-8)', async () => {
  const { server, port } = await startServer();
  try {
    const closeInfo = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?u=` + encodeURIComponent('بدون_انجليزي_على_الإطلاق_نص_طويل_جداً_يتجاوز_الحد'));
      const timer = setTimeout(() => reject(new Error('timeout')), 4000);
      ws.on('close', (code, reason) => { clearTimeout(timer); resolve({ code, reason: reason.toString() }); });
      ws.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    assert.equal(closeInfo.code, 4404);
    assert.ok(Buffer.byteLength(closeInfo.reason, 'utf8') <= 123, 'سبب الإغلاق يجب ألا يتجاوز 123 بايت UTF-8');

    // السيرفر لازم يبقى حياً ويخدم اتصالاً آخر طبيعياً بعد هذا الإغلاق مباشرة — إثبات إنه ما سقط.
    const second = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?u=anothervaliduser`);
      const timer = setTimeout(() => reject(new Error('timeout')), 4000);
      ws.on('message', (d) => { clearTimeout(timer); ws.close(); resolve(JSON.parse(d.toString())); });
      ws.on('close', (code) => { if (code === 4404 || code === 4400) { clearTimeout(timer); reject(new Error('رُفض بلا داعٍ، كود ' + code)); } });
      ws.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    assert.equal(second.type, 'bridge_status');
    assert.equal(second.state, 'connecting');
  } finally {
    server.close();
  }
});

test('/ws: يوزر فارغ يُغلَق بكود 4400', async () => {
  const { server, port } = await startServer();
  try {
    const closeInfo = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?u=`);
      const timer = setTimeout(() => reject(new Error('timeout')), 4000);
      ws.on('close', (code) => { clearTimeout(timer); resolve({ code }); });
      ws.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    assert.equal(closeInfo.code, 4400);
  } finally {
    server.close();
  }
});

test('/ws: حساب معطّل (isStreamerEnabled=false) يُغلَق بكود 4403', async () => {
  const bridge = new LegacyBridgeServer({ log: () => {}, isStreamerEnabled: async () => false });
  const server = http.createServer((req, res) => { res.writeHead(404); res.end(); });
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://localhost').pathname === '/ws') bridge.handleUpgrade(req, socket, head);
    else socket.destroy();
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    const closeInfo = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?u=disableduser`);
      const timer = setTimeout(() => reject(new Error('timeout')), 4000);
      ws.on('close', (code) => { clearTimeout(timer); resolve({ code }); });
      ws.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    assert.equal(closeInfo.code, 4403);
  } finally {
    server.close();
  }
});
