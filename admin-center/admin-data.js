/* EHSMAHA — طبقة بيانات الأدمن (تُحمَّل داخل إطار استوديو المالك وإطار لوحة الأدمن؛ تستخدم اتصال Firebase للصفحة الأم).
 *
 * لا تنفّذ أي فحص أمني: القواعد (firestore.rules / database.rules.json) هي الحاكم. هذه الطبقة تبني الطلبات الصحيحة فقط،
 * وتُظهر نتيجة القاعدة كما هي (رفض = رفض). لا تعرض نجاحاً قبل رد الخادم.
 */
(function (w) {
  'use strict';
  var P = w.EhsAdminPerms;
  var D = (w.EhsAdminData = {});
  function host() { try { return w.parent && w.parent !== w ? w.parent : w; } catch (e) { return w; } }
  function fb() { var h = host(); return h && h.__fb; }
  D.fb = fb;
  D.host = host;
  function me() { var f = fb(); var u = f && f.auth && f.auth.currentUser; return u ? { uid: u.uid, email: u.email || '', name: u.displayName || '' } : null; }
  D.me = me;
  function key(s) { return String(s == null ? '' : s).trim().replace(/^@+/, '').toLowerCase(); }
  D.key = key;
  function reqId() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  D.reqId = reqId;
  function fsOk() { var f = fb(); return !!(f && f.db); }
  function errText(e) { return (e && (e.code ? '[' + e.code + '] ' : '')) + String((e && e.message) || e || 'خطأ غير معروف').slice(0, 220); }
  D.errText = errText;
  /* الكائنات المنشأة داخل الإطار (iframe) من «عالم» JS مختلف عن الصفحة الأم، وFirestore يرفضها («custom Object»).
     نعيد بناءها بـJSON الخاص بالصفحة الأم قبل إرسالها (القيم الخاصة مثل serverTimestamp تُضاف بعد التحويل). */
  function native(o) { var h = host(); try { return h.JSON.parse(JSON.stringify(o)); } catch (e) { return o; } }
  D.native = native;
  function denied(e) { return !!(e && (e.code === 'permission-denied' || /PERMISSION_DENIED|permission/i.test(String(e.message || e)))); }
  D.isDenied = denied;

  /* ---------- المستخدمون (قراءة عامة في القواعد) ---------- */
  D.lookupUser = function (username) {
    var f = fb(); var k = key(username);
    if (!f || !k) return Promise.resolve(null);
    return f.getDoc(f.doc(f.db, 'usernames', k)).then(function (s) {
      if (!s.exists()) return null; var uid = s.data().uid;
      return f.getDoc(f.doc(f.db, 'users', uid)).then(function (u) {
        var d = u.exists() ? u.data() : {};
        var tk = d.linkedTiktokUsername || (d.tiktokLink && d.tiktokLink.username) || '';
        return { uid: uid, username: d.username || k, usernameLower: k, avatar: d.linkedTiktokAvatar || d.photoURL || d.avatar || '', email: d.email || '', tiktok: key(tk) };
      });
    });
  };

  /* ---------- سجلات الأدمن (القاعدتان معاً) ---------- */
  function rtdbRecord(rec) {
    var ids = {}; (P.framesAllowed(rec) || []).forEach(function (x) { ids[x] = true; });
    return { userId: rec.userId, username: rec.username, role: 'admin', status: rec.status, permissions: rec.permissions || {}, frameGrantScope: { mode: 'allowlist', frameIds: ids }, rev: rec.rev || 1 };
  }
  D.list = function () {
    var f = fb(); if (!fsOk()) return Promise.reject(new Error('Firestore غير متاح'));
    return f.getDocs(f.collection(f.db, 'adminAccess')).then(function (qs) { var out = []; qs.forEach(function (d) { out.push(Object.assign({ _id: d.id }, d.data())); }); return out; });
  };
  D.get = function (uid) { var f = fb(); return f.getDoc(f.doc(f.db, 'adminAccess', uid)).then(function (s) { return s.exists() ? s.data() : null; }); };
  D.getMine = function () {
    var m = me(); var f = fb(); if (!m || !f) return Promise.resolve(null);
    return f.getDoc(f.doc(f.db, 'adminAccess', m.uid)).then(function (s) { return s.exists() ? s.data() : null; });
  };
  /** يحفظ سجل الأدمن في القاعدتين. يرجع {ok, fs, rtdb, errors}. المالك فقط (القواعد تفرض). */
  D.save = function (rec) {
    var f = fb(); var o = me(); var res = { fs: false, rtdb: false, errors: [] };
    var fsRec = Object.assign(native(rec), { role: 'admin', createdBy: rec.createdBy || (o && o.uid) || '', updatedAt: f.serverTimestamp(), createdAt: rec.createdAt || f.serverTimestamp(), rev: (rec.rev || 0) + 1 });
    fsRec.frameGrantScope = native({ mode: 'allowlist', frameIds: P.framesAllowed(rec) });
    return f.setDoc(f.doc(f.db, 'adminAccess', rec.userId), fsRec).then(function () { res.fs = true; }, function (e) { res.errors.push('Firestore: ' + errText(e)); })
      .then(function () {
        if (!f.rtdb) { res.errors.push('RTDB غير متاح'); return; }
        return f.rtdbSet(f.rtdbRef(f.rtdb, 'adminAccess/' + rec.userId), rtdbRecord(Object.assign({}, rec, { rev: fsRec.rev }))).then(function () { res.rtdb = true; }, function (e) { res.errors.push('RTDB: ' + errText(e)); });
      }).then(function () { res.ok = res.fs && res.rtdb; return res; });
  };
  D.remove = function (uid) {
    var f = fb(); var res = { fs: false, rtdb: false, errors: [] };
    return f.deleteDoc(f.doc(f.db, 'adminAccess', uid)).then(function () { res.fs = true; }, function (e) { res.errors.push('Firestore: ' + errText(e)); })
      .then(function () { if (!f.rtdb) return; return f.rtdbRemove(f.rtdbRef(f.rtdb, 'adminAccess/' + uid)).then(function () { res.rtdb = true; }, function (e) { res.errors.push('RTDB: ' + errText(e)); }); })
      .then(function () { res.ok = res.fs && res.rtdb; return res; });
  };
  /** هل نسختا السجل متطابقتان (الحالة + الصلاحيات + الإطارات)؟ */
  D.checkSync = function (uid) {
    var f = fb(); if (!f.rtdb) return Promise.resolve({ ok: false, why: 'RTDB غير متاح' });
    return Promise.all([D.get(uid), f.rtdbGet(f.rtdbRef(f.rtdb, 'adminAccess/' + uid))]).then(function (r) {
      var a = r[0], b = r[1].exists() ? r[1].val() : null;
      if (!a && !b) return { ok: true };
      if (!a || !b) return { ok: false, why: !a ? 'غير موجود في Firestore' : 'غير موجود في RTDB' };
      var sa = JSON.stringify([a.status, P.enabledFromStore(a.permissions).sort(), P.framesAllowed(a).sort()]);
      var sb = JSON.stringify([b.status, P.enabledFromStore(b.permissions).sort(), P.framesAllowed(b).sort()]);
      return sa === sb ? { ok: true } : { ok: false, why: 'اختلاف بين القاعدتين' };
    });
  };

  /* ---------- سجل الإجراءات (Firestore، إضافة فقط) ---------- */
  D.log = function (action, o) {
    var f = fb(); var m = me(); if (!f || !m) return Promise.resolve(false);
    o = o || {};
    var data = { actorId: m.uid, actorName: String(o.actorName || m.name || m.email || m.uid).slice(0, 60), action: String(action).slice(0, 59), resourceType: String(o.resourceType || '').slice(0, 30), resourceId: String(o.resourceId || '').slice(0, 80),
      targetUid: String(o.targetUid || ''), targetKey: String(o.targetKey || ''), targetName: String(o.targetName || '').slice(0, 60), result: o.result || 'success', reqId: o.reqId || reqId(), ts: f.serverTimestamp(), meta: native(o.meta || {}) };
    return f.setDoc(f.doc(f.db, 'adminActionLog', o.id || ('a_' + data.reqId)), data).then(function () { return true; }, function () { return false; });
  };
  D.history = function (opts) {
    var f = fb(); opts = opts || {}; var m = me();
    var q = opts.all ? f.collection(f.db, 'adminActionLog') : f.query(f.collection(f.db, 'adminActionLog'), f.where('actorId', '==', opts.actor || (m && m.uid) || '_'));
    return f.getDocs(q).then(function (qs) {
      var out = []; qs.forEach(function (d) { var x = d.data(); x._id = d.id; x._ts = x.ts && x.ts.toMillis ? x.ts.toMillis() : 0; out.push(x); });
      out.sort(function (a, b) { return b._ts - a._ts; }); return out.slice(0, opts.limit || 200);
    });
  };

  /* ---------- الإطارات: الكتالوج الفعلي للموقع (لا نسخة موازية) ---------- */
  D.catalog = function () {
    var h = host(); var out = [];
    try { out = (typeof h.framesEffectiveCatalog === 'function' ? h.framesEffectiveCatalog() : []) || []; } catch (e) { out = []; }
    if (!out.length) { try { out = (0, h.eval)('typeof FRAMES_CATALOG!=="undefined"?FRAMES_CATALOG:[]') || []; } catch (e) {} }
    return out.filter(function (x) { return x && x.id && !x.ownerOnly; });
  };
  D.frameImg = function (x) { return (x && (x.gallery || x.img || x.src || x.url)) || ''; };
  /** مفاتيح levels للمستفيد: يوزر الموقع ثم تيك توك المربوط (نفس منطق framesGrantToUser/scodeRedeem). */
  D.targetKeys = function (u) { var out = []; [u.usernameLower || key(u.username), u.tiktok].forEach(function (k) { k = key(k); if (k && out.indexOf(k) < 0) out.push(k); }); return out; };

  /** يمنح إطاراً: دفعة واحدة (levels + سجل). القاعدة ترفض أي منح بلا صلاحية/نطاق/سجل. */
  D.grantFrame = function (user, frameId, kind) {
    var f = fb(); var m = me(); var rid = reqId(); kind = kind === 'code' ? 'frame.redeem_code' : 'frame.grant';
    var all = D.targetKeys(user);
    // نتخطّى المفاتيح التي تملك الإطار أصلاً (القاعدة تقبل إضافة إطار جديد واحد فقط، فلا تكرار ولا ازدواج)
    return Promise.all(all.map(function (k) { return f.getDoc(f.doc(f.db, 'levels', k)).then(function (s) { return { k: k, has: s.exists() && (s.data().ownedFrames || []).indexOf(frameId) >= 0 }; }); })).then(function (st) {
      var keys = st.filter(function (x) { return !x.has; }).map(function (x) { return x.k; });
      if (!keys.length) return { ok: true, already: true, keys: all, reqId: rid };
      var b = f.writeBatch(f.db);
      keys.forEach(function (k) {
        var aid = 'g_' + m.uid + '_' + k + '_' + frameId;
        b.set(f.doc(f.db, 'adminActionLog', aid), Object.assign(native({ actorId: m.uid, actorName: String(m.name || m.email || m.uid).slice(0, 60), action: kind, resourceType: 'frame', resourceId: frameId, targetUid: user.uid, targetKey: k, targetName: String(user.username || '').slice(0, 60), result: 'success', reqId: rid, meta: {} }), { ts: f.serverTimestamp() }));
        b.set(f.doc(f.db, 'levels', k), Object.assign(native({}), { ownedFrames: f.arrayUnion(frameId) }), native({ merge: true }));
      });
      return b.commit().then(function () {
        try { var h = host(); all.forEach(function (k) { if (h.framesParticipantCache) { h.framesParticipantCache.delete(k); h.framesParticipantCacheAt && h.framesParticipantCacheAt.delete(k); } }); } catch (e) {}
        return { ok: true, keys: keys, reqId: rid };
      });
    });
  };
  /** هل يملك المستفيد الإطار؟ (قراءة عامة لمستند levels). */
  D.owns = function (user, frameId) {
    var f = fb(); return Promise.all(D.targetKeys(user).map(function (k) { return f.getDoc(f.doc(f.db, 'levels', k)).then(function (s) { return s.exists() && (s.data().ownedFrames || []).indexOf(frameId) >= 0; }); }))
      .then(function (r) { return { any: r.some(Boolean), all: r.length > 0 && r.every(Boolean) }; });
  };

  /* ---------- الأكواد السرية: تحقق ثم استرداد باسم المستفيد (نفس بنية الاسترداد العادي) ---------- */
  D.codeKey = function (raw) { var h = host(); try { return h.scodeCodeKey(raw); } catch (e) { return key(raw); } };
  D.checkCode = function (raw) {
    var f = fb(); var k = D.codeKey(raw); if (!k) return Promise.resolve({ ok: false, reason: 'EMPTY' });
    return f.rtdbGet(f.rtdbRef(f.rtdb, 'secretCodes/' + k)).then(function (s) {
      if (!s.exists()) return { ok: false, reason: 'NOTFOUND' };
      var c = s.val();
      if (c.active === false) return { ok: false, reason: 'STOPPED', code: c };
      if (c.expiresAt && Date.now() > c.expiresAt) return { ok: false, reason: 'EXPIRED', code: c };
      if ((c.usedCount || 0) >= (c.maxUses || 0)) return { ok: false, reason: 'MAXED', code: c };
      if (!c.frameId) return { ok: false, reason: 'NOFRAME', code: c };
      return { ok: true, key: k, frameId: c.frameId, frameName: c.frameName || '', usedCount: c.usedCount || 0, maxUses: c.maxUses || 0, expiresAt: c.expiresAt || 0, usedBy: c.usedBy || {} };
    }, function (e) { return { ok: false, reason: denied(e) ? 'DENIED' : 'ERROR', error: errText(e) }; });
  };
  /** يسجّل استخدام الكود للمستفيد (ذرّياً مع العدّاد) ثم يمنح الإطار. عند فشل المنح يتراجع التسجيل (أفضل جهد ويُبلَّغ). */
  D.redeemCodeFor = function (user, chk) {
    var f = fb(); var m = me(); var base = 'secretCodes/' + chk.key;
    var up = {}; up[base + '/usedBy/' + user.uid] = { username: user.username, usedAt: Date.now(), by: m.uid }; up[base + '/usedCount'] = (chk.usedCount || 0) + 1; up[base + '/lastAdminRedeem'] = { uid: user.uid, by: m.uid };
    return f.rtdbUpdate(f.rtdbRef(f.rtdb), up).then(function () {
      return D.grantFrame(user, chk.frameId, 'code').then(function (r) { return Object.assign({ redeemed: true }, r); }, function (e) {
        var back = {}; back[base + '/usedBy/' + user.uid] = null; back[base + '/usedCount'] = chk.usedCount || 0; back[base + '/lastAdminRedeem'] = null;
        return f.rtdbUpdate(f.rtdbRef(f.rtdb), back).then(function () { throw Object.assign(new Error(errText(e)), { rolledBack: true, code: e && e.code }); }, function () { throw Object.assign(new Error(errText(e)), { rolledBack: false, code: e && e.code }); });
      });
    });
  };
})(window);
