// جمعتنا — مين المتنكر؟: أدوات بناء الخرائط المشتركة (حتمية، تعمل على الخادم والعميل).
// الخريطة = جدران وأبواب (فراغات بالجدران) + مجسمات صلبة + ديكور + أغراض قابلة للتنكر + طوابق ودرج.
export const T = 0.4;          // سمك الجدار
export const WH = 3.4;         // ارتفاع الجدار
export const LH = 3.7;         // ارتفاع الطابق العلوي

/** الأغراض القابلة للتنكر: r نصف قطر التصادم، h الارتفاع. نفس المجسم يُرسم للأثاث العادي وللمتنكر. */
export const KINDS = {
  // --- مستشفى
  wchair: { n: 'كرسي انتظار', r: 0.42, h: 1.0 }, medcart: { n: 'عربة أدوات طبية', r: 0.5, h: 1.1 }, trashm: { n: 'سلة مهملات', r: 0.3, h: 0.8 },
  lockerm: { n: 'خزانة صغيرة', r: 0.42, h: 1.6 }, monitor: { n: 'جهاز مراقبة', r: 0.38, h: 1.5 }, sidetblm: { n: 'طاولة جانبية', r: 0.38, h: 0.85 },
  supplybox: { n: 'صندوق مستلزمات', r: 0.42, h: 0.7 }, wheelch: { n: 'كرسي متحرك', r: 0.5, h: 1.0 }, ivstand: { n: 'حامل محاليل', r: 0.3, h: 2.0 }, cooler: { n: 'برّادة مياه', r: 0.35, h: 1.4 },
  // --- بيت
  lamp: { n: 'أباجورة', r: 0.3, h: 1.7 }, armchair: { n: 'كرسي صالون', r: 0.55, h: 1.0 }, toybox: { n: 'صندوق ألعاب', r: 0.45, h: 0.7 }, laundry: { n: 'سلة غسيل', r: 0.38, h: 0.8 },
  cabinet: { n: 'خزانة صغيرة', r: 0.45, h: 1.1 }, vacuum: { n: 'مكنسة', r: 0.3, h: 1.2 }, bag: { n: 'حقيبة', r: 0.35, h: 0.7 }, cushion: { n: 'وسادة كبيرة', r: 0.45, h: 0.5 },
  sidetbl: { n: 'طاولة جانبية', r: 0.4, h: 0.7 }, plant: { n: 'نبتة', r: 0.4, h: 1.3 }, ottoman: { n: 'مقعد صغير', r: 0.4, h: 0.5 },
  kchair: { n: 'كرسي طعام', r: 0.4, h: 1.0 }, gchair: { n: 'كرسي حديقة', r: 0.45, h: 0.95 }, hamper: { n: 'سلة ملابس', r: 0.35, h: 0.7 }, shoebox: { n: 'صندوق أحذية', r: 0.35, h: 0.45 },
  // --- مدرسة
  backpack: { n: 'حقيبة مدرسية', r: 0.35, h: 0.7 }, schair: { n: 'كرسي طالب', r: 0.38, h: 0.9 }, trashs: { n: 'سلة مهملات', r: 0.32, h: 0.8 }, bookcrate: { n: 'صندوق كتب', r: 0.42, h: 0.6 },
  ball: { n: 'كرة', r: 0.32, h: 0.7 }, sportsbag: { n: 'حقيبة رياضية', r: 0.4, h: 0.6 }, bookcart: { n: 'عربة كتب', r: 0.5, h: 1.2 }, stool: { n: 'مقعد صغير', r: 0.32, h: 0.6 },
  projector: { n: 'جهاز عرض', r: 0.35, h: 1.4 }, sdesk: { n: 'طاولة مدرسية', r: 0.6, h: 0.85 },
  // --- سوبرماركت
  goodsbox: { n: 'صندوق بضائع', r: 0.45, h: 0.8 }, cart: { n: 'عربة تسوق', r: 0.5, h: 1.0 }, basket: { n: 'سلة تسوق', r: 0.3, h: 0.5 }, fruitcrate: { n: 'صندوق فواكه', r: 0.45, h: 0.6 },
  cleanbucket: { n: 'عربة تنظيف', r: 0.4, h: 1.1 }, saleSign: { n: 'لافتة عروض', r: 0.35, h: 1.6 }, ochair: { n: 'كرسي موظف', r: 0.4, h: 1.0 }, pallet: { n: 'منصة بضائع', r: 0.55, h: 0.7 },
  // --- فندق
  suitcase: { n: 'حقيبة سفر', r: 0.35, h: 0.8 }, luggagecart: { n: 'عربة حقائب', r: 0.55, h: 1.5 }, lchair: { n: 'كرسي فاخر', r: 0.45, h: 1.0 }, lamptbl: { n: 'أباجورة طاولة', r: 0.28, h: 0.9 },
  bin2: { n: 'سلة', r: 0.3, h: 0.7 }, ltable: { n: 'طاولة جانبية', r: 0.38, h: 0.75 }, servicebox: { n: 'صندوق خدمات', r: 0.42, h: 0.7 }, hbench: { n: 'مقعد انتظار', r: 0.7, h: 0.8 }, pplant: { n: 'نبتة زينة', r: 0.42, h: 1.6 },
  // --- ملاهي
  plush: { n: 'دمية', r: 0.45, h: 1.3 }, prizebox: { n: 'صندوق جوائز', r: 0.45, h: 0.8 }, fchair: { n: 'كرسي ملون', r: 0.38, h: 0.9 }, toyblock: { n: 'مكعب ألعاب', r: 0.4, h: 0.8 },
  fig: { n: 'مجسم ديكور', r: 0.45, h: 1.7 }, ballbox: { n: 'صندوق كرات', r: 0.5, h: 0.8 }, poster: { n: 'لوحة دعائية', r: 0.35, h: 1.6 }, splant: { n: 'نبتة', r: 0.4, h: 1.2 },
};

const overlaps = (w, lv) => w.lv === 2 || lv === 2 || w.lv === lv;
export const lvMatch = overlaps;

/** منشئ الخرائط. كل الإحداثيات أمتار؛ المركز (0,0)؛ x يمين، z للأمام (جنوب). */
export function mapBuilder(def) {
  const m = Object.assign({ walls: [], solids: [], deco: [], doors: [], rooms: [], props: [], labels: [], stairs: [], anim: [] }, def);
  const b = {
    m,
    /** أرضية غرفة. kind يحدد نمط الأرضية بالعميل. */
    room(id, x0, z0, x1, z1, o = {}) { m.rooms.push(Object.assign({ id, x0, z0, x1, z1, lv: 0, floor: 'plain', c1: 0x888888, c2: 0x777777 }, o)); return b; },
    /** جدار مستقيم مع فراغات. gaps: [[مركز, عرض, نوع]] ، النوع: door (افتراضي) | open (بدون إطار) | glass | double */
    wall(x0, z0, x1, z1, gaps = [], o = {}) {
      const ax = z0 === z1 ? 'x' : 'z'; const a0 = ax === 'x' ? Math.min(x0, x1) : Math.min(z0, z1), a1 = ax === 'x' ? Math.max(x0, x1) : Math.max(z0, z1), fix = ax === 'x' ? z0 : x0;
      const gs = gaps.map((g) => ({ c: g[0], w: g[1], t: g[2] || 'door' })).sort((p, q) => p.c - q.c); let cur = a0;
      const seg = (s, e) => { if (e - s < 0.05) return; const len = e - s, mid = (s + e) / 2; m.walls.push(Object.assign({ x: ax === 'x' ? mid : fix, z: ax === 'x' ? fix : mid, w: ax === 'x' ? len : T, d: ax === 'x' ? T : len, lv: 0, h: WH }, o)); };
      for (const g of gs) { seg(cur, g.c - g.w / 2); cur = g.c + g.w / 2; m.doors.push({ x: ax === 'x' ? g.c : fix, z: ax === 'x' ? fix : g.c, w: g.w, ax, t: g.t, lv: o.lv === undefined ? 0 : o.lv }); }
      seg(cur, a1); return b;
    },
    /** صندوق جدران حول مستطيل. gaps: {n,s,e,w} */
    box(x0, z0, x1, z1, g = {}, o = {}) { b.wall(x0, z0, x1, z0, g.n || [], o); b.wall(x0, z1, x1, z1, g.s || [], o); b.wall(x0, z0, x0, z1, g.w || [], o); b.wall(x1, z0, x1, z1, g.e || [], o); return b; },
    /** مجسم صلب (يصطدم به الجميع). style يحدد الشكل بالعميل. المركز x,z والأبعاد w (على x) و d (على z). */
    solid(style, x, z, w, d, o = {}) { m.solids.push(Object.assign({ style, x, z, w, d, lv: 0, h: 1 }, o)); return b; },
    /** ديكور بدون تصادم. */
    deco(style, x, z, o = {}) { m.deco.push(Object.assign({ style, x, z, lv: 0 }, o)); return b; },
    /** غرض قابل للتنكر (أثاث عادي بنفس مجسم المتنكر). */
    prop(kind, x, z, rot = 0, lv = 0) { if (!KINDS[kind]) throw new Error('kind? ' + kind); m.props.push({ kind, x, z, rot, lv }); return b; },
    row(kind, x, z, n, dx, dz, rot = 0, lv = 0) { for (let i = 0; i < n; i++) b.prop(kind, x + dx * i, z + dz * i, rot, lv); return b; },
    label(text, x, z, y = 3.1, lv = 0, c) { m.labels.push({ text, x, z, y, lv, c }); return b; },
    /** درج: منطقة x0..x1 × z0..z1 ؛ axis 'z' أو 'x'؛ dir اتجاه الصعود (+1/-1) ؛ الطابق السفلي عند الطرف المعاكس. */
    stairs(x0, z0, x1, z1, axis, dir) { m.stairs.push({ x0, z0, x1, z1, axis, dir }); return b; },
  };
  return b;
}

/** ارتفاع الأرض عند نقطة: على الدرج يتدرج، وإلا حسب الطابق. */
export function levelY(map, x, z, lv) {
  for (const s of map.stairs) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) { const t = stairT(s, x, z); return t * LH; }
  return lv >= 1 ? LH : 0;
}
export function stairT(s, x, z) {
  const t = s.axis === 'z' ? (z - s.z0) / (s.z1 - s.z0) : (x - s.x0) / (s.x1 - s.x0);
  const u = s.dir > 0 ? t : 1 - t; return Math.max(0, Math.min(1, u));
}
export function stairAt(map, x, z) { for (const s of map.stairs) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return s; return null; }
/** بعد الحركة: يبدّل الطابق عند منتصف الدرج. */
export function updateLevel(map, p) {
  const s = stairAt(map, p.x, p.z); if (!s) return p.lv; const t = stairT(s, p.x, p.z);
  if (t > 0.55) p.lv = 1; else if (t < 0.45) p.lv = 0; return p.lv;
}
