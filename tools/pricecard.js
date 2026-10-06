// Ficha de precio de un ítem: todas las ciudades y calidades, de dónde viene cada dato y dónde conviene comprar o vender.
// Función pura. Nada se inventa: sin precio → «sin dato»; datos de 24 h o más se marcan y no entran en «mejor».
const isNum = v => typeof v === 'number' && isFinite(v);
const pos = v => isNum(v) && v > 0 ? v : null;
const MAX_AGE_MIN = 1440;

/** búsqueda de ítems y materiales por nombre/tier (para la ficha): «espada ancha 6.1», «lingote t4» */
export function searchAny(game, q, limit = 25) {
  const n = String(q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); if (!n) return [];
  let tier = null, ench = null, words = n; const te = /\bt?([1-8])(?:\.([0-4]))?\b/.exec(n);
  if (te) { tier = +te[1]; ench = te[2] !== undefined ? +te[2] : null; words = n.replace(te[0], ' '); }
  const ws = words.split(/\s+/).filter(Boolean), out = [], seen = new Set();
  for (const it of game.items) {
    if (tier !== null && it.tier !== tier) continue; if (ench !== null && it.enchantment !== ench) continue;
    if (ws.every(w => it._norm.includes(w))) { out.push({ item_id: it.item_id, name: game.label(it.item_id) }); seen.add(it.item_id); if (out.length >= limit) return out; }
  }
  for (const m of game.searchMat(q, limit)) if (!seen.has(m.item_id)) { out.push({ item_id: m.item_id, name: game.label(m.item_id) }); if (out.length >= limit) break; }
  return out;
}

/** p = { game, id, cities, qualities, premium, market:(city,id,quality)=>fila v2|null } */
export function priceCard(p) {
  const t = p.game.settings.taxes, taxPct = p.premium ? t.sales_tax_premium_pct : t.sales_tax_no_premium_pct, byQ = [];
  for (const q of p.qualities) {
    const rows = p.cities.map(city => { const r = p.market(city, p.id, q); return { city, sell: r ? pos(r.sell.price) : null, sellAge: r ? r.sell.age_min : null, sellSrc: r ? r.sell.src : null, buy: r ? pos(r.buy.price) : null, buyAge: r ? r.buy.age_min : null, buySrc: r ? r.buy.src : null }; });
    const fresh = a => isNum(a) && a < MAX_AGE_MIN;
    let bestBuy = null, bestSell = null;
    rows.forEach(r => { if (r.sell !== null && fresh(r.sellAge) && (!bestBuy || r.sell < bestBuy.price)) bestBuy = { city: r.city, price: r.sell }; if (r.buy !== null && fresh(r.buyAge) && (!bestSell || r.buy > bestSell.price)) bestSell = { city: r.city, price: r.buy }; });
    const margin = bestBuy && bestSell && bestBuy.city !== bestSell.city ? Math.round(bestSell.price * (1 - taxPct / 100)) - bestBuy.price : null;
    byQ.push({ quality: q, rows, bestBuy, bestSell, margin, withData: rows.filter(r => r.sell !== null || r.buy !== null).length });
  }
  return { id: p.id, taxPct, byQ };
}
