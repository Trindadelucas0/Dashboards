const fs = require("fs");
const path = require("path");
const vm = require("vm");

const file = "c:/Users/trind/Desktop/dashboards/Dashboards/src/views/jpg.ejs";
const html = fs.readFileSync(file, "utf8");
const m = html.match(/const JPG_DATA = (\{[\s\S]*?\n\});\s*\n/);
if (!m) throw new Error("JPG_DATA not found");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext("const JPG_DATA = " + m[1] + ";\nthis.J = JPG_DATA;", sandbox);
const J = sandbox.J;

function countParties(cfops) {
  let n = 0;
  (cfops || []).forEach((c) => { n += (c.parties || []).length; });
  return n;
}

console.log("meta", J.meta && { empresa: J.meta.empresa, periodo: J.meta.periodo });
console.log("top keys", Object.keys(J).slice(0, 20));

const porMes = (J.fiscalPorMes && J.fiscalPorMes.porMes) || {};
const months = Object.keys(porMes).sort();
console.log("months", months);
if (months.length) {
  const last = months[months.length - 1];
  const pack = porMes[last];
  console.log("last month", last, "pack keys", Object.keys(pack || {}));
  if (pack.empresa) {
    console.log("empresa cfops", (pack.empresa.cfop_entradas || []).length, "parties", countParties(pack.empresa.cfop_entradas));
  }
  if (pack.filiais) {
    for (const [k, v] of Object.entries(pack.filiais)) {
      console.log("filial", k, "cfops", (v.cfop_entradas || []).length, "parties", countParties(v.cfop_entradas));
    }
  }
}

// Simulate getScopeData patterns if present in code
const gs = html.match(/function getScopeData\([\s\S]*?\n\}/);
console.log("\ngetScopeData found", !!gs);
if (gs) console.log(gs[0].slice(0, 800));
