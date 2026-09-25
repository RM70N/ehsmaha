-- المساعد الذكي (Gemini):
--   • قناة "أخبار الأدمن" — ملخص كل تكت ينقفل يوصلها
--   • إيقاف المساعد بتكت معيّن (زر "أريد التحدث مع فريق الدعم") — يبقى حتى بعد إعادة التشغيل
ALTER TABLE guild_settings ADD COLUMN admin_news_channel_id TEXT;
ALTER TABLE tickets ADD COLUMN ai_paused INTEGER NOT NULL DEFAULT 0;
