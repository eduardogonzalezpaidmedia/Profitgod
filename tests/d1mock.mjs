// Simula lo justo de Cloudflare D1 con SQLite en memoria, para probar el Worker sin Cloudflare.
import Database from 'better-sqlite3';
export function makeD1() {
  const db = new Database(':memory:');
  const prep = sql => ({
    _sql: sql, _args: [],
    bind(...a) { this._args = a; return this; },
    async run() { db.prepare(sql).run(...this._args); return {}; },
    async first() { return db.prepare(sql).get(...this._args) || null; },
    async all() { return { results: db.prepare(sql).all(...this._args) }; }
  });
  return { prepare: prep, async batch(stmts) { const t = db.transaction(() => stmts.forEach(s => db.prepare(s._sql).run(...s._args))); t(); return []; }, _raw: db };
}
