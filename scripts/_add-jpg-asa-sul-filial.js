'use strict';
/**
 * Move movimento Filial DF (MATRIZ) → nova unidade ASA_SUL (Asa Sul DF).
 * Zera MATRIZ, atualiza ordem/UI e recalcula consolidado.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EJS = path.join(ROOT, 'src', 'views', 'jpg.ejs');
const PACKS_PATH = path.join(ROOT, 'relatorios', 'jpg-movimento', 'packs-por-mes.json');
const ASA_PACKS = path.join(ROOT, 'relatorios', 'jpg-asa-sul', 'packs-matriz.json');
const TOL = 0.02;
const ORDEM = ['MG', 'PR', 'SP', 'MATRIZ', 'ASA_SUL', 'SEDE'];

const META_U = {
  MG: { codigo: '90', cnpj: '21.051.983/0005-99', label: 'Filial MG', uf: 'MG' },
  PR: { codigo: '81', cnpj: '21.051.983/0006-70', label: 'Filial PR', uf: 'PR' },
  SP: { codigo: '82', cnpj: '21.051.983/0007-50', label: 'Filial SP', uf: 'SP' },
  MATRIZ: { codigo: '712', cnpj: '21.051.983/0003-27', label: 'Filial DF', uf: 'DF' },
  ASA_SUL: { codigo: '712', cnpj: '21.051.983/0003-27', label: 'Filial Asa Sul DF', uf: 'DF', ie: '07.695.672/002-15' },
  SEDE: { codigo: '711', cnpj: '21.051.983/0001-65', label: 'Matriz Sede', uf: 'DF' },
};

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function near(a, b) { return Math.abs(Number(a) - Number(b)) <= TOL; }

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

function emptyFilial(key, mesKey) {
  const u = META_U[key];
  return {
    meta: {
      codigo: u.codigo,
      nome: 'JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS',
      cnpj: u.cnpj,
      ie: u.ie || '—',
      periodo: periodLabel(mesKey),
      uf: u.uf,
      filial_key: key,
      filial_label: u.label,
      alerta: key === 'MATRIZ' ? 'Sem movimento nesta unidade (dados da Asa Sul estão em Filial Asa Sul DF).' : '',
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
      receita: 0, receita_externa: 0, cmv: 0, lucro_bruto: 0, margem_bruta_pct: null,
      icms_debito: 0, icms_credito: 0, saldo_icms: 0, resultado: 0, margem_resultado_pct: null,
    },
  };
}

function asAsaSul(pack, mesKey) {
  const out = JSON.parse(JSON.stringify(pack));
  const u = META_U.ASA_SUL;
  out.meta = {
    ...out.meta,
    codigo: u.codigo,
    cnpj: u.cnpj,
    ie: u.ie,
    periodo: periodLabel(mesKey),
    uf: u.uf,
    filial_key: 'ASA_SUL',
    filial_label: u.label,
    alerta: '',
  };
  return out;
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
    dre: {
      receita: kpis.saidas, receita_externa: kpis.saidas, cmv: kpis.entradas,
      lucro_bruto: round2(kpis.saidas - kpis.entradas),
      margem_bruta_pct: kpis.saidas ? round2(((kpis.saidas - kpis.entradas) / kpis.saidas) * 100) : null,
      icms_debito: kpis.icms_debito, icms_credito: kpis.icms_credito, saldo_icms: kpis.saldo_icms,
      resultado: round2(kpis.saidas - kpis.entradas + kpis.icms_credito - kpis.icms_debito),
      margem_resultado_pct: kpis.saidas ? round2(((kpis.saidas - kpis.entradas + kpis.icms_credito - kpis.icms_debito) / kpis.saidas) * 100) : null,
    },
  };
}

const asaSource = JSON.parse(fs.readFileSync(ASA_PACKS, 'utf8'));
let html = fs.readFileSync(EJS, 'utf8');

// UI select
if (!html.includes('value="ASA_SUL"')) {
  html = html.replace(
    /<option value="MATRIZ">Filial DF<\/option>/,
    '<option value="MATRIZ">Filial DF</option>\r\n\r\n          <option value="ASA_SUL">Filial Asa Sul DF</option>'
  );
}

// JS fallbacks
html = html.replace(
  /ordem: J\.ordem \|\| \['MG', 'PR', 'SP', 'MATRIZ', 'SEDE'\]/g,
  "ordem: J.ordem || ['MG', 'PR', 'SP', 'MATRIZ', 'ASA_SUL', 'SEDE']"
);
html = html.replace(
  /return pack\.ordem \|\| \['MG', 'PR', 'SP', 'MATRIZ', 'SEDE'\];/g,
  "return pack.ordem || ['MG', 'PR', 'SP', 'MATRIZ', 'ASA_SUL', 'SEDE'];"
);

const lit = findObjectLiteral(html, 'const JPG_DATA =');
const data = JSON.parse(lit.text);
const meses = Object.keys(data.fiscalPorMes.porMes).sort();
const preserve = {};

for (const mes of meses) {
  const month = data.fiscalPorMes.porMes[mes];
  preserve[mes] = {};
  for (const u of ['MG', 'PR', 'SP', 'SEDE']) {
    preserve[mes][u] = {
      e: month.filiais[u].kpis.entradas,
      s: month.filiais[u].kpis.saidas,
    };
  }

  const src = asaSource[mes] || month.filiais.MATRIZ;
  if (!src) throw new Error('missing ASA SUL pack for ' + mes);

  month.filiais.ASA_SUL = asAsaSul(src, mes);
  month.filiais.MATRIZ = emptyFilial('MATRIZ', mes);
  month.ordem = ORDEM.slice();
  month.empresa = buildEmpresa(month.filiais, mes);
}

data.meta.fonte = 'Relatórios ICMS (.xls) — Filial Asa Sul DF Jan–Jul; MG/PR/SP/SEDE preservados; Filial DF zerada';
data.meta.gerado_em = new Date().toLocaleString('pt-BR');

html = html.slice(0, lit.start) + JSON.stringify(data, null, 2) + html.slice(lit.end);
fs.writeFileSync(EJS, html);

// Update intermediate packs
if (fs.existsSync(PACKS_PATH)) {
  const packs = JSON.parse(fs.readFileSync(PACKS_PATH, 'utf8'));
  for (const mes of Object.keys(asaSource)) {
    if (!packs[mes]) packs[mes] = {};
    packs[mes].ASA_SUL = asAsaSul(asaSource[mes], mes);
    packs[mes].MATRIZ = emptyFilial('MATRIZ', mes);
  }
  fs.writeFileSync(PACKS_PATH, JSON.stringify(packs, null, 2));
}

// Post-check
const check = JSON.parse(findObjectLiteral(fs.readFileSync(EJS, 'utf8'), 'const JPG_DATA =').text);
let ok = true;
if (!fs.readFileSync(EJS, 'utf8').includes('value="ASA_SUL"')) {
  console.error('UI option ASA_SUL missing');
  ok = false;
}

for (const mes of meses) {
  const month = check.fiscalPorMes.porMes[mes];
  const a = month.filiais.ASA_SUL.kpis;
  const exp = asaSource[mes].kpis;
  if (!near(a.entradas, exp.entradas) || !near(a.saidas, exp.saidas)) {
    console.error('FAIL ASA_SUL', mes, a, exp);
    ok = false;
  } else {
    console.log('OK ASA_SUL', mes, 'E=' + a.entradas, 'S=' + a.saidas);
  }
  if (!near(month.filiais.MATRIZ.kpis.entradas, 0) || !near(month.filiais.MATRIZ.kpis.saidas, 0)) {
    console.error('FAIL MATRIZ not empty', mes);
    ok = false;
  }
  for (const u of ['MG', 'PR', 'SP', 'SEDE']) {
    const k = month.filiais[u].kpis;
    const p = preserve[mes][u];
    if (!near(k.entradas, p.e) || !near(k.saidas, p.s)) {
      console.error('FAIL preserve', mes, u, k, p);
      ok = false;
    }
  }
  if (!month.ordem.includes('ASA_SUL')) {
    console.error('FAIL ordem', mes, month.ordem);
    ok = false;
  }
  const expectE = round2(
    preserve[mes].MG.e + preserve[mes].PR.e + preserve[mes].SP.e +
    exp.entradas + preserve[mes].SEDE.e
  );
  const expectS = round2(
    preserve[mes].MG.s + preserve[mes].PR.s + preserve[mes].SP.s +
    exp.saidas + preserve[mes].SEDE.s
  );
  if (!near(month.empresa.kpis.entradas, expectE) || !near(month.empresa.kpis.saidas, expectS)) {
    console.error('FAIL consol', mes, month.empresa.kpis.entradas, month.empresa.kpis.saidas, expectE, expectS);
    ok = false;
  }
}

console.log(ok ? 'ASA_SUL FILIAL OK' : 'ASA_SUL FILIAL FAILED');
if (!ok) process.exit(2);
