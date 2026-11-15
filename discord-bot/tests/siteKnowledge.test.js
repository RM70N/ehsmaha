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
const etagOf = (s) => `"${Buffer.from(s).length}-${s.length}-${[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1000003, 7)}"`;

const HOME = `<!doctype html><html><head><title>احسمها | ألعاب تفاعلية للبث</title>
<meta name="description" content="منصة عربية مجانية لألعاب البث التفاعلية على تيك توك وتويتش"></head><body>
<h1>العب مع متابعينك مباشرة</h1><button>ابدأ بثاً سريعاً</button>
<a href="/roulette3d.html">روليت</a><a href="/preview-x.html">x</a>
<script>const FAQ=[{q:'هل احسمها مجانية؟',a:'نعم، التسجيل واللعب على احسمها مجاني بالكامل بحساب جوجل أو البريد'}];
const x={game:'لعبة القنبلة المتحركة: القنبلة عند متابع عشوائي ويمرّرها بالشات'};</script></body></html>`;
const ROULETTE = `<html><head><title>الروليت الروسي — احسمها</title></head><body><p>روليت الإقصاء: كل جولة يطلق أحدهم النار على متابع والخاسر يخرج من اللعبة</p></body></html>`;

test.before(async () => {
  server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
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
});
test.beforeEach(() => {
  pages = { '/': HOME, '/roulette3d.html': ROULETTE };
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
  assert.match(hit[0].text, /مجاني بالكامل/);
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
  assert.doesNotMatch(q, /آخر تحديثات الموقع/, 'ما نذكر التحديثات لسؤال عادي');
  pages['/'] = HOME.replace('</body>', '<p>ميزة جديدة: لوحة متصدرين أسبوعية تتحدث كل يوم جمعة وتوزع جوائز</p></body>');
  await sk.crawl();
  const news = await sk.promptFor('وش الجديد بالموقع؟');
  assert.match(news, /آخر تحديثات الموقع/);
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
