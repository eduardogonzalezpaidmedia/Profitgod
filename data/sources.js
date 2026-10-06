// Una sola puerta de entrada a los precios: tus datos + los públicos, mezclados y con su origen.
import { makeApi } from './api.js?v=0.7';
import { makePublic } from './public.js?v=0.7';
import { fromOwn, mergeSources } from './merge.js?v=0.7';
import { freshness } from './freshness.js?v=0.7';

/** fila mezclada → forma /v2/prices (lados con price, age_min, freshness, orders, amount, src) */
function toV2(r) {
  const side = s => ({ price: s.price, age_min: s.age, t: null, freshness: freshness(s.age == null ? null : s.age * 60000), orders: s.orders, amount: s.amount, src: s.src, ownPrice: s.ownPrice, ownAge: s.ownAge, pubPrice: s.pubPrice, pubAge: s.pubAge });
  return { item_id: r.item_id, city: r.city, quality: r.quality, sell: side(r.sell), buy: side(r.buy) };
}

export function makeSources(cfg, deps = {}) {
  const own = deps.own || makeApi(cfg), pub = deps.pub || makePublic(cfg, deps);
  const usable = () => own.on() || pub.on();
  return {
    own, pub, usable,
    /** Precios de estos objetos en estas ciudades (tuyos + públicos). */
    async prices(ids, cities, qualities) {
      const q = qualities && qualities.length ? qualities : [1];
      let ownError = null;
      const [o, p] = await Promise.all([
        own.on() ? own.prices(ids, cities, q).then(r => r.rows.map(fromOwn)).catch(e => { ownError = e.message; return []; }) : [],
        pub.prices(ids, cities, q)
      ]);
      return { rows: mergeSources(o, p).map(toV2), ownCount: o.length, pubCount: p.length, ownError, pubError: pub.stats.lastError };
    },
    /** Todo lo que tu base tiene de estas ciudades, actualizado con lo público de esos mismos objetos (y de `extraIds`). */
    async market(cities, opts = {}) {
      let ownError = null;
      const o = own.on() ? await own.market(cities, opts.maxage, opts.limit).catch(e => { ownError = e.message; return { rows: [], truncated: false }; }) : { rows: [], truncated: false };
      const ownRows = o.rows.map(fromOwn);
      const ids = [...new Set([...ownRows.map(r => r.item_id), ...(opts.extraIds || [])])];
      const p = await pub.prices(ids, cities, opts.qualities || [1]);
      return { rows: mergeSources(ownRows, p), ownCount: ownRows.length, pubCount: p.length, truncated: o.truncated, itemCount: ids.length, ownError, pubError: pub.stats.lastError };
    }
  };
}
