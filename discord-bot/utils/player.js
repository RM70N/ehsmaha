'use strict';

// أدوات مشتركة بين أوامر اللاعب (/بروفايل و /احصائيات):
// خيار "يوزر" الإلزامي، رسالة "لم يتم العثور"، والاقتراحات أثناء الكتابة.

const api = require('./apiClient');
const eb = require('./embedBuilder');
const cache = require('./cache');
const logger = require('./logger');

const OPTION_NAME = 'يوزر';
const MAX_LENGTH = 64;

// يضيف خيار "يوزر" (نص، مطلوب، مع Autocomplete) لأي أمر
function addUsernameOption(builder, description) {
  return builder.addStringOption((o) =>
    o
      .setName(OPTION_NAME)
      .setDescription(description)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(MAX_LENGTH)
      .setAutocomplete(true)
  );
}

// يقرأ اليوزرنيم وينظّفه للعرض (البحث الفعلي case-insensitive بالسيرفر)
function readUsername(interaction) {
  return String(interaction.options.getString(OPTION_NAME, true) || '')
    .normalize('NFC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .trim()
    .replace(/^@+/, '');
}

function notFoundPayload(username) {
  return {
    embeds: [
      eb.warning(
        'لم يتم العثور على لاعب بهذا الاسم، تأكد من كتابته بشكل صحيح كما هو مسجل بالموقع' +
          (username ? `\n\n🔎 اليوزر المكتوب: \`${eb.clip(username.replace(/`/g, ''), 64)}\`` : '') +
          '\n💡 اختر الاسم من الاقتراحات اللي تطلع أثناء الكتابة لتفادي الأخطاء الإملائية.',
        '🔍 لاعب غير موجود'
      )
    ]
  };
}

// اقتراحات الأسماء أثناء الكتابة. Discord يعطينا 3 ثوانٍ فقط، والفشل هنا ما
// يمنع استخدام الأمر: لو الـAPI بطيء أو طايح نرجّع قائمة فاضية بهدوء.
async function autocompleteUsernames(interaction) {
  const focused = String(interaction.options.getFocused() || '').trim().replace(/^@+/, '').toLowerCase();
  let choices = [];
  if (focused) {
    try {
      const data = await cache.remember(`ac:${focused}`, 60, () => api.searchUsernames(focused, 20));
      choices = (data.results || [])
        .filter((r) => r && r.value && String(r.value).length <= 100)
        .slice(0, 25)
        .map((r) => ({ name: eb.clip(r.registered ? `👤 ${r.label}` : `🎮 ${r.label}`, 100), value: String(r.value) }));
    } catch (err) {
      logger.debug('autocomplete failed', { code: err.code });
    }
  }
  try {
    await interaction.respond(choices);
  } catch (err) {
    logger.debug('autocomplete respond failed (غالباً انتهت المهلة)', { code: err.code });
  }
}

module.exports = { OPTION_NAME, addUsernameOption, readUsername, notFoundPayload, autocompleteUsernames };
