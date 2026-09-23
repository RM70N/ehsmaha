'use strict';

// /مساعدة — كل الأوامر مقسمة لفئات بأيقونات وألوان متسقة.
// الأوامر الإدارية تظهر فقط لمن يملك صلاحيتها.

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const { isBotAdmin } = require('../../utils/permissions');
const { loadConfig } = require('../../config');

const CATEGORIES = [
  {
    title: '👤 اللاعبين',
    commands: [
      ['/بروفايل يوزر:<اليوزرنيم>', 'بطاقة اللاعب: اللفل، الخبرة، النقاط، الألعاب'],
      ['/احصائيات يوزر:<اليوزرنيم>', 'الانتصارات، الهزائم، معدل الفوز، الترتيب']
    ]
  },
  {
    title: '📊 الإحصائيات',
    commands: [['/المتصدرين [نوع]', 'أعلى اللاعبين — عام أو أسبوعي']]
  },
  {
    title: '🌐 الموقع',
    commands: [
      ['/احسمها', 'نبذة عن المنصة ورابط الموقع'],
      ['/الموقع', 'نفس /احسمها'],
      ['/احداث', 'الفعاليات والبطولات النشطة حالياً'],
      ['/مساعدة', 'هذي القائمة']
    ]
  }
];

const ADMIN_CATEGORY = {
  title: '🛡️ الإدارة',
  commands: [['/ادمن_احصائيات', 'إحصائيات استخدام البوت والموقع']]
};

const USAGE_NOTE =
  '**✍️ طريقة الاستخدام:** أوامر اللاعب تحتاج كتابة **اليوزرنيم** بخيار `يوزر` — لك أو لأي لاعب ثاني بالموقع.\n' +
  '> مثال: `/بروفايل يوزر: ahmed_1` أو `/احصائيات يوزر: ahmed_1`\n' +
  '💡 أثناء الكتابة تطلع لك **اقتراحات أسماء** من الموقع — اختر منها لتفادي الأخطاء. الحروف الكبيرة والصغيرة سواء.';

function formatCategory(cat) {
  return cat.commands.map(([name, desc]) => `**\`${name}\`**\n╰ ${desc}`).join('\n');
}

function buildHelp(showAdmin) {
  const config = loadConfig();
  const cats = showAdmin ? [...CATEGORIES, ADMIN_CATEGORY] : CATEGORIES;
  const embed = eb
    .brand({
      tone: 'primary',
      title: '📖 أوامر بوت احسمها',
      description: 'كل الأوامر تبدأ بـ **/** — اكتب `/` بالشات وبتطلع لك القائمة.\nالخيارات بين < > مطلوبة، وبين [ ] اختيارية.\n\n' + USAGE_NOTE,
      thumbnail: config.logoUrl
    })
    .addFields(cats.map((c) => eb.field(c.title, formatCategory(c), false)));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('زيارة الموقع').setEmoji('🌐').setURL(config.siteUrl),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('صفحة البروفايل').setEmoji('👤').setURL(config.profileUrl)
  );
  return { embeds: [embed], components: [row] };
}

module.exports = {
  data: new SlashCommandBuilder().setName('مساعدة').setDescription('يعرض كل أوامر البوت وطريقة استخدامها'),
  async execute(interaction) {
    const admin = isBotAdmin(interaction);
    // لو فيه أوامر إدارية بالقائمة نخلي الرد خاص حتى ما تنعرض لغير المخوّلين
    return respond.send(interaction, buildHelp(admin), { ephemeral: admin });
  },
  _internal: { buildHelp }
};
