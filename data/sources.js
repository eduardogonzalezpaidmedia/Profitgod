// Una sola puerta de entrada a los precios: tus datos + los públicos, mezclados y con su origen.
import { makeApi } from './api.js?v=0.22';
import { makePublic } from './public.js?v=0.22';
import { fromOwn, mergeSources } from './merge.js?v=0.22';
import { freshness } from './freshness.js?v=0.22';
import { makeOverrides, applyToV2, applyToMerged } from './overrides.js?v=0.22';

/** fila mezclada → forma /v2/prices (lados con price, age_min, freshness, orders, amount, src) */
function toV2(r) {
  const side = s => ({ price: s.price, age_min: s.age, t: null, freshness: freshness(s.age == null ? null : s.age * 60000), orders: s.orders, amount: s.amount, src: s.src, ownPrice: s.ownPrice, ownAge: s.ownAge, pubPrice: s.pubPrice, pubAge: s.pubAge });
  return { item_id: r.item_id, city: r.city, quality: r.quality, sell: side(r.sell), buy: side(r.buy) };
}

export function makeSources(cfg, deps = {}) {
  const own = deps.own || makeApi(cfg), pub = deps.pub || makePublic(cfg, deps);
  const usable = () => own.on() || pub.on();
  const overrides = deps.overrides || makeOverrides((() => { try { localStorage.setItem('profitgod.t', '1'); localStorage.removeItem('profitgod.t'); return localStorage; } catch (e) { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)) }; } })());
  // Memoria compartida: todas las pestañas leen los precios por aquí, así ven los mismos datos y se hacen menos consultas.
  const TTL = deps.ttl != null ? deps.ttl : 3 * 60000, nowMs = deps.now || (() => Date.now()), mem = new Map(), memInfo = { hits: 0, fetched: 0, at: null };
  const key = (id, c, q) => id + '|' + c + '|' + q;
  async function pricesRaw(ids, cities, qualities) {
    const q = qualities && qualities.length ? qualities : [1];
    let ownError = null;
    const [o, p] = await Promise.all([
      own.on() ? own.prices(ids, cities, q).then(r => r.rows.map(fromOwn)).catch(e => { ownError = e.message; return []; }) : [],
      pub.prices(ids, cities, q)
    ]);
    return { rows: mergeSources(o, p).map(toV2), ownCount: o.length, pubCount: p.length, ownError, pubError: pub.stats.lastError };
  }
  return {
    own, pub, usable, overrides,
    /** Borra la memoria compartida (botón «Actualizar» o cambio de configuración). */
    clear() { mem.clear(); },
    cacheInfo: () => Object.assign({ size: mem.size }, memInfo),
    /** Precios de estos objetos en estas ciudades (tuyos + públicos). Reutiliza lo ya leído hace menos de 3 minutos. */
    async prices(ids, cities, qualities, opts) {
      const q = qualities && qualities.length ? qualities : [1], t = nowMs(), uniq = [...new Set(ids)], need = [], rows = [];
      for (const id of uniq) {
        const hit = cities.every(c => q.every(x => { const m = mem.get(key(id, c, x)); return m && t - m.t < TTL; }));
        if (hit) { memInfo.hits++; cities.forEach(c => q.forEach(x => { const m = mem.get(key(id, c, x)); if (m.row) rows.push(m.row); })); } else need.push(id);
      }
      let ownError = null, pubError = null, ownCount = 0, pubCount = 0;
      if (need.length) {
        const r = await pricesRaw(need, cities, q); ownError = r.ownError; pubError = r.pubError; ownCount = r.ownCount; pubCount = r.pubCount; rows.push(...r.rows);
        memInfo.fetched += need.length; memInfo.at = t;
        if (!ownError && !pubError) { const got = new Map(r.rows.map(x => [key(x.item_id, x.city, x.quality), x]));   // si hubo error no se guarda: se reintenta
          need.forEach(id => cities.forEach(c => q.forEach(x => mem.set(key(id, c, x), { t, row: got.get(key(id, c, x)) || null })))); }
      }
      return { rows: opts && opts.raw ? rows : applyToV2(rows, overrides, uniq, cities, q), ownCount, pubCount, ownError, pubError };
    },
    /** Todo lo que tu base tiene de estas ciudades, actualizado con lo público de esos mismos objetos (y de `extraIds`). */
    async market(cities, opts = {}) {
      let ownError = null;
      const o = own.on() ? await own.market(cities, opts.maxage, opts.limit).catch(e => { ownError = e.message; return { rows: [], truncated: false }; }) : { rows: [], truncated: false };
      const ownRows = o.rows.map(fromOwn);
      const ids = [...new Set([...ownRows.map(r => r.item_id), ...(opts.extraIds || [])])];
      const p = await pub.prices(ids, cities, opts.qualities || [1]);
      return { rows: applyToMerged(mergeSources(ownRows, p), overrides), ownCount: ownRows.length, pubCount: p.length, truncated: o.truncated, itemCount: ids.length, ownError, pubError: pub.stats.lastError };
    }
  };
}
