const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = "c:/Users/trind/Desktop/dashboards";
const dataPath = path.join(root, "DASH/BAIFER DASHBOARD/data/baifer-data.js");
const appPath = path.join(root, "DASH/BAIFER DASHBOARD/baifer-app.js");
const ejsPath = path.join(root, "Dashboards/src/views/baifer1trm.ejs");

const sandbox = {
  console,
  document: {
    querySelector() { return { textContent: "BAIFER" }; },
    getElementById(id) {
      if (!this._els[id]) {
        this._els[id] = {
          style: { display: "none" },
          value: "",
          innerHTML: "",
          checked: false,
          setAttribute() {},
          dataset: {},
        };
      }
      return this._els[id];
    },
    _els: {},
    querySelectorAll() { return []; },
    createElement() { return { style: {}, classList: { add() {}, remove() {} }, remove() {} }; },
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
  },
  window: {},
  Chart: { defaults: { color: "", borderColor: "", font: {} } },
  alert(msg) { sandbox._alerts.push(msg); },
  _alerts: [],
};

// Minimal Chart mock used at top of app
sandbox.Chart = function () {};
sandbox.Chart.defaults = { color: "", borderColor: "", font: { family: "", size: 12 } };

const dataCode = fs.readFileSync(dataPath, "utf8");
vm.createContext(sandbox);
vm.runInContext(dataCode, sandbox);

console.log("DASHBOARD_DATA?", !!sandbox.DASHBOARD_DATA);
console.log("unidades keys", sandbox.DASHBOARD_DATA && Object.keys(sandbox.DASHBOARD_DATA.unidades || {}));
console.log("competencia", sandbox.DASHBOARD_DATA && sandbox.DASHBOARD_DATA.competencia);
const u = sandbox.DASHBOARD_DATA.unidades.consolidado;
console.log("fiscalPorMes months", u && Object.keys((u.fiscalPorMes && u.fiscalPorMes.porMes) || {}));
const months = Object.keys(u.fiscalPorMes.porMes);
const sample = u.fiscalPorMes.porMes[months[months.length - 1]];
console.log("sample month", months[months.length - 1], "cfopEntradas", (sample.cfopEntradas || []).length);
let forn = 0;
(sample.cfopEntradas || []).forEach((c) => { forn += (c.fornecedores || []).length; });
console.log("fornecedores in sample", forn);

// Parse app in isolation is hard due to IIFE + Chart. Check ejs instead.
const html = fs.readFileSync(ejsPath, "utf8");
const checks = {
  phantomToggleExport: /window\.toggleFornecedorPanel\s*=/.test(html),
  isFornecedorCall: /isFornecedorPanelOpen\(\)/.test(html),
  openSupplierModal: /function openSupplierModal\(/.test(html),
  windowOpen: /window\.openSupplierModal\s*=\s*openSupplierModal/.test(html),
  getCfopDados: /function getCfopDados\(/.test(html),
  activeDrill: /let activeDrilldownCfop/.test(html),
  modalHtml: /id="supplierModal"/.test(html),
  btnOnclick: /onclick="openSupplierModal\(\)"/.test(html),
  modalDisplayFlexDefault: /\.modal-overlay\s*\{[^}]*display:\s*flex/.test(html),
};
console.log("ejs checks", checks);

// Count getCfopDados
console.log("getCfopDados defs", (html.match(/function getCfopDados\(/g) || []).length);

// Simulate CSS conflict: class flex + inline none — JS sets flex
console.log("modal inline none in html", /id="supplierModal" style="display:none;"/.test(html));
