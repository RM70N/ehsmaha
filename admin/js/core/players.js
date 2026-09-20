// ==================== أدوات مشتركة لإيجاد/قراءة حسابات اللاعبين ====================
import { AdminFB } from './firebase.js';

const fb = AdminFB;

export async function resolveUidByUsername(usernameRaw) {
  const usernameLower = (usernameRaw || '').trim().toLowerCase();
  if (!usernameLower) return null;
  const snap = await fb.getDoc(fb.doc(fb.db, 'usernames', usernameLower));
  return snap.exists() ? snap.data().uid : null;
}

export async function getUserByUsername(usernameRaw) {
  const uid = await resolveUidByUsername(usernameRaw);
  if (!uid) return null;
  const snap = await fb.getDoc(fb.doc(fb.db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : { uid };
}

// بحث ببادئة اليوزرنيم (نطاق Firestore على usernameLower — نفس أسلوب فهرسة
// النص الوحيد المتاح بلا محرك بحث خارجي، يكفي لبحث الإدارة).
export async function searchUsersByPrefix(prefixRaw, limitN) {
  const prefix = (prefixRaw || '').trim().toLowerCase();
  if (!prefix) return [];
  const qy = fb.query(
    fb.collection(fb.db, 'users'),
    fb.where('usernameLower', '>=', prefix),
    fb.where('usernameLower', '<', prefix + ''),
    fb.limit(limitN || 25)
  );
  const snap = await fb.getDocs(qy);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

export function playerSearchBox({ onSelect, placeholder }) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="admin-field"><span class="admin-field__label">اسم المستخدم</span>
      <input class="admin-input" id="pl-search-input" placeholder="${placeholder || 'اكتب اليوزر أو جزء منه...'}" />
    </div>
    <div id="pl-search-results" style="margin-top:8px;"></div>
  `;
  const input = wrap.querySelector('#pl-search-input');
  const results = wrap.querySelector('#pl-search-results');
  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const val = input.value.trim();
      if (val.length < 2) { results.innerHTML = ''; return; }
      results.innerHTML = 'جارٍ البحث...';
      const rows = await searchUsersByPrefix(val, 15);
      results.innerHTML = rows.length ? rows.map((r) => `<button type="button" class="admin-tool-card" style="padding:8px 12px;min-height:auto;width:100%;text-align:right;margin-bottom:4px;" data-uid="${r.uid}">${r.username || r.uid}</button>`).join('') : '<p class="admin-field__hint">ولا نتيجة</p>';
      results.querySelectorAll('[data-uid]').forEach((btn) => btn.addEventListener('click', () => {
        const row = rows.find((r) => r.uid === btn.getAttribute('data-uid'));
        onSelect(row);
      }));
    }, 300);
  });
  return wrap;
}

window.AdminPlayers = { resolveUidByUsername, getUserByUsername, searchUsersByPrefix };
