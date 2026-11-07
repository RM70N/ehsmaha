/* تسجيل اللاعبين في البطولات من الموقع: يُفتح برابط ?tour=<معرّف> (للبطولات ذات التسجيل المفتوح فقط).
 * يكتب opsTournaments/{tid}/participants/{uid} (قاعدة RTDB تسمح للمستخدم بكتابة سجله فقط). */
(function () {
  'use strict';
  var m = /[?&]tour=([A-Za-z0-9_-]{4,40})/.exec(location.search); if (!m) return; var tid = m[1];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ui(html) {
    var o = document.getElementById('ops-tour-ov'); if (o) o.remove();
    o = document.createElement('div'); o.id = 'ops-tour-ov'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'التسجيل في بطولة');
    o.style.cssText = 'position:fixed;inset:0;z-index:100100;background:rgba(5,3,14,.78);display:grid;place-items:center;padding:16px;font-family:inherit';
    o.innerHTML = '<div style="background:var(--surface,#1a1030);color:var(--text,#fff);border:1px solid var(--border-strong,rgba(167,139,255,.3));border-radius:18px;max-width:440px;width:100%;padding:22px;display:flex;flex-direction:column;gap:12px;direction:rtl">' + html + '</div>';
    document.body.appendChild(o); o.addEventListener('click', function (e) { if (e.target === o || e.target.closest('[data-c]')) o.remove(); }); return o;
  }
  function run() {
    var O = window.EhsOps; var f = window.__fb; if (!O || !O.store() || !f || !f.auth || !f.auth.currentUser) return false;
    var u = f.auth.currentUser; var s = O.store();
    s.get('opsTournaments/' + tid + '/meta').then(function (meta) {
      if (!meta) { ui('<h3 style="margin:0">البطولة غير موجودة</h3><button class="btn" data-c style="all:revert">إغلاق</button>'); return; }
      if (meta.status !== 'registration' || meta.policy !== 'open') { ui('<h3 style="margin:0">' + esc(meta.name) + '</h3><p>التسجيل في هذه البطولة غير متاح حالياً.</p><button data-c>إغلاق</button>'); return; }
      var pre = ''; try { pre = (window.playerTiktokLinkGet && playerTiktokLinkGet() && playerTiktokLinkGet().username) || ''; } catch (e) {}
      var uname = ''; try { uname = window.currentUsername || ''; } catch (e) {}
      var o = ui('<h3 style="margin:0">التسجيل في ' + esc(meta.name) + '</h3><p style="margin:0;opacity:.8">' + esc(meta.desc || '') + '</p><label>يوزر بثك (تيك توك) لربط نتائجك<input id="ops-tour-h" dir="ltr" value="' + esc(pre) + '" style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(167,139,255,.3);background:rgba(0,0,0,.25);color:inherit"></label><div id="ops-tour-m" role="status" style="min-height:20px"></div><div style="display:flex;gap:8px"><button id="ops-tour-go" style="flex:1;padding:10px;border-radius:10px;border:0;background:#7C3AED;color:#fff;font:inherit;cursor:pointer">سجّلني</button><button data-c style="padding:10px;border-radius:10px;border:1px solid rgba(167,139,255,.3);background:transparent;color:inherit;font:inherit;cursor:pointer">إغلاق</button></div>');
      o.querySelector('#ops-tour-go').onclick = function () {
        var h = (o.querySelector('#ops-tour-h').value || '').trim().replace(/^@+/, '').toLowerCase(); var msg = o.querySelector('#ops-tour-m');
        if (!/^[a-z0-9._]{2,30}$/.test(h)) { msg.textContent = 'اكتب يوزر صحيحاً (حروف إنجليزية وأرقام).'; return; }
        s.get('opsTournaments/' + tid + '/participants').then(function (ps) {
          var reg = Object.keys(ps || {}).filter(function (k) { return ps[k].status === 'registered'; }).length; var status = meta.max && reg >= meta.max ? 'waitlist' : 'registered';
          return s.txn('opsTournaments/' + tid + '/participants/' + u.uid, function (cur) { if (cur) return undefined; return { uid: u.uid, name: uname || h, handle: h, username: uname || '', status: status, at: O.SV, src: 'self' }; }).then(function (r) { msg.textContent = r.committed ? (status === 'registered' ? 'تم تسجيلك بنجاح.' : 'البطولة ممتلئة — أُضفت لقائمة الانتظار.') : 'أنت مسجَّل مسبقاً في هذه البطولة.'; });
        }).catch(function () { msg.textContent = 'تعذّر التسجيل الآن، حاول لاحقاً.'; });
      };
    }).catch(function () { ui('<h3 style="margin:0">تعذّر تحميل البطولة</h3><button data-c>إغلاق</button>'); });
    return true;
  }
  var tries = 0; (function tick() { if (run()) return; if (++tries < 40) setTimeout(tick, 1000); })();
})();
