/* قسم «التطبيق» بلوحة المالك: إحصاءات تطبيق احسمها لويندوز (التثبيتات، المتصلون الآن، التحميلات)،
 * إرسال إشعار للتطبيق فقط، وإعدادات عن بُعد (رسالة داخل التطبيق، أقل إصدار، إخفاء زر الدخول بالرمز، حجب الإشعارات).
 * كل البيانات حقيقية من خادم الجسر (Render) وتتطلب حساب المالك (ID Token يُتحقق منه بالخادم). */
(function () {
  'use strict';
  const { esc, icon, fmt, $, $$ } = UI; const O = window.Ops;
  const API = () => (window.EHS_APP_API || 'https://ehsmaha-piratetok-bridge.onrender.com') + '/desktop-app/admin';
  const REFRESH_MS = 15000;
  const TARGETS = [['home', 'الصفحة الرئيسية'], ['store', 'المتجر'], ['profile', 'الملف الشخصي'], ['levels', 'المستويات'], ['leaderboard', 'الترتيب'], ['frames', 'الإطارات']];
  const S = { st: null, cfg: null, err: null, busy: false, loadedAt: 0 };

  async function call(path, opts) {
    const u = O.host && O.host.__fb && O.host.__fb.auth && O.host.__fb.auth.currentUser;
    if (!u) throw new Error('لا توجد جلسة مالك');
    const token = await u.getIdToken();
    const r = await fetch(API() + path, Object.assign({ headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } }, opts || {}));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || ('HTTP ' + r.status)); e.code = j.error; throw e; }
    return j;
  }

  function kpi(ic, label, val, sub) { return `<div class="panel ops-kpi"><span class="l">${icon(ic)} ${esc(label)}</span><span class="v num">${val}</span>${sub ? `<span class="s">${esc(sub)}</span>` : ''}</div>`; }
  function sw(id, on, label, hint) { return `<label class="row" style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 0"><span><b>${esc(label)}</b>${hint ? `<small style="display:block;color:var(--text-3)">${esc(hint)}</small>` : ''}</span><span class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><i></i></span></label>`; }

  function stats() {
    const s = S.st; if (!s) return '';
    const dl = s.downloads || { total: 0, releases: [] };
    const vers = Object.entries(s.byVersion || {}).sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }));
    return `<div class="ops-grid">
      ${kpi('users', 'يستخدمونه الآن', fmt(s.onlineNow), 'تطبيقات متصلة حالياً')}
      ${kpi('check', 'التثبيتات المسجلة', fmt(s.installs), 'تطبيقات اتصلت بالخادم')}
      ${kpi('bell', 'نشطون آخر 24 ساعة', fmt(s.active24h), '')}
      ${kpi('chart', 'نشطون آخر 7 أيام', fmt(s.active7d), '')}
      ${kpi('shield', 'مرات التحميل', fmt(dl.total), 'من صفحات إصدارات GitHub')}
    </div>
    <div class="panel" style="margin-top:16px"><h4 style="margin:0 0 10px">الإصدارات</h4>
      <table class="ops-table"><thead><tr><th>الإصدار</th><th>تطبيقات نشطة بهذا الإصدار</th><th>متصل الآن</th><th>مرات تحميله</th></tr></thead><tbody>
      ${(() => { const rel = {}; (dl.releases || []).forEach((r) => { rel[r.tag.replace(/^v/, '')] = r.count; }); const keys = [...new Set([...vers.map((v) => v[0]), ...Object.keys(rel)])].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })); return keys.length ? keys.map((k) => `<tr><td class="num">${esc(k)}</td><td class="num">${fmt((s.byVersion || {})[k] || 0)}</td><td class="num">${fmt((s.onlineVersions || {})[k] || 0)}</td><td class="num">${rel[k] == null ? '—' : fmt(rel[k])}</td></tr>`).join('') : '<tr><td colspan="4">لا بيانات بعد</td></tr>'; })()}
      </tbody></table>
      <p style="color:var(--text-3);font-size:13px;margin:10px 0 0">الأرقام تشمل التطبيقات من الإصدار 1.1.2 وما بعد (الإصدارات الأقدم لا ترسل حضورها). «مرات التحميل» تعدّ تنزيلات ملف التثبيت فقط.</p>
    </div>`;
  }

  function sendForm() {
    return `<div class="panel" style="margin-top:16px"><h4 style="margin:0 0 4px">إرسال إشعار للتطبيق فقط</h4>
      <p style="color:var(--text-3);margin:0 0 12px">يصل لكل من يشغّل التطبيق الآن، ولمن يفتحه خلال 10 دقائق. لا يظهر على الموقع.</p>
      <div class="field"><label for="ap-title">العنوان</label><input class="input" id="ap-title" maxlength="80" placeholder="مثال: لعبة جديدة بالتطبيق" autocomplete="off"></div>
      <div class="field" style="margin-top:10px"><label for="ap-body">النص</label><textarea class="textarea" id="ap-body" maxlength="240" style="min-height:90px" placeholder="نص الإشعار (اختياري)"></textarea></div>
      <div class="field" style="margin-top:10px"><label for="ap-target">عند الضغط يفتح</label><select class="select" id="ap-target">${TARGETS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
      <div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" id="ap-send" type="button">إرسال للتطبيق</button><span id="ap-send-msg" role="status" style="color:var(--text-3)"></span></div>
      ${(S.st && S.st.sent && S.st.sent.length) ? `<div style="margin-top:14px"><b>آخر المُرسَل</b><ul style="margin:6px 0 0;padding-inline-start:18px;color:var(--text-2)">${S.st.sent.map((m) => `<li>${esc(m.title)} — وصل لـ ${fmt(m.delivered)} تطبيق (${esc(O.ago(m.at))})</li>`).join('')}</ul></div>` : ''}
    </div>`;
  }

  function cfgForm() {
    const c = S.cfg || { motd: { text: '', active: false }, minVersion: '', notificationsEnabled: true, codeLoginEnabled: true };
    return `<div class="panel" style="margin-top:16px"><h4 style="margin:0 0 4px">التحكم بالتطبيق</h4>
      <p style="color:var(--text-3);margin:0 0 12px">تُطبَّق فوراً على التطبيقات المتصلة، وعلى غيرها عند فتحها.</p>
      <div class="field"><label for="ap-motd">رسالة تظهر داخل التطبيق</label><input class="input" id="ap-motd" maxlength="300" value="${esc(c.motd.text || '')}" placeholder="مثال: صيانة قصيرة الليلة الساعة 12" autocomplete="off"></div>
      ${sw('ap-motd-on', c.motd.active, 'إظهار الرسالة', 'تظهر لكل مستخدم مرة واحدة')}
      <div class="field" style="margin-top:6px"><label for="ap-minver">أقل إصدار مسموح (اختياري)</label><input class="input" id="ap-minver" maxlength="12" dir="ltr" value="${esc(c.minVersion || '')}" placeholder="مثال: 1.1.2"><small style="color:var(--text-3)">من تطبيقه أقدم يظهر له طلب تحديث فوري.</small></div>
      ${sw('ap-notif', c.notificationsEnabled, 'السماح بإرسال الإشعارات للتطبيق', 'إيقافه يمنع وصول أي إشعار منك')}
      ${sw('ap-code', c.codeLoginEnabled, 'إظهار «الدخول برمز احسمها»', 'إخفاء الزر من صفحة الدخول بالتطبيق')}
      <div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" id="ap-save" type="button">حفظ الإعدادات</button><span id="ap-save-msg" role="status" style="color:var(--text-3)"></span></div>
    </div>`;
  }

  function bar() {
    const t = S.loadedAt ? 'آخر تحديث ' + O.clock(S.loadedAt) : 'جارِ التحميل…';
    return `<div class="ops-bar" id="ap-bar"><span class="live-tag ${S.err ? 'off' : ''}"><span class="ops-dot ${S.err ? 'bad' : 'ok'}"></span>${esc(S.err ? 'تعذّر الاتصال بالخادم' : 'تحديث تلقائي كل ١٥ ثانية')} · ${esc(t)}</span><button class="btn btn-ghost" id="ap-refresh" type="button">تحديث الآن</button></div>`;
  }

  // BATMISH: تثبيت هوية الستريمر _zvd4 (يُحفظ بالخادم). اللوحة تظهر فقط للحساب المثبَّت + بثه مربوط باسم _zvd4.
  const BM = { pins: undefined, sel: '_zvd4', msg: '' };
  const BM_STREAMERS = ['_zvd4'];
  const bmStText = () => BM.pins === undefined ? 'جارِ التحميل…' : BM_STREAMERS.map((s) => '@' + s + ': ' + (BM.pins[s] ? 'مثبَّت على الحساب ' + BM.pins[s] : 'غير مثبَّت')).join(' — ');
  const bmApi = () => (window.EHS_APP_API || 'https://ehsmaha-piratetok-bridge.onrender.com') + '/batmish/admin';
  async function bmCall(path, body) {
    const u = O.host && O.host.__fb && O.host.__fb.auth && O.host.__fb.auth.currentUser; if (!u) throw new Error('لا توجد جلسة مالك');
    const r = await fetch(bmApi() + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + await u.getIdToken(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || ('HTTP ' + r.status)); e.code = j.error; throw e; } return j;
  }
  function bmPanel() {
    const st = esc(bmStText());
    return `<div class="panel" id="bm-admin" style="margin-top:16px"><h4 style="margin:0 0 6px">لوحة BATMISH (الستريمر _zvd4)</h4>
      <p style="color:var(--text-3);font-size:13px;margin:0 0 10px">اللوحة تظهر لحساب واحد فقط: الحساب المثبَّت هنا + بثه مربوط الآن باسم _zvd4. اكتب اسم حساب الستريمر في احسمها (مو يوزر تيك توك) ثم ثبّته.</p>
      <p id="bm-st" style="margin:0 0 10px">${st}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><select class="input" id="bm-streamer" dir="ltr" aria-label="الستريمر" style="max-width:140px">${BM_STREAMERS.map((s) => `<option value="${s}"${BM.sel === s ? ' selected' : ''}>@${s}</option>`).join('')}</select><input class="input" id="bm-user" dir="ltr" maxlength="40" placeholder="اسم الحساب في احسمها" style="max-width:260px" aria-label="اسم الحساب في احسمها">
      <button class="btn btn-primary" id="bm-bind" type="button">تثبيت</button><button class="btn" id="bm-unbind" type="button">إلغاء التثبيت</button><span id="bm-msg" role="status">${esc(BM.msg)}</span></div></div>`;
  }
  async function bmLoad(v) { try { const s = await bmCall('/status'); BM.pins = s.pins || { _zvd4: s.pinnedUid || null }; } catch (e) { BM.pins = undefined; BM.msg = 'تعذّر قراءة الحالة'; } const p = $('#bm-st', v); if (p) p.textContent = bmStText(); }

  function body() {
    if (!O.owner()) return O.denied();
    if (S.err && !S.st) return O.error(S.err, 'ap-retry');
    if (!S.st) return O.skel(6);
    return stats() + sendForm() + cfgForm() + bmPanel();
  }

  async function load(v, force) {
    if (S.busy && !force) return; S.busy = true;
    try {
      const [st, cf] = await Promise.all([call('/stats'), call('/config')]);
      S.st = st; if (!S.cfgDirty) S.cfg = cf.config; S.err = null; S.loadedAt = Date.now();
    } catch (e) { S.err = e.message === 'unauthorized' ? 'هذا الحساب ليس حساب المالك' : (e.message || 'خطأ'); }
    S.busy = false;
    if (v && v.isConnected) paint(v);
  }

  function paint(v) {
    const b = $('#ap-bar', v); if (b) b.outerHTML = bar();
    const m = $('#ap-main', v); if (!m) return;
    // لا نعيد رسم النماذج أثناء الكتابة: نحدّث الأرقام فقط إن كانت النماذج موجودة
    if ($('#ap-title', m) && S.st) { const stat = $('#ap-stats', m); if (stat) stat.innerHTML = stats(); return; }
    m.innerHTML = S.st ? `<div id="ap-stats">${stats()}</div>${sendForm()}${cfgForm()}${bmPanel()}` : body();
  }

  Studio.actions['ap-retry'] = () => { const v = document.getElementById('view-app'); if (v) load(v, true); };

  Studio.register({ id: 'app', title: 'التطبيق', en: 'DESKTOP APP', icon: 'shield', desc: 'تحكّم بتطبيق احسمها لويندوز: كم حمّله وكم يستخدمه الآن، وأرسل له إشعاراً أو رسالة، وتحكّم بإعداداته.',
    html() { return `${bar()}<div id="ap-main" aria-live="polite">${body()}</div>`; },
    mount(v) {
      S.cfgDirty = false; load(v, true); O.every(v, REFRESH_MS, () => load(v)); setTimeout(() => bmLoad(v), 1200);
      v.addEventListener('input', (e) => { if (e.target.closest('#ap-motd,#ap-minver,#ap-motd-on,#ap-notif,#ap-code')) S.cfgDirty = true; });
      v.addEventListener('click', async (e) => {
        if (e.target.closest('#ap-refresh')) { load(v, true); return; }
        const bb = e.target.closest('#bm-bind,#bm-unbind');
        if (bb) {
          const msg = $('#bm-msg', v);
          try {
            if (bb.id === 'bm-bind') { const un = $('#bm-user', v).value.trim(); if (!un) { msg.textContent = 'اكتب اسم الحساب.'; return; } BM.sel = $('#bm-streamer', v).value; const r = await bmCall('/bind', { username: un, streamer: BM.sel }); BM.msg = 'تم التثبيت لـ@' + BM.sel + '.'; }
            else { if (!(await UI.confirm({ title: 'إلغاء تثبيت BATMISH', text: 'بعدها هذا الستريمر ما يقدر يفتح اللوحة لين تثبّت حساباً من جديد.' }))) return; BM.sel = $('#bm-streamer', v).value; await bmCall('/unbind', { streamer: BM.sel }); BM.msg = 'أُلغي التثبيت لـ@' + BM.sel + '.'; }
            msg.textContent = BM.msg; bmLoad(v);
          } catch (er) { msg.textContent = er.code === 'account_not_found' ? 'ما لقينا حساباً بهذا الاسم.' : 'تعذّر التنفيذ: ' + er.message; }
          return;
        }
        const send = e.target.closest('#ap-send');
        if (send) {
          const title = $('#ap-title', v).value.trim(); const msg = $('#ap-send-msg', v);
          if (!title) { msg.textContent = 'اكتب عنواناً للإشعار.'; return; }
          const ok = await UI.confirm({ title: 'إرسال الإشعار للتطبيق', text: 'سيصل «' + title + '» لكل التطبيقات المتصلة الآن' + (S.st ? ' (' + fmt(S.st.onlineNow) + ' تطبيق)' : '') + '.', label: 'إرسال' });
          if (!ok) return;
          send.disabled = true; msg.textContent = 'جارٍ الإرسال…';
          try {
            const r = await call('/notify', { method: 'POST', body: JSON.stringify({ title, body: $('#ap-body', v).value.trim(), target: $('#ap-target', v).value }) });
            msg.textContent = 'أُرسل. وصل لـ ' + fmt(r.delivered) + ' تطبيق متصل الآن.'; $('#ap-title', v).value = ''; $('#ap-body', v).value = ''; UI.toast('أُرسل الإشعار للتطبيق', 'ok'); load(v, true);
          } catch (er) { msg.textContent = er.code === 'notifications_disabled' ? 'الإشعارات موقوفة من «التحكم بالتطبيق».' : 'تعذّر الإرسال: ' + er.message; }
          send.disabled = false; return;
        }
        const save = e.target.closest('#ap-save');
        if (save) {
          const msg = $('#ap-save-msg', v); save.disabled = true; msg.textContent = 'جارٍ الحفظ…';
          const minv = $('#ap-minver', v).value.trim();
          if (minv && !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(minv)) { msg.textContent = 'صيغة الإصدار غير صحيحة (مثال 1.1.2).'; save.disabled = false; return; }
          try {
            const r = await call('/config', { method: 'POST', body: JSON.stringify({ motd: { text: $('#ap-motd', v).value, active: $('#ap-motd-on', v).checked, id: String(Date.now()) }, minVersion: minv, notificationsEnabled: $('#ap-notif', v).checked, codeLoginEnabled: $('#ap-code', v).checked }) });
            S.cfg = r.config; S.cfgDirty = false; msg.textContent = 'تم الحفظ وطُبّق على التطبيقات.'; UI.toast('حُفظت إعدادات التطبيق', 'ok');
          } catch (er) { msg.textContent = 'تعذّر الحفظ: ' + er.message; }
          save.disabled = false;
        }
      });
    } });
})();
