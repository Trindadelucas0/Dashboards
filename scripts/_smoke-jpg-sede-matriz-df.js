'use strict';
/**
 * Smoke SEDE + Filial DF Jul + impostos overlay after patch.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ejs = require('ejs');
const http = require('http');

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

function httpGet(urlPath, cookie) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: 4243, path: urlPath, method: 'GET', headers: cookie ? { Cookie: cookie } : {} }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

async function main() {
  const resumo = JSON.parse(fs.readFileSync(path.join(ROOT, 'relatorios', 'jpg-sede-df-2026', 'resumo-totais.json'), 'utf8'));
  const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'relatorios', 'jpg-sede-df-2026', 'raw', 'impostos-grupo-jpg.json'), 'utf8'));
  const taxMatrizJul = tax.rows.find((r) => r.unit === 'MATRIZ' && r.mes === '2026-07');

  const html = await new Promise((resolve, reject) => {
    ejs.renderFile(path.join(ROOT, 'src', 'views', 'jpg.ejs'), {}, (err, str) => (err ? reject(err) : resolve(str)));
  });

  let ok = true;
  const must = ['value="SEDE"', 'value="MATRIZ"', 'Matriz Sede', 'Filial DF', '2026-07', 'nav-impostos', 'panel-impostos'];
  for (const m of must) {
    const hit = html.includes(m);
    console.log(hit ? 'OK' : 'FAIL', 'html', m);
    if (!hit) ok = false;
  }

  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match, i = 0;
  while ((match = re.exec(html))) {
    const code = match[1].trim();
    if (!code) continue;
    try { new vm.Script(code, { filename: 's' + i }); }
    catch (e) { console.error('FAIL syntax', i, e.message); ok = false; }
    i++;
  }
  console.log('scripts', i);

  const data = JSON.parse(findObjectLiteral(html, 'const JPG_DATA ='));
  const jul = data.fiscalPorMes.porMes['2026-07'];
  const m = jul.filiais.MATRIZ.kpis;
  const s = jul.filiais.SEDE.kpis;
  if (!near(m.entradas, 145769.55) || !near(m.saidas, 3180335.83)) {
    console.error('FAIL MATRIZ jul movimento', m.entradas, m.saidas);
    ok = false;
  } else console.log('OK MATRIZ jul movimento', m.entradas, m.saidas);
  if (!near(m.icms_credito, taxMatrizJul.icms_credito) || !near(m.icms_debito, taxMatrizJul.icms_debito)
    || !near(m.ipi_ent, taxMatrizJul.ipi_ent) || !near(m.ipi_sai, taxMatrizJul.ipi_sai)) {
    console.error('FAIL MATRIZ jul tax', m, taxMatrizJul);
    ok = false;
  } else console.log('OK MATRIZ jul tax', taxMatrizJul.icms_a_recolher);

  if (!near(s.entradas, 221992.04) || !near(s.saidas, 0)) {
    console.error('FAIL SEDE jul', s.entradas, s.saidas);
    ok = false;
  } else console.log('OK SEDE jul', s.entradas);

  for (const [mes, info] of Object.entries(resumo.sedeByMonth.entradas)) {
    const k = data.fiscalPorMes.porMes[mes].filiais.SEDE.kpis;
    if (!near(k.entradas, info.total)) {
      console.error('FAIL SEDE', mes, k.entradas, info.total);
      ok = false;
    } else console.log('OK SEDE', mes, k.entradas);
  }

  // HTTP optional
  try {
    const loginPage = await httpGet('/auth/jpg');
    if (loginPage.status === 200 || loginPage.status === 302) {
      console.log('OK http /auth/jpg', loginPage.status);
    } else {
      console.log('WARN http /auth/jpg', loginPage.status);
    }
  } catch (e) {
    console.log('WARN http indisponível:', e.message, '(valide manualmente com npm start)');
  }

  console.log(ok ? 'SMOKE SEDE+DF OK' : 'SMOKE SEDE+DF FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
