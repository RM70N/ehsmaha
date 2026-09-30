'use strict';
// فحص الواجهة (index.html) بعد تنظيف حقل مفتاح EulerStream في فعالية 100، ومطابقة
// شكل user الذي يرسله الجسر مع extractUser(). لا يحتاج سيرفرات الجسر.
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/frontend-contract.test.js
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { serveSite } = require('./harness');

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };

(async () => {
  const site = await serveSite(8766);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(3000);

  const dom = await page.evaluate(() => ({
    apikeyField: !!document.getElementById('event100-reg-apikey'),
    userField: !!document.getElementById('event100-reg-user'),
    kwField: !!document.getElementById('event100-reg-kw'),
    // عناصر/دوال "apikey" القديمة لنافذة ربط البث — لازم تبقى كما هي
    modal: !!document.getElementById('tiktok-apikey-modal-overlay'),
    getKey: typeof getTikTokApiKey,
  }));
  check('#event100-reg-apikey removed', dom.apikeyField === false);
  check('event100 user/keyword fields still present', dom.userField && dom.kwField);
  check('tiktok-apikey-modal-overlay + getTikTokApiKey untouched', dom.modal && dom.getKey === 'function', dom);

  // تسجيل ستريمر بالفعالية بدون الحقل المحذوف — fb مستبدل بمسجّل كتابات (Firebase محجوب بالاختبار).
  const reg = await page.evaluate(async () => {
    const writes = [];
    fb = {
      db: {}, doc: (...p) => p.slice(1).join('/'), serverTimestamp: () => 'TS',
      setDoc: async (ref, data) => { writes.push({ ref, data }); },
    };
    event100StreamersCache = {};
    document.getElementById('event100-reg-user').value = '@Streamer_One';
    document.getElementById('event100-reg-kw').value = 'احمر';
    await event100RegisterStreamer();
    return { writes, status: document.getElementById('event100-reg-status').textContent };
  });
  const w = reg.writes[0];
  check('event100 registration works without API key field', !!w && w.ref === 'event100/current/streamers/streamer_one' && /تسجّلت بنجاح/.test(reg.status), reg.status);
  check('event100 registration no longer stores apiKey', !!w && !('apiKey' in w.data) && w.data.uniqueId === 'Streamer_One' && w.data.keyword === 'احمر', w && w.data);
  const empty = await page.evaluate(async () => {
    document.getElementById('event100-reg-user').value = '';
    await event100RegisterStreamer();
    return document.getElementById('event100-reg-status').textContent;
  });
  check('event100 still requires username + keyword', /لازم تعبّي كل الحقول/.test(empty));

  // شكل user كما يرسله tiktok-server (extractTikTokUser) ← extractUser بالواجهة
  const u = await page.evaluate(() => extractUser({
    type: 'WebcastChatMessage', comment: 'hi',
    user: { uniqueId: 'viewer_1', nickname: 'Viewer One', profilePictureUrl: 'https://p16.example.com/a.webp', avatar: 'https://p16.example.com/a.webp', avatarUrl: 'https://p16.example.com/a.webp', followRole: 1, isFollower: true, followKnown: true, followInfo: { followStatus: 1 } },
  }));
  check('extractUser reads bridge avatar/uniqueId/nickname/follow', u.avatar === 'https://p16.example.com/a.webp' && u.uniqueId === 'viewer_1' && u.nickname === 'Viewer One' && u.isFollower === true && u.followKnown === true, u);

  check('no JS page errors', errors.length === 0, errors.slice(0, 5));
  await browser.close();
  site.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(bad ? bad + ' FAILED / ' + results.length : 'ALL PASSED (' + results.length + ')');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
