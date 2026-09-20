// ==================== نواة التطبيق — تجميع كل الأجزاء ====================
import { AdminFB } from './firebase.js';
import { AdminAuth } from './auth.js';
import { AdminRouter } from './router.js';
import { AdminPalette, openPalette } from './command-palette.js';
import { AdminToast, setToastSoundEnabled } from './toast.js';
import { verifyTotp } from './totp.js';
// استيراد كل قسم مبني يسجّل تلقائياً أدواته الـ15 بلوحة الأوامر وبالموجّه —
// أضف هنا استيراد أي قسم جديد يُبنى بمرحلة قادمة.
import '../sections/section-01-overview.js';
import '../sections/section-02-players.js';
import '../sections/section-03-streamers.js';
import '../sections/section-04-frames.js';
import '../sections/section-05-badges.js';
import '../sections/section-06-game-stats.js';
import '../sections/section-07-live-sessions.js';
import '../sections/section-08-xp-economy.js';
import '../sections/section-09-tickets.js';
import '../sections/section-10-notifications.js';
import '../sections/section-11-security.js';
import '../sections/section-12-moderation.js';
import '../sections/section-13-ai-game-gen.js';
import '../sections/section-14-contests.js';
import '../sections/section-15-seo.js';
import '../sections/section-16-audit-log.js';
import '../sections/section-17-platform-apis.js';
import '../sections/section-18-growth.js';
import '../sections/section-19-special-events.js';
import '../sections/section-20-overlays.js';
import '../sections/section-21-question-banks.js';
import '../sections/section-22-financial.js';
import '../sections/section-23-devices.js';
import '../sections/section-30-settings.js';

const fb = AdminFB;

// القائمة الكاملة للأقسام الـ30 (البنية الكاملة تظهر دائماً بالقائمة الجانبية
// حتى قبل ما تُبنى كل الأقسام — الأقسام غير المبنية بعد تظهر بوضوح "قريباً"
// بدل ما تختفي، حتى تبقى الخريطة الكاملة مرئية من أول يوم).
export const SECTION_TITLES = {
  1: 'نظرة عامة', 2: 'إدارة اللاعبين', 3: 'إدارة الستريمرز', 4: 'الإطارات',
  5: 'الشارات والإنجازات', 6: 'إحصائيات الألعاب', 7: 'الجلسات المباشرة',
  8: 'الاقتصاد الداخلي (XP)', 9: 'التذاكر والدعم الفني', 10: 'الرسائل والإشعارات',
  11: 'الأمان والحماية', 12: 'مراقبة المحتوى', 13: 'اصنع لعبتك', 14: 'الفائزين والمسابقات',
  15: 'السيو والمحتوى العام', 16: 'سجل الأحداث (Audit Log)', 17: 'API منصات البث',
  18: 'تحليلات النمو', 19: 'الفعاليات الخاصة', 20: 'أوفرلاي الستريمرز',
  21: 'بنوك الأسئلة والمواضيع', 22: 'التقارير المالية', 23: 'الأجهزة والجلسات',
  24: 'مراقبة الأداء التقني', 25: 'النسخ الاحتياطي', 26: 'صلاحيات المشرفين',
  27: 'اختبار A/B', 28: 'اللغة والترجمة', 29: 'الصيانة والحالة العامة',
  30: 'إعدادات اللوحة',
  31: 'لعبة شد الحبل', 32: 'لعبة الضوء الأخضر الضوء الأحمر', 33: 'لعبة نجاة من اللافا',
  34: 'فعالية جسر المصير', 35: 'لعبة مصيرك', 36: 'لعبة حرب الدول',
  37: 'لعبة دائرة الإقصاء', 38: 'لعبة الكرسي المتحرك', 39: 'لعبة الأراضي البركانية',
  40: 'لعبة الطريق الزجاجي', 41: 'لعبة توب 10', 42: 'الألعاب الأونلاين',
  43: 'ألعاب الجمعات', 44: 'الألعاب الفردية', 45: 'شاشة الإعداد العامة',
  46: 'شاشة الانتظار العامة', 47: 'شاشة الراوند العامة', 48: 'شاشة الإقصاء/الخسارة',
  49: 'شاشة الفوز', 50: 'ربط حسابات الستريمر', 51: 'أوفرلايات الستريمرز المخصّصة',
  52: 'بروفايل اللاعب', 53: 'ربط حساب تيك توك للاعبين', 54: 'القائمة الجانبية',
  55: 'لوحة الفائزين العامة', 56: 'قسم اصنع لعبتك', 57: 'صفحات السيو المنشورة',
  58: 'هوية العلامة', 59: 'قنوات الستريمر المتعددة', 60: 'كلمات الدخول للفرق'
};

const BUILT_SECTIONS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 30]);

let sidebarEl, topbarEl, contentEl, shellEl;
let settingsCache = { shortcuts: [], soundAlerts: false, theme: 'dark', readOnlyMode: false, refreshMs: 5000 };

export const AdminApp = {
  isReadOnly() { return !!settingsCache.readOnlyMode; },
  getSettings() { return settingsCache; },
  async recordToolUsage(entry) {
    let list = settingsCache.shortcuts || [];
    list = list.filter((s) => s.key !== entry.key);
    list.unshift(entry);
    list = list.slice(0, 6);
    settingsCache.shortcuts = list;
    try {
      await fb.setDoc(fb.doc(fb.db, 'adminSettings', 'panel'), { shortcuts: list }, { merge: true });
    } catch (err) { /* best-effort */ }
    document.dispatchEvent(new CustomEvent('admin:shortcuts-changed'));
  }
};
window.AdminApp = AdminApp;
window.__adminReadOnly = false;

function buildShell() {
  shellEl = document.getElementById('admin-shell');
  shellEl.classList.add('admin-shell--app');
  shellEl.innerHTML = `
    <button type="button" class="admin-hamburger" id="admin-hamburger" aria-label="القائمة">
      <span></span><span></span><span></span>
    </button>
    <aside class="admin-sidebar" id="admin-sidebar"></aside>
    <div class="admin-sidebar-scrim" id="admin-sidebar-scrim"></div>
    <div class="admin-main">
      <header class="admin-topbar" id="admin-topbar"></header>
      <main class="admin-content" id="admin-content"></main>
    </div>
  `;
  sidebarEl = document.getElementById('admin-sidebar');
  topbarEl = document.getElementById('admin-topbar');
  contentEl = document.getElementById('admin-content');

  document.getElementById('admin-hamburger').addEventListener('click', () => {
    shellEl.classList.toggle('sidebar-open');
  });
  document.getElementById('admin-sidebar-scrim').addEventListener('click', () => {
    shellEl.classList.remove('sidebar-open');
  });
}

// قسم 30.11: ترتيب مخصّص للأقسام حسب استخدام المالك — يُخزَّن sidebarOrder
// بـadminSettings/panel، وأي قسم غير مذكور فيه يُكمَّل رقمياً بعده.
function orderedSectionIds() {
  const all = Object.keys(SECTION_TITLES).map(Number);
  const custom = Array.isArray(settingsCache.sidebarOrder) ? settingsCache.sidebarOrder.filter((id) => all.includes(id)) : [];
  const rest = all.filter((id) => !custom.includes(id)).sort((a, b) => a - b);
  return [...custom, ...rest];
}

function renderSidebar(activeId) {
  sidebarEl.innerHTML = `
    <div class="admin-sidebar__brand">
      <span class="admin-sidebar__title">ادمن احسمها</span>
      <span class="admin-sidebar__subtitle">لوحة تحكم منفصلة — ehsmaha.com</span>
    </div>
    <nav class="admin-sidebar__nav"></nav>
  `;
  const nav = sidebarEl.querySelector('.admin-sidebar__nav');
  orderedSectionIds().forEach((id) => {
    const built = BUILT_SECTIONS.has(id);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'admin-nav-item' + (id === activeId ? ' is-active' : '') + (!built ? ' is-disabled' : '');
    item.innerHTML = `<span class="admin-nav-item__no">${id}</span><span class="admin-nav-item__label">${SECTION_TITLES[id]}</span>${!built ? '<span class="admin-nav-item__badge">قريباً</span>' : ''}`;
    if (built) {
      item.addEventListener('click', () => {
        AdminRouter.goTo(id);
        shellEl.classList.remove('sidebar-open');
      });
    }
    nav.appendChild(item);
  });
}

function renderTopbar() {
  topbarEl.innerHTML = `
    <button type="button" class="admin-palette-trigger" id="admin-palette-trigger">
      <span>ابحث عن أداة...</span>
      <kbd>Ctrl K</kbd>
    </button>
    <div class="admin-topbar__right">
      <span class="admin-topbar__readonly" id="admin-readonly-flag" hidden>وضع قراءة فقط</span>
      <span class="admin-topbar__admin">${AdminAuth.currentAdmin ? AdminAuth.currentAdmin.email : ''}</span>
      <button type="button" class="admin-btn admin-btn--ghost" id="admin-logout-btn">تسجيل خروج</button>
    </div>
  `;
  document.getElementById('admin-palette-trigger').addEventListener('click', openPalette);
  document.getElementById('admin-logout-btn').addEventListener('click', () => AdminAuth.signOut());
}

function applySettings(data) {
  settingsCache = Object.assign(settingsCache, data || {});
  window.__adminReadOnly = !!settingsCache.readOnlyMode;
  setToastSoundEnabled(!!settingsCache.soundAlerts);
  document.documentElement.setAttribute('data-theme', settingsCache.theme === 'light' ? 'light' : 'dark');
  const flag = document.getElementById('admin-readonly-flag');
  if (flag) flag.hidden = !settingsCache.readOnlyMode;
}

function watchSettings() {
  fb.onSnapshot(fb.doc(fb.db, 'adminSettings', 'panel'), (snap) => {
    applySettings(snap.data() || {});
  }, () => {});
}

function renderLogin() {
  shellEl = null;
  const root = document.getElementById('admin-shell');
  root.classList.remove('admin-shell--app', 'sidebar-open');
  root.innerHTML = `
    <div class="admin-login">
      <form class="admin-login__box" id="admin-login-form">
        <h1>ادمن احسمها</h1>
        <p class="admin-login__hint">دخول حصري لحساب واحد مصرَّح له فقط</p>
        <label class="admin-field">
          <span class="admin-field__label">الإيميل</span>
          <input class="admin-input" type="email" id="admin-login-email" autocomplete="username" required />
        </label>
        <label class="admin-field">
          <span class="admin-field__label">كلمة المرور</span>
          <input class="admin-input" type="password" id="admin-login-pass" autocomplete="current-password" required />
        </label>
        <button type="submit" class="admin-btn admin-btn--primary admin-login__submit">دخول</button>
        <p class="admin-login__status" id="admin-login-status"></p>
      </form>
    </div>
  `;
  const form = document.getElementById('admin-login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('admin-login-email').value.trim();
    const pass = document.getElementById('admin-login-pass').value;
    const status = document.getElementById('admin-login-status');
    status.textContent = 'جارٍ التحقق...';
    status.className = 'admin-login__status';
    const res = await AdminAuth.login(email, pass);
    if (!res.ok) {
      status.textContent = res.reason;
      status.className = 'admin-login__status admin-login__status--err';
    }
  });
}

// قسم 30.2: تحقق ثنائي حقيقي (TOTP) — يظهر مرة كل جلسة متصفح (sessionStorage)
// إذا كان مفعّلاً بـadminSettings/panel.totpEnabled، بعد نجاح كلمة المرور
// وقبل الدخول الفعلي للوحة.
function renderTotpGate(secret, onVerified) {
  const root = document.getElementById('admin-shell');
  root.classList.remove('admin-shell--app', 'sidebar-open');
  root.innerHTML = `
    <div class="admin-login">
      <form class="admin-login__box" id="admin-totp-form">
        <h1>تحقق ثنائي</h1>
        <p class="admin-login__hint">أدخل الرمز المكوَّن من 6 أرقام من تطبيق المصادقة</p>
        <label class="admin-field">
          <span class="admin-field__label">الرمز</span>
          <input class="admin-input" id="admin-totp-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required />
        </label>
        <button type="submit" class="admin-btn admin-btn--primary admin-login__submit">تأكيد</button>
        <p class="admin-login__status" id="admin-totp-status"></p>
        <button type="button" class="admin-btn admin-btn--ghost" id="admin-totp-cancel">تسجيل خروج</button>
      </form>
    </div>
  `;
  document.getElementById('admin-totp-cancel').addEventListener('click', () => AdminAuth.signOut());
  document.getElementById('admin-totp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('admin-totp-code').value;
    const status = document.getElementById('admin-totp-status');
    const ok = await verifyTotp(secret, code);
    if (ok) onVerified();
    else { status.textContent = 'رمز خاطئ — حاول مرة ثانية'; status.className = 'admin-login__status admin-login__status--err'; }
  });
}

let listenersWired = false;
function startApp() {
  buildShell();
  renderTopbar();
  watchSettings();
  applySettings(settingsCache);

  if (!listenersWired) {
    listenersWired = true;
    document.addEventListener('admin:navigated', (e) => renderSidebar(e.detail.sectionId));
    document.addEventListener('admin:shortcuts-changed', () => {
      if (AdminRouter.current() === 1) AdminRouter.goTo(1);
    });
  }

  AdminRouter.init(contentEl);
  renderSidebar(AdminRouter.current() || 1);
}

async function boot() {
  await AdminAuth.ready;
  AdminAuth.onAuthChange(async (admin) => {
    if (!admin) {
      sessionStorage.removeItem('ehsmaha_admin_totp_ok');
      renderLogin();
      return;
    }
    let data = {};
    try {
      const snap = await fb.getDoc(fb.doc(fb.db, 'adminSettings', 'panel'));
      data = snap.data() || {};
    } catch (err) {}
    settingsCache = Object.assign(settingsCache, data);

    const totpOk = sessionStorage.getItem('ehsmaha_admin_totp_ok') === '1';
    if (data.totpEnabled && data.totpSecret && !totpOk) {
      renderTotpGate(data.totpSecret, () => {
        sessionStorage.setItem('ehsmaha_admin_totp_ok', '1');
        startApp();
      });
      return;
    }
    startApp();
  });
}

boot();
