import fs from 'fs';
import { makeGameData } from '../crafting/recipes.js';
import { confidence, divergenceValue } from '../opportunity-engine/confidence.js';
import { findProfit } from '../opportunity-engine/engine.js';
import { TYPE_LABEL } from '../opportunity-engine/opportunity.js';
import { scanCrafts } from '../opportunity-engine/craftscan.js';

export const tests = [];
const t = (name, fn) => tests.push({ name, fn });
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'no coincide') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'falló'); };
const raw = {}; for (const n of ['items', 'recipes', 'materials', 'cities', 'stations', 'settings']) raw[n] = JSON.parse(fs.readFileSync(new URL('../data/game/' + n + '.json', import.meta.url)));
const game = makeGameData(raw);

const good = { oldestMin: 3, depthKnown: true, hv: { enough: true, vsMedianPct: 2, volatilityPct: 5 }, liquidity: 'ALTA', sources: ['propio', 'propio'], divergence: 1, anomalies: [] };
t('confianza: datos frescos, propios, con historial y sin avisos = alta', () => { const c = confidence(good); ok(c.pct >= 90, 'pct ' + c.pct); eq([c.level, c.icon], ['ALTA', '🟢']); eq(c.components.length, 8); ok(Math.abs(c.components.reduce((s, x) => s + x.weight, 0) - 1) < 1e-9); });
t('confianza: números a mano (frescura 0,9; cantidades 1; historial 0,95; coinciden; ALTA 0,8; variabilidad 0,9; propio; sin avisos)', () => {
  const c = confidence(Object.assign({}, good, { oldestMin: 20, hv: { enough: true, vsMedianPct: 2, volatilityPct: 5 } }));
  const exp = 0.30 * 0.9 + 0.15 * 1 + 0.15 * (1 - 2 / 40) + 0.10 * 1 + 0.10 * 0.8 + 0.10 * (1 - 5 / 50) + 0.05 * 1 + 0.05 * 1; eq(c.pct, Math.round(exp * 100));
});
t('confianza: datos de más de 2 h nunca pasan de 65 %, de 12 h de 40 %, sin cantidades de 75 %', () => {
  eq(confidence(Object.assign({}, good, { oldestMin: 130 })).pct <= 65, true); eq(confidence(Object.assign({}, good, { oldestMin: 800 })).pct <= 40, true);
  const nd = confidence(Object.assign({}, good, { depthKnown: false })); ok(nd.pct <= 75 && nd.capped && nd.caps[0].includes('cantidades'));
  eq(confidence(Object.assign({}, good, { oldestMin: 800 })).level, 'BAJA');
});
t('confianza: un aviso de pico o divergencia limita a 70 % y baja la consistencia', () => { const c = confidence(Object.assign({}, good, { anomalies: [{ code: 'PICO', text: 'x' }] })); ok(c.pct <= 70); ok(c.components.find(x => x.key === 'consistency').value < 1); });
t('confianza: sin historial ni fuentes bajan el puntaje pero no se inventan', () => { const a = confidence(good).pct, b = confidence(Object.assign({}, good, { hv: { enough: false }, sources: ['público', 'público'], divergence: null })).pct; ok(b < a); eq(confidence(Object.assign({}, good, { hv: { enough: false } })).components.find(x => x.key === 'history').note, 'sin historial suficiente'); });
t('divergencia entre fuentes: iguales = 1, 25 % o más = 0,2, una sola fuente = sin dato', () => { eq(divergenceValue([{ ownPrice: 100, pubPrice: 100 }]), 1); ok(Math.abs(divergenceValue([{ ownPrice: 125, pubPrice: 100 }]) - 0.2) < 1e-9); eq(divergenceValue([{ ownPrice: 100 }, null]), null); });

// ---- motor ----
const S = (price, age, amount, src = 'propio') => ({ price, age, amount, src });
const R = (city, id, sell, buy) => ({ item_id: id, city, quality: 1, sell: sell || S(0, null, null), buy: buy || S(0, null, null) });
const ROWS = [R('Lymhurst', 'T4_METALBAR', S(700, 5, 300), S(600, 5, 50)), R('Lymhurst', 'T4_PLANKS', S(50, 5, 2000), S(40, 5, 300)), R('Caerleon', 'T4_METALBAR', S(1500, 20, 20), S(1300, 20, 60)),
  R('Caerleon', 'T4_2H_CROSSBOW', S(9000, 10, 30), S(8000, 10, 5)), R('Black Market', 'T4_2H_CROSSBOW', null, S(12000, 8, 40))];
const bk = r => ({ item_id: r.item_id, city: r.city, quality: 1, sell: r.sell.price ? [[r.sell.price, r.sell.amount]] : [], buy: r.buy.price ? [[r.buy.price, r.buy.amount]] : [] });
const stub = rows => ({ usable: () => true, own: { on: () => true, book: async () => ({ rows: rows.map(bk) }), history: async () => { throw new Error('sin historial'); } }, market: async () => ({ rows, ownCount: rows.length, pubCount: 0, itemCount: rows.length, truncated: false, ownError: null, pubError: null }) });
const cfg = { city: 'Lymhurst', premium: false, craftMin: 0.5, tripMin: 15, actionMin: 5, craftFee: 0, unknownDepthUnits: 10, maxTier: 4, reservePct: 10, focus: 0, anomalyPct: 20 };
const run = (o = {}) => findProfit(Object.assign({ src: stub(ROWS), game, cfg, silver: 5000000, hours: 1.5, maxRisk: 'ALTO' }, o));
t('motor: devuelve un solo ranking con flipping, fabricación y Mercado Negro, con el objeto estándar completo', async () => {
  const r = await run(), types = new Set(r.ops.map(o => o.type)); ok(types.has('flipping') && types.has('blackmarket'), [...types].join(','));
  for (const o of r.ops) { for (const k of ['type', 'item', 'cityBuy', 'citySell', 'investment', 'revenue', 'fees', 'taxes', 'profit', 'roi', 'profitPerHour', 'liquidity', 'risk', 'confidence', 'dataAge', 'explanation']) ok(k in o, 'falta ' + k); ok(TYPE_LABEL[o.type]); ok(o.confidence >= 0 && o.confidence <= 100); ok(o.profit > 0); }
  for (let i = 1; i < r.ops.length; i++) ok(r.ops[i - 1].score >= r.ops[i].score, 'ordenado por puntaje');
});
t('motor: el flipping de Lymhurst a Caerleon sale a mano (40 unidades = 2/3 de 60, impuesto 8 %, 20 min estimados)', async () => {
  const o = (await run()).ops.find(x => x.type === 'flipping' && x.cityBuy === 'Lymhurst' && x.citySell === 'Caerleon'); ok(o);
  eq([o.units, o.investment, o.revenue, o.taxes, o.profit], [40, 28000, 52000, 4160, 19840]); eq(o.minutes, 20); eq(o.profitPerHour, 59520);
});
t('motor: comprar en otra ciudad suma un viaje al tiempo (desde Lymhurst a Caerleon: +15 min)', async () => {
  const o = (await run()).ops.find(x => x.cityBuy === 'Caerleon' && x.citySell === 'Black Market'); ok(o); eq(o.minutes, 20 + 15);
});
t('motor: la explicación menciona capital, ROI, liquidez y antigüedad del dato; la confianza baja avisa', async () => {
  const o = (await run()).ops[0]; ok(/capital/.test(o.explanation) && /ROI/.test(o.explanation) && /liquidez/.test(o.explanation) && /actualizaron hace/.test(o.explanation), o.explanation);
  const old = ROWS.map(r => Object.assign({}, r, { sell: Object.assign({}, r.sell, { age: r.sell.age == null ? null : 800 }), buy: Object.assign({}, r.buy, { age: r.buy.age == null ? null : 800 }) }));
  const r2 = await run({ src: stub(old) }); ok(r2.ops.every(x => x.confidence <= 40 && x.confidenceInfo.level === 'BAJA'), 'datos de 13 h = confianza baja'); ok(r2.ops[0].explanation.startsWith('Cuidado'));
});
t('motor: respeta el silver y el riesgo en el plan; sin datos no recomienda nada', async () => {
  const r = await run({ silver: 60000, maxRisk: 'BAJO' }); ok(r.plan.totalCost <= 60000 * 0.9 + 1, 'gasto ' + r.plan.totalCost); ok(r.plan.steps.every(s => s.risk === 'BAJO'));
  const e = await run({ src: stub([]) }); eq([e.ops.length, e.plan.steps.length], [0, 0]);
});
t('un capital chico con buen retorno puntúa antes que una operación enorme que lo usa todo', async () => {
  const r = await run({ silver: 300000 }); const small = r.ops.find(x => x.investment < 100000), big = r.ops.find(x => x.investment > 200000);
  if (small && big) ok(small.scoreInfo.components.find(c => c.key === 'fit').value >= big.scoreInfo.components.find(c => c.key === 'fit').value);
});
t('Focus: sin Focus no se usa; con Focus sube el retorno y se limita por el Focus disponible', () => {
  const rows = ROWS.map(r => r), base = { game, rows, city: 'Lymhurst', saleCities: ['Black Market'], silver: 0, premium: false, maxTier: 4, cfg };
  const a = scanCrafts(Object.assign({}, base, { focus: 0 })).opps.find(o => o.item_id === 'T4_2H_CROSSBOW'), b = scanCrafts(Object.assign({}, base, { focus: 100000 })).opps.find(o => o.item_id === 'T4_2H_CROSSBOW');
  eq(a.withFocus, false); eq(b.withFocus, true); ok(b.retorno > a.retorno, 'retorno con Focus'); ok(b.w.profit > a.w.profit);
  const fb = game.recipe('T4_2H_CROSSBOW').focus_base, c = scanCrafts(Object.assign({}, base, { focus: fb * 3 })).opps.find(o => o.item_id === 'T4_2H_CROSSBOW'); eq(c.crafts, 3, 'tres fabricaciones con Focus para 3 × ' + fb); eq(c.focusUsed, fb * 3);
});

// ---- Mis operaciones ----
import { makeJournal } from '../data/journal.js';
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)) }; };
const OP = { type: 'flipping', item: 'Lingote "acero"', cityBuy: 'Lymhurst', citySell: 'Caerleon', units: 40, investment: 28000, profit: 19840, confidence: 90, risk: 'BAJO' };
t('operaciones: registrar, completar con el resultado real y sumar', () => {
  const j = makeJournal(mem()), a = j.addFromOpportunity(OP, 1000), b = j.addFromOpportunity(Object.assign({}, OP, { profit: 5000, investment: 10000 }), 2000);
  eq(j.list().map(x => x.id), [b.id, a.id], 'más nueva primero'); j.complete(a.id, 18000);
  eq(j.totals(), { total: 2, running: 1, done: 1, realProfit: 18000, expectedOfDone: 19840, invested: 38000 });
  j.update(b.id, { status: 'cancelada' }); eq(j.totals().invested, 28000, 'lo cancelado no cuenta como invertido'); j.remove(a.id); eq(j.list().length, 1);
});
t('operaciones: exporta CSV con comillas escapadas y datos corruptos no rompen', () => {
  const m = mem(), j = makeJournal(m); j.addFromOpportunity(OP, 0); const csv = j.toCsv().split('\n'); eq(csv.length, 2); ok(csv[0].startsWith('"Fecha","Tipo"')); ok(csv[1].includes('"Lingote ""acero"""'));
  m.setItem('profitgod.journal.v1', '{no es json'); eq(makeJournal(m).list(), []);
});
