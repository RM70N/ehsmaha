'use strict';

// ربط روم ديسكورد بألعاب الموقع: التحقق من الروم، بث الأحداث (SSE) عبر خادم
// البوت الحقيقي، شكل الرسالة، وإيقاف حماية السبام بالروم المربوط.
// (الاختبار الكامل بالمتصفح مع كل الألعاب: tests/e2e/discordRelay.site.e2e.js)

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  GEMINI_API_KEY: 'test-gemini-key',
  CLIENT_ID: '1552260327008247879',
  API_BASE_URL: 'http://127.0.0.1:9',
  API_KEY: 'k'.repeat(40),
  LOG_LEVEL: 'error'
});

const { ChannelType } = require('discord.js');
const relay = require('../services/discordRelay');
const { createApp, webClientProxy } = require('../web/server');

const GUILD = '1400000000000000000';
const OTHER_GUILD = '1500000000000000000';
const CH = '1400000000000000001';

function makeClient({ ready = true } = {}) {
  const { PermissionFlagsBits: P } = require('discord.js');
  const role = (id, perms = [], managed = false) => ({ id, managed, permissions: { has: (p) => perms.includes(p) } });
  const everyone = role(GUILD);
  const member = role('1400000000000000500'); // رتبة "عضو" عادية
  const staff = role('1400000000000000501', [P.ManageMessages]); // رتبة إشراف
  const botRole = role('1400000000000000502', [], true);
  const guild = { id: GUILD, name: 'احسمها', roles: { everyone, cache: new Map([[GUILD, everyone], [member.id, member], [staff.id, staff], [botRole.id, botRole]]) }, members: { me: { id: 'bot' } } };
  const other = { id: OTHER_GUILD, name: 'ثاني', roles: { everyone: { id: OTHER_GUILD } }, members: { me: { id: 'bot' } } };
  const perms = (fn) => (who) => ({ has: () => fn(who) });
  const ch = (id, g, extra = {}) => [id, { id, name: 'روم-' + id.slice(-2), type: ChannelType.GuildText, guild: g, permissionsFor: perms(() => true), ...extra }];
  return {
    isReady: () => ready,
    ws: { ping: 1 },
    channels: {
      cache: new Map([
        ch(CH, guild),
        ch('1400000000000000002', guild, { permissionsFor: perms((who) => who === staff || who === botRole || who === guild.members.me) }), // إدارة فقط
        ch('1400000000000000006', guild, { permissionsFor: perms((who) => who === member || who === staff || who === guild.members.me) }), // للأعضاء الموثّقين (مقفل عن @everyone)
        ch('1400000000000000003', guild, { permissionsFor: perms((who) => who !== guild.members.me) }), // البوت ما يشوفه
        ch('1400000000000000004', guild, { type: ChannelType.GuildCategory }),
        ch('1500000000000000001', other)
      ])
    }
  };
}

let seq = 0;
function msg(content, { id = '1400000000000000101', bot = false, nick = 'أحمد 🔥', webhookId = null, channelId = CH } = {}) {
  return {
    id: String(++seq),
    channelId,
    content,
    cleanContent: content,
    webhookId,
    author: { id, username: 'ahmed', globalName: 'Ahmed', bot, displayAvatarURL: () => `https://cdn.discordapp.com/avatars/${id}/u.png` },
    member: nick ? { displayName: nick, displayAvatarURL: () => `https://cdn.discordapp.com/guilds/${GUILD}/users/${id}/m.png` } : null
  };
}

test.afterEach(() => relay.closeAll());

test('resolveChannel: روم عام يقبل، والغلط/الخاص/سيرفر ثاني يترفض بسبب واضح', () => {
  const c = makeClient();
  assert.equal(relay.resolveChannel(c, CH).ok, true);
  assert.equal(relay.resolveChannel(c, 'abc').code, 'INVALID_INPUT');
  assert.equal(relay.resolveChannel(c, '1400000000000000999').code, 'CHANNEL_NOT_FOUND');
  assert.equal(relay.resolveChannel(c, '1400000000000000004').code, 'CHANNEL_NOT_FOUND', 'تصنيف مو روم كتابي');
  assert.equal(relay.resolveChannel(c, '1400000000000000002').code, 'CHANNEL_PRIVATE', 'روم إدارة (رتب إشراف/بوت فقط)');
  assert.equal(relay.resolveChannel(c, '1400000000000000006').ok, true, 'روم مقفل عن @everyone ومفتوح لرتبة الأعضاء');
  assert.equal(relay.resolveChannel(c, '1400000000000000003').code, 'BOT_NO_ACCESS');
  assert.equal(relay.resolveChannel(c, '1500000000000000001').ok, true, 'بدون OFFICIAL_GUILD_ID: أي سيرفر فيه البوت');
  assert.equal(relay.resolveChannel(c, '1500000000000000001', { officialGuildId: GUILD }).code, 'CHANNEL_NOT_ALLOWED');
  assert.equal(relay.resolveChannel(makeClient({ ready: false }), CH).code, 'BOT_NOT_READY');
});

test('toRelayMessage: اسم السيرفر ثم العام ثم اليوزر، صورة 128، وتنظيف التشكيل والتطويل والمسافات', () => {
  const m = relay.toRelayMessage(msg('  دُخـــول   الحين '));
  assert.deepEqual(m, {
    id: '1400000000000000101',
    username: 'ahmed',
    displayName: 'أحمد 🔥',
    avatarUrl: `https://cdn.discordapp.com/guilds/${GUILD}/users/1400000000000000101/m.png`,
    content: 'دخول الحين',
    messageId: m.messageId
  });
  const noMember = relay.toRelayMessage(msg('x', { nick: null }));
  assert.equal(noMember.displayName, 'Ahmed');
  assert.match(noMember.avatarUrl, /avatars/);
  assert.equal(relay.toRelayMessage(msg('ا'.repeat(900))).content.length, 500);
});

test('handleMessage: ما يرسل شي لروم مو مربوط، ويتجاهل البوتات والـwebhooks والرسائل الفاضية', () => {
  assert.equal(relay.handleMessage(msg('دخول')), 0);
  assert.equal(relay.isLinked(CH), false);
});

// ---------------- عبر خادم البوت الحقيقي ----------------
async function withServer(fn, config = {}) {
  // نفس اللي يسويه index.js: الخادم ياخذ واجهة تقرأ عميل ديسكورد الحالي
  const app = createApp({ client: webClientProxy({ client: makeClient() }), config: { webhookAllowedOrigins: [], streamWebhookSecret: null, officialGuildId: null, relayMaxPerChannel: 2, ...config } });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    relay.closeAll();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

// يقرأ أحداث SSE من الرد لين يتحقق الشرط
function reader(res) {
  const events = [];
  const dec = new TextDecoder();
  let buf = '';
  const r = res.body.getReader();
  const pump = (async () => {
    for (;;) {
      let chunk;
      try { chunk = await r.read(); } catch (_) { return; }
      if (chunk.done) return;
      buf += dec.decode(chunk.value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(block);
        const data = /^data: (.+)$/m.exec(block);
        if (ev && data) events.push({ event: ev[1], data: JSON.parse(data[1]) });
      }
    }
  })();
  const until = async (pred, ms = 2000) => {
    const end = Date.now() + ms;
    while (!pred(events) && Date.now() < end) await new Promise((x) => setTimeout(x, 20));
    return events;
  };
  return { events, until, cancel: () => r.cancel().catch(() => {}), pump };
}

test('webClientProxy: خادم الويب يشوف رومات العميل (وقبل ما يجهز العميل ما يطيح)', () => {
  const ctx = {};
  const proxy = webClientProxy(ctx);
  assert.equal(proxy.isReady(), false);
  assert.equal(relay.resolveChannel(proxy, CH).code, 'BOT_NOT_READY');
  ctx.client = makeClient();
  assert.equal(relay.resolveChannel(proxy, CH).ok, true, 'الرومات توصل عبر الواجهة');
});

test('SSE: الربط يرجّع ready، والرسائل توصل لحظياً بالترتيب، والفصل ينظّف', async () => {
  await withServer(async (base) => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/discord/relay/${CH}`, { signal: ctrl.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    const rd = reader(res);
    await rd.until((e) => e.some((x) => x.event === 'ready'));
    assert.deepEqual(rd.events[0], { event: 'ready', data: { channelId: CH, channelName: 'روم-01', guildName: 'احسمها', lastMessageId: null } });
    assert.equal(relay.isLinked(CH), true);

    assert.equal(relay.handleMessage(msg('دخول')), 1);
    relay.handleMessage(msg('5', { id: '1400000000000000102', nick: 'سارا' }));
    relay.handleMessage(msg('بوت', { bot: true }));
    relay.handleMessage(msg('ويب هوك', { webhookId: '1' }));
    relay.handleMessage(msg('   ')); // فاضية
    relay.handleMessage(msg('روم ثاني', { channelId: '1400000000000000005' }));
    await rd.until((e) => e.filter((x) => x.event === 'chat').length >= 2);
    await new Promise((x) => setTimeout(x, 100));
    const chats = rd.events.filter((x) => x.event === 'chat').map((x) => [x.data.displayName, x.data.content]);
    assert.deepEqual(chats, [['أحمد 🔥', 'دخول'], ['سارا', '5']]);

    ctrl.abort();
    for (let i = 0; i < 50 && relay._state.subscribers.has(CH); i++) await new Promise((x) => setTimeout(x, 20));
    assert.equal(relay._state.subscribers.has(CH), false, 'الموقع سكّر ← البوت يوقف يرسل للروم');
    assert.equal(relay.handleMessage(msg('بعد السكّر')), 0);
    assert.equal(relay.isLinked(CH), true, 'انقطاع مؤقت: حماية السبام تبقى متوقفة شوي');
    assert.equal(relay.isLinked(CH, Date.now() + 11 * 60 * 1000), false, 'بعد المهلة ترجع الحماية');
  });
});

test('SSE: بعد انقطاع الموقع، يرجّع الرسائل اللي فاتته من ديسكورد (بالترتيب وبدون البوتات والقديمة)', async () => {
  const now = Date.now();
  const past = (id, content, { ago = 5000, bot = false } = {}) => ({ ...msg(content, { id: '1400000000000000101', bot }), id, createdTimestamp: now - ago });
  const history = [
    past('1400000000000001003', 'دخول'),
    past('1400000000000001001', 'قديمة جداً', { ago: 20 * 60 * 1000 }),
    past('1400000000000001002', 'رسالة بوت', { bot: true }),
    past('1400000000000001004', '7')
  ];
  let fetchArgs = null;
  const client = makeClient();
  const ch = client.channels.cache.get(CH);
  ch.lastMessageId = '1400000000000001004';
  ch.messages = { fetch: async (opts) => { fetchArgs = opts; return new Map(history.map((m) => [m.id, m])); } };
  const app = createApp({ client: webClientProxy({ client }), config: { webhookAllowedOrigins: [], relayMaxPerChannel: 5 } });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/discord/relay/${CH}?after=1400000000000001000`);
    const rd = reader(res);
    await rd.until((e) => e.filter((x) => x.event === 'chat').length >= 2);
    assert.equal(rd.events[0].data.lastMessageId, '1400000000000001004', 'نقطة البداية للموقع');
    assert.deepEqual(fetchArgs, { after: '1400000000000001000', limit: 50 });
    assert.deepEqual(rd.events.filter((x) => x.event === 'chat').map((x) => x.data.content), ['دخول', '7']);
    await rd.cancel();
  } finally {
    relay.closeAll();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test('SSE: أخطاء واضحة (روم خاص/غلط/سيرفر غير رسمي) وحد المتصلين بالروم', async () => {
  await withServer(async (base) => {
    let r = await fetch(`${base}/api/discord/relay/1400000000000000002`);
    assert.equal(r.status, 403);
    assert.equal((await r.json()).error.code, 'CHANNEL_PRIVATE');
    assert.equal(r.headers.get('access-control-allow-origin'), '*', 'الموقع يقدر يقرا سبب الرفض');
    r = await fetch(`${base}/api/discord/relay/123`);
    assert.equal(r.status, 400);
    r = await fetch(`${base}/api/discord/relay/1500000000000000001`);
    assert.equal((await r.json()).error.code, 'CHANNEL_NOT_ALLOWED');

    const a = await fetch(`${base}/api/discord/relay/${CH}`);
    const b = await fetch(`${base}/api/discord/relay/${CH}`);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    r = await fetch(`${base}/api/discord/relay/${CH}`);
    assert.equal(r.status, 429);
    assert.equal((await r.json()).error.code, 'RELAY_FULL');
    await a.body.cancel();
    await b.body.cancel();
  }, { officialGuildId: GUILD });
});

test('messageCreate: الرسالة توصل الموقع أولاً حتى لو فحص الحماية علّق', async () => {
  const autoMod = require('../services/autoMod');
  const original = autoMod.handleMessage;
  autoMod.handleMessage = () => new Promise(() => {}); // يعلّق للأبد
  try {
    const written = [];
    const res = { status() {}, set() {}, write: (x) => written.push(x), on() {} };
    const client = makeClient();
    assert.equal(relay.subscribe(client.channels.cache.get(CH), { on() {} }, res), true);
    const m = msg('دخول');
    m.guild = { id: GUILD };
    require('../events/messageCreate').execute({ messageContentIntent: true }, m); // ما ننتظره
    await new Promise((r) => setImmediate(r));
    assert.ok(written.some((x) => x.startsWith('event: chat') && x.includes('دخول')), 'انرسلت قبل الحماية');
  } finally {
    autoMod.handleMessage = original;
  }
});

test('الحماية التلقائية: السبام ما ينحسب بروم مربوط بلعبة (الروابط تبقى)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'autoMod.js'), 'utf8');
  assert.match(src, /settings\.spam_protection && !discordRelay\.isLinked\(message\.channelId\)/);
  assert.match(src, /settings\.link_protection && contentIntent/, 'فحص الروابط ما تغيّر');
});

// ---------------- جهة الموقع (index.html) ----------------
test('الموقع: ديسكورد منصة بـ"ابدأ بثاً سريعاً" ويقبل ID الروم أو رابطه', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  assert.match(html, /discord: \{ icon: '💬', color: '#5865F2', label: 'ديسكورد' \}/);
  assert.match(html, /PLATFORM_PREFIX_RE = \/\^\(tiktok\|twitch\|kick\|youtube\|discord\):\//);
  assert.match(html, /data-platform="discord" onclick="homeQcPickPlatform\('discord'\)"/);
  assert.match(html, /id="qc-multi-check-discord"/);
  assert.match(html, /slot\.ws = discordRelayOpenStream\(user, dispatch, onOpen, onClose\)/);
  assert.match(html, /تعذّر ربط روم الديسكورد — ' \+ \(\(discordRelayLastError && discordRelayLastError\.message\)/, 'التنبيه يعرض السبب الحقيقي');
  assert.match(html, /const DISCORD_RELAY_SERVER_URL = 'https:\/\/ehsmaha-discord-bot[a-z0-9-]*\.onrender\.com';/);

  const pick = (name) => {
    const m = html.match(new RegExp(`\\nfunction ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
    assert.ok(m, name);
    return m[0];
  };
  // eslint-disable-next-line no-new-func
  const lib = new Function(`${pick('discordRelayChannelId')}\n${pick('discordRelayEventShape')}\nreturn { discordRelayChannelId, discordRelayEventShape };`)();
  assert.equal(lib.discordRelayChannelId(' 1400000000000000001 '), CH);
  assert.equal(lib.discordRelayChannelId(`https://discord.com/channels/${GUILD}/${CH}`), CH);
  assert.equal(lib.discordRelayChannelId(`https://discord.com/channels/${GUILD}/${CH}/1400000000000000999`), CH, 'رابط رسالة');
  assert.equal(lib.discordRelayChannelId('abc'), '');
  assert.equal(lib.discordRelayChannelId('123'), '');
  const evt = lib.discordRelayEventShape({ id: '9', displayName: 'سارا', avatarUrl: 'javascript:alert(1)', content: 'دخول' });
  assert.deepEqual(JSON.parse(JSON.stringify(evt)), { messages: [{ type: 'WebcastChatMessage', user: { uniqueId: '9', nickname: 'سارا', profilePictureUrl: '', isFollower: true }, comment: 'دخول' }] });
});
