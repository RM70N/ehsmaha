'use strict';

// هوية البوت أثناء التشغيل: اسم البوت **داخل السيرفر** (nickname) = اسم الأغنية الحالية.
// ليش nickname وليس اسم الحساب؟ اسم/صورة الحساب عام لكل السيرفرات ومحدود بمرتين بالساعة تقريباً — يخرّب هوية البوت
// ويتعارض لو في أكثر من سيرفر يشغّل موسيقى. الـnickname خاص بكل سيرفر. صورة البوت ما نغيّرها (نفس السبب) —
// صورة الأغنية تظهر بلوحة التحكم. الاسم الأصلي يُحفظ بقاعدة البيانات ويُسترجع عند الخروج وحتى بعد إعادة تشغيل البوت.

const { PermissionFlagsBits } = require('discord.js');
const store = require('../database/botStore');
const logger = require('../utils/logger');
const { getMusicConfig } = require('./MusicConfig');

const KEY = 'music_nickname_original'; // { original: string|null }
const lastApplied = new Map(); // guildId -> { value, at, timer, pending }

function canChange(guild) {
  const me = guild && guild.members && guild.members.me;
  return !!(me && me.permissions && me.permissions.has(PermissionFlagsBits.ChangeNickname) && me.manageable !== false);
}

async function setNick(guild, nick) {
  const me = guild.members.me;
  await me.setNickname(nick, 'احسمها: الأغنية الحالية');
}

/** يطبّق اسم الأغنية (بحد أدنى بين كل تغييرين لتجنّب Rate Limit). آمن: أي فشل يُتجاهل. */
async function apply(guild, title) {
  const cfg = getMusicConfig();
  if (!cfg.nickname || !canChange(guild)) return false;
  const wanted = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 32) || null;
  if (!wanted) return false;
  const state = lastApplied.get(guild.id) || { value: null, at: 0, timer: null, pending: null };
  lastApplied.set(guild.id, state);
  if (state.value === wanted) return true;
  const gap = cfg.nicknameMinIntervalSeconds * 1000;
  const wait = state.at + gap - Date.now();
  const run = async () => {
    state.timer = null;
    const v = state.pending;
    state.pending = null;
    if (!v || v === state.value) return;
    try {
      if (state.value === null) {
        const original = guild.members.me.nickname || null;
        await store.guildConfig.set(guild.id, KEY, { original }, 'music').catch(() => {});
      }
      await setNick(guild, v);
      state.value = v;
      state.at = Date.now();
    } catch (err) {
      logger.debug('🎵 تعذّر تغيير اسم البوت', { guildId: guild.id, error: err && err.message });
    }
  };
  state.pending = wanted;
  if (wait <= 0) {
    await run();
  } else if (!state.timer) {
    state.timer = setTimeout(run, wait);
    if (typeof state.timer.unref === 'function') state.timer.unref();
  }
  return true;
}

/** يرجّع الاسم الأصلي (آخر الجلسة / عند تشغيل البوت بعد توقف مفاجئ). */
async function restore(guild) {
  const state = lastApplied.get(guild.id);
  if (state && state.timer) clearTimeout(state.timer);
  lastApplied.delete(guild.id);
  let saved;
  try {
    saved = await store.guildConfig.get(guild.id, KEY, null);
  } catch {
    return false;
  }
  if (!saved || typeof saved !== 'object') return false;
  if (canChange(guild)) {
    try {
      await setNick(guild, saved.original || null);
    } catch (err) {
      logger.debug('🎵 تعذّر استرجاع اسم البوت', { guildId: guild.id, error: err && err.message });
      return false;
    }
  }
  await store.guildConfig.set(guild.id, KEY, null, 'music').catch(() => {});
  return true;
}

async function restoreAll(client) {
  let n = 0;
  for (const guild of client.guilds.cache.values()) if (await restore(guild).catch(() => false)) n++;
  return n;
}

module.exports = { apply, restore, restoreAll, _internal: { lastApplied, KEY } };
