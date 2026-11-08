'use strict';

// طبقة ديسكورد للراوندات: رسالة الانتظار (تتحدث بدون ما تتكرر)، رسالة المتابعة الحية، وإعلان الفائز.
// ما فيه أي منطق لعب هنا — فقط عرض لحالة المدير (round) وربط الأحداث بالرسائل.
//
// التحديث الذكي: كل تغيير يعلّم الراوند "dirty" ويجدول تعديل واحد متأخر (debounce) مع حد أدنى بين
// تعديلين — فلو دخل 10 لاعبين بثانية يصير تعديل واحد بآخر حالة. أخطاء ديسكورد (رسالة انحذفت، قناة
// انحذفت، حدود المعدل) تتعامل داخلياً ولا توقف الراوند.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const logger = require('../../utils/logger');
const games = require('./games');

const DEBOUNCE_MS = 700;
const MIN_EDIT_GAP_MS = 1500;
const NAMES_PER_FIELD = 12;
const MAX_FIELDS = 4;
const GONE_CODES = [10003, 50001, 50013]; // قناة محذوفة / ما عاد نوصلها

const clean = (s) => String(s || '').replace(/[*_~`|>\\]/g, '').slice(0, 32);
const roundUrl = (base, id) => `${base}/discord/round/${id}`;
const watchUrl = (base, id) => `${base}/discord/watch/${id}`;

function chunk(list, n) {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

// أسماء المشاركين: عمودين/أكثر بحقول متوازنة تحت حدود Embed (1024 للحقل، 6000 للرسالة)
function playersFields(round) {
  const names = round.players.map((p, i) => `\`${String(i + 1).padStart(2, '0')}\` ${clean(p.name)}${p.id === round.hostDiscordId ? ' 👑' : ''}`);
  if (!names.length) return [eb.field('قائمة المشاركين', 'لا أحد بعد — كن الأول', false)];
  const perField = Math.max(NAMES_PER_FIELD, Math.ceil(names.length / MAX_FIELDS));
  return chunk(names, perField).slice(0, MAX_FIELDS).map((c, i) =>
    eb.field(i === 0 ? `قائمة المشاركين (${names.length})` : '​', c.join('\n'), true)
  );
}

function statusText(round) {
  const n = round.players.length;
  switch (round.status) {
    case 'waiting':
      if (n >= round.minPlayers) return 'بانتظار صاحب الراوند يبدأ اللعبة — العدد مكتمل ✅';
      return `بانتظار اللاعبين — نحتاج ${round.minPlayers - n} ${round.minPlayers - n === 1 ? 'لاعب' : 'لاعبين'} كمان`;
    case 'starting':
      return 'جاري بدء الراوند…';
    case 'running':
      return 'بدأ الراوند 🔒';
    case 'finished':
      return 'انتهى الراوند';
    default:
      return 'أُلغي الراوند';
  }
}

const CANCEL_REASONS = {
  host: 'ألغاه صاحب الراوند',
  timeout: 'انتهت مهلة الانتظار',
  host_disconnected: 'انقطع اتصال صاحب الراوند',
  host_left_server: 'غادر صاحب الراوند السيرفر',
  not_enough: 'ما اكتمل العدد',
  start_failed: 'تعذّر بدء اللعبة',
  restore_failed: 'تعذّرت استعادة الراوند بعد إعادة التشغيل',
  channel_gone: 'القناة ما عادت متاحة للبوت',
  bot_removed: 'البوت خرج من السيرفر'
};

function createPresenter({ manager, getClient, baseUrl, store }) {
  const state = new Map(); // roundId -> { timer, lastEdit, busy, dirty }

  const meta = (round) => games.get(round.gameType).meta;

  // ---------------- القوالب ----------------
  function lobbyPayload(round) {
    const m = meta(round);
    const open = round.status === 'waiting';
    const tone = round.status === 'cancelled' ? 'muted' : round.status === 'running' || round.status === 'starting' ? 'deep' : 'primary';
    const embed = eb.brand({
      tone,
      title: `احسمها | ${m.name}`,
      description:
        (round.status === 'waiting' ? 'تم إنشاء راوند جديد.\n' : '') +
        `**حالة الراوند:** ${statusText(round)}` +
        (round.status === 'cancelled' && round.cancelReason ? ` — ${CANCEL_REASONS[round.cancelReason] || round.cancelReason}` : '')
    });
    embed.addFields(
      eb.field('صاحب الراوند', `<@${round.hostDiscordId}>`, true),
      eb.field('اللاعبون', `${round.players.length} / ${round.maxPlayers}`, true),
      eb.field('الحد الأدنى للبدء', `${round.minPlayers} لاعبين`, true),
      ...playersFields(round)
    );
    if (open) {
      embed.addFields(
        eb.field('الدخول للراوند', `اضغط على رابط الراوند وسجّل دخولك بحساب ديسكورد.\n${roundUrl(baseUrl, round.roundId)}`, false)
      );
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(open ? 'رابط الراوند' : 'فتح الراوند').setURL(roundUrl(baseUrl, round.roundId)),
      new ButtonBuilder().setCustomId(`rd:start:${round.roundId}`).setStyle(ButtonStyle.Success).setLabel('بدء الراوند').setDisabled(!open),
      new ButtonBuilder().setCustomId(`rd:kick:${round.roundId}`).setStyle(ButtonStyle.Danger).setLabel('طرد لاعب').setDisabled(!open),
      new ButtonBuilder().setCustomId(`rd:cancel:${round.roundId}`).setStyle(ButtonStyle.Secondary).setLabel('إلغاء').setDisabled(!open)
    );
    return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
  }

  // آخر الأحداث المهمة بنص مقروء
  const nameOf = (round, id) => clean((round.players.find((p) => p.id === id) || {}).name || 'لاعب');
  function eventLine(round, ev) {
    const p = ev.payload || {};
    switch (ev.eventType) {
      case 'player_eliminated':
        if (p.reason === 'shot') return `القناص أصاب ${nameOf(round, p.playerId)} (المربع ${p.box})`;
        if (p.reason === 'left') return `${nameOf(round, p.playerId)} غادر السيرفر`;
        if (p.reason === 'self') return `${nameOf(round, p.playerId)} أقصى نفسه${p.reveal ? ` (${p.reveal.name})` : ''}`;
        return `${nameOf(round, p.byId)} أقصى ${nameOf(round, p.playerId)}${p.reveal ? ` (${p.reveal.flag} ${p.reveal.name})` : ''}`;
      case 'pick_skipped':
        return `${nameOf(round, p.chooserId)} ما اختار — لا إقصاء`;
      case 'sniper_selected':
        return `القناص: ${nameOf(round, p.sniperId)}`;
      case 'hunt_started':
        return 'بدأ الصيد';
      case 'players_auto_removed':
        return `طرد تلقائي لعدم الاختباء: ${(p.playerIds || []).map((i) => nameOf(round, i)).join('، ')}`;
      default:
        return null;
    }
  }

  function livePayload(round) {
    const m = meta(round);
    const g = games.get(round.gameType);
    const done = round.status === 'finished' || round.status === 'cancelled';
    const sum = round.game ? g.summary(round) : { remaining: round.players.length };
    const embed = eb.brand({
      tone: done ? 'muted' : 'danger',
      title: done ? 'احسمها | انتهى الراوند' : 'احسمها | الراوند مباشر الآن',
      description: done
        ? round.status === 'cancelled'
          ? `أُلغي الراوند — ${CANCEL_REASONS[round.cancelReason] || ''}`
          : 'انتهت اللعبة — النتيجة بالأسفل.'
        : 'تابع الراوند مباشرة من رابط المشاهدة — نفس الأحداث وقت حدوثها.'
    });
    embed.addFields(
      eb.field('اللعبة', m.name, true),
      eb.field('صاحب الراوند', `<@${round.hostDiscordId}>`, true),
      eb.field('الحالة', done ? (round.status === 'finished' ? 'انتهى' : 'ملغي') : 'جاري اللعب', true),
      eb.field('المشاركون', String(round.players.length), true),
      eb.field(round.gameType === 'sniper' ? 'الأحياء' : 'المتبقون', String(sum.remaining), true)
    );
    if (sum.roundNo) embed.addFields(eb.field('رقم الجولة', String(sum.roundNo), true));
    if (!done && sum.turnId) embed.addFields(eb.field(round.gameType === 'sniper' ? 'القناص' : 'صاحب الدور الحالي', `<@${sum.turnId}>`, true));
    if (done && round.result && round.result.winners && round.result.winners.length) {
      embed.addFields(eb.field('الفائز', round.result.winners.slice(0, 10).map((w) => `<@${w.id}>`).join(' '), true));
    }
    const lines = round.events.map((e) => eventLine(round, e)).filter(Boolean).slice(-4);
    if (lines.length) embed.addFields(eb.field('آخر الأحداث', lines.join('\n'), false));
    const components = [];
    if (!done) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('مشاهدة الراوند مباشرة').setURL(watchUrl(baseUrl, round.roundId))
      ));
    }
    return { embeds: [embed], components, allowedMentions: { parse: [] } };
  }

  function winnerPayload(round) {
    const m = meta(round);
    const r = round.result || {};
    const w = (r.winners || [])[0];
    let desc;
    const embed = eb.brand({ tone: 'gold', title: `احسمها | ${m.name} — النتيجة` });
    if (r.outcome === 'none' || !r.winners || !r.winners.length) {
      embed.setDescription(
        r.reason === 'inactive' ? 'انتهت اللعبة بدون فائز — ما أحد اختار كذا مرة ورا بعض.' :
        r.reason === 'aborted' ? 'انتهت الجولة بدون فائز — غادر القناص السيرفر.' :
        'انتهى الراوند بدون فائز.'
      );
      embed.setColor(0x4b4658);
    } else if (round.gameType === 'sniper') {
      if (r.outcome === 'sniper') {
        desc = `القناص <@${r.sniperId}> صاد الجميع وفاز.`;
      } else {
        desc = `انتهى الوقت والقناص ما قدر يصيدهم — فاز ${r.winners.length === 1 ? 'الناجي' : 'الناجون'}:\n${r.winners.map((x) => `<@${x.id}>`).join(' · ')}`;
      }
      embed.setDescription(desc);
      embed.addFields(
        eb.field('عدد المشاركين', String(r.participants), true),
        eb.field('الطلقات', String(r.shots || 0), true),
        eb.field('الإصابات', String(r.hits || 0), true)
      );
    } else {
      embed.setDescription(`مبروك <@${w.id}> — آخر لاعب صامد.`);
      embed.addFields(eb.field('الفائز', `<@${w.id}>`, true), eb.field('عدد المشاركين', String(r.participants), true));
      if (round.gameType === 'countries' && r.winnerCountry) {
        embed.addFields(eb.field('دولة الفائز', `${r.winnerCountry.flag} ${r.winnerCountry.name}`, true));
        if (/^https:/.test(r.winnerCountry.flagImageUrl || '')) embed.setThumbnail(r.winnerCountry.flagImageUrl);
      }
    }
    return {
      content: r.winners && r.winners.length ? r.winners.slice(0, 10).map((x) => `<@${x.id}>`).join(' ') : undefined,
      embeds: [embed],
      allowedMentions: { users: (r.winners || []).slice(0, 10).map((x) => x.id) }
    };
  }

  // ---------------- القناة والرسائل ----------------
  async function channelOf(round) {
    const client = getClient();
    if (!client) return null;
    return client.channels.cache.get(round.channelId) || (await client.channels.fetch(round.channelId).catch(() => null));
  }

  async function fetchMessage(round, id) {
    const ch = await channelOf(round);
    if (!ch || !id) return null;
    return ch.messages.fetch(id).catch(() => null);
  }

  // تعديل رسالة؛ لو انحذفت نرسل بدلها ونربط الراوند بالجديدة
  async function editOrResend(round, field, payload) {
    const ch = await channelOf(round);
    if (!ch) return gone(round);
    const id = round[field];
    try {
      if (id) {
        const msg = await ch.messages.fetch(id).catch((err) => {
          if (err && err.code === 10008) return null;
          throw err;
        });
        if (msg) return await msg.edit(payload);
      }
      const sent = await ch.send(payload);
      round[field] = sent.id;
      manager._scheduleSave(round, true);
      return sent;
    } catch (err) {
      if (GONE_CODES.includes(err && err.code)) return gone(round);
      logger.warn('راوند: تعذّر تحديث الرسالة', { roundId: round.roundId, field, code: err && err.code });
      return null;
    }
  }

  function gone(round) {
    if (manager.isActive(round)) manager._cancel(round, 'channel_gone');
    return null;
  }

  // ---------------- التحديث الذكي ----------------
  function mark(round, kind) {
    let st = state.get(round.roundId);
    if (!st) state.set(round.roundId, (st = { timer: null, lastEdit: 0, busy: false, dirty: new Set() }));
    st.dirty.add(kind);
    if (st.timer || st.busy) return;
    const wait = Math.max(DEBOUNCE_MS, MIN_EDIT_GAP_MS - (Date.now() - st.lastEdit));
    st.timer = setTimeout(() => flush(round), wait);
    if (st.timer.unref) st.timer.unref();
  }

  async function flush(round) {
    const st = state.get(round.roundId);
    if (!st) return;
    st.timer = null;
    if (st.busy) return;
    st.busy = true;
    try {
      while (st.dirty.size) {
        const kinds = [...st.dirty];
        st.dirty.clear();
        if (kinds.includes('lobby')) await editOrResend(round, 'lobbyMessageId', lobbyPayload(round));
        if (kinds.includes('live') && round.liveMessageId) await editOrResend(round, 'liveMessageId', livePayload(round));
        st.lastEdit = Date.now();
      }
    } finally {
      st.busy = false;
    }
    if (st.dirty.size) mark(round, [...st.dirty][0]);
  }

  // لحظة حاسمة (بدء/نهاية): نمرّر فوراً بدون انتظار الـdebounce
  async function flushNow(round) {
    const st = state.get(round.roundId) || (state.set(round.roundId, { timer: null, lastEdit: 0, busy: false, dirty: new Set() }), state.get(round.roundId));
    clearTimeout(st.timer);
    st.timer = null;
    while (st.busy) await new Promise((r) => setTimeout(r, 20));
    await flush(round);
  }

  // ---------------- ربط الأحداث ----------------
  function wire() {
    const interesting = new Set(['player_eliminated', 'pick_skipped', 'hunt_started', 'sniper_selected', 'chooser_selected', 'spin', 'players_auto_removed', 'shot_fired', 'player_hidden']);
    manager.on('change', (round) => {
      if (round.status === 'waiting') return mark(round, 'lobby');
      if (round.status === 'running') {
        const recent = round.rt.pending.some((e) => interesting.has(e.eventType));
        if (recent || !round.liveMessageId) mark(round, 'live');
      }
      return undefined;
    });
    manager.on('started', async (round) => {
      try {
        await editOrResend(round, 'lobbyMessageId', lobbyPayload(round)); // قفل الأزرار
        const ch = await channelOf(round);
        if (!ch) return;
        const sent = await ch.send(livePayload(round)); // رسالة جديدة للمتابعة الحية
        round.liveMessageId = sent.id;
        manager._scheduleSave(round, true);
      } catch (err) {
        if (GONE_CODES.includes(err && err.code)) gone(round);
        else logger.warn('راوند: تعذّر إرسال رسالة المتابعة الحية', { roundId: round.roundId, code: err && err.code });
      }
    });
    manager.on('starting', (round) => mark(round, 'lobby'));
    manager.on('cancelled', async (round) => {
      const st = state.get(round.roundId);
      if (st) clearTimeout(st.timer);
      await editOrResend(round, 'lobbyMessageId', lobbyPayload(round));
      if (round.liveMessageId) await editOrResend(round, 'liveMessageId', livePayload(round));
      state.delete(round.roundId);
    });
    manager.on('finished', async (round) => {
      try {
        const st = state.get(round.roundId);
        if (st) clearTimeout(st.timer);
        // لا نحذف رسالة البث: نحدّثها إلى "انتهى الراوند"
        if (round.liveMessageId) await editOrResend(round, 'liveMessageId', livePayload(round));
        // إعلان واحد فقط حتى مع تكرار الحدث أو إعادة التشغيل
        if (!(await store.claimAnnouncement(round.roundId))) return;
        round.resultAnnounced = true;
        const ch = await channelOf(round);
        if (ch) await ch.send(winnerPayload(round)).catch((err) => logger.warn('راوند: تعذّر إعلان الفائز', { roundId: round.roundId, code: err && err.code }));
      } finally {
        state.delete(round.roundId);
      }
    });
    manager.on('kicked', async (round, target) => {
      const client = getClient();
      if (!client) return;
      const user = await client.users.fetch(target.id).catch(() => null);
      if (user) {
        await user.send({
          embeds: [eb.warning(`طردك صاحب الراوند من **${meta(round).name}** — ما تقدر تدخل نفس الراوند مرة ثانية.`, 'تم طردك')]
        }).catch(() => null);
      }
    });
    manager.on('restored', async (round) => {
      // نربط الرسائل المحفوظة (أو نرسل جديدة لو انحذفت) ونحدّثها
      if (round.status === 'waiting') mark(round, 'lobby');
      else if (round.status === 'running') mark(round, 'live');
    });
    manager.on('aborted', async (rec) => {
      const round = { ...rec, rt: { pending: [] }, events: rec.events || [] };
      const ch = await channelOf(round);
      if (ch) {
        await ch.send({ embeds: [eb.warning('تعذّرت استعادة هذا الراوند بعد إعادة تشغيل البوت، فأُنهي بأمان بدون فائز. اكتب أمر اللعبة لراوند جديد.', 'انتهى الراوند')] }).catch(() => null);
      }
    });
  }

  return { wire, lobbyPayload, livePayload, winnerPayload, mark, flush, flushNow, roundUrl: (id) => roundUrl(baseUrl, id), watchUrl: (id) => watchUrl(baseUrl, id), fetchMessage, _state: state };
}

module.exports = { createPresenter, CANCEL_REASONS };
