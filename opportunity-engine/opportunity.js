// Modelo unificado de oportunidad: flipping, fabricación, refinado y Mercado Negro producen el mismo objeto y compiten en un solo ranking.
import { confidence, divergenceValue } from './confidence.js?v=0.21';
const isNum = v => typeof v === 'number' && isFinite(v);
const r0 = v => isNum(v) ? Math.round(v) : null;
const fmt = n => Math.round(n).toLocaleString('es-CL');
export const TYPE_LABEL = { flipping: 'FLIPPING', crafting: 'CRAFTING', refining: 'REFINING', blackmarket: 'BLACK MARKET' };

function typeOf(o) {
  if (o.to === 'Black Market') return 'blackmarket';
  if (o.kind === 'craft') return o.isRefining ? 'refining' : 'crafting';
  return 'flipping';
}

/** Frase que explica por qué se recomienda (o por qué hay que desconfiar). Nada de caja negra. */
export function explain(op, ctx) {
  const parts = [], silver = ctx.silver || 0;
  if (silver > 0 && op.investment > 0) { const pct = op.investment / silver * 100; parts.push(pct <= 50 ? 'requiere solo el ' + Math.round(pct) + '% de tu capital' : 'usa el ' + Math.round(pct) + '% de tu capital'); }
  if (isNum(op.roi)) parts.push('tiene un ROI del ' + op.roi.toFixed(op.roi >= 100 ? 0 : 1).replace('.', ',') + '%');
  if (op.liquidity === 'SIN DATO') parts.push('no se pudo verificar la liquidez'); else parts.push('liquidez ' + op.liquidity.toLowerCase());
  if (isNum(op.minutes)) parts.push('toma unos ' + Math.round(op.minutes) + ' min (estimado)');
  if (isNum(op.dataAge)) parts.push('los precios se actualizaron hace ' + (op.dataAge < 1 ? 'menos de 1 min' : op.dataAge < 120 ? Math.round(op.dataAge) + ' min' : (op.dataAge / 60).toFixed(1).replace('.', ',') + ' h'));
  const head = parts.slice(0, -1).join(', '); let t = 'Te recomendamos esta operación porque ' + (head ? head + ' y ' : '') + parts[parts.length - 1] + '.';
  const warns = [];
  if (op.anomalies.length) warns.push(op.anomalies.map(a => a.text).join(' '));
  if (op.confidenceInfo.capped) warns.push('La confianza está limitada: ' + op.confidenceInfo.caps.map(c => c.replace(/^tope \d+%: /, '')).join(', ') + '.');
  if (op.confidenceInfo.level === 'BAJA') t = 'Cuidado: esta operación sale rentable en los números, pero con baja confianza. ' + t;
  return t + (warns.length ? ' ' + warns.join(' ') : '');
}

/**
 * o = oportunidad de flipping (finder) o de fabricación (craftscan) ya puntuada.  ctx = { silver, hours }
 * → objeto estándar: { type, item, cityBuy, citySell, investment, revenue, fees, taxes, profit, roi, profitPerHour, liquidity, risk, confidence, dataAge, explanation, ... }
 */
export function toOpportunity(o, ctx) {
  const isCraft = o.kind === 'craft', c = o.calc;
  const rb = o.rb && o.rb.buy, ra = o.ra && o.ra.sell;
  const sources = isCraft ? o.srcs : [o.buySrc, o.sellSrc];
  const conf = confidence({ oldestMin: o.oldest, depthKnown: o.depthKnown, hv: Object.assign({}, o.hv, { vsMedianPct: o.hv && o.hv.median && isNum(o.sellUnit) ? (o.sellUnit - o.hv.median) / o.hv.median * 100 : null }),
    liquidity: o.liquidity, sources, divergence: isCraft ? null : divergenceValue([rb, ra]), anomalies: o.anomalies || [] });
  const rows = isCraft
    ? [...c.lines.filter(l => (l.cost || 0) > 0).map(l => ({ label: 'Materiales: ' + l.item_id, qty: l.toBuy, value: -r0(l.cost), group: 'materials', id: l.item_id })), ...(c.craftingFee ? [{ label: 'Tarifa de estación', value: -r0(c.craftingFee), group: 'fees' }] : []),
       { label: 'Venta bruta ' + fmt(o.w.units) + ' × ' + fmt(o.unitPrice), value: r0(c.sale.gross), group: 'revenue' }, { label: 'Impuesto de venta', value: -r0(c.sale.tax), group: 'taxes' }]
    : [{ label: 'Comprar ' + fmt(o.w.units) + ' × ' + fmt(o.w.avgBuy) + ' en ' + o.from, value: -r0(o.w.cost), group: 'buy' }, { label: 'Venta bruta ' + fmt(o.w.units) + ' × ' + fmt(o.w.avgSell) + ' en ' + o.to, value: r0(o.w.gross), group: 'revenue' }, { label: 'Impuesto de venta', value: -r0(o.w.tax), group: 'taxes' }];
  const op = {
    type: typeOf(o), via: isCraft ? (o.isRefining ? 'refinar' : 'fabricar') : 'comprar y llevar', item: o.label, itemId: o.item_id, cityBuy: o.from, citySell: o.to,
    investment: r0(o.w.cost), revenue: r0(isCraft ? c.sale.gross : o.w.gross), fees: isCraft ? r0(c.craftingFee || 0) : 0, taxes: r0(isCraft ? c.sale.tax : o.w.tax), materials: isCraft ? r0(c.materialCost) : 0,
    profit: r0(o.w.profit), roi: o.w.roi, profitPerHour: isNum(o.sph) ? r0(o.sph) : null, minutes: o.minutes, units: o.w.units, liquidity: o.liquidity, risk: o.risk.level, riskInfo: o.risk,
    confidence: conf.pct, confidenceInfo: conf, score: o.opp.score, scoreInfo: o.opp, dataAge: o.oldest, depthKnown: o.depthKnown, anomalies: o.anomalies || [], sources: [...new Set(sources.filter(Boolean))],
    withFocus: !!o.withFocus, rows, hv: o.hv, raw: o, make: o.make
  };
  op.explanation = explain(op, ctx);
  return op;
}
