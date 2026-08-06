'use strict';
/**
 * Rebuild JPG empresa consolidado merging CFOP parties (fix Detalhes vazio).
 * Preserva filiais; só regenera pack.empresa por mês.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EJS = path.join(ROOT, 'src', 'views', 'jpg.ejs');
const TOL = 0.02;
const ORDEM = ['MG', 'PR', 'SP', 'MATRIZ', 'ASA_SUL', 'SEDE', 'LANNIC'];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function near(a, b) {
  return Math.abs(Number(a) - Number(b)) <= TOL;
}

function findObjectLiteral(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) throw new Error('marker not found: ' + marker);
  const start = html.indexOf('{', i);
  let depth = 0;
  let inStr = false;
  let quote = '';
  let esc = false;
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      quote = ch;
      continue;
    }
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

function sumKpis(list) {
  const keys = [
    'entradas',
    'saidas',
    'icms_credito',
    'icms_debito',
    'base_icms_ent',
    'base_icms_sai',
    'ipi_ent',
    'ipi_sai',
    'saldo_icms',
    'n_nf_ent',
    'n_nf_sai',
    'n_fornecedores',
    'n_clientes',
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
          cfop: c.cfop,
          descricao: c.descricao,
          finalidade: c.finalidade,
          qtd: 0,
          total: 0,
          icms: 0,
          base: 0,
          ipi: 0,
          credito_icms: !!c.credito_icms,
          _parties: new Map(),
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
            nome: p.nome || '—',
            cnpj: p.cnpj || '—',
            uf: p.uf || '—',
            total: 0,
            qtd: 0,
            icms: 0,
            base: 0,
            ipi: 0,
          });
        }
        const pp = t._parties.get(pk);
        pp.total = round2(pp.total + (p.total || 0));
        pp.qtd += p.qtd || 0;
        pp.icms = round2(pp.icms + (p.icms || 0));
        pp.base = round2(pp.base + (p.base || 0));
        pp.ipi = round2(pp.ipi + (p.ipi || 0));
        if (p.uf) pp.uf = p.uf;
        if (p.nome) pp.nome = p.nome;
        if (p.cnpj) pp.cnpj = p.cnpj;
      }
    }
  }
  const total = [...map.values()].reduce((a, c) => a + c.total, 0) || 1;
  return [...map.values()]
    .map((c) => {
      const parties = [...c._parties.values()].sort((a, b) => b.total - a.total);
      const { _parties, ...rest } = c;
      return { ...rest, parties, pct: round2((c.total / total) * 100) };
    })
    .sort((a, b) => b.total - a.total);
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
  return [...map.values()]
    .map((p) => ({ ...p, pct: round2((p.total / total) * 100) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
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
  return Object.values(map)
    .map((x) => ({ ...x, total: round2(x.total), pct: round2((x.total / tot) * 100) }))
    .sort((a, b) => b.total - a.total);
}

function buildEmpresa(mesKey, filiais, prevMeta) {
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
      alerta: (prevMeta && prevMeta.alerta) || '',
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
      margem_resultado_pct: kpis.saidas
        ? round2(((kpis.saidas - kpis.entradas + kpis.icms_credito - kpis.icms_debito) / kpis.saidas) * 100)
        : null,
    },
  };
}

let html = fs.readFileSync(EJS, 'utf8');
const lit = findObjectLiteral(html, 'const JPG_DATA =');
const data = JSON.parse(lit.text);
const porMes = data.fiscalPorMes.porMes;
let ok = true;

for (const mes of Object.keys(porMes).sort()) {
  const pack = porMes[mes];
  const beforeE = pack.empresa.kpis.entradas;
  const beforeS = pack.empresa.kpis.saidas;
  pack.empresa = buildEmpresa(mes, pack.filiais, pack.empresa.meta);
  if (!near(pack.empresa.kpis.entradas, beforeE) || !near(pack.empresa.kpis.saidas, beforeS)) {
    console.error('KPI drift', mes, pack.empresa.kpis.entradas, pack.empresa.kpis.saidas, beforeE, beforeS);
    ok = false;
  }
  const c2152 = (pack.empresa.cfop_entradas || []).find((c) => c.cfop === '2-152');
  if (c2152) {
    const partySum = round2((c2152.parties || []).reduce((a, p) => a + (p.total || 0), 0));
    if (!near(partySum, c2152.total)) {
      console.error('parties≠cfop', mes, partySum, c2152.total);
      ok = false;
    }
    console.log(mes, '2-152 parties=', (c2152.parties || []).length, 'total=', c2152.total, 'partySum=', partySum);
  } else {
    console.log(mes, 'sem CFOP 2-152');
  }
}

data.meta.gerado_em = new Date().toLocaleString('pt-BR');
html = html.slice(0, lit.start) + JSON.stringify(data, null, 2) + html.slice(lit.end);
fs.writeFileSync(EJS, html);
console.log(ok ? 'REBUILD EMPRESA PARTIES OK' : 'REBUILD FAILED');
if (!ok) process.exit(1);
