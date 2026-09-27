-- المساعد الذكي يتعلّم أسلوب صاحب احسمها:
--   • ai_style_examples: ردوده على اللاعبين (بالتكتات وبالرد على رسائلهم) —
--     "رسالة اللاعب ← رده" — تنضاف لتعليمات المساعد كأمثلة على الأسلوب
--   • ai_style_enabled / ai_style_owner_id: تشغيل/إيقاف، وصاحب الأسلوب (افتراضي مالك السيرفر)
CREATE TABLE IF NOT EXISTS ai_style_examples (
  id          __PK__,
  guild_id    TEXT NOT NULL,
  author_id   TEXT NOT NULL,
  prompt_text TEXT,
  reply_text  TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'ticket',
  created_at  __BIGINT__ NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_style_examples_guild ON ai_style_examples (guild_id, created_at);
ALTER TABLE guild_settings ADD COLUMN ai_style_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE guild_settings ADD COLUMN ai_style_owner_id TEXT;
