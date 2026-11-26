'use strict';

// صورة البوت نفسه بديسكورد (الأفتار): تتزامن تلقائياً مع assets/bot-avatar.png (الشعار الحالي).
// عند كل تشغيل: لو بصمة الملف غير اللي طبّقناها آخر مرة ← نحدّث الصورة (مرة وحدة لكل تغيير؛ ديسكورد يحدّد ~2 تغيير بالساعة).
// BOT_AVATAR_SYNC=off للإيقاف. ما يرمي أبداً.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const logger = require('../utils/logger');

const FILE = path.join(__dirname, '..', 'assets', 'bot-avatar.png');
const stateFile = () => path.join(process.env.BOT_DATA_DIR || path.join(__dirname, '..', 'data'), 'bot-avatar.sha1');

const enabled = () => !/^(false|0|no|off)$/i.test(String(process.env.BOT_AVATAR_SYNC || 'on').trim());

function readState() {
  try {
    return fs.readFileSync(stateFile(), 'utf8').trim();
  } catch {
    return '';
  }
}
function writeState(v) {
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), v);
  } catch (err) {
    logger.warn('🖼️ تعذّر حفظ حالة صورة البوت', { error: err && err.message });
  }
}

/** @returns {Promise<'updated'|'unchanged'|'disabled'|'missing'|'failed'>} */
async function sync(client, { file = FILE } = {}) {
  try {
    if (!enabled()) return 'disabled';
    if (!client || !client.user) return 'failed';
    if (!fs.existsSync(file)) return 'missing';
    const buf = fs.readFileSync(file);
    const sha = crypto.createHash('sha1').update(buf).digest('hex');
    if (readState() === sha) return 'unchanged';
    await client.user.setAvatar(buf);
    writeState(sha);
    logger.info('🖼️ تم تحديث صورة البوت بديسكورد (الشعار الجديد)', { bytes: buf.length });
    return 'updated';
  } catch (err) {
    // غالباً حد التغيير (rate limit) — نعيد المحاولة بالتشغيل الجاي
    logger.warn('🖼️ تعذّر تحديث صورة البوت', { code: err && err.code, error: err && err.message });
    return 'failed';
  }
}

module.exports = { sync, FILE };
