// خريطة الفندق: لوبي فاخر بدرج كبير، مطعم، صالة وبار، مطبخ، وطابق علوي بممر و6 غرف نزلاء.
import { mapBuilder } from '../prop-core.js';

export function hotel() {
  const b = mapBuilder({
    id: 'hotel', ready: true, name: 'الفندق الفاخر', line: 'خمس نجوم... وواحد منكم صار حقيبة!', w: 56, d: 36, gate: { x: -18, z: 16.4, lv: 0 },
    theme: { sky: 0x2a2f3a, fog: 0x3a3a40, fogN: 55, fogF: 150, sun: 0xffe2b8, sunI: 0.62, amb: 0.34, ambSky: 0xf0dcc0, ambGround: 0x4a3a30, fillI: 0.32, step: 'marble', wall: 0xd6c3a5, dado: 0x49362d, trim: 0xb18b50, base: 0x25282a, crown: 0xe9dcc2, ceil: 0xe3d3b8, lamp: 0xffe2b0, doorFrame: 0x49362d, door: 0x49362d, ext: 0x25282a, floorMul: 1.0, dadoGloss: true, ground: 0x4a5a48 },
    ambience: 'hotel', music: [247, 311, 370],
    tour: [[-18, 15, 2.8, -18, 2, 1.4], [-8, 0, 2.8, 10, -8, 1.4], [8, 12, 3.0, 8, 4, 1.3], [-6, 1, 1.8, 14, 1, 1.6]],
  });
  // ---------- الطابق الأرضي
  b.room('lobbyW', -28, -18, -12, 18, { floor: 'marble', c1: 0xc9b99a, c2: 0xb8a888, wc: 0xd6c3a5, dado: 0x24564a, trim: 0xb18b50 });
  b.room('stair', -12, -2.8, -5, 2.8, { floor: 'marble', c1: 0xc9b99a, c2: 0xb8a888, noCeiling: true, spawn: false, skipCheck: true, wc: 0x24564a, dado: 0x49362d, trim: 0xb18b50 });
  b.room('lobbyN', -12, -18, 2, -2.8, { floor: 'marble', c1: 0xc9b99a, c2: 0xb8a888, wc: 0xd6c3a5, dado: 0x713b43, trim: 0xb18b50 });
  b.room('lobbyS', -12, 2.8, 2, 18, { floor: 'marble', c1: 0xc9b99a, c2: 0xb8a888, wc: 0xd6c3a5, dado: 0x713b43, trim: 0xb18b50 });
  b.room('lobbyE', -5, -2.8, 2, 2.8, { floor: 'marble', c1: 0xc9b99a, c2: 0xb8a888, wc: 0xd6c3a5, dado: 0x49362d, trim: 0xb18b50 });
  b.room('resto', 2, -18, 28, 4, { floor: 'parquet', c1: 0x8a5a3a, c2: 0x7a4c30, wc: 0x713b43, dado: 0x49362d, trim: 0xb18b50 });
  b.room('lounge', 2, 4, 14, 18, { floor: 'carpet', c1: 0x24564a, c2: 0x1c4a3e, wc: 0x2f4f46, dado: 0x49362d, trim: 0xb18b50 });
  b.room('kitchen', 14, 4, 28, 18, { floor: 'tile', c1: 0x9aa0a0, c2: 0x8a9090, wc: 0xd6d2c4, dado: 0x30383d, trim: 0xb18b50 });
  // ---------- جدران الطابق الأرضي
  b.box(-28, -18, 28, 18, { s: [[-18, 5, 'glass']] }, {});
  b.wall(2, -18, 2, 18, [[-9, 4.2, 'open'], [11, 4.2, 'open']]);
  b.wall(2, 4, 28, 4, [[8, 3.0, 'open'], [21, 2.4]]); b.wall(14, 4, 14, 18, [[11, 2.4]]);
  b.wall(-12, -2.8, -5, -2.8, [], { lv: 2 }); b.wall(-12, 2.8, -5, 2.8, [], { lv: 2 });
  b.stairs(-12, -2.8, -5, 2.8, 'x', 1); b.solid('stairs', -8.5, 0, 7.0, 5.6, { h: 3.7, axis: 'x', dir: 1, hit: false });
  // ---------- اللوبي
  b.solid('recdesk', -20, 12.4, 7.0, 1.4, { h: 1.15 }); b.deco('painting', -20, 17.78, { y: 1.8, w: 3.6, h: 1.4, c: 0x24564a, rot: Math.PI }); b.deco('screen', -22, 12.4, { y: 1.25, w: 0.8, anim: 'blink', c: 0x9fd8ff }); b.deco('screen', -18, 12.4, { y: 1.25, w: 0.8, anim: 'blink', c: 0xffe3a0 });
  [[-24, 5], [-16, 5], [-24, -8], [-16, -8], [-7, -9], [-7, 9]].forEach(([x, z], i) => b.solid('column', x, z, 0.9, 0.9, { h: 3.4, c: i % 2 ? 0x24564a : 0xd6c3a5 }));
  b.solid('sofa', -24, -2.0, 4.0, 1.1, { h: 0.9, c: 0x713b43 }); b.solid('sofa', -17, -2.0, 4.0, 1.1, { h: 0.9, c: 0x24564a }); b.solid('coffee', -20.5, -5.2, 2.2, 1.2, { h: 0.42, c: 0x25282a }); b.deco('rug', -20.5, -4.2, { w: 9, d: 5.5, c: 0x713b43, c2: 0xb18b50 });
  b.solid('sofa', -9, -12.6, 5.0, 1.1, { h: 0.9, c: 0xb18b50 }); b.solid('sofa', -4, 12.6, 5.0, 1.1, { h: 0.9, c: 0x713b43 }); b.solid('coffee', -9, -10.2, 2.0, 1.0, { h: 0.42, c: 0x25282a }); b.solid('coffee', -4, 10.2, 2.0, 1.0, { h: 0.42, c: 0x25282a });
  b.deco('rug', -9, -9.5, { w: 6, d: 5, c: 0x24564a, c2: 0xd6c3a5 }); b.deco('rug', -4, 9.8, { w: 6, d: 5, c: 0x713b43, c2: 0xd6c3a5 }); b.deco('rug', -20, 7.6, { w: 9, d: 3.6, c: 0x24564a, c2: 0xb18b50 });
  [-20.5, -9, -4, 0].forEach((x, i) => b.deco('chand', x, [-4.2, -9.5, 9.8, 0][i], { y: 3.2 })); b.deco('light', -20, 6, { r: 9, c: 0xffd9a0 }); b.deco('light', -7, -9, { r: 7, c: 0xffd9a0 }); b.deco('light', -4, 9.8, { r: 7, c: 0xffd9a0 }); b.deco('light', -20.5, -4, { r: 8, c: 0xffd9a0 });
  [-14, -2, 0].forEach((z, i) => b.deco('panel', -27.78, z - 4, { y: 0.9, w: 4, h: 2.2, rot: Math.PI / 2 })); b.deco('panel', -9, -17.78, { y: 0.9, w: 5, h: 2.2 }); b.deco('painting', -27.8, -9, { y: 1.8, w: 2.4, h: 1.5, c: 0x713b43, rot: Math.PI / 2 }); b.deco('clock', -27.8, 8.2, { y: 2.8, rot: Math.PI / 2 });
  b.prop('pplant', -27, -16.8, 0); b.prop('pplant', -27, 16.8, 0); b.prop('pplant', 1.2, 16.8, 0); b.prop('pplant', -11, 16.8, 0); b.prop('pplant', -11, -16.8, 0); b.prop('pplant', 1.2, -16.8, 0);
  b.prop('luggagecart', -24.4, 8.8, 0.5); b.prop('luggagecart', -12.8, 4.4, 1.2); b.row('suitcase', -26.8, 9.0, 1, 0, 0, 0.3); b.prop('suitcase', -22.4, 9.6, 0.6); b.prop('suitcase', -14.6, 9.4, -0.4); b.prop('suitcase', -26.4, 1.4, 0.2);
  b.prop('lchair', -27, 2.4, 0.5); b.prop('lchair', -13.4, -4.8, 2); b.prop('lchair', -10.8, -6.6, 3.5); b.prop('lchair', -7.2, -6.6, -2.2); b.prop('lchair', -6.4, 7.0, 0.7); b.prop('lchair', -1.8, 7.0, -0.7); b.prop('hbench', -13.8, 14.8, 0); b.prop('hbench', -6.5, -15.4, 3.14);
  b.prop('ltable', -26.8, -4.6, 0); b.prop('ltable', -13.4, -14.4, 0); b.prop('lamptbl', -10.6, -4.2, 0); b.prop('lamptbl', -13.4, 1.2, 0); b.prop('bin2', -12.6, 16.6, 0); b.prop('bin2', -12.6, -4.2, 0); b.prop('servicebox', 0.8, 12.6, 0.3); b.prop('servicebox', 0.6, -4.0, -0.4);
  b.label('الاستقبال', -20, 3.6, 3.0); b.label('الدرج الكبير', -8.5, -3.4, 3.0);
  // ---------- المطعم
  b.solid('buffet', 15, -17.0, 22.0, 1.2, { h: 1.0 }); b.deco('sign', 15, -17.7, { y: 2.9, text: 'البوفيه', c: 0x713b43, w: 2.0 });
  [[6.5, -12], [11.5, -12], [16.5, -12], [21.5, -12], [6.5, -6], [11.5, -6], [16.5, -6], [21.5, -6], [26.0, -9.5]].forEach(([x, z], i) => { b.solid('rdtable', x, z, 1.5, 1.5, { h: 0.78, c: i % 2 ? 0x713b43 : 0x24564a }); b.prop('lchair', x - 1.25, z, 0.0); b.prop('lchair', x + 1.25, z, Math.PI); b.prop('lchair', x, z - 1.25, Math.PI / 2); b.prop('lchair', x, z + 1.25, -Math.PI / 2); });
  b.deco('rug', 14, -9, { w: 24, d: 11, c: 0x4a2e22, c2: 0xb18b50 }); b.deco('chand', 11.5, -9, { y: 3.2 }); b.deco('chand', 21.5, -9, { y: 3.2 }); b.deco('chand', 6.5, -9, { y: 3.2 }); b.deco('light', 14, -9, { r: 11, c: 0xffd9a0 });
  b.deco('window', 27.8, -12, { w: 2.4, h: 1.6, y: 1.3, rot: -Math.PI / 2 }); b.deco('window', 27.8, 0, { w: 2.4, h: 1.6, y: 1.3, rot: -Math.PI / 2 }); b.deco('curtain', 27.7, -12, { w: 3.4, rot: -Math.PI / 2 }); b.deco('painting', 14, 3.78, { y: 1.8, w: 3.0, h: 1.3, c: 0xb18b50, rot: Math.PI });
  b.prop('pplant', 27, 3.0, 0); b.prop('pplant', 3.0, 3.0, 0); b.prop('servicebox', 25.5, -15.4, 0.4); b.prop('bin2', 3.0, -16.8, 0); b.prop('luggagecart', 3.4, -1.6, 2.2);
  // ---------- الصالة والبار
  b.solid('bar', 8, 16.2, 9.0, 1.2, { h: 1.1 }); [4.6, 6.4, 8.2, 10.0, 11.6].forEach((x) => b.prop('lamptbl', x, 14.8, 0)); b.deco('mirror', 8, 17.78, { y: 1.2, w: 5.0, h: 1.4, rot: Math.PI });
  b.solid('sofa', 5.2, 7.6, 3.6, 1.1, { h: 0.9, c: 0x713b43 }); b.solid('sofa', 11, 9.6, 1.1, 3.4, { h: 0.9, c: 0xb18b50 }); b.solid('coffee', 7.4, 10.2, 1.6, 1.0, { h: 0.42, c: 0x25282a }); b.prop('lchair', 4.2, 11.6, 0.6); b.prop('lchair', 9.6, 12.2, -0.9); b.deco('rug', 7.6, 10, { w: 6, d: 4.6, c: 0x713b43, c2: 0xb18b50 });
  b.deco('chand', 7.6, 10, { y: 3.2 }); b.deco('light', 8, 11, { r: 6, c: 0xffd0a0 }); b.prop('pplant', 13.2, 5.0, 0); b.prop('pplant', 2.8, 16.8, 0); b.prop('ltable', 13.2, 14.2, 0); b.prop('lamptbl', 3.0, 5.4, 0);
  // ---------- المطبخ
  [18, 22, 26].forEach((x) => b.solid('ksteel', x, 8, 1.4, 3.6, { h: 0.95 })); b.solid('stove', 17.5, 17.0, 5.0, 1.2, { h: 0.95 }); b.solid('ksteel', 24.5, 17.2, 5.0, 1.0, { h: 0.95 }); b.solid('fridge2', 15.0, 5.2, 1.2, 1.0, { h: 2.0 }); b.solid('fridge2', 27.0, 5.2, 1.2, 1.0, { h: 2.0 });
  b.prop('servicebox', 15.3, 11.0, 0.2); b.prop('bin2', 27.0, 12.6, 0); b.prop('servicebox', 26.8, 14.8, 0.6); b.prop('suitcase', 20.0, 13.0, 0.5); b.prop('bin2', 15.3, 14.2, 0); b.deco('light', 21, 11, { r: 8, c: 0xfff0d0 });
  // ---------- الطابق العلوي
  b.room('ucorr', -5, -3, 28, 3, { floor: 'diamond', c1: 0x713b43, c2: 0x5a2e35, lv: 1, wc: 0xd6c3a5, dado: 0x24564a, trim: 0xb18b50 });
  [[-5, 6, 'r1', 0x24564a, 0x6e5a3a], [6, 17, 'r2', 0x713b43, 0x3a4a5a], [17, 28, 'r3', 0x49362d, 0x24564a]].forEach(([x0, x1, id, wc, cc], i) => { b.room(id, x0, -18, x1, -3, { floor: 'carpet', c1: cc, c2: cc, lv: 1, wc, dado: 0x25282a, trim: 0xb18b50 }); b.room('s' + id, x0, 3, x1, 18, { floor: 'carpet', c1: cc, c2: cc, lv: 1, wc: [0x713b43, 0x24564a, 0x3a4a5a][i], dado: 0x25282a, trim: 0xb18b50 }); });
  b.box(-5, -18, 28, 18, { w: [[0, 5.6]] }, { lv: 1 });
  b.wall(-5, -3, 28, -3, [[0.5, 2.2], [11.5, 2.2], [22.5, 2.2]], { lv: 1 }); b.wall(-5, 3, 28, 3, [[0.5, 2.2], [11.5, 2.2], [22.5, 2.2]], { lv: 1 });
  b.wall(6, -18, 6, -3, [], { lv: 1 }); b.wall(17, -18, 17, -3, [], { lv: 1 }); b.wall(6, 3, 6, 18, [], { lv: 1 }); b.wall(17, 3, 17, 18, [], { lv: 1 });
  [[-5, 6, -1, 'r1'], [6, 17, -1, 'r2'], [17, 28, -1, 'r3'], [-5, 6, 1, 'sr1'], [6, 17, 1, 'sr2'], [17, 28, 1, 'sr3']].forEach(([x0, x1, sd, id], i) => { const cx = (x0 + x1) / 2, zf = sd < 0 ? -16.4 : 16.4, zc = sd < 0 ? -4.0 : 4.0, zb = sd * 11, sg = -sd; const c = [0x713b43, 0x24564a, 0xb18b50][i % 3];
    b.solid('kbed', cx, sd * 14.0, 2.4, 2.6, { lv: 1, h: 0.95, c, rot: sd }); b.solid('nightstand', cx - 1.9, sd * 16.8, 0.6, 0.6, { lv: 1, h: 0.6 }); b.solid('nightstand', cx + 1.9, sd * 16.8, 0.6, 0.6, { lv: 1, h: 0.6 }); b.prop('lamptbl', cx - 2.7, sd * 16.8, 0, 1); b.prop('lamptbl', cx + 2.7, sd * 16.8, 0, 1);
    b.solid('desk', x1 - 0.7, sd * 8.6, 0.8, 2.4, { lv: 1, h: 0.76 }); b.prop('lchair', x1 - 1.7, sd * 8.6, -Math.PI / 2, 1); b.solid('wardrobe', x0 + 0.5, sd * 9.4, 0.6, 3.2, { lv: 1, h: 2.2 }); b.solid('sofa', cx, sd * 6.0, 2.8, 1.0, { lv: 1, h: 0.85, c: 0x25282a }); b.deco('rug', cx, sd * 11.4, { w: 4.6, d: 3.6, c: c, c2: 0xd6c3a5, lv: 1 });
    b.prop('suitcase', x0 + 1.6, sd * 12.8, 0.4, 1); b.prop('bin2', x1 - 0.7, sd * 5.0, 0, 1); b.prop('ltable', cx + 2.5, sd * 6.4, 0, 1); b.prop('servicebox', x0 + 1.0, sd * 5.0, 0.3, 1); b.prop('lchair', x0 + 1.5, sd * 15.8, 0.5, 1);
    b.deco('window', cx, sd * 17.78, { w: 2.4, h: 1.5, y: 1.3, lv: 1, rot: sd > 0 ? Math.PI : 0 }); b.deco('curtain', cx, sd * 17.7, { w: 3.4, lv: 1, rot: sd > 0 ? Math.PI : 0 }); b.deco('chand', cx, sd * 10.5, { y: 3.2, lv: 1 }); b.deco('light', cx, sd * 11, { r: 6, c: 0xffd9a0, lv: 1 }); b.deco('tv', cx, sd * 5.0, { y: 1.3, lv: 1, rot: sd > 0 ? 0 : Math.PI });
    b.deco('painting', x0 + 0.2, sd * 12, { y: 1.8, w: 1.6, h: 1.0, c, lv: 1, rot: Math.PI / 2 }); });
  [-1, 1].forEach((sd, i) => { b.prop('pplant', 27, sd * 2.2, 0, 1); b.prop('lamptbl', 8.5 + i * 7, sd * 2.4, 0, 1); }); b.prop('ltable', 16.6, -2.3, 0, 1); b.prop('luggagecart', 3.5, 2.2, 0.3, 1); b.prop('servicebox', 14, 2.3, 0.2, 1);
  b.deco('rug', 11, 0, { w: 30, d: 2.2, c: 0x713b43, c2: 0xb18b50, lv: 1 }); [0, 12, 24].forEach((x) => b.deco('chand', x, 0, { y: 3.2, lv: 1 })); b.deco('light', 12, 0, { r: 10, c: 0xffd9a0, lv: 1 }); b.deco('painting', 14, -2.78, { y: 1.8, w: 2.0, h: 1.1, c: 0xb18b50, lv: 1 }); b.deco('painting', 20, 2.78, { y: 1.8, w: 2.0, h: 1.1, c: 0x24564a, lv: 1, rot: Math.PI });
  b.label('الطابق العلوي', 6, 0, 3.0, 1);
  return b.m;
}
