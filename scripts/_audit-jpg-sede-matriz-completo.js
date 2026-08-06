'use strict';
/**
 * Auditoria completa SEDE + MATRIZ DF + impostos + memória vs fontes.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'relatorios', 'jpg-sede-df-2026');
const RAW = path.join(OUT, 'raw');
const EJS = path.join(ROOT, 'src', 'views', 'jpg.ejs');
const TOL = 0.02;
const near = (a, b) => Math.abs(Number(a) - Number(b)) <= TOL;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

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

const findings = { ok: [], faltando: [], risco: [], feito: [] };
function ok(msg) { findings.ok.push(msg); }
function falta(msg) { findings.faltando.push(msg); }
function risco(msg) { findings.risco.push(msg); }
function feito(msg) { findings.feito.push(msg); }

const requiredRaw = [
  'sede-janago-entradas.json',
  'sede-janago-saidas.json',
  'matriz-df-jul-entradas.json',
  'matriz-df-jul-saidas.json',
  'impostos-grupo-jpg.json',
];
for (const f of requiredRaw) {
  if (fs.existsSync(path.join(RAW, f))) ok('raw existe: ' + f);
  else falta('raw ausente: ' + f);
}

const rawTax = JSON.parse(fs.readFileSync(path.join(RAW, 'impostos-grupo-jpg.json'), 'utf8'));
const rawSedeE = JSON.parse(fs.readFileSync(path.join(RAW, 'sede-janago-entradas.json'), 'utf8'));
const rawSedeS = JSON.parse(fs.readFileSync(path.join(RAW, 'sede-janago-saidas.json'), 'utf8'));
const rawDfE = JSON.parse(fs.readFileSync(path.join(RAW, 'matriz-df-jul-entradas.json'), 'utf8'));
const rawDfS = JSON.parse(fs.readFileSync(path.join(RAW, 'matriz-df-jul-saidas.json'), 'utf8'));

function gate(raw, label, cnpj) {
  const sum = round2((raw.lines || []).reduce((a, l) => a + (Number(l.valor) || 0), 0));
  const tg = round2(raw.totalGeral || 0);
  if (!near(sum, tg)) falta(`${label} Δ Total Geral ${round2(sum - tg)} (sum=${sum} tg=${tg})`);
  else ok(`${label} Δ=0 sum=${sum}`);
  if (onlyDigits(raw.cnpj) !== cnpj) falta(`${label} CNPJ ${raw.cnpj} ≠ ${cnpj}`);
  else ok(`${label} CNPJ OK`);
}
gate(rawSedeE, 'SEDE entradas', '21051983000165');
gate(rawSedeS, 'SEDE saidas', '21051983000165');
gate(rawDfE, 'MATRIZ DF Jul entradas', '21051983000327');
gate(rawDfS, 'MATRIZ DF Jul saidas', '21051983000327');

const taxBy = {};
const taxUnitsMes = {};
for (const row of rawTax.rows || []) {
  if (!taxBy[row.mes]) taxBy[row.mes] = {};
  taxBy[row.mes][row.unit] = row;
  taxUnitsMes[row.unit] = taxUnitsMes[row.unit] || new Set();
  taxUnitsMes[row.unit].add(row.mes);
}
for (const u of ['SEDE', 'MATRIZ', 'PR', 'SP', 'MG']) {
  const meses = [...(taxUnitsMes[u] || [])].sort();
  if (meses.length === 7) ok(`impostos planilha: ${u} tem Jan–Jul (${meses.length})`);
  else risco(`impostos planilha: ${u} meses=${meses.join(',') || 'nenhum'}`);
}

const html = fs.readFileSync(EJS, 'utf8');
const data = JSON.parse(findObjectLiteral(html, 'const JPG_DATA ='));
const meses = data.fiscalPorMes.meses || [];
feito(`JPG meses no dashboard: ${meses.join(', ')}`);

// SEDE movimento por mês
const packs = JSON.parse(fs.readFileSync(path.join(OUT, 'packs-por-mes.json'), 'utf8'));
const split = packs.splitReport;
for (const mes of Object.keys(split.sedeEntradas).sort()) {
  const f = data.fiscalPorMes.porMes[mes] && data.fiscalPorMes.porMes[mes].filiais.SEDE;
  if (!f) { falta(`SEDE ausente no EJS ${mes}`); continue; }
  const expE = split.sedeEntradas[mes].total;
  const expS = (split.sedeSaidas[mes] && split.sedeSaidas[mes].total) || 0;
  if (!near(f.kpis.entradas, expE) || !near(f.kpis.saidas, expS)) {
    falta(`SEDE ${mes} EJS ${f.kpis.entradas}/${f.kpis.saidas} ≠ pack ${expE}/${expS}`);
  } else ok(`SEDE ${mes} movimento no EJS`);
  if (taxBy[mes] && taxBy[mes].SEDE) {
    const t = taxBy[mes].SEDE;
    if (!f.apuracao) falta(`SEDE ${mes} sem apuracao (memória)`);
    else if (!near(f.apuracao.icms.aRecolher, t.icms_a_recolher) || !near(f.apuracao.ipi.aRecolher, t.ipi_a_recolher)) {
      falta(`SEDE ${mes} apuracao ≠ planilha imposto`);
    } else ok(`SEDE ${mes} impostos+memória`);
  }
}

// MATRIZ DF
for (const mes of ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']) {
  const f = data.fiscalPorMes.porMes[mes] && data.fiscalPorMes.porMes[mes].filiais.MATRIZ;
  if (!f) { falta(`MATRIZ ausente ${mes}`); continue; }
  if (mes === '2026-07') {
    if (!near(f.kpis.entradas, 145769.55) || !near(f.kpis.saidas, 3180335.83)) {
      falta(`MATRIZ Jul movimento errado ${f.kpis.entradas}/${f.kpis.saidas}`);
    } else ok('MATRIZ Jul movimento');
  } else {
    if ((f.kpis.entradas || 0) !== 0 || (f.kpis.saidas || 0) !== 0) {
      risco(`MATRIZ ${mes} tem movimento sem planilha enviada (E=${f.kpis.entradas} S=${f.kpis.saidas})`);
    } else {
      falta(`MATRIZ ${mes}: sem movimento (planilha Jan–Jun DF não enviada) — só impostos`);
    }
  }
  if (taxBy[mes] && taxBy[mes].MATRIZ) {
    const t = taxBy[mes].MATRIZ;
    if (!f.apuracao || !near(f.apuracao.icms.aRecolher, t.icms_a_recolher)) {
      falta(`MATRIZ ${mes} memória/imposto incompleto`);
    } else ok(`MATRIZ ${mes} impostos+memória`);
  } else falta(`MATRIZ ${mes} sem linha na planilha impostos`);
}

// Overlay impostos MG/PR/SP — planejado NÃO fazer
for (const u of ['MG', 'PR', 'SP']) {
  const jul = data.fiscalPorMes.porMes['2026-07'].filiais[u];
  const t = taxBy['2026-07'] && taxBy['2026-07'][u];
  if (t && jul && jul.apuracao && near(jul.apuracao.icms.aRecolher, t.icms_a_recolher) && near(jul.kpis.ipi_ent, t.ipi_ent)) {
    ok(`${u} Jul já alinhado à planilha grupo (ou coincidência)`);
  } else if (t) {
    risco(`${u}: impostos da planilha GRUPO NÃO foram overlay no dashboard (escopo foi só SEDE/MATRIZ). Ex Jul IPI créd planilha=${t.ipi_ent} kpi=${jul && jul.kpis.ipi_ent}`);
  }
}

// Empresa consolidado Jul
const emp = data.fiscalPorMes.porMes['2026-07'].empresa;
const fil = data.fiscalPorMes.porMes['2026-07'].filiais;
const sumE = round2(['MG', 'PR', 'SP', 'MATRIZ', 'SEDE'].reduce((a, u) => a + (fil[u].kpis.entradas || 0), 0));
const sumS = round2(['MG', 'PR', 'SP', 'MATRIZ', 'SEDE'].reduce((a, u) => a + (fil[u].kpis.saidas || 0), 0));
if (!near(emp.kpis.entradas, sumE) || !near(emp.kpis.saidas, sumS)) {
  falta(`empresa Jul consol ≠ soma filiais (${emp.kpis.entradas}/${emp.kpis.saidas} vs ${sumE}/${sumS})`);
} else ok(`empresa Jul consol E/S OK ${sumE}/${sumS}`);
if (!emp.apuracao) falta('empresa Jul sem apuracao memória');
else ok('empresa Jul tem apuracao memória');

// UI
for (const s of ['Apuração por tributo', 'Impostos a recolher', 'nav-memoria', 'nav-impostos', 'value="SEDE"', 'value="MATRIZ"']) {
  if (html.includes(s)) ok('UI: ' + s);
  else falta('UI ausente: ' + s);
}

// PIS/COFINS/5005/balancete
risco('PIS/COFINS/ICMS ST zerados na memória (não vêm na planilha grupo)');
risco('Apuração 5005 / EFD oficial não importada');
risco('Balancete / DRE contábil JPG não enviados');

// Ago residual?
const hasAgo = !!data.fiscalPorMes.porMes['2026-08'];
if (hasAgo) risco('Existe mês 2026-08 no dashboard');
else ok('Sem mês 08 no dashboard (split por data entrada ficou Jan–Jul, TG casou)');

const report = {
  gerado_em: new Date().toISOString(),
  resumo: {
    ok: findings.ok.length,
    faltando: findings.faltando.length,
    risco: findings.risco.length,
  },
  feito: findings.feito,
  ok: findings.ok,
  faltando: findings.faltando,
  risco: findings.risco,
  totais_chave: {
    sede_tg_entradas: rawSedeE.totalGeral,
    sede_tg_saidas: rawSedeS.totalGeral,
    matriz_jul_e: 145769.55,
    matriz_jul_s: 3180335.83,
    matriz_jul_icms_recolher: taxBy['2026-07'] && taxBy['2026-07'].MATRIZ && taxBy['2026-07'].MATRIZ.icms_a_recolher,
    matriz_jul_ipi_recolher: taxBy['2026-07'] && taxBy['2026-07'].MATRIZ && taxBy['2026-07'].MATRIZ.ipi_a_recolher,
    empresa_jul_e: emp.kpis.entradas,
    empresa_jul_s: emp.kpis.saidas,
  },
};

fs.writeFileSync(path.join(OUT, 'auditoria-completa.json'), JSON.stringify(report, null, 2));
console.log('=== FEITO / OK ===');
findings.ok.forEach((m) => console.log('OK ', m));
console.log('\n=== FALTANDO ===');
if (!findings.faltando.length) console.log('(nada crítico além dos itens de escopo abaixo)');
findings.faltando.forEach((m) => console.log('FALTA', m));
console.log('\n=== RISCO / FORA DE ESCOPO ===');
findings.risco.forEach((m) => console.log('RISCO', m));
console.log('\nRESUMO', report.resumo);
console.log('Wrote', path.join(OUT, 'auditoria-completa.json'));
process.exit(findings.faltando.some((m) => !m.includes('sem movimento')) ? 1 : 0);
