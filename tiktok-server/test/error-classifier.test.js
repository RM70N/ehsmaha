'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyTikTokError, isProviderFault, isPermanent } = require('../lib/error-classifier');
const lib = require('tiktok-live-connector'); // الأصناف الحقيقية من المكتبة المثبتة

const composite = (errs) => new lib.InvalidResponseCompositeError({ routeId: 'fetchRoomIdRoute', requestErrs: errs }, 'Failed to retrieve Room ID from all sources.');
const kind = (e) => classifyTikTokError(e, lib).kind;

test('real SignatureRateLimitError -> rate_limited with retryAfter in ms', () => {
  const e = new lib.SignatureRateLimitError(null, 'Too many connections started, try again later.', { headers: { 'retry-after': '45' } });
  assert.deepEqual(classifyTikTokError(e, lib), { kind: 'rate_limited', retryAfterMs: 45000, daily: false });
  assert.ok(isProviderFault('rate_limited'));
});

test('real SignAPIError reasons -> sign_failed (5xx / empty cookies / sign server down)', () => {
  for (const reason of ['Sign Error', 'Empty Cookies', 'Connect Error']) {
    assert.equal(kind(new lib.SignAPIError(reason, undefined, undefined, 'x')), 'sign_failed', reason);
  }
  assert.equal(kind(new lib.SignatureMissingTokensError('no tokens')), 'sign_failed');
});

test('PremiumFeatureError (402/403 = key lacks permission) -> provider_denied', () => {
  const e = new lib.PremiumFeatureError('You need a paid plan for this feature to be used.', 'Error fetching the signed TikTok WebSocket');
  assert.equal(kind(e), 'provider_denied');
  assert.ok(isProviderFault('provider_denied'));
});

test('UserOfflineError -> offline (waiting, not a failure); InvalidUniqueIdError -> user_not_found', () => {
  assert.equal(kind(new lib.UserOfflineError("The requested user isn't online :(")), 'offline');
  assert.equal(kind(new lib.InvalidUniqueIdError('bad')), 'user_not_found');
  assert.ok(isPermanent('user_not_found'));
  assert.ok(!isPermanent('offline'));
});

test('ConnectTimeoutError and our own timeout message -> timeout', () => {
  assert.equal(kind(new lib.ConnectTimeoutError('Timed out whilst connecting to WebSocket')), 'timeout');
  assert.equal(kind(new Error('انتهت مهلة الاتصال بتيك توك (@x)')), 'timeout');
});

test('composite errors are judged by their real inner causes', () => {
  assert.equal(kind(composite([new Error('[a] Failed to extract the SIGI_STATE HTML tag, you might be blocked by TikTok.'), new Error('Request failed with status code 403 (Forbidden)')])), 'blocked');
  assert.equal(kind(composite([new Error('x'), new lib.SignatureRateLimitError(null, 'limit', { headers: { 'retry-after': '12' } })])), 'rate_limited');
  assert.equal(kind(composite([new Error('[a] API Error 19881007 (user_not_found)')])), 'user_not_found');
  assert.equal(kind(composite([new Error('Failed to extract Room ID from HTML.'), new Error('Failed to extract Room ID from API.')])), 'offline');
  assert.equal(kind(composite([new Error('something unexpected')])), 'transient');
});

test('plain text fallbacks (older library shapes)', () => {
  assert.equal(kind(new Error("Cannot read properties of undefined (reading 'retry-after')")), 'rate_limited');
  assert.equal(kind(new Error('HTTP 429 Too Many Requests')), 'rate_limited');
  assert.equal(kind(new Error('Failed to connect to sign server.')), 'sign_failed');
  assert.equal(kind(new Error('connect ECONNREFUSED 1.2.3.4:443')), 'transient'); // شبكة عامة ≠ عطل مزود
  assert.equal(kind('just a string'), 'transient');
  assert.equal(kind(null), 'transient');
});

test('works when the library lacks a class (test doubles)', () => {
  assert.equal(classifyTikTokError(new Error('HTTP 429'), {}).kind, 'rate_limited');
  assert.equal(classifyTikTokError(new Error('boom'), undefined).kind, 'transient');
});

test('401 "The provided API Key is invalid" (exact Euler payload seen in production logs) -> provider_denied + invalidKey', () => {
  const e = new lib.SignAPIError('Sign Error', undefined, undefined, '[fetchSignedWebSocketFromEulerRoute] Unexpected sign server status 401. Payload:\n{"code":401,"message":"The provided API Key is invalid."}');
  assert.deepEqual(classifyTikTokError(e, lib), { kind: 'provider_denied', invalidKey: true });
  const other = new lib.SignAPIError('Sign Error', undefined, undefined, '[x] Unexpected sign server status 500. Payload:\noops');
  assert.equal(classifyTikTokError(other, lib).kind, 'sign_failed');
});

test('daily account limit (limit_label=rate_limit_account_day) is flagged as daily — real message shape from Euler', () => {
  const e = new lib.SignatureRateLimitError('You have reached the rate limit. Sign up for a free API key at https://www.eulerstream.com/pricing.', '(rate_limit_account_day) Too many connections started, try again later.', { headers: { 'retry-after': '7200' } });
  const r = classifyTikTokError(e, lib);
  assert.equal(r.kind, 'rate_limited'); assert.equal(r.daily, true); assert.equal(r.retryAfterMs, 7200000);
  const plain = new lib.SignatureRateLimitError(null, '(rate_limit_ip_minute) Too many connections started, try again later.', { headers: { 'retry-after': '20' } });
  assert.equal(classifyTikTokError(plain, lib).daily, false);
  assert.equal(classifyTikTokError(composite([e]), lib).daily, true);
});
