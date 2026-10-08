// Mis operaciones: lo que decidiste hacer y lo que realmente ganaste. Solo vive en este dispositivo.
import { el, field, select, input, num } from './dom.js?v=0.15';
import { fmt } from '../data/items.js?v=0.15';
import { TYPE_LABEL } from '../opportunity-engine/opportunity.js?v=0.15';

const ST = { en_curso: 'En curso', completada: 'Completada', cancelada: 'Cancelada' };
const sgn = n => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
const day = t => new Date(t).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });

export function mountOps(root, ctx) {
  function show() {
    const j = ctx.journal, list = j.list(), tt = j.totals(); root.replaceChildren();
    const c = el('section', 'card'); c.appendChild(el('h2', '', 'Mis operaciones'));
    c.appendChild(el('p', 'hint', 'Registra desde el detalle de una oportunidad lo que decides hacer, y anota cuánto ganaste de verdad. Así ves qué tan buenas fueron las estimaciones. Se guarda solo en este dispositivo.'));
    const g = el('div', 'tiles');
    [['📋', 'Operaciones', fmt(tt.total) + ' (' + fmt(tt.running) + ' en curso)'], ['💰', 'Invertido', fmt(tt.invested)], ['✅', 'Ganancia real', tt.done ? sgn(tt.realProfit) : '—'], ['🎯', 'Esperado en las completadas', tt.done ? sgn(tt.expectedOfDone) : '—']]
      .forEach(([i, l, v]) => { const t = el('div', 'tile'); t.appendChild(el('div', 'ti', i)); const b = el('div'); b.appendChild(el('div', 'tv', v)); b.appendChild(el('div', 'tl', l)); t.appendChild(b); g.appendChild(t); });
    c.appendChild(g);
    if (tt.done && tt.expectedOfDone > 0) c.appendChild(el('p', 'hint', 'Lo que ganaste de verdad fue el ' + Math.round(tt.realProfit / tt.expectedOfDone * 100) + '% de lo estimado en las operaciones completadas.'));
    if (list.length) { const r = el('div', 'row'); const x = el('button', '', 'Descargar CSV'); x.addEventListener('click', () => { const a = el('a'); a.href = URL.createObjectURL(new Blob(['﻿' + j.toCsv()], { type: 'text/csv;charset=utf-8' })); a.download = 'mis-operaciones.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }); r.appendChild(x); c.appendChild(r); }
    root.appendChild(c);
    if (!list.length) { const e = el('section', 'card'); e.appendChild(el('p', 'hint', 'Todavía no registraste ninguna operación. Busca profit en Inicio, abre una oportunidad y pulsa «Registrar en Mis operaciones».')); root.appendChild(e); return; }
    list.forEach(e => {
      const k = el('section', 'card op'), top = el('div', 'optop'); top.appendChild(el('span', 'ty ' + e.type, TYPE_LABEL[e.type] || e.type)); top.appendChild(el('span', 'sc', ST[e.status])); k.appendChild(top);
      k.appendChild(el('div', 'opname', e.item)); k.appendChild(el('div', 'route', e.cityBuy + ' → ' + e.citySell + ' · ' + fmt(e.units) + ' unid. · ' + day(e.createdAt)));
      k.appendChild(el('div', 'hint', 'Inversión ' + fmt(e.investment) + ' · esperado ' + sgn(e.expectedProfit) + ' · confianza ' + e.confidence + '% · riesgo ' + e.risk + (e.status === 'completada' ? ' · real ' + (e.realProfit == null ? 'sin anotar' : sgn(e.realProfit)) : '')));
      const row = el('div', 'row');
      if (e.status === 'en_curso') {
        const real = input('', null, { inputMode: 'numeric', placeholder: 'ganancia real (puede ser negativa: -5000)' });
        const done = el('button', 'primary', 'Completada'); done.addEventListener('click', () => { const raw = String(real.value).trim(), n = parseInt(raw.replace(/[^\d-]/g, ''), 10); j.complete(e.id, isNaN(n) ? null : n); show(); });
        const cancel = el('button', '', 'Cancelar'); cancel.addEventListener('click', () => { j.update(e.id, { status: 'cancelada' }); show(); });
        k.appendChild(field('¿Cuánto ganaste de verdad?', real)); row.append(done, cancel);
      }
      const del = el('button', '', 'Borrar'); del.addEventListener('click', () => { j.remove(e.id); show(); }); row.appendChild(del); k.appendChild(row); root.appendChild(k);
    });
  }
  return { show };
}
