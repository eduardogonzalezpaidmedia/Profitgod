import { load, save } from '../data/store.js';
import { makeApi } from '../data/api.js';
import { ageText } from '../data/freshness.js';
import { parseItem, fmt } from '../data/items.js';
import { CITIES } from '../markets/cities.js';
import { HOURS, RISKS } from '../settings/defaults.js';

import { $, el, chip, num } from './dom.js';
import { mountCalc } from './calc.js';
import { mountStrat } from './strat.js';
let cfg = load(), api = makeApi(cfg);

function fillSelect(sel, items, cur, label) { sel.replaceChildren(); items.forEach(v => { const o = el('option', '', label ? label(v) : v); o.value = v; sel.appendChild(o); }); sel.value = cur; }
function initForm() {
  $('url').value = cfg.url; $('key').value = cfg.key;
  fillSelect($('hours'), HOURS, cfg.hours, h => h < 1 ? h * 60 + ' minutos' : h + (h === 1 ? ' hora' : ' horas'));
  fillSelect($('city'), CITIES, cfg.city); fillSelect($('risk'), RISKS, cfg.risk, r => r[0].toUpperCase() + r.slice(1));
  fillSelect($('rcCity'), ['Todas', ...CITIES], 'Black Market');
  $('silver').value = cfg.silver ? fmt(cfg.silver) : ''; $('premium').value = cfg.premium ? '1' : '0';
  $('feeMin').value = cfg.stationFeeMin; $('feeMax').value = cfg.stationFeeMax;
}
function readCfg() {
  cfg = Object.assign(cfg, { url: $('url').value.trim(), key: $('key').value.trim(), hours: +$('hours').value, city: $('city').value, risk: $('risk').value,
    silver: num($('silver').value), premium: $('premium').value === '1', focus: 0, stationFeeMin: num($('feeMin').value), stationFeeMax: num($('feeMax').value) });
  if (cfg.stationFeeMax < cfg.stationFeeMin) cfg.stationFeeMax = cfg.stationFeeMin;
  save(cfg); api = makeApi(cfg);
}
['url', 'key', 'hours', 'city', 'risk', 'silver', 'premium', 'feeMin', 'feeMax'].forEach(id => $(id).addEventListener('change', () => { readCfg(); if (id === 'silver') $('silver').value = cfg.silver ? fmt(cfg.silver) : ''; }));

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
$('btnTest').addEventListener('click', connect); $('btnRefresh').addEventListener('click', recent); $('rcCity').addEventListener('change', recent);
$('dlgClose').addEventListener('click', () => $('dlg').close());
initForm(); if (api.on()) connect();
// pestañas: #datos y #calc
const calc = mountCalc($('viewCalc'), { getCfg: () => cfg, getApi: () => api });
const strat = mountStrat($('viewStrat'), { getCfg: () => cfg, getApi: () => api });
function route() { const v = location.hash === '#calc' ? 'calc' : location.hash === '#estrategias' ? 'estrategias' : 'datos'; $('viewData').hidden = v !== 'datos'; $('viewCalc').hidden = v !== 'calc'; $('viewStrat').hidden = v !== 'estrategias';
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + v)); if (v === 'calc') calc.show(); if (v === 'estrategias') strat.show(); window.scrollTo(0, 0); }
window.addEventListener('hashchange', route); route();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
