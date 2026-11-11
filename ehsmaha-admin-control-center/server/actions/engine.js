// محرك الإجراءات: دورة حياة كل زر إداري من البداية للنهاية (الأولوية: لا نجاح بلا تحقق من المصدر الأصلي).
//   صلاحية ← تحقق مدخلات ← قدرة الاتصال ← تأكيد ← مفتاح عدم التكرار ← قراءة القيمة الحالية ← تنفيذ
//   ← إعادة قراءة من المصدر للتحقق ← سجل تدقيق ← نتيجة حقيقية.
import { AppError, E } from '../lib/errors.js';
import { now, uid, stable, sha256, scrub } from '../lib/util.js';
import { log } from '../lib/logger.js';

const FIREBASE_MSGS = {
  'auth/user-not-found': 'المستخدم غير موجود في Firebase Authentication',
  'auth/invalid-uid': 'معرّف حساب غير صالح',
  'auth/email-already-exists': 'البريد مستخدم مسبقاً',
  FIREBASE_UNAVAILABLE: 'Firebase غير متاح حالياً',
  BOT_DB_UNAVAILABLE: 'قاعدة بيانات البوت غير متاحة حالياً',
  DISCORD_UNAVAILABLE: 'اتصال Discord غير مُهيّأ',
  DISCORD_NETWORK: 'تعذّر الاتصال بـDiscord',
  5: 'العنصر غير موجود', 7: 'رفضت قواعد/صلاحيات Firebase العملية', 14: 'Firestore غير متاح حالياً', 4: 'انتهت مهلة Firestore'
};

export function explain(err) {
  if (err instanceof AppError) return { status: err.status, code: err.code, message: err.message };
  const code = err && (err.code ?? err.errorInfo?.code);
  if (err && err.code === 'DISCORD_API') return { status: err.status === 403 ? 403 : err.status === 404 ? 404 : 502, code: 'DISCORD_API', message: err.message };
  if (err && (err.code === 'DISCORD_UNAVAILABLE' || err.code === 'DISCORD_NO_GUILD' || err.code === 'BOT_DB_UNAVAILABLE' || err.code === 'FIREBASE_UNAVAILABLE')) return { status: 503, code: err.code, message: err.message };
  if (err && err.code === 'DISCORD_NETWORK') return { status: 502, code: err.code, message: err.message };
  if (FIREBASE_MSGS[code]) return { status: 502, code: String(code), message: FIREBASE_MSGS[code] };
  return { status: 500, code: 'INTERNAL', message: 'تعذّر تنفيذ العملية بسبب خطأ غير متوقع' };
}

export function createEngine({ registry, perms, store, audit, caps, buildCtx, alerts }) {
  const idem = store.col('idem');
  const inflight = new Set();

  function record(entry) {
    try { return audit.append(entry); } catch (e) { log.error('audit append failed', { error: e }); return null; }
  }

  async function run({ actionId, params, auth, meta = {}, idempotencyKey, confirm, reason }) {
    const act = registry.action(actionId);
    if (!act) throw E.notFound('الإجراء غير موجود');
    const base = {
      actor: auth.accountId, actorName: auth.display, role: auth.role, section: act.section, action: act.id, label: act.label,
      requestId: meta.requestId, ip: meta.ip, device: meta.device, danger: act.danger
    };

    // 1+2) الصلاحية — تُفرض هنا بغضّ النظر عن الواجهة
    if (!perms.canRunAction(auth, act.id)) {
      record({ ...base, status: 'denied', error: 'FORBIDDEN', target: null });
      // طلبات مشبوهة: تكرار الرفض من نفس الحساب (طلبات يدوية تتجاوز الواجهة) يرفع تنبيهاً واحداً بلا تكرار
      try { if (audit.count({ actor: auth.accountId, status: 'denied', ts: { gte: now() - 10 * 60_000 } }) >= 5) alerts?.raise({ key: `security:denied:${auth.accountId}`, severity: 'warning', source: 'security', title: `محاولات متكررة مرفوضة من ${auth.display}`, message: 'طلبات إجراءات بلا صلاحية خلال 10 دقائق' }); } catch { /* */ }
      throw E.forbidden();
    }
    // 3) المدخلات
    const parsed = act.schema.safeParse(params ?? {});
    if (!parsed.success) {
      const fields = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.') || '_', i.message]));
      throw E.invalid(parsed.error.issues[0]?.message || 'مدخلات غير صحيحة', fields);
    }
    const p = parsed.data;
    const cleanReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
    if (act.reasonRequired && cleanReason.length < 3) throw E.invalid('سبب العملية مطلوب (3 أحرف على الأقل)', { reason: 'السبب مطلوب' });
    // 4) القدرة (اتصال/إعداد) — لا نعرض نجاحاً لعملية لا يمكن تنفيذها
    for (const r of act.requires) {
      const c = caps[r] ? caps[r]() : { ok: false, reason: 'قدرة غير معروفة' };
      if (!c.ok) throw E.unavailable(c.reason || 'الخدمة المطلوبة غير متاحة', { capability: r });
    }
    const isRead = act.kind === 'read';
    // 5) تأكيد صريح — مفروض في الخادم
    if (!isRead && act.danger !== 'low' && confirm !== true) throw E.invalid('هذه العملية تتطلب تأكيداً صريحاً', { confirm: 'مطلوب' });
    // 6) عدم التكرار
    let idemId = null;
    if (!isRead) {
      if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 100) throw E.invalid('مفتاح عدم التكرار مفقود', { idempotencyKey: 'مطلوب' });
      idemId = sha256(`${auth.accountId}|${act.id}|${idempotencyKey}`);
      const hash = sha256(stable(p) + '|' + cleanReason);
      const created = idem.create(idemId, { status: 'running', hash, ts: now(), action: act.id });
      if (!created) {
        const ex = idem.get(idemId);
        if (ex.hash !== hash) throw E.invalid('نفس مفتاح العملية استُخدم مع مدخلات مختلفة');
        if (ex.status === 'done') return { ...ex.response, replayed: true };
        throw E.conflict('العملية نفسها قيد التنفيذ الآن');
      }
    }

    const ctx = { ...buildCtx(auth), requestId: meta.requestId, reason: cleanReason, idempotencyKey, actionId: act.id, params: p };
    const t0 = Date.now();
    let before = null, result = null, verified = null;
    try {
      before = act.load ? await act.load(p, ctx) : null;
      result = (await act.execute(p, ctx, before)) || {};
      verified = act.verify ? await act.verify(p, ctx, before, result) : { ok: true };
    } catch (e) {
      const ex = explain(e);
      const a = record({ ...base, status: 'failed', target: safeTarget(act, p), before: scrub(before), params: scrub(p), error: ex.code, errorMessage: ex.message, reason: cleanReason || undefined, ms: Date.now() - t0 });
      if (idemId) idem.del(idemId); // الفشل لا يحجز المفتاح: تُسمح إعادة المحاولة (والعمليات الحساسة ذرّية/مفتاحية داخلياً)
      if (ex.status === 500) log.error('action failed', { action: act.id, error: e }); else log.warn('action rejected', { action: act.id, code: ex.code });
      throw new AppError(ex.status, ex.code, ex.message, { auditId: a && a.id });
    }

    if (!verified || verified.ok !== true) {
      const msg = (verified && verified.message) || 'تمت العملية لكن التحقق من المصدر الأصلي فشل — لم تُعتبر ناجحة';
      const a = record({ ...base, status: 'failed', target: safeTarget(act, p), before: scrub(before), after: scrub(verified && verified.after), params: scrub(p), error: 'VERIFY_FAILED', errorMessage: msg, reason: cleanReason || undefined, ms: Date.now() - t0 });
      if (idemId) idem.del(idemId);
      throw E.verifyFailed(msg, { auditId: a && a.id });
    }

    const pending = result.pending || verified.pending || null; // محفوظة لكن لم يطبّقها النظام الحي بعد
    const status = pending ? 'saved_pending_apply' : 'success';
    const undo = result.undo || verified.undo || null;
    const a = record({
      ...base, status, target: safeTarget(act, p), before: scrub(before), after: scrub(verified.after ?? result.after), params: scrub(p),
      reason: cleanReason || undefined, detail: verified.detail || result.detail, pending: pending || undefined, undo: undo || undefined, ms: Date.now() - t0,
      idempotencyKey: idempotencyKey ? sha256(idempotencyKey).slice(0, 16) : undefined
    });
    const response = {
      ok: true, status, action: act.id, label: act.label,
      message: pending ? `${result.message || verified.message || 'تم الحفظ'} — ⚠️ ${pending}` : result.message || verified.message || 'تم التنفيذ وتم التحقق من النتيجة في المصدر الأصلي',
      before: scrub(before), after: scrub(verified.after ?? result.after), detail: verified.detail || result.detail, data: result.data, download: result.download,
      pending: pending || undefined, undoAvailable: !!undo, auditId: a && a.id, ms: Date.now() - t0
    };
    if (idemId) idem.set(idemId, { status: 'done', hash: idem.get(idemId).hash, ts: now(), action: act.id, response: JSON.parse(JSON.stringify(response)) });
    return response;
  }

  async function undo({ auditId, auth, meta }) {
    const a = audit.get(auditId);
    if (!a || !a.undo) throw E.notFound('لا يمكن التراجع عن هذه العملية');
    if (!['success', 'saved_pending_apply'].includes(a.status)) throw E.conflict('العملية الأصلية لم تنجح');
    return run({ actionId: a.undo.action, params: a.undo.params, auth, meta, idempotencyKey: `undo-${auditId}`, confirm: true, reason: `تراجع عن العملية ${auditId}` });
  }

  return { run, undo };
}

function safeTarget(act, p) {
  try { return act.target ? String(act.target(p)).slice(0, 200) : null; } catch { return null; }
}
