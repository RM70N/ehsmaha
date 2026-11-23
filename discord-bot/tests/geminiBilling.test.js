'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { DISCORD_TOKEN: 't', GEMINI_API_KEY: 'k1', GEMINI_API_KEY_2: 'k2', CLIENT_ID: '1552260327008247879', API_BASE_URL: 'http://127.0.0.1:9', API_KEY: 'k'.repeat(40), LOG_LEVEL: 'error' });
const gemini = require('../services/gemini');

test('402 (رصيد المفتاح خلص) يتصنّف BILLING ويرتاح المفتاح ساعة بكل النماذج، و503 يبقى SERVER', () => {
  assert.equal(gemini.classify(Object.assign(new Error('[402 Payment Required] Your prepayment credits are depleted.'), { status: 402 })), 'BILLING');
  assert.equal(gemini.classify(Object.assign(new Error('high demand'), { status: 503 })), 'SERVER');
  assert.equal(gemini._internal.cooldownMs('BILLING', new Error('x')), 60 * 60 * 1000);
});

test('503 "high demand" يحظر النموذج بكل المفاتيح (ينتقل لنموذج ثاني فوراً)، وبقية الأخطاء تبقى لكل مفتاح', () => {
  const k = gemini._internal.cooldownKey;
  assert.equal(k('SERVER', 2, 'm1', Object.assign(new Error('x'), { status: 503 })), '*|m1');
  assert.equal(k('SERVER', 2, 'm1', Object.assign(new Error('x'), { status: 500 })), '2|m1');
  assert.equal(k('BILLING', 1, 'm1'), '1|*');
});
