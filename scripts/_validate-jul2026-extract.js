/**
 * Valida packs Jul/2026 contra Total Geral Excel e consistencia CFOP.
 */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "relatorios", "jul2026");
const TOL = 0.02;

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log("OK:", msg);
}

function sum(arr, fn) {
  return Math.round(arr.reduce((a, x) => a + (fn(x) || 0), 0) * 100) / 100;
}

function load(empresa) {
  return JSON.parse(fs.readFileSync(path.join(OUT, `${empresa}-07.json`), "utf8"));
}

const empresas = ["unica", "egaplast", "loja", "baifer"];

for (const e of empresas) {
  const data = load(e);
  const m = data.meta;
  const p = data.pack;

  if (Math.abs(m.deltaEntradas) > TOL) {
    fail(`${e}: delta entradas ${m.deltaEntradas} (soma=${m.somaEntradas} excel=${m.totalGeralEntradasExcel})`);
  } else ok(`${e}: entradas bate Total Geral (${m.somaEntradas})`);

  if (Math.abs(m.deltaSaidas) > TOL) {
    fail(`${e}: delta saidas ${m.deltaSaidas} (soma=${m.somaSaidas} excel=${m.totalGeralSaidasExcel})`);
  } else ok(`${e}: saidas bate Total Geral (${m.somaSaidas})`);

  if (!m.periodEntradas || !String(m.periodEntradas).includes("07/2026")) {
    fail(`${e}: periodo entradas invalido: ${m.periodEntradas}`);
  } else ok(`${e}: periodo entradas Jul/2026`);

  if (!m.periodSaidas || !String(m.periodSaidas).includes("07/2026")) {
    fail(`${e}: periodo saidas invalido: ${m.periodSaidas}`);
  } else ok(`${e}: periodo saidas Jul/2026`);

  if (!(m.nfsEntradas > 0) || !(m.nfsSaidas > 0)) {
    fail(`${e}: NFs zeradas E=${m.nfsEntradas} S=${m.nfsSaidas}`);
  } else ok(`${e}: NFs E=${m.nfsEntradas} S=${m.nfsSaidas}`);

  const cfopEnt = p.cfopDados || p.cfopEntradas || [];
  const cfopSai = p.cfopSaidas || [];
  const sumEnt = sum(cfopEnt, (c) => c.total ?? c.contabil);
  const sumSai = sum(cfopSai, (c) => c.total ?? c.contabil);

  if (Math.abs(sumEnt - m.somaEntradas) > TOL) fail(`${e}: soma CFOP entradas ${sumEnt} != ${m.somaEntradas}`);
  else ok(`${e}: soma CFOP entradas`);

  if (Math.abs(sumSai - m.somaSaidas) > TOL) fail(`${e}: soma CFOP saidas ${sumSai} != ${m.somaSaidas}`);
  else ok(`${e}: soma CFOP saidas`);

  for (const c of cfopEnt) {
    if (!c.cfop) fail(`${e}: CFOP entradas sem codigo`);
    if ((c.total ?? c.contabil) < 0) fail(`${e}: CFOP ${c.cfop} negativo`);
    const parties = c.fornecedores || [];
    if (parties.length) {
      const sp = sum(parties, (x) => x.total);
      if (Math.abs(sp - (c.total ?? c.contabil)) > TOL) {
        fail(`${e}: CFOP ${c.cfop} fornecedores ${sp} != ${c.total}`);
      }
    }
  }
  ok(`${e}: consistencia fornecedores x CFOP`);

  if (Math.abs((p.totalCompras || 0) - m.somaEntradas) > TOL) fail(`${e}: pack.totalCompras`);
  if (Math.abs((p.cfopSaidasTotal || 0) - m.somaSaidas) > TOL) fail(`${e}: pack.cfopSaidasTotal`);
  ok(`${e}: pack totals`);
}

if (process.exitCode) {
  console.error("VALIDACAO EXTRACT FALHOU");
  process.exit(1);
}
console.log("VALIDACAO EXTRACT OK");
