import { mergeSources, fromPublic, fromOwn, sourceSummary } from '../data/merge.js';
import { makePublic } from '../data/public.js';
import { makeSources } from '../data/sources.js';
import { walk, scan, orderEstimate, liquidityLevel } from '../flipping/flipping.js';
import { flipRisk, historyView } from '../black-market/risk.js';

export const tests = [];
const t = (name, fn) => tests.push({ name, fn });
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'no coincide') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'falló'); };

const own = (o) => Object.assign({ item_id: 'T4_BAG', city: 'Caerleon', quality: 1, sell_min: 0, sell_age: null, buy_max: 0, buy_age: null, sell_amount: 0, buy_amount: 0, sell_orders: 0, buy_orders: 0 }, o);
const pub = (o) => Object.assign({ item_id: 'T4_BAG', city: 'Caerleon', quality: 1, sell_min: 0, sell_age: null, buy_max: 0, buy_age: null }, o);

t('mezcla: se usa el dato más reciente de cada lado y se marca de dónde viene', () => {
  const r = mergeSources([own({ sell_min: 4000, sell_age: 180, sell_amount: 7, sell_orders: 2, buy_max: 3000, buy_age: 5, buy_amount: 9 })], [pub({ sell_min: 4300, sell_age: 12, buy_max: 2900, buy_age: 60 })])[0];
  eq([r.sell.price, r.sell.src, r.sell.age], [4300, 'público', 12], 'venta: gana el público (más nuevo)');
  eq([r.buy.price, r.buy.src, r.buy.amount], [3000, 'propio', 9], 'compra: gana el tuyo (más nuevo)');
  eq([r.sell.ownPrice, r.sell.ownAge, r.sell.pubPrice, r.sell.pubAge], [4000, 180, 4300, 12], 'se conservan los dos valores para mostrarlos');
});
t('mezcla: si el precio sale de lo público, la cantidad es desconocida (no se inventa)', () => {
  const r = mergeSources([own({ sell_min: 4000, sell_age: 180, sell_amount: 7 })], [pub({ sell_min: 4300, sell_age: 12 })])[0];
  eq([r.sell.amount, r.sell.orders], [null, null]);
});
t('mezcla: empate → el tuyo; una sola fuente → esa; sin datos → no aparece', () => {
  eq(mergeSources([own({ sell_min: 4000, sell_age: 10 })], [pub({ sell_min: 4100, sell_age: 10 })])[0].sell.src, 'propio');
  eq(mergeSources([], [pub({ sell_min: 4100, sell_age: 10 })])[0].sell.src, 'público');
  eq(mergeSources([own({ buy_max: 50, buy_age: 3 })], [])[0].buy.src, 'propio');
  eq(mergeSources([own({})], [pub({})]).length, 0, 'sin ningún precio la fila no aparece');
  eq(mergeSources([own({ sell_min: 4000, sell_age: null })], []).length, 0, 'un precio sin fecha no se usa');
});
t('AODP: fechas en UTC sin Z, «0001» = sin dato, precio 0 = sin dato', () => {
  const now = Date.parse('2026-10-06T03:00:00Z');
  const r = fromPublic({ item_id: 'T4_BAG', city: 'Caerleon', quality: 1, sell_price_min: 4983, sell_price_min_date: '2026-10-06T02:20:00', buy_price_max: 0, buy_price_max_date: '0001-01-01T00:00:00' }, now);
  eq([r.sell_min, r.sell_age, r.buy_max, r.buy_age], [4983, 40, 0, null]);
  eq(mergeSources([], [r])[0].buy.src, null, 'compra sin dato');
});
t('forma de tu base (/v2/prices y /v2/market) → forma común', () => {
  eq(fromOwn({ item_id: 'A', city: 'C', quality: 1, sell: { price: 5, age_min: 2, amount: 3, orders: 1 }, buy: { price: 4, age_min: 3, amount: 6, orders: 2 } }).buy_amount, 6);
  eq(fromOwn({ item_id: 'A', city: 'C', quality: 1, sell_min: 5, sell_age: 2, buy_max: 4, buy_age: 3, buy_amount: 6 }).sell_min, 5);
  eq(sourceSummary(['propio', 'propio']), 'propio'); eq(sourceSummary(['propio', 'público']), 'mixto'); eq(sourceSummary([null]), null);
});
t('cliente público: agrupa consultas, usa caché 5 min y respeta el límite 429', async () => {
  let calls = 0, urls = []; const clock = { t: Date.parse('2026-10-06T03:00:00Z') };
  const fake = async u => { calls++; urls.push(u); return { ok: true, status: 200, json: async () => [{ item_id: 'T4_BAG', city: 'Caerleon', quality: 1, sell_price_min: 100, sell_price_min_date: '2026-10-06T02:59:00', buy_price_max: 90, buy_price_max_date: '2026-10-06T02:50:00' }] }; };
  const p = makePublic({ usePublic: true, server: 'americas' }, { fetch: fake, now: () => clock.t });
  const ids = Array.from({ length: 300 }, (_, i) => 'T4_ITEM_NUMERO_' + i);
  await p.prices(ids, ['Caerleon', 'Black Market'], [1]);
  ok(calls > 1 && calls < 20, 'varias consultas agrupadas, no una por objeto: ' + calls); ok(urls.every(u => u.length <= 3600), 'direcciones cortas');
  ok(urls[0].startsWith('https://west.albion-online-data.com/api/v2/stats/prices/') && urls[0].includes('Black%20Market'));
  const c1 = calls; await p.prices(ids, ['Caerleon', 'Black Market'], [1]); eq(calls, c1, 'la segunda vez sale de la caché');
  clock.t += 6 * 60000; await p.prices(ids.slice(0, 3), ['Caerleon', 'Black Market'], [1]); ok(calls > c1, 'pasados 5 min se vuelve a pedir');
  let n429 = 0; const f429 = async () => (++n429 < 3 ? { ok: false, status: 429 } : { ok: true, status: 200, json: async () => [] });
  const p2 = makePublic({ usePublic: true }, { fetch: f429, wait: 1 }); await p2.prices(['X'], ['Caerleon'], [1]); eq(n429, 3, 'reintenta tras 429');
});
t('cliente público: si falla no rompe, deja el motivo; apagado no consulta; servidor y proxy', async () => {
  const bad = async () => { throw new TypeError('Failed to fetch'); };
  const p = makePublic({ usePublic: true }, { fetch: bad }); eq(await p.prices(['X'], ['Caerleon'], [1]), []); ok(/CORS/.test(p.stats.lastError));
  let calls = 0; const off = makePublic({ usePublic: false }, { fetch: async () => { calls++; } }); eq(await off.prices(['X'], ['Caerleon'], [1]), []); eq(calls, 0);
  eq(makePublic({ server: 'europe' }, {}).host, 'https://europe.albion-online-data.com');
  eq(makePublic({ server: 'asia', proxy: 'https://mi-proxy.workers.dev/' }, {}).host, 'https://mi-proxy.workers.dev/asia');
  eq((await makePublic({ usePublic: true }, { fetch: bad }).test()).ok, false);
});
t('fuentes: tu base + lo público mezclados, con el origen en cada lado', async () => {
  const ownApi = { on: () => true, prices: async () => ({ rows: [{ item_id: 'T4_BAG', city: 'Caerleon', quality: 1, sell: { price: 4000, age_min: 200, amount: 7, orders: 2 }, buy: { price: 3000, age_min: 4, amount: 9, orders: 1 } }] }) };
  const pubApi = { on: () => true, stats: { lastError: null }, prices: async () => [{ item_id: 'T4_BAG', city: 'Caerleon', quality: 1, sell_min: 4300, sell_age: 10, buy_max: 2900, buy_age: 50 }] };
  const r = await makeSources({}, { own: ownApi, pub: pubApi }).prices(['T4_BAG'], ['Caerleon'], [1]);
  const row = r.rows[0]; eq([row.sell.src, row.sell.price, row.buy.src, row.buy.price], ['público', 4300, 'propio', 3000]); eq(row.sell.freshness.level, 'BUENO');
  eq([r.ownCount, r.pubCount], [1, 1]);
});
t('fuentes: si tu base falla, sigue con lo público y lo dice', async () => {
  const ownApi = { on: () => true, prices: async () => { throw new Error('Clave incorrecta.'); } };
  const pubApi = { on: () => true, stats: { lastError: null }, prices: async () => [{ item_id: 'T4_BAG', city: 'Caerleon', quality: 1, sell_min: 4300, sell_age: 10, buy_max: 0, buy_age: null }] };
  const r = await makeSources({}, { own: ownApi, pub: pubApi }).prices(['T4_BAG'], ['Caerleon'], [1]);
  eq([r.rows[0].sell.src, r.ownError], ['público', 'Clave incorrecta.']);
});

// ---------- flipping ----------
t('recorrer las órdenes: compra barato hacia arriba, vende alto hacia abajo, se detiene cuando ya no hay margen', () => {
  const w = walk({ sellBook: [[100, 5], [110, 5], [200, 5]], buyBook: [[150, 4], [140, 8], [90, 5]], taxPct: 8, silver: 0, maxUnits: 0 });
  // unidades: 4 a (100→150), 1 a (100→140), 5 a (110→140), siguiente 200→140 no deja margen
  eq(w.units, 10); eq(w.cost, 4 * 100 + 1 * 100 + 5 * 110); eq(w.gross, 4 * 150 + 6 * 140);
  eq(Math.round(w.net), Math.round((4 * 150 + 6 * 140) * 0.92)); eq(w.limitedBy, 'margen');
  eq(Math.round(w.profit), Math.round(w.net - w.cost));
});
t('recorrer las órdenes: respeta el silver, el máximo de unidades, la oferta y la demanda', () => {
  const base = { sellBook: [[100, 50]], buyBook: [[200, 50]], taxPct: 8 };
  eq(walk(Object.assign({}, base, { silver: 1000, maxUnits: 0 })).units, 10); eq(walk(Object.assign({}, base, { silver: 1000 })).limitedBy, 'silver');
  eq(walk(Object.assign({}, base, { silver: 0, maxUnits: 7 })).units, 7); eq(walk(Object.assign({}, base, { maxUnits: 7 })).limitedBy, 'unidades');
  eq(walk({ sellBook: [[100, 3]], buyBook: [[200, 50]], taxPct: 8 }).limitedBy, 'oferta'); eq(walk({ sellBook: [[100, 50]], buyBook: [[200, 3]], taxPct: 8 }).limitedBy, 'demanda');
  eq(walk({ sellBook: [], buyBook: [[200, 3]], taxPct: 8 }).units, 0, 'sin órdenes no se inventa nada');
});
t('buscar pares: solo con datos de menos de 24 h, impuesto aplicado, ordenado por lo que se puede ganar', () => {
  const rows = [
    { item_id: 'A', city: 'Lymhurst', quality: 1, sell_min: 100, sell_age: 5, sell_amount: 10, buy_max: 0, buy_age: null },
    { item_id: 'A', city: 'Black Market', quality: 1, sell_min: 0, sell_age: null, buy_max: 200, buy_age: 5, buy_amount: 10 },
    { item_id: 'B', city: 'Lymhurst', quality: 1, sell_min: 100, sell_age: 5000, sell_amount: 10, buy_max: 0, buy_age: null },
    { item_id: 'B', city: 'Black Market', quality: 1, sell_min: 0, sell_age: null, buy_max: 300, buy_age: 5, buy_amount: 10 },
    { item_id: 'C', city: 'Lymhurst', quality: 1, sell_min: 100, sell_age: 5, sell_amount: 10, buy_max: 0, buy_age: null },
    { item_id: 'C', city: 'Black Market', quality: 1, sell_min: 0, sell_age: null, buy_max: 105, buy_age: 5, buy_amount: 10 }];
  const r = scan(rows, { buyCities: ['Lymhurst'], sellCities: ['Black Market'], taxPct: 8 });
  eq(r.map(x => x.item_id), ['A'], 'B tiene datos viejos y C no deja ganancia tras el impuesto'); eq(r[0].unitProfit, 200 * 0.92 - 100);
  eq(scan(rows, { buyCities: ['Black Market'], sellCities: ['Lymhurst'], taxPct: 8 }).length, 0, 'el Mercado Negro no vende');
});
t('estimación con órdenes propias: no aplica al Mercado Negro', () => {
  eq(orderEstimate({ buyCityBuyMax: 100, sellCitySellMin: 200, units: 10, taxPct: 8, setupPct: 2.5, toBlackMarket: true }), null);
  const e = orderEstimate({ buyCityBuyMax: 120, sellCitySellMin: 200, units: 10, taxPct: 8, setupPct: 2.5, toBlackMarket: false });
  eq(e.cost, 123 * 10); eq(Math.round(e.net), Math.round(200 * (1 - 0.105) * 10));
});
t('liquidez según unidades que piden las órdenes de compra visibles', () => {
  eq([250, 60, 20, 6, 1, null].map(liquidityLevel), ['MUY ALTA', 'ALTA', 'MEDIA', 'BAJA', 'MUY BAJA', 'MUY BAJA']);
});
t('riesgo: suma de puntos con motivos visibles', () => {
  const bajo = flipRisk({ cost: 100000, from: 'Lymhurst', to: 'Bridgewatch', units: 5, demand: 100, roi: 30, oldestMin: 10, volatilityPct: null });
  eq([bajo.level, bajo.points], ['BAJO', 0]);
  const alto = flipRisk({ cost: 3000000, from: 'Lymhurst', to: 'Black Market', units: 5, demand: 6, roi: 3, oldestMin: 800, volatilityPct: 50, historyPoints: 10 });
  eq(alto.level, 'ALTO'); eq(alto.points, 2 + 1 + 1 + 1 + 2 + 2); ok(alto.reasons.length >= 6 && alto.reasons.some(x => /PvP/.test(x)) && alto.reasons.some(x => /Mercado Negro/.test(x)));
  ok(bajo.reasons.some(x => /sin historial/.test(x)), 'sin historial lo dice');
  eq(flipRisk({ cost: 600000, from: 'Lymhurst', to: 'Caerleon', units: 5, demand: 100, roi: 30, oldestMin: 10 }).level, 'MEDIO');
});
t('vista del historial del Mercado Negro: «Datos insuficientes» con menos de 5 registros', () => {
  eq(historyView({ buy: { n: 3 } }, 100).enough, false);
  const v = historyView({ buy: { n: 8, avg: 100, median: 100, min: 90, max: 120, volatility_pct: 7 }, covered_days: 2 }, 130); eq([v.enough, v.vsAvgPct], [true, 30]);
});

t('riesgo: sin cantidades conocidas (precio público) suma un punto y lo explica', () => {
  const r = flipRisk({ cost: 100000, from: 'Lymhurst', to: 'Bridgewatch', units: 5, demand: null, roi: 30, oldestMin: 10, depthKnown: false });
  eq(r.points, 1); ok(r.reasons.some(x => /datos públicos/.test(x)));
});

t('buscar pares: sin cantidad conocida se ordena con las unidades supuestas y se marca como no verificada', () => {
  const rows = [{ item_id: 'P', city: 'Lymhurst', quality: 1, sell_min: 100, sell_age: 5, sell_amount: null, sell_src: 'público', buy_max: 0, buy_age: null },
    { item_id: 'P', city: 'Black Market', quality: 1, sell_min: 0, sell_age: null, buy_max: 200, buy_age: 5, buy_amount: 40, buy_src: 'propio' }];
  const r = scan(rows, { buyCities: ['Lymhurst'], sellCities: ['Black Market'], taxPct: 8, unknownUnits: 10 })[0];
  eq([r.availKnown, r.demandKnown, r.avail, r.demand, r.buySrc, r.sellSrc], [false, true, 10, 40, 'público', 'propio']);
});
