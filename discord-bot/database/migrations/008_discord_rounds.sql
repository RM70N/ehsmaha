-- راوندات ألعاب ديسكورد (services/discordRounds): حالة الراوند كاملة كـJSON لاستعادتها بعد إعادة تشغيل
-- البوت، وعلامة result_announced تمنع إعلان الفائز مرتين.
CREATE TABLE IF NOT EXISTS discord_rounds (
  round_id TEXT PRIMARY KEY,
  game_type TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  status TEXT NOT NULL,
  state_json TEXT NOT NULL,
  result_announced INTEGER NOT NULL DEFAULT 0,
  created_at __BIGINT__ NOT NULL,
  updated_at __BIGINT__ NOT NULL,
  ended_at __BIGINT__
);
CREATE INDEX IF NOT EXISTS discord_rounds_status ON discord_rounds (status);
CREATE INDEX IF NOT EXISTS discord_rounds_channel ON discord_rounds (guild_id, channel_id);
