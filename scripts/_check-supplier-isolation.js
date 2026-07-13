/**
 * Cruza fornecedores entre pacotes para detectar contaminação entre empresas.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "..");

function loadDashboard(file) {
  const code = fs.readFileSync(file, "utf8");
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(
    code + "\n;this.__R = (typeof DASHBOARD_DATA !== 'undefined') ? DASHBOARD_DATA : null;",
    sandbox
  );
  return sandbox.__R;
}

function collectFromCfops(cfops, bag) {
  for (const c of cfops || []) {
    for (const f of c.fornecedores || c.parties || []) {
      if (!f) continue;
      const cnpj = String(f.cnpj || "").replace(/\D/g, "");
      const nome = String(f.nome || "").trim().toUpperCase();
      if (cnpj && cnpj.length >= 11) bag.cnpjs.add(cnpj);
      if (nome) bag.nomes.add(nome);
    }
  }
}

function collectUnica(data) {
  const bag = { cnpjs: new Set(), nomes: new Set(), empresa: data.empresa?.nome || "UNICA" };
  const porMes = data.fiscalPorMes || {};
  for (const k of Object.keys(porMes)) {
    const pack = porMes[k] || {};
    collectFromCfops(pack.cfopDados || pack.cfopEntradas || [], bag);
  }
  return bag;
}

function collectDash(data) {
  const bag = { cnpjs: new Set(), nomes: new Set(), empresa: data.empresa?.nome || "?" };
  const units = [];
  if (data.fiscal) units.push(data.fiscal);
  if (data.unidades) Object.values(data.unidades).forEach((u) => units.push(u));
  for (const u of units) {
    if (!u) continue;
    const porMes = u.porMes || {};
    for (const pack of Object.values(porMes)) {
      collectFromCfops(pack?.cfopEntradas || [], bag);
    }
    if (u.total) collectFromCfops(u.total.cfopEntradas || [], bag);
  }
  // schumacher-like flat
  if (data.cfopEntradas) collectFromCfops(data.cfopEntradas, bag);
  return bag;
}

function collectLoja(ejsPath) {
  const html = fs.readFileSync(ejsPath, "utf8");
  const empMatch = html.match(/const EMPRESA = (\{[\s\S]*?\n  \});/);
  const fiscalMatch = html.match(/const FISCAL_POR_MES = (\{[\s\S]*?\n  \});/);
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(
    "const EMPRESA = " + empMatch[1] + ";\nconst FISCAL_POR_MES = " + fiscalMatch[1] + ";\nthis.__R={EMPRESA,FISCAL_POR_MES};",
    sandbox
  );
  const bag = {
    cnpjs: new Set(),
    nomes: new Set(),
    empresa: sandbox.__R.EMPRESA.nome || "LOJA",
  };
  for (const pack of Object.values(sandbox.__R.FISCAL_POR_MES)) {
    collectFromCfops(pack.cfopEntradas || [], bag);
  }
  return bag;
}

function collectJpg(ejsPath) {
  const html = fs.readFileSync(ejsPath, "utf8");
  const m = html.match(/const JPG_DATA = (\{[\s\S]*?\n\});\s*\n/);
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext("const JPG_DATA = " + m[1] + ";\nthis.__R = JPG_DATA;", sandbox);
  const J = sandbox.__R;
  const bag = {
    cnpjs: new Set(),
    nomes: new Set(),
    empresa: J.meta?.empresa || "JPG",
  };
  const porMes = J.fiscalPorMes?.porMes || {};
  for (const pack of Object.values(porMes)) {
    if (pack.empresa) collectFromCfops(pack.empresa.cfop_entradas || [], bag);
    if (pack.filiais) {
      for (const f of Object.values(pack.filiais)) {
        collectFromCfops(f.cfop_entradas || [], bag);
      }
    }
  }
  return bag;
}

const packs = {
  unica: collectUnica(loadDashboard(path.join(root, "UNICA 10/data/unica-data.js"))),
  baifer: collectDash(loadDashboard(path.join(root, "DASH/BAIFER DASHBOARD/data/baifer-data.js"))),
  du: collectDash(loadDashboard(path.join(root, "DASH/du lanches/data/du-lanche-data.js"))),
  egaplast: collectDash(loadDashboard(path.join(root, "egaplast att com cfop/data/egaplast-data.js"))),
  schumacher: collectDash(loadDashboard(path.join(root, "DASH/shumacher/data/schumacher-data.js"))),
  loja: collectLoja(path.join(root, "Dashboards/src/views/loja-maquinas.ejs")),
  jpg: collectJpg(path.join(root, "Dashboards/src/views/jpg.ejs")),
};

const ids = Object.keys(packs);
console.log("=== Contagem por empresa ===");
for (const id of ids) {
  const p = packs[id];
  console.log(
    id.padEnd(12),
    "|",
    String(p.empresa).slice(0, 42).padEnd(42),
    "| CNPJs:",
    p.cnpjs.size,
    "| nomes:",
    p.nomes.size
  );
}

console.log("\n=== Intersecao de CNPJs entre empresas ===");
let leaks = 0;
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i];
    const b = ids[j];
    const inter = [...packs[a].cnpjs].filter((c) => packs[b].cnpjs.has(c));
    if (inter.length) {
      leaks += inter.length;
      console.log(a, "<->", b, ":", inter.length, "CNPJs em comum. Ex:", inter.slice(0, 5).join(", "));
    } else {
      console.log(a, "<->", b, ": 0 em comum");
    }
  }
}

console.log("\n=== Sample distintivo (1o CNPJ de cada, se existe em outra) ===");
for (const id of ids) {
  const sample = [...packs[id].cnpjs][0];
  if (!sample) {
    console.log(id, ": sem CNPJ de fornecedor no pacote");
    continue;
  }
  const others = ids.filter((o) => o !== id && packs[o].cnpjs.has(sample));
  console.log(id, sample, others.length ? "TAMBEM EM " + others.join(",") : "somente nesta empresa");
}

console.log("\nTOTAL CNPJs compartilhados entre pares:", leaks);
