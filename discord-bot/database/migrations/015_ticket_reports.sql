-- تقرير واحد فقط لكل تكت بروم أخبار الأدمن (ملخص الإغلاق أو تقرير التكت القديم) — يمنع التكرار حتى بعد إعادة التشغيل
CREATE TABLE IF NOT EXISTS ticket_reports (
  ticket_id   INTEGER NOT NULL PRIMARY KEY,
  guild_id    TEXT NOT NULL,
  kind        TEXT NOT NULL,
  reported_at __BIGINT__ NOT NULL
);
