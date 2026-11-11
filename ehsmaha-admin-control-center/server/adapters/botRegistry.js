// Command Registry حقيقي: يقرأ ملفات discord-bot/commands بالقراءة فقط (لا require ولا تعديل)،
// ويدمجها اختيارياً مع الأوامر المسجّلة فعلاً عند Discord. لا يخترع أي أمر.
import fs from 'node:fs';
import path from 'node:path';

export const CATEGORY_MAP = {
  admin: 'الإدارة', moderation: 'الإشراف', games: 'الألعاب', stats: 'الإحصائيات', leaderboard: 'الإحصائيات', winners: 'الإحصائيات',
  streams: 'الستريمرز والبثوث', events: 'الفعاليات', tickets: 'التكتات', welcome: 'الترحيب', automod: 'الحماية التلقائية',
  ai: 'الذكاء الاصطناعي', profile: 'الملفات الشخصية', site: 'الأوامر العامة', help: 'الأوامر العامة', autoreply: 'الأوامر العامة'
};

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(f)); else if (e.name.endsWith('.js')) out.push(f);
  }
  return out.sort();
}

const str = (s) => (s ? s.replace(/\\'/g, "'").replace(/\\"/g, '"') : s);
const Q = `(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")`;
// ---- محلّل سلاسل builder (يوازن الأقواس والنصوص) ----
function skipStr(src, i) { const q = src[i]; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; else if (q === '`' && src[i] === '$' && src[i + 1] === '{') { let d = 1; i += 2; while (i < src.length && d) { if (src[i] === '{') d++; else if (src[i] === '}') d--; i++; } continue; } i++; } return i + 1; }
function matchParen(src, i) { // src[i] === '('
  let d = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = skipStr(src, i) - 1; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '(') d++; else if (c === ')') { d--; if (!d) return i; }
  }
  return -1;
}
function chainCalls(src, i) {
  const calls = [];
  for (;;) {
    let j = i;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] === '/' && src[j + 1] === '/') { while (j < src.length && src[j] !== '\n') j++; i = j; continue; }
    if (src[j] !== '.') break;
    j++;
    const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(j, j + 60));
    if (!m) break;
    j += m[0].length;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] !== '(') break;
    const e = matchParen(src, j);
    if (e < 0) break;
    calls.push({ method: m[0], args: src.slice(j + 1, e) });
    i = e + 1;
  }
  return calls;
}
const lit = (a, consts) => { const m = new RegExp('^\\s*' + Q).exec(a); if (m) return str(m[1] ?? m[2]); const id = /^\s*([A-Za-z_$][\w$.]*)\s*$/.exec(a); return id && consts[id[1]] != null ? consts[id[1]] : null; };
function callbackChain(args) { const m = /=>\s*\(?\s*([A-Za-z_$][\w$]*)/.exec(args); if (!m) return []; return chainCalls(args, args.indexOf(m[1], m.index) + m[1].length); }
function parseBuilder(calls, consts) {
  const out = { name: null, description: null, options: [], subcommands: [], defaultPermission: null };
  for (const c of calls) {
    if (c.method === 'setName') out.name = lit(c.args, consts);
    else if (c.method === 'setDescription') out.description = lit(c.args, consts);
    else if (c.method === 'setDefaultMemberPermissions') out.defaultPermission = c.args.trim();
    else if (/^add(Subcommand|SubcommandGroup)$/.test(c.method)) { const sub = parseBuilder(callbackChain(c.args), consts); if (sub.name) out.subcommands.push({ name: sub.name, description: sub.description, options: sub.options, group: c.method === 'addSubcommandGroup' }); }
    else if (/^add\w+Option$/.test(c.method)) { const o = callbackChain(c.args); const x = { type: c.method.slice(3, -6), name: null, description: null, required: false }; for (const k of o) { if (k.method === 'setName') x.name = lit(k.args, consts); else if (k.method === 'setDescription') x.description = lit(k.args, consts); else if (k.method === 'setRequired') x.required = /true/.test(k.args); else if (k.method === 'addChoices') x.choices = [...k.args.matchAll(new RegExp('name:\\s*' + Q + '\\s*,\\s*value:\\s*' + Q, 'g'))].map((z) => ({ name: str(z[1] ?? z[2]), value: str(z[3] ?? z[4]) })); } if (x.name) out.options.push(x); }
  }
  return out;
}
function splitTop(args) {
  const out = []; let d = 0, cur = '';
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === '"' || c === "'" || c === '`') { const e = skipStr(args, i); cur += args.slice(i, e); i = e - 1; continue; }
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--;
    if (c === ',' && d === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
function parseFile(src) {
  const consts = {};
  for (const m of src.matchAll(new RegExp('(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*' + Q, 'g'))) consts[m[1]] = str(m[2] ?? m[3]);
  // ثوابت داخل كائن: const N = { STATUS: 'x', ... }
  for (const m of src.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\{([^}]*)\}/g)) for (const k of m[2].matchAll(new RegExp('([A-Za-z_$][\\w$]*)\\s*:\\s*' + Q, 'g'))) consts[`${m[1]}.${k[1]}`] = str(k[2] ?? k[3]);
  const cmds = [];
  const factories = new Map();
  for (const m of src.matchAll(/new SlashCommandBuilder\(\)/g)) {
    const b = parseBuilder(chainCalls(src, m.index + m[0].length), consts);
    if (b.name) { cmds.push(b); continue; }
    // اسم ديناميكي: مصنع (name, description) => new SlashCommandBuilder().setName(name)...
    const head = src.slice(Math.max(0, m.index - 160), m.index);
    const f = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\(([^)]*)\)\s*=>\s*$/.exec(head);
    if (f) factories.set(f[1], { params: f[2].split(',').map((x) => x.trim()), calls: chainCalls(src, m.index + m[0].length) });
  }
  for (const [fn, fac] of factories) {
    for (const m of src.matchAll(new RegExp('(?<![\\w$.])' + fn + '\\(', 'g'))) {
      if (/(?:const|let)\s+$/.test(src.slice(Math.max(0, m.index - 8), m.index))) continue;
      const open = m.index + m[0].length - 1; const close = matchParen(src, open);
      if (close < 0) continue;
      const args = splitTop(src.slice(open + 1, close));
      const bind = Object.fromEntries(fac.params.map((p, i) => [p, args[i] ? lit(args[i], consts) : null]));
      const own = parseBuilder(fac.calls.map((c) => (c.method === 'setName' || c.method === 'setDescription' ? { method: c.method, args: JSON.stringify(bind[c.args.trim()] ?? '') } : c)), {});
      const extra = parseBuilder(chainCalls(src, close + 1), consts);
      if (own.name) cmds.push({ ...own, options: [...own.options, ...extra.options], subcommands: [...own.subcommands, ...extra.subcommands] });
    }
  }
  return cmds;
}

export function scanBotCommands(botDir) {
  const dir = path.join(botDir, 'commands');
  if (!fs.existsSync(dir)) return { available: false, reason: 'مجلد أوامر البوت غير موجود (BOT_DIR)', commands: [] };
  const commands = [];
  const unparsed = [];
  for (const f of walk(dir)) {
    const rel = path.relative(dir, f);
    const cat = rel.split(path.sep)[0];
    const src = fs.readFileSync(f, 'utf8');
    const guards = { adminOnly: /guardAdmin\(/.test(src), managerOnly: /guardManager\(/.test(src), ownerOnly: /isOwnerId\(|assertOwner\(/.test(src), supportRole: /supportRoles|isSupport/.test(src) };
    const botPerms = [...src.matchAll(/missingBotPermissions\([^,]+,\s*\[([^\]]*)\]/g)].flatMap((x) => x[1].split(',').map((p) => p.replace(/['"\s]/g, '')).filter(Boolean));
    const hasAuto = /autocomplete\s*[:(]/.test(src);
    const parsed = parseFile(src);
    if (!parsed.length) unparsed.push('commands/' + rel.split(path.sep).join('/'));
    for (const c of parsed) {
      commands.push({
        ...c, file: 'commands/' + rel.split(path.sep).join('/'), dir: cat, category: CATEGORY_MAP[cat] || 'الأوامر العامة',
        access: guards.ownerOnly ? 'owner' : guards.managerOnly ? 'administrator' : guards.adminOnly ? 'admin' : 'public', botPermissions: [...new Set(botPerms)], hasAutocomplete: hasAuto
      });
    }
  }
  const seen = new Set();
  const uniq = commands.filter((c) => (seen.has(c.name) ? false : seen.add(c.name)));
  return { available: true, reason: '', commands: uniq, unparsed };
}
