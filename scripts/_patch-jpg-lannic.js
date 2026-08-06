'use strict';
/**
 * Add LANNIC Dermocomestic as JPG filial (Simples Nacional — faturamento + DAS).
 * Months Mai–Jul/2026 from relatorios/jpg-lannic/lannic-faturamento-das.json.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EJS = path.join(ROOT, 'src', 'views', 'jpg.ejs');
const SRC = path.join(ROOT, 'relatorios', 'jpg-lannic', 'lannic-faturamento-das.json');
const TOL = 0.02;
const ORDEM = ['MG', 'PR', 'SP', 'MATRIZ', 'ASA_SUL', 'SEDE', 'LANNIC'];
const PRESERVE = ['MG', 'PR', 'SP', 'MATRIZ', 'ASA_SUL', 'SEDE'];

const META = {
  codigo: 'SN',
  cnpj: '48.285.395/0001-42',
  label: 'LANNIC Dermocomestic',
  nome: 'LANNIC DERMOCOMESTIC',
  uf: 'DF',
  ie: '—',
  regime: 'Simples Nacional',
};

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

function emptyApLine() {
  return {
    debitoSaidas: 0, creditoEntradas: 0, outrosDebitos: 0, outrosCreditos: 0,
    saldoDevedor: 0, saldoCredor: 0, aRecolher: 0, saldoCredorTransportar: 0,
  };
}

function emptyFilial(mesKey, alerta) {
  return {
    meta: {
      codigo: META.codigo,
      nome: META.nome,
      cnpj: META.cnpj,
      ie: META.ie,
      periodo: periodLabel(mesKey),
      uf: META.uf,
      filial_key: 'LANNIC',
      filial_label: META.label,
      regime: META.regime,
      alerta: alerta || `Sem planilha LANNIC em ${mesKey}.`,
    },
    fornecedor_keys: [],
    cliente_keys: [],
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
    impostosTabela: [],
    composicao: [],
    deducoes: 0,
    dedPct: 0,
    apuracao: {
      icms: emptyApLine(), icmsSt: emptyApLine(), pis: emptyApLine(),
      cofins: emptyApLine(), ipi: emptyApLine(),
      fonte: 'Aguardando planilha LANNIC',
    },
    dre: {
      receita: 0, receita_externa: 0, cmv: 0, lucro_bruto: 0, margem_bruta_pct: null,
      icms_debito: 0, icms_credito: 0, saldo_icms: 0, resultado: 0, margem_resultado_pct: null,
    },
  };
}

function buildLannicPack(mesKey, faturamento, das) {
  const fat = round2(faturamento);
  const d = round2(das);
  const pctRb = fat ? round2((d / fat) * 100) : 0;
  return {
    meta: {
      codigo: META.codigo,
      nome: META.nome,
      cnpj: META.cnpj,
      ie: META.ie,
      periodo: periodLabel(mesKey),
      uf: META.uf,
      filial_key: 'LANNIC',
      filial_label: META.label,
      regime: META.regime,
      alerta: 'Regime Simples Nacional — faturamento + DAS (LANNIC.xlsx). Sem livro ICMS EXITO.',
    },
    fornecedor_keys: [],
    cliente_keys: [],
    kpis: {
      entradas: 0,
      saidas: fat,
      icms_credito: 0,
      icms_debito: 0,
      base_icms_ent: 0,
      base_icms_sai: 0,
      ipi_ent: 0,
      ipi_sai: 0,
      saldo_icms: 0,
      n_nf_ent: 0,
      n_nf_sai: 0,
      n_fornecedores: 0,
      n_clientes: 0,
    },
    cfop_entradas: [],
    cfop_saidas: [],
    finalidade: [],
    ranking_fornecedores: [],
    ranking_clientes: [],
    notas_entradas: [],
    notas_saidas: [],
    ufs_entradas: {},
    ufs_saidas: {},
    serie_diaria: { labels: [], entradas: [], saidas: [] },
    impostosTabela: [
      { tributo: 'DAS (Simples Nacional)', apurado: fat, recolher: d, pctRb },
    ],
    composicao: [{ label: 'DAS (Simples Nacional)', valor: d }],
    deducoes: d,
    dedPct: pctRb,
    apuracao: {
      icms: emptyApLine(),
      icmsSt: emptyApLine(),
      pis: emptyApLine(),
      cofins: emptyApLine(),
      ipi: emptyApLine(),
      das: {
        ...emptyApLine(),
        debitoSaidas: fat,
        saldoDevedor: d,
        aRecolher: d,
      },
      fonte: 'Simples Nacional — LANNIC.xlsx',
    },
    dre: {
      receita: fat,
      receita_externa: fat,
      cmv: 0,
      lucro_bruto: fat,
      margem_bruta_pct: 100,
      icms_debito: 0,
      icms_credito: 0,
      saldo_icms: 0,
      resultado: round2(fat - d),
      margem_resultado_pct: fat ? round2(((fat - d) / fat) * 100) : null,
    },
  };
}

function sumKpis(list) {
  const keys = [
    'entradas', 'saidas', 'icms_credito', 'icms_debito', 'base_icms_ent', 'base_icms_sai',
    'ipi_ent', 'ipi_sai', 'n_nf_ent', 'n_nf_sai', 'n_fornecedores', 'n_clientes',
  ];
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
    map[f].total += c.total;
    map[f].qtd += c.qtd;
  }
  const tot = Object.values(map).reduce((a, x) => a + x.total, 0) || 1;
  return Object.values(map).map((x) => ({ ...x, total: round2(x.total), pct: round2((x.total / tot) * 100) }))
    .sort((a, b) => b.total - a.total);
}

function mergeApuracao(list) {
  const keys = ['icms', 'icmsSt', 'pis', 'cofins', 'ipi', 'das'];
  const out = { fonte: 'Consolidado filiais (inclui LANNIC DAS quando houver)' };
  for (const key of keys) {
    const line = emptyApLine();
    for (const f of list) {
      const a = (f.apuracao && f.apuracao[key]) || emptyApLine();
      for (const fk of Object.keys(line)) line[fk] = round2(line[fk] + (Number(a[fk]) || 0));
    }
    out[key] = line;
  }
  return out;
}

function mergeImpostosTabela(list) {
  const map = new Map();
  for (const f of list) {
    for (const t of f.impostosTabela || []) {
      const k = t.tributo || '—';
      if (!map.has(k)) map.set(k, { tributo: k, apurado: 0, recolher: 0 });
      const x = map.get(k);
      x.apurado = round2(x.apurado + (t.apurado || 0));
      x.recolher = round2(x.recolher + (t.recolher || 0));
    }
  }
  const receita = list.reduce((a, f) => a + (Number(f.kpis && f.kpis.saidas) || 0), 0);
  return [...map.values()].map((t) => ({
    ...t,
    pctRb: receita ? round2((t.recolher / receita) * 100) : 0,
  }));
}

function buildEmpresa(mesKey, filiais) {
  const list = ORDEM.map((k) => filiais[k]).filter(Boolean);
  const kpis = sumKpis(list);
  const cfop_entradas = mergeCfops(list.map((f) => f.cfop_entradas));
  const cfop_saidas = mergeCfops(list.map((f) => f.cfop_saidas));
  const ranking_fornecedores = mergeRanking(list.map((f) => f.ranking_fornecedores));
  const ranking_clientes = mergeRanking(list.map((f) => f.ranking_clientes));
  const ufs_entradas = {};
  const ufs_saidas = {};
  for (const f of list) {
    for (const [uf, v] of Object.entries(f.ufs_entradas || {})) ufs_entradas[uf] = round2((ufs_entradas[uf] || 0) + v);
    for (const [uf, v] of Object.entries(f.ufs_saidas || {})) ufs_saidas[uf] = round2((ufs_saidas[uf] || 0) + v);
  }
  const apuracao = mergeApuracao(list);
  const impostosTabela = mergeImpostosTabela(list);
  const deducoes = round2(impostosTabela.reduce((a, t) => a + (t.recolher || 0), 0));
  return {
    meta: {
      codigo: 'TODAS',
      nome: 'JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS',
      cnpj: '7 unidades',
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
    ufs_entradas,
    ufs_saidas,
    serie_diaria: { labels: [], entradas: [], saidas: [] },
    apuracao,
    impostosTabela,
    composicao: impostosTabela.map((t) => ({ label: t.tributo, valor: t.recolher })),
    deducoes,
    dedPct: kpis.saidas ? round2((deducoes / kpis.saidas) * 100) : 0,
    dre: {
      receita: kpis.saidas,
      receita_externa: kpis.saidas,
      cmv: kpis.entradas,
      lucro_bruto: round2(kpis.saidas - kpis.entradas),
      margem_bruta_pct: kpis.saidas ? round2(((kpis.saidas - kpis.entradas) / kpis.saidas) * 100) : null,
      icms_debito: kpis.icms_debito,
      icms_credito: kpis.icms_credito,
      saldo_icms: kpis.saldo_icms,
      resultado: round2(kpis.saidas - kpis.entradas + kpis.icms_credito - kpis.icms_debito - (apuracao.das ? apuracao.das.aRecolher : 0)),
      margem_resultado_pct: null,
    },
  };
}

// --- main ---
const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const byMes = {};
for (const r of src.rows) byMes[r.mes] = r;

let html = fs.readFileSync(EJS, 'utf8');

if (!html.includes('value="LANNIC"')) {
  html = html.replace(
    '<option value="SEDE">Matriz Sede</option>',
    '<option value="SEDE">Matriz Sede</option>\n\n          <option value="LANNIC">LANNIC Dermocomestic</option>'
  );
}

html = html.replace(
  /\['MG', 'PR', 'SP', 'MATRIZ', 'ASA_SUL', 'SEDE'\]/g,
  "['MG', 'PR', 'SP', 'MATRIZ', 'ASA_SUL', 'SEDE', 'LANNIC']"
);

// UI: show DAS in impostos/memória when present
if (!html.includes('DAS (Simples') || !html.includes('isDasPack')) {
  // patch initImpostos / initMemoria via markers if not already DAS-aware
}

const lit = findObjectLiteral(html, 'const JPG_DATA =');
const data = JSON.parse(lit.text);

const preserve = {};
for (const mes of Object.keys(data.fiscalPorMes.porMes).sort()) {
  preserve[mes] = {};
  for (const u of PRESERVE) {
    const f = data.fiscalPorMes.porMes[mes].filiais[u];
    if (!f) continue;
    preserve[mes][u] = { e: f.kpis.entradas, s: f.kpis.saidas };
  }
}

for (const mes of Object.keys(data.fiscalPorMes.porMes).sort()) {
  const pack = data.fiscalPorMes.porMes[mes];
  pack.ordem = ORDEM.slice();
  for (const k of ORDEM) {
    if (!pack.filiais[k] && k !== 'LANNIC') {
      // leave missing non-lannic as-is only if somehow absent
    }
  }
  if (byMes[mes]) {
    pack.filiais.LANNIC = buildLannicPack(mes, byMes[mes].faturamento, byMes[mes].das);
  } else {
    pack.filiais.LANNIC = emptyFilial(mes);
  }
  pack.empresa = buildEmpresa(mes, pack.filiais);
}

data.meta.gerado_em = new Date().toLocaleString('pt-BR');
data.meta.fonte = (data.meta.fonte || '') + ' + LANNIC Simples (mai–jul/2026)';
if (data.meta.cnpjUnidades && typeof data.meta.cnpjUnidades === 'object') {
  data.meta.cnpjUnidades.LANNIC = META.cnpj;
}

html = html.slice(0, lit.start) + JSON.stringify(data, null, 2) + html.slice(lit.end);

// Enhance initImpostos + initMemoria for DAS (Simples)
html = html.replace(
  `const fonte = hasAp
    ? (ap.fonte || 'Planilha IMPOSTOS ICMS E IPI GRUPO JPG')
    : 'Estimativa a partir dos KPIs de movimento (NF-e)';
  fillPanelShell('panel-impostos',
    '<div class="alert-box" style="border-color:rgba(59,130,246,0.35);color:var(--accent);background:rgba(59,130,246,0.07);margin-bottom:16px">' +
    '<i class="fas fa-info-circle" style="margin-right:8px;"></i>' +
    '<strong>Fonte:</strong> ' + fonte + '. Não substitui EFD / 5005 oficial.' +
    '</div>' +
    '<div class="kpi-grid kpi-grid-4" id="kpiImpostos"></div>' +
    (tabela.length
      ? '<div class="table-card" style="margin-top:16px"><div class="table-head"><div><div class="ttl">Impostos a recolher</div><div class="sub">ICMS · IPI</div></div></div>' +
        '<div class="tbl-scroll"><table><thead><tr><th>Tributo</th><th class="r">Apurado</th><th class="r">A recolher</th><th class="r">% s/ vendas</th></tr></thead><tbody id="tblImpostos"></tbody></table></div></div>'
      : '')
  );
  const el = document.getElementById('kpiImpostos');
  if (el) {
    el.innerHTML =
      kpiCard('green', 'fas fa-arrow-down', 'Crédito ICMS', brl(k.icms_credito || 0), 'ICMS Crédito', 'Entradas') +
      kpiCard('red', 'fas fa-arrow-up', 'Débito ICMS', brl(k.icms_debito || 0), 'ICMS Débito', 'Saídas') +
      kpiCard('yellow', 'fas fa-file-invoice-dollar', 'ICMS a recolher', brl(icmsRec), 'Saldo ICMS', 'Débito − Crédito') +
      kpiCard('purple', 'fas fa-receipt', 'IPI a recolher', brl(ipiRec), 'IPI líquido', 'Débito ' + brl(k.ipi_sai || 0) + ' − Crédito ' + brl(k.ipi_ent || 0));
  }`,
  `const dasRow = (tabela || []).find((t) => /DAS|Simples/i.test(String(t.tributo || '')));
  const isDasPack = !!(D.meta && D.meta.regime === 'Simples Nacional') || !!dasRow;
  const fonte = isDasPack
    ? ((ap && ap.fonte) || 'Simples Nacional — DAS')
    : (hasAp ? (ap.fonte || 'Planilha IMPOSTOS ICMS E IPI GRUPO JPG') : 'Estimativa a partir dos KPIs de movimento (NF-e)');
  fillPanelShell('panel-impostos',
    '<div class="alert-box" style="border-color:rgba(59,130,246,0.35);color:var(--accent);background:rgba(59,130,246,0.07);margin-bottom:16px">' +
    '<i class="fas fa-info-circle" style="margin-right:8px;"></i>' +
    '<strong>Fonte:</strong> ' + fonte + '. Não substitui EFD / 5005 oficial.' +
    '</div>' +
    '<div class="kpi-grid kpi-grid-4" id="kpiImpostos"></div>' +
    (tabela.length
      ? '<div class="table-card" style="margin-top:16px"><div class="table-head"><div><div class="ttl">Impostos a recolher</div><div class="sub">' + (isDasPack ? 'DAS · Simples Nacional' : 'ICMS · IPI') + '</div></div></div>' +
        '<div class="tbl-scroll"><table><thead><tr><th>Tributo</th><th class="r">Apurado</th><th class="r">A recolher</th><th class="r">% s/ vendas</th></tr></thead><tbody id="tblImpostos"></tbody></table></div></div>'
      : '')
  );
  const el = document.getElementById('kpiImpostos');
  if (el) {
    if (isDasPack) {
      const das = dasRow ? (dasRow.recolher || 0) : (D.deducoes || 0);
      el.innerHTML =
        kpiCard('green', 'fas fa-chart-line', 'Faturamento', brl(k.saidas || 0), 'Receita Simples', 'Competência') +
        kpiCard('yellow', 'fas fa-file-invoice-dollar', 'DAS a recolher', brl(das), 'Simples Nacional', dasRow && dasRow.pctRb != null ? dasRow.pctRb + '% s/ fat.' : '—') +
        kpiCard('purple', 'fas fa-percent', 'Alíquota efetiva', (dasRow && dasRow.pctRb != null ? dasRow.pctRb + '%' : '—'), '% DAS / faturamento', 'Planilha LANNIC') +
        kpiCard('blue', 'fas fa-coins', 'Após DAS', brl((k.saidas || 0) - das), 'Fat. − DAS', 'Proxy');
    } else {
      el.innerHTML =
        kpiCard('green', 'fas fa-arrow-down', 'Crédito ICMS', brl(k.icms_credito || 0), 'ICMS Crédito', 'Entradas') +
        kpiCard('red', 'fas fa-arrow-up', 'Débito ICMS', brl(k.icms_debito || 0), 'ICMS Débito', 'Saídas') +
        kpiCard('yellow', 'fas fa-file-invoice-dollar', 'ICMS a recolher', brl(icmsRec), 'Saldo ICMS', 'Débito − Crédito') +
        kpiCard('purple', 'fas fa-receipt', 'IPI a recolher', brl(ipiRec), 'IPI líquido', 'Débito ' + brl(k.ipi_sai || 0) + ' − Crédito ' + brl(k.ipi_ent || 0));
    }
  }`
);

html = html.replace(
  `const taxKeys = ['icms', 'icmsSt', 'pis', 'cofins', 'ipi'];
  const totalDeb = taxKeys.reduce((a, key) => a + (ap[key] && ap[key].debitoSaidas || 0), 0);
  const totalCred = taxKeys.reduce((a, key) => a + (ap[key] && ((ap[key].creditoEntradas || 0) + (ap[key].outrosCreditos || 0)) || 0), 0);
  const totalLiq = taxKeys.reduce((a, key) => a + (ap[key] && ap[key].aRecolher || 0), 0);
  const fonte = ap.fonte || 'Planilha IMPOSTOS ICMS E IPI GRUPO JPG';`,
  `const taxKeys = ['icms', 'icmsSt', 'pis', 'cofins', 'ipi'].concat(ap.das ? ['das'] : []);
  const totalDeb = taxKeys.reduce((a, key) => a + (ap[key] && ap[key].debitoSaidas || 0), 0);
  const totalCred = taxKeys.reduce((a, key) => a + (ap[key] && ((ap[key].creditoEntradas || 0) + (ap[key].outrosCreditos || 0)) || 0), 0);
  const totalLiq = taxKeys.reduce((a, key) => a + (ap[key] && ap[key].aRecolher || 0), 0);
  const fonte = ap.fonte || 'Planilha IMPOSTOS ICMS E IPI GRUPO JPG';`
);

html = html.replace(
  `const labels = { icms: 'ICMS', icmsSt: 'ICMS ST', pis: 'PIS', cofins: 'COFINS', ipi: 'IPI' };`,
  `const labels = { icms: 'ICMS', icmsSt: 'ICMS ST', pis: 'PIS', cofins: 'COFINS', ipi: 'IPI', das: 'DAS (Simples)' };`
);

html = html.replace(
  `kpiCard('purple', 'fas fa-receipt', 'ICMS a recolher', brl(ap.icms.aRecolher || 0), 'ICMS', 'IPI ' + brl(ap.ipi.aRecolher || 0));`,
  `kpiCard('purple', 'fas fa-receipt', ap.das ? 'DAS a recolher' : 'ICMS a recolher', brl(ap.das ? (ap.das.aRecolher || 0) : (ap.icms.aRecolher || 0)), ap.das ? 'Simples Nacional' : 'ICMS', ap.das ? ('Fat. ' + brl(k.saidas || 0)) : ('IPI ' + brl(ap.ipi.aRecolher || 0)));`
);

fs.writeFileSync(EJS, html);

// Post-validate
const check = JSON.parse(findObjectLiteral(fs.readFileSync(EJS, 'utf8'), 'const JPG_DATA =').text);
let ok = true;
for (const mes of Object.keys(preserve).sort()) {
  for (const u of PRESERVE) {
    const exp = preserve[mes][u];
    if (!exp) continue;
    const k = check.fiscalPorMes.porMes[mes].filiais[u].kpis;
    if (!near(k.entradas, exp.e) || !near(k.saidas, exp.s)) {
      console.error('PRESERVE FAIL', mes, u, k.entradas, k.saidas, exp);
      ok = false;
    }
  }
}

for (const r of src.rows) {
  const f = check.fiscalPorMes.porMes[r.mes].filiais.LANNIC;
  if (!near(f.kpis.saidas, r.faturamento) || !near(f.deducoes, r.das)) {
    console.error('LANNIC FAIL', r.mes, f.kpis.saidas, f.deducoes, r);
    ok = false;
  } else if (!f.apuracao || !f.apuracao.das || !near(f.apuracao.das.aRecolher, r.das)) {
    console.error('LANNIC APURACAO FAIL', r.mes, f.apuracao);
    ok = false;
  } else {
    console.log('LANNIC OK', r.mes, 'fat=' + f.kpis.saidas, 'das=' + f.deducoes);
  }
}

const julEmp = check.fiscalPorMes.porMes['2026-07'].empresa.kpis.saidas;
const julSum = ORDEM.reduce((a, u) => a + (check.fiscalPorMes.porMes['2026-07'].filiais[u].kpis.saidas || 0), 0);
if (!near(julEmp, round2(julSum))) {
  console.error('EMPRESA JUL FAIL', julEmp, julSum);
  ok = false;
} else console.log('EMPRESA JUL OK', julEmp);

const html2 = fs.readFileSync(EJS, 'utf8');
if (!html2.includes('value="LANNIC"')) {
  console.error('SELECT option missing');
  ok = false;
} else console.log('SELECT LANNIC OK');

console.log(ok ? 'PATCH LANNIC OK' : 'PATCH LANNIC FAIL');
if (!ok) process.exit(1);
