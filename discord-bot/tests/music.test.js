'use strict';

// اختبارات نظام الموسيقى: القائمة، تصنيف الروابط، مطابقة Spotify، أوامر !prefix، اللوحة، وتشغيل فعلي عبر ffmpeg الحقيقي
// (اتصال الصوت بديسكورد مزيّف؛ مصدر الصوت ملف sine مولّد محلياً). ما فيه اتصال خارجي.

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  GEMINI_API_KEY: 'test-gemini-key',
  CLIENT_ID: '1552260327008247879',
  API_BASE_URL: 'http://127.0.0.1:9',
  API_KEY: 'a'.repeat(40),
  LOG_LEVEL: 'error',
  MUSIC_IDLE_LEAVE_SECONDS: '0.4',
  MUSIC_EMPTY_LEAVE_SECONDS: '0.4',
  MUSIC_PAUSE_LEAVE_SECONDS: '0.6',
  MUSIC_PANEL_REFRESH_SECONDS: '0.2',
  MUSIC_NICKNAME_MIN_INTERVAL_SECONDS: '0',
  MUSIC_DUPLICATE_WINDOW_SECONDS: '30'
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { spawn, spawnSync } = require('node:child_process');
const { ChannelType, PermissionsBitField, PermissionFlagsBits, Collection } = require('discord.js');
const realVoice = require('@discordjs/voice');
const botDb = require('../database/botDb');
const { MusicQueue, QueueError } = require('../music/MusicQueue');
const extractor = require('../music/MusicExtractor');
const embeds = require('../music/MusicEmbeds');
const events = require('../music/MusicEvents');
const controls = require('../music/MusicControls');
const { MusicManager, _setManager } = require('../music/MusicManager');
const identity = require('../music/MusicIdentity');
const { MusicError } = extractor;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeoutMs = 6000, label = 'condition') {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`انتهت المهلة: ${label}`);
    await wait(25);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'music-test-'));
const AUDIO = path.join(tmp, 'sine.ogg');

test.before(async () => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5', '-c:a', 'libopus', '-y', AUDIO]);
  assert.equal(r.status, 0, 'ffmpeg لازم يكون مثبّت للاختبارات');
  await botDb.init({ sqlitePath: ':memory:' });
});
test.after(async () => {
  await botDb.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ======================= القائمة =======================

const T = (id, extra = {}) => ({ source: 'youtube', id: String(id), url: `https://www.youtube.com/watch?v=${String(id).padEnd(11, 'x')}`, title: `Song ${id}`, artist: 'Artist', duration: 200, thumbnail: null, ...extra });

test('القائمة: ترتيب، حد أقصى، منع التكرار القريب، أوضاع التشغيل', () => {
  let now = 1000;
  const q = new MusicQueue({ maxSize: 3, duplicateWindowMs: 5000, now: () => now });
  q.add(T(1));
  assert.throws(() => q.add(T(1)), (e) => e instanceof QueueError && e.code === 'DUPLICATE');
  now += 6000;
  q.add(T(1)); // بعد انتهاء النافذة مسموح
  q.add(T(2));
  assert.throws(() => q.add(T(3)), (e) => e.code === 'FULL');
  assert.equal(q.size, 3);

  q.setCurrent(T(0));
  assert.equal(q.advance().id, '1');
  assert.equal(q.advance().id, '1');
  assert.equal(q.advance().id, '2');
  assert.equal(q.advance(), null);
  assert.equal(q.current, null);
  assert.equal(q.advance(), null, 'قائمة فاضية ما تنهار');
});

test('القائمة: repeatTrack يكرر عند النهاية الطبيعية فقط، والتخطي اليدوي يتقدّم', () => {
  const q = new MusicQueue({ duplicateWindowMs: 0 });
  q.add(T(2));
  q.setCurrent(T(1));
  q.setMode('repeatTrack');
  assert.equal(q.advance().id, '1');
  assert.equal(q.advance().id, '1');
  assert.equal(q.advance({ manual: true }).id, '2');
  assert.equal(q.toggleMode('repeatTrack'), 'normal'); // كان مفعّل ← يتوقف
  assert.equal(q.toggleMode('repeatTrack'), 'repeatTrack');
  assert.throws(() => q.setMode('x'));
});

test('القائمة: repeatQueue تعيد الدورة، وshuffle يختار عشوائياً بدون فقد أغاني', () => {
  const q = new MusicQueue({ duplicateWindowMs: 0 });
  [2, 3].forEach((i) => q.add(T(i)));
  q.setCurrent(T(1));
  q.setMode('repeatQueue');
  const seq = [q.advance(), q.advance(), q.advance(), q.advance()].map((t) => t.id);
  assert.deepEqual(seq, ['2', '3', '1', '2']);

  const s = new MusicQueue({ duplicateWindowMs: 0, random: () => 0.99 });
  [1, 2, 3, 4].forEach((i) => s.add(T(i)));
  s.setCurrent(T(0));
  s.setMode('shuffle');
  const got = [];
  let n;
  while ((n = s.advance())) got.push(n.id);
  assert.deepEqual(got.sort(), ['1', '2', '3', '4']);
  assert.equal(s.peekNext(), null);
});

// ======================= تصنيف الروابط ومطابقة Spotify =======================

test('تصنيف المدخلات: اسم، يوتيوب، سبوتيفاي، وروابط غير صالحة/غير مدعومة', () => {
  const c = extractor.classify;
  assert.equal(c('blinding lights').type, 'query');
  for (const u of ['https://youtu.be/4NRXx6U8ABQ?t=3', 'https://www.youtube.com/watch?v=4NRXx6U8ABQ&list=PLx', 'https://music.youtube.com/watch?v=4NRXx6U8ABQ', 'youtu.be/4NRXx6U8ABQ', 'https://www.youtube.com/shorts/4NRXx6U8ABQ']) {
    const r = c(u);
    assert.equal(r.type, 'youtube', u);
    assert.equal(r.url, 'https://www.youtube.com/watch?v=4NRXx6U8ABQ');
  }
  assert.equal(c('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b?si=abc').type, 'spotify');
  assert.equal(c('https://open.spotify.com/album/0VjIjW4GlUZAMYd2vXMi3b').code, 'UNSUPPORTED_SPOTIFY');
  assert.equal(c('https://www.youtube.com/watch?v=short').code, 'INVALID_URL');
  assert.equal(c('https://www.youtube.com.evil.com/watch?v=4NRXx6U8ABQ').code, 'UNSUPPORTED_LINK');
  assert.equal(c('https://evil.com/x').code, 'UNSUPPORTED_LINK');
  assert.equal(c('   ').type, 'error');
});

test('تصنيف أخطاء yt-dlp إلى رموز ورسائل عربية واضحة', () => {
  const k = extractor.classifyYtdlpError;
  assert.equal(k("ERROR: Sign in to confirm you're not a bot"), 'BOT_CHECK');
  assert.equal(k('ERROR: Private video. Sign in if you\'ve been granted access'), 'PRIVATE');
  assert.equal(k('ERROR: Video unavailable'), 'UNAVAILABLE');
  assert.equal(k('Sign in to confirm your age'), 'AGE_RESTRICTED');
  assert.equal(k('The uploader has not made this video available in your country'), 'GEO_BLOCKED');
  assert.equal(k('Unable to download webpage: getaddrinfo ENOTFOUND'), 'NETWORK');
  assert.equal(k('something odd'), 'EXTRACT_FAILED');
  for (const code of Object.keys(extractor.MESSAGES)) assert.match(extractor.MESSAGES[code], /[؀-ۿ]/);
});

test('Spotify: نفس الأغنية تتطابق، وأغنية ثانية/ريمكس مرفوضة (ما نشغّل شي مختلف)', async () => {
  const meta = { title: 'Blinding Lights', artist: 'The Weeknd', duration: 200 };
  const good = { source: 'youtube', id: 'g', title: 'The Weeknd - Blinding Lights (Official Audio)', artist: 'The Weeknd', duration: 201 };
  const remix = { source: 'youtube', id: 'r', title: 'Blinding Lights (Remix) - Nightcore', artist: 'DJ X', duration: 190 };
  const other = { source: 'youtube', id: 'o', title: 'Save Your Tears', artist: 'The Weeknd', duration: 215 };
  assert.ok(extractor.scoreMatch(meta, good) >= 0.7);
  assert.ok(extractor.scoreMatch(meta, remix) < 0.7);
  assert.ok(extractor.scoreMatch(meta, other) < 0.7);

  const axios = require('axios');
  const realGet = axios.get;
  const html = (t, a, d) => `<meta property="og:title" content="${t}"/><meta property="og:description" content="${a} · After Hours · Song · 2020"/><meta property="og:image" content="https://i.scdn.co/image/x"/><meta name="music:duration" content="${d}"/><meta name="music:musician_description" content="${a}"/>`;
  axios.get = async () => ({ data: html('Blinding Lights', 'The Weeknd', 200) });
  try {
    const t = await extractor.fromSpotify('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b', { searchFn: async () => [remix, good, other] });
    assert.equal(t.id, 'g');
    assert.equal(t.title, 'Blinding Lights');
    assert.equal(t.artist, 'The Weeknd');
    assert.equal(t.via, 'spotify');
    assert.equal(t.thumbnail, 'https://i.scdn.co/image/x');
    await assert.rejects(extractor.fromSpotify('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b', { searchFn: async () => [remix, other] }), (e) => e.code === 'NO_MATCH');
    await assert.rejects(extractor.fromSpotify('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b', { searchFn: async () => [] }), (e) => e.code === 'NO_MATCH');
    axios.get = async () => { throw Object.assign(new Error('nf'), { response: { status: 404 } }); };
    await assert.rejects(extractor.fromSpotify('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b'), (e) => e.code === 'UNAVAILABLE');
  } finally {
    axios.get = realGet;
  }
});

// ======================= yt-dlp (نسخة وهمية) =======================

function stubYtdlp(script) {
  const file = path.join(tmp, `ytdlp-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(file, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  process.env.YTDLP_PATH = file;
  return file;
}

test('yt-dlp: البحث يُرجع أغاني بصور ومدد، ويرفض البث المباشر والطويل', async () => {
  stubYtdlp(`cat <<'EOF'
{"entries":[
{"id":"AAAAAAAAAAA","title":"Song A","channel":"Artist A - Topic","duration":200,"thumbnails":[{"url":"https://i/1.jpg"},{"url":"https://i/2.jpg"}]},
{"id":"BBBBBBBBBBB","title":"Live","channel":"X","duration":null,"is_live":true},
{"id":"CCCCCCCCCCC","title":"Too Long","channel":"X","duration":99999},
{"id":"bad","title":"bad id","duration":10},
{"id":"DDDDDDDDDDD","title":"Song D","uploader":"Artist D","duration":180}
]}
EOF`);
  const r = await extractor.search('x', 5);
  assert.deepEqual(r.map((t) => t.id), ['AAAAAAAAAAA', 'DDDDDDDDDDD']);
  assert.equal(r[0].artist, 'Artist A');
  assert.equal(r[0].thumbnail, 'https://i/2.jpg');
  assert.equal(r[1].thumbnail, 'https://i.ytimg.com/vi/DDDDDDDDDDD/hqdefault.jpg');
  assert.equal(r[0].url, 'https://www.youtube.com/watch?v=AAAAAAAAAAA');
});

test('yt-dlp: رسائل الفشل (بوت-تشك/خاص/محذوف/مهلة/بدون أداة) واضحة وبدون تسريب', async () => {
  stubYtdlp(`echo "ERROR: [youtube] x: Sign in to confirm you're not a bot. Use --cookies" >&2; exit 1`);
  await assert.rejects(extractor.getInfo('https://www.youtube.com/watch?v=4NRXx6U8ABQ'), (e) => e.code === 'BOT_CHECK' && /كوكيز|بروكسي/.test(e.message) && !/yt-dlp:|\/tmp/.test(e.message));
  stubYtdlp(`echo "ERROR: Private video" >&2; exit 1`);
  await assert.rejects(extractor.resolveStream({ url: 'https://www.youtube.com/watch?v=4NRXx6U8ABQ' }), (e) => e.code === 'PRIVATE');
  stubYtdlp(`echo "ERROR: Video unavailable" >&2; exit 1`);
  await assert.rejects(extractor.getInfo('u'), (e) => e.code === 'UNAVAILABLE');
  stubYtdlp(`sleep 5`);
  const t0 = Date.now();
  await assert.rejects(extractor.runYtdlp(['-J', 'x'], { timeoutMs: 300 }), (e) => e.code === 'TIMEOUT');
  assert.ok(Date.now() - t0 < 2500, 'العملية قُتلت عند المهلة');
  process.env.YTDLP_PATH = path.join(tmp, 'nope');
  await assert.rejects(extractor.search('x'), (e) => e.code === 'NO_TOOL');
  stubYtdlp(`echo "not json"`);
  await assert.rejects(extractor.search('x'), (e) => e.code === 'EXTRACT_FAILED');
});

test('yt-dlp: getInfo يتحقق من الإتاحة والعمر والبث، resolveStream يرجع رابط وهيدرز', async () => {
  stubYtdlp(`echo '{"id":"AAAAAAAAAAA","title":"T","artist":"A","duration":120,"thumbnail":"https://t/x.jpg"}'`);
  const ok = await extractor.getInfo('https://www.youtube.com/watch?v=AAAAAAAAAAA');
  assert.equal(ok.title, 'T');
  assert.equal(ok.duration, 120);
  stubYtdlp(`echo '{"id":"AAAAAAAAAAA","title":"T","duration":120,"age_limit":18}'`);
  await assert.rejects(extractor.getInfo('u'), (e) => e.code === 'AGE_RESTRICTED');
  stubYtdlp(`echo '{"id":"AAAAAAAAAAA","title":"T","is_live":true}'`);
  await assert.rejects(extractor.getInfo('u'), (e) => e.code === 'LIVE');
  stubYtdlp(`echo '{"id":"AAAAAAAAAAA","title":"T","duration":120,"availability":"private"}'`);
  await assert.rejects(extractor.getInfo('u'), (e) => e.code === 'PRIVATE');
  stubYtdlp(`echo '{"id":"AAAAAAAAAAA","title":"T","duration":120,"url":"https://rr/a","http_headers":{"User-Agent":"UA"}}'`);
  const s = await extractor.resolveStream({ url: 'u', duration: 120 });
  assert.equal(s.url, 'https://rr/a');
  assert.equal(s.headers['User-Agent'], 'UA');
  delete process.env.YTDLP_PATH;
});

// ======================= !prefix =======================

test('أوامر البادئة: اغنية/قائمة/تخطي/ايقاف/موسيقى (مع تطبيع الألف) وغيرها تُتجاهل', () => {
  assert.deepEqual(events.parse('!اغنية blinding lights'), { name: 'اغنية', args: 'blinding lights' });
  assert.deepEqual(events.parse('!أغنية https://youtu.be/4NRXx6U8ABQ'), { name: 'اغنية', args: 'https://youtu.be/4NRXx6U8ABQ' });
  assert.deepEqual(events.parse('!اغنيه x'), { name: 'اغنية', args: 'x' });
  assert.equal(events.parse('!قائمة').name, 'قائمة');
  assert.equal(events.parse('!تخطي').name, 'تخطي');
  assert.equal(events.parse('!إيقاف').name, 'ايقاف');
  assert.equal(events.parse('!ايقاف').name, 'ايقاف');
  assert.equal(events.parse('!موسيقى').name, 'موسيقى');
  assert.equal(events.parse('اغنية x'), null);
  assert.equal(events.parse('!مساعدة'), null);
  assert.equal(events.parse('!'), null);
  assert.equal(events.parse('hello !اغنية'), null);
});

// ======================= اللوحة =======================

test('اللوحة: 3 صفوف أزرار بمعرّفات mu: وحدود Discord، ومحتوى كامل، وتتحدث حسب الحالة', () => {
  const snap = { status: 'playing', track: T(1, { requestedBy: { id: '1', name: 'Ali' }, thumbnail: 'https://t/x.jpg', duration: 200 }), positionSec: 134, mode: 'repeatTrack', queueSize: 5, upcoming: [], next: T(2), voiceChannelName: 'Music' };
  const p = embeds.panelPayload(snap);
  assert.equal(p.components.length, 3);
  const all = p.components.flatMap((r) => r.components.map((c) => c.toJSON()));
  for (const row of p.components) assert.ok(row.components.length <= 5);
  for (const b of all) assert.ok(b.custom_id.startsWith('mu:') && b.custom_id.length <= 100);
  assert.deepEqual(all.map((b) => b.custom_id), ['mu:back', 'mu:pause', 'mu:resume', 'mu:fwd', 'mu:restart', 'mu:skip', 'mu:repeat', 'mu:queue', 'mu:shuffle', 'mu:loopq', 'mu:stop']);
  assert.equal(all.find((b) => b.custom_id === 'mu:repeat').style, 1, 'الزر الفعّال بلون مميز');
  const e = p.embeds[0].toJSON();
  const text = JSON.stringify(e);
  for (const need of ['Song 1', 'Artist', '02:14 / 03:20', 'Ali', 'Music', 'Song 2', '5 أغاني', 'تكرار الأغنية']) assert.ok(text.includes(need), need);
  assert.equal(e.thumbnail.url, 'https://t/x.jpg');
  assert.match(e.description, /▰+▱+/);
  const stopped = embeds.panelPayload({ ...snap, status: 'stopped' });
  assert.ok(stopped.components.every((r) => r.components.every((c) => c.toJSON().disabled)));
});

test('قائمة الانتظار: صفحات، الاسم والفنان والمدة والطالب والصورة لكل أغنية', () => {
  const upcoming = Array.from({ length: 12 }, (_, i) => T(i + 1, { requestedBy: { id: '1', name: `U${i + 1}` }, thumbnail: `https://t/${i}.jpg` }));
  const snap = { status: 'playing', track: T(0), upcoming, mode: 'normal', queueSize: 12, next: upcoming[0], positionSec: 0 };
  assert.equal(embeds.queuePages(snap), 3);
  const p0 = embeds.queuePayload(snap, 0);
  assert.equal(p0.embeds.length, 1 + 5);
  const item = JSON.stringify(p0.embeds[1].toJSON());
  for (const need of ['Song 1', 'Artist', '03:20', 'U1', 'https://t/0.jpg']) assert.ok(item.includes(need), need);
  const row = p0.components[0].components.map((c) => c.toJSON());
  assert.equal(row[0].disabled, true);
  assert.equal(row[1].disabled, false);
  const p2 = embeds.queuePayload(snap, 99);
  assert.equal(p2.page, 2);
  assert.equal(p2.embeds.length, 1 + 2);
  assert.equal(embeds.queuePayload({ ...snap, upcoming: [], queueSize: 0 }, 0).embeds.length, 1, 'قائمة فاضية');
});

// ======================= بيئة مزيّفة لجلسات حقيقية =======================

function makeFakeVoice() {
  const v = { ...realVoice, conns: [], failReconnect: false, failJoin: false };
  v.joinVoiceChannel = (opts) => {
    const c = new EventEmitter();
    c.opts = opts;
    c.state = { status: 'ready' };
    c.subscribe = () => ({});
    c.destroy = () => {
      c.state = { status: 'destroyed' };
      c.destroyedCalled = true;
    };
    v.conns.push(c);
    return c;
  };
  v.entersState = async (target, status, ms) => {
    if (target && target.opts) {
      if (status === 'ready') {
        if (v.failJoin) throw new Error('join failed');
        return target;
      }
      if (v.failReconnect) throw new Error('no reconnect');
      return target;
    }
    return realVoice.entersState(target, status, ms);
  };
  return v;
}

function makeEnv({ id = '1000000000000000001', perms = null } = {}) {
  const voice = makeFakeVoice();
  const procs = [];
  const resolves = [];
  const fakeExtractor = {
    ...extractor,
    async resolveStream(track) {
      resolves.push(track.id);
      if (track.failResolve) throw new MusicError(track.failResolve, extractor.MESSAGES[track.failResolve]);
      return { url: AUDIO, headers: {}, resolvedAt: Date.now() };
    },
    async getInfo(url) {
      const c = extractor.classify(url);
      return T(c.id, { id: c.id, duration: 5, url: c.url });
    },
    async search(q) {
      return [T('s1', { duration: 5 }), T('s2', { duration: 5 }), T('s3', { duration: 5 })];
    },
    async fromSpotify() {
      return T('sp1', { duration: 5, via: 'spotify', spotifyUrl: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b', title: 'Spotify Song' });
    }
  };
  const nick = { current: null, calls: [] };
  const me = {
    id: 'bot',
    nickname: null,
    permissions: new PermissionsBitField(perms || [PermissionFlagsBits.ChangeNickname]),
    manageable: true,
    async setNickname(n) {
      nick.calls.push(n);
      nick.current = n;
      me.nickname = n;
    }
  };
  const channels = new Map();
  const mkVc = (cid, { type = ChannelType.GuildVoice, vperms } = {}) => {
    const members = new Collection();
    const vc = {
      id: cid,
      name: `VC-${cid.slice(-3)}`,
      type,
      full: false,
      members,
      permissionsFor: () => new PermissionsBitField(vperms || [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ViewChannel])
    };
    channels.set(cid, vc);
    return vc;
  };
  const guild = { id, name: 'G', members: { me, fetch: async () => null }, voiceAdapterCreator: () => ({}), channels: { cache: channels } };
  const sent = [];
  const textChannel = {
    id: `${id}9`,
    guild,
    async send(payload) {
      const m = { id: `m${sent.length + 1}`, payload, edits: [], deleted: false };
      m.edit = async (p) => {
        m.edits.push(p);
        m.payload = p;
        return m;
      };
      m.delete = async () => {
        m.deleted = true;
      };
      sent.push(m);
      return m;
    }
  };
  const mkMember = (uid, vc) => {
    const m = { id: uid, displayName: `User${uid.slice(-2)}`, user: { id: uid, bot: false, username: `u${uid.slice(-2)}` }, voice: { channel: vc || null }, guild };
    if (vc) vc.members.set(uid, m);
    return m;
  };
  const manager = new MusicManager({
    deps: {
      extractor: fakeExtractor,
      player: {
        voice,
        extractor: fakeExtractor,
        spawn: (...a) => {
          const p = spawn(...a);
          procs.push(p);
          return p;
        }
      }
    }
  });
  return { voice, procs, resolves, fakeExtractor, nick, me, guild, textChannel, sent, mkVc, mkMember, manager };
}

const alive = (procs) => procs.filter((p) => p.exitCode === null && !p.killed);
const text = (payload) => JSON.stringify((payload.embeds || []).map((e) => (e.toJSON ? e.toJSON() : e)));

// ======================= تشغيل فعلي =======================

test('رحلة كاملة: دخول الروم، تشغيل فعلي، قائمة، إيقاف/استكمال، تقديم/ترجيع، إعادة، تكرار، تخطي، انتهاء ومغادرة', async () => {
  const env = makeEnv();
  const vc = env.mkVc('2000000000000000001');
  const ali = env.mkMember('3000000000000000011', vc);
  const sara = env.mkMember('3000000000000000022', vc);
  const common = { guild: env.guild, textChannel: env.textChannel };

  // 1) رابط يوتيوب ← يدخل الروم ويشغّل فعلياً
  const r1 = await env.manager.requestPlay({ ...common, member: ali, input: 'https://youtu.be/AAAAAAAAAAA' });
  assert.equal(r1.kind, 'added');
  assert.match(text(r1.payload), /بدأ التشغيل/);
  const session = env.manager.getSession(env.guild.id);
  assert.ok(session);
  assert.equal(env.voice.conns.length, 1, 'جلسة صوتية واحدة');
  assert.equal(env.voice.conns[0].opts.channelId, vc.id);
  assert.equal(env.voice.conns[0].opts.selfDeaf, true);
  assert.equal(session.status, 'playing');
  await until(() => session.positionMs() > 300, 4000, 'الصوت يتقدّم فعلياً');
  assert.equal(env.procs.length, 1, 'عملية ffmpeg واحدة لهذه الأغنية (قد تنتهي مبكراً لأن الملف قصير)');

  // اللوحة: رسالة واحدة تُرسل وتُحدَّث (ما تنرسل رسالة جديدة كل تغيير)
  await until(() => env.sent.length >= 1);
  const panel = env.sent[0];
  assert.match(text(panel.payload), /AAAAAAAAAAA|Song AAAAAAAAAAA/);
  await until(() => panel.edits.length >= 1, 3000, 'تحديث اللوحة تلقائياً');
  assert.equal(env.sent.filter((m) => /NOW PLAYING/.test(text(m.payload))).length, 1);

  // اسم البوت = اسم الأغنية
  await until(() => env.nick.current === 'Song AAAAAAAAAAA', 2000, 'nickname');

  // 2) قائمة انتظار: 3 أغاني + منع التكرار القريب
  for (const id of ['BBBBBBBBBBB', 'CCCCCCCCCCC', 'DDDDDDDDDDD']) {
    const r = await env.manager.requestPlay({ ...common, member: sara, input: `https://youtu.be/${id}` });
    assert.match(text(r.payload), /أُضيفت للقائمة/, id);
  }
  assert.equal(session.queue.size, 3);
  const dup = await env.manager.requestPlay({ ...common, member: sara, input: 'https://youtu.be/BBBBBBBBBBB' });
  assert.match(text(dup.payload), /انطلبت قبل قليل/);
  assert.equal(session.queue.size, 3);
  const q = embeds.queuePayload(session.snapshot(), 0);
  assert.match(text(q), /User22/, 'اسم طالب الأغنية');

  // 3) إيقاف مؤقت: الموضع يثبت
  await controls.perform('pause', session);
  assert.equal(session.status, 'paused');
  const p1 = session.positionMs();
  await wait(450);
  assert.ok(Math.abs(session.positionMs() - p1) < 120, 'الموضع ثابت أثناء الإيقاف');
  assert.match(text(embeds.panelPayload(session.snapshot())), /متوقف مؤقتاً/);
  assert.match(String(await controls.perform('pause', session)), /متوقفة/);
  await controls.perform('resume', session);
  assert.equal(session.status, 'playing');
  await until(() => session.positionMs() > p1 + 200, 3000, 'استكمال من نفس الموضع');

  // 4) تقديم 10 ثوانٍ (المصدر 5 ثوانٍ ← يتخطى للتالية) ثم ترجيع/تقديم مضبوط بقيمة أصغر
  process.env.MUSIC_SEEK_SECONDS = '1';
  session.cfg = { ...session.cfg, seekSeconds: 1 };
  const before = session.positionMs();
  await session.seekBy(1000);
  assert.ok(session.positionMs() >= before + 800, `تقديم: ${before} → ${session.positionMs()}`);
  const mid = session.positionMs();
  await session.seekBy(-1000);
  assert.ok(session.positionMs() <= mid - 800 + 400, `ترجيع: ${mid} → ${session.positionMs()}`);
  assert.equal(session.status, 'playing');

  // 5) إعادة من البداية
  await session.restart();
  assert.ok(session.positionMs() < 600);
  assert.equal(session.queue.current.id, 'AAAAAAAAAAA', 'الأغنية نفسها بدون حذف');

  // 6) تكرار الأغنية: التخطي اليدوي يتجاوزه
  assert.match(String(await controls.perform('repeat', session)), /مفعّل/);
  const skipped = await session.skip();
  assert.equal(skipped.next.id, 'BBBBBBBBBBB');
  assert.equal(session.queue.size, 2);
  assert.match(String(await controls.perform('repeat', session)), /متوقف/);

  // 7) عشوائي وتكرار القائمة أوضاع صحيحة
  assert.match(String(await controls.perform('shuffle', session)), /مفعّل/);
  assert.equal(session.queue.mode, 'shuffle');
  await controls.perform('shuffle', session);
  assert.equal(session.queue.mode, 'normal');

  // 8) انتقال تلقائي عند انتهاء الأغنية (5 ثوانٍ) ← يكمل القائمة
  await until(() => session.queue.current && session.queue.current.id !== 'BBBBBBBBBBB' && session.status === 'playing', 9000, 'انتقال تلقائي');

  // 9) تخطي الباقي ← انتهاء القائمة ← مغادرة تلقائية بعد المهلة
  await session.skip();
  await session.skip();
  assert.equal(session.queue.current, null);
  assert.equal(session.status, 'ended');
  assert.ok(!session.destroyed, 'يبقى بالروم بعد انتهاء القائمة لين تنتهي المهلة');
  await until(() => session.destroyed, 3000, 'مغادرة تلقائية');
  assert.equal(env.manager.getSession(env.guild.id), null);
  assert.ok(env.voice.conns[0].destroyedCalled, 'قُطع الاتصال الصوتي');
  await until(() => alive(env.procs).length === 0, 2000, 'ما بقي ffmpeg');
  await until(() => env.nick.current === null, 2000, 'رجوع الاسم الأصلي');
  assert.ok(session.panelMessage.payload.components.every((r) => r.components.every((c) => c.toJSON().disabled)), 'اللوحة عُطّلت');
  delete process.env.MUSIC_SEEK_SECONDS;
});

test('بحث بالاسم: نتائج بقائمة اختيار، الاختيار للطالب فقط، وبعدها تشغيل فعلي', async () => {
  const env = makeEnv({ id: '1000000000000000002' });
  const vc = env.mkVc('2000000000000000002');
  const a = env.mkMember('3000000000000000031', vc);
  const b = env.mkMember('3000000000000000032', vc);
  const common = { guild: env.guild, textChannel: env.textChannel };
  const r = await env.manager.requestPlay({ ...common, member: a, input: 'blinding lights' });
  assert.equal(r.kind, 'search');
  const menu = r.payload.components[0].components[0].toJSON();
  assert.equal(menu.options.length, 3);
  assert.ok(menu.custom_id.startsWith('mu:sel:') && menu.custom_id.length <= 100);
  const token = menu.custom_id.split(':')[2];
  assert.match(text(r.payload), /Song s1/);

  const other = await env.manager.selectSearch({ ...common, token, index: 0, member: b });
  assert.match(text(other.payload), /نتائج بحث شخص ثاني/);
  const bad = await env.manager.selectSearch({ ...common, token, index: 9, member: a });
  assert.equal(bad.kind, 'error');
  const ok = await env.manager.selectSearch({ ...common, token, index: 1, member: a });
  assert.equal(ok.kind, 'added');
  const session = env.manager.getSession(env.guild.id);
  assert.equal(session.queue.current.id, 's2');
  assert.equal(session.status, 'playing');
  const again = await env.manager.selectSearch({ ...common, token, index: 1, member: a });
  assert.match(text(again.payload), /انتهت صلاحية/);
  await env.manager.destroyAll();
  assert.equal(alive(env.procs).length, 0);
});

test('Spotify: أغنية معروفة تُشغَّل عبر نسخة مطابقة مع بيانات Spotify، وفشل المطابقة يعطي رسالة بدل أغنية ثانية', async () => {
  const env = makeEnv({ id: '1000000000000000003' });
  const vc = env.mkVc('2000000000000000003');
  const a = env.mkMember('3000000000000000041', vc);
  const common = { guild: env.guild, textChannel: env.textChannel };
  const r = await env.manager.requestPlay({ ...common, member: a, input: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b' });
  assert.equal(r.kind, 'added');
  assert.match(text(r.payload), /Spotify Song/);
  assert.equal(env.manager.getSession(env.guild.id).queue.current.via, 'spotify');
  await env.manager.destroyAll();

  env.fakeExtractor.fromSpotify = async () => {
    throw new MusicError('NO_MATCH', extractor.MESSAGES.NO_MATCH);
  };
  const r2 = await env.manager.requestPlay({ ...common, member: a, input: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b' });
  assert.equal(r2.kind, 'error');
  assert.match(text(r2.payload), /ما شغّلت أغنية ثانية/);
  assert.equal(env.manager.getSession(env.guild.id), null);
});

test('شروط الدخول: بدون روم صوتي، روم مختلف عن الجلسة، صلاحيات ناقصة، روابط غير صالحة', async () => {
  const env = makeEnv({ id: '1000000000000000004' });
  const vc1 = env.mkVc('2000000000000000004');
  const vc2 = env.mkVc('2000000000000000005');
  const weak = env.mkVc('2000000000000000006', { vperms: [PermissionFlagsBits.ViewChannel] });
  const nov = env.mkMember('3000000000000000051', null);
  const inv1 = env.mkMember('3000000000000000052', vc1);
  const inv2 = env.mkMember('3000000000000000053', vc2);
  const inWeak = env.mkMember('3000000000000000054', weak);
  const common = { guild: env.guild, textChannel: env.textChannel };

  const r0 = await env.manager.requestPlay({ ...common, member: nov, input: 'x' });
  assert.match(text(r0.payload), /ادخل روم صوتي أول، وبعدها أقدر أشغل لك الأغنية/);
  assert.equal(env.voice.conns.length, 0, 'ما دخل أي روم');

  const rw = await env.manager.requestPlay({ ...common, member: inWeak, input: 'https://youtu.be/AAAAAAAAAAA' });
  assert.match(text(rw.payload), /Connect|Speak/);

  for (const [input, re] of [['https://evil.com/x', /غير مدعوم/], ['https://www.youtube.com/watch?v=zz', /غير صالح/], ['https://open.spotify.com/playlist/0VjIjW4GlUZAMYd2vXMi3b', /مو أغنية/]]) {
    const r = await env.manager.requestPlay({ ...common, member: inv1, input });
    assert.equal(r.kind, 'error');
    assert.match(text(r.payload), re);
  }
  assert.equal(env.voice.conns.length, 0);

  await env.manager.requestPlay({ ...common, member: inv1, input: 'https://youtu.be/AAAAAAAAAAA' });
  const rx = await env.manager.requestPlay({ ...common, member: inv2, input: 'https://youtu.be/BBBBBBBBBBB' });
  assert.match(text(rx.payload), /جلسة موسيقى نشطة/);
  assert.match(text(rx.payload), new RegExp(vc1.id));
  assert.equal(env.voice.conns.length, 1, 'ما انتقل لروم ثاني');
  await env.manager.destroyAll();
});

test('الصلاحيات: عضو خارج الروم/بروم مختلف لا يتحكم، وبنفس الروم يتحكم؛ المشرفون فقط حسب الإعداد', async () => {
  const env = makeEnv({ id: '1000000000000000005' });
  _setManager(env.manager);
  const vc = env.mkVc('2000000000000000007');
  const other = env.mkVc('2000000000000000008');
  const inside = env.mkMember('3000000000000000061', vc);
  const outside = env.mkMember('3000000000000000062', null);
  const wrongRoom = env.mkMember('3000000000000000063', other);
  await env.manager.requestPlay({ guild: env.guild, textChannel: env.textChannel, member: inside, input: 'https://youtu.be/AAAAAAAAAAA' });
  const session = env.manager.getSession(env.guild.id);

  const fakeInteraction = (member, customId = 'mu:skip') => {
    const log = [];
    const i = {
      guild: env.guild,
      member,
      user: member.user,
      channel: env.textChannel,
      customId,
      deferred: false,
      replied: false,
      isStringSelectMenu: () => false,
      async deferUpdate() { i.deferred = true; log.push(['deferUpdate']); },
      async reply(p) { i.replied = true; log.push(['reply', p]); },
      async followUp(p) { log.push(['followUp', p]); },
      async update(p) { log.push(['update', p]); },
      log
    };
    return i;
  };

  for (const [m, re] of [[outside, /ادخل الروم الصوتي/], [wrongRoom, /روم مختلف|نفس الروم الصوتي/]]) {
    for (const action of ['skip', 'pause', 'stop', 'fwd']) {
      const i = fakeInteraction(m);
      await controls.onComponent(i, [action]);
      const reply = i.log.find(([k]) => k === 'reply');
      assert.ok(reply, `${action} يرد برفض`);
      assert.ok(reply[1].flags & 64, 'Ephemeral');
      assert.match(text(reply[1]), re);
      assert.equal(session.status, 'playing', 'ما تغيّرت حالة الجلسة');
      assert.ok(!session.destroyed);
    }
  }
  const okI = fakeInteraction(inside);
  await controls.onComponent(okI, ['pause']);
  assert.equal(session.status, 'paused');
  assert.ok(okI.log.some(([k]) => k === 'deferUpdate'));
  await controls.onComponent(fakeInteraction(inside), ['resume']);
  assert.equal(session.status, 'playing');

  // ضغطات متزامنة: ما يحصل تعارض ولا تعطل
  await Promise.allSettled([session.seekBy(300), session.seekBy(300), session.pause(), session.resume(), session.restart()]);
  assert.ok(['playing', 'paused'].includes(session.status));
  assert.ok(alive(env.procs).length <= 1, 'عملية ffmpeg واحدة فقط بعد الضغط المتكرر');

  // أزرار قائمة الانتظار متاحة لأي أحد بالرسالة (عرض فقط)
  const qi = fakeInteraction(outside, 'mu:queue');
  await controls.onComponent(qi, ['queue']);
  assert.ok(qi.log.some(([k, p]) => k === 'reply' && /قائمة الانتظار/.test(text(p))));

  // تقييد للمشرفين
  process.env.MUSIC_ADMIN_ONLY = 'skip';
  const adm = fakeInteraction(inside);
  await controls.onComponent(adm, ['skip']);
  assert.match(text(adm.log.find(([k]) => k === 'reply')[1]), /للمشرفين فقط/);
  delete process.env.MUSIC_ADMIN_ONLY;

  // الأوامر المشتركة (!تخطي !ايقاف !قائمة !موسيقى)
  const rq = await controls.runCommand('قائمة', { guild: env.guild, member: outside, textChannel: env.textChannel });
  assert.match(text(rq.payload), /قائمة الانتظار/);
  const rs = await controls.runCommand('تخطي', { guild: env.guild, member: outside, textChannel: env.textChannel });
  assert.ok(rs.ephemeral);
  const rm = await controls.runCommand('موسيقى', { guild: env.guild, member: inside, textChannel: env.textChannel });
  assert.match(text(rm.payload), /إحصائيات الجلسة/);
  const stop = await controls.runCommand('ايقاف', { guild: env.guild, member: inside, textChannel: env.textChannel });
  assert.match(text(stop.payload), /أوقفت الموسيقى/);
  assert.equal(env.manager.getSession(env.guild.id), null);
  const none = await controls.runCommand('قائمة', { guild: env.guild, member: inside, textChannel: env.textChannel });
  assert.match(text(none.payload), /ما فيه جلسة/);
  _setManager(null);
  await until(() => alive(env.procs).length === 0, 2000);
});

test('أخطاء: مصدر محجوب لأول أغنية ← رسالة واضحة بدون دخول الروم؛ أغنية تفشل وسط القائمة ← تُتخطى مع تنبيه ويكمل البوت', async () => {
  const env = makeEnv({ id: '1000000000000000006' });
  const vc = env.mkVc('2000000000000000009');
  const a = env.mkMember('3000000000000000071', vc);
  const common = { guild: env.guild, textChannel: env.textChannel };

  env.fakeExtractor.getInfo = async () => {
    throw new MusicError('BOT_CHECK', extractor.MESSAGES.BOT_CHECK);
  };
  const r = await env.manager.requestPlay({ ...common, member: a, input: 'https://youtu.be/AAAAAAAAAAA' });
  assert.equal(r.kind, 'error');
  assert.match(text(r.payload), /يوتيوب يرفض الوصول/);
  assert.equal(env.voice.conns.length, 0);
  assert.equal(env.manager.getSession(env.guild.id), null);

  env.fakeExtractor.getInfo = async (url) => {
    const c = extractor.classify(url);
    return T(c.id, { id: c.id, duration: 5, url: c.url, failResolve: c.id === 'BBBBBBBBBBB' ? 'UNAVAILABLE' : undefined });
  };
  // فشل resolve لأول أغنية بجلسة جديدة
  const bad = await env.manager.requestPlay({ ...common, member: a, input: 'https://youtu.be/BBBBBBBBBBB' });
  assert.match(text(bad.payload), /غير متاحة/);
  assert.equal(env.voice.conns.length, 0, 'ما دخل الروم لأغنية ما تشتغل');

  // فشل بالوسط: A تعمل، B (تفشل عند resolve)، C تعمل
  await env.manager.requestPlay({ ...common, member: a, input: 'https://youtu.be/AAAAAAAAAAA' });
  const session = env.manager.getSession(env.guild.id);
  await env.manager.requestPlay({ ...common, member: a, input: 'https://youtu.be/BBBBBBBBBBB' });
  await env.manager.requestPlay({ ...common, member: a, input: 'https://youtu.be/CCCCCCCCCCC' });
  assert.equal(session.queue.size, 2);
  await session.skip();
  assert.equal(session.queue.current.id, 'CCCCCCCCCCC', 'B تخطّاها تلقائياً');
  assert.equal(session.status, 'playing');
  await until(() => env.sent.some((m) => /تخطيت أغنية تعذّر تشغيلها/.test(text(m.payload))), 2000, 'تنبيه التخطي');
  assert.equal(session.stats.failed, 1);

  // قائمة ممتلئة
  process.env.MUSIC_MAX_QUEUE = '1';
  const small = makeEnv({ id: '1000000000000000007' });
  const vc2 = small.mkVc('2000000000000000010');
  const m2 = small.mkMember('3000000000000000072', vc2);
  const c2 = { guild: small.guild, textChannel: small.textChannel, member: m2 };
  await small.manager.requestPlay({ ...c2, input: 'https://youtu.be/AAAAAAAAAAA' });
  await small.manager.requestPlay({ ...c2, input: 'https://youtu.be/BBBBBBBBBBB' });
  const full = await small.manager.requestPlay({ ...c2, input: 'https://youtu.be/CCCCCCCCCCC' });
  assert.match(text(full.payload), /ممتلئة/);
  delete process.env.MUSIC_MAX_QUEUE;
  await small.manager.destroyAll();
  await env.manager.destroyAll();
  assert.equal(alive(env.procs).length + alive(small.procs).length, 0);
});

test('جلسات مستقلة لسيرفرين بنفس الوقت، وطلبات متزامنة لنفس السيرفر تنتج جلسة واحدة', async () => {
  const e1 = makeEnv({ id: '1000000000000000008' });
  const e2 = makeEnv({ id: '1000000000000000009' });
  const shared = new MusicManager({ deps: { extractor: e1.fakeExtractor, player: { voice: e1.voice, extractor: e1.fakeExtractor, spawn: spawn } } });
  const vc1 = e1.mkVc('2000000000000000011');
  const vc2 = e2.mkVc('2000000000000000012');
  const a = e1.mkMember('3000000000000000081', vc1);
  const b = e2.mkMember('3000000000000000082', vc2);
  const c = e1.mkMember('3000000000000000083', vc1);
  const [r1, r2, r3] = await Promise.all([
    shared.requestPlay({ guild: e1.guild, textChannel: e1.textChannel, member: a, input: 'https://youtu.be/AAAAAAAAAAA' }),
    shared.requestPlay({ guild: e2.guild, textChannel: e2.textChannel, member: b, input: 'https://youtu.be/BBBBBBBBBBB' }),
    shared.requestPlay({ guild: e1.guild, textChannel: e1.textChannel, member: c, input: 'https://youtu.be/CCCCCCCCCCC' })
  ]);
  assert.ok([r1, r2, r3].every((r) => r.kind === 'added'));
  const s1 = shared.getSession(e1.guild.id);
  const s2 = shared.getSession(e2.guild.id);
  assert.notEqual(s1, s2);
  assert.equal(shared.sessions.size, 2);
  assert.equal(e1.voice.conns.length, 2, 'اتصالان فقط: واحد لكل سيرفر (ما تكرر لنفس السيرفر)');
  assert.equal(s1.queue.current.id, 'AAAAAAAAAAA');
  assert.equal(s1.queue.size, 1);
  assert.equal(s2.queue.size, 0);
  assert.equal(s2.queue.current.id, 'BBBBBBBBBBB');
  assert.equal(s1.status, 'playing');
  assert.equal(s2.status, 'playing');
  await s1.skip();
  assert.equal(s2.queue.current.id, 'BBBBBBBBBBB', 'سيرفر ثاني ما تأثر');
  assert.equal(await shared.destroyAll(), 2);
  assert.equal(shared.sessions.size, 0);
});

test('انقطاع الاتصال: فشل إعادة الاتصال ينهي الجلسة وينظّف؛ والروم الفاضي يغادر بعد المهلة', async () => {
  const env = makeEnv({ id: '1000000000000000010' });
  _setManager(env.manager);
  const vc = env.mkVc('2000000000000000013');
  const a = env.mkMember('3000000000000000091', vc);
  await env.manager.requestPlay({ guild: env.guild, textChannel: env.textChannel, member: a, input: 'https://youtu.be/AAAAAAAAAAA' });
  const s = env.manager.getSession(env.guild.id);

  // خروج آخر عضو ← مؤقت مغادرة، وعودته يلغيه
  vc.members.delete(a.id);
  events.onVoiceStateUpdate({ guild: env.guild, member: a, channelId: vc.id }, { guild: env.guild, member: a, channelId: null }, { user: { id: 'bot' } });
  assert.ok(s.emptyTimer, 'مؤقت المغادرة بدأ');
  vc.members.set(a.id, a);
  events.onVoiceStateUpdate({ guild: env.guild, member: a, channelId: null }, { guild: env.guild, member: a, channelId: vc.id }, { user: { id: 'bot' } });
  assert.equal(s.emptyTimer, null);
  assert.ok(!s.destroyed);
  vc.members.delete(a.id);
  events.onVoiceStateUpdate({ guild: env.guild, member: a, channelId: vc.id }, { guild: env.guild, member: a, channelId: null }, { user: { id: 'bot' } });
  await until(() => s.destroyed, 2500, 'مغادرة الروم الفاضي');
  assert.equal(env.manager.getSession(env.guild.id), null);

  // انقطاع فعلي
  const vc2 = env.mkVc('2000000000000000014');
  const b = env.mkMember('3000000000000000092', vc2);
  await env.manager.requestPlay({ guild: env.guild, textChannel: env.textChannel, member: b, input: 'https://youtu.be/BBBBBBBBBBB' });
  const s2 = env.manager.getSession(env.guild.id);
  env.voice.failReconnect = true;
  env.voice.conns[env.voice.conns.length - 1].emit('disconnected');
  await until(() => s2.destroyed, 3000, 'تنظيف بعد الانقطاع');
  assert.equal(env.manager.getSession(env.guild.id), null);
  await until(() => alive(env.procs).length === 0, 2000);

  // انقطاع مع نجاح إعادة الاتصال ← تكمل الجلسة
  env.voice.failReconnect = false;
  await env.manager.requestPlay({ guild: env.guild, textChannel: env.textChannel, member: b, input: 'https://youtu.be/CCCCCCCCCCC' });
  const s3 = env.manager.getSession(env.guild.id);
  env.voice.conns[env.voice.conns.length - 1].emit('disconnected');
  await wait(200);
  assert.ok(!s3.destroyed);
  assert.equal(s3.status, 'playing');

  // فشل الدخول للروم ← رسالة واضحة وتنظيف
  await env.manager.destroyAll();
  env.voice.failJoin = true;
  const bad = await env.manager.requestPlay({ guild: env.guild, textChannel: env.textChannel, member: b, input: 'https://youtu.be/AAAAAAAAAAA' });
  assert.equal(bad.kind, 'error');
  assert.match(text(bad.payload), /ما قدرت أدخل الروم الصوتي/);
  assert.equal(env.manager.getSession(env.guild.id), null);
  _setManager(null);
});

test('انقطاع المصدر قبل نهاية الأغنية: يعيد الاتصال من نفس الموضع (حدّ محاولتين) ثم ينتقل', async () => {
  const env = makeEnv({ id: '1000000000000000011' });
  const vc = env.mkVc('2000000000000000015');
  const a = env.mkMember('3000000000000000101', vc);
  // الأغنية تدّعي 60 ثانية والملف 5 ثوانٍ فقط ← ينتهي "قبل أوانه"
  env.fakeExtractor.getInfo = async (url) => T('LONGLONGLON', { id: 'LONGLONGLON', duration: 60, url });
  const t0 = Date.now();
  await env.manager.requestPlay({ guild: env.guild, textChannel: env.textChannel, member: a, input: 'https://youtu.be/LONGLONGLON' });
  const s = env.manager.getSession(env.guild.id);
  // نقفز قرب نهاية الملف لتسريع الاختبار
  await s._run(() => s._seekTo(4000));
  await until(() => env.resolves.length >= 3, 12000, 'محاولات إعادة الاتصال');
  assert.ok(Date.now() - t0 < 20000);
  await until(() => s.status === 'ended', 12000, 'انتقل/انتهى بعد المحاولات');
  assert.ok(env.resolves.length <= 5, `محاولات محدودة: ${env.resolves.length}`);
  await env.manager.destroyAll();
});

test('الهوية: اسم البوت يتبع الأغنية وتُسترجع الأسماء حتى بعد إعادة تشغيل البوت', async () => {
  const guild = { id: '1000000000000000012', members: { me: { id: 'bot', nickname: 'Ehsmaha', permissions: new PermissionsBitField([PermissionFlagsBits.ChangeNickname]), manageable: true, calls: [], async setNickname(n) { this.nickname = n; this.calls.push(n); } } } };
  assert.equal(await identity.apply(guild, 'A very long song title that exceeds thirty two characters'), true);
  assert.equal(guild.members.me.nickname.length, 32);
  assert.equal(await identity.restore(guild), true);
  assert.equal(guild.members.me.nickname, 'Ehsmaha');
  // محاكاة توقف مفاجئ: apply ثم "إعادة تشغيل" (الحالة بالذاكرة تضيع) ثم restoreAll
  await identity.apply(guild, 'Song');
  identity._internal.lastApplied.clear();
  const n = await identity.restoreAll({ guilds: { cache: new Map([[guild.id, guild]]) } });
  assert.equal(n, 1);
  assert.equal(guild.members.me.nickname, 'Ehsmaha');
  // بدون صلاحية: لا شي
  const noPerm = { id: '1000000000000000013', members: { me: { permissions: new PermissionsBitField([]), manageable: true } } };
  assert.equal(await identity.apply(noPerm, 'X'), false);
});

test('إعدادات الموسيقى: افتراضيات سليمة وحدود', () => {
  const { getMusicConfig } = require('../music/MusicConfig');
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) if (k.startsWith('MUSIC_') || k.startsWith('YTDLP_')) delete process.env[k];
  const c = getMusicConfig();
  assert.equal(c.prefix, '!');
  assert.equal(c.maxQueue, 50);
  assert.equal(c.seekSeconds, 10);
  assert.equal(c.idleLeaveSeconds, 120);
  assert.equal(c.nickname, true);
  assert.equal(c.ytdlpPath, null);
  process.env.MUSIC_MAX_QUEUE = '99999';
  process.env.MUSIC_ENABLED = 'off';
  assert.equal(getMusicConfig().maxQueue, 500);
  assert.equal(getMusicConfig().enabled, false);
  Object.assign(process.env, saved);
  delete process.env.MUSIC_MAX_QUEUE;
  delete process.env.MUSIC_ENABLED;
});
