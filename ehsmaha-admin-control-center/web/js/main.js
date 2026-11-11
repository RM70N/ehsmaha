import { api, get, post, setCsrf, setAuthLost } from './api.js';
import { esc, icon, $, $$, toast, fmtN } from './ui.js';
import { pageOverview, pageSection, pageSearch, pageIntegrationMap } from './pages.js';

const app = $('#app');
let me = null;
const nav = (h) => { location.hash = h; };

// ================= تسجيل الدخول =================
function renderLogin(msg = '') {
  setCsrf(''); me = null; document.title = 'EHSEMHA — تسجيل الدخول';
  app.innerHTML = `<main class="login"><div class="login-card">
    <div class="brand"><div class="brand-mark">${icon('shield')}</div><div><div class="brand-name">EHSEMHA</div><div class="brand-sub">ADMIN CONTROL CENTER</div></div></div>
    <h1>مركز إدارة احسمها</h1><p class="lead">دخول حصري — حسابان فقط. لا يوجد تسجيل أو استعادة حساب.</p>
    ${msg ? `<div class="form-error" role="alert">${esc(msg)}</div>` : ''}
    <div class="acct-btns" role="group" aria-label="اختر الحساب">
      <button class="acct" data-a="owner" aria-pressed="false"><span class="ic">${icon('badge')}</span><span><b>دخول المالك</b><small>كل الصلاحيات + التحكم بصلاحيات الأدمن</small></span></button>
      <button class="acct" data-a="admin" aria-pressed="false"><span class="ic">${icon('user')}</span><span><b>دخول الأدمن</b><small>بحسب ما يسمح به المالك</small></span></button>
    </div>
    <form class="login-form hidden" id="lf" autocomplete="off"><div class="field"><label for="pw" id="pwl">كلمة المرور</label><input class="input ltr" id="pw" type="password" autocomplete="current-password" required maxlength="256"></div><div class="form-error hidden" id="le" role="alert"></div><button class="btn primary" type="submit" id="lb">${icon('lock')}<span>دخول</span></button></form>
    <div class="login-foot">اتصال مشفّر · جلسة HttpOnly · محاولات الدخول مسجّلة</div></div></main>`;
  let acct = null;
  $$('.acct').forEach((b) => b.addEventListener('click', () => { acct = b.dataset.a; $$('.acct').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); $('#lf').classList.remove('hidden'); $('#pwl').textContent = `كلمة مرور ${acct === 'owner' ? 'المالك' : 'الأدمن'}`; $('#pw').focus(); }));
  $('#lf').addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = $('#lb'); const err = $('#le'); err.classList.add('hidden'); btn.disabled = true; btn.querySelector('span').textContent = 'جارٍ التحقق…';
    try { const r = await post('/api/auth/login', { account: acct, password: $('#pw').value }); $('#pw').value = ''; setCsrf(r.csrf); await boot(); nav('#/hub'); }
    catch (ex) { err.textContent = ex.status === 429 ? ex.message : ex.code === 'BAD_CREDENTIALS' ? 'بيانات الدخول غير صحيحة' : ex.message; err.classList.remove('hidden'); $('#pw').select(); }
    finally { btn.disabled = false; btn.querySelector('span').textContent = 'دخول'; }
  });
}

// ================= مركز القيادة (البطاقتان) =================
function renderHub() {
  document.title = 'EHSEMHA — مركز القيادة';
  const has = (w) => me.workspaces.includes(w);
  const cnt = (w) => me.sections.filter((s) => s.workspace === w).length;
  app.innerHTML = `<main class="hub"><div class="hub-top"><div class="brand"><div class="brand-mark">${icon('shield')}</div><div><div class="brand-name">EHSEMHA</div><div class="brand-sub">ADMIN CONTROL CENTER</div></div></div><div class="hub-extra"><span class="chip violet">${esc(me.account.display)}</span><button class="btn sm" id="lo">${icon('logout')}<span>تسجيل الخروج</span></button></div></div>
    <div class="hub-wrap"><h1>أهلاً ${esc(me.account.display)}</h1><p class="lead">اختر مساحة العمل. يمكنك الرجوع إلى هنا في أي وقت دون تسجيل خروج.</p>
    <div class="hub-cards">
      ${has('website') ? `<button class="hcard web" data-go="#/w/website"><span class="tag">EHSEMHA WEBSITE CONTROL</span><h2>التحكم بالموقع</h2><p>اللاعبون، الستريمرز، الألعاب، الفعاليات، المتجر، الأكواد، الرسائل، والتحليلات — على بيانات الموقع الفعلية.</p><span class="meta"><span>${cnt('website')} أقسام</span></span><span class="go">${icon('chev')}</span></button>` : ''}
      ${has('discord') ? `<button class="hcard dis" data-go="#/w/discord"><span class="tag">DISCORD &amp; BOT CONTROL</span><h2>ديسكورد والبوت</h2><p>السيرفر، الأعضاء، أوامر البوت، الحماية، التكتات، الترحيب، ستريمرات الإعلان.</p><span class="meta"><span>${cnt('discord')} أقسام</span></span><span class="go">${icon('chev')}</span></button>` : ''}
    </div>
    <div class="hub-extra"><button class="btn" data-go="#/overview">${icon('activity')}<span>مركز القيادة والمؤشرات</span></button>${me.sections.some((s) => s.id === 'audit') ? `<button class="btn" data-go="#/audit">${icon('file')}<span>سجل التدقيق</span></button>` : ''}${me.sections.some((s) => s.id === 'health') ? `<button class="btn" data-go="#/s/health/now">${icon('activity')}<span>صحة الأنظمة</span></button>` : ''}${me.sections.some((s) => s.id === 'integration') ? `<button class="btn" data-go="#/s/integration/links">${icon('link')}<span>مركز التكامل</span></button>` : ''}${me.sections.some((s) => s.id === 'security') ? `<button class="btn" data-go="#/s/security/sessions">${icon('shield')}<span>الأمان</span></button>` : ''}${me.account.role === 'owner' ? `<button class="btn" data-go="#/s/access/matrix">${icon('lock')}<span>صلاحيات الأدمن</span></button>` : ''}</div>
    ${!me.workspaces.some((w) => w !== 'control') ? '<div class="errbox warn">أخفى المالك مساحات العمل عن حسابك حالياً.</div>' : ''}</div></main>`;
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => nav(b.dataset.go)));
  $('#lo').addEventListener('click', logout);
}

async function logout() { try { await post('/api/auth/logout'); } catch { /* */ } renderLogin('تم تسجيل الخروج.'); nav('#/login'); }

// ================= الهيكل =================
const WS_LABEL = { website: 'التحكم بالموقع', discord: 'ديسكورد والبوت', control: 'مركز التحكم' };
function shell(ws, activeSec, crumbs, build) {
  const mini = localStorage.getItem('ecc-mini') === '1';
  const groups = ws === 'control' ? [['website'], ['discord'], ['control']] : [[ws], ['control']];
  const items = (w) => me.sections.filter((s) => s.workspace === w);
  app.innerHTML = `<div class="shell ${mini ? 'mini' : ''}" id="shell"><aside class="side" id="side" aria-label="القائمة الجانبية"><div class="side-head"><div class="brand-mark">${icon('shield')}</div><div class="brand-name">EHSEMHA</div></div>
    <nav class="side-nav"><a class="nav-item" href="#/hub">${icon('hubi')}<span>مركز القيادة</span></a><a class="nav-item" href="#/overview" ${activeSec === '_overview' ? 'aria-current="page"' : ''}>${icon('activity')}<span>المؤشرات</span></a>
    ${groups.filter(([w]) => items(w).length).map(([w]) => `<div class="nav-group">${WS_LABEL[w]}</div>${items(w).map((s) => `<a class="nav-item" href="#/s/${s.id}" ${activeSec === s.id ? 'aria-current="page"' : ''} title="${esc(s.label)}">${icon(s.icon)}<span>${esc(s.label)}</span>${s.actionCount ? `<span class="cnt">${s.actionCount}</span>` : ''}</a>`).join('')}`).join('')}
    ${items('control').length === 0 && ws !== 'control' ? '' : ''}</nav></aside><div class="scrim-side" id="ss"></div>
    <div class="main"><header class="top"><button class="btn ghost icon menu-btn" id="mb" aria-label="القائمة">${icon('menu')}</button><button class="btn ghost icon hide-m" id="mini" aria-label="طيّ القائمة">${icon('menu')}</button>
      <div class="crumbs"><a href="#/hub" class="hide-m">الرئيسية</a><span class="hide-m">/</span>${crumbs.map((c, i) => (i < crumbs.length - 1 ? `<a href="${c[1]}" class="hide-m">${esc(c[0])}</a><span class="hide-m">/</span>` : `<b>${esc(c[0])}</b>`)).join('')}</div><div class="grow"></div>
      <form class="gsearch" id="gs" role="search"><span class="i">${icon('search')}</span><input class="input" id="gq" type="search" placeholder="بحث شامل…" aria-label="بحث شامل" maxlength="100"></form>
      <a class="btn ghost icon bell" href="#/s/alerts/open" aria-label="التنبيهات">${icon('bell')}<span class="dot hidden" id="bd"></span></a>
      <span class="chip violet hide-m">${esc(me.account.display)}</span><button class="btn ghost icon" id="lo" aria-label="تسجيل الخروج">${icon('logout')}</button></header>
      <main class="content" id="content"></main></div></div>`;
  $('#mini').addEventListener('click', () => { const s = $('#shell'); s.classList.toggle('mini'); localStorage.setItem('ecc-mini', s.classList.contains('mini') ? '1' : '0'); });
  const side = $('#side'), ss = $('#ss'); const toggle = (o) => { side.classList.toggle('open', o); ss.classList.toggle('open', o); };
  $('#mb').addEventListener('click', () => toggle(true)); ss.addEventListener('click', () => toggle(false)); $$('.nav-item', side).forEach((a) => a.addEventListener('click', () => toggle(false)));
  $('#gs').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#gq').value.trim(); if (q.length >= 2) nav(`#/search?q=${encodeURIComponent(q)}`); });
  $('#lo').addEventListener('click', logout);
  get('/api/overview').then((d) => { const n = d.alerts.open; const b = $('#bd'); if (b && n) { b.textContent = n > 9 ? '9+' : n; b.classList.remove('hidden'); } }).catch(() => {});
  build($('#content'));
}

// ================= الموجّه =================
async function route() {
  if (!me) return;
  const h = location.hash.replace(/^#/, '') || '/hub';
  const [path, qs] = h.split('?'); const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(qs || '');
  try {
    if (!parts.length || parts[0] === 'hub' || parts[0] === 'login') return renderHub();
    if (parts[0] === 'overview') return shell('control', '_overview', [['مركز القيادة', '#/overview']], (c) => pageOverview(c, me));
    if (parts[0] === 'search') return shell('control', '_s', [['بحث', '#/search']], (c) => pageSearch(c, me, params.get('q') || ''));
    if (parts[0] === 'audit') return nav('#/s/audit/log');
    if (parts[0] === 'w') { const ws = parts[1]; const first = me.sections.find((s) => s.workspace === ws); if (!first) return renderHub(); return nav(`#/s/${first.id}`); }
    if (parts[0] === 's') {
      const sec = me.sections.find((s) => s.id === parts[1]);
      if (!sec) return shell('control', '', [['غير متاح', '#/hub']], (c) => { c.innerHTML = `<div class="errbox">هذا القسم غير متاح لحسابك.</div>`; });
      const tab = parts[2];
      document.title = `${sec.label} — EHSEMHA`;
      return shell(sec.workspace, sec.id, [[WS_LABEL[sec.workspace], `#/w/${sec.workspace}`], [sec.label, `#/s/${sec.id}`]], async (c) => { await pageSection(c, me, sec.id, tab); if (sec.id === 'integration' && (!tab || tab === 'links')) pageIntegrationMap($('#tab-body', c) || c); });
    }
    renderHub();
  } catch (e) { toast(e.message, 'bad'); }
}

async function boot() {
  const r = await get('/api/me'); me = r; setCsrf(r.csrf);
}
window.addEventListener('hashchange', route);

setAuthLost((msg) => { me = null; renderLogin(msg); });
(async () => {
  try { const st = await get('/api/auth/state'); if (!st.authenticated) return renderLogin(); await boot(); route(); }
  catch { renderLogin(); }
})();

// تنبيه عند مغادرة الصفحة وفيها نموذج تغييراته غير محفوظة
window.addEventListener('beforeunload', (e) => { if ($('.scrim .modal form') && [...$$('.scrim .modal form input,.scrim .modal form textarea')].some((i) => i.value && i.type !== 'checkbox' && !i.disabled)) { e.preventDefault(); e.returnValue = ''; } });
