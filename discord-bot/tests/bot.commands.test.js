'use strict';

// اختبار مسارات البوت كاملة بدون اتصال فعلي بـDiscord:
// تفاعلات وهمية (mock interactions) تمر عبر نفس موزّع interactionCreate الحقيقي،
// والـAPI خادم وهمي محلي نتحكم بردوده (موجود/غير موجود/خطأ سيرفر/بطء/...).

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { PermissionsBitField, PermissionFlagsBits, InteractionType } = require('discord.js');

const ADMIN_ID = '900000000000000001';
let userSeq = 100000000000000000n;
const nextUserId = () => String(++userSeq);

// ---------------- API وهمي ----------------
const stub = { routes: new Map(), calls: [] };
function route(method, pathPrefix, handler) {
  stub.routes.set(`${method} ${pathPrefix}`, handler);
}
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    stub.calls.push({ method: req.method, url: req.url, key: req.headers['x-api-key'] });
    const url = req.url.split('?')[0];
    const entry = [...stub.routes.entries()].find(([k]) => {
      const [m, p] = k.split(' ');
      return m === req.method && url.startsWith(p);
    });
    if (!entry) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'no route' } }));
    }
    const out = await entry[1]({ url, query: req.url.split('?')[1] || '', body: body ? JSON.parse(body) : null });
    if (out === 'HANG') return; // لا رد أبداً → اختبار المهلة
    res.writeHead(out.status || 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out.json));
  });
});
const okJson = (data, status = 200) => ({ status, json: { ok: true, data } });
const errJson = (status, code, details) => ({ status, json: { ok: false, error: { code, message: code, details } } });

// ---------------- تفاعل وهمي ----------------
function fakeUser(id, username = 'user' + id.slice(-4), bot = false) {
  return {
    id,
    username,
    bot,
    toString: () => `<@${id}>`,
    displayAvatarURL: () => `https://cdn.discordapp.com/embed/avatars/0.png`
  };
}

function makeInteraction({ kind = 'command', commandName, customId, user, options = {}, admin = false }) {
  const log = [];
  const perms = new PermissionsBitField(admin ? [PermissionFlagsBits.Administrator] : []);
  const i = {
    id: String(Math.random()),
    type: kind === 'command' ? InteractionType.ApplicationCommand : kind === 'autocomplete' ? InteractionType.ApplicationCommandAutocomplete : InteractionType.MessageComponent,
    commandName,
    customId,
    user,
    guildId: '555555555555555555',
    channelId: '666666666666666666',
    deferred: false,
    replied: false,
    memberPermissions: perms,
    appPermissions: new PermissionsBitField(PermissionsBitField.All),
    inGuild: () => true,
    isChatInputCommand: () => kind === 'command',
    isButton: () => kind === 'button',
    isRepliable: () => kind !== 'autocomplete',
    isAutocomplete: () => kind === 'autocomplete',
    options: {
      getUser: (n) => options[n] || null,
      getString: (n) => (options[n] === undefined ? null : options[n]),
      getFocused: () => options.__focused || ''
    },
    async respond(choices) { log.push(['respond', choices]); },
    client: {
      users: { fetch: async (id) => fakeUser(id, 'fetched' + id.slice(-3)) },
      guilds: { cache: { size: 3 } },
      ws: { ping: 42 }
    },
    log,
    async reply(p) { this.replied = true; log.push(['reply', p]); },
    async deferReply(p) { this.deferred = true; log.push(['deferReply', p || {}]); },
    async deferUpdate() { this.deferred = true; log.push(['deferUpdate']); },
    async editReply(p) { this.replied = true; log.push(['editReply', p]); },
    async followUp(p) { log.push(['followUp', p]); }
  };
  return i;
}

// آخر رسالة فعلية أرسلها البوت (مع تحويل الـEmbeds لـJSON)
function lastMessage(i) {
  const sent = i.log.filter(([t]) => ['reply', 'editReply', 'followUp'].includes(t));
  assert.ok(sent.length, 'البوت ما رد: ' + JSON.stringify(i.log));
  const [type, p] = sent[sent.length - 1];
  const embeds = (p.embeds || []).map((e) => (e.toJSON ? e.toJSON() : e));
  const components = (p.components || []).map((c) => (c.toJSON ? c.toJSON() : c));
  return { type, p, embeds, components, text: JSON.stringify(embeds) };
}
const isEphemeral = (i) => i.log.some(([t, p]) => (t === 'deferReply' || t === 'reply' || t === 'followUp') && p && p.flags && (Number(p.flags) & 64));

// ---------------- البيانات النموذجية ----------------
const PROFILE = {
  username: 'Alice_1', registered: true, tiktokUsername: 'alice.tt', level: 7, xp: 900,
  xpIntoLevel: 120, xpForNextLevel: 555, levelPercent: 21, isMaxLevel: false, points: 350, roundsPlayed: 40,
  profileUrl: 'https://ehsmaha.com/profile', avatarUrl: null, joinedAt: '2025-01-15T10:00:00.000Z'
};
const STATS = {
  ...PROFILE, wins: { total: 13, solo: 3, online: 2, stream: 8 }, losses: 27, winRate: 32.5,
  mostPlayedGame: { tag: 'bomb', name: 'القنبلة المتحركة', count: 12 }, bestRoundPoints: 120,
  globalRank: 4, totalRanked: 1500, recentGames: [{ tag: 'bomb', name: 'القنبلة المتحركة', at: new Date().toISOString() }]
};

let ctx;
let dispatch;

test.before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  Object.assign(process.env, {
    DISCORD_TOKEN: 'test-token-not-real',
    CLIENT_ID: '1552260327008247879',
    API_BASE_URL: `http://127.0.0.1:${server.address().port}`,
    API_KEY: 'k'.repeat(40),
    ADMIN_IDS: ADMIN_ID,
    API_TIMEOUT_MS: '1000',
    COMMAND_COOLDOWN_MS: '3000',
    BUTTON_COOLDOWN_MS: '0',
    LOG_LEVEL: 'error'
  });
  const { loadConfig } = require('../config');
  const { loadCommands } = require('../utils/commandLoader');
  const loaded = loadCommands();
  ctx = { config: loadConfig(), commands: loaded.commands, buttons: loaded.buttons, logger: require('../utils/logger') };
  const handler = require('../events/interactionCreate');
  dispatch = (i) => handler.execute(ctx, i);
});
test.after(() => server.close());
test.beforeEach(() => {
  stub.routes.clear();
  stub.calls.length = 0;
  require('../utils/cache').flush();
});

// =====================================================================

const PLAYER_CMDS = [
  { name: 'بروفايل', path: '/api/discord/profile-by-username/', data: () => PROFILE, title: /👑 Alice\\_1/ },
  { name: 'احصائيات', path: '/api/discord/stats-by-username/', data: () => STATS, title: /إحصائيات Alice\\_1/ }
];

test('/بروفايل بيوزر موجود: Embed كامل + زرين', async () => {
  route('GET', '/api/discord/profile-by-username/', () => okJson(PROFILE));
  const i = makeInteraction({ commandName: 'بروفايل', user: fakeUser(nextUserId()), options: { 'يوزر': '  @Alice_1 ' } });
  await dispatch(i);
  const m = lastMessage(i);
  assert.equal(m.type, 'editReply');
  assert.ok(!isEphemeral(i)); // البروفايل رسالة عامة بالقناة
  const e = m.embeds[0];
  assert.match(e.title, /Alice\\_1/);
  assert.match(e.description, /▰+▱+/);
  assert.match(e.description, /120 \/ 555/);
  assert.equal(e.footer.text, 'احسمها | ehsmaha.com');
  assert.ok(e.timestamp);
  assert.equal(e.color, 0x1a0d33);
  assert.equal(e.thumbnail.url, 'https://ehsmaha.com/discord-logo.png'); // بدون أفتار → الشعار
  const names = e.fields.map((f) => f.name);
  for (const n of ['⭐ اللفل', '💎 النقاط', '🎮 الألعاب الملعوبة', '📅 تاريخ الانضمام']) assert.ok(names.includes(n), n);
  const buttons = m.components[0].components;
  assert.equal(buttons[0].custom_id, 'stats:show:Alice_1');
  assert.equal(buttons[1].url, 'https://ehsmaha.com/profile');
  assert.equal(stub.calls[0].key, 'k'.repeat(40)); // المفتاح السري يوصل بالهيدر
  assert.equal(stub.calls[0].url, '/api/discord/profile-by-username/Alice_1'); // تنظيف الفراغات و@
});

test('يوزر عربي: يتشفّر صح بالرابط وبزر الإحصائيات', async () => {
  const arabic = 'أحمد_تيك';
  route('GET', '/api/discord/profile-by-username/', ({ url }) => {
    assert.equal(decodeURIComponent(url.split('/').pop()), arabic);
    return okJson({ ...PROFILE, username: arabic, registered: false });
  });
  const i = makeInteraction({ commandName: 'بروفايل', user: fakeUser(nextUserId()), options: { 'يوزر': arabic } });
  await dispatch(i);
  const m = lastMessage(i);
  assert.match(m.embeds[0].description, /لاعب بث/);
  const statsId = m.components[0].components[0].custom_id;
  assert.equal(statsId, 'stats:show:' + encodeURIComponent(arabic));

  route('GET', '/api/discord/stats-by-username/', ({ url }) => {
    assert.equal(decodeURIComponent(url.split('/').pop()), arabic);
    return okJson({ ...STATS, username: arabic });
  });
  const b = makeInteraction({ kind: 'button', customId: statsId, user: fakeUser(nextUserId()) });
  await dispatch(b);
  assert.ok(isEphemeral(b));
  assert.match(lastMessage(b).embeds[0].title, /إحصائيات أحمد\\_تيك/);
});

for (const cmd of PLAYER_CMDS) {
  test(`/${cmd.name} — يوزر غير موجود: رسالة واضحة بدون إعادة محاولة`, async () => {
    route('GET', cmd.path, () => errJson(404, 'PLAYER_NOT_FOUND'));
    const i = makeInteraction({ commandName: cmd.name, user: fakeUser(nextUserId()), options: { 'يوزر': 'nobody' } });
    await dispatch(i);
    const m = lastMessage(i);
    assert.match(m.text, /لم يتم العثور على لاعب بهذا الاسم، تأكد من كتابته بشكل صحيح كما هو مسجل بالموقع/);
    assert.match(m.text, /nobody/);
    assert.equal(stub.calls.length, 1);
  });

  test(`/${cmd.name} — خطأ سيرفر متكرر: إعادة واحدة ثم رسالة ودّية`, async () => {
    let n = 0;
    route('GET', cmd.path, () => { n++; return errJson(500, 'INTERNAL'); });
    const i = makeInteraction({ commandName: cmd.name, user: fakeUser(nextUserId()), options: { 'يوزر': 'Alice_1' } });
    await dispatch(i);
    assert.equal(n, 2);
    const m = lastMessage(i);
    assert.match(m.text, /حصل خطأ مؤقت، جرّب بعد قليل/);
    assert.doesNotMatch(m.text, /INTERNAL|500|stack/);
  });

  test(`/${cmd.name} — الـAPI لا يستجيب (مهلة) + الـAPI مطفّي تماماً`, async () => {
    let n = 0;
    route('GET', cmd.path, () => { n++; return 'HANG'; });
    const i = makeInteraction({ commandName: cmd.name, user: fakeUser(nextUserId()), options: { 'يوزر': 'Alice_1' } });
    const started = Date.now();
    await dispatch(i);
    assert.equal(n, 2);
    assert.ok(Date.now() - started < 4000);
    assert.match(lastMessage(i).text, /تأخر بالرد/);

    // سيرفر مطفّي تماماً (رفض اتصال على منفذ مقفل)
    const api = require('../utils/apiClient');
    const i2 = makeInteraction({ commandName: cmd.name, user: fakeUser(nextUserId()), options: { 'يوزر': 'Alice_1' } });
    const saved = { p: api.getProfileByUsername, s: api.getStatsByUsername };
    const refused = async () => { throw new api.ApiError('NETWORK_ERROR', 'connect ECONNREFUSED'); };
    api.getProfileByUsername = refused;
    api.getStatsByUsername = refused;
    try {
      await dispatch(i2); // ما يرمي
    } finally {
      api.getProfileByUsername = saved.p;
      api.getStatsByUsername = saved.s;
    }
    assert.match(lastMessage(i2).text, /خطأ مؤقت بالاتصال/);
  });

  test(`/${cmd.name} — يوزر موجود`, async () => {
    route('GET', cmd.path, () => okJson(cmd.data()));
    const i = makeInteraction({ commandName: cmd.name, user: fakeUser(nextUserId()), options: { 'يوزر': 'alice_1' } });
    await dispatch(i);
    assert.match(lastMessage(i).embeds[0].title, cmd.title);
  });
}

test('خطأ مؤقت مرة وحدة ثم نجاح: الإعادة تنقذ الطلب + عرض الإحصائيات بعمودين', async () => {
  let n = 0;
  route('GET', '/api/discord/stats-by-username/', () => (++n === 1 ? errJson(503, 'UNAVAILABLE') : okJson(STATS)));
  const i = makeInteraction({ commandName: 'احصائيات', user: fakeUser(nextUserId()), options: { 'يوزر': 'Alice_1' } });
  await dispatch(i);
  assert.equal(n, 2);
  const e = lastMessage(i).embeds[0];
  const byName = Object.fromEntries(e.fields.map((f) => [f.name, f]));
  assert.match(byName['🏆 الانتصارات'].value, /13/);
  assert.match(byName['💔 الهزائم'].value, /27/);
  assert.match(byName['📈 معدل الفوز'].value, /32\.5%/);
  assert.match(byName['🥇 الترتيب العام'].value, /#4/);
  assert.match(byName['🎯 أكثر لعبة لعبها'].value, /القنبلة المتحركة/);
  assert.match(byName['🔥 أعلى نقاط بجولة'].value, /120/);
  assert.equal(e.fields[2].name, '\u200b');
  assert.ok(e.fields.filter((f) => f.name !== '🕒 آخر الألعاب').every((f) => f.inline));
});

test('Autocomplete: اقتراحات من الموقع، وقائمة فاضية لو الـAPI طايح', async () => {
  route('GET', '/api/discord/search-usernames', ({ query }) => {
    assert.match(decodeURIComponent(query.replace(/\+/g, ' ')), /q=al/);
    return okJson({ results: [{ value: 'Alice_1', label: 'Alice_1', registered: true }, { value: 'alice.tt', label: 'Alice TT (@alice.tt)', registered: false }] });
  });
  const a = makeInteraction({ kind: 'autocomplete', commandName: 'بروفايل', user: fakeUser(nextUserId()), options: { __focused: '@AL' } });
  await dispatch(a);
  const [, choices] = a.log.find(([t]) => t === 'respond');
  assert.deepEqual(choices, [{ name: '👤 Alice_1', value: 'Alice_1' }, { name: '🎮 Alice TT (@alice.tt)', value: 'alice.tt' }]);

  require('../utils/cache').flush();
  route('GET', '/api/discord/search-usernames', () => 'HANG');
  const b = makeInteraction({ kind: 'autocomplete', commandName: 'احصائيات', user: fakeUser(nextUserId()), options: { __focused: 'zz' } });
  const started = Date.now();
  await dispatch(b);
  assert.ok(Date.now() - started < 2900, 'لازم يرد قبل مهلة Discord (3 ثوانٍ)');
  assert.deepEqual(b.log.find(([t]) => t === 'respond')[1], []);

  const c = makeInteraction({ kind: 'autocomplete', commandName: 'بروفايل', user: fakeUser(nextUserId()), options: { __focused: '' } });
  await dispatch(c);
  assert.deepEqual(c.log.find(([t]) => t === 'respond')[1], []);
});

test('Rate limit: أمر ثاني خلال 3 ثوانٍ يُرفض برسالة خاصة', async () => {
  route('GET', '/api/discord/profile-by-username/', () => okJson(PROFILE));
  const user = fakeUser(nextUserId());
  await dispatch(makeInteraction({ commandName: 'بروفايل', user, options: { 'يوزر': 'Alice_1' } }));
  const i2 = makeInteraction({ commandName: 'الموقع', user });
  await dispatch(i2);
  assert.match(lastMessage(i2).text, /جرّب مرة ثانية بعد/);
  assert.ok(isEphemeral(i2));
});

test('/المتصدرين: ميداليات + صفحات + زر التالي + حماية الصفحات', async () => {
  const entries = Array.from({ length: 23 }, (_, k) => ({ rank: k + 1, key: 'p' + k, username: 'Player ' + k, points: 5000 - k * 100, level: 10 }));
  let calls = 0;
  route('GET', '/api/discord/leaderboard', () => { calls++; return okJson({ period: 'global', entries, generatedAt: new Date().toISOString() }); });
  const owner = fakeUser(nextUserId());
  const i = makeInteraction({ commandName: 'المتصدرين', user: owner });
  await dispatch(i);
  const m = lastMessage(i);
  const lines = m.embeds[0].description.split('\n');
  assert.equal(lines.length, 10);
  assert.ok(lines[0].startsWith('🥇') && lines[1].startsWith('🥈') && lines[2].startsWith('🥉'));
  assert.match(lines[3], /#.?4/);
  const [prev, indicator, next] = m.components[0].components;
  assert.equal(prev.disabled, true);
  assert.equal(indicator.label, '1 / 3');
  assert.equal(next.disabled, false);

  const click = makeInteraction({ kind: 'button', customId: next.custom_id, user: owner });
  await dispatch(click);
  const p2 = lastMessage(click);
  assert.equal(p2.type, 'editReply'); // نفس الرسالة تتحدث
  assert.match(p2.embeds[0].description, /Player 10/);
  assert.equal(p2.components[0].components[1].label, '2 / 3');
  assert.equal(calls, 1); // الصفحة الثانية من الكاش

  const intruder = makeInteraction({ kind: 'button', customId: next.custom_id, user: fakeUser(nextUserId()) });
  await dispatch(intruder);
  assert.ok(isEphemeral(intruder));
  assert.match(lastMessage(intruder).text, /لشخص ثاني/);
});

test('/المتصدرين أسبوعي فاضي + قيد التجهيز', async () => {
  route('GET', '/api/discord/leaderboard', ({ query }) => {
    assert.match(query, /period=weekly/);
    return okJson({ period: 'weekly', entries: [], since: new Date().toISOString(), partial: false });
  });
  const i = makeInteraction({ commandName: 'المتصدرين', user: fakeUser(nextUserId()), options: { 'نوع': 'weekly' } });
  await dispatch(i);
  assert.match(lastMessage(i).text, /ما فيه أحد جمع نقاط هذا الأسبوع/);

  require('../utils/cache').flush();
  route('GET', '/api/discord/leaderboard', () => okJson({ period: 'weekly', entries: [], building: true }));
  const i2 = makeInteraction({ commandName: 'المتصدرين', user: fakeUser(nextUserId()), options: { 'نوع': 'weekly' } });
  await dispatch(i2);
  assert.match(lastMessage(i2).text, /جاري تجهيز/);
  assert.equal(require('../utils/cache').get('lb:weekly'), undefined); // ما تنخزن حالة التجهيز
});

test('/احداث: فعاليات نشطة، لا يوجد، و Endpoint غير موجود', async () => {
  route('GET', '/api/discord/events', () => okJson({ events: [{ id: 'e1', icon: '🏆', title: 'أفضل ستريمر', description: 'يلا!', statusLabel: 'شغّالة الآن', endsAt: new Date(Date.now() + 86400000).toISOString() }] }));
  const i = makeInteraction({ commandName: 'احداث', user: fakeUser(nextUserId()) });
  await dispatch(i);
  assert.match(lastMessage(i).text, /أفضل ستريمر/);

  require('../utils/cache').flush();
  route('GET', '/api/discord/events', () => okJson({ events: [] }));
  const i2 = makeInteraction({ commandName: 'احداث', user: fakeUser(nextUserId()) });
  await dispatch(i2);
  assert.match(lastMessage(i2).text, /لا توجد فعاليات نشطة حالياً/);

  require('../utils/cache').flush();
  stub.routes.clear(); // الـEndpoint غير موجود → 404
  const i3 = makeInteraction({ commandName: 'احداث', user: fakeUser(nextUserId()) });
  await dispatch(i3);
  assert.match(lastMessage(i3).text, /لا توجد فعاليات نشطة حالياً/);
});

test('/ادمن_احصائيات: رفض لغير المخوّل، قبول للمدير ولـADMIN_IDS', async () => {
  let n = 0;
  route('GET', '/api/discord/admin/stats', () => { n++; return okJson({ registeredUsers: 42, rankedPlayers: 3000, activeToday: 77, apiCallsToday: 900, apiErrorsToday: 2, uptimeSeconds: 7200 }); });

  const denied = makeInteraction({ commandName: 'ادمن_احصائيات', user: fakeUser(nextUserId()) });
  await dispatch(denied);
  assert.match(lastMessage(denied).text, /غير مصرّح/);
  assert.ok(isEphemeral(denied));
  assert.equal(n, 0);

  const byPerm = makeInteraction({ commandName: 'ادمن_احصائيات', user: fakeUser(nextUserId()), admin: true });
  await dispatch(byPerm);
  assert.match(lastMessage(byPerm).text, /42/);

  const byList = makeInteraction({ commandName: 'ادمن_احصائيات', user: fakeUser(ADMIN_ID) });
  await dispatch(byList);
  const m = lastMessage(byList);
  assert.match(m.text, /900/);
  assert.ok(isEphemeral(byList));
  assert.equal(n, 2); // طلب واحد لكل استخدام مسموح، وصفر للمرفوض
});

test('/مساعدة: الفئات تظهر، والإدارية للمخوّل فقط', async () => {
  const i = makeInteraction({ commandName: 'مساعدة', user: fakeUser(nextUserId()) });
  await dispatch(i);
  const t1 = lastMessage(i).text;
  for (const cat of ['اللاعبين', 'الإحصائيات', 'الموقع']) assert.match(t1, new RegExp(cat));
  assert.match(t1, /\/بروفايل يوزر: ahmed_1/); // مثال الاستخدام
  assert.doesNotMatch(t1, /ربط/);
  assert.doesNotMatch(t1, /ادمن_احصائيات/);

  const a = makeInteraction({ commandName: 'مساعدة', user: fakeUser(nextUserId()), admin: true });
  await dispatch(a);
  assert.match(lastMessage(a).text, /ادمن_احصائيات/);
});

test('/احسمها و /الموقع: نفس الرسالة وزر رابط', async () => {
  for (const name of ['احسمها', 'الموقع']) {
    const i = makeInteraction({ commandName: name, user: fakeUser(nextUserId()) });
    await dispatch(i);
    const m = lastMessage(i);
    assert.match(m.text, /تيك توك/);
    assert.equal(m.components[0].components[0].url, 'https://ehsmaha.com');
  }
});

test('خطأ غير متوقع داخل أمر: رسالة عامة والبوت ما يطيح', async () => {
  const cmd = ctx.commands.get('الموقع');
  const original = cmd.execute;
  cmd.execute = async () => { throw new Error('boom'); };
  try {
    const i = makeInteraction({ commandName: 'الموقع', user: fakeUser(nextUserId()) });
    await dispatch(i); // ما يرمي
    const m = lastMessage(i);
    assert.match(m.text, /حصل خطأ مؤقت/);
    assert.doesNotMatch(m.text, /boom/);
  } finally {
    cmd.execute = original;
  }
});

test('Discord يرفض الرد (تفاعل منتهي): ما ينهار شي', async () => {
  route('GET', '/api/discord/profile-by-username/', () => okJson(PROFILE));
  const i = makeInteraction({ commandName: 'بروفايل', user: fakeUser(nextUserId()), options: { 'يوزر': 'Alice_1' } });
  i.deferReply = async () => { const e = new Error('Unknown interaction'); e.code = 10062; throw e; };
  await dispatch(i);
  assert.equal(stub.calls.length, 0); // ما كمل للـAPI بعد فشل الـdefer
});

test('أمر أو زر غير معروف', async () => {
  const i = makeInteraction({ commandName: 'قديم', user: fakeUser(nextUserId()) });
  await dispatch(i);
  assert.match(lastMessage(i).text, /لم يعد متاحاً/);
  const b = makeInteraction({ kind: 'button', customId: 'zzz:1', user: fakeUser(nextUserId()) });
  await dispatch(b);
  assert.match(lastMessage(b).text, /قديم/);
});

test('خطأ سيرفر بباقي الأوامر اللي تستخدم الـAPI: رسالة ودّية بدون Crash', async () => {
  route('GET', '/api/discord/', () => errJson(500, 'INTERNAL'));
  for (const [name, extra] of [['المتصدرين', {}], ['احداث', {}], ['ادمن_احصائيات', { admin: true }]]) {
    require('../utils/cache').flush();
    const i = makeInteraction({ commandName: name, user: fakeUser(nextUserId()), ...extra });
    await dispatch(i);
    assert.match(lastMessage(i).text, /حصل خطأ مؤقت، جرّب بعد قليل/, name);
  }
});
