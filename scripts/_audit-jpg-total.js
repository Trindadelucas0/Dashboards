'use strict';
/**
 * Auditoria TOTAL JPG: todas as filiais × meses × abas/dados.
 * Cruza EJS com packs intermediários + planilha oficial de impostos.
 * Opcional: --fix-taxes aplica overlay oficial em MG/PR/SP/MATRIZ/SEDE.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..');
const EJS = path.join(ROOT, 'src', 'views', 'jpg.ejs');
const TAX_PATH = path.join(ROOT, 'relatorios', 'jpg-sede-df-2026', 'raw', 'impostos-grupo-jpg.json');
const PACKS_MOV = path.join(ROOT, 'relatorios', 'jpg-movimento', 'packs-por-mes.json');
const PACKS_ASA = path.join(ROOT, 'relatorios', 'jpg-asa-sul', 'packs-asa-sul-downloads.json');
const PACKS_SEDE = path.join(ROOT, 'relatorios', 'jpg-sede-df-2026', 'packs-por-mes.json');
const OUT_JSON = path.join(ROOT, 'relatorios', 'jpg-movimento', 'AUDITORIA-TOTAL.json');
const OUT_MD = path.join(ROOT, 'relatorios', 'jpg-movimento', 'AUDITORIA-TOTAL.md');
const TOL = 0.02;
const FIX_TAXES = process.argv.includes('--fix-taxes');
const TAX_UNITS = ['MG', 'PR', 'SP', 'MATRIZ', 'SEDE']; // ASA_SUL usa impostos Filial DF (MATRIZ) por desenho atual
const CNPJ = {
  MG: '21051983000599',
  PR: '21051983000670',
  SP: '21051983000750',
  MATRIZ: '21051983000327',
  ASA_SUL: '21051983000327',
  SEDE: '21051983000165',
};
const TRANSFER_CFOPS = new Set(['5-152', '6-152', '5-155', '6-155', '6-910', '5-914', '6-914']);

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function near(a, b) { return Math.abs(Number(a || 0) - Number(b || 0)) <= TOL; }
function onlyDigits(s) { return String(s || '').replace(/\D/g, ''); }
function sumCfop(arr, pred) {
  return round2((arr || []).filter(pred || (() => true)).reduce((a, c) => a + (Number(c.total) || 0), 0));
}
function isRemessaCfop(c) {
  const cfop = String(c.cfop || '');
  const fin = String(c.finalidade || '');
  if (cfop === '5-910' || /Bonifica/i.test(fin)) return false;
  if (/Remessa|Transfer/i.test(fin)) return true;
  return TRANSFER_CFOPS.has(cfop);
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
function emptyApLine() {
  return {
    debitoSaidas: 0, creditoEntradas: 0, outrosDebitos: 0, outrosCreditos: 0,
    saldoDevedor: 0, saldoCredor: 0, aRecolher: 0, saldoCredorTransportar: 0,
  };
}
function buildApuracaoFromTax(tax, fonte) {
  const icmsDeb = round2(tax.icms_debito || 0);
  const icmsCred = round2(tax.icms_credito || 0);
  const icmsRec = tax.icms_a_recolher != null ? round2(tax.icms_a_recolher) : round2(icmsDeb - icmsCred);
  const ipiDeb = round2(tax.ipi_sai || 0);
  const ipiCred = round2(tax.ipi_ent || 0);
  const ipiRec = tax.ipi_a_recolher != null ? round2(tax.ipi_a_recolher) : round2(ipiDeb - ipiCred);
  return {
    icms: {
      ...emptyApLine(), debitoSaidas: icmsDeb, creditoEntradas: icmsCred,
      saldoDevedor: icmsRec > 0 ? icmsRec : 0,
      saldoCredor: icmsRec < 0 ? round2(-icmsRec) : 0,
      aRecolher: icmsRec,
    },
    icmsSt: emptyApLine(), pis: emptyApLine(), cofins: emptyApLine(),
    ipi: {
      ...emptyApLine(), debitoSaidas: ipiDeb, creditoEntradas: ipiCred,
      saldoDevedor: ipiRec > 0 ? ipiRec : 0,
      saldoCredor: ipiRec < 0 ? round2(-ipiRec) : 0,
      aRecolher: ipiRec,
    },
    fonte: fonte || 'Planilha IMPOSTOS ICMS E IPI GRUPO JPG',
  };
}
function buildImpostosTabela(apuracao, receita) {
  const rb = Number(receita) || 0;
  const pct = (v) => (rb > 0 ? round2((Number(v) || 0) / rb * 100) : 0);
  return [
    { tributo: 'ICMS', apurado: apuracao.icms.debitoSaidas, recolher: apuracao.icms.aRecolher, pctRb: pct(apuracao.icms.aRecolher) },
    { tributo: 'ICMS ST', apurado: 0, recolher: 0, pctRb: 0 },
    { tributo: 'PIS', apurado: 0, recolher: 0, pctRb: 0 },
    { tributo: 'COFINS', apurado: 0, recolher: 0, pctRb: 0 },
    { tributo: 'IPI', apurado: apuracao.ipi.debitoSaidas, recolher: apuracao.ipi.aRecolher, pctRb: pct(apuracao.ipi.aRecolher) },
  ];
}
function buildDre(kpis, cfop_saidas) {
  const receita = round2(kpis.saidas || 0);
  const cmv = round2(kpis.entradas || 0);
  const remessas = sumCfop(cfop_saidas, isRemessaCfop);
  const receita_externa = round2(receita - remessas);
  const icms_debito = round2(kpis.icms_debito || 0);
  const icms_credito = round2(kpis.icms_credito || 0);
  const saldo_icms = round2(kpis.saldo_icms != null ? kpis.saldo_icms : (icms_debito - icms_credito));
  const lucro_bruto = round2(receita_externa - cmv);
  const resultado = round2(lucro_bruto + icms_credito - icms_debito);
  return {
    receita, receita_externa, remessas_transferencias: remessas, cmv, lucro_bruto,
    margem_bruta_pct: receita_externa ? round2((lucro_bruto / receita_externa) * 100) : null,
    icms_debito, icms_credito, saldo_icms, resultado,
    margem_resultado_pct: receita_externa ? round2((resultado / receita_externa) * 100) : null,
  };
}
function applyTax(pack, tax, unitLabel) {
  pack.kpis.icms_credito = round2(tax.icms_credito);
  pack.kpis.icms_debito = round2(tax.icms_debito);
  pack.kpis.saldo_icms = tax.saldo_icms != null
    ? round2(tax.saldo_icms)
    : round2(tax.icms_a_recolher != null ? tax.icms_a_recolher : (tax.icms_debito - tax.icms_credito));
  pack.kpis.ipi_ent = round2(tax.ipi_ent);
  pack.kpis.ipi_sai = round2(tax.ipi_sai);
  pack.dre = buildDre(pack.kpis, pack.cfop_saidas);
  const ap = buildApuracaoFromTax(tax, `Planilha IMPOSTOS ICMS E IPI GRUPO JPG — ${unitLabel}`);
  pack.apuracao = ap;
  pack.impostosTabela = buildImpostosTabela(ap, pack.kpis.saidas);
  pack.composicao = [
    { label: 'ICMS a recolher', valor: ap.icms.aRecolher },
    { label: 'IPI a recolher', valor: ap.ipi.aRecolher },
  ];
  pack.deducoes = round2(ap.icms.aRecolher + ap.ipi.aRecolher);
  pack.dedPct = pack.kpis.saidas ? round2((pack.deducoes / pack.kpis.saidas) * 100) : 0;
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
function mergeApuracao(list) {
  const keys = ['icms', 'icmsSt', 'pis', 'cofins', 'ipi'];
  const out = { fonte: 'Consolidado filiais' };
  for (const key of keys) {
    const line = emptyApLine();
    for (const f of list) {
      let a = f.apuracao && f.apuracao[key];
      if (!a && key === 'icms' && f.kpis) {
        a = buildApuracaoFromTax({
          icms_credito: f.kpis.icms_credito, icms_debito: f.kpis.icms_debito,
          icms_a_recolher: f.kpis.saldo_icms, ipi_ent: 0, ipi_sai: 0, ipi_a_recolher: 0,
        }).icms;
      }
      if (!a && key === 'ipi' && f.kpis) {
        a = buildApuracaoFromTax({
          icms_credito: 0, icms_debito: 0, icms_a_recolher: 0,
          ipi_ent: f.kpis.ipi_ent, ipi_sai: f.kpis.ipi_sai,
          ipi_a_recolher: round2((f.kpis.ipi_sai || 0) - (f.kpis.ipi_ent || 0)),
        }).ipi;
      }
      if (!a) a = emptyApLine();
      for (const fkey of Object.keys(line)) line[fkey] = round2(line[fkey] + (Number(a[fkey]) || 0));
    }
    out[key] = line;
  }
  return out;
}
function buildEmpresa(filiais, mesKey, ordem) {
  const list = ordem.map((k) => filiais[k]).filter(Boolean);
  const kpis = sumKpis(list);
  const cfop_entradas = mergeCfops(list.map((f) => f.cfop_entradas));
  const cfop_saidas = mergeCfops(list.map((f) => f.cfop_saidas));
  const ranking_fornecedores = mergeRanking(list.map((f) => f.ranking_fornecedores));
  const ranking_clientes = mergeRanking(list.map((f) => f.ranking_clientes));
  const ap = mergeApuracao(list);
  const empresa = {
    meta: {
      codigo: 'TODAS', nome: 'JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS',
      cnpj: `${ordem.length} unidades`, ie: '—',
      periodo: periodLabel(mesKey), uf: 'BR', filial_key: 'EMPRESA',
      filial_label: 'Empresa (consolidado)', alerta: '',
    },
    fornecedor_keys: ranking_fornecedores.map((p) => p.cnpj),
    cliente_keys: ranking_clientes.map((p) => p.cnpj),
    kpis, cfop_entradas, cfop_saidas,
    finalidade: buildFinalidade(cfop_entradas),
    ranking_fornecedores, ranking_clientes,
    notas_entradas: [], notas_saidas: [], ufs_entradas: {}, ufs_saidas: {},
    serie_diaria: { labels: [], entradas: [], saidas: [] },
    dre: buildDre(kpis, cfop_saidas),
    apuracao: ap,
    impostosTabela: buildImpostosTabela(ap, kpis.saidas),
    composicao: [
      { label: 'ICMS a recolher', valor: ap.icms.aRecolher },
      { label: 'IPI a recolher', valor: ap.ipi.aRecolher },
    ],
    deducoes: round2(ap.icms.aRecolher + ap.ipi.aRecolher),
  };
  empresa.dedPct = kpis.saidas ? round2((empresa.deducoes / kpis.saidas) * 100) : 0;
  return empresa;
}

const results = [];
const pendencias = [];
function ok(aba, id, msg) { results.push({ aba, id, status: 'OK', msg }); }
function fail(aba, id, msg) { results.push({ aba, id, status: 'FAIL', msg }); }
function warn(aba, id, msg) { results.push({ aba, id, status: 'WARN', msg }); pendencias.push(`${aba}|${id}|${msg}`); }

function checkParties(aba, id, cfops) {
  for (const c of cfops || []) {
    if (!(c.parties || []).length) continue;
    const sum = round2(c.parties.reduce((a, p) => a + (Number(p.total) || 0), 0));
    if (!near(sum, c.total)) fail(aba, `${id}-party-${c.cfop}`, `parties ${sum} ≠ cfop ${c.total}`);
  }
}

function checkFinalidade(aba, id, pack) {
  const fin = pack.finalidade || [];
  if (!fin.length && !(pack.cfop_entradas || []).length) return;
  const sumFin = round2(fin.reduce((a, x) => a + (Number(x.total) || 0), 0));
  const sumE = sumCfop(pack.cfop_entradas);
  if (fin.length && !near(sumFin, sumE)) fail(aba, `${id}-finalidade`, `fin ${sumFin} ≠ entradas ${sumE}`);
  else if (fin.length) ok(aba, `${id}-finalidade`, String(sumFin));
}

function checkDre(aba, id, pack) {
  if (!pack.dre) { warn(aba, `${id}-dre`, 'sem DRE'); return; }
  const expect = buildDre(pack.kpis, pack.cfop_saidas);
  if (!near(pack.dre.receita, expect.receita)) fail(aba, `${id}-dre-receita`, `${pack.dre.receita} ≠ ${expect.receita}`);
  else ok(aba, `${id}-dre-receita`, String(pack.dre.receita));
  if (!near(pack.dre.cmv, expect.cmv)) fail(aba, `${id}-dre-cmv`, `${pack.dre.cmv} ≠ ${expect.cmv}`);
  else ok(aba, `${id}-dre-cmv`, String(pack.dre.cmv));
  if (!near(pack.dre.icms_credito, pack.kpis.icms_credito) || !near(pack.dre.icms_debito, pack.kpis.icms_debito)) {
    fail(aba, `${id}-dre-icms`, `dre ICMS ≠ kpis`);
  } else ok(aba, `${id}-dre-icms`, 'alinhado kpis');
}

function checkTax(aba, id, pack, tax) {
  if (!tax) { warn(aba, `${id}-tax`, 'sem linha na planilha grupo'); return; }
  const k = pack.kpis;
  const saldoPlan = tax.saldo_icms != null ? tax.saldo_icms : tax.icms_a_recolher;
  const okKpi = near(k.icms_credito, tax.icms_credito) && near(k.icms_debito, tax.icms_debito)
    && near(k.ipi_ent, tax.ipi_ent) && near(k.ipi_sai, tax.ipi_sai)
    && near(k.saldo_icms, saldoPlan);
  if (!okKpi) {
    fail(aba, `${id}-impostos-kpi`, `kpi ICMS c/d=${k.icms_credito}/${k.icms_debito} plan=${tax.icms_credito}/${tax.icms_debito}; IPI e/s=${k.ipi_ent}/${k.ipi_sai} plan=${tax.ipi_ent}/${tax.ipi_sai}`);
  } else ok(aba, `${id}-impostos-kpi`, `ICMS ar≈${tax.icms_a_recolher} IPI ar≈${tax.ipi_a_recolher}`);

  if (!pack.apuracao) fail(aba, `${id}-memoria`, 'sem apuracao');
  else if (!near(pack.apuracao.icms.aRecolher, tax.icms_a_recolher) || !near(pack.apuracao.ipi.aRecolher, tax.ipi_a_recolher)) {
    fail(aba, `${id}-memoria`, `ap ICMS/IPI ${pack.apuracao.icms.aRecolher}/${pack.apuracao.ipi.aRecolher} ≠ plan ${tax.icms_a_recolher}/${tax.ipi_a_recolher}`);
  } else ok(aba, `${id}-memoria`, `ICMS=${tax.icms_a_recolher} IPI=${tax.ipi_a_recolher}`);

  const tab = pack.impostosTabela || [];
  const ipiRow = tab.find((r) => r.tributo === 'IPI');
  const icmsRow = tab.find((r) => r.tributo === 'ICMS');
  if (!ipiRow || !icmsRow) fail(aba, `${id}-impostos-tab`, 'impostosTabela incompleta');
  else if (!near(ipiRow.recolher, tax.ipi_a_recolher) || !near(icmsRow.recolher, tax.icms_a_recolher)) {
    fail(aba, `${id}-impostos-tab`, `tab ≠ planilha`);
  } else ok(aba, `${id}-impostos-tab`, `${tab.length} linhas`);
}

async function main() {
  const taxRows = JSON.parse(fs.readFileSync(TAX_PATH, 'utf8')).rows || [];
  const taxBy = {};
  for (const r of taxRows) {
    if (!taxBy[r.mes]) taxBy[r.mes] = {};
    taxBy[r.mes][r.unit] = r;
  }
  const packsMov = JSON.parse(fs.readFileSync(PACKS_MOV, 'utf8'));
  const packsAsa = fs.existsSync(PACKS_ASA) ? JSON.parse(fs.readFileSync(PACKS_ASA, 'utf8')) : {};
  const packsSede = fs.existsSync(PACKS_SEDE) ? JSON.parse(fs.readFileSync(PACKS_SEDE, 'utf8')) : {};

  let html = fs.readFileSync(EJS, 'utf8');
  let lit = findObjectLiteral(html, 'const JPG_DATA =');
  let data = JSON.parse(lit.text);

  if (FIX_TAXES) {
    console.log('=== APLICANDO OVERLAY IMPOSTOS OFICIAIS (MG/PR/SP/MATRIZ/SEDE) ===');
    for (const mes of Object.keys(data.fiscalPorMes.porMes).sort()) {
      const month = data.fiscalPorMes.porMes[mes];
      for (const u of TAX_UNITS) {
        const pack = month.filiais[u];
        const tax = taxBy[mes] && taxBy[mes][u];
        if (!pack || !tax) continue;
        const fatE = pack.kpis.entradas;
        const fatS = pack.kpis.saidas;
        applyTax(pack, tax, u);
        if (!near(pack.kpis.entradas, fatE) || !near(pack.kpis.saidas, fatS)) {
          fail('fix', `${mes}-${u}-fat`, 'faturamento alterado no overlay');
        }
      }
      // ASA_SUL: impostos oficiais = Filial DF (MATRIZ) — mantém desenho existente
      if (month.filiais.ASA_SUL && taxBy[mes] && taxBy[mes].MATRIZ) {
        const fatE = month.filiais.ASA_SUL.kpis.entradas;
        const fatS = month.filiais.ASA_SUL.kpis.saidas;
        applyTax(month.filiais.ASA_SUL, taxBy[mes].MATRIZ, 'ASA_SUL←Filial DF');
        if (!near(month.filiais.ASA_SUL.kpis.entradas, fatE) || !near(month.filiais.ASA_SUL.kpis.saidas, fatS)) {
          fail('fix', `${mes}-ASA_SUL-fat`, 'faturamento ASA_SUL alterado');
        }
      }
      const ord = (month.ordem && month.ordem.length)
        ? month.ordem.slice()
        : Object.keys(month.filiais).filter((k) => k !== 'EMPRESA');
      month.ordem = ord;
      month.empresa = buildEmpresa(month.filiais, mes, ord);
    }
    data.meta.fonte = 'Movimento EXITO por filial + impostos oficiais GRUPO JPG (ICMS/IPI)';
    data.meta.gerado_em = new Date().toLocaleString('pt-BR');
    html = html.slice(0, lit.start) + JSON.stringify(data, null, 2) + html.slice(lit.end);
    fs.writeFileSync(EJS, html);
    lit = findObjectLiteral(html, 'const JPG_DATA =');
    data = JSON.parse(lit.text);
    console.log('EJS atualizado com impostos oficiais + consolidado.');
  }

  // Render + syntax
  const rendered = await new Promise((resolve, reject) => {
    ejs.renderFile(EJS, {}, (err, str) => (err ? reject(err) : resolve(str)));
  });
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m; let si = 0;
  while ((m = re.exec(rendered))) {
    const code = m[1].trim();
    if (!code) continue;
    try {
      new vm.Script(code, { filename: 'jpg-' + si });
      ok('sistema', 'syntax-' + si, 'script ' + si);
    } catch (e) {
      fail('sistema', 'syntax-' + si, e.message);
    }
    si++;
  }

  const meses = data.fiscalPorMes.meses || Object.keys(data.fiscalPorMes.porMes).sort();
  ok('sistema', 'meses', meses.join(', '));

  // Jul extras
  const julExtras = {};
  for (const [u, file] of [['MG', 'jpg-mg-jul.json'], ['PR', 'jpg-pr-07.json'], ['SP', 'jpg-sp-jul.json']]) {
    const p = path.join(ROOT, 'relatorios', '2026-07', file);
    if (!fs.existsSync(p)) continue;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    julExtras[u] = raw.kpis ? raw : (raw.pack || raw);
  }

  for (const mes of meses) {
    const pack = data.fiscalPorMes.porMes[mes];
    if (!pack) { fail('sistema', `mes-${mes}`, 'ausente'); continue; }
    const ordem = pack.ordem || Object.keys(pack.filiais || {});
    const filiais = pack.filiais || {};
    let se = 0; let ss = 0;

    for (const u of ordem) {
      const f = filiais[u];
      const id = `${mes}-${u}`;
      if (!f) { fail('sistema', id, 'filial ausente'); continue; }
      se = round2(se + (f.kpis.entradas || 0));
      ss = round2(ss + (f.kpis.saidas || 0));

      // CNPJ
      const cnpj = onlyDigits(f.meta && f.meta.cnpj);
      if (CNPJ[u] && cnpj && cnpj !== CNPJ[u]) fail('sistema', `${id}-cnpj`, `${cnpj} ≠ ${CNPJ[u]}`);
      else if (CNPJ[u]) ok('sistema', `${id}-cnpj`, CNPJ[u]);

      // Compras / Vendas CFOP
      const sumE = sumCfop(f.cfop_entradas);
      const sumS = sumCfop(f.cfop_saidas);
      if (!near(sumE, f.kpis.entradas || 0)) fail('compras', `${id}-cfop-e`, `${sumE} ≠ ${f.kpis.entradas}`);
      else ok('compras', `${id}-cfop-e`, String(f.kpis.entradas));
      if (!near(sumS, f.kpis.saidas || 0)) fail('vendas', `${id}-cfop-s`, `${sumS} ≠ ${f.kpis.saidas}`);
      else ok('vendas', `${id}-cfop-s`, String(f.kpis.saidas));
      checkParties('compras', `${id}-e`, f.cfop_entradas);
      checkParties('vendas', `${id}-s`, f.cfop_saidas);
      checkFinalidade('finalidade', id, f);

      // vs packs intermediários
      if (packsMov[mes]) {
        const srcKey = u === 'SEDE' ? (packsMov[mes].SEDE ? 'SEDE' : 'RAIZ') : u;
        const src = packsMov[mes][srcKey];
        if (src && src.kpis) {
          if (!near(src.kpis.entradas, f.kpis.entradas)) fail('compras', `${id}-vs-pack-e`, `${f.kpis.entradas} ≠ pack ${src.kpis.entradas}`);
          else ok('compras', `${id}-vs-pack-e`, String(f.kpis.entradas));
          if (!near(src.kpis.saidas, f.kpis.saidas)) fail('vendas', `${id}-vs-pack-s`, `${f.kpis.saidas} ≠ pack ${src.kpis.saidas}`);
          else ok('vendas', `${id}-vs-pack-s`, String(f.kpis.saidas));
        } else if (['MG', 'PR', 'SP'].includes(u) && mes !== '2026-07') {
          warn('compras', `${id}-vs-pack`, 'sem pack intermediário');
        }
      }
      if (u === 'ASA_SUL' && packsAsa[mes] && packsAsa[mes].kpis) {
        if (!near(packsAsa[mes].kpis.entradas, f.kpis.entradas) || !near(packsAsa[mes].kpis.saidas, f.kpis.saidas)) {
          fail('compras', `${id}-vs-asa-pack`, `EJS ${f.kpis.entradas}/${f.kpis.saidas} ≠ asa ${packsAsa[mes].kpis.entradas}/${packsAsa[mes].kpis.saidas}`);
        } else ok('compras', `${id}-vs-asa-pack`, `${f.kpis.entradas}/${f.kpis.saidas}`);
      }
      if (u === 'SEDE' && packsSede.packs && packsSede.packs[mes] && packsSede.packs[mes].SEDE) {
        const src = packsSede.packs[mes].SEDE;
        if (!near(src.kpis.entradas, f.kpis.entradas) || !near(src.kpis.saidas, f.kpis.saidas)) {
          fail('compras', `${id}-vs-sede-pack`, `${f.kpis.entradas}/${f.kpis.saidas} ≠ ${src.kpis.entradas}/${src.kpis.saidas}`);
        } else ok('compras', `${id}-vs-sede-pack`, `${f.kpis.entradas}/${f.kpis.saidas}`);
      }
      if (mes === '2026-07' && julExtras[u] && julExtras[u].kpis) {
        const src = julExtras[u];
        if (!near(src.kpis.entradas, f.kpis.entradas) || !near(src.kpis.saidas, f.kpis.saidas)) {
          fail('compras', `${id}-vs-jul-extract`, `${f.kpis.entradas}/${f.kpis.saidas} ≠ ${src.kpis.entradas}/${src.kpis.saidas}`);
        } else ok('compras', `${id}-vs-jul-extract`, `${f.kpis.entradas}/${f.kpis.saidas}`);
      }

      // Impostos / memória
      if (TAX_UNITS.includes(u)) {
        checkTax('impostos', id, f, taxBy[mes] && taxBy[mes][u]);
      } else if (u === 'ASA_SUL') {
        // ASA_SUL alinhada à Filial DF da planilha
        checkTax('impostos', id, f, taxBy[mes] && taxBy[mes].MATRIZ);
      } else if (u === 'LANNIC') {
        warn('impostos', `${id}-tax`, 'LANNIC fora da planilha grupo ICMS/IPI');
      }

      checkDre('dre', id, f);

      // Recebimentos derivados
      ok('recebimentos', `${id}-derivado`, `pag≈entradas ${f.kpis.entradas} rec≈saidas ${f.kpis.saidas}`);
    }

    // Consolidado
    const emp = pack.empresa;
    if (!emp) fail('visao-geral', `${mes}-empresa`, 'sem consolidado');
    else {
      if (!near(emp.kpis.entradas, se) || !near(emp.kpis.saidas, ss)) {
        fail('visao-geral', `${mes}-consol`, `emp ${emp.kpis.entradas}/${emp.kpis.saidas} ≠ sum ${se}/${ss}`);
      } else ok('visao-geral', `${mes}-consol`, `${se}/${ss}`);
      checkDre('dre', `${mes}-EMPRESA`, emp);
      if (!emp.apuracao) warn('memoria', `${mes}-EMPRESA-ap`, 'consolidado sem apuracao');
      else ok('memoria', `${mes}-EMPRESA-ap`, 'ok');
    }
  }

  // Abas sem fonte oficial
  warn('balancete', 'fonte', 'Balancete contábil não enviado — aba pendente/estimada');
  warn('indicadores', 'fonte', 'Indicadores derivados do movimento/DRE estimada');
  warn('impostos', 'pis-cofins-st', 'PIS/COFINS/ICMS ST zerados (não vêm na planilha grupo)');

  const fails = results.filter((r) => r.status === 'FAIL');
  const warns = results.filter((r) => r.status === 'WARN');
  const oks = results.filter((r) => r.status === 'OK');

  // Resumo por aba × status
  const byAba = {};
  for (const r of results) {
    if (!byAba[r.aba]) byAba[r.aba] = { OK: 0, FAIL: 0, WARN: 0 };
    byAba[r.aba][r.status]++;
  }

  // Matriz filial × domínio
  const matrix = {};
  for (const mes of meses) {
    for (const u of (data.fiscalPorMes.porMes[mes].ordem || [])) {
      const key = `${mes}|${u}`;
      const related = results.filter((r) => r.id.startsWith(`${mes}-${u}`) || r.id.startsWith(`${mes}-${u}-`));
      matrix[key] = {
        fail: related.filter((r) => r.status === 'FAIL').map((r) => r.id),
        warn: related.filter((r) => r.status === 'WARN').map((r) => r.id),
        okCount: related.filter((r) => r.status === 'OK').length,
      };
    }
  }

  const report = {
    gerado_em: new Date().toLocaleString('pt-BR'),
    fix_taxes: FIX_TAXES,
    resumo: { OK: oks.length, FAIL: fails.length, WARN: warns.length },
    por_aba: byAba,
    fails: fails.map((r) => ({ aba: r.aba, id: r.id, msg: r.msg })),
    warns: warns.map((r) => ({ aba: r.aba, id: r.id, msg: r.msg })),
    matrix,
    results,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

  const md = [
    '# Auditoria total JPG — todas as filiais e abas',
    '',
    `Gerado: ${report.gerado_em}`,
    `Overlay impostos aplicado nesta execução: **${FIX_TAXES ? 'SIM' : 'NÃO'}**`,
    '',
    `## Resumo: OK ${oks.length} | FAIL ${fails.length} | WARN ${warns.length}`,
    '',
    '## Por aba',
    '',
    '| Aba | OK | FAIL | WARN |',
    '|-----|----|------|------|',
    ...Object.entries(byAba).map(([a, c]) => `| ${a} | ${c.OK} | ${c.FAIL} | ${c.WARN} |`),
    '',
    '## FAILs',
    '',
    ...(fails.length ? fails.map((r) => `- **${r.aba}** \`${r.id}\`: ${r.msg}`) : ['- (nenhum)']),
    '',
    '## WARNs / pendências',
    '',
    ...warns.map((r) => `- **${r.aba}** \`${r.id}\`: ${r.msg}`),
    '',
  ].join('\n');
  fs.writeFileSync(OUT_MD, md);

  console.log('\n===== RESUMO POR ABA =====');
  for (const [a, c] of Object.entries(byAba)) {
    console.log(`${a}: OK=${c.OK} FAIL=${c.FAIL} WARN=${c.WARN}`);
  }
  console.log(`\nTOTAL OK=${oks.length} FAIL=${fails.length} WARN=${warns.length}`);
  if (fails.length) {
    console.log('\n===== FAILS =====');
    for (const r of fails.slice(0, 80)) console.log(`FAIL [${r.aba}] ${r.id}: ${r.msg}`);
    if (fails.length > 80) console.log(`... +${fails.length - 80} fails`);
  }
  console.log('\nWrote', OUT_MD);
  process.exitCode = fails.length ? 2 : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
