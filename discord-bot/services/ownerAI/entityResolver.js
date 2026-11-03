'use strict';

// تحويل الأسماء اللي يقولها المالك (روم/قسم/رتبة/عضو/رسالة) لمعرّفات ديسكورد حقيقية.
//   • الأولوية: معرّف صريح ← منشن ← تطابق الاسم تماماً ← اسم قريب وواضح ← سؤال المالك
//   • مطابقة عربية ذكية: تشكيل/همزات/ال التعريف/زخارف الأسماء (📢┃اخبار-التحديثات)/مرادفات إنجليزية
//   • عند الغموض ما نختار عشوائياً: نرجّع AMBIGUOUS مع المرشحين (والمهمة ما تبدأ)
//   • التنفيذ دائماً بمعرّف القناة النهائي، مو بالاسم

const { ChannelType } = require('discord.js');
const { OwnerAIError } = require('./errorHandler');

const SNOWFLAKE = /^\d{17,20}$/;
const TEXT_TYPES = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread]);
const VOICE_TYPES = new Set([ChannelType.GuildVoice, ChannelType.GuildStageVoice]);
const THREAD_TYPES = new Set([ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread]);

const KIND_FILTER = {
  textChannel: (c) => TEXT_TYPES.has(c.type),
  voiceChannel: (c) => VOICE_TYPES.has(c.type),
  category: (c) => c.type === ChannelType.GuildCategory,
  thread: (c) => THREAD_TYPES.has(c.type),
  channel: (c) => !THREAD_TYPES.has(c.type) // أي روم/قسم (بدون ثريدات)
};

// مرادفات شائعة بأسماء الرومات (إنجليزي ↔ عربي)
const ALIASES = {
  updates: 'تحديثات', update: 'تحديثات', news: 'اخبار', announcements: 'اعلانات', announcement: 'اعلانات',
  general: 'عام', rules: 'قوانين', support: 'دعم', suggestions: 'اقتراحات', events: 'فعاليات', chat: 'دردشه', welcome: 'ترحيب'
};
const NOISE_WORDS = new Set(['روم', 'قناه', 'شات', 'قسم', 'رتبه', 'ثريد', 'channel', 'room', 'category', 'role']);

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(text, { dropNoise = false } = {}) {
  let list = normalize(text)
    .split(' ')
    .filter(Boolean)
    .map((t) => (t.length > 3 ? t.replace(/^ال(?=.{2,})/, '') : t))
    .map((t) => ALIASES[t] || t);
  if (dropNoise) {
    const filtered = list.filter((t) => !NOISE_WORDS.has(t));
    if (filtered.length) list = filtered;
  }
  return list;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

const fuzzyEq = (a, b) => a.length >= 4 && b.length >= 4 && levenshtein(a, b) <= (Math.max(a.length, b.length) >= 8 ? 2 : 1);

/** درجة التشابه 0..100 بين كلام المالك (A) واسم العنصر (B) */
function score(inputTokens, nameTokens) {
  if (!inputTokens.length || !nameTokens.length) return 0;
  const a = inputTokens.join(' ');
  const b = nameTokens.join(' ');
  if (a === b) return 100;
  const aSet = new Set(inputTokens);
  const bSet = new Set(nameTokens);
  if (aSet.size === bSet.size && [...aSet].every((t) => bSet.has(t))) return 95;
  if ([...aSet].every((t) => bSet.has(t))) return nameTokens.length === inputTokens.length + 1 ? 75 : 70;
  if ([...bSet].every((t) => aSet.has(t)) && b.length >= 3) return 55;
  if (inputTokens.every((t) => nameTokens.some((n) => n === t || fuzzyEq(t, n)))) return 60;
  return 0;
}

/** يختار الأفضل أو يرجّع غموض — items: [{ value, name, label, hint }] */
function pick(items, input, kind) {
  const inputTokens = tokens(input, { dropNoise: true });
  const scored = items
    .map((it) => ({ ...it, score: score(inputTokens, tokens(it.name)) }))
    .filter((it) => it.score >= 55)
    .sort((x, y) => y.score - x.score);
  if (!scored.length) return { ok: false, code: 'ENTITY_NOT_FOUND', kind, input };
  const best = scored[0].score;
  const group = best >= 95 ? scored.filter((s) => s.score === best) : scored.filter((s) => s.score >= best - 5);
  if (group.length === 1) return { ok: true, value: group[0].value };
  return {
    ok: false,
    code: 'AMBIGUOUS',
    kind,
    input,
    candidates: group.slice(0, 5).map((g) => ({ id: g.id, label: g.label, hint: g.hint }))
  };
}

const mentionId = (input, re) => {
  const m = String(input || '').match(re);
  return m ? m[1] : null;
};

function wrapResult(r) {
  if (r.ok) return r.value;
  throw new OwnerAIError(r.code, { kind: r.kind, input: r.input, candidates: r.candidates });
}

// ---------------- الرومات والأقسام ----------------
function channelsOf(guild, kind) {
  const filter = KIND_FILTER[kind] || KIND_FILTER.channel;
  return [...guild.channels.cache.values()].filter((c) => c && filter(c));
}

async function resolveChannel(guild, input, kind = 'channel') {
  const raw = String(input || '').trim();
  const id = mentionId(raw, /^<#(\d{17,20})>$/) || (SNOWFLAKE.test(raw) ? raw : null);
  if (id) {
    const c = guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
    if (!c) throw new OwnerAIError('ENTITY_NOT_FOUND', { kind, input: raw });
    const filter = KIND_FILTER[kind] || KIND_FILTER.channel;
    // الثريد يُقبل كروم نصي، والروم النصي يُقبل لما نطلب "channel" عام
    if (!filter(c) && !(kind === 'channel')) throw new OwnerAIError('WRONG_KIND', { kind, input: raw });
    return c;
  }
  const name = raw.replace(/^#/, '');
  const items = channelsOf(guild, kind).map((c) => {
    const parent = c.parentId ? guild.channels.cache.get(c.parentId) : null;
    return { id: c.id, value: c, name: c.name, label: `<#${c.id}>`, hint: parent ? `بقسم ${parent.name}` : c.type === ChannelType.GuildCategory ? 'قسم' : 'بدون قسم' };
  });
  // قسم/روم بنفس الاسم لكن بنوع مختلف: لو طلبنا "channel" نفضّل غير الأقسام عند التساوي
  if (kind === 'channel') {
    const nonCat = items.filter((i) => i.value.type !== ChannelType.GuildCategory);
    const r = pick(nonCat, name, kind);
    if (r.ok || r.code === 'AMBIGUOUS') return wrapResult(r);
  }
  return wrapResult(pick(items, name, kind));
}

// ---------------- الرتب ----------------
async function resolveRole(guild, input) {
  const raw = String(input || '').trim();
  const id = mentionId(raw, /^<@&(\d{17,20})>$/) || (SNOWFLAKE.test(raw) ? raw : null);
  if (id) {
    const r = guild.roles.cache.get(id) || (await guild.roles.fetch(id).catch(() => null));
    if (!r) throw new OwnerAIError('ENTITY_NOT_FOUND', { kind: 'role', input: raw });
    return r;
  }
  if (/^@?everyone$/i.test(raw)) return guild.roles.everyone || guild.roles.cache.get(guild.id);
  const items = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id)
    .map((r) => ({ id: r.id, value: r, name: r.name, label: `@${r.name}`, hint: `ترتيبها ${r.position}` }));
  return wrapResult(pick(items, raw.replace(/^@/, ''), 'role'));
}

// ---------------- الأعضاء ----------------
const memberNames = (m) => [m.displayName, m.nickname, m.user && m.user.username, m.user && m.user.globalName, m.user && m.user.tag].filter(Boolean);

async function searchMembers(guild, query, limit = 5) {
  const q = normalize(query);
  const found = new Map();
  for (const m of guild.members.cache.values()) {
    if (memberNames(m).some((n) => normalize(n) === q || (q.length >= 3 && normalize(n).includes(q)))) found.set(m.id, m);
  }
  if (!found.size && guild.members && typeof guild.members.search === 'function') {
    const list = await guild.members.search({ query: String(query).slice(0, 100), limit }).catch(() => null);
    if (list) for (const m of list.values()) found.set(m.id, m);
  }
  return [...found.values()];
}

async function resolveMember(guild, input) {
  const raw = String(input || '').trim();
  const id = mentionId(raw, /^<@!?(\d{17,20})>$/) || (SNOWFLAKE.test(raw) ? raw : null);
  if (id) {
    const m = guild.members.cache.get(id) || (await guild.members.fetch(id).catch(() => null));
    if (!m || typeof m.roles === 'undefined') throw new OwnerAIError('ENTITY_NOT_FOUND', { kind: 'member', input: raw });
    return m;
  }
  const name = raw.replace(/^@/, '');
  const list = await searchMembers(guild, name);
  const exact = list.filter((m) => memberNames(m).some((n) => normalize(n) === normalize(name)));
  const group = exact.length ? exact : list;
  if (!group.length) throw new OwnerAIError('ENTITY_NOT_FOUND', { kind: 'member', input: raw });
  if (group.length > 1) {
    throw new OwnerAIError('AMBIGUOUS', { kind: 'member', input: raw, candidates: group.slice(0, 5).map((m) => ({ id: m.id, label: `<@${m.id}>`, hint: m.user ? m.user.username : '' })) });
  }
  return group[0];
}

// ---------------- الرسائل ----------------
const MESSAGE_URL = /^https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})\/?$/;

/** يرجّع { channelId, messageId } من: رابط، "قناة/رسالة"، أو معرّف رسالة (مع قناة افتراضية) */
function parseMessageRef(guild, input, defaultChannelId) {
  const raw = String(input || '').trim();
  const url = raw.match(MESSAGE_URL);
  if (url) {
    if (url[1] !== guild.id) throw new OwnerAIError('ENTITY_NOT_FOUND', { kind: 'message', input: 'رابط من سيرفر ثاني' });
    return { channelId: url[2], messageId: url[3] };
  }
  const pair = raw.match(/^(\d{17,20})\/(\d{17,20})$/);
  if (pair) return { channelId: pair[1], messageId: pair[2] };
  if (SNOWFLAKE.test(raw)) {
    if (!defaultChannelId) throw new OwnerAIError('ENTITY_NOT_FOUND', { kind: 'message', input: raw });
    return { channelId: defaultChannelId, messageId: raw };
  }
  throw new OwnerAIError('ENTITY_NOT_FOUND', { kind: 'message', input: raw });
}

// ---------------- حل مدخلات أداة كاملة ----------------
async function resolveOne(kind, guild, value, ctx) {
  switch (kind) {
    case 'role': return resolveRole(guild, value);
    case 'member': return resolveMember(guild, value);
    case 'message': return parseMessageRef(guild, value, ctx.defaultChannelId);
    default: return resolveChannel(guild, value, kind);
  }
}

/**
 * يحوّل الحقول اللي عليها x-entity بمخطط الأداة لكائنات حقيقية. الرسائل تنحل أخيراً
 * (تحتاج القناة الافتراضية من حقل channel أو الذاكرة أو قناة الطلب).
 * @param {object} schema @param {object} args @param {{guild:object, memory?:object, originChannelId?:string}} ctx
 */
async function resolveArgs(schema, args, ctx) {
  const out = { ...args };
  const props = (schema && schema.properties) || {};
  const entityProps = Object.entries(props).filter(([, s]) => s['x-entity']);
  const ordered = [...entityProps.filter(([, s]) => s['x-entity'] !== 'message'), ...entityProps.filter(([, s]) => s['x-entity'] === 'message')];
  const hasRef = (v) => (Array.isArray(v) ? v.some(hasRef) : typeof v === 'string' && v.startsWith('$'));
  for (const [key, s] of ordered) {
    if (args[key] === undefined) continue;
    if (ctx.skipRefs && hasRef(args[key])) continue; // مرجع لخطوة سابقة — ينحل وقت التنفيذ
    const kind = s['x-entity'];
    const inner = { ...ctx };
    if (kind === 'message') {
      const ch = out.channel && out.channel.id ? out.channel.id : ctx.memoryChannelId || ctx.originChannelId;
      inner.defaultChannelId = ch;
    }
    out[key] = Array.isArray(args[key])
      ? await Promise.all(args[key].map((v) => resolveOne(kind, ctx.guild, v, inner)))
      : await resolveOne(kind, ctx.guild, args[key], inner);
  }
  return out;
}

module.exports = { normalize, tokens, score, levenshtein, resolveChannel, resolveRole, resolveMember, searchMembers, parseMessageRef, resolveArgs, KIND_FILTER, TEXT_TYPES, VOICE_TYPES, THREAD_TYPES, SNOWFLAKE };
