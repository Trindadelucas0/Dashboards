/**
 * Agrega raw/*.json exportados do Excel em packs de movimento Jul/2026 por empresa.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "relatorios", "jul2026", "raw");
const OUT = path.join(ROOT, "relatorios", "jul2026");

const EXPECTED = {
  unica: {
    cnpj: "36517206000130",
    nameRe: /UNICA/i,
    entradas: "unica-entradas",
    saidas: "unica-saidas",
  },
  egaplast: {
    cnpj: "03185564000134",
    nameRe: /EGAPLAST/i,
    entradas: "egaplast-entradas",
    saidas: "egaplast-saidas",
  },
  loja: {
    cnpj: "13983066000190",
    nameRe: /LOJA DAS MAQUINAS/i,
    entradas: "loja-entradas",
    saidas: "loja-saidas",
  },
  baifer: {
    cnpj: "52005382000140",
    nameRe: /BAIFER/i,
    entradas: "baifer-entradas",
    saidas: "baifer-saidas",
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
  // remove prefixo tipo "39.597.087 NOME" ou "CNPJ NOME"
  n = n.replace(/^\d{1,3}(?:\.\d{3}){1,2}\s+/, "");
  n = n.replace(/^\d{11,14}\s+/, "");
  return n.trim() || String(nome || "").trim();
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function loadRaw(key) {
  const p = path.join(RAW, `${key}.json`);
  if (!fs.existsSync(p)) throw new Error(`Raw ausente: ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
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
  // cfop -> partyKey -> agg
  const byCfop = new Map();
  const byParty = new Map();
  const byUf = {};

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

    byUf[uf] = round2((byUf[uf] || 0) + valor);
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

  return { cfopList, ranking, byUf, soma: round2(lines.reduce((a, l) => a + (Number(l.valor) || 0), 0)) };
}

function enrichCfopForBaiferEga(cfopList, catalogStyle) {
  return cfopList.map((c) => {
    const base = {
      cfop: c.cfop,
      qtd: c.qtd,
      total: c.total,
      contabil: c.total,
      fiscal: c.total,
      imposto: 0,
    };
    if (c.fornecedores) base.fornecedores = c.fornecedores;
    if (catalogStyle === "ega") {
      base.descricao = "";
      base.grupo = "";
      base.creditoPisCofins = false;
      base.debitaIcms = false;
    } else if (catalogStyle === "baifer") {
      base.descricao = "";
      base.finalidade = "";
      base.creditoPisCofins = false;
      base.debitaIcms = false;
    }
    return base;
  });
}

function buildPack(empresa, entRaw, saiRaw) {
  const ent = aggregateParties(entRaw.lines, "fornecedores");
  const sai = aggregateParties(saiRaw.lines, "clientes");

  // saidas CFOP sem nested clientes na maioria dos schemas (so CFOP qtd/total)
  const cfopSaidasSimple = sai.cfopList.map(({ cfop, qtd, total }) => ({ cfop, qtd, total }));

  const nfsEntradas = uniqueNfs(entRaw.lines);
  const nfsSaidas = uniqueNfs(saiRaw.lines);
  const totalCompras = ent.soma;
  const cfopSaidasTotal = sai.soma;

  const common = {
    empresa,
    competencia: "2026-07",
    meta: {
      companyEntradas: entRaw.company,
      companySaidas: saiRaw.company,
      cnpjEntradas: onlyDigits(entRaw.cnpj),
      cnpjSaidas: onlyDigits(saiRaw.cnpj),
      periodEntradas: entRaw.period,
      periodSaidas: saiRaw.period,
      totalGeralEntradasExcel: entRaw.totalGeral,
      totalGeralSaidasExcel: saiRaw.totalGeral,
      somaEntradas: totalCompras,
      somaSaidas: cfopSaidasTotal,
      nfsEntradas,
      nfsSaidas,
      deltaEntradas: round2(totalCompras - (entRaw.totalGeral || 0)),
      deltaSaidas: round2(cfopSaidasTotal - (saiRaw.totalGeral || 0)),
    },
  };

  if (empresa === "unica") {
    const clientes = sai.ranking;
    const dtTintasTotal = round2(
      clientes.filter((c) => c.nome.toUpperCase().includes("DT TINTAS")).reduce((a, c) => a + c.total, 0)
    );
    return {
      ...common,
      pack: {
        monthKey: "07",
        monthLabel: "Jul",
        apuracao: {
          icms: { apurado: 0, aRecolher: 0, pctRb: 0 },
          icmsSt: { apurado: 0, aRecolher: 0, pctRb: 0 },
          pis: { apurado: 0, aRecolher: 0, pctRb: 0 },
          cofins: { apurado: 0, aRecolher: 0, pctRb: 0 },
          subvencao: 0,
        },
        receitaBruta: cfopSaidasTotal,
        deducoes: null,
        dedPct: null,
        icmsDed: null,
        icmsStDed: null,
        cofinsDed: null,
        pisDed: null,
        devDed: null,
        cmv: null,
        lucBruto: null,
        lucLiq: null,
        margMb: null,
        margMl: null,
        subvencao: null,
        cmvPendente: false,
        hasDre: false,
        composicao: [],
        totalCompras,
        cfopSaidasTotal,
        nfsEntradas,
        nfsSaidas,
        hasMovimentacao: true,
        cfopDados: ent.cfopList.map(({ cfop, qtd, total, fornecedores }) => ({
          cfop,
          qtd,
          total,
          fornecedores,
        })),
        cfopSaidas: cfopSaidasSimple,
        fornecedores: ent.ranking,
        clientes,
        clientesTop10: clientes.slice(0, 10),
        dtTintasTotal,
      },
    };
  }

  if (empresa === "loja") {
    return {
      ...common,
      pack: {
        competencia: "2026-07",
        competenciaLabel: "Jul / 2026",
        monthShort: "Jul",
        files: {
          entradas: "Entrada por fornecedor loja das maquinas 072026.xls",
          saidas: "Saida por cliente loja das maquinas 072026.xls",
        },
        receitaBruta: cfopSaidasTotal,
        totalCompras,
        deducoes: null,
        dedPct: null,
        pisRecolher: null,
        cofinsRecolher: null,
        icmsDebito: null,
        icmsCredito: null,
        icmsRecolher: null,
        composicao: [],
        cfopEntradas: ent.cfopList,
        cfopSaidas: cfopSaidasSimple,
        cfopSaidasTotal,
        receitaBrutaCfop: cfopSaidasTotal,
        clientesTop: sai.ranking.slice(0, 15),
        nfsEntradas,
        nfsSaidas,
        hasMovimentacao: true,
        hasDre: false,
      },
    };
  }

  if (empresa === "egaplast") {
    const cfopEntradas = enrichCfopForBaiferEga(ent.cfopList, "ega");
    const cfopSaidas = sai.cfopList.map((c) => ({
      cfop: c.cfop,
      descricao: "",
      grupo: "",
      qtd: c.qtd,
      contabil: c.total,
      fiscal: c.total,
      imposto: 0,
      total: c.total,
    }));
    const clientes = sai.ranking.slice(0, 50).map((c, i) => ({
      cod: String(i + 1),
      nome: c.nome,
      cnpj: c.cnpj === "—" ? "" : c.cnpj,
      total: c.total,
      qtd: c.qtd,
    }));
    return {
      ...common,
      pack: {
        competencia: "2026-07",
        competenciaLabel: "Jul / 2026",
        receitaBruta: cfopSaidasTotal,
        totalCompras,
        deducoes: 0,
        dedPct: 0,
        composicao: [],
        impostosTabela: [],
        apuracao: {
          icms: {
            debitoSaidas: 0,
            creditoEntradas: 0,
            outrosDebitos: 0,
            outrosCreditos: 0,
            saldoDevedor: 0,
            saldoCredor: 0,
            aRecolher: 0,
            saldoCredorTransportar: 0,
          },
          icmsSt: {
            debitoSaidas: 0,
            creditoEntradas: 0,
            outrosDebitos: 0,
            outrosCreditos: 0,
            saldoDevedor: 0,
            saldoCredor: 0,
            aRecolher: 0,
            saldoCredorTransportar: 0,
          },
          pis: {
            debitoSaidas: 0,
            creditoEntradas: 0,
            outrosDebitos: 0,
            outrosCreditos: 0,
            saldoDevedor: 0,
            saldoCredor: 0,
            aRecolher: 0,
            saldoCredorTransportar: 0,
          },
          cofins: {
            debitoSaidas: 0,
            creditoEntradas: 0,
            outrosDebitos: 0,
            outrosCreditos: 0,
            saldoDevedor: 0,
            saldoCredor: 0,
            aRecolher: 0,
            saldoCredorTransportar: 0,
          },
          ipi: {
            debitoSaidas: 0,
            creditoEntradas: 0,
            outrosDebitos: 0,
            outrosCreditos: 0,
            saldoDevedor: 0,
            saldoCredor: 0,
            aRecolher: 0,
            saldoCredorTransportar: 0,
          },
        },
        cfopEntradas,
        cfopSaidas,
        cfopSaidasTotal,
        sped: {
          nfSaidas: nfsSaidas,
          totalClientes: sai.ranking.length,
          c100Total: cfopSaidasTotal,
          clientes,
          cfopSaidas,
        },
        porUf: ent.byUf,
        fornecedores: ent.ranking.map(({ nome, cnpj, uf, qtd, total }) => ({
          nome,
          cnpj,
          uf,
          qtd,
          total,
        })),
        nfsEntradas,
        nfsSaidas,
        hasMovimentacao: true,
        hasDre: false,
      },
    };
  }

  // baifer
  const cfopEntradas = enrichCfopForBaiferEga(ent.cfopList, "baifer");
  const cfopSaidas = sai.cfopList.map((c) => ({
    cfop: c.cfop,
    descricao: "",
    finalidade: "",
    creditoPisCofins: false,
    debitaIcms: false,
    qtd: c.qtd,
    contabil: c.total,
    fiscal: c.total,
    imposto: 0,
    total: c.total,
  }));
  const clientes = sai.ranking.map((c, i) => ({
    cod: String(i + 1),
    nome: c.nome,
    cnpj: c.cnpj === "—" ? "" : c.cnpj,
    total: c.total,
    qtd: c.qtd,
  }));
  return {
    ...common,
    pack: {
      competencia: "07",
      competenciaFull: "2026-07",
      competenciaLabel: "Jul / 2026",
      trimestre: "3° TRIM",
      receitaBruta: cfopSaidasTotal,
      receitaBrutaCfop: cfopSaidasTotal,
      rbFonte: "movimento",
      totalCompras,
      tcFonte: "movimento",
      devolucaoDeducao: 0,
      deducoes: 0,
      dedPct: 0,
      composicao: [
        { label: "ICMS", valor: 0 },
        { label: "ICMS ST", valor: 0 },
        { label: "PIS", valor: 0 },
        { label: "COFINS", valor: 0 },
        { label: "IPI", valor: 0 },
      ],
      impostosTabela: [
        { tributo: "ICMS", apurado: 0, recolher: 0, pctRb: 0 },
        { tributo: "ICMS ST", apurado: 0, recolher: 0, pctRb: 0 },
        { tributo: "PIS", apurado: 0, recolher: 0, pctRb: 0 },
        { tributo: "COFINS", apurado: 0, recolher: 0, pctRb: 0 },
        { tributo: "IPI", apurado: 0, recolher: 0, pctRb: 0 },
      ],
      apuracao: {
        icms: {
          debitoSaidas: 0,
          creditoEntradas: 0,
          outrosDebitos: 0,
          outrosCreditos: 0,
          saldoDevedor: 0,
          saldoCredor: 0,
          aRecolher: 0,
          saldoCredorTransportar: 0,
        },
        icmsSt: {
          debitoSaidas: 0,
          creditoEntradas: 0,
          outrosDebitos: 0,
          outrosCreditos: 0,
          saldoDevedor: 0,
          saldoCredor: 0,
          aRecolher: 0,
          saldoCredorTransportar: 0,
        },
        pis: {
          debitoSaidas: 0,
          creditoEntradas: 0,
          outrosDebitos: 0,
          outrosCreditos: 0,
          saldoDevedor: 0,
          saldoCredor: 0,
          aRecolher: 0,
          saldoCredorTransportar: 0,
        },
        cofins: {
          debitoSaidas: 0,
          creditoEntradas: 0,
          outrosDebitos: 0,
          outrosCreditos: 0,
          saldoDevedor: 0,
          saldoCredor: 0,
          aRecolher: 0,
          saldoCredorTransportar: 0,
        },
        ipi: {
          debitoSaidas: 0,
          creditoEntradas: 0,
          outrosDebitos: 0,
          outrosCreditos: 0,
          saldoDevedor: 0,
          saldoCredor: 0,
          aRecolher: 0,
          saldoCredorTransportar: 0,
        },
      },
      cfopEntradas,
      cfopSaidas,
      cfopSaidasTotal,
      sped: {
        nfSaidas: nfsSaidas,
        totalClientes: sai.ranking.length,
        c100Total: cfopSaidasTotal,
        clientes: clientes.slice(0, 50),
        cfopSaidas,
      },
      porUf: ent.byUf,
      fornecedores: ent.ranking,
      nfsEntradas,
      nfsSaidas,
      hasMovimentacao: true,
      hasDre: false,
    },
  };
}

function main() {
  if (!fs.existsSync(RAW)) {
    console.error("Pasta raw ausente. Rode scripts/_export-jul2026-xls.ps1 primeiro.");
    process.exit(1);
  }

  const results = {};
  for (const [empresa, cfg] of Object.entries(EXPECTED)) {
    const ent = loadRaw(cfg.entradas);
    const sai = loadRaw(cfg.saidas);
    if (!cfg.nameRe.test(ent.company || "")) {
      throw new Error(`${empresa}: empresa entradas "${ent.company}" nao casa ${cfg.nameRe}`);
    }
    if (!cfg.nameRe.test(sai.company || "")) {
      throw new Error(`${empresa}: empresa saidas "${sai.company}" nao casa ${cfg.nameRe}`);
    }
    // CNPJ do cabecalho costuma vir em celula mesclada vazia no export; usar esperado + nome.
    ent.cnpj = ent.cnpj && onlyDigits(ent.cnpj) ? ent.cnpj : cfg.cnpj;
    sai.cnpj = sai.cnpj && onlyDigits(sai.cnpj) ? sai.cnpj : cfg.cnpj;
    ent.period = ent.period || "01/07/2026 até 31/07/2026";
    sai.period = sai.period || "01/07/2026 até 31/07/2026";
    if (sai.tipo !== "saidas") {
      throw new Error(`${empresa}: arquivo de saidas detectado como ${sai.tipo}`);
    }
    if (ent.tipo !== "entradas") {
      throw new Error(`${empresa}: arquivo de entradas detectado como ${ent.tipo}`);
    }
    if (!ent.totalGeral || !sai.totalGeral) {
      throw new Error(`${empresa}: Total Geral ausente E=${ent.totalGeral} S=${sai.totalGeral}`);
    }
    results[empresa] = buildPack(empresa, ent, sai);
    const outFile = path.join(OUT, `${empresa}-07.json`);
    fs.writeFileSync(outFile, JSON.stringify(results[empresa], null, 2), "utf8");
    const m = results[empresa].meta;
    console.log(
      `${empresa}: compras=${m.somaEntradas} (Δ=${m.deltaEntradas}) vendas=${m.somaSaidas} (Δ=${m.deltaSaidas}) nfsE=${m.nfsEntradas} nfsS=${m.nfsSaidas}`
    );
  }
  fs.writeFileSync(path.join(OUT, "resumo-extract.json"), JSON.stringify(
    Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.meta])),
    null,
    2
  ), "utf8");
  console.log("OK extract packs");
}

main();
