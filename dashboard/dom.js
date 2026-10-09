// Ayudas pequeñas para armar la pantalla sin innerHTML (todo se inserta como texto).
import { FRESHNESS_COLORS } from '../data/freshness.js?v=0.20';
export const $ = id => document.getElementById(id);
export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
export const chip = fr => { const c = el('span', 'chip', fr.label.length > 18 ? 'No usar' : fr.label); c.style.background = FRESHNESS_COLORS[fr.level]; c.title = fr.label; return c; };
export const num = v => +String(v).replace(/[^\d]/g, '') || 0;
export const numDec = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
export function field(label, input) { const l = el('label'); l.appendChild(el('span', '', label)); l.appendChild(input); return l; }
export function select(options, value, cb) { const s = el('select'); options.forEach(([v, t]) => { const o = el('option', '', t); o.value = v; s.appendChild(o); }); s.value = value; if (cb) s.addEventListener('change', cb); return s; }
export function input(value, cb, attrs) { const i = el('input'); Object.assign(i, attrs || {}); i.value = value == null ? '' : value; if (cb) i.addEventListener('input', cb); return i; }

/** Imagen del objeto con respaldo: si falla, prueba con otros ids de la misma familia y, si ninguno carga, muestra un símbolo. */
export function iconImg(ids, px = 64, fallbackGlyph = '🛡') {
  const list = [...new Set(ids.filter(Boolean))].slice(0, 4), wrap = el('span', 'ico'); let i = 0;
  const im = el('img'); im.alt = ''; im.width = px; im.height = px; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer';
  const url = id => 'https://render.albiononline.com/v1/item/' + encodeURIComponent(id) + '.png?size=128';
  im.addEventListener('error', () => { i++; if (i < list.length) im.src = url(list[i]); else { im.remove(); wrap.appendChild(el('span', 'ico-miss', fallbackGlyph)); } });
  im.src = url(list[0]); wrap.appendChild(im); return wrap;
}
