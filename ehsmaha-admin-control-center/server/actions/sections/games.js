import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E } from '../../lib/errors.js';
import { now, stable } from '../../lib/util.js';
import { tsMs } from '../siteHelpers.js';

const SNAP = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'mod-settings-schema.json'), 'utf8'));
const GAMES = SNAP.games; // { tag: { name, fields:[{key,type,label,default,min,max,length,unitDivisor}] } }
const CARDS = SNAP.cards;
const BADGES = { new: 'جديدة', update: 'محدّثة', none: 'بدون شارة', maintenance: 'صيانة' };
const settingOptions = Object.entries(GAMES).flatMap(([tag, g]) => g.fields.map((f) => ({ value: `${tag}.${f.key}`, label: `${g.name} ← ${f.label}` })));
const cardOptions = CARDS.map((c) => ({ value: c.tag, label: `${c.name} (${c.tag})` }));
const gameOptions = Object.entries(GAMES).map(([tag, g]) => ({ value: tag, label: g.name }));
const eq = (a, b) => stable(a) === stable(b);

// تحقق صارم بحسب المخطط الفعلي (نفس الحدود التي تقرؤها الألعاب عبر modGetSetting)
function parseValue(f, raw) {
  if (f.type === 'toggle') { if (!['true', 'false'].includes(String(raw).toLowerCase())) throw E.invalid(`${f.label}: القيمة true أو false`); return String(raw).toLowerCase() === 'true'; }
  const div = f.unitDivisor || 1;
  if (f.type === 'numberArray') {
    const arr = String(raw).split(/[,،\s]+/).filter(Boolean).map(Number);
    if (arr.length !== f.length || arr.some((n) => !Number.isFinite(n))) throw E.invalid(`${f.label}: يلزم ${f.length} أرقام مفصولة بفاصلة`);
    return arr.map((n) => { const v = Math.round(n * div); if (v < f.min || v > f.max) throw E.invalid(`${f.label}: كل قيمة بين ${f.min / div} و${f.max / div}`); return v; });
  }
  const n = Number(raw); if (!Number.isFinite(n)) throw E.invalid(`${f.label}: رقم غير صحيح`);
  const v = Math.round(n * div); if (v < f.min || v > f.max) throw E.invalid(`${f.label}: القيمة بين ${f.min / div} و${f.max / div}`);
  return v;
}

async function readCur(ctx, tag) { const s = await ctx.fb.rtdb().ref(`opsConfig/current/${tag}`).get(); return s.exists() ? s.val() : null; }
// كتابة بإصدار متفائل (نفس معاملة لوحة المالك): تفشل لو تغيّر الإصدار من جهة أخرى
async function writeValues(ctx, tag, values, restoredFrom) {
  const ref = ctx.fb.rtdb().ref(`opsConfig/current/${tag}`);
  let prevV = 0;
  const res = await ref.transaction((cur) => { prevV = cur ? cur.v : 0; return { v: prevV + 1, values, by: ctx.actor.display + ' (لوحة الإدارة)', t: ctx.fb.ServerValue.TIMESTAMP }; });
  if (!res.committed) throw E.conflict('تغيّرت إعدادات هذه اللعبة من جهة أخرى — أعد المحاولة');
  const v = res.snapshot.val().v;
  await ctx.fb.rtdb().ref(`opsConfig/history/${tag}`).push({ v, values, by: ctx.actor.display + ' (لوحة الإدارة)', t: ctx.fb.ServerValue.TIMESTAMP, prevV, ...(restoredFrom ? { restoredFrom } : {}) });
  return { v, prevV };
}
const sparse = (tag, values) => Object.fromEntries(GAMES[tag].fields.filter((f) => values[f.key] !== undefined && !eq(values[f.key], f.default)).map((f) => [f.key, values[f.key]]));

const badgeDoc = (ctx, tag) => ctx.fb.db().collection('gameBadges').doc(tag);
const cardOf = (tag) => CARDS.find((c) => c.tag === tag);

async function badgeAction(ctx, tag, badge) {
  const s = await badgeDoc(ctx, tag).get();
  const prev = s.exists ? s.data().badge || 'none' : 'none';
  await badgeDoc(ctx, tag).set({ badge }, { merge: true });
  return { prev };
}
const badgeLoad = async (p, ctx) => { if (!cardOf(p.tag)) throw E.notFound('لعبة غير معروفة'); const s = await badgeDoc(ctx, p.tag).get(); return { tag: p.tag, name: cardOf(p.tag).name, badge: s.exists ? s.data().badge || 'none' : 'none' }; };
const badgeVerify = (want) => async (p, ctx, b) => { const s = await badgeDoc(ctx, p.tag).get(); const got = s.exists ? s.data().badge : null; return { ok: got === (typeof want === 'function' ? want(p) : want), after: { badge: got }, message: 'شارة اللعبة في Firestore لم تتغير فعلياً' }; };
const TAG = { name: 'tag', label: 'اللعبة', type: 'select', required: true, options: cardOptions };

export default {
  id: 'games', workspace: 'website', label: 'إدارة الألعاب', icon: 'gamepad', adminDefault: true, description: 'إعدادات الألعاب، الصيانة والشارات، وإحصائيات اللعب',
  views: [
    {
      id: 'catalog', label: 'فهرس الألعاب', requires: ['firebase'], search: true, source: 'gameBadges + MOD_SETTINGS_SCHEMA',
      columns: [{ key: 'name', label: 'اللعبة' }, { key: 'tag', label: 'الوسم', mono: true }, { key: 'badge', label: 'الحالة/الشارة' }, { key: 'hasSettings', label: 'إعدادات قابلة للتعديل' }, { key: 'version', label: 'إصدار الإعدادات' }],
      async fetch(q, ctx) {
        const [bs, cur] = await Promise.all([ctx.fb.db().collection('gameBadges').get(), ctx.fb.rtdb().ref('opsConfig/current').get()]);
        const badges = Object.fromEntries(bs.docs.map((d) => [d.id, d.data().badge || 'none'])); const cv = cur.val() || {};
        const t = (q.q || '').toLowerCase();
        return { rows: CARDS.filter((c) => !t || (c.name + c.tag).toLowerCase().includes(t)).map((c) => ({ id: c.tag, name: c.name, tag: c.tag, badge: BADGES[badges[c.tag] || 'none'] || badges[c.tag], hasSettings: GAMES[c.tag] ? `نعم (${GAMES[c.tag].fields.length})` : '—', version: cv[c.tag]?.v ?? '—' })) };
      }
    },
    {
      id: 'settings', label: 'الإعدادات الحالية (opsConfig)', requires: ['firebase'], search: true, source: 'RTDB opsConfig/current',
      columns: [{ key: 'name', label: 'اللعبة' }, { key: 'field', label: 'الإعداد' }, { key: 'value', label: 'القيمة الفعّالة' }, { key: 'default', label: 'الافتراضي' }, { key: 'changed', label: 'معدَّل؟' }, { key: 'version', label: 'الإصدار' }],
      async fetch(q, ctx) {
        const cur = (await ctx.fb.rtdb().ref('opsConfig/current').get()).val() || {};
        const t = (q.q || '').toLowerCase(); const rows = [];
        for (const [tag, g] of Object.entries(GAMES)) for (const f of g.fields) {
          if (t && !(g.name + f.label + f.key).toLowerCase().includes(t)) continue;
          const v = cur[tag]?.values?.[f.key]; const val = v === undefined ? f.default : v;
          rows.push({ id: `${tag}.${f.key}`, name: g.name, field: f.label, value: Array.isArray(val) ? val.join('، ') : typeof val === 'boolean' ? (val ? 'مفعّل' : 'معطّل') : f.unitDivisor ? val / f.unitDivisor : val, default: Array.isArray(f.default) ? f.default.join('، ') : typeof f.default === 'boolean' ? (f.default ? 'مفعّل' : 'معطّل') : f.unitDivisor ? f.default / f.unitDivisor : f.default, changed: v !== undefined && !eq(v, f.default) ? 'نعم' : '—', version: cur[tag]?.v ?? 0 });
        }
        return { rows };
      }
    },
    {
      id: 'history', label: 'سجل تعديلات الإعدادات', requires: ['firebase'], source: 'RTDB opsConfig/history',
      columns: [{ key: 'game', label: 'اللعبة' }, { key: 'v', label: 'الإصدار' }, { key: 'by', label: 'بواسطة' }, { key: 't', label: 'الوقت', type: 'date' }, { key: 'changes', label: 'القيم المعدّلة' }, { key: 'restoredFrom', label: 'استعادة من' }],
      async fetch(q, ctx) {
        const all = (await ctx.fb.rtdb().ref('opsConfig/history').get()).val() || {};
        const rows = Object.entries(all).flatMap(([tag, h]) => Object.entries(h || {}).map(([k, x]) => ({ id: `${tag}-${k}`, game: GAMES[tag]?.name || tag, v: x.v, by: x.by, t: x.t, changes: Object.keys(x.values || {}).join('، ') || '(الافتراضي)', restoredFrom: x.restoredFrom || '' })));
        rows.sort((a, b) => (b.t || 0) - (a.t || 0));
        return { rows: rows.slice(0, 100), total: rows.length };
      }
    },
    {
      id: 'playstats', label: 'أكثر الألعاب لعباً (عينة أعلى 500 لاعب)', requires: ['firebase'], source: 'Firestore levels.gamesPlayCount (عينة)',
      columns: [{ key: 'game', label: 'اللعبة' }, { key: 'plays', label: 'مرات اللعب' }, { key: 'players', label: 'اللاعبون' }],
      async fetch(q, ctx) {
        const snap = await ctx.fb.db().collection('levels').orderBy('xp', 'desc').limit(500).get();
        const plays = {}, players = {};
        for (const d of snap.docs) for (const [g, n] of Object.entries(d.data().gamesPlayCount || {})) { plays[g] = (plays[g] || 0) + (Number(n) || 0); players[g] = (players[g] || 0) + 1; }
        return { rows: Object.keys(plays).sort((a, b) => plays[b] - plays[a]).map((g) => ({ id: g, game: cardOf(g)?.name || GAMES[g]?.name || g, plays: plays[g], players: players[g] })), meta: { note: 'العيّنة = أعلى 500 لاعب خبرةً (وليس كل اللاعبين)', sample: snap.size } };
      }
    }
  ],
  actions: [
    {
      id: 'set_setting', label: 'تعديل إعداد لعبة', icon: 'sliders', group: 'الإعدادات', danger: 'medium', reversible: true, requires: ['firebase'],
      description: 'يكتب في opsConfig بإصدار متفائل (نفس آلية لوحة المالك) — يُطبَّق على الراوندات الجديدة فقط ولا يمسّ راوندات جارية', effect: 'تتغير القيمة الافتراضية العامة للعبة للراوندات القادمة (إعداد الستريمر الشخصي يتغلّب عليها)',
      fields: [{ name: 'setting', label: 'الإعداد', type: 'select', required: true, options: settingOptions }, { name: 'value', label: 'القيمة', type: 'text', required: true, max: 200, help: 'رقم، أو true/false للتبديل، أو أرقام مفصولة بفاصلة للمصفوفات' }],
      target: (p) => p.setting,
      async load(p, ctx) {
        const [tag, key] = p.setting.split('.'); const f = GAMES[tag]?.fields.find((x) => x.key === key); if (!f) throw E.notFound('إعداد غير معروف');
        const nv = parseValue(f, p.value); const cur = await readCur(ctx, tag);
        const full = Object.fromEntries(GAMES[tag].fields.map((x) => [x.key, cur?.values?.[x.key] ?? x.default]));
        return { tag, key, f, nv, prevValues: cur?.values || {}, prev: full[key], v: cur?.v || 0, full };
      },
      async execute(p, ctx, b) {
        if (eq(b.prev, b.nv)) throw E.conflict('القيمة الجديدة مطابقة للحالية');
        const w = await writeValues(ctx, b.tag, sparse(b.tag, { ...b.full, [b.key]: b.nv }));
        return { message: `تم تعديل «${b.f.label}» (الإصدار ${w.v})`, after: { value: b.nv, v: w.v }, undo: { action: 'games.set_setting', params: { setting: p.setting, value: Array.isArray(b.prev) ? b.prev.map((n) => n / (b.f.unitDivisor || 1)).join(',') : typeof b.prev === 'boolean' ? String(b.prev) : String(b.prev / (b.f.unitDivisor || 1)) } }, _v: w.v };
      },
      async verify(p, ctx, b, r) { const cur = await readCur(ctx, b.tag); const got = cur?.values?.[b.key] ?? b.f.default; return { ok: cur?.v === r._v && eq(got, b.nv), after: { value: got, v: cur?.v }, message: 'القيمة المقروءة من RTDB بعد الكتابة لا تطابق المطلوبة' }; }
    },
    {
      id: 'reset_defaults', label: 'إعادة إعدادات اللعبة للافتراضي', icon: 'rotate', group: 'الإعدادات', danger: 'high', reversible: false, reasonRequired: true, requires: ['firebase'],
      description: 'مسح كل تعديلات المالك على اللعبة (تُحفظ في السجل ويمكن استعادة أي إصدار)', effect: 'تعود كل إعدادات اللعبة للقيم المبرمجة للراوندات الجديدة',
      fields: [{ name: 'game', label: 'اللعبة', type: 'select', required: true, options: gameOptions }], target: (p) => p.game,
      async load(p, ctx) { const cur = await readCur(ctx, p.game); if (!cur || !Object.keys(cur.values || {}).length) throw E.conflict('اللعبة على إعداداتها الافتراضية أصلاً'); return { v: cur.v, values: cur.values }; },
      async execute(p, ctx) { const w = await writeValues(ctx, p.game, {}); return { message: `أُعيدت إعدادات ${GAMES[p.game].name} للافتراضي (الإصدار ${w.v})`, _v: w.v }; },
      async verify(p, ctx, b, r) { const cur = await readCur(ctx, p.game); return { ok: cur?.v === r._v && !Object.keys(cur.values || {}).length, after: { v: cur?.v, values: cur?.values || {} } }; }
    },
    {
      id: 'restore_version', label: 'استعادة إصدار سابق من الإعدادات', icon: 'history', group: 'الإعدادات', danger: 'high', reasonRequired: true, requires: ['firebase'],
      description: 'يعيد قيم إصدار محفوظ في السجل كإصدار جديد (لا يحذف التاريخ)', effect: 'تُستبدل إعدادات اللعبة الحالية بقيم الإصدار المختار',
      fields: [{ name: 'game', label: 'اللعبة', type: 'select', required: true, options: gameOptions }, { name: 'version', label: 'رقم الإصدار', type: 'integer', required: true, min: 1, max: 100000 }], target: (p) => `${p.game}@v${p.version}`,
      async load(p, ctx) { const all = (await ctx.fb.rtdb().ref(`opsConfig/history/${p.game}`).get()).val() || {}; const x = Object.values(all).find((e) => e.v === p.version); if (!x) throw E.notFound('الإصدار غير موجود في السجل'); return { values: x.values || {}, prev: (await readCur(ctx, p.game))?.values || {} }; },
      async execute(p, ctx, b) { const w = await writeValues(ctx, p.game, b.values, p.version); return { message: `استُعيد الإصدار ${p.version} كإصدار ${w.v}`, _v: w.v }; },
      async verify(p, ctx, b, r) { const cur = await readCur(ctx, p.game); return { ok: cur?.v === r._v && eq(cur.values || {}, b.values), after: { v: cur?.v, values: cur?.values } }; }
    },
    {
      id: 'set_maintenance', label: 'وضع اللعبة في الصيانة', icon: 'wrench', group: 'الحالة والظهور', danger: 'high', reversible: true, requires: ['firebase'],
      description: 'شارة «صيانة» (gameBadges) — يعطّل الموقع بطاقة اللعبة ويمنع بدء راوند جديد منها؛ لا يُحذف أي بيان أو نتيجة', effect: 'تظهر اللعبة معطّلة (صيانة) للجميع، وبيانات اللاعبين السابقة لا تتأثر',
      fields: [TAG], target: (p) => p.tag, load: badgeLoad,
      async execute(p, ctx, b) { if (b.badge === 'maintenance') throw E.conflict('اللعبة في الصيانة أصلاً'); await badgeAction(ctx, p.tag, 'maintenance'); return { message: `${b.name} الآن في الصيانة`, undo: { action: 'games.set_badge', params: { tag: p.tag, badge: b.badge } } }; },
      verify: badgeVerify('maintenance')
    },
    {
      id: 'clear_maintenance', label: 'إخراج اللعبة من الصيانة', icon: 'check', group: 'الحالة والظهور', danger: 'medium', reversible: true, requires: ['firebase'],
      description: 'إزالة شارة الصيانة (تعود بدون شارة)', effect: 'تعود اللعبة متاحة للاعبين', fields: [TAG], target: (p) => p.tag, load: badgeLoad,
      async execute(p, ctx, b) { if (b.badge !== 'maintenance') throw E.conflict('اللعبة ليست في الصيانة'); await badgeAction(ctx, p.tag, 'none'); return { message: `${b.name} عادت للعمل`, undo: { action: 'games.set_maintenance', params: { tag: p.tag } } }; },
      verify: badgeVerify('none')
    },
    {
      id: 'set_badge', label: 'تعيين شارة اللعبة (جديدة/محدّثة/بدون)', icon: 'tag', group: 'الحالة والظهور', danger: 'low', reversible: true, requires: ['firebase'],
      description: 'الشارة الظاهرة على بطاقة اللعبة في الموقع', effect: 'تتغير الشارة فوراً في الموقع',
      fields: [TAG, { name: 'badge', label: 'الشارة', type: 'select', required: true, options: Object.entries(BADGES).map(([value, label]) => ({ value, label })) }], target: (p) => `${p.tag}=${p.badge}`, load: badgeLoad,
      async execute(p, ctx, b) { if (b.badge === p.badge) throw E.conflict('الشارة مطابقة للحالية'); await badgeAction(ctx, p.tag, p.badge); return { message: `شارة ${b.name}: ${BADGES[p.badge]}`, undo: { action: 'games.set_badge', params: { tag: p.tag, badge: b.badge } } }; },
      verify: badgeVerify((p) => p.badge)
    },
    {
      id: 'export_games', label: 'تصدير فهرس الألعاب والإعدادات', icon: 'download', group: 'التقارير', kind: 'read', danger: 'low', requires: ['firebase'], fields: [], description: 'JSON بكل الألعاب وشاراتها وإعداداتها الفعّالة', effect: 'قراءة فقط',
      async execute(p, ctx) {
        const [bs, cur] = await Promise.all([ctx.fb.db().collection('gameBadges').get(), ctx.fb.rtdb().ref('opsConfig/current').get()]); const badges = Object.fromEntries(bs.docs.map((d) => [d.id, d.data().badge || 'none'])); const cv = cur.val() || {};
        const data = CARDS.map((c) => ({ tag: c.tag, name: c.name, badge: badges[c.tag] || 'none', settings: GAMES[c.tag] ? { version: cv[c.tag]?.v || 0, values: Object.fromEntries(GAMES[c.tag].fields.map((f) => [f.key, cv[c.tag]?.values?.[f.key] ?? f.default])) } : null }));
        return { message: 'جاهز للتنزيل', data, download: { filename: 'games-catalog.json', mime: 'application/json', text: JSON.stringify(data, null, 2) } };
      }
    },
    {
      id: 'game_health', label: 'مراجعة حالة اللعبة وأخطائها', icon: 'activity', group: 'التقارير', kind: 'read', danger: 'low', requires: ['firebase'],
      description: 'يجمع حالة الشارة، إصدار الإعدادات وآخر تعديل، وآخر نشاط للاعبين في اللعبة (من سجلات levels)', effect: 'قراءة فقط',
      fields: [TAG], target: (p) => p.tag,
      async execute(p, ctx) {
        const b = await badgeLoad(p, ctx); const cur = GAMES[p.tag] ? await readCur(ctx, p.tag) : null;
        const hist = GAMES[p.tag] ? Object.values((await ctx.fb.rtdb().ref(`opsConfig/history/${p.tag}`).limitToLast(5).get()).val() || {}) : [];
        const last = await ctx.fb.db().collection('levels').where('lastGamePlayed', '==', p.tag).limit(1).get().catch(() => null);
        const data = { game: b.name, badge: b.badge, inMaintenance: b.badge === 'maintenance', settingsVersion: cur?.v ?? null, lastSettingsChange: cur ? { by: cur.by, t: cur.t } : null, recentChanges: hist, anyRecentPlayer: last ? !last.empty : null };
        return { message: 'تم جمع الحالة', data };
      }
    }
  ]
};
