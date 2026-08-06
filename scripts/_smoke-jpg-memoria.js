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
  for (const s of ['Apuração por tributo', 'Impostos a recolher', 'initMemoria', 'aRecolher']) {
    if (!html.includes(s)) { console.error('FAIL missing', s); ok = false; }
    else console.log('OK html', s);
  }
  const data = JSON.parse(findObjectLiteral(html, 'const JPG_DATA ='));
  const m = data.fiscalPorMes.porMes['2026-07'].filiais.MATRIZ;
  if (!m.apuracao || !near(m.apuracao.icms.aRecolher, 210106.23) || !near(m.apuracao.ipi.aRecolher, 247787.16)) {
    console.error('FAIL MATRIZ apuracao', m.apuracao);
    ok = false;
  } else console.log('OK MATRIZ memoria', m.apuracao.icms.aRecolher, m.apuracao.ipi.aRecolher);
  if (!(m.impostosTabela || []).length) { console.error('FAIL impostosTabela'); ok = false; }
  else console.log('OK impostosTabela', m.impostosTabela.length);
  const emp = data.fiscalPorMes.porMes['2026-07'].empresa;
  if (!emp.apuracao) { console.error('FAIL empresa apuracao'); ok = false; }
  else console.log('OK empresa memoria icmsRec', emp.apuracao.icms.aRecolher);

  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match, i = 0;
  while ((match = re.exec(html))) {
    const code = match[1].trim();
    if (!code) continue;
    try { new vm.Script(code, { filename: 's' + i }); }
    catch (e) { console.error('syntax', i, e.message); ok = false; }
    i++;
  }
  console.log(ok ? 'SMOKE MEMORIA OK' : 'SMOKE MEMORIA FAIL', 'scripts', i);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
