const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("c:/Users/trind/Desktop/dashboards/Dashboards/src/views/jpg.ejs", "utf8");
const m = html.match(/const JPG_DATA = (\{[\s\S]*?\n\});\s*\n/);
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext("const JPG_DATA = " + m[1] + "; this.J = JPG_DATA;", sandbox);
const J = sandbox.J;
const pack = J.fiscalPorMes.porMes["2026-05"];
const empresa = pack.empresa;

function collect(cfops) {
  const merged = {};
  (cfops || []).forEach((cf) => {
    (cf.parties || []).forEach((p) => {
      const key = (p.cnpj || "").trim() || p.nome;
      if (!merged[key]) merged[key] = { nome: p.nome, cnpj: p.cnpj || key, total: 0 };
      merged[key].total += p.total || 0;
    });
  });
  return Object.values(merged).sort((a, b) => b.total - a.total);
}

const suppliers = collect(empresa.cfop_entradas);
console.log("empresa suppliers", suppliers.length, "top", suppliers[0] && suppliers[0].nome, suppliers[0] && suppliers[0].total);

// simulate build with first supplier selected + demais
const selectedKeys = new Set([(suppliers[0].cnpj || "").trim() || suppliers[0].nome]);
let totalSel = 0;
empresa.cfop_entradas.forEach((cf) => {
  (cf.parties || []).forEach((f) => {
    const key = (f.cnpj || "").trim() || f.nome;
    if (selectedKeys.has(key)) totalSel += f.total || 0;
  });
});
let totalDemais = 0;
empresa.cfop_entradas.forEach((cf) => {
  (cf.parties || []).forEach((f) => {
    const key = (f.cnpj || "").trim() || f.nome;
    if (!selectedKeys.has(key)) totalDemais += f.total || 0;
  });
});
console.log("selected total", totalSel.toFixed(2));
console.log("demais total", totalDemais.toFixed(2));
console.log("sum", (totalSel + totalDemais).toFixed(2));
console.log("cfop sum", empresa.cfop_entradas.reduce((a, c) => a + c.total, 0).toFixed(2));

const checks = {
  openFilial: html.includes("function openFilialSupplierModal("),
  printingClass: html.includes("classList.add('supplier-printing')"),
  modalCss: html.includes(".modal-overlay { position:fixed") && html.includes("display:none; align-items:center"),
  buttonFilial: html.includes("openFilialSupplierModal('${key}')") || html.includes('openFilialSupplierModal(\'${key}\')'),
};
console.log("checks", checks);
