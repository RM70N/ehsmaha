// ==================== القسم 17 — إدارة API منصات البث ====================
// تيك توك/كيك/يوتيوب تمر عبر سيرفر جسر واحد (ehsmaha.onrender.com)، تويتش
// اتصال IRC مباشر من المتصفح بدون أي مفتاح — النظام الحالي لا يستخدم مفاتيح
// API شخصية إطلاقاً (getTikTokApiKey() ترجع فارغة دائماً بالكود الحالي).
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload } from '../core/format.js';

const fb = AdminFB;
const BRIDGE = 'https://ehsmaha.onrender.com';

async function checkBridge() {
  try { const r = await fetch(BRIDGE + '/healthz', { cache: 'no-store' }); return r.ok; } catch (e) { return false; }
}
async function checkTwitch() {
  return new Promise((resolve) => {
    try {
      const sock = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
      const timer = setTimeout(() => { try { sock.close(); } catch (e) {} resolve(false); }, 4000);
      sock.onopen = () => { clearTimeout(timer); try { sock.close(); } catch (e) {} resolve(true); };
      sock.onerror = () => { clearTimeout(timer); resolve(false); };
    } catch (e) { resolve(false); }
  });
}

defineSection({
  id: 17,
  title: 'إدارة API منصات البث',
  description: 'تيك توك/كيك/يوتيوب عبر سيرفر جسر واحد؛ تويتش اتصال مباشر — بدون مفاتيح API شخصية بالمعمارية الحالية.',
  tools: [
    {
      title: 'حالة الاتصال الحالية لكل منصة (متصل/منقطع)',
      keywords: 'حالة اتصال منصة',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ الفحص...';
        openModal({ title: 'حالة كل منصة الآن', bodyEl: body, size: 'sm' });
        const [bridge, twitch] = await Promise.all([checkBridge(), checkTwitch()]);
        body.innerHTML = `<table class="admin-table"><tbody>
          <tr><td class="is-primary" data-label="المنصة">تيك توك/كيك/يوتيوب (جسر مشترك)</td><td data-label="الحالة"><span class="admin-badge ${bridge ? 'admin-badge--on' : 'admin-badge--off'}">${bridge ? 'متصل' : 'منقطع'}</span></td></tr>
          <tr><td class="is-primary" data-label="المنصة">تويتش (مباشر)</td><td data-label="الحالة"><span class="admin-badge ${twitch ? 'admin-badge--on' : 'admin-badge--off'}">${twitch ? 'متصل' : 'منقطع'}</span></td></tr>
        </tbody></table>`;
      }
    },
    {
      title: 'تجديد أو تحديث مفاتيح API لكل منصة',
      keywords: 'تجديد تحديث مفاتيح api',
      meta: 'لا يوجد مفاتيح API شخصية بالمعمارية الحالية (getTikTokApiKey فارغة دائماً بالكود) — الربط بالاسم فقط عبر السيرفر الجسر',
      run: () => AdminToast.info('النظام الحالي ما يستخدم مفاتيح API شخصية إطلاقاً — الربط بالاسم فقط عبر السيرفر الجسر أو IRC مباشر (تويتش)')
    },
    {
      title: 'تنبيه فوري عند انقطاع اتصال إحدى المنصات',
      keywords: 'تنبيه انقطاع منصة',
      run: async () => {
        const [bridge, twitch] = await Promise.all([checkBridge(), checkTwitch()]);
        const down = [];
        if (!bridge) down.push('الجسر (تيك توك/كيك/يوتيوب)');
        if (!twitch) down.push('تويتش');
        const body = document.createElement('div');
        body.innerHTML = down.length ? `<div class="admin-stat-card admin-stat-card--danger"><div class="admin-stat-card__label">منصات منقطعة الآن</div><div class="admin-stat-card__value">${down.length}</div><div class="admin-stat-card__sub">${down.join('، ')}</div></div>` : '<div class="admin-stat-card admin-stat-card--good"><div class="admin-stat-card__label">كل المنصات متصلة</div></div>';
        openModal({ title: 'حالة الاتصال', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'سجل زمن استجابة كل API عبر الوقت',
      keywords: 'سجل زمن استجابة api',
      run: async () => {
        const body = document.createElement('div');
        body.innerHTML = '<button class="admin-btn admin-btn--primary admin-btn--sm" id="log-now">قياس وتسجيل الآن</button><div id="log-hist" style="margin-top:10px;"></div>';
        openModal({ title: 'سجل زمن الاستجابة', bodyEl: body, size: 'lg' });
        async function loadHist() {
          const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'apiHealthLog'), fb.orderBy('ts', 'desc'), fb.limit(50)));
          const rows = snap.docs.map((d) => d.data());
          body.querySelector('#log-hist').innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>الجسر (ms)</th><th>تويتش</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.ts)}</td><td data-label="الجسر">${r.bridgeMs != null ? r.bridgeMs : '—'}</td><td data-label="تويتش">${r.twitchOk ? 'متصل' : 'منقطع'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا قياس مسجَّل بعد</p>';
        }
        body.querySelector('#log-now').addEventListener('click', async () => {
          const start = performance.now();
          const bridge = await checkBridge();
          const bridgeMs = bridge ? Math.round(performance.now() - start) : null;
          const twitch = await checkTwitch();
          await fb.setDoc(fb.doc(fb.collection(fb.db, 'apiHealthLog')), { ts: Date.now(), bridgeMs, twitchOk: twitch });
          loadHist();
        });
        loadHist();
      }
    },
    {
      title: 'اختبار الاتصال يدوياً بضغطة زر لكل منصة',
      keywords: 'اختبار اتصال يدوي منصة',
      meta: 'نفس أداة "حالة الاتصال الحالية" أعلاه',
      run: () => AdminToast.info('استخدم أداة "حالة الاتصال الحالية لكل منصة" أعلاه — تفحص الاتصال الفعلي فوراً بضغطة واحدة')
    },
    {
      title: 'عرض حد الاستخدام (Rate Limit) المتبقي لكل API',
      keywords: 'حد استخدام rate limit api',
      badge: 'بيانات غير متوفرة بعد',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>سيرفر الجسر ما يعرض حالياً أي endpoint لحد الاستخدام المتبقي.</p>'; openModal({ title: 'Rate Limit', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'تفعيل/تعطيل منصة بث بالكامل من الموقع مؤقتاً',
      keywords: 'تفعيل تعطيل منصة بث كامل',
      run: () => {
        openFormModal({
          title: 'تعطيل منصة بث',
          fields: [{ key: 'platform', label: 'المنصة', type: 'select', options: [{ value: 'tiktok', label: 'تيك توك' }, { value: 'twitch', label: 'تويتش' }, { value: 'kick', label: 'كيك' }, { value: 'youtube', label: 'يوتيوب' }] }],
          submitText: 'تبديل الحالة',
          onSubmit: async (v) => {
            const snap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'platformToggles'));
            const cur = snap.exists() ? snap.data() : {};
            const newVal = cur[v.platform] === false;
            await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'platformToggles'), { [v.platform]: newVal }, { merge: true });
            await AdminAudit.log({ section: 17, sectionTitle: 'إدارة API منصات البث', actionKey: 'platforms.toggle', actionLabel: newVal ? 'تفعيل منصة' : 'تعطيل منصة', targetType: 'platform', targetId: v.platform, sensitive: true });
            AdminToast.success('تم الحفظ — يحتاج قراءة هذا المفتاح من شاشات إعداد الألعاب لتطبيقه فعلياً هناك');
          }
        });
      }
    },
    {
      title: 'سجل الأخطاء الأخيرة الواردة من كل API',
      keywords: 'سجل اخطاء api',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'clientErrorLog'), fb.orderBy('ts', 'desc'), fb.limit(500)));
        const rows = snap.docs.map((d) => d.data()).filter((r) => /tiktok|twitch|kick|youtube|bridge|ws/i.test(r.message || ''));
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>الرسالة</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.ts)}</td><td data-label="الرسالة">${(r.message || '').slice(0, 100)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا خطأ مرتبط بمنصات البث مسجَّل</p>';
        openModal({ title: 'أخطاء منصات البث', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'تحديث Webhook أو نقاط الاتصال لكل منصة',
      keywords: 'تحديث webhook نقاط اتصال',
      run: async () => {
        const snap = await fb.getDoc(fb.doc(fb.db, 'gameConfig', 'bridgeEndpoints'));
        const cur = snap.exists() ? snap.data() : {};
        openFormModal({
          title: 'نقاط اتصال السيرفر الجسر',
          fields: [{ key: 'bridgeUrl', label: 'رابط السيرفر الجسر (مرجعي)', value: cur.bridgeUrl || BRIDGE }],
          onSubmit: async (v) => { await fb.setDoc(fb.doc(fb.db, 'gameConfig', 'bridgeEndpoints'), v, { merge: true }); AdminToast.success('تم الحفظ بقاعدة البيانات — الرابط الفعلي المستخدَم بالموقع (TIKTOK_BRIDGE_SERVER_URL) ثابت بكود index.html، تغييره الفعلي يحتاج تعديل الكود مباشرة'); }
        });
      }
    },
    {
      title: 'مراقبة تكلفة استخدام API (لو فيها تكلفة) شهرياً',
      keywords: 'تكلفة استخدام api شهري',
      badge: 'بيانات غير متوفرة بعد',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>ما فيه ربط بفوترة Render أو أي API مدفوعة حالياً.</p>'; openModal({ title: 'تكلفة API', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'إدارة قائمة الستريمرز المصرَّح لهم بربط كل منصة',
      keywords: 'قائمة ستريمرز مصرح ربط منصة',
      run: () => {
        openFormModal({
          title: 'تصريح ربط منصة لستريمر',
          fields: [
            { key: 'usernameLower', label: 'يوزر الستريمر (أحرف صغيرة)', required: true },
            { key: 'platform', label: 'المنصة', type: 'select', options: [{ value: 'tiktok', label: 'تيك توك' }, { value: 'twitch', label: 'تويتش' }, { value: 'kick', label: 'كيك' }, { value: 'youtube', label: 'يوتيوب' }] }
          ],
          onSubmit: async (v) => { await fb.setDoc(fb.doc(fb.db, 'streamerProfiles', v.usernameLower), { allowedPlatforms: fb.arrayUnion(v.platform) }, { merge: true }); AdminToast.success('تم'); }
        });
      }
    },
    {
      title: 'توثيق (verify) ربط حساب منصة جديد يدوياً عند الحاجة',
      keywords: 'توثيق ربط حساب منصة',
      run: () => {
        openFormModal({
          title: 'توثيق ربط منصة',
          fields: [{ key: 'usernameLower', label: 'يوزر الستريمر', required: true }, { key: 'platform', label: 'المنصة تم توثيقها' }],
          onSubmit: async (v) => { await fb.setDoc(fb.doc(fb.db, 'streamerProfiles', v.usernameLower), { verifiedPlatforms: fb.arrayUnion(v.platform) }, { merge: true }); AdminToast.success('تم'); }
        });
      }
    },
    {
      title: 'عرض عدد الأحداث المستقبَلة من كل منصة اليوم',
      keywords: 'عدد احداث منصة اليوم',
      run: async () => {
        const since = new Date(new Date().setHours(0, 0, 0, 0));
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.where('createdAt', '>=', since)));
        const counts = new Map();
        snap.docs.forEach((d) => { const p = d.data().platform || 'غير محدد'; counts.set(p, (counts.get(p) || 0) + 1); });
        const body = document.createElement('div');
        body.innerHTML = `<table class="admin-table"><tbody>${[...counts.entries()].map(([p, c]) => `<tr><td class="is-primary" data-label="المنصة">${p}</td><td data-label="العدد">${fmtNum(c)}</td></tr>`).join('') || '<tr><td>ولا حدث اليوم</td></tr>'}</tbody></table>`;
        openModal({ title: 'أحداث اليوم حسب المنصة', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'اختبار محاكاة لحدث بث وهمي للتأكد من عمل الربط',
      keywords: 'اختبار محاكاة حدث وهمي',
      run: () => {
        openFormModal({
          title: 'محاكاة حدث بث (يُسجَّل بوضوح كـsimulated)',
          fields: [{ key: 'platform', label: 'المنصة', type: 'select', options: [{ value: 'tiktok', label: 'تيك توك' }, { value: 'twitch', label: 'تويتش' }, { value: 'kick', label: 'كيك' }, { value: 'youtube', label: 'يوتيوب' }] }],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.collection(fb.db, 'playEvents')), { type: 'streamer_launch', platform: v.platform, gameName: '(محاكاة اختبار)', username: 'admin-test', simulated: true, createdAt: fb.serverTimestamp() });
            AdminToast.success('تم تسجيل حدث محاكاة حقيقي (مُعلَّم simulated:true) — تحقق من ظهوره بلوحات الإحصائيات');
          }
        });
      }
    },
    {
      title: 'تصدير تقرير حالة كل الـAPIs الشهري',
      keywords: 'تصدير تقرير حالة apis شهري',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'apiHealthLog'), fb.orderBy('ts', 'desc'), fb.limit(1000)));
        const rows = snap.docs.map((d) => d.data());
        csvDownload('api-health.csv', [['الوقت', 'زمن الجسر (ms)', 'تويتش متصل'], ...rows.map((r) => [fmtDate(r.ts), r.bridgeMs, r.twitchOk])]);
        AdminToast.success(`تم تصدير ${rows.length} قياس`);
      }
    }
  ]
});
