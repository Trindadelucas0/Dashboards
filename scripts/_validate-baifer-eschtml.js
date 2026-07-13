const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = "c:/Users/trind/Desktop/dashboards";
const files = [
  path.join(root, "DASH/BAIFER DASHBOARD/baifer-app.js"),
  path.join(root, "Dashboards/src/views/baifer1trm.ejs"),
  path.join(root, "Dashboards/src/views/baifer2trm.ejs"),
];

let failed = 0;
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  const ok = {
    escHtml: /function escHtml\s*\(/.test(s),
    openModal: /function openSupplierModal\s*\(/.test(s),
    noPhantom: !/window\.toggleFornecedorPanel\s*=/.test(s),
    modalCssNone: !f.endsWith(".js") ? /\.modal-overlay\s*\{[^}]*display:\s*none/.test(s) : true,
  };
  console.log(path.basename(f), ok);
  Object.values(ok).forEach((v) => { if (!v) failed++; });
}

// Simulate collect + escHtml like openSupplierModal
const dataCode = fs.readFileSync(path.join(root, "DASH/BAIFER DASHBOARD/data/baifer-data.js"), "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(dataCode + "\nthis.D = DASHBOARD_DATA;", sandbox);
const D = sandbox.D;
function escHtml(v) {
  return String(v || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
const pack = D.unidades.consolidado.fiscalPorMes.porMes["06"];
const map = new Map();
(pack.cfopEntradas || []).forEach((cfop) => {
  (cfop.fornecedores || []).forEach((f) => {
    const key = (f.cnpj && String(f.cnpj).trim()) || f.nome;
    if (!key || map.has(key)) return;
    map.set(key, { nome: f.nome, cnpj: f.cnpj || "—", uf: f.uf || "—", key });
  });
});
const suppliers = Array.from(map.values());
const html = suppliers.slice(0, 3).map((s) => {
  const search = (s.nome + " " + s.cnpj + " " + s.uf).toLowerCase();
  return '<label data-search="' + escHtml(search) + '">' + escHtml(s.nome) + "</label>";
}).join("");
console.log("suppliers", suppliers.length, "sample html ok", html.includes("label"), "top", suppliers[0] && suppliers[0].nome);
console.log(failed ? "FAIL " + failed : "PASS");
process.exit(failed ? 1 : 0);
