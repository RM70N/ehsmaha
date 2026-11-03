'use strict';

// سجل أدوات Discord القابلة للتركيب. Gemini يخطّط باستخدام هذي الأدوات فقط (Tool Calling)،
// والتنفيذ الفعلي دائماً من actionExecutor عبر discord.js — ما فيه eval ولا Shell ولا تثبيت حزم.
// كل أداة: name · description · schema (JSON Schema) · risk (read/low/medium/high) · صلاحيات البوت ·
// confirm (متى تحتاج تأكيد) · run · verify (التحقق من النتيجة).
// توسعة القدرات = أداة جديدة بملف داخل tools/ (ويضيفها هذا السجل تلقائياً بالقائمة تحت).

const MODULES = [require('./tools/messages'), require('./tools/channels'), require('./tools/roles'), require('./tools/members'), require('./tools/moderation'), require('./tools/serverInfo'), require('./tools/botSystems')];

const tools = new Map();

function register(tool) {
  if (tools.has(tool.name)) throw new Error(`أداة مكررة: ${tool.name}`);
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(tool.name)) throw new Error(`اسم أداة غير صالح: ${tool.name}`);
  if (!['read', 'low', 'medium', 'high'].includes(tool.risk)) throw new Error(`مستوى خطورة غير صالح: ${tool.name}`);
  tools.set(tool.name, tool);
}

for (const mod of MODULES) for (const t of mod) register(t);

const get = (name) => tools.get(name) || null;
const list = () => [...tools.values()];

function sig(schema) {
  const req = new Set(schema.required || []);
  const parts = Object.entries(schema.properties || {}).map(([k, v]) => {
    const t = v.type === 'array' ? `${(v.items && v.items.type) || 'any'}[]` : v.type;
    const ent = v['x-entity'] ? `:${v['x-entity']}` : '';
    return `${k}${req.has(k) ? '*' : ''}(${t}${ent})`;
  });
  return parts.join(', ') || 'بدون وسائط';
}

let catalogCache = null;
/** قائمة الأدوات للبرومبت — مضغوطة (اسم · وصف · وسائط) */
function catalog() {
  if (!catalogCache) {
    catalogCache = list()
      .map((t) => `- ${t.name} [${t.risk}]: ${t.description}\n  وسائط: ${sig(t.schema)}`)
      .join('\n');
  }
  return catalogCache;
}

module.exports = { get, list, register, catalog, _internal: { tools, sig } };
