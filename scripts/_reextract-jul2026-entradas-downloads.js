/**
 * Reagrega entradas Loja/Baifer a partir do raw reexportado de Downloads,
 * preservando saídas e demais campos já existentes nos packs jul2026.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "relatorios", "jul2026", "raw");
const OUT = path.join(ROOT, "relatorios", "jul2026");

const EXPECTED = {
  loja: {
    cnpj: "13983066000190",
    nameRe: /LOJA DAS MAQUINAS/i,
    entradas: "loja-entradas",
    packFile: "loja-07.json",
  },
  baifer: {
    cnpj: "52005382000140",
    nameRe: /BAIFER/i,
    entradas: "baifer-entradas",
    packFile: "baifer-07.json",
  },
};

function onlyDigits(s) {
  return String(s || "").replace(/\D/g, "");
}

function formatCnpj(digits) {
  const d = onlyDigits(digits);
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
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

function uniqueNfs(lines) {
  const set = new Set();
  for (const l of lines) {
    const nota = String(l.nota || "").trim();
    const serie = String(l.serie || "").trim();
    if (!nota) continue;
    set.add(`${nota}|${serie}`);
  }
  return set.size;
}

function aggregateParties(lines, partyField) {
  const byCfop = new Map();
  const byParty = new Map();

  for (const l of lines) {
    const cfop = l.cfop;
    const valor = Number(l.valor) || 0;
    const nome = cleanNome(l.nome);
    const doc = formatCnpj(l.doc);
    const uf = (l.uf || "—").trim() || "—";
    const partyKey = `${onlyDigits(l.doc) || nome}|${uf}`;

    if (!byCfop.has(cfop)) byCfop.set(cfop, { total: 0, qtdNf: new Set(), parties: new Map() });
    const c = byCfop.get(cfop);
    c.total += valor;
    c.qtdNf.add(`${l.nota}|${l.serie}`);

    if (!c.parties.has(partyKey)) {
      c.parties.set(partyKey, { nome, cnpj: doc, uf, total: 0, qtdNf: new Set() });
    }
    const p = c.parties.get(partyKey);
    p.total += valor;
    p.qtdNf.add(`${l.nota}|${l.serie}`);

    if (!byParty.has(partyKey)) {
      byParty.set(partyKey, { nome, cnpj: doc, uf, total: 0, qtdNf: new Set() });
    }
    const gp = byParty.get(partyKey);
    gp.total += valor;
    gp.qtdNf.add(`${l.nota}|${l.serie}`);
  }

  const cfopList = [...byCfop.entries()]
    .map(([cfop, c]) => {
      const parties = [...c.parties.values()]
        .map((p) => ({
          nome: p.nome,
          cnpj: p.cnpj,
          uf: p.uf,
          qtd: p.qtdNf.size,
          total: round2(p.total),
        }))
        .sort((a, b) => b.total - a.total);
      return {
        cfop,
        qtd: c.qtdNf.size,
        total: round2(c.total),
        [partyField]: parties,
      };
    })
    .sort((a, b) => b.total - a.total);

  const ranking = [...byParty.values()]
    .map((p) => ({
      nome: p.nome,
      cnpj: p.cnpj,
      uf: p.uf,
      qtd: p.qtdNf.size,
      total: round2(p.total),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    cfopList,
    ranking,
    soma: round2(lines.reduce((a, l) => a + (Number(l.valor) || 0), 0)),
  };
}

function enrichBaiferCfop(cfopList) {
  return cfopList.map((c) => ({
    cfop: c.cfop,
    qtd: c.qtd,
    total: c.total,
    contabil: c.total,
    fiscal: c.total,
    imposto: 0,
    descricao: "",
    finalidade: "",
    creditoPisCofins: false,
    debitaIcms: false,
    fornecedores: c.fornecedores,
  }));
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const report = {};

for (const [empresa, cfg] of Object.entries(EXPECTED)) {
  const rawPath = path.join(RAW, `${cfg.entradas}.json`);
  const packPath = path.join(OUT, cfg.packFile);
  const raw = loadJson(rawPath);
  const existing = loadJson(packPath);

  const cnpj = onlyDigits(raw.cnpj);
  if (cnpj !== cfg.cnpj) {
    throw new Error(`${empresa}: CNPJ raw ${cnpj} != esperado ${cfg.cnpj}`);
  }
  if (!cfg.nameRe.test(raw.company || "")) {
    throw new Error(`${empresa}: razão inesperada: ${raw.company}`);
  }
  if (raw.tipo !== "entradas") {
    throw new Error(`${empresa}: tipo raw != entradas`);
  }

  const ent = aggregateParties(raw.lines, "fornecedores");
  const nfsEntradas = uniqueNfs(raw.lines);
  const totalCompras = ent.soma;
  const deltaEntradas = round2(totalCompras - (raw.totalGeral || 0));

  if (Math.abs(deltaEntradas) >= 0.02) {
    throw new Error(
      `${empresa}: delta entradas ${deltaEntradas} (soma=${totalCompras} excel=${raw.totalGeral}) — NÃO patchar`
    );
  }

  const sumCfop = round2(ent.cfopList.reduce((a, c) => a + c.total, 0));
  if (Math.abs(sumCfop - totalCompras) >= 0.02) {
    throw new Error(`${empresa}: soma CFOP ${sumCfop} != total ${totalCompras}`);
  }

  for (const c of ent.cfopList) {
    const sp = round2((c.fornecedores || []).reduce((a, x) => a + x.total, 0));
    if (Math.abs(sp - c.total) >= 0.02) {
      throw new Error(`${empresa}: CFOP ${c.cfop} fornecedores ${sp} != ${c.total}`);
    }
  }

  // Atualiza meta entradas, preserva saidas
  existing.meta.companyEntradas = raw.company;
  existing.meta.cnpjEntradas = cnpj;
  existing.meta.periodEntradas = raw.period;
  existing.meta.totalGeralEntradasExcel = raw.totalGeral;
  existing.meta.somaEntradas = totalCompras;
  existing.meta.nfsEntradas = nfsEntradas;
  existing.meta.deltaEntradas = deltaEntradas;
  existing.meta.entradasSource = raw.sourcePath || raw.file;

  // Atualiza pack entradas, preserva saidas
  existing.pack.totalCompras = totalCompras;
  existing.pack.nfsEntradas = nfsEntradas;
  if (empresa === "loja") {
    existing.pack.cfopEntradas = ent.cfopList;
    if (existing.pack.files) {
      existing.pack.files.entradas = raw.file;
    }
  } else if (empresa === "baifer") {
    existing.pack.cfopEntradas = enrichBaiferCfop(ent.cfopList);
    existing.pack.tcFonte = "movimento";
    if (Array.isArray(existing.pack.fornecedores) || existing.pack.fornecedores === undefined) {
      existing.pack.fornecedores = ent.ranking;
    }
  }

  fs.writeFileSync(packPath, JSON.stringify(existing, null, 2), "utf8");

  report[empresa] = {
    company: raw.company,
    cnpj,
    period: raw.period,
    file: raw.file,
    sourcePath: raw.sourcePath || null,
    totalGeral: raw.totalGeral,
    soma: totalCompras,
    delta: deltaEntradas,
    nfs: nfsEntradas,
    cfopCount: ent.cfopList.length,
    topFornecedor: ent.ranking[0] || null,
  };
  console.log(
    `OK ${empresa}: total=${totalCompras} nfs=${nfsEntradas} delta=${deltaEntradas} cfops=${ent.cfopList.length}`
  );
}

fs.writeFileSync(
  path.join(OUT, "resumo-entradas-downloads.json"),
  JSON.stringify(report, null, 2),
  "utf8"
);
console.log("DONE reextract entradas downloads");
