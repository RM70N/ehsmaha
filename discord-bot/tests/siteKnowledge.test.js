'use strict';

// معرفة الموقع الحية: سحب الصفحات، تتبّع التغييرات (ETag)، سجل التحديثات، والاسترجاع للبرومبت — بخادم محلي بدل الموقع الحقيقي.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'siteknow-'));
Object.assign(process.env, { LOG_LEVEL: 'error', SITE_KNOWLEDGE: 'on', SITE_KNOWLEDGE_DIR: tmp, SITE_KNOWLEDGE_POLL_MINUTES: '5' });

const sk = require('../services/siteKnowledge');

let server;
let pages;
let hits;
let rtdb;
let badges;
let broadcast;
let appJs;
const etagOf = (s) => `"${Buffer.from(s).length}-${s.length}-${[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1000003, 7)}"`;

const HOME = `<!doctype html><html><head><title>احسمها | ألعاب تفاعلية للبث</title>
<meta name="description" content="منصة عربية مجانية لألعاب البث التفاعلية على تيك توك وتويتش"></head><body>
<h1>العب مع متابعينك مباشرة</h1><button>ابدأ بثاً سريعاً</button>
<a href="/roulette3d.html">روليت</a><script src="/app.js"></script>
<div class="gcard" data-tag="bomb" data-category="luck"><span class="gcard-num">١</span><div class="gcard-name">القنبلة المتحركة</div><div class="gcard-desc">القنبلة عند متابع عشوائي ويمررها بالشات حتى تنفجر</div><div class="gcard-tags"></div></div>
<div class="gcard" data-tag="wheel" data-category="luck"><span class="gcard-num">٢</span><div class="gcard-name">عجلة الحظ</div><div class="gcard-desc">عجلة تدور وتختار فائزاً من المتابعين المشاركين</div><div class="gcard-tags"></div></div><a href="/preview-x.html">x</a>
<script>const FAQ=[{q:'هل احسمها مجانية؟',a:'نعم، التسجيل واللعب على احسمها مجاني بالكامل بحساب جوجل أو البريد'}];
const x={game:'لعبة القنبلة المتحركة: القنبلة عند متابع عشوائي ويمرّرها بالشات'};</script></body></html>`;
const ROULETTE = `<html><head><title>الروليت الروسي — احسمها</title></head><body><p>روليت الإقصاء: كل جولة يطلق أحدهم النار على متابع والخاسر يخرج من اللعبة</p></body></html>`;

test.before(async () => {
  server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/app.js') {
      res.writeHead(200, { 'content-type': 'text/javascript', etag: etagOf(appJs), 'content-length': String(appJs.length) });
      return res.end(req.method === 'HEAD' ? undefined : appJs);
    }
    if (url === '/rtdb/gameBadges.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(badges));
    }
    if (url === '/rtdb/broadcastMessages/current.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(broadcast));
    }
    if (url === '/rtdb/siteUpdates.json') {
      if (rtdb === null) {
        res.writeHead(500);
        return res.end('x');
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(rtdb));
    }
    const body = pages[url];
    hits.push(url + (req.headers['if-none-match'] ? ' (cond)' : ''));
    if (body === undefined) {
      res.writeHead(404);
      return res.end('nf');
    }
    const etag = etagOf(body);
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { etag });
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', etag });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.SITE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.SITE_RTDB_URL = `${process.env.SITE_URL}/rtdb`;
  delete process.env.SITE_UPDATES_URL;
});
test.beforeEach(() => {
  pages = { '/': HOME, '/roulette3d.html': ROULETTE };
  rtdb = {};
  badges = { bomb: { badge: 'none' }, wheel: { badge: 'none' } };
  broadcast = { text: 'قسم جديد بأسم جمعتنا ألعاب 3D جديدة للستريمر', sentAt: { __ts: Date.UTC(2026, 10, 10) } };
  appJs = 'console.log(1);';
  hits = [];
  sk._reset();
  fs.rmSync(path.join(tmp, 'site-knowledge.json'), { force: true });
});
test.after(async () => {
  sk._reset();
  await new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('استخراج: العناوين والأوصاف ونصوص الواجهة داخل السكربتات، بدون كود ولا CSS', () => {
  const { items } = sk.extractChunks(HOME);
  const all = items.join('\n');
  for (const need of ['احسمها | ألعاب تفاعلية للبث', 'منصة عربية مجانية لألعاب البث', 'العب مع متابعينك مباشرة', 'ابدأ بثاً سريعاً', 'نعم، التسجيل واللعب على احسمها مجاني', 'لعبة القنبلة المتحركة']) {
    assert.ok(all.includes(need), need);
  }
  assert.ok(!/const |function|=>/.test(all));
  assert.deepEqual(sk.discoverPages('http://x', HOME), ['http://x/', 'http://x/roulette3d.html'], 'يكتشف صفحات الموقع ويتجاهل preview/index');
});

test('سحب أول مرة: يفهرس كل الصفحات المكتشفة، ويجاوب البحث من نصوصها', async () => {
  const r = await sk.crawl();
  assert.equal(r.pages, 2);
  assert.ok(sk.status().chunks >= 2);
  const hit = sk.search('هل احسمها مجانية؟');
  assert.ok(hit.some((h) => /مجاني بالكامل/.test(h.text)), 'جواب السؤال ضمن النتائج');
  const game = sk.search('كيف تشتغل لعبة الروليت');
  assert.match(game[0].text, /روليت الإقصاء/);
  assert.equal(game[0].url.endsWith('/roulette3d.html'), true);
  assert.deepEqual(sk.search('كلمات غير موجودة اطلاقا زززز'), []);
});

test('المتابعة: بدون تغيير = طلبات شرطية 304 فقط وبدون سجل تحديث؛ تغيّر الصفحة = يلتقط الجديد فوراً ويسجّله', async () => {
  await sk.crawl();
  hits = [];
  const same = await sk.crawl();
  assert.equal(same.changed, 0);
  assert.ok(hits.every((h) => h.includes('(cond)')), `كل الطلبات شرطية: ${hits.join(' | ')}`);
  assert.equal(sk.status().updates, 0);

  // تحديث نزل بالموقع: لعبة جديدة + صفحة جديدة
  pages['/'] = HOME.replace('</body>', '<p>لعبة جديدة: سباق الصحراء — تتسابق فيها مع متابعيك بكتابة الكلمات بسرعة وأسرع واحد يفوز</p></body>').replace('<a href="/roulette3d.html">', '<a href="/roulette3d.html"></a><a href="/desert.html">');
  pages['/desert.html'] = '<html><head><title>سباق الصحراء</title></head><body><p>أسرع من يكتب الكلمة الصحيحة يتقدم بسيارته نحو خط النهاية</p></body></html>';
  const r = await sk.crawl();
  assert.ok(r.changed >= 2);
  const hit = sk.search('وش هي لعبة سباق الصحراء');
  assert.match(hit[0].text, /سباق الصحراء/);
  const up = sk._internal.state.updates[0];
  assert.ok(up.addedCount >= 2);
  assert.ok(up.newPages.includes('desert.html'));
  assert.ok(up.added.some((t) => t.includes('سباق الصحراء')));
});

test('promptFor: مقتطفات الموقع الحالية للسؤال، وآخر التحديثات لسؤال "وش الجديد"، وفاضي لو ما فيه شي مناسب', async () => {
  await sk.crawl();
  const q = await sk.promptFor('هل احسمها مجانية؟');
  assert.match(q, /معلومات محدّثة من الموقع الحي/);
  assert.match(q, /مجاني بالكامل/);
  assert.doesNotMatch(q, /تغييرات رصدها البوت|إعلان رسمي/, 'ما نذكر التحديثات لسؤال عادي');
  pages['/'] = HOME.replace('</body>', '<p>ميزة جديدة: لوحة متصدرين أسبوعية تتحدث كل يوم جمعة وتوزع جوائز</p></body>');
  await sk.crawl();
  const news = await sk.promptFor('وش الجديد بالموقع؟');
  assert.match(news, /تغييرات رصدها البوت/);
  assert.match(news, /لوحة متصدرين أسبوعية/);
  assert.equal(await sk.promptFor('زززز ككككك'), '');
});

test('ملخص التحديث بـGemini (لو متاح) يدخل السجل، وفشله ما يكسر شي', async () => {
  const asked = [];
  await sk.init({ gemini: { generate: async (req) => (asked.push(req), { ok: true, text: '• نزلت لعبة جديدة اسمها سباق الصحراء' }) } });
  await sk.crawl();
  pages['/'] = HOME.replace('</body>', '<p>لعبة سباق الصحراء الجديدة</p><p>أضفنا وضع الفرق للألعاب الجماعية</p><p>تم تحسين سرعة تحميل الصفحة الرئيسية</p></body>');
  await sk.crawl();
  assert.equal(sk._internal.state.updates[0].summary, '• نزلت لعبة جديدة اسمها سباق الصحراء');
  assert.match(asked[0].messages[0].text, /سباق الصحراء/);
  assert.match(await sk.promptFor('ايش الجديد'), /نزلت لعبة جديدة اسمها سباق الصحراء/);
  sk.stop();
});

test('اللقطة على القرص: بعد إعادة التشغيل يقارن بها ويكتشف تحديثاً نزل والبوت مطفي؛ والموقع واقع ما يمسح المعرفة', async () => {
  await sk.crawl();
  assert.ok(fs.existsSync(path.join(tmp, 'site-knowledge.json')));
  sk._reset();
  pages['/roulette3d.html'] = ROULETTE.replace('</p>', '</p><p>وضع جديد: الجولة المزدوجة تضاعف النقاط لمن يصمد حتى النهاية</p>');
  await sk.init({});
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(sk.status().pages >= 2);
  await sk.crawl();
  assert.match(JSON.stringify(sk._internal.state.updates[0].added), /الجولة المزدوجة/);
  sk.stop();

  // الموقع واقع (500): المعرفة القديمة تبقى
  const before = sk.status().chunks;
  pages = {};
  const r = await sk.crawl();
  assert.equal(r.changed, 0);
  assert.equal(sk.status().chunks, before);
});

test('الميزة متوقفة: ما يسحب ولا يضيف شي للبرومبت', async () => {
  process.env.SITE_KNOWLEDGE = 'off';
  assert.equal(await sk.init({}), false);
  assert.equal(await sk.promptFor('هل احسمها مجانية؟'), '');
  process.env.SITE_KNOWLEDGE = 'on';
});

test('"وش آخر التحديثات": بدون أي تحديث مسجّل يرد بصراحة (بدون اختراع)، وحتى قبل أول سحب', async () => {
  const early = await sk.promptFor('وش اخر تحديثات؟');
  assert.match(early, /ما فيه تحديثات مسجّلة عندي/);
  assert.match(early, /لا تخترع تحديثات/);
  await sk.crawl();
  const q = await sk.promptFor('وش اخر تحديثات؟');
  assert.match(q, /ما فيه تحديثات مسجّلة عندي/);
});

test('إعلانات المالك الرسمية (📢 تحديثات جديدة): تظهر بجواب التحديثات، والإعلان الجديد بعد أول قراءة يدخل السجل فوراً', async () => {
  rtdb = { current: { published: true, publishedAt: { __ts: Date.UTC(2026, 8, 13) }, text: 'هدية بمناسبة التوب ون: اكتب الكود توب1 من القائمة', updatedBy: 'owner@x' } };
  await sk.crawl();
  const q = await sk.promptFor('وش اخر تحديثات؟');
  assert.match(q, /إعلان رسمي من إدارة احسمها/);
  assert.match(q, /الكود توب1/);
  assert.doesNotMatch(q, /ما فيه تحديثات مسجّلة عندي/);
  assert.equal(sk.status().official, 1);

  // المالك ينشر إعلاناً جديداً
  rtdb = { current: { published: true, publishedAt: { __ts: Date.UTC(2026, 10, 15) }, text: 'نزلت لعبة جديدة اسمها سباق الصحراء ومعها أحداث خاصة', updatedBy: 'owner@x' } };
  await sk.crawl();
  const rec = sk._internal.state.updates[0];
  assert.equal(rec.official, true);
  assert.match(rec.summary, /سباق الصحراء/);
  assert.match(await sk.promptFor('وش الجديد'), /لعبة جديدة اسمها سباق الصحراء/);

  // غير منشور أو RTDB واقع: ما يكسر ولا يمسح اللي عندنا
  rtdb = null;
  await sk.crawl();
  assert.equal(sk.status().official, 1);
});

test('كتالوج الألعاب والملفات: يحلل البطاقات، ويكشف لعبة جديدة وتغيّر شارة ورسالة بث وتغيّر ملف', async () => {
  const g = sk.parseGames(HOME);
  assert.deepEqual([...g.keys()], ['bomb', 'wheel']);
  assert.equal(g.get('bomb').name, 'القنبلة المتحركة');
  assert.deepEqual(sk.extractAssets(HOME, 'http://x'), ['http://x/app.js']);
  await sk.crawl();
  assert.equal(sk.status().games, 2);
  assert.equal(sk.status().assets, 1);

  // تحديثات: لعبة جديدة + شارة + رسالة بث + تغيّر ملف
  pages['/'] = HOME.replace('<div class="gcard" data-tag="wheel"', '<div class="gcard" data-tag="race" data-category="chat"><span class="gcard-num">٣</span><div class="gcard-name">سباق الصحراء</div><div class="gcard-desc">تتسابق مع متابعيك بكتابة الكلمات وأسرع واحد يفوز</div><div class="gcard-tags"></div></div>\n<div class="gcard" data-tag="wheel"');
  badges = { bomb: { badge: 'maintenance' }, wheel: { badge: 'none' }, race: { badge: 'new' } };
  broadcast = { text: 'نزل تحديث كبير لألعاب الفرق', sentAt: { __ts: Date.UTC(2026, 10, 15) } };
  appJs = 'console.log(2); // جديد';
  await sk.crawl();
  const ev = sk._internal.state.updates[0].events.join('\n');
  assert.match(ev, /لعبة جديدة بالموقع: «سباق الصحراء»/);
  assert.match(ev, /«القنبلة المتحركة» دخلت الصيانة/);
  assert.match(ev, /«سباق الصحراء» صارت «جديدة»/);
  assert.match(ev, /رسالة بث جديدة من الإدارة: «نزل تحديث كبير/);
  assert.match(ev, /تغيّر ملف بالموقع: app\.js/);

  const block = await sk.promptFor('وش اخر تحديثات؟');
  assert.match(block, /عدد الألعاب بالصفحة الرئيسية: 3/);
  assert.match(block, /ألعاب تحت الصيانة حالياً: «القنبلة المتحركة»/);
  assert.match(block, /ألعاب عليها شارة «جديد»: «سباق الصحراء»/);
  assert.match(block, /آخر رسالة بث من الإدارة/);
  assert.match(block, /ملفات تغيّرت \(رصدها البوت\): app\.js/);
  assert.match(block, /لعبة جديدة بالموقع: «سباق الصحراء»/);
});

test('"افحص الموقع": يسحب الموقع فعلاً لحظة السؤال (بدون انتظار الدورة) ويجاوب بما وجد', async () => {
  await sk.crawl();
  sk._internal.state.lastCrawlAt = Date.now() - 60_000; // الجولة السابقة قديمة
  pages['/roulette3d.html'] = ROULETTE.replace('</p>', '</p><p>وضع جديد بالروليت: جولة الحظ المضاعف تعطي نقاط مضاعفة للناجي الأخير</p>');
  hits = [];
  const block = await sk.promptFor('افحص ملفات الموقع وقول لي وش تغيّر');
  assert.ok(hits.length >= 2, 'سحب حي وقت السؤال');
  assert.match(block, /حالة الموقع الآن/);
  assert.match(block, /الصفحات المتابَعة: 2/);
  assert.match(block, /roulette3d\.html/);
  assert.ok(sk._internal.INSPECT_Q.test('افحص ملفات الموقع'));
  assert.ok(sk._internal.INSPECT_Q.test('شيك على الموقع'));
  assert.ok(!sk._internal.INSPECT_Q.test('كيف اربط تيك توك'));
});

test('أسئلة الألعاب: قائمة ألعاب الموقع الحالية (من بطاقات الصفحة الرئيسية) تدخل البرومبت', async () => {
  await sk.crawl();
  const q = await sk.promptFor('كم عدد الالعاب عندكم؟');
  assert.match(q, /ألعاب الموقع الحالية \(2 لعبة بالصفحة الرئيسية\)/);
  assert.match(q, /القنبلة المتحركة، عجلة الحظ/);
});
