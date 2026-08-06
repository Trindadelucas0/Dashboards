'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..');
const TOL = 0.02;
const near = (a, b) => Math.abs(Number(a) - Number(b)) <= TOL;

function findObjectLiteral(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) throw new Error('marker not found');
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
  throw new Error('unclosed');
}

(async () => {
  const html = await new Promise((resolve, reject) => {
    ejs.renderFile(path.join(ROOT, 'src', 'views', 'jpg.ejs'), {}, (err, str) => (err ? reject(err) : resolve(str)));
  });
  let ok = true;
  for (const s of ['value="LANNIC"', 'LANNIC Dermocomestic', 'isDasPack', 'DAS (Simples)', '48.285.395/0001-42']) {
    if (!html.includes(s)) { console.error('FAIL html', s); ok = false; }
    else console.log('OK html', s);
  }

  const data = JSON.parse(findObjectLiteral(html, 'const JPG_DATA ='));
  const expect = {
    '2026-05': { fat: 50901.51, das: 1720.47 },
    '2026-06': { fat: 82874.55, das: 2801.15 },
    '2026-07': { fat: 560212.54, das: 18304.75 },
  };
  for (const [mes, exp] of Object.entries(expect)) {
    const f = data.fiscalPorMes.porMes[mes].filiais.LANNIC;
    if (!near(f.kpis.saidas, exp.fat) || !near(f.deducoes, exp.das) || !near(f.apuracao.das.aRecolher, exp.das)) {
      console.error('FAIL LANNIC', mes, f.kpis.saidas, f.deducoes);
      ok = false;
    } else console.log('OK LANNIC', mes, exp.fat, exp.das);
    if (!data.fiscalPorMes.porMes[mes].ordem.includes('LANNIC')) {
      console.error('FAIL ordem', mes);
      ok = false;
    }
  }
  const jan = data.fiscalPorMes.porMes['2026-01'].filiais.LANNIC;
  if ((jan.kpis.saidas || 0) !== 0) { console.error('FAIL jan should be empty'); ok = false; }
  else console.log('OK LANNIC jan stub');

  const jul = data.fiscalPorMes.porMes['2026-07'];
  const sum = ['MG', 'PR', 'SP', 'MATRIZ', 'ASA_SUL', 'SEDE', 'LANNIC']
    .reduce((a, u) => a + (jul.filiais[u].kpis.saidas || 0), 0);
  if (!near(jul.empresa.kpis.saidas, Math.round(sum * 100) / 100)) {
    console.error('FAIL consol', jul.empresa.kpis.saidas, sum);
    ok = false;
  } else console.log('OK consol jul', jul.empresa.kpis.saidas);

  // ASA_SUL and SEDE not wiped
  if (!near(jul.filiais.SEDE.kpis.entradas, 221992.04)) {
    console.error('FAIL SEDE regress', jul.filiais.SEDE.kpis.entradas);
    ok = false;
  } else console.log('OK SEDE regress');
  if ((jul.filiais.ASA_SUL.kpis.saidas || 0) < 1) {
    console.error('FAIL ASA_SUL empty unexpectedly', jul.filiais.ASA_SUL.kpis.saidas);
    ok = false;
  } else console.log('OK ASA_SUL present', jul.filiais.ASA_SUL.kpis.saidas);

  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match, i = 0;
  while ((match = re.exec(html))) {
    const code = match[1].trim();
    if (!code) continue;
    try { new vm.Script(code, { filename: 's' + i }); }
    catch (e) { console.error('syntax', i, e.message); ok = false; }
    i++;
  }
  console.log(ok ? 'SMOKE LANNIC OK' : 'SMOKE LANNIC FAIL', 'scripts', i);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
