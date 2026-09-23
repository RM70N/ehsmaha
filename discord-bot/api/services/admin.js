'use strict';

// إحصائيات الإدارة (لأمر /ادمن_احصائيات).
// كل الأعداد عبر count() — Firestore يحسبها بالسيرفر بتكلفة قراءة واحدة لكل
// 1000 مستند، بدون تنزيل المستندات نفسها.

const firestore = require('../../database/firestore');
const C = require('../../database/collections');
const apiStats = require('./apiStats');
const memo = require('./memo');

const startedAt = Date.now();

async function count(query) {
  const agg = await query.count().get();
  return agg.data().count;
}

async function getAdminStats() {
  return memo.remember('admin:stats', 30 * 1000, async () => {
    const db = firestore.db();
    const { Timestamp } = firestore;
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [registeredUsers, rankedPlayers, activeToday, calls] = await Promise.all([
      count(db.collection(C.USERS)).catch(() => null),
      count(db.collection(C.LEVELS).where('xp', '>', 0)).catch(() => null),
      count(db.collection(C.LEVELS).where('updatedAt', '>=', Timestamp.fromDate(startOfDay))).catch(() => null),
      apiStats.today()
    ]);

    return {
      registeredUsers,
      rankedPlayers,
      activeToday,
      apiCallsToday: calls.calls,
      apiErrorsToday: calls.errors,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      day: apiStats.dayKey()
    };
  });
}

module.exports = { getAdminStats };
