/**
 * Validacao estatica BAIFER Finalidade / Por Fornecedor
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = "c:/Users/trind/Desktop/dashboards";
const files = [
  path.join(root, "DASH/BAIFER DASHBOARD/baifer-app.js"),
  path.join(root, "Dashboards/src/views/baifer1trm.ejs"),
  path.join(root, "Dashboards/src/views/baifer2trm.ejs"),
];

const requiredFns = [
  "function getCfopDados(",
  "function openSupplierModal(",
  "function printBySupplier(",
  "function exportSupplierPdf(",
  "function openDrilldown(",
  "function closeDrilldown(",
  "let activeDrilldownCfop",
];

const forbidden = [
  "window.toggleFornecedorPanel = toggleFornecedorPanel",
  "window.closeFornecedorPanel = closeFornecedorPanel",
  "if (isFornecedorPanelOpen()) renderFornecedorPanel()",
  "toggleFornecedorPanel(); return",
];

const requiredHtml = [
  'onclick="openSupplierModal()"',
  'id="supplierModal"',
  'id="includeDemaisFornecedores"',
  "printBySupplier()",
  "exportSupplierPdf()",
];

let failed = 0;

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  console.log("\n===", path.basename(file), "===");

  // Extract JS for ejs
  let js = src;
  if (file.endsWith(".ejs") || file.endsWith(".html")) {
    const scripts = [];
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (m[1].trim()) scripts.push(m[1]);
    }
    js = scripts.join("\n;\n");
    for (const h of requiredHtml) {
      if (!src.includes(h)) {
        console.log("FAIL html missing:", h);
        failed++;
      } else console.log("OK html:", h);
    }
  }

  for (const f of requiredFns) {
    if (!js.includes(f)) {
      console.log("FAIL missing:", f);
      failed++;
    } else console.log("OK", f);
  }
  for (const f of forbidden) {
    if (js.includes(f)) {
      console.log("FAIL forbidden still present:", f);
      failed++;
    } else console.log("OK absent:", f.slice(0, 50));
  }

  try {
    new vm.Script(js);
    console.log("OK parse");
  } catch (err) {
    console.log("FAIL parse:", err.message);
    failed++;
  }
}

console.log(failed ? "\nRESULT: FAILED " + failed : "\nRESULT: PASS");
process.exit(failed ? 1 : 0);
