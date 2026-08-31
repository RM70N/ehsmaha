'use strict';

/**
 * يجهّز أيقونة التطبيق قبل كل بناء.
 *
 * المصدر: build/source-logo.png — نفس شعار الموقع (256×256) المستخرج من
 * data-URI الفافيكون في index.html، بدون أي تعديل بصري.
 *
 * electron-builder يحوّل تلقائياً أي build/icon.png (مربّع، 256×256 فأكبر)
 * إلى .ico لويندوز و.icns للماك عند البناء — لا حاجة لأدوات تحويل يدوية هنا.
 * هذا السكربت فقط يتأكد من وجود icon.png وrenderer/logo.png (لشاشة الانتظار)،
 * ويعيد إنشاءهما من المصدر لو كانا مفقودين (نسخة placeholder صالحة للتوزيع،
 * ويفضَّل استبدالها بشعار عالي الدقة (1024×1024) قبل الإصدار النهائي).
 */

const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const SOURCE = path.join(BUILD_DIR, 'source-logo.png');
const ICON_PNG = path.join(BUILD_DIR, 'icon.png');
const LOGO_PNG = path.join(RENDERER_DIR, 'logo.png');

function ensureCopy(target) {
  if (fs.existsSync(target)) return false;
  if (!fs.existsSync(SOURCE)) {
    throw new Error(
      'الشعار المصدري غير موجود: ' + SOURCE +
      '\nضع صورة PNG مربّعة (يُفضَّل 1024×1024) في هذا المسار قبل البناء.'
    );
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(SOURCE, target);
  return true;
}

const madeIcon = ensureCopy(ICON_PNG);
const madeLogo = ensureCopy(LOGO_PNG);

if (madeIcon || madeLogo) {
  console.log('[icons] تم إنشاء أيقونات placeholder من الشعار المصدري.');
  console.log('[icons] لأفضل جودة، استبدل build/icon.png (1024×1024) بشعار عالي الدقة قبل الإصدار النهائي.');
} else {
  console.log('[icons] الأيقونات موجودة بالفعل — تم تخطي الإنشاء.');
}
