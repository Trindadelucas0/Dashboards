/**
 * Smoke: extrai packs dos EJS, simula getPack Jul e confere totais.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const JUL = path.join(ROOT, "relatorios", "jul2026");
const TOL = 0.02;

function findObj(html, marker) {
  const i = html.indexOf(marker);
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
      if (depth === 0) return JSON.parse(html.slice(start, j + 1));
    }
  }
}

function near(a, b) {
  return Math.abs(Number(a) - Number(b)) <= TOL;
}

function checkScripts(file) {
  const html = fs.readFileSync(file, "utf8");
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, i = 0, fails = 0;
  while ((m = re.exec(html))) {
    const t = m[1].trim();
    if (!t) continue;
    i++;
    try { new vm.Script(t, { filename: path.basename(file) + "#s" + i }); }
    catch (e) { fails++; console.error("SYNTAX", path.basename(file), i, e.message); }
  }
  return fails === 0;
}

const checks = [];
function assert(cond, msg) {
  checks.push({ ok: !!cond, msg });
  console.log(cond ? "OK" : "FAIL", msg);
}

// UNAICA
{
  const pack = JSON.parse(fs.readFileSync(path.join(JUL, "unica-07.json"), "utf8")).pack;
  const D = findObj(fs.readFileSync(path.join(ROOT, "src/views/UNICATINTAS.ejs"), "utf8"), "const DASHBOARD_DATA =");
  const p = D.fiscalPorMes["07"];
  assert(near(p.totalCompras, pack.totalCompras), "unica getPack07 compras");
  assert(near(p.cfopSaidasTotal, pack.cfopSaidasTotal), "unica getPack07 vendas");
  assert(D.meta.meses.includes("07"), "unica mes 07 em meta");
  assert(checkScripts(path.join(ROOT, "src/views/UNICATINTAS.ejs")), "unica syntax");
}

// LOJA
{
  const pack = JSON.parse(fs.readFileSync(path.join(JUL, "loja-07.json"), "utf8")).pack;
  const html = fs.readFileSync(path.join(ROOT, "src/views/loja-maquinas.ejs"), "utf8");
  const F = findObj(html, "const FISCAL_POR_MES =");
  assert(near(F["2026-07"].totalCompras, pack.totalCompras), "loja 2026-07 compras");
  assert(html.includes('data-idx="6"') && html.includes("Jul / 2026"), "loja UI Jul");
  assert(html.includes("selectedMonthIdx = 6"), "loja default Jul");
  assert(checkScripts(path.join(ROOT, "src/views/loja-maquinas.ejs")), "loja syntax");
}

// EGAPLAST
{
  const pack = JSON.parse(fs.readFileSync(path.join(JUL, "egaplast-07.json"), "utf8")).pack;
  const html = fs.readFileSync(path.join(ROOT, "src/views/egaplast.ejs"), "utf8");
  const D = findObj(html, "const DASHBOARD_DATA =");
  const p = D.unidades.matriz.fiscalPorMes.porMes["07"];
  assert(near(p.totalCompras, pack.totalCompras), "ega matriz compras");
  assert(html.includes("const Q3_MESES"), "ega Q3_MESES");
  assert(html.includes("3º Trimestre — meses"), "ega UI Q3");
  assert(checkScripts(path.join(ROOT, "src/views/egaplast.ejs")), "ega syntax");
}

// BAIFER
{
  const pack = JSON.parse(fs.readFileSync(path.join(JUL, "baifer-07.json"), "utf8")).pack;
  const html = fs.readFileSync(path.join(ROOT, "src/views/baifer2trm.ejs"), "utf8");
  const D = findObj(html, "const DASHBOARD_DATA =");
  const p = D.unidades.consolidado.fiscalPorMes.porMes["07"];
  assert(near(p.totalCompras, pack.totalCompras), "baifer consolidado compras");
  assert(near(p.cfopSaidasTotal, pack.cfopSaidasTotal), "baifer consolidado vendas");
  assert(html.includes("const Q3_MESES"), "baifer Q3_MESES");
  assert(html.includes("3º Trimestre — meses"), "baifer UI Q3");
  assert(checkScripts(path.join(ROOT, "src/views/baifer2trm.ejs")), "baifer syntax");
}

// HTTP smoke
function httpGet(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port: 4243, path: urlPath, timeout: 5000 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

(async () => {
  try {
    const home = await httpGet("/");
    assert(home.status === 200 || home.status === 302 || home.status === 301, "server / status=" + home.status);
  } catch (e) {
    assert(false, "server not reachable: " + e.message + " (subir npm start)");
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length) {
    console.error("SMOKE FAILED", failed.length);
    process.exit(1);
  }
  console.log("SMOKE OK");
})();
