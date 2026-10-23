'use strict';
// تطبيق «نصب» بنسخة callcenter3d-nasb-preview.html: كل كرت طريقة يفتح صفحة تشغيل خاصة.
// يختبر تدفقات فعلية (نقر بالفأرة/لمس/لوحة مفاتيح وكتابة حقيقية) داخل اللعبة بوضع التدريب المحلي (عقل محادثة وهمي بلا أي استدعاء مدفوع).
// يحتاج فقط سيرفر الصفحات (يشغله harness)، وبدون سيرفرات Render (تُحاكى كواقعة فتشتغل اللعبة محلياً):
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/nasb-preview.test.js   (SHOTS=/dir للقطات)
const H = require('./harness');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 600) : '')); };
const SHOTS = process.env.SHOTS; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const PREVIEW = fs.readFileSync(path.join(ROOT, 'callcenter3d-nasb-preview.html'));
const REWARD = { code: 100, card: 300, parcel: 350, invoice: 450, vault: 550, contract: 650, wallet: 750, combo: 900 };
const NAMES = { code: 'استرداد الرمز', card: 'بطاقة العميل', parcel: 'قسيمة الطرد', invoice: 'فاتورة الشركة', vault: 'خزنة المكتب', contract: 'عقد الخدمة', wallet: 'محفظة الرموز', combo: 'الصفقة المركبة' };
const METHODS = Object.keys(REWARD);

async function newPreviewPage(browser, ctxOpts) {
  const page = await H.newPage(browser, { query: '?debug=0', context: ctxOpts || {} });
  await page.route(/onrender\.com\/cc\/v1\//, (route) => route.abort('connectionrefused'));
  await page.route(/\/callcenter3d\.html/, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PREVIEW }));
  await page.addStyleTag({ content: '#auth-loader{display:none!important}' });
  if (!ctxOpts) await page.setViewportSize({ width: 1280, height: 800 });
  return page;
}
const frameOf = (page) => page.frames().find((f) => /callcenter3d\.html/.test(f.url()));
const F = (page) => frameOf(page);
async function waitFrame(page, fn, arg, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { const f = frameOf(page); if (f) { const v = await f.evaluate(fn, arg).catch(() => null); if (v) return v; } await sleep(150); } return null; }
const waitPhase = (page, ph, ms) => waitFrame(page, (p) => window.CC && CC.state && CC.state.phase === p, ph, ms || 60000);

async function boot(page) {
  await page.evaluate(() => goCallCenter());
  if (!(await waitPhase(page, 'menu', 90000))) throw new Error('menu not reached');
  await F(page).evaluate(() => document.getElementById('mn-play').click());
  await waitPhase(page, 'intro', 15000);
  await F(page).evaluate(() => document.getElementById('di-go').click());
  await waitPhase(page, 'shift', 20000);
  await F(page).evaluate(() => CC.game.sitDown());
  await waitFrame(page, () => CC.os.on === true, null, 20000);
  await sleep(500);
  // هدف اليوم ووقته كبيران حتى ما ينتقل اللاعب لتقييم المدير أثناء سلسلة الاختبارات
  await F(page).evaluate(() => { const S = CC.auth.session; S.day.quota = 1e9; S.day.left = 1e7; S.day.duration = 1e7; CC.game.applySnap(S.snapshot()); });
  await F(page).evaluate(() => {
    window.__ops = []; const a = CC.auth, orig = a.call.bind(a);
    a.call = function (op, body) { window.__ops.push({ op, body: JSON.parse(JSON.stringify(body || {})) }); return orig(op, body); };
  });
}
const ops = (page, name) => F(page).evaluate((n) => window.__ops.filter((o) => !n || o.op === n).map((o) => ({ op: o.op, body: o.body })), name || null);
const clearOps = (page) => F(page).evaluate(() => { window.__ops.length = 0; });

async function setLife(page, v) { await F(page).evaluate((x) => { const S = CC.auth.session; S.profile.lifetimeEarned = x; CC.game.applySnap(S.snapshot()); }, v); }
const wallet = (page) => F(page).evaluate(() => CC.auth.session.profile.wallet);

async function ensureShift(page) {
  for (let i = 0; i < 8; i++) {
    const ph = await F(page).evaluate(() => CC.state.phase);
    if (ph === 'shift') break;
    await F(page).evaluate(() => { const b = document.getElementById('rv-skip') || document.getElementById('rv-go'); if (b) b.click(); });
    await sleep(500);
  }
  await F(page).evaluate(() => { if (CC.player.mode !== 'seated') CC.game.sitDown(); });
  await waitFrame(page, () => CC.os.on === true && CC.player.mode === 'seated', null, 15000);
  await sleep(200);
}
// مكالمة جديدة بعملية من الطريقة المطلوبة (يحاول عدة مرات لأن بعض المكالمات بلا عملية تحصيل)
async function newCall(page, method, disclose) {
  for (let t = 0; t < 10; t++) {
    await F(page).evaluate(() => { const K = CC.calls; if (K.state === 'active') K.hangup(); });
    await waitFrame(page, () => { const K = CC.calls; if (K.state === 'ended') K.reset(); return K.state === 'idle'; }, null, 8000);
    await ensureShift(page);
    await F(page).evaluate(() => { CC.os.open('phone', { noDock: true }); CC.calls.ring(); });
    const ok = await waitFrame(page, () => { const K = CC.calls; if (K.state === 'ringing') K.answer(); return K.state === 'active' && !!K.call; }, null, 15000);
    if (!ok) continue;
    const r = await F(page).evaluate(async (m) => { const S = CC.auth.session; const c = S.call; if (!c || !c.op) return { has: false }; if (c.op.method !== m) { const r = await CC.calls.setMethod(m); if (!r || !r.ok) return { has: false, msg: r && r.msg }; } return { has: true }; }, method);
    if (!r.has) continue;
    return F(page).evaluate((a) => {
      const S = CC.auth.session, R = CC.R, call = S.call, sc = R.scenario(call.scenarioId), oi = sc.steps.findIndex((s) => s.kind === 'op');
      for (let i = 0; i < oi; i++) call.steps[i].done = true; call.stepIdx = oi;
      if (a === 'all') call.op.shown = Object.assign({}, call.op.values);
      CC.calls.call = R.publicCall(call); CC.calls.render(); CC.game.applySnap(S.snapshot());
      return { d: JSON.parse(JSON.stringify(call.op.data)), id: call.op.id, callId: call.id, issuer: call.op.pub.issuer };
    }, disclose || 'all');
  }
  const dg = await F(page).evaluate(() => ({ phase: CC.state.phase, st: CC.calls.state, left: CC.state.snap && CC.state.snap.day && CC.state.snap.day.timeLeft, day: CC.state.snap && CC.state.snap.day && Object.keys(CC.state.snap.day) })).catch(() => null);
  throw new Error('no call with op ' + method + ' ' + JSON.stringify(dg));
}
async function openTx(page, view) {
  await F(page).evaluate(() => { const c = document.getElementById('cc-coach'); if (c) c.remove(); });
  await F(page).evaluate((v) => { CC.os.open('tx', { noDock: true }); const i = CC.os.inst('tx'); i && i.reopen({ tab: v || 'methods' }); }, view || 'methods');
  await sleep(250);
}
async function box(page, sel) {
  await F(page).evaluate((s) => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: 'center', behavior: 'instant' }); }, sel);
  await sleep(70);
  const b = await F(page).evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, hit: !!t && (e === t || e.contains(t) || t.contains(e)), dis: !!e.disabled }; }, sel);
  if (!b) return null;
  const fr = await (await page.$('#callcenter-frame')).boundingBox();
  return Object.assign(b, { px: fr.x + b.x, py: fr.y + b.y });
}
async function mclick(page, sel, off) { const b = await box(page, sel); if (!b) return 'missing:' + sel; if (!b.hit) return 'covered:' + sel; await page.mouse.click(b.px + ((off && off.dx) || 0), b.py + ((off && off.dy) || 0)); await sleep(180); return 'ok'; }
async function mtype(page, sel, text, clear) { const r = await mclick(page, sel); if (r !== 'ok') return r; if (clear) { await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); } await page.keyboard.type(String(text), { delay: 8 }); await sleep(80); return 'ok'; }
const q = (page, fn, arg) => F(page).evaluate(fn, arg);
const txText = (page) => q(page, () => { const w = document.querySelector('.app-tx'); return w ? w.innerText : ''; });
const msgText = (page) => q(page, () => { const e = document.getElementById('nb-msg'); return e ? e.innerText : ''; });
const attemptsLeft = (page) => q(page, () => CC.calls.call && CC.calls.call.op ? CC.calls.call.op.attemptsLeft : null);
const isUsed = (page) => q(page, () => !!(CC.auth.session.call && CC.auth.session.call.op && CC.auth.session.call.op.used));
const latinDigits = (s) => String(s).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

// يعبي نموذج الطريقة بالبيانات الصحيحة (كتابة/نقر فعلي)
async function fillCorrect(page, m, d, opts) {
  opts = opts || {};
  if (m === 'code') return mtype(page, '#f_code', opts.arabic ? latinDigits(d.code) : d.code, true);
  if (m === 'card') { await mtype(page, '#f_holder', d.holder, true); await mtype(page, '#f_cardId', d.cardId, true); return mtype(page, '#f_verify', d.verify, true); }
  if (m === 'parcel') return mclick(page, '[data-permit="' + d.permit + '"]');
  if (m === 'invoice') { await mclick(page, 'input[name=ifield][value="' + d.field + '"]'); return mtype(page, '#f_ival', d[d.field], true); }
  if (m === 'vault') return mtype(page, '#f_vault', d.a + d.b, true);
  if (m === 'contract') {
    for (let tgt = 0; tgt < d.order.length; tgt++) {
      for (let g = 0; g < 12; g++) {
        const st = await q(page, (a) => { const labels = (CC.calls.call.op.clauses || []).reduce((x, c) => (x[c.id] = c.label, x), {}); const order = Array.from(document.querySelectorAll('.app-tx .nb-order li')).map((li) => li.dataset.id); return { pos: order.indexOf(a.want), order }; }, { want: d.order[tgt] });
        if (st.pos === tgt) break;
        await mclick(page, '.app-tx [data-up="' + st.pos + '"]');
      }
    }
    return 'ok';
  }
  if (m === 'wallet') { for (const t of d.tokens) await mclick(page, '.app-tx [data-tk="' + t + '"]'); return 'ok'; }
  if (m === 'combo') return mtype(page, '#f_key', d.key1, true);
}

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  let page = await newPreviewPage(browser);
  await boot(page);

  // ===== 0) ملف اللعبة الأصلي والموقع كما هم =====
  const orig = fs.readFileSync(path.join(ROOT, 'callcenter3d.html'));
  const upl = '/root/.claude/uploads/0eda4367-904b-5886-afae-e6c80c541c1a/91edbff8-call-center3d.html';
  check('الملف الأصلي callcenter3d.html بلا أي تعديل', !fs.existsSync(upl) || orig.equals(fs.readFileSync(upl)));
  const gitDiff = require('child_process').execSync('git diff --stat HEAD -- callcenter3d.html index.html', { cwd: ROOT }).toString().trim();
  check('index.html والملف الأصلي بلا تغييرات (مقابل HEAD)', gitDiff === '', gitDiff);
  const embedded = (src) => { const m = src.match(/\(function \(root, factory\) \{[\s\S]*?root\.CCRules = factory\(root\.CCContent\);\s*\}\(/); return m && m[0]; };
  const rulesSrv = fs.readFileSync(path.join(ROOT, 'tiktok-server/lib/cc/cc-rules.js'), 'utf8').trim();
  check('قواعد اللعبة المدمجة مطابقة حرفياً لقواعد الخادم (نفس منطق op/collect)', PREVIEW.toString('utf8').includes(rulesSrv.slice(0, 4000)) && PREVIEW.toString('utf8').includes(rulesSrv.slice(-4000)));

  // ===== 1) الكرت يفتح صفحة الطريقة: فأرة + لوحة مفاتيح + لمس =====
  await setLife(page, 1e7);
  await newCall(page, 'code', 'none');
  await openTx(page, 'methods');
  const cards = await q(page, () => Array.from(document.querySelectorAll('.app-tx .nb-m')).map((c) => ({ id: c.dataset.card, btn: !!c.querySelector('.nb-open'), name: c.querySelector('header b').innerText })));
  check('ثمانية كروت بزر «افتح الطريقة» على كل كرت', cards.length === 8 && cards.every((c) => c.btn && NAMES[c.id] === c.name), cards);
  let openedBy = {};
  for (const m of METHODS) {
    // نقر بالفأرة على نص وصف الكرت (مو الزر) ← تنفتح صفحة الطريقة
    const r = await mclick(page, '.app-tx [data-card="' + m + '"] > p');
    const pg = await q(page, () => { const p = document.querySelector('.app-tx .nb-mp'); return p && { m: p.dataset.method, h: p.querySelector('.nb-ophead b').innerText, back: !!document.getElementById('nb-back') }; });
    openedBy[m] = r === 'ok' && pg && pg.m === m && pg.h === NAMES[m] && pg.back;
    await mclick(page, '#nb-back');
  }
  check('الضغط على أي مكان بالكرت يفتح صفحة الطريقة الصحيحة (الثمانية) ويرجع للطرق', METHODS.every((m) => openedBy[m]), openedBy);
  // لوحة المفاتيح: Enter ثم Space على زر الكرت
  await F(page).evaluate(() => document.querySelector('.app-tx [data-open="card"]').focus());
  await page.keyboard.press('Enter'); await sleep(200);
  const kb1 = await q(page, () => document.querySelector('.app-tx .nb-mp') && document.querySelector('.app-tx .nb-mp').dataset.method);
  await mclick(page, '#nb-back');
  await F(page).evaluate(() => document.querySelector('.app-tx [data-open="vault"]').focus());
  await page.keyboard.press('Space'); await sleep(200);
  const kb2 = await q(page, () => document.querySelector('.app-tx .nb-mp') && document.querySelector('.app-tx .nb-mp').dataset.method);
  check('لوحة المفاتيح: Enter و Space على «افتح الطريقة» يفتحان الصفحة', kb1 === 'card' && kb2 === 'vault', { kb1, kb2 });
  await mclick(page, '#nb-back');
  check('التصفح وحده ما غيّر طريقة المكالمة ولا أرسل op/method', (await ops(page, 'op/method')).length === 0 && (await q(page, () => CC.auth.session.call.op.method)) === 'code');
  if (SHOTS) await page.screenshot({ path: SHOTS + '/methods.png' });

  // ===== 2) مقفلة: تفاصيل + شرط الفتح بلا تجاوز =====
  await setLife(page, 100);
  await openTx(page, 'methods');
  await mclick(page, '.app-tx [data-card="combo"] > p');
  const lk = await q(page, () => { const t = document.querySelector('.app-tx').innerText; return { t, form: !!document.getElementById('nb-form'), use: !!document.querySelector('.app-tx [data-use]'), dis: !!document.querySelector('.app-tx .nb-actions button[disabled]'), pb: !!document.querySelector('.app-tx .nb-card.unlock .pb i') }; });
  check('الطريقة المقفلة: شرط الفتح والمتبقي وشريط التقدم، بلا نموذج ولا زر استخدام', /مقفلة/.test(lk.t) && /٤٬?٥٠٠|4,?500|٤٥٠٠/.test(lk.t.replace(/[،,٬\s]/g, '')) && /باقي لك/.test(lk.t) && lk.pb && !lk.form && !lk.use, lk);
  const sendLocked = await q(page, async () => { const r = await CC.calls.setMethod('combo'); return r; });
  check('المرجع الرسمي يرفض تفعيل المقفلة حتى لو أُرسل الطلب يدوياً', sendLocked && sendLocked.ok === false, sendLocked);
  await setLife(page, 1e7);

  // ===== 3) بدون مكالمة: معاينة بلا تحصيل =====
  await F(page).evaluate(() => { const K = CC.calls; if (K.state === 'active') K.hangup(); });
  await waitFrame(page, () => { const K = CC.calls; if (K.state === 'ended') K.reset(); return K.state === 'idle'; }, null, 8000);
  await openTx(page, 'methods');
  await clearOps(page);
  await mclick(page, '.app-tx [data-card="wallet"] > p');
  const nc = await q(page, () => { const t = document.querySelector('.app-tx').innerText; return { t, form: !!document.getElementById('nb-form'), btn: (document.querySelector('.app-tx .nb-actions button') || {}).disabled, grid: document.querySelectorAll('.app-tx .nb-tokens.pv .tok').length }; });
  check('بدون مكالمة: معاينة الطريقة + «ابدأ مكالمة عميل عشان تستخدم هالطريقة» + التنفيذ معطل', /ابدأ مكالمة عميل عشان تستخدم هالطريقة/.test(nc.t) && nc.btn === true && !nc.form && nc.grid === 9, nc);
  check('المعاينة ما ولّدت عملية ولا أرسلت طلبات', (await ops(page)).filter((o) => /op\//.test(o.op)).length === 0);

  // ===== 4) تبديل الطريقة: قبل الإفصاح ينجح، بعده يُمنع مع السبب =====
  await newCall(page, 'code', 'none');
  await openTx(page, 'methods'); await clearOps(page);
  await mclick(page, '.app-tx [data-card="parcel"] > p');
  const hasUse = await q(page, () => !!document.querySelector('.app-tx [data-use="parcel"]'));
  check('قبل الإفصاح: زر «استخدمها بهالمكالمة» ظاهر لطريقة ثانية', hasUse);
  await mclick(page, '.app-tx [data-use="parcel"]'); await sleep(500);
  const sw = await q(page, () => ({ m: CC.auth.session.call.op.method, page: (document.querySelector('.app-tx .nb-mp') || {}).dataset && document.querySelector('.app-tx .nb-mp').dataset.method, form: !!document.getElementById('nb-form'), permits: document.querySelectorAll('.app-tx [data-permit]').length }));
  check('تفعيل الطريقة ينجح عبر G.calls.setMethod ويعرض العملية الراجعة من المرجع', sw.m === 'parcel' && sw.page === 'parcel' && sw.form && sw.permits === 4 && (await ops(page, 'op/method')).length === 1, sw);
  await q(page, () => { const S = CC.auth.session; S.call.op.shown = { parcelId: S.call.op.values.parcelId }; CC.calls.call = CC.R.publicCall(S.call); CC.game.applySnap(S.snapshot()); CC.os.inst('tx').update(); });
  await openTx(page, 'methods'); await mclick(page, '.app-tx [data-card="card"] > p');
  const blocked = await q(page, () => ({ use: !!document.querySelector('.app-tx [data-use]'), t: document.querySelector('.app-tx').innerText, back: !!document.querySelector('.app-tx [data-go="op"]'), dis: !!document.querySelector('.app-tx .nb-actions button[disabled]') }));
  check('بعد بدء الإفصاح: لا زر استخدام، سبب المنع واضح، زر «ارجع للعملية الحالية»', !blocked.use && /ما تقدر تغيّر الطريقة بعد ما بدأت العملية/.test(blocked.t) && blocked.back && blocked.dis, blocked);
  await mclick(page, '.app-tx [data-go="op"]');
  check('«ارجع للعملية الحالية» ينقل لنموذج القسيمة', await q(page, () => (document.querySelector('.app-tx .nb-mp') || {}).dataset.method === 'parcel'));
  // فشل طلب تغيير الطريقة: يبقى بصفحة الطريقة اللي يتصفحها مع السبب
  await newCall(page, 'code', 'none');
  await openTx(page, 'methods'); await mclick(page, '.app-tx [data-card="vault"] > p');
  await q(page, () => { CC.calls.__sm = CC.calls.setMethod; CC.calls.setMethod = () => Promise.resolve({ ok: false, msg: 'المتصل بدأ يفصح عن بياناتها.' }); });
  await mclick(page, '.app-tx [data-use="vault"]'); await sleep(400);
  const fsw = await q(page, () => { CC.calls.setMethod = CC.calls.__sm; return { m: (document.querySelector('.app-tx .nb-mp') || {}).dataset.method, t: document.querySelector('.app-tx').innerText, cur: CC.auth.session.call.op.method }; });
  check('فشل تغيير الطريقة: يبقى اللاعب بصفحة الطريقة ويشوف السبب بدون نقل تلقائي', fsw.m === 'vault' && /المتصل بدأ يفصح عن بياناتها/.test(fsw.t) && fsw.cur === 'code', fsw);

  // ===== 5) الطرق الثمانية: إدخال فعلي ← تحقق من المرجع ← محفظة (+ مكافأة مرة وحدة) =====
  for (const m of METHODS) {
    const cd = await newCall(page, m, 'all');
    await openTx(page, 'op'); await clearOps(page);
    const w0 = await wallet(page);
    const fm = await q(page, () => ({ form: !!document.getElementById('nb-form'), name: document.querySelector('.app-tx .nb-ophead b').innerText, pieces: document.querySelectorAll('.app-tx .nb-pieces li').length, att: document.querySelector('.app-tx .nb-rule b') && document.querySelector('.app-tx .nb-rule b').innerText }));
    check(m + ': صفحة التشغيل تعرض الاسم والبيانات المطلوبة وعدد المحاولات', fm.form && fm.name === NAMES[m] && fm.pieces >= 1 && !!fm.att, fm);
    if (SHOTS) await page.screenshot({ path: SHOTS + '/page-' + m + '.png' });
    await fillCorrect(page, m, cd.d, { arabic: m === 'code' });
    const goSel = '#nb-go';
    if (m === 'combo') {
      await mclick(page, goSel); await sleep(700);
      const s1 = await q(page, () => ({ stage: CC.auth.session.call.op.stage, att: CC.auth.session.call.op.attempts, id: CC.auth.session.call.op.id, ref: !!document.getElementById('f_ref'), steps: document.querySelectorAll('.app-tx .cb-steps li').length }));
      check('combo: نجاح المرحلة الأولى ينقل للثانية بدون مكافأة مبكرة ولا تصفير محاولات ولا عملية جديدة', s1.stage === 2 && s1.ref && s1.id === cd.id && s1.att === 0 && (await wallet(page)) === w0 && s1.steps === 2, s1);
      const stale = await q(page, async () => { const r = await CC.calls.collect({ key: 'x' }); return { ok: r.ok, reason: r.reason }; });
      check('combo: طلب المرحلة الأولى بعد انتقال العملية للثانية مرفوض بلا مكافأة', stale.ok === false && (await wallet(page)) === w0, stale);
      await mtype(page, '#f_ref', cd.d.ref, true); await mtype(page, '#f_seal', cd.d.seal, true);
    }
    await mclick(page, goSel); await sleep(800);
    const w1 = await wallet(page);
    check(m + ': التحقق ناجح وتنضاف المكافأة ' + REWARD[m] + ' دريهم مرة وحدة', w1 - w0 === REWARD[m] && (await isUsed(page)), { w0, w1 });
    const after = await txText(page);
    check(m + ': النتيجة تبقى واضحة بالصفحة (+' + REWARD[m] + ') حتى لو انتهت المكالمة', new RegExp('\\+\\s*' + REWARD[m]).test(after.replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632).replace(/[،٬,\s]/g, '')) || /انقبلت|مسجلة/.test(after), after.slice(0, 200));
    const again = await q(page, async () => { const r = await CC.calls.collect({ code: '00000' }); return { ok: r.ok }; });
    check(m + ': ما يتحصل مرة ثانية (لا مكافأة مكررة)', (await wallet(page)) === w1 && again.ok === false);
  }

  // ===== 6) الأرقام العربية والأصفار بالبداية =====
  {
    const cd = await newCall(page, 'code', 'all');
    await q(page, () => { const S = CC.auth.session; S.call.op.data.code = '00734'; S.call.op.values.code = 'لعبة-00734'; S.call.op.shown = { code: 'لعبة-00734' }; });
    await openTx(page, 'op');
    const w0 = await wallet(page);
    await mtype(page, '#f_code', '٠٠٧٣٤', true); await mclick(page, '#nb-go'); await sleep(700);
    check('الأرقام العربية مع الأصفار بالبداية (٠٠٧٣٤) تنقبل', (await wallet(page)) - w0 === 100);
    const c2 = await newCall(page, 'card', 'all');
    await q(page, () => { const S = CC.auth.session; S.call.op.data.cardId = '004217'; S.call.op.data.verify = '007'; });
    await openTx(page, 'op');
    const w1 = await wallet(page);
    await mtype(page, '#f_holder', c2.d.holder, true); await mtype(page, '#f_cardId', '٠٠٤٢١٧', true); await mtype(page, '#f_verify', '٠٠٧', true);
    await mclick(page, '#nb-go'); await sleep(700);
    check('بطاقة العميل: معرف ورمز تحقق بأصفار بالبداية بالأرقام العربية ينقبلون', (await wallet(page)) - w1 === 300);
  }

  // ===== 7) الناقص ما يستهلك محاولة، الغلط المكتمل يستهلك ويحافظ على المدخلات ولا يكشف الحل =====
  {
    const cd = await newCall(page, 'code', 'all'); await openTx(page, 'op'); await clearOps(page);
    await mtype(page, '#f_code', '12', true); await mclick(page, '#nb-go'); await sleep(300);
    check('code: رمز ناقص ما يروح للمرجع ولا يستهلك محاولة', (await ops(page, 'op/collect')).length === 0 && (await attemptsLeft(page)) === 3 && /ما انحسبت محاولة/.test(await msgText(page)));
    await mclick(page, '#nb-go'); await sleep(200);
    await mtype(page, '#f_code', '', true); await mclick(page, '#nb-go'); await sleep(200);
    check('code: الإرسال الفارغ ما يستهلك محاولة', (await ops(page, 'op/collect')).length === 0 && (await attemptsLeft(page)) === 3);
    const wrong = String((Number(cd.d.code) + 1) % 100000).padStart(5, '0') === cd.d.fake ? String((Number(cd.d.code) + 2) % 100000).padStart(5, '0') : String((Number(cd.d.code) + 1) % 100000).padStart(5, '0');
    await mtype(page, '#f_code', wrong, true); await mclick(page, '#nb-go'); await sleep(700);
    const val = await q(page, () => document.getElementById('f_code').value);
    const mt = await msgText(page);
    check('code: رمز مكتمل وغلط ينحسب محاولة (٣←٢) ويحافظ على المدخلات', (await attemptsLeft(page)) === 2 && val === wrong, { val, wrong });
    check('code: رسالة الخطأ ما تكشف الرمز الصحيح', !mt.includes(cd.d.code) && !(await txText(page)).includes('لعبة-' + cd.d.code), mt);
    await mtype(page, '#f_code', cd.d.code, true); await mclick(page, '#nb-go'); await sleep(700);
    check('code: بعد الخطأ يقدر يصحح وينجح بالمحاولة التالية', await isUsed(page));
    // بطاقة: بيانات ناقصة
    const c2 = await newCall(page, 'card', 'all'); await openTx(page, 'op'); await clearOps(page);
    await mtype(page, '#f_holder', c2.d.holder, true); await mtype(page, '#f_cardId', c2.d.cardId.slice(0, 3), true); await mclick(page, '#nb-go'); await sleep(250);
    check('card: بيانات ناقصة بلا طلب وبلا استهلاك محاولة', (await ops(page, 'op/collect')).length === 0 && (await attemptsLeft(page)) === 2);
    await mtype(page, '#f_cardId', c2.d.cardId, true); await mtype(page, '#f_verify', c2.d.verify === '123' ? '124' : '123', true); await mclick(page, '#nb-go'); await sleep(700);
    check('card: رمز تحقق غلط ينحسب محاولة والاسم والمعرف يبقون', (await attemptsLeft(page)) === 1 && (await q(page, () => document.getElementById('f_holder').value)) === c2.d.holder && /رمز التحقق غير مطابق/.test(await txText(page)));
    // وبعد خلاص المحاولات: حالة نهائية بدون زر تنفيذ
    await mtype(page, '#f_verify', c2.d.verify === '321' ? '322' : '321', true); await mclick(page, '#nb-go'); await sleep(800);
    const fin = await q(page, () => ({ failed: !!(CC.auth.session.call && CC.auth.session.call.op && CC.auth.session.call.op.failed), btn: !!document.getElementById('nb-go'), t: document.querySelector('.app-tx') ? document.querySelector('.app-tx').innerText : '' }));
    check('خلاص المحاولات: الحالة النهائية واضحة (خلصت محاولات هالعملية) بلا زر تنفيذ فعّال', fin.failed && !fin.btn && /خلصت محاولات هالعملية/.test(fin.t), fin);
  }

  // ===== 8) قسيمة الطرد: الرقم والاسم معاً =====
  {
    const cd = await newCall(page, 'parcel', 'all'); await openTx(page, 'op');
    const pm = await q(page, () => CC.calls.call.op.permits);
    const goodNum = pm.find((p) => p.id === cd.d.permit);
    const sameNumWrongName = pm.find((p) => p.id !== cd.d.permit && p.parcel === goodNum.parcel);
    const sameNameWrongNum = pm.find((p) => p.id !== cd.d.permit && p.name === goodNum.name);
    check('التصاريح الأربعة فيها اختلافات مقروءة (نفس الرقم باسم ثاني + نفس الاسم برقم ثاني)', pm.length === 4 && !!sameNumWrongName && !!sameNameWrongNum, pm);
    check('الواجهة ما تلوّن الصحيح مسبقاً ولا ترسل علامة ok', await q(page, () => !document.querySelector('.app-tx .pm[data-ok],.app-tx .pm.ok') && !CC.calls.call.op.permits.some((p) => 'ok' in p)));
    await mclick(page, '#nb-go'); await sleep(250);
    check('بدون اختيار تصريح: ما ينحسب محاولة', (await attemptsLeft(page)) === 2 && /اختر تصريح/.test(await msgText(page)));
    await mclick(page, '[data-permit="' + sameNumWrongName.id + '"]'); await mclick(page, '#nb-go'); await sleep(700);
    check('تصريح بنفس الرقم واسم مختلف ينرفض وينحسب محاولة', (await attemptsLeft(page)) === 1 && !(await isUsed(page)));
    await mclick(page, '[data-permit="' + cd.d.permit + '"]'); await mclick(page, '#nb-go'); await sleep(700);
    check('التصريح المطابق للرقم والاسم ينقبل', await isUsed(page));
  }

  // ===== 9) الفاتورة: الحقل المختلف + التصحيح =====
  {
    const cd = await newCall(page, 'invoice', 'all'); await openTx(page, 'op');
    const wrongField = ['number', 'amount', 'item'].find((f) => f !== cd.d.field);
    await mclick(page, '#nb-go'); await sleep(200);
    check('فاتورة: بدون تحديد حقل ما ينحسب محاولة', (await attemptsLeft(page)) === 2 && /حدد الحقل/.test(await msgText(page)));
    await mclick(page, 'input[name=ifield][value="' + wrongField + '"]');
    const ty = await q(page, () => { const i = document.getElementById('f_ival'); return { mode: i.getAttribute('inputmode'), n: !!i }; });
    await mtype(page, '#f_ival', '1', true); await mclick(page, '#nb-go'); await sleep(700);
    check('فاتورة: حقل مطابق (غلط) ينرفض بسبب مفهوم وينحسب محاولة', (await attemptsLeft(page)) === 1 && /مطابق لكلام المتصل|الاختلاف بحقل ثاني/.test(await txText(page)), await txText(page));
    await mclick(page, 'input[name=ifield][value="' + cd.d.field + '"]');
    const ty2 = await q(page, () => document.getElementById('f_ival').getAttribute('inputmode'));
    check('فاتورة: نوع الإدخال يتكيف (أرقام للرقم والمبلغ، نص للصنف)', cd.d.field === 'item' ? ty2 === null : ty2 === 'numeric' && (wrongField === 'item' ? ty.mode === null : ty.mode === 'numeric'), { ty, ty2, field: cd.d.field });
    await mtype(page, '#f_ival', cd.d[cd.d.field], true); await mclick(page, '#nb-go'); await sleep(700);
    check('فاتورة: الحقل الصحيح مع القيمة الصحيحة ينقبل', await isUsed(page));
  }

  // ===== 10) الخزنة والأرشيف: المدخلات تبقى =====
  {
    const cd = await newCall(page, 'vault', 'all'); await openTx(page, 'op');
    await mtype(page, '#f_vault', cd.d.a, true);
    await mclick(page, '#nb-arch'); await sleep(400);
    const arc = await q(page, () => ({ files: CC.os.isOpen('files'), tab: document.querySelector('.app-files [aria-selected=true]') && document.querySelector('.app-files [aria-selected=true]').innerText, items: document.querySelectorAll('.app-files .os-wb [data-ar]').length }));
    check('«افتح الأرشيف» يفتح الملفات على تبويب الأرشيف', arc.files && /الأرشيف/.test(arc.tab || ''), arc);
    await q(page, () => CC.os.minimize('files')); await openTx(page, 'op');
    check('الرجوع من الملفات يحافظ على المدخلات والمكالمة والمحاولات', (await q(page, () => document.getElementById('f_vault').value)) === cd.d.a && (await attemptsLeft(page)) === 2);
    const archBody = await q(page, () => (CC.calls.call.op.archive || []).map((a) => a.body).join(' '));
    check('الجزء الثاني موجود بالأرشيف فقط (الواجهة ما تعبّي الرمز تلقائياً)', archBody.includes(cd.d.b) && (await q(page, () => document.getElementById('f_vault').value)) !== cd.d.a + cd.d.b);
    await mtype(page, '#f_vault', cd.d.a + '99', true); await mclick(page, '#nb-go'); await sleep(250);
    check('خزنة: رمز ناقص (٥ خانات) ما ينحسب محاولة', (await attemptsLeft(page)) === 2);
    await mtype(page, '#f_vault', cd.d.a + cd.d.b, true); await mclick(page, '#nb-go'); await sleep(700);
    check('خزنة: الجزء الأول ثم الثاني ينفتح', await isUsed(page));
  }

  // ===== 11) العقد: أزرار + لوحة مفاتيح + سحب بالفأرة + رفض المكرر =====
  {
    const cd = await newCall(page, 'contract', 'all'); await openTx(page, 'op');
    const ord = () => q(page, () => Array.from(document.querySelectorAll('.app-tx .nb-order li')).map((li) => li.dataset.id));
    const o0 = await ord();
    await mclick(page, '.app-tx [data-dn="0"]');
    const o1 = await ord();
    check('العقد: زر «لتحت» ينزّل البند', o1[1] === o0[0] && o1[0] === o0[1], { o0, o1 });
    await F(page).evaluate(() => document.querySelector('.app-tx .nb-order li:nth-child(3)').focus());
    await page.keyboard.press('Alt+ArrowUp'); await sleep(200);
    const o2 = await ord();
    check('العقد: Alt+السهم بلوحة المفاتيح يحرّك البند', o2[1] === o1[2] && o2[2] === o1[1], { o1, o2 });
    const g = await box(page, '.app-tx .nb-order li:nth-child(1) [data-grip]'), tgt = await box(page, '.app-tx .nb-order li:nth-child(4)');
    const firstId = (await ord())[0];
    const fr = await (await page.$('#callcenter-frame')).boundingBox();
    const gb = await box(page, '.app-tx .nb-order li:nth-child(1) [data-grip]');
    const tb = await q(page, () => { const r = document.querySelector('.app-tx .nb-order li:nth-child(4)').getBoundingClientRect(); return { y: r.y + r.height / 2 }; });
    await page.mouse.move(gb.px, gb.py); await page.mouse.down(); await page.mouse.move(gb.px, gb.py + 20, { steps: 4 }); await page.mouse.move(gb.px, fr.y + tb.y, { steps: 8 }); await page.mouse.up(); await sleep(300);
    const o3 = await ord();
    check('العقد: السحب بالفأرة ينقل البند لمكانه ويحدّث الأرقام', o3[3] === firstId && o3[0] !== firstId, { firstId, o3 });
    await mclick(page, '#nb-go'); await sleep(700);
    check('العقد: ترتيب غلط ينحسب محاولة ويبقى الترتيب اللي رتبه اللاعب', (await attemptsLeft(page)) === 1 && JSON.stringify(await ord()) === JSON.stringify(o3));
    await fillCorrect(page, 'contract', cd.d); await mclick(page, '#nb-go'); await sleep(700);
    check('العقد: الترتيب الصحيح الكامل ينقبل', await isUsed(page));
    const dup = await q(page, () => { const R = CC.R; const call = CC.auth.session.call; const input = { opId: 'x', order: ['duration', 'duration', 'price', 'cancel', 'delivery'] }; return R.collectOp(CC.auth.session.profile, CC.auth.session.day, call || { status: 'ended' }, input, {}).ok; });
    check('المرجع يرفض ترتيب فيه تكرار أو نقص (قواعد مشتركة)', dup === false);
  }

  // ===== 12) المحفظة: ٣ بالضبط، لا رابع، إلغاء، الترتيب ما يهم =====
  {
    const cd = await newCall(page, 'wallet', 'all'); await openTx(page, 'op');
    const cnt = () => q(page, () => document.getElementById('wl-cnt').innerText.replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632));
    const toks = await q(page, () => CC.calls.call.op.tokens.map((t) => t.id));
    const wrong = toks.filter((t) => cd.d.tokens.indexOf(t) < 0);
    await mclick(page, '[data-tk="' + wrong[0] + '"]'); await mclick(page, '[data-tk="' + wrong[1] + '"]'); await mclick(page, '[data-tk="' + wrong[2] + '"]');
    check('المحفظة: العداد «اخترت ٣ من ٣»', /اخترت 3 من 3/.test(await cnt()), await cnt());
    await mclick(page, '[data-tk="' + wrong[3] + '"]');
    check('المحفظة: ما تسمح باختيار رابع وتوضح السبب', (await q(page, () => document.querySelectorAll('.app-tx .tok.on').length)) === 3 && /الغِ واحد/.test(await msgText(page)));
    await mclick(page, '[data-tk="' + wrong[2] + '"]');
    check('المحفظة: إلغاء اختيار يحدث العداد', /اخترت 2 من 3/.test(await cnt()));
    await mclick(page, '#nb-go'); await sleep(250);
    check('المحفظة: ٢ فقط ما تُرسل وما تستهلك محاولة', (await attemptsLeft(page)) === 2 && /اختر ثلاثة رموز بالضبط/.test(await msgText(page)));
    await mclick(page, '[data-tkclear]');
    check('المحفظة: «امسح الاختيار» يصفّر', /اخترت 0 من 3/.test(await cnt()));
    for (const t of [...cd.d.tokens].reverse()) await mclick(page, '[data-tk="' + t + '"]');
    await mclick(page, '#nb-go'); await sleep(700);
    check('المحفظة: المجموعة الصحيحة بترتيب معكوس تنقبل (الترتيب ما يهم)', await isUsed(page));
  }

  // ===== 13) نقر مزدوج + إعادة نفس الطلب بنفس الهوية + انتهاء المكالمة أثناء الطلب =====
  {
    const cd = await newCall(page, 'code', 'all'); await openTx(page, 'op'); await clearOps(page);
    const w0 = await wallet(page);
    await mtype(page, '#f_code', cd.d.code, true);
    const b = await box(page, '#nb-go');
    await page.mouse.dblclick(b.px, b.py); await sleep(900);
    check('النقر المزدوج: طلب تحصيل واحد فقط ومكافأة وحدة', (await ops(page, 'op/collect')).length === 1 && (await wallet(page)) - w0 === 100, await ops(page, 'op/collect'));
    // إعادة الطلب بعد انقطاع الشبكة بنفس reqId
    const c2 = await newCall(page, 'code', 'all'); await openTx(page, 'op'); await clearOps(page);
    await q(page, () => { const a = CC.auth, orig = a.call; let n = 0; a.__orig = orig; a.call = function (op, body) { window.__ops.push({ op, body: JSON.parse(JSON.stringify(body || {})) }); if (op === 'op/collect' && n++ === 0) return Promise.resolve({ ok: false, error: 'network', msg: 'انقطع الاتصال بالخادم.', retryable: true }); return orig.call(a, op, body); }; });
    await mtype(page, '#f_code', c2.d.code, true); await mclick(page, '#nb-go'); await sleep(500);
    const m1 = await msgText(page), att1 = await attemptsLeft(page);
    await mclick(page, '#nb-go'); await sleep(800);
    const col = await ops(page, 'op/collect');
    check('انقطاع الشبكة ما ينحسب محاولة، وإعادة نفس الإدخال تحافظ على reqId', att1 === 3 && /ما انحسبت محاولة/.test(m1) && col.length >= 2 && new Set(col.map((c) => c.body.reqId)).size === 1 && (await isUsed(page)), { att1, col: col.map((c) => c.body.reqId) });
    await q(page, () => { CC.auth.call = CC.auth.__orig; });
    // انتهاء المكالمة أثناء الطلب
    const c3 = await newCall(page, 'code', 'all'); await openTx(page, 'op');
    const w3 = await wallet(page);
    await mtype(page, '#f_code', c3.d.code, true);
    await q(page, () => { const g = document.getElementById('nb-go'); g.click(); CC.calls.hangup(); });
    await sleep(900);
    const endd = await q(page, () => ({ st: CC.calls.state, err: window.__err || null }));
    check('انتهاء المكالمة أثناء الطلب: ما ينطبق على عملية ثانية ولا ينكسر التطبيق', (await wallet(page)) - w3 <= 100 && page._errors.length === 0, { endd, errs: page._errors });
  }

  // ===== 14) ثبات الواجهة: التحديثات ما تسحب اللاعب ولا تضيع الكتابة =====
  {
    const cd = await newCall(page, 'card', 'all'); await openTx(page, 'methods');
    await mclick(page, '.app-tx [data-card="vault"] > p');
    await q(page, () => CC.os.inst('tx').update()); await q(page, () => CC.calls.handleResult ? 0 : 0);
    check('تحديث المكالمة ما يسحب اللاعب من صفحة طريقة يتصفحها', await q(page, () => (document.querySelector('.app-tx .nb-mp') || {}).dataset.method === 'vault' && !document.getElementById('nb-form')));
    await openTx(page, 'op');
    await mtype(page, '#f_holder', 'أبو', true);
    await q(page, () => { const S = CC.auth.session; S.call.op.shown = Object.assign({}, S.call.op.shown, { cardId: 'x' }); CC.calls.call = CC.R.publicCall(S.call); CC.game.applySnap(S.snapshot()); CC.os.inst('tx').update(); });
    const st = await q(page, () => ({ v: document.getElementById('f_holder').value, f: document.activeElement && document.activeElement.id, tab: document.querySelector('.app-tx .nb-mp').dataset.method, sel: document.getElementById('f_holder').selectionStart }));
    check('تحديث الحالة أثناء الكتابة: القيمة والتركيز والمؤشر يبقون', st.v === 'أبو' && st.f === 'f_holder' && st.sel === 3, st);
    await mclick(page, '#nb-back'); await sleep(100);
    await openTx(page, 'op');
    check('المسودة تبقى بعد التنقل (رجوع للطرق ثم للعملية)', (await q(page, () => document.getElementById('f_holder').value)) === 'أبو');
    await newCall(page, 'card', 'all'); await openTx(page, 'op');
    check('المسودة تُمسح مع المكالمة الجديدة', (await q(page, () => document.getElementById('f_holder').value)) === '');
  }

  // ===== 15) الجوال: لمس + بدون تمرير أفقي =====
  const pageErrors = page._errors.slice();
  await page.close();
  const mob = await newPreviewPage(browser, { viewport: { width: 400, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await boot(mob);
  await setLife(mob, 1e7);
  await newCall(mob, 'wallet', 'all');
  await openTx(mob, 'methods');
  const tapCard = await (async () => { const b = await box(mob, '.app-tx [data-card="wallet"] > p'); if (!b) return 'missing'; await mob.touchscreen.tap(b.px, b.py); await sleep(250); return 'ok'; })();
  check('الجوال: لمس الكرت يفتح صفحة الطريقة', tapCard === 'ok' && (await q(mob, () => (document.querySelector('.app-tx .nb-mp') || {}).dataset.method)) === 'wallet');
  await mob.evaluate(() => 0);
  const cdm = await q(mob, () => CC.auth.session.call.op.data);
  await openTx(mob, 'op');
  for (const t of cdm.tokens) { const b = await box(mob, '[data-tk="' + t + '"]'); await mob.touchscreen.tap(b.px, b.py); await sleep(120); }
  const bgo = await box(mob, '#nb-go'); await mob.touchscreen.tap(bgo.px, bgo.py); await sleep(800);
  check('الجوال: اختيار الرموز بالمس والتنفيذ ينجح', await isUsed(mob));
  const ov = await q(mob, () => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, wb: (document.querySelector('.app-tx .nb-main') || {}).scrollWidth, wc: (document.querySelector('.app-tx .nb-main') || {}).clientWidth }));
  check('الجوال: بدون تمرير أفقي غير مقصود', ov.sw <= ov.iw + 1 && (ov.wb || 0) <= (ov.wc || 0) + 1, ov);
  if (SHOTS) await mob.screenshot({ path: SHOTS + '/mobile.png' });
  const mErr = mob._errors.slice();
  await mob.close();
  check('كل الاختبارات بلا أخطاء JavaScript (كمبيوتر + جوال)', pageErrors.length === 0 && mErr.length === 0, { pageErrors, mErr });

  await browser.close();
  const bad = results.filter((x) => !x).length;
  console.log('\n' + (results.length - bad) + '/' + results.length + ' passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
