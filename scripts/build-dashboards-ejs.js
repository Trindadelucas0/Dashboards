const fs = require("fs");
const path = require("path");

const dashboardsRoot = path.join(__dirname, "..");
const dashRoot = path.join(dashboardsRoot, "..", "DASH");
const viewsDir = path.join(dashboardsRoot, "src", "views");

const BACK_BUTTON =
  '<a href="/auth/dashboard-selector" class="btn-export btn-back-hub"><i class="fas fa-arrow-left"></i> Voltar</a>';

const EXTRA_CSS = `
    .btn-back-hub { display:inline-flex; align-items:center; gap:6px; text-decoration:none; }
`;

const DASHBOARDS = [
  {
    id: "unicatintas",
    html: path.join(dashRoot, "Unica", "UNICATINTAS.html"),
    outputs: ["UNICATINTAS.ejs"],
  },
  {
    id: "loja-maquinas",
    html: path.join(dashRoot, "lojja", "LOJA-MAQUINAS.html"),
    outputs: ["loja-maquinas.ejs", "lojamaquinas1trm.ejs"],
  },
  {
    id: "baifer",
    html: path.join(dashRoot, "BAIFER DASHBOARD", "baifer.html"),
    outputs: ["baifer1trm.ejs", "baifer2trm.ejs"],
  },
  {
    id: "schumacher",
    html: path.join(dashRoot, "shumacher", "SCHUMACHER.html"),
    outputs: ["schumacher.ejs"],
  },
  {
    id: "egaplast",
    html: path.join(dashRoot, "egaplast", "EGAPLAST.html"),
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

function resolveLocalScript(htmlDir, src) {
  const clean = src.split("?")[0].split("#")[0];
  return path.join(htmlDir, clean);
}

function inlineLocalScripts(html, htmlPath) {
  const htmlDir = path.dirname(htmlPath);
  const scriptSrcRegex = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi;

  return html.replace(scriptSrcRegex, (match, src) => {
    if (isRemoteSrc(src)) return match;

    const filePath = resolveLocalScript(htmlDir, src);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Script nao encontrado: ${filePath} (referenciado em ${htmlPath})`);
    }

    const js = fs.readFileSync(filePath, "utf8");
    return `<script>\n${js}\n</script>`;
  });
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

function buildDashboard(config) {
  if (!fs.existsSync(config.html)) {
    throw new Error(`HTML nao encontrado: ${config.html}`);
  }

  let html = fs.readFileSync(config.html, "utf8");
  html = inlineLocalScripts(html, config.html);
  html = patchBackButton(html);
  html = patchExtraCss(html);

  for (const output of config.outputs) {
    const outPath = path.join(viewsDir, output);
    fs.writeFileSync(outPath, html, "utf8");
    const kb = Math.round(fs.statSync(outPath).size / 1024);
    console.log(`  -> ${output} (${kb} KB)`);
  }
}

function main() {
  console.log("Gerando views EJS a partir de DASH/\n");

  for (const config of DASHBOARDS) {
    console.log(`[${config.id}] ${path.relative(dashRoot, config.html)}`);
    buildDashboard(config);
  }

  console.log("\nConcluido.");
}

main();
