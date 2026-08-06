'use strict';
/**
 * Zera Filial DF + SEDE em todos os meses do JPG_DATA (jpg.ejs),
 * recalcula consolidado empresa e limpa packs intermediários das matrizes.
 * Preserva MG/PR/SP.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const EJS = path.join(ROOT, 'src', 'views', 'jpg.ejs');
const PACKS_PATH = path.join(ROOT, 'relatorios', 'jpg-movimento', 'packs-por-mes.json');
const TOL = 0.02;
const ORDEM = ['MG', 'PR', 'SP', 'MATRIZ', 'SEDE'];
const CLEAR_KEYS = ['MATRIZ', 'SEDE'];
const PRESERVE_KEYS = ['MG', 'PR', 'SP'];
const ALERTA = 'Aguardando novas planilhas reorganizadas.';

const META_U = {
  MG: { codigo: '90', cnpj: '21.051.983/0005-99', label: 'Filial MG', uf: 'MG' },
  PR: { codigo: '81', cnpj: '21.051.983/0006-70', label: 'Filial PR', uf: 'PR' },
  SP: { codigo: '82', cnpj: '21.051.983/0007-50', label: 'Filial SP', uf: 'SP' },
  MATRIZ: { codigo: '712', cnpj: '21.051.983/0003-27', label: 'Filial DF', uf: 'DF' },
  SEDE: { codigo: '711', cnpj: '21.051.983/0001-65', label: 'Matriz Sede', uf: 'DF' },
};

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
      alerta: alerta || ALERTA,
    },
    fornecedor_keys: [],
    cliente_keys: [],
    kpis: {
      entradas: 0,
      saidas: 0,
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
    dre: {
      receita: 0,
      receita_externa: 0,
      cmv: 0,
      lucro_bruto: 0,
      margem_bruta_pct: null,
      icms_debito: 0,
      icms_credito: 0,
      saldo_icms: 0,
      resultado: 0,
      margem_resultado_pct: null,
    },
  };
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
          parties: [],
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
  return [...map.values()]
    .map((c) => ({ ...c, pct: round2((c.total / total) * 100) }))
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
      alerta: 'Filial DF e Matriz Sede zeradas — aguardando planilhas reorganizadas.',
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

function snapshotPreserve(porMes) {
  const out = {};
  for (const [mes, pack] of Object.entries(porMes)) {
    out[mes] = {};
    for (const k of PRESERVE_KEYS) {
      const f = pack.filiais[k];
      if (!f) throw new Error(`missing preserve unit ${mes}/${k}`);
      out[mes][k] = {
        e: f.kpis.entradas,
        s: f.kpis.saidas,
        nfE: f.kpis.n_nf_ent,
        nfS: f.kpis.n_nf_sai,
      };
    }
  }
  return out;
}

function syntaxCheck(html) {
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let i = 0;
  while ((m = re.exec(html))) {
    const t = m[1];
    if (!t || !t.trim()) continue;
    i++;
    new vm.Script(t, { filename: 'jpg.ejs#' + i });
  }
  return i;
}

function clearPacksJson() {
  if (!fs.existsSync(PACKS_PATH)) {
    console.log('packs-por-mes.json ausente — skip');
    return;
  }
  const packs = JSON.parse(fs.readFileSync(PACKS_PATH, 'utf8'));
  let changed = 0;
  for (const mes of Object.keys(packs)) {
    const month = packs[mes];
    if (!month || typeof month !== 'object') continue;
    // packs históricos: SEDE vem como RAIZ (ver _patch-jpg-movimento-ejs.js)
    if (month.MATRIZ) {
      month.MATRIZ = emptyFilial('MATRIZ', mes, ALERTA);
      changed++;
    }
    if (month.RAIZ) {
      month.RAIZ = emptyFilial('SEDE', mes, ALERTA);
      changed++;
    }
    if (month.SEDE) {
      month.SEDE = emptyFilial('SEDE', mes, ALERTA);
      changed++;
    }
    if (month.filiais) {
      for (const k of CLEAR_KEYS) {
        if (month.filiais[k]) {
          month.filiais[k] = emptyFilial(k, mes, ALERTA);
          changed++;
        }
      }
    }
  }
  fs.writeFileSync(PACKS_PATH, JSON.stringify(packs, null, 2));
  console.log('packs-por-mes.json atualizado, stubs=', changed);
}

// --- main ---
let html = fs.readFileSync(EJS, 'utf8');
const lit = findObjectLiteral(html, 'const JPG_DATA =');
const data = JSON.parse(lit.text);
const porMes = data.fiscalPorMes.porMes;
if (!porMes) throw new Error('fiscalPorMes.porMes missing');

const before = snapshotPreserve(porMes);
const meses = Object.keys(porMes).sort();

for (const mes of meses) {
  const pack = porMes[mes];
  pack.ordem = ORDEM.slice();
  for (const k of CLEAR_KEYS) {
    pack.filiais[k] = emptyFilial(k, mes, ALERTA);
  }
  for (const k of ORDEM) {
    if (!pack.filiais[k]) pack.filiais[k] = emptyFilial(k, mes, ALERTA);
  }
  pack.empresa = buildEmpresa(mes, pack.filiais);
}

data.meta.fonte = 'Relatórios ICMS (.xls) — MG/PR/SP; Filial DF e Matriz Sede aguardando planilhas reorganizadas';
data.meta.gerado_em = new Date().toLocaleString('pt-BR');
if (data.ordem) data.ordem = ORDEM.slice();

html = html.slice(0, lit.start) + JSON.stringify(data, null, 2) + html.slice(lit.end);
fs.writeFileSync(EJS, html);

clearPacksJson();

const checkHtml = fs.readFileSync(EJS, 'utf8');
const check = JSON.parse(findObjectLiteral(checkHtml, 'const JPG_DATA =').text);
let ok = true;

for (const mes of meses) {
  const pack = check.fiscalPorMes.porMes[mes];
  for (const k of CLEAR_KEYS) {
    const kp = pack.filiais[k].kpis;
    if (!near(kp.entradas, 0) || !near(kp.saidas, 0)) {
      console.error('FAIL clear', mes, k, kp.entradas, kp.saidas);
      ok = false;
    }
  }
  for (const k of PRESERVE_KEYS) {
    const exp = before[mes][k];
    const got = pack.filiais[k].kpis;
    if (!near(got.entradas, exp.e) || !near(got.saidas, exp.s) || got.n_nf_ent !== exp.nfE || got.n_nf_sai !== exp.nfS) {
      console.error('FAIL preserve', mes, k, {
        got: { e: got.entradas, s: got.saidas, nfE: got.n_nf_ent, nfS: got.n_nf_sai },
        exp,
      });
      ok = false;
    }
  }
  const expectE = round2(PRESERVE_KEYS.reduce((a, k) => a + pack.filiais[k].kpis.entradas, 0));
  const expectS = round2(PRESERVE_KEYS.reduce((a, k) => a + pack.filiais[k].kpis.saidas, 0));
  if (!near(pack.empresa.kpis.entradas, expectE) || !near(pack.empresa.kpis.saidas, expectS)) {
    console.error('FAIL consol', mes, pack.empresa.kpis.entradas, pack.empresa.kpis.saidas, expectE, expectS);
    ok = false;
  }
  console.log(
    mes,
    'MATRIZ',
    pack.filiais.MATRIZ.kpis.entradas,
    pack.filiais.MATRIZ.kpis.saidas,
    'SEDE',
    pack.filiais.SEDE.kpis.entradas,
    pack.filiais.SEDE.kpis.saidas,
    'EMP',
    pack.empresa.kpis.entradas,
    pack.empresa.kpis.saidas
  );
}

const nScripts = syntaxCheck(checkHtml);
console.log('syntax scripts=', nScripts);
console.log(ok ? 'CLEAR MATRIZ+SEDE OK' : 'CLEAR FAILED');
if (!ok) process.exit(1);
