'use strict';
/**
 * Verifica os 3 XLS de Documents vs sistema JPG SP — sem patch.
 */
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..');
const TOL = 0.02;
const CNPJ_SP = '21051983000750';
const VERIFY_RAW = path.join(ROOT, 'relatorios', '_verify-docs-sp', 'raw');
const PROD_RAW = path.join(ROOT, 'relatorios', 'jpg-movimento', 'raw');

const FILES = [
  {
    key: 'docs-sp-jun-entradas',
    prodKey: 'sp-jun-entradas',
    tipo: 'entradas',
    expectedPeriodHint: '06/2026',
    months: ['2026-06'],
  },
  {
    key: 'docs-sp-jun-saidas',
    prodKey: 'sp-jun-saidas',
    tipo: 'saidas',
    expectedPeriodHint: '06/2026',
    months: ['2026-06'],
  },
  {
    key: 'docs-sp-janmai-saidas',
    prodKey: 'sp-janmai-saidas',
    tipo: 'saidas',
    expectedPeriodHint: '01/2026',
    months: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'],
  },
];

function onlyDigits(s) {
  return String(s || '').replace(/\D/g, '');
}
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function near(a, b) {
  return Math.abs(Number(a) - Number(b)) <= TOL;
}
function parseMonth(data) {
  const m = String(data || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}`;
}
function sumLines(lines) {
  return round2((lines || []).reduce((a, l) => a + (Number(l.valor) || 0), 0));
}
function byMonth(lines) {
  const o = {};
  for (const l of lines || []) {
    const mk = parseMonth(l.data);
    if (!mk) continue;
    o[mk] = round2((o[mk] || 0) + (Number(l.valor) || 0));
  }
  return o;
}
function nfCount(lines) {
  const set = new Set();
  for (const l of lines || []) {
    set.add(`${l.nota || ''}|${l.serie || ''}`);
  }
  return set.size;
}

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

const results = [];
function ok(id, msg) {
  results.push({ id, status: 'OK', msg });
  console.log('OK:', id, '-', msg);
}
function fail(id, msg) {
  results.push({ id, status: 'FAIL', msg });
  console.error('FAIL:', id, '-', msg);
}

async function main() {
  const relatorio = {
    geradoEm: new Date().toISOString(),
    cnpjEsperado: CNPJ_SP,
    destinoDashboard: 'src/views/jpg.ejs → JPG_DATA.fiscalPorMes.porMes[YYYY-MM].filiais.SP',
    arquivos: [],
    conclusao: null,
  };

  const html = await new Promise((resolve, reject) => {
    ejs.renderFile(path.join(ROOT, 'src', 'views', 'jpg.ejs'), {}, (err, str) =>
      err ? reject(err) : resolve(str)
    );
  });
  const jpgData = JSON.parse(findObjectLiteral(html, 'const JPG_DATA ='));

  for (const meta of FILES) {
    const verifyPath = path.join(VERIFY_RAW, meta.key + '.json');
    if (!fs.existsSync(verifyPath)) {
      fail(meta.key + '-exists', 'raw verify ausente: ' + verifyPath);
      continue;
    }
    const v = JSON.parse(fs.readFileSync(verifyPath, 'utf8'));
    const sum = sumLines(v.lines);
    const tg = Number(v.totalGeral);
    const delta = round2(sum - tg);
    const cnpj = onlyDigits(v.cnpj);
    const months = byMonth(v.lines);
    const nfs = nfCount(v.lines);

    const entry = {
      arquivoDocuments: v.file,
      path: v.path,
      key: meta.key,
      prodKey: meta.prodKey,
      tipo: v.tipo || meta.tipo,
      sheet: v.sheet,
      company: v.company,
      cnpj,
      period: v.period,
      lineCount: v.lineCount,
      nfs,
      sum,
      totalGeral: tg,
      delta,
      byMonth: months,
      jaNoSistema: false,
      onde: [],
      comparacoes: {},
    };

    // 1) identity + total gate
    if (cnpj === CNPJ_SP) ok(meta.key + '-cnpj', cnpj);
    else fail(meta.key + '-cnpj', `esperado ${CNPJ_SP} got ${cnpj}`);

    if (String(v.sheet || '').toLowerCase().includes(meta.tipo === 'entradas' ? 'entrada' : 'sa')) {
      ok(meta.key + '-sheet', v.sheet);
    } else {
      fail(meta.key + '-sheet', `aba ${v.sheet} vs tipo ${meta.tipo}`);
    }

    if (Math.abs(delta) <= TOL) ok(meta.key + '-delta', `Δ=${delta}`);
    else fail(meta.key + '-delta', `Δ=${delta} sum=${sum} tg=${tg}`);

    // 2) vs prod raw
    const prodPath = path.join(PROD_RAW, meta.prodKey + '.json');
    if (fs.existsSync(prodPath)) {
      const p = JSON.parse(fs.readFileSync(prodPath, 'utf8'));
      const prodSum = sumLines(p.lines);
      const prodTg = Number(p.totalGeral);
      const matchTg = near(tg, prodTg);
      const matchLines = v.lineCount === p.lineCount;
      const matchSum = near(sum, prodSum);
      entry.comparacoes.prodRaw = {
        path: prodPath,
        totalGeral: prodTg,
        lineCount: p.lineCount,
        sum: prodSum,
        matchTg,
        matchLines,
        matchSum,
      };
      if (matchTg && matchLines && matchSum) {
        ok(meta.key + '-vs-prod-raw', `${meta.prodKey} tg=${prodTg} lines=${p.lineCount}`);
        entry.jaNoSistema = true;
        entry.onde.push(`relatorios/jpg-movimento/raw/${meta.prodKey}.json`);
      } else {
        fail(
          meta.key + '-vs-prod-raw',
          `divergiu: verify tg=${tg}/${v.lineCount} vs prod tg=${prodTg}/${p.lineCount}`
        );
      }
    } else {
      fail(meta.key + '-vs-prod-raw', 'prod raw ausente: ' + prodPath);
    }

    // 3) vs EJS SP por mês
    const ejsCmp = {};
    let ejsOk = true;
    for (const mes of meta.months) {
      const sp = jpgData.fiscalPorMes?.porMes?.[mes]?.filiais?.SP;
      if (!sp) {
        fail(meta.key + '-ejs-' + mes, 'SP ausente no EJS');
        ejsOk = false;
        continue;
      }
      const kpis = sp.kpis || {};
      const ejsVal =
        meta.tipo === 'entradas'
          ? Number(kpis.entradas ?? 0)
          : Number(kpis.saidas ?? 0);
      const fileVal = months[mes] != null ? months[mes] : 0;
      const match = near(ejsVal, fileVal);
      ejsCmp[mes] = { ejs: ejsVal, arquivo: fileVal, match };
      if (match) ok(meta.key + '-ejs-' + mes, `${fileVal} == ${ejsVal}`);
      else {
        fail(meta.key + '-ejs-' + mes, `arquivo=${fileVal} ejs=${ejsVal}`);
        ejsOk = false;
      }
    }
    entry.comparacoes.ejs = ejsCmp;
    if (ejsOk) {
      entry.jaNoSistema = true;
      entry.onde.push('src/views/jpg.ejs → filiais.SP (meses ' + meta.months.join(',') + ')');
    }

    // status final arquivo
    entry.status =
      entry.jaNoSistema && Math.abs(delta) <= TOL && cnpj === CNPJ_SP
        ? 'JA_NO_SISTEMA'
        : 'DIVERGENTE_OU_INCOMPLETO';

    relatorio.arquivos.push(entry);
  }

  const allOk = results.every((r) => r.status === 'OK');
  const allIn = relatorio.arquivos.every((a) => a.status === 'JA_NO_SISTEMA');
  relatorio.conclusao = {
    todosJaNoSistema: allIn,
    todosAssertsOk: allOk,
    patchAplicado: false,
    pendenciaConhecida: 'Entradas SP Jan–Mai não estão nestes 3 arquivos (sistema continua com compras=0 nesses meses).',
    jul2026: 'Jul SP no EJS veio de outra entrega; estes XLS não cobrem jul.',
  };

  const outDir = path.join(ROOT, 'relatorios', '_verify-docs-sp');
  fs.mkdirSync(outDir, { recursive: true });
  const outJson = path.join(outDir, 'verificacao.json');
  const outMd = path.join(outDir, 'VERIFICACAO.md');
  fs.writeFileSync(outJson, JSON.stringify({ results, relatorio }, null, 2), 'utf8');

  const lines = [
    '# Verificação Documents → JPG SP',
    '',
    `Gerado: ${relatorio.geradoEm}`,
    `Asserts: OK=${results.filter((r) => r.status === 'OK').length} FAIL=${results.filter((r) => r.status === 'FAIL').length}`,
    `Conclusão: ${allIn ? 'TODOS JÁ NO SISTEMA' : 'HÁ DIVERGÊNCIAS'} (patch=${relatorio.conclusao.patchAplicado})`,
    '',
  ];
  for (const a of relatorio.arquivos) {
    lines.push(`## ${a.arquivoDocuments}`);
    lines.push(`- Status: **${a.status}**`);
    lines.push(`- Empresa: ${a.company} | CNPJ ${a.cnpj}`);
    lines.push(`- Período: ${a.period} | aba ${a.sheet}`);
    lines.push(`- Total Geral: ${a.totalGeral} | Δ=${a.delta} | NFs=${a.nfs} | linhas=${a.lineCount}`);
    lines.push(`- Por mês: ${JSON.stringify(a.byMonth)}`);
    lines.push(`- Onde: ${a.onde.join(' | ') || '(não localizado)'}`);
    lines.push(`- Prod raw: ${a.prodKey} → match=${JSON.stringify(a.comparacoes.prodRaw || {})}`);
    lines.push('');
  }
  lines.push('## Pendências');
  lines.push(`- ${relatorio.conclusao.pendenciaConhecida}`);
  lines.push(`- ${relatorio.conclusao.jul2026}`);
  fs.writeFileSync(outMd, lines.join('\n'), 'utf8');

  console.log('\n--- RESUMO ---');
  console.log(lines.slice(0, 6).join('\n'));
  console.log('Wrote', outJson);
  console.log('Wrote', outMd);
  process.exit(allOk && allIn ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
