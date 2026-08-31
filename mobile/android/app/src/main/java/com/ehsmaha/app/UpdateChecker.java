package com.ehsmaha.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * تحقّق بسيط من وجود إصدار أحدث لتطبيق احسمها عبر ملف version.json مستضاف
 * على نفس دومين الموقع (بدل GitHub API — المستودع خاص فكانت طلبات API
 * ترجع 404 للزوار غير المسجَّلين دخول). التطبيق موزَّع كملف APK مباشر خارج
 * Google Play، فلا يوجد تحديث تلقائي عبر متجر — هذا التنبيه البسيط هو
 * البديل: مقارنة رقم الإصدار الحالي مع القيمة في version.json، ولو كان
 * أحدث نعرض شريطاً يوجّه المستخدم لتحميله يدوياً (انظر MainActivity).
 */
final class UpdateChecker {

    private static final String VERSION_JSON_URL = "https://ehsmaha.com/downloads/version.json";
    // نفس رابط "تحميل التطبيق" الثابت المستخدم على الموقع — يبدأ التنزيل مباشرة.
    static final String APK_DOWNLOAD_URL = "https://ehsmaha.com/downloads/ehsmaha.apk";

    private UpdateChecker() {}

    /** @return رقم الإصدار الأحدث (مثل "1.2.0")، أو null لو تعذّر الجلب. */
    static String fetchLatestReleaseTag() {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(VERSION_JSON_URL);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            int status = conn.getResponseCode();
            if (status != 200) return null;

            InputStream in = conn.getInputStream();
            String body = readAll(in);
            JSONObject json = new JSONObject(body);
            String version = json.optString("version", null);
            if (version == null) return null;
            return version.startsWith("v") || version.startsWith("V") ? version.substring(1) : version;
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String readAll(InputStream in) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line);
        return sb.toString();
    }

    /** مقارنة إصدارات semver بسيطة (major.minor.patch أعداد صحيحة فقط). */
    static boolean isNewer(String latest, String current) {
        int[] a = parse(latest);
        int[] b = parse(current);
        for (int i = 0; i < 3; i++) {
            if (a[i] != b[i]) return a[i] > b[i];
        }
        return false;
    }

    private static int[] parse(String version) {
        int[] out = { 0, 0, 0 };
        if (version == null) return out;
        String[] parts = version.split("[.\\-+]");
        for (int i = 0; i < 3 && i < parts.length; i++) {
            try {
                out[i] = Integer.parseInt(parts[i].replaceAll("[^0-9]", ""));
            } catch (Exception ignored) {
                out[i] = 0;
            }
        }
        return out;
    }

    static void openDownloadPage(Context context) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(APK_DOWNLOAD_URL));
            context.startActivity(intent);
        } catch (Exception ignored) { /* لا يستحق إسقاط التطبيق */ }
    }
}
