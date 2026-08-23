// فحص بصري سريع: يلتقط اللوبي والسؤال والكشف والبناء وصعود اللافا والتتويج،
// بلا انتظار مباراة كاملة. الهدف رؤية الشكل فعلياً لا التحقق المنطقي.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexFile = resolve(root, '../../index.html');

const server = createServer(async (req, res) => {
  if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(await readFile(indexFile));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const url = 'http://127.0.0.1:' + server.address().port + '/index.html';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1200);

await page.evaluate(() => {
  const loader = document.getElementById('auth-loader');
  if (loader) loader.style.display = 'none';
  window.homeHasActiveConnection = () => true;
  localStorage.setItem('streamerSavedUsername', 'visual_qa');
  document.getElementById('pg-setup-volcanic-lands').classList.add('active');
  document.getElementById('volcanic-lands-duration').value = '10';
  window.launchVolcanicLands();
});
await page.waitForTimeout(500);
await page.evaluate(() => window.vlSimulatePlayers());
await page.waitForTimeout(900);
await page.screenshot({ path: resolve(root, 'e2e/v1-lobby.png') });
console.log('1 لوبي ✓');

await page.evaluate(() => window.vlStart());
await page.waitForFunction(() => document.getElementById('volcanic-lands-card').style.display !== 'none',
  null, { timeout: 20000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: resolve(root, 'e2e/v2-question.png') });
console.log('2 سؤال ✓');

// الكشف
await page.waitForFunction(() => document.querySelector('.vl-option.vl-right') !== null,
  null, { timeout: 30000 });
await page.waitForTimeout(900);
await page.screenshot({ path: resolve(root, 'e2e/v3-reveal.png') });
console.log('3 كشف ✓');

// البناء وصعود اللافا
await page.waitForFunction(() => {
  const s = document.getElementById('volcanic-lands-status-strip').textContent;
  return s.indexOf('اللافا تصعد') > -1;
}, null, { timeout: 30000 });
await page.waitForTimeout(1400);
await page.screenshot({ path: resolve(root, 'e2e/v4-lava.png') });
console.log('4 لافا ✓');

// شاشة التتويج
await page.waitForFunction(() => document.getElementById('volcanic-lands-winner').style.display === 'flex',
  null, { timeout: 240000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: resolve(root, 'e2e/v5-winner.png') });
console.log('5 تتويج ✓');

await browser.close();
await new Promise((ok) => server.close(ok));
