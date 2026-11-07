/* اقتراحات المستخدمين: أي حقل يوزر في استوديو المالك يعرض مستخدمين مطابقين للحروف المكتوبة.
 * المصدر: ownerUsersCache (نفس بيانات دليل المستخدمين). الاختيار يملأ الحقل بيوزر المستخدم ويطلق input/change
 * ليلتقطه ربط النماذج (data-bind). يعمل بتفويض أحداث على المستند فيشمل الحقول داخل النوافذ المنبثقة والأقسام المبنية لاحقاً. */
(function () {
  'use strict';
  var IDS = { 'u-q': 1, 'sh-q': 1, 'ms-u': 1, 'ev-in': 1, 'ct-ed': 1, 'm-in': 1, 'gr-t': 1, 'ap-t': 1 };
  var BINDS = { msgUser: 1, eventUser: 1, editorName: 1, modName: 1, grantTarget: 1, devName: 1, ghnamName: 1, alfawzanName: 1 };
  var TEXT_RE = /(يوزر|اسم المستخدم|اللاعب|المستخدم)/;
  var MAX = 8, box = null, cur = null, items = [], active = -1, hideT = 0;

  function users() { try { var L = window.Studio && Studio.live; return (L && L.G && L.G('ownerUsersCache')) || []; } catch (e) { return []; } }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/^@+/, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').trim(); }
  function uname(u) { return u.username || u.linkedTiktokUsername || (u.email ? String(u.email).split('@')[0] : '') || ''; }
  function isTarget(el) {
    if (!el || el.disabled || el.readOnly) return false;
    if (el.tagName === 'TEXTAREA') return !!IDS[el.id] || el.hasAttribute('data-user-field');
    if (el.tagName !== 'INPUT') return false;
    var t = (el.type || 'text').toLowerCase(); if (t !== 'text' && t !== 'search') return false;
    if (el.hasAttribute('data-no-suggest')) return false;
    if (IDS[el.id] || /^v-/.test(el.id) && el.closest('.vip-add') || BINDS[el.getAttribute('data-bind') || ''] || el.hasAttribute('data-user-field')) return true;
    var lab = ''; try { var l = el.id && document.querySelector('label[for="' + el.id + '"]'); lab = l ? l.textContent : ''; } catch (e) {}
    return TEXT_RE.test((el.getAttribute('placeholder') || '') + ' ' + lab) && !/(بطوله|اسم الاطار|اسم الإطار|اسم الفئه)/.test(norm(el.getAttribute('placeholder') || '') + norm(lab));
  }
  /* النص الذي يُطابَق: الحقل كله، أو السطر الأخير لحقول المشاركين متعددة الأسطر */
  function queryOf(el) { var v = el.value || ''; if (el.tagName === 'TEXTAREA') v = v.split(/\r?\n/).pop(); return norm(v); }
  function find(q) {
    if (!q) return [];
    var out = [];
    users().forEach(function (u) {
      if (!u) return; var n = norm(uname(u)), tt = norm(u.linkedTiktokUsername), em = norm(u.email ? String(u.email).split('@')[0] : ''), nm = norm(u.displayName || u.name);
      if (!n && !tt) return;
      var score = -1;
      if (n === q || tt === q) score = 0; else if (n.indexOf(q) === 0 || tt.indexOf(q) === 0) score = 1; else if (n.indexOf(q) >= 0 || tt.indexOf(q) >= 0) score = 2; else if (nm.indexOf(q) >= 0 || em.indexOf(q) === 0) score = 3;
      if (score >= 0) out.push({ u: u, score: score, name: uname(u) });
    });
    out.sort(function (a, b) { return a.score - b.score || a.name.length - b.name.length || (a.name < b.name ? -1 : 1); });
    var seen = {}; return out.filter(function (x) { var k = norm(x.name); if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, MAX);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ensureBox() {
    if (box && box.isConnected) return box;
    var st = document.createElement('style'); st.textContent =
      '#us-box{position:fixed;z-index:100000;background:var(--surface,#18181F);border:1px solid rgba(167,139,250,.35);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.55);padding:6px;max-height:320px;overflow:auto;direction:rtl;display:none}' +
      '#us-box.on{display:block}#us-box .us-i{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer;font:600 14px var(--f-body,inherit);color:var(--text,#F5F5FA)}' +
      '#us-box .us-i:hover,#us-box .us-i.act{background:rgba(124,58,237,.22)}#us-box .us-av{width:32px;height:32px;border-radius:50%;background:var(--violet,#7C3AED);color:#fff;display:grid;place-items:center;font:800 13px var(--f-body,inherit);overflow:hidden;flex:none}' +
      '#us-box .us-av img{width:100%;height:100%;object-fit:cover}#us-box .us-n{min-width:0;flex:1}#us-box .us-n b{display:block;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#us-box .us-n small{color:var(--text-3,#9a9aae);font-weight:600}#us-box mark{background:transparent;color:#C4B5FD}' +
      '#us-box .us-h{padding:10px;color:var(--text-3,#9a9aae);font:600 13px var(--f-body,inherit)}';
    document.head.appendChild(st);
    box = document.createElement('div'); box.id = 'us-box'; box.setAttribute('role', 'listbox'); box.setAttribute('data-us', '1'); document.body.appendChild(box);
    box.addEventListener('mousedown', function (e) { e.preventDefault(); var it = e.target.closest('.us-i'); if (it) pick(+it.getAttribute('data-i')); });
    return box;
  }
  function place() {
    if (!cur || !box) return; var r = cur.getBoundingClientRect(); var w = Math.max(r.width, 240);
    var left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8); box.style.width = w + 'px'; box.style.left = left + 'px';
    var below = innerHeight - r.bottom, h = Math.min(320, box.scrollHeight);
    if (below < Math.min(h, 200) && r.top > below) { box.style.top = Math.max(8, r.top - h - 6) + 'px'; } else { box.style.top = r.bottom + 6 + 'px'; }
  }
  function hi(text, q) { var t = String(text), i = norm(t).indexOf(q); if (i < 0 || !q) return esc(t); var s = t.replace(/^@+/, ''); return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)); }
  function show(el) {
    var q = queryOf(el); if (!q) return hide(); var b = ensureBox(); cur = el; items = find(q); active = items.length ? 0 : -1;
    if (!items.length) { if (!users().length) { b.innerHTML = '<div class="us-h">جارِ تحميل المستخدمين…</div>'; } else { b.innerHTML = '<div class="us-h">لا مستخدم يطابق «' + esc(el.value.trim()) + '»</div>'; } }
    else b.innerHTML = items.map(function (x, i) {
      var u = x.u, av = u.linkedTiktokAvatar || u.photoURL || u.avatar || ''; var letter = esc((x.name || '?').charAt(0).toUpperCase());
      var sub = u.linkedTiktokUsername && u.linkedTiktokUsername !== x.name ? '@' + esc(u.linkedTiktokUsername) : (u.email ? esc(u.email) : 'مستخدم');
      return '<div class="us-i' + (i === 0 ? ' act' : '') + '" role="option" data-i="' + i + '"><span class="us-av">' + (/^https:\/\//.test(av) ? '<img src="' + esc(av) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : letter) + '</span><span class="us-n"><b>' + hi(x.name, q) + '</b><small>' + sub + '</small></span></div>'; }).join('');
    b.classList.add('on'); place();
  }
  function hide() { if (box) box.classList.remove('on'); cur = null; items = []; active = -1; }
  function pick(i) {
    var x = items[i]; if (!x || !cur) return; var el = cur;
    if (el.tagName === 'TEXTAREA') { var lines = el.value.split(/\r?\n/); lines[lines.length - 1] = x.name; el.value = lines.join('\n'); } else el.value = x.name;
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    var keep = el; hide(); try { keep.focus(); } catch (e) {}
  }
  function move(d) { if (!items.length) return; active = (active + d + items.length) % items.length; box.querySelectorAll('.us-i').forEach(function (n, i) { n.classList.toggle('act', i === active); if (i === active) n.scrollIntoView({ block: 'nearest' }); }); }
  function prep(el) { if (el.getAttribute('data-us-ready')) return; el.setAttribute('data-us-ready', '1'); el.setAttribute('autocomplete', 'off'); el.removeAttribute('list'); el.setAttribute('aria-autocomplete', 'list'); }

  document.addEventListener('input', function (e) { var el = e.target; if (!isTarget(el)) return; prep(el); if (e.isTrusted === false && el !== document.activeElement) return; show(el); }, true);
  document.addEventListener('focusin', function (e) { var el = e.target; if (isTarget(el)) { prep(el); if (queryOf(el)) show(el); } }, true);
  document.addEventListener('focusout', function (e) { if (cur && e.target === cur) { clearTimeout(hideT); hideT = setTimeout(hide, 120); } }, true);
  document.addEventListener('keydown', function (e) {
    if (!cur || !box || !box.classList.contains('on') || e.target !== cur) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' && active >= 0 && items.length) { e.preventDefault(); e.stopPropagation(); pick(active); }
    else if (e.key === 'Escape') { hide(); }
  }, true);
  addEventListener('resize', place); document.addEventListener('scroll', function () { if (cur) place(); }, true);
  window.UserSuggest = { find: find, isTarget: isTarget, _users: users };
})();
