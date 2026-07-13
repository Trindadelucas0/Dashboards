const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("c:/Users/trind/Desktop/dashboards/Dashboards/src/views/loja-maquinas.ejs", "utf8");
const emp = html.match(/const EMPRESA = (\{[\s\S]*?\n  \});/);
const fiscal = html.match(/const FISCAL_POR_MES = (\{[\s\S]*?\n  \});/);
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext("const EMPRESA=" + emp[1] + ";\nconst FISCAL_POR_MES=" + fiscal[1] + ";\nthis.E=EMPRESA;this.F=FISCAL_POR_MES;", sandbox);

const keys = Object.keys(sandbox.F).sort();
console.log("months", keys);
for (const k of keys) {
  const pack = sandbox.F[k];
  const cfops = pack.cfopEntradas || [];
  let forn = 0, withCnpj = 0, noCnpj = 0;
  cfops.forEach((c) => {
    (c.fornecedores || []).forEach((f) => {
      forn++;
      if (f.cnpj) withCnpj++; else noCnpj++;
    });
  });
  console.log(k, pack.competenciaLabel || "", "cfops", cfops.length, "forn lines", forn, "noCnpj", noCnpj);
}

// Check if openSupplierModal would throw on undefined cnpj
const last = sandbox.F[keys[keys.length - 1]];
const sample = [];
(last.cfopEntradas || []).forEach((c) => (c.fornecedores || []).forEach((f) => {
  if (!f.cnpj) sample.push(f.nome);
}));
console.log("sample no cnpj", sample.slice(0, 5));

const checks = {
  btn: html.includes('Por Fornecedor'),
  modal: html.includes('id="supplierModal"'),
  openFn: html.includes('function openSupplierModal'),
  windowOpen: html.includes('window.openSupplierModal'),
  printClass: html.includes("supplier-printing"),
};
console.log("checks", checks);
