import { tests as wt } from './worker.test.mjs';
import { tests as ft } from './front.test.mjs';
let bad = 0, n = 0;
for (const { name, fn } of [...wt, ...ft]) {
  n++;
  try { await fn(); console.log('  ok  ' + name); } catch (e) { bad++; console.log(' FALLA ' + name + '\n        ' + e.message); }
}
console.log(`\n${n - bad}/${n} pruebas correctas`);
process.exit(bad ? 1 : 0);
