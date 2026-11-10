'use strict';

// /بث — الستريمرز اللي يبثون الآن على احسمها، **لحظياً** ومن نفس مصدر قسم البثوث بلوحة المالك:
//   • الستريمر يظهر لحظة ربط يوزره (قبل أي لعبة) كـ"📡 متصل بالبث"، ويتحول "🎮 يلعب …" لما يشغّل لعبة،
//     ويختفي لما يطلع/ينقطع — والرسالة نفسها تتعدّل تلقائياً بدون ما يعيد أحد الأمر.
//   • 8 ستريمرز بالصفحة، تصفية بالمنصة، 🔄 تحديث، ورابط اللعب على الموقع. التصميم بـservices/liveBoard.js.
// أمر واحد كل 5 ثوانٍ لكل مستخدم.

const { SlashCommandBuilder } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const liveStreams = require('../../services/liveStreams');
const board = require('../../services/liveBoard');

const buildPage = (streams, page, ownerId, opts) => {
  const { page: _p, ...payload } = board.buildPage(streams, page, ownerId, opts);
  return payload;
};

module.exports = {
  data: new SlashCommandBuilder().setName('بث').setDescription('يعرض الستريمرز اللي يبثون الآن على احسمها لحظياً (نفس قسم البثوث بلوحة المالك)'),
  options: { cooldownMs: 5000 },

  async execute(interaction) {
    // البيانات بالذاكرة (فورية) — ما يحتاج defer
    const payload = buildPage(liveStreams.list(), 0, interaction.user.id, { live: true });
    const sent = await respond.send(interaction, payload);
    if (!sent) return undefined;
    // نفس الرسالة تتعدّل لحظياً مع أي تغيير بالبث (ما يضر لو فشل التتبع: الأزرار تشتغل عادي)
    const reply = typeof interaction.fetchReply === 'function' ? await interaction.fetchReply().catch(() => null) : null;
    board.track(interaction, (reply && reply.id) || (sent && sent.id), { ownerId: interaction.user.id, page: 0, filter: 'all' });
    return undefined;
  },

  buttons: {
    // bt:page:<page>:<ownerId>:<filter> · bt:ref:<page>:<ownerId>:<filter> · bt:flt:<ownerId> (قائمة التصفية)
    async bt(interaction, args) {
      const [action] = args;
      if (action === 'noop') return undefined;
      const isSelect = action === 'flt';
      const ownerId = isSelect ? args[1] : args[2];
      if (ownerId && ownerId !== interaction.user.id) {
        return respond.send(interaction, { embeds: [eb.warning('هذي القائمة لشخص ثاني — استخدم **`/بث`** عشان تتصفح قائمتك.')] }, { ephemeral: true });
      }
      let page = 0;
      let filter = 'all';
      if (isSelect) {
        filter = board.normFilter(interaction.values && interaction.values[0]);
      } else if (action === 'page' || action === 'ref') {
        page = Number.parseInt(args[1], 10) || 0;
        filter = board.normFilter(args[3]);
      } else {
        return undefined;
      }
      const payload = board.buildPage(liveStreams.list(), page, ownerId, { filter, live: true });
      const { page: shownPage, ...rest } = payload;
      await interaction.update(rest);
      // ضغطة الزر تعطينا توكن جديد ← نجدد نافذة التحديث اللحظي (وترجع لحظية حتى بعد إعادة تشغيل البوت)
      if (interaction.message && interaction.message.id) board.track(interaction, interaction.message.id, { ownerId, page: shownPage, filter });
      return undefined;
    }
  },

  _internal: { buildPage, streamLine: board.streamBlock, PLATFORM_META: board.PLATFORM_META }
};
