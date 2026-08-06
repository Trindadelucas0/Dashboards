'use strict';
const fs = require('fs');
const path = require('path');
const h = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'jpg.ejs'), 'utf8');
if (h.includes('Matriz DF') || h.includes('MATRIZ DF')) {
  console.error('FAIL: still has Matriz DF');
  process.exit(1);
}
if (!h.includes('value="MATRIZ">Filial DF</option>')) {
  console.error('FAIL: option label missing');
  process.exit(1);
}
const i = h.indexOf('const JPG_DATA =');
const s = h.indexOf('{', i);
let d = 1;
let j = s + 1;
for (; j < h.length && d; j++) {
  const c = h[j];
  if (c === '{') d++;
  else if (c === '}') d--;
}
const data = JSON.parse(h.slice(s, j));
for (const m of Object.keys(data.fiscalPorMes.porMes)) {
  const f = data.fiscalPorMes.porMes[m].filiais.MATRIZ;
  if (f.meta.filial_label !== 'Filial DF') {
    console.error('FAIL label', m, f.meta.filial_label);
    process.exit(1);
  }
  if (f.kpis.entradas || f.kpis.saidas) {
    console.error('FAIL data', m, f.kpis);
    process.exit(1);
  }
}
console.log('RENAME OK — Filial DF em todos os meses; key MATRIZ preservada; dados zerados');
