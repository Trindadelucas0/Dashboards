const fs = require("fs");
const path = require("path");

function findObjectLiteral(html, marker) {
  const i = html.indexOf(marker);
  const start = html.indexOf("{", i);
  let depth = 0, inStr = false, quote = "", esc = false;
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; quote = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return { start, end: j + 1, text: html.slice(start, j + 1) };
    }
  }
  throw new Error("unclosed");
}

const file = path.join(__dirname, "..", "src", "views", "egaplast.ejs");
let html = fs.readFileSync(file, "utf8");
const { start, end, text } = findObjectLiteral(html, "const DASHBOARD_DATA =");
const D = JSON.parse(text);
D.meta = D.meta || {};
D.meta.trimestres = D.meta.trimestres || {};
if (!D.meta.trimestres.q3) {
  D.meta.trimestres.q3 = {
    id: "q3",
    label: "3° Trimestre 2026",
    pasta: "GRUPO EGAPLAST 3° TRIM",
    meses: ["07"],
    mesesLabel: "Jul / 2026",
  };
}
if (!D.meta.trimestres.q1) {
  D.meta.trimestres.q1 = { id: "q1", label: "1° Trimestre 2026", meses: ["01", "02", "03"], mesesLabel: "Jan – Mar / 2026" };
}
if (!D.meta.trimestres.q2) {
  D.meta.trimestres.q2 = { id: "q2", label: "2° Trimestre 2026", meses: ["04", "05", "06"], mesesLabel: "Abr – Jun / 2026" };
}
html = html.slice(0, start) + JSON.stringify(D, null, 2) + html.slice(end);

// Q3_MESES constant
if (!html.includes("const Q3_MESES")) {
  html = html.replace(
    "const Q2_MESES = (TRIMESTRES.q2 && TRIMESTRES.q2.meses) || ['04', '05', '06'];",
    "const Q2_MESES = (TRIMESTRES.q2 && TRIMESTRES.q2.meses) || ['04', '05', '06'];\n  const Q3_MESES = (TRIMESTRES.q3 && TRIMESTRES.q3.meses) || ['07'];"
  );
}

html = html.replace(
  /if \(state\.fiscalMode === 'q1' \|\| state\.fiscalMode === 'q2'\) return buildFiscalTrimPack\(state\.fiscalMode\);/g,
  "if (state.fiscalMode === 'q1' || state.fiscalMode === 'q2' || state.fiscalMode === 'q3') return buildFiscalTrimPack(state.fiscalMode);"
);
html = html.replace(
  /ms\.value = \['total', 'q1', 'q2'\]\.includes\(state\.fiscalMode\) \? state\.fiscalMode : state\.month;/g,
  "ms.value = ['total', 'q1', 'q2', 'q3'].includes(state.fiscalMode) ? state.fiscalMode : state.month;"
);
html = html.replace(
  /else if \(val === 'q1' \|\| val === 'q2'\) state\.fiscalMode = val;/g,
  "else if (val === 'q1' || val === 'q2' || val === 'q3') state.fiscalMode = val;"
);
html = html.replace(
  /if \(periodKey === 'q1' \|\| periodKey === 'q2'\) return buildFiscalTrimPack\(periodKey\);/g,
  "if (periodKey === 'q1' || periodKey === 'q2' || periodKey === 'q3') return buildFiscalTrimPack(periodKey);"
);

fs.writeFileSync(file, html, "utf8");
console.log("egaplast meta trimestres + q3 hooks patched");
