// Anomalías: avisos para no caer en precios raros. Nunca bloquean; explican por qué desconfiar.
import { ANOMALY } from '../opportunity-engine/config.js?v=0.10';
const isNum = v => typeof v === 'number' && isFinite(v);
const pc = n => Math.abs(n).toFixed(0) + '%';

/**
 * p = { price, hv:{enough,median}, ownPrice, pubPrice, roi, thresholdPct }
 * → [{ code, text }]
 */
export function findAnomalies(p) {
  const out = [], th = isNum(p.thresholdPct) && p.thresholdPct > 0 ? p.thresholdPct : ANOMALY.defaultPct;
  const hv = p.hv || {};
  if (hv.enough && isNum(hv.median) && hv.median > 0 && isNum(p.price)) {
    const d = (p.price - hv.median) / hv.median * 100;
    if (d >= th) out.push({ code: 'PICO', text: 'El precio de venta está ' + pc(d) + ' por encima de su mediana histórica: puede ser un pico que no dure.' });
    else if (d <= -th) out.push({ code: 'CAIDA', text: 'El precio de venta está ' + pc(d) + ' por debajo de su mediana histórica: el mercado puede haber bajado.' });
  }
  if (isNum(p.ownPrice) && isNum(p.pubPrice) && p.ownPrice > 0 && p.pubPrice > 0) {
    const d = Math.abs(p.ownPrice - p.pubPrice) / Math.min(p.ownPrice, p.pubPrice) * 100;
    if (d >= ANOMALY.divergencePct) out.push({ code: 'DIVERGE', text: 'Tus datos y los públicos difieren ' + pc(d) + ' en el precio de venta: uno de los dos puede estar desactualizado o mal leído.' });
  }
  if (isNum(p.roi) && p.roi >= ANOMALY.tooGoodRoiPct) out.push({ code: 'DEMASIADO_BUENO', text: 'Ganancia de ' + pc(p.roi) + ' sobre lo invertido: es poco común. Verifica en el juego antes de comprar.' });
  return out;
}
