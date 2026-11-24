-- ذاكرة المساعد الذكي اللي تعلّمها الإدارة (لكل سيرفر):
--   kind = 'instruction' ← تعليمة/أمر إضافي للمساعد (content = نص التعليمة)
--   kind = 'qa'          ← سؤال وجوابه المعتمد (question + question_norm للمطابقة، content = الجواب)
CREATE TABLE IF NOT EXISTS ai_memory (
  id            __PK__,
  guild_id      TEXT NOT NULL,
  kind          TEXT NOT NULL,
  question      TEXT,
  question_norm TEXT,
  content       TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  created_at    __BIGINT__ NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_memory_guild ON ai_memory (guild_id, kind, created_at);
