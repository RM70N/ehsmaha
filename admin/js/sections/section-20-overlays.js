// ==================== القسم 20 — قوالب أوفرلاي الستريمرز ====================
// أوفرلايات الستريمرز المخصّصة (الفوزان/غنام/مطلق/عبود) مبنية كتصميم CSS/HTML
// ثابت مباشرة بكود index.html لكل ستريمر — الانتماء لكل نظام يُدار عبر
// كولكشنات Firestore حقيقية موجودة أصلاً: devSpecial/alfawzanSpecial/
// ghnamSpecial (تفعيل/تعطيل حقيقي 100%). محتوى التصميم نفسه (بانر/ألوان/
// أنيميشن) مدمج بالكود ولا يُدار ديناميكياً حالياً — موضَّح بكل أداة معنية.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum } from '../core/format.js';

const fb = AdminFB;
const SYSTEMS = { ghnamSpecial: 'غنام', alfawzanSpecial: 'الفوزان', devSpecial: 'مطوّر (دعم فني)' };

async function listAllMembers() {
  const results = [];
  for (const [col, label] of Object.entries(SYSTEMS)) {
    const snap = await fb.getDocs(fb.collection(fb.db, col));
    snap.docs.forEach((d) => results.push({ system: col, label, usernameLower: d.id, ...d.data() }));
  }
  return results;
}

defineSection({
  id: 20,
  title: 'أوفرلايات الستريمرز',
  description: 'أنظمة الأوفرلاي المخصّصة الحقيقية الموجودة: غنام، الفوزان، دعم فني (devSpecial) — عضوية كل نظام تُدار هنا فعلياً.',
  tools: [
    {
      title: 'قائمة كل الستريمرز الذين لديهم أوفرلاي مخصّص الحالي',
      keywords: 'قائمة ستريمرز اوفرلاي مخصص',
      run: async () => {
        const rows = await listAllMembers();
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>اليوزر</th><th>النظام</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="اليوزر">${r.usernameLower}</td><td data-label="النظام">${r.label}</td></tr>`).join('')}</tbody></table>` : '<p>ولا ستريمر مضاف لأي نظام أوفرلاي مخصّص</p>';
        openModal({ title: 'ستريمرز الأوفرلاي المخصّص', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'إنشاء أوفرلاي جديد لستريمر جديد من قالب جاهز',
      keywords: 'انشاء اوفرلاي جديد ستريمر',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">يوزر الستريمر</span><input class="admin-input" id="ov-user" /></div>
        <div class="admin-field"><span class="admin-field__label">القالب/النظام</span><select class="admin-input" id="ov-sys">${Object.entries(SYSTEMS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <button class="admin-btn admin-btn--primary admin-btn--sm" id="ov-go" style="margin-top:8px;">إضافة</button>`;
        const modal = openModal({ title: 'إضافة ستريمر لأوفرلاي', bodyEl: body, size: 'sm' });
        body.querySelector('#ov-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const usernameLower = body.querySelector('#ov-user').value.trim().toLowerCase();
          const sys = body.querySelector('#ov-sys').value;
          await fb.setDoc(fb.doc(fb.db, sys, usernameLower), { username: usernameLower, addedBy: 'admin', addedAt: fb.serverTimestamp() });
          await AdminAudit.log({ section: 20, sectionTitle: 'أوفرلايات الستريمرز', actionKey: 'overlay.add', actionLabel: 'إضافة ستريمر لنظام أوفرلاي', targetType: sys, targetId: usernameLower });
          AdminToast.success('تم — الأوفرلاي يظهر له تلقائياً بأول بث قادم');
          modal.close();
        });
      }
    },
    {
      title: 'تعديل بانر الترحيب المتحرك الخاص بكل ستريمر',
      keywords: 'تعديل بانر ترحيب متحرك',
      badge: 'مدمج بالكود',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>تصميم البانر مدمج مباشرة بـCSS/HTML داخل index.html لكل نظام (غنام/الفوزان) — تعديله الفعلي يحتاج تعديل كود الموقع مباشرة، غير قابل للإدارة الديناميكية من هنا حالياً.</p>'; openModal({ title: 'بانر الترحيب', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'تعديل شاشة الفائز المخصّصة الخاصة بستريمر معيّن',
      keywords: 'تعديل شاشة فائز مخصصة',
      badge: 'مدمج بالكود',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>نفس ملاحظة البانر — شاشة الفوز مدمجة بالكود مباشرة.</p>'; openModal({ title: 'شاشة الفوز المخصّصة', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'معاينة الأوفرلاي على أفتار وهمي قبل النشر',
      keywords: 'معاينة اوفرلاي قبل نشر',
      badge: 'يحتاج بيئة بث حقيقية',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>معاينة التصميم البصري الفعلي تحتاج فتح الموقع الرئيسي وتفعيل بث تجريبي — لا توجد معاينة منفصلة داخل لوحة الإدارة حالياً.</p>'; openModal({ title: 'معاينة الأوفرلاي', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'تفعيل/تعطيل أوفرلاي مخصّص فوراً لستريمر معيّن',
      keywords: 'تفعيل تعطيل اوفرلاي فورا',
      run: async () => {
        const rows = await listAllMembers();
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>اليوزر</th><th>النظام</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="اليوزر">${r.usernameLower}</td><td data-label="النظام">${r.label}</td><td><button class="admin-btn admin-btn--danger admin-btn--sm" data-off="${r.system}|${r.usernameLower}">تعطيل</button></td></tr>`).join('')}</tbody></table>` : '<p>ولا أحد مفعَّل حالياً</p>';
        openModal({ title: 'تعطيل أوفرلاي', bodyEl: body, size: 'lg' });
        body.querySelectorAll('[data-off]').forEach((btn) => btn.addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const [sys, uname] = btn.getAttribute('data-off').split('|');
          await fb.deleteDoc(fb.doc(fb.db, sys, uname));
          await AdminAudit.log({ section: 20, sectionTitle: 'أوفرلايات الستريمرز', actionKey: 'overlay.disable', actionLabel: 'تعطيل أوفرلاي', targetType: sys, targetId: uname, sensitive: true });
          AdminToast.success('تم التعطيل');
          btn.closest('tr').remove();
        }));
      }
    },
    {
      title: 'رفع لوغو أو أصول بصرية جديدة لأوفرلاي',
      keywords: 'رفع لوغو اصول بصرية اوفرلاي',
      badge: 'مدمج بالكود',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>أصول الأوفرلاي (لوغوهات/صور) مضمَّنة كـdata URI مباشرة بكود index.html — رفع أصل جديد يحتاج تعديل الكود مباشرة حالياً.</p>'; openModal({ title: 'رفع أصول بصرية', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'تعديل ألوان/أنيميشن الأوفرلاي',
      keywords: 'تعديل الوان انيميشن اوفرلاي',
      badge: 'مدمج بالكود',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>الألوان والأنيميشن CSS ثابتة بالكود لكل نظام — تعديلها يحتاج تعديل index.html مباشرة (مع الالتزام بقاعدة بدون إيموجيز/ملء الشاشة).</p>'; openModal({ title: 'ألوان وأنيميشن', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'نسخ إعدادات أوفرلاي ستريمر ناجح كنقطة بداية لستريمر جديد',
      keywords: 'نسخ اعدادات اوفرلاي ناجح',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">من نظام</span><select class="admin-input" id="cp-from">${Object.entries(SYSTEMS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="admin-field"><span class="admin-field__label">يوزر الستريمر الجديد</span><input class="admin-input" id="cp-user" /></div>
        <button class="admin-btn admin-btn--primary admin-btn--sm" id="cp-go" style="margin-top:8px;">إضافة لنفس النظام</button>
        <p class="admin-field__hint">بما إن التصميم نفسه مشترك لكل أعضاء النظام الواحد، "النسخ" هنا يعني إضافة الستريمر الجديد لنفس نظام أوفرلاي ناجح موجود.</p>`;
        const modal = openModal({ title: 'نسخ إعدادات أوفرلاي', bodyEl: body, size: 'md' });
        body.querySelector('#cp-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const sys = body.querySelector('#cp-from').value;
          const usernameLower = body.querySelector('#cp-user').value.trim().toLowerCase();
          await fb.setDoc(fb.doc(fb.db, sys, usernameLower), { username: usernameLower, addedBy: 'admin-copy', addedAt: fb.serverTimestamp() });
          AdminToast.success('تم');
          modal.close();
        });
      }
    },
    {
      title: 'سجل كل التعديلات على كل أوفرلاي مع تاريخها',
      keywords: 'سجل تعديلات اوفرلاي تاريخ',
      run: async () => {
        const rows = (await AdminAudit.fetchAllForExport()).filter((r) => (r.actionKey || '').startsWith('overlay.'));
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>الإجراء</th><th>الهدف</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.tsClient)}</td><td class="is-primary" data-label="الإجراء">${r.actionLabel}</td><td data-label="الهدف">${r.targetId}</td></tr>`).join('')}</tbody></table>` : '<p>ولا تعديل مسجَّل بعد</p>';
        openModal({ title: 'سجل تعديلات الأوفرلاي', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'اختبار الأوفرلاي في بيئة معزولة قبل نشره على البث الحقيقي',
      keywords: 'اختبار اوفرلاي بيئة معزولة',
      badge: 'يحتاج بيئة اختبار خارجية',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>لا توجد بيئة staging منفصلة للأوفرلايات حالياً — الاختبار يتم على الموقع الحي مباشرة.</p>'; openModal({ title: 'اختبار الأوفرلاي', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'تحديد صلاحية الستريمر لتعديل أوفرلايه بنفسه أو منعها',
      keywords: 'صلاحية ستريمر تعديل اوفرلاي',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">يوزر الستريمر</span><input class="admin-input" id="pm-user" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="pm-go" style="margin-top:8px;">تبديل الصلاحية</button>`;
        const modal = openModal({ title: 'صلاحية تعديل الأوفرلاي', bodyEl: body, size: 'sm' });
        body.querySelector('#pm-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const usernameLower = body.querySelector('#pm-user').value.trim().toLowerCase();
          const snap = await fb.getDoc(fb.doc(fb.db, 'streamerProfiles', usernameLower));
          const cur = snap.exists() && snap.data().canEditOwnOverlay;
          await fb.setDoc(fb.doc(fb.db, 'streamerProfiles', usernameLower), { canEditOwnOverlay: !cur }, { merge: true });
          AdminToast.success('تم — لا توجد واجهة تعديل ذاتي للستريمر بالموقع الرئيسي بعد، هذا الحقل جاهز لتفعيلها مستقبلاً');
          modal.close();
        });
      }
    },
    {
      title: 'أرشفة أوفرلاي قديم غير مستخدم',
      keywords: 'ارشفة اوفرلاي قديم',
      run: async () => {
        const rows = await listAllMembers();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">اختر للأرشفة</span><select class="admin-input" id="af-select">${rows.map((r) => `<option value="${r.system}|${r.usernameLower}">${r.usernameLower} — ${r.label}</option>`).join('') || '<option>ولا أحد</option>'}</select></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="af-go" style="margin-top:8px;" ${!rows.length ? 'disabled' : ''}>أرشفة (تعطيل + حفظ نسخة)</button>`;
        const modal = openModal({ title: 'أرشفة أوفرلاي', bodyEl: body, size: 'sm' });
        body.querySelector('#af-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const [sys, uname] = body.querySelector('#af-select').value.split('|');
          const snap = await fb.getDoc(fb.doc(fb.db, sys, uname));
          await fb.setDoc(fb.doc(fb.db, 'overlayArchive', `${sys}_${uname}`), { system: sys, username: uname, data: snap.data(), archivedAt: fb.serverTimestamp() });
          await fb.deleteDoc(fb.doc(fb.db, sys, uname));
          AdminToast.success('تمت الأرشفة');
          modal.close();
        });
      }
    },
    {
      title: 'تقرير بأكثر عناصر الأوفرلاي ظهوراً/تفعيلاً',
      keywords: 'تقرير اكثر عناصر اوفرلاي ظهورا',
      run: async () => {
        const rows = await listAllMembers();
        const counts = new Map();
        rows.forEach((r) => counts.set(r.label, (counts.get(r.label) || 0) + 1));
        const body = document.createElement('div');
        body.innerHTML = `<table class="admin-table"><tbody>${[...counts.entries()].map(([l, c]) => `<tr><td class="is-primary" data-label="النظام">${l}</td><td data-label="عدد الأعضاء">${fmtNum(c)}</td></tr>`).join('') || '<tr><td>ولا بيانات</td></tr>'}</tbody></table>`;
        openModal({ title: 'أكثر أنظمة الأوفرلاي استخداماً', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'حذف أوفرلاي مخصّص نهائياً من النظام',
      keywords: 'حذف اوفرلاي مخصص نهائي',
      run: async () => {
        const rows = await listAllMembers();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">اختر</span><select class="admin-input" id="dl-select">${rows.map((r) => `<option value="${r.system}|${r.usernameLower}">${r.usernameLower} — ${r.label}</option>`).join('') || '<option>ولا أحد</option>'}</select></div><button class="admin-btn admin-btn--danger admin-btn--sm" id="dl-go" style="margin-top:8px;" ${!rows.length ? 'disabled' : ''}>حذف نهائياً</button>`;
        const modal = openModal({ title: 'حذف أوفرلاي نهائياً', bodyEl: body, size: 'sm' });
        body.querySelector('#dl-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const [sys, uname] = body.querySelector('#dl-select').value.split('|');
          await fb.deleteDoc(fb.doc(fb.db, sys, uname));
          await AdminAudit.log({ section: 20, sectionTitle: 'أوفرلايات الستريمرز', actionKey: 'overlay.deleteFinal', actionLabel: 'حذف أوفرلاي نهائياً', targetType: sys, targetId: uname, sensitive: true });
          AdminToast.success('تم الحذف');
          modal.close();
        });
      }
    }
  ]
});
