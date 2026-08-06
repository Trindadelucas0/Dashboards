'use strict';
/**
 * Extract SEDE Jan–Ago + MATRIZ DF Jul, overlay impostos grupo (SEDE/MATRIZ),
 * patch jpg.ejs, rebuild empresa, validate.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'relatorios', 'jpg-sede-df-2026', 'raw');
const OUT = path.join(ROOT, 'relatorios', 'jpg-sede-df-2026');
const EJS = path.join(ROOT, 'src', 'views', 'jpg.ejs');
const TOL = 0.02;
const ORDEM = ['MG', 'PR', 'SP', 'MATRIZ', 'SEDE'];

const META_U = {
  MG: { codigo: '90', cnpj: '21.051.983/0005-99', label: 'Filial MG', uf: 'MG' },
  PR: { codigo: '81', cnpj: '21.051.983/0006-70', label: 'Filial PR', uf: 'PR' },
  SP: { codigo: '82', cnpj: '21.051.983/0007-50', label: 'Filial SP', uf: 'SP' },
  MATRIZ: { codigo: '712', cnpj: '21.051.983/0003-27', label: 'Filial DF', uf: 'DF', ie: '0769567200215' },
  SEDE: { codigo: '711', cnpj: '21.051.983/0001-65', label: 'Matriz Sede', uf: 'DF', ie: '07.695.672/001-34' },
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

function parseBRDate(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return { iso: `${m[3]}-${m[2].padStart(2, '0')}`, yyyy: +m[3], mm: +m[2] };
}

function periodLabel(mesKey) {
  const [y, m] = mesKey.split('-');
  const last = new Date(+y, +m, 0).getDate();
  return `01/${m}/${y} até ${String(last).padStart(2, '0')}/${m}/${y}`;
}

function monthLabel(mesKey) {
  const nomes = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const [y, m] = mesKey.split('-');
  return `${nomes[+m]}/${y}`;
}

function loadRaw(key) {
  const p = path.join(RAW, key + '.json');
  if (!fs.existsSync(p)) throw new Error('missing raw ' + key);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function validateFile(raw, expectCnpj) {
  const fails = [];
  const sum = round2((raw.lines || []).reduce((a, l) => a + (Number(l.valor) || 0), 0));
  const tg = round2(raw.totalGeral || 0);
  if (!near(sum, tg)) fails.push(`delta ${round2(sum - tg)}`);
  if (expectCnpj && onlyDigits(raw.cnpj) !== expectCnpj) fails.push(`cnpj ${raw.cnpj}`);
  return { sum, tg, fails, ok: fails.length === 0, lineCount: raw.lineCount || (raw.lines || []).length };
}

function splitByMonth(lines) {
  const buckets = {};
  const noDate = [];
  for (const l of lines) {
    const d = parseBRDate(l.data);
    if (!d || d.yyyy !== 2026) { noDate.push(l); continue; }
    if (!buckets[d.iso]) buckets[d.iso] = [];
    buckets[d.iso].push(l);
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

function emptyFilial(key, mesKey, alerta) {
  const u = META_U[key];
  return {
    meta: {
      codigo: u.codigo, nome: 'JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS',
      cnpj: u.cnpj, ie: u.ie || '—', periodo: periodLabel(mesKey), uf: u.uf,
      filial_key: key, filial_label: u.label, alerta: alerta || '',
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

function buildFilialPack(unitKey, mesKey, entLines, saiLines) {
  const u = META_U[unitKey];
  const E = aggregate(entLines, 'fornecedor');
  const S = aggregate(saiLines, 'cliente');
  const icmsCred = E.sumIcms;
  const icmsDeb = S.sumIcms;
  return {
    meta: {
      codigo: u.codigo, nome: 'JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS',
      cnpj: u.cnpj, ie: u.ie || '—', periodo: periodLabel(mesKey), uf: u.uf,
      filial_key: unitKey, filial_label: u.label,
      alerta: (!entLines.length && !saiLines.length) ? `Sem movimento em ${mesKey}` : '',
    },
    fornecedor_keys: E.ranking.map((p) => p.cnpj),
    cliente_keys: S.ranking.map((p) => p.cnpj),
    kpis: {
      entradas: E.total, saidas: S.total,
      icms_credito: icmsCred, icms_debito: icmsDeb,
      base_icms_ent: E.sumBase, base_icms_sai: S.sumBase,
      ipi_ent: E.sumIpi, ipi_sai: S.sumIpi,
      saldo_icms: round2(icmsDeb - icmsCred),
      n_nf_ent: E.nfs, n_nf_sai: S.nfs,
      n_fornecedores: E.ranking.length, n_clientes: S.ranking.length,
    },
    cfop_entradas: E.cfops, cfop_saidas: S.cfops,
    finalidade: buildFinalidade(E.cfops),
    ranking_fornecedores: E.ranking, ranking_clientes: S.ranking,
    notas_entradas: [], notas_saidas: [],
    ufs_entradas: E.byUf, ufs_saidas: S.byUf,
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

function applyTax(pack, tax) {
  if (!tax || !pack) return pack;
  pack.kpis.icms_credito = tax.icms_credito;
  pack.kpis.icms_debito = tax.icms_debito;
  pack.kpis.saldo_icms = tax.saldo_icms != null ? tax.saldo_icms : round2(tax.icms_debito - tax.icms_credito);
  pack.kpis.ipi_ent = tax.ipi_ent;
  pack.kpis.ipi_sai = tax.ipi_sai;
  pack.dre.icms_credito = pack.kpis.icms_credito;
  pack.dre.icms_debito = pack.kpis.icms_debito;
  pack.dre.saldo_icms = pack.kpis.saldo_icms;
  pack.dre.resultado = round2(pack.kpis.saidas - pack.kpis.entradas + pack.kpis.icms_credito - pack.kpis.icms_debito);
  pack.dre.margem_resultado_pct = pack.kpis.saidas
    ? round2((pack.dre.resultado / pack.kpis.saidas) * 100) : null;
  return pack;
}

function assertCfop(pack, label) {
  const fails = [];
  for (const side of ['cfop_entradas', 'cfop_saidas']) {
    const arr = pack[side] || [];
    const sum = round2(arr.reduce((a, c) => a + (c.total || 0), 0));
    const expect = side === 'cfop_entradas' ? pack.kpis.entradas : pack.kpis.saidas;
    if (!near(sum, expect)) fails.push(`${label}.${side} ${sum}≠${expect}`);
    for (const c of arr) {
      const ps = round2((c.parties || []).reduce((a, p) => a + (p.total || 0), 0));
      if (!near(ps, c.total)) fails.push(`${label}.${c.cfop} parties ${ps}≠${c.total}`);
    }
  }
  return fails;
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
  return {
    meta: {
      codigo: 'TODAS', nome: 'JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS',
      cnpj: '5 unidades', ie: '—', periodo: periodLabel(mesKey), uf: 'BR',
      filial_key: 'EMPRESA', filial_label: 'Empresa (consolidado)', alerta: '',
    },
    fornecedor_keys: ranking_fornecedores.map((p) => p.cnpj),
    cliente_keys: ranking_clientes.map((p) => p.cnpj),
    kpis, cfop_entradas, cfop_saidas,
    finalidade: buildFinalidade(cfop_entradas),
    ranking_fornecedores, ranking_clientes,
    notas_entradas: [], notas_saidas: [],
    ufs_entradas, ufs_saidas,
    serie_diaria: { labels: [], entradas: [], saidas: [] },
    dre: {
      receita: kpis.saidas, receita_externa: kpis.saidas, cmv: kpis.entradas,
      lucro_bruto: round2(kpis.saidas - kpis.entradas),
      margem_bruta_pct: kpis.saidas ? round2(((kpis.saidas - kpis.entradas) / kpis.saidas) * 100) : null,
      icms_debito: kpis.icms_debito, icms_credito: kpis.icms_credito, saldo_icms: kpis.saldo_icms,
      resultado: round2(kpis.saidas - kpis.entradas + kpis.icms_credito - kpis.icms_debito),
      margem_resultado_pct: kpis.saidas
        ? round2(((kpis.saidas - kpis.entradas + kpis.icms_credito - kpis.icms_debito) / kpis.saidas) * 100) : null,
    },
  };
}

// ---------- main ----------
fs.mkdirSync(OUT, { recursive: true });

const rawSedeE = loadRaw('sede-janago-entradas');
const rawSedeS = loadRaw('sede-janago-saidas');
const rawDfE = loadRaw('matriz-df-jul-entradas');
const rawDfS = loadRaw('matriz-df-jul-saidas');
const rawTax = loadRaw('impostos-grupo-jpg');

const gates = [
  { key: 'sede-janago-entradas', ...validateFile(rawSedeE, '21051983000165') },
  { key: 'sede-janago-saidas', ...validateFile(rawSedeS, '21051983000165') },
  { key: 'matriz-df-jul-entradas', ...validateFile(rawDfE, '21051983000327') },
  { key: 'matriz-df-jul-saidas', ...validateFile(rawDfS, '21051983000327') },
];
fs.writeFileSync(path.join(OUT, 'validacao-extract.json'), JSON.stringify(gates, null, 2));
for (const g of gates) {
  console.log(g.ok ? 'GATE OK' : 'GATE FAIL', g.key, 'sum=' + g.sum, 'tg=' + g.tg, (g.fails || []).join('; '));
}
if (gates.some((g) => !g.ok)) {
  console.error('GATE FAIL — não patchar');
  process.exit(2);
}

const sedeE = splitByMonth(rawSedeE.lines);
const sedeS = splitByMonth(rawSedeS.lines);
const monthsSet = new Set([...Object.keys(sedeE.buckets), ...Object.keys(sedeS.buckets), '2026-07']);
const months = [...monthsSet].sort();

const taxBy = {};
for (const row of rawTax.rows || []) {
  if (row.unit !== 'SEDE' && row.unit !== 'MATRIZ') continue;
  if (!taxBy[row.mes]) taxBy[row.mes] = {};
  taxBy[row.mes][row.unit] = row;
}

const packs = {};
const splitReport = { sedeEntradas: {}, sedeSaidas: {}, noDateE: sedeE.noDate.length, noDateS: sedeS.noDate.length };
for (const mes of months) {
  const ent = sedeE.buckets[mes] || [];
  const sai = sedeS.buckets[mes] || [];
  splitReport.sedeEntradas[mes] = { n: ent.length, total: round2(ent.reduce((a, l) => a + (Number(l.valor) || 0), 0)) };
  splitReport.sedeSaidas[mes] = { n: sai.length, total: round2(sai.reduce((a, l) => a + (Number(l.valor) || 0), 0)) };
  let pack = buildFilialPack('SEDE', mes, ent, sai);
  if (taxBy[mes] && taxBy[mes].SEDE) applyTax(pack, taxBy[mes].SEDE);
  packs[mes] = { SEDE: pack };
}
packs['2026-07'] = packs['2026-07'] || {};
packs['2026-07'].MATRIZ = buildFilialPack('MATRIZ', '2026-07', rawDfE.lines, rawDfS.lines);
if (taxBy['2026-07'] && taxBy['2026-07'].MATRIZ) applyTax(packs['2026-07'].MATRIZ, taxBy['2026-07'].MATRIZ);

// Jan–Jun MATRIZ: impostos only (no movimento DF enviado)
for (const mes of ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']) {
  if (!taxBy[mes] || !taxBy[mes].MATRIZ) continue;
  if (!packs[mes]) packs[mes] = {};
  const stub = emptyFilial('MATRIZ', mes, `Sem planilha de movimento em ${mes} para Filial DF; impostos da planilha grupo.`);
  applyTax(stub, taxBy[mes].MATRIZ);
  packs[mes].MATRIZ = stub;
}

const cfopFails = [];
for (const mes of Object.keys(packs).sort()) {
  for (const unit of Object.keys(packs[mes])) {
    cfopFails.push(...assertCfop(packs[mes][unit], `${mes}.${unit}`));
  }
}
fs.writeFileSync(path.join(OUT, 'packs-por-mes.json'), JSON.stringify({ packs, splitReport, taxBy }, null, 2));
fs.writeFileSync(path.join(OUT, 'validacao-cfop.json'), JSON.stringify(cfopFails, null, 2));
if (cfopFails.length) {
  console.error('CFOP FAIL', cfopFails.slice(0, 20));
  process.exit(2);
}
console.log('CFOP OK');

// Snapshot preserve MG/PR/SP before patch
let html = fs.readFileSync(EJS, 'utf8');
const lit = findObjectLiteral(html, 'const JPG_DATA =');
const data = JSON.parse(lit.text);
const preserve = {};
for (const mes of Object.keys(data.fiscalPorMes.porMes).sort()) {
  preserve[mes] = {};
  for (const u of ['MG', 'PR', 'SP']) {
    const f = data.fiscalPorMes.porMes[mes].filiais[u];
    if (!f) continue;
    preserve[mes][u] = {
      e: f.kpis.entradas, s: f.kpis.saidas,
      icmsC: f.kpis.icms_credito, icmsD: f.kpis.icms_debito,
      ipiE: f.kpis.ipi_ent, ipiS: f.kpis.ipi_sai,
    };
  }
}

const allMeses = new Set([...Object.keys(data.fiscalPorMes.porMes), ...Object.keys(packs)]);
const mesesSorted = [...allMeses].sort();

for (const mes of mesesSorted) {
  if (!data.fiscalPorMes.porMes[mes]) {
    // create month shell from empty filiais
    const filiais = {};
    for (const k of ORDEM) filiais[k] = emptyFilial(k, mes, `Sem dados em ${mes}.`);
    data.fiscalPorMes.porMes[mes] = {
      competencia: mes,
      competenciaLabel: monthLabel(mes),
      periodo: periodLabel(mes),
      ordem: ORDEM.slice(),
      empresa: buildEmpresa(mes, filiais),
      filiais,
    };
  }
  const monthPack = data.fiscalPorMes.porMes[mes];
  monthPack.ordem = ORDEM.slice();
  for (const k of ORDEM) {
    if (!monthPack.filiais[k]) monthPack.filiais[k] = emptyFilial(k, mes);
  }
  if (packs[mes]) {
    if (packs[mes].SEDE) monthPack.filiais.SEDE = packs[mes].SEDE;
    if (packs[mes].MATRIZ) monthPack.filiais.MATRIZ = packs[mes].MATRIZ;
  }
  monthPack.empresa = buildEmpresa(mes, monthPack.filiais);
  monthPack.competencia = mes;
  monthPack.competenciaLabel = monthLabel(mes);
  monthPack.periodo = periodLabel(mes);
}

data.fiscalPorMes.meses = mesesSorted;
data.fiscalPorMes.mesLabels = mesesSorted.map(monthLabel);
data.fiscalPorMes.monthShort = mesesSorted.map((m) => monthLabel(m).split('/')[0]);
data.meta.periodoRange = `${monthLabel(mesesSorted[0]).split('/')[0]}–${monthLabel(mesesSorted[mesesSorted.length - 1])}`;
data.meta.competenciaDefault = mesesSorted[mesesSorted.length - 1];
data.meta.gerado_em = new Date().toLocaleString('pt-BR');
data.meta.fonte = 'SEDE Jan–Ago Documents\\MATRIZ + Filial DF Jul 072026 + IMPOSTOS ICMS/IPI grupo (MATRIZ/SEDE)';

html = html.slice(0, lit.start) + JSON.stringify(data, null, 2) + html.slice(lit.end);
fs.writeFileSync(EJS, html);

// Post-validate
const check = JSON.parse(findObjectLiteral(fs.readFileSync(EJS, 'utf8'), 'const JPG_DATA =').text);
let ok = true;
const post = [];

for (const mes of Object.keys(preserve).sort()) {
  for (const u of ['MG', 'PR', 'SP']) {
    const exp = preserve[mes][u];
    if (!exp) continue;
    const k = check.fiscalPorMes.porMes[mes].filiais[u].kpis;
    const pass = near(k.entradas, exp.e) && near(k.saidas, exp.s)
      && near(k.icms_credito, exp.icmsC) && near(k.icms_debito, exp.icmsD)
      && near(k.ipi_ent, exp.ipiE) && near(k.ipi_sai, exp.ipiS);
    post.push({ mes, unit: u, ok: pass, got: { e: k.entradas, s: k.saidas }, exp });
    if (!pass) { console.error('PRESERVE FAIL', mes, u, k.entradas, k.saidas, exp); ok = false; }
    else console.log('PRESERVE OK', mes, u);
  }
}

// Expected SEDE / MATRIZ
const expectSedeE = {};
for (const [mes, info] of Object.entries(splitReport.sedeEntradas)) expectSedeE[mes] = info.total;
const expectSedeS = {};
for (const [mes, info] of Object.entries(splitReport.sedeSaidas)) expectSedeS[mes] = info.total;

for (const mes of Object.keys(packs).sort()) {
  if (packs[mes].SEDE) {
    const k = check.fiscalPorMes.porMes[mes].filiais.SEDE.kpis;
    const ee = expectSedeE[mes] || 0;
    const es = expectSedeS[mes] || 0;
    if (!near(k.entradas, ee) || !near(k.saidas, es)) {
      console.error('SEDE FAIL', mes, k.entradas, k.saidas, ee, es);
      ok = false;
    } else console.log('SEDE OK', mes, k.entradas, k.saidas);
    if (taxBy[mes] && taxBy[mes].SEDE) {
      const t = taxBy[mes].SEDE;
      if (!near(k.icms_credito, t.icms_credito) || !near(k.icms_debito, t.icms_debito)
        || !near(k.ipi_ent, t.ipi_ent) || !near(k.ipi_sai, t.ipi_sai)) {
        console.error('SEDE TAX FAIL', mes, k, t);
        ok = false;
      } else console.log('SEDE TAX OK', mes);
    }
  }
  if (packs[mes].MATRIZ) {
    const k = check.fiscalPorMes.porMes[mes].filiais.MATRIZ.kpis;
    if (mes === '2026-07') {
      if (!near(k.entradas, 145769.55) || !near(k.saidas, 3180335.83)) {
        console.error('MATRIZ JUL FAIL', k.entradas, k.saidas);
        ok = false;
      } else console.log('MATRIZ JUL OK', k.entradas, k.saidas);
    }
    if (taxBy[mes] && taxBy[mes].MATRIZ) {
      const t = taxBy[mes].MATRIZ;
      if (!near(k.icms_credito, t.icms_credito) || !near(k.icms_debito, t.icms_debito)
        || !near(k.ipi_ent, t.ipi_ent) || !near(k.ipi_sai, t.ipi_sai)) {
        console.error('MATRIZ TAX FAIL', mes, k.icms_credito, k.icms_debito, t);
        ok = false;
      } else console.log('MATRIZ TAX OK', mes, 'icmsRec≈', t.icms_a_recolher);
    }
  }
}

// Syntax check embedded scripts lightly via vm extract of JPG_DATA only (already parsed)
try {
  const html2 = fs.readFileSync(EJS, 'utf8');
  const m = html2.match(/<script>([\s\S]*?const JPG_DATA[\s\S]*?)<\/script>/);
  if (m) {
    vm.runInNewContext(m[1] + '\n; typeof JPG_DATA;', { console }, { timeout: 5000 });
    console.log('VM JPG_DATA OK');
  }
} catch (e) {
  console.error('VM FAIL', e.message);
  ok = false;
}

fs.writeFileSync(path.join(OUT, 'validacao-post.json'), JSON.stringify({ ok, post, splitReport }, null, 2));
fs.writeFileSync(path.join(OUT, 'resumo-totais.json'), JSON.stringify({
  sedeByMonth: { entradas: splitReport.sedeEntradas, saidas: splitReport.sedeSaidas },
  matrizJul: {
    entradas: check.fiscalPorMes.porMes['2026-07'].filiais.MATRIZ.kpis.entradas,
    saidas: check.fiscalPorMes.porMes['2026-07'].filiais.MATRIZ.kpis.saidas,
    icms_credito: check.fiscalPorMes.porMes['2026-07'].filiais.MATRIZ.kpis.icms_credito,
    icms_debito: check.fiscalPorMes.porMes['2026-07'].filiais.MATRIZ.kpis.icms_debito,
    ipi_ent: check.fiscalPorMes.porMes['2026-07'].filiais.MATRIZ.kpis.ipi_ent,
    ipi_sai: check.fiscalPorMes.porMes['2026-07'].filiais.MATRIZ.kpis.ipi_sai,
  },
  meses: mesesSorted,
}, null, 2));

console.log(ok ? 'PATCH+VALIDATE OK' : 'PATCH+VALIDATE FAIL');
if (!ok) process.exit(1);
