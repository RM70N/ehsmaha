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
  function toast(title, body) {
    try {
      var box = document.getElementById('ehs-app-toasts');
      if (!box) {
        box = document.createElement('div'); box.id = 'ehs-app-toasts';
        box.style.cssText = 'position:fixed;inset-inline-start:18px;bottom:18px;z-index:2147483000;display:flex;flex-direction:column;gap:10px;direction:rtl;font-family:inherit';
        document.body.appendChild(box);
      }
      var t = document.createElement('div');
      t.style.cssText = 'min-width:260px;max-width:400px;background:#170B2D;color:#F8F7FC;border:1px solid rgba(167,139,250,.35);border-inline-start:4px solid #7C3AED;border-radius:12px;padding:12px 14px;box-shadow:0 12px 34px rgba(0,0,0,.5);font-size:14px;line-height:1.7';
      var b = document.createElement('b'); b.textContent = title; t.appendChild(b);
      if (body) { var p = document.createElement('div'); p.textContent = body; p.style.color = '#DDD1FF'; t.appendChild(p); }
      t.addEventListener('click', function () { t.remove(); });
      box.appendChild(t); setTimeout(function () { t.remove(); }, 20000);
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

