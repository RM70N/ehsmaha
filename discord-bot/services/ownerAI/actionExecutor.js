'use strict';

// المنفّذ الفعلي: يحوّل خطوة الخطة لإجراء حقيقي عبر discord.js.
// "رد Gemini" ما يُعتبر تنفيذ أبداً — النجاح يتحدد فقط باستجابة Discord API ثم التحقق من النتيجة.
// قبل كل خطوة: إعادة فحص هوية المالك + حل المراجع والأسماء + فحص صلاحيات البوت.

const ownerGuard = require('./ownerGuard');
const memory = require('./conversationMemory');
const { resolveArgs } = require('./entityResolver');
const { validate } = require('./schema');
const { OwnerAIError } = require('./errorHandler');
const kit = require('./toolKit');

const STEP_TIMEOUT_MS = 45 * 1000;
const STEP_REF = /^\$(s\d+)\.(\w+)$/;

function substitute(value, env) {
  if (typeof value === 'string') {
    const m = value.match(STEP_REF);
    if (m) {
      const r = env.results.get(m[1]);
      const v = r && r.status === 'ok' && r.outputs ? r.outputs[m[2]] : undefined;
      if (v === undefined || v === null || v === '') throw new OwnerAIError('REF_MISSING', { ref: value });
      return String(v);
    }
    const mem = value.match(/^\$memory\.(\w+)$/);
    if (mem) {
      const v = memory.ref(env.guild.id, mem[1]);
      if (!v) throw new OwnerAIError('REF_MISSING', { ref: value });
      return v;
    }
    if (value === '$here') return env.actor.channelId;
    if (value === '$reply') {
      if (!env.replyRef) throw new OwnerAIError('REF_MISSING', { ref: value });
      return env.replyRef;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, env));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, env)]));
  return value;
}

/** صلاحيات البوت اللي تحتاجها الأداة (سيرفر + روم). skipUnresolved: الحقول اللي لسا نصوص تنتخطى (للفحص المبدئي) */
function checkPerms(tool, args, guild, { skipUnresolved = false } = {}) {
  if (tool.guildPerms && tool.guildPerms.length) kit.requireGuildPerms(guild, tool.guildPerms);
  for (const { arg, perms } of tool.channelPerms || []) {
    const target = args[arg];
    if (!target || typeof target === 'string') {
      if (skipUnresolved) continue;
      throw new OwnerAIError('INVALID_ARGS', { detail: `الحقل ${arg} غير محدد` });
    }
    kit.requireChannelPerms(target, perms);
  }
}

const withTimeout = (promise, ms) => {
  let t;
  return Promise.race([promise, new Promise((_, rej) => (t = setTimeout(() => rej(new OwnerAIError('UNEXPECTED', {}, 'انتهت مهلة تنفيذ الخطوة')), ms)))]).finally(() => clearTimeout(t));
};

/**
 * @returns {Promise<{outputs:object, done:string, doneVerb?:string}>}
 */
async function runStep({ step, tool, actor, guild, client, taskId, results, replyRef }) {
  ownerGuard.assertOwner(actor); // إعادة فحص التفويض قبل كل تنفيذ (مو عند الاستقبال فقط)
  const env = { guild, actor, results, replyRef };
  const substituted = substitute(step.args, env);
  const checked = validate(tool.schema, substituted, tool.name);
  if (!checked.ok) throw new OwnerAIError('INVALID_ARGS', { detail: checked.errors.slice(0, 3).join('؛ ') });
  const lastMsg = memory.ref(guild.id, 'lastMessage');
  const args = await resolveArgs(tool.schema, checked.value, { guild, memoryChannelId: lastMsg ? lastMsg.split('/')[0] : null, originChannelId: actor.channelId });
  if (typeof tool.validate === 'function') tool.validate(checked.value);
  checkPerms(tool, args, guild);
  const ctx = { guild, client, actor, taskId, stepId: step.id, nonce: (s) => kit.nonce({ taskId, stepId: step.id }, s) };
  const result = await withTimeout(Promise.resolve(tool.run(ctx, args)), STEP_TIMEOUT_MS);
  if (typeof tool.verify === 'function') {
    let ok = false;
    try {
      ok = await tool.verify(ctx, args, result);
    } catch {
      ok = false;
    }
    if (!ok) throw new OwnerAIError('VERIFY_FAILED', { tool: tool.name });
  }
  return result;
}

module.exports = { runStep, checkPerms, substitute };
