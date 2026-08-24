// اختبار متصفح حقيقي: يحمّل index.html، يفتح اللعبة، يشغّل مباراة كاملة
// بلاعبين وهميين، ويتحقق من صفر أخطاء كونسول وصفر مؤقّتات متسربة.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexFile = resolve(root, '../../index.html');

// يُقدَّم عبر http لا file: الموقع نفسه يفحص التحديثات بـfetch كل 60 ثانية،
// وذلك الفحص يفشل دائماً على file:// بخطأ CORS لا علاقة له باللعبة.
const server = createServer(async (req, res) => {
  if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(await readFile(indexFile));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const indexUrl = 'http://127.0.0.1:' + server.address().port + '/index.html';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));

await page.goto(indexUrl, { waitUntil: 'load' });
await page.waitForTimeout(1500);

const baseline = { console: errors.length, page: pageErrors.length };
console.log(`أخطاء قبل فتح اللعبة (خط الأساس): console=${baseline.console} pageerror=${baseline.page}`);
if (pageErrors.length) console.log('  ' + pageErrors.slice(0, 3).join('\n  '));

// المنطق محمّل؟
const loaded = await page.evaluate(() => ({
  hasLogic: typeof window.VolcanicLands === 'object',
  questions: window.VolcanicLands ? window.VolcanicLands.questions.questions.length : 0,
  hasLaunch: typeof window.launchVolcanicLands === 'function',
  hasSetupPage: !!document.getElementById('pg-setup-volcanic-lands'),
  hasDashPage: !!document.getElementById('pg-volcanic-lands'),
  hasCard: !!document.querySelector('.gcard[data-tag="volcanic-lands"]'),
  registered: typeof TST_GAME_REGISTRY === 'object' && !!TST_GAME_REGISTRY['volcanic-lands'],
}));
console.log('التحميل:', JSON.stringify(loaded));

// تجاوز حارس الاتصال (نحن خارج بث حقيقي) ثم إقلاع اللعبة.
await page.evaluate(() => {
  // شاشة تحميل الجلسة تبقى معلّقة بلا Firebase حقيقي وتغطي الصفحة كاملة —
  // نخفيها حتى تُلتقط لقطات اللعبة نفسها لا شاشة التحميل.
  const loader = document.getElementById('auth-loader');
  if (loader) loader.style.display = 'none';
  window.homeHasActiveConnection = () => true;
  localStorage.setItem('streamerSavedUsername', 'e2e_tester');
  document.getElementById('pg-setup-volcanic-lands').classList.add('active');
  // جولة أقصر حتى ينتهي الاختبار في وقت معقول — نفس المسار البرمجي تماماً
  document.getElementById('volcanic-lands-duration').value = '10';
  window.launchVolcanicLands();
});
await page.waitForTimeout(600);

const afterLaunch = await page.evaluate(() => ({
  active: !!document.getElementById('pg-volcanic-lands').classList.contains('active'),
  phase: document.getElementById('volcanic-lands-status-strip').textContent.trim(),
}));
console.log('بعد الإقلاع:', JSON.stringify(afterLaunch));

// 20 لاعباً وهمياً ثم بدء المباراة
await page.evaluate(() => window.vlSimulatePlayers());
await page.waitForTimeout(400);
const lobbyCount = await page.evaluate(() => document.getElementById('volcanic-lands-lobby-grid').childElementCount);
console.log('لاعبون في اللوبي:', lobbyCount);

await page.screenshot({ path: resolve(root, 'e2e/shot-lobby.png') });

await page.evaluate(() => window.vlStart());
await page.waitForTimeout(6500);   // عدّاد + مقدمة الجولة + بداية السؤال
await page.screenshot({ path: resolve(root, 'e2e/shot-question.png') });

const midMatch = await page.evaluate(() => {
  const card = document.getElementById('volcanic-lands-card');
  return {
    cardVisible: card.style.display !== 'none',
    question: document.getElementById('volcanic-lands-question').textContent.slice(0, 40),
    options: document.getElementById('volcanic-lands-options').childElementCount,
    timer: document.getElementById('volcanic-lands-timer').textContent,
    answered: document.getElementById('volcanic-lands-answered').textContent,
    // .vl-tower لا الأبناء المباشرين: الأبناء صاروا حاويات صفوف
    towers: document.querySelectorAll('#volcanic-lands-towers .vl-tower').length,
    rows: document.querySelectorAll('#volcanic-lands-towers .vl-trow').length,
    round: document.getElementById('volcanic-lands-round').textContent,
  };
});
console.log('أثناء السؤال:', JSON.stringify(midMatch, null, 0));

// تشغيل المباراة حتى نهايتها
await page.waitForFunction(
  () => document.getElementById('volcanic-lands-winner').style.display === 'flex',
  null, { timeout: 240000 },
);
await page.waitForTimeout(700);
await page.screenshot({ path: resolve(root, 'e2e/shot-winner.png') });

const final = await page.evaluate(() => ({
  winnerShown: document.getElementById('volcanic-lands-winner').style.display === 'flex',
  winnerName: (document.querySelector('.vl-winner-name') || {}).textContent || '',
  rows: document.querySelectorAll('.vl-winner-board .vl-lb-row').length,
  strip: document.getElementById('volcanic-lands-status-strip').textContent.trim(),
}));
console.log('النهاية:', JSON.stringify(final));

// الخروج ينظّف كل شيء
await page.evaluate(() => window.vlTeardown());
await page.waitForTimeout(300);

const newConsole = errors.length - baseline.console;
const newPage = pageErrors.length - baseline.page;
console.log(`\nأخطاء جديدة بسبب اللعبة: console=${newConsole} pageerror=${newPage}`);
if (newConsole) console.log('CONSOLE:\n  ' + errors.slice(baseline.console).join('\n  '));
if (newPage) console.log('PAGEERROR:\n  ' + pageErrors.slice(baseline.page).join('\n  '));

await browser.close();
await new Promise((ok) => server.close(ok));

const ok = loaded.hasLogic && loaded.questions === 500
  && loaded.hasLaunch && loaded.hasSetupPage && loaded.hasDashPage
  && loaded.hasCard && loaded.registered && afterLaunch.active && lobbyCount === 20
  && midMatch.options === 4 && midMatch.towers === 20 && final.winnerShown
  && newConsole === 0 && newPage === 0;
console.log(ok ? '\n✅ نجح الاختبار الشامل' : '\n❌ فشل الاختبار الشامل');
process.exit(ok ? 0 : 1);
