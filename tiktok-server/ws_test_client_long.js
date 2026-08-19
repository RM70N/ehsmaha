const WebSocket = require('ws');
const username = process.argv[2];
const durationMs = parseInt(process.argv[3] || '45000', 10);
const url = 'ws://127.0.0.1:8080/ws?u=' + encodeURIComponent(username);
console.log('connecting to', url);
const ws = new WebSocket(url);
let msgCount = 0;
const seen = { comment: 0, gift: 0, follow: 0, like: 0, viewer: 0, status: 0 };
const timeout = setTimeout(() => {
  console.log('DONE after', durationMs, 'ms. Totals:', JSON.stringify(seen), 'raw messages:', msgCount);
  ws.close();
  process.exit(0);
}, durationMs);
ws.on('open', () => console.log('[client] ws open'));
ws.on('message', (data) => {
  msgCount++;
  let parsed;
  try { parsed = JSON.parse(data.toString()); } catch(e) { return; }
  if (parsed.type === 'bridge_status') {
    seen.status++;
    console.log('[status]', parsed.state, '-', parsed.message);
  } else if (parsed.messages) {
    parsed.messages.forEach(m => {
      if (m.type === 'WebcastChatMessage') { seen.comment++; console.log('[comment]', m.user.nickname, '(@'+m.user.uniqueId+'):', m.comment); }
      else if (m.type === 'WebcastGiftMessage') { seen.gift++; console.log('[gift]', m.user.nickname, 'sent', m.giftName, 'x'+m.repeatCount, 'diamonds='+m.diamondCount); }
      else if (m.type === 'WebcastSocialMessage') { seen.follow++; console.log('[follow]', m.user.nickname); }
      else if (m.type === 'WebcastLikeMessage') { seen.like++; }
      else if (m.type === 'WebcastRoomUserSeqMessage') { seen.viewer++; }
    });
  }
});
ws.on('close', (code, reason) => {
  console.log('[client] ws closed', code, reason.toString());
  clearTimeout(timeout);
  process.exit(0);
});
ws.on('error', (e) => console.log('[client] ws error', e.message));
