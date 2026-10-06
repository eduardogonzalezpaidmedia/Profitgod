// Flipping: comprar en una ciudad, llevar, vender en otra (en especial el Mercado Negro). Usa tus datos y los públicos, marcando el origen.
import { $, el, chip, field, select, input, num } from './dom.js';
import { loadGameData, CATEGORY_LABEL, QUALITIES } from '../crafting/recipes.js';
import { scan, walk, orderEstimate, liquidityLevel } from '../flipping/flipping.js';
import { flipRisk, historyView } from '../black-market/risk.js';
import { freshness, ageText } from '../data/freshness.js';
import { fmt } from '../data/items.js';

const LIM = { margen: 'se acabó el margen: la siguiente unidad ya no deja ganancia', silver: 'tu silver disponible', unidades: 'tu máximo de unidades', oferta: 'las unidades que hay a la venta en la ciudad de compra', demanda: 'las unidades que piden en la ciudad de venta' };
const pc = (n, d = 1) => n.toFixed(d).replace('.', ',') + '%';
const flat = r => ({ item_id: r.item_id, city: r.city, quality: r.quality, sell_min: r.sell.price, sell_age: r.sell.age, sell_amount: r.sell.amount, sell_src: r.sell.src, buy_max: r.buy.price, buy_age: r.buy.age, buy_amount: r.buy.amount, buy_src: r.buy.src });
const srcTag = s => { const t = el('span', 'tag ' + (s === 'propio' ? 'own' : s === 'público' ? 'pub' : ''), s || 'sin dato'); return t; };

export function mountFlip(root, ctx) {
  let game = null, built = false, results = [], lastInfo = null;
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
    ui.go.disabled = true; msg('Leyendo precios…');
    try {
      const silver = num(ui.silver.value), maxUnits = num(ui.maxU.value), minP = num(ui.minP.value), minR = num(ui.minR.value), unk = cfg.unknownDepthUnits || 10;
      const taxPct = cfg.premium ? game.settings.taxes.sales_tax_premium_pct : game.settings.taxes.sales_tax_no_premium_pct, setupPct = game.settings.taxes.setup_fee_pct;
      let extra = []; const cat = ui.cat.value, t1 = +ui.tmin.value, t2 = +ui.tmax.value;
      if (cat) extra = game.items.filter(i => i.category === cat && i.tier >= t1 && i.tier <= t2 && i.enchantment === 0 && game.recipes.has(i.item_id)).map(i => i.item_id).slice(0, 600);
      const cities = [...new Set([...buy, ...sell])];
      const mk = await src.market(cities, { maxage: 1440, limit: 8000, extraIds: extra });
      const info = { ownCount: mk.ownCount, pubCount: mk.pubCount, items: mk.itemCount, truncated: mk.truncated, errs: [mk.ownError && 'Tu base: ' + mk.ownError, mk.pubError && 'Datos públicos: ' + mk.pubError].filter(Boolean) };
      const rows = mk.rows.map(flat), idx = new Map(mk.rows.map(r => [r.city + '|' + r.item_id + '|' + r.quality, r]));
      msg('Calculando…');
      const cand = scan(rows, { buyCities: buy, sellCities: sell, taxPct, maxAgeMin: 1440, unknownUnits: unk, top: 40 });
      // órdenes (precio y cantidad) de tu base para los candidatos
      const books = new Map(); const ids = [...new Set(cand.map(c => c.item_id))];
      if (src.own.on() && ids.length) for (let i = 0; i < ids.length; i += 100) { try { (await src.own.book(ids.slice(i, i + 100), cities)).rows.forEach(b => books.set(b.city + '|' + b.item_id + '|' + b.quality, b)); } catch (e) { info.errs.push('Tu base (órdenes): ' + e.message); } }
      let out = cand.map(c => {
        const ra = idx.get(c.from + '|' + c.item_id + '|' + c.quality), rb = idx.get(c.to + '|' + c.item_id + '|' + c.quality);
        const ba = books.get(c.from + '|' + c.item_id + '|' + c.quality), bb = books.get(c.to + '|' + c.item_id + '|' + c.quality);
        const sellBook = c.buySrc === 'propio' && ba && ba.sell.length ? ba.sell : [[c.buyUnit, unk]], buyBook = c.sellSrc === 'propio' && bb && bb.buy.length ? bb.buy : [[c.sellUnit, unk]];
        const depthKnown = c.buySrc === 'propio' && ba && ba.sell.length > 0 && c.sellSrc === 'propio' && bb && bb.buy.length > 0;
        const w = walk({ sellBook, buyBook, taxPct, silver, maxUnits });
        const oe = orderEstimate({ buyCityBuyMax: ra && ra.buy.price, sellCitySellMin: rb && rb.sell.price, units: w.units, taxPct, setupPct, toBlackMarket: c.to === 'Black Market' });
        return Object.assign({}, c, { ra, rb, w, depthKnown, oe, oldest: Math.max(c.buyAge, c.sellAge), liquidity: c.sellSrc === 'propio' && bb && bb.buy.length ? liquidityLevel(c.demand) : 'SIN DATO' });
      }).filter(o => o.w.units > 0 && o.w.profit > 0);
      out.sort((a, b) => b.w.profit - a.w.profit); out = out.slice(0, 20);
      // historial propio del destino (volatilidad) para el riesgo
      await Promise.all(out.map(async o => { o.hist = null; if (!src.own.on()) return; try { o.hist = await src.own.history(o.item_id, o.to, o.quality, 14); } catch (e) { /* sin historial */ } }));
      out.forEach(o => { o.hv = historyView(o.hist, o.sellUnit, 'buy');
        o.risk = flipRisk({ cost: o.w.cost, from: o.from, to: o.to, units: o.w.units, demand: o.depthKnown ? o.demand : null, depthKnown: o.depthKnown, roi: o.w.roi, oldestMin: o.oldest, volatilityPct: o.hv.enough ? o.hv.volatilityPct : null, historyPoints: o.hv.points }); });
      results = out.filter(o => o.w.profit >= minP && (o.w.roi === null || o.w.roi >= minR)); lastInfo = info;
      msg(info.errs.join(' · '), info.errs.length > 0); draw();
    } catch (e) { msg(e.message.includes('Failed to fetch') ? 'No se pudo conectar.' : e.message, true); }
    ui.go.disabled = false;
  }

  function draw() {
    ui.out.hidden = false; ui.out.replaceChildren(el('h2', '', results.length ? 'Mejores oportunidades' : 'Sin oportunidades'));
    ui.out.appendChild(el('p', 'hint', 'Venta INSTANT a las órdenes de compra visibles, después de impuesto. Ordenado por profit total. Toca una para ver de dónde sale cada número.'));
    if (!results.length) ui.out.appendChild(el('div', 'warn', 'No hay ganancias con datos de menos de 24 horas en lo que revisé. Pasa por más mercados del juego (o amplía con datos públicos) y vuelve a buscar.'));
    results.forEach(o => {
      const r = el('div', 'fl'), t = el('div', 't'); t.appendChild(el('b', '', game.label(o.item_id) + (o.quality > 1 ? ' · ' + QUALITIES[o.quality - 1].label : ''))); t.appendChild(el('span', 'p', '🟢 ' + fmt(o.w.profit)));
      r.appendChild(t); r.appendChild(el('div', 'hint', o.from + ' → ' + o.to + ' · ' + fmt(o.w.units) + ' unid. · capital ' + fmt(o.w.cost) + ' · ROI ' + pc(o.w.roi)));
      const m = el('div', 'm'); m.appendChild(chip(freshness(o.oldest * 60000))); m.appendChild(el('span', 'tag', 'liquidez ' + o.liquidity)); m.appendChild(el('span', 'tag', 'riesgo ' + o.risk.level));
      m.appendChild(el('span', 'hint', 'compra')); m.appendChild(srcTag(o.buySrc)); m.appendChild(el('span', 'hint', 'venta')); m.appendChild(srcTag(o.sellSrc)); if (!o.depthKnown) m.appendChild(el('span', 'tag', 'cantidad no verificada'));
      r.appendChild(m); r.addEventListener('click', () => detail(o)); ui.out.appendChild(r);
    });
    if (lastInfo) ui.out.appendChild(el('p', 'hint', 'Datos usados: ' + fmt(lastInfo.ownCount) + ' precios tuyos y ' + fmt(lastInfo.pubCount) + ' públicos' + (lastInfo.truncated ? ' (tu base tiene más de los que caben en una consulta; se usaron los más recientes)' : '') + '.'));
    ui.out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function kv(t, label, val, cls) { const tr = el('tr'); tr.appendChild(el('td', '', label)); tr.appendChild(el('td', cls || '', val)); t.appendChild(tr); }
  function srcLine(label, side, city) {
    const p = el('p', 'hint'); p.appendChild(document.createTextNode(label + ' en ' + city + ': ')); p.appendChild(srcTag(side.src)); p.appendChild(document.createTextNode(' ' + fmt(side.price) + ' · hace ' + ageText(side.age)));
    const both = []; if (side.ownPrice != null) both.push('propio ' + fmt(side.ownPrice) + ' (hace ' + ageText(side.ownAge) + ')'); if (side.pubPrice != null) both.push('público ' + fmt(side.pubPrice) + ' (hace ' + ageText(side.pubAge) + ')');
    if (both.length > 1) p.appendChild(document.createTextNode(' — se eligió el más reciente. ' + both.join(' · '))); return p;
  }
  function detail(o) {
    const b = $('dlgBody'); b.replaceChildren(el('h2', '', game.label(o.item_id)), el('p', 'hint', o.from + ' → ' + o.to + ' · calidad ' + o.quality + ' · ' + o.item_id));
    const big = el('div', 'res'); big.appendChild(el('div', 'big pos', '🟢 ' + fmt(o.w.profit) + ' silver')); big.appendChild(el('span', 'hint', 'ROI ' + pc(o.w.roi) + ' sobre ' + fmt(o.w.cost) + ' de capital')); b.appendChild(big);
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
