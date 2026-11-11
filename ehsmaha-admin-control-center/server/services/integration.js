// خريطة التكامل الحيّة: كل نظام مرتبط، مصدر بياناته، وجهته، آخر فحص حقيقي.
export async function integrationMap(svc) {
  const h = Object.fromEntries(svc.health.latest().map((x) => [x.id, x]));
  const cap = (k) => svc.caps[k]();
  const row = (id, name, source, dest, capKey, hid) => ({ id, name, source, destination: dest, available: cap(capKey).ok, reason: cap(capKey).ok ? null : cap(capKey).reason, health: hid ? { status: h[hid]?.status, ms: h[hid]?.ms, checkedAt: h[hid]?.checkedAt, lastOkAt: h[hid]?.lastOkAt, error: h[hid]?.error } : null });
  return {
    links: [
      row('firestore', 'Cloud Firestore (الموقع)', 'اللوحة ← Firebase Admin SDK', 'users, levels, shopProducts, streamerEvents, bridgeStreamers…', 'firebase', 'firestore'),
      row('rtdb', 'Realtime Database (الموقع)', 'اللوحة ← Firebase Admin SDK', 'secretCodes, opsConfig, ownerMessages', 'firebase', 'rtdb'),
      row('auth', 'Firebase Authentication', 'اللوحة ← Admin SDK', 'تعطيل/تفعيل حسابات اللاعبين وسحب الجلسات', 'firebase', 'firebaseAuth'),
      row('discordRest', 'Discord REST API', 'اللوحة ← توكن البوت', 'السيرفر: رسائل، أعضاء، رتب، أوامر', 'discord', 'discordApi'),
      row('botDb', 'قاعدة بيانات البوت', 'اللوحة ← نفس قاعدة البوت (PostgreSQL/SQLite)', 'guild_settings, auto_mod_*, tickets, streamer_announcements…', 'botDb', 'botDb'),
      row('botHealth', 'بوابة صحة البوت', 'اللوحة ← GET /health', 'جاهزية + ping + uptime', 'botHealth', 'bot'),
      row('botApi', 'API البوت الداخلي', 'اللوحة ← x-api-key (من الخادم فقط)', '/api/discord/* (قراءة)', 'botApi', 'botApi'),
      row('botSource', 'ملفات أوامر البوت', 'اللوحة ← قراءة ملفات (BOT_DIR)', 'سجل الأوامر', 'botSource', null),
      row('store', 'قاعدة اللوحة', 'اللوحة ← SQLite مستقلة', 'التدقيق، الجلسات، الإعدادات، التنبيهات', 'store', 'adminStore')
    ],
    applyModes: {
      live: 'يُقرأ من قاعدة البوت عند كل حدث ← التغيير فوري',
      ttl: 'يُخزَّن بكاش داخل البوت (10 دقائق لصلاحيات الإدارة)',
      restart: 'يُحمَّل في ذاكرة البوت عند الإقلاع فقط ← يحتاج إعادة تشغيل'
    }
  };
}
