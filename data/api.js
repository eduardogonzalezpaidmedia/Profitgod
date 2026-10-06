// Acceso a tu base privada (rutas /v2 del Worker). La clave solo viaja a tu propio Worker.
export function makeApi(cfg) {
  const base = (cfg.url || '').trim().replace(/\/+$/, '');
  const on = () => !!(base && cfg.key);
  async function get(path, params) {
    if (!on()) throw new Error('Falta la dirección o la clave de tu base.');
    const u = new URL(base + path); Object.entries(params || {}).forEach(([k, v]) => v != null && v !== '' && u.searchParams.set(k, v));
    u.searchParams.set('key', cfg.key);
    const r = await fetch(u.toString()), j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
    return j;
  }
  return {
    on,
    freshness: () => get('/v2/freshness'),
    recent: (city, limit) => get('/v2/recent', { city, limit }),
    prices: (ids, cities, q) => get('/v2/prices', { ids: [].concat(ids).join(','), cities: [].concat(cities || []).join(','), q: [].concat(q || []).join(',') }),
    history: (id, city, q, days) => get('/v2/history', { id, city, q, days })
  };
}
