/**
 * Validacao final completa Por Fornecedor — nada faltando.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = "c:/Users/trind/Desktop/dashboards";
const viewsDir = path.join(root, "Dashboards/src/views");

const TARGETS = [
  { id: "unica", file: "UNICATINTAS.ejs", route: "/auth/UNICATINTAS" },
  { id: "baifer1", file: "baifer1trm.ejs", route: "/auth/baifer1trm" },
  { id: "baifer2", file: "baifer2trm.ejs", route: "/auth/baifer2trm" },
  { id: "du", file: "du-lanche.ejs", route: "/auth/du-lanche" },
  { id: "egaplast", file: "egaplast.ejs", route: "/auth/egaplast" },
  { id: "loja", file: "loja-maquinas.ejs", route: "/auth/loja-maquinas" },
  { id: "loja1trm", file: "lojamaquinas1trm.ejs", route: "/auth/lojamaquinas1trm" },
  { id: "schumacher", file: "schumacher.ejs", route: "/auth/schumacher" },
  { id: "jpg", file: "jpg.ejs", route: "/auth/jpg" },
];

function hasFn(html, name) {
  return new RegExp("function\\s+" + name + "\\s*\\(").test(html) ||
    new RegExp("window\\." + name + "\\s*=").test(html);
}

function checkView(t) {
  const html = fs.readFileSync(path.join(viewsDir, t.file), "utf8");
  const gaps = [];

  const need = [
    ["btnTexto", /Por Fornecedor/i.test(html)],
    ["finBar", /id=["']fin-supplier-bar["']/.test(html)],
    ["modal", /id=["']supplierModal["']/.test(html)],
    ["demais", /id=["']includeDemaisFornecedores["']/.test(html)],
    ["imprimir", /printBySupplier\s*\(/.test(html) && /Imprimir Selecionados/i.test(html)],
    ["baixarPdf", /exportSupplierPdf\s*\(/.test(html) && /Baixar PDF/i.test(html)],
    ["fnOpen", t.id === "jpg" ? hasFn(html, "openSupplierModal") || hasFn(html, "openSupplierModalActive") : hasFn(html, "openSupplierModal")],
    ["fnPrint", hasFn(html, "printBySupplier")],
    ["fnPdf", hasFn(html, "exportSupplierPdf")],
    ["supplierPrinting", /classList\.add\(\s*['\"]supplier-printing['\"]\s*\)/.test(html) || /supplier-printing/.test(html)],
    ["printCss", /#print-supplier-report/.test(html)],
  ];

  if (t.id === "jpg") {
    need.push(["openFilial", hasFn(html, "openFilialSupplierModal")]);
  }

  // Phantom export only bad if function missing
  if (/window\.toggleFornecedorPanel\s*=\s*toggleFornecedorPanel/.test(html) && !hasFn(html, "toggleFornecedorPanel")) {
    gaps.push("phantomToggleExport");
  }
  if (/if\s*\(\s*isFornecedorPanelOpen\s*\(\s*\)\s*\)/.test(html) && !hasFn(html, "isFornecedorPanelOpen")) {
    gaps.push("brokenIsFornecedorCall");
  }
  if (html.includes("escHtml(") && !hasFn(html, "escHtml") && !/const esc\s*=/.test(html) && !/function\s*\([^)]*\)\s*\{[^}]*escHtml/.test(html)) {
    // escHtml used but no function — allow inline const esc = 
    if (!/const esc\s*=\s*\(/.test(html) && !/const esc\s*=\s*v\s*=>/.test(html) && !/esc\s*=\s*\(v\)\s*=>/.test(html) && !/esc\s*=\s*v\s*=>/.test(html)) {
      gaps.push("missingEscHtml");
    }
  }

  for (const [k, ok] of need) {
    if (!ok) gaps.push(k);
  }

  // Parse scripts
  const parseErrors = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let i = 0;
  while ((m = re.exec(html)) !== null) {
    const code = m[1].trim();
    if (!code) continue;
    i++;
    try {
      new vm.Script(code, { filename: t.file + "#" + i });
    } catch (err) {
      parseErrors.push(err.message);
      gaps.push("parse#" + i);
    }
  }

  return { ...t, gaps, parseErrors, scripts: i, ok: gaps.length === 0 };
}

const results = TARGETS.map(checkView);
let fails = 0;
console.log("=== VALIDACAO FINAL POR FORNECEDOR ===\n");
for (const r of results) {
  console.log(`[${r.ok ? "PASS" : "FAIL"}] ${r.id.padEnd(12)} ${r.route}`);
  if (!r.ok) {
    fails += r.gaps.length;
    console.log("       gaps:", r.gaps.join(", "));
  }
}

const outDir = path.join(root, "Dashboards/relatorios/fornecedores");
fs.mkdirSync(outDir, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  allOk: results.every((r) => r.ok),
  fails,
  results,
};
fs.writeFileSync(path.join(outDir, "validacao-por-fornecedor.json"), JSON.stringify(report, null, 2));

console.log("\nALL OK?", report.allOk);
console.log("Arquivo:", path.join(outDir, "validacao-por-fornecedor.json"));
process.exit(report.allOk ? 0 : 1);
