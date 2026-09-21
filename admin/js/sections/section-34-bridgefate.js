// ==================== القسم 34 — فعالية جسر المصير (bridge-fate) ====================
// تصحيح مهم: "جسر المصير" لا يخزَّن بيانات فعاليته الحية بـFirestore — يستخدم
// Realtime Database (تفادياً لحصة قراءات/كتابات Firestore). المسارات
// الحقيقية (من index.html نفسه): bridgeEvents/current (مؤشر: eventId+status)،
// bridgeEvents/{eventId} (تفاصيل الفعالية: status/title/startedAt/winnerName)،
// bridgePlayers/{eventId}/{key} (كل متصفح مشارك)، bridgeBoard/{eventId}.
// كل أدوات هذا القسم تقرأ/تكتب RTDB مباشرة عبر AdminFB.rtdb*.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum } from '../core/format.js';

const fb = AdminFB;

function rtdbToDate(ms) { return ms ? fmtDate({ toMillis: () => ms }) : '—'; }

async function getPointer() {
  const snap = await fb.rtdbGet(fb.rtdbRef(fb.rtdb, 'bridgeEvents/current'));
  return snap.exists() ? snap.val() : null;
}
async function getEvent(eventId) {
  const snap = await fb.rtdbGet(fb.rtdbRef(fb.rtdb, 'bridgeEvents/' + eventId));
  return snap.exists() ? snap.val() : null;
}
async function getPlayers(eventId) {
  const snap = await fb.rtdbGet(fb.rtdbRef(fb.rtdb, 'bridgePlayers/' + eventId));
  return snap.exists() ? snap.val() : {};
}

defineSection({
  id: 34,
  title: 'فعالية جسر المصير',
  description: 'الفعالية مبنية على Realtime Database (مو Firestore) — كل الأدوات هنا تقرأ/تكتب مباشرة على bridgeEvents/bridgePlayers/bridgeBoard الحقيقية.',
  tools: [
    {
      title: 'حالة الفعالية الحالية لحظياً',
      keywords: 'حالة فعالية جسر مصير لحظي',
      run: () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        let unsub = () => {};
        openModal({ title: 'حالة جسر المصير الآن', bodyEl: body, size: 'md', onClose: () => unsub() });
        unsub = fb.rtdbOnValue(fb.rtdbRef(fb.rtdb, 'bridgeEvents/current'), async (snap) => {
          const ptr = snap.val();
          if (!ptr || !ptr.eventId) { body.innerHTML = '<p>ولا فعالية مفتوحة حالياً</p>'; return; }
          const ev = await getEvent(ptr.eventId);
          const players = await getPlayers(ptr.eventId);
          const playerCount = Object.keys(players || {}).length;
          body.innerHTML = `
            <dl class="admin-kv">
              <dt>معرّف الفعالية</dt><dd>${ptr.eventId}</dd>
              <dt>الحالة</dt><dd><span class="admin-badge admin-badge--on">${(ev && ev.status) || ptr.status || '—'}</span></dd>
              <dt>العنوان</dt><dd>${(ev && ev.title) || '—'}</dd>
              <dt>عدد المشاركين (متصفحات فعّالة)</dt><dd>${fmtNum(playerCount)}</dd>
              <dt>وقت البدء</dt><dd>${ev && ev.startedAt ? rtdbToDate(ev.startedAt) : '—'}</dd>
              <dt>الفائز (لو انتهت)</dt><dd>${(ev && ev.winnerName) || '—'}</dd>
            </dl>`;
        }, () => { body.textContent = 'تعذّر الاتصال بـRealtime Database'; });
      }
    },
    {
      title: 'عرض كل المشاركين (الستريمرز) بالفعالية الحالية',
      keywords: 'عرض مشاركين ستريمرز فعالية حالية',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'مشاركو الفعالية الحالية', bodyEl: body, size: 'lg' });
        const ptr = await getPointer();
        if (!ptr || !ptr.eventId) { body.innerHTML = '<p>ولا فعالية مفتوحة حالياً</p>'; return; }
        const players = await getPlayers(ptr.eventId);
        const rows = Object.entries(players || {});
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>المعرّف</th><th>الحالة</th><th>عدد اللاعبين لديه</th><th>آخر نبض اتصال</th></tr></thead><tbody>${rows.map(([k, v]) => `<tr><td class="is-primary" data-label="المعرّف">${k}</td><td data-label="الحالة">${v.status || '—'}</td><td data-label="اللاعبون">${v.playerCount != null ? v.playerCount : '—'}</td><td data-label="آخر نبض">${v.clockPing ? rtdbToDate(v.clockPing) : '—'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا مشارك حالياً</p>';
      }
    },
    {
      title: 'إنهاء الفعالية الحالية فوراً (طوارئ)',
      keywords: 'انهاء فعالية جسر مصير طوارئ',
      run: async () => {
        const ptr = await getPointer();
        if (!ptr || !ptr.eventId) { AdminToast.info('ولا فعالية مفتوحة حالياً'); return; }
        openConfirm({
          title: 'إنهاء فعالية جسر المصير',
          danger: true,
          message: `سينهي الفعالية الحالية (${ptr.eventId}) فوراً لكل الستريمرز المشاركين.`,
          onConfirm: async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            await fb.rtdbUpdate(fb.rtdbRef(fb.rtdb, 'bridgeEvents/' + ptr.eventId), { status: 'ended', endedAt: fb.rtdbServerTimestamp(), endedBy: 'admin-panel' });
            await fb.rtdbSet(fb.rtdbRef(fb.rtdb, 'bridgeEvents/current'), { eventId: null, status: 'ended' }, { merge: true }).catch(() => fb.rtdbUpdate(fb.rtdbRef(fb.rtdb, 'bridgeEvents/current'), { eventId: null, status: 'ended' }));
            await AdminAudit.log({ section: 34, sectionTitle: 'فعالية جسر المصير', actionKey: 'bridge.forceEnd', actionLabel: 'إنهاء فعالية جسر المصير قسرياً', targetType: 'bridgeEvent', targetId: ptr.eventId, sensitive: true });
            AdminToast.success('تم إنهاء الفعالية');
          }
        });
      }
    },
    {
      title: 'طرد مشارك (ستريمر) معيّن من الفعالية',
      keywords: 'طرد مشارك ستريمر فعالية',
      run: async () => {
        const ptr = await getPointer();
        if (!ptr || !ptr.eventId) { AdminToast.info('ولا فعالية مفتوحة حالياً'); return; }
        const players = await getPlayers(ptr.eventId);
        const rows = Object.keys(players || {});
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>المعرّف</th><th></th></tr></thead><tbody>${rows.map((k) => `<tr><td class="is-primary" data-label="المعرّف">${k}</td><td><button class="admin-btn admin-btn--danger admin-btn--sm" data-kick="${k}">طرد</button></td></tr>`).join('')}</tbody></table>` : '<p>ولا مشارك حالياً</p>';
        openModal({ title: 'طرد مشارك من الفعالية', bodyEl: body, size: 'lg' });
        body.querySelectorAll('[data-kick]').forEach((btn) => btn.addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const key = btn.getAttribute('data-kick');
          await fb.rtdbRemove(fb.rtdbRef(fb.rtdb, 'bridgePlayers/' + ptr.eventId + '/' + key));
          await AdminAudit.log({ section: 34, sectionTitle: 'فعالية جسر المصير', actionKey: 'bridge.kick', actionLabel: 'طرد مشارك من جسر المصير', targetType: 'bridgePlayer', targetId: key, sensitive: true });
          AdminToast.success('تم الطرد');
          btn.closest('tr').remove();
        }));
      }
    },
    {
      title: 'عرض لوحة الترتيب (أعلى 20) للفعالية الحالية',
      keywords: 'لوحة ترتيب فعالية حالية',
      run: async () => {
        const ptr = await getPointer();
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'لوحة الترتيب — جسر المصير', bodyEl: body, size: 'lg' });
        if (!ptr || !ptr.eventId) { body.innerHTML = '<p>ولا فعالية مفتوحة حالياً</p>'; return; }
        const snap = await fb.rtdbGet(fb.rtdbRef(fb.rtdb, 'bridgeBoard/' + ptr.eventId));
        const board = snap.exists() ? snap.val() : null;
        if (!board) { body.innerHTML = '<p>ما فيه لوحة ترتيب مسجَّلة بعد لهذي الفعالية</p>'; return; }
        const list = Array.isArray(board) ? board : Object.values(board);
        body.innerHTML = list.length ? `<table class="admin-table"><thead><tr><th>#</th><th>الاسم</th><th>النتيجة</th></tr></thead><tbody>${list.slice(0, 20).map((r, i) => `<tr><td data-label="#">${i + 1}</td><td class="is-primary" data-label="الاسم">${r.name || r.username || '—'}</td><td data-label="النتيجة">${r.score != null ? r.score : '—'}</td></tr>`).join('')}</tbody></table>` : '<p>لوحة الترتيب فارغة حالياً</p>';
      }
    },
    {
      title: 'بدء فعالية جديدة يدوياً من اللوحة (طوارئ)',
      keywords: 'بدء فعالية جديدة يدوي طوارئ',
      badge: 'يحتاج تأكد من عدم تعارض',
      run: async () => {
        const ptr = await getPointer();
        if (ptr && ptr.eventId) { AdminToast.warn('فيه فعالية مفتوحة حالياً بالفعل — أنهها أول من أداة "إنهاء الفعالية"'); return; }
        openConfirm({
          title: 'بدء فعالية جسر المصير من اللوحة',
          message: 'هذا يفتح فعالية جديدة فارغة يشترك فيها كل الستريمرز — عادةً تُفتح من الموقع الرئيسي مباشرة، استخدم هذا فقط لو الفتح الطبيعي تعطّل.',
          onConfirm: async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            const eventId = 'bridge_' + Date.now();
            await fb.rtdbSet(fb.rtdbRef(fb.rtdb, 'bridgeEvents/' + eventId), { type: 'bridgeFate', status: 'lobby', title: 'جسر المصير', createdAt: fb.rtdbServerTimestamp(), createdBy: 'admin-panel' });
            await fb.rtdbSet(fb.rtdbRef(fb.rtdb, 'bridgeEvents/current'), { eventId, status: 'lobby' });
            await AdminAudit.log({ section: 34, sectionTitle: 'فعالية جسر المصير', actionKey: 'bridge.forceStart', actionLabel: 'بدء فعالية جسر المصير يدوياً', targetType: 'bridgeEvent', targetId: eventId, sensitive: true });
            AdminToast.success('تم فتح فعالية جديدة');
          }
        });
      }
    },
    {
      title: 'تفعيل/تعطيل قدرة الستريمرز على فتح جسر المصير',
      keywords: 'تفعيل تعطيل جسر مصير كل الموقع',
      run: async () => {
        const snap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'gameToggles'));
        const data = snap.exists() ? snap.data() : {};
        const enabled = data['bridge-fate'] !== false;
        const body = document.createElement('div');
        body.innerHTML = `<p>الحالة الحالية: <span class="admin-badge ${enabled ? 'admin-badge--on' : 'admin-badge--off'}">${enabled ? 'مفعّلة' : 'معطّلة'}</span></p><button class="admin-btn ${enabled ? 'admin-btn--danger' : 'admin-btn--primary'}" id="bf-toggle">${enabled ? 'تعطيل الآن' : 'تفعيل الآن'}</button>`;
        const modal = openModal({ title: 'تفعيل/تعطيل جسر المصير', bodyEl: body, size: 'sm' });
        body.querySelector('#bf-toggle').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'gameToggles'), { 'bridge-fate': !enabled }, { merge: true });
          await AdminAudit.log({ section: 34, sectionTitle: 'فعالية جسر المصير', actionKey: 'bridge.toggle', actionLabel: `${enabled ? 'تعطيل' : 'تفعيل'} جسر المصير`, sensitive: true });
          AdminToast.success('تم الحفظ');
          modal.close();
        });
      }
    },
    {
      title: 'سجل كل الفعاليات السابقة (بحث بمعرّف معروف)',
      keywords: 'سجل فعاليات سابقة',
      badge: 'يحتاج معرّف الفعالية',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">معرّف الفعالية (bridge_...)</span><input class="admin-input" id="bf-id" /></div><div id="bf-result" style="margin-top:10px;"></div><p class="admin-field__hint">Realtime Database لا يدعم سرد كل الفعاليات السابقة تلقائياً من عميل ويب بدون فهرسة مسبقة — ابحث بمعرّف فعالية معروف (من سجل الأحداث قسم 16 مثلاً).</p>';
        openModal({ title: 'البحث عن فعالية سابقة', bodyEl: body, size: 'md' });
        body.querySelector('#bf-id').addEventListener('change', async (e) => {
          const id = e.target.value.trim();
          if (!id) return;
          const ev = await getEvent(id);
          body.querySelector('#bf-result').innerHTML = ev ? `<dl class="admin-kv"><dt>الحالة</dt><dd>${ev.status}</dd><dt>الفائز</dt><dd>${ev.winnerName || '—'}</dd></dl>` : '<p>ما لقيت فعالية بهذا المعرّف</p>';
        });
      }
    },
    {
      title: 'سجل كل إجراءات الطوارئ المتخذة من اللوحة على هذي الفعالية',
      keywords: 'سجل اجراءات طوارئ جسر مصير',
      run: async () => {
        const rows = (await AdminAudit.fetchAllForExport()).filter((r) => (r.actionKey || '').startsWith('bridge.'));
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>الإجراء</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.tsClient)}</td><td class="is-primary" data-label="الإجراء">${r.actionLabel}</td></tr>`).join('')}</tbody></table>` : '<p>ولا إجراء مسجَّل بعد</p>';
        openModal({ title: 'سجل إجراءات جسر المصير', bodyEl: body, size: 'lg' });
      }
    }
  ]
});
