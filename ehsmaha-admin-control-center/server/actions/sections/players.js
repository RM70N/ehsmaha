import { E } from '../../lib/errors.js';
import { normUsername, now } from '../../lib/util.js';
import { findPlayer, readLevel, levelRef, TS, isQuota, playerSummary, tsMs, pageSize } from '../siteHelpers.js';

async function searchFs(q, ctx) {
  const db = ctx.fb.db();
  const term = normUsername(q.q);
  let docs = [];
  if (term) {
    const exact = await findPlayer(ctx.fb, term).catch(() => null);
    const pre = await db.collection('users').where('usernameLower', '>=', term).where('usernameLower', '<', term + '').limit(pageSize(q)).get();
    const seen = new Map();
    if (exact) seen.set(exact.uid, exact.user);
    for (const d of pre.docs) seen.set(d.id, d.data());
    docs = [...seen.entries()];
  } else {
    let qq = db.collection('users').orderBy('usernameLower').limit(pageSize(q));
    if (q.cursor) qq = qq.startAfter(String(q.cursor));
    docs = (await qq.get()).docs.map((d) => [d.id, d.data()]);
  }
  const rows = await Promise.all(docs.map(async ([uid, u]) => {
    const lv = await readLevel(ctx.fb, (u.username || u.usernameLower || '').toLowerCase()).catch(() => null);
    return { id: uid, username: u.username || u.usernameLower, uid, level: lv?.level ?? null, xp: lv?.xp ?? 0, roundsPlayed: lv?.roundsPlayed ?? 0, linkedTiktok: u.linkedTiktokUsername || '—', createdAt: tsMs(u.createdAt), state: '—' };
  }));
  const last = docs.length ? docs[docs.length - 1][1].usernameLower : null;
  return { rows, nextCursor: !term && docs.length >= pageSize(q) ? last : null };
}

// بديل عند نفاد حصة Firestore: Firebase Auth (حصة منفصلة) — بريد/اسم عرض/UID + حالة الحساب (معطّل أم لا)
async function searchAuth(q, ctx) {
  const term = normUsername(q.q); const auth = ctx.fb.auth(); let users = [];
  if (term) { let token; do { const r = await auth.listUsers(1000, token); users.push(...r.users.filter((u) => `${u.displayName || ''} ${u.email || ''} ${u.uid}`.toLowerCase().includes(term))); token = r.pageToken; } while (token && users.length < 25); }
  else users = (await auth.listUsers(pageSize(q), q.cursor || undefined)).users;
  return { rows: users.slice(0, pageSize(q)).map((u) => ({ id: u.uid, username: u.displayName || (u.email || '').split('@')[0] || u.uid, uid: u.uid, level: '—', xp: '—', roundsPlayed: '—', linkedTiktok: u.email ? `${u.email.slice(0, 2)}***@${u.email.split('@')[1]}` : '—', createdAt: Date.parse(u.metadata.creationTime) || null, state: u.disabled ? '⛔ معطّل (محظور)' : '✅ نشط' })), nextCursor: null, meta: { note: 'Firestore غير متاح (حصة مستنفدة) — النتائج من Firebase Auth. يمكن الحظر/رفع الحظر/سحب الجلسات بالبريد أو UID.' } };
}

const USER = { name: 'username', label: 'يوزرنيم اللاعب أو معرّف الحساب', type: 'text', required: true, max: 120, placeholder: 'مثال: ahmed_1' };

async function authUser(ctx, uid) {
  try { return await ctx.fb.auth().getUser(uid); }
  catch (e) { if (e.code === 'auth/user-not-found') throw E.notFound('اللاعب لديه مستند في الموقع لكن بلا حساب Firebase Authentication — لا يمكن إدارة حظره'); throw e; }
}
const punishments = (ctx) => ctx.store.col('punishments');
const stateOf = (u) => ({ disabled: !!u.disabled, tokensValidAfter: u.tokensValidAfterTime || null });

async function loadPlayerAuth(p, ctx) {
  const pl = await findPlayer(ctx.fb, p.username);
  const au = await authUser(ctx, pl.uid);
  return { ...stateOf(au), name: pl.username, uid: pl.uid }; // لا نُعيد مستند اللاعب (بريد/بيانات شخصية) للواجهة أو التدقيق
}

async function banExecute(p, ctx, before, { until }) {
  await ctx.fb.auth().updateUser(before.uid, { disabled: true });
  await ctx.fb.auth().revokeRefreshTokens(before.uid); // يُسقط الجلسات الحالية فوراً (ضمن صلاحية رمز ID الحالي ≤ ساعة)
  const id = `${before.uid}-${now()}`;
  punishments(ctx).set(id, { uid: before.uid, username: before.name, type: until ? 'ban_temp' : 'ban', reason: ctx.reason, by: ctx.actor.id, at: now(), expiresAt: until || null, status: 'active' });
  if (until) ctx.store.col('tempActions').set(id, { type: 'ban', uid: before.uid, username: before.name, expiresAt: until, status: 'active' });
  return { message: until ? `تم حظر ${before.name} مؤقتاً حتى ${new Date(until).toLocaleString('ar-SA')}` : `تم حظر ${before.name} نهائياً`, undo: { action: 'players.unban', params: { username: before.name } } };
}
async function banVerify(p, ctx, before) {
  const u = await ctx.fb.auth().getUser(before.uid);
  return { ok: u.disabled === true, after: { disabled: u.disabled }, message: 'حساب Firebase لم يتعطّل فعلياً' };
}

export default {
  id: 'players', workspace: 'website', label: 'إدارة اللاعبين', icon: 'users', adminDefault: true, description: 'بحث، عقوبات، نقاط وخبرة، جلسات اللاعبين',
  views: [
    {
      id: 'search', label: 'بحث عن لاعب', requires: ['firebase'], search: true, placeholder: 'يوزرنيم كامل أو بدايته أو معرّف الحساب',
      columns: [{ key: 'username', label: 'اللاعب' }, { key: 'uid', label: 'المعرّف', mono: true }, { key: 'level', label: 'اللفل' }, { key: 'xp', label: 'الخبرة' }, { key: 'roundsPlayed', label: 'الجولات' }, { key: 'linkedTiktok', label: 'تيك توك' }, { key: 'createdAt', label: 'التسجيل', type: 'date' }, { key: 'state', label: 'حالة الحساب' }],
      async fetch(q, ctx) {
        try { return await searchFs(q, ctx); } catch (e) { if (!isQuota(e)) throw e; return searchAuth(q, ctx); }
      }
    },
    {
      id: 'punishments', label: 'سجل العقوبات', requires: ['store'], search: true,
      columns: [{ key: 'username', label: 'اللاعب' }, { key: 'type', label: 'النوع' }, { key: 'status', label: 'الحالة' }, { key: 'reason', label: 'السبب' }, { key: 'by', label: 'بواسطة' }, { key: 'at', label: 'التاريخ', type: 'date' }, { key: 'expiresAt', label: 'ينتهي', type: 'date' }],
      async fetch(q, ctx) { const p = ctx.store.col('punishments'); return { rows: p.list({ search: q.q, limit: pageSize(q), offset: (Number(q.page) || 0) * pageSize(q), orderBy: 'at' }), total: p.count(undefined, q.q) }; }
    },
    {
      id: 'notes', label: 'ملاحظات المسؤولين', requires: ['store'], search: true,
      columns: [{ key: 'username', label: 'اللاعب' }, { key: 'note', label: 'الملاحظة' }, { key: 'by', label: 'بواسطة' }, { key: 'at', label: 'التاريخ', type: 'date' }],
      async fetch(q, ctx) { const n = ctx.store.col('playerNotes'); return { rows: n.list({ search: q.q, limit: pageSize(q), offset: (Number(q.page) || 0) * pageSize(q), orderBy: 'at' }), total: n.count(undefined, q.q) }; }
    }
  ],
  actions: [
    {
      id: 'ban_permanent', label: 'حظر لاعب نهائياً', icon: 'ban', group: 'العقوبات', danger: 'high', reversible: true, reasonRequired: true, requires: ['firebase'],
      description: 'تعطيل حساب Firebase للاعب وإنهاء جلساته — لا يستطيع تسجيل الدخول للموقع نهائياً', effect: 'يُعطَّل حساب اللاعب وتُسحب جلساته ولا يدخل الموقع حتى رفع الحظر',
      fields: [USER], target: (p) => p.username, load: loadPlayerAuth,
      execute: (p, ctx, b) => banExecute(p, ctx, b, {}), verify: banVerify
    },
    {
      id: 'ban_temporary', label: 'حظر مؤقت مع مدة', icon: 'clock', group: 'العقوبات', danger: 'high', reversible: true, reasonRequired: true, requires: ['firebase'],
      description: 'يُعطَّل الحساب ثم يُرفع الحظر تلقائياً عند انتهاء المدة (مهمة خلفية تتحقق من إعادة التفعيل)', effect: 'يُمنع اللاعب من الموقع طوال المدة ثم يُفعَّل حسابه تلقائياً',
      fields: [USER, { name: 'hours', label: 'المدة بالساعات', type: 'integer', required: true, min: 1, max: 8760, default: 24 }], target: (p) => `${p.username} (${p.hours}س)`, load: loadPlayerAuth,
      execute: (p, ctx, b) => banExecute(p, ctx, b, { until: now() + p.hours * 3600_000 }), verify: banVerify
    },
    {
      id: 'unban', label: 'رفع الحظر عن لاعب', icon: 'unlock', group: 'العقوبات', danger: 'medium', reversible: true, requires: ['firebase'],
      description: 'إعادة تفعيل حساب Firebase المعطّل (يشمل إعادة تفعيل حساب معطّل لأي سبب)', effect: 'يستعيد اللاعب القدرة على الدخول فوراً',
      fields: [USER], target: (p) => p.username, load: loadPlayerAuth,
      async execute(p, ctx, b) {
        await ctx.fb.auth().updateUser(b.uid, { disabled: false });
        for (const j of punishments(ctx).list({ where: { uid: b.uid, status: 'active' }, limit: 50 })) punishments(ctx).merge(j.id, { status: 'lifted', liftedBy: ctx.actor.id, liftedAt: now() });
        for (const j of ctx.store.col('tempActions').list({ where: { uid: b.uid, status: 'active' }, limit: 50 })) ctx.store.col('tempActions').merge(j.id, { status: 'cancelled', endedAt: now() });
        return { message: `تم رفع الحظر عن ${b.name}`, undo: b.disabled ? { action: 'players.ban_permanent', params: { username: b.name } } : undefined };
      },
      async verify(p, ctx, b) { const u = await ctx.fb.auth().getUser(b.uid); return { ok: u.disabled !== true, after: { disabled: !!u.disabled }, message: 'الحساب ما زال معطّلاً في Firebase' }; }
    },
    {
      id: 'force_logout', label: 'فرض تسجيل خروج من كل الجلسات', icon: 'logout', group: 'الجلسات', danger: 'medium', requires: ['firebase'],
      description: 'سحب كل رموز التحديث (Refresh Tokens) للاعب — يُطلب منه الدخول من جديد على كل أجهزته', effect: 'تنتهي جلسات اللاعب على كل الأجهزة (رمز ID الحالي يبقى صالحاً حتى ساعة كحد أقصى بحسب Firebase)',
      fields: [USER], target: (p) => p.username, load: loadPlayerAuth,
      async execute(p, ctx, b) { await ctx.fb.auth().revokeRefreshTokens(b.uid); return { message: `تم سحب جلسات ${b.name}` }; },
      async verify(p, ctx, b) { const u = await ctx.fb.auth().getUser(b.uid); const after = u.tokensValidAfterTime; const ok = !!after && (!b.tokensValidAfter || new Date(after) >= new Date(b.tokensValidAfter)); return { ok, after: { tokensValidAfter: after }, message: 'لم يتحدّث وقت صلاحية الرموز في Firebase' }; }
    },
    {
      id: 'adjust_xp', label: 'إضافة/خصم خبرة (XP)', icon: 'plus-minus', group: 'النقاط والخبرة', danger: 'high', reversible: true, reasonRequired: true, requires: ['firebase'],
      description: 'تعديل خبرة اللاعب في سجل levels بمعاملة ذرّية (لا تنزل عن 0) وإعادة حساب اللفل بنفس منحنى الموقع', effect: 'تتغير خبرة ولفل اللاعب في الموقع فوراً (قيمة موجبة = إضافة، سالبة = خصم)',
      fields: [USER, { name: 'delta', label: 'التغيير (+ أو −)', type: 'integer', required: true, min: -10_000_000, max: 10_000_000, help: 'مثال: 500 أو -200' }],
      target: (p) => `${p.username} (${p.delta > 0 ? '+' : ''}${p.delta})`,
      async load(p, ctx) {
        if (!p.delta) throw E.invalid('قيمة التغيير لا يمكن أن تكون صفراً');
        const pl = await findPlayer(ctx.fb, p.username);
        const key = pl.levelKeys[0];
        if (!key) throw E.notFound('لا يوجد مفتاح خبرة لهذا اللاعب');
        const lv = await readLevel(ctx.fb, key);
        return { uid: pl.uid, name: pl.username, key, xp: Number(lv?.xp) || 0, level: lv?.level ?? 1 };
      },
      async execute(p, ctx, b) {
        const out = await levelRef(ctx.fb, b.key).adjustXp(p.delta);
        ctx.store.col('xpLedger').set(`${b.key}-${now()}`, { key: b.key, uid: b.uid, delta: out.next - out.cur, from: out.cur, to: out.next, reason: ctx.reason, by: ctx.actor.id, at: now(), via: out.via });
        return { message: `تم تعديل خبرة ${b.name}: ${out.cur} ← ${out.next}${out.via === 'rtdb' ? ' (عبر RTDB لأن حصة Firestore مستنفدة)' : ''}`, after: { xp: out.next, via: out.via }, undo: out.next !== out.cur ? { action: 'players.adjust_xp', params: { username: b.name, delta: out.cur - out.next } } : undefined, _next: out.next };
      },
      async verify(p, ctx, b, r) { const lv = await readLevel(ctx.fb, b.key); const ok = Number(lv?.xp) === r._next; return { ok, after: { xp: lv?.xp, level: lv?.level }, message: 'قيمة الخبرة المقروءة بعد الكتابة لا تطابق المتوقعة' }; }
    },
    {
      id: 'reset_xp', label: 'تصفير خبرة لاعب', icon: 'rotate', group: 'النقاط والخبرة', danger: 'critical', reversible: true, reasonRequired: true, requires: ['firebase'],
      description: 'إعادة الخبرة إلى 0 واللفل إلى 1 (يمكن التراجع باستعادة القيمة السابقة)', effect: 'تُمحى خبرة اللاعب الحالية بالكامل (تُحفظ قيمتها السابقة للتراجع)',
      fields: [USER], target: (p) => p.username,
      async load(p, ctx) { const pl = await findPlayer(ctx.fb, p.username); const key = pl.levelKeys[0]; if (!key) throw E.notFound('لا يوجد سجل خبرة'); const lv = await readLevel(ctx.fb, key); if (!lv) throw E.notFound('لا يوجد سجل خبرة لهذا اللاعب'); return { uid: pl.uid, name: pl.username, key, xp: Number(lv.xp) || 0, level: lv.level ?? 1 }; },
      async execute(p, ctx, b) { await levelRef(ctx.fb, b.key).set({ xp: 0, level: 1, updatedAt: TS }); ctx.store.col('xpLedger').set(`${b.key}-${now()}`, { key: b.key, uid: b.uid, delta: -b.xp, from: b.xp, to: 0, reason: ctx.reason, by: ctx.actor.id, at: now() }); return { message: `تم تصفير خبرة ${b.name} (كانت ${b.xp})`, undo: b.xp > 0 ? { action: 'players.adjust_xp', params: { username: b.name, delta: b.xp } } : undefined }; },
      async verify(p, ctx, b) { const lv = await readLevel(ctx.fb, b.key); return { ok: Number(lv?.xp) === 0, after: { xp: lv?.xp, level: lv?.level } }; }
    },
    {
      id: 'unlink_tiktok', label: 'فك ربط حساب تيك توك', icon: 'unlink', group: 'الحساب', danger: 'medium', requires: ['firebase'],
      description: 'حذف حقل linkedTiktokUsername من مستند اللاعب (كما يفعل الموقع عند فك الربط)', effect: 'يُفصل حساب تيك توك عن اللاعب ويعود احتساب خبرته بمفتاح الموقع فقط',
      fields: [USER], target: (p) => p.username,
      async load(p, ctx) { const pl = await findPlayer(ctx.fb, p.username); if (!pl.user.linkedTiktokUsername) throw E.conflict('لا يوجد حساب تيك توك مربوط لهذا اللاعب'); return { uid: pl.uid, name: pl.username, linked: pl.user.linkedTiktokUsername }; },
      async execute(p, ctx, b) { await ctx.fb.db().collection('users').doc(b.uid).update({ linkedTiktokUsername: ctx.fb.FieldValue.delete() }); return { message: `تم فك ربط تيك توك (${b.linked}) عن ${b.name}` }; },
      async verify(p, ctx, b) { const s = await ctx.fb.db().collection('users').doc(b.uid).get(); return { ok: !s.data()?.linkedTiktokUsername, after: { linkedTiktokUsername: s.data()?.linkedTiktokUsername || null } }; }
    },
    {
      id: 'send_message', label: 'إرسال رسالة شخصية للاعب', icon: 'mail', group: 'التواصل', danger: 'low', requires: ['firebase'],
      description: 'تظهر للاعب داخل الموقع (personalMessages + مسار RTDB الاحتياطي) وتنتهي بعد ساعة إن لم يفتح الموقع', effect: 'تُكتب الرسالة في نفس مسار رسائل المالك ويقرؤها الموقع',
      fields: [USER, { name: 'text', label: 'نص الرسالة', type: 'textarea', required: true, max: 500 }, { name: 'position', label: 'موضع الظهور', type: 'select', options: [{ value: 'top', label: 'أعلى الشاشة' }, { value: 'center', label: 'وسط الشاشة' }], default: 'top', required: true }, { name: 'durationMode', label: 'المدة', type: 'select', options: [{ value: 'timed', label: 'مؤقتة' }, { value: 'permanent', label: 'دائمة حتى يغلقها' }], default: 'timed', required: true }],
      target: (p) => p.username,
      async load(p, ctx) { const pl = await findPlayer(ctx.fb, p.username); return { uid: pl.uid, name: pl.username, lower: pl.usernameLower }; },
      async execute(p, ctx, b) {
        const base = { text: p.text, position: p.position, durationMode: p.durationMode, sentBy: ctx.actor.display };
        const rk = b.lower.replace(/[.#$[\]/%]/g, (c) => '%' + c.charCodeAt(0).toString(16));
        const [f, r] = await Promise.allSettled([(async () => ctx.fb.db().collection('personalMessages').doc(b.lower).set({ ...base, sentAt: ctx.fb.FieldValue.serverTimestamp() }))(), (async () => ctx.fb.rtdb().ref('ownerMessages/personal/' + rk).set({ ...base, sentAt: ctx.fb.ServerValue.TIMESTAMP }))()]);
        if (f.status === 'rejected' && r.status === 'rejected') throw f.reason;
        return { message: `أُرسلت الرسالة إلى ${b.name}${f.status === 'rejected' ? ' (عبر RTDB لأن حصة Firestore مستنفدة)' : ''}`, _rk: rk };
      },
      async verify(p, ctx, b, r) { let t = null; try { const s = await ctx.fb.db().collection('personalMessages').doc(b.lower).get(); t = s.exists ? s.data().text : null; } catch (e) { if (!isQuota(e)) throw e; } if (t == null) t = (await ctx.fb.rtdb().ref('ownerMessages/personal/' + r._rk).get()).val()?.text ?? null; return { ok: t === p.text, after: { text: t } }; }
    },
    {
      id: 'add_note', label: 'إضافة ملاحظة إدارية', icon: 'note', group: 'السجلات', danger: 'low', requires: ['firebase', 'store'],
      description: 'ملاحظة داخلية تظهر للمسؤولين فقط في قاعدة اللوحة (لا تُكتب في الموقع)', effect: 'تُحفظ ملاحظة مرتبطة بالاعب في سجل المسؤولين',
      fields: [USER, { name: 'note', label: 'الملاحظة', type: 'textarea', required: true, max: 1000 }], target: (p) => p.username,
      async load(p, ctx) { const pl = await findPlayer(ctx.fb, p.username); return { uid: pl.uid, name: pl.username }; },
      async execute(p, ctx, b) { const id = `${b.uid}-${now()}`; ctx.store.col('playerNotes').set(id, { uid: b.uid, username: b.name, note: p.note, by: ctx.actor.id, at: now() }); return { message: 'تمت إضافة الملاحظة', _id: id }; },
      async verify(p, ctx, b, r) { const n = ctx.store.col('playerNotes').get(r._id); return { ok: !!n && n.note === p.note, after: { note: n?.note } }; }
    },
    {
      id: 'export_player', label: 'تصدير بيانات لاعب (JSON)', icon: 'download', group: 'السجلات', kind: 'read', danger: 'low', requires: ['firebase'],
      description: 'ملف JSON بالملف الشخصي (بريد مقنّع) والخبرة والإطارات والعقوبات والملاحظات', effect: 'قراءة فقط — لا يتغير شيء',
      fields: [USER], target: (p) => p.username,
      async execute(p, ctx) {
        const pl = await findPlayer(ctx.fb, p.username);
        const levels = {}; for (const k of pl.levelKeys) levels[k] = await readLevel(ctx.fb, k);
        const au = await ctx.fb.auth().getUser(pl.uid).catch(() => null);
        const data = { player: playerSummary(pl), authState: au ? { disabled: au.disabled, lastSignIn: au.metadata.lastSignInTime, created: au.metadata.creationTime } : null, levels, punishments: punishments(ctx).list({ where: { uid: pl.uid }, limit: 100 }), notes: ctx.store.col('playerNotes').list({ where: { uid: pl.uid }, limit: 100 }) };
        return { message: 'جاهز للتنزيل', data, download: { filename: `player-${pl.usernameLower}.json`, mime: 'application/json', text: JSON.stringify(data, null, 2) } };
      }
    }
  ]
};
