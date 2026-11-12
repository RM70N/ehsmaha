-- تعطيل الأوامر وتقييدها داخل البوت (services/commandControl) — تُدار من لوحة الإدارة عبر /admin-control.
-- القوائم JSON (مصفوفات معرّفات). بدون صف = لا قيود (السلوك القديم).
CREATE TABLE IF NOT EXISTS command_controls (
  guild_id TEXT NOT NULL,
  command_name TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0,
  allowed_roles TEXT,
  allowed_channels TEXT,
  blocked_channels TEXT,
  updated_by TEXT,
  updated_at __BIGINT__ NOT NULL,
  PRIMARY KEY (guild_id, command_name)
);
