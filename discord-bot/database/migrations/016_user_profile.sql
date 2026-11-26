-- ملف العضو للمساعد: مصدر الجنس (explicit = صرّح به، inferred = استنتاج من أسلوبه/لقبه) + اللقب اللي طلبه ("نادني الملكة فطيم")
-- واسم العرض وقت طلب اللقب (لو تغيّر اسمه ينتهي اللقب). صف بلا جنس معروف يحمل gender = 'unknown'.
ALTER TABLE ai_user_gender ADD COLUMN source TEXT NOT NULL DEFAULT 'explicit';
ALTER TABLE ai_user_gender ADD COLUMN nickname TEXT;
ALTER TABLE ai_user_gender ADD COLUMN nickname_name TEXT;
