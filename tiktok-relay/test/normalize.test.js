import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTikTokUsername, InvalidUsernameError } from '../src/normalize.js';

test('يطبّع @ والحروف الكبيرة والمسافات', () => {
  assert.equal(normalizeTikTokUsername('@User_Name'), 'user_name');
  assert.equal(normalizeTikTokUsername('  @user.name  '), 'user.name');
});

test('يستخرج اليوزر من رابط الصفحة', () => {
  assert.equal(normalizeTikTokUsername('https://www.tiktok.com/@someone'), 'someone');
  assert.equal(normalizeTikTokUsername('https://www.tiktok.com/@someone/live?x=1'), 'someone');
});

test('يرفض المدخلات الفارغة أو غير الصحيحة', () => {
  assert.throws(() => normalizeTikTokUsername(''), InvalidUsernameError);
  assert.throws(() => normalizeTikTokUsername('   '), InvalidUsernameError);
  assert.throws(() => normalizeTikTokUsername('بدون@إنجليزي'), InvalidUsernameError);
  assert.throws(() => normalizeTikTokUsername('a'.repeat(30)), InvalidUsernameError);
  assert.throws(() => normalizeTikTokUsername('has spaces'), InvalidUsernameError);
  assert.throws(() => normalizeTikTokUsername('<script>'), InvalidUsernameError);
});

test('يقبل النقطة والشرطة السفلية', () => {
  assert.equal(normalizeTikTokUsername('a.b_c9'), 'a.b_c9');
});
