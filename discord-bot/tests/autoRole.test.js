'use strict';

// رتبة الدخول التلقائي: كل عضو جديد (غير بوت) ياخذ الرتبة، مع تحقق من الصلاحيات وترتيب الرتب، وبدون ما تتعطل بقية الأحداث.

Object.assign(process.env, { DISCORD_TOKEN: 't', GEMINI_API_KEY: 'g', CLIENT_ID: '1552260327008247879', API_BASE_URL: 'http://127.0.0.1:9', API_KEY: 'a'.repeat(40), LOG_LEVEL: 'error' });
delete process.env.AUTO_ROLE_ID;

const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const autoRole = require('../services/autoRole');
const memberAdd = require('../events/guildMemberAdd');
const { makeGuild, makeRole, makeMember } = require('./helpers/discordMock');

const ROLE_ID = '1552259562369851394';
const mk = ({ position = 5, managed = false, botPerms } = {}) => {
  const guild = makeGuild({ botPerms });
  const role = makeRole(guild, { id: ROLE_ID, name: 'عضو', position, managed });
  return { guild, role };
};
const names = (m) => [...m.roles.cache.values()].map((r) => r.name);

test('عضو جديد ياخذ الرتبة الافتراضية (1552259562369851394) تلقائياً', async () => {
  const { guild } = mk();
  const m = makeMember(guild, { username: 'جديد' });
  const r = await autoRole.assignOnJoin(m);
  assert.deepEqual(r, { ok: true, reason: 'assigned' });
  assert.ok(m.roles.cache.has(ROLE_ID));
  // نفس العضو مرة ثانية: ما يكرر
  assert.deepEqual(await autoRole.assignOnJoin(m), { ok: true, reason: 'already' });
  assert.equal(guild.log.filter(([t]) => t === 'roles.add').length, 1);
});

test('الحدث guildMemberAdd يشغّل الرتبة (حتى لو الترحيب فشل)، والبوتات ما تاخذ', async () => {
  const { guild } = mk();
  const m = makeMember(guild, { username: 'ضيف' });
  await memberAdd.execute({ dbReady: Promise.reject(new Error('db down')) }, m);
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(m.roles.cache.has(ROLE_ID));
  const bot = makeMember(guild, { username: 'بوت', bot: true });
  await memberAdd.execute({ dbReady: Promise.resolve(true) }, bot);
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(!bot.roles.cache.has(ROLE_ID));
  assert.equal((await autoRole.assignOnJoin(bot)).reason, 'bot');
});

test('تحقق قبل الإعطاء: رتبة ناقصة بالسيرفر، رتبة أعلى من البوت، رتبة مدارة، بدون صلاحية إدارة الرتب', async () => {
  const none = makeGuild();
  assert.equal((await autoRole.assignOnJoin(makeMember(none, {}))).reason, 'no-role');

  const high = mk({ position: 60 }); // البوت 50
  const m1 = makeMember(high.guild, {});
  assert.equal((await autoRole.assignOnJoin(m1)).reason, 'role-too-high');
  assert.ok(!m1.roles.cache.has(ROLE_ID));

  const managed = mk({ managed: true });
  assert.equal((await autoRole.assignOnJoin(makeMember(managed.guild, {}))).reason, 'managed-role');

  const weak = mk({ botPerms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  const m2 = makeMember(weak.guild, {});
  assert.equal((await autoRole.assignOnJoin(m2)).reason, 'no-permission');
  assert.ok(!m2.roles.cache.has(ROLE_ID));
});

test('رفض ديسكورد (50013) أو خطأ مؤقت: ما يرمي، والمؤقت يعيد محاولة واحدة', async () => {
  const { guild } = mk();
  guild.failNext = 'roles.add'; // 50013
  const m = makeMember(guild, {});
  assert.equal((await autoRole.assignOnJoin(m)).reason, 'no-permission');

  // خطأ مؤقت أول مرة ← تنجح الثانية
  const { guild: g2 } = mk();
  const m2 = makeMember(g2, {});
  const realAdd = m2.roles.add;
  let n = 0;
  m2.roles.add = async (...a) => {
    if (++n === 1) throw new Error('ECONNRESET');
    return realAdd(...a);
  };
  assert.deepEqual(await autoRole.assignOnJoin(m2), { ok: true, reason: 'assigned' });
  assert.equal(n, 2);
  // فشل دائم: ما يرمي
  m2.roles.cache.delete(ROLE_ID);
  m2.roles.add = async () => {
    throw new Error('down');
  };
  assert.equal((await autoRole.assignOnJoin(m2)).reason, 'failed');
});

test('AUTO_ROLE_ID: رتبة ثانية، أو off للإيقاف، وقيمة غلط تعطّلها', async () => {
  const { guild } = mk();
  const other = makeRole(guild, { id: '1552259562369851395', name: 'ثانية', position: 4 });
  process.env.AUTO_ROLE_ID = other.id;
  const m = makeMember(guild, {});
  assert.equal((await autoRole.assignOnJoin(m)).reason, 'assigned');
  assert.deepEqual(names(m).includes('ثانية'), true);
  assert.ok(!m.roles.cache.has(ROLE_ID));
  for (const v of ['off', 'abc', '']) {
    process.env.AUTO_ROLE_ID = v;
    assert.equal((await autoRole.assignOnJoin(makeMember(guild, {}))).reason, 'disabled', v);
  }
  delete process.env.AUTO_ROLE_ID;
});
