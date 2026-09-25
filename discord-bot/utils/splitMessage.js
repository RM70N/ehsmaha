'use strict';

// تقسيم نص طويل لرسائل ديسكورد (حد 2000 حرف) بدون ما ينقص بنص سطر أو كلمة
// قدر الإمكان: فقرة ← سطر ← مسافة ← قص مباشر (آخر حل).

const DISCORD_LIMIT = 2000;

function splitMessage(text, max = DISCORD_LIMIT - 50) {
  const out = [];
  let rest = String(text || '').trim();
  while (rest.length > max) {
    const slice = rest.slice(0, max);
    let cut = slice.lastIndexOf('\n\n');
    if (cut < max * 0.5) cut = slice.lastIndexOf('\n');
    if (cut < max * 0.5) cut = slice.lastIndexOf(' ');
    if (cut < max * 0.3) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

module.exports = { splitMessage, DISCORD_LIMIT };
