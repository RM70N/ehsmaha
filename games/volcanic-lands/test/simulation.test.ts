// اختبار المحاكاة بلا واجهة — §13.
// 1000 مباراة بـ20 لاعباً: متوسط الطول بين 5 و8 جولات، ونسبة «الوفاة الجماعية
// في نفس الجولة» أقل من 15٪.

import { describe, expect, it } from 'vitest';
import { simulateMatch, type MatchStats } from './helpers.js';

const MATCHES = 1000;
const PLAYERS = 20;

function summarize(results: readonly MatchStats[]) {
  const rounds = results.map((r) => r.rounds).sort((a, b) => a - b);
  const sum = rounds.reduce((a, b) => a + b, 0);
  const mean = sum / rounds.length;
  const median = rounds[Math.floor(rounds.length / 2)] as number;
  const massDeathRate = results.filter((r) => r.massDeath).length / results.length;
  const noWinner = results.filter((r) => r.winnerId === null).length;
  return {
    mean, median,
    min: rounds[0] as number,
    max: rounds[rounds.length - 1] as number,
    massDeathRate,
    noWinner,
  };
}

describe('توازن المباراة عبر 1000 محاكاة', () => {
  it('متوسط الطول بين 5 و8 جولات، والوفاة الجماعية أقل من 15٪', () => {
    const results: MatchStats[] = [];
    for (let i = 0; i < MATCHES; i++) {
      results.push(simulateMatch(PLAYERS, 1000 + i));
    }
    const s = summarize(results);

    // eslint-disable-next-line no-console
    console.log(
      `\n📊 إحصائية ${MATCHES} مباراة × ${PLAYERS} لاعباً\n` +
      `   متوسط الجولات   : ${s.mean.toFixed(2)}\n` +
      `   وسيط الجولات    : ${s.median}\n` +
      `   أقصر / أطول     : ${s.min} / ${s.max}\n` +
      `   وفاة جماعية     : ${(s.massDeathRate * 100).toFixed(2)}٪\n` +
      `   مباريات بلا فائز: ${s.noWinner}\n`,
    );

    expect(s.mean).toBeGreaterThanOrEqual(5);
    expect(s.mean).toBeLessThanOrEqual(8);
    expect(s.massDeathRate).toBeLessThan(0.15);
    expect(s.noWinner).toBe(0);
  }, 120000);

  it('كل مباراة تنتهي — لا حلقة لا نهائية', () => {
    for (let i = 0; i < 50; i++) {
      const r = simulateMatch(PLAYERS, 50000 + i);
      expect(r.rounds).toBeGreaterThan(0);
      expect(r.survivors).toBeLessThanOrEqual(1);
      expect(r.winnerId).not.toBeNull();
    }
  }, 60000);
});
