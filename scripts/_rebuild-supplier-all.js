const path = require("path");
const fs = require("fs");
const vm = require("vm");

const dashboardsRoot = path.join(__dirname, "..");
const dashRoot = path.join(dashboardsRoot, "..", "DASH");
const workspaceRoot = path.join(dashboardsRoot, "..");
const viewsDir = path.join(dashboardsRoot, "src", "views");

const BACK_BUTTON =
  '<a href="/auth/dashboard-selector" class="btn-export btn-back-hub"><i class="fas fa-arrow-left"></i> Voltar</a>';
const EXTRA_CSS = `
    .btn-back-hub { display:inline-flex; align-items:center; gap:6px; text-decoration:none; }
`;

const TARGETS = [
  {
    id: "unicatintas",
    html: path.join(workspaceRoot, "UNICA 10", "UNICATINTAS.html"),
    outputs: ["UNICATINTAS.ejs"],
  },
  {
    id: "loja-maquinas",
    html: path.join(workspaceRoot, "lojja", "LOJA-MAQUINAS.html"),
    outputs: ["loja-maquinas.ejs", "lojamaquinas1trm.ejs"],
  },
  {
    id: "baifer",
    html: path.join(dashRoot, "BAIFER DASHBOARD", "baifer.html"),
    outputs: ["baifer1trm.ejs", "baifer2trm.ejs"],
  },
  {
    id: "egaplast",
    html: path.join(workspaceRoot, "egaplast att com cfop", "EGAPLAST.html"),
    outputs: ["egaplast.ejs"],
  },
  {
    id: "du-lanche",
    html: path.join(dashRoot, "du lanches", "du-lanche.html"),
    outputs: ["du-lanche.ejs"],
  },
];

function isRemoteSrc(src) {
  return /^https?:\/\//i.test(src);
}

function inlineLocalScripts(html, htmlPath) {
  const htmlDir = path.dirname(htmlPath);
  return html.replace(
    /<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    (match, src) => {
      if (isRemoteSrc(src)) return match;
      const clean = src.split("?")[0].split("#")[0];
      const filePath = path.join(htmlDir, clean);
      if (!fs.existsSync(filePath)) throw new Error("Script nao encontrado: " + filePath);
      return `<script>\n${fs.readFileSync(filePath, "utf8")}\n</script>`;
    }
  );
}

function patchBackButton(html) {
  if (html.includes("btn-back-hub")) return html;
  return html.replace(
    /<div class="header-actions">/,
    `<div class="header-actions">${BACK_BUTTON}`
  );
}

function patchExtraCss(html) {
  if (html.includes(".btn-back-hub")) return html;
  if (html.includes("</style>")) {
    return html.replace("</style>", `${EXTRA_CSS}\n  </style>`);
  }
  return html;
}

function validateInlineJs(html, sourceLabel) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let i = 0;
  while ((m = re.exec(html)) !== null) {
    const t = m[1].trim();
    if (!t) continue;
    try {
      new vm.Script(t);
    } catch (err) {
      throw new Error(`${sourceLabel}: script #${++i}: ${err.message}`);
    }
    i++;
  }
}

for (const config of TARGETS) {
  console.log("[" + config.id + "]");
  let html = fs.readFileSync(config.html, "utf8");
  html = inlineLocalScripts(html, config.html);
  html = patchBackButton(html);
  html = patchExtraCss(html);
  validateInlineJs(html, config.id);
  for (const output of config.outputs) {
    const outPath = path.join(viewsDir, output);
    fs.writeFileSync(outPath, html, "utf8");
    console.log("  -> " + output);
  }
}

const views = [
  "UNICATINTAS.ejs",
  "loja-maquinas.ejs",
  "lojamaquinas1trm.ejs",
  "baifer1trm.ejs",
  "baifer2trm.ejs",
  "du-lanche.ejs",
  "egaplast.ejs",
  "schumacher.ejs",
  "jpg.ejs",
];

console.log("\n=== Validacao final ===");
for (const v of views) {
  const html = fs.readFileSync(path.join(viewsDir, v), "utf8");
  const hasPrint =
    html.includes("function printBySupplier") ||
    html.includes("window.printBySupplier");
  const hasPdf =
    html.includes("function exportSupplierPdf") ||
    html.includes("window.exportSupplierPdf");
  console.log(
    `  ${v}: print=${hasPrint ? "OK" : "NO"} pdf=${hasPdf ? "OK" : "NO"}`
  );
  if (!hasPrint || !hasPdf) process.exitCode = 1;
}

console.log("DONE");
