// Precios de materiales: tabla por grupo, tier y encantamiento. Editas el precio a mano o lo copias de los datos en línea (tu base + Albion Data Project).
// Lo que ves aquí lo usan Calculadora, Estrategias y Más como precio de COMPRA del material (marcado «manual»).
import { el, select } from './dom.js?v=0.17';
import { GROUPS, groupTable, allMaterialIds, pickPrice, idFor } from '../tools/materials.js?v=0.17';
import { iconUrl, fmt } from '../data/items.js?v=0.17';
import { ageText } from '../data/freshness.js?v=0.17';

export function mountMateriales(body, ctx, game) {
  const S = { base: 'METALBAR', city: '' }, ui = {}; let toastT = null;
  const ov = () => ctx.getSrc().overrides;
  const toast = t => { ui.toast.textContent = t; ui.toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => ui.toast.classList.remove('show'), 3200); };

  const wrap = el('div', 'matwrap'); ui.nav = el('nav', 'matnav'); ui.main = el('section', 'mattable'); wrap.append(ui.nav, ui.main); ui.toast = el('div', 'toast'); ui.toast.setAttribute('role', 'status'); body.append(wrap, ui.toast);
  drawNav(); drawTable();

  function drawNav() {
    ui.nav.replaceChildren(); let kind = '';
    GROUPS.forEach(g => { if (g.kind !== kind) { kind = g.kind; ui.nav.appendChild(el('div', 'navh', kind)); }
      const b = el('button', 'navi' + (g.base === S.base ? ' on' : ''), g.label); b.addEventListener('click', () => { S.base = g.base; drawNav(); drawTable(); }); ui.nav.appendChild(b); });
  }
  function drawTable() {
    const g = groupTable(game, S.base), m = ui.main; m.replaceChildren();
    m.appendChild(el('p', 'hint', 'Toca un precio para escribirlo. Lo que pongas aquí se usa como precio de compra del material en Calculadora, Estrategias y Más. Con «Cargar» se copian los precios de tu base y de los datos públicos para que los edites.'));
    const bar = el('div', 'matbar'); ui.city = select([['', 'La más barata (datos de menos de 24 h)']].concat(game.marketCities().filter(c => c !== 'Black Market').map(c => [c, c])), S.city, () => { S.city = ui.city.value; });
    const l1 = el('label', 'inline'); l1.append('Ciudad', ui.city);
    const b1 = el('button', 'primary', 'Cargar ' + g.label.toLowerCase()), b2 = el('button', '', 'Cargar todos los materiales'), b3 = el('button', '', 'Borrar los de este grupo');
    b1.addEventListener('click', () => load(g.ids, b1)); b2.addEventListener('click', () => load(allMaterialIds(game), b2)); b3.addEventListener('click', () => { ov().removeMany(g.ids); drawTable(); toast('Precios manuales de ' + g.label.toLowerCase() + ' borrados'); });
    bar.append(l1, b1, b2, b3); m.appendChild(bar); ui.msg = el('p', 'msg'); m.appendChild(ui.msg);
    const t = el('div', 'mt-grid'), head = el('div', 'mt-row mt-head'); ['OBJETO', 'TIER', '.0', '.1', '.2', '.3', '.4'].forEach((x, i) => head.appendChild(el('div', i > 1 ? 'c r' : 'c', x))); t.appendChild(head);
    const blk = el('div', 'mt-block'), obj = el('div', 'mt-obj'), im = el('img'); im.alt = ''; im.width = 64; im.height = 64; im.loading = 'lazy'; im.src = iconUrl(idFor(S.base, 4, 0)); im.addEventListener('error', () => { im.style.visibility = 'hidden'; });
    obj.append(im, el('div', 'mt-name', g.label)); const rowsBox = el('div', 'mt-rows');
    g.rows.forEach(r => { const row = el('div', 'mt-row'), tc = el('div', 'c tier'); tc.appendChild(document.createTextNode('Tier ' + r.tier)); tc.appendChild(el('div', 'sub', r.name)); row.appendChild(tc);
      r.cells.forEach(c => { const cell = el('div', 'c r'); if (!c) { cell.appendChild(el('span', 'dash', '—')); } else cell.appendChild(priceInput(c.id)); row.appendChild(cell); }); rowsBox.appendChild(row); });
    blk.append(obj, rowsBox); t.appendChild(blk); const w = el('div', 'tablewrap'); w.appendChild(t); m.appendChild(w);
    m.appendChild(el('p', 'hint', 'Dorado = lo escribiste tú. Blanco = copiado de los datos en línea (puedes editarlo). «—» = ese material no existe en ese tier o encantamiento. ' + ov().count() + ' precios guardados en total. Solo se guarda el precio de compra, en este dispositivo.'));
  }
  function priceInput(id) {
    const o = ov().get(id), i = el('input'); i.inputMode = 'numeric'; i.placeholder = '—'; i.autocomplete = 'off'; i.setAttribute('aria-label', 'Precio de ' + game.label(id)); i.value = o ? fmt(o.price) : '';
    const paint = v => { i.classList.toggle('man', !!v && v.by === 'manual'); i.classList.toggle('onl', !!v && v.by === 'online'); i.title = !v ? game.label(id) : v.by === 'online' ? 'Copiado de datos en línea · ' + (v.city || '') + ' · ' + (v.src || '') + ' · ' + ageText(v.age) : 'Escrito a mano'; };
    paint(o);
    i.addEventListener('change', () => { const n = +String(i.value).replace(/[^\d]/g, '') || 0; ov().set(id, n, { by: 'manual' }); const v = ov().get(id); i.value = v ? fmt(v.price) : ''; paint(v); });
    return i;
  }
  async function load(ids, btn) {
    const src = ctx.getSrc(); if (!src.usable()) { ui.msg.className = 'msg err'; ui.msg.textContent = 'Conecta tu base o activa los datos públicos en Configuración.'; return; }
    btn.disabled = true; ui.msg.className = 'msg'; ui.msg.textContent = 'Leyendo ' + fmt(ids.length) + ' precios…';
    try {
      const cities = S.city ? [S.city] : game.marketCities().filter(c => c !== 'Black Market'), by = new Map(), errs = new Set();
      for (let i = 0; i < ids.length; i += 100) { const r = await src.prices(ids.slice(i, i + 100), cities, [1], { raw: true }); if (r.ownError) errs.add('Tu base: ' + r.ownError); if (r.pubError) errs.add('Datos públicos: ' + r.pubError); r.rows.forEach(x => { (by.get(x.item_id) || by.set(x.item_id, []).get(x.item_id)).push(x); }); }
      let n = 0; ids.forEach(id => { const p = pickPrice(by.get(id) || [], S.city); if (p) { ov().set(id, p.price, { by: 'online', city: p.city, age: p.age, src: p.src }); n++; } });
      ui.msg.className = errs.size ? 'msg err' : 'msg'; ui.msg.textContent = [...errs].join(' · '); drawTable();
      toast(n ? n + ' precios copiados de los datos en línea' : 'No encontré precios frescos (menos de 24 h) para copiar');
    } catch (e) { ui.msg.className = 'msg err'; ui.msg.textContent = e.message.includes('Failed to fetch') ? 'No se pudo conectar con tu base.' : e.message; }
    btn.disabled = false;
  }
}
