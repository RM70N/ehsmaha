'use strict';

// /ازالة ستريمر <يوزر> <المنصة> — (لمالك البوت فقط) يوقف الإعلان التلقائي لهذا الحساب.
// ما يمس /بث ولا جلسة بث الستريمر ولا ربطه بالموقع.

const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const logger = require('../../utils/logger');
const { isOwnerId } = require('../../services/ownerAI/ownerGuard');
const resolver = require('../../services/streamLinkResolver');
const formatter = require('../../services/streamAnnouncementFormatter');
const store = require('../../database/streamerAnnouncements');
const announcer = require('../../services/streamerAnnouncer');
const { PLATFORM_CHOICES, MSG } = require('./addStreamer')._internal;

const NOT_FOUND = 'هذا الستريمر مو موجود بقائمة الإعلانات على المنصة المحددة.';

async function execute(interaction) {
  if (!isOwnerId(interaction.user.id)) {
    logger.warn('محاولة استخدام /ازالة ستريمر من غير المالك', { userId: interaction.user.id, guildId: interaction.guildId });
    return respond.send(interaction, { embeds: [eb.error(MSG.NOT_OWNER)] }, { ephemeral: true });
  }
  if (!interaction.inGuild()) return respond.send(interaction, { embeds: [eb.warning('استخدم الأمر داخل السيرفر.')] }, { ephemeral: true });

  const platform = interaction.options.getString('المنصة', true);
  const n = resolver.normalizeUsername(interaction.options.getString('يوزر', true));
  if (!n) return respond.send(interaction, { embeds: [eb.warning(MSG.BAD_USERNAME)] }, { ephemeral: true });
  if (!(await respond.defer(interaction, { ephemeral: true }))) return undefined;

  try {
    const removed = await store.streamers.remove(interaction.guildId, platform, n.normalized);
    if (!removed) return respond.send(interaction, { embeds: [eb.warning(NOT_FOUND)] });
    const a = announcer.get();
    if (a) await a.unregister({ guildId: interaction.guildId, platform, normalized: n.normalized });
    return respond.send(interaction, formatter.removedPayload({ username: n.display, platform }));
  } catch (err) {
    logger.error('/ازالة ستريمر: فشل', { error: err });
    return respond.send(interaction, { embeds: [eb.error(err && err.code === 'DB_UNAVAILABLE' ? MSG.DB_DOWN : 'تعذّرت إزالة الستريمر — شوف سجل البوت.')] });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ازالة')
    .setDescription('➖ (للمالك) إيقاف الإعلان التلقائي عن ستريمر')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sc) =>
      sc
        .setName('ستريمر')
        .setDescription('إيقاف الإعلان التلقائي عن بث هذا الستريمر')
        .addStringOption((o) => o.setName('يوزر').setDescription('يوزر الستريمر (مع @ أو بدونه)').setRequired(true).setMaxLength(60))
        .addStringOption((o) => o.setName('المنصة').setDescription('المنصة اللي سجّلته عليها').setRequired(true).addChoices(...PLATFORM_CHOICES))
    ),
  execute
};
