// أصول مشتركة بين الخرائط (نبتة، وسادة، سلة...) — كلها تُدمج بمجموعات مواد.
export function common(K) {
  const { box, cyl, sph, rbox, tor, lathe } = K;
  const plantBuild = (pot = 0xd9d4cc, leaf = 0x3f9f6a, tall = 1) => () => {
    const p = [lathe([[0.1, 0], [0.22, 0.02], [0.27, 0.35], [0.25, 0.4]], pot, 0, 0, 0, { m: 'gloss' }), cyl(0.24, 0.24, 0.02, 0x4a3426, 0, 0.36, 0, { seg: 12 })];
    for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.08 + (i % 3) * 0.05, h = 0.55 + (i % 4) * 0.2 * tall; p.push(sph(0.2 - (i % 3) * 0.03, i % 2 ? leaf : 0x2f8f5a, Math.cos(a) * r, 0.4 + h * 0.62, Math.sin(a) * r, { sy: 1.6 * tall, ws: 8, hs: 6 })); }
    p.push(cyl(0.015, 0.02, 0.8 * tall, 0x3b6b3b, 0, 0.4, 0, { seg: 5 })); return p;
  };
  return {
    kinds: { plant: plantBuild(), pplant: plantBuild(0x1f1b16, 0x2f8f5a, 1.6), splant: plantBuild(0xf472b6, 0x34d399, 0.9),
      cushion: () => [rbox(0.8, 0.28, 0.8, 0xc084fc, 0, 0, 0, { r: 0.28, bev: 0.1, m: 'fabric' }), rbox(0.5, 0.06, 0.5, 0xe9d5ff, 0, 0.27, 0, { r: 0.2, bev: 0.03, m: 'fabric' })],
    },
  };
}
