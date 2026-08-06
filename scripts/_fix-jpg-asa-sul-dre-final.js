'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EJS = path.join(ROOT, 'src', 'views', 'jpg.ejs');
const PACKS_PATH = path.join(ROOT, 'relatorios', 'jpg-movimento', 'packs-por-mes.json');
const TOL = 0.02;
const ORDEM = ['MG', 'PR', 'SP', 'MATRIZ', 'ASA_SUL', 'SEDE'];
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
function emptyMatriz(mesKey) {
  return {
    meta: {
      codigo: '712', nome: 'JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS',
      cnpj: '21.051.983/0003-27', ie: '—', periodo: periodLabel(mesKey), uf: 'DF',
      filial_key: 'MATRIZ', filial_label: 'Filial DF',
      alerta: 'Sem movimento nesta unidade (dados da Asa Sul estão em Filial Asa Sul DF).',
    },
    fornecedor_keys: [], cliente_keys: [],
    kpis: {
      entradas: 0, saidas: 0, icms_credito: 0, icms_debito: 0,
      base_icms_ent: 0, base_icms_sai: 0, ipi_ent: 0, ipi_sai: 0,
      saldo_icms: 0, n_nf_ent: 0, n_nf_sai: 0, n_fornecedores: 0, n_clientes: 0,
    },
    cfop_entradas: [], cfop_saidas: [], finalidade: [],
    ranking_fornecedores: [], ranking_clientes: [],
    notas_entradas: [], notas_saidas: [],
    ufs_entradas: {}, ufs_saidas: {},
    serie_diaria: { labels: [], entradas: [], saidas: [] },
    dre: {
      receita: 0, receita_externa: 0, remessas_transferencias: 0, cmv: 0,
      lucro_bruto: 0, margem_bruta_pct: null,
      icms_debito: 0, icms_credito: 0, saldo_icms: 0, resultado: 0, margem_resultado_pct: null,
    },
  };
}
function buildDreFromPack(pack) {
  const receita = round2(pack.kpis.saidas || 0);
  const cmv = round2(pack.kpis.entradas || 0);
  const remessas = sumCfop(pack.cfop_saidas, isRemessaCfop);
  const receita_externa = round2(receita - remessas);
  const icms_debito = round2(pack.kpis.icms_debito || 0);
  const icms_credito = round2(pack.kpis.icms_credito || 0);
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
function buildEmpresa(filiais, mesKey) {
  const list = ORDEM.map((k) => filiais[k]).filter(Boolean);
  const kpis = sumKpis(list);
  const cfop_entradas = mergeCfops(list.map((f) => f.cfop_entradas));
  const cfop_saidas = mergeCfops(list.map((f) => f.cfop_saidas));
  const ranking_fornecedores = mergeRanking(list.map((f) => f.ranking_fornecedores));
  const ranking_clientes = mergeRanking(list.map((f) => f.ranking_clientes));
  return {
    meta: {
      codigo: 'TODAS', nome: 'JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS', cnpj: '6 unidades', ie: '—',
      periodo: periodLabel(mesKey), uf: 'BR', filial_key: 'EMPRESA', filial_label: 'Empresa (consolidado)', alerta: '',
    },
    fornecedor_keys: ranking_fornecedores.map((p) => p.cnpj),
    cliente_keys: ranking_clientes.map((p) => p.cnpj),
    kpis, cfop_entradas, cfop_saidas,
    finalidade: buildFinalidade(cfop_entradas),
    ranking_fornecedores, ranking_clientes,
    notas_entradas: [], notas_saidas: [], ufs_entradas: {}, ufs_saidas: {},
    serie_diaria: { labels: [], entradas: [], saidas: [] },
    dre: buildDreFromPack({ kpis, cfop_saidas, cfop_entradas }),
  };
}

const NEW_RENDER = `function renderDRE(D, pfx) {
  const d = D.dre;
  const showExterna = D.meta.filial_key === 'MATRIZ' || D.meta.filial_key === 'ASA_SUL' || D.meta.filial_key === 'EMPRESA';
  const elM = $(pfx, 'dreMargins');
  if (!elM) return;
  const receitaCard = (showExterna && d.receita_externa != null) ? d.receita_externa : d.receita;
  elM.innerHTML =
    '<div class="margin-card"><div class="margin-val t-accent">'+brl(receitaCard)+'</div><div class="margin-lbl">Receita Externa</div><div class="margin-sub">Vendas sem remessas</div></div>' +
    '<div class="margin-card"><div class="margin-val">'+brl(d.cmv)+'</div><div class="margin-lbl">CMV (Entradas)</div><div class="margin-sub">Custo das mercadorias</div></div>' +
    '<div class="margin-card"><div class="margin-val t-success">'+pct(d.margem_bruta_pct)+'</div><div class="margin-lbl">Margem Bruta</div><div class="margin-sub">Lucro bruto '+brl(d.lucro_bruto)+'</div></div>' +
    '<div class="margin-card"><div class="margin-val '+(d.resultado>=0?'t-success':'t-danger')+'">'+brl(d.resultado)+'</div><div class="margin-lbl">Resultado Operacional</div><div class="margin-sub">Após saldo ICMS</div></div>';

  let rows = '';
  rows += '<tr class="dre-group"><td colspan="2">RECEITAS</td></tr>';
  rows += '<tr><td>Receita Bruta (Saídas ICMS)</td><td class="r td-val">'+brl(d.receita)+'</td></tr>';
  if (showExterna && Math.abs((d.receita_externa||0) - (d.receita||0)) > 0.009) {
    const rem = d.remessas_transferencias != null ? d.remessas_transferencias : ((d.receita||0)-(d.receita_externa||0));
    rows += '<tr class="dre-indent"><td>(−) Remessas / transferências interfiliais</td><td class="r dre-neg">('+brl(rem)+')</td></tr>';
    rows += '<tr class="dre-indent"><td>Receita Externa (sem remessas)</td><td class="r">'+brl(d.receita_externa)+'</td></tr>';
  }
  rows += '<tr class="dre-group"><td colspan="2">CUSTOS</td></tr>';
  rows += '<tr><td>(−) CMV — Entradas</td><td class="r dre-neg">('+brl(d.cmv)+')</td></tr>';
  rows += '<tr class="dre-total"><td>(=) Lucro Bruto</td><td class="r">'+brl(d.lucro_bruto)+'</td></tr>';
  rows += '<tr class="dre-group"><td colspan="2">IMPOSTOS (ICMS)</td></tr>';
  rows += '<tr class="dre-indent"><td>(−) ICMS Débito (Saídas)</td><td class="r">('+brl(d.icms_debito)+')</td></tr>';
  rows += '<tr class="dre-indent"><td>(+) ICMS Crédito (Entradas)</td><td class="r t-success">'+brl(d.icms_credito)+'</td></tr>';
  rows += '<tr><td>Saldo ICMS</td><td class="r td-val">'+brl(d.saldo_icms)+'</td></tr>';
  const k = D.kpis || {};
  rows += '<tr class="dre-group"><td colspan="2">BASE E IPI (livro ICMS)</td></tr>';
  rows += '<tr class="dre-indent"><td>Base ICMS Entradas</td><td class="r">'+brl(k.base_icms_ent||0)+'</td></tr>';
  rows += '<tr class="dre-indent"><td>Base ICMS Saídas</td><td class="r">'+brl(k.base_icms_sai||0)+'</td></tr>';
  rows += '<tr class="dre-indent"><td>IPI Entradas</td><td class="r">'+brl(k.ipi_ent||0)+'</td></tr>';
  rows += '<tr class="dre-indent"><td>IPI Saídas</td><td class="r">'+brl(k.ipi_sai||0)+'</td></tr>';
  rows += '<tr class="dre-lucro"><td>(=) Resultado Operacional (proxy)</td><td class="r">'+brl(d.resultado)+'</td></tr>';
  rows += '<tr class="dre-nd"><td colspan="2">PIS, COFINS, IRPJ e CSLL não disponíveis neste relatório ICMS.</td></tr>';
  const tbl = $(pfx, 'tblDre');
  if (tbl) tbl.innerHTML = rows;
}`;

let html = fs.readFileSync(EJS, 'utf8');
const startFn = html.indexOf('function renderDRE(D, pfx)');
if (startFn < 0) {
  console.error('renderDRE not found');
  process.exit(2);
}
const braceStart = html.indexOf('{', startFn);
let depth = 0;
let endFn = -1;
for (let j = braceStart; j < html.length; j++) {
  const ch = html[j];
  if (ch === '{') depth++;
  else if (ch === '}') {
    depth--;
    if (depth === 0) {
      endFn = j + 1;
      break;
    }
  }
}
if (endFn < 0) {
  console.error('renderDRE unclosed');
  process.exit(2);
}
html = html.slice(0, startFn) + NEW_RENDER + html.slice(endFn);
console.log('UI patched:', html.includes("filial_key === 'ASA_SUL'"));

const lit = findObjectLiteral(html, 'const JPG_DATA =');
const data = JSON.parse(lit.text);
const report = [];

for (const mes of Object.keys(data.fiscalPorMes.porMes).sort()) {
  const month = data.fiscalPorMes.porMes[mes];
  if (!month.filiais.ASA_SUL) throw new Error('ASA_SUL missing ' + mes);
  month.filiais.MATRIZ = emptyMatriz(mes);
  month.filiais.ASA_SUL.dre = buildDreFromPack(month.filiais.ASA_SUL);
  month.ordem = ORDEM.slice();
  month.empresa = buildEmpresa(month.filiais, mes);
  const d = month.filiais.ASA_SUL.dre;
  report.push({
    mes,
    receita: d.receita,
    remessas: d.remessas_transferencias,
    receita_externa: d.receita_externa,
    cmv: d.cmv,
    lucro_bruto: d.lucro_bruto,
    margem_bruta_pct: d.margem_bruta_pct,
    resultado: d.resultado,
    consol_e: month.empresa.kpis.entradas,
    consol_s: month.empresa.kpis.saidas,
  });
  console.log(mes, 'ext=' + d.receita_externa, 'rem=' + d.remessas_transferencias, 'lucro=' + d.lucro_bruto, 'consolS=' + month.empresa.kpis.saidas);
}

data.meta.fonte = 'Relatórios ICMS (.xls) — Filial Asa Sul DF Jan–Jul (DRE sem remessas; Filial DF zerada)';
data.meta.gerado_em = new Date().toLocaleString('pt-BR');
html = html.slice(0, lit.start) + JSON.stringify(data, null, 2) + html.slice(lit.end);
fs.writeFileSync(EJS, html);

if (fs.existsSync(PACKS_PATH)) {
  const packs = JSON.parse(fs.readFileSync(PACKS_PATH, 'utf8'));
  for (const mes of Object.keys(data.fiscalPorMes.porMes)) {
    if (!packs[mes]) packs[mes] = {};
    packs[mes].ASA_SUL = data.fiscalPorMes.porMes[mes].filiais.ASA_SUL;
    packs[mes].MATRIZ = emptyMatriz(mes);
  }
  fs.writeFileSync(PACKS_PATH, JSON.stringify(packs, null, 2));
}

fs.mkdirSync(path.join(ROOT, 'relatorios', 'jpg-asa-sul'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'relatorios', 'jpg-asa-sul', 'validacao-dre.json'), JSON.stringify(report, null, 2));

const checkHtml = fs.readFileSync(EJS, 'utf8');
const check = JSON.parse(findObjectLiteral(checkHtml, 'const JPG_DATA =').text);
let ok = true;
if (!checkHtml.includes("filial_key === 'ASA_SUL'")) { console.error('UI missing'); ok = false; }
for (const mes of Object.keys(check.fiscalPorMes.porMes).sort()) {
  const m = check.fiscalPorMes.porMes[mes];
  const a = m.filiais.ASA_SUL;
  const mz = m.filiais.MATRIZ;
  if (!near(mz.kpis.saidas, 0) || !near(mz.kpis.entradas, 0)) { console.error('MATRIZ dup', mes); ok = false; }
  const rem = sumCfop(a.cfop_saidas, isRemessaCfop);
  if (!near(a.dre.receita_externa, round2(a.kpis.saidas - rem))) { console.error('ext', mes); ok = false; }
  if (!near(a.dre.lucro_bruto, round2(a.dre.receita_externa - a.dre.cmv))) { console.error('lucro', mes); ok = false; }
  const expectE = round2(ORDEM.reduce((s, u) => s + (m.filiais[u].kpis.entradas || 0), 0));
  const expectS = round2(ORDEM.reduce((s, u) => s + (m.filiais[u].kpis.saidas || 0), 0));
  if (!near(m.empresa.kpis.entradas, expectE) || !near(m.empresa.kpis.saidas, expectS)) {
    console.error('consol', mes, m.empresa.kpis.entradas, expectE, m.empresa.kpis.saidas, expectS); ok = false;
  }
}
console.log(ok ? 'DRE FIX OK' : 'DRE FIX FAILED');
if (!ok) process.exit(2);
