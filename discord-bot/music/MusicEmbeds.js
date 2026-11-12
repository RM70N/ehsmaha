'use strict';

// رسائل ولوحات الموسيقى — بهوية احسمها (utils/embedBuilder). لا منطق تشغيل هنا: كلها دوال تبني payloads من لقطة (snapshot) الجلسة.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const eb = require('../utils/embedBuilder');
const customId = require('../utils/customId');
const { getMusicConfig } = require('./MusicConfig');

const PREFIX = 'mu';

const MODE_LABELS = Object.freeze({
  normal: 'عادي',
  repeatTrack: '🔂 تكرار الأغنية',
  repeatQueue: '🔁 تكرار القائمة',
  shuffle: '🔀 عشوائي'
});
const STATUS_LABELS = Object.freeze({
  loading: '⏳ جاري التحضير',
  playing: '▶️ يعمل الآن',
  paused: '⏸️ متوقف مؤقتاً',
  ended: '🏁 انتهت القائمة',
  stopped: '⏹️ انتهت الجلسة'
});

function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, '0');
  const rr = String(r).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${rr}` : `${mm}:${rr}`;
}

const trackLine = (t) => (t ? `**${eb.safeName(t.title)}** — ${eb.safeName(t.artist)}` : '—');

/** اللوحة الرئيسية. snap = MusicPlayer.snapshot() */
function nowPlaying(snap) {
  const t = snap.track;
  const ended = snap.status === 'ended' || snap.status === 'stopped';
  const tone = ended ? 'deep' : snap.status === 'paused' ? 'gold' : 'primary';
  const embed = eb.brand({
    tone,
    title: t ? eb.clip(t.title, 200) : 'لا توجد أغنية',
    url: t && /^https?:\/\//.test(t.spotifyUrl || t.url || '') ? t.spotifyUrl || t.url : undefined,
    thumbnail: t && t.thumbnail ? t.thumbnail : undefined,
    timestamp: false
  });
  embed.setAuthor({ name: ended ? 'MUSIC · احسمها' : 'NOW PLAYING · الآن يعمل' });
  if (!t) {
    embed.setDescription('انتهت قائمة التشغيل. اطلب أغنية جديدة بـ`/اغنية` قبل ما أطلع من الروم.');
  } else {
    const pos = Math.min(snap.positionSec, t.duration || snap.positionSec);
    const icon = snap.status === 'paused' ? '⏸️' : snap.status === 'playing' ? '▶️' : '⏳';
    const bar = t.duration ? eb.progressBar(pos, t.duration, 16) : '▱'.repeat(16);
    embed.setDescription(
      [`**${eb.safeName(t.artist)}**`, '', `${icon} \`${formatTime(pos)} / ${t.duration ? formatTime(t.duration) : '--:--'}\``, bar].join('\n')
    );
    const next = snap.next;
    embed.addFields(
      eb.field('👤 طلبها', t.requestedBy ? eb.safeName(t.requestedBy.name) : '—'),
      eb.field('🔊 الروم', snap.voiceChannelName ? eb.safeName(snap.voiceChannelName) : '—'),
      eb.field('📡 الحالة', STATUS_LABELS[snap.status] || snap.status),
      eb.field('🎚️ الوضع', MODE_LABELS[snap.mode] || snap.mode),
      eb.field('📜 القائمة', `${snap.queueSize} ${snap.queueSize === 1 ? 'أغنية' : 'أغاني'}`),
      eb.field('⏭️ التالية', snap.mode === 'shuffle' && snap.queueSize ? 'عشوائية' : next ? trackLine(next) : 'لا يوجد', false)
    );
  }
  return embed;
}

const btn = (action, { label, emoji, style = ButtonStyle.Secondary, disabled = false }) => {
  const b = new ButtonBuilder().setCustomId(customId.build(PREFIX, action)).setStyle(style).setDisabled(disabled);
  if (label) b.setLabel(label);
  if (emoji) b.setEmoji(emoji);
  return b;
};

function controlRows(snap, { disabled = false } = {}) {
  const sec = getMusicConfig().seekSeconds;
  const active = (on) => (on ? ButtonStyle.Primary : ButtonStyle.Secondary);
  return [
    new ActionRowBuilder().addComponents(
      btn('back', { emoji: '⏪', label: `${sec}ث`, disabled }),
      btn('pause', { emoji: '⏸️', label: 'إيقاف مؤقت', disabled }),
      btn('resume', { emoji: '▶️', label: 'استكمال', disabled }),
      btn('fwd', { emoji: '⏩', label: `${sec}ث`, disabled })
    ),
    new ActionRowBuilder().addComponents(
      btn('restart', { emoji: '🔄', label: 'من البداية', disabled }),
      btn('skip', { emoji: '⏭️', label: 'تخطي', disabled }),
      btn('repeat', { emoji: '🔂', label: 'تكرار', style: active(snap.mode === 'repeatTrack'), disabled }),
      btn('queue', { emoji: '📜', label: 'القائمة', disabled })
    ),
    new ActionRowBuilder().addComponents(
      btn('shuffle', { emoji: '🔀', label: 'عشوائي', style: active(snap.mode === 'shuffle'), disabled }),
      btn('loopq', { emoji: '🔁', label: 'تكرار القائمة', style: active(snap.mode === 'repeatQueue'), disabled }),
      btn('stop', { emoji: '⏹️', label: 'إيقاف وخروج', style: ButtonStyle.Danger, disabled })
    )
  ];
}

function panelPayload(snap, opts) {
  const over = snap.status === 'stopped';
  return { embeds: [nowPlaying(snap)], components: controlRows(snap, { disabled: over, ...opts }) };
}

// ---------- قائمة الانتظار (مع Pagination) ----------

function queuePages(snap) {
  const size = getMusicConfig().queuePageSize;
  return Math.max(1, Math.ceil(snap.upcoming.length / size));
}

function queuePayload(snap, page = 0) {
  const cfg = getMusicConfig();
  const size = cfg.queuePageSize;
  const pages = queuePages(snap);
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = snap.upcoming.slice(p * size, p * size + size);
  const totalSec = snap.upcoming.reduce((s, t) => s + (t.duration || 0), 0);

  const head = eb.brand({
    tone: 'primary',
    title: '📜 قائمة الانتظار',
    description: [
      snap.track ? `**الآن:** ${trackLine(snap.track)}` : '**لا توجد أغنية تعمل الآن**',
      `🎚️ الوضع: ${MODE_LABELS[snap.mode] || snap.mode}`,
      `📦 ${snap.upcoming.length} أغنية · ⏱️ ${formatTime(totalSec)}`
    ].join('\n'),
    timestamp: false
  }).setFooter({ text: `صفحة ${p + 1}/${pages} · ${eb.FOOTER_TEXT}` });

  const items = slice.map((t, i) => {
    const e = eb.brand({
      tone: 'deep',
      description: `**${p * size + i + 1}.** [${eb.clip(eb.safeName(t.title), 120)}](${/^https?:\/\//.test(t.spotifyUrl || t.url || '') ? t.spotifyUrl || t.url : 'https://ehsmaha.com'})\n${eb.safeName(t.artist)} · \`${t.duration ? formatTime(t.duration) : '--:--'}\` · 👤 ${eb.safeName(t.requestedBy ? t.requestedBy.name : '—')}`,
      thumbnail: t.thumbnail || undefined,
      timestamp: false
    });
    e.setFooter(null);
    return e;
  });
  if (!items.length) head.setDescription(`${head.data.description}\n\nالقائمة فاضية — اطلب أغنية بـ\`/اغنية\`.`);

  const row = new ActionRowBuilder().addComponents(
    btn(`qp:${p - 1}`, { emoji: '◀️', label: 'السابق', disabled: p <= 0 }),
    btn(`qp:${p + 1}`, { emoji: '▶️', label: 'التالي', disabled: p >= pages - 1 }),
    btn('qr', { emoji: '🔄', label: 'تحديث' })
  );
  return { embeds: [head, ...items], components: [row], page: p };
}

// ---------- نتائج البحث ----------

function searchPayload(query, results, token) {
  const lines = results.map((t, i) => `**${i + 1}.** ${eb.clip(eb.safeName(t.title), 90)}\n└ ${eb.safeName(t.artist)} · \`${t.duration ? formatTime(t.duration) : '--:--'}\``);
  const embed = eb.brand({
    tone: 'primary',
    title: '🔎 نتائج البحث',
    description: `**${eb.clip(eb.safeName(query), 100)}**\n\n${lines.join('\n')}\n\nاختر الأغنية من القائمة بالأسفل.`,
    thumbnail: results[0] && results[0].thumbnail ? results[0].thumbnail : undefined,
    timestamp: false
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId.build(PREFIX, 'sel', token))
    .setPlaceholder('اختر الأغنية…')
    .addOptions(
      results.map((t, i) => ({
        label: eb.clip(`${i + 1}. ${t.title}`, 100),
        description: eb.clip(`${t.artist} · ${t.duration ? formatTime(t.duration) : '--:--'}`, 100),
        value: String(i)
      }))
    );
  const cancel = btn(`cancel:${token}`, { emoji: '✖️', label: 'إلغاء' });
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(cancel)] };
}

// ---------- رسائل نجاح/فشل ----------

function added(track, { position, startedNow }) {
  const embed = eb.brand({
    tone: 'success',
    title: startedNow ? '🎶 بدأ التشغيل' : '➕ أُضيفت للقائمة',
    description: `${trackLine(track)}\n\`${track.duration ? formatTime(track.duration) : '--:--'}\`${startedNow ? '' : ` · الترتيب **#${position}**`}`,
    thumbnail: track.thumbnail || undefined,
    timestamp: false
  });
  return { embeds: [embed] };
}

const failure = (message, title = '⚠️ تعذّر التشغيل') => ({ embeds: [eb.error(message, title)] });
const notice = (message, title = '💡 تنبيه') => ({ embeds: [eb.warning(message, title)] });
const success = (message, title = '✅ تم') => ({ embeds: [eb.success(message, title)] });

module.exports = { PREFIX, MODE_LABELS, STATUS_LABELS, formatTime, nowPlaying, controlRows, panelPayload, queuePayload, queuePages, searchPayload, added, failure, notice, success };
