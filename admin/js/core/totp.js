// ==================== TOTP حقيقي (RFC 6238) — قسم 30.2 ====================
// تحقّق ثنائي فعلي (2FA) بطبقة التطبيق باستخدام Web Crypto (HMAC-SHA1)، مو
// اعتماداً على Firebase Identity Platform (يحتاج ترقية خطة غير متوفرة
// حالياً). السرّ يُخزَّن بمستند adminSettings/panel (مقروء/مكتوب من isOwner
// فقط أصلاً)، ويُتحقَّق منه محلياً بكل تسجيل دخول بعد كلمة المرور. هذا نفس
// خوارزمية Google Authenticator/Authy القياسية.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes) {
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    let chunk = bits.slice(i, i + 5);
    if (chunk.length < 5) chunk = chunk.padEnd(5, '0');
    out += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return out;
}

function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of clean) {
    const val = BASE32_ALPHABET.indexOf(c);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

export function generateTotpSecret() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

function intToBytes(num) {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // JS numbers فوق 2^32 تفقد الدقة بعمليات bitwise — نقسمها high/low يدوياً.
  const high = Math.floor(num / 4294967296);
  const low = num >>> 0;
  view.setUint32(0, high);
  view.setUint32(4, low);
  return new Uint8Array(buf);
}

async function hmacSha1(keyBytes, msgBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, msgBytes);
  return new Uint8Array(sig);
}

export async function totpAt(secretBase32, timeStep) {
  const key = base32Decode(secretBase32);
  const msg = intToBytes(timeStep);
  const hmac = await hmacSha1(key, msg);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

export async function totpNow(secretBase32) {
  const step = Math.floor(Date.now() / 1000 / 30);
  return totpAt(secretBase32, step);
}

// يقبل الرمز الحالي أو خطوة قبل/بعد (سماحية 30 ثانية لفرق الساعة).
export async function verifyTotp(secretBase32, token) {
  const clean = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  for (const delta of [0, -1, 1]) {
    if (await totpAt(secretBase32, step + delta) === clean) return true;
  }
  return false;
}

export function totpOtpAuthUrl(secretBase32, accountLabel) {
  const label = encodeURIComponent(`ادمن احسمها:${accountLabel || 'admin'}`);
  const issuer = encodeURIComponent('EhsmahaAdmin');
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${issuer}&digits=6&period=30`;
}

window.AdminTotp = { generateTotpSecret, totpNow, verifyTotp, totpOtpAuthUrl };
