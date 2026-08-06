'use strict';
const fs = require('fs');
const path = require('path');
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
const data = JSON.parse(findObjectLiteral(fs.readFileSync(path.join(__dirname, '../src/views/jpg.ejs'), 'utf8'), 'const JPG_DATA ='));
const j = data.fiscalPorMes.porMes['2026-07'];
console.log('ordem', j.ordem);
console.log('LANNIC', j.filiais.LANNIC.kpis.saidas, j.filiais.LANNIC.deducoes, !!j.filiais.LANNIC.apuracao.das);
console.log('MATRIZ', j.filiais.MATRIZ.kpis.saidas, j.filiais.MATRIZ.kpis.entradas);
console.log('SEDE', j.filiais.SEDE.kpis.saidas, j.filiais.SEDE.kpis.entradas);
console.log('ASA', j.filiais.ASA_SUL && j.filiais.ASA_SUL.kpis.saidas);
console.log('emp', j.empresa.kpis.saidas, j.empresa.meta.cnpj);
console.log('mai LANNIC', data.fiscalPorMes.porMes['2026-05'].filiais.LANNIC.kpis.saidas);
console.log('jan LANNIC alerta', data.fiscalPorMes.porMes['2026-01'].filiais.LANNIC.meta.alerta);
