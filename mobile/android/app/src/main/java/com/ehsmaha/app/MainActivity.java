package com.ehsmaha.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Logger;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

/**
 * النافذة الرئيسية لتطبيق احسمها. الموقع نفسه (index.html) يُحمَّل حياً من
 * https://ehsmaha.com عبر Capacitor (انظر capacitor.config.ts) — هذا الملف
 * لا يعدّل أي شيء بكود الموقع، فقط يضيف طبقة "تطبيق حقيقي" حوله:
 *
 *  1) زر الرجوع الفيزيائي: يتنقّل داخل مسارات الموقع (بدل إغلاق التطبيق
 *     مباشرة)، ويحتاج ضغطتين متتاليتين للخروج من الصفحة الرئيسية.
 *  2) إصلاح User-Agent حتى يعمل تسجيل الدخول عبر Google داخل WebView (بدون
 *     تعديل كود الموقع — نفس الأسلوب المستخدم بالضبط في نسخة سطح المكتب).
 *  3) تنبيه بسيط لو صدرت نسخة أحدث من التطبيق على GitHub Releases.
 *
 *  فتح الروابط الخارجية (تيك توك/انستقرام/يوتيوب...) وشاشة "لا يوجد اتصال"
 *  لا تحتاجان كوداً هنا إطلاقاً — كلاهما مُعالَج فعلياً داخل Capacitor نفسه
 *  عبر capacitor.config.ts (server.allowNavigation وserver.errorPath).
 */
public class MainActivity extends BridgeActivity {

    private long lastBackPressAt = 0L;
    private static final long DOUBLE_BACK_EXIT_WINDOW_MS = 2000L;

    // Web Client ID من google-services.json (oauth_client بنوع 3) — نفس
    // المعرّف اللي Firebase Auth بالموقع يستخدمه، فتسجيل الدخول الأصلي هنا
    // ينتج نفس idToken اللي GoogleAuthProvider.credential() بجافاسكربت
    // يتوقعه، فتصير نفس جلسة Firebase Auth بالضبط بدون أي تعديل بالباك اند.
    private static final String GOOGLE_WEB_CLIENT_ID =
        "149723106437-mqhn2rocfce0jkdhomds7sskbvr7monp.apps.googleusercontent.com";

    private GoogleSignInClient googleSignInClient;
    private ActivityResultLauncher<Intent> googleSignInLauncher;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        fixWebViewUserAgentForGoogleSignIn();
        registerBackButtonHandler();
        checkForAppUpdate();
        setupNativeGoogleSignIn();
    }

    /* ------------------------------------------------------------ Google Sign-In */

    /**
     * أندرويد WebView الافتراضي يحمل توقيع "; wv" ضمن User-Agent، وGoogle
     * يرفض تسجيل الدخول من أي WebView يحمل هذا التوقيع
     * (auth/disallowed-useragent) — قيد معروف رسمياً من Google لتسجيل
     * الدخول داخل WebViews المدمجة. الحل القياسي (نفس الأسلوب المستخدم في
     * نسخة سطح المكتب من التطبيق): إزالة التوقيع فقط من الـ User-Agent
     * الحالي مع إبقاء بقية المعلومات (إصدار أندرويد، إصدار Chrome...) كما
     * هي — لا داعي لانتحال متصفح كامل مزيّف.
     */
    private void fixWebViewUserAgentForGoogleSignIn() {
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;
        WebSettings settings = webView.getSettings();
        String ua = settings.getUserAgentString();
        if (ua != null && ua.contains("; wv")) {
            settings.setUserAgentString(ua.replace("; wv", ""));
        }
    }

    /**
     * تسجيل دخول قوقل الأصلي: يفتح نافذة اختيار الحساب الحقيقية بدل
     * signInWithRedirect اللي يفتح صفحة قوقل جوه WebView بدون قائمة
     * الحسابات المحفوظة بالجهاز (نفس المشكلة بالصورة اللي أرسلها المستخدم).
     * نضيف واجهة JS اسمها AndroidGoogleAuth يستدعيها كود الموقع (بدون تعديل
     * الموقع فعلياً لتجاوز الشرط الأصلي — الاستدعاء الوحيد المضاف بـ
     * index.html للكشف عن وجودها والتفويض لها بدل signInWithPopup/Redirect
     * حصراً داخل تطبيق أندرويد).
     */
    private void setupNativeGoogleSignIn() {
        GoogleSignInOptions options = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(GOOGLE_WEB_CLIENT_ID)
            .requestEmail()
            .build();
        googleSignInClient = GoogleSignIn.getClient(this, options);

        googleSignInLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(result.getData());
                try {
                    GoogleSignInAccount account = task.getResult(ApiException.class);
                    deliverGoogleIdTokenToWebView(account.getIdToken(), null);
                } catch (ApiException e) {
                    // الكود 12501 = المستخدم لغى نافذة الاختيار — ليست خطأ حقيقي.
                    if (e.getStatusCode() == 12501) {
                        deliverGoogleIdTokenToWebView(null, "cancelled");
                    } else {
                        Logger.debug("GoogleSignIn", "فشل تسجيل الدخول الأصلي: " + e.getStatusCode());
                        deliverGoogleIdTokenToWebView(null, "error:" + e.getStatusCode());
                    }
                }
            }
        );

        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            webView.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void signIn() {
                    runOnUiThread(() -> googleSignInLauncher.launch(googleSignInClient.getSignInIntent()));
                }
            }, "AndroidGoogleAuth");
        }
    }

    private void deliverGoogleIdTokenToWebView(String idToken, String errorReason) {
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;
        runOnUiThread(() -> {
            String script;
            if (idToken != null) {
                script = "window.__androidGoogleSignInResult && window.__androidGoogleSignInResult("
                    + org.json.JSONObject.quote(idToken) + ", null);";
            } else {
                script = "window.__androidGoogleSignInResult && window.__androidGoogleSignInResult(null, "
                    + org.json.JSONObject.quote(errorReason) + ");";
            }
            webView.evaluateJavascript(script, null);
        });
    }

    /* ------------------------------------------------------------------- زر الرجوع */

    /**
     * الموقع SPA بدون History API حقيقي (show(page) يبدّل فقط CSS classes
     * بدون تنقّل متصفح حقيقي)، فـ WebView.canGoBack() لا يعكس مكان المستخدم
     * الفعلي داخل الموقع. لذلك نحقن استعلام JS صغير يقرأ حالة الصفحة الحالية
     * من DOM الموقع نفسه (بدون تعديل كوده) ويقرر: أغلق القائمة الجانبية، أو
     * اضغط زر الرجوع الموجود بالصفحة، أو ارجع للرئيسية — وفقط لو ما فيه شيء
     * نتنقّل إليه (نحن أصلاً بالرئيسية) نفعّل "اضغط رجوع مرة ثانية للخروج".
     */
    private void registerBackButtonHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge != null ? bridge.getWebView() : null;
                if (webView == null) {
                    maybeExit();
                    return;
                }
                webView.evaluateJavascript(BACK_NAV_SCRIPT, new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String result) {
                        boolean handledInPage = "true".equals(result);
                        if (!handledInPage) {
                            maybeExit();
                        }
                    }
                });
            }
        });
    }

    private static final String BACK_NAV_SCRIPT =
        "(function(){"
        + "try{"
        + "var drawer=document.getElementById('side-drawer-overlay');"
        + "if(drawer&&drawer.classList.contains('open')&&typeof sideDrawerClose==='function'){sideDrawerClose();return true;}"
        + "var active=document.querySelector('.page.active');"
        + "var id=active?active.id:'';"
        + "if(!id||id==='pg-home'||id==='pg-auth'||id==='pg-choose-username'){return false;}"
        + "var backBtn=active.querySelector('.faq-back-btn');"
        + "if(backBtn){backBtn.click();return true;}"
        + "var subId=id.indexOf('pg-')===0?id.slice(3):id;"
        + "if(typeof NAV_SUB_PAGES!=='undefined'&&NAV_SUB_PAGES.indexOf(subId)!==-1&&typeof navGoBackFromSubPage==='function'){navGoBackFromSubPage();return true;}"
        + "if(typeof show==='function'){show('home');return true;}"
        + "return false;"
        + "}catch(e){return false;}"
        + "})();";

    private void maybeExit() {
        long now = System.currentTimeMillis();
        if (now - lastBackPressAt <= DOUBLE_BACK_EXIT_WINDOW_MS) {
            finish();
        } else {
            lastBackPressAt = now;
            Toast.makeText(this, "اضغط رجوع مرة ثانية للخروج", Toast.LENGTH_SHORT).show();
        }
    }

    /* ------------------------------------------------------------- تنبيه التحديث */

    /**
     * التطبيق موزَّع خارج Google Play فلا يوجد تحديث تلقائي عبر المتجر.
     * نتحقق مرة واحدة عند كل إقلاع من آخر إصدار منشور على GitHub Releases
     * (نفس الرابط المستخدم لزر "تحميل التطبيق" في الموقع)، ولو كان أحدث من
     * النسخة المثبَّتة نعرض شريطاً بسيطاً أعلى الشاشة مع رابط تحميل مباشر.
     * فشل الشبكة هنا صامت تماماً (لا نزعج المستخدم بخطأ لمجرد تعذّر التحقق).
     */
    private void checkForAppUpdate() {
        new Thread(() -> {
            try {
                String latestTag = UpdateChecker.fetchLatestReleaseTag();
                if (latestTag == null) return;
                String currentVersion = getInstalledVersionName();
                if (UpdateChecker.isNewer(latestTag, currentVersion)) {
                    runOnUiThread(() -> showUpdateBanner(latestTag));
                }
            } catch (Exception e) {
                Logger.debug("UpdateChecker", "تعذّر التحقق من التحديث: " + e.getMessage());
            }
        }).start();
    }

    private String getInstalledVersionName() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            return info.versionName != null ? info.versionName : "0.0.0";
        } catch (Exception e) {
            return "0.0.0";
        }
    }

    private void showUpdateBanner(String latestTag) {
        FrameLayout root = findViewById(android.R.id.content);
        if (root == null) return;

        TextView banner = new TextView(this);
        banner.setText("🎉 يتوفر تحديث جديد لتطبيق احسمها (" + latestTag + ") — اضغط هنا للتحميل");
        banner.setTextColor(Color.WHITE);
        banner.setBackgroundColor(Color.parseColor("#7C3AED"));
        banner.setTextSize(13.5f);
        banner.setGravity(Gravity.CENTER);
        banner.setPadding(dp(16), dp(12), dp(16), dp(12));
        banner.setElevation(dp(8));

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.gravity = Gravity.TOP;
        banner.setLayoutParams(params);
        banner.setAlpha(0f);
        banner.setTranslationY(-dp(40));

        banner.setOnClickListener(v -> {
            UpdateChecker.openDownloadPage(this);
            root.removeView(banner);
        });

        root.addView(banner);
        banner.animate().alpha(1f).translationY(0f).setDuration(280).setInterpolator(new DecelerateInterpolator()).start();

        // تختفي تلقائياً بعد 10 ثوانٍ لو ما تفاعل معها المستخدم — تبقى غير مزعجة.
        banner.postDelayed(() -> {
            if (banner.getParent() != null) {
                banner.animate().alpha(0f).translationY(-dp(40)).setDuration(220)
                    .withEndAction(() -> { if (banner.getParent() != null) root.removeView(banner); })
                    .start();
            }
        }, 10000);
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }
}
