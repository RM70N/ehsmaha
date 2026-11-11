// بيانات اختبار في محاكيات Firebase (مطابقة لبنية الموقع الفعلية) — تُصفَّر قبل كل تشغيل.
export async function resetEmulators() {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-ehsmaha/databases/(default)/documents', { method: 'DELETE' });
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-ehsmaha/accounts', { method: 'DELETE' });
}

export async function seedSite(fb) {
  const db = fb.db(), auth = fb.auth(), rt = fb.rtdb(), T = fb.Timestamp, now = Date.now();
  await rt.ref().set(null);
  const players = [['ahmed_1', 'p-ahmed', 1200, 'tiktok_ahmed'], ['sara', 'p-sara', 300, null], ['khalid', 'p-khalid', 50, null]];
  for (const [username, uid, xp, tiktok] of players) {
    await auth.createUser({ uid, email: `${username}@example.com`, password: 'secret123' });
    await db.collection('users').doc(uid).set({ username, usernameLower: username.toLowerCase(), email: `${username}@example.com`, createdAt: T.fromMillis(now - 5 * 86400_000), ...(tiktok ? { linkedTiktokUsername: tiktok } : {}) });
    await db.collection('usernames').doc(username.toLowerCase()).set({ uid });
    await db.collection('levels').doc(username.toLowerCase()).set({ xp, level: 3, roundsPlayed: 10, gamesPlayCount: { bomb: 4, sniper: 6 }, updatedAt: T.fromMillis(now - 3600_000), ownedFrames: [] });
  }
  await db.collection('levels').doc('tiktok_ahmed').set({ xp: 10, level: 1, roundsPlayed: 1, updatedAt: T.fromMillis(now) });
  await db.collection('bridgeStreamers').doc('streamer_one').set({ enabled: true, updatedAt: T.fromMillis(now), uid: 'x' });
  await db.collection('bridgeStreamers').doc('streamer_two').set({ enabled: true, updatedAt: T.fromMillis(now) });
  await db.collection('activeStreamers').doc('bomb_streamer_one').set({ username: 'streamer_one', platform: 'tiktok', uid: 'u1', startedAt: T.fromMillis(now) });
  await db.collection('gameBadges').doc('bomb').set({ badge: 'new' });
  await db.collection('shopProducts').doc('prod1').set({ name: 'حصانة 24 ساعة', type: 'immunity', price: 100, durationHours: 24, maxTotalPurchases: 50, purchasedCount: 3, createdAt: T.fromMillis(now - 3600_000), expiresAt: T.fromMillis(now + 20 * 3600_000) });
  await db.collection('storeSales').doc('sale1').set({ siteUsername: 'sara', productName: 'حصانة 24 ساعة', productType: 'immunity', targetStreamerRaw: 'streamer_one', isGift: false, purchasedAt: T.fromMillis(now - 1800_000) });
  await db.collection('framesCatalogExtra').doc('xframe1').set({ id: 'xframe1', name: 'إطار خاص', visibility: 'public' });
  await db.collection('streamerEvents').doc('bestStreamer_old').set({ type: 'bestStreamer', status: 'ended', title: 'أفضل ستريمر', broadcastMessage: 'قديمة', createdAt: T.fromMillis(now - 9 * 86400_000), contest_end_at: T.fromMillis(now - 2 * 86400_000) });
  await db.collection('event100').doc('current').set({ status: 'registration', msg1: 'استعدوا', msg2: 'انطلقنا' });
  await rt.ref('secretCodes/كود قديم').set({ name: 'كود قديم', frameId: 'anime01', frameName: 'تنين النار', durationDays: 1, maxUses: 2, usedCount: 2, active: true, createdAt: now - 3 * 86400_000, expiresAt: now - 86400_000, usedBy: { 'p-sara': { username: 'sara', usedAt: now - 86400_000 } } });
  await rt.ref('secretCodes/كود شغال').set({ name: 'كود شغال', frameId: 'anime02', frameName: 'فينيق اللهب', durationDays: 5, maxUses: 5, usedCount: 1, active: true, createdAt: now, expiresAt: now + 5 * 86400_000, usedBy: { 'p-ahmed': { username: 'ahmed_1', usedAt: now } } });
  return { now };
}

export async function seedEvent(fb, id = 'bestStreamer_live') {
  const db = fb.db(), T = fb.Timestamp, now = Date.now();
  await db.collection('streamerEvents').doc(id).set({ type: 'bestStreamer', status: 'active', title: 'أفضل ستريمر', broadcastMessage: 'جارية', createdAt: T.fromMillis(now - 3600_000), contest_end_at: T.fromMillis(now + 86400_000), endedAt: null, forceEndRequested: false });
  await db.collection('streamerEvents').doc(id).collection('sessions').doc('streamer_one').set({ totalPlayedSeconds: 3600, totalWins: 2 });
  await db.collection('streamerEvents').doc(id).collection('sessions').doc('streamer_two').set({ totalPlayedSeconds: 1200, totalWins: 5 });
}
