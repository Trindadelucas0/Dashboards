/**
 * Injeta mes 07/2026 de movimento nos 4 dashboards EJS.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const JUL = path.join(ROOT, "relatorios", "jul2026");

function findObjectLiteral(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) throw new Error("marker not found: " + marker);
  const start = html.indexOf("{", i);
  let depth = 0;
  let inStr = false;
  let quote = "";
  let esc = false;
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return { start, end: j + 1, text: html.slice(start, j + 1) };
    }
  }
  throw new Error("unclosed object for " + marker);
}

function replaceObject(html, marker, newObj) {
  const { start, end } = findObjectLiteral(html, marker);
  const json = JSON.stringify(newObj, null, 2);
  return html.slice(0, start) + json + html.slice(end);
}

function loadPack(empresa) {
  return JSON.parse(fs.readFileSync(path.join(JUL, `${empresa}-07.json`), "utf8"));
}

function patchUnica() {
  const file = path.join(ROOT, "src", "views", "UNICATINTAS.ejs");
  let html = fs.readFileSync(file, "utf8");
  const { text } = findObjectLiteral(html, "const DASHBOARD_DATA =");
  const D = JSON.parse(text);
  const pack = loadPack("unica").pack;

  // regressao snapshot
  const prev06 = D.fiscalPorMes["06"].totalCompras;

  if (!D.meta.meses.includes("07")) D.meta.meses.push("07");
  D.meta.monthLabels["07"] = "Jul";
  if (Array.isArray(D.meta.monthShort) && !D.meta.monthShort.includes("Jul")) {
    D.meta.monthShort.push("Jul");
  }
  D.meta.defaultMonth = "07";
  D.meta.periodoTotal = {
    label: "Total Jan – Jul / 2026",
    meses: [...D.meta.meses],
  };
  D.fiscalPorMes["07"] = pack;

  html = replaceObject(html, "const DASHBOARD_DATA =", D);
  html = html.replace(/Jan[–-]Jun\/2026/g, "Jan–Jul/2026");
  html = html.replace(/Jan – Jun \/ 2026/g, "Jan – Jul / 2026");
  html = html.replace(/Total Jan – Jun \/ 2026/g, "Total Jan – Jul / 2026");
  fs.writeFileSync(file, html, "utf8");

  // verify
  const D2 = JSON.parse(findObjectLiteral(fs.readFileSync(file, "utf8"), "const DASHBOARD_DATA =").text);
  if (D2.fiscalPorMes["06"].totalCompras !== prev06) throw new Error("unica: regressao mes 06");
  if (!D2.fiscalPorMes["07"] || D2.fiscalPorMes["07"].totalCompras !== pack.totalCompras) {
    throw new Error("unica: mes 07 nao injetado");
  }
  console.log("patched UNICATINTAS.ejs compras07=", pack.totalCompras, "vendas07=", pack.cfopSaidasTotal);
}

function patchLoja() {
  const file = path.join(ROOT, "src", "views", "loja-maquinas.ejs");
  let html = fs.readFileSync(file, "utf8");
  const pack = loadPack("loja").pack;

  // patch arrays MONTHS / MONTH_KEYS / MONTH_LABELS_LONG / VENDAS / COMPRAS
  function patchArray(constName, mapper) {
    const re = new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\];`);
    const m = html.match(re);
    if (!m) throw new Error("array not found " + constName);
    const items = m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        if (s.startsWith('"') || s.startsWith("'")) return s.slice(1, -1);
        if (s === "null") return null;
        return Number(s);
      });
    const next = mapper(items);
    const body = next
      .map((v) => {
        if (v === null) return "null";
        if (typeof v === "string") return JSON.stringify(v);
        return String(v);
      })
      .join(",\n    ");
    html = html.replace(re, `const ${constName} = [\n    ${body}\n  ];`);
  }

  const { text: fiscalText, start, end } = (() => {
    const marker = "const FISCAL_POR_MES =";
    return { ...findObjectLiteral(html, marker), marker };
  })();
  const FISCAL = JSON.parse(fiscalText);
  const prev06 = FISCAL["2026-06"].totalCompras;
  FISCAL["2026-07"] = pack;

  html = html.slice(0, start) + JSON.stringify(FISCAL, null, 2) + html.slice(end);

  // re-apply array patches on current html
  const ensure = (arr, val) => (arr.includes(val) ? arr : arr.concat([val]));
  patchArray("MONTHS", (a) => ensure(a, "Jul"));
  patchArray("MONTH_KEYS", (a) => ensure(a, "2026-07"));
  patchArray("MONTH_LABELS_LONG", (a) => ensure(a, "Jul / 2026"));
  patchArray("VENDAS", (a) => (a.length >= 7 ? a : a.concat([pack.cfopSaidasTotal])));
  patchArray("COMPRAS", (a) => (a.length >= 7 ? a : a.concat([pack.totalCompras])));
  // optional parallel arrays — pad with null if exist and shorter
  for (const name of [
    "DEDUCOES",
    "DED_PCT",
    "PIS_DED",
    "COFINS_DED",
    "ICMS_DED",
    "ICMST_DED",
    "DEV_DED",
    "CMV",
    "LUC_BRUTO",
    "LUC_LIQ",
    "MARG_MB",
    "MARG_ML",
    "SUBV",
  ]) {
    const re = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`);
    if (!re.test(html)) continue;
    patchArray(name, (a) => (a.length >= 7 ? a : a.concat([null])));
  }

  html = html.replace(/Jan a Jun\/2026/g, "Jan a Jul/2026");
  html = html.replace(/Jan–Jun\/2026/g, "Jan–Jul/2026");
  html = html.replace(/Total — Jan a Jun\/2026/g, "Total — Jan a Jul/2026");

  // ensure select options include Jul if hardcode months exist
  if (!html.includes('value="2026-07"') && html.includes("2026-06")) {
    html = html.replace(
      /(<option value="2026-06">[^<]*<\/option>)/,
      '$1\n            <option value="2026-07">Julho / 2026</option>'
    );
  }
  if (html.includes("<option value=\"06\">") && !html.includes("<option value=\"07\">")) {
    html = html.replace(
      /(<option value="06">[^<]*<\/option>)/,
      '$1\n            <option value="07">Julho</option>'
    );
  }

  fs.writeFileSync(file, html, "utf8");

  const FISCAL2 = JSON.parse(findObjectLiteral(fs.readFileSync(file, "utf8"), "const FISCAL_POR_MES =").text);
  if (FISCAL2["2026-06"].totalCompras !== prev06) throw new Error("loja: regressao 2026-06");
  if (FISCAL2["2026-07"].totalCompras !== pack.totalCompras) throw new Error("loja: mes 07 fail");
  console.log("patched loja-maquinas.ejs compras07=", pack.totalCompras, "vendas07=", pack.cfopSaidasTotal);
}

function emptyEgaplastMonthShell() {
  return {
    competencia: "2026-07",
    competenciaLabel: "Jul / 2026",
    receitaBruta: 0,
    totalCompras: 0,
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
    cfopEntradas: [],
    cfopSaidas: [],
    cfopSaidasTotal: 0,
    sped: { nfSaidas: 0, totalClientes: 0, c100Total: 0, clientes: [], cfopSaidas: [] },
    porUf: {},
    fornecedores: [],
  };
}

function extendEgaplastFiscal(fp, pack, isMatrizOrConsol) {
  if (!fp.meses.includes("07")) fp.meses.push("07");
  if (Array.isArray(fp.mesLabels) && !fp.mesLabels.includes("Julho")) fp.mesLabels.push("Julho");
  if (Array.isArray(fp.monthShort) && !fp.monthShort.includes("Jul")) fp.monthShort.push("Jul");
  fp.porMes = fp.porMes || {};
  fp.porMes["07"] = isMatrizOrConsol ? pack : emptyEgaplastMonthShell();
}

function patchEgaplast() {
  const file = path.join(ROOT, "src", "views", "egaplast.ejs");
  let html = fs.readFileSync(file, "utf8");
  const pack = loadPack("egaplast").pack;
  const { text } = findObjectLiteral(html, "const DASHBOARD_DATA =");
  const D = JSON.parse(text);

  const prev06m = D.unidades?.matriz?.fiscalPorMes?.porMes?.["06"]?.totalCompras;

  // root meta if exists
  if (D.meta) {
    if (Array.isArray(D.meta.meses) && !D.meta.meses.includes("07")) D.meta.meses.push("07");
    if (D.meta.monthLabels) D.meta.monthLabels["07"] = "Jul";
    if (D.meta.monthLabelsFull) D.meta.monthLabelsFull["07"] = "Julho";
    if (D.meta.defaultMonth) D.meta.defaultMonth = "07";
    if (D.meta.periodoTotal) {
      D.meta.periodoTotal.label = "Total Jan – Jul / 2026";
      if (Array.isArray(D.meta.periodoTotal.meses) && !D.meta.periodoTotal.meses.includes("07")) {
        D.meta.periodoTotal.meses.push("07");
      }
    }
  }

  // root fiscalPorMes.porMes style OR flat
  if (D.fiscalPorMes) {
    if (D.fiscalPorMes.porMes) {
      extendEgaplastFiscal(D.fiscalPorMes, pack, true);
    } else if (D.fiscalPorMes["06"] || D.fiscalPorMes.meses) {
      if (Array.isArray(D.fiscalPorMes.meses) && !D.fiscalPorMes.meses.includes("07")) {
        D.fiscalPorMes.meses.push("07");
      }
      D.fiscalPorMes["07"] = pack;
    }
  }

  if (D.unidades?.matriz?.fiscalPorMes) {
    extendEgaplastFiscal(D.unidades.matriz.fiscalPorMes, pack, true);
  }
  if (D.unidades?.consolidado?.fiscalPorMes) {
    extendEgaplastFiscal(D.unidades.consolidado.fiscalPorMes, pack, true);
  }
  if (D.unidades?.filial?.fiscalPorMes) {
    extendEgaplastFiscal(D.unidades.filial.fiscalPorMes, emptyEgaplastMonthShell(), false);
  }

  html = replaceObject(html, "const DASHBOARD_DATA =", D);
  html = html.replace(/Jan[–-]Jun\/2026/g, "Jan–Jul/2026");
  html = html.replace(/Jan – Jun \/ 2026/g, "Jan – Jul / 2026");
  html = html.replace(/Abr, Mai, Jun\/2026/g, "Abr, Mai, Jun, Jul/2026");
  fs.writeFileSync(file, html, "utf8");

  const D2 = JSON.parse(findObjectLiteral(fs.readFileSync(file, "utf8"), "const DASHBOARD_DATA =").text);
  if (prev06m != null && D2.unidades.matriz.fiscalPorMes.porMes["06"].totalCompras !== prev06m) {
    throw new Error("egaplast: regressao matriz 06");
  }
  const p07 = D2.unidades.matriz.fiscalPorMes.porMes["07"];
  if (!p07 || p07.totalCompras !== pack.totalCompras) throw new Error("egaplast: mes 07 fail");
  console.log("patched egaplast.ejs compras07=", pack.totalCompras, "vendas07=", pack.cfopSaidasTotal);
}

function patchBaifer() {
  const file = path.join(ROOT, "src", "views", "baifer2trm.ejs");
  let html = fs.readFileSync(file, "utf8");
  const pack = loadPack("baifer").pack;
  const { text } = findObjectLiteral(html, "const DASHBOARD_DATA =");
  const D = JSON.parse(text);
  const prev06 = D.fiscalPorMes?.["06"]?.totalCompras ?? D.fiscalPorMes?.porMes?.["06"]?.totalCompras;

  if (D.meta) {
    if (!D.meta.meses.includes("07")) D.meta.meses.push("07");
    D.meta.monthLabels["07"] = "Jul";
    if (D.meta.monthLabelsFull) D.meta.monthLabelsFull["07"] = "Julho";
    D.meta.periodoTotal = D.meta.periodoTotal || {};
    D.meta.periodoTotal.label = "Total Jan – Jul / 2026";
    if (!Array.isArray(D.meta.periodoTotal.meses)) D.meta.periodoTotal.meses = [...D.meta.meses];
    else if (!D.meta.periodoTotal.meses.includes("07")) D.meta.periodoTotal.meses.push("07");
    if (D.meta.trimestres && !D.meta.trimestres.q3) {
      D.meta.trimestres.q3 = {
        id: "q3",
        label: "3° Trimestre 2026",
        pasta: "11-BAIFER 3° TRIM",
        meses: ["07"],
        mesesLabel: "Jul / 2026",
      };
    }
  }
  if (Array.isArray(D.months) && !D.months.includes("Jul")) D.months.push("Jul");
  if (Array.isArray(D.vendas) && D.vendas.length === 6) D.vendas.push(pack.cfopSaidasTotal);
  if (Array.isArray(D.compras) || Array.isArray(D.totalComprasSeries)) {
    // ignore alternate names
  }
  // common series named vendas exists; look for compras-like
  for (const key of Object.keys(D)) {
    if (Array.isArray(D[key]) && D[key].length === 6 && typeof D[key][0] === "number") {
      if (key.toLowerCase().includes("venda") || key === "vendas") {
        if (D[key].length === 6) D[key].push(pack.cfopSaidasTotal);
      } else if (key.toLowerCase().includes("compra")) {
        if (D[key].length === 6) D[key].push(pack.totalCompras);
      }
    }
  }

  D.competencia = "2026-07";
  D.competenciaLabel = "Jul / 2026";

  if (D.fiscalPorMes?.porMes) {
    if (Array.isArray(D.fiscalPorMes.meses) && !D.fiscalPorMes.meses.includes("07")) {
      D.fiscalPorMes.meses.push("07");
    }
    D.fiscalPorMes.porMes["07"] = pack;
  } else if (D.fiscalPorMes) {
    D.fiscalPorMes["07"] = pack;
  }

  // units
  if (D.unidades) {
    for (const [uid, unit] of Object.entries(D.unidades)) {
      if (!unit?.fiscalPorMes) continue;
      const fp = unit.fiscalPorMes;
      if (Array.isArray(fp.meses) && !fp.meses.includes("07")) fp.meses.push("07");
      if (fp.porMes) {
        // consolidado/matriz style — put pack only on consolidado if exists, else all
        if (uid === "consolidado" || uid === "matriz" || Object.keys(D.unidades).length === 1) {
          fp.porMes["07"] = pack;
        } else {
          fp.porMes["07"] = { ...pack };
        }
      } else {
        fp["07"] = pack;
      }
    }
  }

  html = replaceObject(html, "const DASHBOARD_DATA =", D);
  html = html.replace(/Jan[–-]Jun\/2026/g, "Jan–Jul/2026");
  html = html.replace(/Jan – Jun \/ 2026/g, "Jan – Jul / 2026");
  html = html.replace(/Abr – Jun \/ 2026/g, "Abr – Jul / 2026");
  fs.writeFileSync(file, html, "utf8");

  const D2 = JSON.parse(findObjectLiteral(fs.readFileSync(file, "utf8"), "const DASHBOARD_DATA =").text);
  const p07 = D2.fiscalPorMes["07"] || D2.fiscalPorMes.porMes?.["07"];
  if (!p07 || p07.totalCompras !== pack.totalCompras) throw new Error("baifer: mes 07 fail");
  console.log("patched baifer2trm.ejs compras07=", pack.totalCompras, "vendas07=", pack.cfopSaidasTotal, "prev06=", prev06);
}

function main() {
  patchUnica();
  patchLoja();
  patchEgaplast();
  patchBaifer();
  console.log("PATCH OK");
}

main();
