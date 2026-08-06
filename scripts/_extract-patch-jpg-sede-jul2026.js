'use strict';
/**
 * Validate + patch JPG Jul/2026 SEDE entradas (saídas = 0).
 * Preserve MG/PR/SP/MATRIZ.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'relatorios', '2026-07', 'raw');
const EJS = path.join(ROOT, 'src', 'views', 'jpg.ejs');
const OUT = path.join(ROOT, 'relatorios', '2026-07');
const TOL = 0.02;
const MES = '2026-07';
const ORDEM = ['MG', 'PR', 'SP', 'MATRIZ', 'SEDE'];
const SEDE = {
  codigo: '711',
  cnpj: '21.051.983/0001-65',
  cnpjDigits: '21051983000165',
  label: 'Matriz Sede',
  uf: 'DF',
  ie: '07.695.672/001-34',
};
const EXPECT_ENT = 221992.04;

const CFOP_META = {
  '1-102': { descricao: 'Compra para comercialização', finalidade: 'Revenda', credito_icms: true },
  '2-102': { descricao: 'Compra para comercialização', finalidade: 'Revenda', credito_icms: true },
  '1-403': { descricao: 'Compra ST', finalidade: 'Revenda', credito_icms: true },
  '2-403': { descricao: 'Compra ST', finalidade: 'Revenda', credito_icms: true },
  '2-407': { descricao: 'Compra ST', finalidade: 'Revenda', credito_icms: true },
  '1-556': { descricao: 'Compra de material de uso/consumo', finalidade: 'Uso e consumo', credito_icms: false },
  '2-556': { descricao: 'Compra de material de uso/consumo', finalidade: 'Uso e consumo', credito_icms: false },
  '1-933': { descricao: 'Prestação de serviço', finalidade: 'Serviços', credito_icms: false },
  '2-933': { descricao: 'Prestação de serviço', finalidade: 'Serviços', credito_icms: false },
  '2-152': { descricao: 'Transferência recebida da matriz', finalidade: 'Transferência Matriz', credito_icms: true },
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

function validateRaw(raw) {
  const fails = [];
  const sum = round2((raw.lines || []).reduce((a, l) => a + (Number(l.valor) || 0), 0));
  const tg = round2(raw.totalGeral || 0);
  if (!near(sum, tg)) fails.push(`delta ${round2(sum - tg)}`);
  if (!near(tg, EXPECT_ENT)) fails.push(`tg esperado ${EXPECT_ENT} got ${tg}`);
  if (onlyDigits(raw.cnpj) !== SEDE.cnpjDigits) fails.push(`cnpj ${raw.cnpj}`);
  if (!/01\/07\/2026/.test(raw.period || '') || !/31\/07\/2026/.test(raw.period || '')) fails.push(`period ${raw.period}`);
  if (!/JPG|MATRIZ/i.test(raw.company || '')) fails.push('empresa');
  for (const l of raw.lines || []) {
    const m = String(l.data || '').match(/\/(\d{2})\/(\d{4})$/);
    if (m && !(m[1] === '07' && m[2] === '2026')) fails.push(`linha fora jul ${l.data}`);
  }
  return { sum, tg, fails, ok: fails.length === 0 };
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

function buildFilial(ent, saiLines) {
  const E = aggregate(ent.lines || [], 'fornecedor');
  const S = aggregate(saiLines || [], 'cliente');
  const icmsCred = ent.totalIcms || E.sumIcms;
  const icmsDeb = S.sumIcms;
  const ipiEnt = ent.totalIpi || E.sumIpi;
  const ipiSai = S.sumIpi;
  return {
    meta: {
      codigo: SEDE.codigo,
      nome: 'JPG PRODUTOS FUNCIONAIS MATRIZ',
      cnpj: SEDE.cnpj,
      ie: SEDE.ie,
      periodo: '01/07/2026 até 31/07/2026',
      uf: SEDE.uf,
      filial_key: 'SEDE',
      filial_label: SEDE.label,
      alerta: 'Jul/2026: apenas entradas (saídas não fornecidas nestas planilhas).',
    },
    fornecedor_keys: E.ranking.map((p) => p.cnpj),
    cliente_keys: [],
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

function buildEmpresa(filiais) {
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
      periodo: '01/07/2026 até 31/07/2026',
      uf: 'BR',
      filial_key: 'EMPRESA',
      filial_label: 'Empresa (consolidado)',
      alerta: 'Jul/2026: MG/PR/SP + SEDE entradas; MATRIZ DF e saídas SEDE pendentes.',
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

// --- main ---
const rawPath = path.join(RAW, 'jpg-sede-entradas.json');
if (!fs.existsSync(rawPath)) {
  console.error('Missing raw', rawPath);
  process.exit(2);
}
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const v = validateRaw(raw);
const log = [{ key: 'jpg-sede-entradas', unit: 'SEDE', tipo: 'entradas', ...v, period: raw.period, cnpj: raw.cnpj, lines: raw.lineCount, ie: raw.ie }];
fs.writeFileSync(path.join(OUT, 'validacao-sede-jul.json'), JSON.stringify(log, null, 2));
console.log(v.ok ? 'OK' : 'FAIL', 'jpg-sede-entradas', 'sum=' + v.sum, 'tg=' + v.tg, v.fails.join('; '));
if (!v.ok) {
  console.error('GATE FAIL — não patchar');
  process.exit(2);
}

const sede = buildFilial(raw, []);
fs.writeFileSync(path.join(OUT, 'jpg-sede-jul.json'), JSON.stringify(sede, null, 2));

let html = fs.readFileSync(EJS, 'utf8');
const lit = findObjectLiteral(html, 'const JPG_DATA =');
const data = JSON.parse(lit.text);
const jul = data.fiscalPorMes.porMes[MES];
if (!jul) throw new Error('Jul missing');

const preserve = {
  MG: { e: jul.filiais.MG.kpis.entradas, s: jul.filiais.MG.kpis.saidas },
  PR: { e: jul.filiais.PR.kpis.entradas, s: jul.filiais.PR.kpis.saidas },
  SP: { e: jul.filiais.SP.kpis.entradas, s: jul.filiais.SP.kpis.saidas },
  MATRIZ: { e: jul.filiais.MATRIZ.kpis.entradas, s: jul.filiais.MATRIZ.kpis.saidas },
};

jul.filiais.SEDE = sede;
jul.ordem = ORDEM.slice();
jul.empresa = buildEmpresa(jul.filiais);
data.meta.fonte = 'Relatórios ICMS (.xls) — Jan–Jun multiunidade + Jul MG/PR/SP + SEDE entradas';
data.meta.gerado_em = new Date().toLocaleString('pt-BR');

html = html.slice(0, lit.start) + JSON.stringify(data, null, 2) + html.slice(lit.end);
fs.writeFileSync(EJS, html);

const check = JSON.parse(findObjectLiteral(fs.readFileSync(EJS, 'utf8'), 'const JPG_DATA =').text);
const j = check.fiscalPorMes.porMes[MES];
let ok = true;
for (const [u, exp] of Object.entries(preserve)) {
  const k = j.filiais[u].kpis;
  if (!near(k.entradas, exp.e) || !near(k.saidas, exp.s)) {
    console.error('POST FAIL preserve', u, k.entradas, k.saidas, exp);
    ok = false;
  } else console.log('POST OK preserve', u, k.entradas, k.saidas);
}
if (!near(j.filiais.SEDE.kpis.entradas, EXPECT_ENT) || !near(j.filiais.SEDE.kpis.saidas, 0)) {
  console.error('POST FAIL SEDE', j.filiais.SEDE.kpis.entradas, j.filiais.SEDE.kpis.saidas);
  ok = false;
} else console.log('POST OK SEDE', j.filiais.SEDE.kpis.entradas, j.filiais.SEDE.kpis.saidas);

const expectConsolE = round2(preserve.MG.e + preserve.PR.e + preserve.SP.e + preserve.MATRIZ.e + EXPECT_ENT);
const expectConsolS = round2(preserve.MG.s + preserve.PR.s + preserve.SP.s + preserve.MATRIZ.s);
console.log('Consol E/S', j.empresa.kpis.entradas, j.empresa.kpis.saidas, 'expect', expectConsolE, expectConsolS);
if (!near(j.empresa.kpis.entradas, expectConsolE) || !near(j.empresa.kpis.saidas, expectConsolS)) {
  console.error('POST FAIL consol');
  ok = false;
}
if (!ok) process.exit(1);
console.log('PATCH JUL SEDE OK');
