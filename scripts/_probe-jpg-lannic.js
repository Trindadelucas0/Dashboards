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
const data = JSON.parse(findObjectLiteral(fs.readFileSync(path.join(__dirname, '..', 'src/views/jpg.ejs'), 'utf8'), 'const JPG_DATA ='));
for (const mes of ['2026-05', '2026-06', '2026-07']) {
  const f = data.fiscalPorMes.porMes[mes].filiais.LANNIC;
  console.log(mes, {
    kpis: f && f.kpis,
    cfopE: (f.cfop_entradas || []).length,
    cfopS: (f.cfop_saidas || []).length,
    rankingC: (f.ranking_clientes || []).length,
    fonte: f && f.meta && (f.meta.alerta || f.meta.fonte || f.meta.filial_label),
  });
}
