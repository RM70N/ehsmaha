'use strict';

// محمّل الأوامر الديناميكي: يمشي على كل ملفات .js داخل /commands (وكل
// مجلداتها الفرعية) ويسجّلها تلقائياً — إضافة أمر جديد = إضافة ملف فقط، بدون
// لمس index.js أو deploy-commands.js.
//
// شكل ملف الأمر:
//   module.exports = {
//     data: new SlashCommandBuilder()...,   // أو مصفوفة builders لأسماء بديلة
//     execute: async (interaction, ctx) => {},
//     autocomplete: async (interaction, ctx) => {},                // اختياري
//     buttons: { 'prefix': async (interaction, args, ctx) => {} }, // اختياري
//     options: { cooldownMs, ephemeral, defer }                      // اختياري
//   };

const fs = require('node:fs');
const path = require('node:path');

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue; // ملفات مساعدة/مخفية
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out.sort();
}

/**
 * @returns {{ commands: Map<string, object>, buttons: Map<string, Function>, definitions: object[] }}
 */
function loadCommands(commandsDir = path.join(__dirname, '..', 'commands')) {
  const commands = new Map();
  const buttons = new Map();
  const definitions = [];

  for (const file of listJsFiles(commandsDir)) {
    const rel = path.relative(commandsDir, file);
    const mod = require(file);

    if (!mod || typeof mod.execute !== 'function' || !mod.data) {
      throw new Error(`ملف الأمر ${rel} لازم يصدّر data و execute`);
    }

    const builders = Array.isArray(mod.data) ? mod.data : [mod.data];
    for (const builder of builders) {
      const json = typeof builder.toJSON === 'function' ? builder.toJSON() : builder;
      if (!json || !json.name) throw new Error(`ملف الأمر ${rel} فيه أمر بلا اسم`);
      if (commands.has(json.name)) throw new Error(`اسم الأمر "${json.name}" مكرر (${rel})`);
      commands.set(json.name, { ...mod, name: json.name, file: rel });
      definitions.push(json);
    }

    for (const [prefix, handler] of Object.entries(mod.buttons || {})) {
      if (typeof handler !== 'function') throw new Error(`معالج الزر ${prefix} بـ${rel} لازم يكون دالة`);
      if (buttons.has(prefix)) throw new Error(`بادئة الزر "${prefix}" مكررة (${rel})`);
      buttons.set(prefix, handler);
    }
  }

  return { commands, buttons, definitions };
}

module.exports = { loadCommands };
