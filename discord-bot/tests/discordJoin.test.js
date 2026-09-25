'use strict';

// "الانضمام عبر ديسكورد": منطق البوت (رسائل وهمية) + قسم الموقع (index.html)
// بمحاكاة DOM/Firebase بسيطة — بدون أي اتصال حقيقي.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  GEMINI_API_KEY: 'test-gemini-key',
  CLIENT_ID: '1552260327008247879',
  API_BASE_URL: 'http://127.0.0.1:9',
  API_KEY: 'k'.repeat(40),
  LOG_LEVEL: 'error'
});

const { ChannelType } = require('discord.js');
const api = require('../utils/apiClient');
const join = require('../services/discordJoin');

const SITE_HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const GUILD = '900000000000000001';
const CH = '900000000000000010';

// ---------------- أدوات وهمية ----------------
const calls = [];
function mockApi({ fail = null } = {}) {
  calls.length = 0;
  api.addJoinParticipant = async (sessionId, payload) => {
    calls.push({ sessionId, payload });
    if (typeof fail === 'function') {
      const e = fail(calls.length);
      if (e) throw e;
    }
    return { stored: 'firestore', duplicate: false };
  };
}
const apiError = (code) => Object.assign(new Error(code), { code });

function makeClient(guildIds = [GUILD]) {
  const guilds = new Map(guildIds.map((id) => [id, { id, name: 'احسمها', channels: { cache: new Map() } }]));
  return { guilds: { cache: Object.assign(guilds, { first: () => guilds.values().next().value }) } };
}

let msgSeq = 0;
function msg({ content, userId = '800000000000000001', channelId = CH, guildId = GUILD, bot = false, username = 'ahmed', globalName = 'أحمد 🔥', avatar = true } = {}) {
  const reactions = [];
  return {
    id: String(++msgSeq),
    content,
    channelId,
    channel: { id: channelId },
    guild: { id: guildId },
    reactions,
    react: async (e) => reactions.push(e),
    author: {
      id: userId,
      bot,
      username,
      globalName,
      displayAvatarURL: (opts) => {
        assert.deepEqual(opts, { extension: 'png', size: 128 });
        // بدون صورة شخصية ديسكورد يرجع الافتراضية (embed/avatars) — نفس الدالة
        return avatar ? `https://cdn.discordapp.com/avatars/${userId}/abc.png?size=128` : 'https://cdn.discordapp.com/embed/avatars/1.png';
      }
    }
  };
}

function setup(sessions = [{ sessionId: 'uid1_sniper_1', guildId: GUILD, channelId: CH, keywords: ['دخول'], gameId: 'sniper' }]) {
  join._state.client = makeClient();
  join._state.officialGuildId = GUILD;
  join._state.sessions = new Map();
  join.applySessions(sessions);
}

test.afterEach(() => join.stop());

// ---------------- التطابق مع normalize() الموقع ----------------
test('siteNormalize نسخة حرفية من normalize() بالموقع', () => {
  const m = SITE_HTML.match(/\nfunction normalize\(s\) \{\n([\s\S]*?)\n\}/);
  assert.ok(m, 'normalize() موجودة بـindex.html');
  const siteFn = new Function('s', m[1]);
  for (const s of ['أحمد', 'إدخال', 'آمنة', 'مدرسة', 'مستشفى', '  Join  ', 'JOIN', '', null, undefined, 'دخول 🔥', 'ابوإبراهيم']) {
    assert.equal(join.siteNormalize(s), siteFn(s), `القيمة: ${s}`);
  }
});

test('matchKeyword: يتسامح بالهمزات والتاء المربوطة والتشكيل والمسافات فقط', () => {
  assert.equal(join.matchKeyword('دخول', ['دخول']), 'دخول');
  assert.equal(join.matchKeyword('  دُخُـــول  ', ['دخول']), 'دخول');
  assert.equal(join.matchKeyword('أنا', ['انا']), 'انا');
  assert.equal(join.matchKeyword('لعبة', ['لعبه']), null, 'مثل الموقع: ة ← ت مو ه');
  assert.equal(join.matchKeyword('لعبت', ['لعبة']), 'لعبة');
  assert.equal(join.matchKeyword('JOIN', ['join']), 'join');
  assert.equal(join.matchKeyword('دخول الحين', ['دخول']), null, 'لازم الرسالة = الكلمة');
  assert.equal(join.matchKeyword('ازرق', ['احمر', 'ازرق']), 'ازرق', 'لعبة بفريقين');
  assert.equal(join.matchKeyword('', ['دخول']), null);
});

// ---------------- الرسائل ----------------
test('عضو يكتب الكلمة بالروم ← ينضم مرة وحدة بالبيانات الصحيحة', async () => {
  setup();
  mockApi();
  const m = msg({ content: 'دخول' });
  assert.equal(await join.handleMessage(m), 'joined');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    sessionId: 'uid1_sniper_1',
    payload: {
      discordUserId: '800000000000000001',
      username: 'ahmed',
      displayName: 'أحمد 🔥',
      avatarUrl: 'https://cdn.discordapp.com/avatars/800000000000000001/abc.png?size=128',
      keyword: 'دخول'
    }
  });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(m.reactions, ['✅']);
  assert.equal(await join.handleMessage(msg({ content: 'دخول' })), 'duplicate');
  assert.equal(calls.length, 1, 'ما ينرسل مرة ثانية');
});

test('رسائل متتالية بنفس اللحظة (قبل رد الـAPI) ← تسجيل واحد', async () => {
  setup();
  mockApi();
  const results = await Promise.all([1, 2, 3].map(() => join.handleMessage(msg({ content: 'دخول' }))));
  assert.deepEqual(results.sort(), ['duplicate', 'duplicate', 'joined']);
  assert.equal(calls.length, 1);
});

test('يتجاهل: البوتات، روم بدون جلسة، سيرفر ثاني، كلام عادي، خاص', async () => {
  setup();
  mockApi();
  assert.equal(await join.handleMessage(msg({ content: 'دخول', bot: true })), null);
  assert.equal(await join.handleMessage(msg({ content: 'دخول', channelId: '900000000000000099' })), null);
  assert.equal(await join.handleMessage(msg({ content: 'دخول', guildId: '900000000000000077' })), null);
  assert.equal(await join.handleMessage(msg({ content: 'السلام عليكم' })), null);
  const dm = msg({ content: 'دخول' });
  dm.guild = null;
  assert.equal(await join.handleMessage(dm), null);
  assert.equal(calls.length, 0);
});

test('ما فيه جلسة (الستريمر ما اختار روم) ← البوت ما يعالج أي روم', async () => {
  setup([]);
  mockApi();
  assert.equal(join._state.sessions.size, 0);
  assert.equal(await join.handleMessage(msg({ content: 'دخول' })), null);
  assert.equal(calls.length, 0);
});

test('صورة افتراضية واسم بدون globalName وأسماء عربية/رموز', async () => {
  setup();
  mockApi();
  assert.equal(await join.handleMessage(msg({ content: 'دخول', userId: '800000000000000002', username: 'نورة_٢٠٢٥', globalName: null, avatar: false })), 'joined');
  assert.equal(calls[0].payload.displayName, 'نورة_٢٠٢٥');
  assert.equal(calls[0].payload.avatarUrl, 'https://cdn.discordapp.com/embed/avatars/1.png');
  assert.equal(await join.handleMessage(msg({ content: 'دخول', userId: '800000000000000003', username: 'x', globalName: '<b>"سـارا"</b> 👑' })), 'joined');
  assert.equal(calls[1].payload.displayName, '<b>"سـارا"</b> 👑', 'الاسم يوصل كما هو — الموقع يعقّمه وقت العرض');
});

test('الجلسة انتهت أثناء الإرسال ← الروم يطلع من الكاش فوراً', async () => {
  setup();
  mockApi({ fail: () => apiError('SESSION_NOT_ACTIVE') });
  assert.equal(await join.handleMessage(msg({ content: 'دخول' })), 'ended');
  assert.equal(join._state.sessions.has(CH), false);
  assert.equal(await join.handleMessage(msg({ content: 'دخول', userId: '800000000000000009' })), null);
  assert.equal(calls.length, 1);
});

test('فشل مؤقت بالـAPI ← العضو يقدر يعيد المحاولة', async () => {
  setup();
  mockApi({ fail: (n) => (n === 1 ? apiError('NETWORK_ERROR') : null) });
  assert.equal(await join.handleMessage(msg({ content: 'دخول' })), 'failed');
  assert.equal(await join.handleMessage(msg({ content: 'دخول' })), 'joined');
  assert.equal(calls.length, 2);
});

test('applySessions: يحافظ على المنضمين لنفس الجلسة ويصفّرهم لجلسة جديدة، ويتجاهل سيرفر ثاني', async () => {
  setup();
  mockApi();
  await join.handleMessage(msg({ content: 'دخول' }));
  join.applySessions([{ sessionId: 'uid1_sniper_1', guildId: GUILD, channelId: CH, keywords: ['دخول'] }]);
  assert.equal(join._state.sessions.get(CH).joinedUserIds.size, 1);
  join.applySessions([{ sessionId: 'uid1_sniper_2', guildId: GUILD, channelId: CH, keywords: ['دخول'] }]);
  assert.equal(join._state.sessions.get(CH).joinedUserIds.size, 0, 'جولة جديدة');
  join.applySessions([{ sessionId: 'other', guildId: '900000000000000077', channelId: '900000000000000011', keywords: ['x'] }, { sessionId: 'bad', channelId: CH, keywords: [] }]);
  assert.equal(join._state.sessions.size, 0);
});

test('refreshSessions: خطأ بالـAPI ما يمسح الجلسات الحالية', async () => {
  setup();
  api.getJoinSessions = async () => { throw apiError('TIMEOUT'); };
  await join.refreshSessions();
  assert.equal(join._state.sessions.size, 1);
  api.getJoinSessions = async () => [];
  await join.refreshSessions();
  assert.equal(join._state.sessions.size, 0, 'الجلسة انتهت ← يوقف المراقبة');
});

// ---------------- قائمة الرومات ----------------
test('channelList: الرومات النصية فقط وبترتيب السيرفر', () => {
  const channels = new Map([
    ['1', { id: '1', name: 'صوتي', type: ChannelType.GuildVoice, rawPosition: 0 }],
    ['2', { id: '2', name: 'شات', type: ChannelType.GuildText, rawPosition: 2 }],
    ['3', { id: '3', name: 'اعلانات', type: ChannelType.GuildAnnouncement, rawPosition: 1 }],
    ['4', { id: '4', name: 'فئة', type: ChannelType.GuildCategory, rawPosition: 0 }]
  ]);
  assert.deepEqual(join.channelList({ channels: { cache: channels } }), [{ id: '3', name: 'اعلانات' }, { id: '2', name: 'شات' }]);
});

test('syncChannels يرسل السيرفر الرسمي فقط، و scheduleChannelSync يتجاهل السيرفرات الثانية', async () => {
  join._state.client = makeClient([GUILD, '900000000000000077']);
  join._state.officialGuildId = GUILD;
  const sent = [];
  api.putJoinChannels = async (p) => { sent.push(p); return { count: p.channels.length }; };
  await join.syncChannels();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].guildId, GUILD);
  assert.equal(join.scheduleChannelSync({ id: '900000000000000077' }), false);
  assert.equal(join.scheduleChannelSync({ id: GUILD }), true);
  join._state.officialGuildId = null; // بأكثر من سيرفر بدون OFFICIAL_GUILD_ID ما نخمّن
  assert.equal(await join.syncChannels(), null);
});

// ================= قسم الموقع (index.html) =================
function siteBlock() {
  const start = SITE_HTML.indexOf('<!-- ===== DISCORD JOIN (dcj) START');
  const end = SITE_HTML.indexOf('<!-- ===== DISCORD JOIN (dcj) END');
  assert.ok(start > 0 && end > start, 'علامات قسم dcj موجودة');
  const block = SITE_HTML.slice(start, end);
  return block.slice(block.indexOf('<script>') + 8, block.lastIndexOf('</script>'));
}

// DOM بسيط بما يكفي للقسم
function makeDom() {
  const byId = new Map();
  class El {
    constructor(id = '') {
      this.id = id;
      this.value = '';
      this.parentNode = null;
      this.children = [];
      this.className = '';
      this._html = '';
      this.disabled = false;
      const cls = new Set();
      this.classList = { contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c) };
      if (id) byId.set(id, this);
    }
    set innerHTML(v) {
      this._html = v;
      const m = /<select id="([^"]+)"/.exec(v);
      if (m) {
        this._select = new El(m[1]);
        this._select.parentNode = this;
        this._select.listeners = {};
        this._select.addEventListener = (t, fn) => (this._select.listeners[t] = fn);
      }
    }
    get innerHTML() { return this._html; }
    querySelector(sel) { return sel === 'select' ? this._select : null; }
    closest(sel) { return sel === '.field' ? this.field || null : null; }
    appendChild(c) { c.parentNode = this; this.children.push(c); if (c.id) byId.set(c.id, c); }
    insertBefore(node, ref) {
      node.parentNode = this;
      const i = this.children.indexOf(ref);
      this.children.splice(i < 0 ? this.children.length : i, 0, node);
    }
    get nextSibling() {
      const sibs = this.parentNode ? this.parentNode.children : [];
      return sibs[sibs.indexOf(this) + 1] || null;
    }
  }
  const body = new El('');
  const document = {
    body,
    getElementById: (id) => byId.get(id) || null,
    createElement: () => new El('')
  };
  // حقل كلمة مفتاحية داخل .field (مثل الموقع)
  function kwField(page, ids) {
    const pg = new El('pg-' + page);
    body.appendChild(pg);
    for (const id of ids) {
      const field = new El('');
      pg.appendChild(field);
      const input = new El(id);
      input.field = field;
      field.appendChild(input);
    }
    return pg;
  }
  return { El, document, byId, body, kwField };
}

function makeFb({ fsFails = false } = {}) {
  const log = [];
  const fsListeners = [];
  const rtListeners = new Map();
  const fb = {
    auth: { currentUser: { uid: 'uidS', displayName: 'MZX' } },
    db: {},
    rtdb: {},
    onAuthStateChanged: (_a, cb) => cb(fb.auth.currentUser),
    doc: (_db, ...p) => ({ path: p.join('/') }),
    collection: (_db, ...p) => ({ path: p.join('/') }),
    serverTimestamp: () => 'FS_TS',
    setDoc: async (ref, data) => {
      log.push(['setDoc', ref.path, data]);
      if (fsFails) throw Object.assign(new Error('quota'), { code: 'resource-exhausted' });
    },
    updateDoc: async (ref, data) => log.push(['updateDoc', ref.path, data]),
    onSnapshot: (ref, next) => {
      const l = { path: ref.path, next, active: true };
      fsListeners.push(l);
      return () => { l.active = false; log.push(['unsub', ref.path]); };
    },
    rtdbRef: (_r, p) => ({ path: p }),
    rtdbServerTimestamp: () => 'RT_TS',
    rtdbSet: async (ref, data) => log.push(['rtdbSet', ref.path, data]),
    rtdbUpdate: async (ref, data) => log.push(['rtdbUpdate', ref.path, data]),
    rtdbOnValue: (ref, cb) => {
      rtListeners.set(ref.path, cb);
      return () => { rtListeners.delete(ref.path); log.push(['rtOff', ref.path]); };
    },
    rtdbOff: () => {},
    rtdbOnDisconnect: (ref) => ({
      update: (d) => log.push(['onDisconnect', ref.path, d]),
      cancel: () => log.push(['onDisconnectCancel', ref.path])
    })
  };
  return { fb, log, fsListeners, rtListeners };
}

function loadSite({ fsFails = false } = {}) {
  const dom = makeDom();
  dom.kwField('setup-sniper', ['sniper-kw']);
  dom.kwField('setup-tug', ['tug-team-a-kw', 'tug-team-b-kw']);
  const sniperPg = new dom.El('pg-sniper');
  const tugPg = new dom.El('pg-tug');
  dom.body.appendChild(sniperPg);
  dom.body.appendChild(tugPg);
  const F = makeFb({ fsFails });
  const dispatched = [];
  const store = new Map();
  const win = {
    __fb: F.fb,
    addEventListener: () => {},
    homeDispatchToGameListeners: (evt) => dispatched.push(evt)
  };
  const ctx = vm.createContext({
    window: win,
    document: dom.document,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    MutationObserver: class { observe() {} },
    setTimeout, clearTimeout, Promise, Set, Object, String, Array
  });
  vm.runInContext(siteBlock(), ctx);
  const dcj = win.__dcj;
  const channels = (list, updatedAt) => ({ exists: () => true, data: () => ({ guildId: GUILD, channels: list, updatedAt: { toMillis: () => updatedAt } }) });
  // Firestore يرسل قائمة الرومات
  F.fsListeners.find((l) => l.path === 'config/discordChannels').next(channels([{ id: CH, name: 'العاب' }], 1000));
  return { dom, F, dcj, dispatched, store, sniperPg, tugPg, channels };
}
const tick = () => new Promise((r) => setImmediate(r));
// كائنات من سياق vm ثاني (نموذج أولي مختلف) ← نسخة عادية للمقارنة
const plain = (x) => JSON.parse(JSON.stringify(x));

test('الموقع: قسم "الانضمام عبر ديسكورد" ينضاف بعد حقل الكلمة المفتاحية ويتعبّى من config/discordChannels', () => {
  const { dom, dcj, F, store } = loadSite();
  const sel = dom.document.getElementById('dcj-ch-sniper');
  assert.ok(sel, 'قائمة الرومات للقناص');
  const field = sel.parentNode;
  const pg = dom.document.getElementById('pg-setup-sniper');
  assert.equal(pg.children.indexOf(field), 1, 'مباشرة بعد حقل الكلمة');
  assert.match(field.innerHTML, /الانضمام عبر ديسكورد/);
  assert.match(sel.innerHTML, /# العاب/);
  assert.ok(dom.document.getElementById('dcj-ch-tug'), 'شد الحبل: بعد حقل الفريق الثاني');
  assert.equal(dom.document.getElementById('pg-setup-tug').children.indexOf(dom.document.getElementById('dcj-ch-tug').parentNode), 2);
  // اختيار الروم ينحفظ
  sel.value = CH;
  sel.listeners.change();
  assert.equal(store.get('dcj-channel-sniper'), CH);
  // نسخة RTDB الأحدث تغلب (Firestore خلصت حصته وما تحدّث)
  F.rtListeners.get('config/discordChannels')({ val: () => ({ guildId: GUILD, channels: [{ id: CH, name: 'العاب' }, { id: '900000000000000011', name: 'جديد' }], updatedAt: 5000 }) });
  assert.equal(dcj.channelState.list.length, 2);
  assert.equal(sel.value, CH, 'الاختيار يبقى');
});

test('الموقع: بدون اختيار روم ← ما تنكتب أي جلسة', () => {
  const { dcj, F, sniperPg, dom } = loadSite();
  dom.document.getElementById('sniper-kw').value = 'دخول';
  sniperPg.classList.add('active');
  dcj.evaluate();
  assert.equal(Object.keys(dcj.sessions).length, 0);
  assert.equal(F.log.filter((x) => x[0] === 'setDoc').length, 0);
});

test('الموقع: الجلسة تبدأ مع صفحة اللعب، المنضمين يدخلون مثل منضم تيك توك، وتنتهي بدون حذف', async () => {
  const { dcj, F, sniperPg, dom, dispatched } = loadSite();
  dom.document.getElementById('dcj-ch-sniper').value = CH;
  dom.document.getElementById('sniper-kw').value = ' دخول ';
  sniperPg.classList.add('active');
  dcj.evaluate();
  await tick();
  const s = dcj.sessions.sniper;
  assert.ok(s);
  assert.match(s.sessionId, /^uidS_sniper_\d+$/);
  const [, p, data] = F.log.find((x) => x[0] === 'setDoc');
  assert.equal(p, 'discordSessions/' + s.sessionId);
  assert.deepEqual(plain(data), {
    streamerId: 'uidS', streamerUsername: 'MZX', guildId: GUILD, channelId: CH,
    keyword: 'دخول', keywords: ['دخول'], gameId: 'sniper', status: 'active', createdAt: 'FS_TS'
  });
  dcj.evaluate(); // تقييم ثاني وهي نشطة ← ما تتكرر
  assert.equal(F.log.filter((x) => x[0] === 'setDoc').length, 1);

  const partPath = `discordSessions/${s.sessionId}/participants`;
  const fsL = F.fsListeners.find((l) => l.path === partPath);
  const added = (id, d) => ({ docChanges: () => [{ type: 'added', doc: { id, data: () => d } }] });
  fsL.next(added('800000000000000001', { username: 'ahmed', displayName: 'أحمد 🔥', avatarUrl: 'https://cdn.discordapp.com/a.png', keyword: 'دخول' }));
  assert.deepEqual(plain(dispatched[0]), { messages: [{
    type: 'WebcastChatMessage',
    user: { uniqueId: 'discord:800000000000000001', nickname: 'أحمد 🔥', profilePictureUrl: 'https://cdn.discordapp.com/a.png', isFollower: true },
    comment: 'دخول'
  }] });
  // نفس العضو من RTDB أو لقطة مكررة ← ما يتكرر
  F.rtListeners.get(partPath)({ val: () => ({ '800000000000000001': { displayName: 'أحمد' } }) });
  fsL.next(added('800000000000000001', {}));
  assert.equal(dispatched.length, 1);
  // صورة مو https تنشال
  fsL.next(added('800000000000000002', { username: 'x', displayName: '', avatarUrl: 'javascript:alert(1)' }));
  assert.equal(dispatched[1].messages[0].user.profilePictureUrl, '');
  assert.equal(dispatched[1].messages[0].user.nickname, 'x');
  assert.equal(dom.document.getElementById('dcj-pill').className, 'dcj-on');
  assert.match(dom.document.getElementById('dcj-pill').innerHTML, /منضمين عبر ديسكورد: <b id="dcj-count">2</);

  // انتهت الجولة (صفحة الفائز)
  sniperPg.classList.remove('active');
  dcj.evaluate();
  const upd = F.log.find((x) => x[0] === 'updateDoc');
  assert.equal(upd[1], 'discordSessions/' + s.sessionId);
  assert.deepEqual(plain(upd[2]), { status: 'ended', endedAt: 'FS_TS' });
  assert.ok(F.log.some((x) => x[0] === 'unsub' && x[1] === partPath), 'يوقف الاستماع');
  assert.equal(F.log.filter((x) => x[0] === 'deleteDoc').length, 0);
  fsL.next(added('800000000000000003', { username: 'late' }));
  assert.equal(dispatched.length, 2, 'بعد النهاية ما ينضم أحد');
  assert.equal(dom.document.getElementById('dcj-pill').className, '');
});

test('الموقع: Firestore فشل (الحصة) ← الجلسة تنكتب بـRTDB مع onDisconnect', async () => {
  const { dcj, F, tugPg, dom, dispatched } = loadSite({ fsFails: true });
  dom.document.getElementById('dcj-ch-tug').value = CH;
  dom.document.getElementById('tug-team-a-kw').value = 'احمر';
  dom.document.getElementById('tug-team-b-kw').value = 'ازرق';
  tugPg.classList.add('active');
  dcj.evaluate();
  await tick();
  await tick();
  const s = dcj.sessions.tug;
  const set = F.log.find((x) => x[0] === 'rtdbSet');
  assert.ok(set, 'انكتبت بـRTDB');
  assert.equal(set[1], 'discordSessions/' + s.sessionId);
  assert.deepEqual(plain(set[2].keywords), ['احمر', 'ازرق']);
  assert.equal(set[2].createdAt, 'RT_TS');
  assert.ok(F.log.some((x) => x[0] === 'onDisconnect' && x[2].status === 'ended'));
  // منضم RTDB للفريق الثاني ← التعليق = كلمة الفريق الثاني
  F.rtListeners.get(`discordSessions/${s.sessionId}/participants`)({ val: () => ({ '800000000000000005': { username: 'b', displayName: 'بدر', keyword: 'ازرق' } }) });
  assert.equal(dispatched[0].messages[0].comment, 'ازرق');
  tugPg.classList.remove('active');
  dcj.evaluate();
  assert.ok(F.log.some((x) => x[0] === 'rtdbUpdate' && x[2].status === 'ended'));
  assert.equal(F.log.filter((x) => x[0] === 'updateDoc').length, 0, 'ما نلمس Firestore اللي ما انكتب');
});

test('الموقع: القسم إضافة فقط — ما يعدّل دوال الموقع الأصلية', () => {
  const block = siteBlock();
  for (const name of ['function show(', 'function normalize(', 'function extractUser(', 'function homeDispatchToGameListeners(']) {
    assert.equal(block.includes(name), false, `القسم ما يعرّف ${name}`);
    assert.ok(SITE_HTML.includes(name), `${name} باقية بالموقع`);
  }
  assert.ok(SITE_HTML.indexOf('<!-- ===== DISCORD JOIN (dcj) START') > SITE_HTML.lastIndexOf('function show('));
});
