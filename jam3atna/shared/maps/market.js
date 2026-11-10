// خريطة السوبرماركت: صالة المنتجات بالممرات، ثلاجات المشروبات، قسم الخضار، المحاسبة، المستودع.
import { mapBuilder } from '../prop-core.js';

export function market() {
  const b = mapBuilder({
    id: 'market', ready: true, name: 'السوبرماركت', line: 'سوق مليان... وواحد منكم صار علبة!', w: 56, d: 36, gate: { x: -7, z: 16.4, lv: 0 },
    theme: { sky: 0xe8c99a, fog: 0xd9c7a8, fogN: 55, fogF: 150, sun: 0xfff0d0, sunI: 0.85, amb: 0.38, ambSky: 0xfff0d8, ambGround: 0x6a5846, fillI: 0.3, step: 'tile', wall: 0xe6dcc3, dado: 0x285c4b, trim: 0xe8b84e, base: 0x353b40, crown: 0xf4ecd8, ceil: 0xf1e8d2, lamp: 0xfff2d6, doorFrame: 0x353b40, door: 0xb98c60, ext: 0xc84e48, floorMul: 1.0, dadoGloss: true, ground: 0x8a8f78 },
    ambience: 'market', music: [294, 370, 440],
    tour: [[-7, 15, 2.6, -7, 4, 1.2], [-20, 6, 3.0, -20, -12, 1.4], [0, 7, 3.2, 0, -14, 1.4], [20, 12, 3.0, 20, -10, 1.3]],
  });
  // ---------- أرضيات وألوان
  b.room('checkout', -28, 8, 14, 18, { floor: 'stone', c1: 0xb9aa94, c2: 0xa99a84, wc: 0xf0d58a, dado: 0xc84e48, trim: 0x353b40 });
  b.room('produce', -28, -18, -12, 8, { floor: 'wood', c1: 0xc79763, c2: 0xb2854f, wc: 0xb8cda0, dado: 0x285c4b, trim: 0xe8b84e });
  b.room('aisles', -12, -18, 14, 8, { floor: 'tile', c1: 0xd2c6a8, c2: 0xc0b496, wc: 0xe6dcc3, dado: 0x285c4b, trim: 0xc84e48 });
  b.room('ware', 14, -18, 28, 18, { floor: 'concrete', c1: 0x9a968a, c2: 0x8a867a, wc: 0xc9a47a, dado: 0x353b40, trim: 0xe8b84e });
  // ---------- جدران
  b.box(-28, -18, 28, 18, { s: [[-7, 5.2, 'glass']] }, {});
  b.wall(14, -18, 14, 18, [[-1, 3.6, 'double'], [11, 2.4]]);
  // ---------- ثلاجات المشروبات على الجدار الشمالي
  [-8.5, -2.5, 3.5, 9.5].forEach((x, i) => b.solid('drinkfridge', x, -17.3, 5.6, 1.0, { h: 2.2, c: [0xc84e48, 0x285c4b, 0xe8b84e, 0x3174b9][i] }));
  b.deco('sign', 0.5, -17.7, { y: 2.8, text: 'المشروبات', c: 0x3174b9, w: 3.2 });
  // ---------- أرفف الممرات (جندولات)
  [-8, -3.5, 1, 5.5, 10].forEach((x, i) => { b.solid('gondola', x, -11.2, 1.0, 8.6, { h: 1.9, seed: i }); b.solid('gondola', x, 1.8, 1.0, 7.0, { h: 1.9, seed: i + 7 }); });
  b.deco('sign', -8, -15.6, { y: 2.9, text: 'ألبان', c: 0x285c4b, w: 1.6, rot: Math.PI / 2 * 0 }); b.deco('sign', 1, -15.6, { y: 2.9, c: 0xe8b84e, w: 1.6 });
  b.deco('rug', -1, -3.2, { w: 22, d: 2.2, c: 0xe8b84e, c2: 0xc84e48 });
  b.prop('saleSign', -5.7, -5.2, 0); b.prop('saleSign', 8, -5.4, 0.3); b.prop('cart', -10.6, 6.5, 0.3); b.prop('cart', 12.4, 6.6, -0.2); b.prop('basket', 3.3, -5.0, 0.5); b.prop('goodsbox', 12.8, -15, 0.2); b.prop('pallet', -10.8, -15, 0.6); b.prop('cleanbucket', 12.8, 3, 0.2);
  // ---------- قسم الخضار والفواكه
  [[-25, -14], [-21, -14], [-17, -14], [-25, -8], [-21, -8], [-17, -8], [-25, -2], [-21, -2], [-17, -2]].forEach(([x, z], i) => b.solid('ptable', x, z, 2.6, 1.4, { h: 0.9, seed: i }));
  b.prop('fruitcrate', -26.8, 4.6, 0.4); b.prop('fruitcrate', -14.0, 5.0, 0); b.prop('basket', -23.5, 1.2, 0.4); b.prop('cart', -14.8, -5.2, 0.5); b.prop('goodsbox', -13.2, -15.6, 0.2); b.prop('pplant', -27.0, -17.0, 0);
  b.deco('sign', -20, -17.7, { y: 2.8, text: 'الخضار والفواكه', c: 0x285c4b, w: 3.6 }); b.deco('poster2', -27.8, -6, { y: 1.8, w: 1.4, h: 1.2, c: 0xe8b84e }); b.deco('light', -21, -8, { r: 8, c: 0xffd890 }); b.solid('scale', -26.9, 1.0, 0.8, 0.8, { h: 1.2 });
  // ---------- المحاسبة
  [-24, -19, -14, -9, -4, 1].forEach((x, i) => { b.solid('checkout', x, 13.2, 1.3, 3.0, { h: 0.95, c: i % 2 ? 0x285c4b : 0xc84e48 }); b.prop('ochair', x + 1.15, 14.2, Math.PI / 2); });
  b.prop('basket', -21.8, 10.3, 0.2); b.prop('basket', -16.7, 10.2, 0); b.prop('cart', -2.0, 9.6, 0.5); b.prop('cart', 4.0, 10.0, -0.4); b.prop('saleSign', 8, 11, 0); b.prop('goodsbox', 12.4, 16.8, 0.3);
  b.solid('shelfm', 8.5, 17.3, 6.0, 0.8, { h: 1.8 }); b.solid('shelfm', -27.3, 14, 0.8, 6.0, { h: 1.8 }); b.deco('light', -11, 13, { r: 9, c: 0xffe0a0 }); b.deco('sign', -11, 17.7, { y: 3.0, text: 'المحاسبة', c: 0xc84e48, w: 3, rot: Math.PI });
  b.deco('clock', 13.8, 10, { y: 2.8, rot: -Math.PI / 2 }); b.label('المحاسبة', -11, 8.4, 3.0); b.label('الخضار', -20, -3.0, 3.0); b.label('المستودع', 21, -3.0, 3.0); b.label('المشروبات', 3, -16, 3.0);
  // ---------- المستودع
  [-14.5, -9.5, 2.5, 9].forEach((z, i) => b.solid('rack', 25.5, z, 2.0, 4.6, { h: 3.0, seed: i }));
  [-14.5, -9.5].forEach((z) => b.solid('rack', 17.6, z, 1.6, 4.6, { h: 3.0, seed: 3 }));
  b.row('pallet', 21.5, -15, 2, 0, 2.2, 0.2); b.row('goodsbox', 20.0, -7.4, 3, 1.3, 0.0, 0.3); b.prop('pallet', 21.0, 8.0, 0.2); b.prop('pallet', 18.6, 12.5, 0.5); b.prop('cleanbucket', 16.4, 4.8, 0.4); b.prop('goodsbox', 21.5, 15.6, 0.2); b.prop('cart', 26.6, 14.4, 1.2); b.prop('fruitcrate', 16.0, 15.8, 0.3);
  b.solid('pallet2', 20.5, 3.2, 1.4, 1.4, { h: 1.3 }); b.solid('pallet2', 22.6, 12.6, 1.4, 1.4, { h: 1.1 }); b.solid('dock', 27.4, -1, 0.6, 3.6, { h: 2.6 }); b.deco('light', 21, 0, { r: 9, c: 0xfff0c8 }); b.deco('sign', 14.2, -4, { y: 2.8, text: 'مستودع', c: 0x353b40, w: 1.8, rot: Math.PI / 2 });
  // ---------- أغراض إضافية (ممر عرضي، نهايات الأرفف، مواقف العربات)
  ['basket', 'saleSign', 'goodsbox', 'cleanbucket', 'fruitcrate', 'cart', 'pallet', 'basket', 'goodsbox'].forEach((k, i) => b.prop(k, -10.4 + i * 2.8, -4.6 + (i % 2) * 0.9, i * 0.7));
  ['goodsbox', 'basket', 'cleanbucket', 'saleSign', 'fruitcrate', 'goodsbox'].forEach((k, i) => b.prop(k, -9.0 + i * 4.4, 6.2 - (i % 2) * 0.8, i * 0.9));
  b.row('cart', -11.8, 16.6, 2, 1.1, 0, Math.PI); b.row('basket', 2.2, 16.8, 3, 0.9, 0, 0.2); b.row('basket', -26.8, 9.0, 2, 1.0, 0, 0.3);
  b.row('fruitcrate', -23.4, 5.2, 3, 3.2, 0, 0.1); b.row('goodsbox', 16.4, 1.0, 1, 0, 0, 0.2); b.row('cleanbucket', 16.4, -3.4, 1, 0, 0, 0); b.row('saleSign', -11.0, -16.2, 1, 0, 0, 0.2);
  return b.m;
}
