// Flipping: comprar barato en una ciudad, llevarlo y venderlo caro en otra. Funciones puras (sin red ni DOM).
// Solo usa precios y órdenes que tu base ya tiene; nada se inventa.
import { LIQUIDITY } from './config.js?v=0.13';

const isNum = v => typeof v === 'number' && isFinite(v);

/** Nivel de liquidez según las unidades que piden las órdenes de compra visibles. */
export function liquidityLevel(demandUnits) {
  const d = isNum(demandUnits) ? demandUnits : 0;
  return LIQUIDITY.find(x => d >= x.min).level;
}

/**
 * Busca pares «comprar en A → vender en B» con las mejores órdenes (venta INSTANT).
 * rows = [{item_id, city, quality, sell_min, buy_max, sell_age, buy_age, sell_amount, buy_amount}]
 * opts = { buyCities, sellCities, taxPct, maxAgeMin (por defecto 1440), minUnitProfit, top }
 */
export function scan(rows, opts) {
  const maxAge = opts.maxAgeMin || 1440, byKey = new Map();
  for (const r of rows) { const k = r.item_id + '|' + r.quality; if (!byKey.has(k)) byKey.set(k, new Map()); byKey.get(k).set(r.city, r); }
  const out = [];
  for (const [k, cities] of byKey) {
    for (const bc of opts.buyCities) {
      const a = cities.get(bc); if (!a || !(a.sell_min > 0) || !isNum(a.sell_age) || a.sell_age >= maxAge) continue;
      for (const sc of opts.sellCities) {
        if (sc === bc) continue;
        const b = cities.get(sc); if (!b || !(b.buy_max > 0) || !isNum(b.buy_age) || b.buy_age >= maxAge) continue;
        const unitProfit = b.buy_max * (1 - opts.taxPct / 100) - a.sell_min;
        if (unitProfit <= (opts.minUnitProfit || 0)) continue;
        // cantidad desconocida (precio público): para ordenar se supone `unknownUnits`, pero queda marcada como no verificada
        const availKnown = isNum(a.sell_amount), demandKnown = isNum(b.buy_amount), u = opts.unknownUnits || 10;
        const avail = availKnown ? a.sell_amount : u, demand = demandKnown ? b.buy_amount : u;
        out.push({ item_id: a.item_id, quality: a.quality, from: bc, to: sc, buyUnit: a.sell_min, sellUnit: b.buy_max, unitProfit, unitRoi: unitProfit / a.sell_min * 100,
          avail, demand, availKnown, demandKnown, buyAge: a.sell_age, sellAge: b.buy_age, buySrc: a.sell_src || null, sellSrc: b.buy_src || null,
          estTotal: unitProfit * Math.max(1, Math.min(avail, demand)) });
      }
    }
  }
  out.sort((x, y) => y.estTotal - x.estTotal);
  return opts.top ? out.slice(0, opts.top) : out;
}

/**
 * Recorre las órdenes: compra de la más barata hacia arriba, vende a la orden de compra más alta hacia abajo,
 * y se detiene cuando la siguiente unidad ya no deja ganancia, o se acaba el silver, la oferta, la demanda o el máximo de unidades.
 * sellBook (en la ciudad de compra): [[precio, cantidad], ...] de menor a mayor
 * buyBook  (en la ciudad de venta):  [[precio, cantidad], ...] de mayor a menor
 */
export function walk({ sellBook, buyBook, taxPct, silver, maxUnits }) {
  const A = (sellBook || []).map(x => [x[0], x[1]]).filter(x => x[0] > 0 && x[1] > 0), B = (buyBook || []).map(x => [x[0], x[1]]).filter(x => x[0] > 0 && x[1] > 0);
  let i = 0, j = 0, units = 0, cost = 0, gross = 0, limitedBy = null;
  while (i < A.length && j < B.length) {
    const ask = A[i][0], bid = B[j][0];
    if (bid * (1 - taxPct / 100) - ask <= 0) { limitedBy = 'margen'; break; }
    let q = Math.min(A[i][1], B[j][1]);
    let bound = A[i][1] <= B[j][1] ? 'oferta' : 'demanda';
    if (silver > 0) { const can = Math.floor((silver - cost) / ask); if (can < q) { q = can; bound = 'silver'; } }
    if (maxUnits > 0 && units + q > maxUnits) { q = maxUnits - units; bound = 'unidades'; }
    if (q <= 0) { limitedBy = bound === 'unidades' ? 'unidades' : 'silver'; break; }
    units += q; cost += q * ask; gross += q * bid; A[i][1] -= q; B[j][1] -= q;
    if (bound === 'silver' || bound === 'unidades') { limitedBy = bound; break; }
    if (A[i][1] <= 0) i++; if (B[j][1] <= 0) j++;
  }
  if (!limitedBy) limitedBy = i >= A.length ? 'oferta' : 'demanda';
  const tax = gross * taxPct / 100, net = gross - tax, profit = net - cost;
  return { units, cost, gross, tax, net, profit, roi: cost > 0 ? profit / cost * 100 : null, avgBuy: units ? cost / units : null, avgSell: units ? gross / units : null, limitedBy };
}

/**
 * Estimación con órdenes propias (ORDEN): compras con una orden de compra al mejor precio de compra visible
 * y vendes con una orden de venta al mejor precio de venta visible. Tarda más y no está garantizado que se llene.
 * No aplica si se vende en el Mercado Negro (allí no se publican órdenes de venta).
 */
export function orderEstimate({ buyCityBuyMax, sellCitySellMin, units, taxPct, setupPct, toBlackMarket }) {
  if (toBlackMarket || !(buyCityBuyMax > 0) || !(sellCitySellMin > 0) || !(units > 0)) return null;
  const unitBuy = buyCityBuyMax * (1 + setupPct / 100), unitNet = sellCitySellMin * (1 - (taxPct + setupPct) / 100);
  const cost = Math.round(unitBuy) * units, net = unitNet * units;
  return { units, cost, net, profit: net - cost, roi: cost > 0 ? (net - cost) / cost * 100 : null };
}
