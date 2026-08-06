'use strict';
/**
 * Valida e corrige impostos da Filial MG (JPG) contra
 * IMPOSTOS ICMS E IPI GRUPO JPG.xlsx.
 *
 * Movimento (entradas/saídas/CFOP) é preservado.
 * KPIs ICMS/IPI + apuração + memória + DRE ICMS passam a usar a planilha oficial.
 * Recalcula consolidado EMPRESA.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EJS = path.join(ROOT, 'src', 'views', 'jpg.ejs');
const TAX = path.join(ROOT, 'relatorios', 'jpg-sede-df-2026', 'raw', 'impostos-grupo-jpg.json');
const OUT = path.join(ROOT, 'relatorios', 'jpg-sede-df-2026', 'validacao-mg-impostos.json');
const UNIT = 'MG';
const TOL = 0.02;
const APPLY = !process.argv.includes('--check-only');
const TRANSFER_CFOPS = new Set(['5-152', '6-152', '5-155', '6-155', '6-910', '5-914', '6-914']);

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function near(a, b) { return Math.abs(Number(a || 0) - Number(b || 0)) <= TOL; }
function isRemessaCfop(c) {
  const cfop = String(c.cfop || '');
  const fin = String(c.finalidade || '');
  if (cfop === '5-910' || /Bonifica/i.test(fin)) return false;
  if (/Remessa|Transfer/i.test(fin)) return true;
  return TRANSFER_CFOPS.has(cfop);
}
function sumCfop(arr, pred) {
  return round2((arr || []).filter(pred || (() => true)).reduce((a, c) => a + (Number(c.total) || 0), 0));
}
function findObjectLiteral(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) throw new Error('marker not found: ' + marker);
  const start = html.indexOf('{', i);
  let depth = 0; let inStr = false; let quote = ''; let esc = false;
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
      if (depth === 0) return { start, end: j + 1, text: html.slice(start, j + 1) };
    }
  }
  throw new Error('unclosed');
}
function periodLabel(mesKey) {
  const [y, m] = mesKey.split('-');
  const last = new Date(+y, +m, 0).getDate();
  return `01/${m}/${y} até ${String(last).padStart(2, '0')}/${m}/${y}`;
}
function buildDre(kpis, cfop_saidas) {
  const receita = round2(kpis.saidas || 0);
  const cmv = round2(kpis.entradas || 0);
  const remessas = sumCfop(cfop_saidas, isRemessaCfop);
  const receita_externa = round2(receita - remessas);
  const icms_debito = round2(kpis.icms_debito || 0);
  const icms_credito = round2(kpis.icms_credito || 0);
  const saldo_icms = round2(kpis.saldo_icms != null ? kpis.saldo_icms : (icms_debito - icms_credito));
  const lucro_bruto = round2(receita_externa - cmv);
  const resultado = round2(lucro_bruto + icms_credito - icms_debito);
  return {
    receita, receita_externa, remessas_transferencias: remessas, cmv, lucro_bruto,
    margem_bruta_pct: receita_externa ? round2((lucro_bruto / receita_externa) * 100) : null,
    icms_debito, icms_credito, saldo_icms, resultado,
    margem_resultado_pct: receita_externa ? round2((resultado / receita_externa) * 100) : null,
  };
}
function emptyApLine() {
  return {
    debitoSaidas: 0, creditoEntradas: 0, outrosDebitos: 0, outrosCreditos: 0,
    saldoDevedor: 0, saldoCredor: 0, aRecolher: 0, saldoCredorTransportar: 0,
  };
}
function buildApuracaoFromTax(tax) {
  const icmsDeb = round2(tax.icms_debito || 0);
  const icmsCred = round2(tax.icms_credito || 0);
  const icmsRec = tax.icms_a_recolher != null ? round2(tax.icms_a_recolher) : round2(icmsDeb - icmsCred);
  const ipiDeb = round2(tax.ipi_sai || 0);
  const ipiCred = round2(tax.ipi_ent || 0);
  const ipiRec = tax.ipi_a_recolher != null ? round2(tax.ipi_a_recolher) : round2(ipiDeb - ipiCred);
  const icms = {
    ...emptyApLine(),
    debitoSaidas: icmsDeb,
    creditoEntradas: icmsCred,
    saldoDevedor: icmsRec > 0 ? icmsRec : 0,
    saldoCredor: icmsRec < 0 ? round2(-icmsRec) : 0,
    aRecolher: icmsRec,
  };
  const ipi = {
    ...emptyApLine(),
    debitoSaidas: ipiDeb,
    creditoEntradas: ipiCred,
    saldoDevedor: ipiRec > 0 ? ipiRec : 0,
    saldoCredor: ipiRec < 0 ? round2(-ipiRec) : 0,
    aRecolher: ipiRec,
  };
  return {
    icms, icmsSt: emptyApLine(), pis: emptyApLine(), cofins: emptyApLine(), ipi,
    fonte: 'Planilha IMPOSTOS ICMS E IPI GRUPO JPG — Filial MG',
  };
}
function buildImpostosTabela(apuracao, receita) {
  const rb = Number(receita) || 0;
  const pct = (v) => (rb > 0 ? round2((Number(v) || 0) / rb * 100) : 0);
  return [
    { tributo: 'ICMS', apurado: apuracao.icms.debitoSaidas, recolher: apuracao.icms.aRecolher, pctRb: pct(apuracao.icms.aRecolher) },
    { tributo: 'ICMS ST', apurado: 0, recolher: 0, pctRb: 0 },
    { tributo: 'PIS', apurado: 0, recolher: 0, pctRb: 0 },
    { tributo: 'COFINS', apurado: 0, recolher: 0, pctRb: 0 },
    { tributo: 'IPI', apurado: apuracao.ipi.debitoSaidas, recolher: apuracao.ipi.aRecolher, pctRb: pct(apuracao.ipi.aRecolher) },
  ];
}
function applyTax(pack, tax) {
  pack.kpis.icms_credito = round2(tax.icms_credito);
  pack.kpis.icms_debito = round2(tax.icms_debito);
  pack.kpis.saldo_icms = tax.saldo_icms != null
    ? round2(tax.saldo_icms)
    : round2(tax.icms_a_recolher != null ? tax.icms_a_recolher : (tax.icms_debito - tax.icms_credito));
  pack.kpis.ipi_ent = round2(tax.ipi_ent);
  pack.kpis.ipi_sai = round2(tax.ipi_sai);
  pack.dre = buildDre(pack.kpis, pack.cfop_saidas);
  const ap = buildApuracaoFromTax(tax);
  pack.apuracao = ap;
  pack.impostosTabela = buildImpostosTabela(ap, pack.kpis.saidas);
  pack.composicao = [
    { label: 'ICMS a recolher', valor: ap.icms.aRecolher },
    { label: 'IPI a recolher', valor: ap.ipi.aRecolher },
  ];
  pack.deducoes = round2(ap.icms.aRecolher + ap.ipi.aRecolher);
  pack.dedPct = pack.kpis.saidas ? round2((pack.deducoes / pack.kpis.saidas) * 100) : 0;
  return pack;
}
function sumKpis(list) {
  const keys = ['entradas', 'saidas', 'icms_credito', 'icms_debito', 'base_icms_ent', 'base_icms_sai', 'ipi_ent', 'ipi_sai', 'n_nf_ent', 'n_nf_sai', 'n_fornecedores', 'n_clientes'];
  const k = {};
  for (const key of keys) k[key] = round2(list.reduce((a, p) => a + (Number(p.kpis[key]) || 0), 0));
  k.saldo_icms = round2(k.icms_debito - k.icms_credito);
  return k;
}
function mergeCfops(lists) {
  const map = new Map();
  for (const arr of lists) {
    for (const c of arr || []) {
      if (!map.has(c.cfop)) {
        map.set(c.cfop, {
          cfop: c.cfop, descricao: c.descricao, finalidade: c.finalidade,
          qtd: 0, total: 0, icms: 0, base: 0, ipi: 0, credito_icms: !!c.credito_icms, _parties: new Map(),
        });
      }
      const t = map.get(c.cfop);
      if (!t.descricao && c.descricao) t.descricao = c.descricao;
      if (!t.finalidade && c.finalidade) t.finalidade = c.finalidade;
      t.credito_icms = t.credito_icms || !!c.credito_icms;
      t.qtd += c.qtd || 0;
      t.total = round2(t.total + (c.total || 0));
      t.icms = round2(t.icms + (c.icms || 0));
      t.base = round2(t.base + (c.base || 0));
      t.ipi = round2(t.ipi + (c.ipi || 0));
      for (const p of c.parties || []) {
        const pk = `${String(p.cnpj || '').trim()}|${String(p.nome || '').trim()}`;
        if (!t._parties.has(pk)) {
          t._parties.set(pk, { nome: p.nome || '—', cnpj: p.cnpj || '—', uf: p.uf || '—', total: 0, qtd: 0, icms: 0, base: 0, ipi: 0 });
        }
        const pp = t._parties.get(pk);
        pp.total = round2(pp.total + (p.total || 0));
        pp.qtd += p.qtd || 0;
        pp.icms = round2(pp.icms + (p.icms || 0));
        pp.base = round2(pp.base + (p.base || 0));
        pp.ipi = round2(pp.ipi + (p.ipi || 0));
      }
    }
  }
  const total = [...map.values()].reduce((a, c) => a + c.total, 0) || 1;
  return [...map.values()].map((c) => {
    const parties = [...c._parties.values()].sort((a, b) => b.total - a.total);
    const { _parties, ...rest } = c;
    return { ...rest, parties, pct: round2((c.total / total) * 100) };
  }).sort((a, b) => b.total - a.total);
}
function mergeRanking(lists, limit = 30) {
  const map = new Map();
  for (const arr of lists) {
    for (const p of arr || []) {
      const k = `${p.cnpj}|${p.nome}`;
      if (!map.has(k)) map.set(k, { ...p, total: 0, qtd: 0 });
      const t = map.get(k);
      t.total = round2(t.total + (p.total || 0));
      t.qtd += p.qtd || 0;
    }
  }
  const total = [...map.values()].reduce((a, p) => a + p.total, 0) || 1;
  return [...map.values()].map((p) => ({ ...p, pct: round2((p.total / total) * 100) }))
    .sort((a, b) => b.total - a.total).slice(0, limit);
}
function buildFinalidade(cfops) {
  const map = {};
  for (const c of cfops) {
    const f = c.finalidade || 'Outras';
    if (!map[f]) map[f] = { finalidade: f, total: 0, qtd: 0 };
    map[f].total += c.total; map[f].qtd += c.qtd;
  }
  const tot = Object.values(map).reduce((a, x) => a + x.total, 0) || 1;
  return Object.values(map).map((x) => ({ ...x, total: round2(x.total), pct: round2((x.total / tot) * 100) }))
    .sort((a, b) => b.total - a.total);
}
function emptyApLineMerge() { return emptyApLine(); }
function mergeApuracao(list) {
  const keys = ['icms', 'icmsSt', 'pis', 'cofins', 'ipi'];
  const out = { fonte: 'Consolidado filiais' };
  for (const key of keys) {
    const line = emptyApLineMerge();
    for (const f of list) {
      let a = f.apuracao && f.apuracao[key];
      if (!a && key === 'icms' && f.kpis) {
        a = buildApuracaoFromTax({
          icms_credito: f.kpis.icms_credito, icms_debito: f.kpis.icms_debito,
          icms_a_recolher: f.kpis.saldo_icms, ipi_ent: 0, ipi_sai: 0, ipi_a_recolher: 0,
        }).icms;
      }
      if (!a && key === 'ipi' && f.kpis) {
        a = buildApuracaoFromTax({
          icms_credito: 0, icms_debito: 0, icms_a_recolher: 0,
          ipi_ent: f.kpis.ipi_ent, ipi_sai: f.kpis.ipi_sai,
          ipi_a_recolher: round2((f.kpis.ipi_sai || 0) - (f.kpis.ipi_ent || 0)),
        }).ipi;
      }
      if (!a) a = emptyApLine();
      for (const fkey of Object.keys(line)) line[fkey] = round2(line[fkey] + (Number(a[fkey]) || 0));
    }
    out[key] = line;
  }
  return out;
}
function buildEmpresa(filiais, mesKey, ordem) {
  const list = ordem.map((k) => filiais[k]).filter(Boolean);
  const kpis = sumKpis(list);
  const cfop_entradas = mergeCfops(list.map((f) => f.cfop_entradas));
  const cfop_saidas = mergeCfops(list.map((f) => f.cfop_saidas));
  const ranking_fornecedores = mergeRanking(list.map((f) => f.ranking_fornecedores));
  const ranking_clientes = mergeRanking(list.map((f) => f.ranking_clientes));
  const ap = mergeApuracao(list);
  const empresa = {
    meta: {
      codigo: 'TODAS', nome: 'JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS',
      cnpj: `${ordem.length} unidades`, ie: '—',
      periodo: periodLabel(mesKey), uf: 'BR', filial_key: 'EMPRESA',
      filial_label: 'Empresa (consolidado)', alerta: '',
    },
    fornecedor_keys: ranking_fornecedores.map((p) => p.cnpj),
    cliente_keys: ranking_clientes.map((p) => p.cnpj),
    kpis, cfop_entradas, cfop_saidas,
    finalidade: buildFinalidade(cfop_entradas),
    ranking_fornecedores, ranking_clientes,
    notas_entradas: [], notas_saidas: [], ufs_entradas: {}, ufs_saidas: {},
    serie_diaria: { labels: [], entradas: [], saidas: [] },
    dre: buildDre(kpis, cfop_saidas),
    apuracao: ap,
    impostosTabela: buildImpostosTabela(ap, kpis.saidas),
    composicao: [
      { label: 'ICMS a recolher', valor: ap.icms.aRecolher },
      { label: 'IPI a recolher', valor: ap.ipi.aRecolher },
    ],
    deducoes: round2(ap.icms.aRecolher + ap.ipi.aRecolher),
  };
  empresa.dedPct = kpis.saidas ? round2((empresa.deducoes / kpis.saidas) * 100) : 0;
  return empresa;
}

const taxRows = JSON.parse(fs.readFileSync(TAX, 'utf8')).rows || [];
const taxByMes = {};
for (const r of taxRows) {
  if (r.unit === UNIT) taxByMes[r.mes] = r;
}

let html = fs.readFileSync(EJS, 'utf8');
const lit = findObjectLiteral(html, 'const JPG_DATA =');
const data = JSON.parse(lit.text);
const report = { unit: UNIT, apply: APPLY, before: [], after: [], fails: [] };

console.log('=== ANTES (MG vs planilha oficial) ===');
for (const mes of Object.keys(data.fiscalPorMes.porMes).sort()) {
  const pack = data.fiscalPorMes.porMes[mes].filiais[UNIT];
  const tax = taxByMes[mes];
  if (!pack || !tax) {
    console.log(mes, 'SKIP pack=' + !!pack + ' tax=' + !!tax);
    continue;
  }
  const k = pack.kpis;
  const row = {
    mes,
    entradas: k.entradas,
    saidas: k.saidas,
    dash: {
      icms_c: k.icms_credito, icms_d: k.icms_debito, saldo: k.saldo_icms,
      ipi_e: k.ipi_ent, ipi_s: k.ipi_sai,
      ap_icms: pack.apuracao && pack.apuracao.icms ? pack.apuracao.icms.aRecolher : null,
      ap_ipi: pack.apuracao && pack.apuracao.ipi ? pack.apuracao.ipi.aRecolher : null,
    },
    planilha: {
      icms_c: tax.icms_credito, icms_d: tax.icms_debito, icms_ar: tax.icms_a_recolher,
      ipi_e: tax.ipi_ent, ipi_s: tax.ipi_sai, ipi_ar: tax.ipi_a_recolher,
    },
    ok_icms: near(k.icms_credito, tax.icms_credito) && near(k.icms_debito, tax.icms_debito)
      && near(k.saldo_icms, tax.icms_a_recolher),
    ok_ipi: near(k.ipi_ent, tax.ipi_ent) && near(k.ipi_sai, tax.ipi_sai),
    ok_memoria: !!(pack.apuracao && pack.apuracao.icms
      && near(pack.apuracao.icms.aRecolher, tax.icms_a_recolher)
      && near(pack.apuracao.ipi.aRecolher, tax.ipi_a_recolher)),
  };
  report.before.push(row);
  const status = (row.ok_icms && row.ok_ipi && row.ok_memoria) ? 'OK' : 'ERRADO';
  console.log(
    mes, status,
    `ICMS c ${k.icms_credito}≠${tax.icms_credito}?`.replace('≠' + tax.icms_credito + '?', row.ok_icms ? `=${tax.icms_credito}` : `→${tax.icms_credito}`),
    `IPI ar dash=${row.dash.ap_ipi} plan=${tax.ipi_a_recolher}`
  );
}

if (APPLY) {
  for (const mes of Object.keys(data.fiscalPorMes.porMes).sort()) {
    const month = data.fiscalPorMes.porMes[mes];
    const pack = month.filiais[UNIT];
    const tax = taxByMes[mes];
    if (!pack || !tax) continue;
    const fatE = pack.kpis.entradas;
    const fatS = pack.kpis.saidas;
    applyTax(pack, tax);
    if (!near(pack.kpis.entradas, fatE) || !near(pack.kpis.saidas, fatS)) {
      report.fails.push(`${mes}: faturamento alterado`);
    }
    const ord = (month.ordem && month.ordem.length)
      ? month.ordem.slice()
      : Object.keys(month.filiais).filter((k) => k !== 'EMPRESA');
    month.ordem = ord;
    month.empresa = buildEmpresa(month.filiais, mes, ord);
  }

  const fonte = String(data.meta.fonte || '');
  if (!/Filial MG|impostos oficiais MG/i.test(fonte)) {
    data.meta.fonte = (fonte ? fonte + ' + ' : '') + 'impostos oficiais Filial MG (grupo XLSX)';
  }
  data.meta.gerado_em = new Date().toLocaleString('pt-BR');
  html = html.slice(0, lit.start) + JSON.stringify(data, null, 2) + html.slice(lit.end);
  fs.writeFileSync(EJS, html);
}

// Pós-validação
const check = JSON.parse(findObjectLiteral(fs.readFileSync(EJS, 'utf8'), 'const JPG_DATA =').text);
console.log('\n=== DEPOIS (MG vs planilha oficial) ===');
let allOk = true;
for (const mes of Object.keys(check.fiscalPorMes.porMes).sort()) {
  const pack = check.fiscalPorMes.porMes[mes].filiais[UNIT];
  const tax = taxByMes[mes];
  if (!pack || !tax) continue;
  const k = pack.kpis;
  const okIcms = near(k.icms_credito, tax.icms_credito) && near(k.icms_debito, tax.icms_debito)
    && near(k.saldo_icms, tax.icms_a_recolher);
  const okIpi = near(k.ipi_ent, tax.ipi_ent) && near(k.ipi_sai, tax.ipi_sai);
  const okMem = !!(pack.apuracao && near(pack.apuracao.icms.aRecolher, tax.icms_a_recolher)
    && near(pack.apuracao.ipi.aRecolher, tax.ipi_a_recolher));
  const okTab = (pack.impostosTabela || []).some((r) => r.tributo === 'IPI' && near(r.recolher, tax.ipi_a_recolher));
  const row = {
    mes,
    okIcms, okIpi, okMem, okTab,
    icms_ar: pack.apuracao.icms.aRecolher,
    ipi_ar: pack.apuracao.ipi.aRecolher,
    plan_ipi_ar: tax.ipi_a_recolher,
    entradas: k.entradas,
    saidas: k.saidas,
  };
  report.after.push(row);
  if (!(okIcms && okIpi && okMem && okTab)) {
    allOk = false;
    report.fails.push(mes);
    console.error('FAIL', mes, row);
  } else {
    console.log(mes, 'OK', `ICMS ar=${row.icms_ar}`, `IPI ar=${row.ipi_ar}`, `fat S=${k.saidas}`);
  }
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('\n' + (allOk ? 'PASS' : 'FAIL') + ' → ' + OUT);
process.exit(allOk ? 0 : 1);
