'use strict';

// إعدادات نظام الموسيقى — كلها من متغيرات البيئة (بدون مفاتيح داخل الكود). تُقرأ كسولاً عشان الاختبارات تقدر تغيّرها.

const path = require('node:path');

const num = (name, def, { min = -Infinity, max = Infinity } = {}) => {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') return def;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const flag = (name, def) => {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return def;
  return !['off', 'false', '0', 'no'].includes(raw);
};
const list = (name) =>
  String(process.env[name] || '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

function getMusicConfig() {
  return Object.freeze({
    enabled: flag('MUSIC_ENABLED', true),
    prefix: String(process.env.MUSIC_PREFIX || '!').trim().slice(0, 3) || '!',
    maxQueue: Math.floor(num('MUSIC_MAX_QUEUE', 50, { min: 1, max: 500 })),
    maxTrackSeconds: Math.floor(num('MUSIC_MAX_TRACK_SECONDS', 2 * 3600, { min: 30, max: 12 * 3600 })),
    idleLeaveSeconds: num('MUSIC_IDLE_LEAVE_SECONDS', 120, { min: 0.2, max: 3600 }), // بعد ما تخلص القائمة
    emptyLeaveSeconds: num('MUSIC_EMPTY_LEAVE_SECONDS', 60, { min: 0.2, max: 3600 }), // لو الروم فضي من البشر
    pauseLeaveSeconds: num('MUSIC_PAUSE_LEAVE_SECONDS', 600, { min: 0.2, max: 7200 }), // إيقاف مؤقت طويل
    duplicateWindowSeconds: num('MUSIC_DUPLICATE_WINDOW_SECONDS', 30, { min: 0, max: 3600 }),
    searchResults: Math.floor(num('MUSIC_SEARCH_RESULTS', 5, { min: 1, max: 10 })),
    searchTtlSeconds: num('MUSIC_SEARCH_TTL_SECONDS', 300, { min: 30, max: 3600 }),
    seekSeconds: num('MUSIC_SEEK_SECONDS', 10, { min: 1, max: 120 }),
    panelRefreshSeconds: num('MUSIC_PANEL_REFRESH_SECONDS', 15, { min: 0.2, max: 120 }),
    queuePageSize: Math.floor(num('MUSIC_QUEUE_PAGE_SIZE', 5, { min: 1, max: 9 })),
    bitrate: String(process.env.MUSIC_BITRATE || '128k'),
    nickname: flag('MUSIC_NICKNAME', true), // اسم البوت بالسيرفر = اسم الأغنية الحالية
    nicknameMinIntervalSeconds: num('MUSIC_NICKNAME_MIN_INTERVAL_SECONDS', 15, { min: 0, max: 600 }),
    // أوامر/أزرار تقتصر على الإدارة (مثال: MUSIC_ADMIN_ONLY=ايقاف,تخطي)
    adminOnly: new Set(list('MUSIC_ADMIN_ONLY')),
    // مصدر الصوت
    ytdlpPath: process.env.YTDLP_PATH ? String(process.env.YTDLP_PATH).trim() : null,
    ytdlpAutoDownload: flag('YTDLP_AUTO_DOWNLOAD', true),
    ytdlpCookiesFile: process.env.YTDLP_COOKIES_FILE ? String(process.env.YTDLP_COOKIES_FILE).trim() : null,
    ytdlpCookiesB64: process.env.YTDLP_COOKIES_B64 ? String(process.env.YTDLP_COOKIES_B64).trim() : null,
    ytdlpProxy: process.env.YTDLP_PROXY ? String(process.env.YTDLP_PROXY).trim() : null,
    ytdlpJsRuntime: process.env.YTDLP_JS_RUNTIME ? String(process.env.YTDLP_JS_RUNTIME).trim() : null, // مثال: node
    ytdlpPlayerClients: process.env.YTDLP_PLAYER_CLIENTS ? String(process.env.YTDLP_PLAYER_CLIENTS).trim() : null,
    ytdlpTimeoutMs: Math.floor(num('YTDLP_TIMEOUT_SECONDS', 45, { min: 10, max: 300 }) * 1000),
    ffmpegPath: String(process.env.FFMPEG_PATH || 'ffmpeg').trim(),
    dataDir: path.resolve(process.env.MUSIC_DATA_DIR || path.join(__dirname, '..', 'data'))
  });
}

module.exports = { getMusicConfig };
