// ==================== القسم 25 — النسخ الاحتياطي والاستعادة ====================
// قيد حقيقي مهم: Firestore SDK بالمتصفح ما يقدر "يسرد كل الكولكشنات" تلقائياً
// (خاصية Admin SDK فقط) — نستخدم قائمة كولكشنات معروفة (كل الكولكشنات
// الرئيسية اللي بنتها هذي اللوحة). النسخة تُنزَّل مباشرة لجهازك وقت
// الإنشاء (ما تُخزَّن بقاعدة البيانات لأسباب الحجم) — backupsLog يحتفظ
// بسجل/فهرس العمليات فقط.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, printReport } from '../core/format.js';

const fb = AdminFB;
const KNOWN_COLLECTIONS = [
  'users', 'usernames', 'gameBadges', 'levels', 'leaderboards', 'moderators',
  'framesCatalogExtra', 'badgeDefs', 'streamerProfiles', 'contests', 'feedback',
  'contentReports', 'aiGameSubmissions', 'financialTransactions', 'siteFlags',
  'gameConfig', 'siteContent', 'adminAuditLog', 'devSpecial', 'alfawzanSpecial', 'ghnamSpecial'
];

// التجميعات اللي نبيها موجودة بالنسخة الحيّة على Realtime Database، عشان لو
// خلصت حصة Firestore تلاقي اللوحة بيانات فعلية بدل قاعدة فاضية. أوسع شوي من
// قائمة النسخ اليدوي فوق لأنها تشمل التشغيل اليومي (الحضور، الجلسات، الأجهزة،
// التذاكر، الإشعارات المجدولة...).
const MIRROR_COLLECTIONS = KNOWN_COLLECTIONS.concat([
  'presence', 'activeStreamers', 'liveRounds', 'deviceSessions', 'adminSettings',
  'adminRoles', 'adminNotes', 'adminIpBans', 'adminDeviceBans', 'adminSecurityAlerts',
  'clientErrorLog', 'gameContentBanks', 'notifTemplates', 'scheduledNotifications',
  'broadcastCampaigns', 'specialEvents', 'abExperiments', 'uiText', 'subscriptionPlans',
  'streamerApplications', 'feedbackCannedResponses', 'aiGameTemplates', 'apiHealthLog',
  'recurringContestTemplates', 'backupsLog', 'overlayArchive', 'scheduledContent'
]);

async function dumpCollections(names) {
  const dump = {};
  for (const name of names) {
    const snap = await fb.getDocs(fb.collection(fb.db, name));
    dump[name] = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  }
  return dump;
}
function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptJSON(obj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder().encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
  return { salt: [...salt], iv: [...iv], cipher: [...new Uint8Array(cipher)] };
}

defineSection({
  id: 25,
  title: 'النسخ الاحتياطي والاستعادة',
  description: `نسخ حقيقي لـ${KNOWN_COLLECTIONS.length} كولكشن رئيسي (Firestore لا يدعم سرد الكولكشنات تلقائياً من المتصفح) — الملف يُنزَّل لجهازك مباشرة.`,
  tools: [
    {
      title: 'حالة قاعدة البيانات المستخدَمة الآن (Firestore / احتياطي Realtime)',
      keywords: 'حالة قاعدة بيانات احتياطي realtime firestore حصة',
      run: async () => {
        const R = fb.__resilient;
        const st = R.getBackendState();
        const queued = await R.pendingSyncCount();
        const body = document.createElement('div');
        body.innerHTML = `
          <div class="admin-stat-card"><div class="admin-stat-card__label">القاعدة المستخدَمة الآن</div>
            <div class="admin-stat-card__value">${st.backend === 'rtdb' ? 'Realtime Database (احتياطي)' : 'Firestore (أساسي)'}</div></div>
          <dl class="admin-kv" style="margin-top:10px;">
            <dt>سبب التحويل</dt><dd>${st.blocked ? (st.reason || 'حصة Firestore انتهت') : '—'}</dd>
            <dt>منذ</dt><dd>${st.blocked && st.since ? fmtDate(st.since) : '—'}</dd>
            <dt>كتابات تنتظر المزامنة لـFirestore</dt><dd>${queued}</dd>
          </dl>
          <p class="admin-field__hint" style="margin-top:10px;">التحويل تلقائي بالكامل: أول خطأ "نفاد حصة" من Firestore تنتقل اللوحة لـRealtime Database، وتعيد المحاولة على Firestore كل 3 دقائق — وأول نجاح ترجع له وتزامن كل الكتابات اللي صارت أثناء الانقطاع.</p>
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
            <button class="admin-btn admin-btn--ghost admin-btn--sm" id="bk-force-rtdb">جرّب الوضع الاحتياطي الآن</button>
            <button class="admin-btn admin-btn--ghost admin-btn--sm" id="bk-force-fs">ارجع لـFirestore</button>
            <button class="admin-btn admin-btn--primary admin-btn--sm" id="bk-drain">زامن الكتابات المعلّقة الآن</button>
          </div>`;
        openModal({ title: 'حالة قاعدة البيانات', bodyEl: body, size: 'md' });
        body.querySelector('#bk-force-rtdb').addEventListener('click', () => { R.forceRtdb(true); AdminToast.warn('تحوّلت يدوياً للوضع الاحتياطي — افتح أي أداة وشوفها تشتغل من Realtime Database'); });
        body.querySelector('#bk-force-fs').addEventListener('click', () => { R.forceRtdb(false); AdminToast.success('رجعنا لـFirestore ونزامن المعلّق'); });
        body.querySelector('#bk-drain').addEventListener('click', async () => { await R.drainSyncQueue(); AdminToast.success('تمت محاولة المزامنة — افتح الأداة من جديد لتحديث العدّاد'); });
      }
    },
    {
      title: 'تحديث النسخة الحيّة على Realtime Database (استعداد لنفاد حصة Firestore)',
      keywords: 'مزامنة نسخة حية realtime احتياطي تحديث مرآة',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<p>ينسخ ${MIRROR_COLLECTIONS.length} تجميعة من Firestore إلى Realtime Database، عشان لو خلصت الحصة تلاقي اللوحة بيانات حقيقية جاهزة بدل قاعدة فاضية.</p>
        <p class="admin-field__hint">اللوحة أصلاً تحدّث هذي النسخة تلقائياً: كل كتابة تنكتب بالقاعدتين، وكل قراءة ناجحة تُنسخ كمان. هذي الأداة للتحديث الشامل دفعة وحدة (يُنصح بتشغيلها مرة أول ما تنشر اللوحة).</p>
        <button class="admin-btn admin-btn--primary" id="bk-mirror-go" style="margin-top:8px;">ابدأ التحديث الشامل</button>
        <div id="bk-mirror-out" style="margin-top:10px;"></div>`;
        openModal({ title: 'تحديث النسخة الحيّة', bodyEl: body, size: 'lg' });
        body.querySelector('#bk-mirror-go').addEventListener('click', async (e) => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          e.target.disabled = true;
          const out = body.querySelector('#bk-mirror-out');
          out.innerHTML = 'جارٍ النسخ...';
          const report = await fb.__resilient.backfillCollections(MIRROR_COLLECTIONS, (row, all) => {
            out.innerHTML = `<p>${all.length} / ${MIRROR_COLLECTIONS.length} — آخر تجميعة: ${row.name} (${row.count})</p>`;
          });
          const total = report.reduce((n, r) => n + r.count, 0);
          const failed = report.filter((r) => !r.ok);
          out.innerHTML = `<table class="admin-table"><thead><tr><th>التجميعة</th><th>عدد المستندات</th><th>الحالة</th></tr></thead><tbody>${report.map((r) => `<tr><td class="is-primary" data-label="التجميعة">${r.name}</td><td data-label="العدد">${r.count}</td><td data-label="الحالة">${r.ok ? '✅' : '⚠️ ' + (r.error || '')}</td></tr>`).join('')}</tbody></table>`;
          await AdminAudit.log({ section: 25, sectionTitle: 'النسخ الاحتياطي', actionKey: 'backup.mirrorRtdb', actionLabel: 'تحديث النسخة الحيّة على Realtime Database', after: { collections: report.length, docs: total, failed: failed.length } });
          AdminToast.success(`تم نسخ ${total} مستند من ${report.length - failed.length} تجميعة`);
          e.target.disabled = false;
        });
      }
    },
    {
      title: 'إنشاء نسخة احتياطية يدوية فورية لقاعدة البيانات كاملة',
      keywords: 'نسخة احتياطية فورية يدوية',
      run: () => {
        openConfirm({
          title: 'إنشاء نسخة احتياطية كاملة',
          message: `سيقرأ ${KNOWN_COLLECTIONS.length} كولكشن ويُنزِّل ملف JSON واحد لجهازك الآن.`,
          onConfirm: async () => {
            const dump = await dumpCollections(KNOWN_COLLECTIONS);
            const docsCount = Object.values(dump).reduce((s, arr) => s + arr.length, 0);
            downloadJSON(dump, `ehsmaha-backup-${Date.now()}.json`);
            await fb.setDoc(fb.doc(fb.collection(fb.db, 'backupsLog')), { collections: KNOWN_COLLECTIONS.length, docsCount, ts: fb.serverTimestamp(), type: 'full' });
            await AdminAudit.log({ section: 25, sectionTitle: 'النسخ الاحتياطي والاستعادة', actionKey: 'backup.full', actionLabel: 'نسخة احتياطية كاملة', after: { docsCount }, sensitive: true });
            AdminToast.success(`تم — ${docsCount} مستند`);
          }
        });
      }
    },
    {
      title: 'جدولة نسخ احتياطي تلقائي (يومي/أسبوعي)',
      keywords: 'جدولة نسخ احتياطي تلقائي',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">التكرار</span><select class="admin-input" id="bk-freq"><option value="daily">يومي</option><option value="weekly">أسبوعي</option></select></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="bk-save" style="margin-top:8px;">حفظ</button><p class="admin-field__hint">بدون Cloud Functions، هذا يحفظ التفضيل فقط — التنفيذ الفعلي يحتاج فتح اللوحة والضغط "نسخة فورية" حسب الجدول، أو ربط Cloud Function مستقبلاً.</p>`;
        const modal = openModal({ title: 'جدولة النسخ الاحتياطي', bodyEl: body, size: 'sm' });
        body.querySelector('#bk-save').addEventListener('click', async () => {
          await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'backupSchedule'), { frequency: body.querySelector('#bk-freq').value }, { merge: true });
          AdminToast.success('تم الحفظ');
          modal.close();
        });
      }
    },
    {
      title: 'عرض قائمة كل النسخ الاحتياطية المتوفرة بتاريخها',
      keywords: 'قائمة نسخ احتياطية متوفرة',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'backupsLog'), fb.orderBy('ts', 'desc'), fb.limit(100)));
        const rows = snap.docs.map((d) => d.data());
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>النوع</th><th>عدد المستندات</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.ts)}</td><td data-label="النوع">${r.type}</td><td data-label="المستندات">${r.docsCount}</td></tr>`).join('')}</tbody></table><p class="admin-field__hint">هذا فهرس العمليات فقط — الملفات نفسها نزلت لجهازك وقت كل عملية.</p>` : '<p>ولا نسخة احتياطية بعد</p>';
        openModal({ title: 'سجل النسخ الاحتياطية', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'استعادة نقطة سابقة كاملة بتأكيد مزدوج',
      keywords: 'استعادة نقطة سابقة كاملة',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">ملف النسخة الاحتياطية (JSON)</span><input class="admin-input" type="file" id="rs-file" accept="application/json" /></div><div id="rs-status" style="margin-top:8px;"></div>';
        openModal({ title: 'استعادة كاملة', bodyEl: body, size: 'sm' });
        body.querySelector('#rs-file').addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const data = JSON.parse(await file.text());
          const totalDocs = Object.values(data).reduce((s, arr) => s + arr.length, 0);
          openConfirm({
            title: 'تأكيد الاستعادة الكاملة', danger: true, doubleConfirm: true,
            message: `سيستبدل ${totalDocs} مستند بالحالة المخزَّنة بالملف. لا يمكن التراجع.`,
            onConfirm: async () => {
              if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
              for (const [col, docs] of Object.entries(data)) {
                for (const d of docs) await fb.setDoc(fb.doc(fb.db, col, d.id), d.data);
              }
              await fb.setDoc(fb.doc(fb.collection(fb.db, 'backupsLog')), { type: 'restore', docsCount: totalDocs, ts: fb.serverTimestamp() });
              await AdminAudit.log({ section: 25, sectionTitle: 'النسخ الاحتياطي والاستعادة', actionKey: 'backup.restoreFull', actionLabel: 'استعادة كاملة من نسخة احتياطية', after: { totalDocs }, sensitive: true });
              AdminToast.success('تمت الاستعادة');
            }
          });
        });
      }
    },
    {
      title: 'استعادة جزء محدد فقط (مثل بيانات لاعب واحد)',
      keywords: 'استعادة جزء محدد لاعب واحد',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">ملف النسخة</span><input class="admin-input" type="file" id="rp-file" accept="application/json" /></div>
        <div class="admin-field"><span class="admin-field__label">الكولكشن</span><input class="admin-input" id="rp-col" placeholder="مثال: users" /></div>
        <div class="admin-field"><span class="admin-field__label">معرّف المستند</span><input class="admin-input" id="rp-id" /></div>
        <button class="admin-btn admin-btn--danger admin-btn--sm" id="rp-go" style="margin-top:8px;">استعادة هذا المستند فقط</button>`;
        const modal = openModal({ title: 'استعادة جزئية', bodyEl: body, size: 'sm' });
        body.querySelector('#rp-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const file = body.querySelector('#rp-file').files[0];
          if (!file) return;
          const data = JSON.parse(await file.text());
          const col = body.querySelector('#rp-col').value.trim();
          const id = body.querySelector('#rp-id').value.trim();
          const doc = (data[col] || []).find((d) => d.id === id);
          if (!doc) { AdminToast.error('ما لقيت هذا المستند بالملف'); return; }
          await fb.setDoc(fb.doc(fb.db, col, id), doc.data);
          await AdminAudit.log({ section: 25, sectionTitle: 'النسخ الاحتياطي والاستعادة', actionKey: 'backup.restorePartial', actionLabel: 'استعادة جزئية', targetType: col, targetId: id, sensitive: true });
          AdminToast.success('تمت الاستعادة');
          modal.close();
        });
      }
    },
    {
      title: 'تحميل نسخة احتياطية كملف لحفظها خارجياً (اختيار كولكشنات)',
      keywords: 'تحميل نسخة احتياطية ملف مخصص',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-table-wrap" style="max-height:250px;overflow-y:auto;">${KNOWN_COLLECTIONS.map((c) => `<label class="admin-field admin-field--checkbox"><input type="checkbox" data-col="${c}" checked/><span>${c}</span></label>`).join('')}</div><button class="admin-btn admin-btn--primary admin-btn--sm" id="cs-go" style="margin-top:8px;">تصدير المحدَّد</button>`;
        openModal({ title: 'تصدير مخصَّص', bodyEl: body, size: 'md' });
        body.querySelector('#cs-go').addEventListener('click', async () => {
          const selected = [...body.querySelectorAll('[data-col]:checked')].map((el) => el.getAttribute('data-col'));
          const dump = await dumpCollections(selected);
          downloadJSON(dump, `ehsmaha-backup-custom-${Date.now()}.json`);
          AdminToast.success('تم التنزيل');
        });
      }
    },
    {
      title: 'حذف نسخة احتياطية قديمة لتوفير مساحة',
      keywords: 'حذف نسخة احتياطية قديمة',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'backupsLog'), fb.orderBy('ts', 'asc'), fb.limit(50)));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.ts)}</td><td><button class="admin-btn admin-btn--ghost admin-btn--sm" data-del="${r.id}">حذف من السجل</button></td></tr>`).join('')}</tbody></table>` : '<p>ولا سجل بعد</p>';
        openModal({ title: 'حذف نسخة من السجل', bodyEl: body, size: 'md' });
        body.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', async () => { await fb.deleteDoc(fb.doc(fb.db, 'backupsLog', btn.getAttribute('data-del'))); btn.closest('tr').remove(); }));
      }
    },
    {
      title: 'مقارنة نسخة احتياطية بالحالة الحالية لمعرفة الفروقات',
      keywords: 'مقارنة نسخة احتياطية حالة حالية',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">ملف النسخة</span><input class="admin-input" type="file" id="cm-file" accept="application/json" /></div><div id="cm-result" style="margin-top:10px;"></div>';
        openModal({ title: 'مقارنة نسخة بالحالة الحالية', bodyEl: body, size: 'lg' });
        body.querySelector('#cm-file').addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const data = JSON.parse(await file.text());
          const rows = [];
          for (const col of Object.keys(data)) {
            const liveSnap = await fb.getDocs(fb.collection(fb.db, col));
            rows.push([col, data[col].length, liveSnap.size]);
          }
          body.querySelector('#cm-result').innerHTML = `<table class="admin-table"><thead><tr><th>الكولكشن</th><th>بالنسخة</th><th>الحالي</th></tr></thead><tbody>${rows.map(([c, a, b]) => `<tr><td class="is-primary" data-label="الكولكشن">${c}</td><td data-label="بالنسخة">${a}</td><td data-label="الحالي">${b}</td></tr>`).join('')}</tbody></table>`;
        });
      }
    },
    {
      title: 'اختبار سلامة نسخة احتياطية قبل الاعتماد عليها',
      keywords: 'اختبار سلامة نسخة احتياطية',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">ملف النسخة</span><input class="admin-input" type="file" id="vf-file" accept="application/json" /></div><div id="vf-result" style="margin-top:10px;"></div>';
        openModal({ title: 'اختبار سلامة نسخة', bodyEl: body, size: 'sm' });
        body.querySelector('#vf-file').addEventListener('change', async (e) => {
          const file = e.target.files[0];
          const resultEl = body.querySelector('#vf-result');
          try {
            const data = JSON.parse(await file.text());
            const cols = Object.keys(data);
            const totalDocs = Object.values(data).reduce((s, arr) => s + arr.length, 0);
            resultEl.innerHTML = `<div class="admin-stat-card admin-stat-card--good"><div class="admin-stat-card__label">ملف صالح — ${cols.length} كولكشن، ${totalDocs} مستند</div></div>`;
          } catch (err) { resultEl.innerHTML = `<div class="admin-stat-card admin-stat-card--danger"><div class="admin-stat-card__label">ملف تالف: ${err.message}</div></div>`; }
        });
      }
    },
    {
      title: 'تنبيه عند فشل عملية نسخ احتياطي مجدول',
      keywords: 'تنبيه فشل نسخ احتياطي مجدول',
      run: async () => {
        const [scheduleSnap, logSnap] = await Promise.all([fb.getDoc(fb.doc(fb.db, 'siteFlags', 'backupSchedule')), fb.getDocs(fb.query(fb.collection(fb.db, 'backupsLog'), fb.orderBy('ts', 'desc'), fb.limit(1)))]);
        const schedule = scheduleSnap.exists() ? scheduleSnap.data() : null;
        const last = logSnap.docs[0] ? logSnap.docs[0].data() : null;
        const body = document.createElement('div');
        if (!schedule) { body.innerHTML = '<p>ولا جدولة مفعّلة حالياً</p>'; }
        else {
          const maxGapMs = schedule.frequency === 'daily' ? 26 * 3600000 : 8 * 86400000;
          const lastMs = last && last.ts && last.ts.toMillis ? last.ts.toMillis() : 0;
          const overdue = !last || (Date.now() - lastMs) > maxGapMs;
          body.innerHTML = `<div class="admin-stat-card ${overdue ? 'admin-stat-card--danger' : 'admin-stat-card--good'}"><div class="admin-stat-card__label">${overdue ? 'النسخ الاحتياطي المجدول متأخر!' : 'النسخ الاحتياطي بمعدله الطبيعي'}</div></div>`;
        }
        openModal({ title: 'حالة الجدولة', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'تحديد عدد النسخ المحتفَظ بها قبل الحذف التلقائي للأقدم',
      keywords: 'عدد نسخ محتفظ بها حذف تلقائي',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">عدد سجلات الاحتفاظ</span><input class="admin-input" id="rt-count" type="number" value="10" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="rt-save" style="margin-top:8px;">حفظ</button>';
        const modal = openModal({ title: 'سياسة الاحتفاظ', bodyEl: body, size: 'sm' });
        body.querySelector('#rt-save').addEventListener('click', async () => {
          await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'backupSchedule'), { retentionCount: Number(body.querySelector('#rt-count').value) }, { merge: true });
          AdminToast.success('تم الحفظ');
          modal.close();
        });
      }
    },
    {
      title: 'نسخة احتياطية فورية تلقائية قبل أي إجراء حذف جماعي',
      keywords: 'نسخة فورية قبل حذف جماعي',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">الكولكشن المستهدَف بالحذف الجماعي القادم</span><select class="admin-input" id="pb-col">${KNOWN_COLLECTIONS.map((c) => `<option>${c}</option>`).join('')}</select></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="pb-go" style="margin-top:8px;">نسخة احتياطية لهذا الكولكشن الآن</button>`;
        openModal({ title: 'نسخة وقائية قبل حذف جماعي', bodyEl: body, size: 'sm' });
        body.querySelector('#pb-go').addEventListener('click', async () => {
          const col = body.querySelector('#pb-col').value;
          const dump = await dumpCollections([col]);
          downloadJSON(dump, `ehsmaha-${col}-before-delete-${Date.now()}.json`);
          await fb.setDoc(fb.doc(fb.collection(fb.db, 'backupsLog')), { type: 'pre-delete-' + col, docsCount: dump[col].length, ts: fb.serverTimestamp() });
          AdminToast.success('تم أخذ النسخة — أكمل عملية الحذف الجماعي بأمان الآن');
        });
      }
    },
    {
      title: 'تشفير النسخ الاحتياطية الحساسة',
      keywords: 'تشفير نسخ احتياطية حساسة',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">كلمة مرور التشفير</span><input class="admin-input" type="password" id="en-pass" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="en-go" style="margin-top:8px;">إنشاء نسخة مشفَّرة (AES-GCM)</button>`;
        openModal({ title: 'نسخة احتياطية مشفَّرة', bodyEl: body, size: 'sm' });
        body.querySelector('#en-go').addEventListener('click', async () => {
          const pass = body.querySelector('#en-pass').value;
          if (!pass) { AdminToast.error('اكتب كلمة مرور'); return; }
          const dump = await dumpCollections(KNOWN_COLLECTIONS);
          const encrypted = await encryptJSON(dump, pass);
          downloadJSON(encrypted, `ehsmaha-backup-encrypted-${Date.now()}.json.enc`);
          AdminToast.success('تم — التشفير AES-GCM حقيقي بمكتبة Web Crypto، احتفظ بكلمة المرور جيداً (لا يمكن استرجاعها بدونها)');
        });
      }
    },
    {
      title: 'سجل كل عمليات الاستعادة السابقة ومن نفّذها',
      keywords: 'سجل عمليات استعادة سابقة',
      run: async () => {
        const rows = (await AdminAudit.fetchAllForExport()).filter((r) => (r.actionKey || '').startsWith('backup.restore'));
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>النوع</th><th>بواسطة</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.tsClient)}</td><td class="is-primary" data-label="النوع">${r.actionLabel}</td><td data-label="بواسطة">${r.actorEmail}</td></tr>`).join('')}</tbody></table>` : '<p>ولا استعادة نُفِّذت بعد</p>';
        openModal({ title: 'سجل عمليات الاستعادة', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'تصدير سياسة النسخ الاحتياطي الحالية كمستند مرجعي',
      keywords: 'تصدير سياسة نسخ احتياطي مرجعي',
      run: async () => {
        const snap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'backupSchedule'));
        const policy = snap.exists() ? snap.data() : {};
        printReport('سياسة النسخ الاحتياطي الحالية', `<p>التكرار: ${policy.frequency || 'غير محدَّد'}</p><p>عدد السجلات المحتفَظ بها: ${policy.retentionCount || 'غير محدَّد'}</p><p>الكولكشنات المشمولة: ${KNOWN_COLLECTIONS.length}</p>`);
      }
    }
  ]
});
