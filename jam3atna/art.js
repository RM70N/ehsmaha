// جمعتنا — رسومات القسم (SVG إيزومتري مولّد بالكود). خفيفة: لا WebGL في صفحة القسم،
// والحركة CSS/SMIL تتوقف تلقائيًا عندما يخرج الرسم من الشاشة (راجع observeArt).
const C = 0.866, S = 0.5;
const P = (x, y, z = 0) => [((x - y) * C).toFixed(1), ((x + y) * S - z).toFixed(1)];
const pts = (a) => a.map((p) => p.join(',')).join(' ');
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return '#' + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
/** صندوق إيزومتري: قاعدته (x,y) بأبعاد w×d وارتفاع h. */
function box(x, y, w, d, h, col, z0 = 0, extra = '') {
  const t = pts([P(x, y, z0 + h), P(x + w, y, z0 + h), P(x + w, y + d, z0 + h), P(x, y + d, z0 + h)]);
  const l = pts([P(x, y + d, z0 + h), P(x + w, y + d, z0 + h), P(x + w, y + d, z0), P(x, y + d, z0)]);
  const r = pts([P(x + w, y, z0 + h), P(x + w, y + d, z0 + h), P(x + w, y + d, z0), P(x + w, y, z0)]);
  return `<g ${extra}><polygon points="${l}" fill="${shade(col, 0.62)}"/><polygon points="${r}" fill="${shade(col, 0.8)}"/><polygon points="${t}" fill="${col}"/></g>`;
}
const tile = (x, y, w, d, col, z = 0, extra = '') => `<polygon points="${pts([P(x, y, z), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z)])}" fill="${col}" ${extra}/>`;
function windows(x, y, w, d, h, rows, cols, lit) {
  let s = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const zz = 6 + r * ((h - 10) / Math.max(1, rows - 1 || 1)); const on = (r * 7 + c * 3 + lit) % 3 !== 0;
    const a = P(x + 3 + c * ((w - 6) / cols), y + d, zz + 5), b = P(x + 3 + c * ((w - 6) / cols) + (w - 6) / cols - 2.5, y + d, zz + 5);
    const c2 = P(x + 3 + c * ((w - 6) / cols) + (w - 6) / cols - 2.5, y + d, zz), d2 = P(x + 3 + c * ((w - 6) / cols), y + d, zz);
    s += `<polygon points="${pts([a, b, c2, d2])}" fill="${on ? '#FFD98A' : '#3a2f63'}" ${on ? `class="j3-win" style="animation-delay:${-(r * 1.3 + c * 0.7).toFixed(1)}s"` : ''}/>`;
  }
  return s;
}
const car = (col, id) => `<g id="${id}"><ellipse cx="0" cy="3.5" rx="9" ry="3.4" fill="#000" opacity=".28"/><rect x="-8" y="-3" width="16" height="6" rx="2.6" fill="${col}"/><rect x="-4" y="-5.6" width="8.5" height="4" rx="1.8" fill="${shade(col, 1.25)}"/><rect x="-2.6" y="-4.9" width="5.6" height="2" rx=".8" fill="#1a1230"/></g>`;

/** بطاقة «المدينة المصغّرة»: مدينة حيّة بزاوية إيزومترية. */
export function cityArt() {
  const road = '#241a3f', walk = '#3a2c66', grass = '#1f5a4a';
  let g = '';
  g += tile(-10, -10, 250, 190, '#150d2b');
  g += tile(0, 0, 230, 170, walk);
  // شوارع
  g += tile(0, 72, 230, 26, road) + tile(102, 0, 26, 170, road);
  for (let i = 0; i < 9; i++) if (i !== 4) g += tile(8 + i * 26, 84, 12, 2, '#6d5fa8');
  for (let i = 0; i < 7; i++) if (i !== 3) g += tile(114, 6 + i * 25, 2, 12, '#6d5fa8');
  for (let i = 0; i < 5; i++) g += tile(96 - i * 0.01, 74 + i * 5, 5, 3, '#cfc6ee') + tile(129, 74 + i * 5, 5, 3, '#cfc6ee');
  // بلوك 1: عمارات
  g += box(10, 8, 34, 26, 62, '#8B5CF6') + windows(10, 8, 34, 26, 62, 5, 3, 1);
  g += box(54, 12, 30, 24, 40, '#E9DFD2') + windows(54, 12, 30, 24, 40, 3, 3, 2);
  g += box(14, 44, 26, 18, 22, '#F472B6') + tile(14, 62, 26, 5, '#F5C451', 13);
  g += box(52, 44, 34, 18, 18, '#34D399') + tile(52, 62, 34, 5, '#fff', 11);
  // بلوك 2: حديقة
  g += tile(138, 8, 84, 56, grass);
  [[150, 18], [176, 14], [204, 22], [160, 46], [198, 48]].forEach(([x, y], i) => { const b = P(x, y, 0), t = P(x, y, 12); g += `<line x1="${b[0]}" y1="${b[1]}" x2="${t[0]}" y2="${t[1]}" stroke="#5b4636" stroke-width="2"/><circle class="j3-tree" style="animation-delay:${-i * 0.9}s" cx="${t[0]}" cy="${t[1] - 4}" r="8" fill="${i % 2 ? '#2fae82' : '#34D399'}"/>`; });
  g += box(178, 32, 14, 5, 3, '#C4B0FF');
  // بلوك 3: مدرسة/مستشفى
  g += box(8, 108, 44, 30, 30, '#C9D6DF') + windows(8, 108, 44, 30, 30, 2, 4, 3) + box(22, 138, 16, 4, 12, '#7C3AED');
  g += box(62, 112, 28, 40, 16, '#FB923C') + tile(64, 114, 24, 36, '#fdba74', 16);
  // بلوك 4: مول + مواقف
  g += box(140, 108, 50, 34, 34, '#A78BFA') + windows(140, 108, 50, 34, 34, 2, 5, 1) + tile(140, 142, 50, 6, '#34D399', 14);
  g += tile(198, 108, 26, 50, '#2b2148'); for (let i = 0; i < 4; i++) g += tile(200, 112 + i * 12, 22, 1.2, '#6d5fa8');
  // إشارات
  const light = (x, y, d) => { const b = P(x, y, 0), t = P(x, y, 20); return `<line x1="${b[0]}" y1="${b[1]}" x2="${t[0]}" y2="${t[1]}" stroke="#6d5fa8" stroke-width="2"/><rect x="${t[0] - 3}" y="${t[1] - 9}" width="6" height="12" rx="2" fill="#120a24"/><circle class="j3-light" style="animation-delay:${d}s" cx="${t[0]}" cy="${t[1] - 5}" r="2.3"/><circle class="j3-light j3-light-b" style="animation-delay:${d}s" cx="${t[0]}" cy="${t[1]}" r="2.3"/>`; };
  g += light(98, 68, 0) + light(132, 102, -3);
  // مسارات السيارات (إيزومترية)
  const path = (a) => 'M' + a.map((p) => P(...p).join(' ')).join(' L');
  const p1 = path([[-6, 79], [236, 79]]), p2 = path([[236, 91], [-6, 91]]), p3 = path([[109, -6], [109, 176]]);
  g += `<g class="j3-cars"><use href="#j3c1"><animateMotion dur="9s" repeatCount="indefinite" path="${p1}"/></use><use href="#j3c2"><animateMotion dur="11s" begin="-4s" repeatCount="indefinite" path="${p2}"/></use><use href="#j3c3"><animateMotion dur="8s" begin="-2s" repeatCount="indefinite" path="${p3}"/></use><use href="#j3c4"><animateMotion dur="9s" begin="-5.5s" repeatCount="indefinite" path="${p1}"/></use></g>`;
  // مشاة
  const walker = (a, dur, col, bg) => `<g><circle r="2.6" cy="-7" fill="#f6c9a0"/><rect x="-2.4" y="-5" width="4.8" height="7" rx="2" fill="${col}"/><animateMotion dur="${dur}s" begin="${bg}s" repeatCount="indefinite" path="${path(a)} Z"/></g>`;
  g += walker([[4, 68], [94, 68], [94, 4], [4, 4]], 26, '#F5C451', 0) + walker([[136, 104], [226, 104], [226, 164], [136, 164]], 30, '#38bdf8', -9) + walker([[150, 30], [200, 40], [170, 54]], 18, '#F472B6', -4);
  // تفاصيل تظهر عند المرور
  const pin = (x, y, z, label) => { const p = P(x, y, z); return `<g class="j3-pin" transform="translate(${p[0]},${p[1]})"><path d="M0 0 L-5 -9 A7 7 0 1 1 5 -9 Z" fill="#fff"/><circle cy="-13" r="3" fill="#7C3AED"/><text y="-24" text-anchor="middle">${label}</text></g>`; };
  g += pin(27, 21, 64, 'هدف؟') + pin(180, 36, 6, 'شاهد') + pin(165, 125, 36, 'سر');
  return `<svg class="j3-art j3-art-city" viewBox="-175 -70 380 300" aria-hidden="true"><defs>${car('#EF4444', 'j3c1')}${car('#F5C451', 'j3c2')}${car('#38BDF8', 'j3c3')}${car('#F1F0F7', 'j3c4')}</defs><g class="j3-cam">${g}</g></svg>`;
}

/** بطاقة «مين المتنكر؟»: غرفة فيها كرسي يتحرك ويتجمد حين يلتفت المفتش. */
export function propArt() {
  let g = '';
  g += tile(0, 0, 180, 150, '#2a1f47');
  for (let i = 1; i < 6; i++) g += `<line x1="${P(i * 30, 0)[0]}" y1="${P(i * 30, 0)[1]}" x2="${P(i * 30, 150)[0]}" y2="${P(i * 30, 150)[1]}" stroke="#3a2c66" stroke-width="1"/>`;
  // جداران
  g += `<polygon points="${pts([P(0, 0, 0), P(180, 0, 0), P(180, 0, 86), P(0, 0, 86)])}" fill="#3b2a6b"/><polygon points="${pts([P(0, 0, 0), P(0, 150, 0), P(0, 150, 86), P(0, 0, 86)])}" fill="#33245e"/>`;
  g += `<polygon points="${pts([P(40, 0, 34), P(92, 0, 34), P(92, 0, 70), P(40, 0, 70)])}" fill="#1a1230"/><polygon class="j3-moon" points="${pts([P(44, 0, 38), P(88, 0, 38), P(88, 0, 66), P(44, 0, 66)])}" fill="#5b4bb0"/>`;
  g += `<polygon points="${pts([P(0, 60, 30), P(0, 104, 30), P(0, 104, 64), P(0, 60, 64)])}" fill="#F5C451" opacity=".9"/><polygon points="${pts([P(0, 64, 34), P(0, 100, 34), P(0, 100, 60), P(0, 64, 60)])}" fill="#7C3AED"/>`;
  // أثاث
  g += box(118, 6, 48, 16, 58, '#6b4a2f'); for (let r = 0; r < 3; r++) g += tile(120, 22, 44, 0.1, '#000', 0) + `<polygon points="${pts([P(120, 22, 14 + r * 16), P(164, 22, 14 + r * 16), P(164, 22, 24 + r * 16), P(120, 22, 24 + r * 16)])}" fill="${['#F472B6', '#34D399', '#F5C451'][r]}" opacity=".85"/>`;
  g += box(12, 14, 20, 52, 16, '#8B5CF6') + box(12, 14, 6, 52, 30, '#7C3AED');
  g += box(70, 96, 46, 30, 4, '#E9DFD2', 18) + box(74, 100, 4, 4, 18, '#b8a58e') + box(108, 118, 4, 4, 18, '#b8a58e');
  const pot = P(150, 110, 0); g += box(144, 104, 12, 12, 10, '#FB923C') + `<circle cx="${pot[0]}" cy="${pot[1] - 24}" r="12" fill="#34D399"/><circle cx="${pot[0] - 8}" cy="${pot[1] - 17}" r="8" fill="#2fae82"/>`;
  // الكرسي المتنكر
  const ch = P(88, 62, 0);
  const chair = `<g class="j3-chair" transform="translate(${ch[0]},${ch[1]})"><ellipse cy="2" rx="13" ry="5" fill="#000" opacity=".3"/><g class="j3-chair-b"><path d="M-9 -2 L0 3 L9 -2 L9 -13 L0 -8 L-9 -13 Z" fill="#F472B6"/><path d="M-9 -13 L0 -18 L9 -13 L0 -8 Z" fill="#f9a8d4"/><path d="M-9 -13 L-9 -34 L0 -39 L0 -18 Z" fill="#ec4899"/><path d="M-9 -34 L0 -39 L3 -37 L-6 -32 Z" fill="#f9a8d4"/><g class="j3-eyes"><ellipse cx="-5.6" cy="-26" rx="1.9" ry="2.6" fill="#fff"/><ellipse cx="-2" cy="-28" rx="1.9" ry="2.6" fill="#fff"/><circle cx="-5.2" cy="-25.6" r=".9" fill="#1a1230"/><circle cx="-1.6" cy="-27.6" r=".9" fill="#1a1230"/></g></g></g>`;
  // المفتش وكشافه
  const ins = P(128, 70, 0);
  const inspector = `<g transform="translate(${ins[0]},${ins[1]})"><ellipse cy="2" rx="10" ry="4" fill="#000" opacity=".3"/><g class="j3-insp"><path class="j3-cone" d="M0 -22 L-58 -4 L-50 -40 Z" fill="url(#j3beam)"/><rect x="-6" y="-22" width="12" height="20" rx="5" fill="#F5C451"/><circle cy="-29" r="7" fill="#f6c9a0"/><path d="M-8 -31 Q0 -42 8 -31 L8 -33 Q0 -45 -8 -33 Z" fill="#7C3AED"/><rect x="-12" y="-36" width="24" height="4" rx="2" fill="#7C3AED"/><circle class="j3-insp-eye" cx="-3" cy="-29" r="1.1" fill="#1a1230"/></g></g>`;
  g += chair + inspector;
  return `<svg class="j3-art j3-art-prop" viewBox="-150 -100 320 280" aria-hidden="true"><defs><linearGradient id="j3beam" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#FDE68A" stop-opacity=".75"/><stop offset="1" stop-color="#FDE68A" stop-opacity="0"/></linearGradient></defs><g class="j3-cam">${g}</g></svg>`;
}

/** مجسم الواجهة: منصة عائمة متعددة الطبقات + عوالم صغيرة + أجهزة متصلة بخطوط ضوئية. */
export function heroArt() {
  const layer = (s, z, col, cls) => `<g class="${cls}">${box(-s, -s, s * 2, s * 2, 10, col, z)}</g>`;
  let g = '';
  g += `<ellipse cx="0" cy="96" rx="150" ry="34" fill="#7C3AED" opacity=".16"/>`;
  g += layer(88, -40, '#22163f', 'j3-l1') + layer(68, -22, '#3b2870', 'j3-l2') + layer(48, -4, '#7C3AED', 'j3-l3');
  // شعار جمعتنا: ثلاث نقاط (لاعبون) حول نواة — على سطح الطبقة العليا
  const e = P(0, 0, 8);
  g += `<g class="j3-l3"><g transform="translate(${e[0]},${e[1]})"><ellipse rx="30" ry="15" fill="#120a24"/><ellipse class="j3-ring" rx="22" ry="11" fill="none" stroke="#C4B0FF" stroke-width="2.4" stroke-dasharray="14 9"/><circle r="5" fill="#fff"/><circle cx="-20" cy="-2" r="4.2" fill="#F472B6"/><circle cx="14" cy="-9" r="4.2" fill="#34D399"/><circle cx="12" cy="9" r="4.2" fill="#F5C451"/></g></g>`;
  // عالمان صغيران يطفوان
  g += `<g class="j3-orb j3-orb-a" transform="translate(-118,-64)">${box(-14, -14, 28, 28, 4, '#1f5a4a')}${box(-10, -10, 9, 9, 18, '#8B5CF6', 4)}${box(2, -8, 8, 8, 10, '#F472B6', 4)}${box(-8, 3, 12, 7, 7, '#F5C451', 4)}</g>`;
  g += `<g class="j3-orb j3-orb-b" transform="translate(120,-44)">${box(-14, -14, 28, 28, 4, '#33245e')}<g transform="translate(0,-2)"><path d="M-7 0 L0 4 L7 0 L7 -8 L0 -4 L-7 -8 Z" fill="#F472B6"/><path d="M-7 -8 L-7 -22 L0 -26 L0 -12 Z" fill="#ec4899"/></g></g>`;
  // أجهزة وخطوط اتصال
  const dev = (x, y, col, d) => `<g transform="translate(${x},${y})"><path class="j3-link" style="animation-delay:${d}s" d="M0 -8 Q${-x * 0.45} ${-y * 0.9 - 30} ${-x} ${-y + 4}" fill="none" stroke="${col}" stroke-width="1.8" stroke-dasharray="3 7" stroke-linecap="round"/><g class="j3-dev" style="animation-delay:${d}s"><rect x="-9" y="-16" width="18" height="30" rx="4" fill="#120a24" stroke="${col}" stroke-width="1.6"/><rect x="-6" y="-12" width="12" height="18" rx="2" fill="${col}" opacity=".85"/><circle cy="10" r="1.6" fill="${col}"/></g></g>`;
  g += dev(-150, 70, '#F472B6', 0) + dev(-58, 122, '#34D399', -0.8) + dev(64, 124, '#F5C451', -1.6) + dev(152, 66, '#A78BFA', -2.4);
  return `<svg class="j3-art j3-art-hero" viewBox="-190 -130 380 290" aria-hidden="true"><g class="j3-hero-tilt">${g}</g></svg>`;
}

/** أفاتارات مدمجة (12) — وجوه هندسية بسيطة بلا صور خارجية. */
const AV_COL = ['#8B5CF6', '#F472B6', '#34D399', '#F5C451', '#38BDF8', '#FB923C', '#A78BFA', '#EF4444', '#2DD4BF', '#E879F9', '#84CC16', '#F1F0F7'];
export function avatarSvg(a) {
  if (/^https:\/\//.test(String(a))) return `<img src="${String(a).replace(/"/g, '')}" alt="" referrerpolicy="no-referrer">`;
  const i = (parseInt(a, 10) || 0) % 12; const c = AV_COL[i]; const m = i % 4;
  const top = ['<path d="M8 15 Q20 2 32 15 L32 12 Q20 -3 8 12Z" fill="#1a1230"/>', '<rect x="8" y="6" width="24" height="6" rx="3" fill="#1a1230"/>', '<circle cx="20" cy="7" r="5" fill="#1a1230"/>', '<path d="M7 14 L12 5 L20 11 L28 5 L33 14Z" fill="#1a1230"/>'][m];
  return `<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12" fill="${c}"/>${top}<circle cx="14" cy="21" r="2.4" fill="#1a1230"/><circle cx="26" cy="21" r="2.4" fill="#1a1230"/><path d="M13 28 Q20 ${m % 2 ? 34 : 31} 27 28" fill="none" stroke="#1a1230" stroke-width="2.4" stroke-linecap="round"/></svg>`;
}

/** يوقف حركة الرسومات خارج الشاشة (CSS + SMIL) ويشغّلها عند ظهورها. */
export function observeArt(root) {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    e.target.classList.toggle('is-off', !e.isIntersecting);
    try { e.isIntersecting ? e.target.unpauseAnimations() : e.target.pauseAnimations(); } catch (err) {}
  }), { rootMargin: '60px' });
  root.querySelectorAll('svg.j3-art').forEach((s) => io.observe(s));
}
