// Herramientas: planificador de varios ítems (con Cocina y Alquimia), flips de encanto, historial del oro y tablas de referencia.
import { el, chip, field, select, input, num } from './dom.js?v=0.16';
import { loadGameData, CATEGORY_LABEL, QUALITIES } from '../crafting/recipes.js?v=0.16';
import { planCrafts, plannerIds } from '../tools/planner.js?v=0.16';
import { enchantFlips, enchantIds } from '../tools/enchant.js?v=0.16';
import { goldStats } from '../tools/gold.js?v=0.16';
import { KINDS, kindName, defaultId, slotKey, matIds, enchantCosts, cheapest } from '../tools/enchantcost.js?v=0.16';
import { priceCard, searchAny } from '../tools/pricecard.js?v=0.16';
import { potionRank, potionIds } from '../tools/potions.js?v=0.16';
import { referenceTables } from '../tools/reference.js?v=0.16';
import { freshness, ageText } from '../data/freshness.js?v=0.16';
import { fmt } from '../data/items.js?v=0.16';

const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
const SUBS = [['precio', '🔎 Precio'], ['plan', '🧮 Planificador'], ['ench', '✨ Encantar'], ['mats', '💎 Runas y almas'], ['pot', '🧪 Pociones'], ['gear', '🛡 Equipo'], ['oro', '🪙 Oro'], ['ref', '📚 Referencia']];
const PRESETS = [['', 'Todo'], ['food', '🍲 Cocina'], ['potion', '⚗️ Alquimia'], ['ore', 'Refinado (mineral)'], ['wood', 'Refinado (madera)'], ['fiber', 'Refinado (fibra)'], ['hide', 'Refinado (piel)'], ['rock', 'Refinado (piedra)']];

export function mountTools(root, ctx) {
  let game = null, built = false, sub = 'precio';
  const MK = 'profitgod.ench', MS = (() => { try { const j = JSON.parse(localStorage.getItem(MK)); return j && typeof j === 'object' ? j : {}; } catch (e) { return {}; } })();
  MS.ids = MS.ids || {}; MS.prices = MS.prices || {}; MS.qty = MS.qty || {}; MS.src = MS.src || {};
  const saveMS = () => { try { localStorage.setItem(MK, JSON.stringify(MS)); } catch (e) { /* sin almacenamiento */ } };
  const P = { items: [], buyCity: 'Lymhurst', craftCity: 'Lymhurst', saleCity: 'Caerleon', premium: false, focus: false, fee: '', station: '' }, E = { tier: 6, category: 'weapons', cost: { 1: '', 2: '', 3: '', 4: '' } }, ui = {};

  async function show(which) {
    if (which) sub = which;
    if (built) { drawSub(); return; }
    root.replaceChildren(el('p', 'hint', 'Cargando datos del juego…'));
    try { game = await loadGameData(); } catch (e) { root.replaceChildren(el('p', 'msg err', e.message)); return; }
    const cfg = ctx.getCfg(); P.craftCity = P.buyCity = cfg.city || 'Lymhurst'; P.premium = !!cfg.premium; P.focus = !!cfg.focus;
    built = true; root.replaceChildren();
    const bar = el('div', 'subtabs'); SUBS.forEach(([k, t]) => { const b = el('button', '', t); b.dataset.k = k; b.addEventListener('click', () => { sub = k; drawSub(); }); bar.appendChild(b); });
    ui.bar = bar; ui.body = el('div'); root.append(bar, ui.body); drawSub();
  }
  function drawSub() {
    ui.bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === sub)); ui.body.replaceChildren();
    ({ precio: drawPrice, plan: drawPlan, ench: drawEnch, mats: drawMats, pot: drawPot, gear: drawGear, oro: drawGold, ref: drawRef })[sub]();
  }
  const noSrc = () => !ctx.getSrc().usable();
  const errText = e => e && e.message && e.message.includes('Failed to fetch') ? 'No se pudo conectar con tu base.' : (e && e.message) || String(e);

  // ---------- Ficha de precio ----------
  function drawPrice() {
    const c = el('section', 'card'); c.appendChild(el('h2', '', 'Precio de un ítem'));
    c.appendChild(el('p', 'hint', 'Busca cualquier objeto o material y mira su precio en todas las ciudades y calidades. Cada dato dice si viene de tu base (propio) o de Albion Data Project (público) y qué tan viejo es. Es la misma lectura de precios que usan todas las pestañas.'));
    ui.pq = input('', onPriceSearch, { type: 'search', placeholder: 'Ej.: espada ancha 6.1, lingote t4, poción de curación', autocomplete: 'off' }); ui.pres = el('div', 'list pick'); c.append(ui.pq, ui.pres);
    ui.pOut = el('section', 'card'); ui.pOut.hidden = true; ui.body.append(c, ui.pOut);
    if (P.priceId) loadPrice(P.priceId);
  }
  function onPriceSearch() {
    ui.pres.replaceChildren(); const q = ui.pq.value.trim(); if (!q) return; const r = searchAny(game, q, 20);
    if (!r.length) ui.pres.appendChild(el('p', 'hint', 'No encontré ese ítem. Prueba otra palabra o el tier (ej.: t5.1).'));
    r.forEach(it => { const row = el('div', 'it'), l = el('div'); l.appendChild(el('div', 'nm', it.name)); l.appendChild(el('div', 'sub', it.item_id)); row.appendChild(l); row.addEventListener('click', () => { ui.pres.replaceChildren(); ui.pq.value = ''; loadPrice(it.item_id); }); ui.pres.appendChild(row); });
  }
  async function loadPrice(id) {
    P.priceId = id; const o = ui.pOut; o.hidden = false; o.replaceChildren(el('h2', '', game.label(id)), el('p', 'hint', 'Leyendo precios…'));
    if (noSrc()) { o.replaceChildren(el('h2', '', game.label(id)), el('p', 'msg err', 'Conecta tu base o activa los datos públicos en Configuración.')); return; }
    try {
      const cities = game.marketCities(), qs = QUALITIES.map(x => x.q), r = await ctx.getSrc().prices([id], cities, qs), map = new Map(r.rows.map(x => [x.city + '|' + x.quality, x]));
      const errs = [...new Set([r.ownError && 'Tu base: ' + r.ownError, r.pubError && 'Datos públicos: ' + r.pubError].filter(Boolean))], card = priceCard({ game, id, cities, qualities: qs, premium: !!ctx.getCfg().premium, market: (c, i, q) => map.get(c + '|' + q) || null });
      o.replaceChildren(el('h2', '', game.label(id)), el('p', 'hint', id)); if (errs.length) o.appendChild(el('p', 'msg err', errs.join(' · ')));
      const shown = card.byQ.filter(x => x.withData); if (!shown.length) o.appendChild(el('div', 'warn', 'Datos insuficientes: ni tu base ni los datos públicos tienen precios de este ítem.'));
      shown.forEach(x => {
        o.appendChild(el('h3', '', 'Calidad ' + QUALITIES.find(z => z.q === x.quality).label));
        const t = el('table'), hr = el('tr'); ['Ciudad', 'Venta (más barata)', 'Compra (más alta)', 'Dato'].forEach(h => hr.appendChild(el('th', '', h))); t.appendChild(hr);
        x.rows.filter(w => w.sell !== null || w.buy !== null).forEach(w => { const tr = el('tr'); tr.appendChild(el('td', '', w.city));
          const cell = (v, age, src) => { const d = el('td'); d.appendChild(document.createTextNode(v === null ? '—' : fmt(v))); if (v !== null) d.appendChild(el('div', 'sub', (src || '') + ' · ' + ageText(age))); return d; };
          tr.appendChild(cell(w.sell, w.sellAge, w.sellSrc)); tr.appendChild(cell(w.buy, w.buyAge, w.buySrc)); const c = el('td'); const age = Math.min(...[w.sellAge, w.buyAge].filter(a => a != null)); if (isFinite(age)) c.appendChild(chip(freshness(age * 60000))); tr.appendChild(c); t.appendChild(tr); });
        const wr = el('div', 'tablewrap'); wr.appendChild(t); o.appendChild(wr);
        o.appendChild(el('p', 'hint', (x.bestBuy ? 'Más barato para comprar: ' + x.bestBuy.city + ' (' + fmt(x.bestBuy.price) + '). ' : '') + (x.bestSell ? 'Mejor para vender al instante: ' + x.bestSell.city + ' (' + fmt(x.bestSell.price) + '). ' : '') + (x.margin !== null ? 'Diferencia neta (con impuesto ' + card.taxPct + ' %): ' + (x.margin >= 0 ? '+' : '') + fmt(x.margin) + ' por unidad, sin transporte.' : 'Solo se comparan datos de menos de 24 h.')));
      });
      o.appendChild(el('p', 'hint', 'Esta lectura se comparte con las demás pestañas durante 3 minutos.')); const b = el('button', '', 'Actualizar ahora'); b.addEventListener('click', () => { ctx.getSrc().clear(); loadPrice(id); }); o.appendChild(b);
    } catch (e) { o.replaceChildren(el('h2', '', game.label(id)), el('p', 'msg err', errText(e))); }
  }

  // ---------- Planificador ----------
  function drawPlan() {
    const c = el('section', 'card'); c.appendChild(el('h2', '', 'Planificador de fabricación'));
    c.appendChild(el('p', 'hint', 'Elige varios ítems y cuántas unidades quieres de cada uno. Te entrega la lista total de materiales a comprar, el costo, la venta y la ganancia. Con el filtro «Cocina» o «Alquimia» buscas comida y pociones; los refinados también están.'));
    ui.pst = select(PRESETS, P.station, () => { P.station = ui.pst.value; onSearch(); });
    ui.q = input('', onSearch, { type: 'search', placeholder: 'Ej.: espada ancha 6.1, poción de curación, estofado', autocomplete: 'off' });
    ui.res = el('div', 'list pick'); ui.sel = el('div', 'holds'); c.append(field('Tipo', ui.pst), ui.q, ui.res, ui.sel);
    const cities = game.marketCities(), g = el('div', 'grid');
    const sCity = (k, opts) => select(opts.map(x => [x, x]), P[k], e => { P[k] = e.target.value; });
    g.append(field('Compro los materiales en', sCity('buyCity', cities.filter(x => x !== 'Black Market'))), field('Fabrico en', sCity('craftCity', game.craftCities())), field('Vendo en', sCity('saleCity', cities)),
      field('Premium', select([['0', 'NO'], ['1', 'SÍ']], P.premium ? '1' : '0', e => { P.premium = e.target.value === '1'; })), field('Focus', select([['0', 'Sin Focus'], ['1', 'Con Focus']], P.focus ? '1' : '0', e => { P.focus = e.target.value === '1'; })),
      field('Tarifa de estación por fabricación', input(P.fee, e => { P.fee = e.target.value; }, { inputMode: 'numeric', placeholder: '0' })));
    ui.go = el('button', 'primary', 'Calcular plan'); ui.go.addEventListener('click', runPlan); ui.msg = el('span', 'msg'); const row = el('div', 'row'); row.append(ui.go, ui.msg);
    c.append(g, row); ui.out = el('section', 'card'); ui.out.hidden = true; ui.body.append(c, ui.out); drawSel();
  }
  function onSearch() {
    ui.res.replaceChildren(); const q = ui.q.value.trim(); if (!q && !P.station) return;
    let r = q ? game.search(q, 200) : game.items.filter(i => game.recipes.has(i.item_id)).slice(0, 400);
    if (P.station) r = r.filter(i => i.crafting_station === P.station);
    r = r.slice(0, 25); if (!r.length) ui.res.appendChild(el('p', 'hint', 'No encontré ese ítem. Prueba otra palabra o el tier (ej.: t5.1).'));
    r.forEach(it => { const row = el('div', 'it'), l = el('div'); l.appendChild(el('div', 'nm', game.label(it.item_id))); l.appendChild(el('div', 'sub', it.item_id + ' · ' + (game.stations[it.crafting_station] || it.crafting_station || '')));
      row.appendChild(l); row.addEventListener('click', () => { if (!P.items.some(x => x.id === it.item_id)) P.items.push({ id: it.item_id, qty: '1' }); ui.res.replaceChildren(); ui.q.value = ''; drawSel(); }); ui.res.appendChild(row); });
  }
  function drawSel() {
    ui.sel.replaceChildren(); if (!P.items.length) { ui.sel.appendChild(el('p', 'hint', 'Todavía no agregaste ítems.')); return; }
    P.items.forEach((h, i) => { const r = el('div', 'hold'), l = el('div'); l.appendChild(el('div', 'nm', game.label(h.id))); l.appendChild(el('div', 'sub', 'unidades a obtener'));
      const q = input(h.qty, () => { h.qty = String(num(q.value)); }, { inputMode: 'numeric', placeholder: 'cantidad' });
      const x = el('button', '', '✕'); x.title = 'Quitar'; x.addEventListener('click', () => { P.items.splice(i, 1); drawSel(); }); r.append(l, q, x); ui.sel.appendChild(r); });
  }
  async function readMarket(ids, cities) {
    const api = ctx.getSrc(), map = new Map(), errs = [];
    for (let i = 0; i < ids.length; i += 100) {
      const r = await api.prices(ids.slice(i, i + 100), cities, [1]); if (r.ownError) errs.push('Tu base: ' + r.ownError); if (r.pubError) errs.push('Datos públicos: ' + r.pubError);
      r.rows.forEach(x => map.set(x.city + '|' + x.item_id, { sell_min: x.sell.price, buy_max: x.buy.price, sellAge: x.sell.age_min, buyAge: x.buy.age_min, sellSrc: x.sell.src, buySrc: x.buy.src }));
    }
    return { map, errs: [...new Set(errs)] };
  }
  async function runPlan() {
    const items = P.items.map(h => ({ id: h.id, qty: +h.qty || 0 })).filter(h => h.qty > 0);
    if (!items.length) { ui.msg.className = 'msg err'; ui.msg.textContent = 'Agrega ítems y escribe cuántas unidades quieres.'; return; }
    if (noSrc()) { ui.msg.className = 'msg err'; ui.msg.textContent = 'Conecta tu base o activa los datos públicos en Configuración.'; return; }
    ui.go.disabled = true; ui.msg.className = 'msg'; ui.msg.textContent = 'Leyendo precios…';
    try {
      const { map, errs } = await readMarket(plannerIds(game, items), [...new Set([P.buyCity, P.saleCity])]);
      const r = planCrafts({ game, items, craftCity: P.craftCity, buyCity: P.buyCity, saleCity: P.saleCity, premium: P.premium, focus: P.focus, feePerCraft: num(P.fee), market: (c, id) => map.get(c + '|' + id) || null });
      ui.msg.className = errs.length ? 'msg err' : 'msg'; ui.msg.textContent = errs.join(' · '); drawPlanOut(r);
    } catch (e) { ui.msg.className = 'msg err'; ui.msg.textContent = errText(e); }
    ui.go.disabled = false;
  }
  function drawPlanOut(r) {
    const o = ui.out; o.hidden = false; o.replaceChildren(el('h2', '', 'Plan'));
    const T = r.totals, box = el('div', 'res'); box.appendChild(el('span', 'hint', 'GANANCIA ESTIMADA'));
    box.appendChild(el('div', 'big ' + (T.profit >= 0 ? 'pos' : 'neg'), fmt(T.profit) + ' silver')); box.appendChild(el('div', 'hint', 'Inversión ' + fmt(T.invest) + ' · Venta neta ' + fmt(T.revenue) + (T.roi !== null ? ' · ROI ' + (T.roi * 100).toFixed(1).replace('.', ',') + ' %' : '') + (T.source ? ' · fuente: ' + T.source : ''))); o.appendChild(box);
    if (T.incomplete) o.appendChild(el('div', 'warn', T.incomplete + ' ítem(s) sin datos completos: no suman al total (mira el aviso en cada uno).'));
    o.appendChild(el('div', 'warn', 'Materiales comprados al instante y producto vendido al instante a la orden de compra, solo con impuesto. Sin transporte ni tiempo. Premium: ' + (P.premium ? 'sí' : 'no') + ', Focus: ' + (P.focus ? 'sí' : 'no') + '.'));
    o.appendChild(el('h3', '', 'Lista de compra (total)'));
    const t = el('table'), hr = el('tr'); ['Material', 'Cantidad', 'Precio', 'Costo'].forEach(x => hr.appendChild(el('th', '', x))); t.appendChild(hr);
    r.shopping.forEach(s => { const tr = el('tr'); tr.appendChild(el('td', '', game.label(s.id))); tr.appendChild(el('td', '', fmt(s.qty))); tr.appendChild(el('td', '', s.unit === null ? 'Sin dato' : fmt(s.unit))); tr.appendChild(el('td', '', s.missing ? 'Sin dato' : fmt(s.cost))); t.appendChild(tr); });
    let w = el('div', 'tablewrap'); w.appendChild(t); o.appendChild(w);
    o.appendChild(el('h3', '', 'Por ítem'));
    const t2 = el('table'), h2 = el('tr'); ['Ítem', 'Unid.', 'Retorno', 'Ganancia', 'Dato'].forEach(x => h2.appendChild(el('th', '', x))); t2.appendChild(h2);
    r.lines.forEach(l => { const tr = el('tr'), a = el('td'); a.appendChild(document.createTextNode(l.label)); l.issues.forEach(i => a.appendChild(el('div', 'sub neg', '⚠ ' + i)));
      tr.appendChild(a); tr.appendChild(el('td', '', l.made ? fmt(l.made) : fmt(l.qty))); tr.appendChild(el('td', '', l.rate === null ? '—' : (l.rate * 100).toFixed(1).replace('.', ',') + ' %' + (l.bonus ? ' ★' : '')));
      const p = l.batch && l.batch.ok ? l.batch.profit : null; tr.appendChild(el('td', p !== null && p < 0 ? 'neg' : '', p === null ? 'Sin dato' : fmt(p)));
      const c = el('td'); if (l.age != null) c.appendChild(chip(freshness(l.age * 60000))); tr.appendChild(c); t2.appendChild(tr); });
    w = el('div', 'tablewrap'); w.appendChild(t2); o.appendChild(w); o.appendChild(el('p', 'hint', '★ = la ciudad da bono de fabricación para ese ítem. Si el ítem tiene aviso de datos viejos (más de 24 h) o falta un precio, no entra en el total.'));
    o.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Encantar ----------
  function drawEnch() {
    const c = el('section', 'card'); c.appendChild(el('h2', '', 'Flips de encanto'));
    c.appendChild(el('p', 'hint', 'Compra un objeto sin encantar (o con un encanto menor) y véndelo con un encanto más. La app compara los precios reales de cada nivel. El costo del material de encanto (runas, almas, reliquias) no está en los datos del juego que usa la app: ingrésalo tú por objeto. Con 0, la ganancia es BRUTA.'));
    const cats = [...new Set(game.items.filter(i => i.enchantment === 1).map(i => i.category))].filter(k => ['weapons', 'armor', 'head', 'shoes', 'offhands', 'capes', 'bags'].includes(k));
    ui.eCat = select(cats.map(k => [k, CATEGORY_LABEL[k] || k]), E.category, () => { E.category = ui.eCat.value; });
    ui.eTier = select([4, 5, 6, 7, 8].map(x => [x, 'T' + x]), E.tier, () => { E.tier = +ui.eTier.value; });
    const g = el('div', 'grid'); g.append(field('Categoría', ui.eCat), field('Tier', ui.eTier));
    const auto = enchantCosts(MS, E.tier, E.category), upd = () => { const a = enchantCosts(MS, E.tier, E.category); [1, 2, 3, 4].forEach(l => { ui.eCostIn[l].placeholder = a[l] != null ? 'auto: ' + fmt(a[l]) : '0'; }); };
    ui.eCat.addEventListener('change', upd); ui.eTier.addEventListener('change', upd); ui.eCostIn = {};
    [1, 2, 3, 4].forEach(l => { ui.eCostIn[l] = input(E.cost[l], e => { E.cost[l] = e.target.value; }, { inputMode: 'numeric', placeholder: auto[l] != null ? 'auto: ' + fmt(auto[l]) : '0' }); g.appendChild(field('Costo de encantar a .' + l + ' (por objeto)', ui.eCostIn[l])); });
    c.appendChild(el('p', 'hint', 'Déjalo vacío para usar el costo automático de «💎 Runas y almas» (cantidad × precio). Si escribes un número, manda el tuyo.'));
    ui.eGo = el('button', 'primary', 'Buscar flips'); ui.eGo.addEventListener('click', runEnch); ui.eMsg = el('span', 'msg'); const row = el('div', 'row'); row.append(ui.eGo, ui.eMsg);
    c.append(g, row); ui.eOut = el('section', 'card'); ui.eOut.hidden = true; ui.body.append(c, ui.eOut);
  }
  async function runEnch() {
    if (noSrc()) { ui.eMsg.className = 'msg err'; ui.eMsg.textContent = 'Conecta tu base o activa los datos públicos en Configuración.'; return; }
    const cfg = ctx.getCfg(), ids = enchantIds(game, { tier: E.tier, category: E.category }), cities = game.marketCities().filter(x => x !== 'Black Market');
    ui.eGo.disabled = true; ui.eMsg.className = 'msg'; ui.eMsg.textContent = 'Leyendo ' + fmt(ids.length) + ' precios en ' + cities.length + ' ciudades…';
    try {
      const { map, errs } = await readMarket(ids, cities);
      const a = enchantCosts(MS, E.tier, E.category), cost = {}, how = {}; [1, 2, 3, 4].forEach(l => { const m = num(E.cost[l]); cost[l] = m || a[l] || 0; how[l] = m ? 'manual' : a[l] ? 'automático' : 'sin costo'; }); E.how = how;
      const r = enchantFlips({ game, ids, buyCities: cities, saleCities: cities, premium: !!cfg.premium, enchantCost: cost, market: (c, id) => map.get(c + '|' + id) || null });
      ui.eMsg.className = errs.length ? 'msg err' : 'msg'; ui.eMsg.textContent = errs.join(' · '); drawEnchOut(r, cost);
    } catch (e) { ui.eMsg.className = 'msg err'; ui.eMsg.textContent = errText(e); }
    ui.eGo.disabled = false;
  }
  function drawEnchOut(r, cost) {
    const o = ui.eOut; o.hidden = false; o.replaceChildren(el('h2', '', 'Resultado'));
    const anyCost = Object.values(cost).some(v => v > 0); if (anyCost && E.how) o.appendChild(el('p', 'hint', 'Costo de encantar usado: ' + [1, 2, 3, 4].map(l => '.' + l + ' ' + (cost[l] > 0 ? fmt(cost[l]) + ' (' + E.how[l] + ')' : 'sin costo')).join(' · ')));
    if (!anyCost) o.appendChild(el('div', 'warn', 'No ingresaste costo de encantamiento: las ganancias son BRUTAS (no restan runas, almas ni reliquias). Ingrésalo arriba para ver la ganancia real.'));
    if (!r.out.length) o.appendChild(el('div', 'warn', 'Datos insuficientes: no hay pares de precios frescos (menos de 24 h) para este tier y categoría.'));
    const t = el('table'), hr = el('tr'); ['Objeto', 'Compra', 'Venta', 'Ganancia', 'ROI', 'Dato'].forEach(x => hr.appendChild(el('th', '', x))); t.appendChild(hr);
    r.out.slice(0, 25).forEach(f => { const tr = el('tr'), a = el('td'); a.appendChild(document.createTextNode(f.label)); a.appendChild(el('div', 'sub', 'desde ' + f.fromLabel + (f.costKnown ? '' : ' · ganancia bruta') + ' · fuente: ' + [...new Set(f.sources.filter(Boolean))].join('/')));
      tr.appendChild(a); const b = el('td'); b.appendChild(document.createTextNode(fmt(f.buy.price))); b.appendChild(el('div', 'sub', f.buy.city)); tr.appendChild(b);
      const s = el('td'); s.appendChild(document.createTextNode(fmt(f.sell.price))); s.appendChild(el('div', 'sub', f.sell.city + ' · imp. ' + fmt(f.tax))); tr.appendChild(s);
      tr.appendChild(el('td', f.profit < 0 ? 'neg' : 'pos', fmt(f.profit))); tr.appendChild(el('td', '', f.roi === null ? '—' : (f.roi * 100).toFixed(1).replace('.', ',') + ' %'));
      const c = el('td'); c.appendChild(chip(freshness(f.oldest * 60000))); tr.appendChild(c); t.appendChild(tr); });
    const w = el('div', 'tablewrap'); w.appendChild(t); o.appendChild(w);
    o.appendChild(el('p', 'hint', fmt(r.stats.pairs) + ' pares revisados: ' + fmt(r.out.length) + ' con datos frescos, ' + fmt(r.stats.noData) + ' sin precio, ' + fmt(r.stats.tooOld) + ' con datos de más de 24 h. Compras al instante (orden de venta más barata) y vendes al instante a la orden de compra más alta, con impuesto ' + r.taxPct + ' %. Sin transporte ni tiempo.'));
  }

  // ---------- Runas, almas y reliquias ----------
  const ENCH_CATS = [['weapons', 'Armas'], ['armor', 'Armaduras'], ['head', 'Cascos'], ['shoes', 'Botas'], ['offhands', 'Secundarias'], ['capes', 'Capas'], ['bags', 'Bolsos']];
  function drawMats() {
    const c = el('section', 'card'); c.appendChild(el('h2', '', 'Runas, almas y reliquias'));
    c.appendChild(el('p', 'hint', 'Ingresa el precio de cada material de encanto, o léelo de tu base / datos públicos. Con la cantidad que se gasta por objeto, la app calcula sola el costo de encantar y lo usa en «✨ Encantar». Los IDs vienen de la convención del juego (no de los datos del repo): si un material sale «sin dato», corrige su ID. Las cantidades por objeto no están en los datos de la app: las ingresas tú.'));
    ui.mCity = select([['', 'La ciudad más barata (datos de menos de 24 h)']].concat(game.marketCities().filter(x => x !== 'Black Market').map(x => [x, x])), MS.city || '', () => { MS.city = ui.mCity.value; saveMS(); });
    ui.mRead = el('button', 'primary', 'Leer precios de mi base'); ui.mMsg = el('span', 'msg'); ui.mRead.addEventListener('click', readMats); const row = el('div', 'row'); row.append(field('Ciudad', ui.mCity), ui.mRead, ui.mMsg); c.appendChild(row);
    ui.mTier = select([4, 5, 6, 7, 8].map(x => [x, 'T' + x]), String(MS.tier || E.tier), () => { MS.tier = +ui.mTier.value; saveMS(); drawMatsTable(); }); c.appendChild(field('Tier', ui.mTier));
    ui.mTable = el('div'); c.appendChild(ui.mTable);
    const d = el('details'); d.appendChild(el('summary', '', 'Cantidad que se gasta por objeto (según el tipo de objeto)'));
    d.appendChild(el('p', 'hint', 'Cuántas runas (.1), almas (.2), reliquias (.3) o fragmentos (.4) gasta cada objeto al encantarlo. Míralo en el juego, en la ventana de encantamiento. Déjalo vacío si no lo sabes: el costo quedará como «falta la cantidad».'));
    const t = el('table'), hr = el('tr'); ['Tipo', '→ .1 Runa', '→ .2 Alma', '→ .3 Reliquia', '→ .4 Fragmento'].forEach(x => hr.appendChild(el('th', '', x))); t.appendChild(hr);
    ENCH_CATS.forEach(([k, n]) => { const tr = el('tr'); tr.appendChild(el('td', '', n)); [1, 2, 3, 4].forEach(l => { const td = el('td'), i = input(MS.qty[k] && MS.qty[k][l] ? String(MS.qty[k][l]) : '', () => { MS.qty[k] = MS.qty[k] || {}; MS.qty[k][l] = num(i.value); saveMS(); drawMatsCost(); }, { inputMode: 'numeric', placeholder: '—' }); i.style.width = '72px'; td.appendChild(i); tr.appendChild(td); }); t.appendChild(tr); });
    const w = el('div', 'tablewrap'); w.appendChild(t); d.appendChild(w); c.appendChild(d);
    ui.mCost = el('div'); c.appendChild(ui.mCost); ui.body.appendChild(c); drawMatsTable(); drawMatsCost();
  }
  const mTier = () => +(ui.mTier ? ui.mTier.value : (MS.tier || E.tier));
  function drawMatsTable() {
    const tier = mTier(); ui.mTable.replaceChildren(); const t = el('table'), hr = el('tr'); ['Material', 'ID', 'Precio', 'Origen'].forEach(x => hr.appendChild(el('th', '', x))); t.appendChild(hr);
    KINDS.forEach(k => { const slot = slotKey(k, tier), tr = el('tr'); tr.appendChild(el('td', '', kindName(k, tier) + ' (.' + k.level + (k.perTier ? ' · T' + tier : '') + ')'));
      const idI = input(MS.ids[slot] || defaultId(k, tier), () => { MS.ids[slot] = idI.value.trim(); saveMS(); }, { autocomplete: 'off' }); idI.style.minWidth = '150px'; const a = el('td'); a.appendChild(idI); tr.appendChild(a);
      const prI = input(MS.prices[slot] ? fmt(MS.prices[slot]) : '', () => { MS.prices[slot] = num(prI.value); MS.src[slot] = { by: 'manual' }; saveMS(); org.textContent = 'manual'; drawMatsCost(); }, { inputMode: 'numeric', placeholder: 'silver' }); prI.style.width = '110px'; const b = el('td'); b.appendChild(prI); tr.appendChild(b);
      const org = el('td', 'sub', srcText(MS.src[slot])); tr.appendChild(org); t.appendChild(tr); });
    const w = el('div', 'tablewrap'); w.appendChild(t); ui.mTable.appendChild(w);
  }
  const srcText = s => !s ? '—' : s.by === 'manual' ? 'manual' : (s.src || '') + ' · ' + (s.city || '') + ' · ' + ageText(s.age);
  function drawMatsCost() {
    ui.mCost.replaceChildren(el('h3', '', 'Costo de encantar por objeto (T' + mTier() + ')'));
    const t = el('table'), hr = el('tr'); ['Tipo', '.1', '.2', '.3', '.4'].forEach(x => hr.appendChild(el('th', '', x))); t.appendChild(hr);
    ENCH_CATS.forEach(([k, n]) => { const c = enchantCosts(MS, mTier(), k), tr = el('tr'); tr.appendChild(el('td', '', n)); [1, 2, 3, 4].forEach(l => { const d = c.detail[l - 1]; tr.appendChild(el('td', d.cost == null ? 'sub' : '', d.cost == null ? d.why : fmt(d.cost))); }); t.appendChild(tr); });
    const w = el('div', 'tablewrap'); w.appendChild(t); ui.mCost.appendChild(w); ui.mCost.appendChild(el('p', 'hint', 'Costo = cantidad por objeto × precio del material. En «✨ Encantar» se usa solo (tier y tipo que elijas allí) cuando no escribes un costo a mano.'));
  }
  async function readMats() {
    if (noSrc()) { ui.mMsg.className = 'msg err'; ui.mMsg.textContent = 'Conecta tu base o activa los datos públicos en Configuración.'; return; }
    const tier = mTier(), city = ui.mCity.value, cities = city ? [city] : game.marketCities().filter(x => x !== 'Black Market'), ids = KINDS.map(k => (MS.ids[slotKey(k, tier)] || defaultId(k, tier)));
    ui.mRead.disabled = true; ui.mMsg.className = 'msg'; ui.mMsg.textContent = 'Leyendo…';
    try {
      const r = await ctx.getSrc().prices([...new Set(ids)], cities, [1]), errs = [r.ownError && 'Tu base: ' + r.ownError, r.pubError && 'Datos públicos: ' + r.pubError].filter(Boolean); let got = 0, miss = [];
      KINDS.forEach((k, i) => { const slot = slotKey(k, tier), b = cheapest(r.rows.filter(x => x.item_id === ids[i])); if (b) { MS.prices[slot] = b.price; MS.src[slot] = { by: 'base', src: b.src, city: b.city, age: b.age }; got++; } else miss.push(kindName(k, tier)); });
      saveMS(); drawMatsTable(); drawMatsCost();
      ui.mMsg.className = errs.length || miss.length ? 'msg err' : 'msg ok'; ui.mMsg.textContent = got + ' de ' + KINDS.length + ' leídos' + (miss.length ? '. Sin dato: ' + miss.join(', ') + ' (revisa el ID o escribe el precio; si abriste ese objeto en el mercado del juego, su ID real aparece en Mercado → «Lo último que capturaste»)' : '') + (errs.length ? ' · ' + errs.join(' · ') : '');
    } catch (e) { ui.mMsg.className = 'msg err'; ui.mMsg.textContent = errText(e); }
    ui.mRead.disabled = false;
  }

  // ---------- Pociones ----------
  const PTS = { pot: { tmin: 4, tmax: 8, sort: 'market', days: 7, group: '' }, gear: { tmin: 4, tmax: 8, sort: 'market', days: 7, group: '', cat: 'weapons', sub: '' } }, GEAR_CATS = [['weapons', 'Armas'], ['armor', 'Armaduras'], ['head', 'Cascos'], ['shoes', 'Botas'], ['capes', 'Capas']], MAX_IDS = 300, GROUPS = [['', 'Todas'], ['ALTO VOLUMEN Y ALTO PRECIO', 'Alto volumen y alto precio'], ['ALTO VOLUMEN, PRECIO BAJO', 'Alto volumen, precio bajo'], ['PRECIO ALTO, SE MUEVE POCO', 'Precio alto, se mueve poco'], ['BAJO VOLUMEN Y BAJO PRECIO', 'Bajo volumen y bajo precio']];
  const potLast = { pot: null, gear: null };
  const drawPot = () => drawRank('pot'), drawGear = () => drawRank('gear');
  const subsOf = cat => [...new Set(game.items.filter(i => i.category === cat && i.enchantment === 0 && game.recipes.has(i.item_id)).map(i => i.subcategory))].filter(Boolean).sort();
  const rankIds = kind => { const PT = PTS[kind]; if (kind === 'pot') return { ids: potionIds(game, PT.tmin, PT.tmax), cut: 0 }; const all = game.items.filter(i => i.category === PT.cat && (!PT.sub || i.subcategory === PT.sub) && i.enchantment === 0 && i.tier >= PT.tmin && i.tier <= PT.tmax && game.recipes.has(i.item_id)).map(i => i.item_id); return { ids: all.slice(0, MAX_IDS), cut: Math.max(0, all.length - MAX_IDS) }; };
  function drawRank(kind) {
    const PT = PTS[kind], isGear = kind === 'gear';
    const c = el('section', 'card'); c.appendChild(el('h2', '', isGear ? 'Equipo: volumen y precio' : 'Pociones: volumen y precio'));
    c.appendChild(el('p', 'hint', 'Compara ' + (isGear ? 'las piezas de equipo' : 'las pociones') + ' entre sí: cuántas se venden por día, a qué precio, cuánto cuesta fabricarlas y cuánto queda por unidad. El volumen sale del historial público de Albion Data Project (unidades por día que reportan los jugadores); no es el total real del servidor. Sirve para comparar unas pociones con otras.'));
    const cities = game.marketCities(), g = el('div', 'grid');
    ui.pT1 = select([4, 5, 6, 7, 8].map(x => [x, 'T' + x]), PT.tmin, () => { PT.tmin = +ui.pT1.value; }); ui.pT2 = select([4, 5, 6, 7, 8].map(x => [x, 'T' + x]), PT.tmax, () => { PT.tmax = +ui.pT2.value; });
    ui.pBuy = select(cities.filter(x => x !== 'Black Market').map(x => [x, x]), P.buyCity, () => { P.buyCity = ui.pBuy.value; }); ui.pCraft = select(game.craftCities().map(x => [x, x]), P.craftCity, () => { P.craftCity = ui.pCraft.value; });
    ui.pDays = select([[3, 'últimos 3 días'], [7, 'últimos 7 días'], [14, 'últimos 14 días']], PT.days, () => { PT.days = +ui.pDays.value; });
    if (isGear) { ui.pCat = select(GEAR_CATS, PT.cat, () => { PT.cat = ui.pCat.value; PT.sub = ''; drawSub(); }); ui.pSub = select([['', 'Todos']].concat(subsOf(PT.cat).map(k => [k, game.stations[k] || ({ accessoires_capes_capes: 'Capas comunes', accessoires_capes_avalon: 'Capas avalonianas', other: 'Otras' }[k]) || (/^accessoires_capes_/.test(k) ? 'Capas de ' + ({ fortsterling: 'Fort Sterling' }[k.slice(18)] || k.slice(18).replace(/^./, c => c.toUpperCase())) : k.replace(/_/g, ' '))])), PT.sub, () => { PT.sub = ui.pSub.value; }); g.append(field('Tipo de equipo', ui.pCat), field('Subtipo', ui.pSub)); }
    g.append(field('Tier desde', ui.pT1), field('Tier hasta', ui.pT2), field('Compro materiales en', ui.pBuy), field('Fabrico en', ui.pCraft), field('Volumen de', ui.pDays),
      field('Premium', select([['0', 'NO'], ['1', 'SÍ']], P.premium ? '1' : '0', e => { P.premium = e.target.value === '1'; })), field('Tarifa de estación por fabricación', input(P.fee, e => { P.fee = e.target.value; }, { inputMode: 'numeric', placeholder: '0' })));
    ui.pGo = el('button', 'primary', isGear ? 'Comparar equipo' : 'Comparar pociones'); ui.pGo.addEventListener('click', () => runRank(kind)); ui.pMsg = el('span', 'msg'); const row = el('div', 'row'); row.append(ui.pGo, ui.pMsg);
    c.append(g, row); ui.pOut = el('section', 'card'); ui.pOut.hidden = true; ui.body.append(c, ui.pOut); if (potLast[kind]) drawRankOut(kind);
  }
  async function runRank(kind) {
    const PT = PTS[kind], isGear = kind === 'gear';
    if (noSrc()) { ui.pMsg.className = 'msg err'; ui.pMsg.textContent = 'Conecta tu base o activa los datos públicos en Configuración.'; return; }
    if (PT.tmax < PT.tmin) { ui.pMsg.className = 'msg err'; ui.pMsg.textContent = 'El tier final debe ser igual o mayor al inicial.'; return; }
    const src = ctx.getSrc(), { ids, cut } = rankIds(kind), sale = game.marketCities(), allIds = [...new Set(ids.flatMap(i => [i, ...game.recipe(i).materials.map(m => m.item_id)]))];
    ui.pGo.disabled = true; ui.pMsg.className = 'msg'; ui.pMsg.textContent = 'Leyendo precios de ' + fmt(ids.length) + (isGear ? ' piezas' : ' pociones') + (cut ? ' (se recortó: había ' + fmt(ids.length + cut) + '; elige un subtipo o menos tiers)' : '') + '…';
    try {
      const { map, errs } = await readMarket(allIds, [...new Set([P.buyCity, ...sale])]); let hist = new Map(), hErr = null;
      ui.pMsg.textContent = 'Leyendo historial de ventas…';
      try { (await src.pub.history(ids, sale, [1])).forEach(h => hist.set(h.location + '|' + h.item_id, h.data || [])); } catch (e) { hErr = errText(e); }
      const r = potionRank({ game, ids, craftCity: P.craftCity, buyCity: P.buyCity, saleCities: sale, premium: P.premium, focus: false, feePerCraft: num(P.fee), days: PT.days, market: (c, id) => map.get(c + '|' + id) || null, hist: (c, id) => hist.get(c + '|' + id) || null });
      potLast[kind] = { r, hErr, cut }; const all = [...errs, hErr && 'Historial: ' + hErr].filter(Boolean); ui.pMsg.className = all.length ? 'msg err' : 'msg'; ui.pMsg.textContent = all.join(' · '); drawRankOut(kind);
    } catch (e) { ui.pMsg.className = 'msg err'; ui.pMsg.textContent = errText(e); }
    ui.pGo.disabled = false;
  }
  function drawRankOut(kind) {
    const PT = PTS[kind], isGear = kind === 'gear', { r, hErr, cut } = potLast[kind], o = ui.pOut; o.hidden = false; o.replaceChildren(el('h2', '', 'Resultado'));
    if (!r.out.length) { o.appendChild(el('div', 'warn', 'Datos insuficientes: no hay ' + (isGear ? 'piezas' : 'pociones') + ' con precio de venta y de materiales de menos de 24 horas. Pasa por el mercado con el programa del PC abierto o activa los datos públicos.')); }
    if (cut) o.appendChild(el('div', 'warn', 'Había ' + fmt(PTS[kind].tmax && (r.stats.total + cut)) + ' piezas y se revisaron ' + fmt(r.stats.total) + ' para no saturar la API. Elige un subtipo o menos tiers para ver el resto.'));
    if (hErr) o.appendChild(el('div', 'warn', 'No se pudo leer el historial público, así que no hay volumen. Se muestran precio y costo. (' + hErr + ')'));
    const sorts = { market: ['Mercado diario (volumen × precio)', x => x.market || 0], vol: ['Volumen por día', x => x.perDay || 0], price: ['Precio', x => x.price], profit: ['Ganancia por unidad', x => x.profitUnit], dayp: ['Ganancia diaria posible', x => x.dayProfit || 0] };
    const bar = el('div', 'row'); bar.append(field('Ordenar por', select(Object.entries(sorts).map(([k, v]) => [k, v[0]]), PT.sort, e => { PT.sort = e.target.value; drawRankOut(kind); })), field('Grupo', select(GROUPS, PT.group, e => { PT.group = e.target.value; drawRankOut(kind); }))); o.appendChild(bar);
    const list = r.out.filter(x => !PT.group || x.group === PT.group).sort((a, b) => sorts[PT.sort][1](b) - sorts[PT.sort][1](a));
    const t = el('table'), hr = el('tr'); [isGear ? 'Pieza' : 'Poción', 'Precio', 'Vol./día', 'Costo', 'Ganancia/u.', 'Grupo'].forEach(x => hr.appendChild(el('th', '', x))); t.appendChild(hr);
    list.forEach(x => { const tr = el('tr'), a = el('td'); a.appendChild(document.createTextNode(x.label)); a.appendChild(el('div', 'sub', 'vender en ' + x.saleCity + (x.histDays ? ' · volumen de ' + x.histDays + ' días' : '') + (x.canSell != null ? ' · podrías vender ~' + fmt(x.canSell) + '/día' : '')));
      tr.appendChild(a); tr.appendChild(el('td', '', fmt(x.price))); tr.appendChild(el('td', '', x.perDay == null ? 'sin dato' : fmt(x.perDay))); tr.appendChild(el('td', '', fmt(x.cost))); tr.appendChild(el('td', x.profitUnit < 0 ? 'neg' : 'pos', fmt(x.profitUnit)));
      const g = el('td'); g.appendChild(el('span', 'tag ' + (x.group.startsWith('ALTO VOLUMEN Y') ? 'own' : ''), x.group.toLowerCase())); tr.appendChild(g); t.appendChild(tr); });
    const w = el('div', 'tablewrap'); w.appendChild(t); o.appendChild(w);
    const s = r.stats; o.appendChild(el('p', 'hint', fmt(r.out.length) + ' de ' + fmt(s.total) + (isGear ? ' piezas' : ' pociones') + ' con datos completos (' + fmt(s.noPrice) + ' sin precio de venta, ' + fmt(s.noMats) + ' sin precio de algún material, ' + fmt(s.tooOld) + ' con datos de más de 24 h, ' + fmt(s.noVolume) + ' sin historial de volumen). Mediana de volumen: ' + (r.medianVol == null ? '—' : fmt(r.medianVol) + '/día') + ' · mediana de precio: ' + (r.medianPrice == null ? '—' : fmt(r.medianPrice)) + '. «Alto» significa igual o sobre la mediana de este listado. Venta instantánea a la mejor orden de compra, impuesto ' + r.taxPct + ' %, sin transporte ni tiempo; «podrías vender» respeta no pasar de 2/3 del volumen.'));
  }

  // ---------- Oro ----------
  function drawGold() {
    const c = el('section', 'card'); c.appendChild(el('h2', '', 'Historial del precio del oro'));
    c.appendChild(el('p', 'hint', 'Precio del oro en plata según los datos públicos de Albion Data Project (siempre público: tu base no guarda el oro). Sirve para ver si conviene comprar o vender oro ahora.'));
    ui.gN = select([[48, 'Últimos 48 registros'], [120, 'Últimos 120'], [240, 'Últimos 240'], [720, 'Últimos 720']], '240'); ui.gGo = el('button', 'primary', 'Cargar historial'); ui.gMsg = el('span', 'msg');
    ui.gGo.addEventListener('click', runGold); const row = el('div', 'row'); row.append(field('Rango', ui.gN), ui.gGo, ui.gMsg); c.appendChild(row);
    ui.gOut = el('section', 'card'); ui.gOut.hidden = true; ui.body.append(c, ui.gOut);
  }
  async function runGold() {
    ui.gGo.disabled = true; ui.gMsg.className = 'msg'; ui.gMsg.textContent = 'Cargando…';
    try { const raw = await ctx.getSrc().pub.gold(+ui.gN.value), s = goldStats(raw); if (!s) throw new Error('Datos insuficientes: la API no devolvió suficientes registros.'); ui.gMsg.textContent = ''; drawGoldOut(s); }
    catch (e) { ui.gMsg.className = 'msg err'; ui.gMsg.textContent = errText(e); }
    ui.gGo.disabled = false;
  }
  function drawGoldOut(s) {
    const o = ui.gOut; o.hidden = false; o.replaceChildren(el('h2', '', 'Precio del oro'));
    const kv = el('div', 'tiles'); [['Ahora', fmt(s.last.price)], ['Mínimo', fmt(s.min)], ['Máximo', fmt(s.max)], ['Promedio', fmt(s.avg)], ['Cambio en el rango', (s.changePct >= 0 ? '+' : '') + s.changePct.toFixed(1).replace('.', ',') + ' %'], ['Frente al promedio', (s.vsAvgPct >= 0 ? '+' : '') + s.vsAvgPct.toFixed(1).replace('.', ',') + ' %']]
      .forEach(([k, v]) => { const d = el('div', 'tile'); d.appendChild(el('span', 'hint', k)); d.appendChild(el('div', 'big', v)); kv.appendChild(d); }); o.appendChild(kv);
    const W = 640, H = 220, pad = 8, lo = s.min, hi = s.max === s.min ? s.min + 1 : s.max, x = i => pad + i * (W - 2 * pad) / (s.n - 1), y = v => H - pad - (v - lo) / (hi - lo) * (H - 2 * pad);
    const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': 'Historial del precio del oro' });
    svg.appendChild(sv('polyline', { points: s.series.map((p, i) => x(i).toFixed(1) + ',' + y(p.price).toFixed(1)).join(' '), fill: 'none', stroke: 'var(--acc)', 'stroke-width': 2 }));
    svg.appendChild(sv('line', { x1: pad, x2: W - pad, y1: y(s.avg), y2: y(s.avg), stroke: 'var(--mute)', 'stroke-dasharray': '4 4' })); o.appendChild(svg);
    const d = t => new Date(t).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
    o.appendChild(el('p', 'hint', fmt(s.n) + ' registros · del ' + d(s.from) + ' al ' + d(s.to) + ' · línea punteada = promedio. Tendencia en el rango: ' + s.trend + '. Es solo información: no es una recomendación de compra.'));
  }

  // ---------- Referencia ----------
  function drawRef() {
    const r = referenceTables(game), mk = (title, tb, note) => { const c = el('section', 'card'); c.appendChild(el('h2', '', title)); const t = el('table'), hr = el('tr'); tb.head.forEach(x => hr.appendChild(el('th', '', x))); t.appendChild(hr);
      tb.rows.forEach(rw => { const tr = el('tr'); rw.forEach(v => tr.appendChild(el('td', '', v))); t.appendChild(tr); }); const w = el('div', 'tablewrap'); w.appendChild(t); c.appendChild(w); if (note) c.appendChild(el('p', 'hint', note)); return c; };
    ui.body.append(mk('Retorno de recursos', r.rr, r.rr.note), mk('Impuestos', r.taxes), mk('Bonos de las ciudades', r.cities, 'Solo se muestran bonos verificados. Caerleon, Brecilien e islas: ingresa el retorno a mano en la Calculadora.'));
    const f = el('section', 'card'); f.appendChild(el('h2', '', 'Focus')); f.appendChild(el('p', 'hint', r.focus)); f.appendChild(el('p', 'hint', 'Fuentes: ' + r.sources.join(' · '))); f.appendChild(el('p', 'hint', 'No hay tabla de capacidad de monturas: no existe en los datos verificados de la app y no se inventa.')); ui.body.appendChild(f);
  }
  return { show };
}
