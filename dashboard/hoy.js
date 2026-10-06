// «¿Qué hago hoy?»: con tu silver, tu tiempo, tu ciudad y tu riesgo, arma un plan con las mejores operaciones.
// Mezcla flipping desde donde estás y fabricar/refinar donde estás. Nunca pasa de tu silver (menos la reserva) ni de tu tiempo.
import { $, el, chip, field, select, input, num } from './dom.js';
import { loadGameData } from '../crafting/recipes.js';
import { findFlips } from '../flipping/finder.js';
import { scanCrafts } from '../opportunity-engine/craftscan.js';
import { buildPlan } from '../opportunity-engine/plan.js';
import { freshness } from '../data/freshness.js';
import { fmt } from '../data/items.js';
import { HOURS } from '../settings/defaults.js';
import { kv, scoreBlock, riskBlock } from './explain.js';

const pc = (n, d = 1) => n === null || n === undefined ? '—' : n.toFixed(d).replace('.', ',') + '%';
const hlabel = h => h < 1 ? h * 60 + ' minutos' : h + (h === 1 ? ' hora' : ' horas');
const RISK = { bajo: 'BAJO', medio: 'MEDIO', alto: 'ALTO' };
const srcText = a => { const u = [...new Set((a || []).filter(Boolean))]; return u.length ? u.join(' + ') : 'sin dato'; };

export function mountHoy(root, ctx) {
  let game = null, built = false, last = null; const ui = {};
  async function show() {
    if (built) return;
    root.replaceChildren(el('p', 'hint', 'Cargando datos del juego…'));
    try { game = await loadGameData(); } catch (e) { root.replaceChildren(el('p', 'msg err', e.message)); return; }
    build();
  }
  function build() {
    built = true; root.replaceChildren(); const cfg = ctx.getCfg();
    const c = el('section', 'card'); c.appendChild(el('h2', '', '¿Qué hago hoy?'));
    c.appendChild(el('p', 'hint', 'Dime cuánto silver y cuánto tiempo tienes y armo un plan con las mejores operaciones: comprar y llevar a otra ciudad, o fabricar y vender. No se pasa de tu silver ni de tu tiempo, y deja una reserva sin gastar.'));
    ui.silver = input(cfg.silver ? fmt(cfg.silver) : '', null, { inputMode: 'numeric', placeholder: 'silver disponible' });
    ui.hours = select(HOURS.map(h => [h, hlabel(h)]), cfg.hours);
    ui.risk = select([['BAJO', 'Bajo'], ['MEDIO', 'Hasta medio'], ['ALTO', 'Cualquiera']], RISK[cfg.risk] || 'BAJO');
    const g = el('div', 'grid'); g.append(field('Silver disponible', ui.silver), field('Tiempo disponible', ui.hours), field('Riesgo que acepto', ui.risk)); c.appendChild(g);
    ui.ctx = el('p', 'hint'); c.appendChild(ui.ctx);
    ui.go = el('button', 'primary', 'Armar mi plan'); ui.go.addEventListener('click', run); ui.msg = el('span', 'msg'); const row = el('div', 'row'); row.append(ui.go, ui.msg); c.appendChild(row); root.appendChild(c);
    ui.out = el('section', 'card'); ui.out.hidden = true; root.appendChild(ui.out);
    refreshCtx();
  }
  function refreshCtx() {
    const cfg = ctx.getCfg();
    ui.ctx.textContent = 'Estás en ' + cfg.city + ' · ' + (cfg.premium ? 'con Premium' : 'sin Premium') + ' · sin Focus · reserva ' + (cfg.reservePct || 0) + '% · fabricar hasta T' + (cfg.maxTier || 8) + ' · tarifa de estación por fabricación: ' + (cfg.craftFee ? fmt(cfg.craftFee) : '0 (no la pusiste: las fabricaciones salen sin ella)') + '. Cambia esto en «Mis datos».';
  }
  async function run() {
    refreshCtx(); const src = ctx.getSrc(), cfg = ctx.getCfg();
    const msg = (t, err) => { ui.msg.className = 'msg' + (err ? ' err' : ''); ui.msg.textContent = t; };
    const silver = num(ui.silver.value), hours = +ui.hours.value, maxRisk = ui.risk.value;
    if (!src.usable()) return msg('Conecta tu base o activa los datos públicos en «Mis datos».', true);
    if (!silver) return msg('Escribe cuánto silver tienes para armar el plan.', true);
    ui.go.disabled = true; msg('Leyendo precios y buscando operaciones…');
    try {
      const cities = game.marketCities(), others = cities.filter(x => x !== cfg.city);
      const f = await findFlips({ src, game, cfg, buy: [cfg.city], sell: others, silver, maxUnits: cfg.maxUnits || 0 });
      const cr = scanCrafts({ game, rows: f.rows, city: cfg.city, saleCities: ['Black Market', ...others.filter(x => x !== 'Black Market'), cfg.city], silver, premium: cfg.premium, maxTier: cfg.maxTier || 8, cfg });
      const opps = [...f.out, ...cr.opps], plan = buildPlan({ opps, silver, hours, reservePct: cfg.reservePct || 0, maxRisk });
      last = { plan, flips: f.out.length, crafts: cr.opps.length, cstats: cr.stats, info: f.info, silver, hours, maxRisk };
      msg(f.info.errs.join(' · '), f.info.errs.length > 0); draw();
    } catch (e) { msg(e.message.includes('Failed to fetch') ? 'No se pudo conectar.' : e.message, true); }
    ui.go.disabled = false;
  }
  const how = s => s.kind === 'flip'
    ? 'Compra ' + fmt(s.w.units) + ' × ' + s.label + ' en ' + s.from + ' (hasta ' + fmt(Math.round(s.w.avgBuy)) + ' promedio), llévalos a ' + s.to + ' y véndelos a las órdenes de compra (~' + fmt(Math.round(s.w.avgSell)) + ' cada uno).'
    : 'Compra los materiales en ' + s.from + ', fabrica ' + fmt(s.crafts) + ' × ' + s.label + ' (' + fmt(s.w.units) + ' unidades) y véndelos a las órdenes de compra de ' + s.to + ' (~' + fmt(Math.round(s.unitPrice)) + ' cada uno).';
  function draw() {
    const { plan: p } = last; ui.out.hidden = false; ui.out.replaceChildren(el('h2', '', p.steps.length ? 'Tu plan para hoy' : 'Hoy no hay un plan seguro'));
    if (p.steps.length) {
      const box = el('div', 'res'); box.appendChild(el('span', 'hint', 'GANANCIA ESTIMADA'));
      box.appendChild(el('div', 'big pos', '🟢 ' + fmt(Math.round(p.totalProfit)) + ' silver'));
      box.appendChild(el('div', 'hint', 'Gastas ' + fmt(Math.round(p.totalCost)) + ' de ' + fmt(last.silver) + ' (reserva ' + fmt(p.reserve) + ' sin tocar) · ' + Math.round(p.totalMinutes) + ' de ' + p.minutesTotal + ' min · ~' + fmt(Math.round(p.sph || 0)) + ' silver/hora (estimado)'));
      ui.out.appendChild(box);
      p.steps.forEach((s, i) => {
        const r = el('div', 'fl'), t = el('div', 't'); t.appendChild(el('b', '', (i + 1) + '. ' + (s.kind === 'flip' ? '🔁 Comprar y llevar' : '🛠 Fabricar') + ' · ' + s.label)); t.appendChild(el('span', 'p', '🟢 ' + fmt(Math.round(s.w.profit))));
        r.appendChild(t); r.appendChild(el('div', '', how(s)));
        r.appendChild(el('div', 'hint', 'capital ' + fmt(Math.round(s.w.cost)) + ' · ROI ' + pc(s.w.roi) + ' · ~' + Math.round(s.minutes) + ' min' + (s.scaled ? ' · reducida para no pasarte de tu silver o tiempo' : '')));
        const m = el('div', 'm'); m.appendChild(el('span', 'tag score', 'puntaje ' + s.opp.score)); m.appendChild(chip(freshness(s.oldest * 60000))); m.appendChild(el('span', 'tag', 'riesgo ' + s.risk.level)); m.appendChild(el('span', 'tag', 'liquidez ' + s.liquidity));
        if (s.anomalies && s.anomalies.length) m.appendChild(el('span', 'tag warnt', '⚠ ' + s.anomalies.length + (s.anomalies.length === 1 ? ' aviso' : ' avisos')));
        m.appendChild(el('span', 'hint', 'datos: ' + (s.kind === 'flip' ? srcText([s.buySrc, s.sellSrc]) : srcText(s.srcs)))); if (!s.depthKnown) m.appendChild(el('span', 'tag', 'cantidad no verificada'));
        r.appendChild(m); r.addEventListener('click', () => detail(s, i + 1)); ui.out.appendChild(r);
      });
      ui.out.appendChild(el('div', 'warn', 'Los precios son los visibles ahora; verifica en el juego antes de comprar. Venta INSTANT (a las órdenes de compra visibles). El tiempo es una estimación tuya, no del juego.' + (ctx.getCfg().craftFee ? '' : ' Las fabricaciones no incluyen tarifa de estación porque no la pusiste.')));
    } else {
      ui.out.appendChild(el('div', 'warn', last.flips + last.crafts === 0 ? 'No encontré operaciones con ganancia y datos de menos de 24 horas. Pasa por más mercados del juego con el programa del PC (o activa los datos públicos) y vuelve a intentar.' :
        'Encontré ' + (last.flips + last.crafts) + ' operaciones, pero ninguna cabe con tu silver, tu tiempo y el riesgo que aceptas (' + p.stats.risk + ' por riesgo, ' + p.stats.noFit + ' no caben). Prueba con más tiempo o aceptando más riesgo.'));
    }
    const s = last.cstats;
    ui.out.appendChild(el('p', 'hint', 'Se revisaron ' + fmt(last.flips) + ' operaciones de flipping desde ' + ctx.getCfg().city + ' y ' + fmt(s.candidates) + ' recetas para fabricar aquí (' + fmt(s.evaluated) + ' con datos completos, ' + fmt(s.noData) + ' sin algún precio, ' + fmt(s.tooOld) + ' con datos de más de 24 h). Usé ' + fmt(last.info.ownCount) + ' precios tuyos y ' + fmt(last.info.pubCount) + ' públicos. Las operaciones con puntaje pero que superan tu riesgo se dejan fuera.'));
    ui.out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function detail(s, n) {
    const b = $('dlgBody'); b.replaceChildren(el('h2', '', n + '. ' + s.label), el('p', 'hint', how(s)));
    const big = el('div', 'res'); big.appendChild(el('div', 'big pos', '🟢 ' + fmt(Math.round(s.w.profit)) + ' silver')); big.appendChild(el('span', 'hint', 'ROI ' + pc(s.w.roi) + ' sobre ' + fmt(Math.round(s.w.cost)) + ' de capital · ~' + Math.round(s.minutes) + ' min (estimado)')); b.appendChild(big);
    const t = el('table', 'bd');
    if (s.kind === 'flip') { kv(t, 'Unidades', fmt(s.w.units)); kv(t, 'Compra promedio en ' + s.from, fmt(Math.round(s.w.avgBuy))); kv(t, 'Costo total', fmt(-Math.round(s.w.cost)), 'neg'); kv(t, 'Venta promedio en ' + s.to, fmt(Math.round(s.w.avgSell))); kv(t, 'Venta bruta', fmt(Math.round(s.w.gross))); kv(t, '− Impuesto de venta', fmt(-Math.round(s.w.tax)), 'neg'); kv(t, 'Profit neto', fmt(Math.round(s.w.profit))); }
    else { const c = s.calc; c.lines.forEach(l => kv(t, 'Compra ' + game.label(l.item_id) + ' × ' + fmt(l.toBuy), fmt(-Math.round(l.cost || 0)), 'neg')); kv(t, 'Retorno de recursos', pc(s.retorno * 100, 2)); if (c.craftingFee) kv(t, 'Tarifa de estación', fmt(-Math.round(c.craftingFee)), 'neg'); kv(t, 'Costo total', fmt(-Math.round(c.totalCost)), 'neg'); kv(t, 'Venta bruta', fmt(Math.round(c.sale.gross))); kv(t, '− Impuesto', fmt(-Math.round(c.sale.tax)), 'neg'); kv(t, 'Profit neto', fmt(Math.round(c.profit))); }
    b.appendChild(t);
    scoreBlock(b, s); riskBlock(b, s);
    b.appendChild(el('p', 'hint', 'Datos de: ' + (s.kind === 'flip' ? 'compra ' + (s.buySrc || 'sin dato') + ', venta ' + (s.sellSrc || 'sin dato') : srcText(s.srcs)) + '. Liquidez: ' + s.liquidity + '.'));
    $('dlg').showModal();
  }
  return { show };
}
