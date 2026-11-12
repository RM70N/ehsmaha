-- إحصاءات استخدام الأوامر الدائمة (utils/usageStats): صف لكل (يوم UTC + أمر). نخزّن رمز آخر خطأ فقط (بدون نص أو بيانات مستخدمين).
CREATE TABLE IF NOT EXISTS command_usage (
  day TEXT NOT NULL,
  command_name TEXT NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  denied INTEGER NOT NULL DEFAULT 0,
  last_used_at __BIGINT__,
  last_error_at __BIGINT__,
  last_error_code TEXT,
  PRIMARY KEY (day, command_name)
);
