/**
 * Diagnostico BAIFER: por que openSupplierModal nao abre.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ejs = path.join("c:/Users/trind/Desktop/dashboards/Dashboards/src/views/baifer1trm.ejs");
const html = fs.readFileSync(ejs, "utf8");

// 1) Count duplicates
console.log("escHtml defs", (html.match(/function escHtml\s*\(/g) || []).length);
console.log("getCfopDados defs", (html.match(/function getCfopDados\s*\(/g) || []).length);
console.log("openSupplierModal defs", (html.match(/function openSupplierModal\s*\(/g) || []).length);
console.log("window.openSupplierModal", /window\.openSupplierModal\s*=/.test(html));
console.log("phantom toggle", /window\.toggleFornecedorPanel\s*=\s*toggleFornecedorPanel/.test(html));
console.log("isFornecedor call", /isFornecedorPanelOpen\s*\(\s*\)/.test(html));

// 2) Parse each script
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0;
while ((m = re.exec(html)) !== null) {
  const code = m[1].trim();
  if (!code) continue;
  i++;
  try {
    new vm.Script(code, { filename: "baifer#" + i });
    console.log("PARSE OK #" + i, "len", code.length);
  } catch (e) {
    console.log("PARSE FAIL #" + i, e.message);
  }
}

// 3) Extract HTML structure around finalidade
const idx = html.indexOf('id="tab-finalidade"');
console.log("\nHTML snippet:\n", html.slice(idx, idx + 1200));

// 4) Check modal HTML exists and supplierList
console.log("\nmodal", /id="supplierModal"/.test(html));
console.log("supplierList", /id="supplierList"/.test(html));
console.log("supplierReportPeriod", /id="supplierReportPeriod"/.test(html));

// 5) Simulate runtime of modal open helpers with mock DOM + real data
const dataFile = "c:/Users/trind/Desktop/dashboards/DASH/BAIFER DASHBOARD/data/baifer-data.js";
const appFile = "c:/Users/trind/Desktop/dashboards/DASH/BAIFER DASHBOARD/baifer-app.js";

const els = {};
function el(id) {
  if (!els[id]) {
    els[id] = {
      id,
      style: { display: "none" },
      value: "",
      innerHTML: "",
      checked: true,
      dataset: {},
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k]; },
      querySelectorAll() { return []; },
      textContent: "",
    };
  }
  return els[id];
}

const sandbox = {
  console,
  alert(msg) { sandbox._alerts.push(String(msg)); },
  _alerts: [],
  document: {
    getElementById: (id) => el(id),
    querySelector: (sel) => {
      if (sel === ".logo-text .company") return { textContent: "BAIFER" };
      return null;
    },
    querySelectorAll: () => [],
    createElement: () => el("x" + Math.random()),
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
    addEventListener() {},
  },
  window: {
    addEventListener() {},
    removeEventListener() {},
    jspdf: null,
  },
  Chart: function () {},
};
sandbox.Chart.defaults = { color: "", borderColor: "", font: {} };
sandbox.window.document = sandbox.document;

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(dataFile, "utf8") + "\nthis.DASHBOARD_DATA = DASHBOARD_DATA;", sandbox);

try {
  vm.runInContext(fs.readFileSync(appFile, "utf8"), sandbox);
  console.log("\nAPP loaded. openSupplierModal type:", typeof sandbox.window.openSupplierModal);
  if (typeof sandbox.window.openSupplierModal === "function") {
    sandbox.window.openSupplierModal();
    console.log("modal display after open:", els.supplierModal && els.supplierModal.style.display);
    console.log("list html len:", els.supplierList && String(els.supplierList.innerHTML).length);
    console.log("alerts:", sandbox._alerts);
    console.log("period options html len:", els.supplierReportPeriod && String(els.supplierReportPeriod.innerHTML).length);
  } else {
    console.log("OPEN NOT ON WINDOW. Keys with Supplier:", Object.keys(sandbox.window).filter((k) => /supplier|Supplier|Fornecedor|fornecedor/i.test(k)));
  }
} catch (e) {
  console.log("\nAPP RUNTIME ERROR:", e.message);
  console.log(e.stack.split("\n").slice(0, 8).join("\n"));
}
