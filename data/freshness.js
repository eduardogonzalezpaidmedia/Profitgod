// Frescura de un dato según su antigüedad. Misma regla que worker/worker.js (hay una prueba que lo comprueba).
export function freshness(ageMs) {
  if (ageMs == null || !isFinite(ageMs)) return { level: 'SIN_DATO', label: 'Datos insuficientes', usable: false };
  const m = ageMs / 60000;
  if (m < 5) return { level: 'EXCELENTE', label: 'Excelente', usable: true };
  if (m < 30) return { level: 'BUENO', label: 'Bueno', usable: true };
  if (m < 120) return { level: 'ACEPTABLE', label: 'Aceptable', usable: true };
  if (m < 720) return { level: 'PRECAUCION', label: 'Precaución', usable: true };
  if (m < 1440) return { level: 'DESACTUALIZADO', label: 'Desactualizado', usable: true };
  return { level: 'NO_UTILIZAR', label: 'No usar para recomendaciones automáticas', usable: false };
}
export const FRESHNESS_COLORS = { EXCELENTE: 'var(--ok)', BUENO: 'var(--ok2)', ACEPTABLE: 'var(--warn2)', PRECAUCION: 'var(--warn)', DESACTUALIZADO: 'var(--bad)', NO_UTILIZAR: 'var(--bad)', SIN_DATO: 'var(--mute)' };
export function ageText(min) {
  if (min == null) return '—';
  if (min < 1) return 'ahora';
  if (min < 60) return min + ' min';
  if (min < 1440) return Math.floor(min / 60) + ' h' + (min % 60 ? ' ' + (min % 60) + ' min' : '');
  return Math.floor(min / 1440) + ' d' + (Math.floor((min % 1440) / 60) ? ' ' + Math.floor((min % 1440) / 60) + ' h' : '');
}
