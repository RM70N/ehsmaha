// SPECIAL EVENTS: الخدمة (تحقق/عزل/سجل/مجموعات) + المحرك (أنماط التشغيل/التعارض/الاستعادة/منع التكرار) + HTTP
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventsService, EvError } from '../src/batmish/events/service.js';
import { PrefixedStore, MemoryStore } from '../src/batmish/store.js';
import { EVENT_GAMES, EVENT_BY_ID, IMPLEMENTED, NOT_FOUND_GAMES } from '../src/batmish/events/catalog.js';
import { handleEvents } from '../src/batmish/events/http.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const core = require('../../batmish/events/engine-core.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mk = () => new EventsService({ store: new PrefixedStore(new MemoryStore(), 'ev_') });
const rej = async (p, code) => { try { await p; assert.fail('كان يجب أن يُرفض: ' + code); } catch (e) { assert.ok(e instanceof EvError, String(e)); assert.equal(e.code, code); } };

// ----------------------------------------------------------------------------------- الكتالوج
test('الكتالوج: 31 لعبة موجودة × 5 أحداث = 155، واللعبتان غير الموجودتين لم تُنشآ', () => {
  assert.equal(Object.keys(EVENT_GAMES).length, 31);
  for (const g of Object.values(EVENT_GAMES)) assert.equal(g.events.length, 5, g.tag);
  assert.equal(Object.keys(EVENT_BY_ID).length, 155);
  assert.deepEqual(NOT_FOUND_GAMES, ['لعبة التاج', 'فعالية الستريمر']);
  assert.ok(!EVENT_GAMES['crown'] && !EVENT_GAMES['streamer_event']);
});
test('الكتالوج: كل لعبة في الأحداث موجودة فعلاً كبطاقة في index.html', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  for (const tag of Object.keys(EVENT_GAMES)) assert.ok(html.includes('data-tag="' + tag + '"'), 'لا توجد بطاقة للعبة ' + tag);
});
test('الكتالوج: كل حدث «مربوط» له Adapter فعلي في adapters.js، ولا Adapter لحدث غير مربوط', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'batmish', 'events', 'adapters.js'), 'utf8');
  for (const id of Object.keys(IMPLEMENTED)) assert.ok(src.includes("'" + id + "': {") || src.includes("['" + id + "'] ="), 'لا Adapter للحدث ' + id);
  for (const m of src.matchAll(/'([a-z0-9-]+\.e\d)'(?:: \{|\] =)/g)) assert.ok(IMPLEMENTED[m[1]], 'Adapter لحدث غير معلن مربوطاً: ' + m[1]);
  assert.equal(Object.keys(IMPLEMENTED).length, 155, 'كل أحداث الكتالوج الـ155 مربوطة');
});

// ----------------------------------------------------------------------------------- الخدمة
test('الخدمة: حفظ حدث مربوط وإعدادات اللعبة، والتحقق من الأنواع والمدى', async () => {
  const s = mk();
  await s.setGame('u1', 'cw', { mode: 'hybrid', intensity: 'high', minGapSec: 10, maxPerRound: 4 });
  const r = await s.setEvent('u1', 'cw', 'cw.e3', { enabled: true, probability: 55, maxPerRound: 2 });
  assert.equal(r.event.enabled, true);
  const st = await s.getState('u1');
  assert.equal(st.games.cw.mode, 'hybrid'); assert.equal(st.games.cw.events['cw.e3'].probability, 55);
  await rej(s.setEvent('u1', 'cw', 'cw.e3', { probability: 0 }), 'out_of_range');
  await rej(s.setEvent('u1', 'cw', 'cw.e3', { probability: 'x' }), 'invalid_type');
  await rej(s.setEvent('u1', 'cw', 'cw.e3', { nope: 1 }), 'unknown_setting');
  await rej(s.setGame('u1', 'cw', { mode: 'chaos' }), 'invalid_option');
  await rej(s.setEvent('u1', 'bomb', 'cw.e3', { enabled: true }), 'unknown_event');
  await rej(s.setEvent('u1', 'nogame', 'x', {}), 'unknown_event');
  await rej(s.setEvent('u1', 'cw', 'cw.e3', { fromSec: 100, toSec: 20 }), 'invalid_window');
});
test('الخدمة: لا يُفعَّل حدث غير مربوط بمحرك لعبته (لا أزرار وهمية)', async () => {
  const s = mk();
  assert.equal(Object.values(EVENT_BY_ID).filter((e) => !e.implemented).length, 0);
  // الحارس ما زال يعمل: حدث غير مربوط (نفترضه مؤقتاً) لا يُفعَّل
  const e = EVENT_BY_ID['bomb.e1'], prev = e.implemented; e.implemented = false;
  try { await rej(s.setEvent('u1', 'bomb', 'bomb.e1', { enabled: true }), 'event_not_supported'); } finally { e.implemented = prev; }
});
test('العزل: إعدادات وسجل ومجموعات كل uid مستقلة تماماً', async () => {
  const s = mk();
  await s.setEvent('zvd4', 'cw', 'cw.e1', { enabled: true, probability: 90 });
  await s.setGame('zvd4', 'cw', { mode: 'manual' });
  await s.record('zvd4', { key: 'r1:cw.e1:0', tag: 'cw', eventId: 'cw.e1', status: 'completed', effect: 'x' });
  await s.profileOp('zvd4', 'create', { tag: 'cw', name: 'فوضى' });
  const other = await s.getState('other');
  assert.deepEqual(other.games, {}); assert.deepEqual(other.profiles, {});
  assert.equal((await s.history('other')).history.length, 0);
  assert.equal((await s.history('zvd4')).history.length, 1);
  await s.setEvent('other', 'cw', 'cw.e1', { enabled: false });
  assert.equal((await s.getState('zvd4')).games.cw.events['cw.e1'].enabled, true);
});
test('الخدمة: تعارض النسخ (baseRev) يُرفض', async () => {
  const s = mk(); const a = await s.setGame('u', 'cw', { mode: 'random' });
  await s.setGame('u', 'cw', { mode: 'manual' });
  try { await s.setGame('u', 'cw', { mode: 'hybrid' }, { baseRev: a.rev }); assert.fail(); } catch (e) { assert.equal(e.code, 'conflict'); assert.equal(e.rev, 2); }
});
test('الخدمة: كتابات متزامنة لنفس الحساب لا تضيع (قفل تسلسلي)', async () => {
  const s = mk();
  await Promise.all(Array.from({ length: 20 }, (_, i) => s.record('u', { key: 'k' + i, tag: 'cw', eventId: 'cw.e1', status: 'completed' })));
  assert.equal((await s.history('u', { limit: 500 })).history.length, 20);
});
test('السجل: idempotency — إعادة إرسال نفس المفتاح لا تكرّر الحدث', async () => {
  const s = mk(); const e = { key: 'round1:cw.e2:0', tag: 'cw', eventId: 'cw.e2', status: 'completed', effect: 'تأثير' };
  const a = await s.record('u', e), b = await s.record('u', e);
  assert.ok(a.id); assert.equal(b.duplicate, true);
  assert.equal((await s.history('u')).history.length, 1);
});
test('السجل: failed يتطلب سبباً حقيقياً، وحالات/مفاتيح غير صالحة تُرفض، وفلاتر اللعبة والحالة', async () => {
  const s = mk();
  await rej(s.record('u', { key: 'a', tag: 'cw', eventId: 'cw.e1', status: 'failed' }), 'reason_required');
  await rej(s.record('u', { key: 'a', tag: 'cw', eventId: 'cw.e1', status: 'ok' }), 'invalid_status');
  await rej(s.record('u', { key: '', tag: 'cw', eventId: 'cw.e1', status: 'completed' }), 'invalid_key');
  await rej(s.record('u', { key: 'a', tag: 'bomb', eventId: 'cw.e1', status: 'completed' }), 'unknown_event');
  await s.record('u', { key: 'a', tag: 'cw', eventId: 'cw.e1', status: 'failed', reason: 'apply_error:x' });
  await s.record('u', { key: 'b', tag: 'cw', eventId: 'cw.e2', status: 'completed' });
  await s.record('u', { key: 'c', tag: 'cw', eventId: 'cw.e3', status: 'cancelled', reason: 'round_end' });
  const all = await s.history('u'); assert.deepEqual([all.stats.completed, all.stats.cancelled, all.stats.failed], [1, 1, 1]);
  assert.equal((await s.history('u', { status: 'failed' })).history[0].reason, 'apply_error:x');
  assert.equal((await s.history('u', { tag: 'bomb' })).history.length, 0);
  assert.equal((await s.history('u', { from: Date.now() + 99999 })).history.length, 0);
});
test('المجموعات: إنشاء/نسخ/إعادة تسمية/حذف/تطبيق، ولا تطبيق على لعبة أخرى', async () => {
  const s = mk();
  await s.setGame('u', 'cw', { mode: 'scheduled', intensity: 'extreme' });
  await s.setEvent('u', 'cw', 'cw.e4', { enabled: true, probability: 70 });
  const { profile } = await s.profileOp('u', 'create', { tag: 'cw', name: 'وضع الفوضى' });
  await rej(s.profileOp('u', 'create', { tag: 'cw', name: 'وضع الفوضى' }), 'duplicate_name');
  await rej(s.profileOp('u', 'create', { tag: 'cw', name: '' }), 'invalid_name');
  const dup = (await s.profileOp('u', 'duplicate', { id: profile.id })).profile; assert.match(dup.name, /نسخة/);
  await s.setGame('u', 'cw', { mode: 'manual' }); await s.setEvent('u', 'cw', 'cw.e4', { enabled: false });
  await s.profileOp('u', 'apply', { id: profile.id, tag: 'cw' });
  const st = await s.getState('u'); assert.equal(st.games.cw.mode, 'scheduled'); assert.equal(st.games.cw.events['cw.e4'].enabled, true);
  await rej(s.profileOp('u', 'apply', { id: profile.id, tag: 'bomb' }), 'profile_wrong_game');
  await s.profileOp('u', 'rename', { id: profile.id, name: 'ليلة النجاة' });
  await s.profileOp('u', 'delete', { id: dup.id }); await rej(s.profileOp('u', 'apply', { id: dup.id }), 'not_found');
  await rej(s.profileOp('other', 'apply', { id: profile.id }), 'not_found');   // لا تُرى مجموعة حساب آخر
});

// ----------------------------------------------------------------------------------- المحرك
function makeCatalog() {
  return { games: Object.values(EVENT_GAMES).map((g) => ({ tag: g.tag, name: g.name, events: g.events.map((e) => ({ id: e.id, tag: e.tag, name: e.name, implemented: e.implemented, type: e.type, group: e.group, durationSec: e.durationSec, extra: (IMPLEMENTED[e.id] || { fields: [] }).fields })) })) };
}
function rig(stateGames, opts = {}) {
  let t = 1_000_000; const rows = []; const log = []; let intervals = 0;
  const world = { over: false, turn: 'A', countries: ['a', 'b', 'c', 'd'], alliance: null, log };
  const mkEv = (id, extra = {}) => ({
    canRun: () => (world.blockRun ? { ok: false, reason: 'not_ready' } : true),
    apply: (ctx, inst) => { log.push('apply:' + id); return { effect: 'fx-' + id, sustain: true, revert: (st) => log.push('revert:' + id + ':' + st) }; },
    durationMs: () => 5000, ...extra,
  });
  const adapter = { tag: 'cw', windowSec: () => opts.windowSec || 60, isRoundOver: () => world.over, events: { 'cw.e1': mkEv('cw.e1'), 'cw.e2': mkEv('cw.e2'), 'cw.e3': mkEv('cw.e3', { durationMs: () => 0, apply: () => { log.push('apply:cw.e3'); return { effect: 'instant' }; } }), 'cw.e4': mkEv('cw.e4'), 'cw.e5': mkEv('cw.e5', { condition: () => world.final, durationMs: () => 0, apply: () => { log.push('apply:cw.e5'); return { effect: 'final', sustain: true, revert: (s) => log.push('revert:cw.e5:' + s) }; }, shouldEnd: () => world.over }) } };
  const pres = [];
  const eng = core.createEngine({ now: () => t, rng: opts.rng || (() => 0), setInterval: () => { intervals++; return 1; }, clearInterval: () => { intervals--; }, record: (r) => rows.push(r), presenter: { start: (i, d) => pres.push('start:' + d.id), end: (i, d, s) => pres.push('end:' + d.id + ':' + s), warn: () => pres.push('warn') } });
  eng.setCatalog(makeCatalog()); eng.setState({ rev: 1, games: stateGames }); eng.registerAdapter(adapter);
  const adv = (ms) => { for (let i = 0; i < ms / 500; i++) { t += 500; eng.tick(); } };
  return { eng, adv, rows, world, log, pres, intervals: () => intervals, now: () => t };
}
const on = (...ids) => Object.fromEntries(ids.map((id) => [id, { enabled: true, probability: 100, fromSec: 2, toSec: 0, maxPerRound: 1 }]));

test('المحرك: العشوائي — حدث مفعّل بنسبة 100% يظهر ضمن النافذة ويؤثر ثم يُستعاد ويُسجَّل مكتملاً', () => {
  const r = rig({ cw: { mode: 'random', events: on('cw.e1') } });
  r.eng.beginRound('cw', { roundId: 'R1' });
  assert.equal(r.log.length, 0); r.adv(1000); assert.equal(r.log.length, 0);
  r.adv(3000); assert.deepEqual(r.log, ['apply:cw.e1']);
  assert.equal(r.eng.status().active.length, 1);
  r.adv(6000); assert.deepEqual(r.log, ['apply:cw.e1', 'revert:cw.e1:completed']);
  assert.equal(r.rows.length, 1); assert.equal(r.rows[0].status, 'completed'); assert.equal(r.rows[0].effect, 'fx-cw.e1'); assert.equal(r.rows[0].roundId, 'R1');
  assert.equal(r.eng.status().active.length, 0);
});
test('المحرك: المعطّل لا يعمل أبداً، والاحتمال 1% بنسبة rng عالية لا يظهر', () => {
  const r = rig({ cw: { mode: 'random', events: { 'cw.e1': { enabled: false, probability: 100 }, 'cw.e2': { enabled: true, probability: 1, fromSec: 2 } } } }, { rng: () => 0.9 });
  r.eng.beginRound('cw', {}); r.adv(30000); assert.equal(r.log.length, 0); assert.equal(r.rows.length, 0);
});
test('المحرك: اليدوي — لا شيء تلقائياً، والتشغيل اليدوي يمر بنفس خط التنفيذ ويُسجَّل', () => {
  const r = rig({ cw: { mode: 'manual', events: on('cw.e1') } });
  r.eng.beginRound('cw', {}); r.adv(20000); assert.equal(r.log.length, 0);
  const res = r.eng.trigger('cw', 'cw.e1'); assert.equal(res.ok, true); assert.deepEqual(r.log, ['apply:cw.e1']);
  assert.equal(r.eng.trigger('cw', 'cw.e9').ok, false); assert.equal(r.eng.trigger('bomb', 'bomb.e1').reason, 'no_active_round');
  assert.equal(r.eng.trigger('cw', 'cw.e1').ok, false, 'نفس المجموعة تعمل الآن → تعارض');
});
test('المحرك: المجدول — كل حدث بتوقيت fromSec بدل العشوائي', () => {
  const r = rig({ cw: { mode: 'scheduled', minGapSec: 0, events: { 'cw.e1': { enabled: true, fromSec: 4 }, 'cw.e2': { enabled: true, fromSec: 12 } } } }, { rng: () => 0.99 });
  r.eng.beginRound('cw', {}); r.adv(3000); assert.equal(r.log.length, 0);
  r.adv(1500); assert.deepEqual(r.log, ['apply:cw.e1']);
  r.adv(8000); assert.ok(r.log.includes('apply:cw.e2'));
});
test('المحرك: الهجين — المجدول بتوقيته والعشوائي بنسبته', () => {
  const ev = { 'cw.e1': { enabled: true, probability: 100, fromSec: 3 }, 'cw.e2': { enabled: true, probability: 100, fromSec: 3 } };
  const r = rig({ cw: { mode: 'hybrid', events: ev } });
  r.eng.beginRound('cw', {}); r.adv(60000);
  assert.ok(r.log.includes('apply:cw.e1') && r.log.includes('apply:cw.e2'));
});
test('المحرك: أحداث الشرط (نهائي) لا تظهر قبل تحقق الشرط، وتظهر مرة واحدة عند تحققه', () => {
  const r = rig({ cw: { mode: 'random', events: { 'cw.e5': { enabled: true, probability: 100, fromSec: 0 } } } });
  r.eng.beginRound('cw', {}); r.adv(20000); assert.equal(r.log.length, 0);
  r.world.final = true; r.adv(2000); assert.deepEqual(r.log, ['apply:cw.e5']); r.adv(10000); assert.equal(r.log.filter((x) => x === 'apply:cw.e5').length, 1);
});
test('التعارض: حدثان بنفس مجموعة التعارض لا يعملان معاً (cw.e4 وcw.e5 من cw.double)', () => {
  assert.equal(EVENT_BY_ID['cw.e4'].group, 'cw.double'); assert.equal(EVENT_BY_ID['cw.e5'].group, 'cw.double');
  const r = rig({ cw: { mode: 'random', events: { 'cw.e4': { enabled: true, probability: 100, fromSec: 1, maxPerRound: 1 }, 'cw.e5': { enabled: true, probability: 100, fromSec: 0 } } } });
  r.world.final = true; r.eng.beginRound('cw', {});
  r.adv(3000);
  const applied = r.log.filter((x) => x.startsWith('apply:'));
  assert.equal(applied.length, 1, 'لا يعمل الاثنان معاً: ' + r.log.join(','));
});
test('التعارض: يعمل حدثان من مجموعتين مختلفتين بالتوازي، والجولة لا تتوقف عند التعارض', () => {
  const r = rig({ cw: { mode: 'random', events: on('cw.e1', 'cw.e2') } });
  r.eng.beginRound('cw', {}); r.adv(3500);
  assert.equal(r.eng.status().active.length, 2);
});
test('الاستعادة: انتهاء الجولة أثناء حدث يلغيه ويستعيد الحالة ويسجله «ملغي» وينظّف المؤقت', () => {
  const r = rig({ cw: { mode: 'random', events: on('cw.e1') } });
  r.eng.beginRound('cw', { roundId: 'R9' }); assert.equal(r.intervals(), 1); r.adv(3000);
  assert.equal(r.eng.status().active.length, 1);
  r.world.over = true; r.adv(500);
  assert.ok(r.log.includes('revert:cw.e1:cancelled')); assert.equal(r.rows[r.rows.length - 1].status, 'cancelled'); assert.equal(r.rows[r.rows.length - 1].reason, 'round_over');
  assert.equal(r.intervals(), 0, 'المؤقت المركزي أُوقف'); assert.equal(r.eng.status().rounds.length, 0);
});
test('الاستعادة: إيقاف حدث يدوياً أثناء تنفيذه', () => {
  const r = rig({ cw: { mode: 'manual', events: on('cw.e2') } });
  r.eng.beginRound('cw', {}); const inst = r.eng.trigger('cw', 'cw.e2').instance;
  assert.equal(r.eng.cancelEvent('cw', inst.id), true); assert.deepEqual(r.log, ['apply:cw.e2', 'revert:cw.e2:cancelled']); assert.equal(r.rows[0].reason, 'manual_cancel');
});
test('الاستعادة: بدء جولة جديدة قبل نهاية السابقة يلغي أحداثها ولا يخلط الحالة', () => {
  const r = rig({ cw: { mode: 'manual', events: on('cw.e1') } });
  r.eng.beginRound('cw', { roundId: 'A' }); r.eng.trigger('cw', 'cw.e1'); r.eng.beginRound('cw', { roundId: 'B' });
  assert.ok(r.log.includes('revert:cw.e1:cancelled')); assert.equal(r.eng.status().active.length, 0); assert.equal(r.rows[0].roundId, 'A');
});
test('الحدود: أقصى أحداث بالراوند وأقل فاصل بين الأحداث', () => {
  const evs = { 'cw.e1': { enabled: true, probability: 100, fromSec: 1, maxPerRound: 1 }, 'cw.e2': { enabled: true, probability: 100, fromSec: 1 }, 'cw.e3': { enabled: true, probability: 100, fromSec: 1 } };
  const r = rig({ cw: { mode: 'random', maxPerRound: 2, minGapSec: 0, events: evs } });
  r.eng.beginRound('cw', {}); r.adv(30000);
  assert.equal(r.log.filter((x) => x.startsWith('apply:')).length, 2);
  assert.ok(r.rows.some((x) => x.status === 'cancelled' && x.reason === 'round_limit'));
});
test('الحدود: الفاصل الزمني بين حدثين من مجموعتين مختلفتين يُحترم', () => {
  const r = rig({ cw: { mode: 'random', minGapSec: 20, maxPerRound: 5, events: { 'cw.e3': { enabled: true, probability: 100, fromSec: 1 }, 'cw.e2': { enabled: true, probability: 100, fromSec: 1 } } } }, { windowSec: 120 });
  r.eng.beginRound('cw', {}); r.adv(3000); const first = r.log.filter((x) => x.startsWith('apply:')).length; assert.ok(first >= 1);
  r.adv(5000); // انتهى حدث cw.e2 (5ث)
  const mid = r.log.filter((x) => x.startsWith('apply:')).length;
  r.adv(25000); assert.ok(r.log.filter((x) => x.startsWith('apply:')).length >= mid);
});
test('الموثوقية: فشل apply يُسجَّل «فشل» بسبب حقيقي ولا يوقف الجولة، وشروط غير جاهزة تُؤجَّل ثم تُلغى بسبب', () => {
  const r = rig({ cw: { mode: 'manual', events: on('cw.e1', 'cw.e2') } });
  r.eng._adapters.cw.events['cw.e1'].apply = () => { throw new Error('boom'); };
  r.eng.beginRound('cw', {}); assert.equal(r.eng.trigger('cw', 'cw.e1').ok, false);
  assert.equal(r.rows[0].status, 'failed'); assert.match(r.rows[0].reason, /apply_error:boom/);
  r.world.blockRun = true; assert.equal(r.eng.trigger('cw', 'cw.e2').ok, false); assert.equal(r.eng.status().active.length, 0);
});
test('الموثوقية: فشل الاستعادة (revert) يُسجَّل «فشل» لا «مكتمل»', () => {
  const r = rig({ cw: { mode: 'manual', events: on('cw.e1') } });
  r.eng._adapters.cw.events['cw.e1'].apply = () => ({ sustain: true, effect: 'x', revert: () => { throw new Error('bad'); } });
  r.eng.beginRound('cw', {}); const i = r.eng.trigger('cw', 'cw.e1').instance; r.eng.cancelEvent('cw', i.id);
  assert.equal(r.rows[0].status, 'failed'); assert.match(r.rows[0].reason, /revert_error/);
});
test('منع التكرار: نفس المفتاح لا يُنفَّذ مرتين، ولا يتراكم أكثر من مؤقت واحد', () => {
  const r = rig({ cw: { mode: 'random', events: on('cw.e1') } });
  r.eng.beginRound('cw', { roundId: 'R' }); r.eng.beginRound('cw', { roundId: 'R2' }); r.eng.beginRound('cw', { roundId: 'R3' });
  assert.equal(r.intervals(), 1);
  r.adv(60000); const keys = r.rows.map((x) => x.key); assert.equal(new Set(keys).size, keys.length);
});
test('العزل: لقطة الإعدادات تُؤخذ عند بداية الجولة — تغيير الإعدادات أثناءها لا يؤثر عليها', () => {
  const r = rig({ cw: { mode: 'random', events: on('cw.e1') } });
  r.eng.beginRound('cw', {});
  r.eng.setState({ rev: 2, games: { cw: { mode: 'random', events: { 'cw.e1': { enabled: false } } } } });
  r.adv(4000); assert.deepEqual(r.log, ['apply:cw.e1']);
  r.eng.endRound('cw', 'x'); r.eng.beginRound('cw', {}); r.adv(10000); assert.equal(r.log.filter((x) => x === 'apply:cw.e1').length, 1, 'الجولة التالية ترى الإعداد الجديد (معطّل)');
});
test('الأداء: 500 جولة متتالية بأحداث لا تترك مؤقتات ولا جولات نشطة ولا تراكم حالة', () => {
  const r = rig({ cw: { mode: 'random', events: on('cw.e1', 'cw.e2', 'cw.e3') } });
  for (let i = 0; i < 500; i++) { r.eng.beginRound('cw', { roundId: 'P' + i }); r.adv(4000); r.eng.endRound('cw', 'done'); }
  assert.equal(r.intervals(), 0); assert.equal(r.eng.status().rounds.length, 0); assert.equal(r.eng.status().active.length, 0);
  assert.equal(r.rows.length, new Set(r.rows.map((x) => x.key)).size);
});

// ----------------------------------------------------------------------------------- HTTP
test('HTTP: bootstrap/حفظ/سجل عبر handleEvents، ومسارات غير معروفة 404 وأخطاء التحقق بحالة صحيحة', async () => {
  const svc = mk(); const out = [];
  const call = async (method, p, body) => { let res; await handleEvents({ method, path: p.split('?')[0], url: new URL('http://x' + p), uid: 'u', body, svc, send: (c, o) => { res = [c, o]; } }); return res; };
  const [c0, b0] = await call('GET', '/batmish/events/bootstrap'); assert.equal(c0, 200); assert.equal(b0.catalog.games.length, 31);
  assert.equal(b0.catalog.games.find((g) => g.tag === 'cw').events.filter((e) => e.implemented).length, 5);
  assert.equal((await call('POST', '/batmish/events/event', { tag: 'cw', eventId: 'cw.e1', values: { enabled: true } }))[0], 200);
  { const e = EVENT_BY_ID['bomb.e1'], prev = e.implemented; e.implemented = false; try { assert.equal((await call('POST', '/batmish/events/event', { tag: 'bomb', eventId: 'bomb.e1', values: { enabled: true } }))[0], 409); } finally { e.implemented = prev; } }
  assert.equal((await call('POST', '/batmish/events/event', { tag: 'bomb', eventId: 'bomb.e1', values: { enabled: true } }))[0], 200);
  assert.equal((await call('POST', '/batmish/events/event', { tag: 'cw', eventId: 'cw.e1', values: { probability: 999 } }))[0], 400);
  assert.equal((await call('POST', '/batmish/events/record', { key: 'k', tag: 'cw', eventId: 'cw.e1', status: 'completed' }))[0], 200);
  const [, h] = await call('GET', '/batmish/events/history?tag=cw'); assert.equal(h.history.length, 1);
  assert.equal((await call('POST', '/batmish/events/nothing', {}))[0], 404);
});
