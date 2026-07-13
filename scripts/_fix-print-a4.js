/**
 * Ajusta impressao/PDF do Relatorio por Fornecedor para caber na folha A4.
 * Patch aditivo (nao remove CSS existente de forn-picker etc.).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = "c:/Users/trind/Desktop/dashboards";

const SUPPLIER_PRINT_A4 = `
    /* SUPPLIER-PRINT-A4 */
    @media print {
      @page {
        size: A4 portrait;
        margin: 10mm 12mm;
      }
      html, body {
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body.supplier-printing #print-supplier-report {
        display: block !important;
        position: static !important;
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        box-sizing: border-box !important;
      }
      body.supplier-printing #print-supplier-report .supplier-print-root,
      body.supplier-printing #print-supplier-report .supplier-print-block {
        width: 100% !important;
        max-width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        box-sizing: border-box !important;
      }
      body.supplier-printing #print-supplier-report .supplier-print-block {
        page-break-inside: auto !important;
        break-inside: auto !important;
        margin-bottom: 10px !important;
      }
      body.supplier-printing #print-supplier-report table {
        width: 100% !important;
        max-width: 100% !important;
        table-layout: fixed !important;
        border-collapse: collapse !important;
        font-size: 9pt !important;
      }
      body.supplier-printing #print-supplier-report col.cfop { width: 12% !important; }
      body.supplier-printing #print-supplier-report col.desc { width: 34% !important; }
      body.supplier-printing #print-supplier-report col.fin { width: 28% !important; }
      body.supplier-printing #print-supplier-report col.qtd { width: 10% !important; }
      body.supplier-printing #print-supplier-report col.val { width: 16% !important; }
      body.supplier-printing #print-supplier-report th,
      body.supplier-printing #print-supplier-report td {
        padding: 3px 4px !important;
        word-wrap: break-word !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
        vertical-align: top !important;
      }
      body.supplier-printing #print-supplier-report thead { display: table-header-group !important; }
      body.supplier-printing #print-supplier-report tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      body.supplier-printing #print-supplier-report h1 {
        font-size: 14pt !important;
        margin: 0 0 4px !important;
      }
      body.supplier-printing #print-supplier-report h2 {
        font-size: 11pt !important;
        margin: 0 0 4px !important;
        page-break-after: avoid;
      }
    }
`;

const HTML_FILES = [
  path.join(root, "UNICA 10/UNICATINTAS.html"),
  path.join(root, "DASH/BAIFER DASHBOARD/baifer.html"),
  path.join(root, "DASH/du lanches/du-lanche.html"),
  path.join(root, "egaplast att com cfop/EGAPLAST.html"),
  path.join(root, "lojja/LOJA-MAQUINAS.html"),
  path.join(root, "DASH/shumacher/SCHUMACHER.html"),
  path.join(root, "jpg/JPG.html"),
];

const JS_FILES = [
  path.join(root, "UNICA 10/unica-app.js"),
  path.join(root, "DASH/BAIFER DASHBOARD/baifer-app.js"),
  path.join(root, "DASH/du lanches/du-lanche-app.js"),
  path.join(root, "egaplast att com cfop/egaplast-app.js"),
];

function patchPrintCss(html) {
  if (html.includes("/* SUPPLIER-PRINT-A4 */")) return html;
  if (html.includes("</style>")) {
    return html.replace("</style>", SUPPLIER_PRINT_A4 + "\n  </style>");
  }
  return html;
}

function patchPrintHtmlTemplates(content) {
  let c = content;

  c = c.replace(
    /'<div style="font-family:Inter,sans-serif;padding:24px;color:#1a1a2e;background:#fff;">'/g,
    `'<div class="supplier-print-root" style="font-family:Inter,sans-serif;padding:0;margin:0;color:#1a1a2e;background:#fff;width:100%;max-width:100%;box-sizing:border-box;">'`
  );

  c = c.replace(
    /margin-bottom:28px;page-break-inside:avoid;/g,
    "margin-bottom:12px;page-break-inside:auto;width:100%;max-width:100%;box-sizing:border-box;"
  );

  // class no bloco do fornecedor (apos o replace acima)
  c = c.replace(
    /'<div style="margin-bottom:12px;page-break-inside:auto;width:100%;max-width:100%;box-sizing:border-box;">'/g,
    `'<div class="supplier-print-block" style="margin-bottom:12px;page-break-inside:auto;width:100%;max-width:100%;box-sizing:border-box;">'`
  );
  c = c.replace(
    /html \+= '<div style="margin-bottom:12px;page-break-inside:auto;width:100%;max-width:100%;box-sizing:border-box;">';/g,
    `html += '<div class="supplier-print-block" style="margin-bottom:12px;page-break-inside:auto;width:100%;max-width:100%;box-sizing:border-box;">';`
  );

  c = c.replace(
    /'<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:12px;">'/g,
    `'<table style="width:100%;max-width:100%;border-collapse:collapse;margin-top:8px;font-size:10px;table-layout:fixed;"><colgroup><col class="cfop"><col class="desc"><col class="fin"><col class="qtd"><col class="val"></colgroup>'`
  );
  c = c.replace(
    /html \+= '<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:12px;">';/g,
    `html += '<table style="width:100%;max-width:100%;border-collapse:collapse;margin-top:8px;font-size:10px;table-layout:fixed;"><colgroup><col class="cfop"><col class="desc"><col class="fin"><col class="qtd"><col class="val"></colgroup>';`
  );

  c = c.replace(/padding:8px;border-bottom:1px solid #ddd;/g, "padding:4px 5px;border-bottom:1px solid #ddd;word-wrap:break-word;");
  c = c.replace(/padding:8px;text-align:left;/g, "padding:4px 5px;text-align:left;");
  c = c.replace(/padding:8px;text-align:right;/g, "padding:4px 5px;text-align:right;");
  c = c.replace(/padding:10px;text-align:right;font-weight:700;/g, "padding:6px 5px;text-align:right;font-weight:700;");

  return c;
}

function patchJsPdfAutotable(content) {
  let c = content;
  // Reduz fonte/padding e permite quebra de linha nas celulas
  c = c.replace(
    /styles:\s*\{\s*fontSize:\s*8,\s*cellPadding:\s*2\s*\}/g,
    "styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' }"
  );
  // Garante tableWidth uma unica vez apos margin
  c = c.replace(
    /pdf\.autoTable\(\{\s*startY:\s*y,\s*margin:\s*\{\s*left:\s*margin,\s*right:\s*margin\s*\},(?!\s*tableWidth)/g,
    `pdf.autoTable({
        startY: y,
        margin: { left: margin, right: margin },
        tableWidth: 'auto',`
  );
  return c;
}

for (const file of HTML_FILES) {
  if (!fs.existsSync(file)) {
    console.log("skip missing", file);
    continue;
  }
  let html = fs.readFileSync(file, "utf8");
  html = patchPrintCss(html);
  html = patchPrintHtmlTemplates(html);
  html = patchJsPdfAutotable(html);
  fs.writeFileSync(file, html);
  console.log("HTML", path.relative(root, file));
}

for (const file of JS_FILES) {
  if (!fs.existsSync(file)) continue;
  let js = fs.readFileSync(file, "utf8");
  js = patchPrintHtmlTemplates(js);
  js = patchJsPdfAutotable(js);
  fs.writeFileSync(file, js);
  console.log("JS", path.relative(root, file));
}

// PDFKit generator: colunas proporcionais a largura util da pagina
{
  const f = path.join(root, "Dashboards/scripts/generate-fornecedor-pdfs.js");
  let s = fs.readFileSync(f, "utf8");
  if (!s.includes("Math.floor(usable * 0.12)")) {
    s = s.replace(
      `const colW = [55, 170, 120, 50, 80];`,
      `const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colW = [
    Math.floor(usable * 0.12),
    Math.floor(usable * 0.34),
    Math.floor(usable * 0.28),
    Math.floor(usable * 0.10),
    0,
  ];
  colW[4] = usable - colW[0] - colW[1] - colW[2] - colW[3];`
    );
  }
  s = s.replace(
    `const doc = new PDFDocument({ margin: 40, size: "A4" });`,
    `const doc = new PDFDocument({ margin: 36, size: "A4" });`
  );
  fs.writeFileSync(f, s);
  console.log("PDF generator A4 fit updated");
}

// Rebuild views a partir das fontes
const dashboardsRoot = path.join(root, "Dashboards");
const dashRoot = path.join(root, "DASH");
const viewsDir = path.join(dashboardsRoot, "src", "views");
const BACK_BUTTON =
  '<a href="/auth/dashboard-selector" class="btn-export btn-back-hub"><i class="fas fa-arrow-left"></i> Voltar</a>';
const EXTRA_CSS = `
    .btn-back-hub { display:inline-flex; align-items:center; gap:6px; text-decoration:none; }
`;

const TARGETS = [
  { id: "unicatintas", html: path.join(root, "UNICA 10", "UNICATINTAS.html"), outputs: ["UNICATINTAS.ejs"] },
  { id: "loja-maquinas", html: path.join(root, "lojja", "LOJA-MAQUINAS.html"), outputs: ["loja-maquinas.ejs", "lojamaquinas1trm.ejs"] },
  { id: "baifer", html: path.join(dashRoot, "BAIFER DASHBOARD", "baifer.html"), outputs: ["baifer1trm.ejs", "baifer2trm.ejs"] },
  { id: "egaplast", html: path.join(root, "egaplast att com cfop", "EGAPLAST.html"), outputs: ["egaplast.ejs"] },
  { id: "du-lanche", html: path.join(dashRoot, "du lanches", "du-lanche.html"), outputs: ["du-lanche.ejs"] },
  { id: "schumacher", html: path.join(dashRoot, "shumacher", "SCHUMACHER.html"), outputs: ["schumacher.ejs"] },
  { id: "jpg", html: path.join(root, "jpg", "JPG.html"), outputs: ["jpg.ejs"] },
];

function isRemoteSrc(src) {
  return /^https?:\/\//i.test(src);
}

function inlineLocalScripts(html, htmlPath) {
  const htmlDir = path.dirname(htmlPath);
  return html.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
    if (isRemoteSrc(src)) return match;
    const clean = src.split("?")[0].split("#")[0];
    const filePath = path.join(htmlDir, clean);
    if (!fs.existsSync(filePath)) throw new Error("Script nao encontrado: " + filePath);
    return `<script>\n${fs.readFileSync(filePath, "utf8")}\n</script>`;
  });
}

function patchBackButton(html) {
  if (html.includes("btn-back-hub")) return html;
  return html.replace(/<div class="header-actions">/, `<div class="header-actions">${BACK_BUTTON}`);
}

function patchExtraCss(html) {
  if (html.includes(".btn-back-hub {")) return html;
  if (html.includes("</style>")) return html.replace("</style>", `${EXTRA_CSS}\n  </style>`);
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
    fs.writeFileSync(path.join(viewsDir, output), html, "utf8");
    console.log("  -> " + output);
  }
}

// Reaplica Demais no JPG se o rebuild da fonte perdeu
{
  const jpgView = path.join(viewsDir, "jpg.ejs");
  let h = fs.readFileSync(jpgView, "utf8");
  if (!h.includes("includeDemaisFornecedores")) {
    const re =
      /(<div class="supplier-actions">[\s\S]*?<\/div>)\s*(<div class="supplier-list" id="supplierList"><\/div>)/;
    if (re.test(h)) {
      h = h.replace(
        re,
        `$1
      <label class="supplier-item supplier-item-demais" id="demaisFornecedoresOption">
        <input type="checkbox" id="includeDemaisFornecedores" checked>
        <span class="supplier-info">
          <strong>Demais fornecedores</strong>
          <small>Agrupa fornecedores nao selecionados por CFOP</small>
        </span>
      </label>
      $2`
      );
      fs.writeFileSync(jpgView, h);
      console.log("JPG Demais restored after rebuild");
    }
  }
}

// Garante CSS A4 tambem nas views (caso alguma nao tenha vindo da fonte)
for (const name of fs.readdirSync(viewsDir)) {
  if (!name.endsWith(".ejs")) continue;
  const fp = path.join(viewsDir, name);
  let h = fs.readFileSync(fp, "utf8");
  if (!h.includes("#print-supplier-report")) continue;
  const before = h;
  h = patchPrintCss(h);
  h = patchPrintHtmlTemplates(h);
  h = patchJsPdfAutotable(h);
  if (h !== before) {
    fs.writeFileSync(fp, h);
    console.log("view patched", name);
  }
}

console.log("PRINT FIT DONE");
