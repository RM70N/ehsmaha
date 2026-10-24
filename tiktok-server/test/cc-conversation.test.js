'use strict';
// «انصب علي»: المكالمة الواردة، ذاكرة التعريف، ومنع حلقة «من أنت؟» وانعكاس الأدوار — بالقواعد والجلسة (وضع التدريب المحلي + عقل خادم وهمي).
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/cc/cc-content.js');
const R = require('../lib/cc/cc-rules.js');
const S = require('../lib/cc/cc-session.js');
const L = require('../lib/cc/cc-local-brain.js');
const B = require('../lib/cc/brain.js');

const N = R.normText;
const idAsk = (t) => R.ID_ASK_RX.test(N(t));
const reversal = (t) => R.REVERSAL_SAY_RX.test(N(t));
const hasKw = (t, sc) => (C.SCENARIOS.find((s) => s.id === sc).incoming.keywords).some((k) => N(t).includes(N(k)));

function mk(sc, pe, seed, brain) {
  const s = new S.Session({ brain: brain || new L.LocalBrain({ seed: seed || 7, latencyMs: 0 }), mode: 'local', seed: seed || 7 });
  s.profile.day = 5; s.profile.lifetimeEarned = 1e6; s.beginDay(); s.day.duration = 1e6; s.day.quota = 1e9;
  const r = s.startCall({ pick: { scenarioId: sc, personaId: pe } });
  assert.ok(r.call, JSON.stringify(r));
  return { s, call: s.call, opening: r.opening.text, id: s.call.id };
}
const say = (m, text, extra) => m.s.turn(Object.assign({ callId: m.id, msgId: 'm' + Math.random().toString(36).slice(2), text }, extra || {}));

// ---------- 1) الافتتاحية: واردة، مرتبطة بالسيناريو، ما تبدأ بـ«وش عندك؟» ----------
test('كل سيناريو: المتصل هو اللي اتصل ويطرح مشكلته بالافتتاحية (direction: incoming)', () => {
  for (const sc of C.SCENARIOS) {
    for (let seed = 1; seed <= 6; seed++) {
      const pe = sc.id === 's12' ? 'p13' : sc.id === 's00' ? 'p24' : sc.id === 's11' ? 'p12' : 'p0' + (1 + (seed % 9));
      const m = mk(sc.id, pe, seed);
      assert.equal(R.publicCall(m.call).direction, 'incoming');
      assert.ok(hasKw(m.opening, sc.id), sc.id + ': ' + m.opening);
      assert.ok(!reversal(m.opening), m.opening);
      assert.ok(!/وش عندك|مين معي|ألو، مين/.test(m.opening), m.opening);
    }
  }
});
test('الافتتاحيات ما تتحول لنص ثابت: تتنوع بين المكالمات', () => {
  const set = new Set(); for (let seed = 1; seed <= 40; seed++) set.add(mk('s01', 'p0' + (1 + (seed % 9)), seed).opening);
  assert.ok(set.size >= 6, [...set].join(' | '));
});
test('المتصل ما يبدأ بسؤال هوية الموظف: السؤال المعلّق «تأكيد الشركة» فقط', () => {
  const m = mk('s01', 'p01', 3);
  assert.equal(m.call.memory.pending && m.call.memory.pending.kind, 'company');
  assert.ok(!idAsk(m.opening));
});

// ---------- 2) أمثلة القبول ----------
test('مثال التعريف: «معك مشاري من الدعم الفني لفكسلي، وش تقول لك؟» ← يقر بالتعريف ويشرح، بدون «من أنت؟»', async () => {
  for (const pe of ['p01', 'p05', 'p06', 'p08', 'p02', 'p20']) {
    const m = mk('s01', pe, 11);
    const r = await say(m, 'وعليكم السلام، معك مشاري من الدعم الفني لفكسلي، وش تقول لك؟');
    assert.ok(r.reply, JSON.stringify(r));
    assert.ok(!idAsk(r.reply.text), pe + ': ' + r.reply.text);
    assert.ok(hasKw(r.reply.text, 's01'), pe + ': ' + r.reply.text);
    const mf = m.call.memory.facts;
    assert.equal(mf.playerName, 'مشاري'); assert.ok(mf.company && mf.introduced && mf.askedProblem);
    assert.ok(m.call.flags.introduced && m.call.steps[0].done, 'خطوة التعريف تكتمل مع حالة الحوار');
    assert.ok(!m.call.memory.pending || m.call.memory.pending.kind !== 'who', 'ما بقي سؤال هوية معلّق');
  }
});
test('مثال التعريف على رسالتين: الاسم أولاً ثم الشركة، بدون إعادة الاسم', async () => {
  const m = mk('s01', 'p05', 5);
  const r1 = await say(m, 'معك مشاري');
  assert.ok(!idAsk(r1.reply.text), r1.reply.text);
  assert.ok(/فكسلي/.test(r1.reply.text) && /\?|؟/.test(r1.reply.text), 'يسأل عن الشركة فقط: ' + r1.reply.text);
  assert.ok(!m.call.flags.introduced, 'ما اكتمل التعريف قبل الشركة');
  const r2 = await say(m, 'إيه، الدعم الفني لفكسلي');
  assert.ok(m.call.flags.introduced && m.call.steps[0].done);
  assert.ok(!idAsk(r2.reply.text) && !/اسمك|وش اسم/.test(r2.reply.text), r2.reply.text);
  assert.ok(hasKw(r2.reply.text, 's01'), r2.reply.text);
  assert.equal(m.call.memory.facts.playerName, 'مشاري');
});
test('مثال اتجاه الاتصال: «أنت اللي متصل، وش المشكلة؟» ← يعترف ولا يتهم اللاعب', async () => {
  for (const pe of ['p01', 'p03', 'p09']) {
    const m = mk('s04', pe, 9);
    const r = await say(m, 'أنت اللي متصل، وش المشكلة؟');
    assert.ok(/صح|اتصلت|المتصل|أنا اللي/.test(r.reply.text), r.reply.text);
    assert.ok(!reversal(r.reply.text) && !idAsk(r.reply.text), r.reply.text);
    assert.ok(hasKw(r.reply.text, 's04'), r.reply.text);
    const r2 = await say(m, 'تمام، كمل');
    assert.ok(!reversal(r2.reply.text), r2.reply.text);
  }
});
test('استمرارية الذاكرة: بعد أكثر من عشر رسائل الاسم والشركة والمشكلة محفوظة وتنمرر للنموذج', async () => {
  const m = mk('s02', 'p06', 4);
  await say(m, 'السلام عليكم معك فهد من قناة طبخ القطط');
  for (let i = 0; i < 12; i++) await say(m, ['طمنك الموضوع بسيط', 'لا تشيل هم', 'خلني أوضح لك أكثر، الاشتراك تجدد تلقائياً', 'ما عليك أنا معك'][i % 4]);
  const mf = m.call.memory.facts;
  assert.equal(mf.playerName, 'فهد'); assert.ok(mf.company);
  const first = m.call.memory.history.find((h) => h.r === 'p');
  const last8 = m.call.memory.history.slice(-8);
  assert.ok(!last8.includes(first), 'رسالة التعريف خرجت من نافذة آخر الرسائل');
  const prompt = B.buildPrompt({ call: m.call, persona: R.persona(m.call.personaId), scenario: R.scenario(m.call.scenarioId), gate: R.gateFor(m.call), text: 'وش رايك؟' });
  assert.ok(prompt.includes('فهد') && prompt.includes('"companyConfirmed":true') && prompt.includes('"introductionComplete":true'), 'الحقائق بالبرومبت');
  assert.ok(prompt.includes('"problem"') && prompt.includes('اشتراكه'), 'المشكلة بالبرومبت');
  assert.ok(!/وش اسمك|من أنت؟/.test(m.call.memory.history.filter((h) => h.r === 'c').slice(1).map((h) => h.t).join(' ')), 'ما سأل عن الهوية بالحوار كله');
});
test('البرومبت ما يمرر قيم سرية ولا رموز العملية غير المكشوفة', () => {
  const m = mk('s01', 'p05', 2); m.s.setMethod({ callId: m.id, method: 'code' });
  const prompt = B.buildPrompt({ call: m.call, persona: R.persona(m.call.personaId), scenario: R.scenario(m.call.scenarioId), gate: R.gateFor(m.call), text: 'اعطني الرمز' });
  const secrets = [m.call.op.data.code, m.call.op.data.fake, m.call.facts.code, m.call.facts.fakeCode].filter(Boolean);
  for (const sec of secrets) assert.ok(!prompt.includes(sec), 'تسرب ' + sec);
});

// ---------- 3) منع الحلقة: عقل خادم «سيء» يرجع أسئلة هوية وانعكاس أدوار وتكرار ----------
function fakeBrain(sayFn, analysisFn) {
  return { kind: 'fake', turn: async (ctx) => ({ analysis: analysisFn ? analysisFn(ctx) : { intent: 'greet', claims: [] }, say: sayFn(ctx), usage: {} }) };
}
test('عقل بيرد «من أنت؟» كل دور: بعد التعريف الرد النهائي يتصحح لحالة المكالمة', async () => {
  const m = mk('s01', 'p05', 6, fakeBrain(() => 'من أنت؟ عرّف بنفسك أول.'));
  const r = await say(m, 'معك مشاري من الدعم الفني لفكسلي، وش المشكلة؟');
  assert.ok(!idAsk(r.reply.text), r.reply.text); assert.ok(hasKw(r.reply.text, 's01'), r.reply.text);
  for (let i = 0; i < 4; i++) { const x = await say(m, 'أنا أسمعك كمل'); assert.ok(!idAsk(x.reply.text), x.reply.text); }
  assert.ok(m.call.memory.loopHits >= 1);
});
test('عقل يعكس الأدوار («أنت اللي اتصلت علي»): الرد النهائي يتصحح', async () => {
  const m = mk('s01', 'p05', 6, fakeBrain(() => 'أنت اللي اتصلت علي، وش تبي مني؟'));
  const r = await say(m, 'معك مشاري من فكسلي، وش المشكلة؟');
  assert.ok(!reversal(r.reply.text), r.reply.text);
});
test('عقل يكرر نفس الجملة: ما تتكرر حرفياً', async () => {
  const m = mk('s05', 'p14', 3, fakeBrain(() => 'طيب كمل لو سمحت بالتفاصيل.'));
  await say(m, 'معك سعد من مزرعة الجمال الطائرة، وش المشكلة؟');
  const a = await say(m, 'تمام كمل'), b = await say(m, 'تمام كمل'), c = await say(m, 'تمام كمل');
  assert.notEqual(N(b.reply.text), N(a.reply.text)); assert.notEqual(N(c.reply.text), N(b.reply.text));
});
test('عقل يرد بجملة عامة لما اللاعب يسأل عن المشكلة: يُستبدل بمشكلة السيناريو', async () => {
  const m = mk('s04', 'p06', 8, fakeBrain(() => 'هلا والله، تفضل.'));
  const r = await say(m, 'وش مشكلتك؟');
  assert.ok(hasKw(r.reply.text, 's04'), r.reply.text);
});
test('رد النموذج الجيد (يتوافق مع الحالة) يمر بدون استبدال', async () => {
  const good = 'إيه تمام يا مشاري، المشكلة إن الثلاجة تطلب مني بطيخ كل ساعة.';
  const m = mk('s01', 'p05', 6, fakeBrain(() => good));
  const r = await say(m, 'معك مشاري من الدعم الفني لفكسلي، وش المشكلة؟');
  assert.equal(r.reply.text, good);
});

// ---------- 4) اختلافات النطق والتصحيح والتناقض ----------
test('نطق قريب لاسم الشركة ينقبل، واسم شركة مختلفة ما ينقبل', async () => {
  for (const [txt, ok] of [['معك مشاري من فيكسلي', true], ['معك مشاري من فكسلى', true], ['معك مشاري من الدعم الفني لفكسلي', true], ['معك مشاري من شركة الجوال', false], ['معك مشاري من فسكلي للتقنية', false]]) {
    const m = mk('s01', 'p05', 6); await say(m, txt);
    assert.equal(!!m.call.memory.facts.company, ok, txt);
    assert.equal(!!m.call.flags.introduced, ok, txt);
  }
  // الاسم القريب من اسم الشركة المحلي ما يتحول لشركة
  assert.equal(R.fuzzyHas('معك كمال', ['الجمال']), null);
});
test('التصحيح الواضح ما يعاقب، والتناقض الحقيقي يتسجل', async () => {
  const a = mk('s01', 'p05', 6); await say(a, 'معك مشاري من فكسلي');
  const ra = await say(a, 'قصدي اسمي مشعل');
  assert.ok(!ra.events.some((e) => e.type === 'contradiction')); assert.equal(a.call.memory.facts.playerName, 'مشعل');
  const b = mk('s01', 'p05', 6); await say(b, 'معك مشاري من فكسلي');
  const rb = await say(b, 'أنا سعد');
  assert.ok(rb.events.some((e) => e.type === 'contradiction'), 'اسم مختلف تماماً بدون تصحيح');
  const c = mk('s01', 'p05', 6); await say(c, 'معك مشاري من فكسلي');
  const rc = await say(c, 'معك مشارى');
  assert.ok(!rc.events.some((e) => e.type === 'contradiction'), 'فرق تهجئة بسيط');
});
test('السؤال المعلّق يتمثل بنوعه: فرق بين «من أنت؟» و«ليش تحتاج هالمعلومة؟»', () => {
  const m = mk('s01', 'p05', 1);
  assert.equal(R.callerQuestionKind('وش اسمك؟', m.call), 'who');
  assert.equal(R.callerQuestionKind('هذا دعم فكسلي؟', m.call), 'company');
  assert.equal(R.callerQuestionKind('ليش تحتاج هالمعلومة؟', m.call), 'why');
  assert.equal(R.callerQuestionKind('تمام، كمل.', m.call), null);
});
test('تحية لحالها: يطلب تأكيد الشركة مرتين كحد أقصى ثم يشرح مشكلته', async () => {
  const m = mk('s01', 'p05', 12);
  const t = [];
  for (let i = 0; i < 4; i++) t.push((await say(m, 'السلام عليكم')).reply.text);
  assert.ok(t.slice(2).every((x) => hasKw(x, 's01')), t.join(' | '));
});

// ---------- 5) تسلسل المكالمات والأعطال ----------
test('مكالمات متتالية: ما فيه تسرب ذاكرة من مكالمة لثانية', async () => {
  const s = new S.Session({ brain: new L.LocalBrain({ seed: 3, latencyMs: 0 }), mode: 'local', seed: 3 });
  s.profile.day = 5; s.beginDay(); s.day.duration = 1e6; s.day.quota = 1e9;
  const r1 = s.startCall({ pick: { scenarioId: 's01', personaId: 'p05' } });
  await s.turn({ callId: r1.call.id, msgId: 'a1', text: 'معك مشاري من فكسلي، وش المشكلة؟' });
  s.endCall({ callId: r1.call.id, reason: 'hangup' }); s.clearCall();
  const r2 = s.startCall({ pick: { scenarioId: 's04', personaId: 'p06' } });
  const mf = s.call.memory.facts;
  assert.equal(mf.playerName, null); assert.ok(!mf.company && !mf.introduced && !mf.askedProblem);
  assert.deepEqual(Object.keys(s.call.memory.claims), []);
  const old = await s.turn({ callId: r1.call.id, msgId: 'a2', text: 'متأخر' });
  assert.ok(old.stale || old.error, 'رد مكالمة منتهية ما يروح لمكالمة جديدة');
  assert.equal(s.call.memory.history.filter((h) => h.r === 'p').length, 0);
});
test('فشل خدمة المحادثة: الرسالة ما تنحسب والثقة والصبر ما يتغيرون', async () => {
  const m = mk('s01', 'p05', 6, { kind: 'fake', turn: async () => { throw { code: 'timeout', retryable: true, userMsg: 'تأخر' }; } });
  const before = JSON.stringify(m.call.meters), turns = m.call.turns;
  const r = await say(m, 'معك مشاري من فكسلي');
  assert.equal(r.error, 'timeout'); assert.equal(JSON.stringify(m.call.meters), before); assert.equal(m.call.turns, turns);
  assert.equal(m.call.memory.facts.playerName, null, 'الحقائق ما تتسجل برسالة ما انحسبت');
});
test('لاعب قاطع المتصل: السجل يعلّم جملته المنقطعة', async () => {
  const m = mk('s01', 'p05', 6);
  await say(m, 'هلا', { interrupted: true });
  const firstC = m.call.memory.history.find((h) => h.r === 'c');
  assert.equal(firstC.cut, true);
});
test('رسالة بصوت أو بكتابة: نفس المسار ونفس النتيجة', async () => {
  const a = mk('s01', 'p05', 21), b = mk('s01', 'p05', 21);
  const ra = await say(a, 'معك مشاري من الدعم الفني لفكسلي، وش المشكلة؟');
  const rb = await b.s.turn({ callId: b.id, msgId: 'v1', text: 'معك مشاري من الدعم الفني لفكسلي، وش المشكلة؟', via: 'voice' });
  assert.equal(ra.reply.text, rb.reply.text); assert.equal(JSON.stringify(a.call.meters), JSON.stringify(b.call.meters));
});
test('إعادة إرسال نفس msgId ما تكرر الدور', async () => {
  const m = mk('s01', 'p05', 6);
  const a = await m.s.turn({ callId: m.id, msgId: 'same', text: 'معك مشاري من فكسلي' });
  const n = m.call.turns, b = await m.s.turn({ callId: m.id, msgId: 'same', text: 'معك مشاري من فكسلي' });
  assert.equal(m.call.turns, n); assert.equal(a.reply.text, b.reply.text);
});
test('كل نوع شخصية: ما فيه حلقة «من أنت؟» بحوار كامل بعد التعريف (٢٤ شخصية × سيناريوهات)', async () => {
  const personas = C.PERSONAS.filter((p) => !['saboteur', 'time_waster', 'tester'].includes(p.archetype));
  for (const p of personas) {
    for (const sc of ['s01', 's02', 's05']) {
      const m = mk(sc, p.id, 31);
      const co = C.SCENARIOS.find((s) => s.id === sc).company;
      await say(m, 'السلام عليكم معك مشاري من ' + co + '، وش مشكلتك؟');
      for (const t of ['أبشر، خلني أفهم أكثر', 'لا تشيل هم', 'وش اللي صار بعدها؟', 'طيب وش تبي مني بالضبط؟']) {
        if (m.call.status !== 'active') break;
        const r = await say(m, t);
        if (r.reply) assert.ok(!idAsk(r.reply.text) && !reversal(r.reply.text), p.id + '/' + sc + ': ' + r.reply.text);
      }
    }
  }
});

// ---------- مهلة المكالمة محذوفة + إنهاء عند أدنى ثقة + إنهاء عند نهاية الدوام ----------
test('ما فيه مهلة للمكالمة: مرور وقت أطول من الحد القديم ما يقفلها', async () => {
  const m = mk('s01', 'p05', 3);
  m.s.call.startedAt -= 3 * 3600e3; // المكالمة بدأت قبل ٣ ساعات (الحد القديم ٥ دقايق)، وآخر رسالة قبل لحظات
  const r = await say(m, 'السلام عليكم');
  assert.ok(r.reply, JSON.stringify(r));
  assert.equal(m.s.call.status, 'active');
  assert.notEqual(m.s.call.endReason, 'timeout');
});

test('ثقة المتصل على أدنى حد: تنقفل المكالمة بسبب «trust»', async () => {
  const m = mk('s01', 'p05', 3);
  m.s.call.meters.trust = 0;
  const r = await say(m, 'ايش');
  assert.equal(m.s.call.status !== 'active', true, JSON.stringify(r.decision || r));
  assert.equal(m.s.call.endReason, 'trust');
});

test('نهاية الدوام وفيه مكالمة: تنقفل تلقائياً فوراً (محايدة)', () => {
  const m = mk('s01', 'p05', 3);
  m.s.day.duration = 600; m.s.day.startedAt = m.s.now() - 601 * 1000;
  const out = m.s.tick();
  assert.ok(out.forced, JSON.stringify(out));
  assert.equal(m.s.call.status !== 'active', true);
  assert.equal(m.s.call.endReason, 'overtime');
  assert.equal(m.s.day.phase, 'closed');
});
