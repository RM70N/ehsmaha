'use strict';

// جلسة موسيقى واحدة لسيرفر واحد: اتصال صوتي + مشغّل + قائمة + FFmpeg + لوحة التحكم.
// • الصوت: yt-dlp يعطي رابط المصدر ← ffmpeg (-ss للتقديم/الترجيع) ← Ogg/Opus ← @discordjs/voice (بدون إعادة ترميز بالجافاسكربت).
// • كل العمليات تمر من طابور متسلسل (_run) فما يتعارض زرّان/أمران بنفس اللحظة.
// • لا نعلن "يعمل" قبل ما يطلع صوت فعلي من ffmpeg ويدخل المشغّل حالة Playing.

const { spawn } = require('node:child_process');
const voiceLib = require('@discordjs/voice');
const logger = require('../utils/logger');
const extractorDefault = require('./MusicExtractor');
const { MusicQueue } = require('./MusicQueue');
const embeds = require('./MusicEmbeds');
const identity = require('./MusicIdentity');
const { getMusicConfig } = require('./MusicConfig');

const { MusicError } = extractorDefault;
const STREAM_TTL_MS = 20 * 60 * 1000; // إعادة استخدام رابط الصوت للتقديم/الترجيع، وبعدها نحلّه من جديد
const FIRST_AUDIO_TIMEOUT_MS = 25_000;
const MAX_STDERR = 2000;

class MusicPlayer {
  /**
   * @param {object} o
   * @param {import('discord.js').Guild} o.guild
   * @param {import('discord.js').VoiceBasedChannel} o.voiceChannel
   * @param {import('discord.js').TextBasedChannel} o.textChannel
   * @param {Function} [o.onDestroy] (guildId, reason) => void
   * @param {object} [o.deps] { voice, extractor, spawn } — للاختبارات
   */
  constructor({ guild, voiceChannel, textChannel, onDestroy, deps = {} }) {
    const cfg = getMusicConfig();
    this.cfg = cfg;
    this.guild = guild;
    this.guildId = guild.id;
    this.voiceChannelId = voiceChannel.id;
    this.voiceChannelName = voiceChannel.name;
    this.textChannel = textChannel;
    this.onDestroy = onDestroy || (() => {});
    this.voice = deps.voice || voiceLib;
    this.extractor = deps.extractor || extractorDefault;
    this.spawn = deps.spawn || spawn;
    this.queue = new MusicQueue({ maxSize: cfg.maxQueue, duplicateWindowMs: cfg.duplicateWindowSeconds * 1000 });
    this.status = 'idle'; // idle | loading | playing | paused | ended | stopped
    this.connection = null;
    this.player = null;
    this.resource = null;
    this.proc = null;
    this.offsetMs = 0;
    this.gen = 0; // يزيد مع كل بداية تشغيل — يلغي أحداث الموارد القديمة
    this.retries = 0;
    this.panelMessage = null;
    this.panelFailures = 0;
    this.lastPanelAt = 0;
    this.panelTimer = null;
    this.refreshTimer = null;
    this.idleTimer = null;
    this.emptyTimer = null;
    this.pauseTimer = null;
    this.destroyed = false;
    this._chain = Promise.resolve();
    this._pending = 0;
    this.createdAt = Date.now();
    this.stats = { played: 0, skipped: 0, failed: 0 };
  }

  // ------------------------------------------------------------------ تسلسل العمليات

  /** ينفّذ fn بعد ما تخلص العمليات السابقة. rejectIfBusy: يرفض فوراً لو فيه عملية جارية (للأزرار). */
  _run(fn, { rejectIfBusy = false } = {}) {
    if (rejectIfBusy && this._pending > 0) return Promise.reject(new MusicError('BUSY', 'العملية السابقة لسا تتنفّذ — جرّب بعد ثانية.'));
    this._pending++;
    const p = this._chain.then(fn).finally(() => {
      this._pending--; // قبل ما يرجع للمستدعي: وإلا ضغطة سريعة بعدها تنرفض بالغلط
    });
    this._chain = p.catch(() => {});
    return p;
  }

  // ------------------------------------------------------------------ الاتصال الصوتي

  async join() {
    if (this.connection) return;
    const { VoiceConnectionStatus, entersState, createAudioPlayer, NoSubscriberBehavior, joinVoiceChannel } = this.voice;
    this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    this.player.on('stateChange', (oldS, newS) => this._onPlayerState(oldS, newS));
    this.player.on('error', (err) => this._onPlayerError(err));
    const connection = joinVoiceChannel({
      channelId: this.voiceChannelId,
      guildId: this.guildId,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false
    });
    this.connection = connection;
    connection.on('error', (err) => logger.warn('🎵 خطأ اتصال صوتي', { guildId: this.guildId, error: err && err.message }));
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      if (this.destroyed) return;
      try {
        // إما ينتقل البوت لروم ثاني (نكمل) أو ينقطع فعلاً → نحاول إعادة الاتصال
        await Promise.race([entersState(connection, VoiceConnectionStatus.Signalling, 5_000), entersState(connection, VoiceConnectionStatus.Connecting, 5_000)]);
      } catch {
        this.destroy('disconnected').catch(() => {});
      }
    });
    connection.on(VoiceConnectionStatus.Destroyed, () => {
      if (!this.destroyed) this.destroy('connection-destroyed').catch(() => {});
    });
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (err) {
      await this.destroy('join-failed');
      throw new MusicError('VOICE_FAILED', 'ما قدرت أدخل الروم الصوتي — تأكد إن عندي صلاحية الاتصال (Connect) والتحدث (Speak) بالروم.', { cause: err });
    }
    connection.subscribe(this.player);
  }

  // ------------------------------------------------------------------ الطلبات

  /** يضيف أغنية: تبدأ فوراً لو ما فيه شي يعمل، وإلا تنضاف للقائمة. */
  enqueue(track) {
    return this._run(async () => {
      this._assertAlive();
      this._clearIdleTimer();
      if (!this.queue.current) {
        this.queue.setCurrent(track);
        try {
          await this._startCurrent(0);
        } catch (err) {
          this.queue.current = null;
          this.stats.failed++;
          if (!this.queue.upcoming.length) {
            this.status = 'ended';
            this._startIdleTimer(this.cfg.idleLeaveSeconds * 1000, 'start-failed');
          }
          throw err;
        }
        return { position: 0, startedNow: true };
      }
      const position = this.queue.add(track);
      this.refreshPanel();
      return { position, startedNow: false };
    });
  }

  _assertAlive() {
    if (this.destroyed) throw new MusicError('SESSION_ENDED', 'انتهت جلسة الموسيقى — اطلب أغنية من جديد.');
  }

  // ------------------------------------------------------------------ التشغيل الفعلي

  async _getStream(track, { force = false } = {}) {
    const cached = track._stream;
    if (!force && cached && Date.now() - cached.resolvedAt < STREAM_TTL_MS) return cached;
    track._stream = await this.extractor.resolveStream(track);
    return track._stream;
  }

  _spawnFfmpeg(stream, seekMs) {
    const a = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
    if (/^https?:/i.test(stream.url)) {
      a.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
      const h = stream.headers || {};
      const ua = h['User-Agent'] || h['user-agent'];
      if (ua) a.push('-user_agent', String(ua));
      const rest = Object.entries(h)
        .filter(([k]) => !/^user-agent$/i.test(k) && /^[A-Za-z0-9-]+$/.test(k))
        .map(([k, v]) => `${k}: ${String(v).replace(/[\r\n]/g, '')}\r\n`)
        .join('');
      if (rest) a.push('-headers', rest);
    }
    if (seekMs > 0) a.push('-ss', (seekMs / 1000).toFixed(3));
    a.push('-i', stream.url, '-vn', '-map', '0:a:0', '-c:a', 'libopus', '-b:a', this.cfg.bitrate, '-ar', '48000', '-ac', '2', '-application', 'audio', '-frame_duration', '20', '-f', 'ogg', 'pipe:1');
    return this.spawn(this.cfg.ffmpegPath, a, { stdio: ['ignore', 'pipe', 'pipe'] });
  }

  _killProc(proc) {
    if (!proc) return;
    try {
      proc.stdout && proc.stdout.destroy();
      if (proc.exitCode === null && !proc.killed) proc.kill('SIGKILL');
    } catch {
      /* العملية انتهت أصلاً */
    }
  }

  /** ينتظر أول صوت فعلي من ffmpeg (أو فشله). يرجع الـproc لو سليم. */
  _waitFirstAudio(proc) {
    return new Promise((resolve, reject) => {
      let stderr = '';
      let settled = false;
      const done = (fn, v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(v);
      };
      const timer = setTimeout(() => done(reject, Object.assign(new Error('timeout'), { stderr })), FIRST_AUDIO_TIMEOUT_MS);
      proc.stderr && proc.stderr.on('data', (d) => {
        if (stderr.length < MAX_STDERR) stderr += d;
      });
      const onReadable = () => {
        // EOF بدون بيانات يطلق 'readable' كمان — ما نعتبره نجاح؛ 'close' بعده يرفض
        if (proc.stdout.readableLength > 0) {
          proc.stdout.removeListener('readable', onReadable);
          done(resolve, proc);
        }
      };
      proc.stdout.on('readable', onReadable);
      proc.once('error', (e) => done(reject, Object.assign(e, { stderr })));
      proc.once('close', (code) => {
        if (!settled) done(reject, Object.assign(new Error(`ffmpeg exit ${code}`), { stderr }));
      });
    });
  }

  /**
   * يبدأ تشغيل الأغنية الحالية من seekMs. يرمي MusicError عند الفشل (بدون ما يعلن نجاح وهمي).
   * يُستدعى دايماً من داخل _run.
   */
  async _startCurrent(seekMs = 0) {
    const track = this.queue.current;
    if (!track) throw new MusicError('EMPTY', 'ما فيه أغنية للتشغيل.');
    const { createAudioResource, StreamType, entersState, AudioPlayerStatus } = this.voice;
    const wasPaused = this.status === 'paused';
    this.status = 'loading';
    this.refreshPanel({ force: true });

    let proc = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 2 && !proc; attempt++) {
      const stream = await this._getStream(track, { force: attempt > 0 });
      const candidate = this._spawnFfmpeg(stream, seekMs);
      try {
        await this._waitFirstAudio(candidate);
        proc = candidate;
      } catch (err) {
        lastErr = err;
        this._killProc(candidate);
        logger.warn('🎵 ffmpeg ما أنتج صوت', { guildId: this.guildId, attempt, detail: String(err.stderr || err.message).slice(0, 300) });
      }
    }
    if (!proc) throw new MusicError('EXTRACT_FAILED', 'تعذّر قراءة الصوت من المصدر — جرّب أغنية ثانية.', { cause: lastErr });
    if (this.destroyed) {
      this._killProc(proc);
      throw new MusicError('SESSION_ENDED', 'انتهت الجلسة.');
    }

    const old = this.proc;
    const gen = ++this.gen;
    const resource = createAudioResource(proc.stdout, { inputType: StreamType.OggOpus, inlineVolume: false });
    this.proc = proc;
    this.resource = resource;
    this.offsetMs = seekMs;
    proc.once('close', () => {
      // انتهى ffmpeg مبكراً بعد ما بدأ (انقطاع المصدر) — المشغّل نفسه يكتشف نهاية الستريم ويعالجها في _onTrackEnd
      if (this.proc === proc) this.proc = null;
    });
    this.player.play(resource);
    this._killProc(old);
    try {
      await entersState(this.player, AudioPlayerStatus.Playing, 10_000);
    } catch (err) {
      this._killProc(proc);
      this.resource = null;
      throw new MusicError('EXTRACT_FAILED', 'المشغّل ما بدأ الصوت — جرّب مرة ثانية.', { cause: err });
    }
    if (gen !== this.gen) return; // انتهت/تبدلت أثناء الانتظار
    this.retries = seekMs === 0 ? 0 : this.retries;
    this.status = 'playing';
    if (wasPaused) {
      // التقديم/الترجيع أثناء الإيقاف المؤقت: نرجّع الإيقاف بعد ما يتحدد الموضع
      this.player.pause(true);
      this.status = 'paused';
    } else {
      this._clearPauseTimer();
    }
    if (seekMs === 0) this.stats.played++;
    this.refreshPanel({ force: true });
    this._startRefreshLoop();
    if (this.cfg.nickname) identity.apply(this.guild, track.title).catch(() => {});
  }

  positionMs() {
    if (!this.resource) return this.offsetMs;
    return this.offsetMs + (this.resource.playbackDuration || 0);
  }

  // ------------------------------------------------------------------ أحداث المشغّل

  _onPlayerState(oldS, newS) {
    const { AudioPlayerStatus } = this.voice;
    if (newS.status === AudioPlayerStatus.Idle && oldS.status !== AudioPlayerStatus.Idle && oldS.resource && oldS.resource === this.resource) {
      const gen = this.gen;
      this._run(() => (gen === this.gen && !this.destroyed ? this._onTrackEnd() : undefined)).catch((err) => logger.warn('🎵 خطأ بالانتقال للأغنية التالية', { guildId: this.guildId, error: err && err.message }));
    }
  }

  _onPlayerError(err) {
    logger.warn('🎵 خطأ بالمشغّل الصوتي', { guildId: this.guildId, error: err && err.message });
    // نفس معالجة نهاية مبكرة: المشغّل يرجع Idle بعد الخطأ وينتقل _onPlayerState للمعالجة
  }

  async _onTrackEnd() {
    const track = this.queue.current;
    if (!track) return;
    const pos = this.positionMs();
    const dur = track.duration ? track.duration * 1000 : 0;
    // انتهى قبل أوانه (انقطع المصدر) ← نكمل من نفس الموضع بدل ما نقفز للتالية
    if (dur && pos < dur - 8000 && this.retries < 2) {
      this.retries++;
      logger.warn('🎵 انقطع الصوت قبل النهاية — إعادة الاتصال بالمصدر', { guildId: this.guildId, posSec: Math.round(pos / 1000), retry: this.retries });
      try {
        this._invalidateStream(track);
        await this._startCurrent(Math.max(0, pos - 500));
        return;
      } catch (err) {
        this._notifyFailure(track, err);
      }
    }
    await this._advance({ manual: false });
  }

  _invalidateStream(track) {
    track._stream = null;
  }

  /** ينتقل للأغنية التالية (يتخطى اللي تفشل). لو ما بقي شي: ينهي القائمة. */
  async _advance({ manual }) {
    let next = this.queue.advance({ manual });
    while (next) {
      try {
        await this._startCurrent(0);
        return next;
      } catch (err) {
        this.stats.failed++;
        this._notifyFailure(next, err);
        next = this.queue.advance({ manual: true });
      }
    }
    await this._finishQueue();
    return null;
  }

  _notifyFailure(track, err) {
    const reason = err && err.code && err.message ? err.message : 'فشل غير متوقع';
    this._send(embeds.failure(`**${track.title}**\n${reason}`, '⏭️ تخطيت أغنية تعذّر تشغيلها')).catch(() => {});
  }

  async _finishQueue() {
    this.status = 'ended';
    this.resource = null;
    this.offsetMs = 0;
    this._killProc(this.proc);
    this.proc = null;
    try {
      this.player.stop(true);
    } catch {
      /* ما فيه ما يوقف */
    }
    this._stopRefreshLoop();
    this.refreshPanel({ force: true });
    this._startIdleTimer(this.cfg.idleLeaveSeconds * 1000, 'queue-finished');
  }

  // ------------------------------------------------------------------ التحكم

  pause() {
    return this._run(() => {
      this._assertAlive();
      if (this.status === 'paused') return { changed: false };
      if (this.status !== 'playing') throw new MusicError('NOT_PLAYING', 'ما فيه أغنية تعمل الآن.');
      this.player.pause(true);
      this.status = 'paused';
      this._startPauseTimer();
      this.refreshPanel({ force: true });
      return { changed: true };
    }, { rejectIfBusy: true });
  }

  resume() {
    return this._run(() => {
      this._assertAlive();
      if (this.status === 'playing') return { changed: false };
      if (this.status !== 'paused') throw new MusicError('NOT_PLAYING', 'ما فيه أغنية متوقفة.');
      this.player.unpause();
      this.status = 'playing';
      this._clearPauseTimer();
      this.refreshPanel({ force: true });
      return { changed: true };
    }, { rejectIfBusy: true });
  }

  /** تقديم/ترجيع نسبي (ms). يعيد تشغيل المصدر من الموضع الجديد (Seek). */
  seekBy(deltaMs) {
    return this._run(async () => {
      this._assertAlive();
      const track = this.queue.current;
      if (!track || !['playing', 'paused'].includes(this.status)) throw new MusicError('NOT_PLAYING', 'ما فيه أغنية تعمل الآن.');
      const dur = track.duration ? track.duration * 1000 : Infinity;
      const target = this.positionMs() + deltaMs;
      if (target >= dur - 1000) {
        this.stats.skipped++;
        await this._advance({ manual: true });
        return { skipped: true };
      }
      await this._seekTo(Math.max(0, target));
      return { positionMs: this.positionMs() };
    }, { rejectIfBusy: true });
  }

  restart() {
    return this._run(async () => {
      this._assertAlive();
      if (!this.queue.current || !['playing', 'paused'].includes(this.status)) throw new MusicError('NOT_PLAYING', 'ما فيه أغنية تعمل الآن.');
      await this._seekTo(0);
      return { positionMs: 0 };
    }, { rejectIfBusy: true });
  }

  async _seekTo(ms) {
    const track = this.queue.current;
    const prevResource = this.resource;
    try {
      await this._startCurrent(ms);
    } catch (err) {
      // فشل إعادة التشغيل من الموضع: ما نخلّي الجلسة معلّقة — نتخطى
      this._notifyFailure(track, err);
      if (this.resource === prevResource) this.resource = null;
      await this._advance({ manual: true });
    }
  }

  skip() {
    return this._run(async () => {
      this._assertAlive();
      if (!this.queue.current) throw new MusicError('NOT_PLAYING', 'ما فيه أغنية تعمل الآن.');
      this.stats.skipped++;
      const next = await this._advance({ manual: true });
      return { next };
    }, { rejectIfBusy: true });
  }

  toggleMode(mode) {
    return this._run(() => {
      this._assertAlive();
      const m = this.queue.toggleMode(mode);
      this.refreshPanel({ force: true });
      return { mode: m };
    }, { rejectIfBusy: true });
  }

  stop(reason = 'stopped') {
    return this._run(() => this.destroy(reason));
  }

  // ------------------------------------------------------------------ لوحة التحكم

  snapshot() {
    const q = this.queue;
    return {
      status: this.status,
      track: q.current,
      positionSec: Math.floor(this.positionMs() / 1000),
      mode: q.mode,
      queueSize: q.upcoming.length,
      upcoming: q.upcoming.slice(),
      next: q.peekNext(),
      voiceChannelId: this.voiceChannelId,
      voiceChannelName: this.voiceChannelName
    };
  }

  async _send(payload) {
    try {
      return await this.textChannel.send({ ...payload, allowedMentions: { parse: [] } });
    } catch (err) {
      logger.debug('🎵 تعذّر الإرسال بقناة النص', { guildId: this.guildId, code: err && err.code });
      return null;
    }
  }

  /** تحديث اللوحة الحالية (تعديل نفس الرسالة). مع تجميع التحديثات المتقاربة. */
  refreshPanel({ force = false } = {}) {
    if (this.destroyed && this.status !== 'stopped') return;
    const minGap = 1000;
    const wait = this.lastPanelAt + minGap - Date.now();
    if (!force && wait > 0) return;
    if (wait > 0) {
      if (!this.panelTimer) {
        this.panelTimer = setTimeout(() => {
          this.panelTimer = null;
          this._pushPanel().catch(() => {});
        }, wait);
        if (typeof this.panelTimer.unref === 'function') this.panelTimer.unref();
      }
      return;
    }
    this._pushPanel().catch(() => {});
  }

  async _pushPanel() {
    this.lastPanelAt = Date.now();
    const payload = embeds.panelPayload(this.snapshot());
    try {
      if (this.panelMessage) {
        await this.panelMessage.edit(payload);
      } else {
        this.panelMessage = await this._send(payload);
        if (!this.panelMessage) throw new Error('send failed');
      }
      this.panelFailures = 0;
    } catch (err) {
      this.panelFailures++;
      const gone = err && (err.code === 10008 || err.code === 50001 || err.code === 50013);
      if (gone || this.panelFailures >= 2) {
        // الرسالة انحذفت: نحاول إرسال لوحة جديدة مرة واحدة
        this.panelMessage = null;
        const fresh = await this._send(payload);
        if (fresh) {
          this.panelMessage = fresh;
          this.panelFailures = 0;
        }
      }
      logger.debug('🎵 تعذّر تحديث لوحة التحكم', { guildId: this.guildId, code: err && err.code });
    }
  }

  /** ينقل اللوحة لقناة نص جديدة (أمر !موسيقى): يرسل لوحة جديدة ويحذف القديمة. */
  async movePanel(channel) {
    if (this.destroyed) return false;
    const old = this.panelMessage;
    this.textChannel = channel || this.textChannel;
    this.panelMessage = null;
    await this._pushPanel();
    if (old && this.panelMessage && old.id !== this.panelMessage.id) old.delete().catch(() => {});
    return !!this.panelMessage;
  }

  _startRefreshLoop() {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => {
      if (this.destroyed) return this._stopRefreshLoop();
      if (this.status === 'playing') this.refreshPanel();
    }, this.cfg.panelRefreshSeconds * 1000);
    if (typeof this.refreshTimer.unref === 'function') this.refreshTimer.unref();
  }

  _stopRefreshLoop() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  // ------------------------------------------------------------------ مؤقتات المغادرة

  _clearIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
  _startIdleTimer(ms, reason) {
    this._clearIdleTimer();
    this.idleTimer = setTimeout(() => this.stop(reason).catch(() => {}), ms);
    if (typeof this.idleTimer.unref === 'function') this.idleTimer.unref();
  }
  _startPauseTimer() {
    this._clearPauseTimer();
    this.pauseTimer = setTimeout(() => this.stop('pause-timeout').catch(() => {}), this.cfg.pauseLeaveSeconds * 1000);
    if (typeof this.pauseTimer.unref === 'function') this.pauseTimer.unref();
  }
  _clearPauseTimer() {
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
  }

  /** يُستدعى من MusicEvents عند تغيّر عدد البشر بالروم. */
  setChannelEmpty(empty) {
    if (this.destroyed) return;
    if (!empty) {
      if (this.emptyTimer) clearTimeout(this.emptyTimer);
      this.emptyTimer = null;
      return;
    }
    if (this.emptyTimer) return;
    this.emptyTimer = setTimeout(() => this.stop('channel-empty').catch(() => {}), this.cfg.emptyLeaveSeconds * 1000);
    if (typeof this.emptyTimer.unref === 'function') this.emptyTimer.unref();
  }

  updateVoiceChannel(channel) {
    this.voiceChannelId = channel.id;
    this.voiceChannelName = channel.name;
    this.refreshPanel({ force: true });
  }

  // ------------------------------------------------------------------ الإنهاء والتنظيف

  async destroy(reason = 'destroyed') {
    if (this.destroyed) return;
    this.destroyed = true;
    this.status = 'stopped';
    this.gen++;
    for (const k of ['idleTimer', 'emptyTimer', 'pauseTimer', 'panelTimer']) {
      if (this[k]) clearTimeout(this[k]);
      this[k] = null;
    }
    this._stopRefreshLoop();
    this._killProc(this.proc);
    this.proc = null;
    this.resource = null;
    try {
      if (this.player) {
        this.player.removeAllListeners();
        this.player.on('error', () => {});
        this.player.stop(true);
      }
    } catch {
      /* مشغّل منتهي */
    }
    try {
      if (this.connection && this.connection.state.status !== this.voice.VoiceConnectionStatus.Destroyed) this.connection.destroy();
    } catch {
      /* متصل أصلاً بلا حالة */
    }
    this.connection = null;
    this.queue.current = null;
    this.queue.upcoming = [];
    this.queue.played = [];
    // آخر تحديث للوحة: نعطّل الأزرار
    if (this.panelMessage) {
      const snap = { ...this.snapshot(), status: 'stopped', track: null, queueSize: 0 };
      await this.panelMessage.edit(embeds.panelPayload(snap)).catch(() => {});
    }
    await identity.restore(this.guild).catch(() => {});
    try {
      this.onDestroy(this.guildId, reason);
    } catch (err) {
      logger.warn('🎵 onDestroy', { error: err && err.message });
    }
  }
}

module.exports = { MusicPlayer, STREAM_TTL_MS };
