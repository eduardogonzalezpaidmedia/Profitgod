// Costos de fabricación: cada objeto con sus tiers y encantamientos .0–.4, calculado con TUS precios de materiales (pestaña Materiales).
import { el, iconImg } from './dom.js?v=0.20';
import { MENU, findEntry, costBlocks, craftCost, blockMaterialIds } from '../tools/costs.js?v=0.20';
import { blockIconIds } from '../tools/materials.js?v=0.20';
import { iconUrl, fmt } from '../data/items.js?v=0.20';
import { loadMatPrices, loadMsg } from './materiales.js?v=0.20';

const KEY = 'profitgod.costs';
const readSt = () => { try { const j = JSON.parse(localStorage.getItem(KEY)); return j && typeof j === 'object' ? j : {}; } catch (e) { return {}; } };
const writeSt = st => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* sin almacenamiento */ } };

export function mountCostos(body, ctx, game, goMat) {
  const st = readSt(), S = { key: st.key && findEntry(st.key) ? st.key : 'weapons|sword', rrr: st.rrr != null ? +st.rrr : 0 }, ui = {}; let toastT = null;
  const ov = () => ctx.getSrc().overrides, price = id => { const o = ov().get(id); return o ? o.price : null; };
  const save = () => writeSt({ key: S.key, rrr: S.rrr });
  const toast = t => { ui.toast.textContent = t; ui.toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => ui.toast.classList.remove('show'), 3600); };
  const wrap = el('div', 'matwrap'); ui.nav = el('nav', 'matnav'); ui.main = el('section', 'mattable'); wrap.append(ui.nav, ui.main); ui.toast = el('div', 'toast'); ui.toast.setAttribute('role', 'status'); body.append(wrap, ui.toast);
  drawNav(); drawTable();

  function drawNav() {
    ui.nav.replaceChildren(); ui.nav.classList.remove('open');
    const cur = findEntry(S.key), tg = el('button', 'navtoggle', '📂 Categoría: ' + (cur ? cur.label : '') + ' ▾'); tg.setAttribute('aria-expanded', 'false');
    tg.addEventListener('click', () => { const o = ui.nav.classList.toggle('open'); tg.setAttribute('aria-expanded', String(o)); }); ui.nav.appendChild(tg);
    MENU.forEach(sec => { ui.nav.appendChild(el('div', 'navh', sec.section));
      sec.items.forEach(it => { const b = el('button', 'navi' + (it.key === S.key ? ' on' : ''), it.label); b.addEventListener('click', () => { S.key = it.key; save(); drawNav(); drawTable(); }); ui.nav.appendChild(b); }); });
  }
  function drawTable() {
    const entry = findEntry(S.key), m = ui.main; m.replaceChildren();
    const blocks = costBlocks(game, entry), mats = blockMaterialIds(game, blocks), have = mats.filter(id => price(id)).length;
    m.appendChild(el('h2', 'mt-title', 'Costo de fabricar · ' + entry.label));
    m.appendChild(el('p', 'hint', 'Cuánto te cuesta fabricar una unidad, sumando los materiales de la receta × los precios que pusiste en «Materiales». No incluye la tarifa de la estación ni el impuesto de venta. «?» = falta el precio de algún material (pasa el cursor para ver cuál).'));
    const bar = el('div', 'matbar'); const l = el('label', 'inline'), inp = el('input'); inp.type = 'number'; inp.min = 0; inp.max = 60; inp.step = 0.1; inp.value = S.rrr; inp.style.width = '5rem'; inp.setAttribute('aria-label', 'Devolución de recursos en porcentaje');
    inp.addEventListener('change', () => { S.rrr = Math.min(Math.max(+inp.value || 0, 0), 60); save(); drawTable(); }); l.append('Devolución de recursos %', inp);
    const b1 = el('button', 'primary', 'Cargar precios que faltan'), b2 = el('button', '', 'Poner precios a mano →');
    b1.addEventListener('click', async () => { b1.disabled = true; ui.msg.className = 'msg'; ui.msg.textContent = 'Leyendo precios…';
      try { const r = await loadMatPrices(ctx, game, mats.filter(id => !price(id)), '', (a, b) => { ui.msg.textContent = 'Leyendo ' + fmt(a) + ' de ' + fmt(b) + '…'; }); drawTable(); if (r.reason || r.errs.length) { ui.msg.className = 'msg err'; ui.msg.textContent = r.reason || r.errs.join(' · '); } toast(loadMsg(r)); }
      catch (e) { ui.msg.className = 'msg err'; ui.msg.textContent = e.message.includes('Failed to fetch') ? 'No se pudo conectar con tu base.' : e.message; b1.disabled = false; } });
    b2.addEventListener('click', () => goMat && goMat());
    bar.append(l, b1, b2); m.appendChild(bar); ui.msg = el('p', 'msg', have + ' de ' + mats.length + ' materiales de esta lista ya tienen precio.'); m.appendChild(ui.msg);
    const t = el('div', 'mt-grid'), head = el('div', 'mt-row mt-head'); ['OBJETO', 'TIER', '.0', '.1', '.2', '.3', '.4'].forEach((x, i) => head.appendChild(el('div', i > 1 ? 'c r' : 'c', x))); t.appendChild(head);
    if (!blocks.length) t.appendChild(el('p', 'hint', 'No hay objetos con receta en esta categoría.'));
    blocks.forEach(bl => { const blk = el('div', 'mt-block'), obj = el('div', 'mt-obj');
      obj.append(iconImg(blockIconIds(bl)), el('div', 'mt-name', bl.label)); const rowsBox = el('div', 'mt-rows');
      bl.rows.forEach(r => { const row = el('div', 'mt-row'), tc = el('div', 'c tier'); tc.appendChild(document.createTextNode('Tier ' + r.tier)); tc.appendChild(el('div', 'sub', r.name)); row.appendChild(tc);
        r.cells.forEach(c => { const cell = el('div', 'c r');
          if (!c) cell.appendChild(el('span', 'dash', '—'));
          else { const k = craftCost(game, c.id, price, S.rrr);
            if (k.cost != null) { const sp = el('span', 'cost', fmt(k.cost)); sp.title = k.parts.map(p => p.qty + ' × ' + game.name(p.id) + ' (' + fmt(p.price) + ')').join(' + '); cell.appendChild(sp); }
            else { const sp = el('span', 'miss', k.noRecipe ? '—' : '?'); sp.title = k.noRecipe ? 'Sin receta' : 'Falta el precio de: ' + k.missing.map(id => game.name(id)).join(', '); cell.appendChild(sp); } }
          row.appendChild(cell); }); rowsBox.appendChild(row); });
      blk.append(obj, rowsBox); t.appendChild(blk); });
    const w = el('div', 'tablewrap'); w.appendChild(t); m.appendChild(w);
  }
}
