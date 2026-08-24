// تطبيع نص الشات ومطابقة الإجابات — §6.
// المطابقة تامة بعد التشذيب: «أعتقد 3» لا تُحتسب إطلاقاً.

import type { AnswerChoice } from './types.js';
import { VOLCANIC_LANDS_CONFIG } from './config.js';

/** الحركات والتشكيل وعلامات التطويل التي تُزال قبل المطابقة. */
const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ]/g;

/** المحارف غير المرئية (اتجاه النص، مسافات صفرية) التي تلتصق بنصوص RTL. */
const INVISIBLES = /[​-‏‪-‮⁦-⁩﻿]/g;

/** الأرقام العربية-الهندية ونظيرتها الفارسية → لاتينية. */
const ARABIC_INDIC_START = 0x0660;
const EXTENDED_ARABIC_INDIC_START = 0x06f0;

function foldDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (code >= ARABIC_INDIC_START && code <= ARABIC_INDIC_START + 9) {
      out += String(code - ARABIC_INDIC_START);
    } else if (code >= EXTENDED_ARABIC_INDIC_START && code <= EXTENDED_ARABIC_INDIC_START + 9) {
      out += String(code - EXTENDED_ARABIC_INDIC_START);
    } else {
      out += ch;
    }
  }
  return out;
}

/** توحيد أشكال الألف والياء والتاء المربوطة والهمزات. */
function foldArabicLetters(input: string): string {
  return input
    .replace(/[آأإٱ]/g, 'ا') // آ أ إ ٱ → ا
    .replace(/ى/g, 'ي')                     // ى → ي
    .replace(/ة/g, 'ه')                     // ة → ه
    .replace(/ؤ/g, 'و')                     // ؤ → و
    .replace(/ئ/g, 'ي');                    // ئ → ي
}

/**
 * التشذيب الكامل: إزالة المحارف غير المرئية والحركات، توحيد الحروف،
 * تحويل الأرقام العربية للاتينية، إزالة كل ما ليس حرفاً أو رقماً، وتصغير الحالة.
 */
export function normalize(input: string): string {
  if (typeof input !== 'string') return '';
  let s = input.normalize('NFKC');
  s = s.replace(INVISIBLES, '');
  s = s.replace(ARABIC_DIACRITICS, '');
  s = foldDigits(s);
  s = foldArabicLetters(s);
  s = s.toLowerCase();
  // يُبقى على الحروف والأرقام فقط — يزيل علامات الترقيم والإيموجي والمسافات.
  s = s.replace(/[^\p{L}\p{N}]/gu, '');
  return s;
}

/** جدول مطابقة معكوس يُبنى مرة واحدة من answerAliases. */
function buildAliasTable(): ReadonlyMap<string, AnswerChoice> {
  const table = new Map<string, AnswerChoice>();
  const choices: AnswerChoice[] = [1, 2, 3, 4];
  for (const choice of choices) {
    for (const alias of VOLCANIC_LANDS_CONFIG.answerAliases[choice]) {
      const key = normalize(alias);
      if (key) table.set(key, choice);
    }
  }
  return table;
}

const ALIAS_TABLE = buildAliasTable();

/**
 * يُرجع رقم الخيار إذا كان النص إجابةً صالحة، وإلا null.
 * مطابقة تامة فقط — لا «يحتوي على».
 */
export function matchAlias(text: string): AnswerChoice | null {
  const key = normalize(text);
  if (!key) return null;
  return ALIAS_TABLE.get(key) ?? null;
}

/** هل النص هو كلمة الانضمام بالضبط (بعد التشذيب)؟ */
export function matchesJoinKeyword(text: string, joinKeyword: string): boolean {
  const key = normalize(text);
  if (!key) return false;
  return key === normalize(joinKeyword);
}

/** قصّ الاسم للعرض مع دعم الإيموجي (يقصّ بالمحارف الكاملة لا بوحدات UTF-16). */
export function truncateNickname(
  nickname: string,
  maxChars: number = VOLCANIC_LANDS_CONFIG.chat.nicknameMaxChars,
): string {
  const cleaned = (nickname || '').replace(INVISIBLES, '').trim();
  if (!cleaned) return '؟';
  const chars = Array.from(cleaned);
  if (chars.length <= maxChars) return cleaned;
  return chars.slice(0, maxChars).join('') + '…';
}

/** لون ثابت مشتق من userId — يضمن نفس اللون لنفس اللاعب كل مرة (§8). */
export function colorForUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 62%, 52%)`;
}

/** أول حرفين من الاسم — بديل الأفتار عند فشل الصورة (§7). */
export function initialsForNickname(nickname: string): string {
  const chars = Array.from((nickname || '').trim());
  if (chars.length === 0) return '؟';
  return chars.slice(0, 2).join('');
}
