'use strict';
/**
 * One-by-one validation: CNPJ, period, Δ Total Geral, month bucket of each line.
 */
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '..', 'relatorios', 'jpg-movimento', 'raw');
const OUT = path.join(__dirname, '..', 'relatorios', 'jpg-movimento', 'auditoria-um-a-um.json');
const TOL = 0.02;

const CNPJ_MAP = {
  '21051983000599': { unidade: 'MG', label: 'Filial MG', codigo: '90' },
  '21051983000670': { unidade: 'PR', label: 'Filial PR (Curitiba)', codigo: '81' },
  '21051983000750': { unidade: 'SP', label: 'Filial SP', codigo: '82' },
  '21051983000327': { unidade: 'MATRIZ', label: 'Filial DF (cód. 712) — pasta ind; IE DF 07.695.672/002-15', codigo: '712' },
  '21051983000165': { unidade: 'SEDE', label: 'Matriz Sede (cód. 711) — pasta matriz e filial; IE DF 07.695.672/001-34', codigo: '711' },
};

function onlyDigits(s) { return String(s || '').replace(/\D/g, ''); }
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function parsePeriod(p) {
  const m = String(p || '').match(/(\d{2})\/(\d{2})\/(\d{4}).*?(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return { de: `${m[3]}-${m[2]}`, ate: `${m[6]}-${m[5]}`, raw: p };
}
function monthOf(data) {
  const m = String(data || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}`;
}

const files = fs.readdirSync(RAW).filter((f) => f.endsWith('.json')).sort();
const report = [];

for (const file of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(RAW, file), 'utf8'));
  const cnpj = onlyDigits(raw.cnpj);
  const map = CNPJ_MAP[cnpj] || { unidade: '???', label: 'CNPJ desconhecido', codigo: '?' };
  const sum = round2((raw.lines || []).reduce((a, l) => a + (Number(l.valor) || 0), 0));
  const tg = round2(raw.totalGeral || 0);
  const delta = round2(sum - tg);
  const period = parsePeriod(raw.period);
  const byMes = {};
  let noDate = 0;
  let foraPeriodo = 0;
  for (const l of raw.lines || []) {
    const mes = monthOf(l.data);
    if (!mes) { noDate++; continue; }
    byMes[mes] = round2((byMes[mes] || 0) + (Number(l.valor) || 0));
    if (period) {
      if (mes < period.de || mes > period.ate) foraPeriodo++;
    }
  }
  const meses = Object.keys(byMes).sort();
  const mensalEsperado = period && period.de === period.ate ? period.de : null;
  const splitEsperado = period && period.de !== period.ate;

  // assignment check vs how we used the file
  let destinacaoOk = true;
  let destinacaoNota = '';
  if (raw.modo === 'mensal' && raw.competencia) {
    destinacaoOk = mensalEsperado === raw.competencia || (mensalEsperado == null && meses.length === 1 && meses[0] === raw.competencia);
    destinacaoNota = `destinado a ${raw.competencia}; cabeçalho mensal=${mensalEsperado || 'n/d'}; linhas meses=[${meses.join(',')}]`;
  } else if (raw.modo === 'acumulado') {
    destinacaoOk = splitEsperado && noDate === 0 && foraPeriodo === 0;
    destinacaoNota = `split por data → [${meses.join(', ')}]; foraPeriodo=${foraPeriodo} semData=${noDate}`;
  }

  report.push({
    arquivoRaw: file,
    arquivoXls: raw.file,
    pastaFonte: (raw.path || '').includes('Desktop') ? String(raw.path).split('Desktop\\')[1] || raw.path : raw.path,
    sheet: raw.sheet,
    company: raw.company,
    cnpjRaw: raw.cnpj,
    cnpjDigits: cnpj,
    identidade: map,
    periodCabecalho: raw.period,
    periodParsed: period,
    modo: raw.modo,
    competenciaDeclarada: raw.competencia || null,
    lineCount: raw.lineCount,
    sumLinhas: sum,
    totalGeral: tg,
    delta,
    validacaoTotal: Math.abs(delta) <= TOL,
    mesesNasLinhas: byMes,
    linhasSemData: noDate,
    linhasForaPeriodoCabecalho: foraPeriodo,
    destinacaoOk,
    destinacaoNota,
    unidadeDashboardCorreta: map.unidade,
  });
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

console.log('AUDITORIA ARQUIVO A ARQUIVO\n');
for (const r of report) {
  const flag = (r.validacaoTotal && r.destinacaoOk) ? 'OK' : 'ATENCAO';
  console.log(`[${flag}] ${r.arquivoRaw}`);
  console.log(`  XLS: ${r.arquivoXls}`);
  console.log(`  Cabeçalho: ${r.company}`);
  console.log(`  CNPJ ${r.cnpjDigits} → ${r.identidade.label} (${r.identidade.unidade})`);
  console.log(`  Período: ${r.periodCabecalho}`);
  console.log(`  Δ Total Geral: ${r.delta} (sum=${r.sumLinhas} tg=${r.totalGeral}) ${r.validacaoTotal ? 'OK' : 'FALHOU'}`);
  console.log(`  Meses nas linhas: ${JSON.stringify(r.mesesNasLinhas)}`);
  console.log(`  Destinação: ${r.destinacaoNota} → ${r.destinacaoOk ? 'OK' : 'REVISAR'}`);
  console.log('');
}

const fail = report.filter((r) => !r.validacaoTotal || !r.destinacaoOk);
console.log(`Total arquivos: ${report.length} | com atenção: ${fail.length}`);
console.log('Wrote', OUT);
