// ==================== لوحة الأوامر (Command Palette) ====================
// بحث فوري يوصل لأي أداة من الـ450 خلال ثوانٍ (Ctrl/Cmd+K أو زر بالشريط
// العلوي) بدل التنقل اليدوي بين الأقسام — كل قسم يسجّل أدواته الـ15 هنا
// عبر AdminPalette.register().
const registry = [];

function normalize(s) {
  return (s || '').toString().toLowerCase().replace(/[ً-ْ]/g, '').trim();
}

export const AdminPalette = {
  register(entries) {
    registry.push(...entries);
  },
  all() {
    return registry;
  },
  search(qRaw) {
    const q = normalize(qRaw);
    if (!q) return registry.slice(0, 40);
    return registry
      .map((e) => {
        const hay = normalize(e.sectionTitle + ' ' + e.toolTitle + ' ' + (e.keywords || ''));
        let score = -1;
        if (hay.startsWith(q)) score = 3;
        else if (hay.includes(' ' + q)) score = 2;
        else if (hay.includes(q)) score = 1;
        return { e, score };
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((r) => r.e);
  }
};

let overlay = null;
let inputEl = null;
let listEl = null;
let activeIndex = 0;

function render(results) {
  listEl.innerHTML = '';
  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'admin-palette__empty';
    empty.textContent = 'ولا نتيجة — جرّب كلمة ثانية';
    listEl.appendChild(empty);
    return;
  }
  results.forEach((r, i) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'admin-palette__item' + (i === activeIndex ? ' is-active' : '');
    item.innerHTML = `
      <span class="admin-palette__section">${r.sectionNo}. ${r.sectionTitle}</span>
      <span class="admin-palette__tool">${r.toolTitle}</span>
    `;
    item.addEventListener('click', () => selectEntry(r));
    listEl.appendChild(item);
  });
}

function selectEntry(entry) {
  closePalette();
  entry.onSelect();
}

let currentResults = [];

export function openPalette() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'admin-palette-overlay';
  const box = document.createElement('div');
  box.className = 'admin-palette';
  inputEl = document.createElement('input');
  inputEl.className = 'admin-palette__input';
  inputEl.placeholder = 'ابحث عن أي أداة من أدوات اللوحة الـ450...';
  listEl = document.createElement('div');
  listEl.className = 'admin-palette__list';
  box.appendChild(inputEl);
  box.appendChild(listEl);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.classList.add('is-visible'); inputEl.focus(); });

  currentResults = AdminPalette.search('');
  activeIndex = 0;
  render(currentResults);

  inputEl.addEventListener('input', () => {
    currentResults = AdminPalette.search(inputEl.value);
    activeIndex = 0;
    render(currentResults);
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, currentResults.length - 1); render(currentResults); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); render(currentResults); }
    else if (e.key === 'Enter') { e.preventDefault(); if (currentResults[activeIndex]) selectEntry(currentResults[activeIndex]); }
    else if (e.key === 'Escape') { closePalette(); }
  });
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closePalette(); });
}

export function closePalette() {
  if (!overlay) return;
  overlay.classList.remove('is-visible');
  const el = overlay;
  overlay = null;
  setTimeout(() => el.remove(), 160);
}

document.addEventListener('keydown', (e) => {
  const isK = e.key === 'k' || e.key === 'K';
  if ((e.ctrlKey || e.metaKey) && isK) {
    e.preventDefault();
    if (overlay) closePalette(); else openPalette();
  }
});

window.AdminPalette = AdminPalette;
window.openAdminPalette = openPalette;
