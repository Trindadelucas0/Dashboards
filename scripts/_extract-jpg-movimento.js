'use strict';
/**
 * Extract + split + validate JPG movimento packs (no EJS patch).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'relatorios', 'jpg-movimento', 'raw');
const OUT = path.join(ROOT, 'relatorios', 'jpg-movimento');
const TOL = 0.02;

const UNITS = {
  MG: { cnpj: '21051983000599', codigo: '90', label: 'Filial MG', uf: 'MG' },
  PR: { cnpj: '21051983000670', codigo: '81', label: 'Filial PR', uf: 'PR' },
  SP: { cnpj: '21051983000750', codigo: '82', label: 'Filial SP', uf: 'SP' },
  MATRIZ: { cnpj: '21051983000327', codigo: '712', label: 'Filial DF', uf: 'DF' },
  RAIZ: { cnpj: '21051983000165', codigo: '711', label: 'Matriz CNPJ raiz', uf: 'DF' },
};

const CFOP_META = {
  '2-152': { descricao: 'Transferência recebida da matriz', finalidade: 'Transferência Matriz', credito_icms: true },
  '1-102': { descricao: 'Compra para comercialização', finalidade: 'Revenda', credito_icms: true },
  '2-102': { descricao: 'Compra para comercialização', finalidade: 'Revenda', credito_icms: true },
  '1-403': { descricao: 'Compra ST', finalidade: 'Revenda', credito_icms: true },
  '2-403': { descricao: 'Compra ST', finalidade: 'Revenda', credito_icms: true },
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

function onlyDigits(s) { return String(s || '').replace(/\D/g, ''); }
function formatCnpj(digits) {
  const d = onlyDigits(digits);
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d || '—';
}
function cleanNome(nome) {
  let n = String(nome || '').trim();
  n = n.replace(/^\d{1,3}(?:\.\d{3}){1,2}\s+/, '');
  n = n.replace(/^\d{11,14}\s+/, '');
  return n.trim() || String(nome || '').trim();
}
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function parseBRDate(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  const yyyy = m[3];
  return { iso: `${yyyy}-${mm}`, day: `${dd}/${mm}/${yyyy}`, yyyy: +yyyy, mm: +mm };
}

function monthFromLine(l) {
  return parseBRDate(l.data);
}

function loadRaw(key) {
  const p = path.join(RAW, key + '.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function validateFile(raw) {
  const sum = round2((raw.lines || []).reduce((a, l) => a + (Number(l.valor) || 0), 0));
  const tg = round2(raw.totalGeral || 0);
  const delta = round2(sum - tg);
  return { sum, tg, delta, ok: Math.abs(delta) <= TOL || (tg === 0 && sum === 0) };
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

    if (!byCfop.has(cfop)) {
      byCfop.set(cfop, { total: 0, icms: 0, base: 0, ipi: 0, nfs: new Set(), parties: new Map() });
    }
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

function periodLabel(mesKey) {
  const [y, m] = mesKey.split('-');
  const last = new Date(+y, +m, 0).getDate();
  return `01/${m}/${y} até ${String(last).padStart(2, '0')}/${m}/${y}`;
}

function buildFilialPack(unitKey, mesKey, entLines, saiLines, entMeta, saiMeta) {
  const u = UNITS[unitKey];
  const E = aggregate(entLines, 'fornecedor');
  const S = aggregate(saiLines, 'cliente');
  const icmsCred = (entMeta && entMeta.totalIcms) || E.sumIcms;
  const icmsDeb = S.sumIcms;
  const ipiEnt = (entMeta && entMeta.totalIpi) || E.sumIpi;
  const ipiSai = S.sumIpi;
  return {
    meta: {
      codigo: u.codigo,
      nome: 'JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS',
      cnpj: formatCnpj(u.cnpj),
      ie: '—',
      periodo: periodLabel(mesKey),
      uf: u.uf,
      filial_key: unitKey === 'RAIZ' ? 'RAIZ' : unitKey,
      filial_label: u.label,
      alerta: (!entLines.length && !saiLines.length) ? `Sem movimento em ${mesKey}` : '',
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

function splitByMonth(lines) {
  const buckets = {};
  const noDate = [];
  for (const l of lines) {
    const d = monthFromLine(l);
    if (!d || d.yyyy !== 2026 || d.mm < 1 || d.mm > 12) { noDate.push(l); continue; }
    const key = d.iso;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(l);
  }
  return { buckets, noDate };
}

const FILE_PLAN = [
  { key: 'mg-jun-entradas', unit: 'MG', tipo: 'entradas', modo: 'mensal', mes: '2026-06' },
  { key: 'mg-jun-saidas', unit: 'MG', tipo: 'saidas', modo: 'mensal', mes: '2026-06' },
  { key: 'mg-janmai-entradas', unit: 'MG', tipo: 'entradas', modo: 'acumulado' },
  { key: 'mg-janmai-saidas', unit: 'MG', tipo: 'saidas', modo: 'acumulado' },

  { key: 'sp-jun-entradas', unit: 'SP', tipo: 'entradas', modo: 'mensal', mes: '2026-06' },
  { key: 'sp-jun-saidas', unit: 'SP', tipo: 'saidas', modo: 'mensal', mes: '2026-06' },
  { key: 'sp-janmai-saidas', unit: 'SP', tipo: 'saidas', modo: 'acumulado' },

  { key: 'matriz-jun-entradas', unit: 'MATRIZ', tipo: 'entradas', modo: 'mensal', mes: '2026-06' },
  { key: 'matriz-jun-saidas', unit: 'MATRIZ', tipo: 'saidas', modo: 'mensal', mes: '2026-06' },
  { key: 'matriz-janmai-entradas', unit: 'MATRIZ', tipo: 'entradas', modo: 'acumulado' },
  { key: 'matriz-janmai-saidas', unit: 'MATRIZ', tipo: 'saidas', modo: 'acumulado' },

  { key: 'pr-jun-entradas', unit: 'PR', tipo: 'entradas', modo: 'mensal', mes: '2026-06' },
  { key: 'pr-jun-saidas', unit: 'PR', tipo: 'saidas', modo: 'mensal', mes: '2026-06' },
  { key: 'pr-janmai-entradas', unit: 'PR', tipo: 'entradas', modo: 'acumulado' },
  { key: 'pr-mai-saidas', unit: 'PR', tipo: 'saidas', modo: 'mensal', mes: '2026-05' },

  { key: 'raiz-jun-entradas', unit: 'RAIZ', tipo: 'entradas', modo: 'mensal', mes: '2026-06' },
  { key: 'raiz-janmai-entradas', unit: 'RAIZ', tipo: 'entradas', modo: 'acumulado' },
  { key: 'raiz-janmai-saidas', unit: 'RAIZ', tipo: 'saidas', modo: 'acumulado' },
];

// linesBy[unit][mes][tipo] = { lines, rawMeta }
const store = {};
const validations = [];
const splitReports = [];

function ensure(unit, mes, tipo) {
  if (!store[unit]) store[unit] = {};
  if (!store[unit][mes]) store[unit][mes] = { entradas: { lines: [] }, saidas: { lines: [] } };
  return store[unit][mes][tipo];
}

for (const job of FILE_PLAN) {
  const raw = loadRaw(job.key);
  if (!raw) {
    validations.push({ key: job.key, ok: false, error: 'raw missing' });
    continue;
  }
  const v = validateFile(raw);
  validations.push({
    key: job.key, unit: job.unit, tipo: job.tipo, modo: job.modo,
    file: raw.file, period: raw.period, cnpj: raw.cnpj,
    lineCount: raw.lineCount, ...v,
  });

  if (job.modo === 'mensal') {
    const bucket = ensure(job.unit, job.mes, job.tipo);
    bucket.lines = raw.lines.slice();
    bucket.rawMeta = { totalIcms: raw.totalIcms, totalIpi: raw.totalIpi, totalGeral: raw.totalGeral, period: raw.period, key: job.key };
  } else {
    const { buckets, noDate } = splitByMonth(raw.lines);
    const monthSums = {};
    let splitSum = 0;
    for (const [mes, lines] of Object.entries(buckets)) {
      const tot = round2(lines.reduce((a, l) => a + (Number(l.valor) || 0), 0));
      monthSums[mes] = { lines: lines.length, total: tot };
      splitSum = round2(splitSum + tot);
      const bucket = ensure(job.unit, mes, job.tipo);
      // prefer not to overwrite if already filled by a more specific monthly file with same lines - append only if empty
      if (!bucket.lines.length) {
        bucket.lines = lines;
        bucket.rawMeta = { totalIcms: 0, totalIpi: 0, totalGeral: tot, period: periodLabel(mes), key: job.key, splitFrom: job.key };
      } else {
        // merge unique by nf
        const existing = new Set(bucket.lines.map((l) => `${l.nota}|${l.serie}|${l.cfop}|${l.valor}`));
        for (const l of lines) {
          const k = `${l.nota}|${l.serie}|${l.cfop}|${l.valor}`;
          if (!existing.has(k)) bucket.lines.push(l);
        }
      }
    }
    splitReports.push({
      key: job.key, unit: job.unit, tipo: job.tipo,
      fileTotal: v.tg, splitSum, deltaSplit: round2(splitSum - v.tg),
      noDate: noDate.length, months: monthSums,
      ok: Math.abs(splitSum - v.tg) <= TOL,
    });
  }
}

// Build packs
const packs = {}; // packs[mes][unit]
const summary = [];

for (const [unit, byMes] of Object.entries(store)) {
  for (const [mes, sides] of Object.entries(byMes)) {
    const pack = buildFilialPack(unit, mes, sides.entradas.lines, sides.saidas.lines, sides.entradas.rawMeta, sides.saidas.rawMeta);
    if (!packs[mes]) packs[mes] = {};
    packs[mes][unit] = pack;
    summary.push({
      mes, unit,
      entradas: pack.kpis.entradas,
      saidas: pack.kpis.saidas,
      n_nf_ent: pack.kpis.n_nf_ent,
      n_nf_sai: pack.kpis.n_nf_sai,
      saldo_icms: pack.kpis.saldo_icms,
    });
  }
}

summary.sort((a, b) => a.mes.localeCompare(b.mes) || a.unit.localeCompare(b.unit));

fs.writeFileSync(path.join(OUT, 'validacao-arquivos.json'), JSON.stringify({ validations, splitReports }, null, 2));
fs.writeFileSync(path.join(OUT, 'packs-por-mes.json'), JSON.stringify(packs, null, 2));
fs.writeFileSync(path.join(OUT, 'resumo-totais.json'), JSON.stringify(summary, null, 2));

const failFiles = validations.filter((x) => x.ok === false);
const failSplits = splitReports.filter((x) => !x.ok);
console.log('Arquivos:', validations.length, 'falhas Δ:', failFiles.length);
for (const f of failFiles) console.log('  FAIL', f.key, f.error || ('delta=' + f.delta));
console.log('Splits:', splitReports.length, 'falhas:', failSplits.length);
for (const f of failSplits) console.log('  SPLIT FAIL', f.key, 'delta=' + f.deltaSplit, f.months);
console.log('\nResumo (mes/unit):');
for (const r of summary) {
  console.log(`  ${r.mes} ${r.unit.padEnd(6)} E=${r.entradas.toFixed(2)} S=${r.saidas.toFixed(2)} NFe=${r.n_nf_ent} NFs=${r.n_nf_sai}`);
}
console.log('\nWrote', OUT);
if (failFiles.length || failSplits.length) process.exitCode = 2;
