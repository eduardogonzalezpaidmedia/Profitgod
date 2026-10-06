// Historial del precio del oro (datos públicos de AODP: /api/v2/stats/gold). Función pura de análisis.
/** points: [{price, timestamp}] (en cualquier orden) → serie ordenada y estadísticas; null si no hay datos suficientes */
export function goldStats(points) {
  const s = (points || []).filter(p => p && isFinite(+p.price) && +p.price > 0 && p.timestamp).map(p => ({ price: +p.price, t: new Date(p.timestamp.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(p.timestamp) ? p.timestamp : p.timestamp + 'Z').getTime() })).filter(p => isFinite(p.t)).sort((a, b) => a.t - b.t);
  if (s.length < 2) return null;
  const prices = s.map(p => p.price), last = s[s.length - 1], first = s[0], sum = prices.reduce((a, b) => a + b, 0), sorted = [...prices].sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const min = sorted[0], max = sorted[sorted.length - 1], changePct = (last.price - first.price) / first.price * 100;
  const vsAvgPct = (last.price - sum / prices.length) / (sum / prices.length) * 100;
  return { series: s, n: s.length, last, first, min, max, avg: sum / prices.length, median, changePct, vsAvgPct, from: first.t, to: last.t,
    trend: Math.abs(changePct) < 1 ? 'ESTABLE' : changePct > 0 ? 'SUBE' : 'BAJA' };
}
