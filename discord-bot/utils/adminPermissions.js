'use strict';

// نظام صلاحيات الأدمن الديناميكي — نقطة التحقق المركزية الوحيدة لكل الأوامر
// الإدارية (كتم، تحذير، طرد، مسح، تكتات...) بدل تكرار المنطق بكل ملف.
//
// checkAdminPermission(member) يتحقق بالترتيب:
//   1) Administrator الفعلي بديسكورد (ومالك السيرفر ضمنياً)
//   2) العضو مضاف بـadmin_users (عبر /اضافة_ادمن)
//   3) العضو يملك رتبة من admin_roles (عبر /اضافة_رتبة_ادارية)
//   4) وإلا: رفض
//
// admin_roles/admin_users تُقرأ من قاعدة بيانات البوت مرة وتُخزَّن بالذاكرة لكل
// سيرفر، وتُمسح فوراً بعد أي إضافة/إزالة (invalidate on write). مهلة أمان
// 10 دقائق لو تعدّلت القاعدة من مكان ثاني.

const { PermissionFlagsBits } = require('discord.js');
const store = require('../database/botStore');
const eb = require('./embedBuilder');
const respond = require('./respond');
const logger = require('./logger');

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // guildId -> { roles:Set, users:Set, loadedAt }
const loading = new Map(); // guildId -> Promise (منع قراءتين متزامنتين لنفس السيرفر)

async function loadGuild(guildId) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit;
  if (loading.has(guildId)) return loading.get(guildId);
  const p = (async () => {
    try {
      const rows = await store.adminConfig.list(guildId);
      const entry = {
        roles: new Set(rows.filter((r) => r.type === 'role').map((r) => r.discord_id)),
        users: new Set(rows.filter((r) => r.type === 'user').map((r) => r.discord_id)),
        loadedAt: Date.now()
      };
      cache.set(guildId, entry);
      return entry;
    } finally {
      loading.delete(guildId);
    }
  })();
  loading.set(guildId, p);
  return p;
}

function invalidate(guildId) {
  cache.delete(guildId);
}

// مالك السيرفر أو Administrator الفعلي — المستوى الأعلى (يدير صلاحيات الأدمن نفسها)
function isServerManager(member) {
  if (!member || !member.guild) return false;
  if (member.guild.ownerId === member.id) return true;
  return !!(member.permissions && member.permissions.has(PermissionFlagsBits.Administrator));
}

/**
 * @returns {Promise<{ allowed: boolean, via: 'owner'|'administrator'|'user'|'role'|null }>}
 */
async function checkAdminPermission(member) {
  if (!member || !member.guild) return { allowed: false, via: null };
  if (member.guild.ownerId === member.id) return { allowed: true, via: 'owner' };
  if (member.permissions && member.permissions.has(PermissionFlagsBits.Administrator)) return { allowed: true, via: 'administrator' };

  const cfg = await loadGuild(member.guild.id);
  if (cfg.users.has(member.id)) return { allowed: true, via: 'user' };
  const roleIds = member.roles && member.roles.cache ? [...member.roles.cache.keys()] : [];
  if (roleIds.some((id) => cfg.roles.has(id))) return { allowed: true, via: 'role' };
  return { allowed: false, via: null };
}

// رسالة رفض موحّدة (التفاعل لازم يكون deferred مسبقاً أو بيُرد عليه مباشرة)
function denyPayload(level = 'admin') {
  const msg =
    level === 'manager'
      ? 'هذا الأمر يدير صلاحيات الأدمن نفسها، فمسموح **فقط** لمالك السيرفر أو من يملك صلاحية **Administrator** الفعلية بديسكورد 🛡️'
      : 'هذا الأمر مخصص لإدارة السيرفر فقط 🛡️\nتحتاج صلاحية **Administrator**، أو تكون مضافاً كأدمن، أو تملك رتبة إدارية مسجّلة بالبوت.';
  return { embeds: [eb.error(msg, '⛔ غير مصرّح')], components: [] };
}

// حارس جاهز للأوامر: يرجّع true لو مسموح، وإلا يرد برسالة الرفض ويرجّع false
async function guardAdmin(interaction) {
  const { allowed } = await checkAdminPermission(interaction.member);
  if (!allowed) {
    logger.warn('رفض أمر إداري لعدم الصلاحية', { command: interaction.commandName, userId: interaction.user.id, guildId: interaction.guildId });
    await respond.send(interaction, denyPayload('admin'), { ephemeral: true });
  }
  return allowed;
}

async function guardManager(interaction) {
  const allowed = isServerManager(interaction.member);
  if (!allowed) {
    logger.warn('رفض أمر إدارة صلاحيات (يتطلب Administrator)', { command: interaction.commandName, userId: interaction.user.id, guildId: interaction.guildId });
    await respond.send(interaction, denyPayload('manager'), { ephemeral: true });
  }
  return allowed;
}

// تنبيه للإدارة لو بيانات البوت محفوظة بقاعدة مؤقتة (SQLite على Render بدون قرص دائم):
// كل ما يُحفظ (رتب الدعم، الأدمن، التحذيرات) بينمسح مع أول تحديث/إعادة تشغيل.
function withStorageNotice(payload) {
  const botDb = require('../database/botDb');
  const backup = require('../services/stateBackup');
  if (!(process.env.RENDER && botDb.dialect() === 'sqlite' && !backup.isActive())) return payload;
  const st = backup.status();
  const notice = st.enabled
    ? eb.warning(
        'الحفظ الدائم ينتظر خدمة الـAPI ترد (البوت يحاول كل دقيقة تلقائياً) — لين يرجع، التعديلات الحين ممكن تضيع مع التحديث الجاي.' +
          (st.lastError ? `\n🔎 السبب التقني: \`${String(st.lastError).slice(0, 80)}\`` : ''),
        '⚠️ الحفظ الدائم متأخر'
      )
    : eb.warning(
        'البوت يحفظ الإعدادات بذاكرة **مؤقتة** — بتنمسح مع أول تحديث أو إعادة تشغيل.\n' +
          'فعّل الحفظ الدائم: احذف متغير `BOT_STATE_BACKUP=off` من خدمة البوت بـRender.',
        '⚠️ الحفظ غير دائم'
      );
  return { ...payload, embeds: [...(payload.embeds || []), notice] };
}

// بعد تبديل القاعدة كاملة (استرجاع بالخلفية)
function invalidateAll() {
  cache.clear();
}

module.exports = { checkAdminPermission, isServerManager, guardAdmin, guardManager, invalidate, invalidateAll, loadGuild, denyPayload, withStorageNotice };
