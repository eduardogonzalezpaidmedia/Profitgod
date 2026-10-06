// Lectura del identificador del juego (T4_BAG@2 → tier 4, encantamiento 2). No se inventan nombres: se muestra el identificador.
export function parseItem(id) {
  const m = /^T(\d)_(.+?)(?:@(\d))?$/.exec(id || '');
  return m ? { tier: +m[1], enchant: m[3] ? +m[3] : 0, base: m[2], label: 'T' + m[1] + (m[3] ? '.' + m[3] : '') } : { tier: null, enchant: 0, base: id, label: '—' };
}
export const iconUrl = id => 'https://render.albiononline.com/v1/item/' + encodeURIComponent(id) + '.png?size=64';
export const fmt = n => (n || n === 0) ? Math.round(n).toLocaleString('es-CL') : '—';
