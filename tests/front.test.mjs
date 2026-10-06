import { freshness as ff, ageText } from '../data/freshness.js';
import worker from '../worker/worker.js';
import { parseItem, fmt } from '../data/items.js';
import { DEFAULTS } from '../settings/defaults.js';
import { makeApi } from '../data/api.js';
export const tests = [];
const t = (name, fn) => tests.push({ name, fn });
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'no coincide') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); };

t('la frescura de la app y la del Worker dan lo mismo en todos los tramos', () => {
  for (const m of [0, 1, 4.9, 5, 29, 30, 119, 120, 719, 720, 1439, 1440, 5000]) eq(ff(m * 60000), worker._freshness(m * 60000), 'minuto ' + m);
  eq(ff(null), worker._freshness(null));
});
t('textos de antigüedad', () => { eq([ageText(0), ageText(12), ageText(125), ageText(1500), ageText(null), ageText(60), ageText(1440)], ['ahora', '12 min', '2 h 5 min', '1 d 1 h', '—', '1 h', '1 d']); });
t('lectura de identificadores del juego', () => {
  eq(parseItem('T4_BAG'), { tier: 4, enchant: 0, base: 'BAG', label: 'T4' });
  eq(parseItem('T6_2H_CLAYMORE@3').label, 'T6.3');
  eq(parseItem('RARO').tier, null);
});
t('formato de silver', () => { eq(fmt(1234567).replace(/\D/g, ''), '1234567'); eq(fmt(null), '—'); });
t('valores por defecto: sin Premium, sin Focus, Lymhurst, 1,5 h, tarifa 300–900', () => {
  eq([DEFAULTS.premium, DEFAULTS.focus, DEFAULTS.city, DEFAULTS.hours, DEFAULTS.stationFeeMin, DEFAULTS.stationFeeMax], [false, 0, 'Lymhurst', 1.5, 300, 900]);
});
t('api: sin dirección o clave no consulta y avisa', async () => {
  const a = makeApi({ url: '', key: '' });
  eq(a.on(), false);
  let msg = ''; try { await a.freshness(); } catch (e) { msg = e.message; }
  if (!/Falta/.test(msg)) throw new Error('debería avisar');
});
