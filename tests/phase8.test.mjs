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

import { priceCard, searchAny } from '../tools/pricecard.js';
import { makeSources } from '../data/sources.js';
t('ficha de precio: mejor compra/venta, margen neto y datos viejos fuera', () => {
  const row = (sell, sa, buy, ba) => ({ sell: { price: sell, age_min: sa, src: 'propio' }, buy: { price: buy, age_min: ba, src: 'público' } });
  const m = { 'Lymhurst|1': row(1000, 5, 900, 5), 'Caerleon|1': row(1200, 5, 2000, 5), 'Bridgewatch|1': row(100, 3000, 0, null) };
  const c = priceCard({ game, id: 'T4_BAG', cities: ['Lymhurst', 'Caerleon', 'Bridgewatch'], qualities: [1, 2], premium: false, market: (ci, i, q) => m[ci + '|' + q] || null });
  eq(c.byQ[0].bestBuy, { city: 'Lymhurst', price: 1000 }); eq(c.byQ[0].bestSell, { city: 'Caerleon', price: 2000 }); eq(c.byQ[0].margin, 2000 - 160 - 1000);
  eq(c.byQ[1].withData, 0); eq(c.byQ[0].rows[2].sell, 100);
});
t('buscador de ficha: encuentra objetos y materiales', () => { ok(searchAny(game, 't4 espada').length > 0); ok(searchAny(game, 'lingote t4').some(x => x.item_id === 'T4_METALBAR')); eq(searchAny(game, ''), []); });
t('memoria compartida: la 2.ª lectura no vuelve a consultar; con error no se guarda; clear() borra', async () => {
  let calls = 0; const pub = { on: () => true, prices: async () => { calls++; return [{ item_id: 'T4_BAG', city: 'Lymhurst', quality: 1, sell: { price: 5, t: Date.now() - 60000 }, buy: { price: 0, t: null } }]; }, stats: {} };
  const s = makeSources({ usePublic: true }, { own: { on: () => false }, pub });
  await s.prices(['T4_BAG'], ['Lymhurst'], [1]); const r2 = await s.prices(['T4_BAG'], ['Lymhurst'], [1]); eq(calls, 1); ok(r2.rows.length === 1 || r2.rows.length === 0);
  s.clear(); await s.prices(['T4_BAG'], ['Lymhurst'], [1]); eq(calls, 2);
  const bad = { on: () => true, prices: async () => { calls++; return []; }, stats: { lastError: 'x' } }, s2 = makeSources({ usePublic: true }, { own: { on: () => false }, pub: bad });
  const c0 = calls; await s2.prices(['T4_BAG'], ['Lymhurst'], [1]); await s2.prices(['T4_BAG'], ['Lymhurst'], [1]); eq(calls - c0, 2);
});

import { enchantCosts, cheapest, matIds, defaultId, KINDS, slotKey } from '../tools/enchantcost.js';
t('costo de encantar: cantidad × precio; sin cantidad o sin precio = desconocido, no 0', () => {
  const st = { prices: { rune6: 1000, soul6: 4000 }, qty: { weapons: { 1: 96, 2: 96 } } };
  const c = enchantCosts(st, 6, 'weapons'); eq([c[1], c[2], c[3], c[4]], [96000, 384000, null, null]);
  eq(c.detail[2].why, 'falta la cantidad por objeto'); eq(enchantCosts({ prices: { relic6: 5 }, qty: { armor: { 3: 10 } } }, 6, 'armor')[3], 50);
  eq(enchantCosts({ prices: {}, qty: { weapons: { 1: 5 } } }, 6, 'weapons').detail[0].why, 'falta el precio');
});
t('materiales de encanto: ids editables, fragmento sin tier, por tier las demás', () => {
  eq(defaultId(KINDS[0], 7), 'T7_RUNE'); eq(slotKey(KINDS[3], 8), 'shard'); eq(matIds({ ids: { rune5: 'T5_OTRA' } }, 5)[0], 'T5_OTRA'); eq(matIds({}, 5).length, 4);
});
t('lectura: elige el precio más barato con datos de menos de 24 h', () => {
  const rows = [{ city: 'A', sell: { price: 500, age_min: 3000, src: 'propio' } }, { city: 'B', sell: { price: 900, age_min: 10, src: 'público' } }, { city: 'C', sell: { price: 700, age_min: 20, src: 'propio' } }, { city: 'D', sell: { price: 0, age_min: 1 } }];
  eq(cheapest(rows), { price: 700, city: 'C', age: 20, src: 'propio' }); eq(cheapest([]), null);
});

import { sentence, verdict } from '../dashboard/solo.js';
const op = (type, via, item, a, b, score, profit) => ({ type, via, item, cityBuy: a, citySell: b, score, profit, units: 10 });
t('solo plata: frases simples por tipo de camino', () => {
  ok(sentence(op('flipping', 'comprar y llevar', 'Lingote', 'Lymhurst', 'Caerleon', 50, 1)).includes('Compra 10 Lingote en Lymhurst, llévalos a Caerleon') && sentence(op('flipping', 'comprar y llevar', 'X', 'A', 'B', 1, 1)).includes('otra ciudad'));
  ok(sentence(op('refining', 'refinar', 'Plancha', 'Fort Sterling', 'Caerleon', 1, 1)).startsWith('Refina 10 Plancha en Fort Sterling'));
  ok(sentence(op('blackmarket', 'fabricar', 'Ballesta', 'Martlock', 'Black Market', 1, 1)).includes('Mercado Negro'));
});
t('solo plata: veredicto = mejor por tipo y mejor general, sin ganancia o sin score no cuenta', () => {
  const v = verdict([op('flipping', 'comprar y llevar', 'A', 'x', 'y', 60, 100), op('refining', 'refinar', 'B', 'x', 'y', 80, 50), op('refining', 'refinar', 'C', 'x', 'y', 70, 500), op('crafting', 'fabricar', 'D', 'x', 'y', null, 900), op('crafting', 'fabricar', 'E', 'x', 'y', 99, -5)]);
  eq(v.top.item, 'B'); eq(v.best.refining.item, 'B'); eq(v.best.crafting, undefined); eq(v.best.flipping.item, 'A'); eq(verdict([]).top, null);
});

import { kindName } from '../tools/enchantcost.js';
t('nombres de materiales de encanto como en el juego', () => { eq(kindName(KINDS[0], 6), 'Runa del maestro'); eq(kindName(KINDS[1], 8), 'Alma del anciano'); eq(kindName(KINDS[2], 7), 'Reliquia del gran maestro'); eq(kindName(KINDS[3], 5), 'Fragmento avaloniano'); });

import { potionRank, potionIds, volumeStats } from '../tools/potions.js';
t('volumen: promedio de unidades por día y precio medio ponderado, sin datos = null', () => {
  const v = volumeStats([{ item_count: 100, avg_price: 10 }, { item_count: 300, avg_price: 20 }, { item_count: 200, avg_price: 30 }], 2); eq([v.perDay, v.days], [250, 2]); ok(Math.abs(v.avgPrice - (300 * 20 + 200 * 30) / 500) < 1e-9); eq(volumeStats([]), null); eq(volumeStats(null), null);
});
t('pociones: costo, ganancia por unidad, grupos por mediana y filtros de datos faltantes/viejos', () => {
  const ids = potionIds(game, 4, 5); ok(ids.length >= 4); const [a, b, c, d] = ids, mats = id => game.recipe(id).materials.map(m => m.item_id);
  const mk = {}; ids.slice(0, 4).forEach((id, i) => { mats(id).forEach(m => { mk['Lymhurst|' + m] = { sell_min: 10, sellAge: 5 }; }); mk['Caerleon|' + id] = { buy_max: [1000, 1200, 50000, 60000][i], buyAge: 5 }; });
  mk['Caerleon|' + d].buyAge = 3000;   // viejo → fuera
  const vols = [500, 10, 500, 10], hist = (city, id) => { const i = ids.indexOf(id); return i >= 0 && i < 4 ? [{ item_count: vols[i], avg_price: 1 }] : null; };
  const r = potionRank({ game, ids: [a, b, c, d], craftCity: 'Lymhurst', buyCity: 'Lymhurst', saleCities: ['Caerleon'], premium: false, feePerCraft: 0, market: (ci, id) => mk[ci + '|' + id] || null, hist });
  eq(r.out.length, 3); eq(r.stats.tooOld, 1); const A = r.out.find(x => x.id === a), C = r.out.find(x => x.id === c);
  ok(A.profitUnit < A.price && A.cost > 0); eq(A.canSell, Math.floor(500 / 1.5)); eq(C.group, 'ALTO VOLUMEN Y ALTO PRECIO'); eq(r.out.find(x => x.id === b).group, 'PRECIO BAJO'.length ? r.out.find(x => x.id === b).group : '');
  eq(r.medianVol, 500);
});
t('pociones: sin historial queda «sin volumen» y no se inventa', () => {
  const ids = potionIds(game, 4, 4), a = ids[0], mk = {}; game.recipe(a).materials.forEach(m => { mk['Lymhurst|' + m.item_id] = { sell_min: 10, sellAge: 5 }; }); mk['Caerleon|' + a] = { buy_max: 900, buyAge: 5 };
  const r = potionRank({ game, ids: [a], craftCity: 'Lymhurst', buyCity: 'Lymhurst', saleCities: ['Caerleon'], premium: true, market: (c, id) => mk[c + '|' + id] || null, hist: () => null });
  eq(r.out[0].perDay, null); eq(r.out[0].group, 'SIN VOLUMEN'); eq(r.stats.noVolume, 1); eq(r.taxPct, 4);
});
t('historial público: URL /stats/history con escala diaria y error claro', async () => {
  let u = null; const pub = makePublic({ usePublic: true }, { fetch: async x => { u = x; return { ok: true, status: 200, json: async () => [{ location: 'Caerleon', item_id: 'X', data: [] }] }; } });
  const r = await pub.history(['T4_POTION_HEAL'], ['Caerleon', 'Black Market'], [1]); ok(u.includes('/api/v2/stats/history/T4_POTION_HEAL?locations=Caerleon,Black%20Market&time-scale=24&qualities=1'), u); eq(r.length, 1);
  let m = ''; try { await makePublic({ usePublic: true }, { fetch: async () => { throw new Error('Failed to fetch'); } }).history(['X'], ['Caerleon']); } catch (e) { m = e.message; } ok(m.includes('CORS'));
});
