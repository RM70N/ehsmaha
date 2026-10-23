'use strict';
// توحيد مُدخل يوزر تيك توك — دالة نقية (بلا شبكة). المكتبة نفسها تنظّف فقط "https://www.tiktok.com/" و"/live" و"@" واحدة،
// فأي صيغة أخرى (رابط بلا www، معاملات ?lang=ar، @@، مسافة، رموز اتجاه خفية من كيبورد الجوال العربي) كانت:
//   1) تُفتح بها غرفة منفصلة لكل صيغة (اتصال Euler/تيك توك كامل لنفس الستريمر لكل صيغة)،
//   2) ويُفحص تعطيل الحساب بالنص الخام فيتخطّاه من يلصق الرابط،
//   3) وتفشل أمام تيك توك الحقيقي كـ«يوزر غير موجود» رغم أن اليوزر صحيح.
// الناتج: { ok:true, id } (حروف صغيرة) أو { ok:false, reason:'empty'|'invalid'|'too_short'|'too_long' }

const ID_MIN = 2;
const ID_MAX = 24; // حدّ تيك توك
// نفس نطاق الرموز الخفية المعتمد لكيك (لا نلمس الحروف العربية): تحكّم، علامات اتجاه، أحرف صفرية، BOM.
const INVISIBLE_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

function normalizeTikTokId(raw) {
  let s = String(raw == null ? '' : raw).replace(INVISIBLE_RE, '').trim().replace(/\/+$/, '');
  if (!s) return { ok: false, reason: 'empty' };
  if (/tiktok\.com/i.test(s)) {
    try {
      const url = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
      // الشكل المعتاد: /@user أو /@user/live أو /@user/video/123 — اليوزر دائماً الجزء الأول الذي يبدأ بـ@.
      const seg = url.pathname.split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch (e) { return x; } });
      const at = seg.find((x) => x.charAt(0) === '@');
      if (!at) return { ok: false, reason: 'invalid' };   // رابط قصير (vm.tiktok.com/xxx) أو صفحة غير بروفايل: لا يمكن استخراج اليوزر
      s = at;
    } catch (e) {
      const m = s.match(/tiktok\.com\/(@[^/?#\s]+)/i);
      if (!m) return { ok: false, reason: 'invalid' };
      s = m[1];
    }
  } else if (/^https?:\/\//i.test(s) || s.indexOf('/') !== -1) {
    return { ok: false, reason: 'invalid' };
  }
  s = s.replace(/^@+/, '').trim().toLowerCase();
  if (!s) return { ok: false, reason: 'empty' };
  if (!/^[a-z0-9._]+$/.test(s)) return { ok: false, reason: 'invalid' };
  if (s.length < ID_MIN) return { ok: false, reason: 'too_short' };
  if (s.length > ID_MAX) return { ok: false, reason: 'too_long' };
  return { ok: true, id: s };
}

module.exports = { normalizeTikTokId, ID_MIN, ID_MAX };
