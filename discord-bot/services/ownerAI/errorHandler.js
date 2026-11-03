'use strict';

// أخطاء نظام تنفيذ أوامر المالك + رسائل واضحة باللهجة السعودية.
// قاعدة ثابتة: ما نرسل نجاح وهمي أبداً، وما نكشف توكنات/مفاتيح/بيانات البيئة بأي رسالة.

const { PERM_NAMES_AR } = require('../../utils/permissions');

const KIND_AR = { channel: 'روم', textChannel: 'روم', voiceChannel: 'روم صوتي', category: 'قسم', thread: 'ثريد', role: 'رتبة', member: 'عضو', message: 'رسالة' };

class OwnerAIError extends Error {
  /** @param {string} code  رمز ثابت (يُستخدم بالاختبارات والسجل) @param {object} [meta] @param {string} [message] */
  constructor(code, meta = {}, message = '') {
    super(message || code);
    this.name = 'OwnerAIError';
    this.code = code;
    this.meta = meta;
  }
}

// يخفي أي نص يشبه توكن/مفتاح (سلاسل طويلة بدون مسافات)
function redact(text) {
  return String(text || '').replace(/[A-Za-z0-9_\-.]{32,}/g, '[محجوب]');
}

const EXTRA_PERMS_AR = {
  PinMessages: 'تثبيت الرسائل (Pin Messages)',
  CreatePublicThreads: 'إنشاء ثريدات عامة (Create Public Threads)',
  SendMessagesInThreads: 'الإرسال داخل الثريدات (Send Messages in Threads)',
  ManageThreads: 'إدارة الثريدات (Manage Threads)'
};
const permList = (names) => names.map((n) => PERM_NAMES_AR[n] || EXTRA_PERMS_AR[n] || n).join('، ');
const kindAr = (k) => KIND_AR[k] || 'عنصر';

// رموز أخطاء Discord API الشائعة ← OwnerAIError
function fromDiscord(err) {
  if (err instanceof OwnerAIError) return err;
  const code = err && err.code;
  const status = err && (err.status || err.httpStatus);
  const map = {
    50013: 'DISCORD_PERMISSIONS',
    50001: 'DISCORD_ACCESS',
    50035: 'DISCORD_BAD_VALUE',
    10003: 'DISCORD_UNKNOWN_CHANNEL',
    10008: 'DISCORD_UNKNOWN_MESSAGE',
    10011: 'DISCORD_UNKNOWN_ROLE',
    10007: 'DISCORD_UNKNOWN_MEMBER',
    30013: 'DISCORD_LIMIT_CHANNELS',
    30005: 'DISCORD_LIMIT_ROLES',
    30003: 'DISCORD_LIMIT_PINS',
    50024: 'DISCORD_BAD_CHANNEL_TYPE',
    160004: 'DISCORD_THREAD_EXISTS'
  };
  if (map[code]) return new OwnerAIError(map[code], { discordCode: code }, err.message);
  if (status === 429) return new OwnerAIError('DISCORD_RATE_LIMIT', {}, err && err.message);
  return new OwnerAIError('UNEXPECTED', {}, redact(err && err.message));
}

function describe(err) {
  const e = err instanceof OwnerAIError ? err : fromDiscord(err);
  const m = e.meta || {};
  switch (e.code) {
    case 'NOT_OWNER':
      return 'هذا الأمر للمالك فقط.';
    case 'ENTITY_NOT_FOUND':
      if (m.kind === 'channel' || m.kind === 'textChannel' || m.kind === 'voiceChannel') return 'ما لقيت روم بهذا الاسم. تأكد من الاسم أو منشن الروم لي.';
      return `ما لقيت ${kindAr(m.kind)} بهذا الاسم${m.input ? ` ("${String(m.input).slice(0, 60)}")` : ''}. تأكد من الاسم أو منشنه لي أو حط معرّفه.`;
    case 'WRONG_KIND':
      return `"${String(m.input || '').slice(0, 60)}" مو ${kindAr(m.kind)} — حدد ${kindAr(m.kind)} صحيح.`;
    case 'AMBIGUOUS': {
      const lines = (m.candidates || []).slice(0, 5).map((c, i) => `${i + 1}. ${c.label}${c.hint ? ` — ${c.hint}` : ''}`);
      return `لقيت أكثر من ${kindAr(m.kind)} بنفس الاسم تقريباً:\n${lines.join('\n')}\nأيهم تقصد؟ منشنه لي أو قل رقمه${m.preflight ? '، وما نفذت أي شي للحين' : ''}.`;
    }
    case 'NO_BOT_PERM': {
      const perms = m.perms || [];
      if (m.channel && perms.includes('SendMessages')) return 'لقيت الروم، لكن ما عندي صلاحية إرسال الرسائل فيه.';
      return `ما عندي صلاحية ${permList(perms)}${m.channel ? ` في ${m.channel}` : ''}.`;
    }
    case 'GEMINI_FAILED':
      return 'ما قدرت أفهم الطلب الحين بسبب مشكلة بالمساعد، وما نفذت أي إجراء.';
    case 'PARSE_FAILED':
      return 'ما قدرت أفهم الطلب بشكل واضح، وما نفذت أي إجراء. جرّب تعيد صياغته.';
    case 'INVALID_ARGS':
      return `الطلب ناقص أو فيه قيمة غير صالحة${m.detail ? ` (${redact(m.detail).slice(0, 160)})` : ''} — ما نفذت شي.`;
    case 'UNKNOWN_TOOL':
      return 'ما عندي أداة تنفذ هذا الطلب حالياً.';
    case 'TOO_MANY_STEPS':
      return `الطلب كبير (أكثر من ${m.max} خطوة). قسّمه على أكثر من رسالة وما نفذت شي.`;
    case 'HIERARCHY':
      return m.detail ? `ما أقدر أنفذ هذا: ${m.detail}` : 'ما أقدر أتعامل معها لأن رتبتها أعلى من رتبتي أو مساوية لها.';
    case 'FORBIDDEN_PERMISSION':
      return `ما أقدر أمنح أو أعدّل صلاحية حساسة (${(m.names || []).join('، ')}) من هنا — سوّها يدوياً من إعدادات السيرفر.`;
    case 'PARTIAL_WARN':
      return m.detail || 'التحذير انسجل لكن تعذّر تعديل الرتب.';
    case 'NOT_BOT_MESSAGE':
      return 'أقدر أعدّل أو أحذف رسائلي أنا فقط.';
    case 'DEPENDENCY_FAILED':
      return 'تخطيت هذي الخطوة لأن خطوة سابقة تعتمد عليها ما نجحت.';
    case 'REF_MISSING':
      return 'ما لقيت ناتج الخطوة السابقة اللي تعتمد عليها هذي الخطوة.';
    case 'VERIFY_FAILED':
      return 'نفذت الطلب لكن ما قدرت أتأكد من النتيجة.';
    case 'FILE_NOT_ALLOWED':
      return 'هذا الملف مو من الملفات المسموح لي أرسلها.';
    case 'ALREADY_DONE':
      return 'العملية كانت منفذة من قبل.';
    case 'DISCORD_PERMISSIONS':
      return 'ديسكورد رفض العملية: صلاحياتي ناقصة أو رتبتي أقل من المطلوب.';
    case 'DISCORD_ACCESS':
      return 'ما عندي وصول لهذا الروم أو العنصر.';
    case 'DISCORD_BAD_VALUE':
      return 'ديسكورد رفض القيمة المطلوبة (الاسم أو الوصف أو الإعداد غير مقبول).';
    case 'DISCORD_UNKNOWN_CHANNEL':
      return 'الروم ما عاد موجود.';
    case 'DISCORD_UNKNOWN_MESSAGE':
      return 'الرسالة ما عادت موجودة.';
    case 'DISCORD_UNKNOWN_ROLE':
      return 'الرتبة ما عادت موجودة.';
    case 'DISCORD_UNKNOWN_MEMBER':
      return 'العضو مو موجود بالسيرفر.';
    case 'DISCORD_LIMIT_CHANNELS':
      return 'وصل السيرفر للحد الأقصى من الرومات في ديسكورد.';
    case 'DISCORD_LIMIT_ROLES':
      return 'وصل السيرفر للحد الأقصى من الرتب في ديسكورد.';
    case 'DISCORD_LIMIT_PINS':
      return 'الروم وصل للحد الأقصى من الرسائل المثبتة (50).';
    case 'DISCORD_BAD_CHANNEL_TYPE':
      return 'نوع الروم ما يدعم هذي العملية.';
    case 'DISCORD_THREAD_EXISTS':
      return 'فيه ثريد مفتوح لهذي الرسالة من قبل.';
    case 'DISCORD_RATE_LIMIT':
      return 'ديسكورد حدّد سرعة الطلبات، جرّب بعد شوي.';
    case 'EXPIRED':
      return 'انتهت صلاحية هذا الطلب (أكثر من 15 دقيقة) — أعد إرساله.';
    case 'BUSY':
      return 'عندي طلبات كثيرة قيد التنفيذ بنفس السيرفر، انتظر شوي وأعد المحاولة.';
    default:
      return `صار خطأ غير متوقع وما أكملت${e.message && e.message !== e.code ? ` (${redact(e.message).slice(0, 120)})` : ''}.`;
  }
}

/**
 * تقرير نهائي للمالك من نتائج الخطوات. ما فيه نجاح وهمي: كل سطر يعكس نتيجة حقيقية.
 * @param {{id:string,tool:string,status:'ok'|'failed'|'skipped',done?:string,error?:OwnerAIError,failVerb?:string}[]} results
 */
function buildReport(results) {
  if (!results.length) return 'ما فيه شي أنفذه.';
  const ok = results.filter((r) => r.status === 'ok');
  const bad = results.filter((r) => r.status !== 'ok');
  if (!bad.length) {
    if (results.length === 1) return `✅ ${results[0].done}`;
    return `✅ تم تنفيذ كل الخطوات:\n${results.map((r) => `• ${r.done}`).join('\n')}`;
  }
  const failed = bad.filter((r) => r.status === 'failed');
  const skipped = bad.filter((r) => r.status === 'skipped');
  if (!ok.length && results.length === 1) return `❌ ${describe(failed[0].error)}`;
  const parts = [];
  if (ok.length) {
    // "أنشأت الروم وأرسلت الرسالة" — صياغة المتكلم بالماضي لكل خطوة نجحت
    const doneText = ok.map((r) => r.doneVerb || r.done).join(' و');
    const f = failed[0];
    parts.push(
      f
        ? `${doneText}، لكن ما قدرت ${f.failVerb || 'أكمل الخطوة التالية'} لأن ${describeReason(f.error)}`
        : doneText
    );
  } else if (failed[0]) {
    parts.push(`ما نجحت أي خطوة. أول فشل: ${describe(failed[0].error)}`);
  }
  const extra = [];
  for (const f of failed.slice(ok.length ? 1 : 1)) extra.push(`❌ ${f.failVerb || f.tool}: ${describe(f.error)}`);
  if (skipped.length) extra.push(`⏭️ ما نفذت ${skipped.length === 1 ? 'خطوة' : `${skipped.length} خطوات`} تعتمد على اللي فشل: ${skipped.map((s) => s.failVerb || s.tool).join('، ')}`);
  return `⚠️ ${parts.join('')}${extra.length ? `\n${extra.join('\n')}` : ''}`;
}

// "لأن ..." — نحوّل الرسالة الكاملة لسبب مختصر
function describeReason(err) {
  const e = err instanceof OwnerAIError ? err : fromDiscord(err);
  const m = e.meta || {};
  if (e.code === 'NO_BOT_PERM') return `صلاحية ${permList(m.perms || [])} ناقصة.`;
  return describe(e).replace(/\.$/, '') + '.';
}

module.exports = { OwnerAIError, describe, describeReason, fromDiscord, buildReport, redact, kindAr, permList };
