/**
 * Compara packs de entradas Loja/Baifer Jul com os dados embutidos nos EJS
 * (parser de object literal, mesmo padrão do validate-jul2026-dashboards).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "relatorios", "jul2026");
const TOL = 0.02;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

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

function loadPack(empresa) {
  return JSON.parse(fs.readFileSync(path.join(OUT, `${empresa}-07.json`), "utf8"));
}

function cfopMap(list) {
  const m = {};
  for (const c of list || []) {
    m[c.cfop] = round2(c.total ?? c.contabil);
  }
  return m;
}

function diffCfop(packMap, ejsMap, label) {
  const keys = new Set([...Object.keys(packMap), ...Object.keys(ejsMap)]);
  const diffs = [];
  for (const k of keys) {
    const va = packMap[k] || 0;
    const vb = ejsMap[k] || 0;
    if (Math.abs(va - vb) > TOL) diffs.push(`${label} CFOP ${k}: pack=${va} ejs=${vb}`);
  }
  return diffs;
}

function findArrayLiteral(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const start = html.indexOf("[", i);
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
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return JSON.parse(html.slice(start, j + 1));
    }
  }
  return null;
}

const report = { ok: true, loja: {}, baifer: {}, diffs: [] };

{
  const packData = loadPack("loja");
  const p = packData.pack;
  const html = fs.readFileSync(path.join(ROOT, "src", "views", "loja-maquinas.ejs"), "utf8");
  const F = findObjectLiteral(html, "const FISCAL_POR_MES =");
  const jul = F["2026-07"];
  const monthKeys = findArrayLiteral(html, "const MONTH_KEYS =");
  const compras = findArrayLiteral(html, "const COMPRAS =");

  const dTot = round2((jul.totalCompras || 0) - p.totalCompras);
  const dNf = (jul.nfsEntradas || 0) - p.nfsEntradas;
  const cfDiff = diffCfop(cfopMap(p.cfopEntradas), cfopMap(jul.cfopEntradas), "loja");

  if (Math.abs(dTot) > TOL) {
    report.ok = false;
    report.diffs.push(`loja: totalCompras pack=${p.totalCompras} ejs=${jul.totalCompras}`);
  }
  if (dNf !== 0) {
    report.ok = false;
    report.diffs.push(`loja: nfsEntradas pack=${p.nfsEntradas} ejs=${jul.nfsEntradas}`);
  }
  if (cfDiff.length) {
    report.ok = false;
    report.diffs.push(...cfDiff);
  }
  if (monthKeys && compras) {
    const idx = monthKeys.indexOf("2026-07");
    if (idx >= 0 && Math.abs(round2(compras[idx]) - p.totalCompras) > TOL) {
      report.ok = false;
      report.diffs.push(`loja: COMPRAS[${idx}]=${compras[idx]} != ${p.totalCompras}`);
    }
  }

  report.loja = {
    packTotal: p.totalCompras,
    ejsTotal: jul.totalCompras,
    packNfs: p.nfsEntradas,
    ejsNfs: jul.nfsEntradas,
    deltaTotal: dTot,
    cfopDiffs: cfDiff.length,
    identical: Math.abs(dTot) <= TOL && dNf === 0 && cfDiff.length === 0,
  };
}

{
  const packData = loadPack("baifer");
  const p = packData.pack;
  const html = fs.readFileSync(path.join(ROOT, "src", "views", "baifer2trm.ejs"), "utf8");
  const D = findObjectLiteral(html, "const DASHBOARD_DATA =");
  const jul =
    D.unidades?.consolidado?.fiscalPorMes?.porMes?.["07"] ||
    D.fiscalPorMes?.porMes?.["07"] ||
    D.fiscalPorMes?.["07"];

  if (!jul) {
    report.ok = false;
    report.diffs.push("baifer: porMes['07'] ausente");
  } else {
    const dTot = round2((jul.totalCompras || 0) - p.totalCompras);
    const dNf = (jul.nfsEntradas || 0) - p.nfsEntradas;
    const cfDiff = diffCfop(cfopMap(p.cfopEntradas), cfopMap(jul.cfopEntradas), "baifer");

    if (Math.abs(dTot) > TOL) {
      report.ok = false;
      report.diffs.push(`baifer: totalCompras pack=${p.totalCompras} ejs=${jul.totalCompras}`);
    }
    if (dNf !== 0) {
      report.ok = false;
      report.diffs.push(`baifer: nfsEntradas pack=${p.nfsEntradas} ejs=${jul.nfsEntradas}`);
    }
    if (cfDiff.length) {
      report.ok = false;
      report.diffs.push(...cfDiff);
    }

    report.baifer = {
      packTotal: p.totalCompras,
      ejsTotal: jul.totalCompras,
      packNfs: p.nfsEntradas,
      ejsNfs: jul.nfsEntradas,
      deltaTotal: dTot,
      cfopDiffs: cfDiff.length,
      identical: Math.abs(dTot) <= TOL && dNf === 0 && cfDiff.length === 0,
    };
  }
}

fs.writeFileSync(path.join(OUT, "diff-entradas-ejs.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  console.error("DIVERGE — precisa patch EJS");
  process.exit(2);
}
console.log("IDENTICO — sem patch necessário");
