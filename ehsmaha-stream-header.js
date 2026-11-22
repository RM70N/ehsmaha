/* EhsmahaStreamerHeader — بدون اعتماديات. يُنشئ DOM الهيدر ويمرّر النقرات للإجراءات الأصلية. */
(function (global) {
  'use strict';
  var LOGO = 'data:image/webp;base64,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';

  var ICONS = { /* Lucide (ISC) — نفس السمك والزوايا لكل الأيقونات */
    home:  '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    kick:  '<path d="M2 21a8 8 0 0 1 11.873-7"/><circle cx="10" cy="8" r="5"/><path d="m17 17 5 5"/><path d="m22 17-5 5"/>',
    late:  '<path d="M2 21a8 8 0 0 1 13.292-6"/><circle cx="10" cy="8" r="5"/><path d="M19 16v6"/><path d="M22 19h-6"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'
  };
  var ORDER = ['home', 'kick', 'late', 'reset'];
  var LABELS = { home: 'الرئيسية', kick: 'طرد لاعب', late: 'لاعب متأخر', reset: 'ريست' };

  /* إعداد جاهز لمنصة احسمها: يبحث داخل الصفحة النشطة عن الأزرار الأصلية ويضغطها كما هي.
     (home → goHome الأصلية، والبقية عبر أزرار اللعبة نفسها) */
  function inActive(sel) {
    var p = document.querySelector('.page.active') || document;
    var list = p.querySelectorAll(sel), i, el;
    for (i = 0; i < list.length; i++) { el = list[i]; if (!el.closest('.ehsmaha-stream-header')) return el; }
    return null;
  }
  var sitePreset = {
    home:  function () { var b = inActive('.btn-home'); if (b) b.click(); else if (typeof global.goHome === 'function') global.goHome(); },
    kick:  function () { var b = inActive('.btn-kick, .hcw-kick'); if (b) b.click(); },
    late:  function () { var b = document.getElementById('lj-btn'); if (b) b.click(); },
    reset: function () { var b = inActive('.btn-reset'); if (b) b.click(); }
  };

  function run(action, ev, name) {
    var fn = action;
    if (typeof action === 'string') {
      var el = null, list = document.querySelectorAll(action), i;
      for (i = 0; i < list.length; i++) { if (!list[i].closest('.ehsmaha-stream-header')) { el = list[i]; break; } }
      if (!el) { console.warn('[EhsmahaStreamerHeader] الزر الأصلي غير موجود:', name, action); return; }
      el.click(); return;
    }
    if (typeof fn === 'function') fn.call(null, ev);
  }

  function mount(host, opts) {
    host = typeof host === 'string' ? document.querySelector(host) : host;
    if (!host) throw new Error('EhsmahaStreamerHeader: host not found');
    opts = opts || {};
    var actions = opts.actions || {};
    var root = document.createElement('header');
    root.className = 'ehsmaha-stream-header';
    root.setAttribute('role', 'banner');
    root.setAttribute('aria-label', 'احسمها — شريط تحكم الستريمر');

    var shown = ORDER.filter(function (k) { return actions[k]; }); /* لا أزرار شكلية */
    var btns = shown.map(function (k, i) {
      return '<button type="button" class="eh-btn" data-act="' + k + '" style="--i:' + i + '"' +
        (k === 'kick' || k === 'late' ? ' aria-haspopup="dialog"' : '') + '>' +
        (k === 'late' ? '<span class="eh-dot" aria-hidden="true"></span>' : '') +
        '<span class="eh-ico" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">' + ICONS[k] + '</svg></span>' +
        '<span class="eh-lbl">' + LABELS[k] + '</span>' +
        (k === 'late' ? '<span class="eh-badge" aria-label="عدد المتأخرين"></span>' : '') +
        '</button>';
    }).join('');

    root.innerHTML =
      '<div class="eh-bar">' +
        '<div class="eh-hatch" aria-hidden="true"></div><i class="eh-tip l" aria-hidden="true"></i><i class="eh-tip r" aria-hidden="true"></i>' +
        '<a class="eh-brand" href="' + (opts.href || 'https://ehsmaha.com') + '" target="_blank" rel="noopener" aria-label="احسمها ehsmaha.com">' +
          '<span class="eh-logo"><img src="' + (opts.logo || LOGO) + '" width="112" height="112" alt="" decoding="async"></span>' +
          '<span class="eh-id"><span class="eh-name">احسمها</span><span class="eh-url">ehsmaha.com</span></span>' +
        '</a>' +
        '<nav class="eh-ctrl" aria-label="أزرار التحكم" style="--eh-n:' + shown.length + '">' + btns + '</nav>' +
      '</div>';
    host.appendChild(root);

    var map = {};
    Array.prototype.forEach.call(root.querySelectorAll('.eh-btn'), function (b) { map[b.getAttribute('data-act')] = b; });

    root.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.eh-btn');
      if (!b || !root.contains(b)) return;
      if (b.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
      var k = b.getAttribute('data-act');
      run(actions[k], e, k); /* مباشر بلا تأخير — الأنيميشن لا يعطّل الإجراء */
    });

    var api = {
      el: root,
      /* حالة «لاعب متأخر» تُنقل من النظام الأصلي (مفعّل؟ وعدد المتأخرين) */
      setLate: function (s) {
        var b = map.late; if (!b) return api; s = s || {};
        b.setAttribute('data-on', s.on ? '1' : '0');
        b.setAttribute('data-count', String(s.count || 0));
        b.querySelector('.eh-badge').textContent = s.count ? String(s.count) : '';
        return api;
      },
      setDisabled: function (k, v) { var b = map[k]; if (b) b.setAttribute('aria-disabled', v ? 'true' : 'false'); return api; },
      setLoading: function (k, v) { var b = map[k]; if (b) { b.setAttribute('data-loading', v ? 'true' : 'false'); b.setAttribute('aria-busy', v ? 'true' : 'false'); } return api; },
      setPressed: function (k, v) { var b = map[k]; if (b) b.setAttribute('aria-pressed', v ? 'true' : 'false'); return api; },
      replay: function () { var bar = root.querySelector('.eh-bar'); bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; root.querySelectorAll('.eh-brand,.eh-btn,.eh-logo::after').forEach(function (n) { n.style.animation = 'none'; void n.offsetWidth; n.style.animation = ''; }); return api; },
      destroy: function () { if (root.parentNode) root.parentNode.removeChild(root); }
    };
    if (opts.late) api.setLate(opts.late);
    return api;
  }

  global.EhsmahaStreamerHeader = { mount: mount, sitePreset: sitePreset };
})(window);
