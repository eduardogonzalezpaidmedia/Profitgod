// Mis operaciones: registro personal de lo que decides hacer y lo que realmente ganas. Vive solo en este dispositivo (localStorage); no se envía a ninguna parte.
// Son datos que tú escribes: no guarda claves ni nada del juego.
const KEY = 'profitgod.journal.v1';
const isNum = v => typeof v === 'number' && isFinite(v);

export function makeJournal(storage) {
  const read = () => { try { const a = JSON.parse(storage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const write = a => { try { storage.setItem(KEY, JSON.stringify(a)); return true; } catch (e) { return false; } };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return {
    list: () => read().sort((a, b) => b.createdAt - a.createdAt),
    /** op = oportunidad estándar del motor */
    addFromOpportunity(op, now = Date.now()) {
      const e = { id: uid(), createdAt: now, type: op.type, item: op.item, cityBuy: op.cityBuy, citySell: op.citySell, units: op.units, investment: op.investment, expectedProfit: op.profit, confidence: op.confidence, risk: op.risk, status: 'en_curso', realProfit: null, note: '' };
      const a = read(); a.push(e); write(a); return e;
    },
    update(id, patch) { const a = read(), i = a.findIndex(x => x.id === id); if (i < 0) return null; a[i] = Object.assign({}, a[i], patch); if (a[i].status !== 'completada') a[i].realProfit = a[i].realProfit; write(a); return a[i]; },
    complete(id, realProfit) { return this.update(id, { status: 'completada', realProfit: isNum(realProfit) ? Math.round(realProfit) : null, completedAt: Date.now() }); },
    remove(id) { write(read().filter(x => x.id !== id)); },
    totals() {
      const a = read(), done = a.filter(x => x.status === 'completada' && isNum(x.realProfit));
      return { total: a.length, running: a.filter(x => x.status === 'en_curso').length, done: done.length, realProfit: done.reduce((s, x) => s + x.realProfit, 0), expectedOfDone: done.reduce((s, x) => s + (x.expectedProfit || 0), 0), invested: a.filter(x => x.status !== 'cancelada').reduce((s, x) => s + (x.investment || 0), 0) };
    },
    toCsv() {
      const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"', head = ['Fecha', 'Tipo', 'Objeto', 'Compra en', 'Venta en', 'Unidades', 'Inversión', 'Profit esperado', 'Profit real', 'Estado', 'Confianza %', 'Riesgo'];
      const rows = this.list().map(e => [new Date(e.createdAt).toISOString().slice(0, 16).replace('T', ' '), e.type, e.item, e.cityBuy, e.citySell, e.units, e.investment, e.expectedProfit, e.realProfit, e.status, e.confidence, e.risk]);
      return [head, ...rows].map(r => r.map(q).join(',')).join('\n');
    }
  };
}
