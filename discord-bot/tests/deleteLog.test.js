'use strict';

// سجل الرسائل المحذوفة: أي حذف ← تقرير بالخاص للمالك (النص + صاحب الرسالة + من حذفها)

const test = require('node:test');
const assert = require('node:assert/strict');

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token', GEMINI_API_KEY: 'k', CLIENT_ID: '1552260327008247879', API_BASE_URL: 'http://127.0.0.1:9',
  API_KEY: 'k'.repeat(40), LOG_LEVEL: 'error', OWNER_DISCORD_ID: '944639301528977420'
});

const { loadConfig } = require('../config');
const deleteLog = require('../services/deleteLog');
const OWNER = '944639301528977420';

function world({ audit = [], auditError = null } = {}) {
  const dms = [];
  const guild = {
    id: 'g1',
    name: 'سيرفر احسمها',
    async fetchAuditLogs() {
      if (auditError) throw auditError;
      return { entries: new Map(audit.map((e) => [e.id, e])) };
    }
  };
  const channel = { id: 'c1', name: 'العام', guild };
  const client = {
    user: { id: 'BOT' },
    users: { fetch: async (id) => ({ id, send: async (p) => dms.push({ to: id, ...p }) }) }
  };
  const msg = (over = {}) => ({
    id: String(Math.random()).slice(2),
    guild,
    channel,
    channelId: 'c1',
    author: { id: 'u1', tag: 'سعود', username: 'saud' },
    content: 'السلام عليكم',
    createdTimestamp: Date.now() - 60_000,
    attachments: new Map(),
    embeds: [],
    stickers: new Map(),
    ...over
  });
  return { dms, guild, channel, client, msg };
}
const text = (dm) => JSON.stringify((dm.embeds || []).map((e) => (e.toJSON ? e.toJSON() : e)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const FLUSH = 2700;

test.beforeEach(() => deleteLog._reset());

test('الإعداد: التقرير للمالك تلقائياً', () => {
  assert.deepEqual([...loadConfig().deleteLogRecipients], [OWNER]);
  assert.equal(loadConfig().deleteLogEnabled, true);
});

test('رسالة محذوفة: النص + صاحبها + الإداري اللي حذفها (من سجل التدقيق) تصل للمالك بالخاص', async () => {
  const w = world({ audit: [{ id: 'a1', executor: { id: 'mod9', tag: 'مشرف' }, target: { id: 'u1' }, extra: { channel: { id: 'c1' }, count: 1 }, createdTimestamp: Date.now() }] });
  await deleteLog.onDelete(w.client, w.msg({ content: 'كلام ممنوع' }));
  await wait(FLUSH);
  assert.equal(w.dms.length, 1);
  assert.equal(w.dms[0].to, OWNER);
  const t = text(w.dms[0]);
  assert.match(t, /كلام ممنوع/);
  assert.ok(t.includes('<@u1>'), 'صاحب الرسالة');
  assert.ok(t.includes('<@mod9>'), 'من حذفها');
  assert.ok(t.includes('<#c1>'), 'الروم');
});

test('بدون قيد بسجل التدقيق ← صاحب الرسالة نفسه غالباً، وبدون صلاحية السجل يوضّح، ورسائل البوت ما تنبّه', async () => {
  let w = world();
  await deleteLog.onDelete(w.client, w.msg());
  await wait(FLUSH);
  assert.match(text(w.dms[0]), /صاحب الرسالة نفسه \(حذف ذاتي\)/);

  deleteLog._reset();
  w = world({ auditError: Object.assign(new Error('Missing Permissions'), { code: 50013 }) });
  await deleteLog.onDelete(w.client, w.msg());
  await wait(FLUSH);
  assert.match(text(w.dms[0]), /عرض سجل التدقيق/);

  deleteLog._reset();
  w = world();
  await deleteLog.onDelete(w.client, w.msg({ author: { id: 'BOT', tag: 'bot' } }));
  await wait(FLUSH);
  assert.equal(w.dms.length, 0);
});

test('رسالة قديمة غير محفوظة (partial) ← تقرير مع تنبيه، والمرفقات تظهر', async () => {
  const w = world();
  await deleteLog.onDelete(w.client, { id: 'old1', guild: w.guild, channel: w.channel, channelId: 'c1', partial: true, author: null });
  await deleteLog.onDelete(w.client, w.msg({ content: '', attachments: new Map([['1', { name: 'صورة.png', url: 'https://cdn.discordapp.com/x.png' }]]) }));
  await wait(FLUSH);
  const all = w.dms.map(text).join('');
  assert.match(all, /غير محفوظ/);
  assert.match(all, /صورة\.png/);
});

test('الحذف الجماعي من إداري (مسح): مرة وحدة بملف، والنص من الأمر بدون تكرار من الحدث', async () => {
  const w = world();
  const msgs = Array.from({ length: 15 }, (_, i) => w.msg({ id: `m${i}`, content: `رسالة ${i}` }));
  deleteLog.reportPurge(w.client, { channel: w.channel, messages: msgs, moderatorId: 'mod7' });
  // حدث الـbulk الفعلي يوصل بعدها لنفس الرسائل ← ما يتكرر
  await deleteLog.onBulk(w.client, new Map(msgs.map((m) => [m.id, m])), w.channel);
  await wait(FLUSH);
  assert.equal(w.dms.length, 1, 'رسالة خاصة وحدة');
  assert.ok(w.dms[0].files && w.dms[0].files.length === 1, 'ملف بالتفاصيل');
  assert.match(text(w.dms[0]), /15 رسالة انحذفت/);
  const file = w.dms[0].files[0].attachment.toString('utf8');
  assert.match(file, /رسالة 0/);
  assert.match(file, /mod7/);
});

test('حذف البوت للحماية التلقائية: السبب يظهر، والإيقاف بـMESSAGE_DELETE_LOG=off يوقفه', async () => {
  let w = world();
  deleteLog.markBotAction('c1', 'الحماية التلقائية (روابط/سبام)');
  await deleteLog.onDelete(w.client, w.msg({ content: 'http://spam' }));
  await wait(FLUSH);
  assert.match(text(w.dms[0]), /الحماية التلقائية/);

  deleteLog._reset();
  process.env.MESSAGE_DELETE_LOG = 'off';
  try {
    w = world();
    await deleteLog.onDelete(w.client, w.msg());
    await wait(FLUSH);
    assert.equal(w.dms.length, 0);
  } finally {
    delete process.env.MESSAGE_DELETE_LOG;
  }
});

test('الحالتان توصلان: صاحب الرسالة يحذف رسالته (حذف ذاتي)، وإداري يحذف رسالة شخص ثاني (باسم الإداري) — وكلاهما بدفعة وحدة', async () => {
  const w = world({ audit: [{ id: 'a9', executor: { id: 'mod9', tag: 'مشرف' }, target: { id: 'u2' }, extra: { channel: { id: 'c1' }, count: 1 }, createdTimestamp: Date.now() }] });
  await deleteLog.onDelete(w.client, w.msg({ content: 'رسالتي أنا' })); // u1 ما له قيد ← ذاتي
  await deleteLog.onDelete(w.client, w.msg({ author: { id: 'u2', tag: 'نايف' }, content: 'رسالة نايف' })); // u2 له قيد ← الإداري
  await wait(FLUSH);
  const all = w.dms.map(text).join('');
  assert.match(all, /رسالتي أنا/);
  assert.match(all, /حذف ذاتي/);
  assert.match(all, /رسالة نايف/);
  assert.ok(all.includes('<@mod9>'), 'اسم الإداري');
});

test('الشعار: رابط الشعار بالإمبدات فيه بصمة الملف (يكسر كاش ديسكورد)، وصورة البوت تتزامن مرة وحدة لكل تغيير', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  assert.match(loadConfig().logoUrl, /^https:\/\/ehsmaha\.com\/discord-logo\.png\?v=[0-9a-f]{8}$/);

  const botAvatar = require('../services/botAvatar');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-'));
  process.env.BOT_DATA_DIR = dir;
  const file = path.join(dir, 'a.png');
  fs.writeFileSync(file, Buffer.from('png-v1'));
  const calls = [];
  const client = { user: { setAvatar: async (b) => calls.push(b.toString()) } };
  try {
    assert.equal(await botAvatar.sync(client, { file }), 'updated');
    assert.equal(await botAvatar.sync(client, { file }), 'unchanged', 'نفس الملف ما يُعاد رفعه');
    fs.writeFileSync(file, Buffer.from('png-v2'));
    assert.equal(await botAvatar.sync(client, { file }), 'updated');
    assert.deepEqual(calls, ['png-v1', 'png-v2']);
    // فشل (حد التغيير) ← يرجّع failed وما يحفظ الحالة، والمحاولة الجاية تنجح
    fs.writeFileSync(file, Buffer.from('png-v3'));
    const bad = { user: { setAvatar: async () => { throw Object.assign(new Error('rate limited'), { code: 30008 }); } } };
    assert.equal(await botAvatar.sync(bad, { file }), 'failed');
    assert.equal(await botAvatar.sync(client, { file }), 'updated');
    assert.equal(await botAvatar.sync(client, { file: path.join(dir, 'nope.png') }), 'missing');
    process.env.BOT_AVATAR_SYNC = 'off';
    assert.equal(await botAvatar.sync(client, { file }), 'disabled');
  } finally {
    delete process.env.BOT_DATA_DIR;
    delete process.env.BOT_AVATAR_SYNC;
  }
});
