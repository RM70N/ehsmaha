// حساب النقاط والبلوكات واللافا وشروط الخروج والتعادل — §5.

import type { LeaderboardRow, Player, ScoreTier } from './types.js';
import type { DifficultyMode } from './config.js';
import { VOLCANIC_LANDS_CONFIG, lavaRiseForRound } from './config.js';

/**
 * الطبقة الزمنية للإجابة الصحيحة. `answerSeconds` تُقاس من لحظة *عرض* السؤال
 * لا من لحظة وصول الرسالة للواجهة (§6).
 */
export function tierForAnswerTime(answerSeconds: number): ScoreTier {
  const tiers = VOLCANIC_LANDS_CONFIG.tiers;
  for (const tier of tiers) {
    if (answerSeconds <= tier.maxTime) return tier;
  }
  return tiers[tiers.length - 1] as ScoreTier;
}

export interface RoundReward {
  readonly points: number;
  readonly blocks: number;
  readonly label: string;
  readonly correct: boolean;
}

/** مكافأة لاعب واحد في جولة واحدة. */
export function rewardFor(
  choice: number | null,
  correctIndexZeroBased: number,
  answerSeconds: number | null,
): RoundReward {
  const answeredCorrectly = choice !== null && choice - 1 === correctIndexZeroBased;
  if (!answeredCorrectly || answerSeconds === null) {
    return {
      points: VOLCANIC_LANDS_CONFIG.wrongAnswer.points,
      blocks: VOLCANIC_LANDS_CONFIG.wrongAnswer.blocks,
      label: '',
      correct: false,
    };
  }
  const tier = tierForAnswerTime(answerSeconds);
  return { points: tier.points, blocks: tier.blocks, label: tier.label, correct: true };
}

/** مستوى سطح اللافا التراكمي بعد انتهاء الجولة r. */
export function cumulativeLavaLevel(round: number, mode: DifficultyMode): number {
  let level = 0;
  for (let r = 1; r <= round; r++) level += lavaRiseForRound(r, mode);
  return level;
}

/** يحترق اللاعب إذا وصلت اللافا لسطح برجه أو تجاوزته. */
export function isDrowned(player: Player, lavaLevel: number): boolean {
  return player.height <= lavaLevel;
}

/** ارتفاع بداية اللاعب المتأخر: مستوى اللافا الحالي + الهامش (§5). */
export function lateJoinHeight(lavaLevel: number): number {
  return lavaLevel + VOLCANIC_LANDS_CONFIG.lateJoinLavaMargin;
}

/** متوسط زمن الإجابة الصحيحة — آخر معيار في فض التعادل. */
export function averageAnswerTime(player: Player): number {
  if (player.correctAnswers === 0) return Infinity;
  return player.totalAnswerTime / player.correctAnswers;
}

/**
 * ترتيب اللاعبين — §5: مَن نجا أطول، ثم النقاط، ثم أسرع متوسط زمن إجابة.
 * اللاعب الحي يُعامل كأنه نجا لما لا نهاية (لم يحترق بعد).
 */
export function rankPlayers(players: readonly Player[]): LeaderboardRow[] {
  const survivalOf = (p: Player): number => (p.alive ? Number.POSITIVE_INFINITY : p.burnedAtRound ?? 0);

  const sorted = players.slice().sort((a, b) => {
    const sa = survivalOf(a);
    const sb = survivalOf(b);
    if (sa !== sb) return sb - sa;
    if (a.points !== b.points) return b.points - a.points;
    const ta = averageAnswerTime(a);
    const tb = averageAnswerTime(b);
    if (ta !== tb) return ta - tb;
    // معيار أخير ثابت حتى لا يتغيّر الترتيب بين إعادتي رسم على تعادل تام.
    return a.userId.localeCompare(b.userId);
  });

  return sorted.map((p, i) => ({
    userId: p.userId,
    nickname: p.nickname,
    avatarUrl: p.avatarUrl,
    points: p.points,
    height: p.height,
    alive: p.alive,
    rank: i + 1,
  }));
}

/** أفضل N للشريط الجانبي (§10). */
export function topPlayers(players: readonly Player[], count: number): LeaderboardRow[] {
  return rankPlayers(players).slice(0, count);
}
