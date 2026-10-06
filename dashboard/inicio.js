// Inicio: tu situación → ENCONTRAR PROFIT → ranking de oportunidades → detalle explicado. Una sola pantalla para lo principal.
import { $, el, chip, field, select, input, num } from './dom.js?v=0.7';
import { loadGameData, CATEGORY_LABEL } from '../crafting/recipes.js?v=0.7';
import { findProfit } from '../opportunity-engine/engine.js?v=0.7';
import { TYPE_LABEL } from '../opportunity-engine/opportunity.js?v=0.7';
import { freshness } from '../data/freshness.js?v=0.7';
import { fmt } from '../data/items.js?v=0.7';
import { CITIES } from '../markets/cities.js?v=0.7';
import { HOURS } from '../settings/defaults.js?v=0.7';
import { kv } from './explain.js?v=0.7';

const hlabel = h => h < 1 ? h * 60 + ' minutos' : h + (h === 1 ? ' hora' : ' horas');
const pc = (n, d = 1) => n === null || n === undefined ? '—' : n.toFixed(d).replace('.', ',') + '%';
const sgn = n => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
const RISKN = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto' }, RISKU = { bajo: 'BAJO', medio: 'MEDIO', alto: 'ALTO' };
const RISK_CLS = { BAJO: 'ok', MEDIO: 'warn', ALTO: 'bad' };
const TYPE_ICON = { flipping: '🔁', crafting: '🛠', refining: '⚗️', blackmarket: '🕶' };
const LAST_KEY = 'profitgod.lastOk';
const ago = ms => { const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 1 ? 'menos de 1 minuto' : m < 90 ? m + ' minutos' : m < 2880 ? Math.round(m / 60) + ' horas' : Math.round(m / 1440) + ' días'; };
const minTxt = m => m < 1 ? 'menos de 1 min' : m < 120 ? Math.round(m) + ' min' : (m / 60).toFixed(1).replace('.', ',') + ' h';
const confCls = c => c >= 80 ? 'ok' : c >= 50 ? 'warn' : 'bad';

export function mountInicio(root, ctx) {
  let game = null, built = false, last = null, shown = 20, F = { type: '', risk: '', city: '', cap: '', profit: '', roi: '', pph: '', liq: '', conf: '', sort: 'score' }; const ui = {};

  async function show() {
    if (!built) {
      root.replaceChildren(el('p', 'hint', 'Cargando datos del juego…'));
      try { game = await loadGameData(); } catch (e) { root.replaceChildren(banner('⚠️ No pudimos cargar los datos del juego.', e.message, [['REINTENTAR', () => { built = false; show(); }]])); return; }
      build();
    }
    refreshSituation(); refreshStatus();
  }

  // ---------- estado de datos ----------
  function banner(title, text, actions) {
    const b = el('section', 'card alert'); b.appendChild(el('b', '', title)); if (text) b.appendChild(el('p', 'hint', text));
    if (actions && actions.length) { const r = el('div', 'row'); actions.forEach(([t, fn, cls]) => { const x = el('button', cls || '', t); x.addEventListener('click', fn); r.appendChild(x); }); b.appendChild(r); }
    return b;
  }
  async function refreshStatus() {
    const api = ctx.getApi(), cfg = ctx.getCfg(), box = ui.status; box.className = 'status'; box.replaceChildren();
    const set = (cls, txt) => { box.className = 'status ' + cls; box.textContent = txt; };
    if (!api.on()) { set(cfg.usePublic ? 'info' : 'bad', cfg.usePublic ? '🔵 Solo datos públicos: se consultan al buscar. Conecta tu base en Configuración para usar también los tuyos.' : '🔴 Datos insuficientes: conecta tu base o activa los datos públicos en Configuración.'); return; }
    set('info', 'Revisando tus datos…');
    try {
      const f = await api.freshness(); if (!Array.isArray(f.cities)) throw new Error('Tu Worker es una versión anterior.');
      const ages = f.cities.map(c => c.age_min).filter(a => typeof a === 'number'); if (!ages.length) { set('bad', '🔴 Datos insuficientes: tu base todavía no tiene precios.'); return; }
      const m = Math.min(...ages); try { localStorage.setItem(LAST_KEY, String(Date.now() - m * 60000)); } catch (e) { /* sin almacenamiento */ }
      set(m < 30 ? 'ok' : m < 240 ? 'warn' : 'bad', (m < 30 ? '🟢 ' : m < 240 ? '🟡 ' : '🔴 ') + 'Datos actualizados hace ' + minTxt(m) + ' · ' + fmt(f.cities.reduce((s, c) => s + c.rows, 0)) + ' precios tuyos' + (cfg.usePublic ? ' + datos públicos' : ''));
    } catch (e) { box.className = 'status bad'; box.replaceChildren(el('span', '', '🔴 No pudimos actualizar tus datos. ' + lastText())); }
  }
  function lastText() { try { const t = +localStorage.getItem(LAST_KEY); return t ? 'Última actualización: hace ' + ago(t) + '.' : 'Todavía no hay una actualización guardada.'; } catch (e) { return ''; } }

  // ---------- situación ----------
  function tile(icon, label, value, cls) { const t = el('div', 'tile' + (cls ? ' ' + cls : '')); t.appendChild(el('div', 'ti', icon)); const b = el('div'); b.appendChild(el('div', 'tv', value)); b.appendChild(el('div', 'tl', label)); t.appendChild(b); return t; }
  function refreshSituation() {
    const cfg = ctx.getCfg(), g = ui.tiles; g.replaceChildren();
    g.append(tile('💰', 'Silver disponible', cfg.silver ? fmt(cfg.silver) : 'Sin definir', cfg.silver ? '' : 'bad'), tile('📍', 'Ciudad actual', cfg.city), tile('⏱', 'Tiempo disponible', hlabel(cfg.hours)),
      tile('⚠️', 'Riesgo que acepto', RISKN[cfg.risk] || 'Bajo'), tile('⭐', 'Premium', cfg.premium ? 'Sí' : 'No'), tile('🔥', 'Focus', cfg.focus > 0 ? fmt(cfg.focus) : 'Sin Focus'));
    if (cfg.maxUnits > 0) g.appendChild(tile('📦', 'Capacidad por operación', fmt(cfg.maxUnits) + ' unid.'));
    if (ui.eSilver) { ui.eSilver.value = cfg.silver ? fmt(cfg.silver) : ''; ui.eCity.value = cfg.city; ui.eHours.value = cfg.hours; ui.eRisk.value = cfg.risk; ui.ePrem.value = cfg.premium ? '1' : '0'; ui.eFocus.value = cfg.focus ? fmt(cfg.focus) : ''; ui.eCap.value = cfg.maxUnits ? fmt(cfg.maxUnits) : ''; }
  }

  function build() {
    built = true; root.replaceChildren();
    ui.status = el('div', 'status'); root.appendChild(ui.status);
    ui.alert = el('div'); root.appendChild(ui.alert);
    const c = el('section', 'card'); c.appendChild(el('h2', '', 'MI SITUACIÓN')); ui.tiles = el('div', 'tiles'); c.appendChild(ui.tiles);
    const d = el('details', 'edit'); d.appendChild(el('summary', '', 'Editar mi situación'));
    const g = el('div', 'grid'), up = patch => { ctx.update(patch); refreshSituation(); };
    ui.eSilver = input('', null, { inputMode: 'numeric', placeholder: '6.000.000' }); ui.eSilver.addEventListener('change', () => up({ silver: num(ui.eSilver.value) }));
    ui.eCity = select(CITIES.map(x => [x, x]), 'Lymhurst', () => up({ city: ui.eCity.value }));
    ui.eHours = select(HOURS.map(h => [h, hlabel(h)]), 1.5, () => up({ hours: +ui.eHours.value }));
    ui.eRisk = select([['bajo', 'Bajo'], ['medio', 'Medio'], ['alto', 'Alto']], 'bajo', () => up({ risk: ui.eRisk.value }));
    ui.ePrem = select([['0', 'No'], ['1', 'Sí']], '0', () => up({ premium: ui.ePrem.value === '1' }));
    ui.eFocus = input('', null, { inputMode: 'numeric', placeholder: '0' }); ui.eFocus.addEventListener('change', () => up({ focus: num(ui.eFocus.value) }));
    ui.eCap = input('', null, { inputMode: 'numeric', placeholder: 'sin límite' }); ui.eCap.addEventListener('change', () => up({ maxUnits: num(ui.eCap.value) }));
    g.append(field('Silver disponible', ui.eSilver), field('Ciudad actual', ui.eCity), field('Tiempo disponible', ui.eHours), field('Riesgo que acepto', ui.eRisk), field('Premium', ui.ePrem), field('Focus disponible (0 = sin Focus)', ui.eFocus), field('Capacidad: máx. unidades por operación', ui.eCap));
    d.appendChild(g); d.appendChild(el('p', 'hint', 'Sin Premium y sin Focus es lo normal. Si pones Focus, las fabricaciones lo usan (con su costo base) hasta que se acabe. Más ajustes (tiempos, tarifa de estación, reserva) en Configuración.')); c.appendChild(d);
    ui.go = el('button', 'cta', '🔥 ENCONTRAR PROFIT'); ui.go.addEventListener('click', run); c.appendChild(ui.go); ui.msg = el('p', 'msg center'); c.appendChild(ui.msg);
    const adv = el('details'); adv.appendChild(el('summary', '', 'Opciones avanzadas: ampliar con datos públicos'));
    const g2 = el('div', 'grid'); ui.cat = select([['', 'Ninguno']].concat(Object.entries(CATEGORY_LABEL).filter(([k]) => ['weapons', 'armor', 'head', 'shoes', 'offhands', 'capes', 'bags'].includes(k))), '');
    ui.tmin = select([4, 5, 6, 7, 8].map(x => [x, 'T' + x]), 4); ui.tmax = select([4, 5, 6, 7, 8].map(x => [x, 'T' + x]), 6);
    g2.append(field('Categoría a revisar', ui.cat), field('Tier desde', ui.tmin), field('Tier hasta', ui.tmax)); adv.appendChild(g2);
    adv.appendChild(el('p', 'hint', 'Sin esto solo se analizan los objetos que ya pasaste por el mercado del juego (más los precios públicos de esos mismos objetos). Con esto también se consultan los públicos de esa categoría (máx. 600 objetos, calidad normal) para descubrir oportunidades; no traen cantidades, así que salen marcadas «cantidad no verificada» y con menos confianza.'));
    c.appendChild(adv); root.appendChild(c);
    ui.out = el('div'); root.appendChild(ui.out);
    refreshSituation();
  }

  // ---------- análisis ----------
  async function run() {
    const src = ctx.getSrc(), cfg = ctx.getCfg(), msg = t => { ui.msg.textContent = t; };
    ui.alert.replaceChildren();
    if (!src.usable()) { ui.alert.appendChild(banner('⚠️ No hay de dónde leer precios.', 'Conecta tu base de datos o activa los datos públicos.', [['USAR DATOS PÚBLICOS', usePublic, 'primary']])); return; }
    if (!cfg.silver) { msg('Pon cuánto silver tienes (Editar mi situación) para poder recomendar.'); ui.go.scrollIntoView({ block: 'center' }); return; }
    ui.go.disabled = true; ui.go.textContent = 'Analizando el mercado…'; msg('Leyendo precios, calculando flipping, fabricación, refinado y Mercado Negro…');
    try {
      let extra = []; const cat = ui.cat.value, t1 = +ui.tmin.value, t2 = +ui.tmax.value;
      if (cat) extra = game.items.filter(i => i.category === cat && i.tier >= t1 && i.tier <= t2 && i.enchantment === 0 && game.recipes.has(i.item_id)).map(i => i.item_id).slice(0, 600);
      last = await findProfit({ src, game, cfg, silver: cfg.silver, hours: cfg.hours, maxRisk: RISKU[cfg.risk] || 'BAJO', extra }); shown = 20;
      const errs = last.info.errs;
      if (errs.length) ui.alert.appendChild(banner('⚠️ No pudimos actualizar todos tus datos.', errs.join(' · ').replace(/Failed to fetch/g, 'no se pudo conectar') + ' ' + lastText() + ' Se usó lo que sí se pudo leer.', [['REINTENTAR', run, 'primary']].concat(cfg.usePublic ? [] : [['USAR DATOS PÚBLICOS', usePublic]])));
      else try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch (e) { /* sin almacenamiento */ }
      msg(''); draw();
    } catch (e) {
      msg(''); ui.out.replaceChildren();
      ui.alert.replaceChildren(banner('⚠️ No pudimos actualizar tus datos.', (e.message.includes('Failed to fetch') ? 'No se pudo conectar con tu base. ' : e.message + ' ') + lastText(), [['REINTENTAR', run, 'primary']].concat(cfg.usePublic ? [] : [['USAR DATOS PÚBLICOS', usePublic]])));
    }
    ui.go.disabled = false; ui.go.textContent = '🔥 ENCONTRAR PROFIT'; refreshStatus();
  }
  function usePublic() { ctx.update({ usePublic: true }); run(); }

  // ---------- resultados ----------
  const riskTag = r => el('span', 'tag ' + RISK_CLS[r], r);
  function applyFilters() {
    const cap = num(F.cap), mp = num(F.profit), mr = num(F.roi), mh = num(F.pph), mc = num(F.conf);
    const LQ = ['MUY BAJA', 'BAJA', 'MEDIA', 'ALTA', 'MUY ALTA'], RK = { BAJO: 0, MEDIO: 1, ALTO: 2 };
    const l = last.ops.filter(o => o.score !== null && (!F.type || o.type === F.type) && (!F.risk || RK[o.risk] <= RK[F.risk]) && (!F.city || o.cityBuy === F.city || o.citySell === F.city) && (!cap || o.investment <= cap) && o.profit >= mp && (o.roi === null || o.roi >= mr)
      && (o.profitPerHour || 0) >= mh && (!F.liq || LQ.indexOf(o.liquidity) >= LQ.indexOf(F.liq)) && o.confidence >= mc);
    const key = { score: o => o.score, profit: o => o.profit, roi: o => o.roi || 0, pph: o => o.profitPerHour || 0, conf: o => o.confidence }[F.sort];
    return l.sort((a, b) => key(b) - key(a));
  }
  function filtersUi() {
    const d = el('details', 'card flt'); d.appendChild(el('summary', '', 'Filtros y orden')); const g = el('div', 'grid'), re = () => draw(true);
    const sel = (k, opts) => select(opts, F[k], function () { F[k] = this.value; re(); });
    const inp = (k, ph) => { const i = input(F[k], null, { inputMode: 'numeric', placeholder: ph }); i.addEventListener('change', () => { F[k] = i.value; re(); }); return i; };
    const cities = [...new Set(last.ops.flatMap(o => [o.cityBuy, o.citySell]))].sort();
    g.append(field('Ordenar por', sel('sort', [['score', 'Profit Score'], ['profit', 'Profit'], ['roi', 'ROI'], ['pph', 'Profit por hora'], ['conf', 'Confianza']])),
      field('Tipo', sel('type', [['', 'Todos'], ['flipping', 'Flipping'], ['crafting', 'Crafting'], ['refining', 'Refining'], ['blackmarket', 'Black Market']])),
      field('Riesgo máximo', sel('risk', [['', 'Cualquiera'], ['MEDIO', 'Hasta medio'], ['BAJO', 'Solo bajo']])), field('Ciudad', sel('city', [['', 'Todas']].concat(cities.map(x => [x, x])))),
      field('Capital máximo', inp('cap', 'sin límite')), field('Profit mínimo', inp('profit', '0')), field('ROI mínimo %', inp('roi', '0')), field('Profit/h mínimo', inp('pph', '0')),
      field('Liquidez mínima', sel('liq', [['', 'Cualquiera'], ['BAJA', 'Baja o más'], ['MEDIA', 'Media o más'], ['ALTA', 'Alta o más']])), field('Confianza mínima %', sel('conf', [['', 'Cualquiera'], ['50', '50 % o más'], ['80', '80 % o más']])));
    d.appendChild(g); return d;
  }
  function draw(keepFilters) {
    const list = applyFilters(), curFlt = ui.out.querySelector('.flt'), hadFlt = curFlt ? curFlt.open : false;
    ui.out.replaceChildren();
    const h = el('div', 'rh'); h.appendChild(el('h2', '', '🔥 MEJORES OPORTUNIDADES')); h.appendChild(el('span', 'hint', fmt(list.length) + ' de ' + fmt(last.ops.length))); ui.out.appendChild(h);
    if (!last.ops.length) { ui.out.appendChild(banner('No hay suficiente información para recomendar.', 'No encontré operaciones con ganancia y datos de menos de 24 horas. Pasa por más mercados del juego con el programa del PC, activa los datos públicos o amplía la búsqueda con una categoría.', [])); return; }
    const flt = filtersUi(); if (hadFlt) flt.open = true; flt.addEventListener('toggle', () => { ui.fltOpen = flt.open; }); ui.out.appendChild(flt);
    const plan = planCard(); if (plan) ui.out.appendChild(plan);
    if (!list.length) ui.out.appendChild(el('div', 'warn', 'Ninguna oportunidad pasa los filtros que pusiste. Afloja los filtros.'));
    const cards = el('div', 'cards'); list.slice(0, shown).forEach((o, i) => cards.appendChild(card(o, i + 1))); ui.out.appendChild(cards);
    if (list.length > shown) { const m = el('button', '', 'Ver más (' + (list.length - shown) + ')'); m.addEventListener('click', () => { shown += 20; draw(true); }); const r = el('div', 'row'); r.appendChild(m); ui.out.appendChild(r); }
    const s = last.counts.cstats; ui.out.appendChild(el('p', 'hint', 'Se analizaron ' + fmt(last.counts.flips) + ' operaciones de compra-venta y ' + fmt(s.candidates) + ' recetas (' + fmt(s.evaluated) + ' con datos completos, ' + fmt(s.noData) + ' sin algún precio, ' + fmt(s.tooOld) + ' con datos de más de 24 h). Datos: ' + fmt(last.info.ownCount) + ' precios tuyos y ' + fmt(last.info.pubCount) + ' públicos. Las operaciones con datos de más de 24 horas no se recomiendan.'));
    if (!keepFilters) ui.out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function metric(label, value, cls) { const m = el('div', 'mt'); m.appendChild(el('div', 'mv' + (cls ? ' ' + cls : ''), value)); m.appendChild(el('div', 'ml', label)); return m; }
  function card(o, n) {
    const c = el('article', 'op'), top = el('div', 'optop');
    top.appendChild(el('span', 'ty ' + o.type, '#' + n + ' ' + TYPE_ICON[o.type] + ' ' + TYPE_LABEL[o.type])); top.appendChild(el('span', 'sc', 'PROFIT SCORE ' + o.score + '/100')); c.appendChild(top);
    c.appendChild(el('div', 'opname', o.item));
    c.appendChild(el('div', 'route', o.via === 'comprar y llevar' ? 'Comprar en ' + o.cityBuy + ' → Vender en ' + o.citySell : (o.via === 'refinar' ? 'Refinar en ' : 'Fabricar en ') + o.cityBuy + ' → Vender en ' + o.citySell));
    const big = el('div', 'profit', sgn(o.profit) + ' silver'); c.appendChild(big);
    const g = el('div', 'metrics'); g.append(metric('ROI', pc(o.roi)), metric('Profit/h (est.)', o.profitPerHour != null ? fmt(o.profitPerHour) : '—'), metric('Capital', fmt(o.investment)), metric('Tiempo (est.)', minTxt(o.minutes)),
      metric('Riesgo', o.risk[0] + o.risk.slice(1).toLowerCase(), RISK_CLS[o.risk]), metric('Liquidez', o.liquidity === 'SIN DATO' ? 'Sin dato' : o.liquidity[0] + o.liquidity.slice(1).toLowerCase()), metric('Confianza', o.confidenceInfo.icon + ' ' + o.confidence + '%', confCls(o.confidence)));
    c.appendChild(g);
    const m = el('div', 'm'); m.appendChild(chip(freshness(o.dataAge * 60000))); o.sources.forEach(s => m.appendChild(el('span', 'tag ' + (s === 'propio' ? 'own' : 'pub'), s))); if (!o.depthKnown) m.appendChild(el('span', 'tag', 'cantidad no verificada')); if (o.withFocus) m.appendChild(el('span', 'tag', 'con Focus'));
    if (o.anomalies.length) m.appendChild(el('span', 'tag warnt', '⚠ ' + o.anomalies.length + (o.anomalies.length === 1 ? ' aviso' : ' avisos'))); c.appendChild(m);
    const b = el('button', 'primary', 'VER OPERACIÓN'); b.addEventListener('click', () => detail(o, n)); c.appendChild(b); return c;
  }
  function planCard() {
    const p = last.plan; const d = el('details', 'card plan'); d.open = p.steps.length > 0;
    d.appendChild(el('summary', '', '📋 Plan para tus ' + hlabel(ctx.getCfg().hours) + (p.steps.length ? ' · ' + sgn(Math.round(p.totalProfit)) + ' silver estimados' : '')));
    if (!p.steps.length) { d.appendChild(el('p', 'hint', 'Con tu silver, tu tiempo y el riesgo que aceptas no armé un plan seguro. Prueba con más tiempo o aceptando más riesgo.')); return d; }
    d.appendChild(el('p', 'hint', 'Gastas ' + fmt(Math.round(p.totalCost)) + ' de ' + fmt(ctx.getCfg().silver) + ' (reserva ' + fmt(p.reserve) + ' sin tocar) · ' + Math.round(p.totalMinutes) + ' de ' + p.minutesTotal + ' min estimados · ~' + fmt(Math.round(p.sph || 0)) + ' silver/hora estimado.'));
    p.steps.forEach((s, i) => { const r = el('div', 'step'); r.appendChild(el('b', '', (i + 1) + '. ' + TYPE_ICON[s.type] + ' ' + s.item)); r.appendChild(el('span', 'p', sgn(s.profit)));
      r.appendChild(el('div', 'hint', how(s))); r.addEventListener('click', () => detail(s, '', true)); d.appendChild(r); });
    return d;
  }
  const how = s => s.via === 'comprar y llevar' ? 'Compra ' + fmt(s.units) + ' en ' + s.cityBuy + ', llévalos a ' + s.citySell + ' y véndelos a las órdenes de compra.' : 'Compra los materiales en ' + s.cityBuy + ', ' + (s.via === 'refinar' ? 'refina' : 'fabrica') + ' ' + fmt(s.units) + ' y véndelos en ' + s.citySell + '.';

  // ---------- detalle ----------
  function detail(o, n, fromPlan) {
    const b = $('dlgBody'); b.replaceChildren();
    b.appendChild(el('p', 'hint', TYPE_ICON[o.type] + ' ' + TYPE_LABEL[o.type] + (n ? ' · #' + n : '')));
    b.appendChild(el('h2', '', o.item)); b.appendChild(el('p', 'hint', o.via === 'comprar y llevar' ? 'Comprar en ' + o.cityBuy + ' → Vender en ' + o.citySell : (o.via === 'refinar' ? 'Refinar en ' : 'Fabricar en ') + o.cityBuy + ' → Vender en ' + o.citySell));
    const hd = el('div', 'dhead'); const s1 = el('div'); s1.appendChild(el('div', 'dsv', o.score + '/100')); s1.appendChild(el('div', 'ml', 'PROFIT SCORE')); const s2 = el('div'); s2.appendChild(el('div', 'dsv ' + confCls(o.confidence), o.confidenceInfo.icon + ' ' + o.confidence + '%')); s2.appendChild(el('div', 'ml', o.confidenceInfo.text.toUpperCase())); hd.append(s1, s2); b.appendChild(hd);
    b.appendChild(el('div', 'why', o.explanation));
    b.appendChild(el('h2', '', 'Cómo se calculó')); const t = el('table', 'bd');
    o.rows.forEach(r => kv(t, r.group === 'materials' ? 'Materiales: ' + game.label(r.id) + ' × ' + fmt(r.qty) : r.label, sgn(r.value), r.value < 0 ? 'neg' : 'pos'));
    kv(t, 'Otros costes', '0'); kv(t, 'PROFIT', sgn(o.profit), 'pos'); kv(t, 'ROI', pc(o.roi) + ' sobre ' + fmt(o.investment)); kv(t, 'PROFIT/H (estimado)', o.profitPerHour != null ? '~' + fmt(o.profitPerHour) : '—'); b.appendChild(t);
    if (o.raw.kind === 'craft') b.appendChild(el('p', 'hint', 'Retorno de recursos ' + pc(o.raw.retorno * 100, 2) + (o.withFocus ? ' (con Focus: ' + fmt(o.raw.focusUsed) + ' de Focus usado, costo base sin maestría)' : ' (sin Focus)') + (o.fees ? '' : ' · tarifa de estación 0: pon la tuya en Configuración para que el profit sea real') + '. Venta INSTANT a las órdenes de compra visibles.'));
    else b.appendChild(el('p', 'hint', 'Venta INSTANT a las órdenes de compra visibles, ' + (ctx.getCfg().premium ? 'con Premium' : 'sin Premium') + '. El tiempo es una estimación tuya (viaje + compra/venta).'));
    b.appendChild(el('h2', '', 'Datos utilizados')); const t2 = el('table', 'bd');
    kv(t2, 'Ciudad de compra', o.cityBuy); kv(t2, 'Ciudad de venta', o.citySell);
    const r = o.raw; if (r.kind !== 'craft') { kv(t2, 'Precio de compra (actual)', fmt(Math.round(r.w.avgBuy)) + ' · ' + (r.buySrc || 'sin dato')); kv(t2, 'Precio de venta (actual)', fmt(Math.round(r.w.avgSell)) + ' · ' + (r.sellSrc || 'sin dato')); } else kv(t2, 'Precio de venta (actual)', fmt(Math.round(r.unitPrice)) + ' · ' + (o.sources.join(' + ') || 'sin dato'));
    const hv = o.hv; kv(t2, 'Precio histórico', hv && hv.enough ? 'promedio ' + fmt(hv.avg) + ' · mediana ' + fmt(hv.median) + ' · mín ' + fmt(hv.min) + ' · máx ' + fmt(hv.max) + ' (' + hv.points + ' registros)' : 'Datos insuficientes (' + ((hv && hv.points) || 0) + ' registros; se necesitan 5)');
    kv(t2, 'Antigüedad de los datos', minTxt(o.dataAge)); kv(t2, 'Demanda visible', o.depthKnown ? fmt(r.demand) + ' unidades pedidas' : 'no verificada (precio público)'); kv(t2, 'Liquidez', o.liquidity === 'SIN DATO' ? 'sin dato' : o.liquidity); kv(t2, 'Unidades', fmt(o.units)); kv(t2, 'Fuentes', o.sources.join(' + ') || 'sin dato'); b.appendChild(t2);
    b.appendChild(el('h2', '', 'Riesgos: ' + o.risk)); const ul = el('ul'); o.riskInfo.reasons.forEach(x => ul.appendChild(el('li', '', x))); if (o.anomalies.length) o.anomalies.forEach(a => ul.appendChild(el('li', 'warnli', '⚠ ' + a.text))); b.appendChild(ul);
    const dd = el('details'); dd.appendChild(el('summary', '', 'Cómo se calcularon el Profit Score y la Confianza'));
    const t3 = el('table', 'bd'); o.scoreInfo.components.forEach(c => kv(t3, c.label + ' (' + Math.round(c.weight * 100) + '%)', c.value === null ? 'sin dato' : Math.round(c.value * 100) + '% → ' + c.points.toFixed(1).replace('.', ',') + ' pts'));
    kv(t3, '× frescura', '× ' + String(o.scoreInfo.freshMult).replace('.', ',')); kv(t3, '× riesgo', '× ' + String(o.scoreInfo.riskMult).replace('.', ',')); kv(t3, 'PROFIT SCORE', o.score + '/100'); dd.appendChild(t3);
    const t4 = el('table', 'bd'); o.confidenceInfo.components.forEach(c => kv(t4, c.label + ' (' + Math.round(c.weight * 100) + '%)', Math.round(c.value * 100) + '%' + (c.note ? ' · ' + c.note : ''))); o.confidenceInfo.caps.forEach(c => kv(t4, '⚠ ' + c, '')); kv(t4, 'CONFIANZA', o.confidence + '%'); dd.appendChild(el('p', 'hint', '')); dd.appendChild(t4); b.appendChild(dd);
    b.appendChild(el('div', 'warn', 'Los precios son los visibles ahora: verifica en el juego antes de comprar. Profit God solo analiza; no hace nada dentro del juego.'));
    const row = el('div', 'row'); const reg = el('button', 'primary', 'Registrar en Mis operaciones'); const msg = el('span', 'msg');
    reg.addEventListener('click', () => { ctx.journal.addFromOpportunity(o); reg.disabled = true; msg.className = 'msg ok'; msg.textContent = 'Guardada en Mis operaciones.'; }); row.append(reg, msg); b.appendChild(row);
    $('dlg').showModal();
  }
  return { show };
}
