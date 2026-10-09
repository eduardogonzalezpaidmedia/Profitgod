// «Solo tengo plata»: sin elegir ningún objeto, busca qué conviene más con tu silver: refinar, fabricar, comprar en una ciudad y vender en otra, o Mercado Negro.
import { el, chip, field, select, input, num } from './dom.js?v=0.18';
import { findProfit } from '../opportunity-engine/engine.js?v=0.18';
import { TYPE_LABEL } from '../opportunity-engine/opportunity.js?v=0.18';
import { freshness } from '../data/freshness.js?v=0.18';
import { fmt } from '../data/items.js?v=0.18';
import { HOURS, RISKS } from '../settings/defaults.js?v=0.18';

const ICON = { flipping: '🔁', crafting: '🛠', refining: '⚗️', blackmarket: '🕶' };
const NAME = { flipping: 'Comprar en una ciudad y vender en otra', crafting: 'Fabricar', refining: 'Refinar', blackmarket: 'Llevar al Mercado Negro' };
const RISKU = { bajo: 'BAJO', medio: 'MEDIO', alto: 'ALTO' };
const hl = h => h < 1 ? h * 60 + ' minutos' : h + (h === 1 ? ' hora' : ' horas'), pc = r => r == null ? '—' : (r * 100).toFixed(1).replace('.', ',') + ' %';
const minTxt = m => m == null ? '—' : m < 60 ? Math.round(m) + ' min' : (m / 60).toFixed(1).replace('.', ',') + ' h';

/** Frase en lenguaje simple de qué hacer. */
export function sentence(o) {
  const u = fmt(o.units) + ' ' + o.item;
  if (o.type === 'blackmarket') return o.via === 'comprar y llevar' ? 'Compra ' + u + ' en ' + o.cityBuy + ' y véndelos en el Mercado Negro.' : 'Fabrica ' + u + ' en ' + o.cityBuy + ' y véndelos en el Mercado Negro.';
  if (o.via === 'comprar y llevar') return 'Compra ' + u + ' en ' + o.cityBuy + ', llévalos a ' + o.citySell + ' y véndelos allá' + (o.cityBuy !== o.citySell ? ' (otra ciudad).' : '.');
  return (o.via === 'refinar' ? 'Refina ' : 'Fabrica ') + u + ' en ' + o.cityBuy + ' y véndelos en ' + o.citySell + '.';
}
/** Mejor oportunidad de cada tipo (por Profit Score) y el veredicto general. */
export function verdict(ops) {
  const ok = ops.filter(o => o.score !== null && o.profit > 0), best = {};
  for (const o of ok) if (!best[o.type] || o.score > best[o.type].score) best[o.type] = o;
  const top = ok.slice().sort((a, b) => b.score - a.score || b.profit - a.profit)[0] || null;
  return { best, top };
}

export function mountSolo(root, ctx, game) {
  const S = { silver: '', city: 'Lymhurst', hours: 1, risk: 'bajo', scope: 'normal' }, ui = {};
  const cfg = ctx.getCfg(); S.silver = cfg.silver ? String(cfg.silver) : ''; S.city = cfg.city || 'Lymhurst'; S.hours = cfg.hours || 1; S.risk = cfg.risk || 'bajo';
  const c = el('section', 'card'); c.appendChild(el('h2', '', '💰 Solo tengo plata'));
  c.appendChild(el('p', 'hint', 'No elijas ningún objeto: pon cuánto silver tienes y la app revisa todo lo que ya conoce del mercado (tu base + datos públicos) y te dice qué conviene más: refinar, fabricar, comprar en una ciudad y vender en otra, o el Mercado Negro.'));
  const g = el('div', 'grid');
  ui.silver = input(S.silver ? fmt(+S.silver) : '', () => { S.silver = String(num(ui.silver.value)); }, { inputMode: 'numeric', placeholder: 'ej.: 5.000.000' });
  ui.city = select(game.marketCities().filter(x => x !== 'Black Market').map(x => [x, x]), S.city, () => { S.city = ui.city.value; });
  ui.hours = select(HOURS.map(h => [h, hl(h)]), S.hours, () => { S.hours = +ui.hours.value; });
  ui.risk = select(RISKS.map(r => [r, r[0].toUpperCase() + r.slice(1)]), S.risk, () => { S.risk = ui.risk.value; });
  ui.scope = select([['normal', 'Normal (lo que ya conoce la app)'], ['all', '🌐 Todos los mercados (más lento)']], 'normal', () => { S.scope = ui.scope.value; });
  g.append(field('Silver disponible', ui.silver), field('Estoy en', ui.city), field('Tiempo disponible', ui.hours), field('Riesgo que acepto', ui.risk), field('Alcance', ui.scope)); c.appendChild(g);
  ui.go = el('button', 'cta', '🔎 BUSCAR OPORTUNIDADES'); ui.go.addEventListener('click', run); ui.msg = el('p', 'msg center'); c.append(ui.go, ui.msg);
  ui.out = el('div'); root.append(c, ui.out);

  async function run() {
    const src = ctx.getSrc(), base = ctx.getCfg(), silver = num(ui.silver.value);
    if (!src.usable()) { ui.msg.className = 'msg err center'; ui.msg.textContent = 'Conecta tu base o activa los datos públicos en Configuración para leer los precios.'; return; }
    if (!silver) { ui.msg.className = 'msg err center'; ui.msg.textContent = 'Escribe cuánto silver tienes.'; return; }
    ui.go.disabled = true; ui.msg.className = 'msg center'; ui.msg.textContent = S.scope === 'all' ? 'Leyendo todos los mercados… puede tardar 1–2 minutos.' : 'Buscando…';
    try {
      const cfg = Object.assign({}, base, { silver, city: S.city, hours: S.hours, risk: S.risk });
      const extra = S.scope === 'all' ? game.items.filter(i => i.tier >= 4 && i.enchantment === 0 && !/^QUESTITEM|^UNIQUE_/.test(i.item_id)).map(i => i.item_id) : [];
      const r = await findProfit({ src, game, cfg, silver, hours: S.hours, maxRisk: RISKU[S.risk] || 'BAJO', extra });
      ui.msg.className = r.info.errs.length ? 'msg err center' : 'msg center'; ui.msg.textContent = r.info.errs.join(' · ').replace(/Failed to fetch/g, 'no se pudo conectar'); draw(r, silver);
    } catch (e) { ui.msg.className = 'msg err center'; ui.msg.textContent = e.message.includes('Failed to fetch') ? 'No se pudo conectar con tu base.' : e.message; }
    ui.go.disabled = false;
  }
  function row(o) {
    const d = el('div', 'step'); d.appendChild(el('b', '', ICON[o.type] + ' ' + o.item)); d.appendChild(el('span', 'p', '+' + fmt(o.profit)));
    d.appendChild(el('div', 'hint', sentence(o))); const m = el('div', 'm'); m.appendChild(chip(freshness(o.dataAge * 60000))); m.appendChild(el('span', 'tag', 'ROI ' + pc(o.roi))); m.appendChild(el('span', 'tag', 'capital ' + fmt(o.investment)));
    m.appendChild(el('span', 'tag', minTxt(o.minutes) + ' est.')); m.appendChild(el('span', 'tag', 'riesgo ' + o.risk.toLowerCase())); m.appendChild(el('span', 'tag', o.confidenceInfo.icon + ' ' + o.confidence + '%'));
    o.sources.forEach(s => m.appendChild(el('span', 'tag ' + (s === 'propio' ? 'own' : 'pub'), s))); if (!o.depthKnown) m.appendChild(el('span', 'tag', 'cantidad no verificada')); if (o.cityBuy !== o.citySell) m.appendChild(el('span', 'tag cross', '🔀 Otra ciudad')); d.appendChild(m); return d;
  }
  function draw(r, silver) {
    const o = ui.out; o.replaceChildren(); const v = verdict(r.ops), card = el('section', 'card');
    card.appendChild(el('h2', '', 'Qué te conviene con ' + fmt(silver) + ' silver'));
    if (!v.top) { card.appendChild(el('div', 'warn', 'No encontré oportunidades con ganancia y datos de menos de 24 horas. Pasa por más mercados del juego con el programa del PC, activa los datos públicos o prueba el alcance «Todos los mercados».')); o.appendChild(card); return; }
    const t = v.top, big = el('div', 'res'); big.appendChild(el('span', 'hint', 'MEJOR OPCIÓN')); big.appendChild(el('div', 'big pos', ICON[t.type] + ' ' + NAME[t.type] + ': ' + t.item)); big.appendChild(el('div', 'hint', sentence(t) + ' Ganancia estimada +' + fmt(t.profit) + ' silver.')); card.appendChild(big);
    card.appendChild(el('h3', '', 'Lo mejor de cada camino'));
    ['flipping', 'refining', 'crafting', 'blackmarket'].forEach(k => { const b = v.best[k], d = el('div', 'step');
      d.appendChild(el('b', '', ICON[k] + ' ' + NAME[k])); if (!b) { d.appendChild(el('div', 'hint', 'Sin oportunidades con datos frescos para tu silver y tu riesgo.')); } else { d.appendChild(el('span', 'p', '+' + fmt(b.profit))); d.appendChild(el('div', 'hint', sentence(b) + ' ROI ' + pc(b.roi) + ' · ' + (b.profitPerHour != null ? fmt(b.profitPerHour) + ' silver/h (est.)' : 'sin silver/h') + '.')); } card.appendChild(d); });
    o.appendChild(card);
    const p = r.plan; if (p.steps.length) { const pl = el('section', 'card'); pl.appendChild(el('h2', '', '📋 Cómo repartir tu silver (' + hl(S.hours) + ')'));
      pl.appendChild(el('p', 'hint', 'Gastas ' + fmt(Math.round(p.totalCost)) + ' de ' + fmt(silver) + ' (reserva ' + fmt(p.reserve) + ' sin tocar) · ' + Math.round(p.totalMinutes) + ' de ' + p.minutesTotal + ' min estimados · ganancia estimada +' + fmt(Math.round(p.totalProfit)) + ' silver.'));
      p.steps.forEach(s => pl.appendChild(row(s))); o.appendChild(pl); }
    const top = el('section', 'card'); top.appendChild(el('h2', '', 'Otras oportunidades')); r.ops.filter(x => x.score !== null && x.profit > 0).slice(0, 10).forEach(x => top.appendChild(row(x))); o.appendChild(top);
    o.appendChild(el('p', 'hint', 'Ranking por Profit Score (ganancia, ROI, silver/h, liquidez, confianza y riesgo). Tiempos «estimados» editables en Configuración. Para ver una operación al detalle usa Inicio. Los datos públicos no traen cantidades: salen como «cantidad no verificada». La app solo analiza: no hace nada dentro del juego.'));
  }
}
