// Flipping: comprar en una ciudad, llevar, vender en otra (en especial el Mercado Negro). Usa tus datos y los públicos, marcando el origen.
import { $, el, chip, field, select, input, num } from './dom.js';
import { loadGameData, CATEGORY_LABEL, QUALITIES } from '../crafting/recipes.js';
import { findFlips } from '../flipping/finder.js';
import { freshness, ageText } from '../data/freshness.js';
import { fmt } from '../data/items.js';
import { kv, scoreBlock } from './explain.js';

const LIM = { margen: 'se acabó el margen: la siguiente unidad ya no deja ganancia', silver: 'tu silver disponible', unidades: 'tu máximo de unidades o el tope prudente de 2/3 de lo que piden (para no hundir el precio)', oferta: 'las unidades que hay a la venta en la ciudad de compra', demanda: 'las unidades que piden en la ciudad de venta' };
const pc = (n, d = 1) => n.toFixed(d).replace('.', ',') + '%';
const flat = r => ({ item_id: r.item_id, city: r.city, quality: r.quality, sell_min: r.sell.price, sell_age: r.sell.age, sell_amount: r.sell.amount, sell_src: r.sell.src, buy_max: r.buy.price, buy_age: r.buy.age, buy_amount: r.buy.amount, buy_src: r.buy.src });
const srcTag = s => { const t = el('span', 'tag ' + (s === 'propio' ? 'own' : s === 'público' ? 'pub' : ''), s || 'sin dato'); return t; };

export function mountFlip(root, ctx) {
  let game = null, built = false, results = [], all = [], lastInfo = null;
  const S = { buy: new Set(), sell: new Set(), onlyBM: false, minProfit: '', minRoi: '', cat: '', tmin: 4, tmax: 6 }, ui = {};

  async function show() {
    if (built) return;
    root.replaceChildren(el('p', 'hint', 'Cargando datos del juego…'));
    try { game = await loadGameData(); } catch (e) { root.replaceChildren(el('p', 'msg err', e.message)); return; }
    game.marketCities().filter(c => c !== 'Black Market').forEach(c => S.buy.add(c)); game.marketCities().forEach(c => S.sell.add(c)); build();
  }
  function chips(set, cities, onChange) {
    const box = el('div', 'chips');
    cities.forEach(c => { const b = el('button', set.has(c) ? 'on' : '', c); b.addEventListener('click', () => { set.has(c) ? set.delete(c) : set.add(c); b.classList.toggle('on', set.has(c)); if (onChange) onChange(); }); box.appendChild(b); });
    return box;
  }
  function build() {
    built = true; root.replaceChildren();
    const c1 = el('section', 'card'); c1.appendChild(el('h2', '', 'Flipping entre ciudades'));
    c1.appendChild(el('p', 'hint', 'Busca objetos que se compran barato en una ciudad y se venden más caros en otra, con ganancia después de impuestos. Usa tus datos y los públicos; cada precio dice de dónde viene.'));
    const cities = game.marketCities();
    c1.appendChild(el('div', 'hint', 'Comprar en')); c1.appendChild(chips(S.buy, cities.filter(c => c !== 'Black Market')));
    c1.appendChild(el('div', 'hint', 'Vender en')); ui.sellChips = chips(S.sell, cities); c1.appendChild(ui.sellChips);
    const bm = el('button', '', 'Solo Mercado Negro'); bm.addEventListener('click', () => { S.onlyBM = !S.onlyBM; bm.classList.toggle('on', S.onlyBM); }); const r0 = el('div', 'chips'); r0.appendChild(bm); c1.appendChild(r0);
    const g = el('div', 'grid');
    ui.silver = input(ctx.getCfg().silver ? fmt(ctx.getCfg().silver) : '', null, { inputMode: 'numeric', placeholder: 'silver disponible' });
    ui.maxU = input(ctx.getCfg().maxUnits || '', null, { inputMode: 'numeric', placeholder: 'sin límite' });
    ui.minP = input('', null, { inputMode: 'numeric', placeholder: '0' }); ui.minR = input('', null, { inputMode: 'numeric', placeholder: '0' });
    g.append(field('Silver disponible', ui.silver), field('Máx. unidades por operación', ui.maxU), field('Profit mínimo', ui.minP), field('ROI mínimo %', ui.minR));
    c1.appendChild(g);
    const fd = el('details'); fd.open = true; fd.appendChild(el('summary', '', 'Filtros y orden (se aplican al instante, sin volver a leer precios)'));
    const g3 = el('div', 'grid'), re = () => { if (all.length || results.length) applyFilters(); };
    ui.minS = input('', re, { inputMode: 'numeric', placeholder: '0' });
    ui.maxRisk = select([['ALTO', 'Cualquiera'], ['MEDIO', 'Hasta medio'], ['BAJO', 'Solo bajo']], ({ bajo: 'BAJO', medio: 'MEDIO', alto: 'ALTO' })[ctx.getCfg().risk] || 'BAJO', re);
    ui.minLiq = select([['', 'Cualquiera'], ['BAJA', 'Baja o más'], ['MEDIA', 'Media o más'], ['ALTA', 'Alta o más']], '', re);
    ui.maxAge = select([[1440, 'Hasta 24 h'], [720, 'Hasta 12 h'], [120, 'Hasta 2 h'], [30, 'Hasta 30 min']], 1440, re);
    ui.sort = select([['score', 'Puntaje'], ['profit', 'Profit total'], ['roi', 'ROI'], ['sph', 'Silver por hora']], 'score', re);
    ui.noAn = select([['0', 'Mostrar con avisos'], ['1', 'Ocultar con avisos']], '0', re);
    [ui.minP, ui.minR].forEach(x => x.addEventListener('input', re));
    g3.append(field('Ordenar por', ui.sort), field('Puntaje mínimo', ui.minS), field('Riesgo máximo', ui.maxRisk), field('Liquidez mínima', ui.minLiq), field('Antigüedad máxima del dato', ui.maxAge), field('Avisos de anomalía', ui.noAn));
    fd.appendChild(g3); c1.appendChild(fd);
    const d = el('details'); d.appendChild(el('summary', '', 'Ampliar con datos públicos (objetos que aún no tengo en mi base)'));
    const g2 = el('div', 'grid'); ui.cat = select([['', 'Ninguno']].concat(Object.entries(CATEGORY_LABEL).filter(([k]) => ['weapons', 'armor', 'head', 'shoes', 'offhands', 'capes', 'bags'].includes(k))), '');
    ui.tmin = select([4, 5, 6, 7, 8].map(x => [x, 'T' + x]), S.tmin); ui.tmax = select([4, 5, 6, 7, 8].map(x => [x, 'T' + x]), S.tmax);
    g2.append(field('Categoría a revisar', ui.cat), field('Tier desde', ui.tmin), field('Tier hasta', ui.tmax)); d.appendChild(g2);
    d.appendChild(el('p', 'hint', 'Sin esto solo se revisan los objetos que ya pasaste por el mercado. Con esto se consultan los públicos de esa categoría (máx. 600 objetos, normales y calidad 1) para descubrir oportunidades; no traen cantidades, así que quedan marcadas como «no verificadas».'));
    c1.appendChild(d);
    ui.go = el('button', 'primary', 'Buscar oportunidades'); ui.go.addEventListener('click', run); ui.msg = el('span', 'msg'); const row = el('div', 'row'); row.append(ui.go, ui.msg); c1.appendChild(row); root.appendChild(c1);
    ui.out = el('section', 'card'); ui.out.hidden = true; root.appendChild(ui.out);
  }

  async function run() {
    const src = ctx.getSrc(), cfg = ctx.getCfg();
    const msg = (t, err) => { ui.msg.className = 'msg' + (err ? ' err' : ''); ui.msg.textContent = t; };
    if (!src.usable()) return msg('Conecta tu base o activa los datos públicos en «Mis datos».', true);
    const sell = [...S.sell].filter(c => !S.onlyBM || c === 'Black Market'), buy = [...S.buy];
    if (!buy.length || !sell.length) return msg('Elige al menos una ciudad para comprar y una para vender.', true);
    ui.go.disabled = true; msg('Leyendo precios y calculando…');
    try {
      let extra = []; const cat = ui.cat.value, t1 = +ui.tmin.value, t2 = +ui.tmax.value;
      if (cat) extra = game.items.filter(i => i.category === cat && i.tier >= t1 && i.tier <= t2 && i.enchantment === 0 && game.recipes.has(i.item_id)).map(i => i.item_id).slice(0, 600);
      const r = await findFlips({ src, game, cfg, buy, sell, silver: num(ui.silver.value), maxUnits: num(ui.maxU.value), extra });
      all = r.out; lastInfo = r.info; msg(r.info.errs.join(' · '), r.info.errs.length > 0); applyFilters();
    } catch (e) { msg(e.message.includes('Failed to fetch') ? 'No se pudo conectar.' : e.message, true); }
    ui.go.disabled = false;
  }
  const RISK_ORDER = { BAJO: 0, MEDIO: 1, ALTO: 2 }, LIQ_ORDER = ['MUY BAJA', 'BAJA', 'MEDIA', 'ALTA', 'MUY ALTA'];
  function applyFilters() {
    const minP = num(ui.minP.value), minR = num(ui.minR.value), minS = num(ui.minS.value), maxRisk = ui.maxRisk.value, minLiq = ui.minLiq.value, maxAge = +ui.maxAge.value, sort = ui.sort.value, noAn = ui.noAn.value === '1';
    results = all.filter(o => o.w.profit >= minP && (o.w.roi === null || o.w.roi >= minR) && (o.opp.score === null ? false : o.opp.score >= minS) && RISK_ORDER[o.risk.level] <= RISK_ORDER[maxRisk]
      && (minLiq === '' || LIQ_ORDER.indexOf(o.liquidity) >= LIQ_ORDER.indexOf(minLiq)) && o.oldest <= maxAge && (!noAn || !o.anomalies.length));
    const key = { score: o => o.opp.score || 0, profit: o => o.w.profit, roi: o => o.w.roi || 0, sph: o => o.sph || 0 }[sort];
    results.sort((a, b) => key(b) - key(a)); draw();
  }

  function draw() {
    ui.out.hidden = false; ui.out.replaceChildren(el('h2', '', results.length ? 'Mejores oportunidades' : 'Sin oportunidades'));
    ui.out.appendChild(el('p', 'hint', 'Venta INSTANT a las órdenes de compra visibles, después de impuesto. Toca una para ver el puntaje, de dónde sale cada número y los avisos. El silver/hora usa tiempos estimados (' + (ctx.getCfg().tripMin || 15) + ' min de viaje + ' + (ctx.getCfg().actionMin || 5) + ' min de compra/venta; los cambias en «Mis datos»).'));
    if (!results.length) ui.out.appendChild(el('div', 'warn', all.length ? 'Ninguna pasa los filtros que pusiste (' + all.length + ' oportunidades sin filtrar). Afloja los filtros.' : 'No hay ganancias con datos de menos de 24 horas en lo que revisé. Pasa por más mercados del juego (o amplía con datos públicos) y vuelve a buscar.'));
    results.forEach(o => {
      const r = el('div', 'fl'), t = el('div', 't'); t.appendChild(el('b', '', game.label(o.item_id) + (o.quality > 1 ? ' · ' + QUALITIES[o.quality - 1].label : ''))); t.appendChild(el('span', 'p', '🟢 ' + fmt(o.w.profit)));
      r.appendChild(t); r.appendChild(el('div', 'hint', o.from + ' → ' + o.to + ' · ' + fmt(o.w.units) + ' unid. · capital ' + fmt(o.w.cost) + ' · ROI ' + pc(o.w.roi) + ' · ~' + fmt(Math.round(o.sph || 0)) + ' silver/h (estimado)'));
      const m = el('div', 'm'); m.appendChild(el('span', 'tag score', 'puntaje ' + o.opp.score)); m.appendChild(chip(freshness(o.oldest * 60000))); m.appendChild(el('span', 'tag', 'liquidez ' + o.liquidity)); m.appendChild(el('span', 'tag', 'riesgo ' + o.risk.level));
      if (o.anomalies.length) m.appendChild(el('span', 'tag warnt', '⚠ ' + o.anomalies.length + (o.anomalies.length === 1 ? ' aviso' : ' avisos')));
      m.appendChild(el('span', 'hint', 'compra')); m.appendChild(srcTag(o.buySrc)); m.appendChild(el('span', 'hint', 'venta')); m.appendChild(srcTag(o.sellSrc)); if (!o.depthKnown) m.appendChild(el('span', 'tag', 'cantidad no verificada'));
      r.appendChild(m); r.addEventListener('click', () => detail(o)); ui.out.appendChild(r);
    });
    if (lastInfo) ui.out.appendChild(el('p', 'hint', 'Datos usados: ' + fmt(lastInfo.ownCount) + ' precios tuyos y ' + fmt(lastInfo.pubCount) + ' públicos' + (lastInfo.truncated ? ' (tu base tiene más de los que caben en una consulta; se usaron los más recientes)' : '') + '.'));
    if (!ui.out.dataset.seen) { ui.out.dataset.seen = '1'; ui.out.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  function srcLine(label, side, city) {
    const p = el('p', 'hint'); p.appendChild(document.createTextNode(label + ' en ' + city + ': ')); p.appendChild(srcTag(side.src)); p.appendChild(document.createTextNode(' ' + fmt(side.price) + ' · hace ' + ageText(side.age)));
    const both = []; if (side.ownPrice != null) both.push('propio ' + fmt(side.ownPrice) + ' (hace ' + ageText(side.ownAge) + ')'); if (side.pubPrice != null) both.push('público ' + fmt(side.pubPrice) + ' (hace ' + ageText(side.pubAge) + ')');
    if (both.length > 1) p.appendChild(document.createTextNode(' — se eligió el más reciente. ' + both.join(' · '))); return p;
  }
  function detail(o) {
    const b = $('dlgBody'); b.replaceChildren(el('h2', '', game.label(o.item_id)), el('p', 'hint', o.from + ' → ' + o.to + ' · calidad ' + o.quality + ' · ' + o.item_id));
    const big = el('div', 'res'); big.appendChild(el('div', 'big pos', '🟢 ' + fmt(o.w.profit) + ' silver')); big.appendChild(el('span', 'hint', 'ROI ' + pc(o.w.roi) + ' sobre ' + fmt(o.w.cost) + ' de capital')); b.appendChild(big);
    scoreBlock(b, o);
    const t = el('table', 'bd'); kv(t, 'Unidades', fmt(o.w.units)); kv(t, 'Compra promedio en ' + o.from, fmt(o.w.avgBuy)); kv(t, 'Costo total', fmt(-o.w.cost), 'neg');
    kv(t, 'Venta promedio en ' + o.to, fmt(o.w.avgSell)); kv(t, 'Venta bruta', fmt(o.w.gross)); kv(t, '− Impuesto de venta', fmt(-o.w.tax), 'neg'); kv(t, 'Venta neta', fmt(o.w.net)); kv(t, 'Profit neto', fmt(o.w.profit)); b.appendChild(t);
    b.appendChild(el('p', 'hint', 'Cantidad limitada por: ' + (LIM[o.w.limitedBy] || o.w.limitedBy) + '.' + (o.depthKnown ? '' : ' No se conocen las órdenes (el precio es público): se supusieron ' + fmt(ctx.getCfg().unknownDepthUnits || 10) + ' unidades. Verifica en el juego cuántas hay.')));
    b.appendChild(el('h2', '', 'De dónde salen los precios')); b.appendChild(srcLine('Compra', o.ra.sell, o.from)); b.appendChild(srcLine('Venta', o.rb.buy, o.to));
    const rk = el('div'); rk.appendChild(el('h2', '', 'Riesgo: ' + o.risk.level + ' (' + o.risk.points + ' puntos)')); const ul = el('ul'); o.risk.reasons.forEach(x => ul.appendChild(el('li', '', x))); rk.appendChild(ul); b.appendChild(rk);
    b.appendChild(el('p', 'hint', 'Liquidez: ' + o.liquidity + (o.liquidity === 'SIN DATO' ? ' (no hay cantidades de órdenes de compra)' : ' (' + fmt(o.demand) + ' unidades pedidas en las órdenes visibles; es lo que piden ahora, no lo que se vende de verdad)') + '.'));
    if (o.oe) b.appendChild(el('p', 'hint', 'Con órdenes propias (ORDEN, tarda y no está garantizado): profit estimado ' + fmt(o.oe.profit) + ' sobre ' + fmt(o.oe.cost) + '.')); else if (o.to === 'Black Market') b.appendChild(el('p', 'hint', 'ORDEN no aplica: en el Mercado Negro no se publican órdenes de venta.'));
    b.appendChild(el('h2', '', 'Historial propio del precio en ' + o.to));
    b.appendChild(el('p', 'hint', o.hv.enough ? o.hv.points + ' registros' + (o.hv.coveredDays ? ' en ' + o.hv.coveredDays + ' días' : '') + ' · promedio ' + fmt(o.hv.avg) + ' · mín ' + fmt(o.hv.min) + ' · máx ' + fmt(o.hv.max) + ' · variación ' + o.hv.volatilityPct + '%' + (o.hv.vsAvgPct != null ? ' · precio actual ' + (o.hv.vsAvgPct >= 0 ? '+' : '') + pc(o.hv.vsAvgPct) + ' frente al promedio' : '') : 'Datos insuficientes: ' + (o.hv.points || 0) + ' registros (se necesitan al menos 5). Se acumulan cada vez que abres este objeto en el mercado con el programa del PC.'));
    $('dlg').showModal();
  }
  return { show };
}
