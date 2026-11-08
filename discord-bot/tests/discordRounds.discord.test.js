'use strict';

// اختبارات جانب ديسكورد لراوندات الألعاب: الأوامر، رسالة الانتظار، المتابعة الحية، إعلان الفائز، الأزرار.
// ديسكورد مزيّف بالكامل (قنوات/رسائل/تفاعلات) — ما فيه اتصال حقيقي.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MessageFlags } = require('discord.js');

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  GEMINI_API_KEY: 'test-gemini-key',
  CLIENT_ID: '1552260327008247879',
  API_BASE_URL: 'http://127.0.0.1:9',
  API_KEY: 'k'.repeat(40),
  LOG_LEVEL: 'error'
});

const rounds = require('../services/discordRounds');
const { RoundManager } = require('../services/discordRounds/roundManager');
const { createMemoryStore } = require('../services/discordRounds/roundStore');
const { FAST, wait, until, profile } = require('./helpers/roundsHarness');
const { makeGuild, makeMember, makeChannel, makeInteraction } = require('./helpers/discordMock');
const { onRoundButton } = require('../services/discordRounds/command');
const countriesCmd = require('../commands/games/countries');
const roulette = require('../commands/games/roulette');
const sniperCmd = require('../commands/games/sniper');
const memberRemove = require('../events/guildMemberRemove');

const BASE = 'https://rounds.test';

// قناة ورسائل مزيّفة تسجّل كل إرسال/تعديل
function fakeChannel(id) {
  const msgs = new Map();
  let n = 0;
  const ch = {
    id,
    sent: [],
    edits: [],
    failSend: null,
    messages: {
      async fetch(mid) {
        const m = msgs.get(mid);
        if (!m || m.deleted) throw Object.assign(new Error('Unknown Message'), { code: 10008 });
        return m;
      }
    },
    async send(payload) {
      if (ch.failSend) throw Object.assign(new Error('Missing Access'), { code: ch.failSend });
      const m = {
        id: `m${++n}`,
        payload,
        deleted: false,
        async edit(p) {
          if (m.deleted) throw Object.assign(new Error('Unknown Message'), { code: 10008 });
          m.payload = p;
          ch.edits.push({ id: m.id, payload: p });
          return m;
        }
      };
      msgs.set(m.id, m);
      ch.sent.push(m);
      return m;
    }
  };
  return ch;
}

const json = (payload) => (payload.embeds || []).map((e) => (e.toJSON ? e.toJSON() : e));
const flat = (payload) => JSON.stringify(json(payload));

async function world({ members = 8, settings, store = createMemoryStore(), configured = true } = {}) {
  rounds._reset();
  const guild = makeGuild();
  const people = Array.from({ length: members }, (_, i) => makeMember(guild, { id: String(800000000000000000n + BigInt(i)), username: `u${i}` }));
  const channelMock = makeChannel(guild);
  const chan = fakeChannel(channelMock.id);
  const dms = [];
  const client = {
    channels: { cache: new Map([[chan.id, chan]]), fetch: async (id) => (id === chan.id ? chan : null) },
    users: { fetch: async (id) => ({ id, send: async (p) => dms.push({ id, p }) }) }
  };
  const manager = new RoundManager({ store, settings: { ...FAST, ...settings } });
  const rt = await rounds.init({ getClient: () => client, config: { rounds: { publicUrl: configured ? BASE : null, clientSecret: configured ? 'x' : null } }, manager, store });
  rt.configured = configured;
  const run = async (cmd, who, opts = {}) => {
    const i = makeInteraction({ guild, member: who, commandName: cmd.data.name, channelId: chan.id });
    await cmd.execute(i);
    return i;
  };
  const press = async (who, customId, values) => {
    const i = makeInteraction({ guild, member: who, kind: values ? 'select' : 'button', customId, values, channelId: chan.id });
    await onRoundButton(i, customId.split(':').slice(1));
    return i;
  };
  const prof = (m) => ({ id: m.id, name: `لاعب-${m.user.username}`, username: m.user.username, avatarUrl: null });
  return { guild, people, chan, client, manager, rt, run, press, dms, prof, store };
}

const cleanup = async () => { await rounds.shutdown(); rounds._reset(); };

test('/دول: ينشئ راوند مرتبط بالقناة والمضيف، ورسالة انتظار برابط الراوند بدون زر انضمام', async (t) => {
  const w = await world();
  t.after(cleanup);
  const i = await w.run(countriesCmd, w.people[0]);
  const [type, payload] = i.log.find(([x]) => x === 'reply');
  const round = w.manager.getByChannel(w.chan.id);
  assert.ok(round);
  assert.equal(round.gameType, 'countries');
  assert.equal(round.hostDiscordId, w.people[0].id);
  assert.equal(round.guildId, w.guild.id);
  assert.equal(round.platform, 'discord');
  assert.equal(round.status, 'waiting');
  assert.match(round.roundId, /^[A-Za-z0-9_-]{22}$/, 'معرّف عشوائي 128 بت');
  assert.equal(round.lobbyMessageId, 'reply-' + i.id);
  const e = json(payload)[0];
  assert.equal(e.title, 'احسمها | لعبة الدول');
  assert.match(e.description, /تم إنشاء راوند جديد/);
  assert.match(e.description, /بانتظار اللاعبين/);
  const field = (n) => e.fields.find((f) => f.name === n);
  assert.equal(field('صاحب الراوند').value, `<@${w.people[0].id}>`);
  assert.equal(field('اللاعبون').value, '1 / 50');
  assert.equal(field('الحد الأدنى للبدء').value, '3 لاعبين');
  assert.ok(field('الدخول للراوند').value.includes(`${BASE}/discord/round/${round.roundId}`));
  // الأزرار: رابط + بدء + طرد + إلغاء. ولا زر انضمام/خروج أبداً
  const comps = payload.components[0].toJSON().components;
  const ids = comps.map((c) => c.custom_id || c.url);
  assert.deepEqual(comps.map((c) => c.label), ['رابط الراوند', 'بدء الراوند', 'طرد لاعب', 'إلغاء']);
  assert.equal(comps[0].url, `${BASE}/discord/round/${round.roundId}`);
  assert.ok(!ids.some((x) => /join|leave/.test(x)));
  assert.ok(!JSON.stringify(payload.components).includes('انضمام'));
});

test('أمر ثاني بنفس القناة ← رسالة واضحة بدون راوند جديد؛ وبدون إعداد OAuth ← رسالة إعداد', async (t) => {
  const w = await world();
  t.after(cleanup);
  await w.run(countriesCmd, w.people[0]);
  const second = await w.run(roulette, w.people[1]);
  const [, p] = second.log.find(([x]) => x === 'reply');
  assert.equal(p.flags, MessageFlags.Ephemeral);
  assert.match(flat(p), /يوجد راوند نشط/);
  assert.equal(w.manager.list().length, 1);

  const w2 = await world({ configured: false });
  const i = await w2.run(sniperCmd, w2.people[0]);
  const [, p2] = i.log.find(([x]) => x === 'reply');
  assert.match(flat(p2), /ROUNDS_PUBLIC_URL/);
  assert.equal(w2.manager.list().length, 0, 'ما يرجع للطريقة القديمة ولا ينشئ راوند');
});

test('تحديث رسالة الانتظار: نفس الرسالة تتعدّل (ما تتكرر) وعدة انضمامات متقاربة = تعديل مجمّع بآخر حالة', async (t) => {
  const w = await world({ members: 12, settings: { playerGraceMs: 60000 } });
  t.after(cleanup);
  await w.run(countriesCmd, w.people[0]);
  const round = w.manager.getByChannel(w.chan.id);
  const lobbyMsg = (await w.chan.messages.fetch(round.lobbyMessageId).catch(() => null));
  // رد التفاعل مو من القناة المزيّفة — نربطه برسالة داخل القناة المزيّفة
  const seed = await w.chan.send({ embeds: [] });
  round.lobbyMessageId = seed.id;
  void lobbyMsg;
  for (let i = 1; i <= 10; i++) w.manager.join(round.roundId, w.prof(w.people[i]));
  await until(() => w.chan.edits.length >= 1, 4000);
  await wait(900);
  assert.equal(w.chan.sent.length, 1, 'ما انرسلت رسائل جديدة');
  assert.ok(w.chan.edits.length <= 2, `10 انضمامات = ${w.chan.edits.length} تعديل فقط`);
  const last = w.chan.edits.at(-1).payload;
  const text = flat(last);
  assert.match(text, /11 \/ 50/);
  for (let i = 1; i <= 10; i++) assert.ok(text.includes(`لاعب-u${i}`), `ظهر لاعب ${i}`);
  // خروج لاعب ← الرسالة تقل
  w.manager.kick(round.roundId, w.people[0].id, w.people[3].id);
  await until(() => !flat(w.chan.edits.at(-1).payload).includes('لاعب-u3'), 4000);
  assert.match(flat(w.chan.edits.at(-1).payload), /10 \/ 50/);
});

test('كثرة المشاركين (50): الرسالة تبقى ضمن حدود Embed ولا تتوقف التحديثات', async (t) => {
  const w = await world({ members: 50 });
  t.after(cleanup);
  await w.run(countriesCmd, w.people[0]);
  const round = w.manager.getByChannel(w.chan.id);
  for (let i = 1; i < 50; i++) w.manager.join(round.roundId, w.prof(w.people[i]));
  const payload = w.rt.presenter.lobbyPayload(round);
  const e = json(payload)[0];
  const total = (e.title || '').length + (e.description || '').length + e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0) + ((e.footer && e.footer.text) || '').length;
  assert.ok(total < 6000, `الحجم ${total}`);
  assert.ok(e.fields.length <= 25);
  assert.ok(e.fields.every((f) => f.value.length <= 1024 && f.value.length > 0));
  assert.match(JSON.stringify(e.fields), /50 \/ 50|\(50\)/);
  assert.equal(w.manager.join(round.roundId, profile(77)).reason, 'FULL', 'الحد الأقصى 50');
});

test('أزرار المضيف: غير المضيف يُرفض، البدء بقرار المضيف فقط، وضغطة ثانية ما تبدأ مرتين', async (t) => {
  const w = await world({ members: 6 });
  t.after(cleanup);
  await w.run(countriesCmd, w.people[0]);
  const round = w.manager.getByChannel(w.chan.id);
  for (let i = 1; i < 5; i++) w.manager.join(round.roundId, w.prof(w.people[i]));
  // لاعب عادي يحاول البدء/الطرد/الإلغاء
  for (const act of ['start', 'kick', 'cancel']) {
    const i = await w.press(w.people[2], `rd:${act}:${round.roundId}`);
    const [, p] = i.log.find(([x]) => x === 'reply');
    assert.equal(p.flags, MessageFlags.Ephemeral, act);
    assert.match(flat(p), /لصاحب الراوند/);
  }
  assert.equal(round.status, 'waiting');
  assert.equal(round.players.length, 5);
  // العدد مكتمل لكن ما يبدأ لحاله
  await wait(300);
  assert.equal(round.status, 'waiting');
  // المضيف يبدأ
  const started = [];
  w.manager.on('started', (r) => started.push(r));
  const a = await w.press(w.people[0], `rd:start:${round.roundId}`);
  assert.ok(a.log.some(([x]) => x === 'deferUpdate'));
  const b = await w.press(w.people[0], `rd:start:${round.roundId}`);
  const [, p] = b.log.find(([x]) => x === 'reply');
  assert.match(flat(p), /بدأ بالفعل/);
  await until(() => round.status === 'running');
  assert.equal(started.length, 1);
});

test('البدء: رسالة الانتظار تنقفل + رسالة متابعة حية جديدة برابط المشاهدة، وتتحدث للأحداث', async (t) => {
  const w = await world({ members: 5 });
  t.after(cleanup);
  await w.run(countriesCmd, w.people[0]);
  const round = w.manager.getByChannel(w.chan.id);
  const seed = await w.chan.send({ embeds: [] });
  round.lobbyMessageId = seed.id;
  for (let i = 1; i < 4; i++) w.manager.join(round.roundId, w.prof(w.people[i]));
  w.manager.start(round.roundId, w.people[0].id);
  await until(() => round.liveMessageId, 4000);
  const live = w.chan.sent.find((m) => m.id === round.liveMessageId);
  assert.notEqual(live.id, seed.id, 'رسالة جديدة غير رسالة الانتظار');
  const e = json(live.payload)[0];
  assert.equal(e.title, 'احسمها | الراوند مباشر الآن');
  assert.equal(e.fields.find((f) => f.name === 'اللعبة').value, 'لعبة الدول');
  assert.equal(e.fields.find((f) => f.name === 'المشاركون').value, '4');
  const watchBtn = live.payload.components[0].toJSON().components[0];
  assert.equal(watchBtn.url, `${BASE}/discord/watch/${round.roundId}`);
  // رسالة الانتظار انقفلت (الأزرار معطلة ما عدا الرابط)
  await until(() => w.chan.edits.some((x) => x.id === seed.id && flat(x.payload).includes('بدأ الراوند')), 4000);
  const lockedRow = w.chan.edits.filter((x) => x.id === seed.id).at(-1).payload.components[0].toJSON().components;
  assert.ok(lockedRow.filter((c) => c.custom_id).every((c) => c.disabled === true));
});

test('نهاية الراوند: رسالة المتابعة تتحول إلى "انتهى الراوند" (ما تنحذف)، والفائز يُعلن مرة وحدة حتى مع تكرار الحدث', async (t) => {
  const w = await world({ members: 4, settings: { playerGraceMs: 60000 } });
  t.after(cleanup);
  await w.run(roulette, w.people[0]);
  const round = w.manager.getByChannel(w.chan.id);
  const seed = await w.chan.send({ embeds: [] });
  round.lobbyMessageId = seed.id;
  for (let i = 1; i < 3; i++) w.manager.join(round.roundId, w.prof(w.people[i]));
  w.manager.start(round.roundId, w.people[0].id);
  await until(() => round.liveMessageId, 4000);
  let guard = 0;
  while (round.status === 'running' && guard++ < 100) {
    await until(() => round.status !== 'running' || round.game.phase === 'choosing');
    if (round.status !== 'running') break;
    const target = round.game.alive.find((x) => x !== round.game.chooserId);
    w.manager.act(round.roundId, round.game.chooserId, 'pick', { value: target });
  }
  await until(() => round.status === 'finished');
  const isWin = (m) => m.id !== round.liveMessageId && /النتيجة/.test(flat(m.payload));
  await until(() => w.chan.sent.some(isWin), 4000);
  // تكرار حدث النهاية (مثل إعادة تسليم) ما يكرر الإعلان
  w.manager.emit('finished', round);
  w.manager.emit('finished', round);
  await wait(300);
  const announcements = w.chan.sent.filter(isWin);
  assert.equal(announcements.length, 1, 'إعلان واحد');
  const win = json(announcements[0].payload)[0];
  assert.match(win.description, new RegExp(`<@${round.result.winnerIds[0]}>`));
  assert.equal(announcements[0].payload.allowedMentions.users[0], round.result.winnerIds[0]);
  // رسالة المتابعة الحية انحدّثت إلى "انتهى الراوند" وبقيت موجودة
  const live = w.chan.sent.find((m) => m.id === round.liveMessageId);
  assert.equal(live.deleted, false);
  assert.equal(json(live.payload)[0].title, 'احسمها | انتهى الراوند');
  assert.equal(live.payload.components.length, 0, 'لا رابط مشاهدة بعد النهاية');
  assert.equal(w.manager.getByChannel(w.chan.id), null, 'القناة تحررت لراوند جديد');
  assert.equal((await w.run(sniperCmd, w.people[1])).log.some(([x]) => x === 'reply'), true);
  assert.ok(w.manager.getByChannel(w.chan.id), 'راوند جديد أُنشئ');
});

test('الطرد من ديسكورد: قائمة بأسماء المشاركين للمضيف، يُطرد ويصله خاص، ولا يعود', async (t) => {
  const w = await world({ members: 5 });
  t.after(cleanup);
  await w.run(countriesCmd, w.people[0]);
  const round = w.manager.getByChannel(w.chan.id);
  for (let i = 1; i < 4; i++) w.manager.join(round.roundId, w.prof(w.people[i]));
  const k = await w.press(w.people[0], `rd:kick:${round.roundId}`);
  const [, p] = k.log.find(([x]) => x === 'reply');
  const menu = p.components[0].toJSON().components[0];
  assert.deepEqual(menu.options.map((o) => o.value).sort(), [1, 2, 3].map((i) => w.people[i].id).sort(), 'بدون المضيف');
  const sel = await w.press(w.people[0], `rd:kicksel:${round.roundId}`, [w.people[2].id]);
  assert.match(flat(sel.log.find(([x]) => x === 'update')[1]), /تم طرد/);
  assert.ok(!round.players.some((x) => x.id === w.people[2].id));
  await until(() => w.dms.length === 1);
  assert.equal(w.dms[0].id, w.people[2].id);
  assert.equal(w.manager.join(round.roundId, w.prof(w.people[2])).reason, 'KICKED');
  // لاعب عادي ما يستطيع حتى فتح قائمة الطرد
  const bad = await w.press(w.people[1], `rd:kicksel:${round.roundId}`, [w.people[3].id]);
  assert.match(flat(bad.log.find(([x]) => x === 'reply')[1]), /لصاحب الراوند/);
  assert.ok(round.players.some((x) => x.id === w.people[3].id));
});

test('رسالة الانتظار انحذفت ← تُرسل بدلها وتُربط بالراوند؛ القناة انحذفت ← الراوند يُلغى', async (t) => {
  const w = await world({ members: 4, settings: { playerGraceMs: 60000 } });
  t.after(cleanup);
  await w.run(countriesCmd, w.people[0]);
  const round = w.manager.getByChannel(w.chan.id);
  const seed = await w.chan.send({ embeds: [] });
  round.lobbyMessageId = seed.id;
  seed.deleted = true;
  w.manager.join(round.roundId, w.prof(w.people[1]));
  await until(() => round.lobbyMessageId !== seed.id, 4000);
  const replacement = w.chan.sent.find((m) => m.id === round.lobbyMessageId);
  assert.match(flat(replacement.payload), /2 \/ 50/);
  w.chan.failSend = 50001;
  w.chan.sent.at(-1).deleted = true;
  w.manager.join(round.roundId, w.prof(w.people[2]));
  await until(() => round.status === 'cancelled', 4000);
  assert.equal(round.cancelReason, 'channel_gone');
  assert.equal(w.manager.getByChannel(w.chan.id), null);
});

test('عضو غادر السيرفر: ينشال من الانتظار، ويُقصى بأمان أثناء اللعب بدون كسر الراوند', async (t) => {
  const w = await world({ members: 6 });
  t.after(cleanup);
  await w.run(countriesCmd, w.people[0]);
  const round = w.manager.getByChannel(w.chan.id);
  for (let i = 1; i < 5; i++) w.manager.join(round.roundId, w.prof(w.people[i]));
  await memberRemove.execute({}, { id: w.people[4].id, guild: { id: w.guild.id } });
  assert.equal(round.players.length, 4);
  w.manager.start(round.roundId, w.people[0].id);
  await until(() => round.status === 'running');
  await memberRemove.execute({}, { id: w.people[3].id, guild: { id: w.guild.id } });
  assert.ok(!round.game.alive.includes(w.people[3].id));
  assert.equal(round.game.eliminated.find((e) => e.id === w.people[3].id).reason, 'left');
  assert.equal(round.status, 'running');
  // راوند بسيرفر ثاني ما يتأثر
  await memberRemove.execute({}, { id: w.people[2].id, guild: { id: 'other-guild' } });
  assert.ok(round.game.alive.includes(w.people[2].id));
});

test('إعادة تشغيل البوت أثناء الانتظار وأثناء اللعب: الاستعادة تكمل بدون تكرار الإعلان', async (t) => {
  const store = createMemoryStore();
  const w = await world({ members: 4, store, settings: { playerGraceMs: 60000 } });
  t.after(cleanup);
  await w.run(roulette, w.people[0]);
  const round = w.manager.getByChannel(w.chan.id);
  for (let i = 1; i < 3; i++) w.manager.join(round.roundId, w.prof(w.people[i]));
  w.manager.start(round.roundId, w.people[0].id);
  await until(() => round.status === 'running' && round.liveMessageId, 4000);
  await wait(30);
  const roundId = round.roundId;
  const live = round.liveMessageId;
  await w.manager.flush();
  const channel = w.chan;
  await rounds.shutdown(); // "إعادة التشغيل"
  rounds._reset();

  const dms = [];
  const client = { channels: { cache: new Map([[channel.id, channel]]), fetch: async () => channel }, users: { fetch: async (id) => ({ id, send: async (p) => dms.push(p) }) } };
  const manager2 = new RoundManager({ store, settings: FAST });
  const rt2 = await rounds.init({ getClient: () => client, config: { rounds: { publicUrl: BASE, clientSecret: 'x' } }, manager: manager2, store });
  const r2 = manager2.get(roundId);
  assert.ok(r2, 'الراوند انستعاد');
  assert.equal(r2.status, 'running');
  assert.equal(r2.liveMessageId, live, 'نفس رسالة المتابعة');
  assert.equal(manager2.getByChannel(channel.id), r2, 'القناة محجوزة');
  // يكمل: يفوز أحد، ويُعلن مرة وحدة
  let guard = 0;
  while (r2.status === 'running' && guard++ < 100) {
    await until(() => r2.status !== 'running' || r2.game.phase === 'choosing');
    if (r2.status !== 'running') break;
    manager2.act(roundId, r2.game.chooserId, 'pick', { value: r2.game.alive.find((x) => x !== r2.game.chooserId) });
  }
  await until(() => r2.status === 'finished');
  const isWin = (m) => m.id !== live && /النتيجة/.test(flat(m.payload));
  await until(() => channel.sent.some(isWin), 4000);
  await wait(200);
  assert.equal(channel.sent.filter(isWin).length, 1);
  void rt2;
});

test('الاستعادة: سجل تالف أو لعبة مجهولة ← يُنهى بأمان برسالة بدون فائز', async (t) => {
  const store = createMemoryStore();
  await store.save({ roundId: 'AAAAAAAAAAAAAAAAAAAAAA', gameType: 'ghost-game', guildId: 'g', channelId: 'c1', hostDiscordId: '1', status: 'running', players: [], createdAt: 1 });
  const chan = fakeChannel('c1');
  const client = { channels: { cache: new Map([['c1', chan]]), fetch: async () => chan }, users: { fetch: async () => null } };
  rounds._reset();
  const manager = new RoundManager({ store, settings: FAST });
  await rounds.init({ getClient: () => client, config: { rounds: { publicUrl: BASE, clientSecret: 'x' } }, manager, store });
  t.after(cleanup);
  await until(() => chan.sent.length === 1);
  assert.match(flat(chan.sent[0].payload), /تعذّرت استعادة/);
  assert.equal(manager.list().length, 0);
  assert.equal((await store.load('AAAAAAAAAAAAAAAAAAAAAA')).status, 'cancelled');
});

test('الأوامر القديمة غير موصولة: الأوامر الثلاثة وحدث المغادرة ما يعتمدون على محرّك اللوبي القديم', () => {
  const root = path.join(__dirname, '..');
  const legacy = /lobbyManager|eliminationGame|countriesGame|sniperGame|services\/roulette|gameCommand/;
  for (const f of ['commands/games/countries.js', 'commands/games/roulette.js', 'commands/games/sniper.js', 'events/guildMemberRemove.js', 'services/discordRounds/command.js', 'services/discordRounds/presenter.js', 'services/discordRounds/roundManager.js']) {
    assert.ok(!legacy.test(fs.readFileSync(path.join(root, f), 'utf8')), `${f} يعتمد على القديم`);
  }
  const { loadCommands } = require('../utils/commandLoader');
  const { buttons } = loadCommands();
  for (const old of ['rt', 'dl', 'sn']) assert.equal(buttons.has(old), false, `زر قديم ${old} ما عاد مسجّل`);
  assert.equal(buttons.has('rd'), true);
});
