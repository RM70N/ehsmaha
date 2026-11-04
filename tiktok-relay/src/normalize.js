'use strict';
// تطبيع يوزر تيك توك: إزالة @ والمسافات وروابط الصفحة، تحويل لحروف صغيرة، والتحقق من الصيغة.
// صيغة تيك توك المسموحة: أحرف/أرقام إنجليزية و . و _ فقط، بطول 1-24.
const USERNAME_RE = /^[a-z0-9._]{1,24}$/;
// رموز خفية شائعة من لصق رابط/يوزر عبر كيبورد الجوال العربي (علامات اتجاه RTL/LRM، أحرف تحكّم،
// BOM) — نفس نطاق tiktok-server/lib/tiktok-id.js. بدونها، يوزر صحيح مكتوب فعلاً يُرفض بصمت لمجرد
// رمز غير مرئي بوسط النص لا يظهر للمستخدم إطلاقاً.
const INVISIBLE_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

export class InvalidUsernameError extends Error {
  constructor(reason) {
    super('يوزر تيك توك غير صالح: ' + reason);
    this.reason = reason;
  }
}

// يقبل: "user", "@user", " @User ", "https://www.tiktok.com/@user", "https://www.tiktok.com/@user/live"
export function normalizeTikTokUsername(raw) {
  let s = String(raw == null ? '' : raw).replace(INVISIBLE_RE, '').trim();
  if (!s) throw new InvalidUsernameError('فارغ');
  // رابط صفحة: استخرج الجزء بعد @
  const urlMatch = s.match(/tiktok\.com\/@([^/?#]+)/i);
  if (urlMatch) s = urlMatch[1];
  s = s.trim().replace(/^@+/, '').toLowerCase();
  if (!s) throw new InvalidUsernameError('فارغ بعد التطبيع');
  // مسافات داخلية (مو طرفية) غير صالحة أصلاً بيوزر تيك توك — نتركها لـUSERNAME_RE ترفضها
  // بدل حذفها بصمت (حذفها بصمت قد يدمج يوزرين مختلفين بالخطأ).
  if (!USERNAME_RE.test(s)) throw new InvalidUsernameError('أحرف غير مسموحة أو طول غير صحيح (المسموح: a-z 0-9 . _ وبطول 1-24)');
  return s;
}

export { USERNAME_RE };
