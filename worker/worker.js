/**
 * Profit God / Silver Master — BASE DE DATOS PRIVADA de precios (Cloudflare Worker + D1), versión 3.
 *
 * Es el mismo Worker de siempre MÁS historial y rutas /v2. No cambia ni borra nada de lo existente:
 * las rutas /prices, /orders, /sales y /stats siguen funcionando igual para Silver Master.
 * Novedades:
 *   · Tabla price_log: guarda una fila por objeto/ciudad/calidad como máximo cada 10 minutos (se conserva 45 días).
 *   · GET /v2/prices?ids=&cities=&q=&key=      → precios con antigüedad y estado de frescura
 *   · GET /v2/history?id=&city=&q=&days=&key=  → serie histórica propia + promedio, mediana, mín., máx. y volatilidad
 *   · GET /v2/freshness?key=                   → por ciudad: cuántos datos y qué tan recientes
 *   · GET /v2/recent?city=&limit=&key=         → lo último que capturaste (para ver qué hay en la base)
 *   · GET /v2/market?cities=&maxage=&limit=    → todos los precios de esas ciudades (para buscar oportunidades entre ciudades)
 *   · GET /v2/book?ids=&cities=&key=           → las órdenes (precio y cantidad) vistas la última vez de esos objetos
 *
 * (Descripción original abajo.)
 * Silver Master — BASE DE DATOS PRIVADA de precios (Cloudflare Worker + D1).
 *
 * Recibe lo que captura el programa «Albion Data Client» en TU PC y lo guarda solo para ti.
 * Silver Master lo lee con tu clave. Nadie sin la clave puede leer ni escribir.
 *
 * Qué necesita este Worker en Cloudflare (ver worker/BASE-PRIVADA.md, paso a paso):
 *   · Una base D1 enlazada con el nombre de variable  DB
 *   · Un secreto llamado  CLAVE  (una contraseña larga que inventas tú)
 *
 * Rutas:
 *   POST /in/CLAVE/<tema>            ← lo usa el Albion Data Client (opción -p https://TU-WORKER/in/CLAVE)
 *   GET  /prices/<ids>?locations=&qualities=&key=CLAVE   → mismo formato que Albion Online Data Project
 *   GET  /orders/<id>?location=&key=CLAVE                → las órdenes vistas la última vez (precio y cantidad)
 *   GET  /sales?key=CLAVE                                → tus avisos de venta capturados
 *   GET  /stats?key=CLAVE                                → cuántos datos hay y de cuándo
 *
 * Este Worker no automatiza nada en el juego: solo guarda datos que tu propio cliente ya recibió.
 */

// Identificadores de mercado que envía el cliente → nombre que usa Silver Master.
// Si aparece un identificador que no está aquí, se guarda tal cual ("loc:XXXX") y /stats lo muestra.
const LOCATIONS = {
  '0007': 'Thetford', '1002': 'Lymhurst', '2004': 'Bridgewatch', '3008': 'Martlock', '4002': 'Fort Sterling',
  '3005': 'Caerleon', '3003': 'Black Market', '5003': 'Brecilien',
  '0301': 'Thetford Portal', '1301': 'Lymhurst Portal', '2301': 'Bridgewatch Portal', '3301': 'Martlock Portal', '4301': 'Fort Sterling Portal'
};
const cityOf = id => LOCATIONS[String(id)] || LOCATIONS[String(id).padStart(4, '0')] || ('loc:' + id);
const iso = ms => new Date(ms).toISOString().slice(0, 19);
const NODATE = '0001-01-01T00:00:00';

/** Agrupa un lote de órdenes por objeto + ciudad + calidad. El precio del cliente viene multiplicado por 10.000. */
function aggregate(orders, now) {
  const g = {};
  for (const o of orders || []) {
    if (!o || !o.ItemTypeId || !(o.UnitPriceSilver > 0)) continue;
    const price = Math.round(o.UnitPriceSilver / 10000), city = cityOf(o.LocationId), q = o.QualityLevel || 1;
    const side = String(o.AuctionType).toLowerCase() === 'request' ? 'buy' : 'sell';
    const k = o.ItemTypeId + '|' + city + '|' + q;
    const r = g[k] = g[k] || { item_id: o.ItemTypeId, city, quality: q, sell: null, buy: null };
    const s = r[side] = r[side] || { best: price, amount: 0, orders: 0, list: [] };
    s.best = side === 'sell' ? Math.min(s.best, price) : Math.max(s.best, price);
    s.amount += o.Amount || 0; s.orders++; s.list.push([price, o.Amount || 0]);
  }
  Object.values(g).forEach(r => ['sell', 'buy'].forEach(sd => { if (r[sd]) r[sd].list.sort((a, b) => sd === 'sell' ? a[0] - b[0] : b[0] - a[0]); }));
  return Object.values(g).map(r => Object.assign(r, { t: now }));
}

/** Fila de la base → formato de /api/v2/stats/prices de AODP (más campos propios con prefijo own_). */
function toRow(r) {
  return {
    item_id: r.item_id, city: r.city, quality: r.quality,
    sell_price_min: r.sell_min || 0, sell_price_min_date: r.sell_t ? iso(r.sell_t) : NODATE, sell_price_max: 0, sell_price_max_date: NODATE,
    buy_price_min: 0, buy_price_min_date: NODATE, buy_price_max: r.buy_max || 0, buy_price_max_date: r.buy_t ? iso(r.buy_t) : NODATE,
    own_sell_orders: r.sell_orders || 0, own_sell_amount: r.sell_amount || 0, own_buy_orders: r.buy_orders || 0, own_buy_amount: r.buy_amount || 0, own: true
  };
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS prices (item_id TEXT NOT NULL, city TEXT NOT NULL, quality INTEGER NOT NULL,
     sell_min INTEGER, sell_amount INTEGER, sell_orders INTEGER, sell_list TEXT, sell_t INTEGER,
     buy_max INTEGER, buy_amount INTEGER, buy_orders INTEGER, buy_list TEXT, buy_t INTEGER,
     PRIMARY KEY (item_id, city, quality))`,
  `CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY, kind TEXT, item_id TEXT, city TEXT, amount INTEGER, price INTEGER, total REAL, sold INTEGER, t INTEGER, raw TEXT)`,
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`,
  `CREATE TABLE IF NOT EXISTS price_log (item_id TEXT NOT NULL, city TEXT NOT NULL, quality INTEGER NOT NULL, t INTEGER NOT NULL,
     sell_min INTEGER, sell_orders INTEGER, sell_amount INTEGER, buy_max INTEGER, buy_orders INTEGER, buy_amount INTEGER)`,
  `CREATE INDEX IF NOT EXISTS idx_log_key ON price_log (item_id, city, quality, t)`,
  `CREATE INDEX IF NOT EXISTS idx_log_t ON price_log (t)`
];
const LOG_EVERY_MS = 10 * 60 * 1000, KEEP_DAYS = 45;
const ready = new WeakSet();
async function ensure(db) { if (ready.has(db)) return; await db.batch(SCHEMA.map(s => db.prepare(s))); ready.add(db); }

async function ingestOrders(db, body, now) {
  const rows = aggregate(body.Orders, now), st = [];
  for (const r of rows) {
    if (r.sell) st.push(db.prepare(`INSERT INTO prices (item_id, city, quality, sell_min, sell_amount, sell_orders, sell_list, sell_t) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(item_id, city, quality) DO UPDATE SET sell_min=excluded.sell_min, sell_amount=excluded.sell_amount, sell_orders=excluded.sell_orders, sell_list=excluded.sell_list, sell_t=excluded.sell_t`)
      .bind(r.item_id, r.city, r.quality, r.sell.best, r.sell.amount, r.sell.orders, JSON.stringify(r.sell.list.slice(0, 50)), now));
    if (r.buy) st.push(db.prepare(`INSERT INTO prices (item_id, city, quality, buy_max, buy_amount, buy_orders, buy_list, buy_t) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(item_id, city, quality) DO UPDATE SET buy_max=excluded.buy_max, buy_amount=excluded.buy_amount, buy_orders=excluded.buy_orders, buy_list=excluded.buy_list, buy_t=excluded.buy_t`)
      .bind(r.item_id, r.city, r.quality, r.buy.best, r.buy.amount, r.buy.orders, JSON.stringify(r.buy.list.slice(0, 50)), now));
  }
  // historial: una fila por objeto/ciudad/calidad como máximo cada 10 minutos
  for (const r of rows) st.push(db.prepare(`INSERT INTO price_log (item_id, city, quality, t, sell_min, sell_orders, sell_amount, buy_max, buy_orders, buy_amount)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM price_log WHERE item_id=? AND city=? AND quality=? AND t>?)`)
    .bind(r.item_id, r.city, r.quality, now, r.sell ? r.sell.best : null, r.sell ? r.sell.orders : null, r.sell ? r.sell.amount : null,
      r.buy ? r.buy.best : null, r.buy ? r.buy.orders : null, r.buy ? r.buy.amount : null, r.item_id, r.city, r.quality, now - LOG_EVERY_MS));
  for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50));
  await cleanOld(db, now);
  return rows.length;
}
/** Una vez al día borra el historial de más de 45 días. */
async function cleanOld(db, now) {
  const m = await db.prepare(`SELECT v FROM meta WHERE k = 'last_clean'`).first();
  if (m && now - (+m.v) < 24 * 3600 * 1000) return;
  await db.prepare(`DELETE FROM price_log WHERE t < ?`).bind(now - KEEP_DAYS * 24 * 3600 * 1000).run();
  await db.prepare(`INSERT OR REPLACE INTO meta (k, v) VALUES ('last_clean', ?)`).bind(String(now)).run();
}

// ---------- frescura (misma regla que la app: data/freshness.js) ----------
function freshness(ageMs) {
  if (ageMs == null || !isFinite(ageMs)) return { level: 'SIN_DATO', label: 'Datos insuficientes', usable: false };
  const m = ageMs / 60000;
  if (m < 5) return { level: 'EXCELENTE', label: 'Excelente', usable: true };
  if (m < 30) return { level: 'BUENO', label: 'Bueno', usable: true };
  if (m < 120) return { level: 'ACEPTABLE', label: 'Aceptable', usable: true };
  if (m < 720) return { level: 'PRECAUCION', label: 'Precaución', usable: true };
  if (m < 1440) return { level: 'DESACTUALIZADO', label: 'Desactualizado', usable: true };
  return { level: 'NO_UTILIZAR', label: 'No usar para recomendaciones automáticas', usable: false };
}
function stats(values) {
  const v = values.filter(x => x > 0).sort((a, b) => a - b), n = v.length;
  if (!n) return { n: 0 };
  const avg = v.reduce((s, x) => s + x, 0) / n, med = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - avg) * (x - avg), 0) / n);
  return { n, avg: Math.round(avg), median: Math.round(med), min: v[0], max: v[n - 1], volatility_pct: avg ? +(100 * sd / avg).toFixed(1) : 0 };
}
/** Fila de la base → formato v2 con antigüedad. */
function toV2(r, now) {
  const side = (price, t) => ({ price: price || 0, t: t ? iso(t) : null, age_min: t ? Math.round((now - t) / 60000) : null, freshness: freshness(t ? now - t : null) });
  return { item_id: r.item_id, city: r.city, quality: r.quality,
    sell: Object.assign(side(r.sell_min, r.sell_t), { orders: r.sell_orders || 0, amount: r.sell_amount || 0 }),
    buy: Object.assign(side(r.buy_max, r.buy_t), { orders: r.buy_orders || 0, amount: r.buy_amount || 0 }), source: 'own' };
}
async function ingestSale(db, body, now) {
  const n = body.Notification || {}; if (!n.Id) return 0;
  await db.prepare(`INSERT OR REPLACE INTO sales (id, kind, item_id, city, amount, price, total, sold, t, raw) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(n.Id, body.NotificationType || '', n.ItemTypeId || '', cityOf(n.LocationId), n.Amount || 0, Math.round((n.UnitPriceSilver || 0) / 10000), n.TotalAfterTaxes ?? null, n.Sold ?? null, now, JSON.stringify(body).slice(0, 2000)).run();
  return 1;
}

export default {
  _aggregate: aggregate, _toRow: toRow, _freshness: freshness, _stats: stats, _toV2: toV2,      // para las pruebas
  async fetch(request, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
    const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors) });
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!env.DB) return json({ error: 'Falta enlazar la base D1 con el nombre DB.' }, 500);
    if (!env.CLAVE || String(env.CLAVE).length < 12) return json({ error: 'Falta el secreto CLAVE (mínimo 12 caracteres).' }, 500);
    const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean), now = Date.now();
    try {
      // ---- escritura: Albion Data Client ----
      if (request.method === 'POST' && parts[0] === 'in') {
        if (parts[1] !== env.CLAVE) return json({ error: 'Clave incorrecta.' }, 403);
        const topic = parts[2] || '', body = await request.json();
        await ensure(env.DB);
        let n = 0;
        if (topic === 'marketorders.ingest') n = await ingestOrders(env.DB, body, now);
        else if (topic === 'marketnotifications') n = await ingestSale(env.DB, body, now);
        // los demás temas (oro, historial, mapas) se aceptan y se ignoran
        await env.DB.prepare(`INSERT OR REPLACE INTO meta (k, v) VALUES ('last_in', ?)`).bind(String(now)).run();
        return json({ ok: true, topic, saved: n });
      }
      // ---- lectura: Silver Master ----
      if (request.method !== 'GET') return json({ error: 'Método no permitido.' }, 405);
      if (url.searchParams.get('key') !== env.CLAVE) return json({ error: 'Clave incorrecta.' }, 403);
      await ensure(env.DB);
      if (parts[0] === 'v2') {
        if (parts[1] === 'prices') {
          const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 400);
          const cities = (url.searchParams.get('cities') || '').split(',').filter(Boolean), quals = (url.searchParams.get('q') || '').split(',').map(Number).filter(Boolean);
          const out = [];
          for (let i = 0; i < ids.length; i += 80) {
            const chunk = ids.slice(i, i + 80);
            const r = await env.DB.prepare(`SELECT * FROM prices WHERE item_id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all();
            for (const row of r.results || []) { if (cities.length && !cities.includes(row.city)) continue; if (quals.length && !quals.includes(row.quality)) continue; out.push(toV2(row, now)); }
          }
          return json({ now: iso(now), rows: out });
        }
        if (parts[1] === 'recent') {
          const city = url.searchParams.get('city') || '', limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
          const r = await env.DB.prepare(`SELECT * FROM prices ${city ? 'WHERE city = ?' : ''} ORDER BY MAX(COALESCE(sell_t,0), COALESCE(buy_t,0)) DESC LIMIT ${limit}`).bind(...(city ? [city] : [])).all();
          return json({ now: iso(now), rows: (r.results || []).map(row => toV2(row, now)) });
        }
        if (parts[1] === 'market') {
          const cities = (url.searchParams.get('cities') || '').split(',').filter(Boolean).slice(0, 12);
          if (!cities.length) return json({ error: 'Faltan las ciudades.' }, 400);
          const maxage = Math.min(Math.max(Number(url.searchParams.get('maxage')) || 1440, 1), 60 * 24 * 30), limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 5000, 1), 8000);
          const cut = now - maxage * 60000;
          const r = await env.DB.prepare(`SELECT item_id, city, quality, sell_min, sell_amount, sell_orders, sell_t, buy_max, buy_amount, buy_orders, buy_t FROM prices
            WHERE city IN (${cities.map(() => '?').join(',')}) AND (COALESCE(sell_t,0) > ? OR COALESCE(buy_t,0) > ?)
            ORDER BY MAX(COALESCE(sell_t,0), COALESCE(buy_t,0)) DESC LIMIT ${limit + 1}`).bind(...cities, cut, cut).all();
          const rows = r.results || [], truncated = rows.length > limit, age = t => t ? Math.round((now - t) / 60000) : null;
          return json({ now: iso(now), truncated, rows: rows.slice(0, limit).map(x => ({ item_id: x.item_id, city: x.city, quality: x.quality,
            sell_min: x.sell_min || 0, sell_amount: x.sell_amount || 0, sell_orders: x.sell_orders || 0, sell_age: age(x.sell_t),
            buy_max: x.buy_max || 0, buy_amount: x.buy_amount || 0, buy_orders: x.buy_orders || 0, buy_age: age(x.buy_t) })) });
        }
        if (parts[1] === 'book') {
          const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 100), cities = (url.searchParams.get('cities') || '').split(',').filter(Boolean);
          const out = [];
          for (let i = 0; i < ids.length; i += 80) {
            const chunk = ids.slice(i, i + 80);
            const r = await env.DB.prepare(`SELECT item_id, city, quality, sell_list, sell_t, buy_list, buy_t FROM prices WHERE item_id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all();
            for (const x of r.results || []) { if (cities.length && !cities.includes(x.city)) continue;
              out.push({ item_id: x.item_id, city: x.city, quality: x.quality, sell: JSON.parse(x.sell_list || '[]'), sell_age: x.sell_t ? Math.round((now - x.sell_t) / 60000) : null, buy: JSON.parse(x.buy_list || '[]'), buy_age: x.buy_t ? Math.round((now - x.buy_t) / 60000) : null }); }
          }
          return json({ now: iso(now), rows: out });
        }
        if (parts[1] === 'history') {
          const id = url.searchParams.get('id') || '', city = url.searchParams.get('city') || '', q = Number(url.searchParams.get('q')) || 1;
          const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 7, 1), KEEP_DAYS);
          if (!id || !city) return json({ error: 'Faltan id y city.' }, 400);
          const r = await env.DB.prepare(`SELECT t, sell_min, sell_orders, sell_amount, buy_max, buy_orders, buy_amount FROM price_log WHERE item_id=? AND city=? AND quality=? AND t>=? ORDER BY t ASC LIMIT 5000`)
            .bind(id, city, q, now - days * 24 * 3600 * 1000).all();
          const pts = r.results || [], first = pts.length ? pts[0].t : null;
          return json({ item_id: id, city, quality: q, days, points: pts.length, since: first ? iso(first) : null,
            covered_days: first ? +((now - first) / 86400000).toFixed(2) : 0,
            sell: stats(pts.map(p => p.sell_min)), buy: stats(pts.map(p => p.buy_max)),
            series: pts.map(p => ({ t: iso(p.t), sell_min: p.sell_min, buy_max: p.buy_max, sell_orders: p.sell_orders, buy_orders: p.buy_orders })) });
        }
        if (parts[1] === 'freshness') {
          const r = await env.DB.prepare(`SELECT city, COUNT(*) AS n, MAX(MAX(COALESCE(sell_t,0)), MAX(COALESCE(buy_t,0))) AS last FROM prices GROUP BY city ORDER BY n DESC`).all();
          const lg = await env.DB.prepare(`SELECT COUNT(*) AS n, MIN(t) AS first FROM price_log`).first();
          return json({ now: iso(now), history_rows: lg.n || 0, history_since: lg.first ? iso(lg.first) : null,
            cities: (r.results || []).map(c => ({ city: c.city, rows: c.n, last: c.last ? iso(c.last) : null, age_min: c.last ? Math.round((now - c.last) / 60000) : null, freshness: freshness(c.last ? now - c.last : null) })) });
        }
        return json({ error: 'Ruta v2 desconocida.', routes: ['/v2/prices', '/v2/history', '/v2/freshness', '/v2/recent', '/v2/market', '/v2/book'] }, 404);
      }
      if (parts[0] === 'prices') {
        const ids = decodeURIComponent(parts.slice(1).join('/')).replace(/\.json$/, '').split(',').filter(Boolean).slice(0, 400);
        const locs = (url.searchParams.get('locations') || '').split(',').filter(Boolean), quals = (url.searchParams.get('qualities') || '').split(',').map(Number).filter(Boolean);
        const out = [];
        for (let i = 0; i < ids.length; i += 80) {
          const chunk = ids.slice(i, i + 80);
          const r = await env.DB.prepare(`SELECT * FROM prices WHERE item_id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all();
          for (const row of r.results || []) { if (locs.length && !locs.includes(row.city)) continue; if (quals.length && !quals.includes(row.quality)) continue; out.push(toRow(row)); }
        }
        return json(out);
      }
      if (parts[0] === 'orders') {
        const id = decodeURIComponent(parts[1] || ''), loc = url.searchParams.get('location');
        const r = await env.DB.prepare(`SELECT * FROM prices WHERE item_id = ?`).bind(id).all();
        return json((r.results || []).filter(x => !loc || x.city === loc).map(x => ({ item_id: x.item_id, city: x.city, quality: x.quality, sell: JSON.parse(x.sell_list || '[]'), sell_date: x.sell_t ? iso(x.sell_t) : null, buy: JSON.parse(x.buy_list || '[]'), buy_date: x.buy_t ? iso(x.buy_t) : null })));
      }
      if (parts[0] === 'sales') {
        const r = await env.DB.prepare(`SELECT id, kind, item_id, city, amount, price, total, sold, t FROM sales ORDER BY t DESC LIMIT 200`).all();
        return json((r.results || []).map(x => Object.assign(x, { date: iso(x.t) })));
      }
      if (parts[0] === 'stats') {
        const a = await env.DB.prepare(`SELECT COUNT(*) AS n, COUNT(DISTINCT item_id) AS items, MAX(MAX(COALESCE(sell_t,0)), MAX(COALESCE(buy_t,0))) AS last FROM prices`).first();
        const c = await env.DB.prepare(`SELECT city, COUNT(*) AS n FROM prices GROUP BY city ORDER BY n DESC`).all();
        const s = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sales`).first();
        const m = await env.DB.prepare(`SELECT v FROM meta WHERE k = 'last_in'`).first();
        return json({ ok: true, rows: a.n || 0, items: a.items || 0, last_price: a.last ? iso(a.last) : null, last_received: m ? iso(+m.v) : null, sales: s.n || 0,
          cities: c.results || [], unknown_locations: (c.results || []).filter(x => x.city.startsWith('loc:')).map(x => x.city) });
      }
      return json({ ok: true, name: 'Base privada · v2 (historial)', routes: ['/prices', '/orders', '/sales', '/stats', '/v2/prices', '/v2/history', '/v2/freshness'] });
    } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
  }
};
