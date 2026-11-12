'use strict';

// التحكم: أزرار اللوحة + قائمة اختيار البحث + منطق أوامر !prefix (اغنية/قائمة/تخطي/ايقاف/موسيقى).
// كل ضغطة تتحقق من العضو (بنفس الروم الصوتي للجلسة) — عضو خارج الروم ما يقدر يتحكم أبداً.

const eb = require('../utils/embedBuilder');
const respond = require('../utils/respond');
const logger = require('../utils/logger');
const { checkAdminPermission } = require('../utils/adminPermissions');
const { MessageFlags } = require('discord.js');
const embeds = require('./MusicEmbeds');
const { getManager } = require('./MusicManager');
const { getMusicConfig } = require('./MusicConfig');
const { MusicError } = require('./MusicExtractor');

const EPHEMERAL = MessageFlags.Ephemeral;

// أسماء الأوامر العربية ↔ أسماء الإجراءات (لقيد MUSIC_ADMIN_ONLY)
const ACTION_COMMAND = { skip: 'تخطي', stop: 'ايقاف', back: 'ترجيع', fwd: 'تقديم', restart: 'اعادة', pause: 'ايقاف_مؤقت', resume: 'استكمال', repeat: 'تكرار', shuffle: 'عشوائي', loopq: 'تكرار_القائمة' };

async function adminOnlyBlocked(member, ...names) {
  const set = getMusicConfig().adminOnly;
  if (!set.size || !names.some((n) => set.has(n))) return false;
  try {
    const r = await checkAdminPermission(member);
    return !(r && r.allowed);
  } catch {
    return true;
  }
}

/** يتحقق أن العضو يقدر يتحكم بجلسة السيرفر. يرجع {session} أو {error: payload}. */
async function guard({ guild, member }, actionKey) {
  const session = getManager().getSession(guild.id);
  if (!session) return { error: embeds.notice('ما فيه جلسة موسيقى نشطة الحين — ابدأ بـ`!اغنية`.') };
  const vc = member && member.voice && member.voice.channel;
  if (!vc) return { error: embeds.notice('ادخل الروم الصوتي أول عشان تتحكم بالموسيقى.', '🎧 ادخل الروم') };
  if (vc.id !== session.voiceChannelId) {
    return { error: embeds.notice(`لازم تكون بنفس الروم الصوتي (<#${session.voiceChannelId}>) عشان تتحكم بالموسيقى.`, '🔒 روم مختلف') };
  }
  if (actionKey && (await adminOnlyBlocked(member, actionKey, ACTION_COMMAND[actionKey]))) {
    return { error: embeds.notice('هذا التحكم مقتصر على المشرفين حالياً.', '🔒 للمشرفين فقط') };
  }
  return { session };
}

const sec = () => getMusicConfig().seekSeconds;

/** ينفّذ إجراء تحكم على الجلسة ويرجع رسالة قصيرة (أو null لو ما يحتاج). يرمي MusicError. */
async function perform(action, session) {
  switch (action) {
    case 'back': {
      await session.seekBy(-sec() * 1000);
      return null;
    }
    case 'fwd': {
      const r = await session.seekBy(sec() * 1000);
      return r && r.skipped ? 'وصلت لنهاية الأغنية — انتقلت للتالية.' : null;
    }
    case 'pause': {
      const r = await session.pause();
      return r.changed ? null : 'الأغنية متوقفة مؤقتاً أصلاً.';
    }
    case 'resume': {
      const r = await session.resume();
      return r.changed ? null : 'الأغنية تعمل أصلاً.';
    }
    case 'restart':
      await session.restart();
      return null;
    case 'skip': {
      const r = await session.skip();
      return r.next ? `⏭️ التالية: ${eb.safeName(r.next.title)}` : 'انتهت القائمة.';
    }
    case 'repeat': {
      const r = await session.toggleMode('repeatTrack');
      return r.mode === 'repeatTrack' ? '🔂 تكرار الأغنية: مفعّل' : '🔂 تكرار الأغنية: متوقف';
    }
    case 'shuffle': {
      const r = await session.toggleMode('shuffle');
      return r.mode === 'shuffle' ? '🔀 العشوائي: مفعّل' : '🔀 العشوائي: متوقف';
    }
    case 'loopq': {
      const r = await session.toggleMode('repeatQueue');
      return r.mode === 'repeatQueue' ? '🔁 تكرار القائمة: مفعّل' : '🔁 تكرار القائمة: متوقف';
    }
    case 'stop':
      await session.stop('user');
      return '⏹️ أوقفت الموسيقى وطلعت من الروم.';
    default:
      throw new MusicError('UNKNOWN_ACTION', 'إجراء غير معروف.');
  }
}

const errMessage = (err) => (err instanceof MusicError ? err.message : null);

// ------------------------------------------------------------------ الأزرار / القوائم (customId: mu:<action>[:args])

async function onComponent(interaction, args) {
  const [action, ...rest] = args;
  const guild = interaction.guild;
  const member = interaction.member;
  if (!guild || !member) return respond.send(interaction, embeds.notice('الموسيقى تشتغل داخل السيرفرات فقط.'), { ephemeral: true });
  const manager = getManager();

  // ---- نتائج البحث
  if (action === 'sel' && interaction.isStringSelectMenu()) {
    await interaction.deferUpdate().catch(() => {});
    const r = await manager.selectSearch({ token: rest[0], index: Number(interaction.values[0]), guild, member, textChannel: interaction.channel });
    if (r.kind === 'added') {
      await interaction.editReply({ ...r.payload, components: [] }).catch(() => {});
    } else {
      // خطأ: نبقي القائمة للمحاولة من جديد لو الخطأ مؤقت، ونعرض الرسالة بشكل خاص
      await interaction.followUp({ ...r.payload, flags: EPHEMERAL }).catch(() => {});
    }
    return undefined;
  }
  if (action === 'cancel') {
    manager.cancelSearch(rest[0], interaction.user.id);
    await interaction.update({ embeds: [eb.info('تم إلغاء البحث.')], components: [] }).catch(() => {});
    return undefined;
  }

  // ---- قائمة الانتظار (عرض فقط: متاحة للجميع)
  if (action === 'qp' || action === 'qr') {
    const session = manager.getSession(guild.id);
    if (!session) return interaction.update({ embeds: [eb.info('انتهت جلسة الموسيقى.')], components: [] }).catch(() => null);
    const page = action === 'qr' ? 0 : Number(rest[0]) || 0;
    const { page: _p, ...payload } = embeds.queuePayload(session.snapshot(), page);
    return interaction.update(payload).catch(() => null);
  }
  if (action === 'queue') {
    const session = manager.getSession(guild.id);
    if (!session) return respond.send(interaction, embeds.notice('ما فيه جلسة موسيقى نشطة الحين.'), { ephemeral: true });
    const { page: _p, ...payload } = embeds.queuePayload(session.snapshot(), 0);
    return respond.send(interaction, payload, { ephemeral: true });
  }

  // ---- التحكم
  const g = await guard({ guild, member }, action);
  if (g.error) return respond.send(interaction, g.error, { ephemeral: true });
  await interaction.deferUpdate().catch(() => {});
  try {
    const msg = await perform(action, g.session);
    if (msg) await interaction.followUp({ embeds: [eb.info(msg)], flags: EPHEMERAL }).catch(() => {});
  } catch (err) {
    const m = errMessage(err);
    if (!m) logger.error('🎵 خطأ بزر الموسيقى', { action, guildId: guild.id, error: err });
    await interaction.followUp({ embeds: [eb.warning(m || 'حصل خطأ — جرّب مرة ثانية.')], flags: EPHEMERAL }).catch(() => {});
  }
  return undefined;
}

// ------------------------------------------------------------------ منطق الأوامر المشترك (Slash و!prefix)

/**
 * @returns {Promise<{payload:object, ephemeral?:boolean}>}
 */
async function runCommand(name, { guild, member, textChannel, args = '' }) {
  const manager = getManager();
  try {
    switch (name) {
      case 'اغنية': {
        if (!String(args).trim()) return { payload: embeds.notice('اكتب اسم الأغنية أو الرابط: `!اغنية اسم الأغنية`', '🎵 اسم الأغنية؟') };
        const r = await manager.requestPlay({ guild, member, textChannel, input: args });
        return { payload: r.payload, kind: r.kind };
      }
      case 'قائمة': {
        const session = manager.getSession(guild.id);
        if (!session) return { payload: embeds.notice('ما فيه جلسة موسيقى نشطة الحين.') };
        const { page: _p, ...payload } = embeds.queuePayload(session.snapshot(), 0);
        return { payload };
      }
      case 'تخطي': {
        const g = await guard({ guild, member }, 'skip');
        if (g.error) return { payload: g.error, ephemeral: true };
        const msg = await perform('skip', g.session);
        return { payload: embeds.success(msg, '⏭️ تخطي') };
      }
      case 'ايقاف': {
        const g = await guard({ guild, member }, 'stop');
        if (g.error) return { payload: g.error, ephemeral: true };
        const msg = await perform('stop', g.session);
        return { payload: embeds.success(msg, '⏹️ إيقاف') };
      }
      case 'موسيقى': {
        const session = manager.getSession(guild.id);
        if (!session) return { payload: embeds.notice('ما فيه جلسة موسيقى نشطة — ابدأ بـ`!اغنية`.') };
        await session.movePanel(textChannel).catch(() => {});
        const s = session.stats;
        const snap = session.snapshot();
        const mins = Math.max(1, Math.round((Date.now() - session.createdAt) / 60000));
        const stats = eb.info(
          [`🔊 الروم: <#${session.voiceChannelId}>`, `⏱️ مدة الجلسة: ${mins} دقيقة`, `🎶 شُغّلت: ${s.played}`, `⏭️ تخطّيت: ${s.skipped}`, `⚠️ فشلت: ${s.failed}`, `📜 بالقائمة: ${snap.queueSize}`].join('\n'),
          '📊 إحصائيات الجلسة'
        );
        return { payload: { embeds: [stats] }, ephemeral: true };
      }
      default:
        return { payload: embeds.notice('أمر موسيقى غير معروف.') };
    }
  } catch (err) {
    const m = errMessage(err);
    if (!m) logger.error('🎵 خطأ بأمر موسيقى', { name, guildId: guild.id, error: err });
    return { payload: embeds.notice(m || 'حصل خطأ — جرّب مرة ثانية.') };
  }
}

module.exports = { onComponent, runCommand, perform, guard };
