// Calculadora de fabricación: desglose del profit, INSTANT vs ORDEN, simulación y comparación con Premium / Focus.
import { $, el, chip, field, select, input, num, numDec } from './dom.js?v=0.13';
import { loadGameData, QUALITIES, CATEGORY_LABEL } from '../crafting/recipes.js?v=0.13';
import { evaluate } from '../profit-engine/scenario.js?v=0.13';
import { freshness, ageText } from '../data/freshness.js?v=0.13';
import { fmt } from '../data/items.js?v=0.13';
import { refineVsBuy } from '../refining/refining.js?v=0.13';
const pc = (n, d = 1) => n.toFixed(d).replace('.', ',') + '%';

export function mountCalc(root, ctx) {
  let game = null, loading = null;
  const S = {
    itemId: null, units: 10, quality: 1, buyCity: 'Lymhurst', craftCity: 'Lymhurst', saleCity: 'Black Market',
    premium: null, focus: false, manualRate: '', dailyBonus: '', feeMode: 'total', feeTotal: '', feeNutrition: '', feeUse: 'max',
    transportTotal: '', transportPerUnit: '', otherCosts: '', minutes: '', mode: 'instant', overrides: { instant: {}, order: {}, saleInstant: null, saleOrder: null },
    market: {}, saleMarket: {}, buyProduct: null, priceMsg: '', priceBusy: false
  };
  const ui = {};

  function ensureGame() {
    if (game) return Promise.resolve(game);
    loading = loading || loadGameData().then(g => { game = g; return g; }).catch(e => { loading = null; throw e; });
    return loading;
  }

  async function show() {
    if (ui.built) { if (S.premium === null) S.premium = !!ctx.getCfg().premium; return; }
    root.replaceChildren(el('p', 'hint', 'Cargando recetas y datos del juego…'));
    try { await ensureGame(); } catch (e) { root.replaceChildren(el('p', 'msg err', e.message)); return; }
    S.premium = !!ctx.getCfg().premium; S.craftCity = ctx.getCfg().city || 'Lymhurst'; S.buyCity = S.craftCity; build();
  }

  // ---------- construcción de la pantalla ----------
  function build() {
    ui.built = true; root.replaceChildren();
    const c1 = el('section', 'card'); c1.appendChild(el('h2', '', 'Objeto a fabricar'));
    ui.q = input('', onSearch, { type: 'search', placeholder: 'Ej.: espada ancha 6.1, poción de curación, capa t5', autocomplete: 'off' });
    ui.results = el('div', 'list pick'); ui.sel = el('div'); c1.append(ui.q, ui.results, ui.sel); root.appendChild(c1);

    const c2 = el('section', 'card'); c2.appendChild(el('h2', '', 'Parámetros')); const g = el('div', 'grid'); c2.appendChild(g);
    const cities = game.marketCities(), craft = game.craftCities();
    ui.units = input(S.units, () => { S.units = Math.max(1, num(ui.units.value)); calc(); }, { inputMode: 'numeric' });
    ui.quality = select(QUALITIES.map(q => [q.q, q.label]), S.quality, () => { S.quality = +ui.quality.value; refreshPrices(); });
    ui.buyCity = select(cities.map(x => [x, x]).filter(x => x[0] !== 'Black Market'), S.buyCity, () => { S.buyCity = ui.buyCity.value; refreshPrices(); });
    ui.craftCity = select(craft.map(x => [x, x]), S.craftCity, () => { S.craftCity = ui.craftCity.value; calc(); });
    ui.saleCity = select(cities.map(x => [x, x]), S.saleCity, () => { S.saleCity = ui.saleCity.value; refreshPrices(); });
    ui.premium = select([['0', 'NO'], ['1', 'SÍ']], S.premium ? '1' : '0', () => { S.premium = ui.premium.value === '1'; calc(); });
    ui.focus = select([['0', '0 (sin Focus)'], ['1', 'Con Focus']], '0', () => { S.focus = ui.focus.value === '1'; calc(); });
    ui.rate = input(S.manualRate, () => { S.manualRate = ui.rate.value; calc(); }, { inputMode: 'decimal', placeholder: 'automático' });
    ui.daily = input(S.dailyBonus, () => { S.dailyBonus = ui.daily.value; calc(); }, { inputMode: 'numeric', placeholder: '0' });
    g.append(field('Cantidad a fabricar', ui.units), field('Calidad del producto', ui.quality), field('Comprar materiales en', ui.buyCity), field('Fabricar en', ui.craftCity),
      field('Vender en', ui.saleCity), field('Premium', ui.premium), field('Focus', ui.focus), field('Retorno manual % (opcional)', ui.rate), field('Bono diario de producción', ui.daily));
    const d = el('details'); d.appendChild(el('summary', '', 'Tarifa de estación, transporte y tiempo')); const g2 = el('div', 'grid'); d.appendChild(g2);
    ui.feeMode = select([['total', 'Total que veo en la ventana'], ['nutricion', 'Nutrición × tasa']], S.feeMode, () => { S.feeMode = ui.feeMode.value; syncFee(); calc(); });
    ui.feeTotal = input(S.feeTotal, () => { S.feeTotal = ui.feeTotal.value; calc(); }, { inputMode: 'numeric', placeholder: 'silver del lote' });
    ui.feeNut = input(S.feeNutrition, () => { S.feeNutrition = ui.feeNut.value; calc(); }, { inputMode: 'numeric', placeholder: 'nutrición del lote' });
    ui.feeUse = select([['max', 'Usar la tasa máxima (prudente)'], ['min', 'Usar la tasa mínima']], S.feeUse, () => { S.feeUse = ui.feeUse.value; calc(); });
    ui.trT = input(S.transportTotal, () => { S.transportTotal = ui.trT.value; calc(); }, { inputMode: 'numeric', placeholder: '0' });
    ui.trU = input(S.transportPerUnit, () => { S.transportPerUnit = ui.trU.value; calc(); }, { inputMode: 'numeric', placeholder: '0' });
    ui.other = input(S.otherCosts, () => { S.otherCosts = ui.other.value; calc(); }, { inputMode: 'numeric', placeholder: '0' });
    ui.minutes = input(S.minutes, () => { S.minutes = ui.minutes.value; calc(); }, { inputMode: 'numeric', placeholder: 'minutos del ciclo' });
    ui.feeTotalL = field('Tarifa total del lote', ui.feeTotal); ui.feeNutL = field('Nutrición del lote', ui.feeNut);
    g2.append(field('Cómo ingresar la tarifa', ui.feeMode), ui.feeTotalL, ui.feeNutL, field('Tasa de estación', ui.feeUse), field('Transporte total (silver)', ui.trT), field('Transporte por unidad', ui.trU), field('Otros costos', ui.other), field('Tiempo del ciclo (min)', ui.minutes));
    ui.feeHint = el('p', 'hint'); d.appendChild(ui.feeHint); c2.appendChild(d); root.appendChild(c2); syncFee();

    const c3 = el('section', 'card'); ui.resCard = c3; c3.appendChild(el('h2', '', 'Resultado'));
    ui.seg = el('div', 'seg'); [['instant', 'INSTANT'], ['order', 'ORDEN']].forEach(([m, t]) => { const b = el('button', m === S.mode ? 'on' : '', t); b.dataset.m = m; b.addEventListener('click', () => { S.mode = m; ui.seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.m === m)); calc(); }); ui.seg.appendChild(b); });
    ui.modeHint = el('p', 'hint'); ui.sum = el('div'); ui.mats = el('div'); ui.bd = el('div'); ui.refine = el('div'); ui.cmp = el('div');
    c3.append(ui.seg, ui.modeHint, ui.sum, ui.mats, ui.bd, ui.refine, ui.cmp); root.appendChild(c3); c3.hidden = true;
  }
  function syncFee() {
    const n = S.feeMode === 'nutricion'; ui.feeTotalL.hidden = n; ui.feeNutL.hidden = !n; ui.feeUse.parentElement.hidden = !n;
    const cfg = ctx.getCfg();
    ui.feeHint.textContent = n ? `Fórmula: nutrición × tasa ÷ 100, con tu rango ${fmt(cfg.stationFeeMin)}–${fmt(cfg.stationFeeMax)}. La nutrición del lote la ves en la ventana de fabricación; si dudas, usa «Total que veo en la ventana».`
      : 'Escribe el total de silver que te cobra la estación por todo el lote (lo ves en la ventana de fabricación). Si lo dejas vacío no se cobra tarifa y el profit queda más alto de lo real.';
  }

  // ---------- búsqueda y selección ----------
  function onSearch() {
    const r = game.search(ui.q.value, 25); ui.results.replaceChildren();
    if (ui.q.value.trim() && !r.length) ui.results.appendChild(el('p', 'hint', 'No encontré objetos con receta. Prueba con otra palabra o con el tier (ej.: t5).'));
    r.forEach(it => { const row = el('div', 'it'); const l = el('div'); l.appendChild(el('div', 'nm', it.name)); l.appendChild(el('div', 'sub', 'T' + it.tier + '.' + it.enchantment + ' · ' + (CATEGORY_LABEL[it.category] || it.category) + ' · ' + it.item_id));
      row.appendChild(l); row.addEventListener('click', () => choose(it.item_id)); ui.results.appendChild(row); });
  }
  function choose(id) {
    S.itemId = id; S.overrides = { instant: {}, order: {}, saleInstant: null, saleOrder: null }; S.market = {}; S.saleMarket = {}; S.buyProduct = null; ui.results.replaceChildren(); ui.q.value = '';
    const it = game.item(id), b = game.bonusCity(it);
    ui.sel.replaceChildren(el('div', 'big', game.label(id)), el('p', 'hint', (CATEGORY_LABEL[it.category] || it.category) + ' · estación: ' + (game.stations[it.crafting_station] || it.crafting_station || '—') + (b ? ' · con bono de ciudad en ' + b : ' · sin ciudad con bono verificado') + ' · ' + id));
    ui.resCard.hidden = false; refreshPrices();
  }

  // ---------- precios desde tu base ----------
  async function refreshPrices() {
    if (!S.itemId) return;
    const api = ctx.getSrc(), rec = game.recipe(S.itemId); S.market = {}; S.saleMarket = {}; S.buyProduct = null;
    if (!api.usable()) { S.priceMsg = 'Sin fuente de precios: conecta tu base o activa los datos públicos en «Mis datos», o escribe los precios a mano (modo simulación).'; return calc(true); }
    S.priceBusy = true; S.priceMsg = 'Leyendo precios de tu base…'; calc(true);
    try {
      const mats = [...new Set(rec.materials.map(m => m.item_id))];
      const isRef = game.item(S.itemId).category === 'refined';
      const [pm, ps, pb] = await Promise.all([api.prices(mats, [S.buyCity], [1]), api.prices([S.itemId], [S.saleCity], [S.quality]), isRef ? api.prices([S.itemId], [S.buyCity], [S.quality]) : Promise.resolve(null)]);
      const mk = r => ({ sell_min: r.sell.price, buy_max: r.buy.price, sellAge: r.sell.age_min, buyAge: r.buy.age_min, sellSrc: r.sell.src, buySrc: r.buy.src });
      pm.rows.forEach(r => { S.market[r.item_id] = mk(r); }); const sr = ps.rows[0]; S.saleMarket = sr ? mk(sr) : {}; if (pb) S.buyProduct = pb.rows[0] ? mk(pb.rows[0]) : {};
      S.priceMsg = [pm.ownError && 'Tu base: ' + pm.ownError, pm.pubError && 'Datos públicos: ' + pm.pubError].filter(Boolean).join(' · ');
    } catch (e) { S.priceMsg = e.message; }
    S.priceBusy = false; calc(true);
  }

  // ---------- cálculo y dibujo ----------
  function inputs() {
    const cfg = ctx.getCfg(), rate = numDec(S.manualRate);
    return { game, itemId: S.itemId, units: S.units, market: S.market, saleMarket: S.saleMarket, craftCity: S.craftCity, saleCity: S.saleCity, premium: S.premium, focus: S.focus,
      manualRatePct: rate, dailyBonus: numDec(S.dailyBonus) || 0, overrides: S.overrides, transportTotal: num(S.transportTotal), transportPerUnit: num(S.transportPerUnit), otherCosts: num(S.otherCosts), minutes: num(S.minutes) || null,
      fee: { mode: S.feeMode, total: num(S.feeTotal), nutrition: num(S.feeNutrition), rateMin: cfg.stationFeeMin, rateMax: cfg.stationFeeMax, rateUse: S.feeUse } };
  }
  function calc(rebuildMats) {
    if (!S.itemId || !game) return; const e = evaluate(inputs()); if (!e.ok) { ui.sum.replaceChildren(el('p', 'msg err', e.error)); return; }
    const sc = S.mode === 'instant' ? e.base.instant : e.base.order, r = sc.calc, cfg = ctx.getCfg();
    ui.modeHint.textContent = S.mode === 'instant' ? 'INSTANT: compras al precio de venta más bajo y vendes a la orden de compra más alta. Solo pagas el impuesto de venta.'
      : 'ORDEN: publicas órdenes de compra y de venta. Pagas además la tarifa de publicación (2,5 %). Tarda más y no está garantizado que se llene.';
    // resumen
    const box = el('div'), pf = r.profit;
    const head = el('div', 'res'); head.appendChild(el('span', 'hint', 'Profit neto del lote'));
    head.appendChild(el('div', 'big ' + (pf === null ? '' : pf >= 0 ? 'pos' : 'neg'), pf === null ? 'Datos insuficientes' : (pf >= 0 ? '🟢 ' : '🔴 ') + fmt(pf) + ' silver'));
    box.appendChild(head);
    const kv = el('div', 'kv'); const kvi = (t, v) => { const d = el('div'); d.appendChild(el('small', '', t)); d.appendChild(el('b', '', v)); kv.appendChild(d); };
    kvi('ROI', r.roi === null ? '—' : pc(r.roi)); kvi('Silver/hora', r.silverPerHour === null ? '—' : fmt(r.silverPerHour)); kvi('Capital', r.totalCost === null ? '—' : fmt(r.totalCost));
    kvi('Unidades', fmt(r.made)); kvi('Retorno', e.base.rr.rate === null ? '—' : pc(e.base.rr.rate * 100, 2)); kvi('Impuesto de venta', e.base.taxPct + '%'); box.appendChild(kv);
    const fresh = freshness(sc.oldestMinutes === null ? null : sc.oldestMinutes * 60000), line = el('div', 'row'); line.appendChild(el('span', 'hint', 'Dato más viejo usado: ')); line.appendChild(chip(fresh)); line.appendChild(el('span', 'hint', ' ' + ageText(sc.oldestMinutes) + (sc.source ? ' · fuente: ' + sc.source : '')));
    box.appendChild(line);
    if (S.priceMsg) box.appendChild(el('div', 'warn', S.priceMsg));
    r.reasons.forEach(x => box.appendChild(el('div', 'warn bad', x)));
    if (fresh.level === 'NO_UTILIZAR') box.appendChild(el('div', 'warn bad', 'Hay datos de más de 24 horas: no se usarían para recomendaciones automáticas. Revisa esos precios en el juego.'));
    else if (fresh.level === 'DESACTUALIZADO' || fresh.level === 'PRECAUCION') box.appendChild(el('div', 'warn', 'Hay datos con más de 2 horas: úsalos con precaución.'));
    if (sc.missingAge && !S.priceBusy) box.appendChild(el('div', 'warn', 'Algún precio no tiene fecha (sin dato en tu base o escrito a mano).'));
    if (cfg.silver > 0 && r.totalCost !== null && r.totalCost > cfg.silver) box.appendChild(el('div', 'warn bad', 'Necesitas ' + fmt(r.totalCost) + ' silver y tienes ' + fmt(cfg.silver) + ': te faltan ' + fmt(r.totalCost - cfg.silver) + '.'));
    if (S.feeMode === 'total' && !num(S.feeTotal)) box.appendChild(el('div', 'warn', 'No ingresaste tarifa de estación: el profit está sobreestimado.'));
    if (e.base.rr.mode === 'MANUAL' && e.base.rr.rate === null) box.appendChild(el('div', 'warn bad', 'Esta ubicación no tiene fórmula de retorno verificada: escribe el retorno a mano.'));
    ui.sum.replaceChildren(box);
    if (rebuildMats === true || !ui.mats.firstChild) drawMats(e); else updateMatSources(e);
    drawBreakdown(sc, r, e); drawRefine(e); drawCompare(e);
  }

  function drawMats(e) {
    const rec = e.recipe, t = el('table', 'mat'), hr = el('tr'); ['Material', 'Cant.', 'Precio INSTANT', 'Precio ORDEN'].forEach(x => hr.appendChild(el('th', '', x))); t.appendChild(hr);
    ui.matInputs = {};
    rec.materials.forEach(m => {
      const tr = el('tr'); const td = el('td'); td.appendChild(document.createTextNode(game.name(m.item_id))); td.appendChild(el('div', 'sub', m.item_id + (m.returnable ? '' : ' · no retornable'))); tr.appendChild(td);
      tr.appendChild(el('td', '', fmt(m.quantity)));
      ['instant', 'order'].forEach(mode => {
        const auto = e.base[mode].priceSource[m.item_id] !== 'simulado' ? e.base[mode].calc.lines.find(l => l.item_id === m.item_id).price : null;
        const i = input(S.overrides[mode][m.item_id] != null ? S.overrides[mode][m.item_id] : (auto != null ? Math.round(auto) : ''), () => { const v = num(i.value); S.overrides[mode][m.item_id] = v > 0 ? v : null; if (v <= 0) delete S.overrides[mode][m.item_id]; calc(); }, { inputMode: 'numeric', placeholder: 'sin dato' });
        i.dataset.auto = auto != null ? Math.round(auto) : ''; ui.matInputs[mode + m.item_id] = i; const c = el('td'); c.appendChild(i); const s = el('div', 'src'); c.appendChild(s); tr.appendChild(c);
      });
      t.appendChild(tr);
    });
    const sale = el('tr'); sale.appendChild(el('td', '', 'Venta del producto')); sale.appendChild(el('td', '', fmt(e.base.instant.calc.made)));
    [['saleInstant', 'instant'], ['saleOrder', 'order']].forEach(([k, mode]) => {
      const auto = e.base[mode].saleSource !== 'simulado' && e.base[mode].calc.sale ? e.base[mode].calc.sale.unitPrice : null;
      const i = input(S.overrides[k] != null ? S.overrides[k] : (auto != null ? Math.round(auto) : ''), () => { const v = num(i.value); S.overrides[k] = v > 0 ? v : null; calc(); }, { inputMode: 'numeric', placeholder: mode === 'order' && S.saleCity === 'Black Market' ? 'no aplica' : 'sin dato' });
      i.disabled = mode === 'order' && S.saleCity === 'Black Market'; i.dataset.auto = auto != null ? Math.round(auto) : ''; ui.matInputs[k] = i; const c = el('td'); c.appendChild(i); c.appendChild(el('div', 'src')); sale.appendChild(c);
    });
    t.appendChild(sale);
    const w = el('div', 'tablewrap'); w.appendChild(t);
    const reset = el('button', '', 'Restablecer precios de la base'); reset.addEventListener('click', () => { S.overrides = { instant: {}, order: {}, saleInstant: null, saleOrder: null }; calc(true); });
    const d = el('details'); d.open = true; d.appendChild(el('summary', '', 'Precios usados (puedes cambiarlos para simular)')); d.append(w, el('p', 'hint', 'Cada precio dice de dónde viene: «propio» (tu captura), «público» (Albion Data Project) o «simulado» (lo escribiste tú). Si hay de los dos, se usa el más reciente.'), reset);
    ui.mats.replaceChildren(d); updateMatSources(e);
  }
  function updateMatSources(e) {
    const rec = e.recipe, rows = ui.mats.querySelectorAll('tr'); let k = 1;
    rec.materials.forEach(m => ['instant', 'order'].forEach(mode => {
      const i = ui.matInputs[mode + m.item_id]; if (!i) return; const src = i.parentElement.querySelector('.src'), v = S.overrides[mode][m.item_id], sim = v != null;
      const lab = e.base[mode].priceSource[m.item_id]; src.textContent = lab; src.className = 'src' + (lab === 'simulado' ? ' sim' : lab === 'público' ? ' pub' : '');
    }));
    [['saleInstant', 'instant'], ['saleOrder', 'order']].forEach(([key, mode]) => { const i = ui.matInputs[key]; if (!i) return; const src = i.parentElement.querySelector('.src'), sim = S.overrides[key] != null;
      const lab = e.base[mode].saleSource; src.textContent = i.disabled ? 'no aplica' : lab; src.className = 'src' + (lab === 'simulado' ? ' sim' : lab === 'público' ? ' pub' : ''); });
  }

  function row(tb, label, val, cls, sub) { if (val === 0) val = 0; if (typeof val === 'number' && Object.is(val, -0)) val = 0; const tr = el('tr', cls || ''); tr.appendChild(el('td', sub ? 'sub' : '', label)); tr.appendChild(el('td', val !== null && typeof val === 'number' && val < 0 ? 'neg' : '', val === null ? '—' : typeof val === 'number' ? fmt(val) : val)); tb.appendChild(tr); }
  function drawBreakdown(sc, r, e) {
    const t = el('table', 'bd'); const hr = el('tr'); hr.appendChild(el('th', '', 'Desglose del profit')); hr.appendChild(el('th', '', 'Silver')); t.appendChild(hr);
    const s = r.sale;
    row(t, 'Venta bruta (' + fmt(r.made) + ' × ' + (s ? fmt(s.unitPrice) : '—') + ')', s ? s.gross : null);
    row(t, '− Impuesto de venta (' + e.base.taxPct + '%)', s ? -s.tax : null, '', true);
    if (S.mode === 'order') row(t, '− Tarifa de publicación (2,5%)', s ? -s.setup : null, '', true);
    row(t, 'Venta neta', s ? s.net : null, 'tot');
    row(t, 'Materiales a comprar (tras retorno ' + (e.base.rr.rate === null ? '—' : pc(e.base.rr.rate * 100, 2)) + ')', r.materialCost === null ? null : -r.materialCost);
    row(t, '− Tarifa de estación' + (sc.feeRange.min !== sc.feeRange.max ? ' (tasa ' + (S.feeUse === 'min' ? 'mín.' : 'máx.') + ')' : ''), -r.craftingFee, '', true);
    row(t, '− Transporte', -r.transport, '', true); row(t, '− Otros costos', -r.otherCosts, '', true);
    row(t, 'Costo total (capital)', r.totalCost === null ? null : -r.totalCost, 'tot');
    row(t, 'Profit neto', r.profit, 'tot');
    if (S.feeMode === 'nutricion' && sc.feeRange.min !== sc.feeRange.max && r.profit !== null) row(t, 'Rango por tasa 300–900: de ' + fmt(r.profit + (r.craftingFee - sc.feeRange.max)) + ' a ' + fmt(r.profit + (r.craftingFee - sc.feeRange.min)), '', '', true);
    ui.bd.replaceChildren(t);
  }
  function drawRefine(e) {
    if (e.item.category !== 'refined') { ui.refine.replaceChildren(); return; }
    const rv = refineVsBuy({ units: e.base.instant.calc.made, buyMarket: S.buyProduct || {}, refine: { instant: e.base.instant.calc, order: e.base.order.calc }, setupPct: game.settings.taxes.setup_fee_pct, transportTotal: num(S.transportTotal), transportPerUnit: num(S.transportPerUnit) });
    const box = el('div'); box.appendChild(el('h2', '', '¿Refinar o comprar el refinado ya hecho?'));
    box.appendChild(el('p', 'hint', 'Mismas unidades y mismo destino de venta (' + S.saleCity + '). «Comprar directo» = comprar ' + game.name(S.itemId) + ' en ' + S.buyCity + ' y venderlo, sin refinar.'));
    const t = el('table'), hr = el('tr'); ['', 'INSTANT', 'ORDEN'].forEach(x => hr.appendChild(el('th', '', x))); t.appendChild(hr);
    const line = (label, f) => { const tr = el('tr'); tr.appendChild(el('td', '', label)); ['instant', 'order'].forEach(m => { const v = f(rv[m]); tr.appendChild(el('td', typeof v === 'number' && v < 0 ? 'neg' : '', v === null || v === undefined ? '—' : typeof v === 'number' ? fmt(v) : v)); }); t.appendChild(tr); };
    line('Precio de compra del refinado', x => x.unitBuy); line('Profit refinando', x => x.refineProfit); line('Profit comprando directo', x => x.directProfit);
    line('Conviene', x => x.better === 'refinar' ? 'Refinar (+' + fmt(x.diff) + ')' : x.better === 'comprar' ? 'Comprar directo (+' + fmt(-x.diff) + ')' : x.better === 'igual' ? 'Igual' : 'Datos insuficientes');
    box.appendChild(t);
    if (!S.buyProduct || !Object.keys(S.buyProduct).length) box.appendChild(el('div', 'warn', 'Tu base no tiene el precio de este refinado en ' + S.buyCity + ': no se puede comparar. Míralo en ese mercado del juego.'));
    ui.refine.replaceChildren(box);
  }
  function drawCompare(e) {
    const box = el('div'); box.appendChild(el('h2', '', 'Comparación (solo informativa)'));
    box.appendChild(el('p', 'hint', (!S.premium && !S.focus ? 'Tu escenario es sin Premium y sin Focus. ' : '') + 'Estos números muestran qué cambiaría; nunca se usan para recomendarte operaciones.' + (!S.focus && numDec(S.manualRate) !== null ? ' La comparación con Focus no aparece porque escribiste un retorno manual.' : '')));
    const t = el('table'), hr = el('tr'); ['Escenario', 'INSTANT', 'ORDEN'].forEach(x => hr.appendChild(el('th', '', x))); t.appendChild(hr);
    const add = (label, v) => { const tr = el('tr'); tr.appendChild(el('td', '', label)); [v.instant.calc.profit, v.order.calc.profit].forEach(p => tr.appendChild(el('td', p !== null && p < 0 ? 'neg' : '', p === null ? '—' : fmt(p)))); t.appendChild(tr); };
    add('Tu escenario' + (S.premium ? ' (con Premium)' : ' (sin Premium)') + (S.focus ? ' con Focus' : ''), e.base);
    if (e.comparisons.premium) add('Con Premium', e.comparisons.premium);
    if (e.comparisons.focus) add('Con Focus (retorno ' + pc(e.comparisons.focus.rr.rate * 100) + ')', e.comparisons.focus);
    box.appendChild(t); ui.cmp.replaceChildren(box);
  }

  return { show, game: () => game };
}
