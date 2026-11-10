// خريطة المستشفى: استقبال مفتوح، ممر رئيسي، طوارئ، مختبر، صيدلية، غرفة عمليات، 3 غرف مرضى، مستودع.
import { mapBuilder } from '../prop-core.js';

export function hospital() {
  const b = mapBuilder({
    id: 'hospital', ready: true, name: 'المستشفى', line: 'كل شيء طبيعي... إلا اللي متخبي بين الأغراض!', w: 56, d: 36, gate: { x: -17, z: 16.4, lv: 0 },
    theme: { sky: 0xbfd0d6, fog: 0xbfd0d6, fogN: 55, fogF: 150, sun: 0xffeccf, sunI: 0.85, amb: 0.34, ambSky: 0xd3e0e2, ambGround: 0x6a5a4c, fillI: 0.32, step: 'tile', wall: 0xd8d3c7, dado: 0x376b77, trim: 0x9c7656, base: 0x5a4636, crown: 0xefe8da, ceil: 0xe9e2d3, lamp: 0xfff0d4, doorFrame: 0x9c7656, door: 0x8a6a4c, ext: 0x8b8f86, floorMul: 1.0, dadoGloss: true, ground: 0x7e8a82 },
    ambience: 'hospital', music: [262, 330, 392],
    tour: [[-17, 16, 2.4, -17, 6, 1.1], [-12, 5, 2.6, 6, 0.5, 1.4], [8, 0.5, 2.8, -12, -2, 1.4], [-21, -4, 3.2, -21, -15, 1.0]],
  });
  const WC = 0xf1f5f7;
  // ---------- أرضيات
  b.room('lobby', -28, 3, -6, 18, { floor: 'stone', c1: 0xb9b4a6, c2: 0xa9a496, wc: 0xd8d3c7, dado: 0x376b77, trim: 0x9c7656 });
  b.room('corridor', -28, -3, 28, 3, { floor: 'stone', c1: 0xa9afab, c2: 0x9aa09c, wc: 0x92afa3, dado: 0x9c7656, trim: 0xd8d3c7 });
  b.room('er', -28, -18, -12, -3, { floor: 'vinyl', c1: 0x7fa1ad, c2: 0x7194a0, wc: 0xcdd9d6, dado: 0x376b77, trim: 0xd8d3c7 });
  b.room('lab', -12, -18, 0, -3, { floor: 'epoxy', c1: 0x6fa59f, c2: 0x62998f, wc: 0xbcd6cc, dado: 0x30383d, trim: 0x92afa3 });
  b.room('pharm', 0, -18, 10, -3, { floor: 'tile', c1: 0xb7c4a6, c2: 0xa7b596, wc: 0xe2dcc9, dado: 0x65805f, trim: 0x9c7656 });
  b.room('or', 10, -18, 28, -3, { floor: 'epoxy', c1: 0x5d9a9b, c2: 0x528d90, wc: 0x6fa7a8, dado: 0x376b77, trim: 0xd8d3c7 });
  [[-6, 3, 'p1'], [3, 12, 'p2'], [12, 21, 'p3']].forEach(([x0, x1, id], i) => b.room(id, x0, 3, x1, 18, { floor: 'wood', c1: [0xc7a27a, 0xb58f68, 0xcfae86][i], c2: [0xb58f68, 0xa07c58, 0xbf9c74][i], wc: [0xa8c1b4, 0xd7cfbd, 0x9fb8c6][i], dado: [0x376b77, 0x9c7656, 0x30506a][i], trim: 0xe6dfcf }));
  b.room('supply', 21, 3, 28, 18, { floor: 'concrete', c1: 0xa9a699, c2: 0x9b988b, wc: 0xc9c2b1, dado: 0x30383d, trim: 0x9c7656 });

  // ---------- جدران
  b.box(-28, -18, 28, 18, { s: [[-17, 5, 'glass']] }, { c: WC });
  b.wall(-28, -3, 28, -3, [[-20, 3], [-6, 2.6], [1.8, 2.6], [19, 4.2, 'double']]);
  b.wall(-12, -18, -12, -3, [[-12, 2.6]]); b.wall(0, -18, 0, -3, [[-10, 2.6]]); b.wall(10, -18, 10, -3, []);
  b.wall(-6, 3, 28, 3, [[-1.5, 2.6], [7.5, 2.6], [16.5, 2.6], [24.5, 2.6]]);
  b.wall(-6, 3, -6, 18, [[10, 2.6]]); b.wall(3, 3, 3, 18, [[9, 2.6]]); b.wall(12, 3, 12, 18, [[9, 2.6]]); b.wall(21, 3, 21, 18, [[9, 2.6]]);
  // دورات مياه صغيرة بكل غرفة مرضى (جنوب الغرفة)
  [[-6, -3], [3, 6], [12, 15]].forEach(([x0, x1]) => { b.wall(x0, 14.4, x1, 14.4, [], { h: 3.0 }); b.wall(x1, 14.4, x1, 18, [[16.4, 1.5]], { h: 3.0 });
    b.solid('toilet', x0 + 0.9, 17.2, 0.6, 0.8, { h: 0.8 }); b.solid('sink', x0 + 2.2, 17.6, 0.7, 0.5, { h: 0.9 }); });

  // ---------- الاستقبال
  b.solid('curvedesk', -16.5, 9.7, 9.0, 1.5, { h: 1.15, c: 0x7fc4d6 }); b.solid('curvedesk', -13.1, 7.0, 1.5, 4.0, { h: 1.15, c: 0x7fc4d6 });
  b.deco('screen', -18.0, 9.0, { y: 1.2, w: 0.9, anim: 'blink', c: 0x7fe0ff }); b.deco('screen', -15.4, 9.0, { y: 1.2, w: 0.9, anim: 'blink', c: 0x9fffd0 });
  b.deco('ticket', -11.2, 5.4, { rot: 0 });
  b.deco('rug', -17, 13.4, { w: 8, d: 3.6, c: 0x5fb5c9, c2: 0x3f95a9 });
  b.row('wchair', -26.5, 16.9, 5, 1.15, 0, Math.PI); b.row('wchair', -7.3, 6.2, 4, 0, 1.2, -Math.PI / 2);
  b.prop('plant', -27, 4.6, 0); b.prop('plant', -7.2, 17.0, 0); b.prop('plant', -12.2, 12.2, 0);
  b.prop('trashm', -24.2, 4.4, 0); b.prop('trashm', -7.4, 11.2, 0); b.prop('cooler', -7.3, 15.4, -Math.PI / 2); b.prop('medcart', -23.5, 11.0, 0.4);
  b.prop('monitor', -20.8, 7.7, 0); b.prop('wheelch', -26.4, 9.0, 0.3); b.prop('ivstand', -9.6, 4.6, 0);
  b.deco('sign', -26, 10, { rot: 1.57, text: 'الاستقبال', y: 2.3, c: 0x2f8fa3, wallX: -27.8 });
  b.deco('clock', -27.8, 7, { y: 2.6, rot: Math.PI / 2 });
  b.label('الاستقبال', -17, 3.3, 3.0); b.deco('autodoor', -17, 18, { w: 5, axis: 'x' });

  // ---------- الطوارئ
  [-25, -20, -15].forEach((x, i) => { b.solid('hbed', x, -15.7, 1.15, 2.4, { h: 0.9, c: 0x9ed0e6 }); b.prop('monitor', x + 1.6, -16.9, 0); b.deco('exlamp', x, -15.7, { y: 3.0 }); });
  [-22.5, -17.5].forEach((x) => b.solid('curtain', x, -15.2, 0.14, 5.6, { h: 2.3, c: 0x7fc4d6 }));
  b.solid('cabinet', -27.3, -10, 0.8, 2.4, { h: 1.7 }); b.solid('cabinet', -27.3, -6.2, 0.8, 2.0, { h: 1.7 });
  b.prop('ivstand', -26.6, -13.0, 0); b.prop('ivstand', -21.6, -12.6, 0); b.prop('medcart', -19.5, -8.4, 0.2); b.prop('medcart', -14.2, -6.2, -0.4);
  b.prop('wheelch', -24.6, -5.0, 0.5); b.prop('trashm', -13.2, -4.2, 0); b.prop('sidetblm', -23.0, -8.4, 0); b.prop('supplybox', -26.8, -3.9, 0.2); b.prop('lockerm', -13.0, -10.4, Math.PI / 2);
  b.deco('sign', -20, -2.7, { text: 'الطوارئ', y: 2.75, c: 0xd94f4f }); b.label('الطوارئ', -20, -2.5, 3.1, 0, '#fecaca');
  b.deco('rug', -20, -9.5, { w: 6, d: 4, c: 0xd9e8f2, c2: 0xc2d7e6 });

  // ---------- المختبر
  b.solid('bench', -5.5, -13.3, 7, 1.2, { h: 1.0, c: 0x4a7f8f }); b.solid('bench', -5.5, -8.4, 7, 1.2, { h: 1.0, c: 0x4a7f8f });
  b.deco('microscope', -7.5, -13.3, { y: 1.0 }); b.deco('microscope', -3.5, -8.4, { y: 1.0 }); b.deco('flasks', -5, -13.3, { y: 1.0 });
  b.solid('fridge', -10.9, -17.2, 1.2, 0.9, { h: 1.9, c: 0xe8f1f6 }); b.solid('fridge', -9.5, -17.2, 1.2, 0.9, { h: 1.9, c: 0xe8f1f6 });
  b.solid('shelf', -11.4, -6.2, 0.6, 3.2, { h: 2.0, c: 0xc9d9e0 }); b.solid('shelf', -2, -17.4, 3.4, 0.6, { h: 2.0, c: 0xc9d9e0 });
  b.prop('supplybox', -1.0, -5.5, 0); b.prop('monitor', -3.0, -5.0, 0); b.prop('trashm', -10.8, -4.1, 0); b.prop('plant', -0.9, -14.0, 0); b.prop('sidetblm', -1.0, -8.4, 0); b.prop('lockerm', -4.8, -16.9, 0);
  b.deco('sign', -6, -2.7, { text: 'المختبر', y: 2.75, c: 0x2f9f93 }); b.label('المختبر', -6, -2.5, 3.1, 0, '#c7fff6');

  // ---------- الصيدلية
  b.solid('shelf', 5, -17.4, 8.6, 0.6, { h: 2.2, c: 0xe3e8e0, med: true }); b.solid('shelf', 3.3, -13.2, 3.0, 0.7, { h: 2.0, c: 0xe3e8e0, med: true }); b.solid('shelf', 7.7, -13.2, 3.0, 0.7, { h: 2.0, c: 0xe3e8e0, med: true });
  b.solid('shelf', 3.3, -10.0, 3.0, 0.7, { h: 2.0, c: 0xe3e8e0, med: true }); b.solid('shelf', 7.7, -10.0, 3.0, 0.7, { h: 2.0, c: 0xe3e8e0, med: true });
  b.solid('counter', 6.7, -5.9, 5.4, 1.1, { h: 1.1, c: 0x7fc4d6 }); b.deco('screen', 5.2, -5.9, { y: 1.15, w: 0.8, anim: 'blink', c: 0xa3ffcf }); b.deco('screen', 8.0, -5.9, { y: 1.15, w: 0.8, c: 0x7fe0ff });
  b.prop('supplybox', 1.3, -16.6, 0); b.prop('supplybox', 9.2, -16.6, 0.2); b.prop('trashm', 9.3, -4.3, 0); b.prop('sidetblm', 1.3, -7.6, 0); b.prop('plant', 9.2, -8.0, 0); b.prop('lockerm', 1.2, -13.0, 0);
  b.deco('sign', 1.8, -2.7, { text: 'صيدلية', y: 2.75, c: 0x4f9f4f }); b.label('الصيدلية', 1.8, -2.5, 3.1, 0, '#d6ffd6');

  // ---------- غرفة العمليات
  b.solid('optable', 19, -10.5, 1.3, 2.7, { h: 1.0, c: 0x9fc9c4 }); b.deco('oplight', 19, -10.5, { y: 3.1 });
  b.solid('instr', 22.4, -10.5, 0.8, 1.8, { h: 0.95, c: 0xd8e3e8 }); b.solid('instr', 15.6, -10.5, 0.8, 1.8, { h: 0.95, c: 0xd8e3e8 });
  [14.4, 18.2, 22.0].forEach((x) => b.solid('cabinet', x, -17.4, 2.2, 0.7, { h: 1.7, c: 0xd9e5ea }));
  b.prop('monitor', 16.4, -14.6, 0); b.prop('monitor', 21.8, -14.6, 0); b.prop('ivstand', 13.4, -7.2, 0); b.prop('ivstand', 24.6, -7.2, 0); b.prop('medcart', 14.2, -12.8, 0.3);
  b.prop('trashm', 26.8, -4.4, 0); b.prop('sidetblm', 26.4, -9.0, 0); b.prop('supplybox', 26.6, -15.6, 0.3); b.prop('lockerm', 11.0, -16.5, 0);
  b.deco('sign', 19, -2.7, { text: 'غرفة العمليات', y: 2.75, c: 0xd94f4f }); b.label('العمليات', 19, -2.5, 3.1, 0, '#fecaca');

  // ---------- غرف المرضى (تختلف بالترتيب)
  const pr = [
    { x0: -6, x1: 3, bx: 0.6, side: 'e', n: 101, tv: 'e' }, { x0: 3, x1: 12, bx: 9.0, side: 'w', n: 102, tv: 'w' }, { x0: 12, x1: 21, bx: 16.5, side: 'n', n: 103, tv: 'e' },
  ];
  pr.forEach((r) => {
    b.solid('hbed', r.bx, 12.6, 1.15, 2.4, { h: 0.9, c: 0xa7d3e8 });
    b.solid('wardrobe', r.side === 'w' ? r.x1 - 0.6 : r.x0 + 0.6, r.side === 'n' ? 5.4 : 6.0, 0.8, 1.7, { h: 2.0, c: 0xd9c49b });
    b.prop('sidetblm', r.bx + 1.3, 17.2, 0); b.prop('wchair', r.bx - 1.6, 11.4, Math.PI / 2 * (r.side === 'w' ? 1 : -1)); b.prop('lockerm', { 0.6: -1.3, 9.0: 7.1, 16.5: 19.9 }[r.bx], 17.3, 0);
    b.deco('tv', r.tv === 'e' ? r.x1 - 0.25 : r.x0 + 0.25, 11, { y: 1.9, rot: r.tv === 'e' ? -Math.PI / 2 : Math.PI / 2, anim: 'tv' });
    b.deco('window', r.bx - 1.0, 17.8, { w: 2.2, h: 1.5, y: 1.2 }); b.deco('winCurtain', r.bx - 1.0, 17.7, { w: 2.6 });
    b.deco('rug', r.bx, 8.4, { w: 3.2, d: 2.2, c: 0xb0cfe0, c2: 0x9bbdd3 });
    b.label('غرفة ' + r.n, r.x0 + 4.5, 2.5, 3.0, 0, '#ffffff');
  });
  b.prop('plant', 11.2, 4.4, 0); b.prop('trashm', 2.4, 4.4, 0); b.prop('supplybox', 20.2, 4.4, 0); b.prop('medcart', 14.5, 4.6, 0.5);
  // ---------- المستودع
  [5.4, 8.8, 12.2].forEach((z) => b.solid('shelf', 27.3, z, 0.7, 2.8, { h: 2.1, c: 0x9aa5ad }));
  b.prop('supplybox', 22.2, 16.8, 0); b.prop('supplybox', 23.2, 16.8, 0.2); b.prop('supplybox', 22.0, 15.8, 0.1); b.prop('wheelch', 22.4, 6.2, 0.4); b.prop('wheelch', 22.4, 7.4, -0.3);
  b.prop('ivstand', 23.8, 4.6, 0); b.prop('ivstand', 24.6, 4.6, 0); b.prop('medcart', 24.6, 14.6, 0.2); b.prop('trashm', 22.0, 11.6, 0); b.prop('lockerm', 26.4, 16.8, 0);
  b.deco('sign', 24.5, 2.7, { text: 'مستودع', y: 2.75, c: 0x7a8791 }); b.label('المستودع', 24.5, 2.5, 3.1, 0, '#e5e7eb');

  // ---------- الممر
  b.row('wchair', -15.2, -2.3, 3, 1.0, 0, 0); b.row('wchair', 5.6, -2.3, 3, 1.0, 0, 0); b.row('wchair', 24.6, -2.3, 2, 1.0, 0, 0);
  b.prop('wheelch', 4.0, 2.2, Math.PI); b.prop('wheelch', 5.3, 2.2, Math.PI); b.prop('cooler', 11.2, 2.3, Math.PI); b.prop('medcart', 14.2, 0.6, 1.2);
  b.prop('plant', -4.2, -2.1, 0); b.prop('plant', 27, -2.2, 0); b.prop('plant', 27, 2.2, 0); b.prop('trashm', -9.4, -2.2, 0); b.prop('trashm', 20.8, 2.2, 0); b.prop('ivstand', 12.6, -2.1, 0);
  b.deco('strip', 0, 0, { x0: -28, z0: -0.15, x1: 28, z1: 0.15, c: 0x4fb3d1 }); b.deco('strip', 0, 0, { x0: -28, z0: 1.2, x1: 28, z1: 1.5, c: 0x9fe0b0 });
  b.deco('clock', 14, -2.8, { y: 2.6, rot: 0 }); b.deco('painting', -22, 2.8, { w: 1.6, h: 1.0, y: 1.9, c: 0x66b8d4 });
  // نوافذ جدار الشمال/الجنوب
  [-24, -17, -6, 3, 14, 24].forEach((x) => b.deco('window', x, -17.8, { w: 2.2, h: 1.5, y: 1.3 })); [-24, -9, 9, 18, 26].forEach((x) => { if (x > -6) b.deco('window', x, 17.8, { w: 2.2, h: 1.5, y: 1.3 }); });
  b.deco('light', -17, 10, { r: 5, c: 0xeaf6ff }); b.deco('light', 0, 0, { r: 5, c: 0xeaf6ff }); b.deco('light', 19, -10, { r: 5, c: 0xcffff4 }); b.deco('light', -20, -10, { r: 5, c: 0xeaf6ff });
  return b.m;
}
