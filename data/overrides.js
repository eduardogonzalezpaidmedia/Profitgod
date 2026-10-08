// Precios de materiales escritos a mano (o copiados de los datos en línea y editados). Valen para toda la app y se marcan como «manual».
// Solo guardan el precio de COMPRA (lo que pagas por el material). Se guardan en este dispositivo.
const KEY = 'profitgod.matprices';

export function makeOverrides(storage) {
  let data = {}; const load = () => { try { const j = JSON.parse(storage.getItem(KEY)); data = j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch (e) { data = {}; } };
  const save = () => { try { storage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* sin almacenamiento */ } };
  load();
  return {
    get: id => { const v = data[id]; return v && typeof v.price === 'number' && v.price > 0 ? v : null; },
    set(id, price, meta) { const p = Math.round(+price); if (!(p > 0)) { delete data[id]; } else data[id] = Object.assign({ price: p, by: 'manual', at: Date.now() }, meta || {}); save(); },
    remove(id) { delete data[id]; save(); },
    removeMany(ids) { ids.forEach(i => delete data[i]); save(); },
    clear() { data = {}; save(); },
    count: () => Object.keys(data).filter(k => data[k] && data[k].price > 0).length,
    ids: () => Object.keys(data).filter(k => data[k] && data[k].price > 0),
    reload: load
  };
}

/** Aplica los precios manuales a filas en forma /v2/prices (lado «sell» = lo que pagas). Crea la fila si no había datos de esa ciudad. */
export function applyToV2(rows, ov, ids, cities, qualities) {
  if (!ov || !ov.count()) return rows;
  const out = rows.map(r => { const o = ov.get(r.item_id); return o ? Object.assign({}, r, { sell: Object.assign({}, r.sell, { price: o.price, age_min: 0, freshness: { level: 'EXCELENTE', label: 'Manual' }, src: 'manual', orders: null, amount: null }) }) : r; });
  const have = new Set(out.map(r => r.item_id + '|' + r.city + '|' + r.quality));
  for (const id of new Set(ids)) { const o = ov.get(id); if (!o) continue; for (const c of cities) for (const q of qualities) { if (have.has(id + '|' + c + '|' + q)) continue;
    out.push({ item_id: id, city: c, quality: q, sell: { price: o.price, age_min: 0, t: null, freshness: { level: 'EXCELENTE', label: 'Manual' }, orders: null, amount: null, src: 'manual', ownPrice: null, ownAge: null, pubPrice: null, pubAge: null },
      buy: { price: 0, age_min: null, t: null, freshness: { level: 'SIN_DATO', label: 'Sin dato' }, orders: null, amount: null, src: null, ownPrice: null, ownAge: null, pubPrice: null, pubAge: null } }); } }
  return out;
}

/** Aplica los precios manuales a filas mezcladas (forma de mergeSources: sell/buy con price, age, src). Solo filas que ya existen. */
export function applyToMerged(rows, ov) {
  if (!ov || !ov.count()) return rows;
  return rows.map(r => { const o = ov.get(r.item_id); return o ? Object.assign({}, r, { sell: Object.assign({}, r.sell, { price: o.price, age: 0, src: 'manual', amount: null, orders: null }) }) : r; });
}
