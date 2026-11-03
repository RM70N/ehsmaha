CREATE TABLE IF NOT EXISTS owner_ai_tasks (
  id __PK__,
  task_id TEXT NOT NULL UNIQUE,
  message_id TEXT NOT NULL UNIQUE,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  request_text TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  plan_json TEXT,
  plan_hash TEXT,
  results_json TEXT,
  error_code TEXT,
  created_at __BIGINT__ NOT NULL,
  updated_at __BIGINT__ NOT NULL
);
CREATE INDEX IF NOT EXISTS owner_ai_tasks_guild ON owner_ai_tasks (guild_id, created_at);
CREATE INDEX IF NOT EXISTS owner_ai_tasks_status ON owner_ai_tasks (status);
