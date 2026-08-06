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
const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'relatorios/jpg-sede-df-2026/raw/impostos-grupo-jpg.json'), 'utf8'));
const taxBy = {};
for (const r of tax.rows) {
  if (!taxBy[r.mes]) taxBy[r.mes] = {};
  taxBy[r.mes][r.unit] = r;
}
for (const mes of ['2026-01', '2026-07']) {
  for (const u of ['MATRIZ', 'SEDE', 'MG', 'PR', 'SP']) {
    const f = data.fiscalPorMes.porMes[mes].filiais[u];
    const t = taxBy[mes][u];
    console.log(mes, u, {
      hasAp: !!f.apuracao,
      apIcms: f.apuracao && f.apuracao.icms.aRecolher,
      planIcms: t && t.icms_a_recolher,
      apIpi: f.apuracao && f.apuracao.ipi.aRecolher,
      planIpi: t && t.ipi_a_recolher,
      kpiIcmsC: f.kpis.icms_credito,
      planIcmsC: t && t.icms_credito,
      kpiIpiE: f.kpis.ipi_ent,
      planIpiE: t && t.ipi_ent,
    });
  }
}
