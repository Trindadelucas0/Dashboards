'use strict';
/**
 * Patch jpg.ejs with Jan–Jun packs (MG/PR/SP/MATRIZ/SEDE) and preserve Jul PR.
 * SEDE = CNPJ 21.051.983/0001-65 (código 711).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EJS = path.join(ROOT, 'src', 'views', 'jpg.ejs');
const PACKS = JSON.parse(fs.readFileSync(path.join(ROOT, 'relatorios', 'jpg-movimento', 'packs-por-mes.json'), 'utf8'));
const TOL = 0.02;
const ORDEM = ['MG', 'PR', 'SP', 'MATRIZ', 'SEDE'];

const META_U = {
  MG: { codigo: '90', cnpj: '21.051.983/0005-99', label: 'Filial MG', uf: 'MG' },
  PR: { codigo: '81', cnpj: '21.051.983/0006-70', label: 'Filial PR', uf: 'PR' },
  SP: { codigo: '82', cnpj: '21.051.983/0007-50', label: 'Filial SP', uf: 'SP' },
  MATRIZ: { codigo: '712', cnpj: '21.051.983/0003-27', label: 'Matriz DF', uf: 'DF' },
  SEDE: { codigo: '711', cnpj: '21.051.983/0001-65', label: 'Matriz Sede', uf: 'DF' },
};

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

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

function emptyFilial(key, mesKey, alerta) {
  const u = META_U[key];
  return {
    meta: {
      codigo: u.codigo,
      nome: 'JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS',
      cnpj: u.cnpj,
      ie: '—',
      periodo: periodLabel(mesKey),
      uf: u.uf,
      filial_key: key,
      filial_label: u.label,
      alerta: alerta || `Sem planilha de movimento em ${mesKey} para ${u.label}.`,
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

function normalizeUnitPack(key, mesKey, pack) {
  if (!pack) return emptyFilial(key, mesKey);
  const u = META_U[key];
  const out = JSON.parse(JSON.stringify(pack));
  out.meta = {
    ...out.meta,
    codigo: u.codigo,
    cnpj: u.cnpj,
    uf: u.uf,
    filial_key: key,
    filial_label: u.label,
    periodo: periodLabel(mesKey),
    alerta: out.meta.alerta || '',
  };
  return out;
}

function sumKpis(list) {
  const keys = ['entradas','saidas','icms_credito','icms_debito','base_icms_ent','base_icms_sai','ipi_ent','ipi_sai','saldo_icms','n_nf_ent','n_nf_sai','n_fornecedores','n_clientes'];
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
          qtd: 0, total: 0, icms: 0, base: 0, ipi: 0, credito_icms: !!c.credito_icms, parties: [],
        });
      }
      const t = map.get(c.cfop);
      t.qtd += c.qtd || 0;
      t.total = round2(t.total + (c.total || 0));
      t.icms = round2(t.icms + (c.icms || 0));
      t.base = round2(t.base + (c.base || 0));
      t.ipi = round2(t.ipi + (c.ipi || 0));
    }
  }
  const total = [...map.values()].reduce((a, c) => a + c.total, 0) || 1;
  return [...map.values()].map((c) => ({ ...c, pct: round2((c.total / total) * 100) })).sort((a, b) => b.total - a.total);
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

function buildEmpresa(mesKey, filiais) {
  const list = ORDEM.map((k) => filiais[k]);
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
  return {
    meta: {
      codigo: 'TODAS',
      nome: 'JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS',
      cnpj: '5 unidades',
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
    dre: {
      receita: kpis.saidas,
      receita_externa: kpis.saidas,
      cmv: kpis.entradas,
      lucro_bruto: round2(kpis.saidas - kpis.entradas),
      margem_bruta_pct: kpis.saidas ? round2(((kpis.saidas - kpis.entradas) / kpis.saidas) * 100) : null,
      icms_debito: kpis.icms_debito,
      icms_credito: kpis.icms_credito,
      saldo_icms: kpis.saldo_icms,
      resultado: round2(kpis.saidas - kpis.entradas + kpis.icms_credito - kpis.icms_debito),
      margem_resultado_pct: kpis.saidas ? round2(((kpis.saidas - kpis.entradas + kpis.icms_credito - kpis.icms_debito) / kpis.saidas) * 100) : null,
    },
  };
}

function monthLabel(mesKey) {
  const nomes = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const [y, m] = mesKey.split('-');
  return `${nomes[+m]}/${y}`;
}

function buildMonthPack(mesKey, monthPacks) {
  const filiais = {};
  for (const key of ORDEM) {
    // packs use RAIZ key for SEDE
    const srcKey = key === 'SEDE' ? 'RAIZ' : key;
    filiais[key] = normalizeUnitPack(key, mesKey, monthPacks && monthPacks[srcKey]);
  }
  return {
    competencia: mesKey,
    competenciaLabel: monthLabel(mesKey),
    periodo: periodLabel(mesKey),
    ordem: ORDEM.slice(),
    empresa: buildEmpresa(mesKey, filiais),
    filiais,
  };
}

let html = fs.readFileSync(EJS, 'utf8');
const lit = findObjectLiteral(html, 'const JPG_DATA =');
const data = JSON.parse(lit.text);

const existingJul = data.fiscalPorMes.porMes['2026-07'];
if (!existingJul) throw new Error('Jul/2026 missing — abort');

// Build months 01-06 from extracts
const newPorMes = {};
for (const mes of ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']) {
  newPorMes[mes] = buildMonthPack(mes, PACKS[mes] || {});
}

// Jul: keep existing PR etc., add SEDE empty, update ordem + empresa consolidado with SEDE stub
const jul = JSON.parse(JSON.stringify(existingJul));
jul.ordem = ORDEM.slice();
if (!jul.filiais.SEDE) {
  jul.filiais.SEDE = emptyFilial('SEDE', '2026-07', 'Jul/2026: planilha Matriz Sede (0001-65) não recebida nestas pastas.');
}
// Ensure keys in ordem exist
for (const k of ORDEM) {
  if (!jul.filiais[k]) jul.filiais[k] = emptyFilial(k, '2026-07');
}
jul.empresa = buildEmpresa('2026-07', jul.filiais);
jul.empresa.meta.alerta = 'Jul/2026: consolidado com Filial PR preenchida; demais unidades conforme planilhas disponíveis.';
jul.empresa.meta.cnpj = '5 unidades';
newPorMes['2026-07'] = jul;

const meses = Object.keys(newPorMes).sort();
data.fiscalPorMes.meses = meses;
data.fiscalPorMes.mesLabels = meses.map(monthLabel);
data.fiscalPorMes.monthShort = meses.map((m) => monthLabel(m).split('/')[0]);
data.fiscalPorMes.porMes = newPorMes;

data.meta.periodoRange = `${monthLabel(meses[0]).split('/')[0]}–${monthLabel(meses[meses.length - 1])}`;
data.meta.competenciaDefault = meses[meses.length - 1];
data.meta.gerado_em = new Date().toLocaleString('pt-BR');
data.meta.fonte = 'Relatórios ICMS (.xls) — Jan–Jun/2026 (MG/PR/SP/Matriz DF/Matriz Sede) + Jul PR';
data.meta.unidades = 5;
data.meta.nCompetencias = meses.length;
if (data.ordem) data.ordem = ORDEM.slice();

// Replace JPG_DATA
html = html.slice(0, lit.start) + JSON.stringify(data, null, 2) + html.slice(lit.end);

// Add SEDE option in select if missing
if (!html.includes('value="SEDE"')) {
  html = html.replace(
    /<option value="MATRIZ">Matriz DF<\/option>/,
    '<option value="MATRIZ">Matriz DF</option>\r\n\r\n          <option value="SEDE">Matriz Sede</option>'
  );
}

// Update JS default ordem arrays
html = html.replace(
  /ordem: J\.ordem \|\| \['MG', 'PR', 'SP', 'MATRIZ'\]/g,
  "ordem: J.ordem || ['MG', 'PR', 'SP', 'MATRIZ', 'SEDE']"
);
html = html.replace(
  /return pack\.ordem \|\| \['MG', 'PR', 'SP', 'MATRIZ'\];/g,
  "return pack.ordem || ['MG', 'PR', 'SP', 'MATRIZ', 'SEDE'];"
);

fs.writeFileSync(EJS, html);

// Sanity checks
const check = JSON.parse(findObjectLiteral(fs.readFileSync(EJS, 'utf8'), 'const JPG_DATA =').text);
const jun = check.fiscalPorMes.porMes['2026-06'];
const exp = {
  MG: { e: 97994.17, s: 496831.66 },
  PR: { e: 14539.1, s: 99404.74 },
  SP: { e: 112749.13, s: 810686.49 },
  MATRIZ: { e: 1703640.89, s: 3649924.21 },
  SEDE: { e: 255264.64, s: 0 },
};
let ok = true;
for (const [k, v] of Object.entries(exp)) {
  const got = jun.filiais[k].kpis;
  if (Math.abs(got.entradas - v.e) > TOL || Math.abs(got.saidas - v.s) > TOL) {
    console.error('JUN mismatch', k, got.entradas, got.saidas, v);
    ok = false;
  }
}
const julPr = check.fiscalPorMes.porMes['2026-07'].filiais.PR.kpis;
if (Math.abs(julPr.entradas - 8729.12) > TOL || Math.abs(julPr.saidas - 71589.79) > TOL) {
  console.error('JUL PR regression', julPr);
  ok = false;
}
console.log('meses', check.fiscalPorMes.meses.join(', '));
console.log('Jun consolidado E/S', jun.empresa.kpis.entradas, jun.empresa.kpis.saidas);
console.log('SEDE option', fs.readFileSync(EJS, 'utf8').includes('value="SEDE"'));
console.log(ok ? 'PATCH OK' : 'PATCH FAILED');
if (!ok) process.exit(1);
