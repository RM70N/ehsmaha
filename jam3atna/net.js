// جمعتنا — مدير الاتصال: WebSocket واحد مع إعادة اتصال تلقائية واستعادة المقعد بالرمز السري ومزامنة وقت الخادم.
const DEFAULT_SERVERS = ['wss://ehsmaha-piratetok-bridge.onrender.com/jam3atna/ws'];

function serverList() {
  // للتجربة المحلية فقط: ?srv=ws://127.0.0.1:PORT/jam3atna/ws (يُقبل على localhost حصراً)
  try {
    const q = new URLSearchParams(location.search).get('srv');
    if (q && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /^wss?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(q)) return [q];
  } catch (e) {}
  return DEFAULT_SERVERS;
}

export function createNet() {
  const servers = serverList(); const handlers = new Map(); let ws = null; let want = false; let tries = 0; let timer = 0; let pingT = 0;
  const net = { state: 'idle', offset: 0, rtt: 0, session: null, intentional: false };
  const emit = (t, m) => { const hs = handlers.get(t); if (hs) [...hs].forEach((h) => { try { h(m); } catch (e) { console.error('[جمعتنا]', e); } }); };
  net.on = (t, fn) => { if (!handlers.has(t)) handlers.set(t, new Set()); handlers.get(t).add(fn); return () => handlers.get(t).delete(fn); };
  net.now = () => Date.now() + net.offset;
  net.send = (m) => { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; } return false; };
  net.g = (d) => net.send({ t: 'g', d });
  const setState = (s) => { if (net.state !== s) { net.state = s; emit('state', s); } };

  function open() {
    clearTimeout(timer); if (!want) return;
    setState(tries ? 'reconnecting' : 'connecting');
    let sock; try { sock = new WebSocket(servers[tries % servers.length]); } catch (e) { return retry(); }
    ws = sock;
    sock.onopen = () => {
      if (ws !== sock) return; tries = 0; setState('open'); ping(); clearInterval(pingT); pingT = setInterval(ping, 5000);
      if (net.session) net.send({ t: 'join', code: net.session.code, token: net.session.token }); // استعادة المقعد
      emit('open');
    };
    sock.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'pong') { const rtt = Date.now() - m.c; if (!net.rtt || rtt <= net.rtt * 1.5) { net.rtt = rtt; net.offset = m.now - (m.c + rtt / 2); } return; }
      if (m.t === 'joined') { net.session = { code: m.code, token: m.you.token, id: m.you.id, host: m.you.host }; saveSession(net.session); }
      if (m.t === 'closed' || m.t === 'removed' || m.t === 'replaced') { net.session = null; saveSession(null); }
      if (m.t === 'error' && net.session && (m.code === 'not_found' || m.code === 'started')) { net.session = null; saveSession(null); emit('lost', m); }
      emit(m.t, m);
    };
    sock.onclose = () => { if (ws !== sock) return; clearInterval(pingT); ws = null; if (want) retry(); else setState('idle'); };
    sock.onerror = () => {};
  }
  function retry() { tries++; setState('reconnecting'); timer = setTimeout(open, Math.min(8000, 400 * 2 ** Math.min(tries, 5))); }
  function ping() { net.send({ t: 'ping', c: Date.now() }); }
  net.connect = () => new Promise((res) => {
    want = true; if (ws && ws.readyState === 1) return res(true);
    const off = net.on('open', () => { off(); res(true); }); if (!ws) open();
  });
  net.close = () => { want = false; clearTimeout(timer); clearInterval(pingT); net.session = null; if (ws) { try { ws.close(); } catch (e) {} ws = null; } setState('idle'); };
  // عند رجوع التبويب للواجهة أو رجوع الشبكة: حاول فورًا بدل انتظار المؤقت
  const kick = () => { if (want && !ws) { clearTimeout(timer); open(); } };
  window.addEventListener('online', kick); document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  return net;
}

const KEY = 'j3:session';
export function saveSession(s) { try { if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY); } catch (e) {} }
export function loadSession() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
