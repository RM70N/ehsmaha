// ==================== القسم 7 — مراقبة الجلسات المباشرة ====================
// rooms/{code} = {hostUid, hostUsername, gameTag, status, memberCount,
// createdAt} + rooms/{code}/members/{uid}. هذا نظام "الجمعات" (party rooms)
// الحقيقي بالموقع — إضافة لجلسات الستريمر (activeStreamers، مغطاة بقسم 1/3).
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload, tsToMillis } from '../core/format.js';

const fb = AdminFB;

async function loadActiveRooms() {
  const snap = await fb.getDocs(fb.collection(fb.db, 'rooms'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.status !== 'finished');
}

defineSection({
  id: 7,
  title: 'مراقبة الجلسات المباشرة',
  description: 'غرف الجمعات الحقيقية (rooms) + جلسات البث (activeStreamers، تفصيلها الكامل بقسم 1/3).',
  tools: [
    {
      title: 'خريطة حية بكل الجلسات النشطة الآن',
      keywords: 'خريطة حية جلسات نشطة',
      run: () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        let unsub = () => {};
        openModal({ title: 'كل الجلسات (غرف) النشطة الآن', bodyEl: body, size: 'xl', onClose: () => unsub() });
        unsub = fb.onSnapshot(fb.collection(fb.db, 'rooms'), (snap) => {
          const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.status !== 'finished');
          body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الرمز</th><th>اللعبة</th><th>المضيف</th><th>عدد الأعضاء</th><th>الحالة</th></tr></thead>
            <tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="الرمز">${r.id}</td><td data-label="اللعبة">${r.gameTag || '—'}</td><td data-label="المضيف">${r.hostUsername || '—'}</td><td data-label="الأعضاء">${r.memberCount || 0}</td><td data-label="الحالة">${r.status || '—'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا غرفة نشطة الآن</p>';
        }, () => {});
      }
    },
    {
      title: 'عرض تفاصيل جلسة معيّنة',
      keywords: 'تفاصيل جلسة غرفة',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">رمز الغرفة</span><input class="admin-input" id="rm-code" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="rm-go">عرض</button><div id="rm-detail" style="margin-top:12px;"></div>`;
        openModal({ title: 'تفاصيل جلسة', bodyEl: body, size: 'lg' });
        body.querySelector('#rm-go').addEventListener('click', async () => {
          const code = body.querySelector('#rm-code').value.trim();
          const [roomSnap, membersSnap] = await Promise.all([fb.getDoc(fb.doc(fb.db, 'rooms', code)), fb.getDocs(fb.collection(fb.db, 'rooms', code, 'members'))]);
          if (!roomSnap.exists()) { body.querySelector('#rm-detail').innerHTML = '<p>ما فيه غرفة بهذا الرمز</p>'; return; }
          const room = roomSnap.data();
          const members = membersSnap.docs.map((d) => d.data());
          body.querySelector('#rm-detail').innerHTML = `
            <dl class="admin-kv"><dt>اللعبة</dt><dd>${room.gameTag}</dd><dt>الحالة</dt><dd>${room.status}</dd><dt>المضيف</dt><dd>${room.hostUsername}</dd><dt>تاريخ الإنشاء</dt><dd>${fmtDate(room.createdAt)}</dd></dl>
            <table class="admin-table" style="margin-top:10px;"><thead><tr><th>العضو</th><th>انضم</th><th>آخر ظهور</th></tr></thead><tbody>${members.map((m) => `<tr><td data-label="العضو">${m.username}${m.isHost ? ' (مضيف)' : ''}</td><td data-label="انضم">${fmtDate(m.joinedAt)}</td><td data-label="آخر ظهور">${fmtDate(m.lastSeen)}</td></tr>`).join('')}</tbody></table>
          `;
        });
      }
    },
    {
      title: 'الدخول كمراقب صامت لأي جلسة نشطة لمتابعتها',
      keywords: 'مراقب صامت جلسة',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">رمز الغرفة</span><input class="admin-input" id="wt-code" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="wt-go">مراقبة حية</button><div id="wt-view" style="margin-top:12px;"></div>`;
        let unsub = () => {};
        openModal({ title: 'مراقبة صامتة (حية)', bodyEl: body, size: 'lg', onClose: () => unsub() });
        body.querySelector('#wt-go').addEventListener('click', () => {
          const code = body.querySelector('#wt-code').value.trim();
          unsub();
          unsub = fb.onSnapshot(fb.collection(fb.db, 'rooms', code, 'members'), (snap) => {
            const rows = snap.docs.map((d) => d.data());
            body.querySelector('#wt-view').innerHTML = `<p>عدد الأعضاء الآن: ${rows.length}</p><ul>${rows.map((m) => `<li>${m.username} — ${fmtDate(m.lastSeen)}</li>`).join('')}</ul>`;
          });
        });
      }
    },
    {
      title: 'إنهاء جلسة عن بُعد فوراً عند مشكلة',
      keywords: 'انهاء جلسة عن بعد',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">رمز الغرفة</span><input class="admin-input" id="end-code" /></div><button class="admin-btn admin-btn--danger admin-btn--sm" id="end-go">إنهاء الآن</button>`;
        const modal = openModal({ title: 'إنهاء جلسة', bodyEl: body, size: 'sm' });
        body.querySelector('#end-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const code = body.querySelector('#end-code').value.trim();
          await fb.updateDoc(fb.doc(fb.db, 'rooms', code), { status: 'finished' });
          await AdminAudit.log({ section: 7, sectionTitle: 'مراقبة الجلسات المباشرة', actionKey: 'sessions.end', actionLabel: 'إنهاء جلسة عن بُعد', targetType: 'room', targetId: code, sensitive: true });
          AdminToast.success('تم الإنهاء');
          modal.close();
        });
      }
    },
    {
      title: 'إرسال رسالة تظهر داخل الجلسة النشطة لكل المشاركين',
      keywords: 'رسالة داخل جلسة مشاركين',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">رمز الغرفة</span><input class="admin-input" id="brm-code" /></div><textarea class="admin-input" id="brm-text" rows="3" placeholder="نص الرسالة"></textarea><button class="admin-btn admin-btn--primary admin-btn--sm" id="brm-go" style="margin-top:8px;">إرسال للكل</button>`;
        const modal = openModal({ title: 'رسالة لكل أعضاء الجلسة', bodyEl: body, size: 'md' });
        body.querySelector('#brm-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const code = body.querySelector('#brm-code').value.trim();
          const text = body.querySelector('#brm-text').value.trim();
          const membersSnap = await fb.getDocs(fb.collection(fb.db, 'rooms', code, 'members'));
          await Promise.all(membersSnap.docs.map((d) => fb.setDoc(fb.doc(fb.collection(fb.db, 'notifications', d.data().uid, 'items')), { type: 'adminMessage', message: text, fromLabel: 'إدارة المنصة', read: false, createdAt: fb.serverTimestamp() })));
          await AdminAudit.log({ section: 7, sectionTitle: 'مراقبة الجلسات المباشرة', actionKey: 'sessions.broadcast', actionLabel: 'رسالة لكل أعضاء جلسة', targetType: 'room', targetId: code, note: text });
          AdminToast.success(`تم الإرسال لـ${membersSnap.size} عضو`);
          modal.close();
        });
      }
    },
    {
      title: 'تمديد وقت جلسة يدوياً',
      keywords: 'تمديد وقت جلسة',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">رمز الغرفة</span><input class="admin-input" id="ext-code" /></div><div class="admin-field"><span class="admin-field__label">دقائق إضافية</span><input class="admin-input" type="number" id="ext-min" value="10" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="ext-go" style="margin-top:8px;">تمديد</button>`;
        const modal = openModal({ title: 'تمديد وقت جلسة', bodyEl: body, size: 'sm' });
        body.querySelector('#ext-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const code = body.querySelector('#ext-code').value.trim();
          const min = Number(body.querySelector('#ext-min').value);
          await fb.updateDoc(fb.doc(fb.db, 'rooms', code), { extendedMinutes: fb.increment(min) });
          await AdminAudit.log({ section: 7, sectionTitle: 'مراقبة الجلسات المباشرة', actionKey: 'sessions.extend', actionLabel: 'تمديد وقت جلسة', targetType: 'room', targetId: code, after: { min } });
          AdminToast.success('تم — الحقل extendedMinutes مسجَّل بالغرفة (يحتاج قراءة من منطق اللعبة نفسها لتطبيقه فعلياً على المؤقّت المرئي)');
          modal.close();
        });
      }
    },
    {
      title: 'عرض زمن استجابة الجلسة (latency) لحظياً',
      keywords: 'زمن استجابة latency جلسة',
      badge: 'بيانات غير متوفرة بعد',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>ما فيه قياس latency مسجَّل بالغرف حالياً.</p>'; openModal({ title: 'زمن الاستجابة', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'تنبيه تلقائي عند تجمّد جلسة لأكثر من دقيقة',
      keywords: 'تنبيه تجمد جلسة',
      run: async () => {
        const rooms = await loadActiveRooms();
        const body = document.createElement('div');
        body.textContent = 'جارٍ الفحص...';
        openModal({ title: 'جلسات متجمّدة (بدون نشاط دقيقة+)', bodyEl: body, size: 'lg' });
        const frozen = [];
        for (const r of rooms) {
          const membersSnap = await fb.getDocs(fb.collection(fb.db, 'rooms', r.id, 'members'));
          const lastSeen = Math.max(0, ...membersSnap.docs.map((d) => tsToMillis(d.data().lastSeen)));
          if (Date.now() - lastSeen > 60000) frozen.push({ ...r, lastSeen });
        }
        body.innerHTML = frozen.length ? `<table class="admin-table"><thead><tr><th>الرمز</th><th>اللعبة</th><th>آخر نشاط</th></tr></thead><tbody>${frozen.map((r) => `<tr><td class="is-primary" data-label="الرمز">${r.id}</td><td data-label="اللعبة">${r.gameTag}</td><td data-label="آخر نشاط">${fmtDate(r.lastSeen)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا جلسة متجمّدة الآن</p>';
      }
    },
    {
      title: 'عرض سجل الدردشة/التفاعلات داخل الجلسة',
      keywords: 'سجل دردشة تفاعلات جلسة',
      badge: 'بيانات غير متوفرة بعد',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>ما فيه سجل دردشة مخزَّن داخل غرف الجمعات حالياً.</p>'; openModal({ title: 'سجل الدردشة', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'إيقاف مؤقت (pause) لجلسة معينة عن بُعد',
      keywords: 'ايقاف مؤقت جلسة pause',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">رمز الغرفة</span><input class="admin-input" id="pz-code" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="pz-go">تبديل الإيقاف المؤقت</button>`;
        const modal = openModal({ title: 'إيقاف مؤقت لجلسة', bodyEl: body, size: 'sm' });
        body.querySelector('#pz-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const code = body.querySelector('#pz-code').value.trim();
          const snap = await fb.getDoc(fb.doc(fb.db, 'rooms', code));
          if (!snap.exists()) { AdminToast.error('ما فيه غرفة بهذا الرمز'); return; }
          const paused = snap.data().status === 'paused';
          await fb.updateDoc(fb.doc(fb.db, 'rooms', code), { status: paused ? 'lobby' : 'paused' });
          await AdminAudit.log({ section: 7, sectionTitle: 'مراقبة الجلسات المباشرة', actionKey: 'sessions.pause', actionLabel: paused ? 'إلغاء إيقاف جلسة' : 'إيقاف مؤقت لجلسة', targetType: 'room', targetId: code });
          AdminToast.success('تم');
          modal.close();
        });
      }
    },
    {
      title: 'استبعاد مشارك واحد من جلسة نشطة دون إنهائها',
      keywords: 'استبعاد مشارك جلسة',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">رمز الغرفة</span><input class="admin-input" id="kk-code" /></div><div class="admin-field"><span class="admin-field__label">UID العضو</span><input class="admin-input" id="kk-uid" /></div><button class="admin-btn admin-btn--danger admin-btn--sm" id="kk-go" style="margin-top:8px;">استبعاد</button>`;
        const modal = openModal({ title: 'استبعاد عضو من جلسة', bodyEl: body, size: 'sm' });
        body.querySelector('#kk-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const code = body.querySelector('#kk-code').value.trim();
          const uid = body.querySelector('#kk-uid').value.trim();
          await fb.deleteDoc(fb.doc(fb.db, 'rooms', code, 'members', uid));
          await fb.updateDoc(fb.doc(fb.db, 'rooms', code), { memberCount: fb.increment(-1) });
          await AdminAudit.log({ section: 7, sectionTitle: 'مراقبة الجلسات المباشرة', actionKey: 'sessions.kickMember', actionLabel: 'استبعاد عضو من جلسة', targetType: 'room', targetId: code, targetLabel: uid, sensitive: true });
          AdminToast.success('تم الاستبعاد');
          modal.close();
        });
      }
    },
    {
      title: 'تكرار (clone) إعدادات جلسة ناجحة لبدء جلسة مشابهة',
      keywords: 'تكرار جلسة clone',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">رمز الغرفة الأصلية</span><input class="admin-input" id="cl-code" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="cl-go">إنشاء نسخة جديدة</button><div id="cl-result" style="margin-top:8px;"></div>`;
        openModal({ title: 'تكرار إعدادات جلسة', bodyEl: body, size: 'sm' });
        body.querySelector('#cl-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const code = body.querySelector('#cl-code').value.trim();
          const snap = await fb.getDoc(fb.doc(fb.db, 'rooms', code));
          if (!snap.exists()) { AdminToast.error('ما فيه غرفة بهذا الرمز'); return; }
          const newCode = 'CLONE' + Date.now().toString(36).toUpperCase();
          await fb.setDoc(fb.doc(fb.db, 'rooms', newCode), { ...snap.data(), status: 'lobby', memberCount: 0, createdAt: fb.serverTimestamp() });
          await AdminAudit.log({ section: 7, sectionTitle: 'مراقبة الجلسات المباشرة', actionKey: 'sessions.clone', actionLabel: 'تكرار إعدادات جلسة', targetType: 'room', targetId: newCode, before: { sourceCode: code } });
          body.querySelector('#cl-result').innerHTML = `<p>تم الإنشاء برمز جديد: <strong>${newCode}</strong></p>`;
        });
      }
    },
    {
      title: 'عرض عدد الجلسات المتزامنة القصوى اللي تحمّلها النظام اليوم',
      keywords: 'اقصى جلسات متزامنة اليوم',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'rooms'), fb.where('createdAt', '>=', new Date(new Date().setHours(0, 0, 0, 0)))));
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-stat-card"><div class="admin-stat-card__label">إجمالي الغرف المُنشأة اليوم</div><div class="admin-stat-card__value">${fmtNum(snap.size)}</div><div class="admin-stat-card__sub">هذا إجمالي الإنشاء وليس أقصى تزامن فعلي بلحظة واحدة — قياس التزامن الدقيق يحتاج تتبّع إضافي غير موجود حالياً.</div></div>`;
        openModal({ title: 'الجلسات اليوم', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'سجل كامل للجلسات المنتهية آخر 24 ساعة',
      keywords: 'سجل جلسات منتهية 24 ساعة',
      run: async () => {
        const snap = await fb.getDocs(fb.collection(fb.db, 'rooms'));
        const since = Date.now() - 86400000;
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.status === 'finished' && tsToMillis(r.createdAt) >= since);
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الرمز</th><th>اللعبة</th><th>المضيف</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="الرمز">${r.id}</td><td data-label="اللعبة">${r.gameTag}</td><td data-label="المضيف">${r.hostUsername}</td></tr>`).join('')}</tbody></table>` : '<p>ولا جلسة منتهية آخر 24 ساعة</p>';
        openModal({ title: 'الجلسات المنتهية آخر 24 ساعة', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'تصدير تقرير جلسة واحدة كاملاً (بيانات + أحداث)',
      keywords: 'تصدير تقرير جلسة كامل',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">رمز الغرفة</span><input class="admin-input" id="exp-code" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="exp-go">تصدير</button>`;
        openModal({ title: 'تصدير تقرير جلسة', bodyEl: body, size: 'sm' });
        body.querySelector('#exp-go').addEventListener('click', async () => {
          const code = body.querySelector('#exp-code').value.trim();
          const [roomSnap, membersSnap] = await Promise.all([fb.getDoc(fb.doc(fb.db, 'rooms', code)), fb.getDocs(fb.collection(fb.db, 'rooms', code, 'members'))]);
          if (!roomSnap.exists()) { AdminToast.error('ما فيه غرفة بهذا الرمز'); return; }
          const data = { room: roomSnap.data(), members: membersSnap.docs.map((d) => d.data()) };
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `session-${code}.json`;
          a.click();
        });
      }
    }
  ]
});
