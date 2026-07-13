/**
 * Auditoria completa: Por Fornecedor em todas as empresas.
 * Verifica HTML + JS e reporta gaps.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = "c:/Users/trind/Desktop/dashboards";
const views = path.join(root, "Dashboards/src/views");

const TARGETS = [
  { id: "unica", file: "UNICATINTAS.ejs" },
  { id: "baifer1", file: "baifer1trm.ejs" },
  { id: "baifer2", file: "baifer2trm.ejs" },
  { id: "du", file: "du-lanche.ejs" },
  { id: "egaplast", file: "egaplast.ejs" },
  { id: "loja", file: "loja-maquinas.ejs" },
  { id: "loja1trm", file: "lojamaquinas1trm.ejs" },
  { id: "schumacher", file: "schumacher.ejs" },
  { id: "jpg", file: "jpg.ejs" },
];

const REQUIRED = [
  { key: "btnPorFornecedor", test: (s) => /Por Fornecedor/i.test(s) && /openSupplierModal/i.test(s) },
  { key: "modal", test: (s) => /id=["']supplierModal["']/.test(s) },
  { key: "demais", test: (s) => /id=["']includeDemaisFornecedores["']/.test(s) },
  { key: "printBtn", test: (s) => /printBySupplier\s*\(/.test(s) && /Imprimir Selecionados/i.test(s) },
  { key: "pdfBtn", test: (s) => /exportSupplierPdf\s*\(/.test(s) && /Baixar PDF/i.test(s) },
  { key: "fnOpen", test: (s) => /function openSupplierModal|window\.openSupplierModal\s*=/.test(s) },
  { key: "fnPrint", test: (s) => /function printBySupplier|window\.printBySupplier\s*=/.test(s) },
  { key: "fnPdf", test: (s) => /function exportSupplierPdf|window\.exportSupplierPdf\s*=/.test(s) },
  { key: "supplierPrinting", test: (s) => /supplier-printing/.test(s) },
  { key: "printReportCss", test: (s) => /#print-supplier-report/.test(s) },
  { key: "noPhantomToggleExport", test: (s) => !/window\.toggleFornecedorPanel\s*=\s*toggleFornecedorPanel/.test(s) },
  { key: "noIsFornecedorCall", test: (s) => !/if\s*\(\s*isFornecedorPanelOpen\s*\(\s*\)\s*\)/.test(s) },
];

const JPG_EXTRA = [
  { key: "openFilial", test: (s) => /function openFilialSupplierModal/.test(s) },
  { key: "openActive", test: (s) => /function openSupplierModalActive|openSupplierModalActive\s*\(/.test(s) },
];

const results = [];
let failCount = 0;

for (const t of TARGETS) {
  const fp = path.join(views, t.file);
  const html = fs.readFileSync(fp, "utf8");
  const row = { id: t.id, file: t.file, ok: true, missing: [], parseErrors: [] };

  const checks = [...REQUIRED];
  if (t.id === "jpg") checks.push(...JPG_EXTRA);

  for (const c of checks) {
    if (!c.test(html)) {
      row.ok = false;
      row.missing.push(c.key);
      failCount++;
    }
  }

  // Parse inline scripts
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
      row.ok = false;
      row.parseErrors.push("#" + i + ": " + err.message);
      failCount++;
    }
  }
  row.scripts = i;
  results.push(row);
}

console.log("=== AUDITORIA POR FORNECEDOR ===\n");
for (const r of results) {
  const status = r.ok ? "PASS" : "FAIL";
  console.log(`[${status}] ${r.id.padEnd(12)} scripts=${r.scripts}`);
  if (r.missing.length) console.log("         missing:", r.missing.join(", "));
  if (r.parseErrors.length) console.log("         parse:", r.parseErrors.join(" | "));
}

const out = path.join(root, "Dashboards/relatorios/fornecedores/auditoria-por-fornecedor.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), failCount, results }, null, 2));
console.log("\nTotal gaps:", failCount);
console.log("Relatorio:", out);
process.exit(failCount ? 1 : 0);
