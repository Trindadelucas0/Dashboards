/**
 * Patch Jun/2026 tax values from Demonstrativos PDF into dashboard data files.
 * Phases: egaplast, unica, baifer (loja already patched manually).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "..");

function loadDashboardData(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  const ctx = { DASHBOARD_DATA: null };
  vm.createContext(ctx);
  vm.runInContext(code + "\n;this.DASHBOARD_DATA = DASHBOARD_DATA;", ctx);
  return ctx.DASHBOARD_DATA;
}

function writeDashboardData(filePath, data) {
  const headerMatch = fs.readFileSync(filePath, "utf8").match(/^\/\/[^\n]*\n/);
  const header = headerMatch ? headerMatch[0] : "// Gerado\n";
  fs.writeFileSync(
    filePath,
    header + "const DASHBOARD_DATA = " + JSON.stringify(data, null, 2) + ";\n",
    "utf8"
  );
}

function patchMonthTax(pack, tax) {
  if (!pack) return;
  pack.deducoes = tax.deducoes;
  pack.dedPct = tax.dedPct;
  pack.composicao = tax.composicao;
  pack.impostosTabela = tax.impostosTabela;
  pack.apuracao = tax.apuracao;
}

const EGAPLAST_TAX = {
  deducoes: 189813.42,
  dedPct: 0,
  composicao: [
    { label: "ICMS", valor: 121410.54 },
    { label: "ICMS ST", valor: 0.0 },
    { label: "PIS", valor: 12181.34 },
    { label: "COFINS", valor: 56221.54 },
    { label: "IPI", valor: 0.0 },
  ],
  impostosTabela: [
    { tributo: "ICMS", apurado: 227086.4, recolher: 121410.54, pctRb: 0 },
    { tributo: "ICMS ST", apurado: 0.0, recolher: 0.0, pctRb: 0 },
    { tributo: "PIS", apurado: 12181.34, recolher: 12181.34, pctRb: 0 },
    { tributo: "COFINS", apurado: 56221.54, recolher: 56221.54, pctRb: 0 },
    { tributo: "IPI", apurado: 0.0, recolher: 0.0, pctRb: 0 },
  ],
  apuracao: {
    icms: {
      debitoSaidas: 227086.4,
      creditoEntradas: 50017.92,
      outrosDebitos: 173851.08,
      outrosCreditos: 229509.02,
      saldoDevedor: 121410.54,
      saldoCredor: 0.0,
      aRecolher: 121410.54,
      saldoCredorTransportar: 0.0,
    },
    icmsSt: {
      debitoSaidas: 0.0,
      creditoEntradas: 0.0,
      outrosDebitos: 0.0,
      outrosCreditos: 0.0,
      saldoDevedor: 0.0,
      saldoCredor: 0.0,
      aRecolher: 0.0,
      saldoCredorTransportar: 0.0,
    },
    pis: {
      debitoSaidas: 12181.34,
      creditoEntradas: 0.0,
      outrosDebitos: 0.0,
      outrosCreditos: 0.0,
      saldoDevedor: 12181.34,
      saldoCredor: 0.0,
      aRecolher: 12181.34,
      saldoCredorTransportar: 0.0,
    },
    cofins: {
      debitoSaidas: 56221.54,
      creditoEntradas: 0.0,
      outrosDebitos: 0.0,
      outrosCreditos: 0.0,
      saldoDevedor: 56221.54,
      saldoCredor: 0.0,
      aRecolher: 56221.54,
      saldoCredorTransportar: 0.0,
    },
    ipi: {
      debitoSaidas: 0.0,
      creditoEntradas: 0.0,
      outrosDebitos: 0.0,
      outrosCreditos: 0.0,
      saldoDevedor: 0.0,
      saldoCredor: 0.0,
      aRecolher: 0.0,
      saldoCredorTransportar: 0.0,
    },
  },
};

function patchEgaplast(filePath) {
  const D = loadDashboardData(filePath);
  D.competencia = "2026-06";
  D.competenciaLabel = "Jun / 2026";
  D.deducoes = EGAPLAST_TAX.deducoes;
  D.dedPct = EGAPLAST_TAX.dedPct;
  D.composicao = EGAPLAST_TAX.composicao;
  D.impostosTabela = EGAPLAST_TAX.impostosTabela;
  D.apuracao = EGAPLAST_TAX.apuracao;

  const targets = [];
  if (D.fiscalPorMes?.porMes?.["06"]) targets.push(D.fiscalPorMes.porMes["06"]);
  if (D.unidades) {
    for (const u of Object.values(D.unidades)) {
      if (u.fiscalPorMes?.porMes?.["06"]) targets.push(u.fiscalPorMes.porMes["06"]);
    }
  }
  targets.forEach((p) => patchMonthTax(p, EGAPLAST_TAX));
  writeDashboardData(filePath, D);
  console.log("OK egaplast:", filePath, "packs:", targets.length);
}

function patchUnica(jsPath, jsonPath) {
  const code = fs.readFileSync(jsPath, "utf8");
  const ctx = { DASHBOARD_DATA: null };
  vm.createContext(ctx);
  vm.runInContext(code + "\n;this.DASHBOARD_DATA = DASHBOARD_DATA;", ctx);
  const D = ctx.DASHBOARD_DATA;

  const rb = D.fiscalPorMes["06"].receitaBruta || 2270697.73;
  const icms = 73486.07;
  const pctRb = Math.round((icms / rb) * 10000) / 100;

  D.fiscalPorMes["06"].apuracao = {
    icms: { apurado: 602018.0, aRecolher: icms, pctRb },
    icmsSt: { apurado: 0, aRecolher: 0, pctRb: 0 },
    pis: { apurado: 0, aRecolher: 0, pctRb: 0 },
    cofins: { apurado: 0, aRecolher: 0, pctRb: 0 },
    subvencao: 0,
  };

  const header = code.match(/^\/\/[^\n]*\n/)?.[0] || "";
  fs.writeFileSync(jsPath, header + "const DASHBOARD_DATA = " + JSON.stringify(D, null, 2) + ";\n", "utf8");

  if (jsonPath && fs.existsSync(jsonPath)) {
    const j = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (j.fiscalPorMes?.["06"]) {
      j.fiscalPorMes["06"].apuracao = D.fiscalPorMes["06"].apuracao;
      fs.writeFileSync(jsonPath, JSON.stringify(j, null, 2) + "\n", "utf8");
    }
  }
  console.log("OK unica:", jsPath, "ICMS", icms, "pctRb", pctRb);
}

function patchBaifer(filePath) {
  const D = loadDashboardData(filePath);
  const icms = 14834.69;
  const pack = D.unidades?.consolidado?.fiscalPorMes?.porMes?.["06"] || D.fiscalPorMes?.porMes?.["06"];
  const rb = pack?.receitaBruta || D.receitaBruta || 660208.71;
  const pctRb = Math.round((icms / rb) * 10000) / 100;

  const tax = {
    deducoes: icms,
    dedPct: pctRb,
    composicao: [
      { label: "ICMS", valor: icms },
      { label: "ICMS ST", valor: 0 },
      { label: "PIS", valor: 0.0 },
      { label: "COFINS", valor: 0.0 },
      { label: "IPI", valor: 0.0 },
    ],
    impostosTabela: [
      { tributo: "ICMS", apurado: 111531.23, recolher: icms, pctRb },
      { tributo: "ICMS ST", apurado: 0.0, recolher: 0, pctRb: 0.0 },
      { tributo: "PIS", apurado: 0.0, recolher: 0.0, pctRb: 0.0 },
      { tributo: "COFINS", apurado: 0.0, recolher: 0.0, pctRb: 0.0 },
      { tributo: "IPI", apurado: 0.0, recolher: 0.0, pctRb: 0.0 },
    ],
    apuracao: {
      icms: {
        debitoSaidas: 111531.23,
        creditoEntradas: 34769.17,
        outrosDebitos: 50465.71,
        outrosCreditos: 112393.08,
        saldoDevedor: icms,
        saldoCredor: 0.0,
        aRecolher: icms,
        saldoCredorTransportar: 0.0,
      },
      icmsSt: {
        debitoSaidas: 0.0,
        creditoEntradas: 0.0,
        outrosDebitos: 0.0,
        outrosCreditos: 0.0,
        saldoDevedor: 0.0,
        saldoCredor: 0.0,
        aRecolher: 0,
        saldoCredorTransportar: 0.0,
      },
      pis: {
        debitoSaidas: 0,
        creditoEntradas: 0,
        outrosDebitos: 0.0,
        outrosCreditos: 0.0,
        saldoDevedor: 0.0,
        saldoCredor: 0.0,
        aRecolher: 0.0,
        saldoCredorTransportar: 0.0,
      },
      cofins: {
        debitoSaidas: 0,
        creditoEntradas: 0,
        outrosDebitos: 0.0,
        outrosCreditos: 0.0,
        saldoDevedor: 0.0,
        saldoCredor: 0.0,
        aRecolher: 0.0,
        saldoCredorTransportar: 0.0,
      },
      ipi: {
        debitoSaidas: 0.0,
        creditoEntradas: 0.0,
        outrosDebitos: 0.0,
        outrosCreditos: 0.0,
        saldoDevedor: 0.0,
        saldoCredor: 0.0,
        aRecolher: 0.0,
        saldoCredorTransportar: 0.0,
      },
    },
  };
  // outrosDebitos = 16586.81 + 33878.90 = 50465.71
  // outrosCreditos = 925.03 + 111468.05 = 112393.08
  // check: 111531.23+50465.71 - 34769.17 - 112393.08 = 14834.69

  const targets = [];
  if (D.fiscalPorMes?.porMes?.["06"]) targets.push(D.fiscalPorMes.porMes["06"]);
  if (D.unidades) {
    for (const u of Object.values(D.unidades)) {
      if (u.fiscalPorMes?.porMes?.["06"]) targets.push(u.fiscalPorMes.porMes["06"]);
    }
  }
  targets.forEach((p) => patchMonthTax(p, tax));

  // Root mirrors current month (already 2026-06)
  D.composicao = tax.composicao;
  D.impostosTabela = tax.impostosTabela;
  D.apuracao = tax.apuracao;
  D.deducoes = tax.deducoes;
  D.dedPct = tax.dedPct;

  writeDashboardData(filePath, D);
  console.log("OK baifer:", filePath, "packs:", targets.length, "ICMS", icms, "pctRb", pctRb);
}

const phase = process.argv[2] || "all";

if (phase === "egaplast" || phase === "all") {
  const files = [
    path.join(root, "egaplast att com cfop", "data", "egaplast-data.js"),
    path.join(root, "DASH", "egaplast", "data", "egaplast-data.js"),
  ];
  for (const f of files) {
    if (fs.existsSync(f)) patchEgaplast(f);
    else console.warn("skip missing", f);
  }
}

if (phase === "unica" || phase === "all") {
  patchUnica(
    path.join(root, "UNICA 10", "data", "unica-data.js"),
    path.join(root, "UNICA 10", "data", "unica-2026.json")
  );
}

if (phase === "baifer" || phase === "all") {
  patchBaifer(path.join(root, "DASH", "BAIFER DASHBOARD", "data", "baifer-data.js"));
}

console.log("done", phase);
