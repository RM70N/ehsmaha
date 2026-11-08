import { h, fill, reconcile, serverNow } from './dom.js';
import { grad, chipInner, elimOverlay, stageShell } from './rd.js';

// واجهة دائرة الإقصاء (الروليت) ولعبة الدول — نفس مسرح الراوند بالموقع (rd-stage):
//   الروليت: لوحة اللاعبين وأرقامهم + حلقة الطاقة تدور وتقف على صاحب الدور + لافتة "الدور عليه".
//   الدول:   شبكة بطاقات الدول بأعلامها (rd-ccard) + لافتة صاحب الدور.
// القرار (الدور/القرعة/الإقصاء) من الخادم فقط؛ العميل يرسم الحركة من وقت البدء ونتيجة ثابتة.
export function createElimination(api, kind) {
  const isCountries = kind === 'countries';
  const remainNum = h('span', { class: 'rd-num-gold', text: '0' });
  const roundNum = h('span', { class: 'rd-num-pink', text: '1' });
  const youChip = h('span', { class: 'rd-head-lbl' });
  const roster = h('div', { class: 'rd-roster-grid' });
  const chooser = h('div', { class: 'rd-chooser' }, h('span', { class: 'rd-chooser-lbl', text: 'الدور عليه' }), h('span', { class: 'rd-chooser-name' }));
  const hint = h('div', { class: isCountries ? 'cw-spin-result' : 'spin-result' });
  const timer = h('div', { class: 'rd-head-lbl', style: 'text-align:center;font-weight:900' });
  const bar = h('div', { class: 'bar', hidden: true, style: 'height:1.2cqw;margin:0 2cqw' }, h('i', { style: 'background:linear-gradient(90deg,#E3C36A,#E8A0C8)' }));

  // الروليت: الحلقة وعُقد اللاعبين / الدول: شبكة الدول
  const nodes = h('div', { id: 'rou-nodes', style: 'position:absolute;inset:0' });
  const ring = h('div', { class: 'rd-ring' }, h('div', { class: 'rd-ring-grad' }, ), h('div', { class: 'rd-ring-dot' }));
  const centerNum = h('div', { class: 'rd-center-num', text: '0' });
  const circleBox = h('div', { class: 'rd-circle-box' }, h('div', { class: 'rd-ring-in' }), h('div', { class: 'rd-ring-dash' }), ring, nodes, h('div', { class: 'rd-center' }, centerNum, h('div', { class: 'rd-center-lbl', text: 'داخل الدائرة' })));
  const cgrid = h('div', { class: 'rd-cgrid' });

  const rosterBox = h('div', { class: 'rd-roster' }, h('div', { class: 'rd-roster-head' }, h('div', { class: 'rd-roster-t1', text: 'اللاعبون وأرقامهم' }), h('div', { class: 'rd-roster-t2', id: 'rt2', text: '' })), roster);
  // الدول: منشور القرعة (عدسة تمرّر أسماء اللاعبين) + لافتة "الدور على" + شبكة الدول — مثل الموقع
  const lensTrack = h('div', { class: 'rd-lens-track' });
  const lens = h('div', { class: 'rd-lens' }, h('div', { class: 'rd-lens-view' }, lensTrack), h('div', { class: 'rd-lens-vig' }), h('div', { class: 'rd-lens-line' }), h('div', { class: 'rd-beam l' }), h('div', { class: 'rd-beam r' }), h('div', { class: 'rd-scan' }), h('div', { class: 'rd-lens-tag', text: 'منشور القرعة' }));
  const turn = h('div', { class: 'cw-turn-banner' }, h('div', { class: 'cw-turn-title', text: 'الدور على' }), h('div', { class: 'cw-turn-name' }));
  const alivePlayers = h('div', { style: 'display:flex;flex-wrap:wrap;gap:.8cqw;justify-content:center' });
  const body = isCountries
    ? h('div', { class: 'rd-body' }, lens, turn, cgrid)
    : h('div', { class: 'rd-body' }, rosterBox, chooser, h('div', { class: 'rd-circle' }, circleBox), hint, bar, timer);
  const foot = isCountries ? h('div', { class: 'rd-foot', style: 'display:flex;flex-direction:column;gap:.8cqw;align-items:center;flex:0 0 auto' }, alivePlayers, hint, bar, timer) : null;
  const head = h('div', { class: 'rd-head' }, h('div', { class: 'rd-head-side' }, remainNum, h('span', { class: 'rd-head-lbl', text: 'متبقّون' })), youChip, h('div', { class: 'rd-head-side' }, h('span', { class: 'rd-head-lbl', text: 'الجولة' }), roundNum));
  const stageId = isCountries ? 'cw-stage' : 'rou-stage';
  const stage = stageShell(stageId, [head, body, foot]);
  const root = h('section', { class: 'rd-wrap' }, stage);

  let view = null; let raf = 0; let spinKey = ''; let nodeSig = ''; let lastElim = -1; let nameOf = new Map(); let idxOf = new Map();

  const num = (id) => (idxOf.get(id) ?? 0) + 1;

  function buildRoster(v, s) {
    const outIds = new Set(s.eliminated.map((e) => e.id));
    const canPick = !isCountries && s.phase === 'choosing' && s.you && s.you.isChooser;
    reconcile(roster, v.players, (p) => p.id, (p) => {
      const i = idxOf.get(p.id);
      const cell = h('div', { class: 'rd-rcell' },
        h('div', { class: 'rd-rcell-chip', style: `background:${grad(i)};position:relative` }, chipInner(p)),
        h('div', { class: 'rd-rcell-num' }), h('div', { class: 'rd-rcell-name', text: p.name }));
      return cell;
    }, (el, p) => {
      const out = outIds.has(p.id);
      el.className = `rd-rcell${s.chooserId === p.id && !out && s.phase !== 'spinning' ? ' chooser' : ''}${out ? ' eliminated' : ''}`;
      el.style.opacity = out ? '.28' : '';
      el.style.filter = out ? 'grayscale(1)' : '';
      el.querySelector('.rd-rcell-num').textContent = String(num(p.id));
      el.querySelector('.rd-rcell-name').textContent = p.name;
      const clickable = canPick && !out && p.id !== v.me.id;
      el.style.cursor = clickable ? 'pointer' : '';
      el.onclick = clickable ? () => api.act('pick', { value: p.id }) : null;
      el.onmouseenter = clickable ? () => el.classList.add('aim') : null;
      el.onmouseleave = clickable ? () => el.classList.remove('aim') : null;
    });
  }

  function buildNodes(v, s) {
    const alive = s.alive;
    const sig = alive.join('|');
    if (sig === nodeSig) return;
    nodeSig = sig;
    const n = alive.length; const step = 360 / Math.max(1, n);
    circleBox.style.setProperty('--rd-ns', (n <= 12 ? 1 : Math.max(0.45, 12 / n)).toFixed(2));
    fill(nodes);
    alive.forEach((id, i) => {
      const a = ((i * step - 90) * Math.PI) / 180;
      const p = v.players.find((x) => x.id === id);
      nodes.append(h('div', { class: 'rd-pnode', style: `left:${(50 + 42 * Math.cos(a)).toFixed(2)}%;top:${(50 + 40 * Math.sin(a)).toFixed(2)}%` },
        h('div', { class: 'rd-pnode-av', style: `background:${grad(idxOf.get(id))}` }, h('div', { class: 'rd-pnode-glow' }), String(num(id))),
        h('div', { class: 'rd-pnode-name', text: p ? p.name : '' })));
    });
  }

  // الحلقة تدور من وقت البدء على ساعة الخادم وتقف على صاحب الدور (نتيجة ثابتة من الخادم)
  function runSpin(s) {
    const sp = s.spin;
    const key = `${sp.startsAt}:${sp.landIndex}`;
    if (key === spinKey) return;
    spinKey = key;
    cancelAnimationFrame(raf);
    const n = sp.order.length; const step = 360 / n; const total = sp.landIndex * step + 360 * 5;
    const frame = () => {
      const t = Math.min(1, (serverNow() - sp.startsAt) / sp.durationMs);
      const deg = total * (1 - Math.pow(1 - t, 3));
      ring.style.transform = `rotate(${deg.toFixed(2)}deg)`;
      const live = ((Math.round(deg / step) % n) + n) % n;
      [...nodes.children].forEach((k, i) => k.classList.toggle('live', t < 1 ? i === live : i === sp.landIndex));
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    frame();
  }

  // عدسة منشور القرعة: صفوف أسماء تمرّ وتقف على صاحب الدور (نفس حركة الموقع، محسوبة من وقت الخادم)
  function lensRows(base, n, order, v) {
    fill(lensTrack);
    for (let i = -1; i <= 2; i++) {
      const idx = (((base + i) % n) + n) % n;
      const p = v.players.find((x) => x.id === order[idx]);
      lensTrack.append(h('div', { class: 'rd-lens-row' }, h('div', { class: 'rd-lens-chip', style: `background:${grad(idxOf.get(order[idx]) || 0)};position:relative` }, p ? chipInner(p) : ''), h('div', { class: 'rd-lens-name', text: p ? p.name : '' })));
    }
  }
  function runLens(s, v) {
    const sp = s.spin; const key = `${sp.startsAt}:${sp.landIndex}`;
    if (key === spinKey) return;
    spinKey = key; cancelAnimationFrame(raf);
    const n = sp.order.length; const total = sp.landIndex + n * 4;
    let lastBase = null;
    const frame = () => {
      const t = Math.min(1, (serverNow() - sp.startsAt) / sp.durationMs);
      const pos = total * (1 - Math.pow(1 - t, 3));
      const base = Math.floor(pos); const frac = pos - base;
      if (base !== lastBase) { lastBase = base; lensRows(base, n, sp.order, v); }
      lensTrack.style.transform = `translateY(${(-(frac + 1) * 30).toFixed(3)}cqw)`;
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    frame();
  }
  function lensStatic(s, v) {
    const order = s.alive.length ? s.alive : [];
    const i = order.indexOf(s.chooserId);
    const key = `static:${s.chooserId}:${order.length}`;
    if (key === spinKey || i < 0) return;
    spinKey = key; cancelAnimationFrame(raf);
    lensRows(i, order.length, order, v);
    lensTrack.style.transform = 'translateY(-30cqw)';
  }

  function buildCountries(v, s) {
    fill(alivePlayers, ...s.alive.map((id) => h('span', { class: 'rd-head-lbl', style: 'font-size:1.5cqw;padding:.2cqw 1cqw;border-radius:2cqw;background:rgba(13,6,32,.7)', text: `${num(id)}. ${nameOf.get(id) || ''}` })));
    const alive = (s.countriesLeft || []).map((c) => ({ ...c, out: false }));
    const gone = s.eliminated.filter((e) => e.reveal).map((e) => ({ ...e.reveal, token: `x${e.id}`, out: true }));
    const all = [...alive, ...gone].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    const mine = s.you && s.you.isChooser && s.phase === 'choosing';
    const valueOf = new Map((s.choices || []).map((c) => [c.name, c.value]));
    reconcile(cgrid, all, (c) => c.name, (c) => {
      const chip = h('div', { class: 'rd-chip' });
      if (c.flagImageUrl) { const img = h('img', { class: 'cw-flag-img', src: c.flagImageUrl, alt: c.name, referrerpolicy: 'no-referrer' }); img.addEventListener('error', () => img.replaceWith(h('span', { class: 'cw-country-flag', text: c.flag }))); chip.append(img); } else chip.append(h('span', { class: 'cw-country-flag', text: c.flag }));
      return h('div', { class: 'rd-ccard' }, h('div', { class: 'rd-ccard-aim' }), chip, h('div', { class: 'rd-cname', text: c.name }));
    }, (el, c) => {
      el.classList.toggle('eliminated', c.out);
      const val = valueOf.get(c.name);
      el.style.cursor = mine && !c.out && val ? 'pointer' : '';
      el.onclick = mine && !c.out && val ? () => api.act('pick', { value: val }) : null;
    });
  }

  return {
    kind,
    root,
    update(v) {
      view = v; const s = v.state;
      nameOf = new Map(v.players.map((p) => [p.id, p.name]));
      idxOf = new Map(v.players.map((p, i) => [p.id, i]));
      remainNum.textContent = String(s.alive.length);
      roundNum.textContent = String(s.round);
      centerNum.textContent = String(s.alive.length);
      youChip.textContent = v.me.isPlayer ? (s.you && s.you.alive ? 'أنت في اللعبة' : 'خرجت — تتابع') : 'وضع المشاهدة';
      if (!isCountries) buildRoster(v, s);
      if (isCountries) buildCountries(v, s); else buildNodes(v, s);

      const choosing = s.phase === 'choosing';
      chooser.classList.toggle('show', choosing);
      chooser.querySelector('.rd-chooser-name').textContent = choosing ? nameOf.get(s.chooserId) || '' : '';
      turn.classList.toggle('show', choosing);
      turn.querySelector('.cw-turn-name').textContent = choosing ? nameOf.get(s.chooserId) || '' : '';
      bar.hidden = !choosing;
      if (choosing) { const i = bar.firstChild; i.dataset.barStart = String(s.pickEndsAt - 15000); i.dataset.barEnd = String(s.pickEndsAt); }
      timer.textContent = '';
      timer.dataset.deadline = choosing ? s.pickEndsAt : '';
      if (!choosing) delete timer.dataset.deadline;
      const mine = s.you && s.you.isChooser;
      hint.className = `${isCountries ? 'cw-spin-result' : 'spin-result'}${s.phase !== 'done' ? ' show' : ''}`;
      hint.textContent = s.phase === 'spinning' ? 'الدائرة تدور…' : choosing ? (mine ? (isCountries ? 'اضغط على دولة لتقصيها — انتبه، ممكن تكون دولتك! (دولتك سرية)' : 'اضغط على رقم لاعب لتقصيه') : `ينتظر ${nameOf.get(s.chooserId) || ''}…`) : s.phase === 'reveal' && s.reveal && s.reveal.type === 'skip' ? 'ما اختار — لا إقصاء، الدائرة تدور من جديد' : '';
      if (s.phase === 'spinning' && !isCountries) runSpin(s);
      if (isCountries) { if (s.phase === 'spinning') runLens(s, v); else if (s.chooserId) lensStatic(s, v); }
      // طبقة الإقصاء مرة وحدة لكل إقصاء جديد (ما تنعاد عند إعادة الاتصال)
      if (s.eliminated.length !== lastElim) {
        if (lastElim !== -1 && s.eliminated.length > lastElim) {
          const e = s.eliminated[s.eliminated.length - 1];
          const p = v.players.find((x) => x.id === e.id);
          const how = e.reason === 'left' ? 'غادر السيرفر' : e.reason === 'self' ? 'أقصى نفسه!' : `أقصاه ${nameOf.get(e.by) || ''}`;
          elimOverlay(stage, p, idxOf.get(e.id) || 0, isCountries && e.reveal ? `${e.reveal.flag} ${e.reveal.name} — ${how}` : how);
        }
        lastElim = s.eliminated.length;
      }
    }
  };
}
