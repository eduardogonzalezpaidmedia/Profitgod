// «Tengo estos materiales»: compara vender los materiales, refinarlos o fabricar con ellos (y venderlo en la ciudad o en el Mercado Negro).
// Función pura: recibe una función que entrega los precios ya leídos de tu base. No usa red ni DOM.
//
// Reglas (iguales al diseño): nada se inventa; sin precio de un material necesario la opción se descarta y se cuenta;
// datos de más de 24 h no se recomiendan; solo venta INSTANT (la más prudente); Premium y Focus como los tengas configurados.
import { craftBatch } from './profit.js';
import { rateFor } from './scenario.js';
import { sourceSummary } from '../data/merge.js';

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
  const { game } = p, t = game.settings.taxes, taxPct = p.premium ? t.sales_tax_premium_pct : t.sales_tax_no_premium_pct, setupPct = t.setup_fee_pct;
  const stats = { candidates: 0, evaluated: 0, noData: 0, tooOld: 0, tooSmall: 0, overBudget: 0 };
  // A) vender los materiales ahora
  const mk = p.market(p.buyCity, p.materialId) || {};
  const aInst = pos(mk.buy_max) ? { unit: mk.buy_max, net: Math.round(p.qty * mk.buy_max * (1 - taxPct / 100)), age: mk.buyAge } : null;
  const A = { source: aInst ? mk.buySrc || null : null, kind: 'Vender los materiales', label: game.label(p.materialId), value: aInst ? aInst.net : null, units: p.qty, unitPrice: aInst ? aInst.unit : null, oldest: aInst ? aInst.age : null, detail: 'Vendes a la orden de compra más alta en ' + p.buyCity + ', pagando solo el impuesto.' };

  const options = [];
  for (const pid of game.usedIn(p.materialId)) {
    const item = game.item(pid), recipe = game.recipe(pid); if (!item || !recipe) continue;
    if (item.tier && item.tier > (p.maxTier || 8)) continue;
    stats.candidates++;
    const own = recipe.materials.find(m => m.item_id === p.materialId);
    const rr = rateFor(game, item, { craftCity: p.craftCity, focus: !!p.focus, manualRatePct: null });
    if (rr.rate === null) { stats.noData++; continue; }
    const needPer = own.quantity * (1 - (own.returnable ? rr.rate : 0));
    let crafts = Math.floor(p.qty / needPer);
    if (crafts < 1) { stats.tooSmall++; continue; }
    // precios de los demás materiales (comprados al instante en la ciudad de compra)
    const prices = {}, ages = [], srcs = []; let missing = false;
    for (const m of recipe.materials) {
      if (m.item_id === p.materialId) continue;
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
        prices, owned: { [p.materialId]: true }, returnRate: rr.rate, craftingFee: { value: (+p.feePerCraft || 0) * n, mode: 'total' }, transport: { legs: [], perUnit: 0 }, otherCosts: 0,
        sale: { unitPrice: sp, mode: 'instant', taxPct, setupPct }, minutes: null });
      let c = crafts, r = run(c);
      if (p.silver > 0 && isNum(r.totalCost) && r.totalCost > p.silver) {       // no se recomienda gastar más silver del que tienes
        c = Math.max(0, Math.floor(c * p.silver / r.totalCost)); r = c ? run(c) : null;
        while (r && r.totalCost > p.silver && c > 0) { c--; r = c ? run(c) : null; }
        if (!r || c < 1) { budget = true; continue; }
      }
      if (!r || !isNum(r.profit)) continue;
      got = true;
      const usedOwn = r.lines.find(l => l.item_id === p.materialId);
      options.push({ kind: d.kind, product: pid, label: game.label(pid), saleCity: d.city, crafts: c, units: r.made, unitPrice: sp, retorno: rr.rate, bonus: !!rr.bonusKind,
        materialsUsed: Math.round(usedOwn.needed), leftover: Math.max(0, Math.round(p.qty - usedOwn.needed)), extraCost: r.totalCost, net: r.sale.net, value: Math.round(r.profit), oldest, limitedBySilver: c < crafts, calc: r, source: sourceSummary([...srcs, sq.buySrc]) });
    }
    // cada receta cuenta una sola vez, en la primera categoría que le toca
    if (got) stats.evaluated++; else if (old) stats.tooOld++; else if (budget) stats.overBudget++; else stats.noData++;
  }
  options.sort((a, b) => b.value - a.value);
  const bestOpt = options[0] || null;
  const best = bestOpt && (A.value === null || bestOpt.value > A.value) ? bestOpt : (A.value !== null ? A : null);
  options.forEach(o => { o.vsSell = A.value === null ? null : o.value - A.value; });
  return { A, options, best, bestIsSell: best === A, stats, taxPct };
}
