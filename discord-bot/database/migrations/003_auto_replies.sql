-- الردود التلقائية: كلمة/جملة يكتبها العضو ← رد البوت.
CREATE TABLE IF NOT EXISTS auto_replies (
  id           __PK__,
  guild_id     TEXT NOT NULL,
  trigger_text TEXT NOT NULL,
  trigger_norm TEXT NOT NULL,
  response     TEXT NOT NULL,
  match_type   TEXT NOT NULL DEFAULT 'exact' CHECK (match_type IN ('exact', 'contains')),
  created_by   TEXT NOT NULL,
  created_at   __BIGINT__ NOT NULL
);
-- نفس الكلمة ما تتكرر بنفس السيرفر
CREATE UNIQUE INDEX IF NOT EXISTS auto_replies_unique ON auto_replies (guild_id, trigger_norm);
