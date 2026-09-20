// ==================== موجّه بسيط (Hash Router) ====================
// توجيه بالكامل من جهة العميل (#/s/<section>) — بدون أي حاجة لإعادة توجيه
// على مستوى Netlify، وبالتالي admin/netlify.toml يبقى بسيط جداً.
const routes = new Map();
let container = null;
let currentSectionId = null;

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 's' && parts[1]) return Number(parts[1]);
  return null;
}

function handle() {
  const id = parseHash() || 1;
  currentSectionId = id;
  const fn = routes.get(id);
  if (!container) return;
  container.innerHTML = '';
  if (fn) fn(container);
  else {
    const div = document.createElement('div');
    div.className = 'admin-empty';
    div.textContent = 'هذا القسم برمجياً بمرحلة لاحقة — راجع خطة التنفيذ المرحلية.';
    container.appendChild(div);
  }
  document.dispatchEvent(new CustomEvent('admin:navigated', { detail: { sectionId: id } }));
}

export const AdminRouter = {
  init(containerEl) {
    container = containerEl;
    window.addEventListener('hashchange', handle);
    handle();
  },
  registerSection(id, renderFn) {
    routes.set(id, renderFn);
  },
  hasSection(id) {
    return routes.has(id);
  },
  goTo(id) {
    if (parseHash() === id) { handle(); return; }
    window.location.hash = '#/s/' + id;
  },
  current() {
    return currentSectionId;
  }
};

window.AdminRouter = AdminRouter;
