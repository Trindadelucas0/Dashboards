'use strict';
/**
 * Aplica impostos oficiais (IMPOSTOS ICMS E IPI GRUPO JPG.xlsx → Filial DF)
 * na unidade ASA_SUL e recalcula DRE + consolidado EMPRESA.
 * Faturamento (entradas/saídas) permanece o do livro ICMS.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EJS = path.join(ROOT, 'src', 'views', 'jpg.ejs');
const TAX = path.join(ROOT, 'relatorios', 'jpg-sede-df-2026', 'raw', 'impostos-grupo-jpg.json');
const TOL = 0.02;
const TRANSFER_CFOPS = new Set(['5-152', '6-152', '5-155', '6-155', '6-910', '5-914', '6-914']);

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function near(a, b) { return Math.abs(Number(a) - Number(b)) <= TOL; }
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
  const saldo_icms = round2(icms_debito - icms_credito);
  const lucro_bruto = round2(receita_externa - cmv);
  const resultado = round2(lucro_bruto + icms_credito - icms_debito);
  return {
    receita, receita_externa, remessas_transferencias: remessas, cmv, lucro_bruto,
    margem_bruta_pct: receita_externa ? round2((lucro_bruto / receita_externa) * 100) : null,
    icms_debito, icms_credito, saldo_icms, resultado,
    margem_resultado_pct: receita_externa ? round2((resultado / receita_externa) * 100) : null,
  };
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
function buildEmpresa(filiais, mesKey, ordem) {
  const list = ordem.map((k) => filiais[k]).filter(Boolean);
  const kpis = sumKpis(list);
  const cfop_entradas = mergeCfops(list.map((f) => f.cfop_entradas));
  const cfop_saidas = mergeCfops(list.map((f) => f.cfop_saidas));
  const ranking_fornecedores = mergeRanking(list.map((f) => f.ranking_fornecedores));
  const ranking_clientes = mergeRanking(list.map((f) => f.ranking_clientes));
  return {
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
  };
}

const taxRows = JSON.parse(fs.readFileSync(TAX, 'utf8')).rows || [];
const taxByMes = {};
for (const r of taxRows) {
  if (r.unit === 'MATRIZ' || /Filial DF/i.test(r.filial || '')) taxByMes[r.mes] = r;
}

let html = fs.readFileSync(EJS, 'utf8');
const lit = findObjectLiteral(html, 'const JPG_DATA =');
const data = JSON.parse(lit.text);
const report = [];

for (const mes of Object.keys(data.fiscalPorMes.porMes).sort()) {
  const month = data.fiscalPorMes.porMes[mes];
  const asa = month.filiais.ASA_SUL;
  if (!asa) continue;
  const tax = taxByMes[mes];
  if (!tax) {
    console.log('SKIP tax', mes);
    continue;
  }
  const before = {
    icmsC: asa.kpis.icms_credito, icmsD: asa.kpis.icms_debito,
    ipiE: asa.kpis.ipi_ent, ipiS: asa.kpis.ipi_sai,
  };
  asa.kpis.icms_credito = round2(tax.icms_credito);
  asa.kpis.icms_debito = round2(tax.icms_debito);
  asa.kpis.saldo_icms = round2(tax.icms_a_recolher != null ? tax.icms_a_recolher : (tax.icms_debito - tax.icms_credito));
  asa.kpis.ipi_ent = round2(tax.ipi_ent);
  asa.kpis.ipi_sai = round2(tax.ipi_sai);
  asa.dre = buildDre(asa.kpis, asa.cfop_saidas);

  const ord = month.ordem && month.ordem.length ? month.ordem.slice() : ['MG', 'PR', 'SP', 'MATRIZ', 'ASA_SUL', 'SEDE'];
  if (!ord.includes('ASA_SUL')) {
    const i = ord.indexOf('MATRIZ');
    if (i >= 0) ord.splice(i + 1, 0, 'ASA_SUL');
    else ord.push('ASA_SUL');
  }
  month.ordem = ord;
  month.empresa = buildEmpresa(month.filiais, mes, ord);

  report.push({
    mes,
    faturamento_saidas: asa.kpis.saidas,
    faturamento_entradas: asa.kpis.entradas,
    before, after: {
      icmsC: asa.kpis.icms_credito, icmsD: asa.kpis.icms_debito,
      saldo: asa.kpis.saldo_icms, ipiE: asa.kpis.ipi_ent, ipiS: asa.kpis.ipi_sai,
    },
    vsTax: {
      icmsC: near(asa.kpis.icms_credito, tax.icms_credito),
      icmsD: near(asa.kpis.icms_debito, tax.icms_debito),
      ipiE: near(asa.kpis.ipi_ent, tax.ipi_ent),
      ipiS: near(asa.kpis.ipi_sai, tax.ipi_sai),
    },
  });
  console.log(
    mes,
    'fat S=' + asa.kpis.saidas,
    'icmsD', before.icmsD, '->', asa.kpis.icms_debito,
    'ipiS', before.ipiS, '->', asa.kpis.ipi_sai,
    'saldo', asa.kpis.saldo_icms
  );
}

data.meta.fonte = 'Movimento ICMS Asa Sul (Downloads) + impostos oficiais Filial DF (grupo XLSX)';
data.meta.gerado_em = new Date().toLocaleString('pt-BR');
html = html.slice(0, lit.start) + JSON.stringify(data, null, 2) + html.slice(lit.end);
fs.writeFileSync(EJS, html);
fs.writeFileSync(path.join(ROOT, 'relatorios', 'jpg-asa-sul', 'validacao-impostos.json'), JSON.stringify(report, null, 2));

// post
const check = JSON.parse(findObjectLiteral(fs.readFileSync(EJS, 'utf8'), 'const JPG_DATA =').text);
let ok = true;
for (const r of report) {
  const asa = check.fiscalPorMes.porMes[r.mes].filiais.ASA_SUL;
  const tax = taxByMes[r.mes];
  if (!near(asa.kpis.icms_debito, tax.icms_debito) || !near(asa.kpis.ipi_sai, tax.ipi_sai)) {
    console.error('POST FAIL', r.mes); ok = false;
  }
  if (!near(asa.kpis.saidas, r.faturamento_saidas)) {
    console.error('FAT changed', r.mes); ok = false;
  }
}
console.log(ok ? 'IMPOSTOS ASA_SUL OK (faturamento preservado)' : 'FAILED');
if (!ok) process.exit(2);
