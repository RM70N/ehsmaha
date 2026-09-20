// ==================== محرك سجل التدقيق (القسم 16) ====================
// أي إجراء يُنفَّذ من أي قسم بأي واحدة من الأدوات الـ450 يُسجَّل هنا تلقائياً
// بدون استثناء — راجع "القاعدة الذهبية" بالطلب الأصلي. كل الأقسام الأخرى
// تستدعي AdminAudit.log(...) مباشرة بعد كل عملية كتابة ناجحة على Firestore.
//
// اخترنا فلترة الوقت (تاريخ/فترة) والنوع والقسم من جهة العميل فوق نافذة
// (limit) محمَّلة بترتيب زمني واحد (tsClient desc) بدل الاعتماد على فهارس
// Firestore مركّبة متعددة — هذا يجنّب المالك خطوة "أنشئ فهرس بكونسول
// Firebase" لكل تركيبة فلاتر ممكنة، ويكفي تماماً لحجم استخدام لوحة إدارة
// واحدة. "تحميل المزيد" (loadOlder) يكمل الصفحات الأقدم عبر startAfter.
import { AdminFB } from './firebase.js';
import { AdminAuth } from './auth.js';

const fb = AdminFB;
const COL = 'adminAuditLog';

function genId() {
  return 'log_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

export const AdminAudit = {
  /**
   * يُستدعى من كل قسم بعد كل إجراء حقيقي على قاعدة البيانات.
   * section: رقم القسم (1-30). actionKey: مفتاح ثابت للأداة (مثلاً 'players.ban').
   * sensitive: true لأي حذف/حظر/تعديل صلاحيات — يظهر بتنبيه (16.7).
   */
  async log({ section, sectionTitle, actionKey, actionLabel, targetType, targetId, targetLabel, before, after, note, sensitive, reversible, reverseFn }) {
    const id = genId();
    const entry = {
      ts: fb.serverTimestamp(),
      tsClient: Date.now(),
      section: section != null ? section : null,
      sectionTitle: sectionTitle || null,
      actionKey: actionKey || null,
      actionLabel: actionLabel || null,
      targetType: targetType || null,
      targetId: targetId || null,
      targetLabel: targetLabel || null,
      before: before === undefined ? null : before,
      after: after === undefined ? null : after,
      note: note || null,
      sensitive: !!sensitive,
      reversible: !!reversible,
      reviewed: false,
      undone: false,
      actorEmail: (AdminAuth.currentAdmin && AdminAuth.currentAdmin.email) || null,
      userAgent: navigator.userAgent || null
    };
    try {
      await fb.setDoc(fb.doc(fb.db, COL, id), entry);
    } catch (err) {
      console.error('AdminAudit.log failed', err);
    }
    return id;
  },

  // بث حي لآخر N إجراء (افتراضي 500) — تُستخدم بشاشة القسم 16 وبأي قسم
  // ثاني يعرض "آخر التعديلات على هذا العنصر" (مثلاً 4.15، 8.11).
  subscribeRecent(limitN, cb) {
    const qy = fb.query(fb.collection(fb.db, COL), fb.orderBy('tsClient', 'desc'), fb.limit(limitN || 500));
    return fb.onSnapshot(qy, (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => { console.error('audit subscribe error', err); cb([]); });
  },

  async loadOlder(beforeTsClient, limitN) {
    const qy = fb.query(
      fb.collection(fb.db, COL),
      fb.orderBy('tsClient', 'desc'),
      fb.startAfter(beforeTsClient),
      fb.limit(limitN || 200)
    );
    const snap = await fb.getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  // آخر إجراءات حسّاسة (حذف/حظر/تعديل صلاحيات) — تُستخدم بلوحة 1.4 و16.7.
  async loadRecentSensitive(limitN) {
    const qy = fb.query(fb.collection(fb.db, COL), fb.orderBy('tsClient', 'desc'), fb.limit(300));
    const snap = await fb.getDocs(qy);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((r) => r.sensitive)
      .slice(0, limitN || 10)
      .map((r) => ({ ts: r.tsClient, label: `${r.actionLabel || r.actionKey || 'إجراء حسّاس'}${r.targetLabel ? ' — ' + r.targetLabel : ''}`, detail: r.note || '' }));
  },

  async markReviewed(id, reviewed) {
    await fb.updateDoc(fb.doc(fb.db, COL, id), { reviewed: !!reviewed });
  },

  async markUndone(id) {
    await fb.updateDoc(fb.doc(fb.db, COL, id), { undone: true });
  },

  async fetchAllForExport(sinceMs) {
    const parts = [fb.orderBy('tsClient', 'desc'), fb.limit(20000)];
    const qy = fb.query(fb.collection(fb.db, COL), ...parts);
    const snap = await fb.getDocs(qy);
    let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (sinceMs) rows = rows.filter((r) => (r.tsClient || 0) >= sinceMs);
    return rows;
  }
};

window.AdminAudit = AdminAudit;
