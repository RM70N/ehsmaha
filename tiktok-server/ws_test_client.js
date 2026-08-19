const WebSocket = require('ws');
const username = process.argv[2] || 'tiktok';
const url = 'ws://127.0.0.1:8080/ws?u=' + encodeURIComponent(username);
console.log('connecting to', url);
const ws = new WebSocket(url);
let msgCount = 0;
const timeout = setTimeout(() => {
  console.log('TIMEOUT after 25s, closing. Total messages:', msgCount);
  ws.close();
  process.exit(0);
}, 25000);
ws.on('open', () => console.log('[client] ws open'));
ws.on('message', (data) => {
  msgCount++;
  console.log('[client] message #' + msgCount + ':', data.toString().slice(0, 300));
});
ws.on('close', (code, reason) => {
  console.log('[client] ws closed', code, reason.toString());
  clearTimeout(timeout);
  process.exit(0);
});
ws.on('error', (e) => console.log('[client] ws error', e.message));
