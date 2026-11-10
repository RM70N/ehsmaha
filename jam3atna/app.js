// جمعتنا — منطق الواجهة: القسم، تجهيز اللعبة، الغرفة (مضيف/لاعب)، الانضمام، وتحميل اللعبة عند الحاجة فقط.
import { createNet, loadSession, saveSession } from './net.js';
import { cityArt, propArt, heroArt, avatarSvg, observeArt } from './art.js';
import { sfx, sound } from './shared/audio.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = $('#j3'), main = $('#j3-main'), gameEl = $('#j3-game'), modalEl = $('#j3-modal'), toastEl = $('#j3-toast');
const IC = {
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.6a3.5 3.5 0 010 6.8M18 14.5a6 6 0 013.5 5.5"/></svg>',
  cube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3z"/><path d="M3.5 7.3L12 12l8.5-4.7M12 12v9.5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  mask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6c3 1.5 6 1.5 9 0 3 1.5 6 1.5 9 0v5c0 5-4 8-9 8s-9-3-9-8z"/><path d="M7.5 11.5h3M13.5 11.5h3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  copy: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 017.5 4H15"/></svg>',
  link: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
};
export const GAMES = {
  city: {
    name: 'المدينة المصغّرة', line: 'مدينة مليانة أسرار... دقّق، اكتشف، واسبق الكل!', tag: 'مدينة حيّة مصغّرة', art: cityArt, module: './games/tiny-city.js', min: 4, max: 20,
    meta: [['users', '4 إلى 20 لاعبًا'], ['cube', '3D'], ['eye', 'ملاحظة وسرعة'], ['clock', 'من 3 إلى 6 دقائق']],
    rules: ['شاشة المضيف تعرض المدينة، وكل لاعب يستكشفها من جواله بالسحب والتكبير.', 'كل جولة توصلك مهمة: دوّر على هدف، تابع شخص، اكشف مخالفة، أو لاحظ وش اللي تغيّر.', 'حدد الهدف بالضغط عليه ثم أكّد. الصح 100 نقطة، وأول واحد بالمهمة المشتركة +50، وقبل نص الوقت +25.', 'الغلط يخصم 25 نقطة، ولك 3 محاولات بكل مهمة.', 'بعد آخر جولة يفوز الأعلى نقاطًا، ولو تعادلوا على الأول فيه تحدي فاصل.'],
    opts: [{ k: 'rounds', label: 'عدد الجولات', vals: [3, 4, 5, 6, 7] }, { k: 'missionSec', label: 'مدة المهمة', vals: [30, 45, 60], fmt: (v) => v + ' ثانية' }, { k: 'knockout', label: 'خروج المغلوب (كل جولتين)', vals: [false, true], fmt: (v) => (v ? 'مفعّل' : 'موقّف') }],
    defaults: { rounds: 5, missionSec: 45, knockout: false },
  },
  prop: {
    name: 'مين المتنكر؟', line: 'قدامك كرسي... بس متأكد إنه كرسي؟', tag: 'تخفّي ومطاردة', art: propArt, module: './games/prop-party.js', min: 4, max: 16,
    meta: [['users', '4 إلى 16 لاعبًا'], ['cube', '3D'], ['mask', 'تخفي وخداع'], ['clock', 'من 3 إلى 5 دقائق']],
    rules: ['ينقسم اللاعبون: متنكرين يتحولون لأغراض وأثاث، ومفتشين يدورون عليهم.', 'للمتنكرين 25 ثانية يختبون فيها قبل ما تنفتح بوابة المفتشين.', 'المتنكر يتحرك، يثبّت نفسه، يبدّل شكله لغرض قريب كل 40 ثانية، ويرمي طعم يلخبط المفتشين.', 'المفتش له 5 محاولات فحص: الصح +75 ويرجّع محاولة، والغلط يخصم محاولة و15 نقطة. وعنده رادار يعطي تلميح مو موقع دقيق.', 'يفوز المفتشين لو كشفوا الكل، ويفوز المتنكرين لو خلص الوقت أو خلصت محاولات المفتشين.'],
    opts: [{ k: 'rounds', label: 'عدد الجولات', vals: [2, 3, 4, 5, 6] }, { k: 'seekSec', label: 'مدة البحث', vals: [120, 180, 240, 300], fmt: (v) => v / 60 + ' دقايق' }, { k: 'map', label: 'الخريطة', vals: ['rotate', 'market', 'school', 'palace', 'funland'], fmt: (v) => ({ rotate: 'تتبدل كل جولة', market: 'السوبرماركت', school: 'المدرسة', palace: 'القصر', funland: 'مدينة الألعاب' }[v]) }],
    defaults: { rounds: 4, seekSec: 180, map: 'rotate' },
  },
};
const ERR = {
  not_found: 'ما لقينا غرفة بهذا الكود. تأكد منه وجرّب مرة ثانية.', full: 'الغرفة مليانة، ما فيه مكان فاضي.', started: 'المباراة بدأت خلاص. انتظر المضيف يسوّي مباراة جديدة وادخل.',
  name_taken: 'فيه لاعب بنفس الاسم داخل الغرفة، اختر اسم ثاني.', bad_name: 'اكتب اسم من حرفين على الأقل.', slow_down: 'محاولات كثيرة، انتظر دقيقة وجرّب.', busy: 'الخادم مشغول حاليًا، جرّب بعد شوي.', need_players: 'العدد ما يكفي للبدء.',
};
const st = { view: 'hub', game: null, room: null, me: null, pending: { city: { ...GAMES.city.defaults }, prop: { ...GAMES.prop.defaults } }, inst: null, gq: [], joinCode: '', loading: false };
const net = createNet();

// ------------------------------------------------------------------ أدوات عامة
export function toast(msg, ms = 2600) { const d = document.createElement('div'); d.textContent = msg; toastEl.appendChild(d); setTimeout(() => d.remove(), ms); }
function modal(html, onMount) {
  modalEl.innerHTML = `<div class="j3-dialog" role="dialog" aria-modal="true">${html}</div>`; modalEl.hidden = false;
  const close = () => { modalEl.hidden = true; modalEl.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey); modalEl.onclick = (e) => { if (e.target === modalEl || e.target.closest('[data-close]')) close(); };
  if (onMount) onMount(modalEl.firstElementChild, close); const f = modalEl.querySelector('input,button'); if (f) f.focus();
  return close;
}
async function copy(text, okMsg) {
  try { await navigator.clipboard.writeText(text); } catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (er) {} t.remove(); }
  toast(okMsg); sfx.tap();
}
const inviteUrl = (code) => location.origin + location.pathname.replace(/index\.html$/, '') + '?r=' + code + (new URLSearchParams(location.search).get('srv') ? '&srv=' + encodeURIComponent(new URLSearchParams(location.search).get('srv')) : '');
function setView(v, game) { st.view = v; root.dataset.view = v; if (game !== undefined) { st.game = game; if (game) root.dataset.game = game; else delete root.dataset.game; } window.scrollTo(0, 0); }
function knownName() {
  try { const n = localStorage.getItem('j3:name'); if (n) return n; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('ehsAuthUname:') === 0) return localStorage.getItem(k) || ''; } } catch (e) {}
  return '';
}
const metaList = (g) => `<ul class="j3-meta">${g.meta.map(([i, t]) => `<li>${IC[i]}${esc(t)}</li>`).join('')}</ul>`;

// ------------------------------------------------------------------ القسم الرئيسي
function viewHub() {
  setView('hub', null);
  const card = (id) => { const g = GAMES[id]; return `
    <article class="j3-card j3-card-${id}" data-game="${id}">
      <div class="j3-card-art">${g.art()}<span class="j3-tagline">${esc(g.tag)}</span></div>
      <div class="j3-card-body"><h3>${esc(g.name)}</h3><p class="j3-card-line">«${esc(g.line)}»</p>${metaList(g)}
        <div class="j3-card-cta"><button type="button" class="j3-btn j3-btn-main" data-play="${id}">${IC.play}العب الآن</button><button type="button" class="j3-btn j3-btn-ghost" data-how="${id}">كيف تلعب؟</button></div>
      </div></article>`; };
  main.innerHTML = `
    <section class="j3-hero">
      <div class="j3-hero-copy j3-in">
        <span class="j3-kicker"><i></i>قسم جديد · ألعاب جماعية من جوالاتكم</span>
        <h1 class="j3-h1"><span>جمعتنا</span></h1>
        <p class="j3-tag">جمعتك صارت أحلى... كل واحد بجواله، والحماس يجمعكم!</p>
        <p class="j3-lead">سوّ غرفة، شارك الكود مع أصحابك، وابدؤوا التحدي من أجهزتكم. ألعاب جماعية ثلاثية الأبعاد، فيها منافسة وضحك وحماس.</p>
        <div class="j3-cta"><button type="button" class="j3-btn j3-btn-main" id="j3-explore">استكشف الألعاب</button><button type="button" class="j3-btn j3-btn-ghost" id="j3-have-code">عندك كود؟ ادخل هنا</button></div>
      </div>
      <div class="j3-hero-art" id="j3-hero-art">${heroArt()}</div>
    </section>
    <section id="j3-games" aria-label="الألعاب">
      <div class="j3-sec-h"><h2>اختر لعبتكم</h2><p>بدون تحميل ولا تسجيل — المضيف يفتح الغرفة والباقي يدخلون بالكود أو الباركود.</p></div>
      <div class="j3-cards">${card('city')}${card('prop')}</div>
    </section>`;
  observeArt(main);
  $('#j3-explore').onclick = () => { sfx.tap(); $('#j3-games').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
  $('#j3-have-code').onclick = () => go('#/join');
  main.querySelectorAll('[data-play]').forEach((b) => { b.onclick = () => go('#/' + b.dataset.play); });
  main.querySelectorAll('[data-how]').forEach((b) => { b.onclick = () => howTo(b.dataset.how); });
  main.querySelectorAll('.j3-card').forEach((c) => { c.addEventListener('click', (e) => { if (!e.target.closest('button')) go('#/' + c.dataset.game); }); });
  const art = $('#j3-hero-art');
  if (matchMedia('(hover:hover) and (pointer:fine)').matches) $('.j3-hero').addEventListener('pointermove', (e) => { const r = art.getBoundingClientRect(); art.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3)); art.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3)); });
}
function howTo(id) { const g = GAMES[id]; sfx.tap(); modal(`<h3>كيف تلعب «${esc(g.name)}»؟</h3><ol class="j3-rules">${g.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol><div class="j3-row" style="margin-top:18px"><button class="j3-btn j3-btn-main" data-close data-go="${id}">يلا نلعب</button><button class="j3-btn j3-btn-ghost" data-close>فهمت</button></div>`, (d) => { d.querySelector('[data-go]').addEventListener('click', () => go('#/' + id)); }); }

function optsHtml(id, values, editable) {
  return `<div class="j3-opts">${GAMES[id].opts.map((o) => `<div class="j3-opt"><span>${esc(o.label)}</span><div class="j3-seg" data-k="${o.k}">${o.vals.map((v) => `<button type="button" data-v='${JSON.stringify(v)}' aria-pressed="${values[o.k] === v}" ${editable ? '' : 'disabled'}>${esc(o.fmt ? o.fmt(v) : v)}</button>`).join('')}</div></div>`).join('')}</div>`;
}
function bindOpts(el, onChange) { el.querySelectorAll('.j3-seg button:not([disabled])').forEach((b) => { b.onclick = () => { sfx.tap(); onChange(b.parentNode.dataset.k, JSON.parse(b.dataset.v)); }; }); }

// ------------------------------------------------------------------ صفحة تجهيز اللعبة
function viewSetup(id) {
  const g = GAMES[id]; setView('setup', id);
  const draw = () => {
    main.innerHTML = `<div class="j3-setup">
      <div class="j3-in"><div class="j3-setup-art">${g.art()}</div>
        <div class="j3-panel" style="margin-top:18px"><h3 style="margin:0 0 12px;font-size:20px">القواعد بسرعة</h3><ol class="j3-rules">${g.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol></div></div>
      <div class="j3-panel j3-in"><h1 class="j3-h2">${esc(g.name)}</h1><p class="j3-sub">«${esc(g.line)}»</p>${metaList(g)}
        <h3 style="margin:14px 0 0;font-size:17px">إعدادات الجولة</h3>${optsHtml(id, st.pending[id], true)}
        <div class="j3-row" style="justify-content:stretch;margin-top:18px"><button type="button" class="j3-btn j3-btn-main" id="j3-create" style="flex:1">سوّ غرفة</button><button type="button" class="j3-btn j3-btn-ghost" id="j3-bycode">ادخل بكود</button></div>
        <p class="j3-sub" style="margin:14px 0 0;font-size:14px">افتح الغرفة على شاشة كبيرة (كمبيوتر أو تلفزيون) عشان الكل يشوف، واللاعبين يدخلون من جوالاتهم.</p>
      </div></div>`;
    observeArt(main); bindOpts(main, (k, v) => { st.pending[id][k] = v; draw(); });
    $('#j3-bycode').onclick = () => go('#/join');
    $('#j3-create').onclick = async (e) => {
      const b = e.currentTarget; if (b.disabled) return; b.disabled = true; b.textContent = 'نجهّز الغرفة...'; sfx.tap();
      const t = setTimeout(() => { b.textContent = 'الخادم يصحى... لحظات'; }, 4000);
      await net.connect(); clearTimeout(t); net.send({ t: 'create', game: id, plays: true, name: knownName() || 'المضيف', avatar: String(Math.floor(Math.random() * 12)) });
    };
  };
  draw();
}

// ------------------------------------------------------------------ الانضمام
function viewJoin(code) {
  setView('join', null); st.joinCode = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  let avatar = String(Math.floor(Math.random() * 12)); let peek = null; let err = '';
  const draw = () => {
    if (!peek) {
      main.innerHTML = `<div class="j3-join j3-in"><div><h1 class="j3-h2">ادخل الغرفة</h1><p class="j3-sub">اكتب الكود اللي على شاشة المضيف (6 خانات).</p></div>
        <form class="j3-panel" id="j3-codeform"><label class="j3-label" for="j3-codein">كود الغرفة</label><input id="j3-codein" class="j3-codein" inputmode="latin" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="6" value="${esc(st.joinCode)}" placeholder="A7K9P2">
          ${err ? `<p class="j3-err" style="margin-top:12px">${esc(err)}</p>` : ''}<button class="j3-btn j3-btn-main" style="width:100%;margin-top:14px">التالي</button></form>
        <button type="button" class="j3-btn j3-btn-quiet" id="j3-jback">رجوع للألعاب</button></div>`;
      const inp = $('#j3-codein'); inp.oninput = () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
      $('#j3-jback').onclick = () => go('#/');
      $('#j3-codeform').onsubmit = async (e) => { e.preventDefault(); st.joinCode = inp.value; if (st.joinCode.length !== 6) { err = 'الكود لازم 6 خانات.'; return draw(); } err = ''; await net.connect(); net.send({ t: 'peek', code: st.joinCode }); };
      return;
    }
    const g = GAMES[peek.game];
    main.innerHTML = `<div class="j3-join j3-in"><div><h1 class="j3-h2">${esc(g.name)}</h1><p class="j3-sub">غرفة <b dir="ltr">${esc(peek.code)}</b> · ${peek.count} من ${peek.max} لاعب</p></div>
      <form class="j3-panel" id="j3-nameform"><label class="j3-label" for="j3-name">اسمك داخل اللعبة</label><input id="j3-name" class="j3-input" maxlength="16" autocomplete="nickname" value="${esc(knownName())}" placeholder="مثال: أبو فهد">
        <span class="j3-label" style="margin-top:16px">اختر شكلك</span><div class="j3-avs">${Array.from({ length: 12 }, (_, i) => `<button type="button" data-av="${i}" aria-pressed="${String(i) === avatar}" aria-label="شكل ${i + 1}">${avatarSvg(i)}</button>`).join('')}</div>
        ${err ? `<p class="j3-err" style="margin-top:12px">${esc(err)}</p>` : ''}<button class="j3-btn j3-btn-main" style="width:100%;margin-top:16px">ادخل الغرفة</button></form>
      <button type="button" class="j3-btn j3-btn-quiet" id="j3-jback">كود ثاني</button></div>`;
    main.querySelectorAll('[data-av]').forEach((b) => { b.onclick = () => { avatar = b.dataset.av; main.querySelectorAll('[data-av]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); sfx.tap(); }; });
    $('#j3-jback').onclick = () => { peek = null; err = ''; draw(); };
    $('#j3-nameform').onsubmit = async (e) => { e.preventDefault(); const name = $('#j3-name').value.trim(); try { localStorage.setItem('j3:name', name); } catch (er) {} await net.connect(); net.send({ t: 'join', code: peek.code, name, avatar }); };
  };
  st.joinUi = { onPeek: (m) => { if (m.phase !== 'lobby') { err = ERR.started; peek = null; } else if (m.count >= m.max) { err = ERR.full; peek = null; } else { peek = m; err = ''; } draw(); }, onErr: (m) => { err = ERR[m.code] || 'صار خطأ، جرّب مرة ثانية.'; if (m.code === 'not_found' || m.code === 'started' || m.code === 'full') peek = null; draw(); } };
  draw();
  if (st.joinCode.length === 6) net.connect().then(() => net.send({ t: 'peek', code: st.joinCode }));
}

// ------------------------------------------------------------------ الغرفة (مضيف / لاعب)
function qrSvg(text) { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }
function playersHtml(room, host) {
  if (!room.players.length) return `<li class="j3-empty"><span>بانتظار اللاعبين...</span><small>صوّروا الباركود أو اكتبوا الكود</small></li>`;
  return room.players.map((p) => `<li class="j3-player ${p.ready ? 'is-ready' : ''} ${p.on ? '' : 'is-off'} ${st.me && p.id === st.me.id ? 'is-me' : ''}" data-id="${p.id}"><span class="av">${avatarSvg(p.avatar)}</span><span style="min-width:0"><span class="nm" style="display:block">${esc(p.name)}</span><span class="st">${!p.on ? 'انقطع... ننتظره' : p.ready ? 'جاهز' : 'مو جاهز'}</span></span>${host ? `<button type="button" class="kick" data-kick="${p.id}" aria-label="طرد ${esc(p.name)}">${IC.x}</button>` : ''}</li>`).join('');
}
function viewLobby() {
  const room = st.room; const g = GAMES[room.game]; const host = st.me.host; setView(host ? 'lobby-host' : 'lobby-player', room.game);
  const n = room.players.length; const enough = n >= room.min;
  if (host) {
    const url = inviteUrl(room.code);
    main.innerHTML = `<div class="j3-lobby">
      <div class="j3-panel j3-ticket"><p class="j3-sub" style="margin:8px 0 0;font-weight:800;color:var(--text)">صوّر الباركود وادخل</p><div class="j3-qr" id="j3-qr">${qrSvg(url)}</div>
        <p class="j3-sub" style="margin:0">أو اكتب الكود في <b dir="ltr">ehsmaha.com/jam3atna</b></p><div class="j3-code" aria-label="كود الغرفة ${room.code}">${room.code.split('').map((c) => `<b>${c}</b>`).join('')}</div>
        <div class="j3-row"><button type="button" class="j3-btn j3-btn-ghost j3-btn-sm" id="j3-copy-code">${IC.copy}نسخ الكود</button><button type="button" class="j3-btn j3-btn-ghost j3-btn-sm" id="j3-copy-link">${IC.link}نسخ رابط الدعوة</button></div></div>
      <div class="j3-panel"><div class="j3-lobby-art">${g.art()}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h1 class="j3-h2" style="font-size:clamp(22px,3vw,30px);margin:0">${esc(g.name)}</h1><div class="j3-count"><b id="j3-n">${n}</b><span>من ${room.max} لاعب</span></div></div>
        <ul class="j3-players" id="j3-players">${playersHtml(room, true)}</ul>
        <p class="j3-need ${enough ? 'ok' : ''}" id="j3-need">${enough ? 'العدد كافي — تقدر تبدأ متى ما تبي.' : `باقي ${room.min - n} لاعب على الأقل عشان تبدأ (الحد الأدنى ${room.min}).`}</p>
        <label class="j3-hostplay"><input type="checkbox" id="j3-hostplay" ${st.me.plays ? 'checked' : ''}><span>أبي ألعب معهم من هذا الجهاز</span></label>
        ${optsHtml(room.game, room.settings, true)}
        <div class="j3-row" style="justify-content:stretch;margin-top:16px"><button type="button" class="j3-btn j3-btn-main" id="j3-start" style="flex:1" ${enough ? '' : 'disabled'}>${IC.play}ابدأ اللعبة</button><button type="button" class="j3-btn j3-btn-danger" id="j3-cancel">إلغاء الغرفة</button></div></div></div>`;
    observeArt(main);
    $('#j3-copy-code').onclick = () => copy(room.code, 'انتسخ الكود'); $('#j3-copy-link').onclick = () => copy(url, 'انتسخ رابط الدعوة');
    bindOpts(main, (k, v) => net.send({ t: 'settings', s: { [k]: v } }));
    $('#j3-hostplay').onchange = (e) => net.send({ t: 'hostplay', v: e.target.checked, name: knownName() || 'المضيف' });
    $('#j3-start').onclick = () => { sfx.go(); net.send({ t: 'start' }); };
    $('#j3-cancel').onclick = () => modal(`<h3>تلغي الغرفة؟</h3><p class="j3-sub">كل اللاعبين بيطلعون من الغرفة.</p><div class="j3-row"><button class="j3-btn j3-btn-danger" data-close id="j3-yes">إلغاء الغرفة</button><button class="j3-btn j3-btn-ghost" data-close>لا، خلّها</button></div>`, (d) => { d.querySelector('#j3-yes').addEventListener('click', () => net.send({ t: 'cancel' })); });
    main.querySelectorAll('[data-kick]').forEach((b) => { b.onclick = () => net.send({ t: 'kick', id: b.dataset.kick }); });
  } else {
    const me = room.players.find((p) => p.id === st.me.id) || { name: '', ready: false, avatar: '0' };
    main.innerHTML = `<div class="j3-join">
      <div class="j3-panel j3-okbox"><span class="tick">${IC.check}</span><h1 class="j3-h2" style="margin:0">دخلت الغرفة يا ${esc(me.name)}</h1><p class="j3-sub" style="margin:0">${esc(g.name)} · غرفة <b dir="ltr">${esc(room.code)}</b></p>
        <button type="button" class="j3-btn j3-btn-main j3-ready" id="j3-ready" aria-pressed="${me.ready}">${me.ready ? 'جاهز — ننتظر المضيف' : 'أنا جاهز'}</button></div>
      <div class="j3-panel"><div class="j3-count"><b>${n}</b><span>من ${room.max} لاعب${room.hostOn ? '' : ' · المضيف انقطع، ننتظره'}</span></div><ul class="j3-players">${playersHtml(room, false)}</ul></div>
      <button type="button" class="j3-btn j3-btn-quiet" id="j3-leave">اطلع من الغرفة</button></div>`;
    $('#j3-ready').onclick = () => { sfx.ready(); net.send({ t: 'ready', v: !me.ready }); };
    $('#j3-leave').onclick = () => { net.send({ t: 'leave' }); };
  }
}

// ------------------------------------------------------------------ تحميل وتشغيل اللعبة (كسول)
const THREE_URLS = ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js', 'https://unpkg.com/three@0.128.0/build/three.min.js'];
function loadThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  return THREE_URLS.reduce((p, u) => p.catch(() => new Promise((res, rej) => { const s = document.createElement('script'); s.src = u; s.onload = () => (window.THREE ? res(window.THREE) : rej()); s.onerror = () => { s.remove(); rej(); }; document.head.appendChild(s); })), Promise.reject());
}
async function mountGame() {
  if (st.inst || st.loading) return; st.loading = true; const room = st.room; setView('game', room.game);
  main.innerHTML = ''; gameEl.hidden = false; gameEl.innerHTML = `<div class="g-wait"><div><h3>${esc(GAMES[room.game].name)}</h3><p>نحمّل عالم اللعبة...</p></div></div>`;
  try {
    const [THREE, mod] = await Promise.all([loadThree(), import(GAMES[room.game].module)]);
    if (!st.room || st.room.phase === 'lobby') { st.loading = false; gameEl.hidden = true; return; }
    gameEl.innerHTML = '';
    st.inst = mod.mount({ el: gameEl, THREE, net, me: st.me, room: () => st.room, isHost: st.me.host && !st.me.plays, toast, again: () => net.send({ t: 'again' }), exit: leaveRoom });
    const q = st.gq; st.gq = []; q.forEach((d) => st.inst.onMsg(d));
    if (!st.me.host || st.me.plays) { const xb = document.createElement('button'); xb.type = 'button'; xb.className = 'g-exit'; xb.setAttribute('aria-label', 'خروج'); xb.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg><span>خروج</span>';
      xb.onclick = () => modal(`<h3>${st.me.host ? 'تطلع من اللعب؟' : 'تطلع من الغرفة؟'}</h3><p class="j3-sub">${st.me.host ? 'تكمل الغرفة بدونك وتشوفها كشاشة مشاهدة.' : 'ما تقدر ترجع لنفس الجولة.'}</p><div class="j3-row"><button class="j3-btn j3-btn-danger" data-close id="j3-xyes">اطلع</button><button class="j3-btn j3-btn-ghost" data-close>كمّل لعب</button></div>`, (d) => { d.querySelector('#j3-xyes').addEventListener('click', () => net.send({ t: st.me.host ? 'hostquit' : 'leave' })); });
      gameEl.appendChild(xb); }
  } catch (e) {
    console.error('[جمعتنا] فشل تحميل اللعبة', e); gameEl.innerHTML = `<div class="g-wait"><div><h3>تعذّر تحميل اللعبة</h3><p>تأكد من الاتصال وحدّث الصفحة.</p></div></div>`;
  }
  st.loading = false;
}
function unmountGame() { if (st.inst) { try { st.inst.unmount(); } catch (e) { console.error(e); } st.inst = null; } st.gq = []; gameEl.hidden = true; gameEl.innerHTML = ''; }
function leaveRoom() { net.send({ t: st.me && st.me.host ? 'cancel' : 'leave' }); }
function resetToHub(msg) { unmountGame(); st.room = null; st.me = null; saveSession(null); net.session = null; if (msg) toast(msg, 4200); if (location.hash && location.hash !== '#/') history.replaceState(null, '', location.pathname + location.search.replace(/[?&]r=[^&]*/, '')); viewHub(); }

// ------------------------------------------------------------------ رسائل الخادم
net.on('joined', (m) => { st.me = m.you; if (!m.rejoin) sfx.join(); });
net.on('you', (m) => { if (!st.me) return; const was = !!st.me.plays; st.me.plays = !!m.plays; if (m.name) st.me.name = m.name; if (was && !st.me.plays && st.inst) { unmountGame(); mountGame(); } else if (st.room && st.room.phase === 'lobby') viewLobby(); });
net.on('room', (m) => {
  const prev = st.room; st.room = m;
  if (!st.me) return;
  if (m.phase === 'lobby') { if (st.inst || st.view === 'game') unmountGame(); if (prev && prev.phase === 'lobby' && m.players.length > prev.players.length) sfx.join(); viewLobby(); }
  else if (!st.inst) mountGame();
  else if (st.inst.onRoom) st.inst.onRoom(m);
});
net.on('g', (m) => { if (st.inst) st.inst.onMsg(m.d); else st.gq.push(m.d); });
net.on('peek', (m) => { if (st.joinUi) st.joinUi.onPeek(m); });
net.on('error', (m) => {
  if (st.view === 'join' && st.joinUi) return st.joinUi.onErr(m);
  if (m.code === 'need_players') return toast(`العدد ما يكفي — تحتاجون ${m.min} لاعبين على الأقل.`);
  toast(ERR[m.code] || 'صار خطأ، جرّب مرة ثانية.'); if (st.view === 'setup') viewSetup(st.game);
});
net.on('closed', (m) => resetToHub({ cancelled: 'المضيف ألغى الغرفة.', host_left: 'المضيف طلع وانتهت الغرفة.', idle: 'انتهت الغرفة لعدم النشاط.', server: 'الخادم يتحدّث، سوّوا غرفة جديدة.' }[m.why] || 'انتهت الغرفة.'));
net.on('removed', (m) => resetToHub(m.why === 'kicked' ? 'المضيف طلّعك من الغرفة.' : m.why === 'timeout' ? 'طلعت من الغرفة لانقطاع الاتصال.' : 'طلعت من الغرفة.'));
net.on('replaced', () => { unmountGame(); st.room = null; st.me = null; main.innerHTML = `<div class="j3-join"><div class="j3-panel j3-okbox"><h1 class="j3-h2">انفتحت اللعبة بتبويب ثاني</h1><p class="j3-sub">هذا التبويب توقف. كمّل من التبويب الجديد.</p></div></div>`; net.close(); });
net.on('lost', () => resetToHub('الغرفة السابقة انتهت.'));
net.on('state', (s) => { const c = $('#j3-conn'); c.hidden = s === 'open' || s === 'idle'; c.textContent = s === 'reconnecting' ? 'انقطع الاتصال... نحاول' : 'جاري الاتصال...'; });

// ------------------------------------------------------------------ التنقل
function go(hash) { sfx.tap(); if (location.hash === hash) route(); else location.hash = hash; }
function route() {
  if (st.room && st.me) return; // داخل غرفة: الواجهة تتبع حالة الغرفة لا الرابط
  const h = location.hash.replace(/^#\/?/, '');
  if (h === 'city' || h === 'prop') return viewSetup(h);
  if (h === 'join') return viewJoin('');
  viewHub();
}
window.addEventListener('hashchange', route);
$('#j3-brand').onclick = () => { if (st.room && st.me) return modal(`<h3>تطلع من الغرفة؟</h3><div class="j3-row"><button class="j3-btn j3-btn-danger" data-close id="j3-yes">${st.me.host ? 'إلغاء الغرفة والخروج' : 'اطلع'}</button><button class="j3-btn j3-btn-ghost" data-close>لا</button></div>`, (d) => { d.querySelector('#j3-yes').addEventListener('click', leaveRoom); }); go('#/'); };
const sBtn = $('#j3-sound'); sBtn.setAttribute('aria-pressed', String(sound.on)); sBtn.onclick = () => { sound.set(!sound.on); sBtn.setAttribute('aria-pressed', String(sound.on)); if (sound.on) sfx.tap(); };
window.addEventListener('beforeunload', (e) => { if (st.room && st.me && st.me.host && st.room.phase !== 'ended') { e.preventDefault(); e.returnValue = ''; } });

// ------------------------------------------------------------------ الإقلاع
(function boot() {
  const qs = new URLSearchParams(location.search); const r = (qs.get('r') || '').toUpperCase();
  const saved = loadSession();
  if (saved && (!r || r === saved.code)) { // تحديث الصفحة داخل غرفة: استعادة المقعد
    net.session = saved; setView('boot', null); main.innerHTML = `<div class="j3-join"><div class="j3-panel j3-okbox"><h1 class="j3-h2">نرجّعك للغرفة...</h1></div></div>`;
    net.connect(); setTimeout(() => { if (!st.room) { /* لو ما رد الخادم بغرفة */ if (!net.session) return; } }, 0);
    return;
  }
  if (r) return viewJoin(r);
  route();
})();
window.__j3 = { st, net }; // للاختبارات الآلية فقط
