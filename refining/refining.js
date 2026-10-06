// Refinar o comprar el refinado ya hecho. Función pura.
// Compara, para las mismas unidades y el mismo destino de venta:
//   A) comprar recurso → refinar → vender        (el cálculo completo viene del motor de profit)
//   B) comprar el material refinado directamente → vender
const isNum = v => typeof v === 'number' && isFinite(v);
const pos = v => isNum(v) && v > 0 ? v : null;

/**
 * p = { units, buyMarket:{sell_min,buy_max,sellAge,buyAge}  // precio del refinado en la ciudad de compra
 *       refine:{ instant: calc, order: calc }               // resultados del motor para fabricar
 *       setupPct, transportTotal, transportPerUnit }
 * Devuelve por modo: costo de comprar directo, profit directo, profit refinando y cuál conviene.
 */
export function refineVsBuy(p) {
  const out = {};
  for (const mode of ['instant', 'order']) {
    const calc = p.refine[mode], sale = calc && calc.sale;
    const unit = mode === 'instant' ? pos(p.buyMarket && p.buyMarket.sell_min) : (pos(p.buyMarket && p.buyMarket.buy_max) ? p.buyMarket.buy_max * (1 + p.setupPct / 100) : null);
    const transport = (+p.transportTotal || 0) + (+p.transportPerUnit || 0) * p.units;
    const cost = unit === null ? null : Math.round(unit) * p.units + transport;
    const directProfit = cost === null || !sale ? null : sale.net - cost;
    const refineProfit = calc ? calc.profit : null;
    let better = null;
    if (isNum(directProfit) && isNum(refineProfit)) better = refineProfit > directProfit ? 'refinar' : refineProfit < directProfit ? 'comprar' : 'igual';
    out[mode] = { unitBuy: unit === null ? null : Math.round(unit), cost, directProfit, refineProfit, better,
      directRoi: isNum(directProfit) && cost > 0 ? directProfit / cost * 100 : null,
      diff: isNum(directProfit) && isNum(refineProfit) ? refineProfit - directProfit : null };
  }
  return out;
}
