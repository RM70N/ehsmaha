'use strict';

// استخراج بيانات الأغاني ومصدر الصوت عبر yt-dlp (أداة مفتوحة المصدر ومحدّثة باستمرار):
//   • بحث باسم الأغنية        → search()
//   • رابط YouTube            → getInfo()  (يتحقق من الإتاحة قبل الإضافة)
//   • رابط Spotify (أغنية)    → fromSpotify(): نقرأ بيانات الأغنية (الاسم/الفنان/المدة) فقط ونبحث عن نسخة
//                              قابلة للتشغيل — لا نحاول استخراج صوت من Spotify (محمي بـDRM) ولا نشغّل أغنية مختلفة.
//   • رابط الصوت الفعلي        → resolveStream(): يُحلّ لحظة التشغيل (روابط googlevideo مؤقتة — ما نخزّنها)
// ملاحظة: YouTube يحجب أحياناً عناوين الاستضافات (Sign in to confirm you're not a bot) — الحل بـYTDLP_COOKIES_FILE
// أو YTDLP_PROXY (انظر MUSIC-SYSTEM.md). نرجّع رسالة واضحة بدل تشغيل أي شي وهمي.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const axios = require('axios');
const { getMusicConfig } = require('./MusicConfig');
const logger = require('../utils/logger');

class MusicError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message);
    this.name = 'MusicError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

const MESSAGES = {
  INVALID_URL: 'الرابط غير صالح — الروابط المدعومة: YouTube (فيديو/أغنية) و Spotify (أغنية).',
  UNSUPPORTED_SPOTIFY: 'رابط Spotify هذا مو أغنية — المدعوم رابط أغنية واحدة فقط (track).',
  UNSUPPORTED_LINK: 'هذا الرابط غير مدعوم — الروابط المدعومة: YouTube و Spotify (أغنية).',
  NOT_FOUND: 'ما لقيت نتائج لهذا البحث.',
  NO_MATCH: 'ما لقيت نسخة قابلة للتشغيل لهذه الأغنية بنفس الاسم والفنان — ما شغّلت أغنية ثانية بدلها.',
  UNAVAILABLE: 'الأغنية غير متاحة (محذوفة أو غير موجودة).',
  PRIVATE: 'الفيديو خاص أو يتطلب تسجيل دخول.',
  AGE_RESTRICTED: 'الفيديو مقيّد بالعمر ولا يمكن تشغيله.',
  GEO_BLOCKED: 'الفيديو محجوب في منطقة البوت.',
  LIVE: 'البث المباشر غير مدعوم — اختر أغنية عادية.',
  TOO_LONG: 'الأغنية أطول من الحد المسموح.',
  BOT_CHECK: 'يوتيوب يرفض الوصول من خادم البوت حالياً (يطلب تسجيل دخول). على مالك البوت إضافة كوكيز أو بروكسي — التفاصيل بملف MUSIC-SYSTEM.md.',
  NETWORK: 'تعذّر الاتصال بمصدر الصوت — جرّب بعد قليل.',
  TIMEOUT: 'انتهت مهلة استخراج الأغنية — جرّب بعد قليل.',
  NO_TOOL: 'أداة استخراج الصوت (yt-dlp) غير متوفرة على الخادم.',
  EXTRACT_FAILED: 'فشل استخراج الصوت من هذا المصدر.'
};
const msg = (code) => MESSAGES[code] || MESSAGES.EXTRACT_FAILED;

// ---------------------------------------------------------------- تصنيف المدخلات

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be']);
const SPOTIFY_HOSTS = new Set(['open.spotify.com']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * يصنّف المدخل: query | youtube | spotify | error.
 * @returns {{type:'query', query:string}|{type:'youtube', id:string, url:string}|{type:'spotify', id:string, url:string}|{type:'error', code:string, message:string}}
 */
function classify(input) {
  const raw = String(input || '').trim();
  if (!raw) return { type: 'error', code: 'NOT_FOUND', message: msg('NOT_FOUND') };
  const looksLikeUrl = /^(https?:\/\/|www\.)/i.test(raw) || /^(youtu\.be|open\.spotify\.com|(m|music)?\.?youtube\.com)\//i.test(raw);
  if (!looksLikeUrl) return { type: 'query', query: raw.replace(/\s+/g, ' ').slice(0, 200) };
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { type: 'error', code: 'INVALID_URL', message: msg('INVALID_URL') };
  }
  if (!['http:', 'https:'].includes(u.protocol)) return { type: 'error', code: 'INVALID_URL', message: msg('INVALID_URL') };
  const host = u.hostname.toLowerCase();

  if (YT_HOSTS.has(host)) {
    let id = null;
    if (host.endsWith('youtu.be')) id = u.pathname.split('/').filter(Boolean)[0];
    else if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
      if (m) id = m[1];
    }
    if (id && VIDEO_ID.test(id)) return { type: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}` };
    return { type: 'error', code: 'INVALID_URL', message: msg('INVALID_URL') };
  }
  if (SPOTIFY_HOSTS.has(host)) {
    const m = u.pathname.match(/^\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})/);
    if (m) return { type: 'spotify', id: m[1], url: `https://open.spotify.com/track/${m[1]}` };
    if (/^\/(?:intl-[a-z-]+\/)?(album|playlist|artist|show|episode)\//.test(u.pathname)) {
      return { type: 'error', code: 'UNSUPPORTED_SPOTIFY', message: msg('UNSUPPORTED_SPOTIFY') };
    }
    return { type: 'error', code: 'INVALID_URL', message: msg('INVALID_URL') };
  }
  return { type: 'error', code: 'UNSUPPORTED_LINK', message: msg('UNSUPPORTED_LINK') };
}

// ---------------------------------------------------------------- تصنيف أخطاء yt-dlp

function classifyYtdlpError(stderr) {
  const s = String(stderr || '');
  if (/confirm your age|age-restricted|inappropriate for some users/i.test(s)) return 'AGE_RESTRICTED';
  if (/confirm you.?re not a bot|use --cookies/i.test(s)) return 'BOT_CHECK';
  if (/private video|this video is private|members-only|join this channel|sign in if you.?ve been granted/i.test(s)) return 'PRIVATE';
  if (/available in your country|blocked it in your country|geo.?restrict/i.test(s)) return 'GEO_BLOCKED';
  if (/video unavailable|has been removed|no longer available|does not exist|account associated.*terminated|copyright|unavailable/i.test(s)) return 'UNAVAILABLE';
  if (/is live|live event|premieres in/i.test(s)) return 'LIVE';
  if (/timed out|timeout/i.test(s)) return 'TIMEOUT';
  if (/unable to download|getaddrinfo|connection (reset|refused)|network is unreachable|http error 5\d\d|temporary failure/i.test(s)) return 'NETWORK';
  return 'EXTRACT_FAILED';
}

// ---------------------------------------------------------------- تشغيل yt-dlp (عملية واحدة بالوقت: الذاكرة محدودة)

let binaryPromise = null;
let activeJobs = 0;
const waiters = [];
const MAX_JOBS = 1;
const MAX_OUTPUT = 12 * 1024 * 1024;

function acquire() {
  if (activeJobs < MAX_JOBS) {
    activeJobs++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}
function release() {
  const next = waiters.shift();
  if (next) next();
  else activeJobs--;
}

async function exists(p) {
  try {
    await fs.promises.access(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function downloadBinary(target) {
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const asset = process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
  logger.info('🎵 تنزيل yt-dlp لأول مرة', { target });
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 120_000, maxContentLength: 200 * 1024 * 1024, maxRedirects: 5 });
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, Buffer.from(res.data), { mode: 0o755 });
  await fs.promises.rename(tmp, target);
}

async function ensureBinary() {
  const cfg = getMusicConfig();
  if (cfg.ytdlpPath) {
    if (await exists(cfg.ytdlpPath)) return cfg.ytdlpPath;
    throw new MusicError('NO_TOOL', msg('NO_TOOL'));
  }
  const local = path.join(cfg.dataDir, 'bin', 'yt-dlp');
  if (await exists(local)) return local;
  if (!binaryPromise) {
    binaryPromise = (async () => {
      for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
        const p = path.join(dir, 'yt-dlp');
        if (dir && (await exists(p))) return p;
      }
      if (!cfg.ytdlpAutoDownload) throw new MusicError('NO_TOOL', msg('NO_TOOL'));
      await downloadBinary(local);
      return local;
    })().catch((err) => {
      binaryPromise = null; // نسمح بإعادة المحاولة لاحقاً
      if (err instanceof MusicError) throw err;
      logger.warn('🎵 تعذّر تنزيل yt-dlp', { error: err && err.message });
      throw new MusicError('NO_TOOL', msg('NO_TOOL'), { cause: err });
    });
  }
  return binaryPromise;
}

let cookiesPath = null;
function cookiesArgs(cfg) {
  if (cfg.ytdlpCookiesFile && fs.existsSync(cfg.ytdlpCookiesFile)) {
    // yt-dlp يكتب على ملف الكوكيز — ننسخه لمجلد مؤقت حتى ما نعدّل الأصل
    if (!cookiesPath) {
      cookiesPath = path.join(os.tmpdir(), `ehsmaha-yt-cookies-${process.pid}.txt`);
      fs.copyFileSync(cfg.ytdlpCookiesFile, cookiesPath);
      fs.chmodSync(cookiesPath, 0o600);
    }
    return ['--cookies', cookiesPath];
  }
  if (cfg.ytdlpCookiesB64) {
    if (!cookiesPath) {
      cookiesPath = path.join(os.tmpdir(), `ehsmaha-yt-cookies-${process.pid}.txt`);
      fs.writeFileSync(cookiesPath, Buffer.from(cfg.ytdlpCookiesB64, 'base64'), { mode: 0o600 });
    }
    return ['--cookies', cookiesPath];
  }
  return [];
}

function baseArgs(cfg) {
  const a = ['--ignore-config', '--no-warnings', '--no-playlist', '--no-cache-dir', '--socket-timeout', '15', '--retries', '2'];
  if (cfg.ytdlpProxy) a.push('--proxy', cfg.ytdlpProxy);
  if (cfg.ytdlpJsRuntime) a.push('--js-runtimes', cfg.ytdlpJsRuntime);
  if (cfg.ytdlpPlayerClients) a.push('--extractor-args', `youtube:player_client=${cfg.ytdlpPlayerClients}`);
  a.push(...cookiesArgs(cfg));
  return a;
}

/** يشغّل yt-dlp ويرجع stdout كنص. يُسلسَل (عملية واحدة بالوقت) ويُقتل عند المهلة. */
async function runYtdlp(args, { timeoutMs } = {}) {
  const cfg = getMusicConfig();
  const bin = await ensureBinary();
  const limit = timeoutMs || cfg.ytdlpTimeoutMs;
  await acquire();
  try {
    return await new Promise((resolve, reject) => {
      let out = '';
      let err = '';
      let done = false;
      const child = spawn(bin, [...baseArgs(cfg), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      const finish = (fn, v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        fn(v);
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(reject, new MusicError('TIMEOUT', msg('TIMEOUT')));
      }, limit);
      child.stdout.on('data', (d) => {
        out += d;
        if (out.length > MAX_OUTPUT) {
          child.kill('SIGKILL');
          finish(reject, new MusicError('EXTRACT_FAILED', msg('EXTRACT_FAILED')));
        }
      });
      child.stderr.on('data', (d) => {
        if (err.length < 8000) err += d;
      });
      child.on('error', (e) => finish(reject, new MusicError('NO_TOOL', msg('NO_TOOL'), { cause: e })));
      child.on('close', (code) => {
        if (code === 0) return finish(resolve, out);
        const c = classifyYtdlpError(err);
        logger.warn('🎵 yt-dlp فشل', { code: c, exit: code, detail: err.slice(0, 300) });
        return finish(reject, new MusicError(c, msg(c)));
      });
    });
  } finally {
    release();
  }
}

// ---------------------------------------------------------------- تحويل النتائج

const cleanArtist = (s) => String(s || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
const thumbOf = (e) => {
  if (e.thumbnail) return e.thumbnail;
  const list = Array.isArray(e.thumbnails) ? e.thumbnails.filter((t) => t && t.url) : [];
  if (list.length) return list[list.length - 1].url;
  return e.id ? `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg` : null;
};

function toTrack(e, extra = {}) {
  return {
    source: 'youtube',
    id: String(e.id),
    url: `https://www.youtube.com/watch?v=${e.id}`,
    title: String(e.track || e.title || 'بدون عنوان').slice(0, 200),
    artist: cleanArtist(e.artist || e.creator || e.channel || e.uploader || '') || 'غير معروف',
    duration: Number.isFinite(Number(e.duration)) ? Math.round(Number(e.duration)) : null,
    thumbnail: thumbOf(e),
    isLive: !!(e.is_live || e.live_status === 'is_live'),
    ...extra
  };
}

function checkPlayable(track, cfg = getMusicConfig()) {
  if (track.isLive || track.duration === null) throw new MusicError('LIVE', msg('LIVE'));
  if (track.duration > cfg.maxTrackSeconds) throw new MusicError('TOO_LONG', msg('TOO_LONG'));
  return track;
}

async function search(query, limit = getMusicConfig().searchResults) {
  const cfg = getMusicConfig();
  const n = Math.min(10, Math.max(1, limit)) + 3; // نزيد شوية لأن بعضها يُفلتر (بث/طويل)
  const out = await runYtdlp(['-J', '--flat-playlist', `ytsearch${n}:${query}`]);
  let data;
  try {
    data = JSON.parse(out);
  } catch {
    throw new MusicError('EXTRACT_FAILED', msg('EXTRACT_FAILED'));
  }
  const tracks = (data.entries || [])
    .filter((e) => e && e.id && VIDEO_ID.test(String(e.id)))
    .map((e) => toTrack(e))
    .filter((t) => !t.isLive && t.duration !== null && t.duration <= cfg.maxTrackSeconds)
    .slice(0, limit);
  if (!tracks.length) throw new MusicError('NOT_FOUND', msg('NOT_FOUND'));
  return tracks;
}

// بيانات رابط يوتيوب + تحقق أنه قابل للتشغيل (استدعاء كامل يمرّ على مشغّل يوتيوب)
async function getInfo(url) {
  const out = await runYtdlp(['-J', '--skip-download', url]);
  let data;
  try {
    data = JSON.parse(out);
  } catch {
    throw new MusicError('EXTRACT_FAILED', msg('EXTRACT_FAILED'));
  }
  if (!data || !data.id) throw new MusicError('UNAVAILABLE', msg('UNAVAILABLE'));
  if (data.availability && ['private', 'needs_auth', 'subscriber_only', 'premium_only'].includes(data.availability)) {
    throw new MusicError('PRIVATE', msg('PRIVATE'));
  }
  if (data.age_limit && data.age_limit >= 18) throw new MusicError('AGE_RESTRICTED', msg('AGE_RESTRICTED'));
  return checkPlayable(toTrack(data));
}

/** رابط الصوت الفعلي + هيدرز — يُحلّ لحظة التشغيل لأن روابط googlevideo مؤقتة. */
async function resolveStream(track) {
  const out = await runYtdlp(['-J', '--skip-download', '-f', 'bestaudio[acodec=opus]/bestaudio/best', track.url]);
  let data;
  try {
    data = JSON.parse(out);
  } catch {
    throw new MusicError('EXTRACT_FAILED', msg('EXTRACT_FAILED'));
  }
  const fmt = data.url ? data : (data.requested_formats && data.requested_formats[0]) || (data.formats || []).filter((f) => f.url && f.acodec !== 'none').pop();
  if (!fmt || !fmt.url) throw new MusicError('EXTRACT_FAILED', msg('EXTRACT_FAILED'));
  if (data.is_live) throw new MusicError('LIVE', msg('LIVE'));
  return { url: fmt.url, headers: fmt.http_headers || data.http_headers || {}, resolvedAt: Date.now(), duration: data.duration || track.duration };
}

// ---------------------------------------------------------------- Spotify (بيانات فقط)

function metaContent(html, key) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : null;
}
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function fetchSpotifyMeta(url) {
  let html;
  try {
    const res = await axios.get(url, {
      timeout: 12_000,
      maxContentLength: 3 * 1024 * 1024,
      responseType: 'text',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)', 'Accept-Language': 'en' }
    });
    html = String(res.data || '');
  } catch (err) {
    if (err && err.response && [404, 400].includes(err.response.status)) throw new MusicError('UNAVAILABLE', msg('UNAVAILABLE'));
    throw new MusicError('NETWORK', msg('NETWORK'), { cause: err });
  }
  const title = metaContent(html, 'og:title');
  if (!title) throw new MusicError('UNAVAILABLE', msg('UNAVAILABLE'));
  const desc = metaContent(html, 'og:description') || '';
  const artist = metaContent(html, 'music:musician_description') || desc.split('·')[0].trim();
  const duration = Number(metaContent(html, 'music:duration'));
  return { title, artist, duration: Number.isFinite(duration) && duration > 0 ? duration : null, thumbnail: metaContent(html, 'og:image') };
}

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const tokens = (s) => norm(s).split(' ').filter((t) => t.length > 1 || /\p{N}/u.test(t));
const BAD_WORDS = ['cover', 'remix', 'karaoke', 'sped up', 'slowed', 'reverb', 'nightcore', '8d', 'instrumental', 'live', 'lyrics video', 'tribute', 'parody'];

/** درجة تطابق نتيجة يوتيوب مع بيانات Spotify (0..1+). بدون تطابق كافٍ ← ما نشغّل شي. */
function scoreMatch(meta, cand) {
  const wantTitle = tokens(meta.title);
  const candText = norm(`${cand.title} ${cand.artist}`);
  if (!wantTitle.length) return 0;
  const titleHit = wantTitle.filter((t) => candText.includes(t)).length / wantTitle.length;
  const artistTokens = tokens(meta.artist);
  const artistHit = artistTokens.length ? artistTokens.filter((t) => candText.includes(t)).length / artistTokens.length : 0.5;
  let score = titleHit * 0.55 + artistHit * 0.3;
  if (meta.duration && cand.duration) {
    const diff = Math.abs(meta.duration - cand.duration);
    score += diff <= 3 ? 0.25 : diff <= 8 ? 0.15 : diff <= 20 ? 0.03 : -0.25;
  }
  const wantNorm = norm(meta.title);
  const candNorm = norm(cand.title);
  for (const w of BAD_WORDS) if (candNorm.includes(w) && !wantNorm.includes(w)) score -= 0.3;
  if (/topic$/i.test(cand.rawArtist || '') || /official/i.test(cand.title)) score += 0.05;
  return score;
}

async function fromSpotify(url, { searchFn = search } = {}) {
  const meta = await fetchSpotifyMeta(url);
  const cfg = getMusicConfig();
  if (meta.duration && meta.duration > cfg.maxTrackSeconds) throw new MusicError('TOO_LONG', msg('TOO_LONG'));
  const results = await searchFn(`${meta.artist} ${meta.title}`.trim(), 8).catch((err) => {
    if (err && err.code === 'NOT_FOUND') return [];
    throw err;
  });
  const best = results
    .map((c) => ({ c, s: scoreMatch(meta, c) }))
    .sort((a, b) => b.s - a.s)[0];
  if (!best || best.s < 0.7) throw new MusicError('NO_MATCH', msg('NO_MATCH'));
  // نعرض بيانات Spotify الدقيقة (الاسم/الفنان/الغلاف) مع مصدر الصوت المطابق
  return { ...best.c, title: meta.title, artist: meta.artist || best.c.artist, thumbnail: meta.thumbnail || best.c.thumbnail, duration: best.c.duration || meta.duration, via: 'spotify', spotifyUrl: url };
}

module.exports = {
  MusicError,
  MESSAGES,
  classify,
  classifyYtdlpError,
  ensureBinary,
  runYtdlp,
  search,
  getInfo,
  resolveStream,
  fetchSpotifyMeta,
  fromSpotify,
  scoreMatch,
  checkPlayable,
  toTrack,
  _internal: { norm, tokens, cleanArtist }
};
