/*
 * استقبال رمز دخول تطبيق احسمها لويندوز.
 * عندما يطلب المستخدم رمزاً من التطبيق (بكتابة يوزره)، يدفع الخادم الرمز لجلسات هذا الحساب
 * المفتوحة هنا فقط، فيظهر في منتصف الشاشة بخط كبير. لا يغيّر أي منطق آخر بالموقع.
 * الاتصال WebSocket مصادَق بتوكن Firebase بأول رسالة (لا توكن في الرابط) ويعيد الاتصال تلقائياً.
 */
(function () {
  if (window.__ehsDesktopLink) return;
  var WS_URL = (window.EHS_DESKTOP_LINK_API || 'wss://ehsmaha-piratetok-bridge.onrender.com') + '/desktop-auth/ws';
  var ws = null, retry = 0, timer = null, currentUser = null, modal = null, tick = null;

  function css() {
    if (document.getElementById('ehs-dl-style')) return;
    var st = document.createElement('style'); st.id = 'ehs-dl-style';
    st.textContent = '#ehs-dl{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;background:rgba(7,4,13,.82);backdrop-filter:blur(6px);font-family:inherit;direction:rtl}' +
      '#ehs-dl.on{display:flex}#ehs-dl .c{width:min(92vw,520px);background:#170B2D;border:1px solid rgba(167,139,250,.35);border-radius:20px;padding:34px 24px;text-align:center;color:#F8F7FC;box-shadow:0 24px 80px rgba(0,0,0,.6)}' +
      '#ehs-dl h2{margin:0 0 6px;font-size:20px}#ehs-dl p{margin:0 0 14px;color:#A78BFA;font-size:14px;line-height:1.8}' +
      '#ehs-dl .code{font-family:Consolas,monospace;font-size:clamp(40px,12vw,68px);font-weight:800;letter-spacing:8px;direction:ltr;background:#07040D;border:2px dashed #7C3AED;border-radius:16px;padding:20px 8px;margin:6px 0 14px;user-select:all}' +
      '#ehs-dl .t{font-size:13px;color:#A78BFA;margin-bottom:14px}#ehs-dl button{border:0;border-radius:10px;padding:11px 22px;font-size:15px;font-weight:700;background:#5B21B6;color:#fff;cursor:pointer;font-family:inherit}#ehs-dl button:hover{background:#7C3AED}';
    document.head.appendChild(st);
  }
  function build() {
    if (modal) return modal;
    css();
    modal = document.createElement('div'); modal.id = 'ehs-dl'; modal.setAttribute('role', 'alertdialog'); modal.setAttribute('aria-live', 'assertive');
    modal.innerHTML = '<div class="c"><h2>رمز الدخول لتطبيق احسمها</h2><p>اكتب هذا الرمز في التطبيق لتسجيل الدخول بحسابك.</p><div class="code" id="ehs-dl-code"></div><div class="t" id="ehs-dl-t"></div><p style="font-size:12px;margin-bottom:14px">ما طلبت هذا الرمز؟ تجاهله ولا تشاركه مع أحد.</p><button type="button" id="ehs-dl-x">إغلاق</button></div>';
    document.body.appendChild(modal);
    modal.querySelector('#ehs-dl-x').addEventListener('click', hide);
    return modal;
  }
  function hide() { if (modal) modal.classList.remove('on'); clearInterval(tick); }
  function show(code, secs) {
    build();
    var c = String(code || '').toUpperCase();
    modal.querySelector('#ehs-dl-code').textContent = c.slice(0, 4) + '-' + c.slice(4);
    var left = Math.max(1, Number(secs) || 120), t = modal.querySelector('#ehs-dl-t');
    clearInterval(tick);
    var paint = function () { t.textContent = left > 0 ? 'ينتهي الرمز خلال ' + left + ' ثانية' : 'انتهى الرمز'; if (left <= 0) { hide(); } left--; };
    paint(); tick = setInterval(paint, 1000);
    modal.classList.add('on');
  }
  function clean() { if (ws) { try { ws.onclose = null; ws.close(); } catch (e) {} ws = null; } clearTimeout(timer); }
  function connect() {
    clean();
    if (!currentUser) return;
    var user = currentUser;
    try { ws = new WebSocket(WS_URL); } catch (e) { return schedule(); }
    ws.onopen = async function () {
      try { var tok = await user.getIdToken(); ws.send(JSON.stringify({ type: 'auth', token: tok })); } catch (e) { try { ws.close(); } catch (e2) {} }
    };
    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m && m.type === 'ready') retry = 0;
      if (m && m.type === 'code' && typeof m.code === 'string' && /^[A-Z0-9]{8}$/.test(m.code)) show(m.code, m.expiresInSec);
    };
    ws.onclose = function (ev) { if (ev && ev.code === 4004) return; schedule(); };
    ws.onerror = function () {};
  }
  function schedule() { clearTimeout(timer); if (!currentUser) return; retry = Math.min(retry + 1, 8); timer = setTimeout(connect, Math.min(60000, 2000 * Math.pow(2, retry - 1)) + Math.random() * 1000); }

  function start() {
    var fb = window.__fb; if (!fb || !fb.auth || typeof fb.onAuthStateChanged !== 'function') return;
    window.__ehsDesktopLink = true;
    fb.onAuthStateChanged(fb.auth, function (u) { currentUser = u || null; if (u) { retry = 0; connect(); } else { clean(); hide(); } });
  }
  if (window.__fb) start(); else window.addEventListener('fb-ready', start, { once: true });
})();

/*
 * حضور تطبيق احسمها لويندوز + استقبال إشعارات/رسائل المالك — لكل إصدارات التطبيق (1.1.0 وما بعد) بدون تحديث EXE:
 * هذا الملف جزء من محتوى الموقع فيصل التطبيقات تلقائياً بمزامنة المحتوى. التطبيق 1.1.3+ يملك اتصالاً أصلياً
 * (data-ehs-native="1") فيتوقف هذا العميل عنه لتفادي العدّ المزدوج. لا يعمل بالمتصفح العادي.
 */
(function () {
  var D = window.ehsmahaDesktop;
  if (!D || !D.isDesktopApp || window.__ehsAppPresence) return;
  window.__ehsAppPresence = true;
  var API = (window.EHS_APP_LINK_API || 'wss://ehsmaha-piratetok-bridge.onrender.com') + '/desktop-app/ws';
  var ws = null, retry = 0, timer = null, version = '', seen = {};

  function installId() {
    try {
      var id = localStorage.getItem('ehs_app_install_id');
      if (!/^[a-f0-9]{32}$/.test(id || '')) { var a = new Uint8Array(16); crypto.getRandomValues(a); id = Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); localStorage.setItem('ehs_app_install_id', id); }
      return id;
    } catch (e) { return ''; }
  }
  var TOAST_CSS = '#ehs-app-toasts{position:fixed;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;gap:12px;align-items:center;width:min(520px,calc(100vw - 32px));direction:rtl;font-family:inherit;pointer-events:none}' +
    '#ehs-app-toasts.top{top:22px}#ehs-app-toasts.center{top:50%;transform:translate(-50%,-50%)}#ehs-app-toasts.bottom{bottom:26px}' +
    '.ehs-t{--a:#F5C451;--b:#7C3AED;position:relative;pointer-events:auto;width:100%;overflow:hidden;display:flex;align-items:center;gap:14px;padding:16px 18px 20px;border-radius:18px;color:#F8F7FC;cursor:pointer;background:linear-gradient(135deg,rgba(36,18,72,.94),rgba(18,9,38,.96));-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);box-shadow:0 0 0 1px rgba(167,139,250,.28),0 18px 50px rgba(8,3,22,.65),0 0 38px -8px var(--b);animation:ehsIn .46s cubic-bezier(.2,.9,.25,1.15) both}' +
    '#ehs-app-toasts.bottom .ehs-t{animation-name:ehsInUp}#ehs-app-toasts.center .ehs-t{animation-name:ehsPop;padding:22px 24px 26px}' +
    '.ehs-t.ehs-out{animation:ehsOut .26s ease-in both!important}' +
    '.ehs-t:before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;background:linear-gradient(120deg,var(--a),transparent 38%,transparent 62%,#F5C451);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:.8}' +
    '.ehs-t:after{content:"";position:absolute;top:0;bottom:0;width:38%;left:-50%;pointer-events:none;background:linear-gradient(100deg,transparent,rgba(255,255,255,.14),transparent);transform:skewX(-18deg);animation:ehsShine 1.1s .35s ease-out 1 both}' +
    '.ehs-ic{flex:none;width:46px;height:46px;border-radius:14px;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,var(--b),var(--a));box-shadow:0 6px 18px -4px var(--b),inset 0 1px 0 rgba(255,255,255,.35);animation:ehsRing 1.2s .45s ease-in-out 1 both}' +
    '.ehs-ic svg{width:24px;height:24px}.ehs-bd{flex:1;min-width:0}.ehs-br{display:block;font-size:11px;font-weight:700;letter-spacing:.6px;color:var(--a)}' +
    '.ehs-tt{font-size:15.5px;font-weight:800;line-height:1.5}.ehs-dd{margin-top:2px;font-size:13.5px;line-height:1.75;color:#D9CEFA;overflow-wrap:anywhere}' +
    '#ehs-app-toasts.center .ehs-tt{font-size:18px}#ehs-app-toasts.center .ehs-dd{font-size:15px}' +
    '.ehs-x{flex:none;width:30px;height:30px;border:0;border-radius:9px;background:rgba(255,255,255,.07);color:#C4B5FD;font-size:18px;line-height:1;cursor:pointer}.ehs-x:hover{background:rgba(255,255,255,.16);color:#fff}' +
    '.ehs-bar{position:absolute;inset-inline:0;bottom:0;height:3px;background:rgba(255,255,255,.08)}.ehs-bar i{display:block;height:100%;transform-origin:right center;background:linear-gradient(270deg,var(--a),var(--b));animation:ehsDrain 20s linear forwards}.ehs-t:hover .ehs-bar i{animation-play-state:paused}' +
    '@keyframes ehsIn{from{transform:translateY(-34px) scale(.94);opacity:0;filter:blur(6px)}to{transform:none;opacity:1;filter:none}}@keyframes ehsInUp{from{transform:translateY(34px) scale(.94);opacity:0;filter:blur(6px)}to{transform:none;opacity:1;filter:none}}' +
    '@keyframes ehsPop{from{transform:scale(.82);opacity:0;filter:blur(8px)}to{transform:none;opacity:1;filter:none}}@keyframes ehsOut{to{transform:translateY(-14px) scale(.96);opacity:0}}' +
    '@keyframes ehsShine{from{left:-50%}to{left:130%}}@keyframes ehsRing{0%,100%{transform:rotate(0)}20%{transform:rotate(-14deg)}40%{transform:rotate(11deg)}60%{transform:rotate(-7deg)}80%{transform:rotate(4deg)}}@keyframes ehsDrain{from{transform:scaleX(1)}to{transform:scaleX(0)}}' +
    '@media (prefers-reduced-motion:reduce){.ehs-t,.ehs-t:after,.ehs-ic,.ehs-bar i{animation:none!important}}';
  var BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
  function toast(title, body) {
    try {
      if (!document.getElementById('ehs-app-toasts-css')) { var st = document.createElement('style'); st.id = 'ehs-app-toasts-css'; st.textContent = TOAST_CSS; document.head.appendChild(st); }
      var pos = document.documentElement.getAttribute('data-ehs-toastpos'); if (pos !== 'center' && pos !== 'bottom') pos = 'top';
      var box = document.getElementById('ehs-app-toasts');
      if (!box) { box = document.createElement('div'); box.id = 'ehs-app-toasts'; document.body.appendChild(box); }
      box.className = pos;
      var t = document.createElement('div'); t.className = 'ehs-t'; t.setAttribute('role', 'status');
      var ic = document.createElement('div'); ic.className = 'ehs-ic'; ic.innerHTML = BELL; t.appendChild(ic);
      var bd = document.createElement('div'); bd.className = 'ehs-bd';
      var br = document.createElement('span'); br.className = 'ehs-br'; br.textContent = 'احسمها'; bd.appendChild(br);
      var tt = document.createElement('div'); tt.className = 'ehs-tt'; tt.textContent = title; bd.appendChild(tt);
      if (body) { var dd = document.createElement('div'); dd.className = 'ehs-dd'; dd.textContent = body; bd.appendChild(dd); }
      t.appendChild(bd);
      var x = document.createElement('button'); x.type = 'button'; x.className = 'ehs-x'; x.setAttribute('aria-label', 'إغلاق'); x.textContent = '×'; t.appendChild(x);
      var bar = document.createElement('div'); bar.className = 'ehs-bar'; bar.appendChild(document.createElement('i')); t.appendChild(bar);
      function close() { if (t.__g) return; t.__g = 1; t.classList.add('ehs-out'); setTimeout(function () { t.remove(); }, 260); }
      t.addEventListener('click', close); bar.firstChild.addEventListener('animationend', close);
      box.appendChild(t);
    } catch (e) {}
  }
  function osNotify(title, body) {
    try {
      if (typeof Notification === 'function' && Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) new Notification(title, { body: body || '' });
    } catch (e) {}
  }
  function onMsg(m) {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'notify' && typeof m.id === 'string' && typeof m.title === 'string' && !seen[m.id]) {
      seen[m.id] = 1; var title = m.title.slice(0, 80), body = String(m.body || '').slice(0, 240);
      toast(title, body); osNotify(title, body);
    } else if (m.type === 'config' && m.config) {
      var c = m.config;
      document.documentElement.setAttribute('data-ehs-code-login', c.codeLoginEnabled === false ? '0' : '1');
      if (c.motd && c.motd.active && c.motd.text) { try { if (localStorage.getItem('ehs_motd_seen') !== c.motd.id) { localStorage.setItem('ehs_motd_seen', c.motd.id); toast('رسالة من احسمها', String(c.motd.text).slice(0, 300)); } } catch (e) {} }
    }
  }
  function open() {
    clearTimeout(timer);
    var id = installId(); if (!id) return;
    try { ws = new WebSocket(API); } catch (e) { return sched(); }
    ws.onopen = function () { ws.send(JSON.stringify({ type: 'hello', installId: id, version: version, platform: 'win32' })); };
    ws.onmessage = function (ev) { retry = 0; try { onMsg(JSON.parse(ev.data)); } catch (e) {} };
    ws.onclose = function () { ws = null; sched(); };
    ws.onerror = function () {};
  }
  function sched() { retry = Math.min(retry + 1, 8); timer = setTimeout(open, Math.min(60000, 2000 * Math.pow(2, retry - 1)) + Math.random() * 1000); }

  // ننتظر قليلاً: إن كان للتطبيق اتصال أصلي (1.1.3+) نتوقف.
  setTimeout(function () {
    if (document.documentElement.getAttribute('data-ehs-native') === '1') return;
    Promise.resolve(typeof D.getInfo === 'function' ? D.getInfo() : null).then(function (i) { version = (i && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(i.version)) ? i.version : ''; if (window.EHS_APP_VERSION_OVERRIDE) version = window.EHS_APP_VERSION_OVERRIDE; /* للاختبارات فقط */ }, function () {}).then(function () {
      // 1.1.3 وما بعد لها اتصال أصلي بالتطبيق نفسه (حتى لو لم يصل وسم data-ehs-native بعد) ⇒ لا نعدّها مرتين.
      var p = version.split('.').map(Number); if (p.length === 3 && (p[0] > 1 || (p[0] === 1 && (p[1] > 1 || (p[1] === 1 && p[2] >= 3))))) return;
      open();
    });
  }, 4000);
})();

