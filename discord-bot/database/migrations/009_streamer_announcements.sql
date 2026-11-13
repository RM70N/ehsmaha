-- الإعلان التلقائي عن بثوث الستريمرز المسجلين (services/streamerAnnouncer).
-- streamer_announcements : قائمة التسجيل (سيرفر + منصة + يوزر مطبّع) — دائمة، تبقى بعد إعادة التشغيل.
-- streamer_announcement_events : "حلقة بث" لكل ظهور فعلي للستريمر (تمنع تكرار الإعلان).
--   فهرس فريد جزئي: حلقة مفتوحة واحدة فقط لكل (منصة + يوزر) — حماية من التزامن حتى بين عمليتين.
CREATE TABLE IF NOT EXISTS streamer_announcements (
  id __PK__,
  guild_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  username TEXT NOT NULL,
  normalized_username TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  added_by TEXT NOT NULL,
  created_at __BIGINT__ NOT NULL,
  updated_at __BIGINT__ NOT NULL,
  UNIQUE (guild_id, platform, normalized_username)
);
CREATE INDEX IF NOT EXISTS streamer_announcements_key ON streamer_announcements (platform, normalized_username);

CREATE TABLE IF NOT EXISTS streamer_announcement_events (
  id __PK__,
  platform TEXT NOT NULL,
  normalized_username TEXT NOT NULL,
  streamer_id __BIGINT__,
  link_session_id TEXT,
  live_session_id TEXT,
  event_key TEXT NOT NULL UNIQUE,
  started_at __BIGINT__ NOT NULL,
  last_seen_at __BIGINT__ NOT NULL,
  ended_at __BIGINT__,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  announced_at __BIGINT__,
  message_id TEXT,
  stream_url TEXT,
  error_code TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS streamer_events_open ON streamer_announcement_events (platform, normalized_username) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS streamer_events_status ON streamer_announcement_events (status);
