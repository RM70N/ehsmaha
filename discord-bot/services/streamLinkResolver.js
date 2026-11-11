'use strict';

// رابط البث الحقيقي للستريمر: يُبنى فقط من (منصة + يوزر) بعد التحقق من صيغة الحساب حسب قواعد كل منصة،
// أو يؤخذ من بيانات الجلسة (من الموقع) لو كان رابط https بنطاق المنصة نفسها وصاحبه نفس الحساب.
// ما نخترع روابط: لو الصيغة غير صالحة ← ما فيه رابط ← ما ينرسل إعلان.
// ملاحظة التحقق من البث: دليل "يبث الآن" هو جلسة الموقع نفسها (الربط الناجح بغرفة البث). ما فيه تحقق مستقل من
// المنصات هنا لأن ذلك يحتاج مفاتيح API غير متوفرة — ويمكن توصيل verifier اختياري عبر setLiveVerifier().

const PLATFORM_LABELS = Object.freeze({ tiktok: 'TikTok', twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick' });

const RULES = {
  tiktok: { re: /^(?!.*\.$)[a-z0-9_.]{2,24}$/, hosts: ['tiktok.com', 'www.tiktok.com'] },
  twitch: { re: /^[a-z0-9_]{4,25}$/, hosts: ['twitch.tv', 'www.twitch.tv'] },
  kick: { re: /^[a-z0-9_-]{3,25}$/, hosts: ['kick.com', 'www.kick.com'] },
  // youtube: handle (3-30) أو معرّف قناة UC…
  youtube: { re: /^(?:[a-z0-9._-]{3,30}|uc[a-z0-9_-]{22})$/, hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com'] }
};

/** يطبّع اليوزر: يشيل المسافات و@ ويصغّر الأحرف. يرجّع { display, normalized } أو null لو فاضي. */
function normalizeUsername(raw) {
  const display = String(raw == null ? '' : raw).trim().replace(/^@+/, '').trim();
  if (!display) return null;
  return { display, normalized: display.toLowerCase() };
}

/** صلاحية الاسم حسب المنصة (مطابقة دقيقة، بدون مسافات أو أحرف غريبة) */
function validateUsername(platform, normalized) {
  const rule = RULES[platform];
  if (!rule) return { ok: false, reason: 'UNKNOWN_PLATFORM' };
  return rule.re.test(normalized) ? { ok: true } : { ok: false, reason: 'INVALID_USERNAME' };
}

function canonicalUrl(platform, normalized, display = normalized) {
  if (!validateUsername(platform, normalized).ok) return null;
  switch (platform) {
    case 'tiktok':
      return `https://www.tiktok.com/@${normalized}/live`;
    case 'twitch':
      return `https://www.twitch.tv/${normalized}`;
    case 'kick':
      return `https://kick.com/${normalized}`;
    case 'youtube':
      // معرّف القناة حساس لحالة الأحرف ← نستخدم الاسم الأصلي كما كُتب
      if (/^uc[a-z0-9_-]{22}$/.test(normalized)) return /^UC[0-9A-Za-z_-]{22}$/.test(display) ? `https://www.youtube.com/channel/${display}/live` : null;
      return `https://www.youtube.com/@${normalized}/live`;
    default:
      return null;
  }
}

// رابط من بيانات الجلسة: https + نطاق المنصة + يحتوي اليوزر نفسه (مطابقة دقيقة لمقطع المسار)
function sessionUrl(platform, normalized, stream) {
  const candidate = stream && (stream.streamUrl || stream.liveUrl || stream.broadcastUrl);
  if (!candidate) return null;
  try {
    const u = new URL(String(candidate));
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    if (!RULES[platform].hosts.includes(u.hostname.toLowerCase())) return null;
    const segs = decodeURIComponent(u.pathname).toLowerCase().split('/').filter(Boolean).map((s) => s.replace(/^@/, ''));
    if (!segs.includes(normalized)) return null;
    return u.origin + u.pathname + (u.search && u.search.length < 100 ? u.search : '');
  } catch {
    return null;
  }
}

let liveVerifier = null;
/** verifier اختياري: async ({platform, username}) => true | false | null (null = ما قدر يتحقق) */
function setLiveVerifier(fn) {
  liveVerifier = typeof fn === 'function' ? fn : null;
}

/**
 * @returns {Promise<{ok:true,url:string,source:'session'|'canonical'}|{ok:false,reason:string}>}
 */
async function resolve({ platform, username, stream = null }) {
  const n = normalizeUsername(username);
  if (!n) return { ok: false, reason: 'EMPTY_USERNAME' };
  const v = validateUsername(platform, n.normalized);
  if (!v.ok) return { ok: false, reason: v.reason };
  const fromSession = sessionUrl(platform, n.normalized, stream);
  const url = fromSession || canonicalUrl(platform, n.normalized, n.display);
  if (!url) return { ok: false, reason: 'NO_URL' };
  if (liveVerifier) {
    let live = null;
    try {
      live = await liveVerifier({ platform, username: n.normalized });
    } catch {
      live = null;
    }
    if (live === false) return { ok: false, reason: 'NOT_LIVE' };
  }
  return { ok: true, url, source: fromSession ? 'session' : 'canonical' };
}

module.exports = { PLATFORM_LABELS, normalizeUsername, validateUsername, canonicalUrl, sessionUrl, resolve, setLiveVerifier };
