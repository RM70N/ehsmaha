'use strict';

// نظام تذاكر الدعم.
//
// التدفق (كل الأزرار/القوائم بـcustomId ثابت يُقرأ بـinteractionCreate العام،
// وكل الحالة بقاعدة بيانات البوت — فيشتغل حتى بعد إعادة تشغيل البوت):
//   /دعم ← رسالة لوحة بزر "افتح التكت"             customId: tk:open:<panelId>
//   الضغط ← (فحص تكرار) ← قائمة أسباب منسدلة        customId: tk:reason:<panelId>
//   اختيار السبب ← حجز التكت بالقاعدة (فهرس فريد يمنع التكرار) ← روم خاص
//   رسالة ترحيب بزر "إغلاق التكت"                    customId: tk:close:<ticketId>
//   الإغلاق يطلب تأكيد                                 customId: tk:cfy|tk:cfn:<ticketId>
//   التأكيد ← status=closed ← ملخص المساعد الذكي لقناة أخبار الأدمن ← أرشفة
//   (تصنيف "مغلق" بدون كتابة) أو حذف بعد مهلة
//
// المساعد الذكي (services/aiAssistant.js): ترحيب "معك مساعد احسمها" بعد فتح
// الروم، ويرد على رسائل صاحب التكت فقط، وملخص عند الإغلاق.
//
// مقاومة فقد البيانات (قاعدة مؤقتة انمسحت مع تحديث/إعادة تشغيل):
//   • اللوحة ما تعتمد على سجلها: قناة اللوحة = القناة اللي انضغط فيها الزر.
//   • أزرار الإغلاق تعتمد على القناة نفسها؛ لو سجل التكت مفقود يُسترجع من
//     موضوع القناة (topic فيه صاحب التكت وسببه) — فكل الأزرار تشتغل دائماً.

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');
const store = require('../database/botStore');
const reasons = require('../config/ticketReasons');
const eb = require('../utils/embedBuilder');
const respond = require('../utils/respond');
const customId = require('../utils/customId');
const logger = require('../utils/logger');
const { loadConfig } = require('../config');
const { checkAdminPermission } = require('../utils/adminPermissions');
const { missingBotPermissions, botPermissionsPayload } = require('../utils/permissions');
const { logModeration } = require('../utils/moderation');
const aiAssistant = require('./aiAssistant');

const SUPPORT_ROLES_KEY = 'support_roles';
const TICKET_BOT_PERMS = ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ReadMessageHistory', 'ManageChannels', 'ManageRoles'];
const RESERVE_STALE_MS = 2 * 60 * 1000; // تكت محجوز بدون قناة (انقطع إنشاؤه) أقدم من هذا = يُلغى

// ---------------- التحقق من ملف الأسباب عند التحميل ----------------
(function validateReasons() {
  if (!Array.isArray(reasons) || !reasons.length || reasons.length > 25) {
    throw new Error('config/ticketReasons.js لازم يكون مصفوفة من 1 إلى 25 سبب');
  }
  const seen = new Set();
  for (const r of reasons) {
    if (!r || typeof r.value !== 'string' || !/^[a-z0-9_-]{1,50}$/i.test(r.value)) throw new Error(`سبب تكت بقيمة غير صالحة: ${r && r.value}`);
    if (seen.has(r.value)) throw new Error(`قيمة سبب تكت مكررة: ${r.value}`);
    if (!r.label || r.label.length > 100) throw new Error(`عنوان سبب التكت "${r.value}" لازم يكون 1-100 حرف`);
    if (r.description && r.description.length > 100) throw new Error(`وصف سبب التكت "${r.value}" أطول من 100 حرف`);
    seen.add(r.value);
  }
})();

const reasonByValue = (v) => reasons.find((r) => r.value === v) || null;

// ---------------- أدوات ----------------
async function getSupportRoleIds(guild) {
  const ids = (await store.guildConfig.get(guild.id, SUPPORT_ROLES_KEY, [])) || [];
  return ids.filter((id) => guild.roles.cache.has(id)); // رتب انحذفت من السيرفر تنتجاهل
}

// اسم قناة صالح بديسكورد: أحرف (أي لغة) وأرقام و - و _ فقط، بدون مسافات، حتى 100 حرف
function channelNameFor(prefix, username, fallback) {
  const cleaned = String(username || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${prefix}-${cleaned || fallback}`.slice(0, 100);
}

async function fetchChannel(guild, id) {
  if (!id) return null;
  return guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
}

// ---------------- استرجاع التكتات من قنواتها ----------------
// موضوع روم التكت: "تكت #12 — user (123456789012345678) — السبب"
const TOPIC_RE = /^تكت #\d+ — .* \((\d{17,20})\) — (.+)$/;

function parseTopic(channel) {
  const m = TOPIC_RE.exec(String((channel && channel.topic) || ''));
  if (!m) return null;
  const label = m[2].trim();
  const reason = reasons.find((r) => r.label === label);
  return { discordId: m[1], reason: reason ? reason.value : 'other' };
}

// مؤرشف = داخل تصنيف "تكتات مغلقة"
function isArchived(channel) {
  const parent = channel.parentId && channel.guild.channels.cache.get(channel.parentId);
  return !!parent && parent.name === loadConfig().ticketArchiveCategoryName;
}

// روم تكت مفتوح بدون سجل (انمسحت القاعدة) ← سجل جديد مربوط بالقناة
async function adoptFromChannel(channel) {
  const info = parseTopic(channel);
  if (!info || isArchived(channel)) return null;
  const id = await store.tickets.adopt({ guildId: channel.guild.id, channelId: channel.id, discordId: info.discordId, reason: info.reason });
  logger.info('تم استرجاع تكت من قناته بعد فقد سجله', { channelId: channel.id, ticketId: id });
  return store.tickets.get(id);
}

// التكت الخاص بالقناة اللي انضغط فيها الزر (من القاعدة، أو مسترجع من القناة)
async function ticketForChannel(interaction) {
  const known = await store.tickets.getByChannel(interaction.guildId, interaction.channelId);
  if (known) return known;
  const channel = interaction.channel || (await fetchChannel(interaction.guild, interaction.channelId));
  return channel ? adoptFromChannel(channel) : null;
}

// تكت مفتوح موجود فعلاً؟ (ويصحّح الحالات العالقة: قناته انحذفت يدوياً، أو حجز انقطع)
async function resolveExistingOpen(guild, userId, originChannelId) {
  const existing = await store.tickets.findOpen(guild.id, userId, originChannelId);
  if (existing) {
    if (existing.channel_id) {
      const ch = await fetchChannel(guild, existing.channel_id);
      if (ch) return { ticket: existing, channel: ch };
      await store.tickets.close(existing.id, 'system', 'missing-channel');
      aiAssistant.forget(existing.channel_id);
      logger.info('تكت مفتوح قناته محذوفة — أُغلق تلقائياً', { ticketId: existing.id });
    } else if (Date.now() - existing.created_at < RESERVE_STALE_MS) {
      return { ticket: existing, channel: null, inProgress: true };
    } else {
      await store.tickets.discard(existing.id);
    }
  }
  // احتياط: روم تكت مفتوح لنفس العضو ما له سجل (القاعدة انمسحت) — يمنع التكرار
  for (const ch of guild.channels.cache.values()) {
    if (ch.type !== ChannelType.GuildText) continue;
    const info = parseTopic(ch);
    if (!info || info.discordId !== userId || isArchived(ch)) continue;
    const known = await store.tickets.getByChannel(guild.id, ch.id);
    if (known && known.status !== 'open') continue;
    const ticket = known || (await adoptFromChannel(ch));
    if (ticket) return { ticket, channel: ch };
  }
  return null;
}

function existingPayload(found) {
  const msg = found.inProgress
    ? 'تكتك قيد الإنشاء الحين ⏳ — انتظر ثواني.'
    : `لديك تكت مفتوح بالفعل هنا: ${found.channel}\nكمّل تواصلك مع الدعم فيه، أو أغلقه أولاً لو تبي تفتح تكت جديد.`;
  return { embeds: [eb.warning(msg, '🎫 عندك تكت مفتوح')], components: [] };
}

async function canManageTicket(interaction, ticket) {
  if (interaction.user.id === ticket.discord_id) return true;
  const supportIds = await getSupportRoleIds(interaction.guild);
  if (supportIds.some((id) => interaction.member.roles.cache.has(id))) return true;
  return (await checkAdminPermission(interaction.member)).allowed;
}

// ---------------- لوحة الدعم (/دعم) ----------------
function panelMessage(panelId, content) {
  const config = loadConfig();
  const embed = eb
    .brand({ tone: 'primary', title: '🎫 الدعم الفني — احسمها', description: content })
    .setThumbnail(config.logoUrl);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customId.build('tk', 'open', panelId)).setStyle(ButtonStyle.Primary).setLabel('افتح التكت').setEmoji('🎫')
  );
  return { embeds: [embed], components: [row] };
}

// ---------------- 1) الضغط على "افتح التكت" ----------------
async function onOpen(interaction, panelId) {
  if (!(await respond.defer(interaction, { ephemeral: true }))) return;
  // قناة اللوحة = القناة اللي فيها الزر — ما نحتاج سجل اللوحة (يشتغل حتى لو انمسحت القاعدة)
  const found = await resolveExistingOpen(interaction.guild, interaction.user.id, interaction.channelId);
  if (found) return respond.send(interaction, existingPayload(found));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId.build('tk', 'reason', panelId))
    .setPlaceholder('اختر سبب التكت')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      reasons.map((r) => {
        const o = { label: r.label, value: r.value };
        if (r.description) o.description = r.description;
        if (r.emoji) o.emoji = r.emoji;
        return o;
      })
    );
  return respond.send(interaction, {
    embeds: [eb.info('وش سبب تواصلك مع الدعم؟ اختر من القائمة وبننشئ لك روم خاص بينك وبين فريق الدعم 👇', '🎫 فتح تكت')],
    components: [new ActionRowBuilder().addComponents(menu)]
  });
}

// ---------------- 2) اختيار السبب → إنشاء الروم ----------------
async function onReason(interaction, panelId) {
  if (!(await respond.deferUpdate(interaction))) return;
  const guild = interaction.guild;
  const reason = reasonByValue(interaction.values && interaction.values[0]);
  if (!reason) return respond.send(interaction, { embeds: [eb.warning('سبب غير معروف — افتح التكت من جديد.')], components: [] });

  const originChannelId = interaction.channelId; // قناة اللوحة (القائمة ظهرت فيها)
  // سجل اللوحة اختياري: نربطه لو موجود وتابع لنفس القناة (بعد مسح القاعدة ممكن تتكرر الأرقام)
  const panel = await store.tickets.getPanel(panelId).catch(() => null);
  const validPanelId = panel && panel.guild_id === guild.id && panel.channel_id === originChannelId ? panelId : null;

  const missing = missingBotPermissions(guild, TICKET_BOT_PERMS);
  if (missing.length) return respond.send(interaction, botPermissionsPayload(missing, 'السيرفر'));

  const found = await resolveExistingOpen(guild, interaction.user.id, originChannelId);
  if (found) return respond.send(interaction, existingPayload(found));

  const ticketId = await store.tickets.reserve({
    guildId: guild.id,
    panelId: validPanelId,
    originChannelId,
    discordId: interaction.user.id,
    reason: reason.value
  });
  if (!ticketId) {
    // سباق نادر: ضغطتان بنفس اللحظة — الفهرس الفريد منع التكرار
    const again = await resolveExistingOpen(guild, interaction.user.id, originChannelId);
    return respond.send(interaction, again ? existingPayload(again) : { embeds: [eb.warning('جرّب مرة ثانية بعد ثواني.')], components: [] });
  }

  const config = loadConfig();
  const supportIds = await getSupportRoleIds(guild);
  const me = guild.members.me;
  const memberPerms = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: memberPerms },
    ...supportIds.map((id) => ({ id, allow: memberPerms })),
    {
      id: me.id,
      allow: [
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages
      ]
    }
  ];

  // التصنيف: TICKET_CATEGORY_ID لو مضبوط، وإلا نفس تصنيف قناة اللوحة
  let parent = null;
  if (config.ticketCategoryId) {
    const cat = await fetchChannel(guild, config.ticketCategoryId);
    if (cat && cat.type === ChannelType.GuildCategory) parent = cat.id;
  }
  if (!parent) {
    const origin = await fetchChannel(guild, originChannelId);
    if (origin && origin.parentId) parent = origin.parentId;
  }

  let channel;
  try {
    channel = await guild.channels.create({
      name: channelNameFor('دعم', interaction.user.username, interaction.user.id),
      type: ChannelType.GuildText,
      parent: parent || undefined,
      topic: `تكت #${ticketId} — ${interaction.user.tag || interaction.user.username} (${interaction.user.id}) — ${reason.label}`,
      permissionOverwrites: overwrites,
      reason: `تكت دعم #${ticketId}`
    });
  } catch (err) {
    await store.tickets.discard(ticketId).catch(() => {});
    logger.error('تعذّر إنشاء روم التكت', { ticketId, guildId: guild.id, code: err.code, error: err });
    const msg = err.code === 50013
      ? 'البوت ما يقدر ينشئ الروم بالصلاحيات المطلوبة — تأكد إن رتبة البوت فيها **إدارة القنوات** و**إدارة الرتب**.'
      : err.code === 30013
        ? 'السيرفر وصل الحد الأقصى لعدد القنوات — احذف قنوات قديمة ثم جرّب.'
        : 'تعذّر إنشاء روم التكت الحين، جرّب بعد قليل.';
    return respond.send(interaction, { embeds: [eb.error(msg)], components: [] });
  }

  await store.tickets.attachChannel(ticketId, channel.id);

  const welcome = eb.brand({
    tone: 'primary',
    title: `🎫 تكت دعم #${ticketId}`,
    description:
      `أهلاً ${interaction.user} 👋\n\n` +
      `**السبب:** ${reason.emoji ? `${reason.emoji} ` : ''}${reason.label}\n\n` +
      'اكتب مشكلتك بالتفصيل هنا (ولو عندك صور أرفقها)، وفريق الدعم بيرد عليك بأقرب وقت.\n' +
      'لما تنحل مشكلتك اضغط **إغلاق التكت** تحت.'
  });
  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customId.build('tk', 'close', ticketId)).setStyle(ButtonStyle.Danger).setLabel('إغلاق التكت').setEmoji('🔒')
  );
  try {
    await channel.send({
      content: [interaction.user.toString(), ...supportIds.map((id) => `<@&${id}>`)].join(' '),
      embeds: [welcome],
      components: [closeRow],
      allowedMentions: { users: [interaction.user.id], roles: supportIds }
    });
  } catch (err) {
    logger.warn('تعذّر إرسال رسالة ترحيب التكت', { ticketId, code: err.code });
  }
  // أول رد بالروم: مساعد احسمها الذكي (+ زر التحويل لفريق الدعم)
  await aiAssistant.startTicket(channel, {
    id: ticketId,
    guild_id: guild.id,
    discord_id: interaction.user.id,
    channel_id: channel.id,
    reason: reason.value,
    created_at: Date.now()
  });

  logger.info('تكت جديد', { ticketId, guildId: guild.id, userId: interaction.user.id, channelId: channel.id, reason: reason.value });
  return respond.send(interaction, {
    embeds: [eb.success(`تم فتح تكتك: ${channel}\nتوجّه له وكمّل مع فريق الدعم 💜`, '🎫 تم فتح التكت')],
    components: []
  });
}

// ---------------- 3) زر "إغلاق التكت" → تأكيد ----------------
async function onClose(interaction) {
  if (!(await respond.defer(interaction, { ephemeral: true }))) return;
  const ticket = await ticketForChannel(interaction);
  if (!ticket) {
    return respond.send(interaction, { embeds: [eb.warning('ما قدرت أتعرف على هذا التكت — الإدارة تقدر تحذف الروم يدوياً.')] });
  }
  const ticketId = ticket.id;
  if (ticket.status !== 'open') return respond.send(interaction, { embeds: [eb.info('هذا التكت مغلق مسبقاً 🔒')] });
  if (!(await canManageTicket(interaction, ticket))) {
    return respond.send(interaction, { embeds: [eb.error('الإغلاق مسموح لصاحب التكت أو فريق الدعم أو الإدارة فقط.', '⛔ غير مصرّح')] });
  }
  const config = loadConfig();
  const effect = config.ticketCloseMode === 'delete'
    ? `بتنحذف القناة بعد **${config.ticketDeleteDelaySeconds}** ثانية.`
    : 'بتنقفل القناة وتنتقل للأرشيف (تبقى للقراءة فقط).';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customId.build('tk', 'cfy', ticketId)).setStyle(ButtonStyle.Danger).setLabel('تأكيد الإغلاق').setEmoji('🔒'),
    new ButtonBuilder().setCustomId(customId.build('tk', 'cfn', ticketId)).setStyle(ButtonStyle.Secondary).setLabel('إلغاء')
  );
  return respond.send(interaction, { embeds: [eb.warning(`متأكد تبي تغلق التكت #${ticketId}؟\n${effect}`, '🔒 تأكيد الإغلاق')], components: [row] });
}

async function ensureArchiveCategory(guild) {
  const config = loadConfig();
  const name = config.ticketArchiveCategoryName;
  const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === name);
  if (existing) return existing;
  return guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages] }
    ],
    reason: 'أرشيف تكتات الدعم المغلقة'
  });
}

// أرشفة: نقل لتصنيف "مغلق" + إزالة صلاحية الكتابة (القراءة تبقى لصاحبه والدعم)
async function archiveChannel(guild, channel, ticket) {
  const notes = [];
  try {
    const category = await ensureArchiveCategory(guild);
    if (channel.parentId !== category.id) await channel.setParent(category.id, { lockPermissions: false, reason: `إغلاق تكت #${ticket.id}` });
  } catch (err) {
    // مثلاً التصنيف وصل حد 50 قناة — القناة تبقى مكانها بس تنقفل
    notes.push('تعذّر نقلها لتصنيف الأرشيف');
    logger.warn('تعذّر نقل التكت للأرشيف', { ticketId: ticket.id, code: err.code });
  }
  const supportIds = await getSupportRoleIds(guild);
  const readOnly = { ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AttachFiles: false };
  for (const id of [ticket.discord_id, ...supportIds]) {
    await channel.permissionOverwrites.edit(id, readOnly, { reason: `إغلاق تكت #${ticket.id}` }).catch((err) => {
      notes.push('تعذّر تعديل بعض الصلاحيات');
      logger.warn('تعذّر قفل صلاحيات التكت', { ticketId: ticket.id, target: id, code: err.code });
    });
  }
  if (!channel.name.startsWith('مغلق-')) {
    await channel.setName(`مغلق-${channel.name}`.slice(0, 100)).catch(() => {}); // تغيير الاسم محدود المعدل — مو ضروري
  }
  return notes;
}

function scheduleDeletion(channel, ticketId, delayMs) {
  const t = setTimeout(async () => {
    try {
      await channel.delete(`إغلاق تكت #${ticketId}`);
      await store.tickets.forgetChannel(ticketId);
    } catch (err) {
      logger.warn('تعذّر حذف قناة التكت', { ticketId, code: err.code });
    }
  }, delayMs);
  if (typeof t.unref === 'function') t.unref();
}

// ---------------- 4) تأكيد/إلغاء الإغلاق ----------------
async function onCloseConfirm(interaction, confirmed) {
  if (!(await respond.deferUpdate(interaction))) return;
  if (!confirmed) return respond.send(interaction, { embeds: [eb.info('تم إلغاء الإغلاق — التكت باقي مفتوح ✅')], components: [] });

  const ticket = await ticketForChannel(interaction);
  if (!ticket) return respond.send(interaction, { embeds: [eb.warning('ما قدرت أتعرف على هذا التكت.')], components: [] });
  const ticketId = ticket.id;
  if (!(await canManageTicket(interaction, ticket))) {
    return respond.send(interaction, { embeds: [eb.error('غير مصرّح لك بإغلاق هذا التكت.', '⛔ غير مصرّح')], components: [] });
  }
  const config = loadConfig();
  const closed = await store.tickets.close(ticketId, interaction.user.id, config.ticketCloseMode);
  if (!closed) return respond.send(interaction, { embeds: [eb.info('هذا التكت مغلق مسبقاً 🔒')], components: [] });

  const guild = interaction.guild;
  const channel = await fetchChannel(guild, ticket.channel_id);
  await logModeration({
    guildId: guild.id,
    action: 'ticket_close',
    targetId: ticket.discord_id,
    moderatorId: interaction.user.id,
    channelId: ticket.channel_id,
    reason: ticket.reason,
    details: { ticketId, mode: config.ticketCloseMode }
  });

  // ملخص المحادثة لقناة أخبار الأدمن — **قبل** الأرشفة/الحذف. فشله ما يوقف الإغلاق.
  await aiAssistant
    .reportTicketClosed({ guild, channel, ticket, closedById: interaction.user.id })
    .catch((err) => logger.warn('🤖 خطأ بملخص التكت', { ticketId, error: err }));

  let notes = [];
  if (channel) {
    if (config.ticketCloseMode === 'delete') {
      await channel
        .send({ embeds: [eb.warning(`تم إغلاق التكت بواسطة ${interaction.user} 🔒\n🗑️ القناة بتنحذف بعد **${config.ticketDeleteDelaySeconds}** ثانية.`, '🔒 تم الإغلاق')] })
        .catch(() => {});
      scheduleDeletion(channel, ticketId, config.ticketDeleteDelaySeconds * 1000);
    } else {
      notes = await archiveChannel(guild, channel, ticket);
      await channel
        .send({ embeds: [eb.info(`تم إغلاق التكت بواسطة ${interaction.user} 🔒\nالقناة صارت للقراءة فقط ومؤرشفة.`, '🔒 تم الإغلاق')] })
        .catch(() => {});
    }
  }
  return respond.send(interaction, {
    embeds: [eb.success(`تم إغلاق التكت #${ticketId}${notes.length ? `\n⚠️ ملاحظة: ${[...new Set(notes)].join('، ')}` : ''}`, '🔒 تم الإغلاق')],
    components: []
  });
}

// ---------------- تنظيف عند الإقلاع ----------------
async function sweepPendingDeletions(client) {
  const pending = await store.tickets.closedForDeletion(Date.now() - 7 * 24 * 60 * 60 * 1000);
  for (const t of pending) {
    const guild = client.guilds.cache.get(t.guild_id);
    if (!guild) continue;
    const ch = await fetchChannel(guild, t.channel_id);
    if (ch) await ch.delete(`إكمال حذف تكت مغلق #${t.id}`).catch(() => {});
    await store.tickets.forgetChannel(t.id);
  }
  if (pending.length) logger.info('تنظيف قنوات تكتات مغلقة', { count: pending.length });
}

// ---------------- الموزّع (بادئة tk) ----------------
async function handleComponent(interaction, args) {
  if (!interaction.inGuild()) return;
  const [action, rawId] = args;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isSafeInteger(id) || id <= 0) return;
  if (action === 'open') return onOpen(interaction, id);
  if (action === 'reason') return onReason(interaction, id);
  // أزرار الإغلاق: التكت يتحدد من القناة نفسها (الرقم بالزر للعرض فقط)
  if (action === 'close') return onClose(interaction);
  if (action === 'cfy') return onCloseConfirm(interaction, true);
  if (action === 'cfn') return onCloseConfirm(interaction, false);
  return undefined;
}

module.exports = {
  SUPPORT_ROLES_KEY,
  TICKET_BOT_PERMS,
  panelMessage,
  handleComponent,
  sweepPendingDeletions,
  getSupportRoleIds,
  _internal: { channelNameFor, resolveExistingOpen, archiveChannel, parseTopic, ticketForChannel, adoptFromChannel }
};
