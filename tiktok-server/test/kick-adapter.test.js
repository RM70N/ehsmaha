'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSlug, slugVariants, cleanText, toUnified, toBridgeEvent, MessageGate } = require('../lib/kick-adapter');

test('normalizeSlug: مدخلات المستخدم المختلفة تنتهي لنفس القناة', () => {
  for (const raw of ['xqc', '  XQC  ', '@xqc', '@@Xqc', 'kick.com/xqc', 'https://kick.com/xqc', 'https://www.kick.com/XQC/', 'http://kick.com/xqc?tab=chat#x', 'm.kick.com/xqc', 'KICK.COM/xqc/videos', '‏xqc​', ' @xqc\n']) {
    assert.deepEqual(normalizeSlug(raw), { ok: true, slug: 'xqc' }, JSON.stringify(raw));
  }
});

test('normalizeSlug: يحافظ على _ و - الصالحة', () => {
  assert.equal(normalizeSlug('Some_User-1').slug, 'some_user-1');
  assert.equal(normalizeSlug('https://kick.com/some-user').slug, 'some-user');
});

test('normalizeSlug: المدخلات الخاطئة ترجع سبباً واضحاً (لا استثناءات)', () => {
  const cases = [[undefined, 'empty'], [null, 'empty'], ['', 'empty'], ['   ', 'empty'], ['@', 'empty'], ['kick.com/', 'empty'],
    ['ab', 'too_short'], ['x'.repeat(26), 'too_long'], ['اسم عربي', 'invalid'], ['has space', 'invalid'], ['a/b', 'invalid'], ['https://youtube.com/xqc', 'invalid'],
    ['-bad', 'invalid'], ['user!', 'invalid'], ['<script>', 'invalid'], [12345, null], [{}, 'invalid']];
  for (const [raw, reason] of cases) {
    const r = normalizeSlug(raw);
    if (reason === null) assert.equal(r.ok, true); else { assert.equal(r.ok, false, String(raw)); assert.equal(r.reason, reason, String(raw)); }
  }
});

test('slugVariants: يجرّب _ و - عند البحث', () => {
  assert.deepEqual(slugVariants('abc'), ['abc']);
  assert.deepEqual(slugVariants('a_b'), ['a_b', 'a-b']);
  assert.deepEqual(slugVariants('a-b'), ['a-b', 'a_b']);
});

test('cleanText: يحذف رموز الإيموجي المخصّصة والأحرف الخفية ويحفظ العربية والتشكيل والإيموجي', () => {
  assert.equal(cleanText('[emote:37226:KEKW] 123 [emote:1:x]'), '123');
  assert.equal(cleanText('‏١٢٣​'), '١٢٣');
  assert.equal(cleanText('  انضم   الحين  '), 'انضم الحين');
  assert.equal(cleanText('انضَمّ 😍🔥'), 'انضَمّ 😍🔥');          // التشكيل والإيموجي محفوظان (المطابقة بالألعاب تطبّعها)
  assert.equal(cleanText('مرحبا 👨‍👩‍👧'), 'مرحبا 👨‍👩‍👧');        // ZWJ داخل إيموجي مركّب محفوظ؟ (U+200D خارج النطاق المحذوف)
  assert.equal(cleanText(null), ''); assert.equal(cleanText(undefined), '');
  assert.equal(cleanText('a‮b'), 'ab');                       // علامة عكس اتجاه النص تُحذف
});

const msg = (over) => Object.assign({ id: 'm1', chatroom_id: 99999, content: 'انضم', type: 'message', created_at: '2026-01-02T03:04:05.000Z',
  sender: { id: 777, username: 'Ahmed_1', slug: 'ahmed-1', identity: { color: '#fff', badges: [] } }, metadata: {} }, over || {});

test('toUnified: يحوّل الرسالة للشكل الموحّد الكامل', () => {
  const u = toUnified(msg(), { slug: 'chan' });
  assert.equal(u.platform, 'kick'); assert.equal(u.userId, '777'); assert.equal(u.username, 'Ahmed_1'); assert.equal(u.displayName, 'Ahmed_1');
  assert.equal(u.text, 'انضم'); assert.equal(u.timestamp, Date.parse('2026-01-02T03:04:05.000Z'));
  assert.deepEqual(u.badges, []); assert.equal(u.isSub, false); assert.equal(u.isMod, false);
});

test('toUnified: الشارات → isSub / isMod', () => {
  const b = (...t) => ({ identity: { badges: t.map((type) => ({ type, text: type })) } });
  const mk = (...t) => toUnified(msg({ sender: Object.assign({ id: 1, username: 'u', slug: 'u' }, b(...t)) }));
  assert.equal(mk('subscriber').isSub, true); assert.equal(mk('founder').isSub, true); assert.equal(mk('sub_gifter').isSub, true);
  assert.equal(mk('moderator').isMod, true); assert.equal(mk('broadcaster').isMod, true);
  assert.equal(mk('verified').isSub, false); assert.equal(mk('verified').isMod, false);
  assert.deepEqual(mk('subscriber', 'moderator').badges, ['subscriber', 'moderator']);
});

test('toUnified: رسائل ناقصة/تالفة → null بلا استثناء', () => {
  for (const bad of [null, undefined, 5, 'x', {}, { content: 'x' }, { sender: {}, content: 'x' }, msg({ content: '' }), msg({ content: '   ' }), msg({ content: '[emote:1:a]' }), msg({ sender: { id: 1 } })]) {
    assert.equal(toUnified(bad), null, JSON.stringify(bad));
  }
  assert.ok(toUnified(msg({ created_at: 'garbage' }), null, 5000).timestamp === 5000);
  assert.equal(toUnified(msg({ sender: { id: 5, username: '', slug: 'only-slug' } })).username, 'only-slug');
  assert.equal(toUnified(msg({ sender: { username: 'nid' } })).userId, 'nid');
});

test('toBridgeEvent: نفس غلاف الجسر القديم (يعمل مع extractUser بالألعاب) + الحقول الجديدة', () => {
  const ev = toBridgeEvent(toUnified(msg({ sender: { id: 9, username: 'Sub_User', slug: 'sub-user', identity: { badges: [{ type: 'subscriber' }] } } })));
  assert.equal(ev.type, 'WebcastChatMessage'); assert.equal(ev.comment, 'انضم');
  assert.equal(ev.user.uniqueId, 'Sub_User');            // اسم المستخدم (لا slug) — كما كان بالنسخة القديمة
  assert.equal(ev.user.nickname, 'Sub_User'); assert.equal(ev.user.isFollower, true); assert.equal(ev.user.followInfo.followStatus, 1);
  assert.equal(ev.user.isSubscriber, true); assert.equal(ev.user.isModerator, false); assert.deepEqual(ev.user.badges, ['subscriber']);
  assert.equal(ev.unified.platform, 'kick'); assert.equal(ev.unified.userId, '9');
  assert.ok(Number.isFinite(ev.timestamp));
});

const mkU = (id, text, mid) => ({ userId: String(id), text, messageId: mid || '' });
function clockGate(opts) { let t = 1000; const g = new MessageGate(Object.assign({ now: () => t }, opts)); return { g, adv: (ms) => { t += ms; } }; }

test('MessageGate: نفس معرّف الرسالة مرتين (اشتراكان بنفس الغرفة) يمر مرة واحدة', () => {
  const { g } = clockGate();
  assert.equal(g.check(mkU(1, 'a', 'X')).pass, true);
  assert.deepEqual(g.check(mkU(1, 'a', 'X')), { pass: false, reason: 'dup_id' });
  assert.equal(g.stats.dupId, 1);
});

test('MessageGate: تكرار النص الحرفي من نفس المستخدم خلال النافذة يُحجب ثم يمر بعدها', () => {
  const { g, adv } = clockGate({ dupWindowMs: 2000 });
  assert.equal(g.check(mkU(1, '١٢٣', 'a')).pass, true);
  adv(500); assert.equal(g.check(mkU(1, '١٢٣', 'b')).reason, 'dup_text');
  adv(2000); assert.equal(g.check(mkU(1, '١٢٣', 'c')).pass, true);
  assert.equal(g.check(mkU(2, '١٢٣', 'd')).pass, true); // مستخدم آخر بنفس النص مسموح (تصويت مختلف)
});

test('MessageGate: دلو لكل مستخدم — burst ثم يُحجب الإغراق ويتعافى مع الزمن، ومستخدم آخر غير متأثر', () => {
  const { g, adv } = clockGate({ burst: 5, ratePerSec: 2, dupWindowMs: 0 });
  let pass = 0; for (let i = 0; i < 50; i++) if (g.check(mkU(1, 't' + i, 'm' + i)).pass) pass++;
  assert.equal(pass, 5);
  assert.equal(g.check(mkU(2, 'x', 'z1')).pass, true);
  adv(1000); // +2 رمز
  let again = 0; for (let i = 0; i < 10; i++) if (g.check(mkU(1, 'u' + i, 'n' + i)).pass) again++;
  assert.equal(again, 2);
  assert.ok(g.stats.rateLimited >= 53);
});

test('MessageGate: ذاكرة محدودة (معرّفات ومستخدمون) تحت ضغط ضخم', () => {
  const { g } = clockGate({ idCacheMax: 100, maxUsers: 50, burst: 100 });
  for (let i = 0; i < 5000; i++) g.check(mkU('u' + i, 't', 'id' + i));
  assert.ok(g.ids.size <= 100 && g.idQ.length <= 100);
  assert.ok(g.users.size <= 50);
  // معرّف قديم أُخرج من الكاش يمر ثانية (سلوك مقبول)، لكن الأحدث ما زال محمياً
  assert.equal(g.check(mkU('zz', 'q', 'id4999')).reason, 'dup_id');
});

test('MessageGate: أداء — ٢٠٠٠٠ رسالة/ثانية محاكاة تُعالج بسرعة', () => {
  const { g } = clockGate({ burst: 1e9 });
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 20000; i++) g.check(mkU(i % 3000, 'نص' + i, 'mm' + i));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 500, 'took ' + ms + 'ms');
});
