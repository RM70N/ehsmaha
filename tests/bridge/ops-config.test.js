'use strict';
// إعدادات الألعاب المتقدمة: مخطط حقيقي، حفظ بإصدارات، استعادة، تطبيق على راوند جديد فعلاً عبر modGetSetting، استقلال الألعاب.
const { boot, mkCheck, sleep } = require('./ops-studio-harness');
const { check, done } = mkCheck();
(async () => {
  const T = await boot(); const { f, go, fe, he } = T;
  await he(() => { EhsOps.install(); EhsOps._installConfig(); });
  await go('gconf', 700);
  check('القائمة تُبنى من مخطط الإعدادات الحقيقي (17 لعبة)', await fe(() => document.querySelectorAll('[data-gc]').length === 17));
  await fe(() => document.querySelector('[data-gc="sniper"]').click()); await sleep(200);
  check('محرّر لعبة القناص يعرض كل حقولها (9) بقيمها الافتراضية وحدودها', await fe(() => document.querySelectorAll('#gc-ed .field').length === 9 && document.querySelector('#gc-gridSize').value === '50' && /الحد 1–100/.test(document.querySelector('#gc-ed').innerText)));
  // تحقق: قيمة خارج الحد تُرفض ولا كتابة
  await fe(() => { document.querySelector('#gc-gridSize').value = '500'; document.querySelector('[data-act="gc-save"]').click(); }); await sleep(250);
  check('قيمة خارج الحد (500) تُرفض برسالة ولا تُكتب', (await fe(() => /الحد بين/.test(document.querySelector('.toast').innerText))) && (await he(async () => (await EhsOps.store().get('opsConfig/current/sniper')) === null)));
  // حفظ فعلي مع معاينة
  await fe(() => { document.querySelector('#gc-gridSize').value = '30'; document.querySelector('#gc-ammoSniper').value = '10'; document.querySelector('#gc-shieldEnabled').checked = true; document.querySelector('[data-act="gc-save"]').click(); }); await sleep(300);
  const rev = await fe(() => document.querySelector('.dialog') ? document.querySelector('.dialog').innerText : '');
  check('نافذة المراجعة تعرض القيمة السابقة والجديدة لكل تغيير', /عدد المربعات/.test(rev) && /50/.test(rev) && /30/.test(rev) && /عدد طلقات القناص/.test(rev) && /مفعّل/.test(rev), rev);
  await fe(() => document.querySelector('.dialog [data-ok]').click()); await sleep(500);
  const s1 = await he(async () => ({ cur: await EhsOps.store().get('opsConfig/current/sniper'), hist: Object.values((await EhsOps.store().get('opsConfig/history/sniper')) || {}), audit: Object.values((await EhsOps.store().get('opsAudit')) || {}) }));
  check('الحفظ: الإصدار 1 يحوي الحقول المعدَّلة فقط (Sparse) + سجل إصدار + سجل تدقيق', s1.cur.v === 1 && s1.cur.values.gridSize === 30 && s1.cur.values.ammoSniper === 10 && s1.cur.values.shieldEnabled === true && Object.keys(s1.cur.values).length === 3 && s1.hist.length === 1 && s1.audit.some((a) => a.action === 'gameconfig.save'), s1);
  // بقاء القيمة بعد إعادة فتح الصفحة
  await go('home', 400); await go('gconf', 700); await fe(() => document.querySelector('[data-gc="sniper"]').click()); await sleep(200);
  check('إعادة فتح الصفحة: القيم المحفوظة تبقى (30/10/مفعّل) ومعلَّمة «معدَّل»', await fe(() => document.querySelector('#gc-gridSize').value === '30' && document.querySelector('#gc-ammoSniper').value === '10' && document.querySelector('#gc-shieldEnabled').checked && !!document.querySelector('.gc-changed')));
  // تطبيق فعلي على راوند جديد (الموقع الحقيقي: modGetSetting)
  const ap = await he(async () => { EhsOps._clearCfg(); await EhsOps.configPreload(); const live = (0, eval)('modLiveSettings'); const r = { sniperGrid: modGetSetting('sniper', 'gridSize', 50), sniperShield: modGetSetting('sniper', 'shieldEnabled', true), hzGrid: modGetSetting('hz', 'gridSize', 60), sniperAmmoBomb: modGetSetting('sniper', 'ammoBomb', 6) }; live.sniper = { gridSize: 70 }; r.personal = modGetSetting('sniper', 'gridSize', 50); delete live.sniper; return r; });
  check('راوند جديد يقرأ الإعداد العام (30/تفعيل الدرع)، لعبة أخرى (ضربة الحظ) لا تتأثر، وغير المعدَّل افتراضي', ap.sniperGrid === 30 && ap.sniperShield === true && ap.hzGrid === 60 && ap.sniperAmmoBomb === 6, ap);
  check('إعداد الستريمر الشخصي يتغلّب على الإعداد العام', ap.personal === 70, ap);
  // قيمة خبيثة مكتوبة مباشرة بالقاعدة تُقيَّد عند القراءة
  const evil = await he(async () => { await EhsOps.store().set('opsConfig/current/hz', { v: 1, values: { gridSize: 99999, revivalEnabled: 'yes', maxClicks: -5 } }); EhsOps._clearCfg(); await EhsOps.configPreload(); return { g: modGetSetting('hz', 'gridSize', 60), rev: modGetSetting('hz', 'revivalEnabled', true), mc: modGetSetting('hz', 'maxClicks', 15) }; });
  check('قيم خارج الحدود/النوع في القاعدة تُقيَّد عند القراءة (100، نوع غير صالح ← الافتراضي، الحد الأدنى)', evil.g === 100 && evil.rev === true && evil.mc >= 1, evil);
  await he(async () => { await EhsOps.store().remove('opsConfig/current/hz'); });
  // نسخة ثانية ثم استعادة الأولى
  await fe(() => { document.querySelector('#gc-gridSize').value = '40'; document.querySelector('[data-act="gc-save"]').click(); }); await sleep(300); await fe(() => document.querySelector('.dialog [data-ok]').click()); await sleep(500);
  const v2 = await he(async () => (await EhsOps.store().get('opsConfig/current/sniper')).v);
  await fe(() => document.querySelector('[data-gc-restore]').click()); await sleep(300);
  check('الاستعادة تمرّ بنفس نافذة المراجعة', await fe(() => /القيمة الجديدة/.test(document.querySelector('.dialog').innerText)));
  await fe(() => document.querySelector('.dialog [data-ok]').click()); await sleep(500);
  const v3 = await he(async () => ({ cur: await EhsOps.store().get('opsConfig/current/sniper'), hist: Object.values((await EhsOps.store().get('opsConfig/history/sniper')) || {}) }));
  check('بعد الإصدار 2 (=40) استعادة الإصدار 1 تنتج إصداراً 3 بقيم الأول (30) وتُسجَّل كاستعادة', v2 === 2 && v3.cur.v === 3 && v3.cur.values.gridSize === 30 && v3.hist.some((h) => h.restoredFrom === 1), { v2, v3 });
  // الإعداد الطبيعي
  await fe(() => document.querySelector('[data-act="gc-reset"]').click()); await sleep(300); await fe(() => document.querySelector('.dialog [data-ok]').click()); await sleep(500);
  const rs = await he(async () => { const c = await EhsOps.store().get('opsConfig/current/sniper'); EhsOps._clearCfg(); await EhsOps.configPreload(); return { c, g: modGetSetting('sniper', 'gridSize', 50) }; });
  check('«الإعداد الطبيعي لكل الحقول» يفرّغ التعديلات (الإصدار 4) ويعود الافتراضي 50', rs.c.v === 4 && Object.keys(rs.c.values || {}).length === 0 && rs.g === 50, rs);
  // لعبة مختلفة: أعداد/وحدات (الكراسي بالثواني ↔ ms)
  await fe(() => document.querySelector('[data-gc="chairs"]').click()); await sleep(200);
  const unit = await fe(() => document.querySelector('#gc-spinMinMs').value);
  await fe(() => { document.querySelector('#gc-spinMinMs').value = '4'; document.querySelector('[data-act="gc-save"]').click(); }); await sleep(300); await fe(() => document.querySelector('.dialog [data-ok]').click()); await sleep(500);
  const ch = await he(async () => { const c = await EhsOps.store().get('opsConfig/current/chairs'); EhsOps._clearCfg(); await EhsOps.configPreload(); return { c, v: modGetSetting('chairs', 'spinMinMs', 2500), sn: await EhsOps.store().get('opsConfig/current/sniper') }; });
  check('وحدات الزمن تُحوَّل (واجهة بالثواني ↔ تخزين بالملّي ثانية) واستقلال الألعاب محفوظ', ch.v === 4000 && ch.c.values.spinMinMs === 4000 && ch.sn.v === 4, { unit, ch });
  check('صلاحيات: غير المالك لا يرى الإعدادات', await (async () => { await he(() => { (0, eval)('currentUser = { uid: "x", email: "o@x.com" }'); }); await go('home', 300); await go('gconf', 500); const t = await fe(() => document.querySelector('#view-gconf').innerText); return /للمالك فقط/.test(t); })());
  check('بدون أخطاء JS', T.perr.length === 0 && T.ferr.length === 0, { p: T.perr, f: T.ferr });
  await T.browser.close(); process.exit(done() ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
