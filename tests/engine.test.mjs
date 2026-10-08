import fs from 'fs';
import { makeGameData } from '../crafting/recipes.js';
import { evaluate, rateFor, stationFee } from '../profit-engine/scenario.js';
import { compute as rr, fromBonus } from '../refining/returnRate.js';
import { calculateROI, calculateSilverPerHour } from '../profit-engine/profit.js';

export const tests = [];
const t = (name, fn) => tests.push({ name, fn });
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'no coincide') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); };
const near = (a, b, tol, m) => { if (a === null || Math.abs(a - b) > tol) throw new Error((m || 'no coincide') + ': ' + a + ' vs ' + b); };
const raw = {}; for (const n of ['items', 'recipes', 'materials', 'cities', 'stations', 'settings']) raw[n] = JSON.parse(fs.readFileSync(new URL('../data/game/' + n + '.json', import.meta.url)));
const game = makeGameData(raw);

// Poción de curación menor T2: se fabrican 5 por receta con 8 AGARIC. 10 unidades = 2 recetas = 16 AGARIC brutos.
const base = (extra = {}) => Object.assign({
  game, itemId: 'T2_POTION_HEAL', units: 10, craftCity: 'Lymhurst', saleCity: 'Caerleon', premium: false, focus: false, manualRatePct: 0,
  market: { T2_AGARIC: { sell_min: 100, buy_max: 90, sellAge: 3, buyAge: 3 } }, saleMarket: { sell_min: 420, buy_max: 400, sellAge: 4, buyAge: 4 },
  fee: { mode: 'total', total: 0 }, overrides: {}
}, extra);

t('datos del juego: receta de la poción y búsqueda', () => {
  const r = game.recipe('T2_POTION_HEAL'); eq([r.quantity_produced, r.materials[0].item_id, r.materials[0].quantity], [5, 'T2_AGARIC', 8]);
  ok(game.search('t2 pocion curacion').some(x => x.item_id === 'T2_POTION_HEAL'), 'búsqueda por texto');
  eq(game.recipes.size, 7663);
});
const ok = (c, m) => { if (!c) throw new Error(m || 'falló'); };

t('RRR sin Premium ni Focus en Lymhurst = 15,25 % (verificado en Silver Master)', () => {
  const item = game.item('T2_POTION_HEAL');
  near(rateFor(game, item, { craftCity: 'Lymhurst', focus: false }).rate * 100, 15.254, 0.01);
  near(rateFor(game, item, { craftCity: 'Lymhurst', focus: true }).rate * 100, 43.503, 0.01, 'con Focus');
  near(fromBonus(18 + 15) * 100, 24.81, 0.01, 'con bono de ciudad');
});
t('bono de ciudad: solo los verificados (espada en Lymhurst sí; Caerleon queda manual)', () => {
  const sword = game.search('espada ancha 6')[0] || game.items.find(i => i.subcategory === 'sword' && i.tier === 6);
  eq(game.bonusFor(sword, 'Lymhurst').kind, 'crafting'); eq(game.bonusFor(sword, 'Martlock').kind, null);
  eq(game.bonusFor(game.item('T2_POTION_HEAL'), 'Caerleon').verified, false);
});
t('INSTANT: números a mano (retorno 0 %)', () => {
  const r = evaluate(base()).base.instant.calc;
  eq([r.made, r.crafts, r.materialCost, r.sale.gross, r.sale.tax, r.sale.setup, r.sale.net, r.profit], [10, 2, 1600, 4000, 320, 0, 3680, 2080]);
  near(r.roi, 130, 0.01); 
});
t('ORDEN: compra con tarifa de publicación y venta con impuesto + tarifa', () => {
  const r = evaluate(base()).base.order.calc;
  // compra: 90 × 1,025 = 92 (redondeado) × 16 = 1472 · venta 420 × 10 = 4200, impuesto 336, publicación 105
  eq([r.materialCost, r.sale.gross, r.sale.tax, r.sale.setup, r.sale.net, r.profit], [1472, 4200, 336, 105, 3759, 2287]);
});
t('Premium solo cambia el impuesto y se muestra como comparación', () => {
  const e = evaluate(base());
  eq(e.base.taxPct, 8); eq(e.comparisons.premium.taxPct, 4);
  eq(e.comparisons.premium.instant.calc.profit, 2240); eq(e.base.instant.calc.profit, 2080, 'el escenario base no cambia');
});
t('Focus solo cambia el retorno y es comparación', () => {
  const e = evaluate(base({ manualRatePct: null }));
  near(e.base.rr.rate * 100, 15.254, 0.01); near(e.comparisons.focus.rr.rate * 100, 43.503, 0.01);
  ok(e.comparisons.focus.instant.calc.profit > e.base.instant.calc.profit, 'con Focus rinde más');
  eq(evaluate(base({ premium: true, focus: true })).comparisons, {}, 'si ya los tienes no hay comparación');
});
t('retorno aplicado a los materiales (15,25 %)', () => {
  const r = evaluate(base({ manualRatePct: null })).base.instant.calc;
  near(r.materialCost, 16 * (1 - 18 / 118) * 100, 0.5); near(r.lines[0].recovered, 16 * 18 / 118, 0.001);
});
t('Mercado Negro: no hay venta por orden', () => {
  const e = evaluate(base({ saleCity: 'Black Market' }));
  eq(e.base.order.saleNA, true); eq(e.base.order.calc.ok, false); eq(e.base.order.calc.profit, null);
  eq(e.base.instant.calc.ok, true, 'la venta inmediata sí');
});
t('sin precio no se inventa: profit null y motivo claro', () => {
  const e = evaluate(base({ market: {} }));
  eq(e.base.instant.calc.profit, null); eq(e.base.instant.priceSource.T2_AGARIC, 'sin dato');
  ok(e.base.instant.calc.reasons.some(x => /Falta precio/.test(x)));
  const e2 = evaluate(base({ saleMarket: { sell_min: 0, buy_max: 0 } })); eq(e2.base.instant.calc.profit, null);
});
t('simulación: un precio ingresado a mano reemplaza al de la base y se marca', () => {
  const e = evaluate(base({ overrides: { instant: { T2_AGARIC: 50 }, saleInstant: 500 } })).base.instant;
  eq([e.calc.materialCost, e.calc.sale.gross, e.priceSource.T2_AGARIC, e.saleSource], [800, 5000, 'simulado', 'simulado']);
});
t('tarifa de estación: total manual o nutrición × tasa/100, con rango 300–900', () => {
  eq(stationFee({ mode: 'total', total: 1234 }), 1234); eq(stationFee({ mode: 'nutricion', nutrition: 100 }, 600), 600);
  const e = evaluate(base({ fee: { mode: 'nutricion', nutrition: 100, rateMin: 300, rateMax: 900, rateUse: 'max' } })).base.instant;
  eq([e.feeRange.min, e.feeRange.max, e.feeRange.used, e.calc.craftingFee], [300, 900, 900, 900]);
  eq(evaluate(base({ fee: { mode: 'nutricion', nutrition: 100, rateMin: 300, rateMax: 900, rateUse: 'min' } })).base.instant.calc.craftingFee, 300);
});
t('transporte y otros costos entran al costo total', () => {
  const r = evaluate(base({ transportTotal: 100, transportPerUnit: 5, otherCosts: 50 })).base.instant.calc;
  eq([r.transport, r.otherCosts, r.totalCost], [150, 50, 1800]);
});
t('antigüedad: se toma el dato más viejo de la operación', () => {
  const e = evaluate(base({ market: { T2_AGARIC: { sell_min: 100, buy_max: 90, sellAge: 700, buyAge: 3 } } })).base;
  eq(e.instant.oldestMinutes, 700); eq(e.order.oldestMinutes, 4);
});
t('ROI y silver/hora', () => { eq(calculateROI(500, 1000), 50); eq(calculateSilverPerHour(1000, 30), 2000); eq(calculateSilverPerHour(1000, 0), null); });
t('objeto sin receta: avisa', () => { eq(evaluate(base({ itemId: 'NO_EXISTE' })).ok, false); });

t('con retorno manual no hay comparación de Focus (no cambiaría nada)', () => { eq(evaluate(base()).comparisons.focus, undefined); });

t('origen de cada precio: se muestra propio / público / simulado / sin dato y el resumen', () => {
  const mk = { T2_AGARIC: { sell_min: 100, buy_max: 90, sellAge: 3, buyAge: 3, sellSrc: 'público', buySrc: 'propio' } };
  const e = evaluate(base({ market: mk, saleMarket: { sell_min: 420, buy_max: 400, sellAge: 4, buyAge: 4, sellSrc: 'propio', buySrc: 'propio' } }));
  eq([e.base.instant.priceSource.T2_AGARIC, e.base.instant.saleSource, e.base.instant.source], ['público', 'propio', 'mixto']);
  eq([e.base.order.priceSource.T2_AGARIC, e.base.order.saleSource, e.base.order.source], ['propio', 'propio', 'propio']);
  eq(evaluate(base({ market: mk, overrides: { instant: { T2_AGARIC: 50 } } })).base.instant.priceSource.T2_AGARIC, 'simulado');
});
