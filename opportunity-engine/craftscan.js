// Busca qué fabricar o refinar donde estás y a dónde venderlo (INSTANT). Función pura: recibe filas ya leídas.
// Nada se inventa: sin precio de algún material, o del producto, o con datos de más de 24 h, la receta se descarta y se cuenta.
import { craftBatch } from '../profit-engine/profit.js?v=0.21';
import { rateFor } from '../profit-engine/scenario.js?v=0.21';
import { flipRisk } from '../black-market/risk.js?v=0.21';
import { liquidityLevel } from '../flipping/flipping.js?v=0.21';
import { scoreAll } from './score.js?v=0.21';

const isNum = v => typeof v === 'number' && isFinite(v);
const MAX_AGE = 1440;

/**
 * p = { game, rows:[fila v2 mezclada], city, saleCities:[...], silver, premium, maxTier, cfg:{craftMin,tripMin,actionMin,craftFee,unknownDepthUnits}, maxCrafts }
 * → { opps:[...], stats:{candidates, evaluated, noData, tooOld, noRate} }
 */
export function scanCrafts(p) {
  const { game, cfg } = p, t = game.settings.taxes, taxPct = p.premium ? t.sales_tax_premium_pct : t.sales_tax_no_premium_pct, setupPct = t.setup_fee_pct, unk = cfg.unknownDepthUnits || 10;
  const idx = new Map(p.rows.map(r => [r.city + '|' + r.item_id + '|' + r.quality, r]));
  const stats = { candidates: 0, evaluated: 0, noData: 0, tooOld: 0, noRate: 0 }, opps = [];
  for (const [pid, recipe] of game.recipes) {
    const item = game.item(pid); if (!item || item.enchantment !== 0 || (item.tier && item.tier > (p.maxTier || 8))) continue;
    // ¿hay al menos un precio en la ciudad para alguno de sus materiales? si no, ni siquiera es candidata
    if (!recipe.materials.some(m => idx.has(p.city + '|' + m.item_id + '|1'))) continue;
    stats.candidates++;
    const useFocus = p.focus > 0 && recipe.focus_base > 0;      // con Focus solo si lo tienes; se cuenta el costo base (sin maestría, por prudencia)
    const rr = rateFor(game, item, { craftCity: p.city, focus: useFocus, manualRatePct: null });
    if (rr.rate === null) { stats.noRate++; continue; }
    const prices = {}, srcs = new Set(); let missing = false, old = false, mAge = 0, availCrafts = Infinity, availKnown = true;
    for (const m of recipe.materials) {
      const r = idx.get(p.city + '|' + m.item_id + '|1'), s = r && r.sell;
      if (!s || !(s.price > 0) || !isNum(s.age_min != null ? s.age_min : s.age)) { missing = true; break; }
      const age = s.age_min != null ? s.age_min : s.age; if (age >= MAX_AGE) { old = true; break; }
      prices[m.item_id] = s.price; srcs.add(s.src); mAge = Math.max(mAge, age);
      if (isNum(s.amount) && s.amount > 0) availCrafts = Math.min(availCrafts, Math.floor(s.amount / (m.quantity * (1 - (m.returnable ? rr.rate : 0))))); else availKnown = false;
    }
    if (missing || old) { old ? stats.tooOld++ : stats.noData++; continue; }
    let got = false, anyOld = false;
    for (const sc of p.saleCities) {
      const r = idx.get(sc + '|' + pid + '|1'), b = r && r.buy;
      if (!b || !(b.price > 0)) continue;
      const bAge = b.age_min != null ? b.age_min : b.age; if (!isNum(bAge)) continue; if (bAge >= MAX_AGE) { anyOld = true; continue; }
      const demandKnown = isNum(b.amount) && b.amount > 0, demandUnits = demandKnown ? b.amount : unk, depthKnown = demandKnown && availKnown;
      const oldest = Math.max(mAge, bAge), trip = sc !== p.city;
      const run = n => craftBatch({ recipe: { quantity_produced: recipe.quantity_produced, materials: recipe.materials, focus_base: recipe.focus_base }, units: n * recipe.quantity_produced, prices, returnRate: rr.rate,
        craftingFee: { value: (+cfg.craftFee || 0) * n, mode: 'total' }, transport: { legs: [], perUnit: 0 }, otherCosts: 0, sale: { unitPrice: b.price, mode: 'instant', taxPct, setupPct }, minutes: null });
      const toStart = p.startCity && p.city !== p.startCity;                       // fabricar en otra ciudad: primero hay que ir
      const fixedMin = (cfg.actionMin || 5) * 2 + (trip ? (cfg.tripMin || 15) : 0) + (toStart ? (cfg.tripMin || 15) : 0);
      /** Misma operación con un tope de silver y de minutos (para armar el plan). */
      const make = (silverMax, minutesMax, focusMax) => {
        // con cantidades conocidas no se vende más de 2/3 de lo que piden (si no, el riesgo sube y los precios pueden caer)
        const cap = depthKnown ? Math.floor(demandUnits / 1.5 / recipe.quantity_produced) : Math.floor(demandUnits / recipe.quantity_produced);
        let n = Math.max(1, Math.min(p.maxCrafts || 200, cap || 1, isFinite(availCrafts) ? availCrafts : Infinity));
        if (isFinite(minutesMax)) n = Math.min(n, Math.floor((minutesMax - fixedMin) / (cfg.craftMin || 0.5)));
        if (useFocus) n = Math.min(n, Math.floor((focusMax == null ? p.focus : focusMax) / recipe.focus_base));
        if (n < 1) return null;
        let r = run(n);
        if (!r || !isNum(r.totalCost)) return null;
        if (silverMax > 0 && isFinite(silverMax)) { while (n > 0 && r && r.totalCost > silverMax) { n = Math.min(n - 1, Math.floor(n * silverMax / r.totalCost)); r = n >= 1 ? run(n) : null; } if (!r || n < 1) return null; }
        if (!isNum(r.profit) || r.profit <= 0) return null;
        const minutes = fixedMin + n * (cfg.craftMin || 0.5), roi = r.roi;
        const risk = flipRisk({ cost: r.totalCost, from: p.city, to: sc, units: r.made, demand: depthKnown ? demandUnits : null, depthKnown, roi, oldestMin: oldest, volatilityPct: null, historyPoints: 0 });
        return { kind: 'craft', item_id: pid, label: game.label(pid), city: p.city, from: p.city, to: sc, crafts: n, w: { units: r.made, cost: r.totalCost, profit: Math.round(r.profit), roi, gross: r.sale.gross, net: r.sale.net }, calc: r, minutes, sph: r.profit / (minutes / 60),
          oldest, risk, liquidity: depthKnown ? liquidityLevel(demandUnits) : 'SIN DATO', depthKnown, demand: demandUnits, hv: { enough: false, points: 0 }, anomalies: [], steps: 2 + (trip ? 1 : 0) + (toStart ? 1 : 0),
          withFocus: useFocus, focusUsed: useFocus ? n * recipe.focus_base : 0, isRefining: item.category === 'refined',
          srcs: [...srcs, b.src].filter(Boolean), retorno: rr.rate, unitPrice: b.price, feeTotal: (+cfg.craftFee || 0) * n, make };
      };
      const o = make(p.silver > 0 ? p.silver : Infinity, Infinity, p.focus); if (o) { opps.push(o); got = true; }
    }
    if (got) stats.evaluated++; else if (anyOld) stats.tooOld++; else stats.noData++;
  }
  scoreAll(opps, p.silver, p.profile || {});
  return { opps, stats };
}
