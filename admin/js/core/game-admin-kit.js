// ==================== عُدّة أدوات مشتركة لكل قسم لعبة (31-44 و42-44) ====================
// كل الأقسام المخصّصة للألعاب الفردية تتشارك نفس الأنماط الخمسة: مراقبة
// الجلسات الجارية، سجل آخر النتائج، تعطيل/تفعيل اللعبة، أكثر الستريمرز
// استخداماً، وسجل الأخطاء التقنية — بدل تكرار نفس الكود بكل ملف قسم.
import { AdminFB } from './firebase.js';
import { AdminAudit } from './audit.js';
import { openModal, openFormModal, isReadOnly } from './modal.js';
import { AdminToast } from './toast.js';
import { fmtDate, fmtNum, csvDownload } from './format.js';

const fb = AdminFB;

// -------- تعديل إعدادات اللعبة (نقاط/توقيت/صعوبة) — gameConfig/{gameTag} --------
// صراحة مهمة: gameConfig كولكشن جاهز بـfirestore.rules لكن كود اللعبة
// بـindex.html لا يقرأ منه حالياً لأي لعبة — القيم تُحفظ فعلياً بقاعدة
// البيانات (مو وهمية) لكنها لن تُغيّر سلوك اللعبة الفعلي حتى تُربط قراءتها
// بمنطق كل لعبة بمرحلة قادمة. نتركه هنا كأداة "تحضير قيم جاهزة" بدل حذفه.
export function gameConfigTool(gameTag, gameName, fields) {
  return {
    title: `تعديل إعدادات "${gameName}" (${(fields || []).map((f) => f.label).join('، ')})`,
    keywords: `اعدادات ضبط ${gameName} نقاط توقيت صعوبة`,
    badge: 'يحتاج ربط بمنطق اللعبة',
    run: async () => {
      const snap = await fb.getDoc(fb.doc(fb.db, 'gameConfig', gameTag));
      const cur = snap.exists() ? snap.data() : {};
      openFormModal({
        title: `إعدادات ${gameName}`,
        fields: [
          ...(fields || []).map((f) => ({ ...f, value: cur[f.key] !== undefined ? cur[f.key] : f.value }))
        ],
        onSubmit: async (v) => {
          await fb.setDoc(fb.doc(fb.db, 'gameConfig', gameTag), v, { merge: true });
          await AdminAudit.log({ actionKey: `game.${gameTag}.config`, actionLabel: `تعديل إعدادات ${gameName}`, targetType: 'gameConfig', targetId: gameTag });
          AdminToast.success('تم الحفظ بقاعدة البيانات — تذكير: اللعبة نفسها ما تقرأ من gameConfig تلقائياً بعد، القيمة محفوظة وجاهزة لربط قادم');
        }
      });
    }
  };
}

// -------- مراقبة الجلسات الجارية الآن (من activeStreamers، مفلترة بالوسم) --------
export function liveSessionsTool(gameTag, gameName) {
  return {
    title: `مراقبة جلسات "${gameName}" الجارية الآن`,
    keywords: `جلسات جارية ${gameName} live`,
    run: () => {
      const body = document.createElement('div');
      body.textContent = 'جارٍ التحميل...';
      let unsub = () => {};
      openModal({ title: `جلسات "${gameName}" النشطة الآن`, bodyEl: body, size: 'lg', onClose: () => unsub() });
      unsub = fb.onSnapshot(fb.collection(fb.db, 'activeStreamers'), (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.gameTag === gameTag);
        body.innerHTML = rows.length ? `
          <table class="admin-table"><thead><tr><th>الستريمر</th><th>المنصة</th><th>آخر تحديث</th><th></th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="الستريمر">${r.username || '—'}</td><td data-label="المنصة">${r.platform || '—'}</td><td data-label="آخر تحديث">${fmtDate(r.updatedAt)}</td><td><button class="admin-btn admin-btn--danger admin-btn--sm" data-end="${r.id}">إنهاء الجلسة</button></td></tr>`).join('')}</tbody></table>
        ` : '<p>ولا جلسة شغّالة الآن لهذي اللعبة</p>';
        body.querySelectorAll('[data-end]').forEach((btn) => btn.addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const id = btn.getAttribute('data-end');
          await fb.deleteDoc(fb.doc(fb.db, 'activeStreamers', id));
          await AdminAudit.log({ actionKey: `game.${gameTag}.endSession`, actionLabel: `إنهاء جلسة ${gameName} عالقة`, targetType: 'activeStreamer', targetId: id, sensitive: true });
          AdminToast.success('تم إنهاء الجلسة');
        }));
      }, () => { body.textContent = 'تعذّر التحميل'; });
    }
  };
}

// -------- سجل آخر N نتيجة/جولة (من playEvents، مفلترة بالوسم) --------
export function recentResultsTool(gameTag, gameName, limitN) {
  return {
    title: `عرض سجل آخر ${limitN || 20} جولة من "${gameName}"`,
    keywords: `سجل نتائج جولات ${gameName}`,
    run: async () => {
      const body = document.createElement('div');
      body.textContent = 'جارٍ التحميل...';
      openModal({ title: `آخر ${limitN || 20} جولة — ${gameName}`, bodyEl: body, size: 'lg' });
      try {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(2000)));
        const rows = snap.docs.map((d) => d.data()).filter((r) => r.gameTag === gameTag).slice(0, limitN || 20);
        body.innerHTML = rows.length ? `
          <table class="admin-table"><thead><tr><th>الوقت</th><th>النوع</th><th>الستريمر/اللاعب</th><th>المنصة</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.createdAt)}</td><td data-label="النوع">${r.type || '—'}</td><td data-label="اللاعب" class="is-primary">${r.username || '—'}</td><td data-label="المنصة">${r.platform || '—'}</td></tr>`).join('')}</tbody></table>
        ` : '<p>ولا سجل بعد لهذي اللعبة</p>';
      } catch (err) { body.textContent = 'تعذّر التحميل: ' + err.message; }
    }
  };
}

// -------- تعطيل/تفعيل اللعبة مؤقتاً (siteFlags/gameToggles) --------
export function toggleEnabledTool(gameTag, gameName, opts) {
  return {
    title: `تعطيل/تفعيل "${gameName}" مؤقتاً من كل الموقع`,
    keywords: `تعطيل تفعيل صيانة ${gameName}`,
    run: async () => {
      const snap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'gameToggles'));
      const data = snap.exists() ? snap.data() : {};
      const enabled = data[gameTag] !== false;
      const body = document.createElement('div');
      body.innerHTML = `<p>الحالة الحالية: <span class="admin-badge ${enabled ? 'admin-badge--on' : 'admin-badge--off'}">${enabled ? 'مفعّلة' : 'معطّلة'}</span></p>
      ${opts && opts.enforced === false ? '<p class="admin-field__hint">هذا المفتاح مسجَّل بقاعدة البيانات لكن التطبيق الفعلي (منع بدء اللعبة) لسه ما تربط بشاشة إعداد هذي اللعبة تحديداً.</p>' : ''}
      <button class="admin-btn ${enabled ? 'admin-btn--danger' : 'admin-btn--primary'}" id="gk-toggle-btn">${enabled ? 'تعطيل الآن' : 'تفعيل الآن'}</button>`;
      const modal = openModal({ title: `تعطيل/تفعيل ${gameName}`, bodyEl: body, size: 'sm' });
      body.querySelector('#gk-toggle-btn').addEventListener('click', async () => {
        if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
        await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'gameToggles'), { [gameTag]: !enabled }, { merge: true });
        await AdminAudit.log({ actionKey: `game.${gameTag}.toggle`, actionLabel: `${enabled ? 'تعطيل' : 'تفعيل'} لعبة ${gameName}`, targetType: 'gameTag', targetId: gameTag, sensitive: true });
        AdminToast.success('تم الحفظ');
        modal.close();
      });
    }
  };
}

// -------- أكثر الستريمرز استخداماً لهذي اللعبة --------
export function topStreamersTool(gameTag, gameName) {
  return {
    title: `إحصائية أكثر الستريمرز استخداماً لـ"${gameName}"`,
    keywords: `اكثر ستريمرز استخداما ${gameName}`,
    run: async () => {
      const body = document.createElement('div');
      body.textContent = 'جارٍ التحميل...';
      openModal({ title: `أكثر الستريمرز استخداماً — ${gameName}`, bodyEl: body, size: 'md' });
      const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(3000)));
      const counts = new Map();
      snap.docs.forEach((d) => {
        const v = d.data();
        if (v.gameTag !== gameTag || !v.username) return;
        counts.set(v.username, (counts.get(v.username) || 0) + 1);
      });
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      body.innerHTML = top.length ? `<table class="admin-table"><thead><tr><th>الستريمر</th><th>عدد المرات</th></tr></thead><tbody>${top.map(([u, c]) => `<tr><td class="is-primary" data-label="الستريمر">${u}</td><td data-label="العدد">${fmtNum(c)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا بيانات كافية بعد</p>';
    }
  };
}

// -------- المشاركون الحاليون بالراوند الجاري (liveRounds/{gameTag} — مرآة حقيقية من كود كل لعبة) --------
export function liveRoundParticipantsTool(gameTag, gameName) {
  return {
    title: `عرض المشاركين بالراوند الجاري الآن لـ"${gameName}"`,
    keywords: `مشاركون راوند جاري ${gameName}`,
    run: () => {
      const body = document.createElement('div');
      body.textContent = 'جارٍ التحميل...';
      let unsub = () => {};
      openModal({ title: `المشاركون الآن — ${gameName}`, bodyEl: body, size: 'md', onClose: () => unsub() });
      unsub = fb.onSnapshot(fb.doc(fb.db, 'liveRounds', gameTag), (snap) => {
        const data = snap.exists() ? snap.data() : null;
        const list = (data && data.participants) || [];
        body.innerHTML = list.length ? `<p class="admin-field__hint">آخر تحديث: ${fmtDate(data.updatedAt)}</p><table class="admin-table"><thead><tr><th>الاسم المستعار</th><th>المعرّف</th></tr></thead><tbody>${list.map((p) => `<tr><td class="is-primary" data-label="الاسم">${p.nickname || '—'}</td><td data-label="المعرّف">${p.uniqueId || '—'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا راوند شغّال الآن لهذي اللعبة (أو ولا مشارك دخل بعد)</p>';
      }, () => { body.textContent = 'تعذّر التحميل'; });
    }
  };
}

// -------- سجل الأخطاء التقنية الخاصة بهذي اللعبة (من clientErrorLog، فلترة نصية) --------
export function errorLogTool(gameTag, gameName) {
  return {
    title: `سجل الأخطاء التقنية المسجَّلة لـ"${gameName}"`,
    keywords: `اخطاء تقنية ${gameName}`,
    run: async () => {
      const body = document.createElement('div');
      body.textContent = 'جارٍ التحميل...';
      openModal({ title: `أخطاء تقنية — ${gameName}`, bodyEl: body, size: 'lg' });
      const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'clientErrorLog'), fb.orderBy('ts', 'desc'), fb.limit(500)));
      const rows = snap.docs.map((d) => d.data()).filter((r) => (r.message || '').toLowerCase().includes(gameTag.toLowerCase()) || (r.url || '').toLowerCase().includes(gameTag.toLowerCase()));
      body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>الرسالة</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.ts)}</td><td data-label="الرسالة">${(r.message || '').slice(0, 120)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا خطأ مسجَّل مرتبط بهذي اللعبة — مطابقة نصية تقريبية بعنوان الصفحة/رسالة الخطأ.</p>';
    }
  };
}

// -------- تصدير تقرير أداء شهري للعبة --------
export function monthlyExportTool(gameTag, gameName) {
  return {
    title: `تصدير تقرير أداء "${gameName}" الشهري`,
    keywords: `تصدير تقرير شهري ${gameName}`,
    run: async () => {
      const since = Date.now() - 30 * 86400000;
      const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(5000)));
      const rows = snap.docs.map((d) => d.data()).filter((r) => r.gameTag === gameTag);
      csvDownload(`${gameTag}-monthly-report.csv`, [['الوقت', 'النوع', 'الستريمر/اللاعب', 'المنصة'], ...rows.map((r) => [fmtDate(r.createdAt), r.type, r.username, r.platform])]);
      AdminToast.success(`تم تصدير ${rows.length} حدث`);
    }
  };
}

// -------- بنك محتوى بنمط "ثابت بالكود + إضافات/استثناءات من Firestore" --------
// يُستخدم لألعاب فيها بنك محتوى مدمج بالكود (مثل GLZ_QUESTIONS) بدل ما
// نهاجر المحتوى الأصلي كامل (خطر على لعبة شغّالة) — نضيف طبقة Firestore
// فوقه: عناصر مخصّصة يضيفها المالك + عناصر من الأصل تُعطَّل بدون حذفها.
export function contentBankTools({ bankKey, gameName, itemLabel, addFields, renderItem }) {
  async function loadDoc() {
    const snap = await fb.getDoc(fb.doc(fb.db, 'gameContentBanks', bankKey));
    return snap.exists() ? snap.data() : { custom: [], disabled: [] };
  }
  return {
    manage: {
      title: `إدارة بنك ${itemLabel} — إضافة/تعطيل عناصر`,
      keywords: `بنك محتوى ${gameName} اضافة تعطيل`,
      run: async () => {
        const data = await loadDoc();
        const body = document.createElement('div');
        function draw() {
          body.innerHTML = `
            <h4 style="font-size:12.5px;color:var(--text-secondary);">عناصر مضافة يدوياً (${(data.custom || []).length})</h4>
            <div class="admin-table-wrap" style="max-height:200px;overflow-y:auto;margin-bottom:14px;">
              ${(data.custom || []).map((it, i) => `<div style="display:flex;justify-content:space-between;padding:6px;border-bottom:1px solid var(--border);"><span>${renderItem(it)}</span><button class="admin-btn admin-btn--ghost admin-btn--sm" data-rm-custom="${i}">حذف</button></div>`).join('') || '<p class="admin-field__hint">ولا عنصر مضاف يدوياً بعد</p>'}
            </div>
            <h4 style="font-size:12.5px;color:var(--text-secondary);">عناصر من البنك الأصلي مُعطَّلة (${(data.disabled || []).length})</h4>
            <div class="admin-table-wrap" style="max-height:150px;overflow-y:auto;">
              ${(data.disabled || []).map((key, i) => `<div style="display:flex;justify-content:space-between;padding:6px;border-bottom:1px solid var(--border);"><span>${key}</span><button class="admin-btn admin-btn--ghost admin-btn--sm" data-restore="${i}">استرجاع</button></div>`).join('') || '<p class="admin-field__hint">ولا عنصر معطَّل</p>'}
            </div>
            <div class="admin-form" style="margin-top:14px;">
              ${(addFields || []).map((f) => `<label class="admin-field"><span class="admin-field__label">${f.label}</span><input class="admin-input" data-newfield="${f.key}" placeholder="${f.placeholder || ''}" /></label>`).join('')}
              <button class="admin-btn admin-btn--primary admin-btn--sm" id="cb-add">إضافة للبنك</button>
            </div>
          `;
          body.querySelectorAll('[data-rm-custom]').forEach((btn) => btn.addEventListener('click', async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            data.custom.splice(Number(btn.getAttribute('data-rm-custom')), 1);
            await fb.setDoc(fb.doc(fb.db, 'gameContentBanks', bankKey), data, { merge: true });
            draw();
          }));
          body.querySelectorAll('[data-restore]').forEach((btn) => btn.addEventListener('click', async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            data.disabled.splice(Number(btn.getAttribute('data-restore')), 1);
            await fb.setDoc(fb.doc(fb.db, 'gameContentBanks', bankKey), data, { merge: true });
            draw();
          }));
          body.querySelector('#cb-add').addEventListener('click', async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            const item = {};
            let any = false;
            (addFields || []).forEach((f) => {
              const v = body.querySelector(`[data-newfield="${f.key}"]`).value.trim();
              if (v) any = true;
              item[f.key] = v;
            });
            if (!any) return;
            data.custom = data.custom || [];
            data.custom.push(item);
            await fb.setDoc(fb.doc(fb.db, 'gameContentBanks', bankKey), data, { merge: true });
            AdminToast.success('تمت الإضافة');
            draw();
          });
        }
        draw();
        openModal({ title: `بنك ${itemLabel} — ${gameName}`, bodyEl: body, size: 'lg' });
      }
    },
    export: {
      title: `تصدير بنك ${itemLabel} كنسخة احتياطية`,
      keywords: `تصدير نسخة احتياطية بنك ${gameName}`,
      run: async () => {
        const data = await loadDoc();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${bankKey}-backup.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        // بدون هذا التأكيد كان الزر ينزّل الملف بصمت تام بلا أي إشارة —
        // فيبدو للأدمن كأنه ما اشتغل.
        AdminToast.success(`تم تنزيل نسخة احتياطية من بنك ${itemLabel} (${bankKey}-backup.json)`);
      }
    }
  };
}

// -------- لوحة فئة كاملة من الألعاب (أونلاين/جمعات/فردية) — أدوات مجمَّعة على قائمة tags --------
// بدل بناء 20+ قسم مستقل بنفس الأدوات الخمسة، نجمّع كل ألعاب الفئة بنفس
// أدوات النظرة العامة (جلسات، أكثر لعب، أخطاء، تفعيل جماعي) — كل لعبة
// بالفئة تبقى مفلترة بنفس gameTag الحقيقي المستخدَم بـplayEvents/activeStreamers.
export function categoryTools({ tags, categoryName, sectionId }) {
  return [
    {
      title: `لوحة إحصائيات كل ألعاب "${categoryName}" (آخر 30 يوم)`,
      keywords: `احصائيات فئة ${categoryName}`,
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: `إحصائيات ${categoryName}`, bodyEl: body, size: 'lg' });
        const since = Date.now() - 30 * 86400000;
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(5000)));
        const rows = snap.docs.map((d) => d.data());
        const counts = new Map(tags.map((t) => [t, 0]));
        rows.forEach((r) => { if (counts.has(r.gameTag)) counts.set(r.gameTag, counts.get(r.gameTag) + 1); });
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        body.innerHTML = `<table class="admin-table"><thead><tr><th>اللعبة (tag)</th><th>عدد مرات اللعب (30 يوم)</th></tr></thead><tbody>${sorted.map(([t, c]) => `<tr><td class="is-primary" data-label="اللعبة">${t}</td><td data-label="العدد">${fmtNum(c)}</td></tr>`).join('')}</tbody></table>`;
      }
    },
    {
      title: `مراقبة الجلسات الجارية الآن لكل ألعاب "${categoryName}"`,
      keywords: `جلسات جارية فئة ${categoryName}`,
      run: () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        let unsub = () => {};
        openModal({ title: `الجلسات الجارية — ${categoryName}`, bodyEl: body, size: 'lg', onClose: () => unsub() });
        unsub = fb.onSnapshot(fb.collection(fb.db, 'activeStreamers'), (snap) => {
          const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => tags.includes(r.gameTag));
          body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>اللعبة</th><th>الستريمر</th><th>المنصة</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="اللعبة">${r.gameTag}</td><td class="is-primary" data-label="الستريمر">${r.username || '—'}</td><td data-label="المنصة">${r.platform || '—'}</td><td><button class="admin-btn admin-btn--danger admin-btn--sm" data-end="${r.id}">إنهاء</button></td></tr>`).join('')}</tbody></table>` : `<p>ولا جلسة شغّالة الآن من ألعاب ${categoryName}</p>`;
          body.querySelectorAll('[data-end]').forEach((btn) => btn.addEventListener('click', async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            await fb.deleteDoc(fb.doc(fb.db, 'activeStreamers', btn.getAttribute('data-end')));
            AdminToast.success('تم الإنهاء');
          }));
        }, () => { body.textContent = 'تعذّر التحميل'; });
      }
    },
    {
      title: `أكثر لعبة استخداماً ضمن فئة "${categoryName}"`,
      keywords: `اكثر لعبة استخداما فئة ${categoryName}`,
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: `الأكثر استخداماً — ${categoryName}`, bodyEl: body, size: 'md' });
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(5000)));
        const rows = snap.docs.map((d) => d.data()).filter((r) => tags.includes(r.gameTag));
        const counts = new Map();
        rows.forEach((r) => counts.set(r.gameTag, (counts.get(r.gameTag) || 0) + 1));
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        body.innerHTML = top ? `<div class="admin-stat-card"><div class="admin-stat-card__label">الأكثر استخداماً</div><div class="admin-stat-card__value">${top[0]}</div><div class="admin-field__hint">${fmtNum(top[1])} مرة آخر ${fmtNum(rows.length)} حدث مسجَّل بالفئة</div></div>` : '<p>ولا بيانات كافية بعد</p>';
      }
    },
    {
      title: `تفعيل/تعطيل جماعي لكل ألعاب "${categoryName}"`,
      keywords: `تفعيل تعطيل جماعي فئة ${categoryName}`,
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<p>يُطبَّق على ${tags.length} لعبة: ${tags.join('، ')}</p><div style="display:flex;gap:8px;margin-top:10px;"><button class="admin-btn admin-btn--primary admin-btn--sm" id="cat-enable-all">تفعيل الكل</button><button class="admin-btn admin-btn--danger admin-btn--sm" id="cat-disable-all">تعطيل الكل</button></div>`;
        const modal = openModal({ title: `تفعيل/تعطيل جماعي — ${categoryName}`, bodyEl: body, size: 'sm' });
        async function applyAll(enabled) {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const patch = {};
          tags.forEach((t) => { patch[t] = enabled; });
          await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'gameToggles'), patch, { merge: true });
          await AdminAudit.log({ section: sectionId, sectionTitle: categoryName, actionKey: 'category.bulkToggle', actionLabel: `${enabled ? 'تفعيل' : 'تعطيل'} جماعي — ${categoryName}`, sensitive: true });
          AdminToast.success('تم التطبيق على كل ألعاب الفئة');
          modal.close();
        }
        body.querySelector('#cat-enable-all').addEventListener('click', () => applyAll(true));
        body.querySelector('#cat-disable-all').addEventListener('click', () => applyAll(false));
      }
    },
    {
      title: `عرض حالة تفعيل كل لعبة ضمن فئة "${categoryName}" على حدة`,
      keywords: `حالة تفعيل كل لعبة فئة ${categoryName}`,
      run: async () => {
        const snap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'gameToggles'));
        const data = snap.exists() ? snap.data() : {};
        const body = document.createElement('div');
        body.innerHTML = `<table class="admin-table"><thead><tr><th>اللعبة</th><th>الحالة</th><th></th></tr></thead><tbody>${tags.map((t) => {
          const v = data[t];
          const enabled = v !== false;
          return `<tr><td class="is-primary" data-label="اللعبة">${t}</td><td data-label="الحالة"><span class="admin-badge ${enabled ? 'admin-badge--on' : 'admin-badge--off'}">${enabled ? 'مفعّلة' : 'معطّلة'}</span></td><td><button class="admin-btn admin-btn--ghost admin-btn--sm" data-tg="${t}" data-cur="${enabled}">${enabled ? 'تعطيل' : 'تفعيل'}</button></td></tr>`;
        }).join('')}</tbody></table>`;
        openModal({ title: `حالة تفعيل ألعاب ${categoryName}`, bodyEl: body, size: 'lg' });
        body.querySelectorAll('[data-tg]').forEach((btn) => btn.addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const t = btn.getAttribute('data-tg');
          const cur = btn.getAttribute('data-cur') === 'true';
          await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'gameToggles'), { [t]: !cur }, { merge: true });
          AdminToast.success('تم الحفظ');
          btn.closest('tr').remove();
        }));
      }
    },
    {
      title: `سجل الأخطاء التقنية المسجَّلة عبر كل ألعاب "${categoryName}"`,
      keywords: `اخطاء تقنية فئة ${categoryName}`,
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: `أخطاء تقنية — ${categoryName}`, bodyEl: body, size: 'lg' });
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'clientErrorLog'), fb.orderBy('ts', 'desc'), fb.limit(500)));
        const rows = snap.docs.map((d) => d.data()).filter((r) => tags.some((t) => (r.message || '').toLowerCase().includes(t.toLowerCase()) || (r.url || '').toLowerCase().includes(t.toLowerCase())));
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>الرسالة</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.ts)}</td><td data-label="الرسالة">${(r.message || '').slice(0, 120)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا خطأ مطابق مسجَّل — مطابقة نصية تقريبية بعنوان الصفحة/رسالة الخطأ.</p>';
      }
    },
    {
      title: `تصدير تقرير أداء شامل لكل ألعاب "${categoryName}"`,
      keywords: `تصدير تقرير شامل فئة ${categoryName}`,
      run: async () => {
        const since = Date.now() - 30 * 86400000;
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(5000)));
        const rows = snap.docs.map((d) => d.data()).filter((r) => tags.includes(r.gameTag));
        csvDownload(`${categoryName}-report.csv`, [['الوقت', 'اللعبة', 'النوع', 'الستريمر/اللاعب', 'المنصة'], ...rows.map((r) => [fmtDate(r.createdAt), r.gameTag, r.type, r.username, r.platform])]);
        AdminToast.success(`تم تصدير ${rows.length} حدث`);
      }
    }
  ];
}
