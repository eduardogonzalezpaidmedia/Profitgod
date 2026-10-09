// Flip directo: compras al instante (a la orden de venta más barata) en una ciudad y vendes al instante (a la orden de compra más alta) en otra.
// Revisa todos los objetos T4–T8 en todas las ciudades, SIN Mercado Negro. Solo analiza datos; no toca el juego.
import { el, select, field } from './dom.js?v=0.22';
import { findFlips } from '../flipping/finder.js?v=0.22';
import { iconImg } from './dom.js?v=0.22';
import { fmt } from '../data/items.js?v=0.22';
import { ageText } from '../data/freshness.js?v=0.22';

const num = v => +String(v || '').replace(/[^\d]/g, '') || 0;
export const allIds = (game, tmin, tmax) => game.items.filter(i => i.tier >= tmin && i.tier <= tmax && i.enchantment === 0 && !/^QUESTITEM|^UNIQUE_|^TREASURE/.test(i.item_id) && (game.recipes.has(i.item_id) || ['refined', 'potions', 'food', 'bags', 'tools'].includes(i.category))).map(i => i.item_id);

export function mountFlip(body, ctx, game) {
  const cfg = ctx.getCfg(), S = { silver: cfg.silver || 0, tmin: 4, tmax: 8, age: 360, minProfit: 0, minRoi: 0, from: '', to: '' }; let rows = [], last = null; const ui = {};
  const cities = game.marketCities().filter(c => c !== 'Black Market');
  body.appendChild(el('p', 'hint', 'Busca en todas las ciudades (sin Mercado Negro) dónde COMPRAR directo —a la orden de venta más barata— y dónde VENDER directo —a la orden de compra más alta— en otra ciudad. La ganancia ya descuenta el impuesto de venta (' + (cfg.premium ? '4%, Premium' : '8%, sin Premium') + '). No necesitas poner órdenes ni esperar.'));
  const g = el('div', 'grid2');
  ui.silver = el('input'); ui.silver.inputMode = 'numeric'; ui.silver.placeholder = 'Sin límite'; ui.silver.value = S.silver ? fmt(S.silver) : ''; ui.silver.addEventListener('change', () => { S.silver = num(ui.silver.value); ui.silver.value = S.silver ? fmt(S.silver) : ''; });
  ui.tmin = select([4, 5, 6, 7, 8].map(t => [t, 'T' + t]), S.tmin, () => { S.tmin = +ui.tmin.value; }); ui.tmax = select([4, 5, 6, 7, 8].map(t => [t, 'T' + t]), S.tmax, () => { S.tmax = +ui.tmax.value; });
  ui.age = select([[30, 'Máx. 30 min'], [60, 'Máx. 1 hora'], [180, 'Máx. 3 horas'], [360, 'Máx. 6 horas'], [1440, 'Máx. 24 horas'], [4320, 'Máx. 3 días'], [10080, 'Máx. 7 días']], S.age, () => { S.age = +ui.age.value; if (rows.length && S.age > (last && last.maxAge || 1440)) ui.msg.textContent = 'Pulsa «Buscar» otra vez para leer también los datos más viejos.'; else if (rows.length) draw(); });
  ui.from = select([['', 'Cualquiera']].concat(cities.map(c => [c, c])), '', () => { S.from = ui.from.value; if (rows.length) draw(); }); ui.to = select([['', 'Cualquiera']].concat(cities.map(c => [c, c])), '', () => { S.to = ui.to.value; if (rows.length) draw(); });
  ui.minP = el('input'); ui.minP.inputMode = 'numeric'; ui.minP.placeholder = '0'; ui.minP.addEventListener('change', () => { S.minProfit = num(ui.minP.value); if (rows.length) draw(); });
  ui.minR = el('input'); ui.minR.inputMode = 'numeric'; ui.minR.placeholder = '0'; ui.minR.addEventListener('change', () => { S.minRoi = num(ui.minR.value); if (rows.length) draw(); });
  g.append(field('Silver que tienes (opcional)', ui.silver), field('Tier desde', ui.tmin), field('Tier hasta', ui.tmax), field('Antigüedad de los datos', ui.age), field('Comprar en', ui.from), field('Vender en', ui.to), field('Ganancia mínima por unidad', ui.minP), field('ROI mínimo %', ui.minR)); body.appendChild(g);
  ui.go = el('button', 'cta', '🔁 Buscar flips en todos los mercados'); ui.msg = el('p', 'msg'); ui.out = el('div', 'flout'); body.append(ui.go, ui.msg, ui.out);
  ui.go.addEventListener('click', run);

  async function run() {
    const src = ctx.getSrc(); if (!src.usable()) { ui.msg.className = 'msg err'; ui.msg.textContent = 'Conecta tu base o activa los datos públicos en Configuración.'; return; }
    const ids = allIds(game, Math.min(S.tmin, S.tmax), Math.max(S.tmin, S.tmax)); ui.go.disabled = true; ui.go.textContent = 'Leyendo mercados…'; ui.msg.className = 'msg'; ui.msg.textContent = 'Leyendo ' + fmt(ids.length) + ' objetos en ' + cities.length + ' ciudades. Puede tardar 1–2 minutos…'; ui.out.replaceChildren();
    try {
      last = await findFlips({ src, game, cfg: ctx.getCfg(), buy: cities, sell: cities, silver: S.silver, maxAge: S.age, extra: ids, top: 600, limit: 300, noHist: true, profile: {} });
      last.maxAge = S.age; rows = last.out; const errs = last.info.errs; ui.msg.className = errs.length ? 'msg err' : 'msg'; ui.msg.textContent = errs.join(' · ').replace(/Failed to fetch/g, 'no se pudo conectar'); draw();
    } catch (e) { ui.msg.className = 'msg err'; ui.msg.textContent = e.message.includes('Failed to fetch') ? 'No se pudo conectar con tu base.' : e.message; }
    ui.go.disabled = false; ui.go.textContent = '🔁 Buscar flips en todos los mercados';
  }
  const srcTag = s => el('span', 'tag ' + (s === 'propio' ? 'ok' : ''), s || 'sin dato');
  function draw() {
    const l = rows.filter(o => Math.max(o.buyAge, o.sellAge) <= S.age && (!S.from || o.from === S.from) && (!S.to || o.to === S.to) && o.unitProfit >= S.minProfit && o.unitRoi >= S.minRoi && o.w.units > 0 && o.w.profit > 0)
      .sort((a, b) => b.w.profit - a.w.profit).slice(0, 100);
    ui.out.replaceChildren();
    if (!l.length) { ui.out.appendChild(el('p', 'hint', rows.length ? 'Ninguna cumple tus filtros. Prueba con datos más viejos o menos ganancia mínima.' : 'Pulsa el botón para buscar. Elige hasta qué antigüedad de datos quieres ver (hasta 7 días).')); return; }
    if (S.age > 1440) ui.out.appendChild(el('p', 'msg err', '⚠️ Con datos de más de 1 día los precios pueden haber cambiado mucho: confírmalos en el mercado antes de comprar.'));
    ui.out.appendChild(el('p', 'hint', fmt(l.length) + ' oportunidades (ordenadas por ganancia total). «~» = cantidad no verificada con tu base: es una suposición, no la confíes sin mirar el mercado.'));
    l.forEach(o => { const c = el('div', 'fl-card'), top = el('div', 'fl-top'); top.append(iconImg([o.item_id], 48), el('div', 'fl-name', o.label), el('div', 'fl-profit', '+' + fmt(o.w.profit)));
      const buy = el('div', 'fl-line'); buy.append(el('b', '', '🛒 Comprar en ' + o.from), document.createTextNode(' a ' + fmt(o.buyUnit) + ' c/u (orden de venta, compra directa) · '), srcTag(o.buySrc), document.createTextNode(' · ' + ageText(o.buyAge)));
      const sell = el('div', 'fl-line'); sell.append(el('b', '', '💰 Vender en ' + o.to), document.createTextNode(' a ' + fmt(o.sellUnit) + ' c/u (orden de compra, venta directa) · '), srcTag(o.sellSrc), document.createTextNode(' · ' + ageText(o.sellAge)));
      const meta = el('div', 'fl-meta', 'Por unidad: +' + fmt(o.unitProfit) + ' (' + o.unitRoi.toFixed(1) + '% ROI) · ' + (o.depthKnown ? '' : '~') + fmt(o.w.units) + ' unidades · invertirías ' + fmt(o.w.cost) + ' · te quedan +' + fmt(o.w.profit) + ' tras impuesto');
      c.append(top, buy, sell, meta); ui.out.appendChild(c); });
  }
}
