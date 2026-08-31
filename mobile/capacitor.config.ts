import type { CapacitorConfig } from '@capacitor/cli';

/**
 * إعداد Capacitor لتطبيق "احسمها" لأندرويد.
 *
 * server.url يشير مباشرة لموقع ehsmaha.com الحي — التطبيق يفتح نفس السيرفر
 * ونفس Firebase (Auth + Firestore + Realtime Database) بدون أي نسخة محلية
 * من الكود، وبدون أي تعديل على الموقع نفسه. WebView يحمّل https://ehsmaha.com
 * كأصل (origin) حقيقي، فيبقى ضمن النطاقات المصرَّح بها في Firebase Auth
 * تلقائياً (على عكس file:// الذي كان سيحتاج التفافاً).
 */
const config: CapacitorConfig = {
  appId: 'com.ehsmaha.app',
  appName: 'احسمها',
  webDir: 'www',

  server: {
    url: 'https://ehsmaha.com',
    androidScheme: 'https',
    cleartext: false,
    // نطاقات يُسمح للـ WebView بالتنقّل داخلها مباشرة (الموقع + تسجيل الدخول
    // عبر Google + نطاقات Firebase Auth). أي رابط خارج هذه القائمة يُعترَض
    // ويُفتح بمتصفح النظام بدل داخل التطبيق (انظر MainActivity.java).
    allowNavigation: [
      'ehsmaha.com',
      '*.ehsmaha.com',
      'accounts.google.com',
      '*.accounts.google.com',
      'streamgame-180b8.firebaseapp.com',
      'streamgame-180b8.web.app',
      '*.firebaseapp.com',
      'content.googleapis.com',
      'apis.google.com',
      '*.gstatic.com',
    ],
    // أي فشل بتحميل الإطار الرئيسي (لا يوجد اتصال إنترنت مثلاً) يحمّل هذه
    // الصفحة المحلية (www/offline.html) بدل شاشة خطأ متصفح افتراضية —
    // سلوك مدمج في Capacitor (Bridge.getErrorUrl)، بدون كود إضافي.
    errorPath: 'offline.html',
  },

  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2200,
      launchAutoHide: true,
      backgroundColor: '#0b0518',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      androidSpinnerStyle: 'large',
      spinnerColor: '#A78BFF',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0b0518',
      overlaysWebView: false,
    },
  },
};

export default config;
