// Costo de encantar: runas (.1), almas (.2), reliquias (.3) y fragmentos avalonianos (.4).
// Los datos del juego que usa la app NO traen estos objetos ni cuántos se gastan por objeto: los IDs son editables y las cantidades las ingresas tú.
// Función pura. Sin precio o sin cantidad → costo desconocido (null); nada se inventa.
export const KINDS = [
  { level: 1, key: 'rune', label: 'Runa', short: 'Runa (.1)', perTier: true },
  { level: 2, key: 'soul', label: 'Alma', short: 'Alma (.2)', perTier: true },
  { level: 3, key: 'relic', label: 'Reliquia', short: 'Reliquia (.3)', perTier: true },
  { level: 4, key: 'shard', label: 'Fragmento avaloniano', short: 'Fragmento (.4)', perTier: false }
];
/** Nombres en el juego por tier (confirmados con capturas del mercado: iniciado T4, experto T5, maestro T6, gran maestro T7, anciano T8). */
export const TIER_NAME = { 4: 'iniciado', 5: 'experto', 6: 'maestro', 7: 'gran maestro', 8: 'anciano' };
export const kindName = (kind, tier) => kind.perTier ? kind.label + ' del ' + TIER_NAME[tier] : kind.label;
/** IDs de partida (convención del juego; no vienen de los datos del repo). Editables: si no devuelven precio, corrígelos. */
export const defaultId = (kind, tier) => kind.perTier ? 'T' + tier + '_' + kind.key.toUpperCase() : 'T4_SHARD_AVALONIAN';
export const slotKey = (kind, tier) => kind.perTier ? kind.key + tier : kind.key;

/** state = { ids:{slot:id}, prices:{slot:number}, qty:{categoría:{1..4}} } */
export function matIds(state, tier) { return KINDS.map(k => (state.ids && state.ids[slotKey(k, tier)]) || defaultId(k, tier)); }

/** costo por objeto de encantar al nivel L = cantidad × precio. → {1..4: número|null, detail:[{level,qty,price,cost,why}]} */
export function enchantCosts(state, tier, category) {
  const out = { detail: [] };
  for (const k of KINDS) {
    const price = +(state.prices && state.prices[slotKey(k, tier)]) || 0, qty = +(state.qty && state.qty[category] && state.qty[category][k.level]) || 0;
    const why = !qty ? 'falta la cantidad por objeto' : !price ? 'falta el precio' : null;
    out[k.level] = why ? null : Math.round(qty * price); out.detail.push({ level: k.level, kind: k, qty, price, cost: out[k.level], why });
  }
  return out;
}

/** Elige el precio de compra más barato y fresco entre ciudades. rows = filas v2 de src.prices */
export function cheapest(rows, maxAge = 1440) {
  let best = null;
  for (const r of rows) { const p = r.sell && r.sell.price; if (!(p > 0) || !(r.sell.age_min < maxAge)) continue; if (!best || p < best.price) best = { price: p, city: r.city, age: r.sell.age_min, src: r.sell.src }; }
  return best;
}
