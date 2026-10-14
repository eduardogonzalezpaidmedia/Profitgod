// Flip directo (diseño tipo calculadora de flipping): tabla con ítem, última actualización, ciudad y precio de compra, ciudad y precio de venta,
// ganancia por ítem y margen. Compras al instante (orden de venta más barata) y vendes al instante (orden de compra más alta) en otra ciudad.
// Usa por defecto SOLO los datos que tomó tu Albion Data Client en tu base («propio»). Solo analiza datos; no toca el juego.
import { el, select, iconImg } from './dom.js?v=0.23';
import { findFlips } from '../flipping/finder.js?v=0.23';
import { QUALITIES } from '../crafting/recipes.js?v=0.23';
import { fmt } from '../data/items.js?v=0.23';
import { ageText } from '../data/freshness.js?v=0.23';

const num = v => +String(v || '').replace(/[^\d]/g, '') || 0;
export const allIds = (game, tmin, tmax) => game.items.filter(i => i.tier >= tmin && i.tier <= tmax && i.enchantment === 0 && !/^QUESTITEM|^UNIQUE_|^TREASURE/.test(i.item_id) && (game.recipes.has(i.item_id) || ['refined', 'potions', 'food', 'bags', 'tools'].includes(i.category))).map(i => i.item_id);
const SORTS = [['profit', 'Ganancia por ítem'], ['margin', 'Margen %'], ['total', 'Ganancia total'], ['recent', 'Más recientes']];
const LS = 'profitgod.flip';
const load = () => { try { const j = JSON.parse(localStorage.getItem(LS)); return j && typeof j === 'object' ? j : {}; } catch (e) { return {}; } };
const store = s => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch (e) { /* sin almacenamiento */ } };

export function mountFlip(body, ctx, game) {
  const cfg = ctx.getCfg(), cities = game.marketCities(), saved = load();
  const S = Object.assign({ silver: cfg.silver || 0, age: 1440, sort: 'profit', minProfit: 0, minMargin: 0, onlyOwn: true, usePub: false, cities: cities.filter(c => c !== 'Black Market'), quals: QUALITIES.map(q => q.q) }, saved);
  S.cities = S.cities.filter(c => cities.includes(c)); let rows = [], fetchedAt = null, shown = 50, analysed = 0; const ui = {}, open = new Set();
  const save = () => store({ silver: S.silver, age: S.age, sort: S.sort, minProfit: S.minProfit, minMargin: S.minMargin, onlyOwn: S.onlyOwn, usePub: S.usePub, cities: S.cities, quals: S.quals });

  body.appendChild(el('p', 'hint', 'Compras al instante en una ciudad (a la orden de venta más barata) y vendes al instante en otra (a la orden de compra más alta). La ganancia ya descuenta el impuesto de venta (' + (cfg.premium ? '4%, Premium' : '8%, sin Premium') + '). Usa los precios que toma tu Albion Data Client.'));
  const panel = el('div', 'fl-panel');
  const toggles = (title, items, getOn, set) => { const box = el('div', 'fl-group'); box.appendChild(el('h4', '', title)); const row = el('div', 'fl-toggles');
    items.forEach(([k, label]) => { const b = el('button', 'fl-tg' + (getOn(k) ? ' on' : ''), label); b.type = 'button'; b.setAttribute('aria-pressed', String(getOn(k))); b.addEventListener('click', () => { set(k); b.classList.toggle('on', getOn(k)); b.setAttribute('aria-pressed', String(getOn(k))); save(); shown = 50; draw(); }); row.appendChild(b); }); box.appendChild(row); return box; };
  panel.appendChild(toggles('Ciudades', cities.map(c => [c, c === 'Black Market' ? 'Mercado Negro' : c]), c => S.cities.includes(c), c => { S.cities = S.cities.includes(c) ? S.cities.filter(x => x !== c) : S.cities.concat(c); }));
  panel.appendChild(toggles('Calidades', QUALITIES.map(q => [q.q, q.label]), q => S.quals.includes(q), q => { S.quals = S.quals.includes(q) ? S.quals.filter(x => x !== q) : S.quals.concat(q); }));
  const g = el('div', 'fl-group'); g.appendChild(el('h4', '', 'Filtros'));
  const f = el('div', 'fl-fields'); const fld = (t, i) => { const l = el('label'); l.append(el('span', '', t), i); return l; };
  ui.sort = select(SORTS, S.sort, () => { S.sort = ui.sort.value; save(); draw(); });
  ui.age = select([[30, 'Máx. 30 min'], [60, 'Máx. 1 hora'], [180, 'Máx. 3 horas'], [360, 'Máx. 6 horas'], [1440, 'Máx. 24 horas'], [4320, 'Máx. 3 días'], [10080, 'Máx. 7 días']], S.age, () => { S.age = +ui.age.value; save(); if (rows.length && S.age > (rows.maxAge || 1440)) ui.msg.textContent = 'Pulsa «Actualizar» para leer también los datos más viejos.'; else draw(); });
  ui.minP = el('input'); ui.minP.inputMode = 'numeric'; ui.minP.placeholder = '0'; ui.minP.value = S.minProfit ? fmt(S.minProfit) : ''; ui.minP.addEventListener('change', () => { S.minProfit = num(ui.minP.value); save(); draw(); });
  ui.minM = el('input'); ui.minM.inputMode = 'numeric'; ui.minM.placeholder = '0'; ui.minM.value = S.minMargin || ''; ui.minM.addEventListener('change', () => { S.minMargin = num(ui.minM.value); save(); draw(); });
  ui.silver = el('input'); ui.silver.inputMode = 'numeric'; ui.silver.placeholder = 'Sin límite'; ui.silver.value = S.silver ? fmt(S.silver) : ''; ui.silver.addEventListener('change', () => { S.silver = num(ui.silver.value); ui.silver.value = S.silver ? fmt(S.silver) : ''; save(); });
  f.append(fld('Ordenar por', ui.sort), fld('Antigüedad de los datos', ui.age), fld('Ganancia mínima por ítem', ui.minP), fld('Margen mínimo %', ui.minM), fld('Silver que tienes (para las unidades)', ui.silver));
  ui.own = el('label', 'fl-chk'); const c1 = el('input'); c1.type = 'checkbox'; c1.checked = S.onlyOwn; c1.addEventListener('change', () => { S.onlyOwn = c1.checked; save(); draw(); }); ui.own.append(c1, ' Solo datos de mi Albion Data Client («propio»)');
  ui.pub = el('label', 'fl-chk'); const c2 = el('input'); c2.type = 'checkbox'; c2.checked = S.usePub; c2.addEventListener('change', () => { S.usePub = c2.checked; if (S.usePub) { S.onlyOwn = false; c1.checked = false; } save(); }); ui.pub.append(c2, ' Al actualizar, leer también TODOS los objetos T4–T8 de Albion Data Project (tarda 1–2 min)');
  g.append(f, ui.own, ui.pub); panel.appendChild(g);
  ui.go = el('button', 'cta', '🔄 Actualizar'); ui.status = el('p', 'fl-status'); ui.msg = el('p', 'msg'); ui.out = el('div', 'fl-wrap');
  body.append(panel, ui.go, ui.status, ui.msg, ui.out); ui.go.addEventListener('click', run);
  if (ctx.getSrc().usable()) run(); else draw();

  async function run() {
    const src = ctx.getSrc(); if (!src.usable()) { ui.msg.className = 'msg err'; ui.msg.textContent = 'Conecta tu base o activa los datos públicos en Configuración.'; return; }
    ui.go.disabled = true; ui.go.textContent = 'Leyendo…'; ui.msg.className = 'msg'; ui.msg.textContent = S.usePub ? 'Leyendo tu base y todos los objetos T4–T8 de Albion Data Project. Puede tardar 1–2 minutos…' : 'Leyendo tu base…';
    try {
      const r = await findFlips({ src, game, cfg: ctx.getCfg(), buy: cities, sell: cities, silver: S.silver, maxAge: S.age, extra: S.usePub ? allIds(game, 4, 8) : [], top: 3000, limit: 1000, noHist: true, profile: {} });
      rows = r.out; rows.maxAge = S.age; analysed = r.info.items || new Set(r.rows.map(x => x.item_id)).size; fetchedAt = Date.now(); shown = 50;
      const errs = r.info.errs; ui.msg.className = errs.length ? 'msg err' : 'msg'; ui.msg.textContent = errs.join(' · ').replace(/Failed to fetch/g, 'no se pudo conectar'); draw();
    } catch (e) { ui.msg.className = 'msg err'; ui.msg.textContent = e.message.includes('Failed to fetch') ? 'No se pudo conectar con tu base.' : e.message; }
    ui.go.disabled = false; ui.go.textContent = '🔄 Actualizar';
  }
  const ageCls = m => m < 60 ? 'ok' : m < 1440 ? 'warn' : 'bad';
  const qName = q => (QUALITIES.find(x => x.q === q) || {}).label || '';
  const age = o => Math.max(o.buyAge, o.sellAge);
  function filtered() {
    const cs = new Set(S.cities), l = rows.filter(o => cs.has(o.from) && cs.has(o.to) && S.quals.includes(o.quality) && age(o) <= S.age && (!S.onlyOwn || (o.buySrc === 'propio' && o.sellSrc === 'propio')) && o.unitProfit >= S.minProfit && o.unitRoi >= S.minMargin && o.w.units > 0 && o.w.profit > 0);
    const k = { profit: o => o.unitProfit, margin: o => o.unitRoi, total: o => o.w.profit, recent: o => -age(o) }[S.sort]; return l.sort((a, b) => k(b) - k(a));
  }
  function draw() {
    ui.out.replaceChildren(); ui.status.textContent = fetchedAt ? 'Datos leídos hace ' + ageText(Math.floor((Date.now() - fetchedAt) / 60000)) + '. Analicé ' + fmt(analysed) + ' objetos.' : '';
    if (!rows.length) { ui.out.appendChild(el('p', 'hint', fetchedAt ? 'No encontré flips con esos datos. Prueba con más antigüedad, o quita «Solo datos de mi Albion Data Client».' : 'Pulsa «Actualizar» para buscar.')); return; }
    const l = filtered(); if (!l.length) { ui.out.appendChild(el('p', 'hint', 'Ninguna cumple tus filtros (' + fmt(rows.length) + ' sin filtrar). Prueba con más antigüedad, más ciudades o menos ganancia mínima.')); return; }
    if (S.age > 1440) ui.out.appendChild(el('p', 'msg err', '⚠️ Con datos de más de 1 día los precios pueden haber cambiado mucho: confírmalos en el mercado antes de comprar.'));
    ui.out.appendChild(el('p', 'hint', fmt(l.length) + ' oportunidades. Tu capital: ' + (S.silver ? fmt(S.silver) + ' de silver' : 'sin límite') + '. «~» = cantidad no verificada.'));
    const wrap = el('div', 'tablewrap'), t = el('table', 'fl-table'), th = el('thead'), hr = el('tr');
    ['Ítem', 'Última actualización', 'Compra en', 'Precio de compra', 'Venta en', 'Precio de venta', 'Ganancia por ítem', 'Margen', 'Detalles'].forEach(h => hr.appendChild(el('th', '', h))); th.appendChild(hr); t.appendChild(th);
    const tb = el('tbody'); l.slice(0, shown).forEach(o => { const key = o.item_id + '|' + o.quality + '|' + o.from + '|' + o.to, tr = el('tr'), td = (lab, ...kids) => { const c = el('td'); c.dataset.l = lab; kids.forEach(k => c.append(k)); tr.appendChild(c); return c; };
      const it = el('div', 'fl-item'), nm = el('div'); nm.append(el('div', 'fl-nm', o.label), el('span', 'fl-q q' + o.quality, qName(o.quality))); it.append(iconImg([o.item_id], 44), nm); td('Ítem', it);
      td('Actualización', el('span', 'fl-age ' + ageCls(age(o)), ageText(age(o)))); td('Compra en', o.from); td('Precio de compra', fmt(o.buyUnit)); td('Venta en', o.to === 'Black Market' ? 'Mercado Negro' : o.to); td('Precio de venta', fmt(o.sellUnit));
      td('Ganancia por ítem', el('b', 'fl-gain', fmt(o.unitProfit))); td('Margen', el('b', 'fl-gain', o.unitRoi.toFixed(2) + ' %'));
      const bt = el('button', 'fl-view', open.has(key) ? 'Ocultar' : 'Ver'); bt.type = 'button'; bt.addEventListener('click', () => { if (open.has(key)) open.delete(key); else open.add(key); draw(); }); td('Detalles', bt); tb.appendChild(tr);
      if (open.has(key)) { const dr = el('tr', 'fl-det'), dc = el('td'); dc.colSpan = 9; const tag = s => el('span', 'tag ' + (s === 'propio' ? 'ok' : ''), s || 'sin dato');
        const d = el('div', 'fl-detail'); const a = el('div'); a.append(el('b', '', '🛒 Compra en ' + o.from + ': '), document.createTextNode(fmt(o.buyUnit) + ' c/u · '), tag(o.buySrc), document.createTextNode(' · ' + ageText(o.buyAge) + (o.avail ? ' · hay ' + (o.availKnown ? '' : '~') + fmt(o.avail) : '')));
        const b = el('div'); b.append(el('b', '', '💰 Venta en ' + (o.to === 'Black Market' ? 'Mercado Negro' : o.to) + ': '), document.createTextNode(fmt(o.sellUnit) + ' c/u · '), tag(o.sellSrc), document.createTextNode(' · ' + ageText(o.sellAge) + (o.demand ? ' · piden ' + (o.demandKnown ? '' : '~') + fmt(o.demand) : '')));
        const c = el('div', '', 'Con tu capital: ' + (o.depthKnown ? '' : '~') + fmt(o.w.units) + ' unidades · inviertes ' + fmt(o.w.cost) + ' · ganas ' + fmt(o.w.profit) + ' tras el impuesto (' + (o.w.roi != null ? o.w.roi.toFixed(1) : '—') + '% sobre lo invertido).');
        d.append(a, b, c); dc.appendChild(d); dr.appendChild(dc); tb.appendChild(dr); } });
    t.appendChild(tb); wrap.appendChild(t); ui.out.appendChild(wrap);
    if (l.length > shown) { const more = el('button', '', 'Mostrar más (' + fmt(l.length - shown) + ' restantes)'); more.addEventListener('click', () => { shown += 50; draw(); }); ui.out.appendChild(more); }
  }
}
