// Mezcla de fuentes: tus datos (captura propia) y los públicos de Albion Data Project (AODP).
// Regla: por cada precio (venta y compra por separado) se usa el MÁS RECIENTE; si empatan, el tuyo. Siempre se marca de cuál viene.
// Los datos públicos no traen cantidades ni órdenes: si un precio sale de ahí, la cantidad queda «desconocida».
const isNum = v => typeof v === 'number' && isFinite(v);
const ok = (p, a) => isNum(p) && p > 0 && isNum(a);

/** Fila de /v2/prices o /v2/market de tu base → forma común. */
export function fromOwn(r) {
  if (r.sell && typeof r.sell === 'object') return { item_id: r.item_id, city: r.city, quality: r.quality, sell_min: r.sell.price, sell_age: r.sell.age_min, sell_amount: r.sell.amount, sell_orders: r.sell.orders, buy_max: r.buy.price, buy_age: r.buy.age_min, buy_amount: r.buy.amount, buy_orders: r.buy.orders };
  return { item_id: r.item_id, city: r.city, quality: r.quality, sell_min: r.sell_min, sell_age: r.sell_age, sell_amount: r.sell_amount, sell_orders: r.sell_orders, buy_max: r.buy_max, buy_age: r.buy_age, buy_amount: r.buy_amount, buy_orders: r.buy_orders };
}
/** Fila de AODP (/api/v2/stats/prices) → forma común. Las fechas vienen en UTC sin «Z»; «0001-…» significa sin dato. */
export function fromPublic(r, nowMs) {
  const age = d => { if (!d || String(d).startsWith('0001')) return null; const t = Date.parse(String(d).endsWith('Z') ? d : d + 'Z'); return isFinite(t) ? Math.max(0, Math.round((nowMs - t) / 60000)) : null; };
  return { item_id: r.item_id, city: r.city, quality: r.quality, sell_min: r.sell_price_min, sell_age: age(r.sell_price_min_date), buy_max: r.buy_price_max, buy_age: age(r.buy_price_max_date) };
}

/** own y pub: listas en forma común. Devuelve filas con el origen de cada lado y, aparte, lo que dice cada fuente. */
export function mergeSources(own, pub) {
  const m = new Map(), key = r => r.item_id + '|' + r.city + '|' + r.quality;
  const slot = r => { const k = key(r); if (!m.has(k)) m.set(k, { item_id: r.item_id, city: r.city, quality: r.quality, own: null, pub: null }); return m.get(k); };
  for (const r of own || []) slot(r).own = r;
  for (const r of pub || []) slot(r).pub = r;
  const out = [];
  for (const s of m.values()) {
    const side = (priceKey, ageKey, amountKey, ordersKey) => {
      const o = s.own && ok(s.own[priceKey], s.own[ageKey]) ? s.own : null, p = s.pub && ok(s.pub[priceKey], s.pub[ageKey]) ? s.pub : null;
      let use = null, src = null;
      if (o && p) { use = o[ageKey] <= p[ageKey] ? o : p; src = use === o ? 'propio' : 'público'; }
      else if (o) { use = o; src = 'propio'; } else if (p) { use = p; src = 'público'; }
      return { price: use ? use[priceKey] : 0, age: use ? use[ageKey] : null, src,
        amount: src === 'propio' ? (o[amountKey] || 0) : null, orders: src === 'propio' ? (o[ordersKey] || 0) : null,
        ownPrice: o ? o[priceKey] : null, ownAge: o ? o[ageKey] : null, pubPrice: p ? p[priceKey] : null, pubAge: p ? p[ageKey] : null };
    };
    const sell = side('sell_min', 'sell_age', 'sell_amount', 'sell_orders'), buy = side('buy_max', 'buy_age', 'buy_amount', 'buy_orders');
    if (!sell.src && !buy.src) continue;
    out.push({ item_id: s.item_id, city: s.city, quality: s.quality, sell, buy });
  }
  return out;
}

/** Origen de una operación a partir de los lados que usó. */
export function sourceSummary(list) {
  const set = new Set(list.filter(Boolean)); if (!set.size) return null;
  return set.size === 1 ? [...set][0] : 'mixto';
}
