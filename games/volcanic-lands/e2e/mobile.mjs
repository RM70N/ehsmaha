// فحص الجوال والتوسّع والإنعاش بالهدايا.
import { chromium, devices } from 'playwright';
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

async function boot(page, players, revive) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1100);
  await page.evaluate((rev) => {
    const l = document.getElementById('auth-loader'); if (l) l.style.display = 'none';
    window.homeHasActiveConnection = () => true;
    localStorage.setItem('streamerSavedUsername', 'qa');
    document.getElementById('pg-setup-volcanic-lands').classList.add('active');
    document.getElementById('volcanic-lands-duration').value = '10';
    document.getElementById('volcanic-lands-opt-revive').checked = rev;
    window.launchVolcanicLands();
  }, revive);
  await page.waitForTimeout(350);
  await page.evaluate((n) => {
    const kw = 'بركان';
    for (let i = 0; i < n; i++) {
      window.VolcanicLands && null;
      document.dispatchEvent(new Event('x'));
    }
    window.vlSimulatePlayers();
  }, players);
  await page.waitForTimeout(700);
}

/** هل يخرج أي شيء خارج حدود الصفحة أفقياً؟ */
const overflowProbe = () => ({
  docW: document.documentElement.clientWidth,
  scrollW: document.documentElement.scrollWidth,
  bodyScrollW: document.body.scrollWidth,
});

// ============ ١) الجوال ============
const phone = await browser.newContext({ ...devices['Pixel 7'] });
const mp = await phone.newPage();
const mErrs = []; mp.on('pageerror', (e) => mErrs.push(String(e.message)));
await boot(mp, 20, true);
await mp.screenshot({ path: resolve(root, 'e2e/m1-lobby.png') });

const mLobby = await mp.evaluate(() => {
  const kw = document.querySelector('#pg-volcanic-lands .vl-lobby-kw').getBoundingClientRect();
  const hud = document.querySelector('#pg-volcanic-lands .vl-hud').getBoundingClientRect();
  return {
    // تداخل رأسي بين الشريط العلوي وصندوق كلمة الانضمام؟
    overlap: Math.max(0, Math.round(hud.bottom - kw.top)),
    lobbyAvatars: document.querySelectorAll('#volcanic-lands-lobby-grid .vl-avatar, #volcanic-lands-lobby-grid img').length,
    ...(() => { const d = document.documentElement; return { docW: d.clientWidth, scrollW: d.scrollWidth }; })(),
  };
});
console.log('جوال · اللوبي:', JSON.stringify(mLobby));

await mp.evaluate(() => window.vlStart());
await mp.waitForFunction(() => document.getElementById('volcanic-lands-card').style.display !== 'none', null, { timeout: 25000 });
await mp.waitForTimeout(2500);
await mp.screenshot({ path: resolve(root, 'e2e/m2-question.png') });
const mQ = await mp.evaluate(() => {
  const st = document.getElementById('volcanic-lands-stage').getBoundingClientRect();
  const towers = Array.from(document.querySelectorAll('#volcanic-lands-towers .vl-tower'));
  const outside = towers.filter((t) => { const r = t.getBoundingClientRect(); return r.left < st.left - 2 || r.right > st.right + 2; }).length;
  return {
    towers: towers.length,
    outsideStage: outside,
    towerW: getComputedStyle(document.getElementById('volcanic-lands-towers')).getPropertyValue('--vl-tower-w').trim(),
    ...(() => { const d = document.documentElement; return { docW: d.clientWidth, scrollW: d.scrollWidth }; })(),
  };
});
console.log('جوال · السؤال:', JSON.stringify(mQ));
console.log('جوال · أخطاء:', mErrs.length, mErrs.slice(0, 2).join(' | '));

// ============ ٢) سطح المكتب: 60 لاعباً + إغلاق الشات ============
const desk = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const dp = await desk.newPage();
const dErrs = []; dp.on('pageerror', (e) => dErrs.push(String(e.message)));
await boot(dp, 20, true);
// نرفع العدد لـ60 عبر نفس مسار الشات
await dp.evaluate(() => {
  for (let i = 20; i < 60; i++) {
    window.vlHandleEvent({ messages: [{ type: 'chat', comment: 'بركان',
      user: { uniqueId: 'big_' + i, nickname: 'لاعب' + i, profilePictureUrl: '' } }] });
  }
});
await dp.waitForTimeout(500);
const wideBefore = await dp.evaluate(() => ({
  players: document.querySelectorAll('#volcanic-lands-lobby-grid > *').length,
  stageW: Math.round(document.getElementById('volcanic-lands-stage').clientWidth),
}));
await dp.evaluate(() => window.vlStart());
await dp.waitForFunction(() => document.getElementById('volcanic-lands-towers').childElementCount > 0, null, { timeout: 25000 });
await dp.waitForTimeout(1200);
const before = await dp.evaluate(() => ({
  stageW: Math.round(document.getElementById('volcanic-lands-stage').clientWidth),
  towerW: getComputedStyle(document.getElementById('volcanic-lands-towers')).getPropertyValue('--vl-tower-w').trim(),
  towers: document.querySelectorAll('#volcanic-lands-towers .vl-tower').length,
}));
// إغلاق الشات
await dp.evaluate(() => {
  const btn = document.querySelector('#pg-volcanic-lands .chat-toggle-btn');
  if (btn) btn.click();
});
await dp.waitForTimeout(900);
const after = await dp.evaluate(() => ({
  stageW: Math.round(document.getElementById('volcanic-lands-stage').clientWidth),
  towerW: getComputedStyle(document.getElementById('volcanic-lands-towers')).getPropertyValue('--vl-tower-w').trim(),
  collapsed: document.querySelector('#pg-volcanic-lands .vl-layout').classList.contains('chat-collapsed'),
}));
console.log('60 لاعباً · قبل إغلاق الشات:', JSON.stringify(before));
console.log('60 لاعباً · بعد إغلاق الشات:', JSON.stringify(after));
await dp.screenshot({ path: resolve(root, 'e2e/d1-60players.png') });

// ============ ٣) الإنعاش بالهدية ============
await dp.waitForFunction(() => document.querySelectorAll('#volcanic-lands-towers .vl-tower').length > 0
  && window.__vlDead === undefined, null, { timeout: 5000 }).catch(() => {});
await dp.waitForFunction(() => {
  const s = document.getElementById('volcanic-lands-status-strip').textContent;
  return s.indexOf('الاحتراق') > -1 || s.indexOf('انتهت') > -1;
}, null, { timeout: 120000 });
await dp.waitForTimeout(600);
const rev = await dp.evaluate(() => {
  const alive1 = document.getElementById('volcanic-lands-alive').textContent;
  window.vlSimulateGift();
  return { aliveBefore: alive1 };
});
await dp.waitForTimeout(500);
const revAfter = await dp.evaluate(() => ({ aliveAfter: document.getElementById('volcanic-lands-alive').textContent }));
console.log('الإنعاش بالهدية:', JSON.stringify({ ...rev, ...revAfter }));
await dp.screenshot({ path: resolve(root, 'e2e/d2-revive.png') });
console.log('سطح المكتب · أخطاء:', dErrs.length, dErrs.slice(0, 2).join(' | '));

await browser.close();
await new Promise((ok) => server.close(ok));
