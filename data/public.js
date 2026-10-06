// Datos públicos de Albion Data Project (AODP). Respeta los límites de la API: consultas agrupadas, caché y espera ante 429.
import { fromPublic } from './merge.js?v=0.13';

const HOSTS = { americas: 'https://west.albion-online-data.com', europe: 'https://europe.albion-online-data.com', asia: 'https://east.albion-online-data.com' };
export const SERVERS = [['americas', 'Américas'], ['europe', 'Europa'], ['asia', 'Asia']];
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function makePublic(cfg, deps = {}) {
  const fetchFn = deps.fetch || ((...a) => fetch(...a)), now = deps.now || (() => Date.now());
  const cache = new Map(), TTL = 5 * 60000, MAX_URL = 3500;
  const server = cfg.server && HOSTS[cfg.server] ? cfg.server : 'americas';
  const base = (cfg.proxy || '').trim() ? cfg.proxy.trim().replace(/\/+$/, '') + '/' + server : HOSTS[server];
  const on = () => cfg.usePublic !== false;
  const stats = { requests: 0, cached: 0, errors: 0, lastError: null };

  const url = (ids, cities, qs) => base + '/api/v2/stats/prices/' + ids.join(',') + '?locations=' + cities.map(encodeURIComponent).join(',') + (qs && qs.length ? '&qualities=' + qs.join(',') : '');
  function chunk(ids, cities, qs) {                     // trozos que caben en la dirección
    const out = []; let cur = [];
    for (const id of ids) { if (cur.length && url(cur.concat(id), cities, qs).length > MAX_URL) { out.push(cur); cur = []; } cur.push(id); }
    if (cur.length) out.push(cur); return out;
  }
  async function one(u) {
    for (let attempt = 0; attempt < 3; attempt++) {
      stats.requests++;
      const r = await fetchFn(u);
      if (r.status === 429) { await sleep((deps.wait || 4000) * (attempt + 1)); continue; }
      if (!r.ok) throw new Error('AODP respondió ' + r.status);
      return r.json();
    }
    throw new Error('AODP pide esperar (límite de consultas). Vuelve a intentar en un momento.');
  }
  /** Devuelve filas en forma común. Si falla, devuelve lo que tenga y deja el error en stats (la app sigue con tus datos). */
  async function prices(ids, cities, qs) {
    if (!on()) return [];
    const q = qs && qs.length ? qs : [1], t = now(), out = [], need = [];
    for (const id of [...new Set(ids)]) {
      const hit = cache.get(id + '|' + cities.join(',') + '|' + q.join(','));
      if (hit && t - hit.t < TTL) { stats.cached++; out.push(...hit.rows); } else need.push(id);
    }
    const parts = chunk(need, cities, q); let i = 0;
    const worker = async () => {
      while (i < parts.length) {
        const part = parts[i++];
        try {
          const raw = await one(url(part, cities, q)), rows = raw.map(r => fromPublic(r, now()));
          for (const id of part) cache.set(id + '|' + cities.join(',') + '|' + q.join(','), { t: now(), rows: rows.filter(r => r.item_id === id) });
          out.push(...rows);
        } catch (e) { stats.errors++; stats.lastError = e && e.message === 'Failed to fetch' ? 'El navegador no pudo leer los datos públicos (red o CORS).' : (e && e.message) || String(e); }
      }
    };
    await Promise.all([worker(), worker()]);
    return out;
  }
  /** Historial del precio del oro (últimos `count` registros). Lanza error si la API no responde. */
  async function gold(count) {
    if (!on()) throw new Error('Los datos públicos están desactivados en Configuración.');
    try { return await one(base + '/api/v2/stats/gold?count=' + (count || 240)); }
    catch (e) { throw new Error(e && e.message === 'Failed to fetch' ? 'El navegador no pudo leer los datos públicos (red o CORS).' : (e && e.message) || String(e)); }
  }
  async function test() {
    stats.lastError = null;
    try { const raw = await one(url(['T4_BAG'], ['Caerleon'], [1])); return { ok: true, rows: raw.length }; }
    catch (e) { return { ok: false, error: e && e.message === 'Failed to fetch' ? 'El navegador no pudo leer los datos públicos (red o CORS). Prueba configurar un proxy.' : (e && e.message) || String(e) }; }
  }
  return { on, prices, gold, test, stats, host: base, chunk, _url: url };
}
