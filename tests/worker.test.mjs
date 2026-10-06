import worker from '../worker/worker.js';
import { makeD1 } from './d1mock.mjs';

const KEY = 'ClaveDePrueba1234';
export const tests = [];
const t = (name, fn) => tests.push({ name, fn });
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'no coincide') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'falló'); };

const call = (env, method, path, body) => worker.fetch(new Request('https://w.test' + path, { method, body: body ? JSON.stringify(body) : undefined }), env).then(async r => ({ status: r.status, body: await r.json() }));
const order = (id, loc, price, amount, type, q = 1) => ({ Id: Math.random(), ItemTypeId: id, LocationId: loc, QualityLevel: q, EnchantmentLevel: 0, UnitPriceSilver: price * 10000, Amount: amount, AuctionType: type, Expires: '2026-10-20T00:00:00' });

t('frescura: los 6 tramos pedidos', () => {
  const f = m => worker._freshness(m * 60000).level;
  eq([f(1), f(10), f(60), f(300), f(800), f(2000)], ['EXCELENTE', 'BUENO', 'ACEPTABLE', 'PRECAUCION', 'DESACTUALIZADO', 'NO_UTILIZAR']);
  eq(worker._freshness(null).level, 'SIN_DATO');
  ok(!worker._freshness(2000 * 60000).usable, 'más de 24 h no se recomienda');
});
t('estadísticas: promedio, mediana, mín, máx, volatilidad', () => {
  const s = worker._stats([100, 120, 110, 0, 130]);
  eq([s.n, s.avg, s.median, s.min, s.max], [4, 115, 115, 100, 130]);
  eq(worker._stats([]).n, 0);
});
t('sin clave o con clave mala responde 403', async () => {
  const env = { DB: makeD1(), CLAVE: KEY };
  eq((await call(env, 'GET', '/v2/freshness?key=mala')).status, 403);
  eq((await call(env, 'POST', '/in/mala/marketorders.ingest', { Orders: [] })).status, 403);
});
t('ingesta guarda precios y /v2/prices devuelve antigüedad', async () => {
  const env = { DB: makeD1(), CLAVE: KEY };
  const r = await call(env, 'POST', `/in/${KEY}/marketorders.ingest`, { Orders: [order('T4_BAG', '3003', 4000, 2, 'request'), order('T4_BAG', '3003', 4300, 5, 'offer'), order('T4_BAG', '3003', 4100, 1, 'offer')] });
  eq(r.body.saved, 1);
  const p = await call(env, 'GET', `/v2/prices?ids=T4_BAG&key=${KEY}`);
  const row = p.body.rows[0];
  eq([row.city, row.sell.price, row.buy.price, row.sell.orders], ['Black Market', 4100, 4000, 2]);
  ok(row.sell.age_min <= 1 && row.sell.freshness.level === 'EXCELENTE', 'dato recién llegado debe ser EXCELENTE');
});
t('historial: máximo una fila cada 10 minutos por objeto/ciudad/calidad', async () => {
  const env = { DB: makeD1(), CLAVE: KEY };
  for (let i = 0; i < 3; i++) await call(env, 'POST', `/in/${KEY}/marketorders.ingest`, { Orders: [order('T5_BAG', '3005', 5000 + i, 1, 'offer')] });
  eq(env.DB._raw.prepare('SELECT COUNT(*) n FROM price_log').get().n, 1, 'tres lecturas seguidas = una fila');
  env.DB._raw.prepare('UPDATE price_log SET t = t - ?').run(11 * 60000);
  await call(env, 'POST', `/in/${KEY}/marketorders.ingest`, { Orders: [order('T5_BAG', '3005', 5100, 1, 'offer')] });
  eq(env.DB._raw.prepare('SELECT COUNT(*) n FROM price_log').get().n, 2, 'pasados 10 min se guarda otra');
});
t('/v2/history calcula la serie y las estadísticas', async () => {
  const env = { DB: makeD1(), CLAVE: KEY };
  await call(env, 'GET', `/v2/freshness?key=${KEY}`); // crea el esquema
  const now = Date.now(), ins = env.DB._raw.prepare('INSERT INTO price_log (item_id, city, quality, t, sell_min, buy_max) VALUES (?,?,?,?,?,?)');
  [[100, 90], [120, 100], [110, 95]].forEach((v, i) => ins.run('T4_BAG', 'Caerleon', 1, now - (3 - i) * 3600000, v[0], v[1]));
  const h = (await call(env, 'GET', `/v2/history?id=T4_BAG&city=Caerleon&q=1&days=7&key=${KEY}`)).body;
  eq([h.points, h.sell.avg, h.sell.median, h.sell.min, h.sell.max, h.buy.avg], [3, 110, 110, 100, 120, 95]);
  ok(h.covered_days > 0.1 && h.series.length === 3, 'cobertura y serie');
  eq((await call(env, 'GET', `/v2/history?key=${KEY}`)).status, 400);
});
t('limpieza: borra lo de más de 45 días, una vez al día', async () => {
  const env = { DB: makeD1(), CLAVE: KEY };
  await call(env, 'GET', `/v2/freshness?key=${KEY}`);
  const old = Date.now() - 50 * 86400000;
  env.DB._raw.prepare('INSERT INTO price_log (item_id, city, quality, t, sell_min) VALUES (?,?,?,?,?)').run('X', 'Caerleon', 1, old, 1);
  await call(env, 'POST', `/in/${KEY}/marketorders.ingest`, { Orders: [order('T4_BAG', '3003', 4000, 1, 'offer')] });
  eq(env.DB._raw.prepare("SELECT COUNT(*) n FROM price_log WHERE item_id='X'").get().n, 0);
});
t('las rutas antiguas de Silver Master siguen igual', async () => {
  const env = { DB: makeD1(), CLAVE: KEY };
  await call(env, 'POST', `/in/${KEY}/marketorders.ingest`, { Orders: [order('T4_BAG', '3003', 4000, 2, 'request')] });
  const st = (await call(env, 'GET', `/stats?key=${KEY}`)).body;
  eq([st.ok, st.rows, st.items, st.cities[0].city], [true, 1, 1, 'Black Market']);
  const pr = (await call(env, 'GET', `/prices/T4_BAG?key=${KEY}`)).body;
  eq([pr[0].item_id, pr[0].buy_price_max], ['T4_BAG', 4000]);
});
t('ubicación desconocida se guarda como loc:XXXX y /v2/freshness la lista', async () => {
  const env = { DB: makeD1(), CLAVE: KEY };
  await call(env, 'POST', `/in/${KEY}/marketorders.ingest`, { Orders: [order('T4_BAG', '9999', 4000, 1, 'offer')] });
  const f = (await call(env, 'GET', `/v2/freshness?key=${KEY}`)).body;
  eq(f.cities[0].city, 'loc:9999'); ok(f.history_rows === 1);
});
t('/v2/recent lista lo último capturado, filtrable por ciudad', async () => {
  const env = { DB: makeD1(), CLAVE: KEY };
  await call(env, 'POST', `/in/${KEY}/marketorders.ingest`, { Orders: [order('T4_BAG', '3003', 4000, 1, 'offer'), order('T5_BAG', '3005', 9000, 1, 'offer')] });
  const all = (await call(env, 'GET', `/v2/recent?key=${KEY}`)).body.rows, bm = (await call(env, 'GET', `/v2/recent?city=Black%20Market&key=${KEY}`)).body.rows;
  eq([all.length, bm.length, bm[0].item_id], [2, 1, 'T4_BAG']);
});

t('/v2/market entrega los precios de varias ciudades con antigüedad y respeta la edad máxima', async () => {
  const env = { DB: makeD1(), CLAVE: KEY };
  await call(env, 'POST', `/in/${KEY}/marketorders.ingest`, { Orders: [order('T4_BAG', '1002', 4000, 3, 'offer'), order('T4_BAG', '3003', 5200, 9, 'request'), order('T5_BAG', '3005', 9000, 1, 'offer')] });
  env.DB._raw.prepare("UPDATE prices SET sell_t = sell_t - ?, buy_t = buy_t - ? WHERE city = 'Caerleon'").run(3 * 3600000, 3 * 3600000);
  const m = (await call(env, 'GET', `/v2/market?cities=Lymhurst,Black%20Market,Caerleon&key=${KEY}`)).body;
  eq(m.rows.length, 3); eq(m.truncated, false);
  const bm = m.rows.find(x => x.city === 'Black Market'); eq([bm.buy_max, bm.buy_amount, bm.buy_orders], [5200, 9, 1]); ok(bm.buy_age <= 1);
  eq(m.rows.find(x => x.city === 'Caerleon').sell_age >= 179, true);
  eq((await call(env, 'GET', `/v2/market?cities=Lymhurst,Caerleon&maxage=60&key=${KEY}`)).body.rows.length, 1, 'lo de hace 3 h queda fuera con maxage=60');
  eq((await call(env, 'GET', `/v2/market?key=${KEY}`)).status, 400);
  eq((await call(env, 'GET', `/v2/market?cities=Lymhurst&limit=1&key=${KEY}`)).body.truncated, false);
});
t('/v2/book entrega las órdenes ordenadas (venta de menor a mayor, compra de mayor a menor)', async () => {
  const env = { DB: makeD1(), CLAVE: KEY };
  await call(env, 'POST', `/in/${KEY}/marketorders.ingest`, { Orders: [order('T4_BAG', '1002', 4300, 2, 'offer'), order('T4_BAG', '1002', 4100, 5, 'offer'), order('T4_BAG', '1002', 3900, 1, 'request'), order('T4_BAG', '1002', 4000, 7, 'request')] });
  const b = (await call(env, 'GET', `/v2/book?ids=T4_BAG&cities=Lymhurst&key=${KEY}`)).body.rows[0];
  eq(b.sell, [[4100, 5], [4300, 2]]); eq(b.buy, [[4000, 7], [3900, 1]]); ok(b.sell_age <= 1);
});
