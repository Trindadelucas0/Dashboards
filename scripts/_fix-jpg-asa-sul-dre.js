'use strict';
/**
 * Corrige DRE da Filial Asa Sul DF:
 * - receita_externa = saídas sem remessas/transferências
 * - lucro/resultado/margem com base na receita externa
 * - reinstala ASA_SUL na ordem e recalcula consolidado EMPRESA
 * - UI renderDRE passa a exibir linha de receita externa para ASA_SUL
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EJS = path.join(ROOT, 'src', 'views', 'jpg.ejs');
const PACKS_PATH = path.join(ROOT, 'relatorios', 'jpg-movimento', 'packs-por-mes.json');
const TOL = 0.02;
const ORDEM = ['MG', 'PR', 'SP', 'MATRIZ', 'ASA_SUL', 'SEDE'];

const TRANSFER_CFOPS = new Set([
  '5-152', '6-152', '5-155', '6-155',
  '6-910', '5-914', '6-914',
]);

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function near(a, b) { return Math.abs(Number(a) - Number(b)) <= TOL; }

function isRemessaCfop(c) {
  const cfop = String(c.cfop || '');
  const fin = String(c.finalidade || '');
  // Bonificação (5-910) permanece na receita externa
  if (cfop === '5-910' || /Bonifica/i.test(fin)) return false;
  if (/Remessa|Transfer/i.test(fin)) return true;
  return TRANSFER_CFOPS.has(cfop);
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

function sumCfop(arr, pred) {
  return round2((arr || []).filter(pred || (() => true)).reduce((a, c) => a + (Number(c.total) || 0), 0));
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
    receita,
    receita_externa,
    remessas_transferencias: remessas,
    cmv,
    lucro_bruto,
    margem_bruta_pct: receita_externa ? round2((lucro_bruto / receita_externa) * 100) : null,
    icms_debito,
    icms_credito,
    saldo_icms,
    resultado,
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
          t._parties.set(pk, {
            nome: p.nome || '—', cnpj: p.cnpj || '—', uf: p.uf || '—',
            total: 0, qtd: 0, icms: 0, base: 0, ipi: 0,
          });
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
  const fake = { kpis, cfop_saidas, cfop_entradas };
  const dre = buildDreFromPack(fake);
  return {
    meta: {
      codigo: 'TODAS',
      nome: 'JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS',
      cnpj: '6 unidades',
      ie: '—',
      periodo: periodLabel(mesKey),
      uf: 'BR',
      filial_key: 'EMPRESA',
      filial_label: 'Empresa (consolidado)',
      alerta: '',
    },
    fornecedor_keys: ranking_fornecedores.map((p) => p.cnpj),
    cliente_keys: ranking_clientes.map((p) => p.cnpj),
    kpis,
    cfop_entradas,
    cfop_saidas,
    finalidade: buildFinalidade(cfop_entradas),
    ranking_fornecedores,
    ranking_clientes,
    notas_entradas: [],
    notas_saidas: [],
    ufs_entradas: {},
    ufs_saidas: {},
    serie_diaria: { labels: [], entradas: [], saidas: [] },
    dre,
  };
}

let html = fs.readFileSync(EJS, 'utf8');

// Fix renderDRE to include ASA_SUL in externa breakdown + show remessas line
html = html.replace(
  `function renderDRE(D, pfx) {
  const d = D.dre;
  const isMatriz = D.meta.filial_key === 'MATRIZ';
  const elM = $(pfx, 'dreMargins');
  if (!elM) return;
  elM.innerHTML =
    '<div class="margin-card"><div class="margin-val t-accent">'+brl(d.receita)+'</div><div class="margin-lbl">Receita Bruta</div><div class="margin-sub">Saídas ICMS</div></div>' +
    '<div class="margin-card"><div class="margin-val">'+brl(d.cmv)+'</div><div class="margin-lbl">CMV (Entradas)</div><div class="margin-sub">Custo das mercadorias</div></div>' +
    '<div class="margin-card"><div class="margin-val t-success">'+pct(d.margem_bruta_pct)+'</div><div class="margin-lbl">Margem Bruta</div><div class="margin-sub">Lucro bruto '+brl(d.lucro_bruto)+'</div></div>' +
    '<div class="margin-card"><div class="margin-val '+(d.resultado>=0?'t-success':'t-danger')+'">'+brl(d.resultado)+'</div><div class="margin-lbl">Resultado Operacional</div><div class="margin-sub">Após saldo ICMS</div></div>';

  let rows = '';
  rows += '<tr class="dre-group"><td colspan="2">RECEITAS</td></tr>';
  rows += '<tr><td>Receita Bruta (Saídas)</td><td class="r td-val">'+brl(d.receita)+'</td></tr>';
  if (isMatriz && d.receita_externa !== d.receita) {
    rows += '<tr class="dre-indent"><td>Receita Externa (sem transferências)</td><td class="r">'+brl(d.receita_externa)+'</td></tr>';
  }`,
  `function renderDRE(D, pfx) {
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
    rows += '<tr class="dre-indent"><td>(−) Remessas / transferências interfiliais</td><td class="r dre-neg">('+brl(d.remessas_transferencias != null ? d.remessas_transferencias : ((d.receita||0)-(d.receita_externa||0)))+')</td></tr>';
    rows += '<tr class="dre-indent"><td>Receita Externa (sem remessas)</td><td class="r">'+brl(d.receita_externa)+'</td></tr>';
  }`
);

// Fix codigo label in filial block for ASA_SUL
html = html.replace(
  '${label} <small>Cód. ${key === \'MATRIZ\' ? \'712\' : \'\'}</small>',
  "${label} <small>Cód. ${key === 'MATRIZ' || key === 'ASA_SUL' ? '712' : (key === 'SEDE' ? '711' : '')}</small>"
);

const lit = findObjectLiteral(html, 'const JPG_DATA =');
const data = JSON.parse(lit.text);
const report = [];

for (const mes of Object.keys(data.fiscalPorMes.porMes).sort()) {
  const month = data.fiscalPorMes.porMes[mes];
  if (!month.filiais.ASA_SUL) throw new Error('ASA_SUL missing ' + mes);

  const before = { ...month.filiais.ASA_SUL.dre };
  month.filiais.ASA_SUL.dre = buildDreFromPack(month.filiais.ASA_SUL);
  month.ordem = ORDEM.slice();
  month.empresa = buildEmpresa(month.filiais, mes);

  const d = month.filiais.ASA_SUL.dre;
  report.push({
    mes,
    before_receita_ext: before.receita_externa,
    before_lucro: before.lucro_bruto,
    after_receita: d.receita,
    after_ext: d.receita_externa,
    remessas: d.remessas_transferencias,
    cmv: d.cmv,
    lucro: d.lucro_bruto,
    margem: d.margem_bruta_pct,
    consol_e: month.empresa.kpis.entradas,
    consol_s: month.empresa.kpis.saidas,
  });
  console.log(
    mes,
    'ext', before.receita_externa, '->', d.receita_externa,
    'lucro', before.lucro_bruto, '->', d.lucro_bruto,
    'remessas', d.remessas_transferencias,
    'margem', d.margem_bruta_pct + '%'
  );
}

data.meta.fonte = 'Relatórios ICMS (.xls) — Filial Asa Sul DF Jan–Jul (DRE sem remessas); MG/PR/SP/SEDE preservados';
data.meta.gerado_em = new Date().toLocaleString('pt-BR');

html = html.slice(0, lit.start) + JSON.stringify(data, null, 2) + html.slice(lit.end);
fs.writeFileSync(EJS, html);

// sync packs
if (fs.existsSync(PACKS_PATH)) {
  const packs = JSON.parse(fs.readFileSync(PACKS_PATH, 'utf8'));
  for (const mes of Object.keys(data.fiscalPorMes.porMes)) {
    if (!packs[mes]) packs[mes] = {};
    packs[mes].ASA_SUL = data.fiscalPorMes.porMes[mes].filiais.ASA_SUL;
  }
  fs.writeFileSync(PACKS_PATH, JSON.stringify(packs, null, 2));
}

fs.writeFileSync(
  path.join(ROOT, 'relatorios', 'jpg-asa-sul', 'validacao-dre.json'),
  JSON.stringify(report, null, 2)
);

// Post asserts
const check = JSON.parse(findObjectLiteral(fs.readFileSync(EJS, 'utf8'), 'const JPG_DATA =').text);
let ok = true;
for (const mes of Object.keys(check.fiscalPorMes.porMes).sort()) {
  const m = check.fiscalPorMes.porMes[mes];
  if (!m.ordem.includes('ASA_SUL')) { console.error('ordem fail', mes); ok = false; }
  const a = m.filiais.ASA_SUL;
  const d = a.dre;
  const rem = sumCfop(a.cfop_saidas, isRemessaCfop);
  if (!near(d.receita, a.kpis.saidas)) { console.error('receita', mes); ok = false; }
  if (!near(d.cmv, a.kpis.entradas)) { console.error('cmv', mes); ok = false; }
  if (!near(d.remessas_transferencias, rem)) { console.error('remessas', mes, d.remessas_transferencias, rem); ok = false; }
  if (!near(d.receita_externa, round2(d.receita - rem))) { console.error('ext', mes); ok = false; }
  if (!near(d.lucro_bruto, round2(d.receita_externa - d.cmv))) { console.error('lucro', mes); ok = false; }
  const expectE = round2(ORDEM.reduce((s, u) => s + (m.filiais[u].kpis.entradas || 0), 0));
  const expectS = round2(ORDEM.reduce((s, u) => s + (m.filiais[u].kpis.saidas || 0), 0));
  if (!near(m.empresa.kpis.entradas, expectE) || !near(m.empresa.kpis.saidas, expectS)) {
    console.error('consol', mes, m.empresa.kpis.entradas, expectE, m.empresa.kpis.saidas, expectS);
    ok = false;
  }
}
if (!fs.readFileSync(EJS, 'utf8').includes("filial_key === 'ASA_SUL'")) {
  console.error('renderDRE UI patch missing');
  ok = false;
}

console.log(ok ? 'DRE ASA_SUL OK' : 'DRE ASA_SUL FAILED');
if (!ok) process.exit(2);
