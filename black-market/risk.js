// Riesgo de una operación de flipping (y en especial hacia el Mercado Negro). Fórmula visible: suma de puntos con motivos.
// No se asume que la venta al Mercado Negro esté garantizada. La distancia exacta entre ciudades no se modela.
import { RISK } from '../flipping/config.js?v=0.11';

const isNum = v => typeof v === 'number' && isFinite(v);
const pick = (table, v) => { const t = table.find(x => v >= x.min); return t ? t.pts : 0; };

/**
 * p = { cost, from, to, units, demand, roi, oldestMin, volatilityPct|null, historyPoints }
 * Devuelve { level: 'BAJO'|'MEDIO'|'ALTO', points, reasons: [texto, ...] }
 */
export function flipRisk(p) {
  const reasons = []; let pts = 0;
  const tp = pick(RISK.transported, p.cost || 0);
  if (tp) { pts += tp; reasons.push('+' + tp + ' · llevas ' + Math.round(p.cost).toLocaleString('es-CL') + ' silver en mercadería'); }
  if (RISK.openPvpZones.includes(p.to) || RISK.openPvpZones.includes(p.from)) { pts += 1; reasons.push('+1 · la ruta pasa por ' + (RISK.openPvpZones.includes(p.to) ? p.to : p.from) + ' (zona de PvP abierto; la distancia exacta no se modela)'); }
  if (p.depthKnown === false) { pts += 1; reasons.push('+1 · no se sabe cuántas unidades hay ni cuántas piden (el precio viene de datos públicos, que no traen cantidades)'); }
  else if (isNum(p.demand) && isNum(p.units) && p.units > 0 && p.demand < p.units * 1.5) { pts += 1; reasons.push('+1 · las órdenes de compra visibles apenas cubren lo que llevarías (' + p.demand + ' pedidas para ' + p.units + ' unidades)'); }
  if (isNum(p.roi) && p.roi < RISK.thinMarginPct) { pts += 1; reasons.push('+1 · margen estrecho (' + p.roi.toFixed(1).replace('.', ',') + '%): una baja pequeña de precio borra la ganancia'); }
  if (isNum(p.volatilityPct) && (p.historyPoints || 0) >= RISK.minHistoryPoints) {
    const v = pick(RISK.volatility, p.volatilityPct);
    if (v) { pts += v; reasons.push('+' + v + ' · el precio varió ' + p.volatilityPct.toFixed(0) + '% en tu historial'); }
  } else reasons.push('+0 · sin historial suficiente para medir la volatilidad');
  const ap = pick(RISK.age, p.oldestMin || 0);
  if (ap) { pts += ap; reasons.push('+' + ap + ' · el dato más viejo tiene ' + Math.round(p.oldestMin) + ' minutos'); }
  if (p.to === 'Black Market') reasons.push('+0 · el Mercado Negro puede llenar o bajar la orden antes de que llegues');
  const level = RISK.levels.find(x => pts >= x.min).level;
  return { level, points: pts, reasons };
}

/** Estadísticas de /v2/history para el destino: promedio, rango y cuánto se aleja el precio actual del promedio. */
export function historyView(h, currentPrice, side = 'buy') {
  const s = h && h[side];
  if (!s || !(s.n >= RISK.minHistoryPoints)) return { enough: false, points: s ? s.n : 0 };
  return { enough: true, points: s.n, avg: s.avg, median: s.median, min: s.min, max: s.max, volatilityPct: s.volatility_pct,
    vsAvgPct: isNum(currentPrice) && s.avg ? (currentPrice - s.avg) / s.avg * 100 : null, coveredDays: h.covered_days };
}
