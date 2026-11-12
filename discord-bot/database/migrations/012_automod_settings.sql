-- حدود الحماية التلقائية لكل سيرفر (services/autoModLimits). الأولوية: القاعدة ثم البيئة ثم الافتراضي.
CREATE TABLE IF NOT EXISTS automod_limits (
  guild_id TEXT PRIMARY KEY,
  spam_max_messages INTEGER,
  spam_window_seconds INTEGER,
  spam_duplicates INTEGER,
  escalation_json TEXT,
  updated_by TEXT,
  updated_at __BIGINT__ NOT NULL
);
