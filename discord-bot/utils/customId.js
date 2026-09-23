'use strict';

// صيغة موحدة لـcustomId الأزرار: "prefix:arg1:arg2..." (حد Discord = 100 حرف).
// الأزرار "بلا حالة" (stateless): كل المعلومات اللازمة داخل الـcustomId نفسه،
// فتشتغل حتى بعد إعادة تشغيل البوت — ما نعتمد على collectors بالذاكرة.

const SEP = ':';

function build(prefix, ...args) {
  const id = [prefix, ...args.map((a) => String(a))].join(SEP);
  if (id.length > 100) throw new Error(`customId أطول من 100 حرف: ${id}`);
  return id;
}

function parse(customId) {
  const [prefix, ...args] = String(customId || '').split(SEP);
  return { prefix, args };
}

module.exports = { build, parse };
