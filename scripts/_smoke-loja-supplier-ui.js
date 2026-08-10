const fs = require("fs");
const vm = require("vm");
const path = require("path");

const file = path.join(__dirname, "..", "src", "views", "loja-maquinas.ejs");
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
    new vm.Script(t, { filename: "loja#" + i });
  } catch (e) {
    fails++;
    console.error("SYNTAX", i, e.message);
  }
}

function findObjectLiteral(src, marker) {
  const idx = src.indexOf(marker);
  if (idx < 0) throw new Error("marker not found: " + marker);
  const start = src.indexOf("{", idx);
  let depth = 0;
  let inStr = false;
  let quote = "";
  let esc = false;
  for (let j = start; j < src.length; j++) {
    const ch = src[j];
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
      if (depth === 0) return JSON.parse(src.slice(start, j + 1));
    }
  }
  throw new Error("unclosed");
}

const F = findObjectLiteral(html, "const FISCAL_POR_MES =");
const jul = F["2026-07"];
const set = new Set();
(jul.cfopEntradas || []).forEach((c) => {
  (c.fornecedores || []).forEach((f) => {
    set.add((f.cnpj && String(f.cnpj).trim()) || f.nome);
  });
});

console.log(
  JSON.stringify(
    {
      scripts: i,
      fails,
      hasPeriodSel: html.includes('id="supplierReportPeriod"'),
      hasOnChange: html.includes("onSupplierReportPeriodChange"),
      hasPackFn: html.includes("getPackForSupplierReport"),
      hasBtn: html.includes("btn-por-fornecedor"),
      julCompras: jul.totalCompras,
      julFornecedoresUnicos: set.size,
    },
    null,
    2
  )
);
process.exit(fails ? 1 : 0);
