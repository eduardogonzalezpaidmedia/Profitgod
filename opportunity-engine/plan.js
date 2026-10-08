// «¿Qué hago hoy?»: arma un plan con las mejores oportunidades sin pasarse del silver (menos la reserva) ni del tiempo.
// Función pura. Cada oportunidad trae make(silverRestante, minutosRestantes) que la recalcula más pequeña si hace falta.
import { opportunityScore } from './score.js?v=0.17';
const isNum = v => typeof v === 'number' && isFinite(v);
const RISK_ORDER = { BAJO: 0, MEDIO: 1, ALTO: 2 };

/** p = { opps, silver, hours, reservePct, maxRisk:'BAJO'|'MEDIO'|'ALTO' } */
export function buildPlan(p) {
  const reserve = Math.round((p.silver || 0) * (p.reservePct || 0) / 100), budget = Math.max(0, (p.silver || 0) - reserve), minutesTotal = Math.round((p.hours || 0) * 60);
  const stats = { considered: 0, risk: 0, noScore: 0, noFit: 0 };
  const bestSph = Math.max(0, ...p.opps.map(o => o.sph || 0));
  const list = p.opps.filter(o => { stats.considered++; if (o.opp.score === null) { stats.noScore++; return false; } return true; })
    .sort((a, b) => (b.opp.score - a.opp.score) || ((b.sph || 0) - (a.sph || 0)));
  let silverLeft = budget, minutesLeft = minutesTotal, focusLeft = p.focus || 0; const steps = [], used = new Set();
  for (const o of list) {
    if (silverLeft <= 0 || minutesLeft <= 0) break;
    const key = o.kind + '|' + o.item_id + '|' + o.from; if (used.has(key)) continue;       // una sola vez por objeto y ciudad de origen
    const m = o.make(silverLeft, minutesLeft, focusLeft);
    if (!m || !(m.w.units > 0) || !(m.w.profit > 0) || m.w.cost > silverLeft + 0.5 || m.minutes > minutesLeft + 1e-9) { stats.noFit++; continue; }
    if (RISK_ORDER[m.risk.level] > RISK_ORDER[p.maxRisk]) { stats.risk++; continue; }      // el riesgo se mide con la cantidad que de verdad se haría
    used.add(key);
    const opp = isNum(m.oldest) && m.hv ? opportunityScore({ profit: m.w.profit, roi: m.w.roi, sph: m.sph, bestSph, liquidity: m.liquidity, demand: m.depthKnown ? m.demand : null, units: m.w.units, hv: m.hv, riskLevel: m.risk.level, oldestMin: m.oldest, capital: m.w.cost, silver: p.silver, steps: m.steps || 2, minutes: m.minutes, hours: p.hours, maxRisk: p.maxRisk }) : o.opp;
    steps.push(Object.assign({}, m, { opp, scaled: m.w.units < o.w.units }));
    silverLeft -= m.w.cost; minutesLeft -= m.minutes; focusLeft -= m.focusUsed || 0;
  }
  const totalProfit = steps.reduce((s, x) => s + x.w.profit, 0), totalCost = steps.reduce((s, x) => s + x.w.cost, 0), totalMinutes = steps.reduce((s, x) => s + x.minutes, 0);
  return { steps, totalProfit, totalCost, totalMinutes, sph: totalMinutes > 0 ? totalProfit / (totalMinutes / 60) : null, reserve, budget, silverLeft, minutesLeft, minutesTotal, stats };
}
