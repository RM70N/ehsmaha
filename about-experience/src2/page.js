/* صفحة «من نحن» v2: إدارة عنقود المعاينات المربعة، العدادات، الظهور، الأسئلة الشائعة */
function landingCtaClick(){
  const loggedIn = typeof currentUser !== 'undefined' && currentUser
    && typeof currentUsername !== 'undefined' && currentUsername;
  if (!loggedIn && typeof currentUser !== 'undefined' && currentUser) { show('choose-username'); return; }
  show(loggedIn ? 'home' : 'auth');
}

(function(){
  "use strict";
  var ROOT = null, booted = false;
  var ORIGIN = '*';
  var MQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var FAQ_ORIGINAL = /*__FAQ_ORIGINAL__*/[];
  var FAQ_NEW = /*__FAQ_NEW__*/[];
  var ORIGINAL_CATS = ['عام','الربط والبث','عام','الربط والبث','الألعاب','الألعاب','الألعاب','عام','عام','عام','عام','الربط والبث'];
  var CATS = ['الكل','عام','الربط والبث','الألعاب','المعاينات'];
  var STAGGER = { countrywar: 0, roulette: 1400, cannon: 2800 };
  var SIDE = 720;

  function $(s, r){ return (r || ROOT).querySelector(s); }
  function $$(s, r){ return Array.prototype.slice.call((r || ROOT).querySelectorAll(s)); }
  function hasGL(){
    try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; }
  }

  /* ---------------- العنقود ---------------- */
  var tiles = [], motionOn = true, inView = false, near = false, GL = true, loadTimer = 0;

  function Tile(el, i){
    var self = this;
    this.el = el; this.i = i; this.game = el.getAttribute('data-game');
    this.inner = $('.lp-tile-in', el); this.frame = $('.lp-frame', el);
    this.needsGL = el.getAttribute('data-gl') === '1';
    this.loaded = false; this.ready = false; this.started = false; this.paused = true; this.failed = !!(this.needsGL && !GL);
    this.pulseT = 0;
    this.ro = null;
    if (window.ResizeObserver) { this.ro = new ResizeObserver(function(){ self.fit(); }); this.ro.observe(this.inner); }
    this.fit();
  }
  Tile.prototype.fit = function(){
    var w = this.inner.clientWidth; if (!w) return;
    this.inner.style.setProperty('--k', (w / SIDE).toFixed(5));
  };
  Tile.prototype.post = function(cmd, extra){
    try { var m = { src: 'ehsemha-about', cmd: cmd }; if (extra) for (var k in extra) m[k] = extra[k]; if (this.frame.contentWindow) this.frame.contentWindow.postMessage(m, ORIGIN); } catch (e) {}
  };
  Tile.prototype.load = function(){
    if (this.loaded || this.failed) return;
    var src = this.el.getAttribute('data-src'); if (!src) { this.failed = true; return; }
    this.loaded = true; this.frame.src = this.el.getAttribute('data-src');
  };
  Tile.prototype.pulse = function(){
    var el = this.el; el.classList.remove('is-pulse'); void el.offsetWidth; el.classList.add('is-pulse');
    clearTimeout(this.pulseT); this.pulseT = setTimeout(function(){ el.classList.remove('is-pulse'); }, 750);
  };
  Tile.prototype.play = function(){
    if (!this.ready || this.failed) return;
    if (!this.started) { this.started = true; this.post('start', { delay: STAGGER[this.game] || 0 }); }
    else if (this.paused) this.post('resume');
    this.paused = false;
  };
  Tile.prototype.pause = function(){
    if (!this.ready || this.paused) return;
    this.paused = true; this.post('pause');
  };

  function wantPlay(){
    return motionOn && inView && !document.hidden && ROOT && ROOT.classList.contains('active');
  }
  function syncPlay(){
    var go = wantPlay();
    tiles.forEach(function(t){ if (go) t.play(); else t.pause(); });
  }
  var loadQ = [], loading = null, qTimer = 0;
  function nextLoad(){
    clearTimeout(qTimer); loading = null;
    var t = loadQ.shift(); if (!t) return;
    loading = t; t.load();
    qTimer = setTimeout(nextLoad, 12000);
  }
  function loadAll(){
    tiles.forEach(function(t){ if (!t.loaded && !t.failed && loadQ.indexOf(t) < 0 && loading !== t) loadQ.push(t); });
    if (!loading) nextLoad();
  }
  function onMessage(e){
    var d = e.data; if (!d || typeof d !== 'object' || d.src !== 'ehsemha-about-preview' || typeof d.type !== 'string') return;
    var t = null;
    for (var i = 0; i < tiles.length; i++) if (tiles[i].frame.contentWindow === e.source) { t = tiles[i]; break; }
    if (!t || t.game !== d.game) return;
    if (d.type === 'ready') { t.ready = true; t.paused = true; if (wantPlay()) t.play(); if (loading === t) setTimeout(nextLoad, 600); }
    else if (d.type === 'step') { if (!t.el.classList.contains('is-live')) t.el.classList.add('is-live'); }
    else if (d.type === 'elim' || d.type === 'result' || d.type === 'landed') t.pulse();
    else if (d.type === 'error') { t.failed = true; t.el.classList.remove('is-live'); }
  }

  function setMotion(on){
    motionOn = on;
    ROOT.setAttribute('data-motion', on ? 'on' : 'off');
    syncPlay();
  }

  function buildCluster(){
    GL = hasGL();
    $$('.lp-tile').forEach(function(el, i){ tiles.push(new Tile(el, i)); });
    window.addEventListener('message', onMessage);
    var cl = $('#lp-cluster');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function(es){
        es.forEach(function(en){ near = en.isIntersecting; if (near) loadAll(); });
      }, { rootMargin: '600px 0px' }).observe(cl);
      new IntersectionObserver(function(es){
        es.forEach(function(en){ inView = en.isIntersecting && en.intersectionRatio >= 0.25; syncPlay(); });
      }, { threshold: [0, 0.25, 0.5] }).observe(cl);
    } else { inView = true; loadAll(); }
    document.addEventListener('visibilitychange', syncPlay);
    if (MQ) { var h = function(){ setMotion(!MQ.matches); }; if (MQ.addEventListener) MQ.addEventListener('change', h); }
    setMotion(!(MQ && MQ.matches));
    /* بعد انتهاء الدخول يرجع الرفع عند التمرير فوري */
    setTimeout(function(){ tiles.forEach(function(t){ t.el.classList.add('is-settled'); }); }, 1800);
  }

  /* ---------------- عدادات ---------------- */
  function animateCount(el){
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (!isFinite(target)) return;
    if (!motionOn || (MQ && MQ.matches)) { el.textContent = target; return; }
    var t0 = 0, dur = 1200;
    function step(ts){
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * e);
      if (p < 1) requestAnimationFrame(step); else el.textContent = target;
    }
    el.textContent = '0'; requestAnimationFrame(step);
  }

  /* ---------------- أسئلة شائعة ---------------- */
  function norm(s){
    return String(s || '').toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  }
  function buildFaq(){
    var list = $('#landing-faq-list'); if (!list) return;
    var items = [];
    FAQ_ORIGINAL.forEach(function(p, i){ items.push({ cat: ORIGINAL_CATS[i] || 'عام', q: p[0], a: p[1] }); });
    FAQ_NEW.forEach(function(p){ items.push({ cat: p[0], q: p[1], a: p[2] }); });
    var frag = document.createDocumentFragment();
    items.forEach(function(it, i){
      var d = document.createElement('div'); d.className = 'lp-q landing-faq-item'; it.el = d;
      var h = document.createElement('h3'), b = document.createElement('button');
      b.type = 'button'; b.className = 'lp-q-btn'; b.id = 'lp-qb-' + i; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'lp-qa-' + i);
      var t = document.createElement('span'); t.className = 'lp-q-t'; t.textContent = it.q;
      var ic = document.createElement('span'); ic.className = 'lp-q-ic'; ic.setAttribute('aria-hidden', 'true');
      b.appendChild(t); b.appendChild(ic); h.appendChild(b);
      var pn = document.createElement('div'); pn.className = 'lp-q-panel'; pn.id = 'lp-qa-' + i; pn.setAttribute('role', 'region'); pn.setAttribute('aria-labelledby', b.id);
      var inner = document.createElement('div'), p = document.createElement('p'); p.textContent = it.a; inner.appendChild(p); pn.appendChild(inner);
      d.appendChild(h); d.appendChild(pn); frag.appendChild(d);
      b.addEventListener('click', function(){
        var open = b.getAttribute('aria-expanded') !== 'true';
        b.setAttribute('aria-expanded', open ? 'true' : 'false'); d.classList.toggle('is-open', open);
      });
      b.addEventListener('keydown', function(e){
        var vis = items.filter(function(x){ return !x.el.hidden; }).map(function(x){ return x.el.querySelector('.lp-q-btn'); });
        var k = vis.indexOf(b), n = -1;
        if (e.key === 'ArrowDown') n = Math.min(vis.length - 1, k + 1);
        else if (e.key === 'ArrowUp') n = Math.max(0, k - 1);
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = vis.length - 1;
        if (n >= 0) { e.preventDefault(); vis[n].focus(); }
      });
    });
    list.appendChild(frag);
    var empty = document.createElement('p'); empty.className = 'lp-faq-empty'; empty.textContent = 'ما لقينا سؤال مطابق. جرّب كلمة ثانية أو اختر الكل.'; empty.hidden = true; list.appendChild(empty);
    var cur = 'الكل', q = '', cats = $('#lp-faq-cats'), count = $('#lp-faq-count'), input = $('#lp-faq-search');
    CATS.forEach(function(c){
      var bt = document.createElement('button'); bt.type = 'button'; bt.className = 'lp-cat'; bt.textContent = c; bt.setAttribute('aria-pressed', c === cur ? 'true' : 'false');
      bt.addEventListener('click', function(){ cur = c; $$('.lp-cat', cats).forEach(function(x){ x.setAttribute('aria-pressed', x === bt ? 'true' : 'false'); }); apply(); });
      cats.appendChild(bt);
    });
    function apply(){
      var n = 0, nq = norm(q).trim();
      items.forEach(function(it){
        var ok = (cur === 'الكل' || it.cat === cur) && (!nq || norm(it.q + ' ' + it.a).indexOf(nq) >= 0);
        it.el.hidden = !ok; if (ok) n++;
      });
      empty.hidden = n > 0;
      count.textContent = n === items.length ? (items.length + ' سؤال') : (n + ' من ' + items.length + ' سؤال');
    }
    input.addEventListener('input', function(){ q = input.value; apply(); });
    apply();
  }

  /* ---------------- تهيئة ---------------- */
  function boot(){
    ROOT = document.getElementById('pg-landing'); if (!ROOT) return;
    ROOT.classList.add('lp-js');
    /* تأخيرات الدخول المرحلية */
    var intro = $$('.lp-hero-copy > *');
    intro.forEach(function(el, i){ el.classList.add('lp-intro'); el.style.setProperty('--d', 80 + i * 110); });
    var order = { countrywar: 380, roulette: 620, cannon: 800 };
    $$('.lp-tile').forEach(function(el){ el.style.setProperty('--d', order[el.getAttribute('data-game')] || 400); });
    buildFaq();
    buildCluster();
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ ROOT.classList.add('is-ready'); }); });

    ROOT.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('[data-lp-go]'); if (!a) return;
      e.preventDefault();
      var t = document.getElementById(a.getAttribute('data-lp-go'));
      if (t) t.scrollIntoView({ behavior: motionOn ? 'smooth' : 'auto', block: 'start' });
    });

    /* الأرقام تظهر مع المقدمة */
    setTimeout(function(){ $$('.lp-num').forEach(animateCount); }, 450);

    /* ظهور الأقسام */
    var rv = $$('.rv');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function(es){
        es.forEach(function(en){ if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
      rv.forEach(function(el){ io.observe(el); });
    } else rv.forEach(function(el){ el.classList.add('in'); });
    booted = true;
  }
  window.landingBoot = function(){ if (!booted) boot(); else syncPlay(); };
})();
