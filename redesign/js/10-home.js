/* الرئيسية — ربط بسيط لقسمَي Streamer_Section (#modes/#library). الحركات منقولة حرفياً من التصميم (P). */
(function () {
  var E = 'cubic-bezier(.2,.8,.2,1)';
  var reduce = function () { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  var CATS = {
    chat: { color: '#A78BFF', desc: 'المتابعون يلعبون بالكتابة: كلمات وأوامر وسرعة رد.' },
    luck: { color: '#F59E0B', desc: 'جولات إقصاء متتالية، والحظ يحدد من يبقى حتى النهاية.' },
    guess: { color: '#22D3EE', desc: 'لغز على الشاشة، وأول إجابة صحيحة في الشات تفوز.' },
    teams: { color: '#34D399', desc: 'الشات ينقسم إلى فريقين، وكثافة التعليقات تحسم النتيجة.' }
  };
  var P = {
    slide: [{ transform: 'translateX(0)' }, { transform: 'translateX(-38px)' }, { transform: 'translateX(0)' }],
    press: [{ transform: 'scale(1)' }, { transform: 'scale(.86)', offset: .3 }, { transform: 'scale(1.08)', offset: .6 }, { transform: 'scale(1)' }],
    pop: [{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)', offset: .4 }, { transform: 'translateY(0)' }],
    unflip: [{ transform: 'scaleX(-1)' }, { transform: 'scaleX(1)', offset: .35 }, { transform: 'scaleX(1)', offset: .75 }, { transform: 'scaleX(-1)' }],
    crown: [{ transform: 'translate(0,0)' }, { transform: 'translate(-29px,-16px)', offset: .3 }, { transform: 'translate(-58px,0)', offset: .55 }, { transform: 'translate(-58px,0)', offset: .8 }, { transform: 'translate(0,0)' }],
    straighten: [{}, { transform: 'rotate(0deg) translateY(0)', offset: .35 }, { transform: 'rotate(0deg) translateY(0)', offset: .75 }, {}],
    dash: [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(-30px)', opacity: 0, offset: .45 }, { transform: 'translateX(30px)', opacity: 0, offset: .5 }, { transform: 'translateX(0)', opacity: 1 }],
    maze: [{ transform: 'translate(0,0)' }, { transform: 'translate(0,48px)', offset: .25 }, { transform: 'translate(38px,48px)', offset: .5 }, { transform: 'translate(38px,20px)', offset: .7 }, { transform: 'translate(82px,20px)', offset: .9 }, { transform: 'translate(82px,20px)' }],
    reveal: [{ opacity: .15 }, { opacity: 1, offset: .3 }, { opacity: 1, offset: .8 }, { opacity: .15 }],
    drop: [{ transform: 'none', opacity: .55 }, { transform: 'translateY(26px)', opacity: 0, offset: .45 }, { transform: 'translateY(-10px)', opacity: 0, offset: .55 }, { transform: 'none', opacity: .55 }],
    aim: [{ transform: 'scale(1) rotate(0deg)' }, { transform: 'scale(.78) rotate(45deg)', offset: .5 }, { transform: 'scale(1) rotate(90deg)' }],
    shrink: [{ transform: 'scale(1)' }, { transform: 'scale(.62)', offset: .5 }, { transform: 'scale(1)' }],
    shake: [{ transform: 'rotate(0)' }, { transform: 'rotate(-12deg)' }, { transform: 'rotate(10deg)' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(-3deg)' }, { transform: 'rotate(0)' }],
    lid: [{ transform: 'none' }, { transform: 'translateY(-18px) rotate(-16deg)', offset: .4 }, { transform: 'translateY(-18px) rotate(-16deg)', offset: .7 }, { transform: 'none' }],
    chairs: [{ transform: 'translateX(0)' }, { transform: 'translateX(-26px)', offset: .5 }, { transform: 'translateX(0)' }],
    lightOn: [{ opacity: 1 }, { opacity: .25, offset: .4 }, { opacity: .25, offset: .7 }, { opacity: 1 }],
    lightOff: [{ opacity: .25 }, { opacity: 1, offset: .4 }, { opacity: 1, offset: .7 }, { opacity: .25 }],
    glass: [{ transform: 'translate(0,0)' }, { transform: 'translate(-32px,0)', offset: .2 }, { transform: 'translate(-64px,32px)', offset: .4 }, { transform: 'translate(-96px,32px)', offset: .6 }, { transform: 'translate(-128px,0)', offset: .8 }, { transform: 'translate(0,0)' }],
    lava: [{ transform: 'translateY(0)' }, { transform: 'translateY(-16px)', offset: .5 }, { transform: 'translateY(0)' }],
    coin: [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(720deg)' }],
    border: [{ transform: 'scaleX(1)' }, { transform: 'scaleX(1.35)', offset: .35 }, { transform: 'scaleX(.8)', offset: .7 }, { transform: 'scaleX(1)' }],
    scan: [{ transform: 'translateY(0)' }, { transform: 'translateY(31px)', offset: .33 }, { transform: 'translateY(62px)', offset: .66 }, { transform: 'translateY(0)' }],
    tick: [{ transform: 'scale(1)', color: '#EDE9FF' }, { transform: 'scale(1.1)', color: '#22D3EE', offset: .4 }, { transform: 'scale(1)', color: '#EDE9FF' }],
    flip: [{ transform: 'rotate(-7deg) rotateY(0deg)' }, { transform: 'rotate(-7deg) rotateY(180deg)', offset: .5 }, { transform: 'rotate(-7deg) rotateY(360deg)' }],
    swing: [{ transform: 'rotate(0)' }, { transform: 'rotate(14deg)' }, { transform: 'rotate(-10deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(0)' }],
    cupA: [{ transform: 'translateX(0)' }, { transform: 'translateX(-116px) translateY(-8px)', offset: .5 }, { transform: 'translateX(0)' }],
    cupB: [{ transform: 'translateX(0)' }, { transform: 'translateX(116px) translateY(8px)', offset: .5 }, { transform: 'translateX(0)' }],
    pencil: [{ transform: 'rotate(38deg) translate(0,0)' }, { transform: 'rotate(38deg) translate(30px,-50px)', offset: .5 }, { transform: 'rotate(38deg) translate(0,0)' }],
    hide: [{ opacity: 1 }, { opacity: 0, offset: .35 }, { opacity: 0, offset: .8 }, { opacity: 1 }],
    rope: [{ transform: 'translateX(0)' }, { transform: 'translateX(-16px)' }, { transform: 'translateX(12px)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(0)' }]
  };
  var crowdTx = ['translate(18px,-8px) rotate(-8deg)', 'translate(6px,10px) rotate(6deg)', 'translate(-6px,-12px) rotate(-4deg)', 'translate(-18px,6px) rotate(9deg)'];

  window.ehsModesHot = function (k) {
    var sec = document.getElementById('modes');
    if (!sec || sec.dataset.hot === k) return;
    sec.dataset.hot = k;
    sec.querySelectorAll('[data-mg]').forEach(function (g) { g.style.opacity = g.dataset.mg === k ? 1 : 0; });
    var crowd = sec.querySelectorAll('a[href="#"]')[1];
    if (crowd) crowd.querySelectorAll('div[aria-hidden] > span').forEach(function (s, i) { s.style.transform = k === 'gatherings' ? 'none' : crowdTx[i]; });
  };
  window.ehsScrollLib = function () {
    var el = document.getElementById('library');
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 24, behavior: reduce() ? 'auto' : 'smooth' });
  };
  window.ehsLibPick = function (cat) {
    if (typeof homeApplyFilter === 'function') homeApplyFilter(cat);
    document.querySelectorAll('#home-lib-filters .home-lib-filter').forEach(function (b) {
      var k = b.dataset.filter, c = CATS[k], on = k === cat;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.style.background = on ? c.color : 'rgba(26,16,48,.7)';
      b.style.color = on ? '#0b0518' : '#EDE9FF';
      b.style.borderColor = on ? c.color : 'rgba(167,139,255,.18)';
      var n = b.lastElementChild; if (n) n.style.background = on ? 'rgba(11,5,24,.18)' : 'rgba(255,255,255,.06)';
    });
    var d = document.getElementById('home-lib-desc'); if (d && CATS[cat]) d.textContent = CATS[cat].desc;
    var track = document.querySelector('#library .games-grid');
    if (!track) return;
    track.scrollLeft = 0;
    var i = 0;
    track.querySelectorAll('.gcard').forEach(function (el) {
      var on = el.dataset.category === cat;
      el.hidden = !on; el.style.display = '';
      if (on && !reduce() && el.animate) el.animate([{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: (i++) * 45, easing: E, fill: 'backwards' });
    });
  };
  window.ehsPlayCard = function (el) {
    if (reduce() || !el || el.__busy || !el.animate) return;
    el.__busy = true;
    var max = 0;
    el.querySelectorAll('[data-visual] [data-a]').forEach(function (n) {
      var k = P[n.dataset.a]; if (!k) return;
      var d = +n.dataset.d || 0, dur = n.dataset.a === 'coin' ? 1100 : 1000;
      max = Math.max(max, d + dur);
      n.animate(k, { duration: dur, delay: d, easing: E });
    });
    setTimeout(function () { el.__busy = false; }, max + 60);
  };
})();
