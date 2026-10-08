// Planificador de fabricación de varios ítems: lista de materiales total, costo, venta y ganancia por ítem.
// Función pura. Precios: materiales se compran al instante (orden de venta más barata) en la ciudad de compra;
// el producto se vende al instante a la orden de compra más alta (solo impuesto). Nada se inventa: sin precio → se avisa.
import { craftBatch } from '../profit-engine/profit.js?v=0.16';
import { rateFor } from '../profit-engine/scenario.js?v=0.16';
import { sourceSummary } from '../data/merge.js?v=0.16';

const isNum = v => typeof v === 'number' && isFinite(v);
const pos = v => isNum(v) && v > 0 ? v : null;
const MAX_AGE_MIN = 1440;

/** ids cuyo precio hace falta: cada producto y todos sus materiales */
export function plannerIds(game, items) {
  const ids = new Set();
  for (const it of items) { const r = game.recipe(it.id); if (!r) continue; ids.add(it.id); r.materials.forEach(m => ids.add(m.item_id)); }
  return [...ids];
}

/**
 * p = { game, items:[{id, qty}], craftCity, buyCity, saleCity, premium, focus, feePerCraft, market:(city,id)=>{sell_min,buy_max,sellAge,buyAge,sellSrc,buySrc}|null }
 * qty = unidades que quieres obtener (se redondea hacia arriba a fabricaciones completas).
 */
export function planCrafts(p) {
  const { game } = p, t = game.settings.taxes, taxPct = p.premium ? t.sales_tax_premium_pct : t.sales_tax_no_premium_pct, setupPct = t.setup_fee_pct;
  const lines = [], shop = new Map(); let invest = 0, revenue = 0, profit = 0, units = 0, missing = 0, focusUsed = 0, oldest = 0; const srcs = [];
  for (const it of p.items) {
    const item = game.item(it.id), recipe = game.recipe(it.id), qty = Math.max(0, Math.round(+it.qty || 0));
    if (!item || !recipe || !qty) continue;
    const rr = rateFor(game, item, { craftCity: p.craftCity, focus: !!p.focus, manualRatePct: null });
    const line = { id: it.id, label: game.label(it.id), qty, rate: rr.rate, bonus: !!rr.bonusKind, issues: [], batch: null, saleUnit: null };
    if (rr.rate === null) { line.issues.push('Esta ciudad no tiene retorno verificado'); lines.push(line); missing++; continue; }
    const prices = {}, ages = []; let miss = [];
    for (const m of recipe.materials) {
      const q = p.market(p.buyCity, m.item_id), pr = q ? pos(q.sell_min) : null;
      if (pr === null) { miss.push(m.item_id); continue; }
      prices[m.item_id] = pr; srcs.push(q.sellSrc); if (isNum(q.sellAge)) { ages.push(q.sellAge); if (q.sellAge >= MAX_AGE_MIN) line.issues.push('Precio de ' + game.label(m.item_id) + ' con más de 24 h'); }
    }
    const sq = p.market(p.saleCity, it.id), sp = sq ? pos(sq.buy_max) : null;
    if (miss.length) line.issues.push('Sin precio de compra de: ' + miss.map(i => game.label(i)).join(', '));
    if (sp === null) line.issues.push('Sin precio de venta (orden de compra) en ' + p.saleCity);
    else { srcs.push(sq.buySrc); if (isNum(sq.buyAge)) { ages.push(sq.buyAge); if (sq.buyAge >= MAX_AGE_MIN) line.issues.push('Precio de venta con más de 24 h'); } }
    const b = craftBatch({ recipe: { quantity_produced: recipe.quantity_produced, materials: recipe.materials, focus_base: recipe.focus_base }, units: qty, prices, returnRate: rr.rate,
      craftingFee: { value: (+p.feePerCraft || 0) * Math.ceil(qty / recipe.quantity_produced), mode: 'total' }, transport: { legs: [], perUnit: 0 }, otherCosts: 0,
      sale: { unitPrice: sp, mode: 'instant', taxPct, setupPct }, focus: { use: !!p.focus, costPerCraft: recipe.focus_base, silverPerFocus: null }, minutes: null });
    line.batch = b; line.saleUnit = sp; line.age = ages.length ? Math.max(...ages) : null; line.crafts = b.crafts; line.made = b.made;
    b.lines.forEach(l => { const s = shop.get(l.item_id) || { id: l.item_id, qty: 0, unit: l.price, cost: 0, missing: false }; s.qty += l.toBuy; if (l.price === null) s.missing = true; else s.cost += l.toBuy * l.price; shop.set(l.item_id, s); });
    if (b.ok && !line.issues.some(x => x.includes('24 h'))) { invest += b.totalCost; revenue += b.sale.net; profit += b.profit; units += b.made; focusUsed += b.focusUsed; }
    else if (!b.ok) missing++;
    if (line.age != null) oldest = Math.max(oldest, line.age);
    lines.push(line);
  }
  const shopping = [...shop.values()].sort((a, b) => b.cost - a.cost);
  return { lines, shopping, totals: { invest: Math.round(invest), revenue: Math.round(revenue), profit: Math.round(profit), units, roi: invest > 0 ? profit / invest : null, focusUsed, oldest, incomplete: missing, source: sourceSummary(srcs.filter(Boolean)) }, taxPct };
}
