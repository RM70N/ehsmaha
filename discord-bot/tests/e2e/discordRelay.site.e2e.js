'use strict';

// اختبار شامل بمتصفح حقيقي (Chromium): موقع احسمها (index.html كامل) + خادم
// البوت الحقيقي (web/server.js + services/discordRelay.js) بعميل ديسكورد وهمي.
// يربط روم ديسكورد من "ابدأ بثاً سريعاً"، ويشغّل كل لعبة، ويرسل رسائل من
// الروم (الكلمة المفتاحية + اللعب) ويتأكد إنها توصل اللعبة بالاسم والصورة.
//
// التشغيل (يحتاج Playwright + Chromium — مو ضمن npm test):
//   NODE_PATH=$(npm root -g) node tests/e2e/discordRelay.site.e2e.js

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { ChannelType } = require('discord.js');
const { chromium } = require('playwright');
const { createApp } = require('../../web/server');
const relay = require('../../services/discordRelay');

const ROOT = path.join(__dirname, '..', '..', '..');
const CH = '1400000000000000001';
const GUILD = '1400000000000000000';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// ---------------- عميل ديسكورد وهمي ----------------
function mockClient() {
  const guild = { id: GUILD, name: 'سيرفر احسمها', roles: { everyone: { id: GUILD } }, members: { me: { id: 'bot' } } };
  const allow = () => ({ has: () => true });
  const channels = new Map([
    [CH, { id: CH, name: 'العاب', type: ChannelType.GuildText, guild, permissionsFor: allow }],
    ['1400000000000000002', { id: '1400000000000000002', name: 'ادارة', type: ChannelType.GuildText, guild, permissionsFor: (r) => ({ has: () => r !== guild.roles.everyone }) }]
  ]);
  return { isReady: () => true, ws: { ping: 1 }, channels: { cache: channels } };
}

let msgSeq = 0;
const players = [
  { id: '1400000000000000101', username: 'ahmed', globalName: 'أحمد 🔥', nick: null },
  { id: '1400000000000000102', username: 'sara_99', globalName: null, nick: 'سارا' },
  { id: '1400000000000000103', username: 'khaled', globalName: 'Khaled K', nick: null },
  { id: '1400000000000000104', username: 'noura', globalName: 'نورة', nick: null }
];
const displayOf = (p) => p.nick || p.globalName || p.username;
function say(p, content) {
  const avatar = `https://cdn.discordapp.com/avatars/${p.id}/a.png?size=128`;
  return relay.handleMessage({
    id: String(++msgSeq),
    channelId: CH,
    content,
    cleanContent: content,
    author: { id: p.id, username: p.username, globalName: p.globalName, bot: false, displayAvatarURL: () => avatar },
    member: { displayName: displayOf(p), displayAvatarURL: () => avatar }
  });
}

// كل ألعاب الستريمر اللي فيها كلمة مفتاحية للانضمام:
//   fill = حقول الإعداد الإلزامية، joined = تعبير يرجّع معرّفات المنضمين من
//   بيانات اللعبة نفسها (نفس الـMap اللي يدخلها منضم تيك توك).
const KW = 'دخول';
const ids = (m) => `[...${m}.keys()]`;
const GAMES = [
  { name: 'خمّن الموضوع', setup: 'setup-guessword', fill: { 'gw-inp-kw': KW, 'gw-inp-word': 'تفاحة' }, btn: 'gw-btn-launch', play: 'guessword', joined: ids('gwParticipants') },
  { name: 'اوجد الكلمة', setup: 'setup', fill: { 'inp-kw': KW, 'inp-word': 'تفاحة' }, btn: 'btn-launch', play: 'dash', joined: ids('participants') },
  { name: 'القناص', setup: 'setup-sniper', fill: { 'sniper-kw': KW }, btn: 'btn-sniper-launch', play: 'sniper', joined: ids('sniperParticipants') },
  { name: 'الهز (hz)', setup: 'setup-hz', fill: { 'hz-kw': KW }, btn: 'btn-hz-launch', play: 'hz', joined: ids('hzParticipants') },
  { name: 'الروليت', setup: 'setup-roulette', fill: { 'rou-kw': KW }, btn: 'btn-rou-launch', play: 'roulette', joined: ids('rouParticipants') },
  { name: 'المؤقت', setup: 'setup-timer', fill: { 'tmr-kw': KW, 'tmr-secret': '5' }, btn: 'btn-tmr-launch', play: 'timer', joined: ids('tmrParticipants') },
  { name: 'القنبلة', setup: 'setup-bomb', fill: { 'bomb-kw': KW }, btn: 'btn-bomb-launch', play: 'bomb', joined: ids('bombParticipants') },
  { name: 'الصناديق', setup: 'setup-box', fill: { 'box-kw': KW }, btn: 'btn-box-launch', play: 'box', joined: ids('boxParticipants') },
  { name: 'cr', setup: 'setup-cr', fill: { 'cr-kw': KW }, btn: 'btn-cr-launch', play: 'cr', joined: ids('crParticipants') },
  { name: 'المتاهة', setup: 'setup-maze', fill: { 'mz-kw': KW }, btn: 'btn-mz-launch', play: 'maze', joined: ids('mzParticipants') },
  { name: 'ev', setup: 'setup-ev', fill: { 'ev-kw': KW }, btn: 'btn-ev-launch', play: 'ev', joined: ids('evParticipants') },
  { name: 'آخر حرف', setup: 'setup-lastletter', fill: { 'll-kw': KW, 'll-startword': 'قمر' }, btn: 'btn-ll-launch', play: 'lastletter', joined: ids('llParticipants') },
  { name: 'من أنا', setup: 'setup-whoami', fill: { 'wai-kw': KW, 'wai-charname': 'سوبرمان', 'wai-desc': 'بطل خارق' }, btn: 'btn-wai-launch', play: 'whoami', joined: ids('waiParticipants') },
  { name: 'ig', setup: 'setup-ig', fill: { 'ig-kw': KW }, btn: 'btn-ig-launch', play: 'ig', joined: ids('igParticipants') },
  { name: 'الكلمة المعكوسة', setup: 'setup-reverseword', fill: { 'rw-kw': KW, 'rw-word': 'سيارة' }, btn: 'btn-rw-launch', play: 'reverseword', joined: ids('rwParticipants') },
  { name: 'خمّن السعر', setup: 'setup-priceguess', fill: { 'pgs-kw': KW, 'pgs-product': 'جوال', 'pgs-price': '1500' }, btn: 'btn-pgs-launch', play: 'priceguess', joined: ids('pgsParticipants') },
  { name: 'الحروف المبعثرة', setup: 'setup-letterscramble', fill: { 'lsc-kw': KW, 'lsc-word': 'مدرسة' }, btn: 'btn-lsc-launch', play: 'letterscramble', joined: ids('lscParticipants') },
  { name: 'سباق الكلمات', setup: 'setup-wordrace', fill: { 'wr-kw': KW, 'wr-word': 'السلام عليكم' }, btn: 'btn-wr-launch', play: 'wordrace', joined: ids('wrParticipants') },
  { name: 'الدول', setup: 'setup-countrywar', fill: { 'cw-kw': KW }, btn: 'btn-cw-launch', play: 'countrywar', joined: ids('cwParticipants') },
  { name: 'سرقة التاج', setup: 'setup-crownsteal', fill: { 'cs-kw': KW }, btn: 'btn-cs-launch', play: 'crownsteal', joined: ids('csParticipants') },
  { name: 'الكراسي', setup: 'setup-chairs', fill: { 'chairs-kw': KW }, btn: 'btn-chairs-launch', play: 'chairs', joined: ids('chairsParticipants') },
  { name: 'وين الكورة', setup: 'setup-findball', fill: { 'findball-kw': KW }, btn: 'btn-findball-launch', play: 'findball', joined: ids('findballParticipants') },
  { name: 'شد الحبل', setup: 'setup-tug', fill: { 'tug-team-a-name': 'الأحمر', 'tug-team-b-name': 'الأزرق', 'tug-team-a-kw': KW, 'tug-team-b-kw': 'ازرق', 'tug-pull-kw': 'اسحب' }, btn: 'btn-tug-launch', play: 'tug', joined: '[...tugTeamA.keys(), ...tugTeamB.keys()]', secondKw: 'ازرق' },
  { name: 'إشارة حمراء', setup: 'setup-rlgl', fill: { 'rlgl-join-kw': KW }, btn: 'btn-rlgl-launch', play: 'rlgl', joined: ids('rlglParticipants') },
  { name: 'الأراضي البركانية', setup: 'setup-volcanic-lands', fill: { 'volcanic-lands-join-kw': KW }, btn: 'btn-volcanic-lands-launch', play: 'volcanic-lands', joinedByName: '[...document.querySelectorAll("#pg-volcanic-lands .vl-trow")].map((r) => r.innerText).join(" ")' },
  { name: 'الجسر الزجاجي (glz)', setup: 'setup-glz', fill: { 'glz-join-kw': KW }, btn: 'btn-glz-launch', play: 'glz', joined: ids('glzParticipants') }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 8000, step = 100) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return v;
    await sleep(step);
  }
}

async function main() {
  // خادم البوت الحقيقي (المسار /api/discord/relay/:channelId)
  const client = mockClient();
  const app = createApp({ client, config: { webhookAllowedOrigins: [], streamWebhookSecret: null, officialGuildId: null, relayMaxPerChannel: 10 } });
  const bot = http.createServer(app);
  await new Promise((r) => bot.listen(0, '127.0.0.1', r));
  const botUrl = `http://127.0.0.1:${bot.address().port}`;

  // الموقع: index.html نفسه، بس رابط خادم البوت يشير للخادم المحلي
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const marker = "const DISCORD_RELAY_SERVER_URL = 'https://ehsmaha-discord-bot.onrender.com';";
  assert.ok(html.includes(marker), 'رابط خادم البوت موجود بالموقع');
  const pageHtml = html.replace(marker, `const DISCORD_RELAY_SERVER_URL = '${botUrl}';`);
  const stub = fs.readFileSync(path.join(__dirname, 'firebaseStub.mjs'), 'utf8');
  const site = http.createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(pageHtml); }
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200); return res.end(fs.readFileSync(f)); }
    res.writeHead(404); return res.end();
  });
  await new Promise((r) => site.listen(0, '127.0.0.1', r));
  const siteUrl = `http://127.0.0.1:${site.address().port}/`;

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message)));
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(siteUrl) || u.startsWith(botUrl)) return route.continue();
    if (u.includes('gstatic.com/firebasejs/')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: stub });
    if (u.includes('cdn.discordapp.com')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    return route.abort();
  });

  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  };

  await page.goto(siteUrl, { waitUntil: 'domcontentloaded' });
  await waitFor(() => page.evaluate(() => typeof homeStartQuickConnect === 'function' && !!window.__fb), 15000);

  // ---- رفض روم خاص (ما ينربط) ----
  await page.evaluate(() => { homeOpenQuickConnect(); homeQcPickPlatform('discord'); document.getElementById('qc-main-input').value = '1400000000000000002'; homeStartQuickConnect(); });
  await sleep(800);
  const why = await page.evaluate(() => discordRelayLastError && discordRelayLastError.message);
  check('روم خاص يترفض وما يصير متصل (والسبب الحقيقي يطلع للستريمر)', !(await page.evaluate(() => homeHasActiveConnection())) && /خاص/.test(why || ''), why);

  // ---- ربط الروم العام من "ابدأ بثاً سريعاً" (رابط الروم بدل الرقم) ----
  await page.evaluate((ch) => { homeOpenQuickConnect(); homeQcPickPlatform('discord'); document.getElementById('qc-main-input').value = 'https://discord.com/channels/1400000000000000000/' + ch; homeStartQuickConnect(); }, CH);
  const connected = await waitFor(() => page.evaluate(() => platformConnectedList().includes('discord')), 8000);
  await sleep(300);
  check('ربط روم ديسكورد من "ابدأ بثاً سريعاً"', !!connected, 'الشارة: ' + (await page.evaluate(() => document.getElementById('home-conn-badge-text') && document.getElementById('home-conn-badge-text').textContent)));
  check('البوت يعرف إن الروم مربوط (حماية السبام تتوقف فيه)', relay.isLinked(CH));

  // ---- سيناريوهات اللعب: الستريمر يبدأ الراوند، ولاعبي ديسكورد يلعبون بالروم ----
  const ev = (e, a) => page.evaluate(e, a);
  const activeStatus = (v) => waitFor(() => ev((v) => eval(v), v).then((x) => x === 'active'), 8000);
  async function winnerFlow({ start, status, wrong, answerExpr, answer }) {
    await ev((f) => eval(f), start);
    if (!(await activeStatus(status))) return { ok: false, msg: 'الراوند ما بدأ: ' + (await ev((v) => eval(v), status)) };
    const correct = answerExpr ? await ev((e) => eval(e), answerExpr) : answer;
    say(players[0], wrong);            // إجابة غلط
    say(players[2], correct);          // مو مشارك (ما كتب الكلمة) — ما يفوز
    await sleep(300);
    say(players[1], correct);          // الإجابة الصح من لاعب ديسكورد
    const win = await waitFor(() => ev(() => { const a = document.querySelector('.page.active'); return a && /winner/.test(a.id) ? a.id + '|' + a.innerText : ''; }), 6000);
    const ok = !!win && win.includes(displayOf(players[1])) && !win.includes(displayOf(players[2]));
    return { ok, msg: win ? `الفائز: ${ok ? displayOf(players[1]) : '؟'} (${win.split('|')[0]})` : 'ما طلع فائز' };
  }
  const PLAY = {
    reverseword: () => winnerFlow({ start: 'startRWRound()', status: 'rwGameStatus', wrong: 'غلط', answerExpr: 'rwAnswer' }),
    letterscramble: () => winnerFlow({ start: 'startLSCRound()', status: 'lscGameStatus', wrong: 'غلط', answer: 'مدرسة' }),
    wordrace: () => winnerFlow({ start: 'startWRRound()', status: 'wrGameStatus', wrong: 'غلط', answer: 'السلام عليكم' }),
    whoami: () => winnerFlow({ start: 'startWAIRound()', status: 'waiGameStatus', wrong: 'باتمان', answer: 'سوبرمان' }),
    priceguess: () => winnerFlow({ start: 'startPGRound()', status: 'pgsGameStatus', wrong: '99', answer: '1500' }),
    dash: () => winnerFlow({ start: 'startRound()', status: 'gameStatus', wrong: 'موزتا', answer: 'تفاحة' }),
    guessword: () => winnerFlow({ start: 'gwStartRound()', status: 'gwGameStatus', wrong: 'موزة', answer: 'تفاحة' }),
    sniper: async () => {
      say(players[0], '5');
      say(players[1], '12');
      await sleep(400);
      const cells = await ev((ids) => ids.map((id) => (sniperParticipants.get(id) || {}).cell), ['discord:' + players[0].id, 'discord:' + players[1].id]);
      return { ok: cells[0] === 5 && cells[1] === 12, msg: `اختاروا المربعات ${cells.join(' و ')}` };
    },
    tug: async () => {
      await ev(() => startTugRound());
      if (!(await activeStatus('tugGameStatus'))) return { ok: false, msg: 'الراوند ما بدأ' };
      const before = await ev(() => [tugForceA, tugForceB]);
      say(players[0], 'اسحب'); // الفريق الأول
      say(players[1], 'اسحب'); // الفريق الثاني
      await sleep(400);
      const after = await ev(() => [tugForceA, tugForceB]);
      return { ok: after[0] > before[0] && after[1] > before[1], msg: `قوة السحب: ${before.map((x) => x.toFixed(1)).join('/')} → ${after.map((x) => x.toFixed(1)).join('/')}` };
    }
  };

  // ---- كل لعبة: انضمام بالكلمة المفتاحية ----
  for (const g of GAMES) {
    const started = await page.evaluate((g) => {
      try {
        show(g.setup);
        Object.entries(g.fill).forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.value = v; });
        const btn = document.getElementById(g.btn);
        if (!btn) return 'NO_BUTTON';
        btn.click();
        return 'clicked';
      } catch (e) { return 'ERR ' + e.message; }
    }, g);
    const onPlay = await waitFor(() => page.evaluate((p) => { const el = document.getElementById('pg-' + p); return !!(el && el.classList.contains('active')); }, g.play), 4000);
    if (!onPlay) {
      const status = await page.evaluate(() => { const a = document.querySelector('.page.active'); const s = a && a.querySelector('.status-msg'); return (a ? a.id : '?') + ' ' + (s ? s.textContent : ''); });
      check(`${g.name}: تشغيل اللعبة`, false, `${started} → ${status}`);
      continue;
    }
    // لاعب يكتب الكلمة، ولاعب يكتبها بتشكيل/مسافات (أو كلمة الفريق الثاني)،
    // ولاعب يكتب كلام عادي (يظهر بالشات بس ما يدخل)، ولاعب يكرر الكلمة مرتين
    say(players[0], KW);
    say(players[1], g.secondKw || '  دُخول ');
    say(players[2], 'مرحبا');
    say(players[3], KW);
    say(players[3], KW);
    await sleep(600);
    const want = [players[0], players[1], players[3]];
    let got;
    if (g.joinedByName) {
      const txt = await page.evaluate((e) => eval(e), g.joinedByName);
      got = players.filter((p) => txt.includes(displayOf(p))).map((p) => 'discord:' + p.id);
    } else {
      got = await page.evaluate((e) => eval(e), g.joined);
    }
    const okJoin = want.every((p) => got.includes('discord:' + p.id)) && !got.includes('discord:' + players[2].id);
    const dup = got.filter((x) => x === 'discord:' + players[3].id).length;
    const shown = await page.evaluate(({ p, names }) => { const t = document.getElementById('pg-' + p).innerText; return names.filter((n) => t.includes(n)).length; }, { p: g.play, names: want.map(displayOf) });
    const imgs = await page.evaluate((p) => [...document.querySelectorAll('#pg-' + p + ' img')].filter((i) => (i.getAttribute('src') || '').includes('cdn.discordapp.com')).length, g.play);
    check(`${g.name}: انضمام لاعبي ديسكورد`, okJoin && dup <= 1,
      `منضمين=${got.filter((x) => x.startsWith('discord:')).length}/3، الأسماء ظاهرة=${shown}/3، صور ديسكورد=${imgs}${got.includes('discord:' + players[2].id) ? '، ❗دخل واحد بدون الكلمة' : ''}`);

    // ---- اللعب نفسه من روم ديسكورد ----
    const pl = PLAY[g.play];
    if (pl) {
      try {
        const detail = await pl();
        check(`${g.name}: اللعب من ديسكورد`, !!detail.ok, detail.msg);
      } catch (e) {
        check(`${g.name}: اللعب من ديسكورد`, false, e.message);
      }
    }
  }

  // ---- البوت أعاد التشغيل (تحديث Render) ← الموقع يرجع يتصل تلقائياً ----
  relay.closeAll();
  const reconnected = await waitFor(() => relay.isLinked(CH), 12000, 200);
  await page.evaluate(() => show('setup-sniper'));
  await page.evaluate(() => { document.getElementById('sniper-kw').value = 'رجعنا'; document.getElementById('btn-sniper-launch').click(); });
  await sleep(500);
  say(players[0], 'رجعنا');
  await sleep(500);
  const back = await page.evaluate((id) => sniperParticipants.has(id), 'discord:' + players[0].id);
  check('انقطاع البوت (إعادة تشغيل) ← الموقع يرجع يتصل والرسائل توصل', !!reconnected && back);

  console.log('\nأخطاء الصفحة:', pageErrors.length ? [...new Set(pageErrors)].slice(0, 10) : 'ولا خطأ');
  const failed = results.filter((r) => !r.ok);
  console.log(`\nالنتيجة: ${results.length - failed.length}/${results.length} نجحت`);
  await browser.close();
  relay.closeAll();
  bot.close();
  site.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
