// خريطة البيت الكبير: طابقان بدرج حقيقي، مجلس، صالة، مطبخ وطعام، دورة مياه، غرفة غسيل، حديقة؛ وعلوي: غرفتا نوم + ثالثة، جلسة علوية، حمام.
import { mapBuilder } from '../prop-core.js';

export function house() {
  const b = mapBuilder({
    id: 'house', ready: true, name: 'البيت الكبير', line: 'دقّق زين... مو كل شيء في البيت مثل ما تشوف!', w: 50, d: 36, gate: { x: -16, z: 16.4, lv: 0 },
    theme: { sky: 0xbfd3e8, fog: 0xd5c9b5, fogN: 50, fogF: 130, sun: 0xffe8c2, sunI: 0.85, amb: 0.5, ambSky: 0xfff1d8, ambGround: 0x7d6a55, fillC: 0xffd9a0, fillI: 0.5, step: 'wood', wall: 0xe9dcc6, trim: 0xb08a5a, base: 0x8a6a48, crown: 0xf3ece0, ground: 0x4b7d3b, band: false, lamp: 0xffe3b0, doorFrame: 0xf3ece0, door: 0xa8794d, envTop: 0xc9b99d, envMid: 0x9a8b74, envBot: 0x4a4034 },
    tour: [[-16, 17, 2.0, -16, 6, 1.2], [-14, 4, 2.2, 0, -8, 1.2], [-2, -4, 2.4, -2, 8, 1.2], [4, 8, 2.4, -8, 8, 1.0]],
  });
  const HW = 0xe9dcc6;
  // ---------- الطابق الأرضي: أرضيات
  b.room('majlis', -25, -18, -8, 0, { floor: 'parquet', c1: 0xb98a5c, c2: 0xa57a4c, wc: 0x65765a, dado: 0x49362d, trim: 0xb18b50 });
  b.room('hall', -25, 0, -8, 18, { floor: 'stone', c1: 0xb8ad98, c2: 0xa99e89, wc: 0xc8b49a, dado: 0x76543e, trim: 0x49362d });
  b.room('living', -8, -18, 8, 0, { floor: 'wood', c1: 0xc79763, c2: 0xb2854f, wc: 0x334f68, dado: 0x76543e, trim: 0xc8b49a });
  b.room('kitchen', -8, 0, 8, 18, { floor: 'tile', c1: 0xb7aea0, c2: 0xa59c8e, wc: 0xd8c7a6, dado: 0x2f6b66, trim: 0x76543e, dadoGloss: true });
  b.room('stairhall', 8, -18, 14, -2, { floor: 'wood', c1: 0xb98a5c, c2: 0xa57a4c, wc: 0xc8b49a, dado: 0x76543e, trim: 0x49362d, noCeiling: true, spawn: false, skipCheck: true });
  b.room('bath1', 8, -2, 14, 5, { floor: 'tile', c1: 0x9fbcc0, c2: 0x8eadb1, wc: 0x7fa6a8, dado: 0xe6ddc9, trim: 0x76543e });
  b.room('laundry', 8, 5, 14, 18, { floor: 'concrete', c1: 0xa49f93, c2: 0x948f83, wc: 0xb9ad94, dado: 0x4d5a64, trim: 0x76543e });
  b.room('garden', 14, -18, 25, 18, { floor: 'grass', c1: 0x5a9a4a, c2: 0x4c8a3e, noCeiling: true, wc: 0xa66c57 });
  // ---------- جدران الأرضي
  b.box(-25, -18, 14, 18, { s: [[-16, 2.4]], e: [[-4.2, 2.2], [12, 2.4]] }, { lv: 0, c: 0xe3d4bb });
  b.wall(-25, 0, -8, 0, [[-16.5, 5, 'open']], { lv: 0 }); b.wall(-8, -18, -8, 0, [[-9, 3.6, 'open']], { lv: 0 }); b.wall(-8, 0, -8, 18, [[9, 3.4, 'open']], { lv: 0 });
  b.wall(-8, 0, 8, 0, [[0, 6, 'open']], { lv: 0 });
  b.wall(8, -18, 8, 0, [[-4.2, 2.4]], { lv: 0 }); b.wall(8, 0, 8, 18, [[2.6, 2.2], [12, 2.4]], { lv: 0 });
  b.wall(8, -2, 14, -2, [[11, 2.4]], { lv: 0 }); b.wall(8, 5, 14, 5, [], { lv: 0 });
  // سور الحديقة
  b.wall(14, -18, 25, -18, [], { lv: 0, h: 1.3, c: 0xb06f4f }); b.wall(14, 18, 25, 18, [], { lv: 0, h: 1.3, c: 0xb06f4f }); b.wall(25, -18, 25, 18, [], { lv: 0, h: 1.3, c: 0xb06f4f });
  // ---------- الدرج: من الجنوب (أرضي) إلى الشمال (علوي)
  b.stairs(8.2, -13.4, 13.8, -6.4, 'z', -1); b.solid('stairs', 11, -9.9, 5.6, 7.0, { h: 3.7, axis: 'z', dir: -1, hit: false });
  b.solid('understair', 11, -15.7, 5.6, 4.6, { h: 3.4 });

  // ---------- المدخل
  b.solid('shoecab', -23.8, 7.5, 0.5, 2.0, { h: 1.1 }); b.solid('console', -16.5, 17.5, 2.2, 0.5, { h: 0.9 }); b.deco('mirror', -16.5, 17.7, { y: 1.5, w: 1.0, h: 1.3 }); b.deco('painting', -24.8, 12.5, { y: 1.8, w: 1.3, h: 0.9, c: 0xc98a4a });
  b.deco('rug', -16.5, 12, { w: 4.4, d: 2.8, c: 0x8a5a3a, c2: 0xd9bf94 }); b.deco('light', -16.5, 10, { r: 5, c: 0xffe0b0 });
  b.prop('plant', -24.2, 16.8, 0); b.prop('plant', -9.0, 16.8, 0); b.prop('lamp', -23.8, 4.0, 0); b.prop('sidetbl', -9.0, 5.0, 0); b.prop('shoebox', -23.8, 9.6, 0.2); b.prop('bag', -10.2, 12.6, 0.4); b.prop('ottoman', -22.0, 16.0, 0); b.prop('bag', -12.0, 16.9, 0.1);
  // ---------- المجلس (بجلسة عربية حول الجدران)
  b.solid('sofa', -16.5, -16.9, 7.0, 1.2, { h: 0.95, c: 0x8f4a3a }); b.solid('sofa', -23.8, -9, 1.2, 7.0, { h: 0.95, c: 0x8f4a3a, rot: 0 }); b.solid('sofa', -10.0, -9, 1.2, 5.0, { h: 0.95, c: 0x8f4a3a });
  b.solid('coffee', -16.5, -9.2, 2.6, 1.4, { h: 0.45, c: 0x6a4a30 }); b.deco('rug', -16.5, -9.2, { w: 7.0, d: 6.0, c: 0xa8412f, c2: 0xe8d6a8 }); b.deco('light', -16.5, -9, { r: 6, c: 0xffe0b0 });
  b.deco('painting', -16.5, -17.8, { y: 1.9, w: 2.2, h: 1.1, c: 0x7a9a5a }); b.deco('window', -24.8, -9, { w: 2.2, h: 1.5, y: 1.2 }); b.deco('curtain', -24.7, -9, { w: 3.2 }); b.deco('chand', -16.5, -9.2, { y: 3.2 });
  b.prop('armchair', -20.2, -13.2, 0.5); b.prop('armchair', -12.8, -13.2, -0.5); b.prop('armchair', -20.0, -5.0, 2.6); b.prop('armchair', -13.0, -5.0, -2.6);
  b.prop('sidetbl', -19.8, -15.0, 0); b.prop('sidetbl', -13.2, -15.0, 0); b.prop('lamp', -23.0, -16.9, 0); b.prop('lamp', -9.5, -16.9, 0); b.prop('plant', -24.0, -1.6, 0); b.prop('plant', -9.6, -1.6, 0);
  b.prop('cushion', -22.6, -12.6, 0.3); b.prop('cushion', -22.6, -5.6, -0.2); b.prop('ottoman', -16.5, -6.2, 0); b.prop('ottoman', -14.6, -6.2, 0.4); b.prop('cabinet', -19.0, -1.6, 0); b.prop('cushion', -11.7, -9, 0.2);
  // ---------- غرفة المعيشة
  b.solid('sofa', -2.5, -3.0, 6.0, 1.2, { h: 0.95, c: 0x4f6b7a }); b.solid('sofa', -6.4, -8.5, 1.2, 4.0, { h: 0.95, c: 0x4f6b7a }); b.solid('tvunit', 0.0, -17.3, 4.4, 0.7, { h: 0.5 }); b.deco('tv', 0.0, -17.7, { y: 0.85, w: 1.6, h: 0.9, anim: 'tv' });
  b.solid('coffee', -2.0, -8.8, 2.0, 1.2, { h: 0.42, c: 0x5b4330 }); b.deco('rug', -2.0, -9.2, { w: 6.0, d: 4.4, c: 0x6b7f8f, c2: 0xcfc3a8 }); b.solid('bookcase', 6.9, -9.5, 0.6, 5.0, { h: 2.1 }); b.deco('light', -2.0, -9, { r: 6, c: 0xffe3b8 });
  b.deco('fan', 0, -9, { y: 3.4 }); b.deco('clock', 2.5, -17.8, { y: 2.4 }); b.deco('window', -7.5, -3.0, { w: 0.1, h: 0.1, y: 0 });
  b.prop('armchair', 3.0, -6.2, -1.0); b.prop('lamp', 5.4, -3.0, 0); b.prop('lamp', -6.9, -2.0, 0); b.prop('cushion', -3.8, -4.5, 0.3); b.prop('cushion', 0.2, -4.5, -0.3); b.prop('toybox', 4.8, -14.0, 0); b.prop('plant', 6.6, -16.8, 0); b.prop('plant', -6.8, -16.8, 0); b.prop('sidetbl', 3.4, -3.0, 0); b.prop('ottoman', 3.4, -11.4, 0.3); b.prop('vacuum', 6.5, -2.0, 0.6);
  // ---------- المطبخ وغرفة الطعام
  b.solid('kitchenrow', -2.5, 17.3, 9.0, 0.8, { h: 0.95 }); b.solid('kitchenrow', 7.3, 6.4, 0.8, 3.4, { h: 0.95 }); b.solid('fridge2', 6.6, 16.9, 1.2, 1.0, { h: 2.0 }); b.solid('island', -1.5, 12.8, 3.6, 1.2, { h: 0.95 }); b.solid('dtable', -2.5, 5.2, 3.0, 1.5, { h: 0.78 });
  b.row('kchair', -3.6, 3.8, 3, 1.1, 0, Math.PI); b.row('kchair', -3.6, 6.6, 3, 1.1, 0, 0); b.prop('kchair', -5.0, 5.2, Math.PI / 2); b.prop('kchair', 0.0, 5.2, -Math.PI / 2);
  b.deco('rug', -2.5, 5.2, { w: 5.0, d: 3.4, c: 0xa89a7a, c2: 0x7a6c4e }); b.deco('lamphang', -2.5, 5.2, { y: 2.2 }); b.deco('light', -2.5, 6, { r: 5, c: 0xffe3b8 }); b.deco('clock', -7.8, 12, { y: 2.3 }); b.deco('window', -2.5, 17.8, { w: 2.2, h: 1.3, y: 1.4 });
  b.prop('plant', -7.0, 1.6, 0); b.prop('hamper', 5.8, 7.4, 0); b.prop('ottoman', 4.4, 2.2, 0); b.prop('sidetbl', -7.0, 14.6, 0); b.prop('lamp', 5.4, 1.2, 0);
  // ---------- دورة مياه الضيوف / الغسيل / الدرج
  b.solid('toilet', 9.2, 3.8, 0.6, 0.8, { h: 0.8 }); b.solid('sink', 12.6, 4.5, 0.7, 0.5, { h: 0.9 }); b.solid('shower', 12.8, -0.8, 2.0, 2.0, { h: 2.2 }); b.deco('mirror', 12.6, 4.78, { y: 1.5, w: 0.8, h: 1.0 }); b.prop('hamper', 9.0, -0.8, 0); b.prop('plant', 9.0, 2.3, 0);
  b.solid('washer', 9.2, 16.4, 0.9, 0.9, { h: 0.9 }); b.solid('washer', 10.4, 16.4, 0.9, 0.9, { h: 0.9 }); b.solid('shelfu', 13.5, 11, 0.5, 4.0, { h: 1.9 }); b.prop('hamper', 12.4, 16.8, 0); b.prop('vacuum', 9.2, 7.0, 0); b.prop('hamper', 12.8, 7.2, 0); b.prop('shoebox', 12.2, 14.0, 0.5); b.prop('bag', 9.3, 9.0, 0.3);
  b.prop('plant', 9.0, -3.2, 0); b.prop('cabinet', 13.0, -4.6, 0); b.prop('lamp', 9.0, -6.6, 0); b.deco('painting', 13.9, -9, { y: 1.9, w: 1.4, h: 0.9, c: 0xb88b4a });
  // ---------- الحديقة
  b.deco('strip', 20, 0, { x0: 14, z0: -0.6, x1: 25, z1: 0.6, c: 0xb9a98a }); b.deco('strip', 20, 0, { x0: 19.4, z0: -17, x1: 20.6, z1: 17, c: 0xb9a98a });
  b.solid('gtable', 21.5, 9.5, 1.6, 1.6, { h: 0.78 }); b.solid('umbrella', 21.5, 9.5, 0.4, 0.4, { h: 2.6, hit: false }); b.solid('swing', 22.6, -11.5, 3.0, 2.0, { h: 2.2 }); b.solid('tree', 17, -14.5, 1.0, 1.0, { h: 4.5 }); b.solid('tree', 17.4, 14.5, 1.0, 1.0, { h: 4.2 }); b.solid('tree', 23.6, 3.5, 1.0, 1.0, { h: 3.8 });
  b.prop('gchair', 20.2, 8.2, Math.PI); b.prop('gchair', 22.8, 8.2, Math.PI); b.prop('gchair', 20.2, 10.9, 0); b.prop('gchair', 22.8, 10.9, 0); b.prop('plant', 15.0, -2.4, 0); b.prop('plant', 15.0, 2.4, 0); b.prop('plant', 24.2, -3.0, 0); b.prop('plant', 24.2, 16.6, 0); b.prop('toybox', 22.0, -6.0, 0.3); b.prop('hamper', 15.0, 16.6, 0);
  b.prop('plant', 15.0, -16.6, 0); b.prop('plant', 24.2, -16.6, 0); b.prop('ottoman', 19.0, 13.5, 0); b.prop('lamp', 24.0, 12.6, 0);
  b.deco('light', 21.5, 9.5, { r: 4, c: 0xffe3b8 });

  // ==================== الطابق العلوي (lv1) ====================
  const U = { lv: 1 };
  b.room('landing', 8, -18, 14, -13.4, { floor: 'wood', c1: 0xb98a5c, c2: 0xa57a4c, lv: 1, spawn: false, wc: 0xc8b49a, dado: 0x76543e, trim: 0x49362d });
  b.room('gallery', -8, -18, 8, 6, { floor: 'carpet', c1: 0x8a6f52, c2: 0x7a6044, lv: 1, wc: 0x65765a, dado: 0x49362d, trim: 0xb18b50 });
  b.room('master', -25, -18, -8, 0, { floor: 'carpet', c1: 0x8a5a68, c2: 0x7a4c5a, lv: 1, wc: 0x713b43, dado: 0x49362d, trim: 0xd6c3a5 });
  b.room('bed2', -25, 0, -8, 18, { floor: 'wood', c1: 0xcfb48a, c2: 0xbfa27a, lv: 1, wc: 0x7fa6a8, dado: 0xe6ddc9, trim: 0x3f6b6d });
  b.room('bath2', -8, 6, 8, 18, { floor: 'tile', c1: 0x9bb3c4, c2: 0x8aa3b5, lv: 1, wc: 0x6f93a8, dado: 0xe6ddc9, trim: 0x334f68 });
  b.room('bed3', 8, -3, 14, 18, { floor: 'carpet', c1: 0xc48a4c, c2: 0xb27a3e, lv: 1, wc: 0xf0b45a, dado: 0x334f68, trim: 0xf3ece0 });
  b.box(-25, -18, 14, 18, {}, { lv: 1, c: 0xe3d4bb });
  b.wall(-8, -18, -8, 0, [[-9, 2.6]], U); b.wall(-25, 0, -8, 0, [], U); b.wall(-8, 0, -8, 18, [[3, 2.4], [11.5, 2.4]], U); b.wall(-8, 6, 8, 6, [[0, 2.4]], U);
  b.wall(8, -18, 8, 6, [[-15.7, 2.4], [1, 2.2]], U); b.wall(8, -3, 14, -3, [], U); b.wall(8, 6, 8, 18, [], U); b.wall(8, -13.4, 14, -13.4, [[11, 5.6, 'open']], { lv: 1, h: 1.1, c: 0xb08a5a });
  b.solid('rail', 8.25, -9.9, 0.1, 6.9, { lv: 1, h: 1.1, hit: false });
  // المحاور: السرير الرئيسي
  b.solid('bed', -18.5, -13.6, 2.2, 2.4, { lv: 1, h: 0.9, c: 0x8a6fa0 }); b.solid('wardrobe', -24.3, -6.2, 0.8, 3.6, { lv: 1, h: 2.2 }); b.solid('vanity', -12.0, -2.0, 2.0, 0.6, { lv: 1, h: 0.8 }); b.solid('nightstand', -21.2, -16.9, 0.6, 0.6, { lv: 1, h: 0.55 }); b.solid('nightstand', -15.8, -16.9, 0.6, 0.6, { lv: 1, h: 0.55 });
  b.deco('rug', -17.5, -8.6, { w: 5.0, d: 3.4, c: 0xa88fb8, c2: 0xe3d6ee, lv: 1 }); b.deco('window', -24.8, -13, { w: 2.2, h: 1.5, y: 1.2, lv: 1 }); b.deco('curtain', -24.7, -13, { w: 3.2, lv: 1 }); b.deco('light', -17.5, -9, { r: 5, c: 0xffe3b8, lv: 1 }); b.deco('painting', -18.5, -17.8, { y: 1.9, w: 1.6, h: 1.0, c: 0xb78a9a, lv: 1 });
  b.prop('lamp', -22.4, -17.0, 0, 1); b.prop('lamp', -14.6, -17.0, 0, 1); b.prop('hamper', -10.0, -16.4, 0, 1); b.prop('ottoman', -18.5, -11.0, 0, 1); b.prop('cabinet', -16.0, -1.6, 0, 1); b.prop('plant', -24.0, -1.6, 0, 1); b.prop('bag', -22.0, -3.2, 0.5, 1); b.prop('sidetbl', -9.6, -6.0, 0, 1); b.prop('cushion', -12.4, -10.0, 0.4, 1);
  // غرفة النوم 2 (للأطفال)
  b.solid('bed', -20.4, 15.4, 1.6, 2.2, { lv: 1, h: 0.8, c: 0x6fa38f }); b.solid('bed', -14.0, 15.4, 1.6, 2.2, { lv: 1, h: 0.8, c: 0x9fb86f }); b.solid('wardrobe', -24.3, 8.0, 0.8, 3.4, { lv: 1, h: 2.2 }); b.solid('desk', -16.4, 3.4, 2.0, 0.8, { lv: 1, h: 0.76 });
  b.deco('rug', -17, 9.4, { w: 4.6, d: 3.0, c: 0x7fb59d, c2: 0xe0efe8, lv: 1 }); b.deco('window', -17, 17.8, { w: 2.2, h: 1.5, y: 1.2, lv: 1 }); b.deco('light', -17, 9.4, { r: 5, c: 0xffe3b8, lv: 1 });
  b.prop('toybox', -23.4, 14.2, 0.4, 1); b.prop('toybox', -10.0, 14.4, 0, 1); b.prop('lamp', -17.2, 17.2, 0, 1); b.prop('kchair', -16.4, 4.6, Math.PI, 1); b.prop('bag', -10.0, 4.4, 0.3, 1); b.prop('hamper', -24.0, 16.8, 0, 1); b.prop('cushion', -19.0, 9.0, 0.2, 1); b.prop('cushion', -15.0, 9.4, -0.3, 1); b.prop('plant', -9.4, 1.6, 0, 1);
  // الجلسة العلوية + مكتب
  b.solid('sofa', -2.0, -16.9, 5.0, 1.2, { lv: 1, h: 0.95, c: 0x6a7a5a }); b.solid('desk', 5.6, -9.0, 0.8, 2.4, { lv: 1, h: 0.76 }); b.solid('bookcase', 0, 5.5, 5.0, 0.6, { lv: 1, h: 2.1 }); b.solid('coffee', -2.0, -12.5, 1.8, 1.0, { lv: 1, h: 0.42, c: 0x5b4330 });
  b.deco('rug', -2.0, -12.5, { w: 5.2, d: 3.6, c: 0x7a8a62, c2: 0xd6cfae, lv: 1 }); b.deco('light', -2, -11, { r: 6, c: 0xffe3b8, lv: 1 }); b.deco('window', -2.0, -17.8, { w: 2.4, h: 1.4, y: 1.3, lv: 1 }); b.deco('window', 7.8, -12, { w: 0.1, h: 0.1, y: 0, lv: 1 });
  b.prop('armchair', 2.6, -13.0, -0.9, 1); b.prop('lamp', 1.6, -16.9, 0, 1); b.prop('lamp', 5.6, -6.2, 0, 1); b.prop('ottoman', -2.0, -9.4, 0, 1); b.prop('kchair', 4.6, -9.0, -Math.PI / 2, 1); b.prop('plant', -6.6, -1.2, 0, 1); b.prop('plant', 6.6, -16.8, 0, 1); b.prop('sidetbl', -6.4, -12.0, 0, 1); b.prop('cushion', -4.4, -15.2, 0.2, 1); b.prop('toybox', 6.4, 3.8, 0, 1); b.prop('vacuum', -6.6, 4.8, 0.4, 1);
  // الحمام العلوي
  b.solid('tub', -4.5, 16.8, 3.0, 1.3, { lv: 1, h: 0.6 }); b.solid('toilet', 5.0, 16.8, 0.6, 0.8, { lv: 1, h: 0.8 }); b.solid('sink', 0.5, 17.6, 1.2, 0.5, { lv: 1, h: 0.9 }); b.deco('mirror', 0.5, 17.78, { y: 1.5, w: 1.0, h: 1.0, lv: 1 }); b.prop('hamper', 6.8, 10.0, 0, 1); b.prop('plant', -6.8, 8.0, 0, 1); b.prop('cabinet', 6.5, 8.0, 0, 1); b.prop('sidetbl', -6.8, 12.4, 0, 1);
  // غرفة النوم 3
  b.solid('bed', 11.0, 14.6, 2.0, 2.2, { lv: 1, h: 0.85, c: 0xa08a5a }); b.solid('wardrobe', 13.5, 4.0, 0.5, 3.2, { lv: 1, h: 2.2 }); b.solid('desk', 10.8, -1.6, 2.0, 0.8, { lv: 1, h: 0.76 });
  b.deco('rug', 11, 9, { w: 3.6, d: 2.8, c: 0xb8a070, c2: 0xe7dbbf, lv: 1 }); b.prop('lamp', 13.0, 17.0, 0, 1); b.prop('hamper', 9.0, 17.0, 0, 1); b.prop('bag', 12.8, 8.4, 0.2, 1); b.prop('cushion', 11.0, 8.6, 0.1, 1); b.prop('plant', 13.0, -1.8, 0, 1); b.prop('kchair', 10.8, -0.4, Math.PI, 1);
  b.deco('light', 11, 9, { r: 4, c: 0xffe3b8, lv: 1 });
  // نوافذ خارجية
  [[-16, 17.8], [-4, 17.8], [4, 17.8], [-24.8, 8]].forEach(([x, z]) => b.deco('window', x, z, { w: 2.0, h: 1.4, y: 1.3 }));
  [[-21, -17.8], [-11, -17.8], [4, -17.8]].forEach(([x, z]) => b.deco('window', x, z, { w: 2.0, h: 1.4, y: 1.3 }));
  return b.m;
}
