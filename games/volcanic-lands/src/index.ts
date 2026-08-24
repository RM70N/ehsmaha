// نقطة الدخول — تُبنى لملف JS واحد يُحقن في index.html تحت
// window.VolcanicLands. لا يوجد أي DOM هنا؛ الواجهة تستهلك هذا فقط.

import questionBankFile from '../data/questions.ar.json' with { type: 'json' };
import type { QuestionBankFile } from './types.js';
import { QuestionBank } from './question-bank.js';
import { type EngineEvents, VolcanicLandsEngine } from './engine.js';
import { MemoryStorage, resolveStorage } from './storage.js';
import { seededRandom, systemRandom } from './random.js';
import {
  DIFFICULTY_PRESETS, VOLCANIC_LANDS_CONFIG, defaultStreamerSettings,
  difficultyForRound, lavaRiseForRound,
} from './config.js';
import {
  colorForUserId, initialsForNickname, matchAlias, matchesJoinKeyword, normalize, truncateNickname,
} from './normalize.js';
import { averageAnswerTime, cumulativeLavaLevel, rankPlayers, rewardFor, tierForAnswerTime, topPlayers } from './scoring.js';
import { StateMachine, systemClock } from './state-machine.js';

const BANK = questionBankFile as unknown as QuestionBankFile;

/** المسار المعتاد: بنك أسئلة مربوط بحساب الستريمر، بتخزين حقيقي. */
function createBank(streamerId: string): QuestionBank {
  return new QuestionBank(BANK.questions, resolveStorage(), streamerId, () => systemRandom);
}

/** محرّك جاهز للاستخدام من لوحة تحكم الستريمر. */
function createEngine(streamerId: string, events: EngineEvents = {}): VolcanicLandsEngine {
  return new VolcanicLandsEngine(createBank(streamerId), events);
}

export const VolcanicLands = {
  // بيانات
  questions: BANK,
  // إعدادات
  CONFIG: VOLCANIC_LANDS_CONFIG,
  DIFFICULTY_PRESETS,
  defaultStreamerSettings,
  difficultyForRound,
  lavaRiseForRound,
  cumulativeLavaLevel,
  // أصناف
  QuestionBank,
  Engine: VolcanicLandsEngine,
  StateMachine,
  MemoryStorage,
  // مصانع
  createBank,
  createEngine,
  resolveStorage,
  systemClock,
  systemRandom,
  seededRandom,
  // أدوات نصّية
  normalize,
  matchAlias,
  matchesJoinKeyword,
  truncateNickname,
  colorForUserId,
  initialsForNickname,
  // نقاط وترتيب
  tierForAnswerTime,
  rewardFor,
  rankPlayers,
  topPlayers,
  averageAnswerTime,
} as const;

export type VolcanicLandsApi = typeof VolcanicLands;

declare global {
  interface Window { VolcanicLands: VolcanicLandsApi }
}

if (typeof window !== 'undefined') {
  window.VolcanicLands = VolcanicLands;
}

export default VolcanicLands;
