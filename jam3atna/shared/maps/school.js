// خريطة المدرسة: مدخل، ممر رئيسي بخزائن، 4 فصول (علوم/رياضيات/أدب/فنون)، مكتبة، مختبر، مقصف.
import { mapBuilder } from '../prop-core.js';

export function school() {
  const b = mapBuilder({
    id: 'school', ready: true, name: 'المدرسة', line: 'الجرس رنّ... وفيه واحد ما دخل الفصل!', w: 56, d: 36, gate: { x: 20.5, z: 16.4, lv: 0 },
    theme: { sky: 0xa9c8e6, fog: 0xc9d6e2, fogN: 55, fogF: 150, sun: 0xfff0cf, sunI: 0.9, amb: 0.36, ambSky: 0xdfeaf6, ambGround: 0x6a5a48, fillI: 0.3, step: 'tile', wall: 0xe2d3b4, dado: 0x294b70, trim: 0xd6a33e, base: 0x4a3a2c, crown: 0xf1e8d2, ceil: 0xeee4cd, lamp: 0xfff4dc, doorFrame: 0x294b70, door: 0xb98b61, ext: 0xb56d58, floorMul: 1.0, dadoGloss: true, ground: 0x7d9a6a },
    ambience: 'school', music: [330, 392, 440],
    tour: [[20, 16, 2.6, 20, 5, 1.2], [0, 0, 2.8, -20, 0, 1.4], [-20, -9, 3.0, -20, -15, 1.4], [6, 9, 3.0, 6, 16, 1.3]],
  });
  // ---------- أرضيات وألوان الغرف
  b.room('hallW', -28, -2.5, 0, 2.5, { floor: 'stone', c1: 0xb9aa8e, c2: 0xa99a7e, wc: 0xd9c9a4, dado: 0x294b70, trim: 0xd6a33e });
  b.room('hallE', 0, -2.5, 28, 2.5, { floor: 'stone', c1: 0xb9aa8e, c2: 0xa99a7e, wc: 0xe0c98f, dado: 0x6e9273, trim: 0xf1e8d2 });
  b.room('sci', -28, -18, -14, -2.5, { floor: 'vinyl', c1: 0x7fa9a0, c2: 0x6f998f, wc: 0xc9dccf, dado: 0x2f6b66, trim: 0xd6a33e });
  b.room('math', -14, -18, 0, -2.5, { floor: 'wood', c1: 0xc79763, c2: 0xb2854f, wc: 0xe3d4a6, dado: 0x294b70, trim: 0xf1e8d2 });
  b.room('lib', 0, -18, 14, -2.5, { floor: 'carpet', c1: 0x6a5a8a, c2: 0x5a4a7a, wc: 0x9db0b8, dado: 0x6a4a30, trim: 0xd6a33e });
  b.room('art', 14, -18, 28, -2.5, { floor: 'confetti', c1: 0xcab9a2, c2: 0xbca892, wc: 0xf0dfc0, dado: 0xb56d58, trim: 0x294b70 });
  b.room('lit', -28, 2.5, -14, 18, { floor: 'parquet', c1: 0xb98a5c, c2: 0xa57a4c, wc: 0xd7a99a, dado: 0x6a4a30, trim: 0xf1e8d2 });
  b.room('lab', -14, 2.5, 0, 18, { floor: 'epoxy', c1: 0x7d97a6, c2: 0x6f8999, wc: 0xb8c8d2, dado: 0x30383d, trim: 0x6e9273 });
  b.room('canteen', 0, 2.5, 14, 18, { floor: 'tile', c1: 0xc97b4a, c2: 0xb86c3c, wc: 0xf0c978, dado: 0xb56d58, trim: 0x294b70 });
  b.room('lobby', 14, 2.5, 28, 18, { floor: 'stone', c1: 0xb3a58a, c2: 0xa3957a, wc: 0x9db0b8, dado: 0x294b70, trim: 0xd6a33e });
  // ---------- جدران
  b.box(-28, -18, 28, 18, { s: [[20.5, 4.4, 'double']] }, { c2: 0x294b70 });
  b.wall(-28, -2.5, 28, -2.5, [[-21, 2.4], [-7, 2.4], [7, 2.4], [20.5, 2.4]]);
  b.wall(-28, 2.5, 28, 2.5, [[-21, 2.4], [-6, 2.4], [6, 4.2, 'open'], [20.5, 4.2, 'open']]);
  b.wall(-14, -18, -14, -2.5, [[-10, 2.0]]); b.wall(0, -18, 0, -2.5, []); b.wall(14, -18, 14, -2.5, [[-10, 2.0]]);
  b.wall(-14, 2.5, -14, 18, [[10, 2.0]]); b.wall(0, 2.5, 0, 18, [[9, 2.2]]); b.wall(14, 2.5, 14, 18, [[10, 3.0, 'open']]);
  b.wall(0, -18, 0, -2.5, [[-6, 2.2]]);
  // ---------- الممر: خزائن طلاب بألوان متنوعة + مقاعد + نباتات
  const LC = [0x294b70, 0xd6a33e, 0x6e9273, 0xb56d58, 0x9dafb7];
  const lock = (x0, n, z, side, i0) => { for (let i = 0; i < n; i++) b.solid('lockers', x0 + i * 2.0, z, 1.9, 0.5, { h: 2.0, c: [0x294b70, 0xd6a33e, 0x6e9273, 0xb56d58, 0x7a8fa0][(i + i0) % 5], side }); };
  lock(-26, 2, -2.0, 1, 0); lock(-17, 2, -2.0, 1, 2); lock(-12.5, 2, -2.0, 1, 1); lock(-3.5, 2, -2.0, 1, 3); lock(2.5, 2, -2.0, 1, 4); lock(10.5, 2, -2.0, 1, 0); lock(16, 2, -2.0, 1, 2); lock(24, 2, -2.0, 1, 3);
  b.deco('board', -12, -2.3, { y: 1.5, w: 2.0, h: 1.0, c: 0xc79763, cork: true }); b.deco('board', 12, -2.3, { y: 1.5, w: 2.0, h: 1.0, c: 0xc79763, cork: true });
  b.solid('bench', -11, 2.0, 2.4, 0.5, { h: 0.5, c: 0x294b70 }); b.solid('bench', 12, 2.0, 2.4, 0.5, { h: 0.5, c: 0x6e9273 });
  b.prop('plant', -3.2, 1.8, 0); b.prop('splant', 3.2, 1.8, 0);
  b.prop('trashs', -27.2, 1.8, 0); b.prop('trashs', 27.2, 1.8, 0); b.prop('backpack', -17.3, 1.6, 0.6); b.prop('sportsbag', 17.5, 1.7, 0.3); b.prop('ball', -9.5, 0.6, 0);
  b.deco('clock', -0.1, -0.5, { y: 2.6, rot: Math.PI / 2 }); b.deco('poster2', -24, -2.3, { y: 2.4, w: 1.0, h: 1.4, c: 0xe66ba0 }); b.deco('poster2', 24, -2.3, { y: 2.4, w: 1.0, h: 1.4, c: 0x3174b9 });
  b.deco('sign', -27.8, 0, { y: 2.6, text: 'ممر الصفوف', rot: Math.PI / 2, c: 0x294b70 }); b.deco('sign', 27.8, 0, { y: 2.6, rot: -Math.PI / 2, c: 0x6e9273 });
  b.deco('light', -14, 0, { r: 6, c: 0xffe6b0 }); b.deco('light', 14, 0, { r: 6, c: 0xffe6b0 });
  // ---------- فصل العلوم
  const classroom = (x0, x1, deskC, theme) => { const cx = (x0 + x1) / 2;
    b.solid('tchdesk', cx, -16.0, 2.2, 0.9, { h: 0.78 }); b.deco('board', cx, -17.78, { y: 1.1, w: 4.8, h: 1.3, c: 0x2f4a3f }); b.prop('ochair', cx, -14.9, 0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const x = x0 + 3.3 + c * 3.5, z = -12.2 + r * 2.6; b.solid('studdesk', x, z, 1.3, 0.7, { h: 0.76, c: deskC }); b.prop('schair', x, z + 0.8, Math.PI); }
    b.solid('cabinets', x1 - 0.5, -12, 0.5, 3.0, { h: 1.9 }); b.prop('backpack', x0 + 1.0, -4.2, 1.0); b.prop('bookcrate', x1 - 1.0, -4.0, 0.3); b.prop('trashs', x0 + 1.6, -16.6, 0); b.deco('clock', x1 - 0.2, -10, { y: 2.7, rot: -Math.PI / 2 });
    b.deco('window', x0 + 0.2, -9, { w: 2.2, h: 1.4, y: 1.3, rot: Math.PI / 2 }); b.deco('rug', cx, -9, { w: 3, d: 2, c: theme, c2: 0xf1e8d2 }); b.deco('light', cx, -9, { r: 7, c: 0xfff0cf }); };
  classroom(-28, -14, 0x6e9273, 0x2f6b66); b.prop('projector', -22.5, -5.0, 0); b.solid('globe', -26.8, -15.5, 0.6, 0.6, { h: 1.3 }); b.deco('poster2', -20, -17.78, { y: 2.6, w: 1.2, h: 0.8, c: 0x6ee7b7 });
  classroom(-14, 0, 0xc79763, 0x294b70); b.deco('poster2', -7, -17.78, { y: 2.8, w: 1.6, h: 0.7, c: 0xd6a33e }); b.solid('globe', -10.2, -16.3, 0.6, 0.6, { h: 1.3 });
  // ---------- المكتبة
  [-14.5, -11.5, -8.5].forEach((z) => b.solid('bshelf', 8, z, 9.0, 0.6, { h: 2.1 })); b.solid('bshelf', 13.4, -9, 0.6, 5.0, { h: 2.1 });
  b.solid('rtable', 5, -6.0, 2.6, 1.3, { h: 0.76 }); b.row('schair', 4.2, -7.2, 2, 1.6, 0, 0); b.row('schair', 4.2, -4.8, 2, 1.6, 0, Math.PI);
  b.solid('rtable', 9.5, -5.6, 2.6, 1.3, { h: 0.76 }); b.row('schair', 8.7, -6.8, 2, 1.6, 0, 0); b.solid('sofa', 2.0, -16.4, 3.0, 1.0, { h: 0.85, c: 0xb56d58 });
  b.solid('tchdesk', 1.2, -4.2, 1.8, 0.8, { h: 0.78 }); b.deco('screen', 1.2, -4.2, { y: 0.9, w: 0.7, anim: 'blink', c: 0x9fd8ff }); b.prop('lamp', 12.8, -16.8, 0); b.prop('bookcart', 12.6, -4.4, 0.4); b.prop('bookcrate', 1.0, -13.6, 0.2); b.prop('stool', 11.6, -5.2, 0); b.prop('plant', 13.0, -3.4, 0);
  b.deco('rug', 7, -5.8, { w: 7, d: 3.6, c: 0x8a5a68, c2: 0xd6a33e }); b.deco('light', 7, -9, { r: 7, c: 0xffd9a0 }); b.deco('sign', 7, -17.7, { y: 2.8, text: 'المكتبة', c: 0x6a4a30 }); b.deco('window', 0.2, -10, { w: 2.0, h: 1.4, y: 1.3, rot: Math.PI / 2 });
  // ---------- فصل الفنون
  b.solid('tchdesk', 21, -16.0, 2.2, 0.9, { h: 0.78 }); b.deco('board', 21, -17.78, { y: 1.1, w: 4.8, h: 1.3, c: 0xf3ede0 });
  [[17.5, -12], [21, -12], [24.5, -12], [17.5, -8], [21, -8], [24.5, -8]].forEach(([x, z], i) => { b.solid('easel', x, z, 0.9, 0.9, { h: 1.7, c: [0xe66ba0, 0xf0be49, 0x3174b9, 0x6e9273, 0xb56d58, 0x9d6bff][i] }); b.prop('stool', x, z + 1.0, 0); });
  b.solid('cabinets', 27.4, -12, 0.5, 3.0, { h: 1.9 }); b.prop('bookcrate', 27, -4, 0.4); b.prop('backpack', 14.8, -4, 0); b.prop('splant', 14.9, -16.6, 0); b.deco('poster2', 14.2, -9, { y: 2.2, w: 1.6, h: 1.1, c: 0xe66ba0, rot: 0 }); b.deco('poster2', 27.8, -7, { y: 2.2, w: 1.6, h: 1.1, c: 0xf0be49 }); b.deco('light', 21, -10, { r: 8, c: 0xffe0b0 });
  // ---------- فصل الأدب
  b.solid('tchdesk', -21, 16.0, 2.2, 0.9, { h: 0.78 }); b.deco('board', -21, 17.78, { y: 1.1, w: 4.8, h: 1.3, c: 0x2f4a3f, rot: Math.PI }); b.prop('ochair', -21, 14.9, Math.PI);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const x = -25 + c * 3.5, z = 12.2 - r * 2.6; b.solid('studdesk', x, z, 1.3, 0.7, { h: 0.76, c: 0xb56d58 }); b.prop('schair', x, z - 0.8, 0); }
  b.solid('bshelf', -27.4, 8, 0.6, 3.0, { h: 2.0 }); b.prop('bookcrate', -26.8, 4.0, 0.2); b.prop('backpack', -15, 4.0, 0.7); b.prop('trashs', -15.0, 17.0, 0); b.deco('rug', -21, 8.4, { w: 4, d: 2.4, c: 0xb56d58, c2: 0xf1e8d2 }); b.deco('light', -21, 9, { r: 7, c: 0xffe6c0 });
  b.deco('window', -27.8, 12, { w: 2.2, h: 1.4, y: 1.3, rot: Math.PI / 2 }); b.deco('poster2', -14.2, 12, { y: 2.2, w: 1.4, h: 1.0, c: 0xd6a33e }); b.deco('clock', -14.2, 5, { y: 2.7, rot: Math.PI / 2 });
  // ---------- المختبر
  [[-10.5, 8], [-6.5, 8], [-10.5, 12.5], [-6.5, 12.5]].forEach(([x, z], i) => { b.solid('labtable', x, z, 3.0, 1.2, { h: 0.9, c: i % 2 ? 0x2f6b66 : 0x30383d }); b.prop('stool', x - 0.7, z + 1.0, 0); b.prop('stool', x + 0.7, z + 1.0, 0); });
  b.solid('cabinets', -1.5, 12.5, 0.5, 4.5, { h: 1.9 }); b.solid('sink', -13.4, 17.4, 1.2, 0.5, { h: 0.9 }); b.solid('shelfm', -7, 17.4, 5.5, 0.5, { h: 2.0 }); b.deco('microscope', -10.5, 8, { y: 0.9 }); b.deco('flasks', -6.5, 8, { y: 0.9 }); b.deco('flasks', -10.5, 12.5, { y: 0.9 }); b.deco('microscope', -6.5, 12.5, { y: 0.9 });
  b.prop('projector', -13.0, 4.0, 0.6); b.prop('bag', -1.2, 4.2, 0.3); b.prop('trashs', -12.5, 15.0, 0); b.deco('board', -7, 2.78, { y: 1.2, w: 4, h: 1.2, c: 0x2f4a3f, rot: Math.PI }); b.deco('light', -7, 10, { r: 7, c: 0xdff4ff }); b.deco('poster2', -0.2, 8, { y: 2.2, w: 1.4, h: 1.0, c: 0x6e9273, rot: Math.PI / 2 });
  // ---------- المقصف
  b.solid('cantcounter', 7, 16.2, 9.0, 1.1, { h: 1.05, c: 0xb56d58 }); b.deco('menu', 7, 17.75, { y: 1.9, w: 5, h: 0.9, rot: Math.PI }); b.solid('fridge', 1.4, 17.0, 1.2, 1.0, { h: 1.9 }); b.solid('fridge', 12.6, 17.0, 1.2, 1.0, { h: 1.9 });
  [[3.5, 7], [7, 7], [10.5, 7], [3.5, 11], [7, 11], [10.5, 11]].forEach(([x, z], i) => { b.solid('ctable', x, z, 2.2, 1.0, { h: 0.76, c: [0xf0be49, 0x3174b9, 0xe66ba0][i % 3] }); b.prop('stool', x - 0.8, z + 0.9, 0); b.prop('stool', x + 0.8, z - 0.9, 0); });
  b.prop('goodsbox', 1.2, 14.0, 0.3); b.prop('trashs', 13.2, 14.5, 0); b.prop('bag', 1.2, 4.4, 0.4); b.prop('fruitcrate', 12.6, 13.0, 0.2); b.deco('light', 7, 9, { r: 8, c: 0xffd9a0 }); b.deco('sign', 7, 2.7, { y: 2.8, text: 'المقصف', c: 0xb56d58, rot: Math.PI });
  b.deco('rug', 7, 9, { w: 10, d: 6, c: 0xf0c978, c2: 0xc97b4a });
  // ---------- المدخل
  b.solid('tchdesk', 21, 14.4, 5.0, 1.1, { h: 1.1, c: 0x294b70 }); b.deco('screen', 21, 14.4, { y: 1.25, w: 0.8, anim: 'blink', c: 0x9fd8ff }); b.solid('trophy', 26.8, 8, 0.7, 3.4, { h: 2.0 }); b.solid('trophy', 15.4, 16.4, 3.0, 0.7, { h: 2.0 });
  b.solid('bench', 17, 5.4, 2.6, 0.5, { h: 0.5, c: 0xd6a33e }); b.solid('bench', 25, 5.4, 2.6, 0.5, { h: 0.5, c: 0xd6a33e }); b.prop('plant', 15.4, 4.0, 0); b.prop('plant', 27, 16.7, 0); b.prop('pplant', 26.9, 4.2, 0); b.prop('sportsbag', 24.6, 8.6, 0.5); b.prop('backpack', 17.0, 8.6, 0.2); b.prop('ball', 20, 8, 0);
  b.deco('rug', 21, 9, { w: 8, d: 5, c: 0x294b70, c2: 0xd6a33e }); b.deco('light', 21, 9, { r: 8, c: 0xffe6b0 }); b.deco('sign', 21, 17.75, { y: 2.8, text: 'مدرسة احسمها', c: 0x294b70, rot: Math.PI }); b.deco('flag', 15.0, 10, { y: 1.0 });
  b.label('المدخل', 21, 3.4, 3.0); b.label('المقصف', 7, 3.4, 3.0); b.label('المكتبة', 7, -3.4, 3.0); b.label('فصل العلوم', -21, -3.4, 3.0); b.label('الرياضيات', -7, -3.4, 3.0); b.label('الفنون', 21, -3.4, 3.0); b.label('الأدب', -21, 3.4, 3.0); b.label('المختبر', -7, 3.4, 3.0);
  return b.m;
}
