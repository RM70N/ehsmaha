'use strict';
// اختبار normalizeJoinText / joinTextMatches / parseChatNumber داخل الصفحة الحقيقية.
//   node tests/bridge/normalize.test.js
const H = require('./harness');
(async () => {
  await H.serveSite();
  const b = await H.launchBrowser();
  const page = await H.newPage(b);
  const out = await page.evaluate(() => {
    const R = [];
    const eq = (name, got, want) => R.push({ name, ok: got === want, got, want });
    const M = (t, k) => joinTextMatches(t, k, 'test', { uniqueId: 'tiktok:t', nickname: 't' });
    // قرارات المالك: الإيموجي/العلامات/التشكيل/التطويل تُقبل، كلمة إضافية لا
    eq('exact', M('دخول', 'دخول'), true);
    eq('diacritics+tatweel', M('دُخُـــول', 'دخول'), true);
    eq('emoji', M('دخول😍', 'دخول'), true);
    eq('punctuation', M('دخول!!', 'دخول'), true);
    eq('RLM/LRM/ZWSP', M('‏دخول‎​', 'دخول'), true);
    eq('spaces', M('   دخول  ', 'دخول'), true);
    eq('extra word rejected', M('ابي دخول', 'دخول'), false);
    eq('partial rejected', M('دخو', 'دخول'), false);
    eq('taa/haa (تجربه)', M('تجربه', 'تجربة'), true);
    eq('taa/ta (تجربت) like old normalize', M('تجربت', 'تجربة'), true);
    eq('hamza forms', M('إدخل', 'ادخل'), true);
    eq('alif maqsura', M('علي', 'على'), true);
    eq('latin case', M('JOIN', 'join'), true);
    eq('arabic-indic digits', M('١٢٣', '123'), true);
    eq('multi-word keyword, double space', M('اوجد  الكلمه', 'اوجد الكلمة'), true);
    eq('empty keyword never matches', M('', ''), false);
    // superset: كل ما تطابقه normalize() القديمة تطابقه الجديدة
    const pairs = [['ادخل', 'أدخل'], ['Join ', 'join'], ['قطة', 'قطت'], ['مستشفى', 'مستشفي'], ['  كلمة', 'كلمة ']];
    pairs.forEach(([a, k]) => { if (normalize(a) === normalize(k)) eq('superset ' + a + '~' + k, M(a, k), true); });
    // أرقام الشات
    eq('parseChatNumber ٥', parseChatNumber('٥'), 5);
    eq('parseChatNumber 12', parseChatNumber('12'), 12);
    eq('parseChatNumber ۷ (persian)', parseChatNumber('۷'), 7);
    eq('parseChatNumber RLM', parseChatNumber('‏9'), 9);
    eq('parseChatNumber text', Number.isNaN(parseChatNumber('abc')), true);
    eq('foldChatDigits', foldChatDigits('رقم ٣٤'), 'رقم 34');
    // سجل التشخيص يسجّل "قريب من الكلمة"
    joinDiagLog.length = 0;
    M('دخوول', 'دخول');
    eq('near-miss logged', joinDiagLog.some((x) => x.reason === 'keyword_near_miss'), true);
    return R;
  });
  let bad = 0;
  out.forEach((r) => { if (!r.ok) bad++; console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  got=' + JSON.stringify(r.got) + ' want=' + JSON.stringify(r.want))); });
  if (page._errors.length) { console.log('PAGE ERRORS', page._errors); bad++; }
  console.log(bad ? bad + ' FAILED' : 'ALL PASSED (' + out.length + ')');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
