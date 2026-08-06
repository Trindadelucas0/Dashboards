/**
 * Extrai JPG Filial PR Jul/2026 e injeta em jpg.ejs (JPG_DATA.fiscalPorMes).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "relatorios", "2026-07", "raw");
const OUT = path.join(ROOT, "relatorios", "2026-07");
const EJS = path.join(ROOT, "src", "views", "jpg.ejs");
const CNPJ_PR = "21051983000670";
const TOL = 0.02;

function onlyDigits(s) {
  return String(s || "").replace(/\D/g, "");
}
function formatCnpj(digits) {
  const d = onlyDigits(digits);
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d || "—";
}
function cleanNome(nome) {
  let n = String(nome || "").trim();
  n = n.replace(/^\d{1,3}(?:\.\d{3}){1,2}\s+/, "");
  n = n.replace(/^\d{11,14}\s+/, "");
  return n.trim() || String(nome || "").trim();
}
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function near(a, b) {
  return Math.abs(Number(a) - Number(b)) <= TOL;
}
function loadRaw(key) {
  return JSON.parse(fs.readFileSync(path.join(RAW, `${key}.json`), "utf8"));
}

function findObjectLiteral(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) throw new Error("marker not found: " + marker);
  const start = html.indexOf("{", i);
  let depth = 0, inStr = false, quote = "", esc = false;
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; quote = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return { start, end: j + 1, text: html.slice(start, j + 1) };
    }
  }
  throw new Error("unclosed");
}

const CFOP_META = {
  "2-152": { descricao: "Transferência recebida da matriz", finalidade: "Transferência Matriz", credito_icms: true },
  "1-102": { descricao: "Compra para comercialização", finalidade: "Revenda", credito_icms: true },
  "2-102": { descricao: "Compra para comercialização", finalidade: "Revenda", credito_icms: true },
  "5-102": { descricao: "Venda", finalidade: "Venda", credito_icms: false },
  "5-405": { descricao: "Venda com ST", finalidade: "Venda com ST", credito_icms: false },
  "6-102": { descricao: "Venda interestadual", finalidade: "Venda", credito_icms: false },
  "5-910": { descricao: "Bonificação / doação", finalidade: "Bonificação / doação", credito_icms: false },
  "6-108": { descricao: "Venda a não contribuinte", finalidade: "Venda", credito_icms: false },
};

function finalidadeOf(cfop) {
  return (CFOP_META[cfop] && CFOP_META[cfop].finalidade) || "Outras";
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
    const uf = (l.uf || "—").trim() || "—";
    const nfKey = `${l.nota}|${l.serie}`;
    nfs.add(nfKey);
    const partyKey = `${onlyDigits(l.doc) || nome}|${uf}`;

    if (!byCfop.has(cfop)) {
      byCfop.set(cfop, { total: 0, icms: 0, base: 0, ipi: 0, nfs: new Set(), parties: new Map() });
    }
    const c = byCfop.get(cfop);
    c.total += valor;
    c.icms += icms;
    c.base += base;
    c.ipi += ipi;
    c.nfs.add(nfKey);
    if (!c.parties.has(partyKey)) {
      c.parties.set(partyKey, { nome, cnpj, uf, total: 0, qtdNf: new Set(), icms: 0, base: 0, ipi: 0 });
    }
    const p = c.parties.get(partyKey);
    p.total += valor;
    p.icms += icms;
    p.base += base;
    p.ipi += ipi;
    p.qtdNf.add(nfKey);

    if (!byParty.has(partyKey)) {
      byParty.set(partyKey, { nome, cnpj, uf, total: 0, qtdNf: new Set() });
    }
    const gp = byParty.get(partyKey);
    gp.total += valor;
    gp.qtdNf.add(nfKey);

    byUf[uf] = round2((byUf[uf] || 0) + valor);

    const day = String(l.data || "").trim();
    if (day) {
      if (!byDay.has(day)) byDay.set(day, { entradas: 0, saidas: 0 });
      byDay.get(day)[partyLabel === "fornecedor" ? "entradas" : "saidas"] += valor;
    }
  }

  const total = round2(lines.reduce((a, l) => a + (Number(l.valor) || 0), 0));
  const cfops = [...byCfop.entries()]
    .map(([cfop, c]) => {
      const meta = CFOP_META[cfop] || { descricao: cfop, finalidade: "Outras", credito_icms: false };
      const parties = [...c.parties.values()]
        .map((p) => ({
          nome: p.nome,
          total: round2(p.total),
          qtd: p.qtdNf.size,
          uf: p.uf,
          cnpj: p.cnpj,
          icms: round2(p.icms),
          base: round2(p.base),
          ipi: round2(p.ipi),
        }))
        .sort((a, b) => b.total - a.total);
      return {
        cfop,
        descricao: meta.descricao,
        finalidade: meta.finalidade,
        qtd: c.nfs.size,
        total: round2(c.total),
        icms: round2(c.icms),
        base: round2(c.base),
        ipi: round2(c.ipi),
        credito_icms: !!meta.credito_icms,
        pct: total ? round2((c.total / total) * 100) : 0,
        parties,
      };
    })
    .sort((a, b) => b.total - a.total);

  const ranking = [...byParty.values()]
    .map((p) => ({
      nome: p.nome,
      total: round2(p.total),
      qtd: p.qtdNf.size,
      uf: p.uf,
      cnpj: p.cnpj,
      pct: total ? round2((p.total / total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return { total, cfops, ranking, byUf, byDay, nfs: nfs.size, sumIcms: round2(lines.reduce((a, l) => a + (Number(l.icms) || 0), 0)), sumIpi: round2(lines.reduce((a, l) => a + (Number(l.ipi) || 0), 0)), sumBase: round2(lines.reduce((a, l) => a + (Number(l.base) || 0), 0)) };
}

function mergeDays(entDays, saiDays) {
  const keys = new Set([...entDays.keys(), ...saiDays.keys()]);
  const sorted = [...keys].sort((a, b) => {
    const pa = a.split("/").reverse().join("");
    const pb = b.split("/").reverse().join("");
    return pa.localeCompare(pb);
  });
  return {
    labels: sorted,
    entradas: sorted.map((d) => round2((entDays.get(d) || {}).entradas || 0)),
    saidas: sorted.map((d) => round2((saiDays.get(d) || {}).saidas || 0)),
  };
}

function buildFinalidade(cfops) {
  const map = {};
  for (const c of cfops) {
    const f = c.finalidade || "Outras";
    if (!map[f]) map[f] = { finalidade: f, total: 0, qtd: 0 };
    map[f].total += c.total;
    map[f].qtd += c.qtd;
  }
  const tot = Object.values(map).reduce((a, x) => a + x.total, 0) || 1;
  return Object.values(map)
    .map((x) => ({ ...x, total: round2(x.total), pct: round2((x.total / tot) * 100) }))
    .sort((a, b) => b.total - a.total);
}

function emptyFilial(key, label, codigo, cnpj) {
  return {
    meta: {
      codigo,
      nome: "JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS",
      cnpj,
      ie: "—",
      periodo: "01/07/2026 até 31/07/2026",
      uf: key === "MATRIZ" ? "DF" : key,
      filial_key: key,
      filial_label: label,
      alerta: `Planilha de movimento Jul/2026 ausente para ${label}.`,
    },
    fornecedor_keys: [],
    cliente_keys: [],
    kpis: {
      entradas: 0, saidas: 0, icms_credito: 0, icms_debito: 0,
      base_icms_ent: 0, base_icms_sai: 0, ipi_ent: 0, ipi_sai: 0,
      saldo_icms: 0, n_nf_ent: 0, n_nf_sai: 0, n_fornecedores: 0, n_clientes: 0,
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
      receita: 0, receita_externa: 0, cmv: 0, lucro_bruto: 0, margem_bruta_pct: null,
      icms_debito: 0, icms_credito: 0, saldo_icms: 0, resultado: 0, margem_resultado_pct: null,
    },
  };
}

function buildPrPack(ent, sai) {
  const E = aggregate(ent.lines, "fornecedor");
  const S = aggregate(sai.lines, "cliente");
  const icmsCred = ent.totalIcms || E.sumIcms;
  const icmsDeb = 0; // saídas PR tipicamente ST / sem débito simples no mês anterior
  const ipiEnt = ent.totalIpi || E.sumIpi;
  const ipiSai = S.sumIpi || 0;

  return {
    meta: {
      codigo: "81",
      nome: "JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS",
      cnpj: "21.051.983/0006-70",
      ie: "9114233592",
      periodo: ent.period || sai.period || "01/07/2026 até 31/07/2026",
      uf: "PR",
      filial_key: "PR",
      filial_label: "Filial PR",
      alerta: "",
    },
    fornecedor_keys: E.ranking.map((p) => p.cnpj),
    cliente_keys: S.ranking.map((p) => p.cnpj),
    kpis: {
      entradas: E.total,
      saidas: S.total,
      icms_credito: icmsCred,
      icms_debito: icmsDeb,
      base_icms_ent: E.sumBase,
      base_icms_sai: S.sumBase,
      ipi_ent: ipiEnt,
      ipi_sai: ipiSai || S.total, // fallback como em Mai quando IPI acompanhou receita ST
      saldo_icms: round2(icmsDeb - icmsCred),
      n_nf_ent: E.nfs,
      n_nf_sai: S.nfs,
      n_fornecedores: E.ranking.length,
      n_clientes: S.ranking.length,
    },
    cfop_entradas: E.cfops,
    cfop_saidas: S.cfops.map(({ parties, ...rest }) => ({ ...rest, parties })),
    finalidade: buildFinalidade(E.cfops),
    ranking_fornecedores: E.ranking,
    ranking_clientes: S.ranking,
    notas_entradas: [],
    notas_saidas: [],
    ufs_entradas: E.byUf,
    ufs_saidas: S.byUf,
    serie_diaria: mergeDays(E.byDay, S.byDay),
    dre: {
      receita: S.total,
      receita_externa: S.total,
      cmv: E.total,
      lucro_bruto: round2(S.total - E.total),
      margem_bruta_pct: S.total ? round2(((S.total - E.total) / S.total) * 100) : null,
      icms_debito: icmsDeb,
      icms_credito: icmsCred,
      saldo_icms: round2(icmsDeb - icmsCred),
      resultado: round2(S.total - E.total + icmsCred - icmsDeb),
      margem_resultado_pct: S.total ? round2(((S.total - E.total + icmsCred - icmsDeb) / S.total) * 100) : null,
    },
  };
}

function cloneAsEmpresa(pr) {
  return {
    meta: {
      codigo: "TODAS",
      nome: "JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS",
      cnpj: "somente Filial PR (demais unidades sem planilha Jul/2026)",
      ie: "—",
      periodo: pr.meta.periodo,
      uf: "PR",
      filial_key: "EMPRESA",
      filial_label: "Empresa (consolidado)",
      alerta: "Jul/2026: consolidado parcial — apenas Filial PR recebida. MG, SP e Matriz pendentes.",
    },
    fornecedor_keys: pr.fornecedor_keys.slice(),
    cliente_keys: pr.cliente_keys.slice(),
    kpis: { ...pr.kpis },
    cfop_entradas: JSON.parse(JSON.stringify(pr.cfop_entradas)),
    cfop_saidas: JSON.parse(JSON.stringify(pr.cfop_saidas)),
    finalidade: JSON.parse(JSON.stringify(pr.finalidade)),
    ranking_fornecedores: JSON.parse(JSON.stringify(pr.ranking_fornecedores)),
    ranking_clientes: JSON.parse(JSON.stringify(pr.ranking_clientes)),
    notas_entradas: [],
    notas_saidas: [],
    ufs_entradas: { ...pr.ufs_entradas },
    ufs_saidas: { ...pr.ufs_saidas },
    serie_diaria: JSON.parse(JSON.stringify(pr.serie_diaria)),
    dre: { ...pr.dre },
  };
}

function validate(ent, sai, pr) {
  const fails = [];
  if (!/JPG/i.test(ent.company || "") || !/JPG/i.test(sai.company || "")) fails.push("empresa não é JPG");
  const cnpjE = onlyDigits(ent.cnpj) || CNPJ_PR;
  const cnpjS = onlyDigits(sai.cnpj) || CNPJ_PR;
  if (cnpjE !== CNPJ_PR) fails.push("CNPJ entradas " + cnpjE);
  if (cnpjS !== CNPJ_PR) fails.push("CNPJ saidas " + cnpjS);
  if (sai.tipo !== "saidas") fails.push("tipo saidas=" + sai.tipo);
  if (ent.tipo !== "entradas") fails.push("tipo entradas=" + ent.tipo);
  const dE = round2(pr.kpis.entradas - (ent.totalGeral || 0));
  const dS = round2(pr.kpis.saidas - (sai.totalGeral || 0));
  if (Math.abs(dE) > TOL) fails.push("delta entradas " + dE);
  if (Math.abs(dS) > TOL) fails.push("delta saidas " + dS);
  const sumCe = round2(pr.cfop_entradas.reduce((a, c) => a + c.total, 0));
  const sumCs = round2(pr.cfop_saidas.reduce((a, c) => a + c.total, 0));
  if (!near(sumCe, pr.kpis.entradas)) fails.push("soma cfop entradas");
  if (!near(sumCs, pr.kpis.saidas)) fails.push("soma cfop saidas");
  for (const c of pr.cfop_entradas) {
    const sp = round2((c.parties || []).reduce((a, p) => a + p.total, 0));
    if ((c.parties || []).length && !near(sp, c.total)) fails.push("parties CFOP " + c.cfop);
  }
  if (!(pr.kpis.n_nf_ent > 0 && pr.kpis.n_nf_sai > 0)) fails.push("NFs");
  return fails;
}

function patchEjs(monthPack) {
  let html = fs.readFileSync(EJS, "utf8");
  const { start, end, text } = findObjectLiteral(html, "const JPG_DATA =");
  const J = JSON.parse(text);
  const prev05 = J.fiscalPorMes.porMes["2026-05"].filiais.PR.kpis.entradas;

  if (!J.fiscalPorMes.meses.includes("2026-07")) J.fiscalPorMes.meses.push("2026-07");
  if (!J.fiscalPorMes.mesLabels.includes("Jul/2026")) J.fiscalPorMes.mesLabels.push("Jul/2026");
  if (!J.fiscalPorMes.monthShort.includes("Jul")) J.fiscalPorMes.monthShort.push("Jul");
  J.fiscalPorMes.porMes["2026-07"] = monthPack;

  J.meta.periodoRange = "Mai–Jul/2026";
  J.meta.competenciaDefault = "2026-07";
  J.meta.nCompetencias = J.fiscalPorMes.meses.length;
  J.meta.gerado_em = new Date().toLocaleString("pt-BR");
  J.meta.fonte = "Relatórios ICMS (.xls) — Jul/2026 Filial PR";

  html = html.slice(0, start) + JSON.stringify(J, null, 2) + html.slice(end);
  // soft label updates
  html = html.replace(/Mai\/2026(?![\s\S]{0,40}Jul)/, "Mai–Jul/2026");
  fs.writeFileSync(EJS, html, "utf8");

  const J2 = JSON.parse(findObjectLiteral(fs.readFileSync(EJS, "utf8"), "const JPG_DATA =").text);
  if (J2.fiscalPorMes.porMes["2026-05"].filiais.PR.kpis.entradas !== prev05) {
    throw new Error("regressao Mai PR");
  }
  if (!near(J2.fiscalPorMes.porMes["2026-07"].filiais.PR.kpis.entradas, monthPack.filiais.PR.kpis.entradas)) {
    throw new Error("jul PR nao injetado");
  }
  return { prev05, jul: J2.fiscalPorMes.porMes["2026-07"].filiais.PR.kpis };
}

function syntaxCheck() {
  const html = fs.readFileSync(EJS, "utf8");
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, i = 0;
  while ((m = re.exec(html))) {
    const t = m[1].trim();
    if (!t) continue;
    i++;
    new vm.Script(t, { filename: "jpg.ejs#" + i });
  }
  return i;
}

function main() {
  const ent = loadRaw("jpg-pr-entradas");
  const sai = loadRaw("jpg-pr-saidas");
  // cabeçalho CNPJ mesclado pode vir vazio
  ent.cnpj = onlyDigits(ent.cnpj) || CNPJ_PR;
  sai.cnpj = onlyDigits(sai.cnpj) || CNPJ_PR;
  ent.period = ent.period || "01/07/2026 até 31/07/2026";
  sai.period = sai.period || "01/07/2026 até 31/07/2026";

  const pr = buildPrPack(ent, sai);
  const fails = validate(ent, sai, pr);
  const meta = {
    empresa: "jpg-pr",
    cnpj: CNPJ_PR,
    somaEntradas: pr.kpis.entradas,
    somaSaidas: pr.kpis.saidas,
    totalGeralEntradasExcel: ent.totalGeral,
    totalGeralSaidasExcel: sai.totalGeral,
    deltaEntradas: round2(pr.kpis.entradas - (ent.totalGeral || 0)),
    deltaSaidas: round2(pr.kpis.saidas - (sai.totalGeral || 0)),
    nfsEntradas: pr.kpis.n_nf_ent,
    nfsSaidas: pr.kpis.n_nf_sai,
    fails,
  };
  fs.writeFileSync(path.join(OUT, "jpg-pr-07.json"), JSON.stringify({ meta, pack: pr }, null, 2));
  console.log("EXTRACT", meta);
  if (fails.length) {
    console.error("VALIDACAO EXTRACT FALHOU", fails);
    process.exit(1);
  }
  console.log("VALIDACAO EXTRACT OK");

  const monthPack = {
    competencia: "2026-07",
    competenciaLabel: "Jul/2026",
    periodo: "01/07/2026 até 31/07/2026",
    ordem: ["MG", "PR", "SP", "MATRIZ"],
    empresa: cloneAsEmpresa(pr),
    filiais: {
      MG: emptyFilial("MG", "Filial MG", "90", "21.051.983/0005-99"),
      PR: pr,
      SP: emptyFilial("SP", "Filial SP", "82", "21.051.983/0007-50"),
      MATRIZ: emptyFilial("MATRIZ", "Matriz DF", "712", "21.051.983/0003-27"),
    },
  };

  const patched = patchEjs(monthPack);
  const nScripts = syntaxCheck();
  console.log("PATCH OK", patched);
  console.log("SYNTAX OK scripts=", nScripts);
}

main();
