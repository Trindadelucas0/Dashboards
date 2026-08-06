'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function findObjectLiteral(html, marker) {
  const i = html.indexOf(marker);
  const start = html.indexOf('{', i);
  let depth = 0, inStr = false, quote = '', esc = false;
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, j + 1);
    }
  }
}
const data = JSON.parse(findObjectLiteral(fs.readFileSync(path.join(ROOT, 'src/views/jpg.ejs'), 'utf8'), 'const JPG_DATA ='));
const jul = data.fiscalPorMes.porMes['2026-07'].filiais.MATRIZ;
const jan = data.fiscalPorMes.porMes['2026-01'].filiais.MATRIZ;
console.log('JUL MATRIZ keys', Object.keys(jul));
console.log('JUL kpis', jul.kpis);
console.log('JUL has apuracao', !!jul.apuracao, 'impostosTabela', (jul.impostosTabela || []).length);
console.log('JAN kpis', jan.kpis);
console.log('JAN has apuracao', !!jan.apuracao);
const packs = JSON.parse(fs.readFileSync(path.join(ROOT, 'relatorios/jpg-sede-df-2026/packs-por-mes.json'), 'utf8'));
console.log('pack jul matriz kpis', packs.packs['2026-07'].MATRIZ.kpis);
console.log('pack jul matriz ap', !!packs.packs['2026-07'].MATRIZ.apuracao, packs.packs['2026-07'].MATRIZ.apuracao && packs.packs['2026-07'].MATRIZ.apuracao.icms.aRecolher);
console.log('pack jan matriz ap', !!packs.packs['2026-01'].MATRIZ.apuracao, packs.packs['2026-01'].MATRIZ.kpis);
