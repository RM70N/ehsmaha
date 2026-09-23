'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const levels = require('../api/services/levels');
const { currentWeek } = require('../api/services/leaderboard');
const { redact } = require('../utils/logger');
const { buildConfig } = require('../config');
const { RateLimiter } = require('../utils/rateLimiter');
const customId = require('../utils/customId');

// يستخرج دوال اللفلات من index.html الفعلي ويقارنها بنسخة الـAPI — لو أحد عدّل
// منحنى الصعوبة بالموقع ونسي الـAPI، هذا الاختبار يفشل فوراً.
test('منطق اللفلات مطابق للموقع (index.html)', (t) => {
  const htmlPath = path.join(__dirname, '..', '..', 'index.html');
  if (!fs.existsSync(htmlPath)) return t.skip('index.html غير موجود');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const grab = (re) => {
    const m = html.match(re);
    assert.ok(m, 'ما لقينا ' + re);
    return m[0];
  };
  const src = [
    grab(/const LEVELS_CONFIG = \{[\s\S]*?\n\};/),
    grab(/function levelsRequiredXpFor\(level\) \{[\s\S]*?\n\}/),
    grab(/function levelsProgressFromXp\(totalXp\) \{[\s\S]*?\n\}/),
    grab(/function levelsKey\(idOrUsername\) \{[\s\S]*?\n\}/)
  ].join('\n');
  const site = {};
  vm.runInNewContext(src + '\nout.p = levelsProgressFromXp; out.k = levelsKey;', { out: site });

  for (const xp of [0, 1, 29, 30, 31, 100, 115, 900, 5000, 123456, 10_000_000]) {
    // (نسخة JSON لأن كائنات vm من realm مختلف بنموذج أولي مختلف)
    assert.deepEqual(levels.progressFromXp(xp), JSON.parse(JSON.stringify(site.p(xp))), `xp=${xp}`);
  }
  for (const k of ['@Alice', 'tiktok:Bob_1', 'kick:@Zed', '  Mixed.Case ', '']) {
    assert.equal(levels.levelsKey(k), site.k(k));
  }
});

test('بداية الأسبوع: الأحد 00:00 بتوقيت السعودية', () => {
  const s = { weekStartDay: 0, timezoneOffsetMinutes: 180 };
  // الأربعاء 2026-09-23 12:00 UTC → الأحد 2026-09-20 00:00 الرياض = 2026-09-19 21:00 UTC
  let w = currentWeek(s, new Date('2026-09-23T12:00:00Z'));
  assert.equal(w.weekKey, '2026-09-20');
  assert.equal(w.start.toISOString(), '2026-09-19T21:00:00.000Z');
  // السبت 22:30 UTC = الأحد 01:30 الرياض → أسبوع جديد
  w = currentWeek(s, new Date('2026-09-26T22:30:00Z'));
  assert.equal(w.weekKey, '2026-09-27');
  // السبت 20:59 UTC = السبت 23:59 الرياض → لسا الأسبوع القديم
  w = currentWeek(s, new Date('2026-09-26T20:59:00Z'));
  assert.equal(w.weekKey, '2026-09-20');
});

test('السجل يحجب التوكنات والمفاتيح', () => {
  const token = 'MTU1MjI2MDMyNzAwODI0Nzg3OQ.GhIjKl.' + 'a'.repeat(38);
  const out = redact({ message: 'failed with ' + token, apiKey: 'secret-value', nested: { authorization: 'Bearer abc.def', ok: 'visible' } });
  assert.doesNotMatch(JSON.stringify(out), /GhIjKl|secret-value|abc\.def/);
  assert.equal(out.nested.ok, 'visible');
  process.env.API_KEY = 'super-secret-shared-key-123456789';
  assert.equal(redact('key=super-secret-shared-key-123456789'), 'key=[REDACTED]');
});

test('التحقق من البيئة: رسالة واضحة بكل النواقص', () => {
  const backup = { ...process.env };
  try {
    for (const k of ['DISCORD_TOKEN', 'CLIENT_ID', 'API_BASE_URL', 'API_KEY', 'GUILD_ID', 'ADMIN_IDS']) delete process.env[k];
    process.env.ADMIN_IDS = '123,abc';
    assert.throws(buildConfig, (err) => {
      assert.equal(err.code, 'CONFIG_INVALID');
      for (const k of ['DISCORD_TOKEN', 'CLIENT_ID', 'API_BASE_URL', 'API_KEY', 'ADMIN_IDS']) assert.match(err.message, new RegExp(k));
      return true;
    });
    Object.assign(process.env, {
      DISCORD_TOKEN: 'x', CLIENT_ID: '1552260327008247879', API_BASE_URL: 'https://api.example.com/', API_KEY: 'k'.repeat(32), ADMIN_IDS: ''
    });
    const cfg = buildConfig();
    assert.equal(cfg.apiBaseUrl, 'https://api.example.com');
    assert.equal(cfg.commandCooldownMs, 3000);
    assert.equal(cfg.apiTimeoutMs, 5000);
    assert.equal(cfg.guildId, null);
  } finally {
    process.env = backup;
  }
});

test('Rate limiter لكل مستخدم', () => {
  const rl = new RateLimiter();
  clearInterval(rl.sweeper);
  assert.equal(rl.consume('cmd', 'u1', 3000).allowed, true);
  const second = rl.consume('cmd', 'u1', 3000);
  assert.equal(second.allowed, false);
  assert.ok(second.retryAfterMs > 2900);
  assert.equal(rl.consume('cmd', 'u2', 3000).allowed, true); // مستخدم ثاني مستقل
  assert.equal(rl.consume('btn', 'u1', 3000).allowed, true); // فئة مستقلة
});

test('customId: بناء وتحليل وحد الطول', () => {
  const id = customId.build('lb', 'page', 'weekly', 2, '123456789012345678');
  assert.deepEqual(customId.parse(id), { prefix: 'lb', args: ['page', 'weekly', '2', '123456789012345678'] });
  assert.throws(() => customId.build('x', 'y'.repeat(120)));
});

test('الـAPI: تجاوز حصة Firestore يرجع 503 QUOTA_EXCEEDED برسالة واضحة، والبوت ما يعيد المحاولة', () => {
  const { createErrorHandler } = require('../api/middleware/errorHandler');
  const logs = [];
  const handler = createErrorHandler({ warn: (...a) => logs.push(['warn', ...a]), error: (...a) => logs.push(['error', ...a]) });
  const res = { headersSent: false, statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  const err = Object.assign(new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.'), { code: 8 });
  handler(err, { path: '/api/discord/active-streams', method: 'GET' }, res, () => {});
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error.code, 'QUOTA_EXCEEDED');
  handler(err, { path: '/x', method: 'GET' }, { ...res, status(c) { this.statusCode = c; return this; } }, () => {});
  assert.equal(logs.filter(([l]) => l === 'warn').length, 1, 'سطر سجل واحد بدل stack كل مرة');
  assert.equal(logs.filter(([l]) => l === 'error').length, 0);
  const { friendlyMessage } = require('../utils/errors');
  const { ApiError } = require('../utils/apiClient');
  if (friendlyMessage) assert.match(friendlyMessage(new ApiError('QUOTA_EXCEEDED', 'x', { status: 503 })), /حدها اليومي/);
});

test('bot-state: Realtime Database الأساسي — Firestore المعلّق (حصة خالصة) ما يأخر الاسترجاع', async () => {
  process.env.API_KEY = process.env.API_KEY || 'k'.repeat(40);
  const crypto = require('node:crypto');
  const firestore = require('../database/firestore');
  const botState = require('../api/services/botState');
  const { rtdbStore, fsStore, encrypt } = botState._internal;
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const plain = Buffer.from('bot-db-content');
  const blob = encrypt(plain);
  const meta = { chunks: 1, sha256: sha(plain), encrypted: true, updatedAt: 5 };

  const saved = { ...rtdbStore };
  const savedDb = firestore.db;
  const savedRtdb = firestore.rtdb;
  let firestoreTouched = 0;
  try {
    firestore.rtdb = () => ({}); // "متاحة"
    // Firestore معلّق للأبد (مثل ما يصير لما تخلص الحصة)
    firestore.db = () => {
      firestoreTouched += 1;
      const hang = () => new Promise(() => {});
      return { collection: () => ({ doc: () => ({ get: hang }) }), runTransaction: hang, getAll: hang };
    };

    // 1) الأساسي فيه نسخة ← يرجع فوراً وما يلمس Firestore
    Object.assign(rtdbStore, { claim: async () => {}, readMeta: async () => meta, readBlob: async () => blob });
    let started = Date.now();
    let r = await botState.claim(100);
    assert.equal(Buffer.from(r.snapshot.data, 'base64').toString(), 'bot-db-content');
    assert.equal(r.snapshot.store, 'rtdb');
    assert.ok(Date.now() - started < 1000, 'فوري');
    assert.equal(firestoreTouched, 0, 'ما لمس Firestore');

    // 2) الأساسي فاضي ← يحاول Firestore بس بمهلة (ما يعلق)
    Object.assign(rtdbStore, { readMeta: async () => null });
    started = Date.now();
    r = await botState.claim(101);
    assert.equal(r.snapshot, null);
    assert.ok(Date.now() - started < 12_000, `انتهى بالمهلة: ${Date.now() - started}ms`);

    // 3) الأساسي طايح + Firestore معلّق ← خطأ واضح بعد المهلة (مو تعليق للأبد)
    Object.assign(rtdbStore, { claim: async () => { throw Object.assign(new Error('down'), { code: 'RTDB_TIMEOUT' }); } });
    started = Date.now();
    await assert.rejects(() => botState.claim(102));
    assert.ok(Date.now() - started < 12_000, 'ما علّق');

    // 4) الحفظ: الأساسي يشتغل ← ما يلمس Firestore
    firestoreTouched = 0;
    let wrote = null;
    Object.assign(rtdbStore, { write: async (bootAt, b, m) => { wrote = { b, m }; return 1; } });
    const out = await botState.save({ bootAt: 103, data: plain.toString('base64'), sha: sha(plain) });
    assert.equal(out.store, 'rtdb');
    assert.equal(wrote.m.encrypted, true);
    assert.equal(firestoreTouched, 0);
  } finally {
    Object.assign(rtdbStore, saved);
    firestore.db = savedDb;
    firestore.rtdb = savedRtdb;
  }
});
