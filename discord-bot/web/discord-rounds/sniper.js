import { h, fill, serverNow } from './dom.js';

// واجهة القناص — نفس تصميم صفحة القناص بالموقع (شريط الحالة، لوحة المشاركين، شبكة 1-50 بعشرة أعمدة،
// شريط الأسلحة، خانة الإطلاق، سجل الإصابات). المخابئ سرية: كل لاعب يشوف مخبأه فقط، والقناص ما يستلم أي مخبأ.
export function createSniper(api) {
  const strip = h('div', { class: 'status-strip waiting' });
  const pCount = h('div', { class: 'participants-big-count', text: '0' });
  const pLabel = h('div', { class: 'participants-label', text: 'لاعب حي' });
  const pNames = h('div', { class: 'participants-usernames' });
  const grid = h('div', { class: 'sniper-grid' });
  const weaponsBar = h('div', { class: 'weapons-bar' });
  const input = h('input', { class: 'fire-input', type: 'number', min: '1', max: '50', placeholder: 'أدخل رقم المربع للتصويب...', inputmode: 'numeric' });
  const fireBtn = h('button', { class: 'btn-fire', onClick: () => fire() }, '🔥 أطلق!');
  const fireRow = h('div', { class: 'fire-row' }, input, fireBtn);
  const log = h('div', { class: 'kill-log' });
  const weapons = h('div', { style: 'width:100%;max-width:680px', hidden: true }, weaponsBar, fireRow);
  const root = h('section', { class: 'sniper-center', style: 'display:flex;flex-direction:column;align-items:center;gap:14px' },
    h('div', { class: 'game-title-header' }, h('div', { class: 'gth-icon', text: '🎯' }), h('div', { class: 'gth-name', text: 'القناص' }), h('div', { class: 'gth-desc', text: 'اختر مكانك بالشبكة وتفادى الاستهداف!' })),
    strip,
    h('div', { class: 'participants-overlay' }, h('div', { class: 'participants-overlay-header' }, pCount, pLabel), pNames),
    grid, weapons, log);

  let view = null; let weapon = 'sniper'; let built = '';

  function fire() {
    if (!view) return;
    const box = Number(input.value);
    if (!Number.isInteger(box) || box < 1 || box > view.state.gridSize) return api.act('shoot', { weapon, box: -1 });
    api.act('shoot', { weapon, box });
    input.value = '';
    return undefined;
  }

  const reach = (s, box) => {
    const r = (s.reach && s.reach[weapon]) || { from: 0, to: 0 };
    const out = [];
    for (let d = r.from; d <= r.to; d++) if (box + d >= 1 && box + d <= s.gridSize) out.push(box + d);
    return out;
  };

  function buildGrid(v, s) {
    const me = s.you || {};
    const hiding = s.phase === 'hiding' && v.me.isPlayer && me.alive && !me.isSniper;
    const taken = new Set(s.takenBoxes || []);
    const aimAt = Number(input.value);
    const aim = new Set(me.isSniper && s.phase === 'hunting' && aimAt ? reach(s, aimAt) : []);
    fill(grid);
    for (let b = 1; b <= s.gridSize; b++) {
      const mark = s.marks[b];
      const mine = me.box === b;
      const cls = ['s-cell', mine ? 'occupied' : '', mark === 'hit' ? 'eliminated' : '', mark === 'miss' ? 'missed' : '', taken.has(b) && hiding ? 'missed' : ''].filter(Boolean).join(' ');
      const cell = h('button', { class: cls, type: 'button', 'aria-label': `المربع ${b}`, id: `s-cell-${b}`, style: aim.has(b) ? 'outline:2px solid #E3C36A;outline-offset:1px' : '' },
        h('span', { class: 's-num', text: String(b) }), h('span', { class: 's-name', id: `s-name-${b}`, text: mark === 'hit' ? '❌' : mine ? 'أنت' : '' }));
      if (hiding && !taken.has(b) && !mark) cell.addEventListener('click', () => api.act('hide', { box: b }));
      else if (me.isSniper && s.phase === 'hunting' && !mark) cell.addEventListener('click', () => { input.value = String(b); api.rerender(); });
      else cell.disabled = true;
      grid.append(cell);
    }
  }

  function buildWeapons(s) {
    fill(weaponsBar);
    for (const [key, def] of Object.entries(s.weapons)) {
      const left = s.ammo[key];
      weaponsBar.append(h('button', { class: `weapon-btn${weapon === key ? ' active-weapon' : ''}`, type: 'button', disabled: left <= 0, onClick: () => { weapon = key; api.rerender(); } },
        h('div', { class: 'weapon-icon', text: def.emoji }), h('div', { class: 'weapon-name', text: def.name }),
        h('div', { class: 'weapon-ammo', text: `${left} ${key === 'sniper' ? 'طلقات' : 'استعمالات'}` }), h('div', { class: 'weapon-desc', text: def.desc })));
    }
  }

  input.addEventListener('input', () => api.rerender());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') fire(); });

  return {
    kind: 'sniper',
    root,
    update(v) {
      view = v; const s = v.state; const me = s.you || {};
      const nm = (id) => (v.players.find((p) => p.id === id) || {}).name || '';
      if (!s.weapons[weapon] || s.ammo[weapon] <= 0) weapon = Object.keys(s.weapons).find((k) => s.ammo[k] > 0) || 'sniper';
      const sig = JSON.stringify([s.phase, s.marks, me.box, s.takenBoxes, s.alive.length, weapon, input.value, s.ammo]);
      strip.className = `status-strip ${s.phase === 'hiding' ? 'waiting' : s.phase === 'hunting' ? 'active' : 'finished'}`;
      const end = s.phase === 'hiding' ? s.hideEndsAt : s.huntEndsAt;
      fill(strip, s.phase === 'hiding'
        ? (me.isSniper ? `🎯 أنت القناص — اللاعبون يختبئون الحين… ` : v.me.isPlayer ? `⏳ اختر مربع تختبئ فيه (يتسع لاعبين) — ` : `⏳ اللاعبون يختبئون (اختبأ ${s.hiddenCount} من ${s.hiders.length}) — `)
        : s.phase === 'hunting' ? `🎯 الراوند شغال — القناص ${nm(s.sniperId)} يصطاد! ` : '🏆 انتهى الراوند!',
      s.phase !== 'done' ? h('b', { 'data-deadline': end, text: '' }) : null);
      pCount.textContent = String(s.hiders.length);
      fill(pNames, ...s.hiders.map((id) => h('span', { class: 'p-username-number', text: nm(id) })));
      weapons.hidden = !(me.isSniper && s.phase === 'hunting');
      if (!weapons.hidden) buildWeapons(s);
      if (sig !== built) { built = sig; buildGrid(v, s); }
      // سجل الإصابات (من الحالة العامة)
      const shots = s.eliminated.filter((e) => e.reason === 'shot').slice(-20).reverse();
      fill(log, ...shots.map((e) => h('div', { class: 'kill-item has-player' }, h('div', { class: 'kill-icon', text: (s.weapons[e.weapon] || {}).emoji || '🔫' }), h('div', {}, h('div', { class: 'kill-text', text: `تم إقصاء ${nm(e.id)}` }), h('div', { class: 'kill-sub', text: `مربع ${e.box}` })))));
    }
  };
}
