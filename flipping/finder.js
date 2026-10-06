// Busca oportunidades de flipping leyendo tus datos y los públicos. Sin DOM: lo usan «Flipping» y «¿Qué hago hoy?».
import { scan, walk, orderEstimate, liquidityLevel } from './flipping.js?v=0.11';
import { flipRisk, historyView } from '../black-market/risk.js?v=0.11';
import { scoreAll } from '../opportunity-engine/score.js?v=0.11';
import { findAnomalies } from '../history/anomalies.js?v=0.11';

const flat = r => ({ item_id: r.item_id, city: r.city, quality: r.quality, sell_min: r.sell.price, sell_age: r.sell.age, sell_amount: r.sell.amount, sell_src: r.sell.src, buy_max: r.buy.price, buy_age: r.buy.age, buy_amount: r.buy.amount, buy_src: r.buy.src });
export const flipMinutes = (cfg, from, start) => (cfg.tripMin || 15) + (cfg.actionMin || 5) + (start && from && from !== start ? (cfg.tripMin || 15) : 0);   // si compras en otra ciudad, primero hay que ir

/** Vuelve a calcular la operación con otro tope de silver (para armar un plan sin pasarse del capital). */
export function rewalk(o, silver, maxUnits, cfg) {
  const w = walk({ sellBook: o.sellBook, buyBook: o.buyBook, taxPct: o.taxPct, silver, maxUnits });
  const minutes = flipMinutes(cfg, o.from, o.start);
  return Object.assign({}, o, { w, minutes, sph: w.profit > 0 ? w.profit / (minutes / 60) : null });
}

/**
 * p = { src, game, cfg, buy:[ciudades], sell:[ciudades], silver, maxUnits, extra:[ids] , top }
 * → { out:[oportunidad], info:{ownCount,pubCount,items,truncated,errs} }
 */
export async function findFlips(p) {
  const { src, game, cfg } = p, unk = cfg.unknownDepthUnits || 10, silver = p.silver || 0, maxUnits = p.maxUnits || 0;
  const taxPct = cfg.premium ? game.settings.taxes.sales_tax_premium_pct : game.settings.taxes.sales_tax_no_premium_pct, setupPct = game.settings.taxes.setup_fee_pct;
  const cities = [...new Set([...p.buy, ...p.sell])];
  const mk = await src.market(cities, { maxage: 1440, limit: 8000, extraIds: p.extra || [] });
  const info = { ownCount: mk.ownCount, pubCount: mk.pubCount, items: mk.itemCount, truncated: mk.truncated, errs: [mk.ownError && 'Tu base: ' + mk.ownError, mk.pubError && 'Datos públicos: ' + mk.pubError].filter(Boolean) };
  const rows = mk.rows.map(flat), idx = new Map(mk.rows.map(r => [r.city + '|' + r.item_id + '|' + r.quality, r]));
  const cand = scan(rows, { buyCities: p.buy, sellCities: p.sell, taxPct, maxAgeMin: 1440, unknownUnits: unk, top: p.top || 60 });
  const books = new Map(), ids = [...new Set(cand.map(c => c.item_id))];
  if (src.own.on() && ids.length) for (let i = 0; i < ids.length; i += 100) { try { (await src.own.book(ids.slice(i, i + 100), cities)).rows.forEach(b => books.set(b.city + '|' + b.item_id + '|' + b.quality, b)); } catch (e) { info.errs.push('Tu base (órdenes): ' + e.message); } }
  let out = cand.map(c => {
    const ra = idx.get(c.from + '|' + c.item_id + '|' + c.quality), rb = idx.get(c.to + '|' + c.item_id + '|' + c.quality);
    const ba = books.get(c.from + '|' + c.item_id + '|' + c.quality), bb = books.get(c.to + '|' + c.item_id + '|' + c.quality);
    const sellBook = c.buySrc === 'propio' && ba && ba.sell.length ? ba.sell : [[c.buyUnit, unk]], buyBook = c.sellSrc === 'propio' && bb && bb.buy.length ? bb.buy : [[c.sellUnit, unk]];
    const depthKnown = c.buySrc === 'propio' && ba && ba.sell.length > 0 && c.sellSrc === 'propio' && bb && bb.buy.length > 0;
    const cap = depthKnown ? Math.max(1, Math.floor(c.demand / 1.5)) : 0, mu = [maxUnits, cap].filter(x => x > 0);    // no se vende más de 2/3 de lo que piden
    const w = walk({ sellBook, buyBook, taxPct, silver, maxUnits: mu.length ? Math.min(...mu) : 0 });
    const oe = orderEstimate({ buyCityBuyMax: ra && ra.buy.price, sellCitySellMin: rb && rb.sell.price, units: w.units, taxPct, setupPct, toBlackMarket: c.to === 'Black Market' });
    return Object.assign({}, c, { ra, rb, w, depthKnown, oe, sellBook, buyBook, taxPct, start: p.startCity || null, minutes: flipMinutes(cfg, c.from, p.startCity), sph: w.profit > 0 ? w.profit / (flipMinutes(cfg, c.from, p.startCity) / 60) : null, oldest: Math.max(c.buyAge, c.sellAge),
      liquidity: c.sellSrc === 'propio' && bb && bb.buy.length ? liquidityLevel(c.demand) : 'SIN DATO' });
  }).filter(o => o.w.units > 0 && o.w.profit > 0);
  out.sort((a, b) => b.w.profit - a.w.profit); out = out.slice(0, 40);
  await Promise.all(out.map(async o => { o.hist = null; if (!src.own.on()) return; try { o.hist = await src.own.history(o.item_id, o.to, o.quality, 14); } catch (e) { /* sin historial */ } }));
  out.forEach(o => { o.hv = historyView(o.hist, o.sellUnit, 'buy');
    o.risk = flipRisk({ cost: o.w.cost, from: o.from, to: o.to, units: o.w.units, demand: o.depthKnown ? o.demand : null, depthKnown: o.depthKnown, roi: o.w.roi, oldestMin: o.oldest, volatilityPct: o.hv.enough ? o.hv.volatilityPct : null, historyPoints: o.hv.points });
    const sd = o.rb && o.rb.buy;
    o.anomalies = findAnomalies({ price: o.sellUnit, hv: o.hv, ownPrice: sd && sd.ownPrice, pubPrice: sd && sd.pubPrice, roi: o.w.roi, thresholdPct: cfg.anomalyPct }); });
  out.forEach(o => { o.kind = 'flip'; o.label = game.label(o.item_id); o.steps = 2 + (p.startCity && o.from !== p.startCity ? 1 : 0);
    o.make = (silverMax, minutesMax) => {
      if (o.minutes > minutesMax) return null;
      const cap = o.depthKnown ? Math.max(1, Math.floor(o.demand / 1.5)) : 0, mu = [maxUnits, cap].filter(x => x > 0), r = rewalk(o, silverMax, mu.length ? Math.min(...mu) : 0, cfg);   // no vender más de 2/3 de lo que piden
      if (!(r.w.units > 0 && r.w.profit > 0)) return null;
      r.risk = flipRisk({ cost: r.w.cost, from: r.from, to: r.to, units: r.w.units, demand: r.depthKnown ? r.demand : null, depthKnown: r.depthKnown, roi: r.w.roi, oldestMin: r.oldest, volatilityPct: r.hv.enough ? r.hv.volatilityPct : null, historyPoints: r.hv.points });
      return Object.assign(r, { make: o.make });
    }; });
  scoreAll(out, silver, p.profile || {});
  return { out, info, rows: mk.rows };
}
