// ==================== رسوم بيانية خفيفة (SVG بدون أي مكتبة خارجية) ====================
// تُستخدم بكل الأقسام اللي تحتاج رسم اتجاه (نمو مستخدمين، شعبية لعبة عبر
// الوقت...) — رسم مباشر بدون أي مكتبة رسوم بيانية إضافية.
export function renderBarChart({ labels, values, height, valueSuffix }) {
  const h = height || 160;
  const w = Math.max(labels.length * 26, 280);
  const max = Math.max(1, ...values);
  const barW = (w / labels.length) * 0.62;
  const gap = (w / labels.length) * 0.38;
  let bars = '';
  let i = 0;
  for (const v of values) {
    const barH = Math.round((v / max) * (h - 26));
    const x = i * (barW + gap) + gap / 2;
    const y = h - barH - 20;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="var(--gold)" opacity="0.85"><title>${labels[i]}: ${v}${valueSuffix || ''}</title></rect>`;
    if (labels.length <= 14) {
      bars += `<text x="${x + barW / 2}" y="${h - 6}" font-size="9" fill="var(--text-muted)" text-anchor="middle">${labels[i]}</text>`;
    }
    i++;
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="رسم بياني">${bars}</svg>`;
}

export function renderLineChart({ labels, values, height }) {
  const h = height || 160;
  const w = Math.max(labels.length * 14, 320);
  const max = Math.max(1, ...values);
  const stepX = w / Math.max(1, labels.length - 1);
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = h - 18 - (v / max) * (h - 30);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="رسم بياني خطي">
      <polyline points="${pts}" fill="none" stroke="var(--gold-strong)" stroke-width="2" />
    </svg>
  `;
}
