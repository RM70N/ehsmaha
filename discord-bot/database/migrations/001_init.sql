-- جداول قاعدة بيانات البوت (منفصلة تماماً عن قاعدة بيانات الموقع).
-- الملف يعمل على SQLite و PostgreSQL: __PK__ و __BIGINT__ تُستبدل حسب النوع.
-- كل الأوقات بالمللي ثانية (epoch ms) لتطابق التخزين بين النوعين.
-- كل جدول فيه guild_id لأن البوت ممكن يكون بأكثر من سيرفر.

CREATE TABLE IF NOT EXISTS bot_admin_config (
  guild_id   TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('role', 'user')),
  discord_id TEXT NOT NULL,
  added_by   TEXT NOT NULL,
  added_at   __BIGINT__ NOT NULL,
  PRIMARY KEY (guild_id, type, discord_id)
);

CREATE TABLE IF NOT EXISTS guild_config (
  guild_id   TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_by TEXT,
  updated_at __BIGINT__ NOT NULL,
  PRIMARY KEY (guild_id, key)
);

CREATE TABLE IF NOT EXISTS ticket_panels (
  id         __PK__,
  guild_id   TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  content    TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at __BIGINT__ NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id                __PK__,
  guild_id          TEXT NOT NULL,
  panel_id          __BIGINT__,
  origin_channel_id TEXT NOT NULL,
  discord_id        TEXT NOT NULL,
  channel_id        TEXT,
  reason            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  close_mode        TEXT,
  created_at        __BIGINT__ NOT NULL,
  closed_at         __BIGINT__,
  closed_by         TEXT
);
-- تكت مفتوح واحد فقط لكل عضو بنفس قناة اللوحة — ضمان على مستوى قاعدة البيانات
-- (يمنع التكرار حتى لو ضغط العضو الزر مرتين بنفس اللحظة).
CREATE UNIQUE INDEX IF NOT EXISTS tickets_one_open_per_member
  ON tickets (guild_id, discord_id, origin_channel_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS tickets_by_channel ON tickets (channel_id);

CREATE TABLE IF NOT EXISTS warnings (
  id                 __PK__,
  guild_id           TEXT NOT NULL,
  discord_id         TEXT NOT NULL,
  reason             TEXT NOT NULL,
  warning_role_given TEXT NOT NULL,
  issued_by          TEXT NOT NULL,
  issued_at          __BIGINT__ NOT NULL
);
CREATE INDEX IF NOT EXISTS warnings_by_member ON warnings (guild_id, discord_id, issued_at);

CREATE TABLE IF NOT EXISTS moderation_log (
  id           __PK__,
  guild_id     TEXT NOT NULL,
  action       TEXT NOT NULL,
  target_id    TEXT,
  moderator_id TEXT NOT NULL,
  channel_id   TEXT,
  reason       TEXT,
  details      TEXT,
  created_at   __BIGINT__ NOT NULL
);
CREATE INDEX IF NOT EXISTS moderation_log_by_guild ON moderation_log (guild_id, created_at);
