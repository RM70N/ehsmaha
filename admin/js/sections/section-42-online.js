// ==================== القسم 42 — الألعاب الأونلاين ====================
// كل ألعاب صفحة #pg-online-home (نسخ أونلاين عن بُعد من الألعاب الأساسية).
// كانت القائمة هنا سبع ألعاب فقط، بينما الموقع فيه 26 بطاقة لعبة أونلاين
// فعلية (تحقّقنا بمطابقة كل data-tag على بطاقات .gcard بالموقع) — يعني 19
// لعبة أونلاين ما كان لها أي أداة إدارة ولا مفتاح تعطيل باللوحة إطلاقاً.
import { openModal } from '../core/modal.js';
import { defineSection } from '../core/section-kit.js';
import { categoryTools } from '../core/game-admin-kit.js';

const TAGS = [
  'obomb', 'otimer', 'owordrace', 'odraw', 'otop10', 'gwonline', 'findballonline',
  'obox', 'ochairs', 'ocr', 'ocs', 'ocw', 'oglz', 'oig', 'oll', 'olsc', 'omain',
  'omz', 'opgs', 'orlgl', 'oroulette', 'orw', 'osniper', 'otug', 'ovl', 'owai'
];
// الأسماء منقولة حرفياً من .gcard-name لكل بطاقة بالموقع الرئيسي.
const NAMES = {
  obomb: 'القنبلة المتحركة أونلاين', otimer: 'لعبة التوقيت أونلاين',
  owordrace: 'سباق الكلمات السريع أونلاين', odraw: 'خمن الرسمة أونلاين',
  otop10: 'توب 10 أونلاين', gwonline: 'خمّن الموضوع أونلاين',
  findballonline: 'اعثر على الكورة أونلاين', obox: 'الصندوق العشوائي أونلاين',
  ochairs: 'الكرسي المتحرك أونلاين', ocr: 'سباق الشات أونلاين',
  ocs: 'سرقة التاج أونلاين', ocw: 'الدول أونلاين', oglz: 'الطريق الزجاجي أونلاين',
  oig: 'خمن الصورة أونلاين', oll: 'آخر حرف أونلاين', olsc: 'ترتيب الحروف أونلاين',
  omain: 'اوجد الكلمة أونلاين', omz: 'المتاهة أونلاين', opgs: 'تخمين السعر أونلاين',
  orlgl: 'الضوء الأخضر · الأحمر أونلاين', oroulette: 'دائرة الإقصاء أونلاين',
  orw: 'عكس الكلمة أونلاين', osniper: 'القناص أونلاين', otug: 'شد الحبل أونلاين',
  ovl: 'الأراضي البركانية أونلاين', owai: 'من أنا؟ أونلاين'
};

defineSection({
  id: 42,
  title: 'الألعاب الأونلاين',
  description: `${TAGS.length} ألعاب (نسخ أونلاين عن بُعد من ألعاب أساسية): ${TAGS.map((t) => NAMES[t]).join('، ')}.`,
  tools: [
    ...categoryTools({ tags: TAGS, categoryName: 'الألعاب الأونلاين', sectionId: 42 }),
    {
      title: 'قائمة كل الألعاب الأونلاين مع أسمائها الحقيقية',
      keywords: 'قائمة العاب اونلاين اسماء',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<table class="admin-table"><thead><tr><th>الرمز (tag)</th><th>الاسم</th></tr></thead><tbody>${TAGS.map((t) => `<tr><td class="is-primary" data-label="الرمز">${t}</td><td data-label="الاسم">${NAMES[t]}</td></tr>`).join('')}</tbody></table>`;
        openModal({ title: 'الألعاب الأونلاين', bodyEl: body, size: 'md' });
      }
    }
  ]
});
