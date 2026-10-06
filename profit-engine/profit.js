/* Profit God — motor de cálculo (funciones puras, sin DOM ni red). Portado de Silver Master, donde está probado.
   Todas las funciones devuelven null cuando falta un dato: nunca se usa 0 como precio desconocido. */
const isNum = v => typeof v === 'number' && isFinite(v);

/** Costo de materiales. lines: [{item_id, quantity, price}] (price null = sin dato). */
export function calculateMaterialCost(lines) {
  const out = [], missing = [];
  let total = 0;
  for (const l of lines) {
    const ok = isNum(l.price) && (l.price > 0 || l.free === true) && isNum(l.quantity);
    if (!ok) missing.push(l.item_id);
    const cost = ok ? l.quantity * l.price : null;
    if (ok) total += cost;
    out.push(Object.assign({}, l, { cost }));
  }
  return { lines: out, total: missing.length ? null : total, missing };
}

/** Retorno de recursos para una cantidad bruta. rate en 0..1. Los materiales no retornables no devuelven nada. */
export function calculateReturn(grossQuantity, rate, returnable) {
  if (!isNum(grossQuantity) || !isNum(rate)) return null;
  const r = returnable === false ? 0 : Math.min(Math.max(rate, 0), 1);
  const recovered = grossQuantity * r;
  return { gross: grossQuantity, recovered, net: grossQuantity - recovered, rate: r };
}

/** Tarifa de la estación. Se ingresa a mano (por unidad o total del lote). */
export function calculateCraftingFee(fee, units, mode) {
  if (!isNum(fee) || fee < 0) return 0;
  return mode === 'per_unit' ? fee * units : fee;
}

/** Transporte: tramos en plata (totales del lote) y/o por unidad. */
export function calculateTransportCost(legs, units, perUnit) {
  let t = 0;
  for (const v of (legs || [])) if (isNum(v) && v > 0) t += v;
  if (isNum(perUnit) && perUnit > 0 && isNum(units)) t += perUnit * units;
  return t;
}

export function calculateSaleTax(gross, taxPct) {
  if (!isNum(gross) || !isNum(taxPct)) return null;
  return gross * taxPct / 100;
}

/** Tarifa de publicación: solo al publicar una orden de venta. La venta inmediata no la paga. */
export function calculateSetupFee(gross, setupPct, mode) {
  if (mode !== 'order') return 0;
  if (!isNum(gross) || !isNum(setupPct)) return null;
  return gross * setupPct / 100;
}

/** Ingreso neto. mode: 'instant' (a una orden de compra) u 'order' (publicar orden de venta). */
export function calculateNetRevenue(unitPrice, units, taxes) {
  if (!isNum(unitPrice) || unitPrice <= 0 || !isNum(units)) return null;
  const gross = unitPrice * units;
  const tax = calculateSaleTax(gross, taxes.taxPct);
  const setup = calculateSetupFee(gross, taxes.setupPct, taxes.mode);
  if (tax === null || setup === null) return null;
  return { gross, tax, setup, net: gross - tax - setup };
}

export function calculateProfit(net, totalCost) {
  if (!isNum(net) || !isNum(totalCost)) return null;
  return net - totalCost;
}

/** ROI = Profit / Capital utilizado × 100 */
export function calculateROI(profit, capital) {
  if (!isNum(profit) || !isNum(capital) || capital <= 0) return null;
  return profit / capital * 100;
}

export function calculateSilverPerHour(profit, minutes) {
  if (!isNum(profit) || !isNum(minutes) || minutes <= 0) return null;
  return profit / (minutes / 60);
}

/**
 * Cálculo completo de un lote de fabricación con registro paso a paso.
 * p = {
 *   recipe: {quantity_produced, materials:[{item_id, quantity, returnable}], focus_base},
 *   units: unidades que quieres fabricar,
 *   prices: {item_id: number|null},             // precio unitario de cada material
 *   returnRate: 0..1,
 *   craftingFee: {value, mode:'total'|'per_unit'},
 *   transport: {legs:[plata,...], perUnit},
 *   otherCosts: plata,
 *   sale: {unitPrice, mode:'instant'|'order', taxPct, setupPct},
 *   focus: {use, costPerCraft, silverPerFocus},  // silverPerFocus null = no se valora
 *   minutes: tiempo total del ciclo
 * }
 */
export function craftBatch(p) {
  const reasons = [];
  const r = p.recipe;
  if (!r || !r.materials || !r.materials.length) reasons.push('No hay receta');
  const units = Math.max(1, Math.round(p.units || 0));
  const yieldN = (r && r.quantity_produced) || 1;
  const crafts = Math.ceil(units / yieldN);
  const made = crafts * yieldN;
  const lines = (r ? r.materials : []).map(m => {
    const gross = m.quantity * crafts;
    const ret = calculateReturn(gross, p.returnRate, m.returnable);
    const owned = !!(p.owned && p.owned[m.item_id]);   // material que ya tienes: no se compra (su valor se cuenta aparte)
    const price = owned ? 0 : (p.prices ? p.prices[m.item_id] : null);
    return {
      item_id: m.item_id, perCraft: m.quantity, returnable: m.returnable !== false,
      gross, recovered: ret ? ret.recovered : null, needed: ret ? ret.net : null,
      toBuy: ret ? Math.ceil(ret.net) : null, price: isNum(price) ? price : null, free: owned
    };
  });
  const mc = calculateMaterialCost(lines.map(l => ({ item_id: l.item_id, quantity: l.needed, price: l.price, free: l.free })));
  mc.lines.forEach((l, i) => { lines[i].cost = l.cost; });
  if (mc.missing.length) reasons.push('Falta precio de ' + mc.missing.length + ' material(es)');
  const fee = calculateCraftingFee(p.craftingFee && p.craftingFee.value, made, p.craftingFee && p.craftingFee.mode);
  const transport = calculateTransportCost(p.transport && p.transport.legs, made, p.transport && p.transport.perUnit);
  const other = isNum(p.otherCosts) && p.otherCosts > 0 ? p.otherCosts : 0;
  const totalCost = mc.total === null ? null : mc.total + fee + transport + other;
  const s = p.sale || {};
  const rev = calculateNetRevenue(s.unitPrice, made, { taxPct: s.taxPct, setupPct: s.setupPct, mode: s.mode });
  if (!rev) reasons.push('No hay precio de venta');
  const profit = rev && totalCost !== null ? calculateProfit(rev.net, totalCost) : null;
  const roi = calculateROI(profit, totalCost);
  const sph = calculateSilverPerHour(profit, p.minutes);
  let focusUsed = 0, focusSilver = null, economicProfit = profit;
  if (p.focus && p.focus.use && isNum(p.focus.costPerCraft)) {
    focusUsed = p.focus.costPerCraft * crafts;
    if (isNum(p.focus.silverPerFocus) && p.focus.silverPerFocus > 0) {
      focusSilver = focusUsed * p.focus.silverPerFocus;
      economicProfit = profit === null ? null : profit - focusSilver;
    }
  }
  return {
    ok: reasons.length === 0, reasons,
    units, crafts, made, yieldN, returnRate: p.returnRate,
    lines, materialCost: mc.total, craftingFee: fee, transport, otherCosts: other, totalCost,
    sale: rev ? Object.assign({ unitPrice: s.unitPrice, mode: s.mode, taxPct: s.taxPct, setupPct: s.setupPct }, rev) : null,
    profit, profitPerUnit: profit === null ? null : profit / made, roi, silverPerHour: sph, minutes: p.minutes,
    focusUsed, focusSilver, accountingProfit: profit, economicProfit
  };
}
