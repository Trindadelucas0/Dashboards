'use strict';
/**
 * Full JPG validation: EJS packs vs intermediate packs + CFOP + consolidado + Jul PR.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..');
const TOL = 0.02;
const CNPJ = {
  MG: '21051983000599',
  PR: '21051983000670',
  SP: '21051983000750',
  MATRIZ: '21051983000327',
  ASA_SUL: '21051983000327',
  SEDE: '21051983000165',
};
const JUL_PR = { entradas: 8729.12, saidas: 71589.79 };

function onlyDigits(s) { return String(s || '').replace(/\D/g, ''); }
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function near(a, b) { return Math.abs(Number(a) - Number(b)) <= TOL; }

function findObjectLiteral(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) throw new Error('marker not found: ' + marker);
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

function sumCfop(arr) {
  return round2((arr || []).reduce((a, c) => a + (Number(c.total) || 0), 0));
}

const results = [];
function ok(id, msg) { results.push({ id, status: 'OK', msg }); console.log('OK:', id, '-', msg); }
function fail(id, msg) { results.push({ id, status: 'FAIL', msg }); console.error('FAIL:', id, '-', msg); }

async function main() {
  // 1) re-run file-level audit
  require('child_process').execSync('node scripts/_audit-jpg-um-a-um.js', { cwd: ROOT, stdio: 'inherit' });

  const packsPath = path.join(ROOT, 'relatorios', 'jpg-movimento', 'packs-por-mes.json');
  const packs = JSON.parse(fs.readFileSync(packsPath, 'utf8'));

  const html = await new Promise((resolve, reject) => {
    ejs.renderFile(path.join(ROOT, 'src', 'views', 'jpg.ejs'), {}, (err, str) => (err ? reject(err) : resolve(str)));
  });

  // syntax
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, si = 0;
  while ((m = re.exec(html))) {
    const code = m[1].trim();
    if (!code) continue;
    try { new vm.Script(code, { filename: 'jpg-' + si }); ok('syntax-' + si, 'script ' + si); }
    catch (e) { fail('syntax-' + si, e.message); }
    si++;
  }

  const data = JSON.parse(findObjectLiteral(html, 'const JPG_DATA ='));
  const meses = data.fiscalPorMes.meses || [];
  ok('meses', meses.join(', '));

  for (const mes of meses) {
    const pack = data.fiscalPorMes.porMes[mes];
    if (!pack) { fail('mes-' + mes, 'ausente'); continue; }
    const ordem = pack.ordem || [];
    const filiais = pack.filiais || {};

    // consolidado
    let se = 0, ss = 0;
    for (const u of ordem) {
      const f = filiais[u];
      if (!f) { fail(`${mes}-${u}`, 'filial ausente'); continue; }
      se = round2(se + (f.kpis.entradas || 0));
      ss = round2(ss + (f.kpis.saidas || 0));

      const cnpj = onlyDigits(f.meta && f.meta.cnpj);
      if (CNPJ[u] && cnpj && cnpj !== CNPJ[u]) {
        fail(`${mes}-${u}-cnpj`, `esperado ${CNPJ[u]} obtido ${cnpj}`);
      } else if (CNPJ[u]) {
        ok(`${mes}-${u}-cnpj`, CNPJ[u]);
      }

      const sumE = sumCfop(f.cfop_entradas);
      const sumS = sumCfop(f.cfop_saidas);
      if (!near(sumE, f.kpis.entradas || 0)) fail(`${mes}-${u}-cfop-e`, `cfop ${sumE} vs kpi ${f.kpis.entradas}`);
      else ok(`${mes}-${u}-cfop-e`, String(f.kpis.entradas));
      if (!near(sumS, f.kpis.saidas || 0)) fail(`${mes}-${u}-cfop-s`, `cfop ${sumS} vs kpi ${f.kpis.saidas}`);
      else ok(`${mes}-${u}-cfop-s`, String(f.kpis.saidas));

      // compare vs intermediate packs for Jan-Jun (keys RAIZ for SEDE)
      if (mes !== '2026-07' && packs[mes]) {
        const srcKey = u === 'SEDE' ? 'RAIZ' : u;
        const src = packs[mes][srcKey];
        if (src) {
          if (!near(src.kpis.entradas, f.kpis.entradas)) fail(`${mes}-${u}-vs-pack-e`, `${f.kpis.entradas} vs ${src.kpis.entradas}`);
          else ok(`${mes}-${u}-vs-pack-e`, String(f.kpis.entradas));
          if (!near(src.kpis.saidas, f.kpis.saidas)) fail(`${mes}-${u}-vs-pack-s`, `${f.kpis.saidas} vs ${src.kpis.saidas}`);
          else ok(`${mes}-${u}-vs-pack-s`, String(f.kpis.saidas));
        }
      }
    }

    const emp = pack.empresa && pack.empresa.kpis;
    if (emp) {
      if (!near(emp.entradas, se)) fail(`${mes}-consol-e`, `emp ${emp.entradas} vs sum ${se}`);
      else ok(`${mes}-consol-e`, String(se));
      if (!near(emp.saidas, ss)) fail(`${mes}-consol-s`, `emp ${emp.saidas} vs sum ${ss}`);
      else ok(`${mes}-consol-s`, String(ss));
    }

    if (mes === '2026-07' && filiais.PR) {
      if (!near(filiais.PR.kpis.entradas, JUL_PR.entradas) || !near(filiais.PR.kpis.saidas, JUL_PR.saidas)) {
        fail('jul-pr-regression', JSON.stringify(filiais.PR.kpis));
      } else ok('jul-pr-regression', 'PR Jul preservado');
    }
  }

  const fails = results.filter((r) => r.status === 'FAIL');
  const outDir = path.join(ROOT, 'relatorios', 'jpg-movimento');
  fs.writeFileSync(path.join(outDir, 'VALIDACAO-COMPLETA.json'), JSON.stringify({ results, fails: fails.length }, null, 2));
  const md = [
    '# Validação completa JPG',
    '',
    `Gerado: ${new Date().toLocaleString('pt-BR')}`,
    `OK: ${results.filter((r) => r.status === 'OK').length} | FAIL: ${fails.length}`,
    '',
    ...results.map((r) => `- **${r.status}** \`${r.id}\`: ${r.msg}`),
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'VALIDACAO-COMPLETA.md'), md);
  console.log('\nSUMMARY OK', results.length - fails.length, 'FAIL', fails.length);
  if (fails.length) process.exitCode = 2;
}

main().catch((e) => { console.error(e); process.exit(1); });
