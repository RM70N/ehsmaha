'use strict';

// أسباب فتح تكت الدعم — تظهر بالقائمة المنسدلة بعد الضغط على "افتح التكت".
// عدّل/أضف هنا فقط بدون لمس منطق الأوامر (حد ديسكورد: 25 سبب).
//   value: معرّف ثابت (إنجليزي، بدون مسافات، فريد) — يُحفظ بقاعدة البيانات
//   label: النص الظاهر (حتى 100 حرف)
//   description: وصف قصير اختياري (حتى 100 حرف)
//   emoji: اختياري

module.exports = [
  { value: 'account', label: 'مشكلة بالحساب', description: 'تسجيل الدخول، اليوزر، ربط تيك توك', emoji: '👤' },
  { value: 'game', label: 'مشكلة بلعبة', description: 'لعبة ما تشتغل أو فيها خلل', emoji: '🎮' },
  { value: 'stream', label: 'مشكلة بربط البث', description: 'تيك توك / تويتش / كيك / يوتيوب', emoji: '📡' },
  { value: 'store', label: 'المتجر والإطارات', description: 'شراء، إطار ما ظهر، نقاط', emoji: '🖼️' },
  { value: 'report', label: 'بلاغ عن مخالفة', description: 'بلاغ عن لاعب أو ستريمر', emoji: '🚨' },
  { value: 'suggestion', label: 'اقتراح', description: 'فكرة لتطوير احسمها', emoji: '💡' },
  { value: 'other', label: 'أخرى', description: 'أي استفسار ثاني', emoji: '❓' }
];
