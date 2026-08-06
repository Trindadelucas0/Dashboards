'use strict';
/**
 * Extract Downloads ASA SUL Jan–Jul acumulado → split mensal → patch ASA_SUL.
 * Preserva MG/PR/SP/SEDE; MATRIZ permanece zerada; DRE sem remessas.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'relatorios', 'jpg-asa-sul', 'raw');
const OUT = path.join(ROOT, 'relatorios', 'jpg-asa-sul');
const EJS = path.join(ROOT, 'src', 'views', 'jpg.ejs');
const PACKS_PATH = path.join(ROOT, 'relatorios', 'jpg-movimento', 'packs-por-mes.json');
const TOL = 0.02;
const CNPJ = '21051983000327';
const ORDEM = ['MG', 'PR', 'SP', 'MATRIZ', 'ASA_SUL', 'SEDE'];
const MESES = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'];
const EXPECT_TOTAL = { e: 5065987.85, s: 21023979.38 };
const TRANSFER_CFOPS = new Set(['5-152', '6-152', '5-155', '6-155', '6-910', '5-914', '6-914']);

const CFOP_META = {
  '2-152': { descricao: 'Transferência recebida da matriz', finalidade: 'Transferência Matriz', credito_icms: true },
  '1-102': { descricao: 'Compra para comercialização', finalidade: 'Revenda', credito_icms: true },
  '2-102': { descricao: 'Compra para comercialização', finalidade: 'Revenda', credito_icms: true },
  '1-403': { descricao: 'Compra ST', finalidade: 'Revenda', credito_icms: true },
  '2-403': { descricao: 'Compra ST', finalidade: 'Revenda', credito_icms: true },
  '2-407': { descricao: 'Compra ST', finalidade: 'Revenda', credito_icms: true },
  '1-556': { descricao: 'Compra de material de uso/consumo', finalidade: 'Uso e consumo', credito_icms: false },
  '2-556': { descricao: 'Compra de material de uso/consumo', finalidade: 'Uso e consumo', credito_icms: false },
  '5-102': { descricao: 'Venda', finalidade: 'Venda', credito_icms: false },
  '5-405': { descricao: 'Venda com ST', finalidade: 'Venda com ST', credito_icms: false },
  '6-102': { descricao: 'Venda interestadual', finalidade: 'Venda', credito_icms: false },
  '5-910': { descricao: 'Bonificação / doação', finalidade: 'Bonificação / doação', credito_icms: false },
  '6-108': { descricao: 'Venda a não contribuinte', finalidade: 'Venda', credito_icms: false },
  '6-910': { descricao: 'Remessa', finalidade: 'Remessa p/ Filial', credito_icms: false },
  '5-152': { descricao: 'Transferência', finalidade: 'Remessa p/ Filial', credito_icms: false },
  '6-152': { descricao: 'Transferência interestadual', finalidade: 'Remessa p/ Filial', credito_icms: false },
  '6-914': { descricao: 'Remessa inter-filiais', finalidade: 'Remessa p/ Filial', credito_icms: false },
  '5-914': { descricao: 'Remessa', finalidade: 'Remessa p/ Filial', credito_icms: false },
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
function monthOf(data) {
  const m = String(data || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}`;
}
function loadRaw(key) {
  return JSON.parse(fs.readFileSync(path.join(RAW, key + '.json'), 'utf8'));
}
function validateRaw(raw) {
  const fails = [];
  const sum = round2((raw.lines || []).reduce((a, l) => a + (Number(l.valor) || 0), 0));
  const tg = round2(raw.totalGeral || 0);
  if (!near(sum, tg)) fails.push(`delta ${round2(sum - tg)}`);
  if (onlyDigits(raw.cnpj) !== CNPJ) fails.push(`cnpj ${raw.cnpj}`);
  if (!/712|JPG/i.test(raw.company || '')) fails.push(`empresa ${raw.company}`);
  if (!/01\/01\/2026/.test(raw.period || '') || !/31\/07\/2026/.test(raw.period || '')) fails.push(`period ${raw.period}`);
  return { sum, tg, fails, ok: fails.length === 0 };
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
function buildDre(kpis, cfop_saidas) {
  const receita = round2(kpis.saidas || 0);
  const cmv = round2(kpis.entradas || 0);
  const remessas = sumCfop(cfop_saidas, isRemessaCfop);
  const receita_externa = round2(receita - remessas);
  const icms_debito = round2(kpis.icms_debito || 0);
  const icms_credito = round2(kpis.icms_credito || 0);
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
function buildFilial(mesKey, entLines, saiLines, entMeta) {
  const E = aggregate(entLines || [], 'fornecedor');
  const S = aggregate(saiLines || [], 'cliente');
  const icmsCred = (entMeta && entMeta.totalIcms) || E.sumIcms;
  const icmsDeb = S.sumIcms;
  const ipiEnt = (entMeta && entMeta.totalIpi) || E.sumIpi;
  const ipiSai = S.sumIpi;
  const kpis = {
    entradas: E.total, saidas: S.total,
    icms_credito: icmsCred, icms_debito: icmsDeb,
    base_icms_ent: E.sumBase, base_icms_sai: S.sumBase,
    ipi_ent: ipiEnt, ipi_sai: ipiSai,
    saldo_icms: round2(icmsDeb - icmsCred),
    n_nf_ent: E.nfs, n_nf_sai: S.nfs,
    n_fornecedores: E.ranking.length, n_clientes: S.ranking.length,
  };
  return {
    meta: {
      codigo: '712',
      nome: 'JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS',
      cnpj: '21.051.983/0003-27',
      ie: '07.695.672/002-15',
      periodo: periodLabel(mesKey),
      uf: 'DF',
      filial_key: 'ASA_SUL',
      filial_label: 'Filial Asa Sul DF',
      alerta: '',
    },
    fornecedor_keys: E.ranking.map((p) => p.cnpj),
    cliente_keys: S.ranking.map((p) => p.cnpj),
    kpis,
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
    dre: buildDre(kpis, S.cfops),
  };
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
    dre: buildDre(kpis, cfop_saidas),
  };
}

fs.mkdirSync(OUT, { recursive: true });
const ent = loadRaw('asa-sul-janjul-entradas');
const sai = loadRaw('asa-sul-janjul-saidas');
const vE = validateRaw(ent);
const vS = validateRaw(sai);
console.log(vE.ok ? 'OK' : 'FAIL', 'entradas', vE.sum, vE.tg, vE.fails.join('; '));
console.log(vS.ok ? 'OK' : 'FAIL', 'saidas', vS.sum, vS.tg, vS.fails.join('; '));
if (!vE.ok || !vS.ok) process.exit(2);
if (!near(vE.tg, EXPECT_TOTAL.e) || !near(vS.tg, EXPECT_TOTAL.s)) {
  console.error('TOTAL EXPECT FAIL', vE.tg, EXPECT_TOTAL.e, vS.tg, EXPECT_TOTAL.s);
  process.exit(2);
}

const splitE = splitByMonth(ent.lines);
const splitS = splitByMonth(sai.lines);
let sumE = 0; let sumS = 0;
const monthsE = {}; const monthsS = {};
for (const [mes, lines] of Object.entries(splitE.buckets)) {
  monthsE[mes] = round2(lines.reduce((a, l) => a + (Number(l.valor) || 0), 0));
  sumE = round2(sumE + monthsE[mes]);
}
for (const [mes, lines] of Object.entries(splitS.buckets)) {
  monthsS[mes] = round2(lines.reduce((a, l) => a + (Number(l.valor) || 0), 0));
  sumS = round2(sumS + monthsS[mes]);
}
console.log('SPLIT E', monthsE, 'sum', sumE, 'noDate', splitE.noDate.length);
console.log('SPLIT S', monthsS, 'sum', sumS, 'noDate', splitS.noDate.length);
if (!near(sumE, vE.tg) || !near(sumS, vS.tg) || splitE.noDate.length || splitS.noDate.length) {
  console.error('SPLIT FAIL');
  process.exit(2);
}

const packs = {};
const resumo = [];
for (const mes of MESES) {
  const eLines = (splitE.buckets[mes] || []);
  const sLines = (splitS.buckets[mes] || []);
  // ICMS/IPI totais do arquivo só no acumulado — proporção não disponível; usa soma das linhas
  packs[mes] = buildFilial(mes, eLines, sLines, null);
  resumo.push({
    mes,
    entradas: packs[mes].kpis.entradas,
    saidas: packs[mes].kpis.saidas,
    receita_externa: packs[mes].dre.receita_externa,
    remessas: packs[mes].dre.remessas_transferencias,
    lucro_bruto: packs[mes].dre.lucro_bruto,
  });
  console.log('PACK', mes, 'E=' + packs[mes].kpis.entradas, 'S=' + packs[mes].kpis.saidas, 'ext=' + packs[mes].dre.receita_externa);
}

fs.writeFileSync(path.join(OUT, 'validacao-downloads.json'), JSON.stringify({
  entradas: vE, saidas: vS, monthsE, monthsS, resumo,
}, null, 2));
fs.writeFileSync(path.join(OUT, 'packs-asa-sul-downloads.json'), JSON.stringify(packs, null, 2));

// Patch EJS
let html = fs.readFileSync(EJS, 'utf8');
if (!html.includes('value="ASA_SUL"')) {
  html = html.replace(
    /<option value="MATRIZ">Filial DF<\/option>/,
    '<option value="MATRIZ">Filial DF</option>\r\n\r\n          <option value="ASA_SUL">Filial Asa Sul DF</option>'
  );
}
const lit = findObjectLiteral(html, 'const JPG_DATA =');
const data = JSON.parse(lit.text);
const preserve = {};

for (const mes of MESES) {
  const month = data.fiscalPorMes.porMes[mes];
  if (!month) throw new Error('month missing ' + mes);
  preserve[mes] = {};
  for (const u of ['MG', 'PR', 'SP', 'SEDE']) {
    preserve[mes][u] = { e: month.filiais[u].kpis.entradas, s: month.filiais[u].kpis.saidas };
  }
  month.filiais.ASA_SUL = packs[mes];
  month.filiais.MATRIZ = emptyMatriz(mes);
  month.ordem = ORDEM.slice();
  month.empresa = buildEmpresa(month.filiais, mes);
}

data.meta.fonte = 'Relatórios ICMS Downloads — Filial Asa Sul DF Jan–Jul/2026 (ENTRADA/SAIDA FILIAL DF ASA SUL.xls)';
data.meta.gerado_em = new Date().toLocaleString('pt-BR');
html = html.slice(0, lit.start) + JSON.stringify(data, null, 2) + html.slice(lit.end);
fs.writeFileSync(EJS, html);

if (fs.existsSync(PACKS_PATH)) {
  const mid = JSON.parse(fs.readFileSync(PACKS_PATH, 'utf8'));
  for (const mes of MESES) {
    if (!mid[mes]) mid[mes] = {};
    mid[mes].ASA_SUL = packs[mes];
    mid[mes].MATRIZ = emptyMatriz(mes);
  }
  fs.writeFileSync(PACKS_PATH, JSON.stringify(mid, null, 2));
}

// Post-check
const check = JSON.parse(findObjectLiteral(fs.readFileSync(EJS, 'utf8'), 'const JPG_DATA =').text);
let ok = true;
for (const mes of MESES) {
  const m = check.fiscalPorMes.porMes[mes];
  const a = m.filiais.ASA_SUL.kpis;
  if (!near(a.entradas, packs[mes].kpis.entradas) || !near(a.saidas, packs[mes].kpis.saidas)) {
    console.error('POST ASA', mes); ok = false;
  } else console.log('POST OK', mes, a.entradas, a.saidas);
  if (!near(m.filiais.MATRIZ.kpis.saidas, 0)) { console.error('MATRIZ dup', mes); ok = false; }
  for (const u of ['MG', 'PR', 'SP', 'SEDE']) {
    const k = m.filiais[u].kpis;
    const p = preserve[mes][u];
    if (!near(k.entradas, p.e) || !near(k.saidas, p.s)) { console.error('preserve', mes, u); ok = false; }
  }
  const expectE = round2(preserve[mes].MG.e + preserve[mes].PR.e + preserve[mes].SP.e + packs[mes].kpis.entradas + preserve[mes].SEDE.e);
  const expectS = round2(preserve[mes].MG.s + preserve[mes].PR.s + preserve[mes].SP.s + packs[mes].kpis.saidas + preserve[mes].SEDE.s);
  if (!near(m.empresa.kpis.entradas, expectE) || !near(m.empresa.kpis.saidas, expectS)) {
    console.error('consol', mes, m.empresa.kpis.entradas, expectE, m.empresa.kpis.saidas, expectS); ok = false;
  }
}
console.log(ok ? 'DOWNLOADS ASA_SUL PATCH OK' : 'PATCH FAILED');
if (!ok) process.exit(2);
