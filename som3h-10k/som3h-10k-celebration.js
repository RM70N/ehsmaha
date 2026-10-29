/*!
 * EHSEMHA — som3h.4 · 10K Celebration  (v2)
 * ملف مستقل بالكامل (JS + CSS مدمج). لا يعدّل أي دالة أو ملف في الموقع الأساسي.
 *
 * يتعلّق بدالة tiktokAttachAccountToGames التي يستدعيها الموقع فقط بعد وصول
 * bridge_status:connected الحقيقي، ثم يتحقق أن اليوزر هو som3h.4 بالضبط.
 * الإدراج: <script src="som3h-10k-celebration.js" defer><\/script> قبل </body>
 */
(function () {
  'use strict';
  if (window.__som3hCelebrationLoaded) return;
  window.__som3hCelebrationLoaded = true;

  var TARGET_USER = 'som3h.4';
  var P = 'som3h-celebration';
  var T_COUNT0 = 1.25;                     // بداية العدّاد (ث)
  var T_HIT = 2.95;                        // لحظة الوصول إلى 10,000
  var EXIT_AT = 6300;                      // ms
  var DURATION = 7100;
  var DEDUPE_MS = 25000;
  var MAIN_1 = 'مبررررروك';
  var MAIN_2 = ['العشر', 'الاف', 'متابع'];
  var SUB = 'عقبال العشرين والمية بإذن الله';

  var showing = false, lastFire = 0, avatarPromise = null, avatarUrl = '';

  /* ───────────── التحقق من الشرط ───────────── */
  function cleanUser(raw) {
    return String(raw == null ? '' : raw)
      .replace(/[\u0000-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, '')
      .trim().replace(/^@+/, '').toLowerCase();
  }
  function onLinked(username) {
    if (cleanUser(username) !== TARGET_USER) return;
    var now = Date.now();
    if (showing || now - lastFire < DEDUPE_MS) return;
    lastFire = now;
    prefetchAvatar();
    play();
  }

  /* ───────────── الأفاتار الحقيقي ───────────── */
  function prefetchAvatar() {
    if (avatarPromise) return avatarPromise;
    avatarPromise = new Promise(function (resolve) {
      var done = false;
      function fin(u) { if (done) return; done = true; avatarUrl = u || ''; resolve(avatarUrl); }
      setTimeout(function () { fin(''); }, 20000);
      try {
        if (typeof window.playerTiktokFetchProfile === 'function') {
          window.playerTiktokFetchProfile(TARGET_USER).then(function (r) { fin(r && r.avatar ? r.avatar : ''); }, function () { fin(''); });
        } else fin('');
      } catch (e) { fin(''); }
    });
    return avatarPromise;
  }

  /* ───────────── CSS ───────────── */
  var Q = '.' + P;
  var HIT = (T_HIT).toFixed(2) + 's';
  function d(x) { return (T_HIT + x).toFixed(2) + 's'; }

  var CSS = [
    Q + '{--bk:#07040D;--dp:#170B2D;--rp:#5B21B6;--vl:#7C3AED;--lv:#A78BFA;--pearl:#F8F7FC;',
    'position:fixed;inset:0;z-index:2147483000;overflow:hidden;direction:rtl;color:var(--pearl);',
    'font-family:"Cairo","Tajawal",system-ui,sans-serif;-webkit-font-smoothing:antialiased;',
    'opacity:0;animation:' + P + '-in .6s cubic-bezier(.2,.7,.2,1) forwards;touch-action:manipulation;cursor:pointer;',
    '--av:clamp(132px,min(28vmin,25vh),270px);--px:0;--py:0;--heat:0}',
    Q + ' *{box-sizing:border-box;margin:0;padding:0}',
    Q + '.is-out{animation:' + P + '-out .85s cubic-bezier(.5,0,.8,.3) forwards}',
    '@keyframes ' + P + '-in{to{opacity:1}}',
    '@keyframes ' + P + '-out{0%{opacity:1}100%{opacity:0;filter:blur(12px) brightness(1.6);transform:scale(1.06)}}',
    '@keyframes ' + P + '-fade{to{opacity:1}}',
    '@keyframes ' + P + '-spin{to{transform:rotate(360deg)}}',
    '@keyframes ' + P + '-breath{0%,100%{opacity:.78}50%{opacity:1}}',
    '@keyframes ' + P + '-rise{to{opacity:1;transform:none}}',

    /* ── الخلفية ── */
    Q + '__bg{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,#25124a 0%,var(--dp) 30%,var(--bk) 74%)}',
    Q + '__grid{position:absolute;inset:-10%;opacity:0;animation:' + P + '-fade 1.2s .2s forwards;',
    'background-image:linear-gradient(rgba(167,139,250,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(167,139,250,.10) 1px,transparent 1px),',
    'linear-gradient(rgba(167,139,250,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(167,139,250,.05) 1px,transparent 1px);',
    'background-size:112px 112px,112px 112px,28px 28px,28px 28px;',
    '-webkit-mask-image:radial-gradient(62% 55% at 50% 44%,#000 0%,transparent 80%);mask-image:radial-gradient(62% 55% at 50% 44%,#000 0%,transparent 80%);',
    'transform:translate(calc(var(--px)*-14px),calc(var(--py)*-10px))}',
    Q + '__floor{position:absolute;left:-30%;right:-30%;bottom:-6%;height:46%;opacity:0;animation:' + P + '-fade 1.4s .5s forwards;',
    'background-image:linear-gradient(rgba(167,139,250,.38) 1px,transparent 1px),linear-gradient(90deg,rgba(167,139,250,.38) 1px,transparent 1px);background-size:64px 64px;',
    'transform:perspective(420px) rotateX(64deg);transform-origin:50% 0;animation:' + P + '-fade 1.4s .5s forwards,' + P + '-floor 3s linear infinite;',
    '-webkit-mask-image:linear-gradient(180deg,transparent,#000 45%,transparent);mask-image:linear-gradient(180deg,transparent,#000 45%,transparent)}',
    '@keyframes ' + P + '-floor{to{background-position:0 64px,0 0}}',
    Q + '__rays{position:absolute;left:50%;top:40%;width:210vmax;height:210vmax;margin:-105vmax 0 0 -105vmax;opacity:0;',
    'background:repeating-conic-gradient(from 0deg,rgba(124,58,237,0) 0 6deg,rgba(167,139,250,.15) 8.5deg,rgba(124,58,237,0) 11deg);',
    '-webkit-mask-image:radial-gradient(closest-side,#000 0%,transparent 44%);mask-image:radial-gradient(closest-side,#000 0%,transparent 44%);',
    'animation:' + P + '-fade 1.6s .5s forwards,' + P + '-spin 100s linear infinite}',
    Q + '__rays2{position:absolute;left:50%;top:40%;width:170vmax;height:170vmax;margin:-85vmax 0 0 -85vmax;opacity:0;',
    'background:repeating-conic-gradient(from 20deg,rgba(255,255,255,0) 0 13deg,rgba(255,255,255,.07) 14.5deg,rgba(255,255,255,0) 16deg);',
    '-webkit-mask-image:radial-gradient(closest-side,#000 0%,transparent 36%);mask-image:radial-gradient(closest-side,#000 0%,transparent 36%);',
    'animation:' + P + '-fade 1.6s .9s forwards,' + P + '-spin 70s linear infinite reverse}',
    Q + '__halo{position:absolute;left:50%;top:40%;width:150vmin;height:150vmin;margin:-75vmin 0 0 -75vmin;border-radius:50%;opacity:0;',
    'background:radial-gradient(closest-side,rgba(124,58,237,.6),rgba(91,33,182,.25) 46%,transparent 72%);',
    'animation:' + P + '-halo 1.4s .35s cubic-bezier(.2,.8,.2,1) forwards,' + P + '-breath 3.2s 1.8s ease-in-out infinite;filter:brightness(calc(1 + var(--heat)*.5))}',
    '@keyframes ' + P + '-halo{0%{opacity:0;transform:scale(.3)}100%{opacity:1;transform:scale(1)}}',
    Q + '__vb{position:absolute;top:-10%;bottom:-10%;width:clamp(26px,5vw,90px);opacity:0;',
    'background:linear-gradient(180deg,transparent,rgba(124,58,237,.30) 35%,rgba(167,139,250,.18) 65%,transparent);filter:blur(6px);',
    '-webkit-mask-image:linear-gradient(90deg,transparent,#000,transparent);mask-image:linear-gradient(90deg,transparent,#000,transparent);animation:' + P + '-vb 4.5s ease-in-out infinite}',
    '@keyframes ' + P + '-vb{0%,100%{opacity:.15}50%{opacity:.85}}',
    Q + '__geo{position:absolute;inset:0;width:100%;height:100%;opacity:0;animation:' + P + '-fade 1.4s .4s forwards;transform:translate(calc(var(--px)*22px),calc(var(--py)*16px))}',
    Q + '__geo .g1{transform-origin:500px 400px;animation:' + P + '-spin 80s linear infinite}',
    Q + '__geo .g2{transform-origin:500px 400px;animation:' + P + '-spin 120s linear infinite reverse}',
    Q + '__geo .g3{transform-origin:500px 400px;animation:' + P + '-spin 200s linear infinite}',
    Q + '__cv{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}',
    Q + '__vig{position:absolute;inset:0;background:radial-gradient(90% 80% at 50% 44%,transparent 52%,rgba(3,1,8,.9) 100%);pointer-events:none}',
    Q + '__scan{position:absolute;left:0;right:0;height:22vh;top:-25vh;background:linear-gradient(180deg,transparent,rgba(167,139,250,.08),transparent);animation:' + P + '-scan 3.6s .6s ease-in-out 1}',
    '@keyframes ' + P + '-scan{to{top:105vh}}',
    Q + '__sweep{position:absolute;top:-20%;bottom:-20%;width:34vw;left:-50vw;transform:skewX(-20deg);pointer-events:none;',
    'background:linear-gradient(90deg,transparent,rgba(248,247,252,.20),rgba(167,139,250,.14),transparent);animation:' + P + '-gsweep 1.1s ' + HIT + ' cubic-bezier(.5,0,.3,1) forwards}',
    '@keyframes ' + P + '-gsweep{to{left:130vw}}',

    /* ── HUD: زوايا وأشرطة جانبية ── */
    Q + '__hud{position:absolute;inset:max(12px,3vmin)}',
    Q + '__hud i{position:absolute;width:clamp(30px,7.5vmin,70px);height:clamp(30px,7.5vmin,70px);border:0 solid rgba(167,139,250,.7);opacity:0;animation:' + P + '-hud .9s cubic-bezier(.2,.8,.2,1) forwards}',
    Q + '__hud i::after{content:"";position:absolute;width:5px;height:5px;background:var(--pearl);transform:rotate(45deg);box-shadow:0 0 10px var(--lv)}',
    Q + '__hud i:nth-child(1){top:0;right:0;border-top-width:2px;border-right-width:2px;animation-delay:.25s;transform:translate(26px,-26px)}',
    Q + '__hud i:nth-child(1)::after{top:-3px;right:-3px}',
    Q + '__hud i:nth-child(2){top:0;left:0;border-top-width:2px;border-left-width:2px;animation-delay:.33s;transform:translate(-26px,-26px)}',
    Q + '__hud i:nth-child(2)::after{top:-3px;left:-3px}',
    Q + '__hud i:nth-child(3){bottom:0;right:0;border-bottom-width:2px;border-right-width:2px;animation-delay:.41s;transform:translate(26px,26px)}',
    Q + '__hud i:nth-child(3)::after{bottom:-3px;right:-3px}',
    Q + '__hud i:nth-child(4){bottom:0;left:0;border-bottom-width:2px;border-left-width:2px;animation-delay:.49s;transform:translate(-26px,26px)}',
    Q + '__hud i:nth-child(4)::after{bottom:-3px;left:-3px}',
    '@keyframes ' + P + '-hud{to{opacity:1;transform:none}}',
    Q + '__side{position:absolute;top:50%;width:14px;height:min(34vh,300px);transform:translateY(-50%) scaleY(0);opacity:0;animation:' + P + '-side 1s .9s cubic-bezier(.2,.8,.2,1) forwards;',
    'background:repeating-linear-gradient(180deg,rgba(167,139,250,.55) 0 1px,transparent 1px 10px);',
    '-webkit-mask-image:linear-gradient(180deg,transparent,#000 30%,#000 70%,transparent);mask-image:linear-gradient(180deg,transparent,#000 30%,#000 70%,transparent)}',
    Q + '__side.l{left:max(18px,3.4vmin)}' + Q + '__side.r{right:max(18px,3.4vmin)}',
    Q + '__side::after{content:"";position:absolute;top:0;bottom:0;width:1px;background:linear-gradient(180deg,transparent,rgba(167,139,250,.8),transparent)}',
    Q + '__side.l::after{left:-6px}' + Q + '__side.r::after{right:-6px}',
    '@keyframes ' + P + '-side{to{opacity:1;transform:translateY(-50%) scaleY(1)}}',

    /* ── المسرح ── */
    Q + '__stage{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(6px,1.6vh,18px);padding:0 14px}',
    Q + '__rig{position:relative;width:var(--av);height:var(--av);margin-bottom:clamp(30px,6.4vh,64px);transform:translate(calc(var(--px)*8px),calc(var(--py)*6px))}',
    Q + '__core{position:absolute;inset:-34%;border-radius:50%;opacity:0;filter:blur(20px);',
    'background:conic-gradient(from 0deg,rgba(124,58,237,.0),rgba(167,139,250,.75),rgba(91,33,182,.0),rgba(248,247,252,.5),rgba(124,58,237,0));',
    'animation:' + P + '-fade 1s .6s forwards,' + P + '-spin 9s linear infinite}',
    Q + '__beam{position:absolute;left:50%;bottom:-8%;width:180%;height:270%;transform:translateX(-50%) scaleY(0);transform-origin:50% 100%;opacity:0;',
    'background:radial-gradient(closest-side,rgba(167,139,250,.36),transparent 70%);-webkit-mask-image:linear-gradient(0deg,#000 20%,transparent 92%);mask-image:linear-gradient(0deg,#000 20%,transparent 92%);animation:' + P + '-beam 1.1s .7s cubic-bezier(.2,.8,.2,1) forwards}',
    '@keyframes ' + P + '-beam{to{opacity:.9;transform:translateX(-50%) scaleY(1)}}',
    Q + '__svg{position:absolute;left:50%;top:50%;width:190%;height:190%;transform:translate(-50%,-50%);overflow:visible}',
    Q + '__svg .r{fill:none;stroke-linecap:round;transform-origin:200px 200px;transform-box:view-box}',
    Q + '__svg .r1{stroke:rgba(167,139,250,.55);stroke-width:1.2;stroke-dasharray:1200;stroke-dashoffset:1200;animation:' + P + '-draw 1.3s .75s cubic-bezier(.3,.7,.2,1) forwards}',
    Q + '__svg .r2{stroke:rgba(248,247,252,.85);stroke-width:2.2;stroke-dasharray:70 55;opacity:0;animation:' + P + '-fade .6s 1s forwards,' + P + '-spin 26s 1s linear infinite reverse}',
    Q + '__svg .r3{stroke:rgba(124,58,237,.9);stroke-width:5;stroke-dasharray:150 500;opacity:0;animation:' + P + '-fade .6s 1.1s forwards,' + P + '-spin 14s 1.1s linear infinite}',
    Q + '__svg .r4{stroke:rgba(167,139,250,.5);stroke-width:1.6;stroke-dasharray:1.5 9;opacity:0;animation:' + P + '-fade .8s 1.2s forwards,' + P + '-spin 60s 1.2s linear infinite}',
    Q + '__svg .r5{stroke:rgba(167,139,250,.35);stroke-width:1;stroke-dasharray:6 6;opacity:0;animation:' + P + '-fade .8s 1.3s forwards,' + P + '-spin 40s 1.3s linear infinite reverse}',
    Q + '__svg .hex{fill:none;stroke:rgba(167,139,250,.28);stroke-width:1;transform-origin:200px 200px;transform-box:view-box;opacity:0;animation:' + P + '-fade 1s 1.2s forwards,' + P + '-spin 50s linear infinite}',
    Q + '__svg .pbg{fill:none;stroke:rgba(167,139,250,.14);stroke-width:5}',
    Q + '__svg .prog{fill:none;stroke:url(#' + P + '-pg);stroke-width:5;stroke-linecap:round;transform:rotate(-90deg);transform-origin:200px 200px;transform-box:view-box;filter:drop-shadow(0 0 6px rgba(167,139,250,.95))}',
    Q + '__svg .tk{stroke:rgba(167,139,250,.28);stroke-width:1.6;transition:stroke .12s,filter .12s}',
    Q + '__svg .tk.on{stroke:#F8F7FC;filter:drop-shadow(0 0 3px #A78BFA)}',
    Q + '__svg .dm{fill:var(--pearl);opacity:0;animation:' + P + '-fade .5s 1.5s forwards}',
    Q + '__svg .orbit{transform-origin:200px 200px;transform-box:view-box;opacity:0;animation:' + P + '-fade .6s 1.6s forwards,' + P + '-spin 16s 1.6s linear infinite}',
    Q + '__svg .orbit.b{animation:' + P + '-fade .6s 1.7s forwards,' + P + '-spin 24s 1.7s linear infinite reverse}',
    Q + '__svg .orbit *{fill:var(--pearl);filter:drop-shadow(0 0 4px #A78BFA)}',
    '@keyframes ' + P + '-draw{to{stroke-dashoffset:0}}',
    Q + '__wing{position:absolute;top:50%;height:1px;width:clamp(30px,calc(50vw - var(--av)*1.05),360px);opacity:0;animation:' + P + '-wing 1s 1.3s cubic-bezier(.2,.8,.2,1) forwards}',
    Q + '__wing.l{right:calc(100% + var(--av)*.52);transform-origin:100% 50%;background:linear-gradient(270deg,rgba(167,139,250,.8),transparent)}',
    Q + '__wing.r{left:calc(100% + var(--av)*.52);transform-origin:0 50%;background:linear-gradient(90deg,rgba(167,139,250,.8),transparent)}',
    Q + '__wing::before,' + Q + '__wing::after{content:"";position:absolute;top:-3px;width:6px;height:6px;background:var(--pearl);transform:rotate(45deg);box-shadow:0 0 10px var(--lv)}',
    Q + '__wing.l::before{right:0}' + Q + '__wing.l::after{right:42%;width:4px;height:4px;top:-2px;opacity:.7}',
    Q + '__wing.r::before{left:0}' + Q + '__wing.r::after{left:42%;width:4px;height:4px;top:-2px;opacity:.7}',
    '@keyframes ' + P + '-wing{0%{opacity:0;transform:scaleX(0)}100%{opacity:1;transform:scaleX(1)}}',
    Q + '__plat{position:absolute;left:50%;bottom:-12%;width:160%;height:36%;transform:translateX(-50%);perspective:600px}',
    Q + '__plat b{position:absolute;left:50%;top:50%;border-radius:50%;border:1.5px solid rgba(167,139,250,.55);transform:translate(-50%,-50%) rotateX(72deg) scale(.2);opacity:0;animation:' + P + '-plat 1s cubic-bezier(.2,.8,.2,1) forwards}',
    Q + '__plat b:nth-child(1){width:100%;height:100%;animation-delay:.6s;box-shadow:0 0 24px rgba(124,58,237,.65),inset 0 0 24px rgba(124,58,237,.5)}',
    Q + '__plat b:nth-child(2){width:76%;height:76%;animation-delay:.72s;border-color:rgba(248,247,252,.7)}',
    Q + '__plat b:nth-child(3){width:132%;height:132%;animation-delay:.84s;border-color:rgba(124,58,237,.38);border-style:dashed}',
    Q + '__plat b:nth-child(4){width:56%;height:56%;animation-delay:.96s;border-color:rgba(167,139,250,.7);background:radial-gradient(closest-side,rgba(124,58,237,.35),transparent)}',
    '@keyframes ' + P + '-plat{to{opacity:1;transform:translate(-50%,-50%) rotateX(72deg) scale(1)}}',

    Q + '__av{position:absolute;inset:0;opacity:0;transform:scale(.4) translateY(30px);filter:blur(14px);animation:' + P + '-av .95s .8s cubic-bezier(.16,1.1,.3,1) forwards}',
    '@keyframes ' + P + '-av{60%{filter:blur(0)}100%{opacity:1;transform:none;filter:blur(0)}}',
    Q + '__av.hit{animation:' + P + '-av .95s .8s cubic-bezier(.16,1.1,.3,1) forwards,' + P + '-avp .8s cubic-bezier(.2,.9,.3,1)}',
    '@keyframes ' + P + '-avp{0%{transform:scale(1)}35%{transform:scale(1.07)}100%{transform:scale(1)}}',
    Q + '__glow{position:absolute;inset:-24%;border-radius:50%;background:radial-gradient(closest-side,rgba(124,58,237,.8),transparent 70%);animation:' + P + '-breath 2.6s 1.7s ease-in-out infinite;filter:brightness(calc(1 + var(--heat)*.6))}',
    Q + '__frame{position:absolute;inset:-10px;border-radius:50%;background:conic-gradient(from 0deg,#2b1556,#A78BFA,#F8F7FC,#7C3AED,#2b1556,#5B21B6,#A78BFA,#F8F7FC,#2b1556);animation:' + P + '-spin 6s linear infinite;box-shadow:0 0 44px rgba(124,58,237,.75)}',
    Q + '__gap{position:absolute;inset:-4px;border-radius:50%;background:var(--bk)}',
    Q + '__gap2{position:absolute;inset:-2px;border-radius:50%;border:1px solid rgba(167,139,250,.6)}',
    Q + '__img{position:absolute;inset:0;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 35% 30%,#4c1d95,#170B2D 70%)}',
    Q + '__img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .6s}',
    Q + '__img img.on{opacity:1}',
    Q + '__mono{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:calc(var(--av)*.46);color:var(--pearl);text-shadow:0 0 30px rgba(167,139,250,.9);transition:opacity .5s}',
    Q + '__img.has ' + Q + '__mono{opacity:0}',
    Q + '__gloss{position:absolute;inset:0;border-radius:50%;overflow:hidden;pointer-events:none;box-shadow:inset 0 0 30px rgba(11,4,28,.55)}',
    Q + '__gloss::before{content:"";position:absolute;top:-20%;bottom:-20%;width:38%;left:-60%;transform:skewX(-18deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:' + P + '-gloss 1.2s 1.7s ease-in-out 3}',
    Q + '__gloss::after{content:"";position:absolute;left:12%;right:12%;top:4%;height:34%;border-radius:50%;background:linear-gradient(180deg,rgba(255,255,255,.22),transparent)}',
    '@keyframes ' + P + '-gloss{to{left:140%}}',

    /* ── ميدالية 10K + العدّاد ── */
    Q + '__medal{position:absolute;left:50%;bottom:-27%;transform:translate(-50%,24px) scale(.6);opacity:0;display:flex;align-items:center;justify-content:center;',
    'animation:' + P + '-medal .8s 1.0s cubic-bezier(.2,1.25,.3,1) forwards;filter:drop-shadow(0 10px 22px rgba(11,4,28,.8)) drop-shadow(0 0 calc(10px + var(--heat)*26px) rgba(124,58,237,calc(.45 + var(--heat)*.45)))}',
    '@keyframes ' + P + '-medal{to{opacity:1;transform:translate(-50%,0) scale(1)}}',
    Q + '__medal.hit{animation:' + P + '-medal .8s 1.0s cubic-bezier(.2,1.25,.3,1) forwards,' + P + '-mp .9s cubic-bezier(.2,.9,.3,1)}',
    '@keyframes ' + P + '-mp{0%{scale:1}30%{scale:1.2}60%{scale:.97}100%{scale:1}}',
    Q + '__mfr{position:relative;min-width:calc(var(--av)*1.02);padding:calc(var(--av)*.028);border-radius:calc(var(--av)*.09);',
    'background:linear-gradient(135deg,#f8f7fc,#a78bfa 22%,#3b1a7a 48%,#c4b5fd 70%,#5b21b6);',
    'clip-path:polygon(7% 0,93% 0,100% 50%,93% 100%,7% 100%,0 50%)}',
    Q + '__min{position:relative;padding:calc(var(--av)*.045) calc(var(--av)*.12);text-align:center;direction:ltr;',
    'background:radial-gradient(120% 140% at 50% 0,#2a1160,#0d0620 70%);clip-path:polygon(7% 0,93% 0,100% 50%,93% 100%,7% 100%,0 50%);overflow:hidden}',
    Q + '__min::after{content:"";position:absolute;top:0;bottom:0;width:35%;left:-60%;transform:skewX(-20deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);animation:' + P + '-gloss 1.6s 2.2s ease-in-out 2}',
    Q + '__num{display:block;font-weight:900;font-size:calc(var(--av)*.2);line-height:1.1;font-variant-numeric:tabular-nums;letter-spacing:.04em;color:#cdbdfb;text-shadow:0 0 14px rgba(167,139,250,.7);transition:color .25s,text-shadow .25s}',
    Q + '__num.done{color:#fff;letter-spacing:.1em;text-shadow:0 0 22px #fff,0 0 46px #7C3AED}',
    Q + '__burst{position:absolute;left:50%;top:50%;width:40%;aspect-ratio:1;margin:-20% 0 0 -20%;border-radius:50%;border:2px solid #fff;opacity:0;pointer-events:none}',
    Q + '__burst.go{animation:' + P + '-bst .9s cubic-bezier(.1,.7,.3,1) forwards}',
    '@keyframes ' + P + '-bst{0%{opacity:.95;transform:scale(.4)}100%{opacity:0;transform:scale(7);border-width:.5px}}',

    /* ── النصوص ── */
    Q + '__txt{position:relative;text-align:center;line-height:1.15;display:flex;flex-direction:column;align-items:center;gap:clamp(2px,.9vh,10px);margin-top:clamp(2px,1.2vh,14px)}',
    Q + '__tglow{position:absolute;left:50%;top:44%;width:140%;height:150%;transform:translate(-50%,-50%) scale(.6);opacity:0;pointer-events:none;background:radial-gradient(closest-side,rgba(124,58,237,.5),transparent 72%);animation:' + P + '-tg 1.2s ' + HIT + ' cubic-bezier(.2,.8,.2,1) forwards}',
    '@keyframes ' + P + '-tg{to{opacity:1;transform:translate(-50%,-50%) scale(1)}}',
    Q + '__w{display:inline-block;overflow:hidden;padding:.28em .14em .24em;margin:-.28em -.14em -.24em}',
    Q + '__w>span{display:inline-block;transform:translateY(115%) rotate(4deg);opacity:0;animation:' + P + '-word .8s cubic-bezier(.16,1.05,.3,1) forwards;animation-delay:var(--d)}',
    '@keyframes ' + P + '-word{to{transform:none;opacity:1}}',
    Q + '__l1{position:relative;font-weight:900;font-size:clamp(46px,min(18vw,13.5vh),150px);',
    'filter:drop-shadow(0 .028em 0 #5b21b6) drop-shadow(0 .056em 0 #3b1a7a) drop-shadow(0 .09em 0 #170B2D) drop-shadow(0 .16em .22em rgba(7,4,13,.9)) drop-shadow(0 0 .35em rgba(124,58,237,.8));',
    'animation:' + P + '-imp .9s ' + d(.02) + ' cubic-bezier(.16,1.2,.3,1) both}',
    '@keyframes ' + P + '-imp{0%{transform:scale(1.28)}100%{transform:scale(1)}}',
    Q + '__l1 .g,' + Q + '__l2 .g{background-image:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.95) 50%,transparent 58%),linear-gradient(180deg,#ffffff 0%,#F8F7FC 46%,#b9a2fb 100%);background-size:260% 100%,100% 100%;background-position:130% 0,0 0;background-repeat:no-repeat;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;animation-name:' + P + '-word,' + P + '-sweep;animation-duration:.8s,1.5s;animation-delay:var(--d),calc(var(--d) + .9s);animation-fill-mode:forwards;animation-iteration-count:1,3}',
    '@keyframes ' + P + '-sweep{to{background-position:-40% 0,0 0}}',
    Q + '__l2{position:relative;display:flex;gap:.32em;justify-content:center;font-weight:800;font-size:clamp(26px,min(9.4vw,6.6vh),72px);filter:drop-shadow(0 .05em 0 #2b1160) drop-shadow(0 6px 22px rgba(91,33,182,.85))}',
    Q + '__base{position:relative;display:flex;align-items:center;justify-content:center;width:min(78vw,520px);height:10px;margin-top:-2px}',
    Q + '__base::before{content:"";position:absolute;left:0;right:0;top:50%;height:1px;transform:scaleX(0);background:linear-gradient(90deg,transparent,var(--lv) 25%,#fff 50%,var(--lv) 75%,transparent);animation:' + P + '-bar .9s ' + d(.7) + ' cubic-bezier(.2,.8,.2,1) forwards;box-shadow:0 0 14px var(--vl)}',
    Q + '__base i{position:relative;width:7px;height:7px;background:var(--pearl);transform:rotate(45deg) scale(0);box-shadow:0 0 12px var(--lv);animation:' + P + '-dm .5s ' + d(1.1) + ' forwards}',
    '@keyframes ' + P + '-bar{to{transform:scaleX(1)}}',
    '@keyframes ' + P + '-dm{to{transform:rotate(45deg) scale(1)}}',
    Q + '__rib{position:relative;margin-top:clamp(4px,1.2vh,12px);padding:.55em 1.9em .5em;font-weight:700;font-size:clamp(15px,min(4.7vw,3.2vh),30px);color:var(--pearl);max-width:94vw;text-align:center;',
    'background:linear-gradient(90deg,transparent,rgba(91,33,182,.6) 16%,rgba(124,58,237,.66) 50%,rgba(91,33,182,.6) 84%,transparent);',
    'clip-path:inset(0 50% 0 50%);opacity:0;animation:' + P + '-rib .9s ' + d(1.15) + ' cubic-bezier(.2,.8,.2,1) forwards}',
    Q + '__rib::before,' + Q + '__rib::after{content:"";position:absolute;left:6%;right:6%;height:1px;background:linear-gradient(90deg,transparent,var(--lv),#fff,var(--lv),transparent)}',
    Q + '__rib::before{top:0}' + Q + '__rib::after{bottom:0}',
    Q + '__rib span{position:relative;display:inline-block;opacity:0;transform:translateY(8px);animation:' + P + '-word .7s ' + d(1.45) + ' forwards;text-shadow:0 2px 14px rgba(11,4,28,.9)}',
    Q + '__rib u{position:absolute;top:0;bottom:0;width:22%;left:-30%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent);transform:skewX(-20deg);animation:' + P + '-gloss 1.6s ' + d(2.1) + ' ease-in-out 2;text-decoration:none}',
    '@keyframes ' + P + '-rib{to{opacity:1;clip-path:inset(0 0 0 0)}}',
    Q + '__user{display:flex;align-items:center;gap:.8em;direction:ltr;font-weight:800;letter-spacing:.24em;font-size:clamp(13px,min(3.8vw,2.7vh),23px);color:var(--lv);margin-top:clamp(2px,.8vh,8px);opacity:0;transform:translateY(8px);animation:' + P + '-word .7s ' + d(1.75) + ' forwards}',
    Q + '__user::before,' + Q + '__user::after{content:"";width:clamp(26px,9vw,90px);height:1px;background:linear-gradient(90deg,transparent,var(--lv));box-shadow:0 0 8px var(--vl)}',
    Q + '__user::after{transform:scaleX(-1)}',
    Q + '__user i{width:5px;height:5px;background:var(--lv);transform:rotate(45deg);box-shadow:0 0 8px var(--lv)}',
    Q + '__user b{color:var(--pearl);text-shadow:0 0 18px rgba(167,139,250,.95)}',

    /* ── موبايل / لاندسكيب قصير ── */
    '@media (max-width:560px){' + Q + '__hud{inset:10px}' + Q + '__svg .r3{stroke-width:4}' + Q + '__side{display:none}' + Q + '__grid{background-size:84px 84px,84px 84px,21px 21px,21px 21px}}',
    '@media (max-height:520px) and (orientation:landscape){' + Q + '{--av:clamp(96px,26vh,170px)}' + Q + '__rig{margin-bottom:clamp(22px,7vh,40px)}' + Q + '__stage{gap:2px}' + Q + '__l1{font-size:clamp(32px,12vh,80px)}' + Q + '__l2{font-size:clamp(18px,6vh,36px)}' + Q + '__base{display:none}}',
    '@media (prefers-reduced-motion:reduce){' + Q + '__rays,' + Q + '__rays2,' + Q + '__geo g,' + Q + '__frame,' + Q + '__svg .r2,' + Q + '__svg .r3,' + Q + '__svg .r4,' + Q + '__svg .r5,' + Q + '__svg .hex,' + Q + '__svg .orbit,' + Q + '__core,' + Q + '__scan,' + Q + '__floor{animation-duration:.01s!important;animation-iteration-count:1!important}}'
  ].join('');

  function injectCss() {
    if (document.getElementById(P + '-css')) return;
    var s = document.createElement('style');
    s.id = P + '-css';
    s.textContent = CSS;
    document.head.appendChild(s);
    if (!document.querySelector('link[href*="family=Cairo"]')) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@700;800;900&display=swap';
      document.head.appendChild(l);
    }
  }

  /* ───────────── DOM ───────────── */
  var TICKS = 60, PR = 124, PC = 2 * Math.PI * PR;

  function geoMarkup() {
    var hex = function (r, cx, cy) {
      var pts = [];
      for (var i = 0; i < 6; i++) { var a = Math.PI / 3 * i + Math.PI / 6; pts.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1)); }
      return pts.join(' ');
    };
    return '<svg class="' + P + '__geo" viewBox="0 0 1000 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<g class="g1"><rect x="190" y="90" width="620" height="620" fill="none" stroke="rgba(124,58,237,.30)" stroke-width="1.4" transform="rotate(45 500 400)"/></g>' +
      '<g class="g2"><rect x="80" y="-20" width="840" height="840" fill="none" stroke="rgba(167,139,250,.17)" stroke-width="1" stroke-dasharray="3 14" transform="rotate(22 500 400)"/></g>' +
      '<g class="g3"><polygon points="' + hex(430, 500, 400) + '" fill="none" stroke="rgba(167,139,250,.14)" stroke-width="1.2"/><polygon points="' + hex(320, 500, 400) + '" fill="none" stroke="rgba(124,58,237,.22)" stroke-width="1"/></g>' +
      '<line x1="0" y1="400" x2="1000" y2="400" stroke="rgba(167,139,250,.12)"/><line x1="500" y1="0" x2="500" y2="800" stroke="rgba(167,139,250,.08)"/>' +
      '</svg>';
  }

  function ringsMarkup() {
    var ticks = '';
    for (var i = 0; i < TICKS; i++) {
      var a = (i / TICKS) * Math.PI * 2 - Math.PI / 2, major = i % 5 === 0;
      var r0 = 132, r1 = major ? 149 : 142;
      ticks += '<line class="tk" x1="' + (200 + Math.cos(a) * r0).toFixed(2) + '" y1="' + (200 + Math.sin(a) * r0).toFixed(2) +
        '" x2="' + (200 + Math.cos(a) * r1).toFixed(2) + '" y2="' + (200 + Math.sin(a) * r1).toFixed(2) + '"/>';
    }
    var hexPts = [];
    for (var h = 0; h < 6; h++) { var ha = Math.PI / 3 * h; hexPts.push((200 + 196 * Math.cos(ha)).toFixed(1) + ',' + (200 + 196 * Math.sin(ha)).toFixed(1)); }
    return '<svg class="' + P + '__svg" viewBox="0 0 400 400" aria-hidden="true">' +
      '<defs><linearGradient id="' + P + '-pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C3AED"/><stop offset=".6" stop-color="#A78BFA"/><stop offset="1" stop-color="#F8F7FC"/></linearGradient></defs>' +
      '<polygon class="hex" points="' + hexPts.join(' ') + '"/>' +
      '<circle class="r r1" cx="200" cy="200" r="176"/>' +
      '<circle class="r r2" cx="200" cy="200" r="163"/>' +
      '<circle class="r r3" cx="200" cy="200" r="153"/>' +
      '<circle class="r r4" cx="200" cy="200" r="190"/>' +
      '<circle class="r r5" cx="200" cy="200" r="120"/>' +
      '<circle class="pbg" cx="200" cy="200" r="' + PR + '"/>' +
      '<circle class="prog" id="' + P + '-prog" cx="200" cy="200" r="' + PR + '" stroke-dasharray="' + PC.toFixed(2) + '" stroke-dashoffset="' + PC.toFixed(2) + '"/>' +
      '<g id="' + P + '-ticks">' + ticks + '</g>' +
      '<g class="orbit"><circle cx="200" cy="24" r="3.2"/><circle cx="200" cy="376" r="2.2"/><path d="M24 200l5-5 5 5-5 5z"/></g>' +
      '<g class="orbit b"><circle cx="376" cy="200" r="2.6"/><circle cx="52" cy="76" r="2"/><circle cx="348" cy="324" r="2"/></g>' +
      '<path class="dm" d="M200 4l8 9-8 9-8-9z"/><path class="dm" d="M200 378l8 9-8 9-8-9z"/>' +
      '<path class="dm" d="M4 200l9-8 9 8-9 8z"/><path class="dm" d="M378 200l9-8 9 8-9 8z"/>' +
      '</svg>';
  }

  function build() {
    var root = document.createElement('div');
    root.id = P; root.className = P;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-live', 'polite'); root.setAttribute('lang', 'ar');
    var vb = '';
    [8, 24, 50, 76, 92].forEach(function (x, i) { vb += '<div class="' + P + '__vb" style="left:' + x + '%;animation-delay:' + (i * .7) + 's"></div>'; });
    root.innerHTML = '' +
      '<div class="' + P + '__bg"></div><div class="' + P + '__grid"></div><div class="' + P + '__floor"></div>' +
      '<div class="' + P + '__rays"></div><div class="' + P + '__rays2"></div><div class="' + P + '__halo"></div>' + vb +
      geoMarkup() +
      '<canvas class="' + P + '__cv"></canvas><div class="' + P + '__scan"></div>' +
      '<div class="' + P + '__hud"><i></i><i></i><i></i><i></i></div>' +
      '<div class="' + P + '__side l"></div><div class="' + P + '__side r"></div>' +
      '<div class="' + P + '__stage">' +
        '<div class="' + P + '__rig">' +
          '<div class="' + P + '__core"></div><div class="' + P + '__beam"></div>' +
          '<div class="' + P + '__wing l"></div><div class="' + P + '__wing r"></div>' +
          '<div class="' + P + '__plat"><b></b><b></b><b></b><b></b></div>' +
          ringsMarkup() +
          '<div class="' + P + '__av" id="' + P + '-av">' +
            '<div class="' + P + '__glow"></div><div class="' + P + '__frame"></div><div class="' + P + '__gap"></div><div class="' + P + '__gap2"></div>' +
            '<div class="' + P + '__img" id="' + P + '-img"><span class="' + P + '__mono">S</span></div><div class="' + P + '__gloss"></div>' +
          '</div>' +
          '<div class="' + P + '__medal" id="' + P + '-medal"><div class="' + P + '__mfr"><div class="' + P + '__min"><span class="' + P + '__num" id="' + P + '-num">1</span></div></div><div class="' + P + '__burst" id="' + P + '-burst"></div></div>' +
        '</div>' +
        '<div class="' + P + '__txt">' +
          '<div class="' + P + '__tglow"></div>' +
          '<div class="' + P + '__l1"><span class="' + P + '__w"><span class="g" style="--d:' + d(.06) + '">' + MAIN_1 + '</span></span></div>' +
          '<div class="' + P + '__l2">' + MAIN_2.map(function (w, i) {
            return '<span class="' + P + '__w"><span class="g" style="--d:' + d(.38 + i * .12) + '">' + w + '</span></span>'; }).join('') + '</div>' +
          '<div class="' + P + '__base"><i></i></div>' +
          '<div class="' + P + '__rib"><span>' + SUB + '</span><u></u></div>' +
          '<div class="' + P + '__user"><i></i><b>' + TARGET_USER + '</b><i></i></div>' +
        '</div>' +
      '</div>' +
      '<div class="' + P + '__sweep"></div><div class="' + P + '__vig"></div>';
    return root;
  }

  function applyAvatar(root, url) {
    var box = root.querySelector('#' + P + '-img');
    if (!box || !url) return;
    var img = new Image(), stage = 0;
    img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.onload = function () { img.className = 'on'; box.appendChild(img); box.className += ' has'; };
    img.onerror = function () {
      if (stage === 0 && !/^data:/.test(url)) {
        stage = 1;
        img.src = 'https://images.weserv.nl/?url=' + encodeURIComponent(String(url).replace(/^https?:\/\//i, ''));
      }
    };
    img.src = url;
  }

  /* ───────────── Canvas: ضوء، جزيئات، انفجار ضوئي ───────────── */
  function startCanvas(root, reduced, getHitT) {
    var cv = root.querySelector('.' + P + '__cv'), ctx = cv.getContext('2d');
    var small = Math.min(window.innerWidth, window.innerHeight) < 600;
    var dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
    var W = 0, H = 0, cx = 0, cy = 0, raf = 0, t0 = performance.now(), alive = true;
    function size() {
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cx = W / 2;
      var rig = root.querySelector('.' + P + '__rig');
      if (rig) { var b = rig.getBoundingClientRect(); cy = b.top + b.height / 2; } else cy = H * .4;
    }
    size(); window.addEventListener('resize', size);
    setTimeout(size, 900);                       // بعد استقرار التخطيط
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function easeIn(x) { return x * x * x; }
    function easeOut(x) { return 1 - Math.pow(1 - x, 3); }

    var streaks = [], NS = small ? 18 : 32, i;
    for (i = 0; i < NS; i++) streaks.push({ a: (i / NS) * Math.PI * 2 + rnd(-.08, .08), len: rnd(.10, .26), d: rnd(0, .4), w: rnd(1, 2.6), c: Math.random() < .3 ? '248,247,252' : '167,139,250' });
    var motes = [], NM = small ? 40 : 84;
    for (i = 0; i < NM; i++) motes.push({ x: rnd(0, 1), y: rnd(0, 1), r: rnd(.6, 2.3), v: rnd(.012, .055), ph: rnd(0, 6.28), dx: rnd(-.01, .01), c: Math.random() < .25 ? '248,247,252' : '167,139,250' });
    var sparks = [], NSP = small ? 40 : 70;
    for (i = 0; i < NSP; i++) { var an = rnd(0, 6.2832); sparks.push({ a: an, v: rnd(260, 880), l: rnd(14, 64), w: rnd(.8, 2.2), c: Math.random() < .4 ? '248,247,252' : '167,139,250' }); }
    var pulses = [{ t: .95, big: 1 }, { t: T_HIT, big: 2 }, { t: T_HIT + .22, big: 0 }, { t: T_HIT + 1.6, big: 0 }];

    function frame(now) {
      if (!alive) return;
      var t = (now - t0) / 1000, hit = getHitT();
      var fadeOut = t > EXIT_AT / 1000 ? Math.max(0, 1 - (t - EXIT_AT / 1000) / .65) : 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fadeOut;
      var R = Math.hypot(W, H) * .6, s, k;

      for (s = 0; s < streaks.length; s++) {
        var st = streaks[s]; k = (t - st.d) / 1.0;
        if (k <= 0 || k >= 1) continue;
        var p = easeIn(k), r0 = R * (1 - p) + 40, r1 = r0 + st.len * R * (1 - p * .6);
        var x0 = cx + Math.cos(st.a) * r0, y0 = cy + Math.sin(st.a) * r0, x1 = cx + Math.cos(st.a) * r1, y1 = cy + Math.sin(st.a) * r1;
        var g = ctx.createLinearGradient(x0, y0, x1, y1), al = Math.sin(k * Math.PI) * .9;
        g.addColorStop(0, 'rgba(' + st.c + ',' + al + ')'); g.addColorStop(1, 'rgba(' + st.c + ',0)');
        ctx.strokeStyle = g; ctx.lineWidth = st.w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      var base = Math.min(W, H) * .16;
      for (var q = 0; q < pulses.length; q++) {
        var pu = pulses[q]; k = (t - pu.t) / 1.3;
        if (k <= 0 || k >= 1) continue;
        var rr = base + easeOut(k) * Math.max(W, H) * (pu.big === 2 ? .55 : pu.big ? .42 : .3);
        ctx.strokeStyle = 'rgba(' + (pu.big ? '248,247,252' : '167,139,250') + ',' + ((1 - k) * (pu.big === 2 ? .7 : pu.big ? .5 : .28)) + ')';
        ctx.lineWidth = (1 - k) * (pu.big === 2 ? 4 : 2.6) + .4;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.2832); ctx.stroke();
      }
      // انفجار ضوء عند 10,000
      if (hit != null) {
        var ht = (now - hit) / 1000;
        if (ht >= 0 && ht < 1.1) {
          var fa = Math.max(0, 1 - ht / .55) * .34;
          if (fa > 0) { var fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 3.4); fg.addColorStop(0, 'rgba(248,247,252,' + fa + ')'); fg.addColorStop(1, 'rgba(124,58,237,0)'); ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H); }
          for (s = 0; s < sparks.length; s++) {
            var sp = sparks[s], dist = sp.v * (1 - Math.pow(1 - Math.min(1, ht), 2.4)) * .9 + base * .9, al2 = Math.max(0, 1 - ht / 1.05);
            var ax = cx + Math.cos(sp.a) * dist, ay = cy + Math.sin(sp.a) * dist;
            var bx = cx + Math.cos(sp.a) * (dist - sp.l * al2), by = cy + Math.sin(sp.a) * (dist - sp.l * al2);
            var sg = ctx.createLinearGradient(bx, by, ax, ay);
            sg.addColorStop(0, 'rgba(' + sp.c + ',0)'); sg.addColorStop(1, 'rgba(' + sp.c + ',' + al2 + ')');
            ctx.strokeStyle = sg; ctx.lineWidth = sp.w; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ax, ay); ctx.stroke();
          }
        }
      }
      var fk = (t - .95) / .5;
      if (fk > 0 && fk < 1) {
        var fg2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 2.2);
        fg2.addColorStop(0, 'rgba(248,247,252,' + (.2 * (1 - fk)) + ')'); fg2.addColorStop(1, 'rgba(124,58,237,0)');
        ctx.fillStyle = fg2; ctx.fillRect(cx - base * 3, cy - base * 3, base * 6, base * 6);
      }
      var mk = Math.min(1, Math.max(0, (t - .5) / 1.2));
      for (var m = 0; m < motes.length; m++) {
        var o = motes[m]; o.y -= o.v * .016; o.x += o.dx * .016;
        if (o.y < -.02) { o.y = 1.02; o.x = Math.random(); }
        var tw = .5 + .5 * Math.sin(t * 2 + o.ph);
        ctx.fillStyle = 'rgba(' + o.c + ',' + (mk * (.25 + tw * .55)) + ')';
        ctx.beginPath(); ctx.arc(o.x * W, o.y * H, o.r, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    if (!reduced) raf = requestAnimationFrame(frame);
    return function stop() { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
  }

  /* ───────────── العدّاد 1 → 10,000 ───────────── */
  function startCounter(root, reduced, onHit) {
    var num = root.querySelector('#' + P + '-num'), prog = root.querySelector('#' + P + '-prog');
    var ticks = root.querySelectorAll('#' + P + '-ticks .tk');
    var start = performance.now() + (reduced ? 500 : T_COUNT0 * 1000), D = reduced ? 1 : (T_HIT - T_COUNT0) * 1000;
    var lit = 0, finished = false;
    function ease(k) { return k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
    function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    (function tick(now) {
      if (!root.isConnected || finished) return;
      var k = Math.min(1, Math.max(0, (now - start) / D)), e = ease(k);
      var v = Math.max(1, Math.round(1 + 9999 * e));
      num.textContent = fmt(v);
      prog.setAttribute('stroke-dashoffset', (PC * (1 - e)).toFixed(2));
      var want = Math.round(e * TICKS);
      if (want !== lit) { for (var i = 0; i < TICKS; i++) ticks[i].setAttribute('class', 'tk' + (i < want ? ' on' : '')); lit = want; }
      root.style.setProperty('--heat', (e * e).toFixed(3));
      if (k >= 1) {
        finished = true;
        num.textContent = '10K'; num.className = num.className + ' done';
        root.querySelector('#' + P + '-medal').className += ' hit';
        root.querySelector('#' + P + '-av').className += ' hit';
        var b = root.querySelector('#' + P + '-burst'); b.className += ' go';
        root.style.setProperty('--heat', '1');
        setTimeout(function () { root.style.setProperty('--heat', '.45'); }, 700);
        onHit(now);
        return;
      }
      requestAnimationFrame(tick);
    })(performance.now());
  }

  /* ───────────── التشغيل ───────────── */
  function play() {
    if (showing) return;
    showing = true;
    injectCss();
    var reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    var root = build();
    document.body.appendChild(root);
    var hitTime = null;
    var stopCanvas = startCanvas(root, reduced, function () { return hitTime; });
    startCounter(root, reduced, function (t) { hitTime = t; });

    if (avatarUrl) applyAvatar(root, avatarUrl);
    else if (avatarPromise) avatarPromise.then(function (u) { if (u && root.isConnected) applyAvatar(root, u); });

    function onMove(e) {
      root.style.setProperty('--px', ((e.clientX / window.innerWidth - .5) * 2).toFixed(3));
      root.style.setProperty('--py', ((e.clientY / window.innerHeight - .5) * 2).toFixed(3));
    }
    window.addEventListener('pointermove', onMove, { passive: true });

    var closed = false;
    function finish() {
      if (closed) return; closed = true;
      stopCanvas(); window.removeEventListener('pointermove', onMove);
      if (root.parentNode) root.parentNode.removeChild(root);
      showing = false;
    }
    function exit() {
      if (closed || root.classList.contains('is-out')) return;
      root.classList.add('is-out'); setTimeout(finish, 900);
    }
    var born = Date.now();
    root.addEventListener('click', function () { if (Date.now() - born > 1200) exit(); });
    setTimeout(exit, reduced ? 4200 : EXIT_AT);
    setTimeout(finish, DURATION + 1500);
  }

  /* ───────────── الربط بحدث نجاح الاتصال ───────────── */
  function install() {
    var fn = window.tiktokAttachAccountToGames;
    if (typeof fn !== 'function' || fn.__som3h) return !!(fn && fn.__som3h);
    var wrapped = function (username) {
      var out = fn.apply(this, arguments);
      try { onLinked(username); } catch (e) {}
      return out;
    };
    wrapped.__som3h = true;
    window.tiktokAttachAccountToGames = wrapped;
    return true;
  }
  if (!install()) {
    var tries = 0;
    var iv = setInterval(function () { if (install() || ++tries > 100) clearInterval(iv); }, 300);
  }

  window.Som3hCelebration = {
    _designPreview: function () { lastFire = 0; prefetchAvatar(); play(); },
    _onLinked: onLinked
  };
})();

