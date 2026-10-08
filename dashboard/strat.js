// «Tengo estos materiales»: vender, refinar o fabricar con ellos. Usa tu base; nada se inventa.
import { el, chip, field, select, input, num } from './dom.js?v=0.16';
import { loadGameData } from '../crafting/recipes.js?v=0.16';
import { compareStrategies, neededIds } from '../profit-engine/strategies.js?v=0.16';
import { freshness, ageText } from '../data/freshness.js?v=0.16';
import { fmt } from '../data/items.js?v=0.16';
import { mountSolo } from './solo.js?v=0.16';

export function mountStrat(root, ctx) {
  let game = null, built = false, last = null;
  const S = { hold: [], silver: '', buyCity: 'Lymhurst', craftCity: 'Lymhurst', saleCity: 'Caerleon', premium: false, focus: false, fee: '', maxTier: 8 }, ui = {};

  async function show() {
    if (built) return;
    root.replaceChildren(el('p', 'hint', 'Cargando recetas y datos del juego…'));
    try { game = await loadGameData(); } catch (e) { root.replaceChildren(el('p', 'msg err', e.message)); return; }
    const cfg = ctx.getCfg(); S.silver = cfg.silver ? String(cfg.silver) : ''; S.craftCity = cfg.city || 'Lymhurst'; S.buyCity = S.craftCity; S.premium = !!cfg.premium; S.maxTier = cfg.maxTier || 8; build();
  }
  function build() {
    built = true; root.replaceChildren(); const soloBox = el('div'); root.appendChild(soloBox); mountSolo(soloBox, ctx, game);
    const c1 = el('section', 'card'); c1.appendChild(el('h2', '', 'Tengo estos materiales'));
    c1.appendChild(el('p', 'hint', 'Agrega uno o varios materiales o recursos que tengas y cuántos de cada uno. Se compara venderlos, refinarlos o fabricar con ellos (y venderlo en la ciudad o en el Mercado Negro).'));
    ui.q = input('', onSearch, { type: 'search', placeholder: 'Ej.: lingote t4, mineral de hierro, cuero t5', autocomplete: 'off' });
    ui.results = el('div', 'list pick'); ui.sel = el('div', 'holds'); c1.append(ui.q, ui.results, ui.sel);
    const g = el('div', 'grid'); const cities = game.marketCities();
    ui.silver = input(S.silver ? fmt(+S.silver) : '', () => { S.silver = String(num(ui.silver.value)); }, { inputMode: 'numeric', placeholder: 'silver disponible' });
    ui.buyCity = select(cities.filter(x => x !== 'Black Market').map(x => [x, x]), S.buyCity, () => { S.buyCity = ui.buyCity.value; });
    ui.craftCity = select(game.craftCities().map(x => [x, x]), S.craftCity, () => { S.craftCity = ui.craftCity.value; });
    ui.saleCity = select(cities.map(x => [x, x]), S.saleCity, () => { S.saleCity = ui.saleCity.value; });
    ui.premium = select([['0', 'NO'], ['1', 'SÍ']], S.premium ? '1' : '0', () => { S.premium = ui.premium.value === '1'; });
    ui.focus = select([['0', '0 (sin Focus)'], ['1', 'Con Focus']], '0', () => { S.focus = ui.focus.value === '1'; });
    ui.fee = input('', () => { S.fee = ui.fee.value; }, { inputMode: 'numeric', placeholder: '0' });
    ui.tier = select([4, 5, 6, 7, 8].map(x => [x, 'hasta T' + x]), S.maxTier, () => { S.maxTier = +ui.tier.value; });
    g.append(field('Silver disponible', ui.silver), field('Estoy en (vendo materiales y compro lo que falte)', ui.buyCity), field('Fabricar / refinar en', ui.craftCity),
      field('Vender lo producido en', ui.saleCity), field('Premium', ui.premium), field('Focus', ui.focus), field('Tarifa de estación por receta', ui.fee), field('Tier máximo', ui.tier));
    c1.appendChild(g); drawHold();
    ui.go = el('button', 'primary', 'Comparar opciones'); ui.go.addEventListener('click', run); ui.msg = el('span', 'msg');
    const row = el('div', 'row'); row.append(ui.go, ui.msg); c1.appendChild(row); root.appendChild(c1);
    ui.out = el('section', 'card'); ui.out.hidden = true; root.appendChild(ui.out);
  }
  function onSearch() {
    const r = game.searchMat(ui.q.value, 20); ui.results.replaceChildren();
    if (ui.q.value.trim() && !r.length) ui.results.appendChild(el('p', 'hint', 'No encontré ese material. Prueba con otra palabra o con el tier (ej.: t5).'));
    r.forEach(m => { const row = el('div', 'it'), l = el('div'); l.appendChild(el('div', 'nm', m.name)); l.appendChild(el('div', 'sub', m.item_id + ' · se usa en ' + game.usedIn(m.item_id).length + ' recetas'));
      row.appendChild(l); row.addEventListener('click', () => { if (!S.hold.some(h => h.id === m.item_id)) S.hold.push({ id: m.item_id, qty: '' }); ui.results.replaceChildren(); ui.q.value = ''; drawHold(); }); ui.results.appendChild(row); });
  }
  function drawHold() {
    ui.sel.replaceChildren(); if (!S.hold.length) { ui.sel.appendChild(el('p', 'hint', 'Todavía no agregaste ningún material.')); return; }
    S.hold.forEach((h, i) => { const r = el('div', 'hold'), l = el('div'); l.appendChild(el('div', 'nm', game.label(h.id))); l.appendChild(el('div', 'sub', h.id));
      const q = input(h.qty ? fmt(+h.qty) : '', () => { h.qty = String(num(q.value)); }, { inputMode: 'numeric', placeholder: 'cantidad' }); q.addEventListener('change', () => { q.value = h.qty && +h.qty ? fmt(+h.qty) : ''; });
      const x = el('button', '', '✕'); x.title = 'Quitar'; x.addEventListener('click', () => { S.hold.splice(i, 1); drawHold(); }); r.append(l, q, x); ui.sel.appendChild(r); });
  }

  async function run() {
    const api = ctx.getSrc(), silver = num(ui.silver.value), holdings = S.hold.map(h => ({ id: h.id, qty: +h.qty || 0 })).filter(h => h.qty > 0);
    if (!S.hold.length) { ui.msg.className = 'msg err'; ui.msg.textContent = 'Agrega primero un material.'; return; }
    if (!holdings.length) { ui.msg.className = 'msg err'; ui.msg.textContent = 'Escribe cuántos tienes de cada material.'; return; }
    if (!api.usable()) { ui.msg.className = 'msg err'; ui.msg.textContent = 'Conecta tu base o activa los datos públicos en «Mis datos» para leer los precios.'; return; }
    ui.go.disabled = true; ui.msg.className = 'msg'; ui.msg.textContent = 'Leyendo precios de tu base…';
    try {
      const ids = [...new Set(holdings.flatMap(h => neededIds(game, h.id, S.maxTier)))], cities = [...new Set([S.buyCity, S.saleCity, 'Black Market'])], map = new Map(); let errs = [];
      for (let i = 0; i < ids.length; i += 100) {
        const r = await api.prices(ids.slice(i, i + 100), cities, [1]); if (r.ownError) errs.push('Tu base: ' + r.ownError); if (r.pubError) errs.push('Datos públicos: ' + r.pubError);
        r.rows.forEach(x => map.set(x.city + '|' + x.item_id, { sell_min: x.sell.price, buy_max: x.buy.price, sellAge: x.sell.age_min, buyAge: x.buy.age_min, sellSrc: x.sell.src, buySrc: x.buy.src }));
      }
      last = compareStrategies({ game, holdings, silver, buyCity: S.buyCity, craftCity: S.craftCity, saleCity: S.saleCity, premium: S.premium, focus: S.focus, feePerCraft: num(S.fee), maxTier: S.maxTier, market: (c, id) => map.get(c + '|' + id) || null });
      ui.msg.className = errs.length ? 'msg err' : 'msg'; ui.msg.textContent = [...new Set(errs)].join(' · '); draw(last, holdings, silver);
    } catch (e) { ui.msg.className = 'msg err'; ui.msg.textContent = e.message.includes('Failed to fetch') ? 'No se pudo conectar con tu base.' : e.message; }
    ui.go.disabled = false;
  }

  function draw(r, holdings, silver) {
    ui.out.hidden = false; ui.out.replaceChildren(el('h2', '', 'Resultado'));
    // mejor opción
    const b = r.best, box = el('div', 'res');
    box.appendChild(el('span', 'hint', 'MEJOR OPCIÓN'));
    if (!b) box.appendChild(el('div', 'big', 'Datos insuficientes'));
    else { box.appendChild(el('div', 'big pos', '🔥 ' + (r.bestIsSell ? 'Vender los materiales' : b.kind + ': ' + b.label))); box.appendChild(el('div', 'hint', 'Valor obtenido: ' + fmt(b.total != null ? b.total : b.value) + ' silver' + (!r.bestIsSell && b.vsSell !== null ? ' (' + (b.vsSell >= 0 ? '+' : '') + fmt(b.vsSell) + ' frente a vender)' : ''))); }
    ui.out.appendChild(box);
    ui.out.appendChild(el('div', 'warn', 'Solo venta INSTANT (a la orden de compra más alta), sin transporte ni tiempo. Premium y Focus son los que marcaste: ' + (S.premium ? 'con Premium' : 'sin Premium') + ', ' + (S.focus ? 'con Focus' : 'sin Focus') + '.'));
    // opción A
    const t = el('table'), hr = el('tr'); ['Opción', 'Unid.', 'Valor', 'vs vender', 'Dato'].forEach(x => hr.appendChild(el('th', '', x))); t.appendChild(hr);
    const tr0 = el('tr'); { const a0 = el('td'); a0.appendChild(document.createTextNode('Vender ' + (holdings.length > 1 ? 'todos los materiales' : 'los materiales') + ' (' + S.buyCity + ')')); if (r.A.source) a0.appendChild(el('div', 'sub', 'fuente: ' + r.A.source)); if (r.A.missing && r.A.missing.length) a0.appendChild(el('div', 'sub', 'falta precio de compra de: ' + r.A.missing.map(i => game.label(i)).join(', '))); tr0.appendChild(a0); } tr0.appendChild(el('td', '', fmt(r.A.units))); tr0.appendChild(el('td', '', r.A.value === null ? 'Sin dato' : fmt(r.A.value))); tr0.appendChild(el('td', '', '—')); const c0 = el('td'); if (r.A.oldest != null) c0.appendChild(chip(freshness(r.A.oldest * 60000))); tr0.appendChild(c0); t.appendChild(tr0);
    r.options.slice(0, 12).forEach(o => {
      const tr = el('tr'); const a = el('td'); a.appendChild(document.createTextNode(o.label)); a.appendChild(el('div', 'sub', o.kind + (o.saleCity === 'Black Market' ? '' : ' en ' + o.saleCity) + (o.bonus ? ' · bono de ciudad' : '') + (o.source ? ' · fuente: ' + o.source : '') + (o.limitedBySilver ? ' · limitado por tu silver' : '') + (o.leftoverList && o.leftoverList.length ? ' · sobran ' + o.leftoverList.map(x => fmt(x.qty) + ' ' + game.label(x.id)).join(', ') + (o.leftoverValue ? ' (vendidos valen ' + fmt(o.leftoverValue) + ', ya sumados)' : ' (sin precio para valorarlos)') : ''))); tr.appendChild(a);
      tr.appendChild(el('td', '', fmt(o.units))); tr.appendChild(el('td', o.total < 0 ? 'neg' : '', fmt(o.total))); tr.appendChild(el('td', o.vsSell !== null && o.vsSell < 0 ? 'neg' : '', o.vsSell === null ? '—' : (o.vsSell >= 0 ? '+' : '') + fmt(o.vsSell)));
      const c = el('td'); c.appendChild(chip(freshness(o.oldest * 60000))); tr.appendChild(c); t.appendChild(tr);
    });
    const w = el('div', 'tablewrap'); w.appendChild(t); ui.out.appendChild(w);
    const s = r.stats;
    ui.out.appendChild(el('p', 'hint', 'Se revisaron ' + fmt(s.candidates) + ' recetas que usan este material: ' + fmt(s.evaluated) + ' con datos completos, ' + fmt(s.noData) + ' sin precio de algún material o del producto en tu base, ' + fmt(s.tooOld) + ' descartadas por tener datos de más de 24 horas' + (s.tooSmall ? ', ' + fmt(s.tooSmall) + ' en las que no alcanza para una fabricación' : '') + (s.overBudget ? ', ' + fmt(s.overBudget) + ' que exceden tu silver' : '') + '.'));
    if (!r.options.length) ui.out.appendChild(el('div', 'warn', 'Tu base todavía no tiene los precios necesarios para comparar. Pasa por el mercado del juego y mira esos objetos (el producto y los demás materiales) para llenar la base.'));
    const d = el('details'); d.appendChild(el('summary', '', '¿Cómo se calcula el valor?')); d.appendChild(el('p', 'hint', 'Valor de vender = cantidad × orden de compra más alta × (1 − impuesto). Valor de fabricar o refinar = venta neta del producto − lo que compras de los demás materiales − tarifa de estación + lo que te sobra de tus materiales vendido a la orden de compra (si tiene precio de menos de 24 h). Tus materiales no se compran, así que su valor queda dentro del resultado y por eso se compara con venderlos. Se usa el retorno de recursos de la ciudad donde fabricas.')); ui.out.appendChild(d);
    ui.out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return { show };
}
