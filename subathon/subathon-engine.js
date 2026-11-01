/* EHSEMHA REMOTE GAME CONTROL ENGINE — طبقة DOM
 * Live Chat → Identity → Authorization → Command Parser (core) → Context Resolver → Action Dispatcher → Game Controller → UI Feedback
 *
 * - SMART UI TARGET RESOLVER: سجل أهداف حي مبني من العناصر المرئية القابلة للضغط في السياق الحالي (صفحة/نافذة)،
 *   مع قائمة منع صارمة (لوحة المالك/الحساب/الدفع/الحذف/الأمان...). لا يُنفَّذ نص التعليق أبداً؛ يُطابَق فقط مع أسماء الأهداف.
 * - VIRTUAL GAME NAVIGATOR: مؤشر افتراضي داخل الموقع يتحرك بين الأهداف هندسياً (فوق/تحت/يمين/يسار) ويضغط حقيقياً.
 * - GAME ADAPTER REGISTRY: لكل لعبة ستريمر: فتح، إعدادات، بدء، راوند، تالي، رجوع، مبنية من بطاقات الصفحة الرئيسية
 *   وسجل EHS_OPS_GAMES (دالة التشغيل + مدخلات افتراضية + بدء الراوند + العودة للوبي).
 */
(function () {
  'use strict';
  var C = window.SubathonCore; if (!C) return;
  var E = window.SubathonEngine = {};
  var cur = null;                       // العنصر الحالي تحت المؤشر
  var overlayEl = null, badgeEls = [];
  var lastCandidates = [];
  var hooks = { onPointer: null, onAction: null };
  E.hooks = hooks;

  /* ---------- أدوات ---------- */
  function vis(el) {
    if (!el || !el.isConnected) return false;
    var r = el.getBoundingClientRect(); if (r.width < 6 || r.height < 6) return false;
    var cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0 || cs.pointerEvents === 'none') return false;
    var vw = innerWidth, vh = innerHeight; if (r.bottom < -2000 || r.top > vh + 4000 || r.right < -50 || r.left > vw + 50) return false;
    for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) { var ps = getComputedStyle(p); if (ps.display === 'none' || ps.visibility === 'hidden') return false; }
    return true;
  }
  function labelOf(el) {
    var t = (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.textContent || el.value || '').replace(/\s+/g, ' ').trim();
    return t.slice(0, 80);
  }
  function isBlocked(el) {
    if (el.closest('[data-subathon-ui],#subathon-hud,#pg-subathon,#owner-studio-root,.owner-only,#pg-owner,[id^="pg-owner"],#pg-auth,#pg-choose-username,#pg-profile,[id*="payment"],[id*="admin-panel"]')) return true;
    var oc = (el.getAttribute('onclick') || '') + ' ' + (el.id || '') + ' ' + (el.className && el.className.baseVal === undefined ? el.className : '') + ' ' + (el.getAttribute('href') || '') + ' ' + (el.getAttribute('data-act') || '');
    if (C.BLOCK_RE.test(oc)) return true;
    var lb = labelOf(el); if (C.BLOCK_RE.test(lb)) return true;
    if (el.tagName === 'A' && el.href && !/^javascript:|^#/.test(el.getAttribute('href') || '') && el.origin && el.origin !== location.origin) return true;
    return false;
  }
  function clickable(el) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    var tag = el.tagName;
    if (tag === 'INPUT') { var ty = (el.type || '').toLowerCase(); return ty === 'button' || ty === 'submit' || ty === 'checkbox' || ty === 'radio'; }
    return tag === 'BUTTON' || tag === 'SUMMARY' || (tag === 'A' && (el.getAttribute('onclick') || el.getAttribute('href'))) || el.hasAttribute('onclick') || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'tab' || el.classList.contains('gcard') || el.classList.contains('btn') || el.hasAttribute('tabindex') && el.hasAttribute('data-tag');
  }
  /** سياق النافذة: أعلى نافذة/مودال ظاهر وإلا الصفحة النشطة */
  function contextRoot() {
    var mods = Array.prototype.slice.call(document.querySelectorAll('.modal-overlay, .modal, [role="dialog"], .overlay, [class*="modal"]')).filter(function (m) {
      if (m.closest('[data-subathon-ui]')) return false; if (!vis(m)) return false; var cs = getComputedStyle(m); return cs.position === 'fixed' || cs.position === 'absolute'; });
    if (mods.length) { mods.sort(function (a, b) { return (+getComputedStyle(b).zIndex || 0) - (+getComputedStyle(a).zIndex || 0); }); return { el: mods[0], modal: true }; }
    var pg = document.querySelector('.page.active'); return { el: pg || document.body, modal: false };
  }
  E.pageId = function () { var pg = document.querySelector('.page.active'); return pg ? pg.id.replace(/^pg-/, '') : ''; };

  /* ---------- سجل الأهداف (Target Registry) ---------- */
  function buildRegistry() {
    var ctx = contextRoot(); var root = ctx.el; var out = [];
    var nodes = root.querySelectorAll('button, a, [onclick], [role="button"], [role="tab"], input[type=button], input[type=submit], input[type=checkbox], input[type=radio], summary, .gcard');
    var seen = new Set();
    nodes.forEach(function (el) {
      if (seen.has(el) || !clickable(el) || !vis(el) || isBlocked(el)) return;
      // لا نأخذ الأب إن كان فيه ابن قابل للضغط يغطي نفس المنطقة (نفضّل الأعمق للأزرار؛ البطاقات gcard تُؤخذ كاملة)
      if (!el.classList.contains('gcard')) { var inner = el.querySelector('button,a[onclick],[onclick]'); if (inner && inner !== el && vis(inner) && !isBlocked(inner) && el.tagName !== 'BUTTON') return; }
      seen.add(el); var r = el.getBoundingClientRect();
      var lb = labelOf(el); if (!lb && !el.classList.contains('gcard')) return;
      out.push({ el: el, label: lb, norm: C.normalize(lb), cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r, page: E.pageId(), modal: ctx.modal });
    });
    lastCandidates = out; return out;
  }
  E.registry = function () { return buildRegistry().map(function (t) { return { label: t.label, page: t.page, modal: t.modal }; }); };

  /* ---------- المؤشر الافتراضي ---------- */
  function ensureOverlay() {
    if (overlayEl && overlayEl.isConnected) return overlayEl;
    overlayEl = document.createElement('div'); overlayEl.id = 'subathon-pointer'; overlayEl.setAttribute('data-subathon-ui', '1'); overlayEl.setAttribute('aria-hidden', 'true');
    overlayEl.innerHTML = '<span class="sbp-ring"></span><span class="sbp-tag"></span>'; document.body.appendChild(overlayEl); return overlayEl;
  }
  function placePointer(el, tagText) {
    var o = ensureOverlay(); if (!el || !el.isConnected) { o.classList.remove('on'); return; }
    var r = el.getBoundingClientRect(); o.style.left = r.left - 4 + 'px'; o.style.top = r.top - 4 + 'px'; o.style.width = r.width + 8 + 'px'; o.style.height = r.height + 8 + 'px';
    o.querySelector('.sbp-tag').textContent = tagText || labelOf(el).slice(0, 24); o.classList.add('on');
  }
  E.setPointerVisible = function (v) { var o = ensureOverlay(); if (!v) o.classList.remove('on'); else if (cur) placePointer(cur); };
  E.current = function () { return cur && cur.isConnected ? cur : null; };
  function setCur(el) {
    cur = el; if (el) { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch (e) {} setTimeout(function () { if (cur === el) placePointer(el); }, 60); placePointer(el); }
    if (hooks.onPointer) try { hooks.onPointer(el ? labelOf(el) : ''); } catch (e) {}
  }
  addEventListener('resize', function () { if (cur) placePointer(cur); });
  addEventListener('scroll', function () { if (cur) placePointer(cur); }, true);

  function move(dir) {
    var reg = buildRegistry(); if (!reg.length) return { ok: false, reason: 'no-targets', detail: 'لا عناصر قابلة للتحكم' };
    var base = null; if (cur) base = reg.filter(function (t) { return t.el === cur; })[0] || null;
    if (!base) { // أول تموضع: أول عنصر بالترتيب البصري
      var sorted = reg.slice().sort(function (a, b) { return a.cy - b.cy || b.cx - a.cx; }); setCur(sorted[0].el); return { ok: true, detail: sorted[0].label };
    }
    var best = null, bs = Infinity;
    reg.forEach(function (t) {
      if (t.el === base.el) return; var dx = t.cx - base.cx, dy = t.cy - base.cy; var main, cross;
      if (dir === 'down') { main = dy; cross = Math.abs(dx); } else if (dir === 'up') { main = -dy; cross = Math.abs(dx); } else if (dir === 'right') { main = dx; cross = Math.abs(dy); } else { main = -dx; cross = Math.abs(dy); }
      if (main <= 4) return; var score = main + cross * 2.2; if (score < bs) { bs = score; best = t; }
    });
    if (best) { setCur(best.el); return { ok: true, detail: best.label }; }
    // لا هدف في هذا الاتجاه: مرّر الصفحة قليلاً ثم أعد المحاولة مرة واحدة (تمرير حقيقي)
    if (dir === 'down' || dir === 'up') { var moved = scrollPage(dir === 'down' ? 1 : -1); if (moved) { var r2 = buildRegistry(); var cand = r2.filter(function (t) { return dir === 'down' ? t.cy > base.cy + 4 : t.cy < base.cy - 4; }).sort(function (a, b) { return dir === 'down' ? a.cy - b.cy : b.cy - a.cy; })[0]; if (cand) { setCur(cand.el); return { ok: true, detail: cand.label }; } } }
    return { ok: false, reason: 'edge', detail: 'نهاية الاتجاه' };
  }
  function scrollPage(sign) {
    var ctx = contextRoot(); var el = ctx.el; var sc = el; var cands = [el].concat(Array.prototype.slice.call(el.querySelectorAll('*')));
    var scroller = cands.filter(function (n) { var cs = getComputedStyle(n); return /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 4 && vis(n); })[0];
    var amt = Math.round(innerHeight * 0.6) * sign;
    if (scroller && ctx.modal) { var b = scroller.scrollTop; scroller.scrollBy({ top: amt, behavior: 'auto' }); return scroller.scrollTop !== b; }
    var y = window.scrollY; window.scrollBy({ top: amt, behavior: 'auto' }); return window.scrollY !== y;
  }

  function press(el) {
    if (!el || !el.isConnected) return { ok: false, reason: 'gone', detail: 'العنصر اختفى' };
    if (el.disabled) return { ok: false, reason: 'disabled', detail: 'الزر معطّل' };
    if (isBlocked(el)) return { ok: false, reason: 'blocked', detail: 'عنصر ممنوع' };
    var lb = labelOf(el);
    try { el.focus({ preventScroll: true }); } catch (e) {}
    flash();
    el.click(); return { ok: true, detail: lb || 'ضغط' };
  }
  function flash() { var o = ensureOverlay(); o.classList.remove('hit'); void o.offsetWidth; o.classList.add('hit'); }

  /* ---------- أرقام مؤقتة للأسماء المكررة ---------- */
  function clearBadges() { badgeEls.forEach(function (b) { b.remove(); }); badgeEls = []; }
  function numberTargets(list) {
    clearBadges(); list.slice(0, 9).forEach(function (t, i) {
      var b = document.createElement('div'); b.className = 'sbp-num'; b.setAttribute('data-subathon-ui', '1'); b.textContent = String(i + 1);
      b.style.left = t.r.left + 'px'; b.style.top = t.r.top + 'px'; document.body.appendChild(b); badgeEls.push(b);
    });
    setTimeout(clearBadges, 9000);
  }

  /* ---------- سجل الألعاب (Game Adapter Registry) ---------- */
  function gameCards() {
    return Array.prototype.slice.call(document.querySelectorAll('.games-grid.hlob-registry .gcard[data-tag], .gcard[data-tag]')).filter(function (c) { return c.getAttribute('onclick'); }).map(function (c) {
      var nm = (c.querySelector('.gcard-name,.gname,.gtitle') || c).textContent.replace(/\s+/g, ' ').trim().slice(0, 40);
      var tag = c.getAttribute('data-tag'); return { tag: tag, name: nm, el: c };
    });
  }
  function opsSpec(tag) { return (window.EHS_OPS_GAMES || []).filter(function (g) { return g.tag === tag; })[0] || null; }
  E.games = function () { return gameCards().map(function (g) { var s = opsSpec(g.tag); return { tag: g.tag, name: g.name, hasLaunch: !!(s && s.launch), hasRound: !!(s && s.lab && s.lab.start) }; }); };
  var openedTag = null;
  E.openedGame = function () { return openedTag; };

  function homeCardsFor(query) {
    var cards = gameCards(); var m = C.matchGames(query, cards); if (m.length) return m;
    // مطابقة جزئية صارمة: الاستعلام كلمة كاملة من اسم اللعبة (بعد إزالة ال)
    var qb = C.bare(query); if (qb.length < 3) return [];
    return cards.filter(function (g) { return C.bare(g.name).split(' ').indexOf(qb) >= 0; });
  }
  function goHome() { if (typeof show === 'function') { try { show('home'); } catch (e) { return false; } } openedTag = null; cur = null; E.setPointerVisible(false); return true; }

  function activeSpec() {
    var pg = E.pageId(); var tag = openedTag; if (tag) { var s = opsSpec(tag); if (s) return s; }
    var m = /^setup-(.+)$/.exec(pg); if (m) { var s2 = opsSpec(m[1]) || (window.EHS_OPS_GAMES || []).filter(function (g) { return pg === 'setup-' + g.tag; })[0]; if (s2) return s2; }
    // لعبة تعمل: أول مستمع مسجل
    var ls = (typeof homeGameListeners === 'object') ? Object.keys(homeGameListeners) : []; for (var i = 0; i < ls.length; i++) { var s3 = opsSpec(ls[i]); if (s3) return s3; }
    return null;
  }
  E.activeSpec = activeSpec;

  function findByLabel(re, root) {
    var reg = buildRegistry(); var list = reg.filter(function (t) { return re.test(t.norm); });
    return list;
  }

  /* ---------- المنفّذات ---------- */
  var X = {};
  X.down = function () { return move('down'); }; X.up = function () { return move('up'); }; X.left = function () { return move('left'); }; X.right = function () { return move('right'); };
  X.press = function () { var el = E.current(); if (!el) { var m = move('down'); if (!m.ok) return m; return { ok: true, detail: 'تم تحديد: ' + m.detail }; } return press(el); };
  X.scrollDown = function () { var ok = scrollPage(1); return ok ? { ok: true, detail: 'تمرير لتحت' } : { ok: false, reason: 'edge', detail: 'نهاية الصفحة' }; };
  X.scrollUp = function () { var ok = scrollPage(-1); return ok ? { ok: true, detail: 'تمرير لفوق' } : { ok: false, reason: 'edge', detail: 'بداية الصفحة' }; };
  X.games = function () { if (E.pageId() === 'home') { return { ok: true, detail: 'الألعاب معروضة' }; } return goHome() ? { ok: true, detail: 'قائمة الألعاب' } : { ok: false, reason: 'nav' }; };
  X.back = function () {
    var ctx = contextRoot();
    if (ctx.modal) { var cl = Array.prototype.slice.call(ctx.el.querySelectorAll('button,[onclick],[aria-label]')).filter(function (b) { return vis(b) && !isBlocked(b) && /(اغلاق|اغلق|اقفل|سكر|الغاء|رجوع|close|x|×|✕)/.test(C.normalize(labelOf(b)) + ' ' + (b.getAttribute('aria-label') || '').toLowerCase()); })[0]; if (cl) return press(cl); }
    var reg = buildRegistry().filter(function (t) { return /(رجوع|عوده|للخلف|الرئيسيه|القايمه|back)/.test(t.norm); })[0];
    if (reg) { var r = press(reg.el); if (r.ok) openedTag = null; return r; }
    if (E.pageId() !== 'home') { return goHome() ? { ok: true, detail: 'رجوع للرئيسية' } : { ok: false, reason: 'nav' }; }
    return { ok: false, reason: 'at-root', detail: 'أنت في الرئيسية' };
  };
  X.close = function () { return X.back(); };
  X.settings = function () {
    var reg = buildRegistry(); var t = reg.filter(function (t) { return /(اعدادات|ضبط|تخصيص|settings|⚙)/.test(t.norm); })[0];
    if (t) return press(t.el);
    // صفحة إعداد اللعبة هي الإعدادات: افتحها إن كنا في الرئيسية على لعبة محددة
    var s = activeSpec(); if (s && E.pageId() !== 'setup-' + s.tag) return openGameByTag(s.tag);
    return { ok: false, reason: 'no-settings', detail: 'لا إعدادات في هذه الشاشة' };
  };
  function openGameByTag(tag) {
    var g = gameCards().filter(function (c) { return c.tag === tag; })[0]; if (!g) return { ok: false, reason: 'no-game', detail: 'لعبة غير موجودة' };
    if (E.pageId() !== 'home') goHome();
    var el = g.el; if (!vis(el)) { try { el.scrollIntoView({ block: 'center' }); } catch (e) {} }
    var oc = el.getAttribute('onclick') || ''; if (C.BLOCK_RE.test(oc)) return { ok: false, reason: 'blocked' };
    setCur(el); flash(); el.click(); openedTag = tag; setTimeout(function () { cur = null; E.setPointerVisible(false); }, 400);
    return { ok: true, detail: 'فُتحت: ' + g.name, game: tag };
  }
  E.openGameByTag = openGameByTag;

  X.name = function (cmd, ctx) {
    var name = cmd.args.name; var q = C.normalize(name);
    // 1) أهداف السياق الحالي بالاسم (أزرار الشاشة)
    var reg = buildRegistry(); var exact = reg.filter(function (t) { return t.norm === q || C.bare(t.label) === C.bare(name); });
    var part = exact.length ? exact : reg.filter(function (t) { var n = t.norm; return n && (n.indexOf(q) >= 0 || (q.indexOf(n) >= 0 && n.length >= 4)) && q.length >= 2; });
    // 2) لعبة بالاسم (من الرئيسية، أو من أي مكان) — إن لم يطابق زر على الشاشة بدقة
    var onHome = E.pageId() === 'home';
    var games = (onHome || !exact.length) ? homeCardsFor(name) : [];
    if (games.length === 1 && (onHome || !exact.length)) { if (!(exact.length === 1 && !onHome)) return openGameByTag(games[0].tag); }
    if (games.length > 1) { numberTargets(games.map(function (g) { return { r: g.el.getBoundingClientRect() }; })); E._choices = games.map(function (g) { return { game: g.tag }; }); return { ok: false, reason: 'ambiguous', detail: 'أكثر من لعبة بهذا الاسم — اكتب رقماً', choices: E._choices }; }
    if (cmd.args.bareOnly && !exact.length && part.length !== 1) return { ok: false, reason: 'not-found', detail: 'لا هدف بهذا الاسم' };
    var list = exact.length ? exact : part;
    if (list.length === 1) { setCur(list[0].el); return press(list[0].el); }
    if (list.length > 1) { numberTargets(list); E._choices = list.map(function (t) { return { label: t.label }; }); E._choiceEls = list.map(function (t) { return t.el; }); return { ok: false, reason: 'ambiguous', detail: 'عدة أزرار بنفس الاسم — اكتب رقماً', choices: E._choices }; }
    return { ok: false, reason: 'not-found', detail: 'لا هدف باسم «' + name + '»' };
  };
  X.choose = function (cmd) {
    var n = cmd.args.n - 1; var ch = E._choices; clearBadges(); if (!ch || !ch[n]) return { ok: false, reason: 'no-choice', detail: 'رقم غير صالح' };
    if (ch[n].game) return openGameByTag(ch[n].game);
    var el = E._choiceEls && E._choiceEls[n]; E._choices = null; return press(el);
  };

  /* بدء اللعبة: من صفحة الإعداد → اضغط زر التشغيل (مع تعبئة الحقول الفارغة بقيم افتراضية آمنة) */
  function fillDefaults(spec) {
    var pg = document.getElementById('pg-setup-' + spec.tag) || document.querySelector('.page.active'); var filled = [];
    Object.keys(spec.inputs || {}).forEach(function (id) { var el = document.getElementById(id); if (el && !String(el.value || '').trim()) { el.value = spec.inputs[id]; el.dispatchEvent(new Event('input', { bubbles: true })); filled.push(id); } });
    return filled;
  }
  function launchButton(spec) {
    var pgEl = document.querySelector('.page.active'); if (!pgEl) return null;
    var btns = Array.prototype.slice.call(pgEl.querySelectorAll('button')).filter(function (b) { return vis(b) && !b.disabled && !isBlocked(b); });
    var byName = spec && spec.launch ? btns.filter(function (b) { return (b.getAttribute('onclick') || '').indexOf(spec.launch + '(') >= 0; })[0] : null;
    return byName || btns.filter(function (b) { return /^\s*[\w$.]*[lL]aunch\w*\(/.test(b.getAttribute('onclick') || ''); })[0] || null;
  }
  X.start = function () {
    var spec = activeSpec(); var pg = E.pageId();
    if (pg === 'home') return { ok: false, reason: 'no-game', detail: 'افتح لعبة أولاً' };
    var btn = launchButton(spec);
    if (btn) { if (spec) fillDefaults(spec); setCur(btn); return press(btn); }
    var cand = buildRegistry().filter(function (t) { return /^(ابدا|بدء|شغل|ابدا اللعبه|ابدا الجوله|ابدا الراوند)/.test(t.norm); })[0];
    if (cand) { setCur(cand.el); return press(cand.el); }
    return { ok: false, reason: 'no-start', detail: 'لا شيء لبدئه الآن' };
  };
  X.startRound = function () {
    var spec = activeSpec(); var pg = E.pageId();
    if (launchButton(spec) && /^setup-/.test(pg)) return X.start();
    var cand = buildRegistry().filter(function (t) { return /(ابدا الراوند|ابدا الجوله|ابدا المباراه|ابدا المواجهه|ابدا راوند|ابدا جوله|ابدا اللعب|ابدا الان|^ابدا$)/.test(t.norm); })[0];
    if (cand) { setCur(cand.el); return press(cand.el); }
    if (spec && spec.lab && spec.lab.start && /^[\w$.]+\(\)$/.test(spec.lab.start)) { try { (0, eval)(spec.lab.start); return { ok: true, detail: 'بدأ الراوند' }; } catch (e) { return { ok: false, reason: 'exec', detail: String(e.message).slice(0, 60) }; } }
    return { ok: false, reason: 'no-round', detail: 'لا يمكن بدء راوند الآن' };
  };
  X.next = function () {
    var cand = buildRegistry().filter(function (t) { return /(التالي|التاليه|جوله جديده|راوند جديد|جوله ثانيه|لعب مره|العب مره|مباراه جديده|مواجهه جديده|next)/.test(t.norm); })[0];
    if (cand) { setCur(cand.el); return press(cand.el); }
    return { ok: false, reason: 'no-next', detail: 'لا جولة تالية الآن' };
  };
  X.newRound = X.next;

  /** منفّذ الجلسة: يمرّر المستوى ويضمن عدم تنفيذ أمر غير مسموح في هذه الشاشة */
  E.execute = function (item, meta) {
    var type = item.cmd.type; var fn = X[type]; if (!fn) return Promise.resolve({ ok: false, reason: 'unknown', detail: 'أمر غير مدعوم' });
    var page = E.pageId(); var t0 = performance.now();
    if (/^(owner|auth|choose-username|profile)/.test(page)) return Promise.resolve({ ok: false, reason: 'page-forbidden', detail: 'صفحة غير مسموحة' });
    var res; try { res = fn(item.cmd, meta); } catch (e) { res = { ok: false, reason: 'exception', detail: String(e.message || e).slice(0, 60) }; }
    res.ms = Math.round(performance.now() - t0); res.page = page;
    if (hooks.onAction) try { hooks.onAction(item, res); } catch (e) {}
    return Promise.resolve(res);
  };
  E.clearPointer = function () { cur = null; E.setPointerVisible(false); clearBadges(); E._choices = null; };
  E.scrollPage = scrollPage; E.goHome = goHome;
})();
