'use strict';

// كتم كتابي (مو Timeout السيرفر): يمنع العضو من الكتابة **بالروم اللي صار فيه السبام فقط** عبر صلاحيات الروم
// (SendMessages + الثريدات)، ويبقى يقدر يسمع/يتكلم بالصوت ويشوف ويتفاعل. ينفك تلقائياً بعد المدة حتى لو البوت انعاد تشغيله
// (المدة محفوظة بجدول text_mutes). يرجّع الصلاحيات لوضعها الأصلي: لو ما كان للعضو تخصيص بالروم يُحذف، وإلا يرجع "موروث".

const { PermissionFlagsBits } = require('discord.js');
const db = require('../database/botDb');
const logger = require('../utils/logger');

const DENY = { SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false, CreatePrivateThreads: false };
const SWEEP_MS = 30 * 1000;
let timer = null;
let clientRef = null;

const baseChannel = (channel) => (channel && typeof channel.isThread === 'function' && channel.isThread() ? channel.parent : channel);

/** @returns {Promise<boolean>} true لو انطبق الكتم */
async function apply(member, channel, durationMs, reason = 'كتم كتابي (حماية تلقائية)') {
  try {
    const target = baseChannel(channel);
    if (!target || !target.permissionOverwrites || typeof target.permissionOverwrites.edit !== 'function') return false;
    const me = member.guild.members.me;
    const perms = target.permissionsFor ? target.permissionsFor(me) : null;
    if (!perms || !perms.has(PermissionFlagsBits.ManageRoles)) {
      logger.warn('الكتم الكتابي: البوت ناقصه صلاحية «إدارة الصلاحيات» بالروم', { guildId: member.guild.id, channelId: target.id });
      return false;
    }
    const existing = target.permissionOverwrites.cache && target.permissionOverwrites.cache.get(member.id);
    const prev = await db.query('SELECT had_overwrite FROM text_mutes WHERE guild_id = ? AND channel_id = ? AND user_id = ?', [member.guild.id, target.id, member.id]).catch(() => []);
    const had = prev[0] ? Number(prev[0].had_overwrite) : existing ? 1 : 0; // لو انكتم قبل ما نحافظ على الأصل
    await target.permissionOverwrites.edit(member.id, DENY, { reason });
    const until = Date.now() + durationMs;
    await db.run(
      `INSERT INTO text_mutes (guild_id, channel_id, user_id, until_at, had_overwrite) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, channel_id, user_id) DO UPDATE SET until_at = excluded.until_at`,
      [member.guild.id, target.id, member.id, until, had]
    );
    return true;
  } catch (err) {
    logger.error('الكتم الكتابي: فشل التطبيق', { guildId: member.guild && member.guild.id, code: err && err.code, error: err && err.message });
    return false;
  }
}

async function release(row, client = clientRef) {
  try {
    const guild = client && client.guilds.cache.get(row.guild_id);
    const channel = guild && (guild.channels.cache.get(row.channel_id) || (await guild.channels.fetch(row.channel_id).catch(() => null)));
    if (channel && channel.permissionOverwrites) {
      if (Number(row.had_overwrite)) {
        await channel.permissionOverwrites.edit(row.user_id, { SendMessages: null, SendMessagesInThreads: null, CreatePublicThreads: null, CreatePrivateThreads: null }, { reason: 'انتهى الكتم الكتابي' });
      } else if (typeof channel.permissionOverwrites.delete === 'function') {
        await channel.permissionOverwrites.delete(row.user_id, 'انتهى الكتم الكتابي');
      }
    }
  } catch (err) {
    logger.warn('الكتم الكتابي: تعذّر فك الصلاحية (نحاول لاحقاً)', { code: err && err.code });
    return false;
  }
  await db.run('DELETE FROM text_mutes WHERE guild_id = ? AND channel_id = ? AND user_id = ?', [row.guild_id, row.channel_id, row.user_id]).catch(() => null);
  return true;
}

/** يفك كل كتم انتهى وقته. @returns {Promise<number>} */
async function sweep(client = clientRef, now = Date.now()) {
  let n = 0;
  try {
    const rows = await db.query('SELECT * FROM text_mutes WHERE until_at <= ?', [now]);
    for (const r of rows) if (await release(r, client)) n += 1;
  } catch (err) {
    logger.debug('الكتم الكتابي: فشل الفحص الدوري', { error: err && err.message });
  }
  return n;
}

function start(client) {
  clientRef = client;
  stop();
  timer = setInterval(() => sweep(client), SWEEP_MS);
  if (timer.unref) timer.unref();
  sweep(client).catch(() => null); // يفك اللي انتهى وقته أثناء ما كان البوت مطفي
}
function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { apply, sweep, start, stop, DENY };
