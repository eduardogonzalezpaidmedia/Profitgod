// Costo de fabricar con TUS precios de materiales. Función pura: recibe una función price(id) → número|null.
import { famKey, familyBlocks } from './materials.js?v=0.21';

const L = { sword: 'Espadas', axe: 'Hachas', mace: 'Mazas', hammer: 'Martillos', knuckles: 'Guanteletes', bow: 'Arcos', crossbow: 'Ballestas', dagger: 'Dagas', spear: 'Lanzas', quarterstaff: 'Bastones de combate', cursestaff: 'Bastones malditos', froststaff: 'Bastones de escarcha', firestaff: 'Bastones de fuego', arcanestaff: 'Bastones arcanos', holystaff: 'Bastones sagrados', naturestaff: 'Bastones de naturaleza', shapeshifterstaff: 'Bastones cambiaformas',
  plate_armor: 'Armaduras de placas', leather_armor: 'Chaquetas de cuero', cloth_armor: 'Túnicas de tela', plate_helmet: 'Cascos de placas', leather_helmet: 'Capuchas de cuero', cloth_helmet: 'Cowls de tela', other: 'Otros', plate_shoes: 'Botas de placas', leather_shoes: 'Zapatos de cuero', cloth_shoes: 'Sandalias de tela',
  shieldtype: 'Escudos', booktype: 'Tomos', torchtype: 'Antorchas', bags: 'Bolsos', satchels: 'Alforjas', capes: 'Capas' };
/** Menú lateral: [{ section, items:[{ key, label, category, subs:[…] }] }] */
export const MENU = [
  { section: 'ARMAS', items: ['sword', 'axe', 'mace', 'hammer', 'knuckles', 'bow', 'crossbow', 'dagger', 'spear', 'quarterstaff', 'cursestaff', 'froststaff', 'firestaff', 'arcanestaff', 'holystaff', 'naturestaff', 'shapeshifterstaff'].map(k => ({ key: 'weapons|' + k, label: L[k], category: 'weapons', subs: [k] })) },
  { section: 'ARMADURAS', items: ['plate_armor', 'leather_armor', 'cloth_armor'].map(k => ({ key: 'armor|' + k, label: L[k], category: 'armor', subs: [k] })) },
  { section: 'CASCOS', items: ['plate_helmet', 'leather_helmet', 'cloth_helmet'].map(k => ({ key: 'head|' + k, label: L[k], category: 'head', subs: [k] })) },
  { section: 'BOTAS', items: ['plate_shoes', 'leather_shoes', 'cloth_shoes'].map(k => ({ key: 'shoes|' + k, label: L[k], category: 'shoes', subs: [k] })) },
  { section: 'OTROS', items: [{ key: 'capes|*', label: 'Capas', category: 'capes', subs: null }, ...['shieldtype', 'booktype', 'torchtype'].map(k => ({ key: 'offhands|' + k, label: L[k], category: 'offhands', subs: [k] })), ...['bags', 'satchels'].map(k => ({ key: 'bags|' + k, label: L[k], category: 'bags', subs: [k] }))] }
];
export const findEntry = key => { for (const s of MENU) for (const i of s.items) if (i.key === key) return i; return null; };

/** Bloques (una familia de objetos por bloque) de una entrada del menú. */
export function costBlocks(game, entry) {
  const ids = game.items.filter(i => i.category === entry.category && (!entry.subs || entry.subs.includes(i.subcategory)) && game.recipes.has(i.item_id)).map(i => i.item_id);
  return familyBlocks(game, ids);
}

/** Costo por unidad fabricada. rrr = % de devolución de recursos (solo materiales que devuelven). → { cost|null, missing:[ids], parts:[{id,qty,price}] } */
export function craftCost(game, id, price, rrr = 0) {
  const r = game.recipe(id); if (!r) return { cost: null, missing: [], parts: [], noRecipe: true };
  const back = Math.min(Math.max(+rrr || 0, 0), 99) / 100, missing = [], parts = []; let total = 0;
  for (const m of r.materials) { const p = price(m.item_id); if (!(p > 0)) { missing.push(m.item_id); continue; } const eff = m.returnable ? m.quantity * (1 - back) : m.quantity; parts.push({ id: m.item_id, qty: m.quantity, price: p }); total += eff * p; }
  const per = r.quantity_produced > 0 ? r.quantity_produced : 1;
  return { cost: missing.length ? null : Math.round(total / per), missing, parts };
}
/** Todos los materiales que usan estos bloques. */
export function blockMaterialIds(game, blocks) {
  const s = new Set(); for (const b of blocks) for (const r of b.rows) for (const c of r.cells) if (c) { const rec = game.recipe(c.id); if (rec) rec.materials.forEach(m => s.add(m.item_id)); } return [...s];
}
export { famKey };
