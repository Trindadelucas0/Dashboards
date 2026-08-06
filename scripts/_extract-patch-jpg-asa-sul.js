'use strict';
/**
 * Extract Filial DF (ASA SUL / MATRIZ CNPJ 0003-27) Jan–Jul and patch jpg.ejs.
 * Preserves MG/PR/SP/SEDE; recalculates consolidado EMPRESA per month.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'relatorios', 'jpg-asa-sul', 'raw');
const OUT = path.join(ROOT, 'relatorios', 'jpg-asa-sul');
const EJS = path.join(ROOT, 'src', 'views', 'jpg.ejs');
const TOL = 0.02;
const CNPJ_DIGITS = '21051983000327';
const ORDEM = ['MG', 'PR', 'SP', 'MATRIZ', 'SEDE'];
const MESES = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'];

const MATRIZ = {
  codigo: '712',
  cnpj: '21.051.983/0003-27',
  label: 'Filial DF',
  uf: 'DF',
  ie: '07.695.672/002-15',
};

const CFOP_META = {
  '2-152': { descricao: 'Transferência recebida da matriz', finalidade: 'Transferência Matriz', credito_icms: true },
  '1-102': { descricao: 'Compra para comercialização', finalidade: 'Revenda', credito_icms: true },
  '2-102': { descricao: 'Compra para comercialização', finalidade: 'Revenda', credito_icms: true },
  '1-403': { descricao: 'Compra ST', finalidade: 'Revenda', credito_icms: true },
  '2-403': { descricao: 'Compra ST', finalidade: 'Revenda', credito_icms: true },
  '2-407': { descricao: 'Compra ST', finalidade: 'Revenda', credito_icms: true },
  '1-556': { descricao: 'Compra de material de uso/consumo', finalidade: 'Uso e consumo', credito_icms: false },
  '2-556': { descricao: 'Compra de material de uso/consumo', finalidade: 'Uso e consumo', credito_icms: false },
  '1-933': { descricao: 'Prestação de serviço', finalidade: 'Serviços', credito_icms: false },
  '2-933': { descricao: 'Prestação de serviço', finalidade: 'Serviços', credito_icms: false },
  '5-102': { descricao: 'Venda', finalidade: 'Venda', credito_icms: false },
  '5-405': { descricao: 'Venda com ST', finalidade: 'Venda com ST', credito_icms: false },
  '6-102': { descricao: 'Venda interestadual', finalidade: 'Venda', credito_icms: false },
  '5-910': { descricao: 'Bonificação / doação', finalidade: 'Bonificação / doação', credito_icms: false },
  '6-108': { descricao: 'Venda a não contribuinte', finalidade: 'Venda', credito_icms: false },
  '6-910': { descricao: 'Remessa', finalidade: 'Remessa p/ Filial', credito_icms: false },
  '5-152': { descricao: 'Transferência', finalidade: 'Remessa p/ Filial', credito_icms: false },
  '6-152': { descricao: 'Transferência interestadual', finalidade: 'Remessa p/ Filial', credito_icms: false },
  '6-914': { descricao: 'Remessa inter-filiais', finalidade: 'Remessa p/ Filial', credito_icms: false },
  '2-155': { descricao: 'Transferência de bem', finalidade: 'Transferência Matriz', credito_icms: true },
};

const EXPECT = {
  '2026-06': { e: 1703640.89, s: 3649924.21 },
  '2026-07': { e: 145769.55, s: 3180335.83 },
};

function onlyDigits(s) { return String(s || '').replace(/\D/g, ''); }
function formatCnpj(digits) {
  const d = onlyDigits(digits);
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d || '—';
}
function cleanNome(nome) {
  let n = String(nome || '').trim();
  n = n.replace(/^\d{1,3}(?:\.\d{3}){1,2}\s+/, '');
  n = n.replace(/^\d{11,14}\s+/, '');
  return n.trim() || String(nome || '').trim();
}
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

function loadRaw(key) {
  const p = path.join(RAW, key + '.json');
  if (!fs.existsSync(p)) throw new Error('raw missing: ' + key);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function validateFile(raw) {
  const fails = [];
  const sum = round2((raw.lines || []).reduce((a, l) => a + (Number(l.valor) || 0), 0));
  const tg = round2(raw.totalGeral || 0);
  if (!near(sum, tg)) fails.push(`delta ${round2(sum - tg)}`);
  if (onlyDigits(raw.cnpj) !== CNPJ_DIGITS) fails.push(`cnpj ${raw.cnpj}`);
  if (!/712|JPG/i.test(raw.company || '')) fails.push(`empresa ${raw.company}`);
  return { sum, tg, fails, ok: fails.length === 0 };
}

function monthOf(data) {
  const m = String(data || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}`;
}

function splitByMonth(lines) {
  const buckets = {};
  const noDate = [];
  for (const l of lines) {
    const mes = monthOf(l.data);
    if (!mes || !mes.startsWith('2026-')) { noDate.push(l); continue; }
    if (!buckets[mes]) buckets[mes] = [];
    buckets[mes].push(l);
  }
  return { buckets, noDate };
}

function aggregate(lines, partyLabel) {
  const byCfop = new Map();
  const byParty = new Map();
  const byUf = {};
  const byDay = new Map();
  const nfs = new Set();
  for (const l of lines) {
    const valor = Number(l.valor) || 0;
    const icms = Number(l.icms) || 0;
    const ipi = Number(l.ipi) || 0;
    const base = Number(l.base) || 0;
    const cfop = l.cfop;
    const nome = cleanNome(l.nome);
    const cnpj = formatCnpj(l.doc);
    const uf = (l.uf || '—').trim() || '—';
    const nfKey = `${l.nota}|${l.serie}`;
    nfs.add(nfKey);
    const partyKey = `${onlyDigits(l.doc) || nome}|${uf}`;
    if (!byCfop.has(cfop)) byCfop.set(cfop, { total: 0, icms: 0, base: 0, ipi: 0, nfs: new Set(), parties: new Map() });
    const c = byCfop.get(cfop);
    c.total += valor; c.icms += icms; c.base += base; c.ipi += ipi; c.nfs.add(nfKey);
    if (!c.parties.has(partyKey)) c.parties.set(partyKey, { nome, cnpj, uf, total: 0, qtdNf: new Set(), icms: 0, base: 0, ipi: 0 });
    const p = c.parties.get(partyKey);
    p.total += valor; p.icms += icms; p.base += base; p.ipi += ipi; p.qtdNf.add(nfKey);
    if (!byParty.has(partyKey)) byParty.set(partyKey, { nome, cnpj, uf, total: 0, qtdNf: new Set() });
    const gp = byParty.get(partyKey);
    gp.total += valor; gp.qtdNf.add(nfKey);
    byUf[uf] = round2((byUf[uf] || 0) + valor);
    const day = String(l.data || '').trim();
    if (day) {
      if (!byDay.has(day)) byDay.set(day, { entradas: 0, saidas: 0 });
      byDay.get(day)[partyLabel === 'fornecedor' ? 'entradas' : 'saidas'] += valor;
    }
  }
  const total = round2(lines.reduce((a, l) => a + (Number(l.valor) || 0), 0));
  const cfops = [...byCfop.entries()].map(([cfop, c]) => {
    const meta = CFOP_META[cfop] || { descricao: cfop, finalidade: 'Outras', credito_icms: false };
    const parties = [...c.parties.values()].map((p) => ({
      nome: p.nome, total: round2(p.total), qtd: p.qtdNf.size, uf: p.uf, cnpj: p.cnpj,
      icms: round2(p.icms), base: round2(p.base), ipi: round2(p.ipi),
    })).sort((a, b) => b.total - a.total);
    return {
      cfop, descricao: meta.descricao, finalidade: meta.finalidade,
      qtd: c.nfs.size, total: round2(c.total), icms: round2(c.icms), base: round2(c.base), ipi: round2(c.ipi),
      credito_icms: !!meta.credito_icms, pct: total ? round2((c.total / total) * 100) : 0, parties,
    };
  }).sort((a, b) => b.total - a.total);
  const ranking = [...byParty.values()].map((p) => ({
    nome: p.nome, total: round2(p.total), qtd: p.qtdNf.size, uf: p.uf, cnpj: p.cnpj,
    pct: total ? round2((p.total / total) * 100) : 0,
  })).sort((a, b) => b.total - a.total);
  return {
    total, cfops, ranking, byUf, byDay, nfs: nfs.size,
    sumIcms: round2(lines.reduce((a, l) => a + (Number(l.icms) || 0), 0)),
    sumIpi: round2(lines.reduce((a, l) => a + (Number(l.ipi) || 0), 0)),
    sumBase: round2(lines.reduce((a, l) => a + (Number(l.base) || 0), 0)),
  };
}

function mergeDays(entDays, saiDays) {
  const keys = new Set([...entDays.keys(), ...saiDays.keys()]);
  const sorted = [...keys].sort((a, b) => a.split('/').reverse().join('').localeCompare(b.split('/').reverse().join('')));
  return {
    labels: sorted,
    entradas: sorted.map((d) => round2((entDays.get(d) || {}).entradas || 0)),
    saidas: sorted.map((d) => round2((saiDays.get(d) || {}).saidas || 0)),
  };
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

function buildFilial(mesKey, entLines, saiLines, entMeta) {
  const E = aggregate(entLines || [], 'fornecedor');
  const S = aggregate(saiLines || [], 'cliente');
  const icmsCred = (entMeta && entMeta.totalIcms) || E.sumIcms;
  const icmsDeb = S.sumIcms;
  const ipiEnt = (entMeta && entMeta.totalIpi) || E.sumIpi;
  const ipiSai = S.sumIpi;
  return {
    meta: {
      codigo: MATRIZ.codigo,
      nome: 'JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS',
      cnpj: MATRIZ.cnpj,
      ie: MATRIZ.ie,
      periodo: periodLabel(mesKey),
      uf: MATRIZ.uf,
      filial_key: 'MATRIZ',
      filial_label: MATRIZ.label,
      alerta: '',
    },
    fornecedor_keys: E.ranking.map((p) => p.cnpj),
    cliente_keys: S.ranking.map((p) => p.cnpj),
    kpis: {
      entradas: E.total, saidas: S.total,
      icms_credito: icmsCred, icms_debito: icmsDeb,
      base_icms_ent: E.sumBase, base_icms_sai: S.sumBase,
      ipi_ent: ipiEnt, ipi_sai: ipiSai,
      saldo_icms: round2(icmsDeb - icmsCred),
      n_nf_ent: E.nfs, n_nf_sai: S.nfs,
      n_fornecedores: E.ranking.length, n_clientes: S.ranking.length,
    },
    cfop_entradas: E.cfops,
    cfop_saidas: S.cfops,
    finalidade: buildFinalidade(E.cfops),
    ranking_fornecedores: E.ranking,
    ranking_clientes: S.ranking,
    notas_entradas: [],
    notas_saidas: [],
    ufs_entradas: E.byUf,
    ufs_saidas: S.byUf,
    serie_diaria: mergeDays(E.byDay, S.byDay),
    dre: {
      receita: S.total, receita_externa: S.total, cmv: E.total,
      lucro_bruto: round2(S.total - E.total),
      margem_bruta_pct: S.total ? round2(((S.total - E.total) / S.total) * 100) : null,
      icms_debito: icmsDeb, icms_credito: icmsCred,
      saldo_icms: round2(icmsDeb - icmsCred),
      resultado: round2(S.total - E.total + icmsCred - icmsDeb),
      margem_resultado_pct: S.total ? round2(((S.total - E.total + icmsCred - icmsDeb) / S.total) * 100) : null,
    },
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
        if (p.uf) pp.uf = p.uf;
        if (p.nome) pp.nome = p.nome;
        if (p.cnpj) pp.cnpj = p.cnpj;
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

// --- load + validate ---
fs.mkdirSync(OUT, { recursive: true });
const FILE_PLAN = [
  { key: 'matriz-janmai-entradas', tipo: 'entradas', modo: 'acumulado' },
  { key: 'matriz-janmai-saidas', tipo: 'saidas', modo: 'acumulado' },
  { key: 'matriz-jun-entradas', tipo: 'entradas', modo: 'mensal', mes: '2026-06' },
  { key: 'matriz-jun-saidas', tipo: 'saidas', modo: 'mensal', mes: '2026-06' },
  { key: 'matriz-jul-entradas', tipo: 'entradas', modo: 'mensal', mes: '2026-07' },
  { key: 'matriz-jul-saidas', tipo: 'saidas', modo: 'mensal', mes: '2026-07' },
];

const store = {}; // mes -> { entradas:{lines,rawMeta}, saidas:{...} }
function ensure(mes, tipo) {
  if (!store[mes]) store[mes] = { entradas: { lines: [] }, saidas: { lines: [] } };
  return store[mes][tipo];
}

const validations = [];
const splitReports = [];
let gateOk = true;

for (const job of FILE_PLAN) {
  const raw = loadRaw(job.key);
  const v = validateFile(raw);
  validations.push({ key: job.key, ...v, period: raw.period, cnpj: raw.cnpj, lines: raw.lineCount });
  console.log(v.ok ? 'OK' : 'FAIL', job.key, 'sum=' + v.sum, 'tg=' + v.tg, v.fails.join('; '));
  if (!v.ok) gateOk = false;

  if (job.modo === 'mensal') {
    const bucket = ensure(job.mes, job.tipo);
    bucket.lines = raw.lines.slice();
    bucket.rawMeta = { totalIcms: raw.totalIcms, totalIpi: raw.totalIpi, totalGeral: raw.totalGeral };
  } else {
    const { buckets, noDate } = splitByMonth(raw.lines);
    let splitSum = 0;
    const months = {};
    for (const [mes, lines] of Object.entries(buckets)) {
      const tot = round2(lines.reduce((a, l) => a + (Number(l.valor) || 0), 0));
      months[mes] = { n: lines.length, total: tot };
      splitSum = round2(splitSum + tot);
      const bucket = ensure(mes, job.tipo);
      if (!bucket.lines.length) {
        bucket.lines = lines;
        bucket.rawMeta = { totalIcms: 0, totalIpi: 0, totalGeral: tot };
      }
    }
    const okSplit = near(splitSum, v.tg) && noDate.length === 0;
    splitReports.push({ key: job.key, fileTotal: v.tg, splitSum, delta: round2(splitSum - v.tg), noDate: noDate.length, months, ok: okSplit });
    console.log(okSplit ? 'SPLIT OK' : 'SPLIT FAIL', job.key, 'delta=' + round2(splitSum - v.tg), JSON.stringify(months));
    if (!okSplit) gateOk = false;
  }
}

fs.writeFileSync(path.join(OUT, 'validacao-extract.json'), JSON.stringify({ validations, splitReports }, null, 2));
if (!gateOk) {
  console.error('GATE FAIL — não patchar EJS');
  process.exit(2);
}

const packs = {};
const resumo = [];
for (const mes of MESES) {
  const sides = store[mes] || { entradas: { lines: [] }, saidas: { lines: [] } };
  const pack = buildFilial(mes, sides.entradas.lines, sides.saidas.lines, sides.entradas.rawMeta);
  packs[mes] = pack;
  resumo.push({ mes, entradas: pack.kpis.entradas, saidas: pack.kpis.saidas, n_nf_ent: pack.kpis.n_nf_ent, n_nf_sai: pack.kpis.n_nf_sai });
  const exp = EXPECT[mes];
  if (exp) {
    if (!near(pack.kpis.entradas, exp.e) || !near(pack.kpis.saidas, exp.s)) {
      console.error('EXPECT FAIL', mes, pack.kpis.entradas, pack.kpis.saidas, exp);
      process.exit(2);
    }
    console.log('EXPECT OK', mes, pack.kpis.entradas, pack.kpis.saidas);
  } else {
    console.log('PACK', mes, 'E=' + pack.kpis.entradas, 'S=' + pack.kpis.saidas);
  }
}

// Jan–Mai sum must match acumulado totals
const sumJanMaiE = round2(MESES.slice(0, 5).reduce((a, m) => a + packs[m].kpis.entradas, 0));
const sumJanMaiS = round2(MESES.slice(0, 5).reduce((a, m) => a + packs[m].kpis.saidas, 0));
const janmaiE = validations.find((x) => x.key === 'matriz-janmai-entradas');
const janmaiS = validations.find((x) => x.key === 'matriz-janmai-saidas');
if (!near(sumJanMaiE, janmaiE.tg) || !near(sumJanMaiS, janmaiS.tg)) {
  console.error('JAN-MAI SUM FAIL', sumJanMaiE, janmaiE.tg, sumJanMaiS, janmaiS.tg);
  process.exit(2);
}
console.log('JAN-MAI SUM OK', sumJanMaiE, sumJanMaiS);

fs.writeFileSync(path.join(OUT, 'packs-matriz.json'), JSON.stringify(packs, null, 2));
fs.writeFileSync(path.join(OUT, 'resumo-totais.json'), JSON.stringify(resumo, null, 2));

// --- patch EJS ---
let html = fs.readFileSync(EJS, 'utf8');
const lit = findObjectLiteral(html, 'const JPG_DATA =');
const data = JSON.parse(lit.text);

const preserveSnap = {};
for (const mes of MESES) {
  const month = data.fiscalPorMes.porMes[mes];
  if (!month) throw new Error('month missing: ' + mes);
  preserveSnap[mes] = {};
  for (const u of ['MG', 'PR', 'SP', 'SEDE']) {
    preserveSnap[mes][u] = {
      e: month.filiais[u].kpis.entradas,
      s: month.filiais[u].kpis.saidas,
    };
  }
  month.filiais.MATRIZ = packs[mes];
  month.ordem = ORDEM.slice();
  month.empresa = buildEmpresa(month.filiais, mes);
  if (month.meta) {
    month.meta.alerta = '';
  }
}

data.meta.fonte = 'Relatórios ICMS (.xls) — Filial DF (ASA SUL) Jan–Jun + Jul IMPOSTOS; MG/PR/SP/SEDE preservados';
data.meta.gerado_em = new Date().toLocaleString('pt-BR');

html = html.slice(0, lit.start) + JSON.stringify(data, null, 2) + html.slice(lit.end);
fs.writeFileSync(EJS, html);

// --- post-check ---
const check = JSON.parse(findObjectLiteral(fs.readFileSync(EJS, 'utf8'), 'const JPG_DATA =').text);
let ok = true;
for (const mes of MESES) {
  const month = check.fiscalPorMes.porMes[mes];
  const m = month.filiais.MATRIZ.kpis;
  if (!near(m.entradas, packs[mes].kpis.entradas) || !near(m.saidas, packs[mes].kpis.saidas)) {
    console.error('POST FAIL MATRIZ', mes, m.entradas, m.saidas);
    ok = false;
  } else {
    console.log('POST OK MATRIZ', mes, 'E=' + m.entradas, 'S=' + m.saidas);
  }
  for (const u of ['MG', 'PR', 'SP', 'SEDE']) {
    const k = month.filiais[u].kpis;
    const exp = preserveSnap[mes][u];
    if (!near(k.entradas, exp.e) || !near(k.saidas, exp.s)) {
      console.error('POST FAIL preserve', mes, u, k.entradas, k.saidas, exp);
      ok = false;
    }
  }
  const expectE = round2(
    preserveSnap[mes].MG.e + preserveSnap[mes].PR.e + preserveSnap[mes].SP.e +
    packs[mes].kpis.entradas + preserveSnap[mes].SEDE.e
  );
  const expectS = round2(
    preserveSnap[mes].MG.s + preserveSnap[mes].PR.s + preserveSnap[mes].SP.s +
    packs[mes].kpis.saidas + preserveSnap[mes].SEDE.s
  );
  if (!near(month.empresa.kpis.entradas, expectE) || !near(month.empresa.kpis.saidas, expectS)) {
    console.error('POST FAIL consol', mes, month.empresa.kpis.entradas, month.empresa.kpis.saidas, expectE, expectS);
    ok = false;
  }
}

console.log(ok ? 'PATCH MATRIZ ASA SUL OK' : 'PATCH FAILED');
if (!ok) process.exit(2);
