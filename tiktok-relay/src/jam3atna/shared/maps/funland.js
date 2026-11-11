// خريطة مركز الألعاب: صالة أركيد، بولينج، ركن جوائز، مطاعم، ومنطقة أطفال.
import { mapBuilder } from '../prop-core.js';

export function funland() {
  const b = mapBuilder({
    id: 'funland', ready: true, name: 'مركز الألعاب', line: 'ضوضاء وضحك... وواحد منكم صار دمية!', w: 56, d: 36, gate: { x: -2, z: 16.4, lv: 0 },
    theme: { sky: 0x1b1630, fog: 0x2a2040, fogN: 50, fogF: 130, sun: 0xd9c8ff, sunI: 0.55, amb: 0.4, ambSky: 0xcdb8f0, ambGround: 0x3a2850, fillI: 0.36, step: 'carpet', wall: 0x3b2a5c, dado: 0x24232c, trim: 0xe66ba0, base: 0x24232c, crown: 0x5a4380, ceil: 0x2d2142, lamp: 0xd8c8ff, doorFrame: 0xe66ba0, door: 0x3174b9, ext: 0x24232c, floorMul: 1.0, dadoGloss: true, ground: 0x30284a },
    ambience: 'funland', music: [392, 523, 659],
    tour: [[-2, 15, 2.8, -2, 3, 1.3], [-14, -2, 3.0, -14, -14, 1.4], [14, -2, 3.0, 14, -12, 1.4], [-20, 14, 2.8, -20, 6, 1.3]],
  });
  b.room('arcade', -28, -18, 4, 2, { floor: 'diamond', c1: 0x4a2f7a, c2: 0x3a2562, wc: 0x34204f, dado: 0x24232c, trim: 0x3174b9 });
  b.room('bowling', 4, -18, 28, 2, { floor: 'parquet', c1: 0xc79763, c2: 0xb2854f, wc: 0x2a3f78, dado: 0x24232c, trim: 0xf0be49 });
  b.room('prize', -28, 2, -12, 18, { floor: 'confetti', c1: 0xc9a0c8, c2: 0xb88fb8, wc: 0xe66ba0, dado: 0x34204f, trim: 0xf0be49 });
  b.room('food', -12, 2, 8, 18, { floor: 'tile', c1: 0xc9884e, c2: 0xb8783e, wc: 0xe8874d, dado: 0x34204f, trim: 0xf0be49 });
  b.room('kids', 8, 2, 28, 18, { floor: 'confetti', c1: 0x7fb4e0, c2: 0x6fa4d0, wc: 0x3174b9, dado: 0xf0be49, trim: 0xe66ba0 });
  b.box(-28, -18, 28, 18, { s: [[-2, 5, 'double']] }, {});
  b.wall(-28, 2, 28, 2, [[-20, 4.2, 'open'], [-2, 4.4, 'open'], [18, 4.2, 'open']]); b.wall(4, -18, 4, 2, [[-8, 4.4, 'open']]); b.wall(-12, 2, -12, 18, [[10, 3.2, 'open']]); b.wall(8, 2, 8, 18, [[10, 3.2, 'open']]);
  // ---------- صالة الأركيد
  const CAB = [0xe66ba0, 0x3174b9, 0xf0be49, 0x9d6bff, 0x34d399, 0xe8874d];
  for (let i = 0; i < 8; i++) b.solid('arcade', -26.4 + i * 1.2, -17.2, 0.9, 0.9, { h: 1.9, c: CAB[i % 6], rot: 0 });
  for (let i = 0; i < 6; i++) b.solid('arcade', -12 + i * 1.2, -17.2, 0.9, 0.9, { h: 1.9, c: CAB[(i + 2) % 6], rot: 0 });
  for (let i = 0; i < 7; i++) { b.solid('arcade', -24 + i * 1.2, -11.4, 0.9, 0.9, { h: 1.9, c: CAB[(i + 1) % 6], rot: Math.PI }); b.solid('arcade', -24 + i * 1.2, -10.4, 0.9, 0.9, { h: 1.9, c: CAB[(i + 4) % 6], rot: 0 }); }
  for (let i = 0; i < 6; i++) b.solid('claw', -25 + i * 4.8, -3.6, 1.4, 1.4, { h: 2.1, c: CAB[i % 6] });
  b.solid('airhockey', -22, -6.4, 1.4, 2.6, { h: 0.85 }); b.solid('airhockey', -8, -7.0, 1.4, 2.6, { h: 0.85, c: 0xe66ba0 }); b.solid('foosball', -15, -6.4, 1.4, 2.4, { h: 0.95 });
  for (let i = 0; i < 6; i++) b.prop('fchair', -25.3 + i * 1.2, -15.6, 0, 0); for (let i = 0; i < 5; i++) b.prop('fchair', -23.4 + i * 1.2, -8.8, Math.PI, 0);
  b.prop('plush', -27, -2.0, 0.5); b.prop('prizebox', 3.0, -1.4, 0.3); b.prop('ballbox', -15.4, -13.6, 0.4); b.prop('toyblock', -14.4, -2.2, 0.2); b.prop('poster', -27.2, -8.0, 0); b.prop('splant', 3.0, -16.8, 0); b.prop('fig', -26.8, -14.0, 0.5);
  b.deco('rug', -14, -7, { w: 24, d: 6, c: 0x3174b9, c2: 0xe66ba0 }); b.deco('light', -22, -7, { r: 8, c: 0xe66ba0 }); b.deco('light', -8, -7, { r: 8, c: 0x3174b9 }); b.deco('light', -15, -14, { r: 6, c: 0x9d6bff });
  b.deco('neon', -15, -17.78, { y: 2.9, w: 6, c: 0xe66ba0 }); b.deco('neon', -6, 1.78, { y: 2.8, w: 4, c: 0x3174b9, rot: Math.PI }); b.deco('discoball', -14, -7, { y: 3.0 }); b.label('الأركيد', -14, 1.4, 3.1);
  // ---------- البولينج
  [-14.5, -10.5, -6.5, -2.5, 1.5].forEach((z, i) => { b.deco('lane', 17, z, { w: 14, d: 2.6 }); b.solid('pins', 25.6, z, 1.6, 2.4, { h: 0.5, c: CAB[i % 6] }); b.solid('ballret', 9.2, z, 1.6, 1.6, { h: 0.9, c: CAB[(i + 2) % 6] }); });
  b.solid('lanecounter', 14.6, 1.4, 22.0, 1.2, { h: 1.05 }); b.deco('screen', 8, -9, { y: 2.6, w: 1.6, anim: 'blink', c: 0xf0be49, rot: Math.PI / 2 });
  for (let i = 0; i < 5; i++) b.prop('toyblock', 6.0, -15.0 + i * 3.4, 0.2, 0); b.prop('ball', 11.5, -1.0, 0.3); b.prop('ballbox', 5.2, -3.6, 0.4); b.prop('prizebox', 27, -16.8, 0); b.prop('splant', 27, 1.0, 0); b.prop('poster', 5.2, -17.0, 0);
  b.solid('seatrow', 8.4, -16.8, 4.0, 1.0, { h: 0.5, c: 0xe8874d }); b.solid('seatrow', 8.4, -4.4, 1.0, 3.0, { h: 0.5, c: 0xe8874d });
  b.deco('light', 17, -8, { r: 10, c: 0xf0be49 }); b.deco('light', 17, 0, { r: 6, c: 0x3174b9 }); b.deco('neon', 16, -17.78, { y: 3.0, w: 8, c: 0xf0be49 }); b.label('البولينج', 16, 1.4, 3.1);
  // ---------- ركن الجوائز
  b.solid('prizecase', -27.4, 10, 0.9, 12.0, { h: 2.0 }); b.solid('prizecase', -19.5, 17.4, 12.0, 0.9, { h: 2.0 }); b.solid('prizecounter', -18, 7.6, 7.0, 1.2, { h: 1.05 });
  b.row('plush', -25.0, 5.2, 4, 0, 3.2, 0.3); b.row('fig', -22.6, 12.6, 2, 3.6, 1.6, 0.2); b.row('prizebox', -13.2, 5.2, 2, 0, 2.2, 0.4); b.prop('toyblock', -22.0, 4.2, 0.2); b.prop('plush', -14.0, 16.4, 0.6); b.prop('ballbox', -23.2, 15.4, 0.2); b.prop('splant', -13.4, 11.8, 0); b.prop('poster', -16.2, 3.4, 0);
  b.deco('rug', -20, 12, { w: 10, d: 5, c: 0xe66ba0, c2: 0xf0be49 }); b.deco('light', -20, 11, { r: 9, c: 0xffa0d0 }); b.deco('neon', -20, 17.78, { y: 3.0, w: 6, c: 0xf0be49, rot: Math.PI }); b.deco('neon', -27.78, 5.5, { y: 2.8, w: 3, c: 0x3174b9, rot: Math.PI / 2 }); b.label('الجوائز', -20, 2.6, 3.1);
  // ---------- المطاعم
  b.solid('foodstall', -8.4, 16.4, 6.2, 1.2, { h: 1.1, c: 0xe8874d }); b.solid('foodstall', 4.4, 16.4, 6.2, 1.2, { h: 1.1, c: 0xe66ba0 }); b.deco('menu', -8.4, 17.78, { y: 2.0, w: 4.4, h: 1.0, rot: Math.PI }); b.deco('menu', 4.4, 17.78, { y: 2.0, w: 4.4, h: 1.0, rot: Math.PI });
  [[-9, 6.4], [-5, 6.4], [-1, 6.4], [3, 6.4], [-9, 11.2], [3, 11.2], [6.0, 12.5]].forEach(([x, z], i) => { b.solid('ftable', x, z, 1.8, 1.0, { h: 0.76, c: [0xf0be49, 0x3174b9, 0xe66ba0][i % 3] }); b.prop('fchair', x - 0.7, z + 0.9, Math.PI, 0); b.prop('fchair', x + 0.7, z - 0.9, 0, 0); });
  b.prop('trashs', -11.4, 3.4, 0); b.prop('ballbox', 7.2, 4.0, 0.2); b.prop('splant', -11.2, 14.6, 0); b.prop('splant', 7.0, 14.6, 0); b.prop('prizebox', 6.6, 8.0, 0.4); b.prop('plush', -10.6, 8.6, 0.3);
  b.deco('rug', -3, 9, { w: 14, d: 6.5, c: 0xf0be49, c2: 0xe8874d }); b.deco('light', -3, 9, { r: 9, c: 0xffc080 }); b.deco('neon', 0, 2.22, { y: 2.9, w: 5, c: 0xe8874d }); b.deco('lamphang', -5, 8.8, { y: 2.4 }); b.deco('lamphang', 3, 8.8, { y: 2.4 }); b.label('المطعم', -2, 2.6, 3.1);
  // ---------- منطقة الأطفال
  b.solid('ballpit', 16, 6.5, 6.0, 5.0, { h: 0.9 }); b.solid('slide', 24, 13.5, 4.0, 5.0, { h: 2.4 }); b.solid('softblock', 11, 15, 2.4, 1.6, { h: 1.0, c: 0xe66ba0 }); b.solid('softblock', 12.6, 12.4, 1.6, 1.6, { h: 0.8, c: 0xf0be49 }); b.solid('softblock', 19, 16, 3.0, 1.4, { h: 0.9, c: 0x34d399 });
  b.solid('ftable', 26.2, 6.0, 1.0, 2.0, { h: 0.62, c: 0xf0be49 }); b.prop('fchair', 25.0, 5.0, Math.PI / 2, 0); b.prop('fchair', 25.0, 7.0, Math.PI / 2, 0); b.prop('toyblock', 10.0, 4.4, 0.2); b.prop('toyblock', 10.9, 5.4, 0.9); b.prop('plush', 22.0, 4.2, 0.4); b.prop('plush', 14.0, 10.8, 0.7); b.prop('ballbox', 21.2, 9.4, 0.2); b.prop('fig', 26.6, 16.6, 0.3); b.prop('splant', 9.2, 16.8, 0); b.prop('prizebox', 18.0, 11.4, 0.2); b.prop('toyblock', 22.4, 17.0, 0.4);
  b.deco('rug', 18, 10, { w: 16, d: 12, c: 0x3174b9, c2: 0xe66ba0 }); b.deco('light', 18, 8, { r: 10, c: 0x7fb4ff }); b.deco('neon', 18, 17.78, { y: 3.0, w: 7, c: 0xe66ba0, rot: Math.PI }); b.deco('discoball', 18, 9, { y: 3.0 }); b.label('منطقة الأطفال', 18, 2.6, 3.1);
  return b.m;
}
