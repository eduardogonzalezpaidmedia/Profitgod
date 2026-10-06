// Tablas de referencia armadas SOLO con datos verificados del repo (data/game/settings.json y cities.json, con fuente y fecha).
import { fromBonus } from '../refining/returnRate.js?v=0.10';

export function referenceTables(game) {
  const s = game.settings, pb = s.return_rate.production_bonus, t = s.taxes;
  const pct = x => (x * 100).toFixed(1).replace('.', ',') + ' %';
  const rrRows = [['Ciudad real, sin bono', pb.royal_city_base], ['Ciudad real + bono de crafteo', pb.royal_city_base + pb.city_crafting_specialization], ['Ciudad real + bono de refinado', pb.royal_city_base + pb.city_refining_specialization]]
    .flatMap(([n, b]) => [[n, b, fromBonus(b)], [n + ' + Focus', b + pb.focus, fromBonus(b + pb.focus)]]).map(([n, b, r]) => [n, '+' + b, pct(r)]);
  const taxes = [['Impuesto de venta sin Premium', t.sales_tax_no_premium_pct + ' %'], ['Impuesto de venta con Premium', t.sales_tax_premium_pct + ' %'], ['Costo de publicar una orden', t.setup_fee_pct + ' %'], ['Venta inmediata a una orden de compra (incluye Mercado Negro)', 'solo el impuesto de venta']];
  const cityRows = game.cities.filter(c => c.type === 'royal' || c.crafting_bonus || c.refining_bonus).map(c => {
    const cb = c.crafting_bonus || {}, rb = c.refining_bonus || {};
    return [c.id, cb.verified ? [...(cb.categories || []), ...(cb.subcategories || [])].map(x => game.stations[x] || x).join(', ') || '—' : 'sin dato verificado (ingresa el retorno a mano)', rb.verified ? (rb.stations || []).map(x => game.stations[x] || x).join(', ') || '—' : 'sin dato verificado'];
  });
  const sources = [...new Set([...(s.taxes.sources || []), ...(s.return_rate.sources || []), ...(s.focus.sources || []), ...(game.cities.length ? [] : [])].map(x => x.url))];
  return { rr: { head: ['Situación', 'Puntos de producción', 'Retorno de recursos'], rows: rrRows, note: 'retorno = bono / (100 + bono). Islas y refugios usan otras reglas: en la Calculadora usa el modo manual.' },
    taxes: { head: ['Concepto', 'Valor'], rows: taxes }, cities: { head: ['Ciudad', 'Bono de fabricación (verificado)', 'Bono de refinado'], rows: cityRows }, focus: s.focus.formula, sources };
}
