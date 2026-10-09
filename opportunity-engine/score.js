// Opportunity Score 0–100, transparente: cada componente va de 0 a 1, se muestra su valor y su aporte.
// Lo que no se puede saber (sin historial, sin cantidades) vale 0 y se declara: la incertidumbre baja el puntaje, no se supone.
import { WEIGHTS, FRESHNESS_MULT, RISK_MULT, LIQ_VALUE } from './config.js?v=0.20';
const isNum = v => typeof v === 'number' && isFinite(v);
const clamp = v => Math.max(0, Math.min(1, v));
const RISK_ORD = { BAJO: 0, MEDIO: 1, ALTO: 2 };
/** Encaje con tu perfil: cuánto de tu capital usa, si cabe en tu tiempo y si el riesgo es el que aceptas. */
export function fitValue(p) {
  let cap = 0.5, time = 0.5;
  if (p.silver > 0 && isNum(p.capital)) { const f = p.capital / p.silver; cap = f <= 0.6 ? 1 : clamp(1 - 0.7 * (f - 0.6) / 0.4); }       // hasta el 60 % de tu capital = 1; todo tu capital = 0,3
  if (p.hours > 0 && isNum(p.minutes)) { const b = p.hours * 60, m = p.minutes; time = m <= 0.5 * b ? 1 : m <= b ? 1 - 0.5 * (m - 0.5 * b) / (0.5 * b) : 0; }   // hasta la mitad de tu tiempo = 1; todo tu tiempo = 0,5; más = 0
  const acc = RISK_ORD[p.maxRisk] != null ? RISK_ORD[p.maxRisk] : 2, risk = (RISK_ORD[p.riskLevel] != null ? RISK_ORD[p.riskLevel] : 2) <= acc ? 1 : 0.3;
  return { value: 0.5 * cap + 0.3 * time + 0.2 * risk, cap, time, risk };
}

/**
 * p = { profit, roi, sph, bestSph, liquidity, demand, units, hv:{enough,vsAvgPct,volatilityPct}, riskLevel, oldestMin, capital, silver, steps }
 * Devuelve { score|null, components:[{key,label,weight,value|null,points,note}], freshMult, riskMult, reason }
 */
export function opportunityScore(p) {
  if (!isNum(p.oldestMin) || p.oldestMin >= 1440) return { score: null, components: [], reason: 'Datos de más de 24 horas: no se recomienda automáticamente.' };
  const hv = p.hv || {};
  const val = {
    sph: isNum(p.sph) && isNum(p.bestSph) && p.bestSph > 0 ? clamp(p.sph / p.bestSph) : null,
    profit: isNum(p.profit) && p.profit > 0 ? clamp(Math.log10(1 + p.profit) / 6) : 0,          // 1.000.000 de profit = 1
    roi: isNum(p.roi) ? clamp(p.roi / 50) : null,                                                // 50 % de ROI = 1
    liquidity: p.liquidity in LIQ_VALUE && p.liquidity !== 'SIN DATO' ? LIQ_VALUE[p.liquidity] : null,
    demand: isNum(p.demand) && isNum(p.units) && p.units > 0 ? clamp(p.demand / (p.units * 3)) : null,   // piden 3 veces lo que llevas = 1
    trend: hv.enough && isNum(hv.vsAvgPct) ? clamp(1 - Math.abs(hv.vsAvgPct) / 40) : null,
    volatility: hv.enough && isNum(hv.volatilityPct) ? clamp(1 - hv.volatilityPct / 50) : null,
    ease: clamp(1 - ((p.steps || 1) - 1) / 4),
    fit: fitValue(p).value
  };
  const note = { sph: 'tiempo estimado', demand: 'sin cantidades verificadas', trend: 'sin historial suficiente', volatility: 'sin historial suficiente', liquidity: 'sin cantidades de órdenes' };
  const components = WEIGHTS.map(c => { const v = val[c.key]; return { key: c.key, label: c.label, weight: c.w, value: v, points: v === null ? 0 : c.w * v * 100, note: v === null ? (note[c.key] || 'sin dato') : null }; });
  const raw = components.reduce((s, c) => s + c.points, 0);
  const fm = (FRESHNESS_MULT.find(x => p.oldestMin < x.max) || { m: 0.3 }).m, rm = RISK_MULT[p.riskLevel] != null ? RISK_MULT[p.riskLevel] : 0.5;
  return { score: Math.round(raw * fm * rm), raw: Math.round(raw), components, freshMult: fm, riskMult: rm, reason: null };
}

/** Puntúa una lista de oportunidades (flipping o fabricación; el «mejor silver/hora» sale de la misma lista). */
export function scoreAll(list, silver, prof = {}) {
  const best = Math.max(0, ...list.map(o => o.sph || 0));
  list.forEach(o => { o.opp = opportunityScore({ profit: o.w.profit, roi: o.w.roi, sph: o.sph, bestSph: best, liquidity: o.liquidity, demand: o.depthKnown ? o.demand : null, units: o.w.units,
    hv: o.hv, riskLevel: o.risk.level, oldestMin: o.oldest, capital: o.w.cost, silver, steps: o.steps || 2, minutes: o.minutes, hours: prof.hours, maxRisk: prof.maxRisk }); });
  return list;
}
