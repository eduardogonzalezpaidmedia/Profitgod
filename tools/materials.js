// Materiales por grupo (recursos y refinados), tier y encantamiento. Función pura: solo arma ids a partir de los datos del juego.
export const GROUPS = [
  { kind: 'RECURSOS', base: 'ORE', label: 'Mineral' }, { kind: 'RECURSOS', base: 'WOOD', label: 'Madera' }, { kind: 'RECURSOS', base: 'FIBER', label: 'Fibra' }, { kind: 'RECURSOS', base: 'HIDE', label: 'Piel' }, { kind: 'RECURSOS', base: 'ROCK', label: 'Piedra' },
  { kind: 'REFINADOS', base: 'METALBAR', label: 'Lingotes' }, { kind: 'REFINADOS', base: 'PLANKS', label: 'Tablones' }, { kind: 'REFINADOS', base: 'CLOTH', label: 'Tela' }, { kind: 'REFINADOS', base: 'LEATHER', label: 'Cuero' }, { kind: 'REFINADOS', base: 'STONEBLOCK', label: 'Bloques de piedra' }
];
export const idFor = (base, tier, ench) => ench ? 'T' + tier + '_' + base + '_LEVEL' + ench + '@' + ench : 'T' + tier + '_' + base;

export const EXTRA = [
  { kind: 'OTROS', base: 'ARTEFACTOS', label: 'Artefactos' }, { kind: 'OTROS', base: 'EQUIPOBASE', label: 'Equipo base' },
  { kind: 'OTROS', base: 'COMIDA', label: 'Comida y pociones' }, { kind: 'OTROS', base: 'VARIOS', label: 'Corazones y varios' }
];
export const ALL_GROUPS = GROUPS.concat(EXTRA);
const COVERED = /^T\d_(ORE|WOOD|FIBER|HIDE|ROCK|METALBAR|PLANKS|CLOTH|LEATHER|STONEBLOCK)(_LEVEL\d@\d)?$/;
export const famKey = id => String(id).replace(/^T\d_/, '').replace(/@\d$/, '');
const tierNum = id => { const m = /^T(\d)_/.exec(id); return m ? +m[1] : 0; };
const enchNum = id => { const m = /@(\d)$/.exec(id); return m ? +m[1] : 0; };

const _extra = new WeakMap();
/** Materiales de las recetas que no son recursos ni refinados: { ARTEFACTOS:[ids], EQUIPOBASE:[…], COMIDA:[…], VARIOS:[…] } */
export function extraIds(game) {
  if (_extra.has(game)) return _extra.get(game);
  const out = { ARTEFACTOS: new Set(), EQUIPOBASE: new Set(), COMIDA: new Set(), VARIOS: new Set() };
  for (const r of game.recipes.values()) { const it = game.item(r.product), food = it && (it.category === 'potions' || it.category === 'food');
    for (const m of r.materials) { const id = m.item_id; if (COVERED.test(id)) continue;
      const k = /ARTEFACT/.test(id) ? 'ARTEFACTOS' : /_SET1/.test(id) ? 'EQUIPOBASE' : food ? 'COMIDA' : 'VARIOS'; out[k].add(id); } }
  // un ítem usado en comida y en equipo queda en el grupo no-comida
  for (const id of out.COMIDA) if (out.VARIOS.has(id) || out.ARTEFACTOS.has(id) || out.EQUIPOBASE.has(id)) out.COMIDA.delete(id);
  const res = {}; for (const k of Object.keys(out)) res[k] = [...out[k]].sort(); _extra.set(game, res); return res;
}

/** Nombre común de una familia (sin «del adepto», «del experto»…): prefijo de palabras que comparten todos los tiers. */
export function familyLabel(names) {
  const u = [...new Set(names.filter(Boolean))]; if (!u.length) return ''; if (u.length === 1) return u[0];
  const w = u.map(n => n.split(' ')); let k = 0; while (w.every(a => a[k] && a[k] === w[0][k])) k++;
  const pre = w[0].slice(0, k); while (pre.length && /^(del|de|la|las|los|el|d')$/i.test(pre[pre.length - 1])) pre.pop();
  return pre.length ? pre.join(' ') : u[u.length - 1];
}

/** Agrupa ids por familia → bloques { key, label, iconId, rows:[{tier, name, cells:[{ench,id}|null ×5]}] } */
export function familyBlocks(game, ids) {
  const fam = new Map();
  for (const id of ids) { const k = famKey(id); if (!fam.has(k)) fam.set(k, new Map()); const tm = fam.get(k), t = tierNum(id); if (!tm.has(t)) tm.set(t, [null, null, null, null, null]); const e = enchNum(id); if (e <= 4) tm.get(t)[e] = { ench: e, id }; }
  const blocks = [];
  for (const [key, tm] of fam) { const tiers = [...tm.keys()].sort((a, b) => a - b);
    const rows = tiers.map(t => { const cells = tm.get(t), first = cells.find(Boolean); return { tier: t, name: game.name((cells[0] || first).id), cells }; });
    const top = rows[rows.length - 1], iconRow = rows.find(r => r.tier === 4) || top;
    blocks.push({ key, label: familyLabel(rows.map(r => r.name)), iconId: (iconRow.cells[0] || iconRow.cells.find(Boolean)).id, rows }); }
  return blocks;
}

/** → { ...grupo, blocks:[…], rows (del primer bloque), ids:[…] }. Recursos/refinados: un bloque con los 8 tiers; «otros»: una familia por bloque. */
export function groupTable(game, base) {
  const g = ALL_GROUPS.find(x => x.base === base); if (!g) return null;
  if (EXTRA.includes(g)) { const ids = extraIds(game)[base], blocks = familyBlocks(game, ids); return Object.assign({}, g, { blocks, rows: blocks[0] ? blocks[0].rows : [], ids }); }
  const exists = id => game.name(id) !== id, rows = [], ids = [];
  for (let tier = 1; tier <= 8; tier++) {
    const cells = [0, 1, 2, 3, 4].map(e => { const id = idFor(base, tier, e); return exists(id) ? { ench: e, id } : null; });
    if (!cells.some(Boolean)) continue; cells.forEach(c => { if (c) ids.push(c.id); });
    rows.push({ tier, name: game.name(idFor(base, tier, 0)), cells });
  }
  return Object.assign({}, g, { rows, ids, blocks: [{ key: base, label: g.label, iconId: idFor(base, 4, 0), rows }] });
}
export const allMaterialIds = game => ALL_GROUPS.flatMap(g => groupTable(game, g.base).ids);

/** Elige el precio a copiar: de la ciudad pedida, o el más barato entre ciudades; solo datos de menos de 24 h. rows = filas v2 del mismo ítem */
export function pickPrice(rows, city) {
  let best = null;
  for (const r of rows) { if (city && r.city !== city) continue; const p = r.sell && r.sell.price; if (!(p > 0) || !(r.sell.age_min < 1440)) continue; if (!best || p < best.price) best = { price: p, city: r.city, age: r.sell.age_min, src: r.sell.src }; }
  return best;
}
