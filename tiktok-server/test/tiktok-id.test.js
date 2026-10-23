'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTikTokId } = require('../lib/tiktok-id');

test('normalizeTikTokId: كل صيغ نفس اليوزر تنتهي لنفس المعرّف', () => {
  for (const raw of ['streamer1', 'Streamer1', '@streamer1', '@@Streamer1', ' streamer1 ', 'STREAMER1\n',
    'https://www.tiktok.com/@streamer1/live', 'https://www.tiktok.com/@streamer1', 'tiktok.com/@streamer1', 'https://tiktok.com/@Streamer1/live?lang=ar',
    'www.tiktok.com/@streamer1?is_from_webapp=1&sender_device=pc', 'http://m.tiktok.com/@streamer1/', 'streamer1/', '@streamer1//', 'https://www.tiktok.com/@streamer1/video/7123456789#c',
    'streamer1‏', '‎Streamer1', 'streamer1​', '‮@streamer1‬', '﻿streamer1', 'https://www.tiktok.com/%40streamer1/live']) {
    assert.deepEqual(normalizeTikTokId(raw), { ok: true, id: 'streamer1' }, JSON.stringify(raw));
  }
});

test('normalizeTikTokId: النقطة والشرطة السفلية والأرقام تبقى', () => {
  assert.equal(normalizeTikTokId('layl.rider_99').id, 'layl.rider_99');
  assert.equal(normalizeTikTokId('@Layl.Rider').id, 'layl.rider');
});

test('normalizeTikTokId: مدخلات غلط ترجع سبباً (بلا استثناءات)', () => {
  const cases = [[undefined, 'empty'], [null, 'empty'], ['', 'empty'], ['  ', 'empty'], ['@', 'empty'], ['‏‎', 'empty'],
    ['a', 'too_short'], ['x'.repeat(25), 'too_long'], ['اسم عربي', 'invalid'], ['has space', 'invalid'], ['user!', 'invalid'], ['a/b', 'invalid'],
    ['https://vm.tiktok.com/ZMabc123/', 'invalid'], ['https://www.tiktok.com/discover', 'invalid'], ['https://youtube.com/@x', 'invalid'], ['<script>', 'invalid'], [{}, 'invalid']];
  for (const [raw, reason] of cases) {
    const r = normalizeTikTokId(raw);
    assert.equal(r.ok, false, String(raw)); assert.equal(r.reason, reason, String(raw));
  }
  assert.equal(normalizeTikTokId(12345).ok, true);
});
