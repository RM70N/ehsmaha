-- كتم كتابي من الحماية التلقائية: منع الإرسال بروم محدد عبر صلاحيات الروم (بدل Timeout السيرفر الكامل).
-- يُحفظ هنا عشان نفك الكتم بوقته حتى لو انعاد تشغيل البوت.
CREATE TABLE IF NOT EXISTS text_mutes (
  guild_id    TEXT NOT NULL,
  channel_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  until_at    __BIGINT__ NOT NULL,
  had_overwrite INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, channel_id, user_id)
);
