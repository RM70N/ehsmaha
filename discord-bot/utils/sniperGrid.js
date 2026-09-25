'use strict';

// صورة شبكة "لعبة القناص": مربعات مرقّمة (بنفسجي غامق بحدود ذهبية).
// النسخة العامة أرقام بس (تنحفظ بالكاش لكل حجم)، ونسخة القناص تعلّم المربعات
// اللي سبق ضربها (💨 فاضي / 💀 إصابة) — ما فيها أي معلومة عن المخابئ الباقية.

const { createCanvas } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');
const welcomeCard = require('./welcomeCard');
const logger = require('./logger');

const FILE_NAME = 'sniper-grid.png';
const CELL = 110;
const GAP = 14;
const PAD = 36;
const HEADER = 96;

const COLORS = {
  bgTop: '#1a0b2e',
  bgBottom: '#2e1152',
  cell: '#3a1768',
  cellMiss: '#1d1030',
  cellHit: '#5c1330',
  gold: '#d4af37',
  goldSoft: 'rgba(212, 175, 55, 0.35)',
  text: '#f5e6b3',
  miss: 'rgba(245, 230, 179, 0.35)',
  hit: '#ff5c7a'
};

const columnsFor = (size) => (size <= 20 ? 5 : 10);

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param {object} opts
 * @param {number} opts.size   عدد المربعات
 * @param {Map<number,'hit'|'miss'>} [opts.marks]  (للقناص فقط)
 * @param {string} [opts.title]
 * @returns {Buffer} PNG
 */
function renderGrid({ size, marks = null, title = 'ساحة القناص' }) {
  const { ensureFont, FONT_FAMILY } = welcomeCard._internal;
  ensureFont();
  const cols = columnsFor(size);
  const rows = Math.ceil(size / cols);
  const width = PAD * 2 + cols * CELL + (cols - 1) * GAP;
  const height = PAD * 2 + HEADER + rows * CELL + (rows - 1) * GAP;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, COLORS.bgTop);
  bg.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 4;
  roundRect(ctx, 8, 8, width - 16, height - 16, 22);
  ctx.stroke();

  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 50px ${FONT_FAMILY}`;
  ctx.fillText(title, width / 2, PAD + HEADER / 2 - 8);

  for (let n = 1; n <= size; n++) {
    const i = n - 1;
    const x = PAD + (i % cols) * (CELL + GAP);
    const y = PAD + HEADER + Math.floor(i / cols) * (CELL + GAP);
    const mark = marks ? marks.get(n) : null;
    ctx.fillStyle = mark === 'hit' ? COLORS.cellHit : mark === 'miss' ? COLORS.cellMiss : COLORS.cell;
    roundRect(ctx, x, y, CELL, CELL, 16);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = mark ? COLORS.goldSoft : COLORS.gold;
    ctx.stroke();

    ctx.fillStyle = mark ? COLORS.miss : COLORS.text;
    ctx.font = `bold 46px ${FONT_FAMILY}`;
    ctx.fillText(String(n), x + CELL / 2, y + CELL / 2 + 2);
    if (mark) {
      // علامة X فوق المربع المضروب
      ctx.strokeStyle = mark === 'hit' ? COLORS.hit : COLORS.miss;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x + 24, y + 24);
      ctx.lineTo(x + CELL - 24, y + CELL - 24);
      ctx.moveTo(x + CELL - 24, y + 24);
      ctx.lineTo(x + 24, y + CELL - 24);
      ctx.stroke();
    }
  }
  return canvas.toBuffer('image/png');
}

const publicCache = new Map(); // size -> Buffer

/**
 * مرفق جاهز للإرسال (أو null لو فشل التوليد — الرسالة تكمل بدون صورة).
 */
function gridAttachment({ size, marks = null, title } = {}) {
  try {
    let buf;
    if (!marks || !marks.size) {
      buf = publicCache.get(size);
      if (!buf) {
        buf = renderGrid({ size, title });
        publicCache.set(size, buf);
      }
    } else {
      buf = renderGrid({ size, marks, title });
    }
    return new AttachmentBuilder(buf, { name: FILE_NAME });
  } catch (err) {
    logger.warn('القناص: تعذّر توليد صورة الشبكة — نكمل بدون صورة', { size, error: err });
    return null;
  }
}

// بديل نصي لو فشلت الصورة
function textGrid(size, marks = null) {
  const cols = columnsFor(size);
  const lines = [];
  for (let r = 0; r * cols < size; r++) {
    const cells = [];
    for (let c = 1; c <= cols && r * cols + c <= size; c++) {
      const n = r * cols + c;
      const m = marks && marks.get(n);
      cells.push(m ? (m === 'hit' ? '💀' : '✖️').padStart(3) : String(n).padStart(3));
    }
    lines.push(cells.join(' '));
  }
  return '```\n' + lines.join('\n') + '\n```';
}

module.exports = { renderGrid, gridAttachment, textGrid, FILE_NAME, columnsFor, _cache: publicCache };
