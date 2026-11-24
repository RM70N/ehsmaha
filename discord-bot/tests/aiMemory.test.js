'use strict';

require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakeStore } = require('./helpers/fakeStore');

const fake = installFakeStore();
const aiMemory = require('../services/aiMemory');

test.beforeEach(() => {
  fake.reset();
  aiMemory.invalidate();
});

test('normalize unifies Arabic spelling variants', () => {
  assert.equal(aiMemory.normalize('مَن الذي صنعَ لعبةَ احسمها؟'), aiMemory.normalize('من الذي صنع لعبه احسمها'));
  assert.equal(aiMemory.normalize('إحسمها   أولى!!'), 'احسمها اولي');
});

test('parseTeach reads Q&A and instructions, rejects missing separator', () => {
  assert.deepEqual(aiMemory.parseTeach('تعلم: مين صنع احسمها؟ = فريق احسمها 💜'), { kind: 'qa', question: 'مين صنع احسمها؟', answer: 'فريق احسمها 💜' });
  assert.deepEqual(aiMemory.parseTeach('علم: متى المسابقة | الأسبوع الجاي'), { kind: 'qa', question: 'متى المسابقة', answer: 'الأسبوع الجاي' });
  assert.deepEqual(aiMemory.parseTeach('تعليمة: نادِ الناس يا بطل'), { kind: 'instruction', content: 'نادِ الناس يا بطل' });
  assert.deepEqual(aiMemory.parseTeach('تعلم: بدون جواب'), { kind: 'invalid' });
  assert.equal(aiMemory.parseTeach('كيف العب احسمها'), null);
});

test('taught answers: exact match answers directly, near match used as fallback, unrelated ignored', async () => {
  await aiMemory.addQa('g1', 'من الذي صنع لعبة احسمها؟', 'فريق احسمها السعودي 💜', 'admin');
  assert.equal(await aiMemory.directAnswer('g1', 'من الذي صنع لعبه احسمها'), 'فريق احسمها السعودي 💜');
  assert.equal(await aiMemory.directAnswer('g1', 'مين صنع احسمها'), null);
  assert.equal(await aiMemory.closestAnswer('g1', 'يا شباب من الذي صنع لعبة احسمها'), 'فريق احسمها السعودي 💜');
  assert.equal(await aiMemory.closestAnswer('g1', 'كيف اربط تيك توك'), null);
  assert.equal(await aiMemory.directAnswer('other-guild', 'من الذي صنع لعبة احسمها'), null);
});

test('re-teaching the same question updates the answer instead of duplicating', async () => {
  const a = await aiMemory.addQa('g1', 'متى المسابقة؟', 'قريب', 'admin');
  const b = await aiMemory.addQa('g1', 'متى  المسابقة', 'الجمعة', 'admin');
  assert.equal(b.id, a.id);
  assert.equal(b.updated, true);
  assert.equal((await aiMemory.list('g1')).qa.length, 1);
  assert.equal(await aiMemory.directAnswer('g1', 'متى المسابقة'), 'الجمعة');
});

test('validation errors are user-facing and limits are enforced', async () => {
  await assert.rejects(aiMemory.addInstruction('g1', 'ab', 'admin'), (e) => e.userFacing && /قصيرة/.test(e.message));
  await assert.rejects(aiMemory.addQa('g1', 'سؤال', '', 'admin'), (e) => e.userFacing);
  for (let i = 0; i < aiMemory.LIMITS.instruction; i++) await aiMemory.addInstruction('g1', `تعليمة رقم ${i}`, 'admin');
  await assert.rejects(aiMemory.addInstruction('g1', 'وحدة زيادة', 'admin'), (e) => e.userFacing && /الحد/.test(e.message));
});

test('prompt block contains instructions and taught answers, empty when nothing taught', async () => {
  assert.equal(await aiMemory.promptBlock('g1'), '');
  await aiMemory.addInstruction('g1', 'لو أحد سأل عن المسابقة قل الأسبوع الجاي', 'admin');
  await aiMemory.addQa('g1', 'مين المالك', 'محمد', 'admin');
  const block = await aiMemory.promptBlock('g1');
  assert.match(block, /تعليمات إدارة احسمها/);
  assert.match(block, /المسابقة قل الأسبوع الجاي/);
  assert.match(block, /س: «مين المالك»\n {2}ج: «محمد»/);
});

test('remove and clear', async () => {
  const { id } = await aiMemory.addInstruction('g1', 'تعليمة أولى', 'admin');
  await aiMemory.addQa('g1', 'سؤال', 'جواب', 'admin');
  assert.equal((await aiMemory.remove('g1', id)).kind, 'instruction');
  assert.equal(await aiMemory.remove('g1', id), null);
  assert.equal(await aiMemory.clear('g1'), 1);
  assert.deepEqual(await aiMemory.list('g1'), { instructions: [], qa: [] });
});
