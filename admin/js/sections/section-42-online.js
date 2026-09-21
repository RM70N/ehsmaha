// ==================== القسم 42 — الألعاب الأونلاين ====================
// 7 ألعاب حقيقية بصفحة #pg-online-home (نسخ أونلاين عن بُعد من ألعاب أساسية):
// obomb (القنبلة أونلاين)، otimer (التوقيت أونلاين)، owordrace (سباق الكلمات
// أونلاين)، odraw (خمن الرسمة أونلاين)، otop10 (توب 10 أونلاين)، gwonline
// (خمّن الموضوع أونلاين)، findballonline (اعثر على الكورة أونلاين).
import { openModal } from '../core/modal.js';
import { defineSection } from '../core/section-kit.js';
import { categoryTools } from '../core/game-admin-kit.js';

const TAGS = ['obomb', 'otimer', 'owordrace', 'odraw', 'otop10', 'gwonline', 'findballonline'];
const NAMES = { obomb: 'القنبلة المتحركة أونلاين', otimer: 'لعبة التوقيت أونلاين', owordrace: 'سباق الكلمات السريع أونلاين', odraw: 'خمن الرسمة أونلاين', otop10: 'توب 10 أونلاين', gwonline: 'خمّن الموضوع أونلاين', findballonline: 'اعثر على الكورة أونلاين' };

defineSection({
  id: 42,
  title: 'الألعاب الأونلاين',
  description: `${TAGS.length} ألعاب (نسخ أونلاين عن بُعد من ألعاب أساسية): ${TAGS.map((t) => NAMES[t]).join('، ')}.`,
  tools: [
    ...categoryTools({ tags: TAGS, categoryName: 'الألعاب الأونلاين', sectionId: 42 }),
    {
      title: 'قائمة الألعاب الأونلاين السبع مع أسمائها الحقيقية',
      keywords: 'قائمة العاب اونلاين اسماء',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<table class="admin-table"><thead><tr><th>الرمز (tag)</th><th>الاسم</th></tr></thead><tbody>${TAGS.map((t) => `<tr><td class="is-primary" data-label="الرمز">${t}</td><td data-label="الاسم">${NAMES[t]}</td></tr>`).join('')}</tbody></table>`;
        openModal({ title: 'الألعاب الأونلاين', bodyEl: body, size: 'md' });
      }
    }
  ]
});
