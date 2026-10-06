// Guarda en el navegador de cada dispositivo. Si el navegador no lo permite, la app sigue funcionando sin guardar.
import { DEFAULTS } from '../settings/defaults.js?v=0.11';
const K = 'profitgod.v1';
export function load() {
  try { return Object.assign({ url: '', key: '' }, DEFAULTS, JSON.parse(localStorage.getItem(K) || '{}')); }
  catch (e) { return Object.assign({ url: '', key: '' }, DEFAULTS); }
}
export function save(s) { try { localStorage.setItem(K, JSON.stringify(s)); return true; } catch (e) { return false; } }
