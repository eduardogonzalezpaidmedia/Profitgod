// Escenarios de una fabricación: INSTANT (compro y vendo al instante) y ORDEN (publico órdenes).
// Función pura: recibe los precios ya leídos y devuelve el desglose completo. No usa red ni DOM.
import { craftBatch } from './profit.js?v=0.14';
import { compute as computeRR } from '../refining/returnRate.js?v=0.14';
import { sourceSummary } from '../data/merge.js?v=0.14';

const isNum = v => typeof v === 'number' && isFinite(v);
const pos = v => isNum(v) && v > 0 ? v : null;

/**
 * input = {
 *   game, itemId, units,
 *   market:  { [id]: { sell_min, buy_max, sellAge, buyAge } }   // ciudad de compra para materiales
 *   saleMarket: { sell_min, buy_max, sellAge, buyAge }          // ciudad de venta para el producto
 *   craftCity, saleCity, premium, focus, dailyBonus, manualRatePct, bonusOverride,
 *   fee: { mode:'total'|'nutricion', total, nutrition, rateMin, rateMax, rateUse:'max'|'min' },
 *   transportTotal, transportPerUnit, otherCosts, minutes,
 *   overrides: { instant:{[id]:n}, order:{[id]:n}, saleInstant:n, saleOrder:n }
 * }
 */
export function rateFor(game, item, i) {
  const city = game.cityById.get(i.craftCity);
  const auto = game.bonusFor(item, i.craftCity);
  let kind = auto.kind;
  if (i.bonusOverride === true) kind = item.category === 'refined' ? 'refining' : 'crafting';
  if (i.bonusOverride === false) kind = null;
  const rr = computeRR({ locationType: city && city.type !== 'black_market' ? 'royal' : 'other', bonusKind: kind, focus: !!i.focus, dailyBonus: i.dailyBonus, manualPct: i.manualRatePct }, game.settings.return_rate.production_bonus);
  rr.bonusKind = kind; rr.autoBonus = auto;
  return rr;
}

/** Tarifa de estación del lote. En modo «nutrición»: nutrición × tasa / 100 (tasa por cada 100 de nutrición). */
export function stationFee(fee, rate) {
  if (!fee) return 0;
  if (fee.mode === 'nutricion') { const n = +fee.nutrition || 0; return n > 0 && isNum(rate) ? Math.round(n * rate / 100) : 0; }
  return +fee.total || 0;
}

function oneScenario(i, mode, ctx) {
  const { game, item, recipe, taxPct, setupPct, rr } = ctx;
  const ov = (i.overrides && i.overrides[mode]) || {};
  const prices = {}, source = {};
  for (const m of recipe.materials) {
    const mk = i.market && i.market[m.item_id];
    let auto = null;
    if (mk) auto = mode === 'instant' ? pos(mk.sell_min) : (pos(mk.buy_max) ? Math.round(mk.buy_max * (1 + setupPct / 100)) : null);
    const o = pos(ov[m.item_id]);
    prices[m.item_id] = o !== null ? o : auto;
    source[m.item_id] = o !== null ? 'simulado' : (auto !== null ? ((mk && (mode === 'instant' ? mk.sellSrc : mk.buySrc)) || 'base') : 'sin dato');
  }
  const sm = i.saleMarket || {};
  let saleAuto = mode === 'instant' ? pos(sm.buy_max) : pos(sm.sell_min), saleNA = false;
  if (mode === 'order' && i.saleCity === 'Black Market') { saleAuto = null; saleNA = true; }   // el Mercado Negro solo compra con órdenes de compra
  const saleOv = pos(mode === 'instant' ? i.overrides && i.overrides.saleInstant : i.overrides && i.overrides.saleOrder);
  const unitPrice = saleOv !== null ? saleOv : saleAuto;
  const fees = (i.fee && i.fee.mode === 'nutricion')
    ? ['rateMin', 'rateMax'].map(k => stationFee(i.fee, +i.fee[k])) : [stationFee(i.fee, null), stationFee(i.fee, null)];
  const feeUse = (i.fee && i.fee.rateUse === 'min') ? fees[0] : fees[1];
  const calc = craftBatch({
    recipe: { quantity_produced: recipe.quantity_produced, materials: recipe.materials, focus_base: recipe.focus_base },
    units: i.units, prices, returnRate: rr.rate,
    craftingFee: { value: feeUse, mode: 'total' },
    transport: { legs: isNum(+i.transportTotal) && +i.transportTotal > 0 ? [+i.transportTotal] : [], perUnit: +i.transportPerUnit || 0 },
    otherCosts: +i.otherCosts || 0,
    sale: { unitPrice: unitPrice === null ? null : unitPrice, mode, taxPct, setupPct }, minutes: +i.minutes || null
  });
  if (saleNA) { calc.ok = false; calc.reasons = ['No aplica: el Mercado Negro compra con órdenes de compra, no se publican órdenes de venta allí.']; }
  const ages = [];
  for (const m of recipe.materials) { const mk = i.market && i.market[m.item_id]; if (mk) ages.push(mode === 'instant' ? mk.sellAge : mk.buyAge); }
  ages.push(mode === 'instant' ? sm.buyAge : sm.sellAge);
  const known = ages.filter(isNum);
  return { mode, calc, priceSource: source, saleSource: saleOv !== null ? 'simulado' : (saleAuto !== null ? ((mode === 'instant' ? sm.buySrc : sm.sellSrc) || 'base') : 'sin dato'), saleNA,
    source: sourceSummary([...Object.values(source), saleOv === null && saleAuto !== null ? ((mode === 'instant' ? sm.buySrc : sm.sellSrc) || null) : null].filter(x => x === 'propio' || x === 'público')),
    feeRange: { min: fees[0], max: fees[1], used: feeUse }, oldestMinutes: known.length ? Math.max(...known) : null, missingAge: known.length < ages.length };
}

export function evaluate(i) {
  const { game } = i, item = game.item(i.itemId), recipe = game.recipe(i.itemId);
  if (!item || !recipe) return { ok: false, error: 'No hay receta para este objeto en los datos del juego.' };
  const t = game.settings.taxes, setupPct = t.setup_fee_pct;
  const build = (premium, focus) => {
    const rr = rateFor(game, item, Object.assign({}, i, { focus }));
    const ctx = { game, item, recipe, taxPct: premium ? t.sales_tax_premium_pct : t.sales_tax_no_premium_pct, setupPct, rr };
    return { rr, taxPct: ctx.taxPct, instant: oneScenario(i, 'instant', ctx), order: oneScenario(i, 'order', ctx) };
  };
  const base = build(!!i.premium, !!i.focus);
  // Comparaciones: SOLO informativas. Nunca se usan para recomendar.
  const comparisons = {};
  if (!i.premium) comparisons.premium = build(true, !!i.focus);
  if (!i.focus && !isNum(i.manualRatePct)) comparisons.focus = build(!!i.premium, true);   // con retorno manual el Focus no cambia nada
  return { ok: true, item, recipe, base, comparisons };
}
