'use strict';

// تحويل معرّفات الإطارات المملوكة لأسماء (وصورة لو متاحة).
// المصدر: FRAMES_CATALOG الثابت بالموقع (frameNames.js)، والإطارات الديناميكية
// من framesCatalogExtra/{id} — Firestore أولاً ثم RTDB (نفس ترتيب الموقع
// بـframesReadFrameDoc، لأن بعض الإطارات الخاصة تنحفظ بـRTDB فقط).

const firestore = require('../../database/firestore');
const STATIC_NAMES = require('./frameNames');
const memo = require('./memo');

const TTL_MS = 30 * 60 * 1000;

async function readExtra(id) {
  return memo.remember('frame:' + id, TTL_MS, async () => {
    try {
      const snap = await firestore.db().collection('framesCatalogExtra').doc(id).get();
      if (snap.exists) return snap.data();
    } catch (_) { /* نكمل للـRTDB */ }
    const rtdb = firestore.rtdb();
    if (!rtdb) return null;
    try {
      const snap = await Promise.race([
        rtdb.ref('framesCatalogExtra/' + id).get(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500))
      ]);
      return snap.exists() ? snap.val() : null;
    } catch (_) {
      return null;
    }
  });
}

// رابط صورة صالح لـDiscord فقط (https) — صور الكتالوج الثابت data: ما تنفع
function httpsImage(doc) {
  const url = doc && (doc.gallery || doc.imageUrl);
  return typeof url === 'string' && /^https:\/\//i.test(url) ? url : null;
}

// ids → [{ id, name, imageUrl }]
async function describeFrames(ids) {
  const unique = [...new Set((ids || []).filter((x) => typeof x === 'string' && x && !x.includes('/')))].slice(0, 60);
  return Promise.all(
    unique.map(async (id) => {
      if (STATIC_NAMES[id]) return { id, name: STATIC_NAMES[id], imageUrl: null };
      const extra = await readExtra(id);
      return { id, name: (extra && extra.name) || id, imageUrl: httpsImage(extra) };
    })
  );
}

module.exports = { describeFrames };
