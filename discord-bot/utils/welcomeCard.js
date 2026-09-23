'use strict';

// بطاقة الترحيب البصرية (@napi-rs/canvas): تصميم احسمها ثابت + أفتار العضو
// داخل الدائرة (قص دائري دقيق) + يوزره متوسّط بالشريط البنفسجي.
// الصورة تتولّد بالذاكرة (Buffer) وتُرسل مباشرة — ما تنحفظ على القرص أبداً.
//
// الإحداثيات مقاسة من assets/welcome-template.png (1759×894). لو غيّرت التصميم
// عدّل القيم تحت فقط.

const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const logger = require('./logger');

// ---------------- إعدادات التصميم (عدّلها لو تغيّر القالب) ----------------
const TEMPLATE_PATH = path.join(__dirname, '..', 'assets', 'welcome-template.png');
const DEFAULT_AVATAR_PATH = path.join(__dirname, '..', 'assets', 'default-avatar.png');
const FONT_PATH = path.join(__dirname, '..', 'assets', 'fonts', 'Cairo-Bold.ttf');

const AVATAR_X = 375; // مركز دائرة الأفتار
const AVATAR_Y = 460;
const AVATAR_RADIUS = 174; // يغطي الفتحة كاملة (الإطار الذهبي فوقه يخفي الحواف)

const USERNAME_X = 1140; // منتصف الشريط البنفسجي
const USERNAME_Y = 481;
const USERNAME_MAX_WIDTH = 760; // عرض الشريط المتاح للاسم (مع هامش)
const FONT_SIZE = 88; // الحجم الأساسي — يصغر تلقائياً للأسماء الطويلة
const MIN_FONT_SIZE = 34;
const FONT_COLOR = '#FFFFFF';
const FONT_GLOW = 'rgba(214, 170, 255, 0.85)';
const FONT_FAMILY = 'EhsmahaWelcome';
const OUTPUT_SCALE = 0.75; // تصغير الناتج (1319×670) — أخف بالإرسال وواضح بديسكورد

// ---------------- تحميل الموارد مرة وحدة ----------------
let fontReady = false;
function ensureFont() {
  if (fontReady) return;
  fontReady = true;
  try {
    GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
  } catch (err) {
    logger.warn('تعذّر تسجيل خط الترحيب — بيستخدم خط النظام', { error: err });
  }
}

// القالب بعد "تفريغ" داخل الدائرة: الفتحة بالتصميم أبيض شبه شفاف، فلو رسمنا
// الأفتار تحته يطلع باهت. نشيل هذا البياض فقط (البكسلات الفاتحة شبه الشفافة
// داخل الدائرة) ونخلي الإطار والشارة "1" الذهبية زي ما هي.
let templatePromise = null;
function loadTemplate() {
  if (!templatePromise) {
    templatePromise = (async () => {
      const img = await loadImage(fs.readFileSync(TEMPLATE_PATH));
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const r = AVATAR_RADIUS + 4;
      const x0 = Math.max(0, AVATAR_X - r);
      const y0 = Math.max(0, AVATAR_Y - r);
      const w = Math.min(img.width - x0, r * 2);
      const h = Math.min(img.height - y0, r * 2);
      const data = ctx.getImageData(x0, y0, w, h);
      const d = data.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = x0 + x - AVATAR_X;
          const dy = y0 + y - AVATAR_Y;
          if (dx * dx + dy * dy > r * r) continue;
          const i = (y * w + x) * 4;
          const [R, G, B, A] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
          const hazy = A < 235 && R > 150 && G > 150 && B > 150 && Math.max(R, G, B) - Math.min(R, G, B) < 45;
          if (hazy) d[i + 3] = 0;
        }
      }
      ctx.putImageData(data, x0, y0);
      return canvas;
    })().catch((err) => {
      templatePromise = null; // نعيد المحاولة المرة الجاية
      throw err;
    });
  }
  return templatePromise;
}

let defaultAvatarPromise = null;
function loadDefaultAvatar() {
  if (!defaultAvatarPromise) defaultAvatarPromise = loadImage(fs.readFileSync(DEFAULT_AVATAR_PATH));
  return defaultAvatarPromise;
}

// الأفتار من رابط ديسكورد — ولو فشل (رابط منتهي/شبكة) نستخدم الأفتار الافتراضي
async function loadAvatar(url, { timeoutMs = 8000, fetchImpl = fetch } = {}) {
  if (url) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { image: await loadImage(Buffer.from(await res.arrayBuffer())), fallback: false };
    } catch (err) {
      logger.warn('تعذّر تحميل أفتار العضو — استخدام الأفتار الافتراضي', { reason: err.message });
    }
  }
  return { image: await loadDefaultAvatar(), fallback: true };
}

// ---------------- النص ----------------
// الخط يدعم العربي واللاتيني؛ الإيموجي والرموز الغريبة تطلع مربعات، فنشيلها
function cleanName(name) {
  const cleaned = String(name || '')
    .normalize('NFC')
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

// أكبر حجم خط يخلّي الاسم داخل العرض المتاح (Auto-fit)، وآخر حل: قص بـ…
function fitText(ctx, text, maxWidth, { maxSize = FONT_SIZE, minSize = MIN_FONT_SIZE, family = FONT_FAMILY } = {}) {
  let size = maxSize;
  ctx.font = `bold ${size}px ${family}`;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `bold ${size}px ${family}`;
  }
  let out = text;
  if (ctx.measureText(out).width > maxWidth) {
    while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) out = out.slice(0, -1);
    out += '…';
  }
  return { text: out, size };
}

/**
 * يولّد بطاقة الترحيب.
 * @param {{ username: string, avatarUrl?: string }} opts
 * @returns {Promise<{ buffer: Buffer, width: number, height: number, fontSize: number, avatarFallback: boolean }>}
 */
async function renderWelcomeCard({ username, avatarUrl, fetchImpl } = {}) {
  ensureFont();
  const [template, avatar] = await Promise.all([loadTemplate(), loadAvatar(avatarUrl, { fetchImpl })]);
  const W = template.width;
  const H = template.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // 1) الأفتار (تحت القالب) — قص دائري دقيق + خلفية داكنة للأفتارات الشفافة
  ctx.save();
  ctx.beginPath();
  ctx.arc(AVATAR_X, AVATAR_Y, AVATAR_RADIUS, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = '#1a0d33';
  ctx.fillRect(AVATAR_X - AVATAR_RADIUS, AVATAR_Y - AVATAR_RADIUS, AVATAR_RADIUS * 2, AVATAR_RADIUS * 2);
  // "cover": نملأ الدائرة بدون تمطيط حتى لو الصورة مو مربعة
  const img = avatar.image;
  const side = Math.min(img.width, img.height);
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side,
    AVATAR_X - AVATAR_RADIUS, AVATAR_Y - AVATAR_RADIUS, AVATAR_RADIUS * 2, AVATAR_RADIUS * 2);
  ctx.restore();

  // 2) القالب فوقه (الإطار الذهبي يغطي حواف الأفتار)
  ctx.drawImage(template, 0, 0);

  // 3) اليوزر متوسّط بالشريط
  const name = cleanName(username) || 'عضو جديد';
  const fitted = fitText(ctx, name, USERNAME_MAX_WIDTH);
  ctx.font = `bold ${fitted.size}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = FONT_GLOW;
  ctx.shadowBlur = 18;
  ctx.fillStyle = FONT_COLOR;
  ctx.fillText(fitted.text, USERNAME_X, USERNAME_Y);
  ctx.shadowBlur = 0;

  // 4) تصغير نهائي للإرسال
  const outW = Math.round(W * OUTPUT_SCALE);
  const outH = Math.round(H * OUTPUT_SCALE);
  const out = createCanvas(outW, outH);
  out.getContext('2d').drawImage(canvas, 0, 0, outW, outH);
  const buffer = await out.encode('png');
  return { buffer, width: outW, height: outH, fontSize: fitted.size, text: fitted.text, avatarFallback: avatar.fallback };
}

module.exports = {
  renderWelcomeCard,
  _internal: { cleanName, fitText, loadTemplate, ensureFont, AVATAR_X, AVATAR_Y, AVATAR_RADIUS, USERNAME_X, USERNAME_Y, USERNAME_MAX_WIDTH, FONT_FAMILY }
};
