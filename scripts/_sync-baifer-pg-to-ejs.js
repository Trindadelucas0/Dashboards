/**
 * Copia packs Baifer do Postgres (nova-versao) para baifer2trm.ejs / baifer1trm.ejs.
 * Uso: node scripts/_sync-baifer-pg-to-ejs.js
 * Preserva hasDre/dre/composicao do EJS se o pack do PG não tiver.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT_JSON = path.join(ROOT, "relatorios", "baifer-pg-sync", "packs.json");
const MONTH_LABEL = {
  "01": "Jan",
  "02": "Fev",
  "03": "Mar",
  "04": "Abr",
  "05": "Mai",
  "06": "Jun",
  "07": "Jul",
  "08": "Ago",
  "09": "Set",
  "10": "Out",
  "11": "Nov",
  "12": "Dez",
};
const MONTH_FULL = {
  "01": "Janeiro",
  "02": "Fevereiro",
  "03": "Março",
  "04": "Abril",
  "05": "Maio",
  "06": "Junho",
  "07": "Julho",
  "08": "Agosto",
  "09": "Setembro",
  "10": "Outubro",
  "11": "Novembro",
  "12": "Dezembro",
};

function findObjectLiteral(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) throw new Error("marker not found: " + marker);
  const start = html.indexOf("{", i);
  let depth = 0;
  let inStr = false;
  let quote = "";
  let esc = false;
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return { start, end: j + 1, text: html.slice(start, j + 1) };
    }
  }
  throw new Error("unclosed object for " + marker);
}

function replaceObject(html, marker, newObj) {
  const { start, end } = findObjectLiteral(html, marker);
  return html.slice(0, start) + JSON.stringify(newObj, null, 2) + html.slice(end);
}

function exportFromPostgres() {
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  const py = path.join(ROOT, "nova-versao", "backend", ".venv", "Scripts", "python.exe");
  const code = `
import json
from pathlib import Path
from app.db import SessionLocal
from app.models import FiscalMonth
out = Path(r"""${OUT_JSON.replace(/\\/g, "\\\\")}""")
db = SessionLocal()
try:
    rows = (
        db.query(FiscalMonth)
        .filter(FiscalMonth.company_id == "baifer", FiscalMonth.unidade == "matriz")
        .order_by(FiscalMonth.competencia)
        .all()
    )
    packs = {}
    for r in rows:
        if not r.competencia.startswith("2026-"):
            continue
        mm = r.competencia.split("-")[1]
        packs[mm] = r.pack or {}
    out.write_text(json.dumps(packs, ensure_ascii=False, indent=2), encoding="utf-8")
    print("exported", len(packs), "months")
finally:
    db.close()
`;
  const r = spawnSync(py, ["-c", code], {
    cwd: path.join(ROOT, "nova-versao", "backend"),
    env: { ...process.env, PYTHONPATH: "." },
    encoding: "utf8",
  });
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error("export postgres failed");
  }
  console.log(r.stdout.trim());
  return JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
}

function trimestreOf(mm) {
  const n = Number(mm);
  if (n <= 3) return "1° TRIM";
  if (n <= 6) return "2° TRIM";
  if (n <= 9) return "3° TRIM";
  return "4° TRIM";
}

function enrichPack(mm, pgPack, prev) {
  const prevSafe = prev && typeof prev === "object" ? prev : {};
  const pack = { ...prevSafe, ...pgPack };
  // impostos: prefer PG apuracao; keep other tax keys from prev if PG missing pieces
  if (pgPack.apuracao) {
    pack.apuracao = {
      ...(prevSafe.apuracao || {}),
      ...pgPack.apuracao,
      icms: { ...(prevSafe.apuracao?.icms || {}), ...(pgPack.apuracao.icms || {}) },
      pis: { ...(prevSafe.apuracao?.pis || {}), ...(pgPack.apuracao.pis || {}) },
      cofins: { ...(prevSafe.apuracao?.cofins || {}), ...(pgPack.apuracao.cofins || {}) },
    };
  }
  // preserve DRE if PG wiped it
  if (pgPack.hasDre == null && prevSafe.hasDre != null) pack.hasDre = prevSafe.hasDre;
  if (!pgPack.dre && prevSafe.dre) pack.dre = prevSafe.dre;
  if (!pgPack.composicao && prevSafe.composicao) pack.composicao = prevSafe.composicao;
  if (!pgPack.deducoes && prevSafe.deducoes) pack.deducoes = prevSafe.deducoes;
  if (!pgPack.margens && prevSafe.margens) pack.margens = prevSafe.margens;

  pack.competencia = mm;
  pack.competenciaFull = `2026-${mm}`;
  pack.competenciaLabel = `${MONTH_LABEL[mm]} / 2026`;
  pack.trimestre = trimestreOf(mm);
  pack.hasMovimentacao = true;
  return pack;
}

function ensureMeta(D, months) {
  D.meta = D.meta || {};
  D.meta.meses = [...months];
  D.meta.monthLabels = D.meta.monthLabels || {};
  D.meta.monthLabelsFull = D.meta.monthLabelsFull || {};
  for (const mm of months) {
    D.meta.monthLabels[mm] = MONTH_LABEL[mm];
    D.meta.monthLabelsFull[mm] = MONTH_FULL[mm];
  }
  D.meta.defaultMonth = months[months.length - 1];
  D.meta.periodoTotal = {
    label: `Total Jan – ${MONTH_LABEL[months[months.length - 1]]} / 2026`,
    meses: [...months],
  };
  if (months.includes("07")) {
    D.meta.trimestres = D.meta.trimestres || {};
    D.meta.trimestres.q3 = {
      id: "q3",
      label: "3° Trimestre 2026",
      pasta: "11-BAIFER 3° TRIM",
      meses: months.filter((m) => Number(m) >= 7 && Number(m) <= 9),
      mesesLabel: months
        .filter((m) => Number(m) >= 7 && Number(m) <= 9)
        .map((m) => MONTH_LABEL[m])
        .join(" / ") + " / 2026",
    };
  }
  D.competencia = `2026-${months[months.length - 1]}`;
  D.competenciaLabel = `${MONTH_LABEL[months[months.length - 1]]} / 2026`;
}

function applyPacksToFiscal(fp, packsByMm, months) {
  if (!fp) return;
  fp.meses = [...months];
  fp.porMes = fp.porMes || {};
  for (const mm of months) {
    fp.porMes[mm] = enrichPack(mm, packsByMm[mm], fp.porMes[mm]);
  }
}

function patchFile(file, packsByMm) {
  let html = fs.readFileSync(file, "utf8");
  const { text } = findObjectLiteral(html, "const DASHBOARD_DATA =");
  const D = JSON.parse(text);
  const months = Object.keys(packsByMm).sort();
  const before = {};
  const src =
    D.unidades?.consolidado?.fiscalPorMes?.porMes ||
    D.fiscalPorMes?.porMes ||
    {};
  for (const mm of months) {
    before[mm] = src[mm]?.totalCompras;
  }

  ensureMeta(D, months);

  if (D.fiscalPorMes) applyPacksToFiscal(D.fiscalPorMes, packsByMm, months);

  if (D.unidades) {
    for (const unit of Object.values(D.unidades)) {
      if (unit?.fiscalPorMes) applyPacksToFiscal(unit.fiscalPorMes, packsByMm, months);
    }
  }

  // series arrays used by some charts
  if (Array.isArray(D.months)) {
    D.months = months.map((m) => MONTH_LABEL[m]);
  }
  if (Array.isArray(D.vendas)) {
    D.vendas = months.map((m) => packsByMm[m].cfopSaidasTotal || 0);
  }
  if (Array.isArray(D.compras)) {
    D.compras = months.map((m) => packsByMm[m].totalCompras || 0);
  }

  html = replaceObject(html, "const DASHBOARD_DATA =", D);
  html = html.replace(/Jan[–-]Jun\/2026/g, "Jan–Jul/2026");
  html = html.replace(/Jan – Jun \/ 2026/g, "Jan – Jul / 2026");
  fs.writeFileSync(file, html, "utf8");

  const D2 = JSON.parse(findObjectLiteral(fs.readFileSync(file, "utf8"), "const DASHBOARD_DATA =").text);
  const after =
    D2.unidades?.consolidado?.fiscalPorMes?.porMes ||
    D2.fiscalPorMes?.porMes ||
    {};
  console.log("patched", path.basename(file));
  for (const mm of months) {
    const a = after[mm];
    console.log(
      `  ${mm}: compras ${before[mm]} -> ${a.totalCompras} | vendas ${a.cfopSaidasTotal} | icms ${a.apuracao?.icms?.aRecolher} | hasDre ${a.hasDre}`
    );
    if (Math.abs((a.totalCompras || 0) - (packsByMm[mm].totalCompras || 0)) > 0.02) {
      throw new Error(`fail ${path.basename(file)} mes ${mm} totalCompras`);
    }
  }
}

function main() {
  const packsByMm = exportFromPostgres();
  if (!packsByMm["01"] || !packsByMm["07"]) {
    throw new Error("esperado packs 01..07 no Postgres Baifer");
  }
  const targets = [
    path.join(ROOT, "src", "views", "baifer2trm.ejs"),
    path.join(ROOT, "src", "views", "baifer1trm.ejs"),
  ];
  for (const file of targets) {
    if (!fs.existsSync(file)) {
      console.warn("skip missing", file);
      continue;
    }
    patchFile(file, packsByMm);
  }
  // espelho DASH se existir
  const dashData = path.join(ROOT, "DASH", "BAIFER DASHBOARD", "data", "baifer-data.js");
  if (fs.existsSync(dashData)) {
    console.log("nota: baifer-data.js existe — EJS é a fonte do servidor :4243; não alterei o DASH neste passo");
  }
  console.log("SYNC OK ->", OUT_JSON);
}

main();
