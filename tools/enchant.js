// Flips de encanto: comprar un objeto @n y venderlo como @n+1 (tras encantarlo). Función pura.
// El costo del material de encanto (runa/alma/reliquia) NO está en los datos del juego que usa la app: lo ingresas tú.
// Con costo 0 la ganancia es BRUTA y se marca como tal. Nada se inventa.
const isNum = v => typeof v === 'number' && isFinite(v);
const pos = v => isNum(v) && v > 0 ? v : null;
const MAX_AGE_MIN = 1440;

/** ids a consultar: objetos del tier y categoría pedidos con encantos @0..@3 (hasta @4 como destino) */
export function enchantIds(game, { tier, category, subcategory }) {
  const ids = [];
  for (const it of game.items) {
    if (it.tier !== tier || it.category !== category) continue;
    if (subcategory && it.subcategory !== subcategory) continue;
    if (it.enchantment <= 4) ids.push(it.item_id);
  }
  return ids;
}

/**
 * p = { game, ids, buyCities, saleCities, premium, enchantCost:{1:n,2:n,3:n,4:n} (por objeto, según el encanto de destino), maxAge,
 *       market:(city,id)=>{sell_min,buy_max,sellAge,buyAge,sellSrc,buySrc}|null }
 */
export function enchantFlips(p) {
  const { game } = p, t = game.settings.taxes, taxPct = p.premium ? t.sales_tax_premium_pct : t.sales_tax_no_premium_pct, maxAge = p.maxAge || MAX_AGE_MIN;
  const stats = { pairs: 0, noData: 0, tooOld: 0 }, out = [], set = new Set(p.ids);
  for (const id of p.ids) {
    const to = id + '', m = /^(.*)@([1-4])$/.exec(to); if (!m) continue;
    const baseId = m[2] === '1' ? m[1] : m[1] + '@' + (+m[2] - 1), lvl = +m[2];
    if (!set.has(baseId)) continue;
    stats.pairs++;
    let bestBuy = null, bestSell = null, old = false;
    for (const c of p.buyCities) { const q = p.market(c, baseId); const pr = q ? pos(q.sell_min) : null; if (pr === null) continue; if (!isNum(q.sellAge) || q.sellAge >= maxAge) { old = true; continue; } if (!bestBuy || pr < bestBuy.price) bestBuy = { city: c, price: pr, age: q.sellAge, src: q.sellSrc }; }
    for (const c of p.saleCities) { const q = p.market(c, to); const pr = q ? pos(q.buy_max) : null; if (pr === null) continue; if (!isNum(q.buyAge) || q.buyAge >= maxAge) { old = true; continue; } if (!bestSell || pr > bestSell.price) bestSell = { city: c, price: pr, age: q.buyAge, src: q.buySrc }; }
    if (!bestBuy || !bestSell) { if (old) stats.tooOld++; else stats.noData++; continue; }
    const tax = Math.round(bestSell.price * taxPct / 100), cost = +(p.enchantCost && p.enchantCost[lvl]) || 0;
    const gross = bestSell.price - tax - bestBuy.price, net = gross - cost;
    out.push({ id: to, from: baseId, label: game.label(to), fromLabel: game.label(baseId), level: lvl, buy: bestBuy, sell: bestSell, tax, gross, enchantCost: cost, profit: net, roi: (bestBuy.price + cost) > 0 ? net / (bestBuy.price + cost) : null,
      oldest: Math.max(bestBuy.age, bestSell.age), costKnown: cost > 0, sources: [bestBuy.src, bestSell.src] });
  }
  out.sort((a, b) => b.profit - a.profit);
  return { out, stats, taxPct };
}
