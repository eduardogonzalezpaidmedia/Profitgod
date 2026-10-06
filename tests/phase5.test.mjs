import fs from 'fs';
import { makeGameData } from '../crafting/recipes.js';
import { opportunityScore, fitValue } from '../opportunity-engine/score.js';
import { findAnomalies } from '../history/anomalies.js';
import { scanCrafts } from '../opportunity-engine/craftscan.js';
import { buildPlan } from '../opportunity-engine/plan.js';
import { compareStrategies } from '../profit-engine/strategies.js';

export const tests = [];
const t = (name, fn) => tests.push({ name, fn });
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'no coincide') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'falló'); };
const raw = {}; for (const n of ['items', 'recipes', 'materials', 'cities', 'stations', 'settings']) raw[n] = JSON.parse(fs.readFileSync(new URL('../data/game/' + n + '.json', import.meta.url)));
const game = makeGameData(raw);

const base = { profit: 100000, roi: 25, sph: 300000, bestSph: 300000, liquidity: 'ALTA', demand: 60, units: 20, hv: { enough: true, vsAvgPct: 0, volatilityPct: 0 }, riskLevel: 'BAJO', oldestMin: 3, capital: 400000, silver: 500000, steps: 2, minutes: 30, hours: 2, maxRisk: 'ALTO' };
t('puntaje: datos de más de 24 h no se recomiendan', () => { eq(opportunityScore(Object.assign({}, base, { oldestMin: 1500 })).score, null); eq(opportunityScore(Object.assign({}, base, { oldestMin: null })).score, null); });
t('puntaje: los pesos suman 100 y el resultado está entre 0 y 100', () => { const s = opportunityScore(base); ok(Math.abs(s.components.reduce((a, c) => a + c.weight, 0) - 1) < 1e-9); ok(s.score >= 0 && s.score <= 100); });
t('puntaje: números a mano (profit 100.000, ROI 25 %, ALTA, demanda 60/20, sin variación, 80 % del capital, 30 de 120 min)', () => {
  const s = opportunityScore(base), v = Object.fromEntries(s.components.map(c => [c.key, c.value]));
  eq([v.sph, v.roi, v.liquidity, v.demand, v.trend, v.volatility], [1, 0.5, 0.8, 1, 1, 1]);
  ok(Math.abs(v.profit - Math.log10(100001) / 6) < 1e-9); eq(v.ease, 0.75);
  const capFit = 1 - 0.7 * (0.8 - 0.6) / 0.4, fit = 0.5 * capFit + 0.3 * 1 + 0.2 * 1;
  ok(Math.abs(v.fit - fit) < 1e-9, 'encaje ' + v.fit + ' vs ' + fit);
  const raw = 0.20 * 1 + 0.10 * v.profit + 0.10 * 0.5 + 0.15 * 0.8 + 0.10 * 1 + 0.10 * 1 + 0.05 * 1 + 0.05 * 0.75 + 0.15 * fit;
  eq(s.score, Math.round(raw * 100 * 1.0 * 1.0), 'frescura < 5 min × 1,00; riesgo bajo × 1,00');
});
t('encaje con el perfil: usar poco capital y poco tiempo rinde más; pasarse del tiempo da 0; riesgo mayor al aceptado penaliza', () => {
  const f = o => fitValue(Object.assign({ capital: 100000, silver: 1000000, minutes: 30, hours: 2, riskLevel: 'BAJO', maxRisk: 'BAJO' }, o));
  eq(f({}).value, 1); ok(f({ capital: 1000000 }).value < f({}).value); eq(f({ minutes: 200 }).time, 0); eq(f({ riskLevel: 'ALTO' }).risk, 0.3);
  ok(opportunityScore(Object.assign({}, base, { capital: 100000 })).score > opportunityScore(Object.assign({}, base, { capital: 500000 })).score, 'misma ganancia con menos capital puntúa más');
});
t('puntaje: riesgo medio ×0,8, alto ×0,5 y la frescura baja el puntaje', () => {
  const a = opportunityScore(base).components.reduce((x, c) => x + c.points, 0), m = opportunityScore(Object.assign({}, base, { riskLevel: 'MEDIO' })), h = opportunityScore(Object.assign({}, base, { riskLevel: 'ALTO' }));
  eq([m.score, h.score], [Math.round(a * 0.8), Math.round(a * 0.5)]); eq(opportunityScore(Object.assign({}, base, { oldestMin: 60 })).score, Math.round(a * 0.85)); eq(opportunityScore(Object.assign({}, base, { oldestMin: 600 })).score, Math.round(a * 0.6));
});
t('puntaje: lo desconocido vale 0 y se declara; no se supone', () => {
  const s = opportunityScore(Object.assign({}, base, { hv: { enough: false }, liquidity: 'SIN DATO', demand: null }));
  const c = Object.fromEntries(s.components.map(x => [x.key, x])); eq([c.trend.value, c.volatility.value, c.liquidity.value, c.demand.value], [null, null, null, null]); eq([c.trend.points, c.demand.points], [0, 0]);
  ok(c.trend.note && c.demand.note); ok(s.score < opportunityScore(base).score);
});
t('anomalías: pico contra la mediana, divergencia entre fuentes y ganancia demasiado buena', () => {
  const a = findAnomalies({ price: 1300, hv: { enough: true, median: 1000 }, ownPrice: 1300, pubPrice: 1000, roi: 150, thresholdPct: 20 }).map(x => x.code);
  eq(a, ['PICO', 'DIVERGE', 'DEMASIADO_BUENO']);
  eq(findAnomalies({ price: 700, hv: { enough: true, median: 1000 } }).map(x => x.code), ['CAIDA']);
  eq(findAnomalies({ price: 1100, hv: { enough: true, median: 1000 }, ownPrice: 1100, pubPrice: 1000, roi: 30 }), [], 'dentro de ±20 %, fuentes parecidas, ROI normal');
  eq(findAnomalies({ price: 5000, hv: { enough: false }, roi: 10 }), [], 'sin historial no se inventa una anomalía');
});

// ---- fabricar donde estás ----
const side = (price, age, amount, src = 'propio') => ({ price, age_min: age, amount, src });
const row = (city, id, sell, buy) => ({ item_id: id, city, quality: 1, sell: sell || side(0, null, null), buy: buy || side(0, null, null) });
const rows = (over = {}) => [
  row('Lymhurst', 'T4_METALBAR', side(700, 5, 1000)), row('Lymhurst', 'T4_PLANKS', side(50, 5, 2000)),
  row('Black Market', 'T4_2H_CROSSBOW', null, side(12000, 8, 40)), row('Caerleon', 'T4_2H_CROSSBOW', null, side(8000, 8, 30))
].concat(over.extra || []);
const cfg = { craftMin: 0.5, tripMin: 15, actionMin: 5, craftFee: 0, unknownDepthUnits: 10 };
const scan = (o = {}) => scanCrafts(Object.assign({ game, rows: rows(), city: 'Lymhurst', saleCities: ['Black Market', 'Caerleon'], silver: 0, premium: false, maxTier: 4, cfg }, o));
t('fabricar: la ballesta T4 → Mercado Negro sale a mano (40 pedidas, retorno 15,25 %, impuesto 8 %)', () => {
  const o = scan().opps.find(x => x.item_id === 'T4_2H_CROSSBOW' && x.to === 'Black Market');
  eq([o.crafts, o.w.units], [26, 26], 'no se fabrica más de 2/3 de lo que piden (40 / 1,5 = 26)');
  const rate = 18 / 118, bars = 12 * 26 * (1 - rate), planks = 20 * 26 * (1 - rate), cost = bars * 700 + planks * 50, net = 26 * 12000 * 0.92;
  ok(Math.abs(o.w.profit - Math.round(net - cost)) <= 2, 'profit ' + o.w.profit + ' vs ' + Math.round(net - cost));
  eq(o.minutes, 5 * 2 + 15 + 26 * 0.5, 'tiempo estimado: 2 tandas + viaje + 26 fabricaciones');
  eq(o.risk.reasons.some(x => x.includes('apenas cubren')), false, 'con el tope de 2/3 la profundidad no suma riesgo');
});
t('fabricar: respeta el silver, la tarifa de estación entra al costo y el tiempo sube con el viaje', () => {
  const o = scan({ silver: 20000 }).opps.find(x => x.to === 'Black Market'); ok(o.w.cost <= 20000, 'costo ' + o.w.cost); ok(o.crafts < 26);
  const f = scan({ cfg: Object.assign({}, cfg, { craftFee: 100 }) }).opps.find(x => x.to === 'Black Market'); eq(f.calc.craftingFee, 2600);
  const c = scan({ saleCities: ['Lymhurst'], rows: rows({ extra: [row('Lymhurst', 'T4_2H_CROSSBOW', null, side(9000, 8, 30))] }) }).opps.find(x => x.to === 'Lymhurst'); eq(c.minutes, 10 + c.crafts * 0.5, 'sin viaje si vendes donde estás');
});
t('fabricar: sin precio de un material, o con datos de más de 24 h, se descarta y se cuenta', () => {
  const r1 = scan({ rows: rows().filter(r => r.item_id !== 'T4_PLANKS') }); eq(r1.opps.filter(o => o.item_id === 'T4_2H_CROSSBOW').length, 0); ok(r1.stats.noData > 0);
  const r2 = scan({ rows: rows().map(r => r.item_id === 'T4_METALBAR' ? Object.assign({}, r, { sell: side(700, 2000, 1000) }) : r) }); eq(r2.opps.filter(o => o.item_id === 'T4_2H_CROSSBOW').length, 0); ok(r2.stats.tooOld > 0);
});
t('fabricar: sin cantidades (precio público) queda «cantidad no verificada» y suma riesgo', () => {
  const pub = rows().map(r => r.city === 'Black Market' ? row('Black Market', r.item_id, null, side(12000, 8, null, 'público')) : r);
  const o = scanCrafts({ game, rows: pub, city: 'Lymhurst', saleCities: ['Black Market'], silver: 0, premium: false, maxTier: 4, cfg }).opps[0];
  eq([o.depthKnown, o.crafts, o.liquidity], [false, 10, 'SIN DATO']); ok(o.risk.reasons.some(x => x.includes('datos públicos')));
});

// ---- plan ----
const fake = (id, score, cost, profit, minutes, risk = 'BAJO') => { const mk = (s, m) => { const k = Math.min(1, s / cost); if (minutes > m) return null; return k > 0 ? { kind: 'flip', item_id: id, from: 'A', to: 'B', label: id, w: { units: 10 * k, cost: cost * k, profit: profit * k, roi: 10 }, minutes, sph: profit * k / (minutes / 60), risk: { level: risk }, make: mk } : null; };
  const o = mk(1e12, 1e9); o.opp = { score }; o.make = mk; return o; };
t('plan: nunca pasa del silver menos la reserva ni del tiempo', () => {
  const p = buildPlan({ opps: [fake('a', 90, 600000, 90000, 20), fake('b', 80, 600000, 70000, 20), fake('c', 70, 100000, 9000, 20)], silver: 1000000, hours: 1, reservePct: 10, maxRisk: 'BAJO' });
  ok(p.totalCost <= 900000 + 1, 'gasto ' + p.totalCost); eq(p.reserve, 100000); ok(p.totalMinutes <= 60); eq(p.steps[0].item_id, 'a'); ok(p.steps[1].scaled, 'la segunda se reduce para no pasar del capital'); ok(p.silverLeft >= 0);
});
t('plan: respeta el nivel de riesgo y el tiempo; sin silver no arma nada', () => {
  const o = [fake('a', 90, 100, 50, 20, 'ALTO'), fake('b', 50, 100, 20, 50, 'BAJO'), fake('c', 40, 100, 20, 50, 'BAJO')];
  const p = buildPlan({ opps: o, silver: 1000, hours: 1, reservePct: 0, maxRisk: 'BAJO' }); eq(p.steps.map(s => s.item_id), ['b'], 'a es de riesgo ALTO; c ya no cabe en la hora'); eq(p.stats.risk, 1);
  eq(buildPlan({ opps: o, silver: 0, hours: 1, reservePct: 10, maxRisk: 'ALTO' }).steps.length, 0);
});
t('plan: no repite el mismo objeto desde la misma ciudad y salta lo que no tiene puntaje', () => {
  const a = fake('a', 90, 100, 50, 10), a2 = fake('a', 80, 100, 40, 10), n = fake('n', null, 100, 40, 10); const p = buildPlan({ opps: [a, a2, n], silver: 1000, hours: 2, reservePct: 0, maxRisk: 'ALTO' }); eq(p.steps.length, 1); eq(p.stats.noScore, 1);
});

// ---- varios materiales a la vez ----
const mk2 = (city, id) => ({ 'Lymhurst|T4_METALBAR': { buy_max: 600, buyAge: 5 }, 'Lymhurst|T4_PLANKS': { sell_min: 50, buy_max: 40, sellAge: 5, buyAge: 5 }, 'Black Market|T4_2H_CROSSBOW': { buy_max: 12000, buyAge: 10 } })[city + '|' + id] || null;
const multi = (extra = {}) => compareStrategies(Object.assign({ game, holdings: [{ id: 'T4_METALBAR', qty: 120 }, { id: 'T4_PLANKS', qty: 200 }], silver: 0, buyCity: 'Lymhurst', craftCity: 'Lymhurst', saleCity: 'Lymhurst', premium: false, focus: false, feePerCraft: 0, maxTier: 4, market: mk2 }, extra));
t('varios materiales: vender todo = suma de cada uno con impuesto', () => { const r = multi(); eq(r.A.value, Math.round(120 * 600 * 0.92) + Math.round(200 * 40 * 0.92)); });
t('varios materiales: fabricar usa los dos (costo 0), el límite es el que se acaba primero y lo que sobra se valora', () => {
  const o = multi().options.find(x => x.kind === 'Fabricar → Mercado Negro' && x.product === 'T4_2H_CROSSBOW');
  eq([o.crafts, o.extraCost], [11, 0]); eq(o.value, Math.round(11 * 12000 * 0.92));
  const left = Object.fromEntries(o.leftoverList.map(x => [x.id, x.qty])); eq(left, { T4_METALBAR: 120 - Math.round(12 * 11 * (1 - 18 / 118)), T4_PLANKS: 200 - Math.round(20 * 11 * (1 - 18 / 118)) });
  eq(o.total, o.value + Math.round(left.T4_METALBAR * 600 * 0.92) + Math.round(left.T4_PLANKS * 40 * 0.92));
});
t('varios materiales: si falta el precio de venta de uno, vender todo queda «sin dato» y lo dice', () => { const r = multi({ market: (c, id) => id === 'T4_PLANKS' && c === 'Lymhurst' ? { sell_min: 50, sellAge: 5 } : mk2(c, id) }); eq(r.A.value, null); eq(r.A.missing, ['T4_PLANKS']); });
t('un solo material sigue funcionando igual que antes', () => { const r = compareStrategies({ game, materialId: 'T4_METALBAR', qty: 120, silver: 0, buyCity: 'Lymhurst', craftCity: 'Lymhurst', saleCity: 'Caerleon', premium: false, focus: false, feePerCraft: 0, market: mk2 }); eq(r.A.value, 66240); });
