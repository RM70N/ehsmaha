'use strict';

// مخطّط المهام: يتحقق من خطة Gemini ويحوّلها لخطوات قابلة للتنفيذ.
//   • كل خطوة: أداة موجودة بالسجل + مدخلات صالحة (JSON Schema) + قيود الأداة (validate)
//   • خطوات متعددة مترابطة: مرجع $sN.<ناتج> يعتمد على نجاح الخطوة N؛ فشلها يلغي التابعة لها فقط
//   • لا شي من مخرجات Gemini يمر لـDiscord API بدون تحقق، والصلاحيات ما يقررها Gemini أبداً
//   • الخطة النهائية ثابتة (hash) — هي نفسها اللي يُطلب تأكيدها وتنفَّذ بعد الموافقة

const crypto = require('node:crypto');
const { validate } = require('./schema');
const registry = require('./toolRegistry');
const memory = require('./conversationMemory');
const queue = require('./executionQueue');
const { OwnerAIError, fromDiscord } = require('./errorHandler');
const { resolveArgs } = require('./entityResolver');
const executor = require('./actionExecutor');

const STEP_REF = /^\$(s\d+)\.(\w+)$/;

function collectStepRefs(value, out = new Set()) {
  if (typeof value === 'string') {
    const m = value.match(STEP_REF);
    if (m) out.add(m[1]);
  } else if (Array.isArray(value)) value.forEach((v) => collectStepRefs(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStepRefs(v, out));
  return out;
}

/** يتحقق من خطوات Gemini الخام ويرجّع خطوات نظيفة { id, tool, args, dependsOn } أو يرمي OwnerAIError */
function normalizeSteps(raw) {
  if (!Array.isArray(raw) || !raw.length) throw new OwnerAIError('INVALID_ARGS', { detail: 'الخطة فاضية' });
  if (raw.length > queue.MAX_STEPS) throw new OwnerAIError('TOO_MANY_STEPS', { max: queue.MAX_STEPS });
  const steps = [];
  const ids = new Set();
  raw.forEach((s, i) => {
    if (!s || typeof s !== 'object') throw new OwnerAIError('INVALID_ARGS', { detail: `الخطوة ${i + 1} غير صالحة` });
    const tool = registry.get(String(s.tool || '').trim());
    if (!tool) throw new OwnerAIError('UNKNOWN_TOOL', { tool: String(s.tool || '').slice(0, 40) });
    let id = typeof s.id === 'string' && /^s\d+$/.test(s.id) && !ids.has(s.id) ? s.id : `s${i + 1}`;
    if (ids.has(id)) id = `s${i + 1}x`;
    const checked = validate(tool.schema, s.args && typeof s.args === 'object' ? s.args : {}, tool.name);
    if (!checked.ok) throw new OwnerAIError('INVALID_ARGS', { detail: checked.errors.slice(0, 3).join('؛ ') });
    if (typeof tool.validate === 'function') tool.validate(checked.value);
    const refs = collectStepRefs(checked.value);
    for (const r of refs) if (!ids.has(r)) throw new OwnerAIError('INVALID_ARGS', { detail: `الخطوة ${id} تشير لخطوة غير موجودة قبلها (${r})` });
    const explicit = (Array.isArray(s.dependsOn) ? s.dependsOn : []).filter((d) => ids.has(d));
    ids.add(id);
    steps.push({ id, tool: tool.name, args: checked.value, dependsOn: [...new Set([...refs, ...explicit])] });
  });
  return steps;
}

const canonical = (steps) => JSON.stringify(steps.map((s) => ({ id: s.id, tool: s.tool, args: s.args, dependsOn: s.dependsOn })));
const hashPlan = (steps) => crypto.createHash('sha256').update(canonical(steps)).digest('hex');
const serializePlan = (steps) => canonical(steps);
const parseStoredPlan = (json) => normalizeSteps(JSON.parse(json));

// قيمة كيان محلول ← نص ثابت (معرّف). الخطة المحفوظة/المعروضة للتأكيد تحمل المعرّفات النهائية فقط،
// فأي تغيير باسم روم أو رتبة بعد العرض ما يغيّر الهدف اللي وافق عليه المالك.
function freezeValue(v) {
  if (Array.isArray(v)) return v.map(freezeValue);
  if (v && typeof v === 'object') {
    if (v.messageId && v.channelId) return `${v.channelId}/${v.messageId}`;
    if (v.id) return String(v.id);
  }
  return v;
}

/**
 * فحص مبدئي قبل أي تنفيذ: حل الأسماء لمعرّفات (ويرمي لو الروم/العضو غير موجود أو غامض)، وفحص صلاحيات
 * البوت المتوقعة، وجمع أسباب طلب التأكيد. ما يغيّر شي بديسكورد.
 * @returns {{ steps: object[], resolved: object[], reasons: string[], lines: string[] }}  steps = الخطة المجمّدة (معرّفات نهائية)
 */
async function preflight(steps, env) {
  const resolved = [];
  const frozen = [];
  const reasons = [];
  const lines = [];
  for (const step of steps) {
    const tool = registry.get(step.tool);
    let args = step.args;
    try {
      args = await resolveArgs(tool.schema, step.args, { guild: env.guild, memoryChannelId: memory.ref(env.guild.id, 'lastMessage') ? memory.ref(env.guild.id, 'lastMessage').split('/')[0] : null, originChannelId: env.actor.channelId, skipRefs: true });
      executor.checkPerms(tool, args, env.guild, { skipUnresolved: true });
    } catch (err) {
      const e = err instanceof OwnerAIError ? err : fromDiscord(err);
      e.meta = { ...(e.meta || {}), preflight: true };
      throw e;
    }
    resolved.push(args);
    const props = (tool.schema && tool.schema.properties) || {};
    const frozenArgs = { ...step.args };
    for (const [key, sub] of Object.entries(props)) {
      if (sub['x-entity'] && args[key] !== undefined && typeof args[key] !== 'string' && !(Array.isArray(args[key]) && args[key].every((x) => typeof x === 'string'))) frozenArgs[key] = freezeValue(args[key]);
    }
    frozen.push({ ...step, args: frozenArgs });
    const why = [];
    if (tool.risk === 'high') why.push(typeof tool.confirm === 'function' ? tool.confirm(args) || 'إجراء عالي الخطورة' : 'إجراء عالي الخطورة');
    else if (typeof tool.confirm === 'function') {
      const r = tool.confirm(args);
      if (r) why.push(r);
    }
    reasons.push(...why.map((w) => `${tool.label}: ${w}`));
    lines.push(`${step.id}. ${typeof tool.describe === 'function' ? tool.describe(args) : tool.label}`);
  }
  return { steps: frozen, resolved, reasons, lines };
}

/**
 * تنفيذ الخطة بالترتيب. الخطوة التابعة لخطوة فشلت تُتخطى (DEPENDENCY_FAILED) — والمستقلة تكمل.
 * @param {{steps:object[], actor:{userId:string,channelId:string,messageId:string}, guild:object, client:object, taskId:string, replyRef?:string, onProgress?:Function}} p
 */
async function execute(p) {
  const results = [];
  const byId = new Map();
  for (let i = 0; i < p.steps.length; i++) {
    const step = p.steps[i];
    const tool = registry.get(step.tool);
    const base = { id: step.id, tool: step.tool, failVerb: tool.failVerb };
    const blocked = step.dependsOn.find((d) => !byId.get(d) || byId.get(d).status !== 'ok');
    let result;
    if (blocked) {
      result = { ...base, status: 'skipped', error: new OwnerAIError('DEPENDENCY_FAILED', { dependsOn: blocked }) };
    } else {
      const started = Date.now();
      try {
        const r = await executor.runStep({ step, tool, actor: p.actor, guild: p.guild, client: p.client, taskId: p.taskId, results: byId, replyRef: p.replyRef });
        result = { ...base, status: 'ok', outputs: r.outputs || {}, done: r.done, doneVerb: r.doneVerb, ms: Date.now() - started };
      } catch (err) {
        result = { ...base, status: 'failed', error: err instanceof OwnerAIError ? err : fromDiscord(err), ms: Date.now() - started };
      }
    }
    results.push(result);
    byId.set(step.id, result);
    if (p.onProgress) await p.onProgress(results).catch(() => null);
    if (i < p.steps.length - 1 && result.status === 'ok' && tool.risk !== 'read') await queue.sleep(queue.getStepDelay());
  }
  return results;
}

module.exports = { normalizeSteps, hashPlan, serializePlan, parseStoredPlan, preflight, execute, collectStepRefs, STEP_REF };
