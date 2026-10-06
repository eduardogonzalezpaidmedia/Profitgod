// Datos del juego (objetos, recetas, ciudades) y búsqueda. Los datos vienen de data/game/*.json (ver scripts/build-data.py).
export const QUALITIES = [{ q: 1, label: 'Normal' }, { q: 2, label: 'Buena' }, { q: 3, label: 'Notable' }, { q: 4, label: 'Sobresaliente' }, { q: 5, label: 'Obra maestra' }];
export const CATEGORY_LABEL = { weapons: 'Armas', armor: 'Armaduras', head: 'Cascos', shoes: 'Botas', offhands: 'Secundarias', capes: 'Capas', bags: 'Bolsos', potions: 'Pociones', food: 'Comida', refined: 'Refinado', tools: 'Herramientas', gatherer_gear: 'Equipo de recolector' };
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Arma el acceso a los datos a partir de los JSON ya leídos. */
export function makeGameData(raw) {
  const items = raw.items.rows.map(r => ({ item_id: r[0], name: r[1], tier: r[2], enchantment: r[3], category: r[4], subcategory: r[5], crafting_station: r[6], _norm: norm(r[1]) + ' ' + norm(r[0]) }));
  const byId = new Map(items.map(i => [i.item_id, i]));
  const recipes = new Map(raw.recipes.rows.map(r => [r[0], { product: r[0], quantity_produced: r[1], station: r[2], focus_base: r[3], materials: r[4].map(m => ({ item_id: m[0], quantity: m[1], returnable: !!m[2] })) }]));
  const mats = new Map(raw.materials.rows);
  const cities = raw.cities.locations;
  const cityById = new Map(cities.map(c => [c.id, c]));

  const name = id => (byId.get(id) || {}).name || mats.get(id) || id;
  const tierOf = id => { const m = /^T(\d)/.exec(id); return m ? +m[1] : null; };
  const enchOf = id => { const m = /@(\d)$/.exec(id); return m ? +m[1] : 0; };
  const label = id => { const t = tierOf(id); return name(id) + (t ? ' ' + t + '.' + enchOf(id) : ''); };

  /** Búsqueda por texto: «espada ancha 6.1», «t6.1 hacha». Solo objetos con receta. */
  function search(q, limit = 30) {
    const n = norm(q).trim(); if (!n) return [];
    let tier = null, ench = null, words = n;
    const te = /\bt?([2-8])(?:\.([0-4]))?\b/.exec(n);
    if (te) { tier = +te[1]; ench = te[2] !== undefined ? +te[2] : null; words = n.replace(te[0], ' '); }
    const ws = words.split(/\s+/).filter(Boolean), out = [];
    for (const it of items) {
      if (!recipes.has(it.item_id)) continue;
      if (tier !== null && it.tier !== tier) continue;
      if (ench !== null && it.enchantment !== ench) continue;
      if (ws.every(w => it._norm.includes(w))) { out.push(it); if (out.length >= limit) break; }
    }
    return out;
  }

  /** ¿La ciudad da bono para este objeto? Solo bonos verificados (Caerleon y Brecilien quedan manuales). */
  function bonusFor(it, cityId) {
    const c = cityById.get(cityId); if (!c || !it) return { kind: null, verified: false };
    if (it.category === 'refined') {
      const rb = c.refining_bonus || {};
      return { kind: rb.verified && (rb.stations || []).includes(it.crafting_station) ? 'refining' : null, verified: !!rb.verified, note: rb.note };
    }
    const cb = c.crafting_bonus || {};
    if (!cb.verified) return { kind: null, verified: false, note: cb.note };
    const hit = (cb.subcategories || []).includes(it.subcategory) || (cb.categories || []).includes(it.category);
    return { kind: hit ? 'crafting' : null, verified: true };
  }
  const bonusCity = it => { for (const c of cities) if (bonusFor(it, c.id).kind) return c.id; return null; };

  // índice: material → recetas que lo usan
  const usedInIdx = new Map();
  for (const r of recipes.values()) for (const m of r.materials) { if (!usedInIdx.has(m.item_id)) usedInIdx.set(m.item_id, []); usedInIdx.get(m.item_id).push(r.product); }
  /** Búsqueda de materiales y recursos (incluye lo refinado): «lingote t4», «mineral». */
  function searchMat(q, limit = 25) {
    const n = norm(q).trim(); if (!n) return [];
    let tier = null, words = n; const te = /\bt?([2-8])(?:\.([0-4]))?\b/.exec(n);
    if (te) { tier = +te[1]; words = n.replace(te[0], ' '); }
    const ws = words.split(/\s+/).filter(Boolean), out = [];
    for (const [id, nm] of mats) {
      if (!usedInIdx.has(id)) continue;
      if (tier !== null && tierOf(id) !== tier) continue;
      if (ws.every(w => (norm(nm) + ' ' + norm(id)).includes(w))) { out.push({ item_id: id, name: nm }); if (out.length >= limit) break; }
    }
    return out;
  }

  return { items, byId, recipes, cities, cityById, settings: raw.settings, stations: raw.stations, meta: raw.items.meta,
    usedIn: id => usedInIdx.get(id) || [], searchMat, item: id => byId.get(id) || null, recipe: id => recipes.get(id) || null, name, label, tierOf, enchOf, search, bonusFor, bonusCity,
    craftCities: () => cities.filter(c => c.type !== 'black_market').map(c => c.id), marketCities: () => cities.filter(c => c.market).map(c => c.id) };
}

/** En el navegador: lee los JSON con fetch. */
let _loading = null;
export function loadGameData(base = 'data/game/') {
  if (!_loading) _loading = _load(base).catch(e => { _loading = null; throw e; });
  return _loading;
}
async function _load(base) {
  const names = ['items', 'recipes', 'materials', 'cities', 'stations', 'settings'];
  const parts = await Promise.all(names.map(n => fetch(base + n + '.json?v=0.7').then(r => { if (!r.ok) throw new Error('No se pudo leer ' + n); return r.json(); })));
  const raw = {}; names.forEach((n, i) => raw[n] = parts[i]);
  return makeGameData(raw);
}
