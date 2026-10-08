// Materiales por grupo (recursos y refinados), tier y encantamiento. Función pura: solo arma ids a partir de los datos del juego.
export const GROUPS = [
  { kind: 'RECURSOS', base: 'ORE', label: 'Mineral' }, { kind: 'RECURSOS', base: 'WOOD', label: 'Madera' }, { kind: 'RECURSOS', base: 'FIBER', label: 'Fibra' }, { kind: 'RECURSOS', base: 'HIDE', label: 'Piel' }, { kind: 'RECURSOS', base: 'ROCK', label: 'Piedra' },
  { kind: 'REFINADOS', base: 'METALBAR', label: 'Lingotes' }, { kind: 'REFINADOS', base: 'PLANKS', label: 'Tablones' }, { kind: 'REFINADOS', base: 'CLOTH', label: 'Tela' }, { kind: 'REFINADOS', base: 'LEATHER', label: 'Cuero' }, { kind: 'REFINADOS', base: 'STONEBLOCK', label: 'Bloques de piedra' }
];
export const idFor = (base, tier, ench) => ench ? 'T' + tier + '_' + base + '_LEVEL' + ench + '@' + ench : 'T' + tier + '_' + base;

/** → { ...grupo, rows:[{tier, name, cells:[{ench, id}|null ×5]}], ids:[…] } solo con ids que existen en los datos del juego */
export function groupTable(game, base) {
  const g = GROUPS.find(x => x.base === base); if (!g) return null;
  const exists = id => game.name(id) !== id, rows = [], ids = [];
  for (let tier = 1; tier <= 8; tier++) {
    const cells = [0, 1, 2, 3, 4].map(e => { const id = idFor(base, tier, e); return exists(id) ? { ench: e, id } : null; });
    if (!cells.some(Boolean)) continue; cells.forEach(c => { if (c) ids.push(c.id); });
    rows.push({ tier, name: game.name(idFor(base, tier, 0)), cells });
  }
  return Object.assign({}, g, { rows, ids });
}
export const allMaterialIds = game => GROUPS.flatMap(g => groupTable(game, g.base).ids);

/** Elige el precio a copiar: de la ciudad pedida, o el más barato entre ciudades; solo datos de menos de 24 h. rows = filas v2 del mismo ítem */
export function pickPrice(rows, city) {
  let best = null;
  for (const r of rows) { if (city && r.city !== city) continue; const p = r.sell && r.sell.price; if (!(p > 0) || !(r.sell.age_min < 1440)) continue; if (!best || p < best.price) best = { price: p, city: r.city, age: r.sell.age_min, src: r.sell.src }; }
  return best;
}
