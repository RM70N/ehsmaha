-- جنس العضو كما صرّح به بنفسه ("أنا بنت" / "أنا ولد") — عشان المساعد يخاطبه بالصيغة الصحيحة بالشات العام.
--   gender = 'female' | 'male'
CREATE TABLE IF NOT EXISTS ai_user_gender (
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  gender     TEXT NOT NULL,
  updated_at __BIGINT__ NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
