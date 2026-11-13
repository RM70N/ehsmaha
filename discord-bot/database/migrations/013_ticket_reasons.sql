-- أسباب فتح التكتات لكل سيرفر. جدول فاضي = يرجع البوت لملف config/ticketReasons.js (السلوك القديم).
CREATE TABLE IF NOT EXISTS ticket_reasons (
  guild_id TEXT NOT NULL,
  reason_key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  emoji TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (guild_id, reason_key)
);
