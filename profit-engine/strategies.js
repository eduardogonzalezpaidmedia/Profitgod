// «Tengo estos materiales»: compara vender los materiales, refinarlos o fabricar con ellos (y venderlo en la ciudad o en el Mercado Negro).
// Función pura: recibe una función que entrega los precios ya leídos de tu base. No usa red ni DOM.
//
// Reglas (iguales al diseño): nada se inventa; sin precio de un material necesario la opción se descarta y se cuenta;
// datos de más de 24 h no se recomiendan; solo venta INSTANT (la más prudente); Premium y Focus como los tengas configurados.
import { craftBatch } from './profit.js?v=0.9';
import { rateFor } from './scenario.js?v=0.9';
import { sourceSummary } from '../data/merge.js?v=0.9';

const isNum = v => typeof v === 'number' && isFinite(v);
const pos = v => isNum(v) && v > 0 ? v : null;
const MAX_AGE_MIN = 1440;

/** Todos los objetos cuyo precio hace falta para evaluar este material (productos y demás materiales). */
export function neededIds(game, materialId, maxTier = 8) {
  const ids = new Set([materialId]);
  for (const pid of game.usedIn(materialId)) {
    const it = game.item(pid); if (!it || (it.tier && it.tier > maxTier)) continue;
    ids.add(pid); game.recipe(pid).materials.forEach(m => ids.add(m.item_id));
  }
  return [...ids];
}

/**
 * p = { game, materialId, qty, silver, buyCity, craftCity, saleCity, premium, focus, feePerCraft, maxTier,
 *       market: (city, id) => ({sell_min, buy_max, sellAge, buyAge}) | null }
 */
export function compareStrategies(p) {
  const holdings = (p.holdings && p.holdings.length ? p.holdings : [{ id: p.materialId, qty: p.qty }]).filter(h => h.id && h.qty > 0), held = new Map(holdings.map(h => [h.id, h.qty]));
  const { game } = p, t = game.settings.taxes, taxPct = p.premium ? t.sales_tax_premium_pct : t.sales_tax_no_premium_pct, setupPct = t.setup_fee_pct;
  const stats = { candidates: 0, evaluated: 0, noData: 0, tooOld: 0, tooSmall: 0, overBudget: 0 };
  // A) vender TODOS los materiales ahora
  const aLines = holdings.map(h => { const mk = p.market(p.buyCity, h.id) || {}; return { id: h.id, qty: h.qty, unit: pos(mk.buy_max), age: mk.buyAge, src: mk.buySrc || null }; });
  const aOk = aLines.every(l => l.unit !== null);
  const sellLeft = (id, q) => { const l = aLines.find(x => x.id === id); return l && l.unit !== null && isNum(l.age) && l.age < MAX_AGE_MIN ? Math.round(q * l.unit * (1 - taxPct / 100)) : 0; };
  const A = { source: aOk ? sourceSummary(aLines.map(l => l.src)) : null, kind: 'Vender los materiales', label: holdings.map(h => game.label(h.id)).join(' + '), value: aOk ? aLines.reduce((s, l) => s + Math.round(l.qty * l.unit * (1 - taxPct / 100)), 0) : null,
    units: holdings.reduce((s, h) => s + h.qty, 0), unitPrice: aOk && aLines.length === 1 ? aLines[0].unit : null, oldest: aOk ? Math.max(...aLines.map(l => isNum(l.age) ? l.age : 0)) : null, missing: aLines.filter(l => l.unit === null).map(l => l.id),
    detail: 'Vendes a la orden de compra más alta en ' + p.buyCity + ', pagando solo el impuesto.' };

  const options = [];
  const candidatesIds = [...new Set(holdings.flatMap(h => game.usedIn(h.id)))];
  for (const pid of candidatesIds) {
    const item = game.item(pid), recipe = game.recipe(pid); if (!item || !recipe) continue;
    if (item.tier && item.tier > (p.maxTier || 8)) continue;
    stats.candidates++;
    const rr = rateFor(game, item, { craftCity: p.craftCity, focus: !!p.focus, manualRatePct: null });
    if (rr.rate === null) { stats.noData++; continue; }
    let crafts = Infinity;
    for (const m of recipe.materials) if (held.has(m.item_id)) crafts = Math.min(crafts, Math.floor(held.get(m.item_id) / (m.quantity * (1 - (m.returnable ? rr.rate : 0)))));
    if (!isFinite(crafts) || crafts < 1) { stats.tooSmall++; continue; }
    // precios de los demás materiales (comprados al instante en la ciudad de compra)
    const prices = {}, ages = [], srcs = []; let missing = false;
    for (const m of recipe.materials) {
      if (held.has(m.item_id)) continue;
      const q = p.market(p.buyCity, m.item_id), pr = q ? pos(q.sell_min) : null;
      if (pr === null) { missing = true; break; } prices[m.item_id] = pr; srcs.push(q.sellSrc); if (isNum(q.sellAge)) ages.push(q.sellAge);
    }
    if (missing) { stats.noData++; continue; }
    // destinos de venta
    let got = false, old = false, budget = false;
    const dests = [];
    const isRefined = item.category === 'refined';
    if (p.saleCity !== 'Black Market') dests.push({ city: p.saleCity, kind: isRefined ? 'Refinar y vender' : 'Fabricar y vender' });
    if (!isRefined) dests.push({ city: 'Black Market', kind: 'Fabricar → Mercado Negro' });
    for (const d of dests) {
      const sq = p.market(d.city, pid), sp = sq ? pos(sq.buy_max) : null;
      if (sp === null) continue;
      const oldest = Math.max(...ages, isNum(sq.buyAge) ? sq.buyAge : 0);
      if (oldest >= MAX_AGE_MIN) { old = true; continue; }
      const run = n => craftBatch({ recipe: { quantity_produced: recipe.quantity_produced, materials: recipe.materials, focus_base: recipe.focus_base }, units: n * recipe.quantity_produced,
        prices, owned: Object.fromEntries([...held.keys()].map(k => [k, true])), returnRate: rr.rate, craftingFee: { value: (+p.feePerCraft || 0) * n, mode: 'total' }, transport: { legs: [], perUnit: 0 }, otherCosts: 0,
        sale: { unitPrice: sp, mode: 'instant', taxPct, setupPct }, minutes: null });
      let c = crafts, r = run(c);
      if (p.silver > 0 && isNum(r.totalCost) && r.totalCost > p.silver) {       // no se recomienda gastar más silver del que tienes
        c = Math.max(0, Math.floor(c * p.silver / r.totalCost)); r = c ? run(c) : null;
        while (r && r.totalCost > p.silver && c > 0) { c--; r = c ? run(c) : null; }
        if (!r || c < 1) { budget = true; continue; }
      }
      if (!r || !isNum(r.profit)) continue;
      got = true;
      const used = r.lines.filter(l => held.has(l.item_id)).map(l => ({ id: l.item_id, used: Math.round(l.needed), leftover: Math.max(0, held.get(l.item_id) - Math.round(l.needed)) }));
      const leftoverList = holdings.map(h => { const u = used.find(x => x.id === h.id); return { id: h.id, qty: u ? u.leftover : h.qty }; }).filter(x => x.qty > 0);
      const leftoverValue = A.value === null ? 0 : leftoverList.reduce((s, x) => s + sellLeft(x.id, x.qty), 0);
      options.push({ kind: d.kind, product: pid, label: game.label(pid), saleCity: d.city, crafts: c, units: r.made, unitPrice: sp, retorno: rr.rate, bonus: !!rr.bonusKind,
        used, leftoverList, leftoverValue, total: Math.round(r.profit) + leftoverValue, materialsUsed: used.length ? used[0].used : 0, leftover: used.length ? used[0].leftover : 0, extraCost: r.totalCost, net: r.sale.net, value: Math.round(r.profit), oldest, limitedBySilver: c < crafts, calc: r, source: sourceSummary([...srcs, sq.buySrc]) });
    }
    // cada receta cuenta una sola vez, en la primera categoría que le toca
    if (got) stats.evaluated++; else if (old) stats.tooOld++; else if (budget) stats.overBudget++; else stats.noData++;
  }
  options.sort((a, b) => b.total - a.total);
  const bestOpt = options[0] || null;
  const best = bestOpt && (A.value === null || bestOpt.total > A.value) ? bestOpt : (A.value !== null ? A : null);
  options.forEach(o => { o.vsSell = A.value === null ? null : o.total - A.value; });
  return { A, options, best, bestIsSell: best === A, stats, taxPct };
}
