// ==================== قالب موحّد لكل قسم (15 أداة) ====================
// كل الأقسام الـ30 متطابقة بالبنية (عنوان + 15 بطاقة أداة، كل بطاقة تفتح
// نافذة تنفيذ فعلية) — هذا الملف يبني الشبكة + يسجّل الأدوات بلوحة الأوامر
// مرة وحدة، فتختصر كل ملف قسم لتعريف الـ15 أداة نفسها بس (tools[].run).
import { AdminPalette } from './command-palette.js';
import { AdminRouter } from './router.js';

export function defineSection({ id, title, description, tools }) {
  AdminPalette.register(tools.map((t, i) => ({
    sectionNo: id,
    sectionTitle: title,
    toolTitle: `${i + 1}. ${t.title}`,
    keywords: t.keywords || '',
    onSelect: () => {
      AdminRouter.goTo(id);
      setTimeout(() => t.run(), 60);
    }
  })));

  function render(container) {
    const head = document.createElement('div');
    head.className = 'admin-section-head';
    head.innerHTML = `<h2>${id}. ${title}</h2><p>${description || ''}</p>`;

    const grid = document.createElement('div');
    grid.className = 'admin-tool-grid';
    tools.forEach((t, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'admin-tool-card';
      const badge = t.badge ? `<span class="admin-badge admin-badge--pink">${t.badge}</span>` : (t.meta ? `<span class="admin-tool-card__meta">${t.meta}</span>` : '');
      card.innerHTML = `
        <span class="admin-tool-card__no">${i + 1}</span>
        <span class="admin-tool-card__title">${t.title}</span>
        ${badge}
      `;
      card.addEventListener('click', () => {
        if (window.AdminApp) window.AdminApp.recordToolUsage({ key: `${id}.${i + 1}`, title: t.title, sectionNo: id });
        t.run();
      });
      grid.appendChild(card);
    });

    container.appendChild(head);
    container.appendChild(grid);
  }

  AdminRouter.registerSection(id, render);
  return { id, title, tools };
}
