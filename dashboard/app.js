import { load, save } from '../data/store.js?v=0.19';
import { makeApi } from '../data/api.js?v=0.19';
import { ageText } from '../data/freshness.js?v=0.19';
import { parseItem, fmt } from '../data/items.js?v=0.19';
import { CITIES } from '../markets/cities.js?v=0.19';
import { HOURS, RISKS } from '../settings/defaults.js?v=0.19';

import { $, el, chip, num, numDec } from './dom.js?v=0.19';
import { mountCalc } from './calc.js?v=0.19';
import { mountStrat } from './strat.js?v=0.19';
import { mountInicio } from './inicio.js?v=0.19';
import { mountOps } from './ops.js?v=0.19';
import { mountTools } from './tools.js?v=0.19';
import { makeJournal } from '../data/journal.js?v=0.19';
import { makeSources } from '../data/sources.js?v=0.19';
import { SERVERS } from '../data/public.js?v=0.19';
let cfg = load(), api = makeApi(cfg), src = makeSources(cfg);

function fillSelect(sel, items, cur, label) { sel.replaceChildren(); items.forEach(v => { const o = el('option', '', label ? label(v) : v); o.value = v; sel.appendChild(o); }); sel.value = cur; }
function initForm() {
  $('url').value = cfg.url; $('key').value = cfg.key;
  fillSelect($('hours'), HOURS, cfg.hours, h => h < 1 ? h * 60 + ' minutos' : h + (h === 1 ? ' hora' : ' horas'));
  fillSelect($('city'), CITIES, cfg.city); fillSelect($('risk'), RISKS, cfg.risk, r => r[0].toUpperCase() + r.slice(1));
  fillSelect($('rcCity'), ['Todas', ...CITIES], 'Black Market');
  $('silver').value = cfg.silver ? fmt(cfg.silver) : ''; $('premium').value = cfg.premium ? '1' : '0'; $('focus').value = cfg.focus ? fmt(cfg.focus) : '';
  fillSelect($('server'), SERVERS.map(x => x[0]), cfg.server, k => SERVERS.find(x => x[0] === k)[1]); $('usePublic').value = cfg.usePublic ? '1' : '0'; $('proxy').value = cfg.proxy || '';
  $('feeMin').value = cfg.stationFeeMin; $('feeMax').value = cfg.stationFeeMax;
  ['tripMin', 'actionMin', 'craftMin', 'craftFee', 'anomalyPct', 'reservePct'].forEach(k => { $(k).value = String(cfg[k]).replace('.', ','); });
}
function readCfg() {
  cfg = Object.assign(cfg, { url: $('url').value.trim(), key: $('key').value.trim(), hours: +$('hours').value, city: $('city').value, risk: $('risk').value,
    silver: num($('silver').value), premium: $('premium').value === '1', focus: num($('focus').value), stationFeeMin: num($('feeMin').value), stationFeeMax: num($('feeMax').value) });
  if (cfg.stationFeeMax < cfg.stationFeeMin) cfg.stationFeeMax = cfg.stationFeeMin;
  [['tripMin', 15], ['actionMin', 5], ['craftMin', 0.5]].forEach(([k, d]) => { const v = numDec($(k).value); cfg[k] = v !== null && v >= 0 ? v : d; });
  cfg.craftFee = num($('craftFee').value); cfg.anomalyPct = num($('anomalyPct').value) || 20; cfg.reservePct = Math.min(90, num($('reservePct').value));
  cfg.usePublic = $('usePublic').value === '1'; cfg.server = $('server').value; cfg.proxy = $('proxy').value.trim();
  save(cfg); api = makeApi(cfg); src = makeSources(cfg);
}
['url', 'key', 'usePublic', 'server', 'proxy', 'hours', 'city', 'risk', 'silver', 'premium', 'focus', 'feeMin', 'feeMax', 'tripMin', 'actionMin', 'craftMin', 'craftFee', 'anomalyPct', 'reservePct'].forEach(id => $(id).addEventListener('change', () => { readCfg(); if (id === 'silver') $('silver').value = cfg.silver ? fmt(cfg.silver) : ''; }));

async function connect() {
  readCfg(); const msg = $('connMsg'); msg.className = 'msg'; msg.textContent = 'Conectando…'; $('btnTest').disabled = true;
  try {
    const f = await api.freshness(), box = $('fresh'); box.replaceChildren();
    if (!Array.isArray(f.cities)) throw new Error('Tu Worker todavía es la versión anterior. Pega el código nuevo (worker/worker.js) en Cloudflare.');
    if (!f.cities.length) box.appendChild(el('p', 'hint', 'Datos insuficientes: tu base todavía no tiene precios.'));
    f.cities.forEach(c => { const r = el('div', 'fr'), l = el('div'); l.appendChild(el('div', '', c.city)); l.appendChild(el('div', 'n', fmt(c.rows) + ' precios · último hace ' + ageText(c.age_min)));
      r.appendChild(l); r.appendChild(chip(c.freshness)); box.appendChild(r); });
    $('histNote').textContent = f.history_rows ? 'Historial propio: ' + fmt(f.history_rows) + ' registros desde ' + f.history_since.replace('T', ' ') + ' (UTC).' : 'Historial propio: todavía no hay registros. Empieza a acumularse desde que el Worker nuevo recibe datos.';
    $('cFresh').hidden = false; $('cRecent').hidden = false;
    msg.className = 'msg ok'; msg.textContent = 'Conectada · ' + fmt(f.cities.reduce((s, c) => s + c.rows, 0)) + ' precios'; await recent();
  } catch (e) { msg.className = 'msg err'; msg.textContent = e.message.includes('Failed to fetch') ? 'No se pudo conectar. Revisa la dirección.' : e.message; }
  $('btnTest').disabled = false;
}
async function recent() {
  const box = $('recent'), c = $('rcCity').value; box.replaceChildren(el('p', 'hint', 'Cargando…'));
  try {
    const r = await api.recent(c === 'Todas' ? '' : c, 60); box.replaceChildren();
    if (!r.rows.length) box.appendChild(el('p', 'hint', 'Datos insuficientes para esta ciudad.'));
    r.rows.forEach(row => {
      const p = parseItem(row.item_id), it = el('div', 'it'), left = el('div'), right = el('div', 'px');
      left.appendChild(el('div', 'nm', row.item_id)); left.appendChild(el('div', 'sub', p.label + ' · ' + row.city + ' · calidad ' + row.quality));
      const best = row.sell.t && (!row.buy.t || row.sell.t >= row.buy.t) ? row.sell : row.buy;
      right.appendChild(el('div', '', 'Venta ' + (row.sell.price ? fmt(row.sell.price) : '—'))); right.appendChild(el('small', '', 'Compra ' + (row.buy.price ? fmt(row.buy.price) : '—')));
      const cw = el('div'); cw.appendChild(chip(best.freshness)); cw.appendChild(el('span', 'sub', ' ' + ageText(best.age_min)));
      it.appendChild(left); it.appendChild(right); it.appendChild(cw); it.addEventListener('click', () => detail(row)); box.appendChild(it);
    });
  } catch (e) { box.replaceChildren(el('p', 'msg err', e.message)); }
}
async function detail(row) {
  const b = $('dlgBody'); b.replaceChildren(el('h2', '', row.item_id), el('p', 'hint', row.city + ' · calidad ' + row.quality + ' · cargando historial…')); $('dlg').showModal();
  try {
    const h = await api.history(row.item_id, row.city, row.quality, 30); b.replaceChildren(el('h2', '', row.item_id));
    const side = (name, s, now) => ({ name, s, now });
    b.appendChild(el('p', 'hint', row.city + ' · calidad ' + row.quality + ' · ' + h.points + ' registros propios' + (h.covered_days ? ' en ' + h.covered_days + ' días' : '')));
    const t = el('table'); const hr = el('tr'); ['', 'Ahora', 'Promedio', 'Mediana', 'Mín', 'Máx', 'Var.'].forEach(x => hr.appendChild(el('th', '', x))); t.appendChild(hr);
    [side('Venta', h.sell, row.sell.price), side('Compra', h.buy, row.buy.price)].forEach(x => { const tr = el('tr'); const ok = x.s.n >= 3;
      [x.name, fmt(x.now), ok ? fmt(x.s.avg) : '—', ok ? fmt(x.s.median) : '—', ok ? fmt(x.s.min) : '—', ok ? fmt(x.s.max) : '—', ok ? x.s.volatility_pct + '%' : '—'].forEach(v => tr.appendChild(el('td', '', v))); t.appendChild(tr); });
    b.appendChild(t);
    b.appendChild(el('p', 'hint', h.sell.n >= 3 || h.buy.n >= 3 ? 'Estadísticas con tus propios registros (mín. 3 para mostrarlas).' : 'Datos insuficientes: aún no hay historial suficiente. Se acumula cada vez que abres este objeto en el mercado.'));
  } catch (e) { b.appendChild(el('p', 'msg err', e.message)); }
}
$('btnPub').addEventListener('click', async () => {
  readCfg(); const m = $('pubMsg'); m.className = 'msg'; m.textContent = 'Probando…'; $('btnPub').disabled = true;
  const r = await src.pub.test(); m.className = 'msg ' + (r.ok ? 'ok' : 'err'); m.textContent = r.ok ? 'Funciona: la API pública responde (' + src.pub.host.replace('https://', '') + ').' : r.error; $('btnPub').disabled = false;
});
$('btnTest').addEventListener('click', connect); $('btnRefresh').addEventListener('click', () => { src.clear(); recent(); }); $('rcCity').addEventListener('change', recent);
$('dlgClose').addEventListener('click', () => $('dlg').close());
initForm(); if (api.on()) connect();
// pestañas: #datos y #calc
const calc = mountCalc($('viewCalc'), { getCfg: () => cfg, getApi: () => api, getSrc: () => src });
const strat = mountStrat($('viewStrat'), { getCfg: () => cfg, getApi: () => api, getSrc: () => src });
const store = (() => { try { localStorage.setItem('profitgod.t', '1'); localStorage.removeItem('profitgod.t'); return localStorage; } catch (e) { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)) }; } })();
const journal = makeJournal(store);
/** Cambia la configuración desde otra pantalla (Inicio) y deja todo sincronizado. */
function update(patch) { Object.assign(cfg, patch); save(cfg); api = makeApi(cfg); src = makeSources(cfg); initForm(); }
const C = { getCfg: () => cfg, getApi: () => api, getSrc: () => src, update, journal };
const inicio = mountInicio($('viewInicio'), C), ops = mountOps($('viewOps'), C), tools = mountTools($('viewTools'), C);
const VIEWS = { inicio: 'viewInicio', mercado: 'viewMercado', calc: 'viewCalc', estrategias: 'viewStrat', herramientas: 'viewTools', operaciones: 'viewOps', config: 'viewConfig' };
const OLD = { '#datos': '#config', '#hoy': '#inicio', '#flipping': '#inicio' };      // enlaces de versiones anteriores
function route() {
  if (OLD[location.hash]) { history.replaceState(null, '', location.pathname + location.search + OLD[location.hash]); }
  const v = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'inicio';
  Object.entries(VIEWS).forEach(([k, id]) => { $(id).hidden = k !== v; });
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + v));
  if (v === 'inicio') inicio.show(); if (v === 'calc') calc.show(); if (v === 'estrategias') strat.show(); if (v === 'herramientas') tools.show(); if (v === 'operaciones') ops.show(); if (v === 'mercado' && api.on() && !$('fresh').childElementCount) connect();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route); route();
// atajos de teclado: Alt+1…7 cambian de pestaña (no se activan mientras escribes)
const ORDER = ['inicio', 'mercado', 'calc', 'estrategias', 'herramientas', 'operaciones', 'config'];
window.addEventListener('keydown', e => {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  const m = /^Digit([1-7])$/.exec(e.code); if (!m || typing) return;
  e.preventDefault(); location.hash = '#' + ORDER[+m[1] - 1];
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
