import { mapBuilder } from '../prop-core.js';
export function funland() { const b = mapBuilder({ id: 'funland', name: 'funland', line: '', w: 40, d: 30, gate: { x: 0, z: 13, lv: 0 }, theme: {} }); b.room('a', -20, -15, 20, 15); b.box(-20, -15, 20, 15); return b.m; }
