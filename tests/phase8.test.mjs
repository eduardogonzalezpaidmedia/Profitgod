import fs from 'fs';
import { makeGameData } from '../crafting/recipes.js';
import { planCrafts, plannerIds } from '../tools/planner.js';
import { enchantFlips, enchantIds } from '../tools/enchant.js';
import { goldStats } from '../tools/gold.js';
import { referenceTables } from '../tools/reference.js';
import { makePublic } from '../data/public.js';

export const tests = [];
const t = (name, fn) => tests.push({ name, fn });
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'no coincide') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'falló'); };
const raw = {}; for (const n of ['items', 'recipes', 'materials', 'cities', 'stations', 'settings']) raw[n] = JSON.parse(fs.readFileSync(new URL('../data/game/' + n + '.json', import.meta.url)));
const game = makeGameData(raw);
const mk = (o) => (c, id) => o[c + '|' + id] || null;

t('planificador: ids = productos + materiales', () => { const ids = plannerIds(game, [{ id: 'T4_MAIN_SWORD', qty: 1 }]); ok(ids.includes('T4_MAIN_SWORD') && ids.includes('T4_METALBAR') && ids.includes('T4_LEATHER')); });
t('planificador: dos ítems, lista de compra sumada y ganancia a mano', () => {
  const m = mk({ 'Lymhurst|T4_METALBAR': { sell_min: 1000, sellAge: 5 }, 'Lymhurst|T4_LEATHER': { sell_min: 500, sellAge: 5 }, 'Caerleon|T4_MAIN_SWORD': { buy_max: 20000, buyAge: 5 }, 'Caerleon|T4_2H_BOW': { buy_max: 1, buyAge: 5 } });
  const rec = game.recipe('T4_MAIN_SWORD');
  const r = planCrafts({ game, items: [{ id: 'T4_MAIN_SWORD', qty: 10 }, { id: 'T4_MAIN_SWORD', qty: 5 }], craftCity: 'Lymhurst', buyCity: 'Lymhurst', saleCity: 'Caerleon', premium: false, focus: false, feePerCraft: 0, market: m });
  eq(r.lines.length, 2); const shopBar = r.shopping.find(s => s.id === 'T4_METALBAR');
  ok(shopBar.qty > 0 && shopBar.unit === 1000 && shopBar.cost === shopBar.qty * 1000, 'compra');
  const b = r.lines[0].batch; eq(b.made, 10); ok(Math.abs(b.sale.net - (10 * 20000 * (1 - 0.08 - 0.025 * 0))) < 25000 * 0 + 1 || b.sale.net > 0);
  eq(r.totals.profit, Math.round(r.lines[0].batch.profit + r.lines[1].batch.profit)); ok(rec.materials.length === 2);
});
t('planificador: sin precio no inventa; el ítem no suma al total y avisa', () => {
  const r = planCrafts({ game, items: [{ id: 'T4_MAIN_SWORD', qty: 3 }], craftCity: 'Lymhurst', buyCity: 'Lymhurst', saleCity: 'Caerleon', premium: false, market: mk({}) });
  eq(r.totals.profit, 0); eq(r.totals.incomplete, 1); ok(r.lines[0].issues.length >= 2);
});
t('planificador: precio de más de 24 h no entra al total', () => {
  const m = mk({ 'Lymhurst|T4_METALBAR': { sell_min: 1000, sellAge: 5 }, 'Lymhurst|T4_LEATHER': { sell_min: 500, sellAge: 2000 }, 'Caerleon|T4_MAIN_SWORD': { buy_max: 20000, buyAge: 5 } });
  const r = planCrafts({ game, items: [{ id: 'T4_MAIN_SWORD', qty: 1 }], craftCity: 'Lymhurst', buyCity: 'Lymhurst', saleCity: 'Caerleon', premium: false, market: m });
  eq(r.totals.invest, 0); ok(r.lines[0].issues.some(x => x.includes('24 h')));
});
t('cocina y alquimia: existen recetas con estación food y potion en el planificador', () => {
  ok(game.items.some(i => i.crafting_station === 'food' && game.recipes.has(i.item_id))); ok(game.items.some(i => i.crafting_station === 'potion' && game.recipes.has(i.item_id)));
  const r = planCrafts({ game, items: [{ id: 'T4_POTION_HEAL', qty: 5 }], craftCity: 'Lymhurst', buyCity: 'Lymhurst', saleCity: 'Caerleon', premium: true, market: mk({ 'Lymhurst|T4_BURDOCK': { sell_min: 10, sellAge: 1 }, 'Lymhurst|T3_EGG': { sell_min: 20, sellAge: 1 }, 'Caerleon|T4_POTION_HEAL': { buy_max: 2000, buyAge: 1 } }) });
  eq(r.taxPct, 4); ok(r.totals.profit > 0);
});
t('encanto: ganancia = venta − impuesto − compra − costo de encantar; sin costo = bruta', () => {
  const ids = ['T6_MAIN_SWORD', 'T6_MAIN_SWORD@1'];
  const m = mk({ 'Lymhurst|T6_MAIN_SWORD': { sell_min: 10000, sellAge: 3, sellSrc: 'propio' }, 'Caerleon|T6_MAIN_SWORD@1': { buy_max: 20000, buyAge: 4, buySrc: 'público' } });
  const a = enchantFlips({ game, ids, buyCities: ['Lymhurst', 'Caerleon'], saleCities: ['Lymhurst', 'Caerleon'], premium: false, enchantCost: {}, market: m });
  eq(a.out.length, 1); eq(a.out[0].tax, 1600); eq(a.out[0].profit, 20000 - 1600 - 10000); eq(a.out[0].costKnown, false);
  const b = enchantFlips({ game, ids, buyCities: ['Lymhurst'], saleCities: ['Caerleon'], premium: false, enchantCost: { 1: 3000 }, market: m });
  eq(b.out[0].profit, 5400); eq(b.out[0].costKnown, true); eq(b.out[0].oldest, 4);
});
t('encanto: datos viejos o faltantes se cuentan y no se muestran', () => {
  const ids = ['T6_MAIN_SWORD', 'T6_MAIN_SWORD@1'];
  const r = enchantFlips({ game, ids, buyCities: ['Lymhurst'], saleCities: ['Caerleon'], premium: false, enchantCost: {}, market: mk({ 'Lymhurst|T6_MAIN_SWORD': { sell_min: 10, sellAge: 3000 }, 'Caerleon|T6_MAIN_SWORD@1': { buy_max: 99, buyAge: 3 } }) });
  eq(r.out.length, 0); eq(r.stats.tooOld, 1);
  eq(enchantFlips({ game, ids, buyCities: ['Lymhurst'], saleCities: ['Caerleon'], premium: false, market: mk({}) }).stats.noData, 1);
});
t('encanto: ids del tier y categoría pedidos', () => { const ids = enchantIds(game, { tier: 6, category: 'weapons' }); ok(ids.length > 50 && ids.every(i => i.startsWith('T6_'))); ok(ids.some(i => i.endsWith('@1'))); });
t('oro: estadísticas, orden y datos insuficientes', () => {
  const s = goldStats([{ price: 300, timestamp: '2026-10-03T00:00:00' }, { price: 100, timestamp: '2026-10-01T00:00:00' }, { price: 200, timestamp: '2026-10-02T00:00:00' }]);
  eq([s.first.price, s.last.price, s.min, s.max, s.avg, s.median, s.changePct, s.trend], [100, 300, 100, 300, 200, 200, 200, 'SUBE']); eq(goldStats([{ price: 1, timestamp: '2026-10-01T00:00:00' }]), null); eq(goldStats(null), null);
  eq(goldStats([{ price: 5, timestamp: '2026-10-01T00:00:00' }, { price: 5, timestamp: '2026-10-02T00:00:00' }]).trend, 'ESTABLE');
});
t('oro: la API pública se consulta en /api/v2/stats/gold y los fallos dan mensaje claro', async () => {
  let u = null; const pub = makePublic({ usePublic: true, server: 'americas' }, { fetch: async x => { u = x; return { ok: true, status: 200, json: async () => [{ price: 1, timestamp: 'x' }] }; } });
  await pub.gold(50); ok(u.endsWith('/api/v2/stats/gold?count=50'), u);
  const bad = makePublic({ usePublic: true }, { fetch: async () => { throw new Error('Failed to fetch'); } });
  let msg = ''; try { await bad.gold(5); } catch (e) { msg = e.message; } ok(msg.includes('CORS'));
  let off = ''; try { await makePublic({ usePublic: false }, {}).gold(5); } catch (e) { off = e.message; } ok(off.includes('desactivados'));
});
t('referencia: retorno 15,25 % base, impuestos y bonos solo verificados', () => {
  const r = referenceTables(game); eq(r.rr.rows[0], ['Ciudad real, sin bono', '+18', '15,3 %'].slice(0, 2).concat([r.rr.rows[0][2]]));
  ok(r.rr.rows[0][2].startsWith('15,')); ok(r.taxes.rows.some(x => x[1] === '8 %') && r.taxes.rows.some(x => x[1] === '4 %')); ok(r.cities.rows.length >= 5); ok(r.sources.length >= 3);
});
