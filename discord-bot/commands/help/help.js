'use strict';

// /مساعدة — كل الأوامر مقسمة لفئات بأيقونات وألوان متسقة، مع أمثلة استخدام.
// فئات الإدارة (الإشراف، التكتات، الصلاحيات) تظهر فقط لمن يملك صلاحيتها، وبرد خاص.

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const { isBotAdmin } = require('../../utils/permissions');
const { checkAdminPermission } = require('../../utils/adminPermissions');
const logger = require('../../utils/logger');
const { loadConfig } = require('../../config');

const CATEGORIES = [
  {
    title: '👤 اللاعبين',
    commands: [
      ['/بروفايل يوزر:<اليوزرنيم>', 'بطاقة اللاعب: اللفل، الخبرة، النقاط، الإطارات، الإنجازات'],
      ['/احصائيات يوزر:<اليوزرنيم>', 'الانتصارات، الهزائم، معدل الفوز، الترتيب، أكثر لعبة وستريمر']
    ]
  },
  {
    title: '📊 الإحصائيات',
    commands: [
      ['/المتصدرين [نوع]', 'أعلى اللاعبين بالخبرة — عام أو أسبوعي'],
      ['/الفائزين [ستريمر]', 'لوحة الفائزين — أكثر المتابعين فوزاً بكل الستريمرز أو ببث ستريمر']
    ]
  },
  {
    title: '🌐 الموقع والبث',
    commands: [
      ['/بث', 'الستريمرز اللي يبثون الآن على احسمها (تيك توك/تويتش/كيك/يوتيوب)'],
      ['/احسمها', 'نبذة عن المنصة ورابط الموقع'],
      ['/الموقع', 'نفس /احسمها'],
      ['/احداث', 'الفعاليات والبطولات النشطة حالياً'],
      ['/مساعدة', 'هذي القائمة']
    ]
  }
];

// تظهر فقط لمن يملك صلاحيات الإدارة (checkAdminPermission)
const ADMIN_CATEGORIES = [
  {
    title: '🛡️ الإشراف',
    commands: [
      ['/كتم عضو المدة الوحدة [السبب]', 'كتم مؤقت حتى 28 يوم — مثال: `/كتم عضو:@فلان المدة:30 الوحدة:دقائق السبب:سبام`'],
      ['/تحذير عضو سبب رتبة_التحذير', 'يسجّل تحذير ويبدّل رتبة التحذير — مثال: `/تحذير عضو:@فلان سبب:ألفاظ رتبة_التحذير:تحذير1`'],
      ['/سجل_تحذيرات عضو', 'كل تحذيرات العضو بأرقامها (الأحدث أولاً)'],
      ['/حذف_تحذير عضو رقم_التحذير', 'يحذف تحذير أُضيف بالخطأ — مثال: `/حذف_تحذير عضو:@فلان رقم_التحذير:2`'],
      ['/طرد عضو سبب', 'طرد مع إشعار خاص للعضو قبل الطرد'],
      ['/مسح قناة عدد', 'يحذف حتى 500 رسالة (الأقدم من 14 يوم ما تنحذف) — مثال: `/مسح قناة:#العام عدد:150`']
    ]
  },
  {
    title: '🎫 تذاكر الدعم',
    commands: [
      ['/دعم قناة رسالة', 'ينشر لوحة "افتح التكت" — مثال: `/دعم قناة:#الدعم رسالة:عندك مشكلة؟ افتح تكت\\nوبنرد عليك`'],
      ['/اعداد_رتب_الدعم [رتبة1..5] [مسح]', 'رتب فريق الدعم اللي تشوف التكتات — مثال: `/اعداد_رتب_الدعم رتبة1:@الدعم`']
    ]
  },
  {
    title: '👑 صلاحيات الإدارة (Administrator فقط للإضافة/الإزالة)',
    commands: [
      ['/عرض_الرتب', 'كل الرتب وعدد أعضائها، و🛡️ بجانب الرتب الإدارية'],
      ['/اضافة_رتبة_ادارية رتبة · /ازالة_رتبة_ادارية رتبة', 'أعضاء الرتبة يقدرون يستخدمون أوامر الإشراف'],
      ['/اضافة_ادمن عضو · /ازالة_ادمن عضو', 'أدمن فردي بدون رتبة'],
      ['/ادمن_احصائيات', 'إحصائيات استخدام البوت والموقع']
    ]
  }
];

const USAGE_NOTE =
  '**✍️ طريقة الاستخدام:** أوامر اللاعب تحتاج كتابة **اليوزرنيم** بخيار `يوزر` — لك أو لأي لاعب ثاني بالموقع.\n' +
  '> مثال: `/بروفايل يوزر: ahmed_1` أو `/احصائيات يوزر: ahmed_1`\n' +
  '💡 أثناء الكتابة تطلع لك **اقتراحات أسماء** من الموقع — اختر منها لتفادي الأخطاء. الحروف الكبيرة والصغيرة سواء.';

function formatCategory(cat) {
  return cat.commands.map(([name, desc]) => `**\`${name}\`**\n╰ ${desc}`).join('\n');
}

function buildHelp(showAdmin) {
  const config = loadConfig();
  const cats = showAdmin ? [...CATEGORIES, ...ADMIN_CATEGORIES] : CATEGORIES;
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
    let admin = isBotAdmin(interaction);
    if (!admin && interaction.inGuild() && interaction.member) {
      // الرتب الإدارية/الأدمن المضافين يشوفون أوامر الإشراف (فشل القاعدة = نعرض العامة فقط)
      admin = await checkAdminPermission(interaction.member)
        .then((r) => r.allowed)
        .catch((err) => {
          logger.debug('help: تعذّر فحص صلاحية الإدارة', { code: err.code });
          return false;
        });
    }
    // لو فيه أوامر إدارية بالقائمة نخلي الرد خاص حتى ما تنعرض لغير المخوّلين
    return respond.send(interaction, buildHelp(admin), { ephemeral: admin });
  },
  _internal: { buildHelp }
};
