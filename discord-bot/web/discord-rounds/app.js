import { h, avatar, toast, setClockOffset, serverNow, fill } from './dom.js';
import { createLobby } from './lobby.js';
import { createElimination } from './elimination.js';
import { createSniper } from './sniper.js';

// المتحكم الرئيسي: اتصال WebSocket واحد بالراوند، والخادم هو مصدر الحالة الوحيد.
// العميل ما يغيّر شي محلياً — يرسل حركات ويعرض اللي يرجع من الخادم.
const app = document.getElementById('app');
const parts = location.pathname.split('/').filter(Boolean);
const watchMode = parts[1] === 'watch';
const roundId = parts[2];

const ERR = {
  NOT_YOUR_TURN: 'ليس دورك الآن', EXPIRED: 'انتهى وقت هذا الإجراء', BAD_TARGET: 'اختيار غير صالح', TAKEN: 'هذا المربع محجوز',
  BAD_BOX: 'مربع غير صالح', NO_AMMO: 'انتهت ذخيرة السلاح', BAD_COUNT: 'عدد المربعات غير صحيح', NOT_SNIPER: 'للقناص فقط', NOT_PLAYER: 'لست لاعباً في الراوند'
};

let view = null; let ws = null; let screen = null; let lastSeq = 0; let ended = false; let retry = 0; let conn = 'connecting';
let session = null;

const api = {
  async call(kind, body = {}, opts = {}) {
    try {
      const res = await fetch(`/api/rounds/${roundId}/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ehsmaha-round' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { toast((j.error && j.error.message) || 'تعذّر تنفيذ الطلب', true); return false; }
      if (opts.leaving) sessionStorage.setItem(`left:${roundId}`, '1');
      if (kind === 'join') sessionStorage.removeItem(`left:${roundId}`);
      return true;
    } catch { toast('تعذّر الاتصال بالخادم', true); return false; }
  },
  act(type, payload) {
    if (!ws || ws.readyState !== 1) return toast('الاتصال مقطوع — جاري إعادة الاتصال', true);
    const reqId = Math.random().toString(36).slice(2);
    pending.set(reqId, true);
    ws.send(JSON.stringify({ t: 'act', reqId, type, payload }));
    return undefined;
  },
  rerender() { if (view) render(); }
};
const pending = new Map();

const topbar = () => h('header', { class: 'top' },
  h('div', { class: 'brand' }, h('b', { text: '★' }), h('div', {}, 'احسمها', h('small', { text: watchMode ? 'وضع المشاهدة' : 'راوند ديسكورد' }))),
  h('span', { class: `live${conn === 'open' ? '' : conn === 'closed' ? ' dead' : ' off'}` }, h('i'), conn === 'open' ? 'مباشر' : conn === 'closed' ? 'غير متصل' : 'جاري الاتصال…'));

function shell(...content) {
  fill(app, topbar(), ...content);
  screen = null;
}

function centerCard(title, text, ...extra) {
  return h('div', { class: 'center card' }, h('h1', { text: title }), text ? h('p', { text }) : null, ...extra);
}

function loginScreen(info) {
  const dest = `/auth/discord/login?round=${encodeURIComponent(roundId)}`;
  shell(centerCard(info ? `${info.game.emoji} ${info.game.name}` : 'راوند احسمها', info ? `راوند ${info.host ? `${info.host.name} ` : ''}— ${info.players} / ${info.maxPlayers} لاعبين` : 'سجّل الدخول بحساب ديسكورد للانضمام.',
    h('p', { class: 'note', text: 'نستخدم حساب ديسكورد فقط لمعرفة اسمك وصورتك — بدون صلاحيات إضافية.' }),
    h('a', { class: 'btn discord big', href: dest }, 'تسجيل الدخول بديسكورد'),
    h('a', { class: 'note', href: `/discord/watch/${roundId}` }, 'أو شاهد الراوند بدون تسجيل')));
}

function endedScreen(title, text) {
  shell(centerCard(title, text));
}

function resultCard(v) {
  const r = v.result || {};
  const winners = r.winners || [];
  const hasWinner = winners.length > 0;
  const list = h('div', { class: 'winners' }, winners.slice(0, 10).map((w) => h('div', { class: 'winner' }, avatar(v.players.find((p) => p.id === w.id) || w, 'xl'), h('b', { text: (v.players.find((p) => p.id === w.id) || {}).name || '' }))));
  const extra = [];
  if (r.winnerCountry) extra.push(h('div', { class: 'banner' }, h('div', { class: 'flag', text: r.winnerCountry.flag }), h('div', { class: 'big', text: `دولة الفائز: ${r.winnerCountry.name}` })));
  if (v.gameType === 'sniper') extra.push(h('p', { class: 'note', text: `الطلقات ${r.shots || 0} · الإصابات ${r.hits || 0}` }));
  return h('div', { class: 'card center' },
    h('h1', { text: hasWinner ? (r.outcome === 'sniper' ? 'فاز القناص!' : r.outcome === 'survivors' ? 'فاز الناجون!' : 'لدينا فائز!') : 'انتهى الراوند بدون فائز' }),
    hasWinner ? list : h('p', { text: r.reason === 'inactive' ? 'ما أحد اختار كذا مرة ورا بعض.' : r.reason === 'aborted' ? 'غادر القناص السيرفر.' : '' }),
    ...extra,
    h('p', { class: 'note', text: `عدد المشاركين: ${r.participants || v.players.length} — ارجع لديسكورد وابدأ راوند جديد` }));
}

function ensure(kind, factory) {
  if (screen && screen.kind === kind) return screen;
  app.replaceChildren(topbar());
  screen = factory();
  app.append(screen.root);
  return screen;
}

function render() {
  const v = view;
  if (!v) return;
  document.title = `احسمها | ${v.game.name}`;
  if (v.me.kicked) return endedScreen('تم طردك من الراوند', 'صاحب الراوند طردك، وما تقدر تدخل نفس الراوند مرة ثانية.');
  if (v.status === 'cancelled') return endedScreen('أُلغي الراوند', 'ارجع لديسكورد وابدأ راوند جديد.');
  if (v.status === 'waiting' || v.status === 'starting') {
    if (!v.me.id && !watchMode) { return loginScreen({ game: v.game, host: v.host, players: v.players.length, maxPlayers: v.maxPlayers }); }
    ensure('lobby', () => createLobby(api)).update(v);
    // دخول تلقائي بعد تسجيل الدخول (إلا لو خرج بنفسه)
    if (v.me.id && !v.me.isPlayer && v.status === 'waiting' && !watchMode && !sessionStorage.getItem(`left:${roundId}`) && !autoJoining) { autoJoining = true; api.call('join').finally(() => { autoJoining = false; }); }
    return undefined;
  }
  const key = v.gameType === 'sniper' ? 'sniper' : v.gameType;
  const s = ensure(key, () => (v.gameType === 'sniper' ? createSniper(api) : createElimination(api, v.gameType)));
  s.update(v);
  const existing = app.querySelector('.resultcard');
  if (v.status === 'finished') {
    if (!existing) { const rc = resultCard(v); rc.classList.add('resultcard'); app.append(rc); }
  } else if (existing) existing.remove();
  return undefined;
}
let autoJoining = false;

function onMessage(ev) {
  let m; try { m = JSON.parse(ev.data); } catch { return; }
  if (m.t === 'kicked') { ended = true; view = { ...view, me: { ...view.me, kicked: true } }; return render(); }
  if (m.t === 'ack') { pending.delete(m.reqId); if (!m.ok) toast(ERR[m.error] || 'تعذّر تنفيذ الحركة', true); return undefined; }
  if (m.t !== 'state') return undefined;
  setClockOffset(m.state.serverNow - Date.now());
  const first = !view || m.hello;
  view = m.state;
  if (first) lastSeq = view.seq; // ما نعيد أحداث قديمة كأنها تحدث الحين
  else lastSeq = Math.max(lastSeq, view.seq);
  render();
  return undefined;
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const qs = new URLSearchParams();
  if (watchMode) qs.set('watch', '1');
  if (lastSeq) qs.set('since', String(lastSeq));
  conn = 'connecting';
  ws = new WebSocket(`${proto}//${location.host}/ws/rounds/${roundId}${qs.size ? `?${qs}` : ''}`);
  ws.addEventListener('open', () => { retry = 0; conn = 'open'; refreshBar(); });
  ws.addEventListener('message', onMessage);
  ws.addEventListener('close', (e) => {
    conn = 'closed'; refreshBar();
    if (ended || e.code === 4003) return;
    if (e.code === 4004) return endedScreen('الراوند غير موجود', 'ربما انتهى الراوند أو الرابط غير صحيح.');
    if (view && (view.status === 'finished' || view.status === 'cancelled')) return;
    setTimeout(connect, Math.min(5000, 400 * 2 ** retry++)); // إعادة اتصال تدريجية
  });
  setInterval(() => ws && ws.readyState === 1 && ws.send('{"t":"ping"}'), 20000);
}
function refreshBar() { const old = app.querySelector('.top'); if (old) old.replaceWith(topbar()); }

(async function boot() {
  if (!/^[A-Za-z0-9_-]{22}$/.test(roundId || '')) return endedScreen('رابط غير صحيح', 'تأكد من رابط الراوند.');
  try {
    const r = await fetch('/api/session', { cache: 'no-store' }); session = (await r.json()).data.user;
  } catch { /* نكمل كمشاهد */ }
  connect();
})();
