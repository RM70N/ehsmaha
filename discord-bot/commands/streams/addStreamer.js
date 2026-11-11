'use strict';

// /اضافة ستريمر <يوزر> <المنصة> — (لمالك البوت فقط) يسجّل ستريمر للإعلان التلقائي عن بثه برووم الإعلانات.
// الأمر "اضافة" وأمره الفرعي "ستريمر" ← يظهر بديسكورد: /اضافة ستريمر (الاسم الواحد ما يقبل مسافة).

const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const logger = require('../../utils/logger');
const { loadConfig } = require('../../config');
const { isOwnerId } = require('../../services/ownerAI/ownerGuard');
const resolver = require('../../services/streamLinkResolver');
const formatter = require('../../services/streamAnnouncementFormatter');
const store = require('../../database/streamerAnnouncements');
const announcer = require('../../services/streamerAnnouncer');

const MSG = {
  NOT_OWNER: 'هذا الأمر مخصص لمالك البوت فقط.',
  EXISTS: 'هذا الستريمر مسجل مسبقاً على نفس المنصة.',
  BAD_USERNAME: 'اليوزر غير صالح لهذي المنصة — تأكد من كتابته بدون مسافات أو رموز غريبة.',
  DB_DOWN: 'قاعدة بيانات البوت غير متاحة حالياً — جرّب بعد شوي.'
};

const PLATFORM_CHOICES = [
  { name: 'TikTok', value: 'tiktok' },
  { name: 'Twitch', value: 'twitch' },
  { name: 'YouTube', value: 'youtube' },
  { name: 'Kick', value: 'kick' }
];

const ephemeral = (interaction, text, tone = 'warning') =>
  respond.send(interaction, { embeds: [tone === 'error' ? eb.error(text) : eb.warning(text)] }, { ephemeral: true });

async function execute(interaction) {
  // الصلاحية داخل الكود نفسه (مو بإخفاء الأمر): هوية المنفّذ فقط
  if (!isOwnerId(interaction.user.id)) {
    logger.warn('محاولة استخدام /اضافة ستريمر من غير المالك', { userId: interaction.user.id, guildId: interaction.guildId });
    return ephemeral(interaction, MSG.NOT_OWNER, 'error');
  }
  if (!interaction.inGuild()) return ephemeral(interaction, 'استخدم الأمر داخل السيرفر.');

  const platform = interaction.options.getString('المنصة', true);
  const n = resolver.normalizeUsername(interaction.options.getString('يوزر', true));
  if (!store.PLATFORMS.includes(platform) || !n || !resolver.validateUsername(platform, n.normalized).ok) {
    return ephemeral(interaction, MSG.BAD_USERNAME);
  }
  if (!(await respond.defer(interaction, { ephemeral: true }))) return undefined;

  try {
    const res = await store.streamers.add({ guildId: interaction.guildId, platform, username: n.display, normalized: n.normalized, addedBy: interaction.user.id });
    if (!res.created) return respond.send(interaction, { embeds: [eb.warning(MSG.EXISTS)] });
    const a = announcer.get();
    if (a) a.register(res.row);
    return respond.send(interaction, formatter.addedPayload({ username: n.display, platform, channelId: loadConfig().streamAnnounceChannelId }));
  } catch (err) {
    logger.error('/اضافة ستريمر: فشل', { error: err });
    return respond.send(interaction, { embeds: [eb.error(err && err.code === 'DB_UNAVAILABLE' ? MSG.DB_DOWN : 'تعذّرت إضافة الستريمر — شوف سجل البوت.')] });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('اضافة')
    .setDescription('➕ (للمالك) تسجيل ستريمر للإعلان التلقائي عن بثه')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sc) =>
      sc
        .setName('ستريمر')
        .setDescription('تسجيل ستريمر: أول ما يربط بثه بأحسمها يتنشر رابط بثه برووم الإعلانات')
        .addStringOption((o) => o.setName('يوزر').setDescription('يوزر الستريمر (مع @ أو بدونه)').setRequired(true).setMaxLength(60))
        .addStringOption((o) => o.setName('المنصة').setDescription('المنصة اللي يبث عليها').setRequired(true).addChoices(...PLATFORM_CHOICES))
    ),
  execute,
  _internal: { MSG, PLATFORM_CHOICES }
};
