/**
 * Valida mes 07 embutido nos EJS vs packs JSON + syntax + regressao 06.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const JUL = path.join(ROOT, "relatorios", "jul2026");
const TOL = 0.02;

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
      if (depth === 0) return JSON.parse(html.slice(start, j + 1));
    }
  }
  throw new Error("unclosed " + marker);
}

function near(a, b) {
  return Math.abs(Number(a) - Number(b)) <= TOL;
}

function loadPack(e) {
  return JSON.parse(fs.readFileSync(path.join(JUL, `${e}-07.json`), "utf8")).pack;
}

function checkScripts(file) {
  const html = fs.readFileSync(file, "utf8");
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let i = 0;
  let fails = 0;
  while ((m = re.exec(html))) {
    const t = m[1].trim();
    if (!t) continue;
    i++;
    try {
      new vm.Script(t, { filename: path.basename(file) + "#s" + i });
    } catch (e) {
      fails++;
      console.error("SYNTAX FAIL", path.basename(file), "script", i, e.message);
    }
  }
  if (!fails) console.log("OK syntax", path.basename(file), "scripts=", i);
  return fails === 0;
}

let failed = false;
function ok(msg) {
  console.log("OK:", msg);
}
function fail(msg) {
  failed = true;
  console.error("FAIL:", msg);
}

// UNICA
{
  const file = path.join(ROOT, "src", "views", "UNICATINTAS.ejs");
  const D = findObjectLiteral(fs.readFileSync(file, "utf8"), "const DASHBOARD_DATA =");
  const pack = loadPack("unica");
  const p06 = D.fiscalPorMes["06"];
  const p07 = D.fiscalPorMes["07"];
  if (!D.meta.meses.includes("07")) fail("unica meta.meses sem 07");
  else ok("unica meta.meses tem 07");
  if (D.meta.defaultMonth !== "07") fail("unica defaultMonth");
  else ok("unica defaultMonth=07");
  if (!p07) fail("unica sem fiscalPorMes.07");
  else {
    if (!near(p07.totalCompras, pack.totalCompras)) fail("unica compras");
    else ok("unica compras=" + p07.totalCompras);
    if (!near(p07.cfopSaidasTotal, pack.cfopSaidasTotal)) fail("unica vendas");
    else ok("unica vendas=" + p07.cfopSaidasTotal);
    if (p07.nfsEntradas !== pack.nfsEntradas || p07.nfsSaidas !== pack.nfsSaidas) fail("unica nfs");
    else ok("unica nfs");
  }
  if (!near(p06.totalCompras, 1976993.72)) fail("unica regressao 06 compras");
  else ok("unica regressao 06 ok");
  if (!checkScripts(file)) fail("unica syntax");
}

// LOJA
{
  const file = path.join(ROOT, "src", "views", "loja-maquinas.ejs");
  const html = fs.readFileSync(file, "utf8");
  const F = findObjectLiteral(html, "const FISCAL_POR_MES =");
  const pack = loadPack("loja");
  if (!F["2026-07"]) fail("loja sem 2026-07");
  else {
    if (!near(F["2026-07"].totalCompras, pack.totalCompras)) fail("loja compras");
    else ok("loja compras=" + F["2026-07"].totalCompras);
    if (!near(F["2026-07"].cfopSaidasTotal, pack.cfopSaidasTotal)) fail("loja vendas");
    else ok("loja vendas=" + F["2026-07"].cfopSaidasTotal);
  }
  if (!near(F["2026-06"].totalCompras, 388293.61)) fail("loja regressao 06");
  else ok("loja regressao 06 ok");
  if (!html.includes('"2026-07"') || !html.includes('"Jul"')) fail("loja MONTH arrays");
  else ok("loja MONTH arrays");
  if (!checkScripts(file)) fail("loja syntax");
}

// EGAPLAST
{
  const file = path.join(ROOT, "src", "views", "egaplast.ejs");
  const D = findObjectLiteral(fs.readFileSync(file, "utf8"), "const DASHBOARD_DATA =");
  const pack = loadPack("egaplast");
  const p07 = D.unidades.matriz.fiscalPorMes.porMes["07"];
  const c07 = D.unidades.consolidado.fiscalPorMes.porMes["07"];
  if (!p07) fail("egaplast matriz 07");
  else if (!near(p07.totalCompras, pack.totalCompras)) fail("egaplast compras");
  else ok("egaplast matriz compras=" + p07.totalCompras);
  if (!c07 || !near(c07.cfopSaidasTotal, pack.cfopSaidasTotal)) fail("egaplast consolidado vendas");
  else ok("egaplast consolidado vendas=" + c07.cfopSaidasTotal);
  if (!D.unidades.matriz.fiscalPorMes.meses.includes("07")) fail("egaplast meses");
  else ok("egaplast meses");
  if (!checkScripts(file)) fail("egaplast syntax");
}

// BAIFER
{
  const file = path.join(ROOT, "src", "views", "baifer2trm.ejs");
  const D = findObjectLiteral(fs.readFileSync(file, "utf8"), "const DASHBOARD_DATA =");
  const pack = loadPack("baifer");
  const p07 = D.fiscalPorMes["07"] || D.fiscalPorMes.porMes?.["07"];
  if (!D.meta.meses.includes("07")) fail("baifer meta.meses");
  else ok("baifer meta.meses");
  if (!p07) fail("baifer sem 07");
  else if (!near(p07.totalCompras, pack.totalCompras) || !near(p07.cfopSaidasTotal, pack.cfopSaidasTotal)) {
    fail("baifer totais");
  } else ok("baifer totais compras=" + p07.totalCompras + " vendas=" + p07.cfopSaidasTotal);
  const p06 = D.fiscalPorMes["06"] || D.fiscalPorMes.porMes?.["06"];
  if (!p06 || !near(p06.totalCompras, 656682.55)) fail("baifer regressao 06");
  else ok("baifer regressao 06 ok");
  if (!checkScripts(file)) fail("baifer syntax");
}

if (failed) {
  console.error("VALIDACAO DASHBOARDS FALHOU");
  process.exit(1);
}
console.log("VALIDACAO DASHBOARDS OK");
