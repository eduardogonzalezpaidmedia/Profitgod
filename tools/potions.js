// Ranking de pociones: volumen vendido, precio y ganancia por unidad. Función pura.
// Volumen = unidades vendidas por día que REPORTA Albion Data Project (historial público); no es el total real del servidor.
// Nada se inventa: sin historial no hay volumen; sin precio de algún material no hay costo.
import { craftBatch } from '../profit-engine/profit.js?v=0.14';
import { rateFor } from '../profit-engine/scenario.js?v=0.14';

const isNum = v => typeof v === 'number' && isFinite(v);
const pos = v => isNum(v) && v > 0 ? v : null;
const MAX_AGE_MIN = 1440;
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Resume una serie diaria: promedio de unidades por día y precio medio de los últimos `days` días con datos. */
export function volumeStats(series, days = 7) {
  const d = (series || []).filter(x => x && isNum(+x.item_count) && +x.item_count >= 0).slice(-days);
  if (!d.length) return null;
  const units = d.reduce((s, x) => s + +x.item_count, 0), val = d.reduce((s, x) => s + +x.item_count * (+x.avg_price || 0), 0);
  return { perDay: units / d.length, avgPrice: units > 0 ? val / units : null, days: d.length };
}

/** ids de pociones sin encanto del rango de tiers que tienen receta */
export function potionIds(game, tmin, tmax) { return game.items.filter(i => i.category === 'potions' && i.enchantment === 0 && i.tier >= tmin && i.tier <= tmax && game.recipes.has(i.item_id)).map(i => i.item_id); }

/**
 * p = { game, ids, craftCity, buyCity, saleCities:[…], premium, focus, feePerCraft, market:(city,id)=>{sell_min,buy_max,sellAge,buyAge}|null, hist:(city,id)=>serie|null, days }
 */
export function potionRank(p) {
  const { game } = p, t = game.settings.taxes, taxPct = p.premium ? t.sales_tax_premium_pct : t.sales_tax_no_premium_pct, setupPct = t.setup_fee_pct, out = [], stats = { total: 0, noMats: 0, noPrice: 0, tooOld: 0, noVolume: 0 };
  for (const id of p.ids) {
    const item = game.item(id), recipe = game.recipe(id); if (!item || !recipe) continue; stats.total++;
    // mejor ciudad de venta: mayor orden de compra con datos de menos de 24 h
    let best = null, old = false;
    for (const c of p.saleCities) { const q = p.market(c, id), pr = q ? pos(q.buy_max) : null; if (pr === null) continue; if (!isNum(q.buyAge) || q.buyAge >= MAX_AGE_MIN) { old = true; continue; } if (!best || pr > best.price) best = { city: c, price: pr, age: q.buyAge }; }
    if (!best) { if (old) stats.tooOld++; else stats.noPrice++; continue; }
    const rr = rateFor(game, item, { craftCity: p.craftCity, focus: !!p.focus, manualRatePct: null }); if (rr.rate === null) { stats.noPrice++; continue; }
    const prices = {}; let miss = false;
    for (const m of recipe.materials) { const q = p.market(p.buyCity, m.item_id), pr = q ? pos(q.sell_min) : null; if (pr === null || !isNum(q.sellAge) || q.sellAge >= MAX_AGE_MIN) { miss = true; break; } prices[m.item_id] = pr; }
    if (miss) { stats.noMats++; continue; }
    const b = craftBatch({ recipe: { quantity_produced: recipe.quantity_produced, materials: recipe.materials, focus_base: recipe.focus_base }, units: recipe.quantity_produced * 100, prices, returnRate: rr.rate, craftingFee: { value: (+p.feePerCraft || 0) * 100, mode: 'total' }, transport: { legs: [], perUnit: 0 }, otherCosts: 0,
      sale: { unitPrice: best.price, mode: 'instant', taxPct, setupPct }, minutes: null });
    if (!b.ok || !isNum(b.profit)) { stats.noMats++; continue; }
    const vol = volumeStats(p.hist(best.city, id), p.days || 7); if (!vol) stats.noVolume++;
    const perUnit = b.profit / b.made, cost = b.totalCost / b.made;
    out.push({ id, label: game.label(id), tier: item.tier, saleCity: best.city, price: best.price, age: best.age, cost: Math.round(cost), profitUnit: Math.round(perUnit), margin: cost > 0 ? perUnit / cost : null, rate: rr.rate,
      perDay: vol ? vol.perDay : null, histPrice: vol ? vol.avgPrice : null, histDays: vol ? vol.days : 0, canSell: vol ? Math.floor(vol.perDay / 1.5) : null, market: vol && vol.perDay ? vol.perDay * best.price : null,
      dayProfit: vol ? Math.round(Math.floor(vol.perDay / 1.5) * perUnit) : null });
  }
  const mv = median(out.map(o => o.perDay).filter(isNum)), mp = median(out.map(o => o.price));
  out.forEach(o => { o.highVol = o.perDay == null ? null : o.perDay >= mv; o.highPrice = o.price >= mp;
    o.group = o.highVol === null ? 'SIN VOLUMEN' : o.highVol && o.highPrice ? 'ALTO VOLUMEN Y ALTO PRECIO' : o.highVol ? 'ALTO VOLUMEN, PRECIO BAJO' : o.highPrice ? 'PRECIO ALTO, SE MUEVE POCO' : 'BAJO VOLUMEN Y BAJO PRECIO'; });
  return { out, stats, medianVol: mv, medianPrice: mp, taxPct };
}
