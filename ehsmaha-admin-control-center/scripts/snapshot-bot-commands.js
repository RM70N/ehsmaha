// يولّد لقطة سجل أوامر البوت (قراءة فقط من ملفات البوت) لاستعمالها حين لا توجد ملفات البوت على خادم اللوحة.
// الاستعمال: node scripts/snapshot-bot-commands.js ../discord-bot
import fs from 'node:fs'; import path from 'node:path';
import { scanBotCommands } from '../server/adapters/botRegistry.js';
const dir = path.resolve(process.argv[2] || '../discord-bot');
const r = scanBotCommands(dir); if (!r.available || r.snapshot) { console.error('لا توجد ملفات أوامر في', dir); process.exit(1); }
const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../server/data/bot-commands.json');
fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), commands: r.commands, unparsed: r.unparsed }, null, 1));
console.log('wrote', out, r.commands.length, 'commands');
