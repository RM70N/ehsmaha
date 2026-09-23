'use strict';

// /مساعدة — كل الأوامر مقسمة لفئات بأيقونات وألوان متسقة، مع أمثلة استخدام.
// فئات الإدارة (الإشراف، التكتات، الترحيب، الحماية، الصلاحيات) تظهر فقط لمن يملك صلاحيتها، وبرد خاص.

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
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
    title: '👋 الترحيب',
    commands: [
      ['/قناة_الترحيب قناة [قناة_الرسالة] [تعطيل]', 'بطاقة ترحيب بصورة العضو ويوزره + رسالة منشن — مثال: `/قناة_الترحيب قناة:#الترحيب`'],
      ['/تخصيص_رسالة_الترحيب [نص] [افتراضي]', '`{يوزر}` يصير منشن — مثال: `/تخصيص_رسالة_الترحيب نص:نورت يا {يوزر}! 🎉`'],
      ['/تجربة_الترحيب', 'يرسل ترحيب تجريبي باسمك']
    ]
  },
  {
    title: '🤖 الحماية التلقائية (روابط وسبام)',
    commands: [
      ['/حالة_الحماية', 'الحالة والاستثناءات — الكتم: 10 د ← 30 د ← 24 ساعة (لكل نوع لحاله)'],
      ['/تفعيل_حماية_روابط · /تعطيل_حماية_روابط', 'تشغيل/إيقاف كشف الروابط'],
      ['/تفعيل_حماية_سبام · /تعطيل_حماية_سبام', 'تشغيل/إيقاف كشف السبام'],
      ['/مخالفات_عضو عضو · /تصفير_مخالفات عضو نوع', 'عدّاد الروابط والسبام وتصفيره — مثال: `/تصفير_مخالفات عضو:@فلان نوع:الكل`'],
      ['/اضافة_رابط_مسموح رابط [ازالة]', 'نطاق مسموح للكل — مثال: `/اضافة_رابط_مسموح رابط:youtube.com`'],
      ['/استثناء_روابط رتبة · /استثناء_قناة_روابط قناة', 'رتبة/قناة يُسمح لها بالروابط (أضف `ازالة:True` للإزالة)']
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

// حد ديسكورد: 6000 حرف لكل الـEmbeds بالرسالة الوحدة — أوامر الإدارة برسالة ثانية
function buildHelp(showAdmin) {
  const config = loadConfig();
  const embed = eb
    .brand({
      tone: 'primary',
      title: '📖 أوامر بوت احسمها',
      description: 'كل الأوامر تبدأ بـ **/** — اكتب `/` بالشات وبتطلع لك القائمة.\nالخيارات بين < > مطلوبة، وبين [ ] اختيارية.\n\n' + USAGE_NOTE,
      thumbnail: config.logoUrl
    })
    .addFields(CATEGORIES.map((c) => eb.field(c.title, formatCategory(c), false)));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('زيارة الموقع').setEmoji('🌐').setURL(config.siteUrl),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('صفحة البروفايل').setEmoji('👤').setURL(config.profileUrl)
  );
  const main = { embeds: [embed], components: [row] };
  if (!showAdmin) return main;

  // أوامر الإدارة مقسّمة على رسائل كل وحدة تحت حد الـ6000 حرف
  const extra = [];
  let current = null;
  let size = 0;
  for (const c of ADMIN_CATEGORIES) {
    const value = formatCategory(c);
    const cost = c.title.length + value.length;
    if (!current || size + cost > 5000 || current.data.fields.length >= 25) {
      current = eb.brand({ tone: 'deep', title: '🛡️ أوامر الإدارة' + (extra.length ? ` (${extra.length + 1})` : '') });
      extra.push(current);
      size = 60;
    }
    current.addFields(eb.field(c.title, value, false));
    size += cost;
  }
  return { ...main, followUps: extra.map((e) => ({ embeds: [e] })) };
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
    const { followUps = [], ...main } = buildHelp(admin);
    await respond.send(interaction, main, { ephemeral: admin });
    for (const extra of followUps) {
      await interaction.followUp({ ...extra, flags: MessageFlags.Ephemeral }).catch((err) => logger.debug('help: تعذّر إرسال أوامر الإدارة', { code: err.code }));
    }
  },
  _internal: { buildHelp }
};
