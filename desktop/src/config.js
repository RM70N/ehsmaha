'use strict';

/**
 * ثوابت التطبيق — كل ما يخص هوية الموقع ونطاقاته في مكان واحد.
 * لا يوجد هنا أي مفتاح API؛ المفاتيح كلها تبقى داخل كود الموقع نفسه كما هي.
 */

const SITE_ORIGIN = 'https://ehsmaha.com';

// المنفذ المفضّل للسيرفر الداخلي. ثابت عمداً: أصل الصفحة (origin) هو
// http://localhost:PORT ، و IndexedDB/localStorage مربوطة بالأصل — أي تغيّر
// بالمنفذ يعني فقدان جلسة تسجيل الدخول، فنحاول نفس المنفذ كل مرة.
const PREFERRED_PORT = 43711;
const PORT_ATTEMPTS = 12;

// نطاقات يُسمح بفتحها داخل نافذة التطبيق أو داخل نافذة popup لتسجيل الدخول.
const AUTH_HOSTS = [
  'accounts.google.com',
  'accounts.youtube.com',
  'apis.google.com',
  'content.googleapis.com',
  'streamgame-180b8.firebaseapp.com',
  'streamgame-180b8.web.app',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'ssl.gstatic.com',
  'www.gstatic.com',
];

// النطاقات التي يعتمد عليها الموقع فعلياً (Firebase / Cloudinary / YouTube /
// Gemini / جسور البث). مستخرجة من كود الموقع نفسه — لا زيادة ولا نقصان.
const CONNECT_HOSTS = [
  'https://*.googleapis.com',
  'https://*.google.com',
  'https://*.gstatic.com',
  'https://*.firebaseio.com',
  'https://*.firebasedatabase.app',
  'https://*.firebaseapp.com',
  'https://*.cloudfunctions.net',
  'https://*.cloudinary.com',
  'https://*.onrender.com',
  'https://*.youtube.com',
  'https://*.ytimg.com',
  'https://*.tiktok.com',
  'https://*.twitch.tv',
  'https://*.kick.com',
  'https://*.pusher.com',
  'https://flagcdn.com',
  'https://images.weserv.nl',
  'https://ehsmaha.com',
  'wss://*.firebaseio.com',
  'wss://*.firebasedatabase.app',
  'wss://*.onrender.com',
  'wss://*.twitch.tv',
  'wss://*.pusher.com',
  'wss://*.kick.com',
];

/**
 * سياسة أمان المحتوى — واسعة بما يكفي لكل ما يستخدمه الموقع (Firebase SDK
 * من gstatic، خطوط Google، صور Cloudinary، iframe يوتيوب، WebSocket لجسور
 * البث) وضيّقة بما يكفي لمنع تحميل سكربتات من أي مصدر آخر.
 *
 * ملاحظة: الموقع كله سكربتات inline داخل index.html، لذلك 'unsafe-inline'
 * إلزامي هنا — إزالته تكسر الموقع بالكامل.
 */
function buildCsp(selfOrigin) {
  const self = selfOrigin || "'self'";
  return [
    `default-src 'self' ${self}`,
    `script-src 'self' ${self} 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://*.gstatic.com https://apis.google.com https://*.googleapis.com https://www.googletagmanager.com https://*.google-analytics.com`,
    `style-src 'self' ${self} 'unsafe-inline' https://fonts.googleapis.com https://*.gstatic.com`,
    `font-src 'self' ${self} data: https://fonts.gstatic.com https://*.gstatic.com`,
    `img-src 'self' ${self} data: blob: https:`,
    `media-src 'self' ${self} data: blob: https:`,
    `connect-src 'self' ${self} data: blob: ${CONNECT_HOSTS.join(' ')}`,
    `frame-src 'self' ${self} https://www.youtube.com https://www.youtube-nocookie.com https://*.firebaseapp.com https://*.google.com https://accounts.google.com https://*.tiktok.com https://player.twitch.tv`,
    `worker-src 'self' ${self} blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self' ${self} https://accounts.google.com https://*.firebaseapp.com`,
  ].join('; ');
}

module.exports = {
  SITE_ORIGIN,
  PREFERRED_PORT,
  PORT_ATTEMPTS,
  AUTH_HOSTS,
  CONNECT_HOSTS,
  buildCsp,
  APP_ID: 'com.ehsmaha.desktop',
  WINDOW_TITLE: 'احسمها | ehsmaha',
  SESSION_PARTITION: 'persist:ehsmaha',
  BRAND_BG: '#0b0518',
};
