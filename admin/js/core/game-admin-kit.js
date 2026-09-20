// ==================== عُدّة أدوات مشتركة لكل قسم لعبة (31-44 و42-44) ====================
// كل الأقسام المخصّصة للألعاب الفردية تتشارك نفس الأنماط الخمسة: مراقبة
// الجلسات الجارية، سجل آخر النتائج، تعطيل/تفعيل اللعبة، أكثر الستريمرز
// استخداماً، وسجل الأخطاء التقنية — بدل تكرار نفس الكود بكل ملف قسم.
import { AdminFB } from './firebase.js';
import { AdminAudit } from './audit.js';
import { openModal, isReadOnly } from './modal.js';
import { AdminToast } from './toast.js';
import { fmtDate, fmtNum, csvDownload } from './format.js';

const fb = AdminFB;

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
      }
    }
  };
}
