// Confianza (0–100 %) de una oportunidad: qué tan sólido es el dato. Distinto del puntaje: algo muy rentable puede ser poco confiable.
// Componentes visibles y topes: datos viejos, sin cantidades o con avisos de anomalía nunca dan confianza alta.
import { CONF_WEIGHTS, CONF_CAPS, CONF_LEVELS, LIQ_VALUE } from './config.js?v=0.11';
const isNum = v => typeof v === 'number' && isFinite(v);
const clamp = v => Math.max(0, Math.min(1, v));

/** Diferencia entre tus datos y los públicos para un lado del precio: 1 si coinciden, 0,2 si difieren 25 % o más, 0,75 si solo hay una fuente. */
export function divergenceValue(sides) {
  const ds = (sides || []).filter(s => s && isNum(s.ownPrice) && isNum(s.pubPrice) && s.ownPrice > 0 && s.pubPrice > 0).map(s => Math.abs(s.ownPrice - s.pubPrice) / Math.min(s.ownPrice, s.pubPrice) * 100);
  if (!ds.length) return null;
  return clamp(1 - 0.8 * Math.max(...ds) / 25);
}

/**
 * p = { oldestMin, depthKnown, hv:{enough,vsMedianPct|vsAvgPct,volatilityPct}, liquidity, sources:['propio'|'público'], divergence:(0..1|null), anomalies:[] }
 * → { pct, level, icon, text, components:[{key,label,weight,value,points,note}], caps:[texto], capped }
 */
export function confidence(p) {
  const hv = p.hv || {}, an = p.anomalies || [], age = p.oldestMin;
  const fresh = !isNum(age) ? 0 : age < 5 ? 1 : age < 30 ? 0.9 : age < 120 ? 0.7 : age < 720 ? 0.4 : age < 1440 ? 0.15 : 0;
  const dev = isNum(hv.vsMedianPct) ? hv.vsMedianPct : hv.vsAvgPct;
  const srcs = (p.sources || []).filter(Boolean), own = srcs.filter(s => s === 'propio').length;
  const val = {
    fresh,
    quantity: p.depthKnown ? 1 : 0.3,
    history: hv.enough && isNum(dev) ? clamp(1 - Math.abs(dev) / 40) : 0.3,
    diff: isNum(p.divergence) ? p.divergence : 0.75,
    liquidity: p.liquidity in LIQ_VALUE && p.liquidity !== 'SIN DATO' ? Math.max(0.2, LIQ_VALUE[p.liquidity]) : 0.3,
    variability: hv.enough && isNum(hv.volatilityPct) ? clamp(1 - hv.volatilityPct / 50) : 0.4,
    source: !srcs.length ? 0.3 : own === srcs.length ? 1 : own === 0 ? 0.6 : 0.8,
    consistency: clamp(1 - 0.4 * an.length)
  };
  const note = { quantity: p.depthKnown ? null : 'cantidades no verificadas', history: hv.enough ? null : 'sin historial suficiente', diff: isNum(p.divergence) ? null : 'solo hay una fuente', variability: hv.enough ? null : 'sin historial suficiente', liquidity: p.liquidity === 'SIN DATO' ? 'sin cantidades de órdenes' : null };
  const components = CONF_WEIGHTS.map(c => ({ key: c.key, label: c.label, weight: c.w, value: val[c.key], points: c.w * val[c.key] * 100, note: note[c.key] || null }));
  let pct = components.reduce((s, c) => s + c.points, 0);
  const on = { age720: isNum(age) && age >= 720, age120: isNum(age) && age >= 120, noDepth: !p.depthKnown, spike: an.some(a => a.code === 'PICO' || a.code === 'DIVERGE') }, caps = [];
  for (const c of CONF_CAPS) if (on[c.when] && pct > c.max) { pct = c.max; caps.push('tope ' + c.max + '%: ' + c.why); }
  pct = Math.round(pct);
  const lv = CONF_LEVELS.find(x => pct >= x.min);
  return { pct, level: lv.level, icon: lv.icon, text: lv.text, components, caps, capped: caps.length > 0 };
}
