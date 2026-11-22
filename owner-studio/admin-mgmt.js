/* إدارة الأدمن (ADMIN MANAGEMENT) — قسم في استوديو المالك.
 * المالك وحده: تعيين أدمن، مصفوفة صلاحيات مستقلة، الإطارات المسموح بمنحها، إيقاف/تفعيل، إزالة، وسجل الإجراءات.
 * الحماية الفعلية في القواعد (adminAccess يكتبه المالك فقط). هذه الواجهة لا تعرض نجاحاً قبل رد الخادم. */
(function () {
  'use strict';
  const { esc, icon, fmt, $, $$ } = UI; const P = window.EhsAdminPerms; const D = window.EhsAdminData;
  const S = { admins: [], loaded: false, err: '', sync: {}, log: [], logErr: '', logFilter: '' };
  const OWNER_EMAIL = 'malshaifan1@gmail.com';
  const dateOf = (t) => { try { const ms = t && t.toMillis ? t.toMillis() : (typeof t === 'number' ? t : 0); return ms ? new Date(ms).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; } catch (e) { return '—'; } };
  const nPerms = (r) => P.enabledFromStore(r.permissions).length;
  const avatar = (u, big) => { const a = u && u.avatar; const l = esc((String((u && u.username) || '?')[0] || '?').toUpperCase()); return `<span class="am-av ${big ? 'big' : ''}">${/^https:\/\//.test(a || '') ? `<img src="${esc(a)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : l}</span>`; };
  const STATUS = { active: ['نشط', 'ok'], suspended: ['موقوف مؤقتاً', 'warn'] };

  const CSS = `
  .am-wrap{display:grid;gap:18px}
  .am-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
  .am-stat{border:1px solid var(--line,rgba(167,139,250,.18));border-radius:16px;padding:14px 16px;background:var(--surface,#18181F)}
  .am-stat b{display:block;font:900 30px/1.1 var(--f-display,inherit);color:var(--text,#fff)} .am-stat span{color:var(--text-3,#9a9aae);font-size:13px}
  .am-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}
  .am-list{display:grid;gap:12px}
  .am-row{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;padding:14px 16px;border:1px solid var(--line,rgba(167,139,250,.18));border-radius:18px;background:var(--surface,#18181F)}
  .am-row.sus{opacity:.82;border-style:dashed}
  .am-av{width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,#7C3AED,#4C1D95);display:grid;place-items:center;color:#fff;font:900 20px var(--f-display,inherit);overflow:hidden;flex:none}
  .am-av.big{width:60px;height:60px;font-size:26px} .am-av img{width:100%;height:100%;object-fit:cover}
  .am-id b{display:block;font-weight:800;font-size:16px} .am-id small{color:var(--text-3,#9a9aae);direction:ltr;unicode-bidi:isolate;display:inline-block}
  .am-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:12.5px;color:var(--text-3,#9a9aae)}
  .am-acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
  .am-grp{border:1px solid var(--line,rgba(167,139,250,.18));border-radius:16px;padding:12px 14px;margin-bottom:12px}
  .am-grp h4{margin:0 0 8px;font-size:15px;color:var(--violet-2,#A78BFA)}
  .am-perm{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid rgba(167,139,250,.1)}
  .am-perm:first-of-type{border-top:0} .am-perm small{display:block;color:var(--text-3,#9a9aae);font-size:12px;direction:ltr;text-align:right}
  .am-perm .sens{color:#F59E0B;font-size:12px;margin-inline-start:6px}
  .am-warn{color:#F59E0B;font-size:13px;min-height:18px}
  .am-frames{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px;max-height:300px;overflow:auto;padding:4px}
  .am-fr{position:relative;border:2px solid transparent;border-radius:14px;padding:6px;background:#0d0a1a;cursor:pointer;text-align:center;font-size:12px;color:var(--text,#fff)}
  .am-fr[aria-pressed=true]{border-color:#7C3AED;background:rgba(124,58,237,.2)} .am-fr img{width:100%;height:48px;object-fit:contain;display:block}
  .am-fr em{display:block;font-style:normal;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .am-search{display:flex;gap:8px} .am-search input{flex:1}
  .am-res{display:flex;gap:12px;align-items:center;padding:12px;border-radius:14px;background:rgba(124,58,237,.12);margin-top:10px}
  .am-tbl{width:100%;border-collapse:collapse;font-size:13.5px} .am-tbl th,.am-tbl td{text-align:right;padding:8px 10px;border-bottom:1px solid rgba(167,139,250,.12)}
  .am-tbl th{color:var(--text-3,#9a9aae);font-weight:700} .am-res-ok{color:#22C55E}.am-res-denied,.am-res-failed{color:#EF4444}.am-res-unverified{color:#F59E0B}
  .am-bulk{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 10px}.am-bulk .btn{padding:6px 12px;font-size:13px}
  @media(max-width:720px){.am-row{grid-template-columns:auto 1fr}.am-acts{grid-column:1/-1;justify-content:flex-start}}`;

  /* ---------- مكوّنات مشتركة: مصفوفة الصلاحيات + اختيار الإطارات ---------- */
  function matrixHtml(enabled) {
    const on = new Set(enabled);
    return `<div class="am-bulk"><button type="button" class="btn btn-ghost" data-allperms>تحديد جميع الصلاحيات</button><button type="button" class="btn btn-ghost" data-noperms>إلغاء الكل</button></div>` + P.GROUPS.map((g) => `<div class="am-grp"><h4>${esc(g.title)}</h4>${g.keys.map((k) => `<div class="am-perm"><div><b>${esc(P.PERMS[k].title)}</b>${P.PERMS[k].sensitive ? '<span class="sens">حساسة</span>' : ''}<small>${esc(k)}</small></div>
      <label class="switch"><input type="checkbox" data-pk="${esc(k)}" ${on.has(k) ? 'checked' : ''} aria-label="${esc(P.PERMS[k].title)}"><i></i></label></div>`).join('')}</div>`).join('')
      + `<div class="am-grp"><h4>أساسي</h4><div class="am-perm"><div><b>${esc(P.PERMS['admin.dashboard.view'].title)}</b><small>admin.dashboard.view</small></div><label class="switch"><input type="checkbox" data-pk="admin.dashboard.view" ${on.has('admin.dashboard.view') ? 'checked' : ''} aria-label="فتح لوحة الأدمن"><i></i></label></div></div>`;
  }
  function framesHtml(sel) {
    const cat = D.catalog(); const s = new Set(sel);
    if (!cat.length) return `<div class="state"><p>تعذّر قراءة كتالوج الإطارات من الموقع.</p></div>`;
    return `<div class="am-bulk"><button type="button" class="btn btn-ghost" data-allframes>جميع الإطارات</button><button type="button" class="btn btn-ghost" data-noframes>إلغاء الكل</button></div><div class="am-frames" role="group" aria-label="الإطارات المسموح بمنحها">${cat.map((f) => `<button type="button" class="am-fr" data-fid="${esc(f.id)}" aria-pressed="${s.has(f.id)}" title="${esc(f.name || f.id)}"><img src="${esc(D.frameImg(f))}" alt="" loading="lazy"><em>${esc(f.name || f.id)}</em></button>`).join('')}</div>`;
  }
  function bindEditor(root, state) {
    const warn = $('#am-warn', root);
    root.addEventListener('change', (e) => {
      const cb = e.target.closest('[data-pk]'); if (!cb) return; const k = cb.dataset.pk; warn.textContent = '';
      if (cb.checked) {
        const miss = P.PERMS[k].needs.filter((n) => !state.keys.has(n));
        if (miss.length) { cb.checked = false; warn.textContent = 'لا يمكن تفعيل «' + P.PERMS[k].title + '» قبل تفعيل: ' + miss.map((n) => P.PERMS[n].title).join('، ') + '.'; return; }
        state.keys.add(k);
      } else {
        const dependents = [...state.keys].filter((x) => x !== k && P.closure([x]).includes(k));
        state.keys.delete(k);
        dependents.forEach((d) => { state.keys.delete(d); const el = $(`[data-pk="${d}"]`, root); if (el) el.checked = false; });
        if (dependents.length) warn.textContent = 'أُوقفت أيضاً لأنها تعتمد عليها: ' + dependents.map((n) => P.PERMS[n].title).join('، ') + '.';
      }
    });
    root.addEventListener('click', (e) => {
      const bulk = e.target.closest('[data-allperms],[data-noperms],[data-allframes],[data-noframes]');
      if (bulk) {
        warn.textContent = '';
        if (bulk.hasAttribute('data-allperms') || bulk.hasAttribute('data-noperms')) {
          const all = bulk.hasAttribute('data-allperms');
          state.keys.clear(); if (all) P.KEYS.forEach((k) => state.keys.add(k));
          root.querySelectorAll('[data-pk]').forEach((cb) => { cb.checked = state.keys.has(cb.dataset.pk); });
        } else {
          const all = bulk.hasAttribute('data-allframes');
          state.frames.clear(); if (all) D.catalog().forEach((f) => state.frames.add(f.id));
          root.querySelectorAll('[data-fid]').forEach((b2) => b2.setAttribute('aria-pressed', state.frames.has(b2.dataset.fid)));
        }
        return;
      }
      const b = e.target.closest('[data-fid]'); if (!b) return; const id = b.dataset.fid; const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); if (on) state.frames.add(id); else state.frames.delete(id); });
  }
  function validate(state) {
    const keys = [...state.keys];
    if (!keys.length) return 'اختر صلاحية واحدة على الأقل.';
    const m = P.missingDeps(keys); const k = Object.keys(m)[0];
    if (k) return 'الصلاحية «' + P.PERMS[k].title + '» تحتاج: ' + m[k].map((n) => P.PERMS[n].title).join('، ');
    if ((state.keys.has('admin.frames.grant') || state.keys.has('admin.frames.redeem_code')) && !state.frames.size) return 'حدّد إطاراً واحداً على الأقل ليتمكن الأدمن من المنح، أو أوقف صلاحيتي المنح.';
    return '';
  }

  /* ---------- حفظ مع إبلاغ صادق عن نتيجة القاعدتين ---------- */
  async function persist(rec, okMsg, auditAction, target) {
    const r = await D.save(rec);
    if (r.ok) { UI.toast(okMsg + (r.warnings && r.warnings.length ? ' — تنبيه: نسخة Firestore لم تُحفظ (' + r.warnings.join(' | ').slice(0, 120) + '). الأدمن يعمل من RTDB، لكن منح الإطارات يحتاج Firestore.' : ''), r.warnings && r.warnings.length ? 'warn' : 'ok'); D.log(auditAction, { resourceType: 'admin', resourceId: rec.userId, targetUid: rec.userId, targetName: rec.username, result: 'success', meta: { perms: P.enabledFromStore(rec.permissions).length, status: rec.status } }); return true; }
    UI.toast('لم يكتمل الحفظ — ' + r.errors.join(' | '), 'bad');
    D.log(auditAction, { resourceType: 'admin', resourceId: rec.userId, targetUid: rec.userId, targetName: rec.username, result: 'failed', meta: { errors: r.errors.join(' | ').slice(0, 200) } });
    return false;
  }

  /* ---------- نوافذ ---------- */
  function editor(existing, user) {
    const isNew = !existing;
    const state = { keys: new Set(existing ? P.enabledFromStore(existing.permissions) : ['admin.dashboard.view']), frames: new Set(existing ? P.framesAllowed(existing) : []) };
    const m = UI.modal({ title: isNew ? 'تعيين «' + user.username + '» كأدمن' : 'تعديل صلاحيات «' + (existing.username || existing.userId) + '»', wide: true,
      html: `<p class="lead">كل صلاحية مستقلة. الصلاحيات الحساسة غير مفعّلة افتراضياً. لا تُفعَّل صلاحية قبل ما تحتاجه.</p>${matrixHtml([...state.keys])}
        <div class="am-grp"><h4>الإطارات المسموح لهذا الأدمن بمنحها</h4><small style="color:var(--text-3)">لن يستطيع منح أي إطار خارج هذه القائمة، والتحقق يتم على الخادم.</small>${framesHtml([...state.frames])}</div><div id="am-warn" class="am-warn" role="status"></div>`,
      foot: `<button class="btn btn-primary" data-save>${isNew ? 'تعيين كأدمن' : 'حفظ التعديلات'}</button><button class="btn btn-ghost" data-x>إلغاء</button>`,
      onMount: (sc) => bindEditor($('.dialog-body', sc), state) });
    $('[data-save]', m.el).onclick = async (ev) => {
      const w = $('#am-warn', m.el); const bad = validate(state); if (bad) { w.textContent = bad; return; }
      const btn = ev.currentTarget; btn.disabled = true; w.textContent = 'جارٍ الحفظ…';
      const base = existing || { userId: user.uid, username: user.username, status: 'active', createdBy: D.me().uid };
      const rec = Object.assign({}, base, { permissions: P.toStoreMap([...state.keys]), frameGrantScope: { mode: 'allowlist', frameIds: [...state.frames] } });
      delete rec._id;
      const ok = await persist(rec, isNew ? 'تم تعيين الأدمن' : 'حُفظت الصلاحيات', isNew ? 'admin.assign' : 'admin.permissions.update');
      btn.disabled = false; if (ok) { m.close(); reload(); } else w.textContent = 'لم يكتمل الحفظ. راجع الرسالة أعلاه وأعد المحاولة.';
    };
  }
  function addFlow() {
    const m = UI.modal({ title: 'إضافة أدمن', html: `<p class="lead">ابحث عن الحساب بيوزره في احسمها (لا يُقبل الاسم الظاهر).</p>
      <div class="am-search"><input class="input" id="am-q" placeholder="يوزر الحساب" autocomplete="off" dir="ltr" aria-label="يوزر الحساب"><button class="btn btn-primary" id="am-find">بحث</button></div><div id="am-res" aria-live="polite"></div>`,
      foot: `<button class="btn btn-ghost" data-x>إغلاق</button>` });
    const res = $('#am-res', m.el); let found = null;
    const run = async () => {
      const q = $('#am-q', m.el).value; if (!D.key(q)) return; res.innerHTML = '<div class="skel"></div>';
      try {
        const u = await D.lookupUser(q);
        if (!u) { res.innerHTML = `<div class="state"><h4>لا يوجد حساب بهذا اليوزر</h4></div>`; return; }
        if ((u.email || '').toLowerCase() === OWNER_EMAIL) { res.innerHTML = `<div class="state error"><h4>هذا حساب المالك</h4><p>لا يُعيَّن المالك كأدمن.</p></div>`; return; }
        const ex = await D.get(u.uid); found = u;
        res.innerHTML = `<div class="am-res">${avatar(u, true)}<div class="am-id"><b>${esc(u.username)}</b><small>${esc(u.uid)}</small></div>${ex ? '<span style="margin-inline-start:auto">' + UI.badge('أدمن بالفعل', 'warn') + '</span>' : '<button class="btn btn-primary" id="am-pick" style="margin-inline-start:auto">اختيار</button>'}</div>${ex ? '<p class="lead">هذا الحساب أدمن بالفعل — عدّل صلاحياته من القائمة.</p>' : ''}`;
      } catch (e) { res.innerHTML = `<div class="state error"><h4>تعذّر البحث</h4><p>${esc(D.errText(e))}</p></div>`; }
    };
    $('#am-find', m.el).onclick = run; $('#am-q', m.el).addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    m.el.addEventListener('click', (e) => { if (e.target.closest('#am-pick') && found) { m.close(); editor(null, found); } });
  }

  async function changeStatus(a, to) {
    const ok = await UI.confirm({ title: to === 'suspended' ? 'إيقاف الأدمن مؤقتاً' : 'إعادة تفعيل الأدمن', text: to === 'suspended' ? 'سيفقد «' + a.username + '» وصوله الإداري فوراً (تُحفظ صلاحياته ويمكنك إعادته).' : 'سيستعيد «' + a.username + '» صلاحياته المحفوظة.', label: to === 'suspended' ? 'إيقاف' : 'تفعيل', danger: to === 'suspended' });
    if (!ok) return; const rec = Object.assign({}, a, { status: to }); delete rec._id;
    if (await persist(rec, to === 'suspended' ? 'أُوقف الأدمن' : 'أُعيد تفعيل الأدمن', to === 'suspended' ? 'admin.suspend' : 'admin.reactivate')) reload();
  }
  async function removeAdmin(a) {
    const ok = await UI.confirm({ title: 'إزالة الأدمن', text: 'ستُسحب رتبة الأدمن وكل صلاحيات «' + a.username + '» فوراً. لا يُحذف حسابه ولا نقاطه ولا ممتلكاته، ويبقى سجل إجراءاته.', label: 'إزالة الأدمن', danger: true });
    if (!ok) return; const r = await D.remove(a.userId);
    if (r.ok) { UI.toast('أُزيلت رتبة الأدمن', 'ok'); D.log('admin.remove', { resourceType: 'admin', resourceId: a.userId, targetUid: a.userId, targetName: a.username }); reload(); }
    else { UI.toast('لم تكتمل الإزالة — ' + r.errors.join(' | '), 'bad'); D.log('admin.remove', { resourceType: 'admin', resourceId: a.userId, targetUid: a.userId, targetName: a.username, result: 'failed', meta: { errors: r.errors.join(' | ').slice(0, 200) } }); reload(); }
  }
  async function showHistory(a) {
    const m = UI.modal({ title: 'سجل «' + (a.username || a.userId) + '»', wide: true, html: UI.stateBlock() || '<div class="skel"></div>', foot: '<button class="btn btn-ghost" data-x>إغلاق</button>' });
    try { const rows = await D.history({ all: true, actor: a.userId, limit: 300 }); const mine = rows.filter((x) => x.actorId === a.userId); $('.dialog-body', m.el).innerHTML = logTable(mine); }
    catch (e) { $('.dialog-body', m.el).innerHTML = `<div class="state error"><p>${esc(D.errText(e))}</p></div>`; }
  }
  const ACT = { 'frame.grant': 'منح إطار', 'frame.redeem_code': 'منح بكود', 'admin.assign': 'تعيين أدمن', 'admin.permissions.update': 'تعديل صلاحيات', 'admin.suspend': 'إيقاف أدمن', 'admin.reactivate': 'إعادة تفعيل', 'admin.remove': 'إزالة أدمن', 'observer.enter': 'دخول مراقب', 'observer.exit': 'خروج مراقب', 'conn.test': 'اختبار اتصال', 'frame.grant.denied': 'منح مرفوض', 'session.open': 'فتح تفاصيل جلسة' };
  const RES = { success: 'نجح', denied: 'مرفوض', failed: 'فشل', unverified: 'غير مؤكد' };
  function logTable(rows) {
    if (!rows.length) return `<div class="state">${icon('layers')}<h4>لا توجد إجراءات مسجّلة</h4></div>`;
    return `<div style="overflow:auto"><table class="am-tbl"><thead><tr><th>الوقت</th><th>الأدمن</th><th>الإجراء</th><th>الهدف</th><th>النتيجة</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(dateOf(r.ts))}</td><td>${esc(r.actorName || r.actorId)}</td><td>${esc(ACT[r.action] || r.action)}</td><td>${esc([r.targetName, r.resourceType === 'frame' ? r.resourceId : ''].filter(Boolean).join(' · ') || '—')}</td><td class="am-res-${esc(r.result)}">${esc(RES[r.result] || r.result)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  /* ---------- الصفحة ---------- */
  function row(a) {
    const st = STATUS[a.status] || [a.status, ''];
    const sy = S.sync[a.userId];
    return `<div class="am-row ${a.status === 'suspended' ? 'sus' : ''}" data-uid="${esc(a.userId)}">${avatar(a)}
      <div class="am-id"><b>${esc(a.username || a.userId)}</b> ${UI.badge(st[0], st[1])}<br><small>${esc(a.userId)}</small>
        <div class="am-meta"><span>${fmt(nPerms(a))} صلاحية</span><span>${fmt(P.framesAllowed(a).length)} إطار مسموح</span><span>عُيّن ${esc(dateOf(a.createdAt))}</span>${sy ? (sy.ok ? '<span>القاعدتان متطابقتان</span>' : `<span style="color:#EF4444">⚠ ${esc(sy.why)}</span>`) : ''}</div></div>
      <div class="am-acts"><button class="btn btn-ghost btn-sm" data-a="edit">${icon('sliders')}تعديل الصلاحيات</button><button class="btn btn-ghost btn-sm" data-a="log">${icon('list')}السجل</button>
        <button class="btn btn-ghost btn-sm" data-a="${a.status === 'active' ? 'suspend' : 'reactivate'}">${a.status === 'active' ? icon('lock') + 'إيقاف مؤقت' : icon('check') + 'تفعيل'}</button><button class="btn btn-ghost btn-sm btn-danger" data-a="remove">${icon('trash')}إزالة</button></div></div>`;
  }
  function body() {
    if (!S.loaded) return UI.stateBlock() || '<div class="list"><div class="skel"></div><div class="skel"></div></div>';
    if (S.err) return `<div class="state error" role="alert">${icon('alert')}<h4>تعذّر تحميل الأدمنز</h4><p>${esc(S.err)}</p><button class="btn btn-ghost btn-sm" id="am-retry">${icon('refresh')}إعادة المحاولة</button></div>`;
    const act = S.admins.filter((a) => a.status === 'active').length, sus = S.admins.length - act;
    const last = S.admins.map((a) => (a.updatedAt && a.updatedAt.toMillis ? a.updatedAt.toMillis() : 0)).sort((x, y) => y - x)[0];
    return `<div class="am-wrap"><div class="am-stats"><div class="am-stat"><b>${fmt(S.admins.length)}</b><span>عدد الأدمنز</span></div><div class="am-stat"><b>${fmt(act)}</b><span>مفعّلون</span></div><div class="am-stat"><b>${fmt(sus)}</b><span>موقوفون</span></div><div class="am-stat"><b style="font-size:18px">${esc(dateOf(last))}</b><span>آخر تعديل صلاحية</span></div></div>
      <div class="am-bar"><h3 class="h2" style="font-size:22px;margin:0">قائمة الأدمنز</h3><button class="btn btn-primary" id="am-add">${icon('userplus')}إضافة أدمن</button></div>
      <div class="am-list">${S.admins.length ? S.admins.slice().sort((a, b) => (a.username || '').localeCompare(b.username || '')).map(row).join('') : `<div class="state">${icon('users')}<h4>لا يوجد أدمنز بعد</h4><p>اضغط «إضافة أدمن» لتعيين أول أدمن.</p></div>`}</div>
      <div class="am-bar"><h3 class="h2" style="font-size:22px;margin:0">سجل إجراءات الأدمن</h3><button class="btn btn-ghost btn-sm" id="am-log-refresh">${icon('refresh')}تحديث</button></div>
      <div id="am-log">${S.logErr ? `<div class="state error"><p>${esc(S.logErr)}</p></div>` : logTable(S.log.slice(0, 60))}</div></div>`;
  }
  let view = null;
  function paint() { const m = view && $('#am-main', view); if (m) m.innerHTML = body(); }
  async function reload() {
    try { S.admins = await D.list(); S.err = ''; } catch (e) { S.err = D.errText(e); }
    S.loaded = true; paint();
    S.admins.forEach((a) => D.checkSync(a.userId).then((r) => { S.sync[a.userId] = r; paint(); }, () => {}));
    try { S.log = await D.history({ all: true, limit: 100 }); S.logErr = ''; } catch (e) { S.logErr = 'تعذّر تحميل السجل: ' + D.errText(e); } paint();
  }

  Studio.register({ id: 'adminmgmt', title: 'إدارة الأدمن', en: 'ADMIN MANAGEMENT', icon: 'shield', desc: 'عيّن الأدمنز وحدّد صلاحياتهم والإطارات التي يمنحونها، وراقب إجراءاتهم',
    html() { return `<style>${CSS}</style><div id="am-main" aria-live="polite">${body()}</div>`; },
    mount(v) {
      view = v; S.loaded = false; paint(); reload();
      v.addEventListener('click', (e) => {
        if (e.target.closest('#am-add')) return addFlow();
        if (e.target.closest('#am-retry')) { S.loaded = false; paint(); return reload(); }
        if (e.target.closest('#am-log-refresh')) return reload();
        const b = e.target.closest('[data-a]'); if (!b) return; const uid = b.closest('[data-uid]').dataset.uid; const a = S.admins.find((x) => x.userId === uid); if (!a) return;
        const t = b.dataset.a;
        if (t === 'edit') editor(a); else if (t === 'log') showHistory(a); else if (t === 'suspend') changeStatus(a, 'suspended'); else if (t === 'reactivate') changeStatus(a, 'active'); else if (t === 'remove') removeAdmin(a);
      });
    } });
  window.AdminMgmt = { _S: S, _validate: validate };
})();
