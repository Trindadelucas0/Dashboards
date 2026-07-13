const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..", "..");

function load(file) {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(file, "utf8") +
      "\n;this.__R=(typeof DASHBOARD_DATA!=='undefined')?DASHBOARD_DATA:null;",
    sandbox
  );
  return sandbox.__R;
}

function findCnpj(data, target, paths = []) {
  const hits = [];
  const walk = (node, trail) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((x, i) => walk(x, trail.concat(i)));
      return;
    }
    const cnpj = String(node.cnpj || "").replace(/\D/g, "");
    if (cnpj === target && node.nome) {
      hits.push({ nome: node.nome, total: node.total, trail: trail.slice(0, 6).join(".") });
    }
    for (const [k, v] of Object.entries(node)) walk(v, trail.concat(k));
  };
  walk(data, paths);
  return hits;
}

const shared = ["40085602000103", "59064766000182"];
const packs = {
  unica: load(path.join(root, "UNICA 10/data/unica-data.js")),
  baifer: load(path.join(root, "DASH/BAIFER DASHBOARD/data/baifer-data.js")),
};

for (const cnpj of shared) {
  console.log("\nCNPJ", cnpj);
  for (const [id, data] of Object.entries(packs)) {
    const hits = findCnpj(data, cnpj);
    console.log(" ", id, "empresa=", data.empresa?.nome);
    console.log("   ocorrencias=", hits.length, hits[0] || "(nao encontrado neste pack)");
  }
}

console.log("\nArquivos de dados distintos:");
console.log(" unica   -> UNICA 10/data/unica-data.js");
console.log(" baifer  -> DASH/BAIFER DASHBOARD/data/baifer-data.js");
console.log(" du      -> DASH/du lanches/data/du-lanche-data.js");
console.log(" egaplast-> egaplast att com cfop/data/egaplast-data.js");
console.log(" schuma  -> DASH/shumacher/data/schumacher-data.js");
console.log(" loja    -> embutido em loja-maquinas.ejs (EMPRESA+FISCAL_POR_MES)");
console.log(" jpg     -> embutido em jpg.ejs (JPG_DATA)");
