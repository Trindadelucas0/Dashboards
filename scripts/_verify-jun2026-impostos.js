const fs = require("fs");
const vm = require("vm");

function load(p) {
  const c = {};
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(p, "utf8") + "\n;this.D = DASHBOARD_DATA;", c);
  return c.D;
}

const loja = JSON.parse(fs.readFileSync("c:/Users/trind/Desktop/dashboards/lojja/data/loja-2026.json", "utf8"));
const j = loja.fiscal["2026-06"];
console.log("LOJA", j.icmsRecolher, j.pisRecolher, j.cofinsRecolher, j.deducoes);

const ega = load("c:/Users/trind/Desktop/dashboards/egaplast att com cfop/data/egaplast-data.js");
const e06 = ega.unidades.consolidado.fiscalPorMes.porMes["06"];
console.log("EGA root", ega.competencia, ega.apuracao.icms.aRecolher, ega.apuracao.pis.aRecolher, ega.apuracao.cofins.aRecolher);
console.log("EGA 06", e06.apuracao.icms.aRecolher, e06.apuracao.pis.aRecolher, e06.apuracao.cofins.aRecolher);

const uni = load("c:/Users/trind/Desktop/dashboards/UNICA 10/data/unica-data.js");
console.log("UNICA 06", JSON.stringify(uni.fiscalPorMes["06"].apuracao));

const bai = load("c:/Users/trind/Desktop/dashboards/DASH/BAIFER DASHBOARD/data/baifer-data.js");
const b06 = bai.unidades.consolidado.fiscalPorMes.porMes["06"];
console.log("BAI root", bai.apuracao.icms.aRecolher);
console.log("BAI 06", b06.apuracao.icms.aRecolher, b06.impostosTabela[0].recolher, b06.composicao[0].valor);

// tax balance check
function check(name, t) {
  const deb = (t.debitoSaidas || 0) + (t.outrosDebitos || 0);
  const cred = (t.creditoEntradas || 0) + (t.outrosCreditos || 0);
  const diff = Math.abs(deb - cred - (t.aRecolher || 0));
  console.log(name, "balanceDiff", diff.toFixed(2), "ok", diff <= 2);
}
check("EGA icms", e06.apuracao.icms);
check("BAI icms", b06.apuracao.icms);
