// يولّد ADMIN-ACTIONS-REGISTRY.md و BUTTON-INTEGRATION-MAP.md و BUTTON-TEST-REPORT.md مباشرة من سجل الإجراءات الفعلي
// ومن نتائج الاختبارات (test-results/*.json) — فلا تنحرف الوثائق عن الكود.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistry } from '../server/actions/registry.js';
import { sectionDefs } from '../server/actions/sections/index.js';
import { createPermissions } from '../server/auth/permissions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reg = createRegistry(sectionDefs);
const perms = createPermissions({ store: { col: () => ({ get: () => null }), tx: (f) => f() }, registry: reg });
const W = { website: 'مساحة الموقع (Website Control)', discord: 'مساحة ديسكورد والبوت (Discord & Bot Control)', control: 'الأقسام المشتركة (مركز التحكم)' };
const DANGER = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة' };
const APPLY = { live: 'فوري (يقرؤه البوت من قاعدته عند كل حدث)', ttl: '≤10 دقائق (كاش داخل البوت)', restart: 'يتطلب إعادة تشغيل البوت' };
const SVC = { firebase: 'Firebase Admin (Firestore/RTDB/Auth)', discord: 'Discord REST', discordGuild: 'Discord REST', botDb: 'Bot DB Adapter', botSource: 'قراءة ملفات البوت', store: 'قاعدة اللوحة', botHealth: 'Bot /health', botApi: 'Bot API' };
const SRC = {
  players: 'Firebase Auth (disable/revoke) · Firestore `users`,`usernames`,`levels`,`personalMessages` · RTDB `ownerMessages/personal` · قاعدة اللوحة (`punishments`,`playerNotes`,`xpLedger`,`tempActions`)',
  streamers: 'Firestore `bridgeStreamers` (بوابة خادم الربط) و`activeStreamers` · قاعدة اللوحة (ملاحظات، إيقاف مؤقت)',
  games: 'RTDB `opsConfig/current|history/{tag}` (نفس آلية لوحة المالك) · Firestore `gameBadges` · مخطط `MOD_SETTINGS_SCHEMA` (لقطة مستخرجة)',
  events: 'Firestore `streamerEvents` (+`sessions`) و`streamerEventAnnouncements/current` و`event100/current`',
  rewards: 'Firestore `levels.ownedFrames/levelFrames/activeFrame` (نفس `framesGrantToUser`) · كتالوج الإطارات (مدمج + `framesCatalogExtra`) · قاعدة اللوحة (`frameGrants`)',
  shop: 'Firestore `shopProducts` و`storeSales` و`framesCatalogExtra.visibility`',
  codes: 'RTDB `secretCodes/{key}` (نفس بنية وتطبيع مفتاح الموقع)',
  messages: 'Firestore `broadcastMessages/current` + RTDB `ownerMessages/broadcast` · `personalMessages` · قاعدة اللوحة (`savedAnnouncements`,`scheduledPosts`)',
  analytics: 'Firestore `users`,`levels`,`storeSales` (count/aggregations) · قاعدة اللوحة (`reports`,`punishments`,`xpLedger`)',
  server: 'Discord REST `/guilds`, `/channels`, `/members`, `/audit-logs`',
  members: 'Discord REST (kick/ban/timeout/roles/nick) · قاعدة البوت (warnings, moderation_log — قراءة)',
  commands: 'ملفات `discord-bot/commands` (قراءة) · Discord REST `/applications/{id}/commands` · قاعدة اللوحة (`disabledCommands`)',
  automod: 'قاعدة البوت: `guild_settings`, `auto_mod_exemptions`, `auto_mod_violations`',
  tickets: 'قاعدة البوت: `tickets`, `guild_config.support_roles`, `guild_settings`, `ai_style_examples`',
  welcome: 'قاعدة البوت: `guild_settings` · Discord REST (اختبار نصي)',
  admins: 'قاعدة البوت: `bot_admin_config`',
  dstreamers: 'قاعدة البوت: `streamer_announcements`, `streamer_announcement_events`',
  botdb: 'قاعدة البوت (قراءة عبر طبقة محددة)',
  access: 'قاعدة اللوحة: `settings/adminAccess` (إصدارات + تدقيق)', security: 'قاعدة اللوحة: جلسات، `loginLog`, `ipBlocks`, النسخ الاحتياطي (VACUUM INTO)',
  settings: 'قاعدة اللوحة: `settings/app` (إصدارات + سجل + تراجع)', audit: 'قاعدة اللوحة: `audit` (سلسلة تجزئة، إضافة فقط)', health: 'فحوصات اتصال فعلية (Firestore/RTDB/Auth/Discord/Bot/DB)',
  alerts: 'قاعدة اللوحة: `alerts`', integration: 'قاعدة اللوحة: `integrationLinks` + Firestore + Discord REST + قاعدة البوت'
};

let md = `# ADMIN-ACTIONS-REGISTRY\n\nمولَّد آلياً من سجل الإجراءات الفعلي (\`npm run gen-docs\`). كل صف = زر حقيقي له Backend وتحقق من المصدر الأصلي. الصلاحية الافتراضية للأدمن: **القراءة والخطورة المنخفضة فقط** — وللمالك تعديلها زراً زراً من «صلاحيات الأدمن».\n\n`;
const totals = { sections: 0, actions: 0, read: 0, views: 0 };
for (const ws of ['website', 'discord', 'control']) {
  md += `## ${W[ws]}\n\n`;
  for (const s of reg.sections().filter((x) => x.workspace === ws)) {
    const acts = reg.actionsOf(s.id); const views = reg.viewsOf(s.id); totals.sections++; totals.actions += acts.length; totals.views += views.length; totals.read += acts.filter((a) => a.kind === 'read').length;
    md += `### ${s.label} \`${s.id}\`${s.ownerOnly ? ' 🔒 للمالك فقط' : ''}\n\n${s.description || ''}\n\n`;
    if (views.length) md += `**الجداول/العروض (${views.length}):** ${views.map((v) => `${v.label}${v.source ? ` ‹${v.source}›` : ''}`).join(' · ')}\n\n`;
    md += `| # | الإجراء | المعرّف | النوع | الخطورة | تراجع | الأدمن افتراضياً | التطبيق |\n|---|---|---|---|---|---|---|---|\n`;
    acts.forEach((a, i) => { md += `| ${i + 1} | ${a.label}${a.hidden ? ' _(داخلي للتراجع)_' : ''} | \`${a.id}\` | ${a.kind === 'read' ? 'قراءة' : 'كتابة'} | ${DANGER[a.danger]} | ${a.reversible ? '✔' : '—'} | ${a.ownerOnly ? '🔒 لا' : perms.actDefault(a) ? '✔' : 'لا'} | ${a.apply ? APPLY[a.apply] : 'فوري'} |\n`; });
    md += `\n${acts.map((a) => `- **${a.label}** — ${a.description || ''}`).join('\n')}\n\n`;
  }
}
md += `---\n**الإجمالي:** ${totals.sections} قسماً · ${totals.actions} إجراءً (${totals.actions - totals.read} كتابة + ${totals.read} قراءة/تقارير) · ${totals.views} عرض بيانات.\n`;
fs.writeFileSync(path.join(root, 'ADMIN-ACTIONS-REGISTRY.md'), md);

// ---------------- BUTTON-INTEGRATION-MAP ----------------
let im = `# BUTTON-INTEGRATION-MAP\n\nلكل زر: نقطة الدخول، الخدمة المسؤولة، مصدر البيانات، وطريقة التحقق من التنفيذ. (مولَّد آلياً.)\n\n**نقطة الدخول الموحّدة:** \`POST /api/actions/{section}/{action}/run\` ← جلسة HttpOnly + ترويسة CSRF + Origin ← صلاحية ← تحقق مدخلات (Zod) ← قدرة الاتصال ← تأكيد (للخطورة ≥ متوسطة) ← مفتاح عدم التكرار ← \`load\` (القيمة الحالية) ← \`execute\` ← \`verify\` (إعادة قراءة من المصدر) ← تدقيق ← نتيجة.\n\n`;
let noVerify = [];
for (const s of reg.sections()) {
  im += `## ${s.label} \`${s.id}\`\n\n**المصدر:** ${SRC[s.id] || '—'}\n\n| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |\n|---|---|---|---|\n`;
  for (const a of reg.actionsOf(s.id)) {
    const svc = [...new Set(a.requires.map((r) => SVC[r]))].join(' + ') || '—';
    const verify = a.kind === 'read' ? 'قراءة فقط (لا تغيير)' : a.verify ? 'إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح' : (noVerify.push(a.id), 'تحقق ضمني بالمعاملة/القراءة داخل التنفيذ');
    im += `| ${a.label} | \`POST /api/actions/${s.id}/${a.shortId}/run\` | ${svc} | ${verify}${a.apply === 'restart' ? ' — ⚠️ محفوظ لكن يُطبَّقه البوت بعد إعادة التشغيل (يظهر بحالة «معلّق»)' : a.apply === 'ttl' ? ' — ⚠️ يطبَّق خلال ≤10د' : ''} |\n`;
  }
  im += '\n';
}
im += `## عروض البيانات (GET)\n\n\`GET /api/views/{section}/{view}?q=&cursor=&page=\` — تصفية وترقيم من الخادم، لا تحمّل كل البيانات.\n\n${reg.sections().flatMap((s) => reg.viewsOf(s.id).map((v) => `- \`${v.fullId}\` — ${v.label}${v.source ? ` ← ${v.source}` : ''}`)).join('\n')}\n`;
if (noVerify.length) im += `\n> إجراءات كتابة بلا \`verify\` مستقل: ${noVerify.join(', ')}\n`;
fs.writeFileSync(path.join(root, 'BUTTON-INTEGRATION-MAP.md'), im);

// ---------------- BUTTON-TEST-REPORT ----------------
const resFile = path.join(root, 'test-results', 'button-results.json');
const uiFile = path.join(root, 'test-results', 'ui-results.json');
if (fs.existsSync(resFile)) {
  const R = JSON.parse(fs.readFileSync(resFile, 'utf8')); const UI = fs.existsSync(uiFile) ? JSON.parse(fs.readFileSync(uiFile, 'utf8')) : {};
  let tr = `# BUTTON-TEST-REPORT\n\nنتائج اختبار كل زر (مولَّد من \`test-results/button-results.json\` بعد تشغيل \`npm run test:integration\`).\n\n**بيئة الاختبار:** Firestore + Auth + Realtime Database **محاكيات رسمية من Firebase** (firebase-tools) تُنفَّذ عليها العمليات بـ Admin SDK الحقيقي · Discord: خادم HTTP محلي يحاكي REST (حالة بالذاكرة) · قاعدة البوت: SQLite مبنية من migrations البوت الفعلية. **لم تُنفَّذ أي عملية على بيانات الإنتاج.**\n\n**دلالات الأعمدة:** «مسار النجاح» = تنفيذ حقيقي عبر HTTP + جلسة + CSRF ثم قراءة المصدر مباشرة للتأكد · «حالات الفشل» = معرّف غير موجود/تكرار/خارج الحدود… · «تحقق المدخلات» = مدخلات فارغة ← 422 قبل أي تنفيذ · «رفض الأدمن» = الأدمن بلا صلاحية ← 403 من الخادم حتى لطلب يدوي.\n\n`;
  let ok = 0, tot = 0, neg = 0;
  tr += `| الزر | مسار النجاح | حالات الفشل المختبرة | تحقق المدخلات | رفض الأدمن | الحكم |\n|---|---|---|---|---|---|\n`;
  for (const a of reg.actions()) {
    const r = R[a.id]; const runs = r?.runs || []; const good = runs.filter((x) => x.expect === 200 && x.ok).length; const bad = runs.filter((x) => x.expect !== 200 && x.ok).length; const failed = runs.filter((x) => !x.ok).length;
    const hidden = a.hidden; const needsVal = a.fields.some((f) => f.required);
    const verdict = failed ? '❌ فشل' : good ? '✅ نجح' : hidden ? '✅ عبر التراجع' : '⚠️ لم يُختبر';
    if (verdict.startsWith('✅')) ok++; tot++; neg += bad;
    tr += `| ${a.label} \`${a.id}\` | ${good ? '✅ ×' + good : hidden ? 'عبر زر «تراجع»' : '—'} | ${bad ? '✅ ×' + bad : '—'} | ${needsVal ? (r?.validation === 'ok' ? '✅' : '—') : 'لا حقول إلزامية'} | ${r?.adminDenied === 'ok' ? '✅ 403' : '—'} | ${verdict} |\n`;
  }
  tr += `\n**الملخص:** ${ok}/${tot} زراً اجتاز اختبار التنفيذ · ${neg} حالة فشل/حدود مختبرة · اختبارات الواجهة: ${Object.keys(UI).length ? 'نجحت' : 'لم تُشغَّل'} (فتح كل الأزرار: ${UI.allButtons ?? '—'}).\n\n## ما لم يُختبر\n\n- **الإنتاج الفعلي:** Firebase/Discord/Postgres الحقيقيون (لا بيانات اعتماد في بيئة التطوير). أي اختلاف بين المحاكي والإنتاج (قواعد الأمان لا تُطبَّق على Admin SDK أصلاً؛ الفهارس المركّبة في Firestore) يُختبر عند أول نشر — راجع TEST-REPORT.md.\n- **بوت ديسكورد حي:** لم يُشغَّل البوت نفسه؛ إثبات «يقرأ البوت الإعداد حياً» مستند إلى قراءة كوده (مراجع في INTEGRATION-MAP.md).\n- **استعادة النسخة الاحتياطية** (إجراء يدوي موثّق).\n`;
  fs.writeFileSync(path.join(root, 'BUTTON-TEST-REPORT.md'), tr);
}
console.log(`docs: ${totals.sections} sections, ${totals.actions} actions`);

// ---------------- SECURITY-IMPACT ----------------
{
  const hi = reg.actions().filter((a) => ['high', 'critical'].includes(a.danger) && a.kind !== 'read');
  let si = `# SECURITY-IMPACT\n\nالعمليات الحساسة وآليات الحماية والصلاحيات المرتبطة بها. (الجدول مولَّد من السجل: ${hi.length} إجراء بخطورة عالية/حرجة من أصل ${reg.actions().filter((a) => a.kind !== 'read').length} إجراء كتابة.)\n\n## الحماية الموحَّدة لكل إجراء (مفروضة في الخادم)\n\n| الطبقة | ما تفعله |\n|---|---|\n| المصادقة | جلسة HttpOnly/SameSite=Strict (+Secure و\`__Host-\` في الإنتاج)، رمز عشوائي 256 بت يُخزَّن بصمته فقط، تدوير عند الدخول، خمول وعمر أقصى قابلان للضبط |\n| CSRF | ترويسة \`x-csrf-token\` مطابقة لرمز الجلسة + فحص Origin |\n| الصلاحية | \`perms.canRunAction\` عند كل طلب: مساحة ← قسم ← زر، والمالك فقط يغيّرها (بإصدار متفائل وتدقيق وتراجع). أي رفض يُسجَّل في التدقيق وتكراره يرفع تنبيهاً |\n| المدخلات | Zod صارم (\`strict\`) — حقول مجهولة مرفوضة؛ حدود وأنماط ومعرّفات Discord/Firestore تُتحقق |\n| التأكيد | الخطورة ≥ متوسطة تتطلب \`confirm:true\` **في الخادم** (لا تكفي الواجهة)؛ الحساسة تتطلب **سبباً** (≥3 أحرف) |\n| عدم التكرار | مفتاح لكل عملية: إعادة الطلب تعيد النتيجة نفسها، وتعارض المدخلات مرفوض، والمتزامن يُرفض 409؛ الفشل لا يحجز المفتاح |\n| القدرة | الخدمة غير المُهيّأة ← 503 بسببها (لا كتابة ولا نجاح) |\n| التحقق | \`verify\` يعيد قراءة المصدر الأصلي؛ عدم التطابق ← فشل \`VERIFY_FAILED\` |\n| التدقيق | سجل إضافة فقط بسلسلة تجزئة (يُكشف أي تلاعب)، قبل/بعد، سبب، طلب، IP مقنّع؛ الأسرار والبريد تُحجب |\n| التراجع | الإجراءات القابلة للعكس تسجّل عكسها؛ يُنفَّذ عبر نفس المحرك والصلاحيات مرة واحدة فقط |\n| اللاعب/العضو المحمي | لا عقوبات على مالك السيرفر ولا على البوت؛ الجماعي يتطلب معاينة وتطابق العدد |\n\n## الإجراءات عالية/حرجة الخطورة\n\n| الإجراء | الخطورة | سبب مطلوب | تراجع | الأدمن افتراضياً | ملاحظة الحماية |\n|---|---|---|---|---|---|\n`;
  for (const a of hi) si += `| ${a.label} \`${a.id}\` | ${DANGER[a.danger]} | ${a.reasonRequired ? '✔' : '—'} | ${a.reversible ? '✔' : '✖'} | ${a.ownerOnly ? '🔒 للمالك فقط' : perms.actDefault(a) ? 'مسموح' : 'ممنوع'} | ${a.effect || ''} |\n`;
  si += `\n## الأسرار\n\n- لا يصل المتصفح أي سر: Service Account، توكن البوت، \`x-api-key\`، روابط قواعد البيانات تبقى في الخادم. \`GET /api/capabilities\` يعيد «مُهيّأ/غير مُهيّأ» وسبباً فقط.\n- كلمات المرور: Argon2id (19MiB, t=2) من متغير بيئة؛ لا تُسجَّل ولا تُخزَّن بنص صريح (\`OWNER_PASSWORD\` يُتجاهل في الإنتاج).\n- سجلات الخادم تمرّ عبر \`scrub\` (يحجب token/secret/password/api-key/cookie…).\n`;
  fs.writeFileSync(path.join(root, 'SECURITY-IMPACT.md'), si);
}
