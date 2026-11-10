import { h, avatar, reconcile, serverNow, fill } from './dom.js';

// شاشة الانتظار: قائمة المشاركين تتحدث لحظياً، والمضيف وحده عنده البدء والطرد والإلغاء.
export function createLobby(api) {
  const count = h('b', { text: '0' });
  const need = h('span', { class: 'note' });
  const status = h('span', { class: 'chip' });
  const hostBox = h('div', { class: 'hostline' });
  const list = h('div', { class: 'players' });
  const actions = h('div', { class: 'row' });
  const hint = h('p', { class: 'note' });
  const startBtn = h('button', { class: 'btn primary big', onClick: () => api.call('start') }, 'بدء الراوند');
  const cancelBtn = h('button', { class: 'btn danger', onClick: () => { if (confirm('إلغاء الراوند؟')) api.call('cancel'); } }, 'إلغاء الراوند');
  const leaveBtn = h('button', { class: 'btn', onClick: () => api.call('leave', {}, { leaving: true }) }, 'الخروج من الانتظار');
  const overlay = h('div');
  let last = -1;

  const root = h('section', {},
    h('div', { class: 'hero' },
      h('div', {}, h('h1', { class: 'gname' }), h('p', { class: 'gintro' })),
      h('div', { class: 'row' }, status)
    ),
    h('div', { class: 'stats' },
      h('div', { class: 'card stat' }, h('span', { text: 'صاحب الراوند' }), hostBox),
      h('div', { class: 'card stat' }, h('span', { text: 'اللاعبون' }), h('div', {}, count, ' ', need)),
      h('div', { class: 'card stat' }, h('span', { text: 'الحد الأدنى للبدء' }), h('b', { class: 'min' }))
    ),
    h('div', { class: 'card' }, h('div', { class: 'panel-title' }, h('span', { text: 'المشاركون' }), hint), list),
    h('div', { class: 'row', style: 'margin-top:16px' }, actions),
    overlay
  );

  function playerCard(p) {
    const el = h('div', { class: 'pcard' },
      avatar(p),
      h('div', { class: 'meta' }, h('div', { class: 'nm' }), h('div', { class: 'sub' }, h('i', { class: 'dot' }), h('span', { class: 'st' }), h('span', { class: 'badge', text: 'المضيف', hidden: true }))),
      h('button', { class: 'kick', 'aria-label': 'طرد', title: 'طرد', hidden: true, onClick: () => { if (confirm('طرد هذا اللاعب؟')) api.call('kick', { playerId: el.dataset.key }); } }, '✕')
    );
    return el;
  }
  function updateCard(el, p, view) {
    el.querySelector('.nm').textContent = p.name;
    el.querySelector('.dot').className = `dot${p.connected ? '' : ' off'}`;
    el.querySelector('.st').textContent = p.connected ? 'متصل' : 'غير متصل';
    el.classList.toggle('me', p.id === view.me.id);
    const badge = el.querySelector('.badge'); badge.hidden = !p.isHost;
    el.querySelector('.kick').hidden = !(view.me.isHost && !p.isHost && view.status === 'waiting');
    const im = el.querySelector('img'); if (im && p.avatarUrl && im.getAttribute('src') !== p.avatarUrl) im.setAttribute('src', p.avatarUrl);
  }

  return {
    kind: 'lobby',
    root,
    update(v) {
      root.querySelector('.gname').textContent = `${v.game.emoji} ${v.game.name}`;
      root.querySelector('.gintro').textContent = v.game.intro;
      root.querySelector('.min').textContent = `${v.minPlayers} لاعبين`;
      count.textContent = `${v.players.length} / ${v.maxPlayers}`;
      if (last !== -1 && last !== v.players.length) { count.classList.remove('bump'); void count.offsetWidth; count.classList.add('bump'); }
      last = v.players.length;
      const missing = v.minPlayers - v.players.length;
      need.textContent = missing > 0 ? `· نحتاج ${missing} كمان` : '· العدد مكتمل';
      fill(hostBox, avatar(v.host, 'lg'), h('b', { text: v.host ? v.host.name : '—', style: 'font-size:1.1rem' }));
      const starting = v.status === 'starting';
      status.className = `chip ${missing > 0 ? '' : 'ok'}`;
      status.textContent = starting ? 'جاري بدء الراوند…' : missing > 0 ? 'بانتظار اللاعبين' : 'العدد مكتمل — بانتظار صاحب الراوند';
      reconcile(list, v.players, (p) => p.id, playerCard, (el, p) => updateCard(el, p, v));
      fill(actions);
      if (v.me.isHost) {
        startBtn.disabled = missing > 0 || starting;
        cancelBtn.disabled = starting;
        actions.append(startBtn, cancelBtn);
        hint.textContent = missing > 0 ? 'اللعبة لا تبدأ إلا بقرارك' : 'اضغط بدء الراوند لما الكل جاهز';
      } else if (v.me.isPlayer) {
        actions.append(leaveBtn);
        leaveBtn.disabled = starting;
        hint.textContent = 'الراوند ينتظر صاحبه يبدأ اللعبة';
      } else if (v.me.id) {
        actions.append(h('button', { class: 'btn primary', onClick: () => api.call('join') }, 'دخول الراوند'));
      }
      fill(overlay);
      if (starting) {
        overlay.append(h('div', { class: 'overlay' }, h('div', {}, h('h2', { text: `${v.game.emoji} ${v.game.name}` }), h('div', { class: 'num', 'data-count-end': v.startingEndsAt, text: String(Math.max(0, Math.ceil((v.startingEndsAt - serverNow()) / 1000))) }), h('p', { class: 'note', style: 'text-align:center', text: 'جاري تجهيز اللعبة…' }))));
      }
    }
  };
}
