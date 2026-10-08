// Bloques de explicación compartidos: puntaje con todos sus componentes, avisos y motivos del riesgo.
import { el } from './dom.js?v=0.15';
export function kv(t, label, val, cls) { const tr = el('tr'); tr.appendChild(el('td', '', label)); tr.appendChild(el('td', cls || '', val)); t.appendChild(tr); }
export function scoreBlock(b, o) {
  const sc = o.opp; b.appendChild(el('h2', '', 'Puntaje: ' + sc.score + ' / 100'));
  if (o.anomalies && o.anomalies.length) { const w = el('div', 'warn'); w.appendChild(el('b', '', '⚠ Avisos')); const ul = el('ul'); o.anomalies.forEach(a => ul.appendChild(el('li', '', a.text))); w.appendChild(ul); b.appendChild(w); }
  const t = el('table', 'bd'); sc.components.forEach(c => kv(t, c.label + ' (peso ' + Math.round(c.weight * 100) + '%)', c.value === null ? 'sin dato · ' + c.note : Math.round(c.value * 100) + '% → ' + c.points.toFixed(1).replace('.', ',') + ' pts'));
  kv(t, 'Suma de componentes', sc.raw + ' pts'); kv(t, '× frescura del dato más viejo', '× ' + String(sc.freshMult).replace('.', ',')); kv(t, '× riesgo ' + o.risk.level, '× ' + String(sc.riskMult).replace('.', ',')); kv(t, 'Puntaje final', sc.score + ' / 100'); b.appendChild(t);
  b.appendChild(el('p', 'hint', 'Lo que no se puede saber vale 0 puntos y se marca «sin dato»: la incertidumbre baja el puntaje, no se supone. El silver/hora usa tiempos estimados.'));
}
export function riskBlock(b, o) { const rk = el('div'); rk.appendChild(el('h2', '', 'Riesgo: ' + o.risk.level + ' (' + o.risk.points + ' puntos)')); const ul = el('ul'); o.risk.reasons.forEach(x => ul.appendChild(el('li', '', x))); rk.appendChild(ul); b.appendChild(rk); }
