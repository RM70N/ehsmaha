'use strict';

// تسجيل/تحديث أوامر Slash عند Discord.
//
//   npm run deploy-commands          → عالمياً (كل السيرفرات، قد يأخذ حتى ساعة ليظهر)
//   npm run deploy-commands:guild    → سيرفر التطوير فقط (GUILD_ID) — يظهر فوراً
//   npm run clear-commands:guild     → يمسح أوامر سيرفر التطوير (لتجنّب التكرار مع العالمية)
//
// يقرأ الأوامر من نفس المحمّل الديناميكي اللي يستخدمه البوت، فأي ملف جديد
// بـ/commands ينسجل تلقائياً.

const { REST, Routes } = require('discord.js');
const { loadConfig } = require('./config');
const { loadCommands } = require('./utils/commandLoader');

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error('\n❌ ' + err.message + '\n');
    process.exit(1);
  }

  const args = new Set(process.argv.slice(2));
  const toGuild = args.has('--guild');
  const clear = args.has('--clear');

  if (toGuild && !config.guildId) {
    console.error('❌ --guild يحتاج GUILD_ID بملف .env');
    process.exit(1);
  }

  const { definitions } = loadCommands();
  const body = clear ? [] : definitions;
  const rest = new REST({ version: '10', timeout: 15_000 }).setToken(config.token);
  const route = toGuild
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  const scope = toGuild ? `سيرفر ${config.guildId}` : 'عالمياً';
  console.log(`⏳ ${clear ? 'مسح' : 'تسجيل'} ${body.length} أمر ${scope}...`);

  try {
    // PUT يستبدل القائمة كاملة: الأوامر المحذوفة من /commands تنمسح من Discord أيضاً
    const result = await rest.put(route, { body });
    console.log(`✅ تم ${clear ? 'المسح' : 'التسجيل'} ${scope}: ${result.length} أمر`);
    for (const cmd of result) console.log(`   • /${cmd.name}`);
    if (!toGuild && !clear) console.log('ℹ️  الأوامر العالمية قد تأخذ بعض الوقت لتظهر بكل السيرفرات.');
  } catch (err) {
    console.error('❌ فشل التسجيل:', err.status || '', err.message);
    if (err.status === 401) console.error('   → DISCORD_TOKEN غير صحيح');
    if (err.status === 403 || err.code === 50001) console.error('   → البوت غير موجود بالسيرفر أو ينقصه scope applications.commands');
    process.exit(1);
  }
}

main();
