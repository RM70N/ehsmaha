'use strict';
// اقتراحات المستخدمين في حقول اليوزر داخل استوديو المالك (الاستوديو الحقيقي، مستخدمون وهميون في ownerUsersCache).
const { boot, mkCheck, sleep } = require('./ops-studio-harness');
const { check, done } = mkCheck();
(async () => {
  const T = await boot(); const { f, go, fe, he, page } = T;
  await he(() => { (0, eval)('ownerUsersCache = ' + JSON.stringify([
    { _uid: 'u1', username: 'zezo_wx1', email: 'a@x.com', linkedTiktokUsername: 'zezo_wx1' }, { _uid: 'u2', username: 'zeyad', email: 'b@x.com' },
    { _uid: 'u3', username: 'ahmad_z', email: 'c@x.com' }, { _uid: 'u4', username: 'sara', email: 'd@x.com' }, { _uid: 'u5', username: 'zEn99', email: 'e@x.com' }])); });
  const type = async (sel, text) => { await f.click(sel); await f.fill(sel, ''); await f.type(sel, text, { delay: 20 }); await sleep(250); };
  const sug = () => fe(() => { const b = document.getElementById('us-box'); return b && b.classList.contains('on') ? [...b.querySelectorAll('.us-i b')].map((x) => x.innerText) : null; });
  // حقل منح إطار (الصورة المرسلة)
  await go('frames', 700);
  await type('#gr-t', 'ze');
  let s = await sug();
  check('منح إطار: كتابة «ze» تعرض المطابقين فقط (zezo_wx1, zeyad, zEn99) دون ahmad_z وsara', s && s.includes('zezo_wx1') && s.includes('zeyad') && s.includes('zEn99') && s.length === 3 && !s.includes('ahmad_z') && !s.includes('sara'), s);
  await type('#gr-t', 'z_'); s = await sug(); check('مطابقة داخل الاسم: «_z» تجد ahmad_z', (await (async () => { await type('#gr-t', '_z'); return sug(); })()).includes('ahmad_z'));
  await type('#gr-t', 'zzzz'); s = await sug();
  check('لا تطابق: رسالة «لا مستخدم يطابق» وليس قائمة', await fe(() => /لا مستخدم يطابق/.test(document.getElementById('us-box').innerText)));
  await type('#gr-t', 'zez');
  await f.page().keyboard.press('ArrowDown'); await f.page().keyboard.press('Enter'); await sleep(200);
  const val = await fe(() => document.getElementById('gr-t').value);
  check('الأسهم + Enter يختار ويملأ الحقل باليوزر', /^(zezo_wx1|zeyad|zEn99|ahmad_z)$/.test(val) && val !== 'zez', val);
  check('بعد الاختيار تُغلق القائمة', (await sug()) === null);
  await type('#gr-t', 'sar'); await f.click('#us-box .us-i'); await sleep(200);
  check('النقر على اقتراح يملأ الحقل (sara)', (await fe(() => document.getElementById('gr-t').value)) === 'sara');
  await type('#gr-t', 'ze'); await f.page().keyboard.press('Escape'); await sleep(100);
  check('Escape يغلق القائمة', (await sug()) === null);
  // حقل رسالة شخصية
  await go('messages', 700);
  await fe(() => { const t = document.querySelector('[data-mode="personal"],[data-m="personal"]'); if (t) t.click(); });
  await sleep(300);
  const hasMs = await fe(() => !!document.getElementById('ms-u'));
  if (hasMs) { await fe(() => { const el = document.getElementById('ms-u'); el.closest('[hidden]') && el.closest('[hidden]').removeAttribute('hidden'); }); await type('#ms-u', 'ah'); s = await sug(); check('الرسائل: اقتراحات اليوزر (ahmad_z)', s && s.includes('ahmad_z'), s); check('حقل الرسائل لا يحمل datalist مزدوجاً', await fe(() => !document.getElementById('ms-u').hasAttribute('list'))); }
  // حقل لا علاقة له باليوزر لا يقترح
  await go('tournaments', 700);
  const other = await fe(() => { const i = document.querySelector('#ops-main input.input[type=text], #ops-main .input'); return i ? (window.UserSuggest.isTarget(i) ? 'target' : 'not') : 'none'; });
  check('حقول غير اليوزر (عنوان/تواريخ) لا تُعامَل كحقل يوزر', other !== 'target', other);
  const bad = await fe(() => window.UserSuggest.isTarget(Object.assign(document.createElement('input'), { placeholder: 'اسم البطولة' })));
  check('اسم البطولة ليس حقل يوزر', bad === false);
  const errs = T.ferr.concat(T.perr); check('لا أخطاء جافاسكربت', errs.length === 0, errs);
  const nf = done(); await T.browser.close(); process.exit(nf ? 1 : 0);
})().catch((e) => { console.log('FATAL', e.message); process.exit(2); });
