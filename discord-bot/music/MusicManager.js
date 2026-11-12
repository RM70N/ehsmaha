'use strict';

// مدير الموسيقى: جلسة مستقلة لكل سيرفر، والتحقق من المستخدم/الروم، وتحويل المدخلات (اسم/رابط) إلى أغنية جاهزة.
// يرجع payloads جاهزة للإرسال (embeds/components) — الإرسال نفسه مسؤولية الأمر/الحدث (Slash أو !prefix).

const crypto = require('node:crypto');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');
const extractorDefault = require('./MusicExtractor');
const { MusicPlayer } = require('./MusicPlayer');
const { QueueError } = require('./MusicQueue');
const embeds = require('./MusicEmbeds');
const identity = require('./MusicIdentity');
const { getMusicConfig } = require('./MusicConfig');

const { MusicError } = extractorDefault;
const NEED_VOICE = 'ادخل روم صوتي أول، وبعدها أقدر أشغل لك الأغنية';

class MusicManager {
  constructor({ deps = {} } = {}) {
    this.deps = deps;
    this.extractor = deps.extractor || extractorDefault;
    this.sessions = new Map(); // guildId -> MusicPlayer
    this.creating = new Map(); // guildId -> Promise (يمنع جلستين لنفس السيرفر)
    this.searches = new Map(); // token -> { userId, guildId, query, results, expiresAt }
  }

  getSession(guildId) {
    const s = this.sessions.get(guildId);
    return s && !s.destroyed ? s : null;
  }

  // ---------------------------------------------------------------- فحص المستخدم والروم

  /** يتأكد العضو داخل روم صوتي صالح، والبوت يقدر يدخله، ولا فيه جلسة بروم ثاني. */
  checkUserContext({ guild, member }) {
    const cfg = getMusicConfig();
    if (!cfg.enabled) return { ok: false, payload: embeds.notice('نظام الموسيقى متوقف حالياً.') };
    const channel = member && member.voice && member.voice.channel;
    if (!channel) return { ok: false, payload: embeds.notice(`${NEED_VOICE}.`, '🎧 ادخل روم صوتي') };
    if (![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) {
      return { ok: false, payload: embeds.notice('ما أقدر أشغّل موسيقى بهذا النوع من الرومات.') };
    }
    if (channel.type === ChannelType.GuildStageVoice) return { ok: false, payload: embeds.notice('رومات المنصة (Stage) غير مدعومة — ادخل روم صوتي عادي.') };
    const session = this.getSession(guild.id);
    if (session && session.voiceChannelId !== channel.id) {
      return {
        ok: false,
        payload: embeds.notice(`فيه جلسة موسيقى نشطة حالياً بالروم <#${session.voiceChannelId}> — ادخل نفس الروم أو انتظر لين تخلص.`, '🎵 جلسة موسيقى نشطة')
      };
    }
    if (!session) {
      const me = guild.members && guild.members.me;
      const perms = me && channel.permissionsFor ? channel.permissionsFor(me) : null;
      const need = [
        ['Connect', PermissionFlagsBits.Connect],
        ['Speak', PermissionFlagsBits.Speak],
        ['ViewChannel', PermissionFlagsBits.ViewChannel]
      ];
      const missing = perms ? need.filter(([, bit]) => !perms.has(bit)).map(([n]) => n) : [];
      if (missing.length) return { ok: false, payload: embeds.failure(`ما عندي صلاحيات كافية بالروم <#${channel.id}>: ${missing.join('، ')}`, '🔒 صلاحيات ناقصة') };
      if (channel.full && !(channel.members && channel.members.has && channel.members.has(me.id))) {
        return { ok: false, payload: embeds.failure('الروم الصوتي ممتلئ.', '🔒 الروم ممتلئ') };
      }
    }
    return { ok: true, voiceChannel: channel, session };
  }

  // ---------------------------------------------------------------- الطلب

  /**
   * طلب تشغيل (اسم أو رابط).
   * @returns {Promise<{kind:'search'|'added'|'error', payload:object}>}
   */
  async requestPlay({ guild, member, textChannel, input }) {
    const ctx = this.checkUserContext({ guild, member });
    if (!ctx.ok) return { kind: 'error', payload: ctx.payload };

    const c = this.extractor.classify(input);
    try {
      if (c.type === 'error') return { kind: 'error', payload: embeds.failure(c.message, '🔗 رابط غير مدعوم') };
      if (c.type === 'query') {
        const results = await this.extractor.search(c.query, getMusicConfig().searchResults);
        const token = this._storeSearch({ userId: member.id, guildId: guild.id, query: c.query, results });
        return { kind: 'search', payload: embeds.searchPayload(c.query, results, token) };
      }
      const track = c.type === 'youtube' ? await this.extractor.getInfo(c.url) : await this.extractor.fromSpotify(c.url);
      const payload = await this.playTrack({ guild, member, textChannel, track, voiceChannel: ctx.voiceChannel });
      return { kind: 'added', payload };
    } catch (err) {
      return { kind: 'error', payload: this._errorPayload(err) };
    }
  }

  _errorPayload(err) {
    if (err instanceof QueueError) {
      return embeds.notice(err.code === 'FULL' ? `${err.message} — انتظر تخلص بعض الأغاني.` : 'هذي الأغنية انطلبت قبل قليل — انتظر شوي قبل ما تعيدها.');
    }
    if (err instanceof MusicError) return embeds.failure(err.message);
    logger.error('🎵 خطأ غير متوقع بالموسيقى', { error: err });
    return embeds.failure('حصل خطأ غير متوقع — جرّب مرة ثانية.');
  }

  _storeSearch(s) {
    const now = Date.now();
    for (const [k, v] of this.searches) if (v.expiresAt < now) this.searches.delete(k);
    const token = crypto.randomBytes(4).toString('hex');
    this.searches.set(token, { ...s, expiresAt: now + getMusicConfig().searchTtlSeconds * 1000 });
    return token;
  }

  /** اختيار نتيجة بحث. */
  async selectSearch({ token, index, guild, member, textChannel }) {
    const s = this.searches.get(token);
    if (!s || s.expiresAt < Date.now()) {
      this.searches.delete(token);
      return { kind: 'error', payload: embeds.notice('انتهت صلاحية نتائج البحث — ابحث من جديد بـ`/اغنية`.') };
    }
    if (s.userId !== member.id) return { kind: 'error', payload: embeds.notice('هذي نتائج بحث شخص ثاني — ابحث بنفسك بـ`/اغنية`.') };
    const track = s.results[index];
    if (!track) return { kind: 'error', payload: embeds.notice('اختيار غير صالح.') };
    const ctx = this.checkUserContext({ guild, member });
    if (!ctx.ok) return { kind: 'error', payload: ctx.payload };
    this.searches.delete(token);
    try {
      const payload = await this.playTrack({ guild, member, textChannel, track: { ...track }, voiceChannel: ctx.voiceChannel });
      return { kind: 'added', payload };
    } catch (err) {
      return { kind: 'error', payload: this._errorPayload(err) };
    }
  }

  cancelSearch(token, userId) {
    const s = this.searches.get(token);
    if (s && s.userId === userId) this.searches.delete(token);
    return !!s;
  }

  // ---------------------------------------------------------------- التشغيل

  async playTrack({ guild, member, textChannel, track, voiceChannel }) {
    track.requestedBy = { id: member.id, name: member.displayName || (member.user && member.user.username) || 'عضو' };
    // جلسة جديدة تُنشأ مرة وحدة حتى لو وصل طلبان بنفس اللحظة
    while (this.creating.has(guild.id)) await this.creating.get(guild.id).catch(() => {});
    let session = this.getSession(guild.id);
    if (session) {
      const r = await session.enqueue(track);
      return embeds.added(track, r);
    }
    const create = (async () => {
      // نجهّز مصدر الصوت قبل الدخول: ما ندخل الروم لأغنية ما تشتغل أصلاً
      track._stream = await this.extractor.resolveStream(track);
      const s = new MusicPlayer({
        guild,
        voiceChannel,
        textChannel,
        deps: this.deps.player,
        onDestroy: (gid) => {
          if (this.sessions.get(gid) === s) this.sessions.delete(gid);
        }
      });
      this.sessions.set(guild.id, s);
      try {
        await s.join();
        const r = await s.enqueue(track);
        return { s, r };
      } catch (err) {
        await s.destroy('start-failed').catch(() => {});
        this.sessions.delete(guild.id);
        throw err;
      }
    })();
    this.creating.set(guild.id, create);
    try {
      const { r } = await create;
      return embeds.added(track, r);
    } finally {
      this.creating.delete(guild.id);
    }
  }

  // ---------------------------------------------------------------- عام

  async destroyAll(reason = 'shutdown') {
    const all = [...this.sessions.values()];
    await Promise.allSettled(all.map((s) => s.destroy(reason)));
    this.sessions.clear();
    this.searches.clear();
    return all.length;
  }

  stats() {
    return { sessions: this.sessions.size, searches: this.searches.size };
  }

  async restoreNicknames(client) {
    return identity.restoreAll(client);
  }
}

let instance = null;
function getManager() {
  if (!instance) instance = new MusicManager();
  return instance;
}
function _setManager(m) {
  instance = m;
}

module.exports = { MusicManager, getManager, _setManager, NEED_VOICE };
