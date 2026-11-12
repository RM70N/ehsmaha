// اختبارات الواجهة (Playwright على Chromium): RTL، جوال/تابلت/كمبيوتر، التنقل، النوافذ، حالات الخطأ، وفتح كل زر من أزرار اللوحة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { startEnv, emulatorUp } from '../helpers/env.js';
import { clearOverviewCache } from '../../server/services/overview.js';
import { resetEmulators, seedSite, seedEvent } from '../helpers/seed.js';

let chromium; try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { try { chromium = createRequire('/opt/node-tools/')('playwright').chromium; } catch { /* */ } }
const up = (await emulatorUp()) && !!chromium;
const T = (n, f) => test(n, { skip: !up && 'يتطلب محاكيات Firebase + Playwright' }, f);
let env, browser; const uiResults = {};
const VP = { desktop: { width: 1366, height: 820 }, tablet: { width: 820, height: 1100 }, mobile: { width: 390, height: 800 } };

test.before(async () => { if (!up) return; await resetEmulators(); env = await startEnv(); await seedSite(env.svc.fb); await seedEvent(env.svc.fb); await env.svc.health.runAll(); browser = await chromium.launch(); });
test.after(async () => { if (!up) return; fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/ui-results.json', JSON.stringify(uiResults, null, 1)); await browser?.close(); await env?.close(); });

async function open(vp, account) {
  const ctx = await browser.newContext({ viewport: VP[vp], locale: 'ar-SA' }); const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto(env.base + '/'); await page.waitForSelector('.portal-gate');
  if (account) { await page.click(`[data-a=${account}]`); await page.fill('#pw', account === 'owner' ? 'test-owner-pass-1' : 'test-admin-pass-1'); await page.click('#lb'); await page.waitForSelector('#shell', { timeout: 15000 }); }
  return { ctx, page, errs };
}

T('الواجهة RTL كاملة وبلا أنماط/سكربتات مضمّنة وبلا أخطاء كونسول', async () => {
  const { ctx, page, errs } = await open('desktop', 'owner');
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl'); assert.equal(await page.evaluate(() => document.documentElement.lang), 'ar');
  await page.goto(env.base + '/#/overview'); await page.waitForSelector('.ro, .hero'); await page.waitForTimeout(1500);
  assert.deepEqual(errs.filter((e) => !/favicon/.test(e)), [], 'لا أخطاء كونسول'); await ctx.close(); uiResults.rtl = 'ok';
});

for (const vp of ['desktop', 'tablet', 'mobile']) {
  T(`تسجيل الدخول والتنقل والقائمة على ${vp} بلا تمرير أفقي`, async () => {
    const { ctx, page } = await open(vp, 'owner');
    const over = async () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert.equal(await over(), false, 'overview'); assert.match(page.url(), /#\/overview/);
    for (const h of ['#/overview', '#/s/players/search', '#/s/commands/registry', '#/s/access/matrix', '#/s/audit/log']) { await page.goto(env.base + '/' + h); await page.waitForSelector('#view .scene, #view .hero, #view .st-in', { timeout: 10000 }); await page.waitForTimeout(500); assert.equal(await over(), false, h + ' على ' + vp); }
    if (vp === 'mobile') { const vis = async () => page.locator('#side').evaluate((el) => { const r = el.getBoundingClientRect(); return r.left < innerWidth && r.right > 0; }); assert.equal(await vis(), false); await page.click('#mb'); await page.waitForTimeout(450); assert.equal(await vis(), true); }
    await ctx.close(); uiResults['nav-' + vp] = 'ok';
  });
}

T('تسجيل الخروج يُنهي الجلسة ويعيد البوابة', async () => {
  const { ctx, page } = await open('desktop', 'owner');
  await page.click('#lo'); await page.waitForSelector('.portal-gate'); const me = await page.evaluate(() => fetch('/api/me').then((r) => r.status)); assert.equal(me, 401); await ctx.close();
});

T('كلمة مرور خاطئة تظهر رسالة عامة ولا تكشف الحساب', async () => {
  const { ctx, page } = await open('desktop'); await page.click('[data-a=owner]'); await page.fill('#pw', 'wrong-pass'); await page.click('#lb'); await page.waitForSelector('#le:not(.hidden)');
  assert.match(await page.textContent('#le'), /بيانات الدخول غير صحيحة/); assert.equal(await page.inputValue('#pw'), 'wrong-pass'); await ctx.close();
});

T('الأدمن لا يرى قسم الصلاحيات ولا بطاقة ديسكورد حين يخفيها المالك (واجهة + خادم)', async () => {
  const { ctx, page } = await open('desktop', 'admin');
  await page.goto(env.base + '/#/s/access/matrix'); await page.waitForFunction(() => /غير متاح/.test(document.querySelector('#view')?.textContent || '')); assert.equal(await page.locator('.nav-item[href="#/s/access"]').count(), 0);
  const r = await page.evaluate(() => fetch('/api/access/matrix').then((x) => x.status)); assert.equal(r, 403);
  await ctx.close();
});

const submit = (page) => page.click('.sheet-f button[type=submit]');
T('تدفق إجراء كامل من الواجهة: نموذج ← تأكيد ← تنفيذ ← تحقق من Firebase ← تراجع', async () => {
  const { ctx, page } = await open('desktop', 'owner'); const auth = env.svc.fb.auth();
  await page.goto(env.base + '/#/s/players/actions'); await page.waitForSelector('.op');
  await page.click('.op:has-text("حظر لاعب نهائياً")'); await page.waitForSelector('.sheet');
  await page.fill('#f-username', 'ghost_nobody'); await page.fill('#f-_reason', 'اختبار');
  await submit(page); await page.waitForSelector('.confirm:not(.hidden)'); await submit(page);
  await page.waitForSelector('.result.fail'); assert.match(await page.textContent('.result.fail'), /لا يوجد لاعب/); assert.equal((await auth.getUser('p-khalid')).disabled, false);
  await page.fill('#f-username', 'khalid'); await submit(page); await page.waitForSelector('.confirm:not(.hidden)'); await submit(page); await page.waitForSelector('.result.ok', { timeout: 15000 });
  assert.equal((await auth.getUser('p-khalid')).disabled, true, 'الحظر نُفِّذ فعلاً في Firebase');
  assert.match(await page.textContent('.result.ok'), /نُفِّذت وتم التحقق/);
  await page.click('.sheet-f button:has-text("تراجع عن العملية")'); await page.getByRole('button', { name: 'تراجع', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.sheet')); 
  assert.equal((await auth.getUser('p-khalid')).disabled, false, 'التراجع أعاد تفعيل الحساب'); await ctx.close(); uiResults.flow = 'ok';
});

T('منع الضغط المتكرر: زر التنفيذ يُعطَّل أثناء العملية وتصل طلبية واحدة للخادم', async () => {
  const { ctx, page } = await open('desktop', 'owner'); let hits = 0;
  await page.route('**/api/actions/messages/save/run', async (route) => { hits++; await new Promise((r) => setTimeout(r, 900)); route.continue(); });
  await page.goto(env.base + '/#/s/messages/actions'); await page.waitForSelector('.op'); await page.click('.op:has-text("حفظ إعلان في المكتبة")'); await page.waitForSelector('.sheet');
  await page.fill('#f-title', 'عنوان'); await page.fill('#f-text', 'نص الاختبار');
  await page.evaluate(() => { const b = document.querySelector('.sheet-f button[type=submit]'); b.click(); b.click(); b.click(); });
  assert.equal(await page.locator('.sheet-f button[type=submit]').isDisabled(), true, 'الزر معطّل أثناء التنفيذ');
  await page.waitForSelector('.result.ok'); assert.equal(hits, 1, 'طلب واحد فقط'); assert.equal(env.svc.store.col('savedAnnouncements').count(), 1); await ctx.close();
});

T('نافذة بتغييرات غير محفوظة تطلب تأكيد الإغلاق', async () => {
  const { ctx, page } = await open('desktop', 'owner'); await page.goto(env.base + '/#/s/players/actions'); await page.waitForSelector('.op'); await page.waitForTimeout(700);
  await page.click('.op:has-text("إضافة ملاحظة إدارية")'); await page.waitForSelector('.sheet'); await page.fill('#f-note', 'نص لم يُحفظ');
  await page.keyboard.press('Escape'); await page.waitForFunction(() => /تغييرات غير محفوظة/.test(document.body.textContent));
  assert.ok(await page.locator('.sheet').count() >= 1, 'النافذة ما زالت مفتوحة'); await ctx.close();
});

T('حالات الخطأ والتحميل: مصدر غير متاح يظهر بسببه (لا أرقام قديمة)', async () => {
  const { ctx, page } = await open('desktop', 'owner'); const real = env.svc.fb.rawDb; clearOverviewCache();
  env.svc.fb.rawDb = () => { const e = new Error('14 UNAVAILABLE'); e.code = 14; throw e; };
  try { await page.goto(env.base + '/#/s/players/search'); await page.waitForSelector('.state.err'); assert.match(await page.textContent('.state.err'), /\S/);
    await page.goto(env.base + '/#/overview'); await page.reload(); await page.waitForFunction(() => document.querySelectorAll('.ro.na').length >= 3, null, { timeout: 15000 }); } finally { env.svc.fb.rawDb = real; }
  await ctx.close();
});

T('بحث شامل: نتائج حقيقية مقسّمة بالنوع وروابط للأقسام', async () => {
  const { ctx, page } = await open('desktop', 'owner'); await page.goto(env.base + '/#/s/players/search'); await page.waitForSelector('#gq'); await page.fill('#gq', 'ahmed'); await page.press('#gq', 'Enter'); await page.waitForSelector('.sr-it');
  const txt = await page.textContent('#sr'); assert.match(txt, /ahmed_1/); assert.match(txt, /عضو ديسكورد/); await page.click('.sr-it:has-text("ahmed_1")'); await page.waitForFunction(() => /players\/search/.test(location.hash));  await ctx.close();
});

T('كل زر في كل قسم: يظهر في قسمه ويفتح نافذته بلا أخطاء (المالك) — ويطابق عدد السجل', async () => {
  const { ctx, page, errs } = await open('desktop', 'owner'); const reg = env.svc.registry; let total = 0;
  for (const sec of reg.sections()) {
    const expected = reg.actionsOf(sec.id).filter((a) => !a.hidden); if (!expected.length) continue;
    await page.goto(env.base + `/#/s/${sec.id}/actions`); await page.waitForSelector('.op', { timeout: 10000 }); await page.waitForTimeout(700);
    const shown = await page.$$eval('.op', (els) => els.map((e) => e.querySelector('b').textContent)); assert.equal(shown.length, expected.length, `${sec.id}: ${shown.length}/${expected.length}`);
    for (const a of expected) { assert.ok(shown.includes(a.label), `${sec.id}: زر «${a.label}» مفقود`); total++; }
    for (let i = 0; i < shown.length; i++) { const b = page.locator('.op').nth(i); if (await b.isDisabled()) continue; await b.click(); await page.waitForSelector('.sheet'); assert.ok((await page.textContent('.sheet .sheet-h h3')).length > 2); await page.keyboard.press('Escape'); await page.waitForTimeout(40); if (await page.locator('.sheet').count()) { page.once('dialog', (d) => d.accept()); await page.keyboard.press('Escape'); } }
  }
  assert.equal(total, reg.actions().filter((a) => !a.hidden).length); assert.deepEqual(errs.filter((e) => !/favicon|401|403|404|409|422|50\d/.test(e)), []); uiResults.allButtons = total; await ctx.close();
});

T('الأدمن على الجوال: يرى أزراره المسموحة فقط ولا شيء من المحظور', async () => {
  const { ctx, page } = await open('mobile', 'admin'); await page.goto(env.base + '/#/s/players/actions'); await page.waitForSelector('.op'); await page.waitForTimeout(800);
  const labels = await page.$$eval('.op b', (e) => e.map((x) => x.textContent)); assert.ok(labels.includes('إضافة ملاحظة إدارية')); assert.ok(!labels.includes('حظر لاعب نهائياً') && !labels.includes('تصفير خبرة لاعب'));
  await ctx.close();
});
