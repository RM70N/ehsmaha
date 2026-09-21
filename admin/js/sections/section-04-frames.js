// ==================== القسم 4 — إدارة الإطارات ====================
// تصحيح ثانٍ جوهري: الكتالوج الحقيقي اللي يعرضه الموقع هو
// **framesCatalogExtra** — الموقع يشتغل بـframesEffectiveCatalog() =
// FRAMES_CATALOG (مصفوفة ثابتة داخل index.html) + framesPublicExtra، والثانية
// مصدرها مستمع حيّ على framesCatalogExtra حيث visibility == 'public'
// (Firestore وRTDB معاً، يُدمجان). الكتالوج اللي كان مستخدماً هنا سابقاً
// (framesCatalog) ما يقرأه الموقع بأي مكان، يعني كل إطار يُرفع من اللوحة كان
// ما يظهر بمعرض الإطارات إطلاقاً رغم نجاح الحفظ.
// شروط الظهور بالموقع حرفياً (framesPublicExtraApplyDocs + framesInjectRingWithFrame):
//   visibility === 'public'  و  imageUrl موجود  و  hole موجود
// وhole = [left, top, width, height] كنِسَب مئوية لفتحة الأفتار داخل الإطار —
// بدونه الإطار يُرمى بصمت من الكاش ولا يظهر.
// نكتب على Firestore وRTDB معاً (نفس ما يسوي الموقع بـframesWriteKV) عشان
// المصدرين ما يتناقضان.
// تصحيح جوهري: الملكية الفعلية **ليست** على users/{uid}.ownedFrames — الموقع
// الرئيسي يخزّنها على levels/{key}.ownedFrames (key = levelsKey(username))،
// ويقرأها بمفتاحين: يوزر الموقع ويوزر تيك توك المربوط. كل منح/سحب هنا صار
// يمر عبر framesGrant/framesRevoke المشتركة اللي تكتب على المفتاحين معاً —
// قبل التصحيح كان المنح يكتب حقلاً لا أحد يقرأه فما يظهر الإطار للاعب أبداً.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload } from '../core/format.js';
import { getUserByUsername, resolveUidByUsername, framesGrant, framesRevoke, countFrameOwners, listFrameOwners, levelsKey } from '../core/players.js';

const fb = AdminFB;

const FRAMES_COL = 'framesCatalogExtra';

async function listFrames() {
  const snap = await fb.getDocs(fb.collection(fb.db, FRAMES_COL));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// hole يُكتب كنص "l,t,w,h" بالنماذج ويتحوّل هنا لمصفوفة أرقام — الموقع
// يفكّها بـ const [l, t, w, h] = f.hole مباشرة.
function parseHole(raw) {
  const parts = String(raw || '').split(',').map((x) => Number(String(x).trim()));
  if (parts.length !== 4 || parts.some((n) => isNaN(n))) return null;
  return parts;
}

// كتابة/تحديث على Firestore وRTDB معاً (أفضل جهد على RTDB — Firestore هو
// المصدر الأساسي اللي يقرأه الموقع أولاً).
async function frameWrite(id, patch, { merge = true } = {}) {
  await fb.setDoc(fb.doc(fb.db, FRAMES_COL, id), patch, { merge });
  if (fb.rtdb) {
    try { await fb.rtdbUpdate(fb.rtdbRef(fb.rtdb, FRAMES_COL + '/' + id), patch); } catch (err) { /* أفضل جهد */ }
  }
}

async function frameDelete(id) {
  await fb.deleteDoc(fb.doc(fb.db, FRAMES_COL, id));
  if (fb.rtdb) {
    try { await fb.rtdbRemove(fb.rtdbRef(fb.rtdb, FRAMES_COL + '/' + id)); } catch (err) { /* أفضل جهد */ }
  }
}
async function countOwners(frameId) {
  return countFrameOwners(frameId);
}

defineSection({
  id: 4,
  title: 'الإطارات',
  description: 'الكتالوج الحقيقي اللي يعرضه الموقع (framesCatalogExtra، visibility=public) والملكية الفعلية على levels/{key}.ownedFrames — نفس المسارين اللي يقرأهما الموقع بالضبط.',
  tools: [
    {
      title: 'رفع إطار عام جديد يظهر لكل المستخدمين',
      keywords: 'رفع اطار جديد عام',
      run: () => {
        openFormModal({
          title: 'إطار عام جديد',
          fields: [
            { key: 'id', label: 'معرّف الإطار (إنجليزي بدون مسافات)', required: true },
            { key: 'name', label: 'الاسم', required: true },
            { key: 'imageUrl', label: 'رابط الصورة أو data URI', required: true },
            { key: 'hole', label: 'فتحة الأفتار hole (يسار,أعلى,عرض,ارتفاع — نِسَب مئوية)', value: '4,18,24,79', required: true, placeholder: '4,18,24,79' },
            { key: 'grantAll', label: 'امنحه فوراً لكل سجلات المستويات الحالية', type: 'select', options: [{ value: 'no', label: 'لا — يظهر بالمعرض ويُختار باللفل' }, { value: 'yes', label: 'نعم — منح فوري للجميع' }] }
          ],
          onSubmit: async (v) => {
            const hole = parseHole(v.hole);
            if (!hole) throw new Error('صيغة hole غير صحيحة — لازم أربعة أرقام مفصولة بفواصل، مثل 4,18,24,79');
            // visibility:'public' شرط إلزامي — بدونه الموقع يتجاهل الإطار كلياً.
            await frameWrite(v.id, { name: v.name, imageUrl: v.imageUrl, hole, visibility: 'public', createdAt: Date.now() }, { merge: false });
            let granted = 0;
            if (v.grantAll === 'yes') {
              const levelsSnap = await fb.getDocs(fb.collection(fb.db, 'levels'));
              await Promise.all(levelsSnap.docs.map((d) => fb.setDoc(fb.doc(fb.db, 'levels', d.id), { ownedFrames: fb.arrayUnion(v.id) }, { merge: true })));
              granted = levelsSnap.size;
            }
            await AdminAudit.log({ section: 4, sectionTitle: 'الإطارات', actionKey: 'frames.createGlobal', actionLabel: 'رفع إطار عام جديد', targetType: 'frame', targetId: v.id, after: { hole, grantedTo: granted } });
            AdminToast.success(granted ? `تم الرفع بالمعرض ومنحه لـ${granted} سجل` : 'تم الرفع — يظهر بمعرض الإطارات لكل الزوار فوراً');
          }
        });
      }
    },
    {
      title: 'منح إطار خاص للاعب معيّن بالبحث عن اسمه',
      keywords: 'منح اطار لاعب',
      run: async () => {
        const frames = await listFrames();
        openFormModal({
          title: 'منح إطار للاعب',
          fields: [
            { key: 'username', label: 'اسم المستخدم', required: true },
            { key: 'frameId', label: 'الإطار', type: 'select', options: frames.map((f) => ({ value: f.id, label: f.name })), required: true }
          ],
          onSubmit: async (v) => {
            const uid = await resolveUidByUsername(v.username);
            if (!uid) throw new Error('ما لقيت هذا المستخدم');
            const keys = await framesGrant(v.username, v.frameId);
            await AdminAudit.log({ section: 4, sectionTitle: 'الإطارات', actionKey: 'frames.grant', actionLabel: 'منح إطار للاعب', targetType: 'user', targetId: uid, targetLabel: v.username, after: { frameId: v.frameId, levelsKeys: keys } });
            AdminToast.success('تم المنح على ' + keys.length + ' مفتاح (' + keys.join('، ') + ')');
          }
        });
      }
    },
    {
      title: 'سحب إطار ممنوح من لاعب',
      keywords: 'سحب اطار لاعب',
      run: async () => {
        const frames = await listFrames();
        openFormModal({
          title: 'سحب إطار من لاعب',
          fields: [
            { key: 'username', label: 'اسم المستخدم', required: true },
            { key: 'frameId', label: 'الإطار', type: 'select', options: frames.map((f) => ({ value: f.id, label: f.name })), required: true }
          ],
          onSubmit: async (v) => {
            const uid = await resolveUidByUsername(v.username);
            if (!uid) throw new Error('ما لقيت هذا المستخدم');
            const keys = await framesRevoke(v.username, v.frameId);
            await AdminAudit.log({ section: 4, sectionTitle: 'الإطارات', actionKey: 'frames.revoke', actionLabel: 'سحب إطار من لاعب', targetType: 'user', targetId: uid, targetLabel: v.username, after: { frameId: v.frameId, levelsKeys: keys }, sensitive: true });
            AdminToast.success('تم السحب من ' + keys.length + ' مفتاح');
          }
        });
      }
    },
    {
      title: 'معرض كل الإطارات الحالية مع عدد من يملك كل واحد',
      keywords: 'معرض اطارات عدد ملاك',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'معرض الإطارات', bodyEl: body, size: 'xl' });
        const frames = await listFrames();
        const counts = await Promise.all(frames.map((f) => countOwners(f.id)));
        body.innerHTML = frames.length ? `<table class="admin-table"><thead><tr><th>الاسم</th><th>المعرّف</th><th>عدد المالكين</th><th>الحالة</th></tr></thead>
          <tbody>${frames.map((f, i) => `<tr><td class="is-primary" data-label="الاسم">${f.name}</td><td data-label="المعرّف">${f.id}</td><td data-label="العدد">${fmtNum(counts[i])}</td><td data-label="الحالة">${f.active === false ? 'معطَّل' : 'مفعّل'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا إطار بالكتالوج بعد</p>';
      }
    },
    {
      title: 'تحديد إطار "موسمي" له تاريخ انتهاء تلقائي',
      keywords: 'اطار موسمي تاريخ انتهاء',
      run: async () => {
        const frames = await listFrames();
        openFormModal({
          title: 'تحديد إطار موسمي',
          fields: [
            { key: 'frameId', label: 'الإطار', type: 'select', options: frames.map((f) => ({ value: f.id, label: f.name })), required: true },
            { key: 'expiresAt', label: 'تاريخ الانتهاء', type: 'date', required: true }
          ],
          onSubmit: async (v) => {
            // millis مو Date: RTDB ما يقبل كائن Date (والموقع ما يقرأ الحقل أصلاً، هذا سجل إداري).
            await frameWrite(v.frameId, { seasonal: true, expiresAtMs: new Date(v.expiresAt).getTime() });
            await AdminAudit.log({ section: 4, sectionTitle: 'الإطارات', actionKey: 'frames.seasonal', actionLabel: 'تحديد إطار موسمي', targetType: 'frame', targetId: v.frameId, after: { expiresAt: v.expiresAt } });
            AdminToast.success('تم الحفظ — استخدم أداة "تعطيل إطار مؤقتاً" أو نظّف الملكية يدوياً بعد الانتهاء (لا يوجد تشغيل مجدول تلقائي بالخطة الحالية)');
          }
        });
      }
    },
    {
      title: 'ربط إطار معيّن بإنجاز أو شارة محددة',
      keywords: 'ربط اطار بشارة انجاز',
      run: async () => {
        const frames = await listFrames();
        const badgesSnap = await fb.getDocs(fb.collection(fb.db, 'badgeDefs'));
        const badges = badgesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        openFormModal({
          title: 'ربط إطار بشارة',
          fields: [
            { key: 'frameId', label: 'الإطار', type: 'select', options: frames.map((f) => ({ value: f.id, label: f.name })), required: true },
            { key: 'badgeId', label: 'الشارة (تُمنح تلقائياً عند نيلها — قسم 5)', type: 'select', options: badges.map((b) => ({ value: b.id, label: b.name })) }
          ],
          onSubmit: async (v) => {
            await frameWrite(v.frameId, { linkedBadgeId: v.badgeId || null });
            await AdminAudit.log({ section: 4, sectionTitle: 'الإطارات', actionKey: 'frames.linkBadge', actionLabel: 'ربط إطار بشارة', targetType: 'frame', targetId: v.frameId, after: { badgeId: v.badgeId } });
            AdminToast.success('تم الربط — قسم 5 يمنح هذا الإطار تلقائياً عند منح الشارة');
          }
        });
      }
    },
    {
      title: 'حذف إطار قديم من النظام بالكامل',
      keywords: 'حذف اطار نهائي',
      run: async () => {
        const frames = await listFrames();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">الإطار</span><select class="admin-input" id="fr-del-select">${frames.map((f) => `<option value="${f.id}">${f.name}</option>`).join('')}</select></div>
        <button class="admin-btn admin-btn--danger admin-btn--sm" id="fr-del-go" style="margin-top:8px;">حذف نهائياً من الجميع</button>`;
        const modal = openModal({ title: 'حذف إطار', bodyEl: body, size: 'sm' });
        body.querySelector('#fr-del-go').addEventListener('click', () => {
          const frameId = body.querySelector('#fr-del-select').value;
          openConfirm({
            title: 'تأكيد الحذف', danger: true, doubleConfirm: true,
            message: 'يحذف الإطار من الكتالوج ومن كل من يملكه حالياً.',
            onConfirm: async () => {
              const owners = await listFrameOwners(frameId);
              await Promise.all(owners.map((o) => fb.setDoc(fb.doc(fb.db, 'levels', o.key), { ownedFrames: fb.arrayRemove(frameId) }, { merge: true })));
              await frameDelete(frameId);
              await AdminAudit.log({ section: 4, sectionTitle: 'الإطارات', actionKey: 'frames.delete', actionLabel: 'حذف إطار نهائياً', targetType: 'frame', targetId: frameId, after: { removedFrom: ownersSnap.size }, sensitive: true });
              AdminToast.success(`تم الحذف من ${ownersSnap.size} حساب`);
              modal.close();
            }
          });
        });
      }
    },
    {
      title: 'معاينة الإطار على أفتار وهمي قبل النشر',
      keywords: 'معاينة اطار افتار',
      run: async () => {
        const frames = await listFrames();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">الإطار</span><select class="admin-input" id="fr-prev-select">${frames.map((f) => `<option value="${f.id}">${f.name}</option>`).join('')}</select></div>
        <div id="fr-prev-box" style="margin-top:14px;width:120px;height:120px;border-radius:50%;background:#333;position:relative;overflow:hidden;"></div>`;
        openModal({ title: 'معاينة الإطار', bodyEl: body, size: 'sm' });
        function draw() {
          const f = frames.find((x) => x.id === body.querySelector('#fr-prev-select').value);
          body.querySelector('#fr-prev-box').innerHTML = f ? `<img src="${f.imageUrl}" style="width:100%;height:100%;object-fit:cover;" />` : '';
        }
        body.querySelector('#fr-prev-select').addEventListener('change', draw);
        draw();
      }
    },
    {
      title: 'ترتيب أولوية عرض الإطارات في متجر اللاعب',
      keywords: 'ترتيب اولوية اطارات',
      run: async () => {
        const frames = await listFrames();
        openFormModal({
          title: 'أولوية عرض إطار',
          fields: [
            { key: 'frameId', label: 'الإطار', type: 'select', options: frames.map((f) => ({ value: f.id, label: f.name })), required: true },
            { key: 'priority', label: 'الأولوية (رقم أكبر = أول بالعرض)', type: 'number', value: 0 }
          ],
          onSubmit: async (v) => {
            await frameWrite(v.frameId, { priority: Number(v.priority) });
            await AdminAudit.log({ section: 4, sectionTitle: 'الإطارات', actionKey: 'frames.priority', actionLabel: 'تعديل أولوية عرض إطار', targetType: 'frame', targetId: v.frameId, after: { priority: v.priority } });
            AdminToast.success('تم الحفظ');
          }
        });
      }
    },
    {
      title: 'تفعيل إطار حصري لفعالية معيّنة',
      keywords: 'اطار حصري فعالية',
      run: async () => {
        const frames = await listFrames();
        openFormModal({
          title: 'إطار حصري لفعالية',
          fields: [
            { key: 'frameId', label: 'الإطار', type: 'select', options: frames.map((f) => ({ value: f.id, label: f.name })), required: true },
            { key: 'eventName', label: 'اسم الفعالية', required: true }
          ],
          onSubmit: async (v) => {
            await frameWrite(v.frameId, { eventExclusive: v.eventName });
            await AdminAudit.log({ section: 4, sectionTitle: 'الإطارات', actionKey: 'frames.eventExclusive', actionLabel: 'تفعيل إطار حصري لفعالية', targetType: 'frame', targetId: v.frameId, after: { eventName: v.eventName } });
            AdminToast.success('تم الحفظ');
          }
        });
      }
    },
    {
      title: 'تقرير بأكثر الإطارات طلباً/استخداماً',
      keywords: 'تقرير اكثر اطارات استخداما',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'أكثر الإطارات استخداماً', bodyEl: body, size: 'lg' });
        const frames = await listFrames();
        const counts = await Promise.all(frames.map((f) => countOwners(f.id)));
        const sorted = frames.map((f, i) => ({ ...f, count: counts[i] })).sort((a, b) => b.count - a.count);
        body.innerHTML = sorted.length ? `<table class="admin-table"><thead><tr><th>الإطار</th><th>عدد المالكين</th></tr></thead><tbody>${sorted.map((f) => `<tr><td class="is-primary" data-label="الإطار">${f.name}</td><td data-label="العدد">${fmtNum(f.count)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا بيانات</p>';
      }
    },
    {
      title: 'تعديل صورة إطار موجود دون تغيير من يملكه',
      keywords: 'تعديل صورة اطار',
      run: async () => {
        const frames = await listFrames();
        openFormModal({
          title: 'تعديل صورة إطار',
          fields: [
            { key: 'frameId', label: 'الإطار', type: 'select', options: frames.map((f) => ({ value: f.id, label: f.name })), required: true },
            { key: 'imageUrl', label: 'رابط الصورة الجديد', required: true }
          ],
          onSubmit: async (v) => {
            await frameWrite(v.frameId, { imageUrl: v.imageUrl });
            await AdminAudit.log({ section: 4, sectionTitle: 'الإطارات', actionKey: 'frames.editImage', actionLabel: 'تعديل صورة إطار', targetType: 'frame', targetId: v.frameId });
            AdminToast.success('تم التحديث لكل من يملك هذا الإطار فوراً');
          }
        });
      }
    },
    {
      title: 'منح إطار جماعي لكل المشاركين بفعالية دفعة واحدة',
      keywords: 'منح جماعي اطار فعالية',
      run: async () => {
        const frames = await listFrames();
        const body = document.createElement('div');
        body.innerHTML = `
          <div class="admin-field"><span class="admin-field__label">الإطار</span><select class="admin-input" id="bulk-frame">${frames.map((f) => `<option value="${f.id}">${f.name}</option>`).join('')}</select></div>
          <div class="admin-field"><span class="admin-field__label">أسماء المستخدمين (كل واحد بسطر)</span><textarea class="admin-input" id="bulk-names" rows="6"></textarea></div>
          <button class="admin-btn admin-btn--primary admin-btn--sm" id="bulk-go" style="margin-top:8px;">منح للكل</button>
        `;
        const modal = openModal({ title: 'منح إطار جماعي', bodyEl: body, size: 'md' });
        body.querySelector('#bulk-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const frameId = body.querySelector('#bulk-frame').value;
          const names = body.querySelector('#bulk-names').value.split('\n').map((s) => s.trim()).filter(Boolean);
          let ok = 0;
          for (const name of names) {
            const uid = await resolveUidByUsername(name);
            if (uid) { await framesGrant(name, frameId); ok++; }
          }
          await AdminAudit.log({ section: 4, sectionTitle: 'الإطارات', actionKey: 'frames.bulkGrant', actionLabel: 'منح إطار جماعي', targetType: 'frame', targetId: frameId, after: { count: ok, total: names.length } });
          AdminToast.success(`تم المنح لـ${ok} من أصل ${names.length}`);
          modal.close();
        });
      }
    },
    {
      title: 'تعطيل إطار مؤقتاً بدون حذفه',
      keywords: 'تعطيل اطار مؤقت',
      run: async () => {
        const frames = await listFrames();
        openFormModal({
          title: 'تعطيل/تفعيل إطار من الكتالوج',
          fields: [
            { key: 'frameId', label: 'الإطار', type: 'select', options: frames.map((f) => ({ value: f.id, label: `${f.name} (${f.visibility === 'public' ? 'ظاهر' : 'مخفي'})` })), required: true }
          ],
          submitText: 'تبديل الحالة',
          onSubmit: async (v) => {
            // الموقع يفلتر بـvisibility === 'public' حرفياً، فالتعطيل لازم يكون
            // على هذا الحقل — أي علم آخر (active مثلاً) ما يقرأه أحد.
            const f = frames.find((x) => x.id === v.frameId);
            const nowPublic = f.visibility !== 'public';
            await frameWrite(v.frameId, { visibility: nowPublic ? 'public' : 'hidden' });
            await AdminAudit.log({ section: 4, sectionTitle: 'الإطارات', actionKey: 'frames.toggleVisibility', actionLabel: nowPublic ? 'إظهار إطار بالمعرض' : 'إخفاء إطار من المعرض', targetType: 'frame', targetId: v.frameId, after: { visibility: nowPublic ? 'public' : 'hidden' } });
            AdminToast.success('تم — يختفي من معرض الإطارات فقط، ومن يملكه فعلاً يبقى إطاره شغّالاً ببطاقته');
          }
        });
      }
    },
    {
      title: 'سجل كامل لكل عمليات المنح/السحب مع التاريخ والسبب',
      keywords: 'سجل منح سحب اطارات',
      run: async () => {
        const rows = (await AdminAudit.fetchAllForExport()).filter((r) => (r.actionKey || '').startsWith('frames.'));
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>الإجراء</th><th>الهدف</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.tsClient)}</td><td data-label="الإجراء" class="is-primary">${r.actionLabel}</td><td data-label="الهدف">${r.targetLabel || r.targetId}</td></tr>`).join('')}</tbody></table>` : '<p>ولا عملية مسجَّلة بعد</p>';
        openModal({ title: 'سجل عمليات الإطارات', bodyEl: body, size: 'lg' });
      }
    }
  ]
});
