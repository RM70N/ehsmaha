'use strict';
// محاكي Gemini REST (generateContent) لاختبار «انصب علي» بدون مفاتيح حقيقية:
//   MOCK_GEMINI_PORT=19500 node tests/bridge/mock-gemini.js
// chat: يصنّف النوايا بكلمات مفتاحية؛ stt: يرجع نصاً ثابتاً؛ tts: صوت PCM صامت. GET /__calls لقراءة الطلبات، POST /__mode لمحاكاة 429/503.
const http = require('http');
const PORT = Number(process.env.MOCK_GEMINI_PORT || 19500);
const calls = []; let mode = 'ok';
http.createServer((req, res) => {
  const json = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.url === '/__calls') return json(200, { n: calls.length, calls: calls.slice(-40).map((c) => ({ model: c.model, key: (c.key || '').slice(-4), kind: c.kind })) });
  if (req.url === '/__mode') { let b = ''; req.on('data', (c) => { b += c; }); return req.on('end', () => { try { mode = JSON.parse(b).mode || 'ok'; } catch (e) { /* */ } json(200, { ok: true, mode }); }); }
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    const m = /models\/([^:]+):generateContent/.exec(req.url), model = m && decodeURIComponent(m[1]);
    let body = {}; try { body = JSON.parse(b); } catch (e) { /* */ }
    const parts = (body.contents && body.contents[0] && body.contents[0].parts) || [];
    const kind = /tts/.test(model) ? 'tts' : parts.some((p) => p.inlineData) ? 'stt' : 'chat';
    calls.push({ model, key: req.headers['x-goog-api-key'], kind });
    if (mode === '429') return json(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota exceeded', details: [{ retryDelay: '5s' }] } });
    if (mode === '503') return json(503, { error: { code: 503, status: 'UNAVAILABLE', message: 'overloaded' } });
    if (kind === 'tts') return json(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.alloc(9600, 0).toString('base64') } }] } }] });
    if (kind === 'stt') return json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ text: 'السلام عليكم معك سعد من شركة الاتصالات', noSpeech: false }) }] } }] });
    const txt = parts.map((p) => p.text || '').join('');
    const player = (/<player>([\s\S]*?)<\/player>/.exec(txt) || [])[1] || '';
    let intent = 'unclear';
    if (/السلام|هلا|مرحبا/.test(player)) intent = 'greet';
    if (/معك|من شركة|اسمي/.test(player)) intent = 'introduce';
    if (/الرمز|الكود/.test(player)) intent = 'ask_code';
    if (/آسف|اسف|معليش/.test(player)) intent = 'apology';
    if (/مع السلامة|باي/.test(player)) intent = 'polite_end';
    const claims = []; const nm = /(?:معك|اسمي)\s+([؀-ۿ]{2,12})/.exec(player); if (nm) claims.push({ k: 'player_name', v: nm[1] });
    json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ intent, claims, say: 'أهلين فيك، كمّل.' }) }] } }], usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 30 } });
  });
}).listen(PORT, '127.0.0.1', () => console.log('[mock-gemini] listening on ' + PORT));
