import fs from 'fs';
import { makeGameData } from '../crafting/recipes.js';
import { compareStrategies, neededIds } from '../profit-engine/strategies.js';
import { refineVsBuy } from '../refining/refining.js';
import { evaluate } from '../profit-engine/scenario.js';
import { craftBatch } from '../profit-engine/profit.js';

export const tests = [];
const t = (name, fn) => tests.push({ name, fn });
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'no coincide') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'falló'); };
const raw = {}; for (const n of ['items', 'recipes', 'materials', 'cities', 'stations', 'settings']) raw[n] = JSON.parse(fs.readFileSync(new URL('../data/game/' + n + '.json', import.meta.url)));
const game = makeGameData(raw);

// Tengo 120 lingotes de acero (T4). La ballesta T4 usa 12 lingotes + 20 tablas. Sin Premium, sin Focus, Lymhurst (retorno 15,25 %).
const mkt = (over = {}) => (city, id) => {
  const d = Object.assign({ 'Lymhurst|T4_METALBAR': { buy_max: 600, buyAge: 5 }, 'Lymhurst|T4_PLANKS': { sell_min: 50, sellAge: 5 },
    'Caerleon|T4_2H_CROSSBOW': { buy_max: 8000, buyAge: 10 }, 'Black Market|T4_2H_CROSSBOW': { buy_max: 12000, buyAge: 10 } }, over);
  return d[city + '|' + id] || null;
};
const run = (extra = {}, market) => compareStrategies(Object.assign({ game, materialId: 'T4_METALBAR', qty: 120, silver: 0, buyCity: 'Lymhurst', craftCity: 'Lymhurst', saleCity: 'Caerleon', premium: false, focus: false, feePerCraft: 0, market: market || mkt() }, extra));
const find = (r, kind, pid) => r.options.find(o => o.kind === kind && o.product === pid);

t('índice de recetas: el lingote T4 se usa en muchas recetas y el mineral en una', () => { ok(game.usedIn('T4_METALBAR').length > 100); eq(game.usedIn('T4_ORE'), ['T4_METALBAR']); });
t('ids de precios necesarios incluyen producto y demás materiales', () => { const ids = neededIds(game, 'T4_METALBAR'); ok(ids.includes('T4_2H_CROSSBOW') && ids.includes('T4_PLANKS') && ids.includes('T4_METALBAR')); });
t('A) vender materiales: 120 × 600 − 8 % = 66.240', () => { const r = run(); eq([r.A.value, r.A.unitPrice], [66240, 600]); });
t('fabricar y vender en la ciudad: números a mano', () => {
  const o = find(run(), 'Fabricar y vender', 'T4_2H_CROSSBOW');
  eq([o.crafts, o.units, o.saleCity], [11, 11, 'Caerleon']);
  eq(o.value, 71638, 'profit = 88.000 − 7.040 de impuesto − 9.322 de tablas'); eq(o.vsSell, 71638 - 66240);
  eq(o.materialsUsed, 112, 'lingotes usados = 12 × 11 × (1 − 15,25 %)'); eq(o.leftover, 8);
});
t('fabricar → Mercado Negro: más valor, es la mejor opción', () => {
  const r = run(), o = find(r, 'Fabricar → Mercado Negro', 'T4_2H_CROSSBOW');
  eq(o.value, 112118); eq(r.best.kind, 'Fabricar → Mercado Negro'); eq(r.bestIsSell, false);
});
t('si vender los materiales rinde más, la mejor opción es venderlos', () => {
  const r = run({}, mkt({ 'Lymhurst|T4_METALBAR': { buy_max: 5000, buyAge: 5 } })); eq(r.bestIsSell, true); eq(r.best.kind, 'Vender los materiales');
});
t('no recomienda gastar más silver del que tienes', () => {
  const r = run({ silver: 5000 }), o = find(r, 'Fabricar y vender', 'T4_2H_CROSSBOW');
  eq([o.crafts, o.limitedBySilver], [5, true]); ok(o.extraCost <= 5000, 'costo ≤ silver'); eq(o.value, 32563);
});
t('tarifa de estación por receta entra al costo', () => {
  const o = find(run({ feePerCraft: 100 }), 'Fabricar y vender', 'T4_2H_CROSSBOW'); eq(o.value, 71638 - 1100);
});
t('datos de más de 24 h se descartan y se cuentan', () => {
  const r = run({}, mkt({ 'Caerleon|T4_2H_CROSSBOW': { buy_max: 8000, buyAge: 2000 } }));
  eq(find(r, 'Fabricar y vender', 'T4_2H_CROSSBOW'), undefined, 'el destino con dato viejo se descarta');
  ok(find(r, 'Fabricar → Mercado Negro', 'T4_2H_CROSSBOW'), 'el otro destino, con dato fresco, sigue');
  const r2 = run({}, mkt({ 'Caerleon|T4_2H_CROSSBOW': { buy_max: 8000, buyAge: 2000 }, 'Black Market|T4_2H_CROSSBOW': { buy_max: 12000, buyAge: 2000 } }));
  eq(r2.options.length, 0); ok(r2.stats.tooOld >= 1, 'la receta se cuenta como descartada por datos viejos');
});
t('sin precio de un material necesario la opción se descarta, no se inventa', () => {
  const r = run({}, mkt({ 'Lymhurst|T4_PLANKS': null })); eq(r.options.length, 0); ok(r.stats.noData > 0);
});
t('refinar: el lingote T5 usa el T4 y se vende en la ciudad (no va al Mercado Negro)', () => {
  const m = (c, id) => ({ 'Lymhurst|T4_METALBAR': { buy_max: 600, buyAge: 5 }, 'Lymhurst|T5_ORE': { sell_min: 150, sellAge: 5 }, 'Caerleon|T5_METALBAR': { buy_max: 1500, buyAge: 5 }, 'Black Market|T5_METALBAR': { buy_max: 9999, buyAge: 5 } })[c + '|' + id] || null;
  const r = compareStrategies({ game, materialId: 'T4_METALBAR', qty: 100, silver: 0, buyCity: 'Lymhurst', craftCity: 'Thetford', saleCity: 'Caerleon', premium: false, focus: false, feePerCraft: 0, market: m });
  const o = find(r, 'Refinar y vender', 'T5_METALBAR'); ok(o, 'hay opción de refinar'); eq(o.bonus, true, 'Thetford tiene bono de refinado de mineral');
  eq(r.options.filter(x => x.product === 'T5_METALBAR' && x.saleCity === 'Black Market').length, 0);
});
t('Premium baja el impuesto en la opción A', () => { eq(run({ premium: true }).A.value, Math.round(120 * 600 * 0.96)); });
t('refinar vs comprar directo: compara profit con las mismas unidades', () => {
  const calc = (net, profit) => ({ sale: { net }, profit });
  const r = refineVsBuy({ units: 10, buyMarket: { sell_min: 600, buy_max: 500 }, refine: { instant: calc(9000, 3500), order: calc(9500, 3000) }, setupPct: 2.5 });
  eq([r.instant.cost, r.instant.directProfit, r.instant.better, r.instant.diff], [6000, 3000, 'refinar', 500]);
  eq([r.order.cost, r.order.directProfit, r.order.better], [5130, 4370, 'comprar']);
  eq(refineVsBuy({ units: 10, buyMarket: null, refine: { instant: calc(9000, 3500), order: calc(9500, 3000) }, setupPct: 2.5 }).instant.directProfit, null, 'sin precio no se inventa');
});
t('material ya tuyo: no se compra pero sí cuenta para el retorno', () => {
  const c = craftBatch({ recipe: { quantity_produced: 1, materials: [{ item_id: 'A', quantity: 10, returnable: true }, { item_id: 'B', quantity: 4, returnable: true }] }, units: 1, prices: { B: 100 }, owned: { A: true }, returnRate: 0.5, craftingFee: { value: 0, mode: 'total' }, sale: { unitPrice: 1000, mode: 'instant', taxPct: 0, setupPct: 0 } });
  eq([c.materialCost, c.lines[0].needed, c.profit], [200, 5, 800]);
});
t('el motor de profit existente no cambió (la poción de siempre)', () => {
  const e = evaluate({ game, itemId: 'T2_POTION_HEAL', units: 10, craftCity: 'Lymhurst', saleCity: 'Caerleon', premium: false, focus: false, manualRatePct: 0, market: { T2_AGARIC: { sell_min: 100, buy_max: 90 } }, saleMarket: { sell_min: 420, buy_max: 400 }, fee: { mode: 'total', total: 0 }, overrides: {} });
  eq(e.base.instant.calc.profit, 2080);
});
