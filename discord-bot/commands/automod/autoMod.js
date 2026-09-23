'use strict';

// أوامر نظام الحماية التلقائي (للإدارة — checkAdminPermission):
//   /حالة_الحماية                                حالة النظامين والاستثناءات والصلاحيات
//   /تفعيل_حماية_روابط · /تعطيل_حماية_روابط
//   /تفعيل_حماية_سبام · /تعطيل_حماية_سبام
//   /مخالفات_عضو عضو                             عدّاد الروابط والسبام (منفصلين) + آخر الإجراءات
//   /تصفير_مخالفات عضو نوع                        روابط / سبام / الكل
//   /اضافة_رابط_مسموح رابط [ازالة]               قائمة بيضاء للنطاقات
//   /استثناء_روابط رتبة [ازالة]                  رتبة تقدر ترسل روابط
//   /استثناء_قناة_روابط قناة [ازالة]             قناة يُسمح فيها بالروابط

const { SlashCommandBuilder, InteractionContextType, ChannelType } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const store = require('../../database/botStore');
const autoMod = require('../../services/autoMod');
const cfg = require('../../config/autoMod');
const { guardAdmin, withStorageNotice } = require('../../utils/adminPermissions');
const { missingBotPermissions } = require('../../utils/permissions');
const { formatDurationAr, logModeration } = require('../../utils/moderation');

const N = {
  STATUS: 'حالة_الحماية',
  LINK_ON: 'تفعيل_حماية_روابط',
  LINK_OFF: 'تعطيل_حماية_روابط',
  SPAM_ON: 'تفعيل_حماية_سبام',
  SPAM_OFF: 'تعطيل_حماية_سبام',
  VIOLATIONS: 'مخالفات_عضو',
  RESET: 'تصفير_مخالفات',
  ALLOW_LINK: 'اضافة_رابط_مسموح',
  EXEMPT_ROLE: 'استثناء_روابط',
  EXEMPT_CHANNEL: 'استثناء_قناة_روابط'
};

const base = (name, description) =>
  new SlashCommandBuilder().setName(name).setDescription(description).setContexts(InteractionContextType.Guild);
const removeOpt = (b) => b.addBooleanOption((o) => o.setName('ازالة').setDescription('يشيله من القائمة بدل ما يضيفه').setRequired(false));

const onOff = (v) => (v ? '🟢 مفعّلة' : '🔴 معطّلة');
const escalationText = () => cfg.escalationMs.map((ms, i) => `${i + 1}${i === cfg.escalationMs.length - 1 ? '+' : ''}: ${formatDurationAr(ms)}`).join(' · ');

module.exports = {
  data: [
    base(N.STATUS, '🛡️ (للإدارة) حالة الحماية التلقائية من الروابط والسبام'),
    base(N.LINK_ON, '🛡️ (للإدارة) يفعّل الحماية من الروابط'),
    base(N.LINK_OFF, '🛡️ (للإدارة) يعطّل الحماية من الروابط'),
    base(N.SPAM_ON, '🛡️ (للإدارة) يفعّل الحماية من السبام'),
    base(N.SPAM_OFF, '🛡️ (للإدارة) يعطّل الحماية من السبام'),
    base(N.VIOLATIONS, '🛡️ (للإدارة) مخالفات عضو (روابط وسبام) وآخر الإجراءات').addUserOption((o) =>
      o.setName('عضو').setDescription('العضو').setRequired(true)
    ),
    base(N.RESET, '🛡️ (للإدارة) يصفّر عدّاد مخالفات عضو')
      .addUserOption((o) => o.setName('عضو').setDescription('العضو').setRequired(true))
      .addStringOption((o) =>
        o.setName('نوع').setDescription('أي عدّاد').setRequired(true)
          .addChoices({ name: 'روابط', value: 'link' }, { name: 'سبام', value: 'spam' }, { name: 'الكل', value: 'all' })
      ),
    removeOpt(base(N.ALLOW_LINK, '🛡️ (للإدارة) يسمح بنطاق معيّن (مثل youtube.com) للكل').addStringOption((o) =>
      o.setName('رابط').setDescription('الرابط أو النطاق — مثال: youtube.com').setRequired(true).setMaxLength(200)
    )),
    removeOpt(base(N.EXEMPT_ROLE, '🛡️ (للإدارة) رتبة يُسمح لأعضائها بإرسال الروابط').addRoleOption((o) =>
      o.setName('رتبة').setDescription('الرتبة').setRequired(true)
    )),
    removeOpt(base(N.EXEMPT_CHANNEL, '🛡️ (للإدارة) قناة يُسمح فيها بالروابط (مثل شير المحتوى)').addChannelOption((o) =>
      o.setName('قناة').setDescription('القناة').setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildVoice)
    ))
  ],

  async execute(interaction, ctx) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardAdmin(interaction))) return;
    const guild = interaction.guild;
    const by = interaction.user.id;
    const name = interaction.commandName;

    // ---------- تفعيل/تعطيل ----------
    const toggles = {
      [N.LINK_ON]: ['link_protection', true, 'الروابط'],
      [N.LINK_OFF]: ['link_protection', false, 'الروابط'],
      [N.SPAM_ON]: ['spam_protection', true, 'السبام'],
      [N.SPAM_OFF]: ['spam_protection', false, 'السبام']
    };
    if (toggles[name]) {
      const [key, value, label] = toggles[name];
      await store.guildSettings.update(guild.id, { [key]: value }, by);
      autoMod.invalidate(guild.id);
      await logModeration({ guildId: guild.id, action: `automod_${key}_${value ? 'on' : 'off'}`, moderatorId: by });
      const note = value && key === 'link_protection' && ctx && ctx.messageContentIntent === false
        ? '\n\n⚠️ **Message Content Intent غير مفعّل** — البوت ما يقدر يقرأ نص الرسائل فما يكشف الروابط لين تفعّله: discord.com/developers → احسمها → Bot → **Message Content Intent**.'
        : '';
      return respond.send(interaction, withStorageNotice({
        embeds: [(value ? eb.success : eb.warning)(`الحماية من **${label}** ${value ? 'مفعّلة ✅' : 'معطّلة ⛔'}${note}`, '🛡️ الحماية التلقائية')]
      }));
    }

    // ---------- الحالة ----------
    if (name === N.STATUS) {
      const [settings, ex] = await Promise.all([store.guildSettings.get(guild.id), store.autoMod.exemptions(guild.id)]);
      const missing = missingBotPermissions(guild, ['ManageMessages', 'ModerateMembers']);
      const intents = [];
      if (ctx && ctx.messageContentIntent === false) intents.push('⚠️ **Message Content Intent** غير مفعّل — كشف الروابط والرسائل المكررة متوقف (سبام السرعة شغال).');
      const list = (arr, fmt) => (arr.length ? arr.slice(0, 20).map(fmt).join(' ') : 'لا يوجد');
      const embed = eb.brand({
        tone: 'primary',
        title: '🛡️ حالة الحماية التلقائية',
        description:
          `🔗 **الروابط:** ${onOff(settings.link_protection)}\n` +
          `💬 **السبام:** ${onOff(settings.spam_protection)}\n\n` +
          `**التصعيد (لكل نوع لحاله):** ${escalationText()}\n` +
          `**السبام =** ${cfg.spam.maxMessages} رسائل خلال ${cfg.spam.windowMs / 1000} ثوانٍ، أو نفس الرسالة ${cfg.spam.duplicateCount} مرات ورا بعض.\n` +
          '**مستثنى دائماً:** الأدمن والرتب الإدارية بالبوت.' +
          (missing.length ? `\n\n🔧 البوت ناقصه: ${missing.map((m) => `**${m}**`).join('، ')} — بدونها ما يقدر يحذف/يكتم.` : '') +
          (intents.length ? `\n\n${intents.join('\n')}` : '')
      });
      embed.addFields(
        eb.field('🌐 روابط مسموحة', list([...cfg.builtinAllowedDomains, ...ex.domains], (d) => `\`${d}\``), false),
        eb.field('🎭 رتب مستثناة من الروابط', list(ex.roles, (id) => `<@&${id}>`), false),
        eb.field('📺 قنوات مسموح فيها الروابط', list(ex.channels, (id) => `<#${id}>`), false)
      );
      return respond.send(interaction, { embeds: [embed], allowedMentions: { parse: [] } });
    }

    // ---------- مخالفات عضو ----------
    if (name === N.VIOLATIONS) {
      const user = interaction.options.getUser('عضو', true);
      const [v, log] = await Promise.all([store.autoMod.get(guild.id, user.id), store.moderationLog.forTarget(guild.id, user.id, 5)]);
      const row = (label, x) =>
        `${label}: **${x.count}** ${x.last ? `— آخرها ${eb.discordDate(x.last, 'R')}` : ''}\n╰ المخالفة الجاية: كتم ${formatDurationAr(cfg.escalationMs[Math.min(x.count, cfg.escalationMs.length - 1)])}`;
      const history = log.length
        ? log.map((l) => `• ${l.action === 'auto_timeout' ? '🤖 تلقائي' : '👮 يدوي'} \`${l.action}\` ${eb.discordDate(l.created_at, 'R')}${l.reason ? ` — ${eb.clip(l.reason, 60)}` : ''}`).join('\n')
        : 'لا يوجد';
      const embed = eb.brand({
        tone: 'primary',
        title: `🛡️ مخالفات ${eb.safeName(user.username)}`,
        description: `${row('🔗 الروابط', v.link)}\n\n${row('💬 السبام', v.spam)}`
      });
      embed.addFields(eb.field('📋 آخر الإجراءات', history, false));
      return respond.send(interaction, { embeds: [embed], allowedMentions: { parse: [] } });
    }

    // ---------- تصفير ----------
    if (name === N.RESET) {
      const user = interaction.options.getUser('عضو', true);
      const type = interaction.options.getString('نوع', true);
      const changed = await store.autoMod.reset(guild.id, user.id, type);
      await logModeration({ guildId: guild.id, action: 'automod_reset', targetId: user.id, moderatorId: by, details: { type } });
      const label = { link: 'الروابط', spam: 'السبام', all: 'كل المخالفات' }[type];
      return respond.send(interaction, withStorageNotice({
        embeds: [eb.success(changed ? `تم تصفير **${label}** لـ${user}.` : `${user} ما عنده مخالفات ${type === 'all' ? '' : `**${label}**`} أصلاً.`, '🛡️ تصفير المخالفات')],
        allowedMentions: { parse: [] }
      }));
    }

    // ---------- الاستثناءات ----------
    const removing = interaction.options.getBoolean('ازالة') === true;
    let type;
    let value;
    let shown;
    if (name === N.ALLOW_LINK) {
      value = autoMod._internal.normalizeDomain(interaction.options.getString('رابط', true));
      if (!value) return respond.send(interaction, { embeds: [eb.warning('اكتب نطاق صحيح — مثال: `youtube.com` أو `https://www.youtube.com`')] });
      type = 'domain';
      shown = `\`${value}\` (وكل نطاقاته الفرعية)`;
    } else if (name === N.EXEMPT_ROLE) {
      const role = interaction.options.getRole('رتبة', true);
      if (role.id === guild.id) return respond.send(interaction, { embeds: [eb.error('استثناء **@everyone** يعني تعطيل حماية الروابط — استخدم `/تعطيل_حماية_روابط` بدلها.')] });
      type = 'role';
      value = role.id;
      shown = `<@&${role.id}>`;
    } else if (name === N.EXEMPT_CHANNEL) {
      type = 'channel';
      value = interaction.options.getChannel('قناة', true).id;
      shown = `<#${value}>`;
    } else {
      return undefined;
    }

    const changed = removing
      ? await store.autoMod.removeExemption(guild.id, type, value)
      : await store.autoMod.addExemption(guild.id, type, value, by);
    autoMod.invalidate(guild.id);
    await logModeration({ guildId: guild.id, action: `automod_${type}_${removing ? 'remove' : 'add'}`, moderatorId: by, details: { value } });
    const msg = removing
      ? changed ? `تمت إزالة ${shown} من الاستثناءات.` : `${shown} مو موجود بالاستثناءات أصلاً.`
      : changed ? `تمت إضافة ${shown} للاستثناءات ✅` : `${shown} مضاف مسبقاً ✅`;
    return respond.send(interaction, withStorageNotice({ embeds: [eb.success(msg, '🛡️ استثناءات الروابط')], allowedMentions: { parse: [] } }));
  }
};
