-- نظام الترحيب البصري + الحماية التلقائية (روابط/سبام).

-- إعدادات السيرفر العامة (سطر واحد لكل سيرفر)
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id                   TEXT PRIMARY KEY,
  welcome_channel_id         TEXT,
  welcome_message_channel_id TEXT,
  welcome_message            TEXT,
  link_protection            INTEGER NOT NULL DEFAULT 1,
  spam_protection            INTEGER NOT NULL DEFAULT 1,
  updated_by                 TEXT,
  updated_at                 __BIGINT__ NOT NULL
);

-- عدّاد مخالفات منفصل لكل نوع (link / spam) — التصعيد مستقل لكل نوع
CREATE TABLE IF NOT EXISTS auto_mod_violations (
  guild_id          TEXT NOT NULL,
  discord_id        TEXT NOT NULL,
  violation_type    TEXT NOT NULL CHECK (violation_type IN ('link', 'spam')),
  count             INTEGER NOT NULL DEFAULT 0,
  last_violation_at __BIGINT__ NOT NULL,
  PRIMARY KEY (guild_id, discord_id, violation_type)
);

-- استثناءات الحماية: نطاقات مسموحة، رتب مستثناة من الروابط، قنوات يُسمح فيها بالروابط
CREATE TABLE IF NOT EXISTS auto_mod_exemptions (
  guild_id TEXT NOT NULL,
  type     TEXT NOT NULL CHECK (type IN ('domain', 'role', 'channel')),
  value    TEXT NOT NULL,
  added_by TEXT NOT NULL,
  added_at __BIGINT__ NOT NULL,
  PRIMARY KEY (guild_id, type, value)
);
