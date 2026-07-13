/**
 * Completa Por Fornecedor em TODAS as empresas + validacao final.
 * - Barra fin-supplier-bar visivel na Finalidade
 * - Modal CSS display:none padrao
 * - Exports window
 * - Rebuild fontes BAIFER/DU/EGAPLAST se necessario
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = "c:/Users/trind/Desktop/dashboards";
const viewsDir = path.join(root, "Dashboards/src/views");

const FIN_BAR = `
        <div class="fin-supplier-bar" id="fin-supplier-bar">
          <button type="button" class="btn-export print" id="btn-por-fornecedor" onclick="openSupplierModal()" title="Imprimir por Fornecedor">
            <i class="fas fa-truck"></i> Por Fornecedor
          </button>
          <span class="fin-supplier-hint">Selecione fornecedores e emita o relatório (Imprimir ou PDF) da competência ativa.</span>
        </div>
`;

const FIN_BAR_JPG = `
        <div class="fin-supplier-bar" id="fin-supplier-bar">
          <button type="button" class="btn-export print" id="btn-por-fornecedor" onclick="openSupplierModalActive()" title="Imprimir por Fornecedor">
            <i class="fas fa-truck"></i> Por Fornecedor
          </button>
          <span class="fin-supplier-hint">Selecione fornecedores e emita o relatório (Imprimir ou PDF) da competência/unidade ativa.</span>
        </div>
`;

const FIN_CSS = `
    .fin-supplier-bar {
      display:flex; align-items:center; gap:12px; flex-wrap:wrap;
      margin:0 0 16px; padding:12px 14px;
      background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.4);
      border-radius:10px;
    }
    .fin-supplier-bar .btn-export.print {
      font-weight:700; font-size:13px; padding:10px 16px;
    }
    .fin-supplier-hint { font-size:12px; color:var(--text-sec); line-height:1.4; }
`;

function ensureFinCss(html) {
  if (html.includes(".fin-supplier-bar {")) return html;
  // insert before SUPPLIER MODAL or before first .modal-overlay {
  if (html.includes("/* === SUPPLIER MODAL === */")) {
    return html.replace("/* === SUPPLIER MODAL === */", FIN_CSS + "\n    /* === SUPPLIER MODAL === */");
  }
  if (html.includes(".modal-overlay {")) {
    return html.replace(".modal-overlay {", FIN_CSS + "\n    .modal-overlay {");
  }
  return html.replace("</style>", FIN_CSS + "\n  </style>");
}

function ensureModalCssHidden(html) {
  // Only fix classic pattern display:flex on .modal-overlay base rule
  return html.replace(
    /(\.modal-overlay\s*\{[^}]*?)display:\s*flex(\s*;[^}]*align-items:\s*center)/g,
    "$1display:none$2"
  ).replace(
    /(\.modal-overlay\s*\{[^}]*display:\s*none[^}]*\})\n(?!\s*\.modal-overlay\[style)/,
    `$1
    .modal-overlay[style*="display: flex"], .modal-overlay[style*="display:flex"] {
      display:flex !important;
    }
`
  );
}

function ensureFinBar(html, isJpg) {
  if (html.includes('id="fin-supplier-bar"')) return html;
  const bar = isJpg ? FIN_BAR_JPG : FIN_BAR;
  // After tab-finalidade sec-header closing
  const re =
    /(<section id="tab-finalidade"[\s\S]*?<div class="sec-header">[\s\S]*?<\/div>\s*<\/div>\s*)/;
  if (re.test(html)) {
    return html.replace(re, `$1${bar}`);
  }
  // JPG may have different structure
  const re2 = /(<section id="tab-finalidade"[\s\S]*?export-bar[\s\S]*?<\/div>\s*<\/div>\s*)/;
  if (re2.test(html)) {
    return html.replace(re2, `$1${bar}`);
  }
  console.warn("  !! nao inseriu fin-bar (estrutura diferente)");
  return html;
}

function ensureWindowExports(html) {
  if (html.includes("window.openSupplierModal = openSupplierModal")) return html;
  // For UNICA style window.openSupplierModal = function
  if (html.includes("window.openSupplierModal = function")) return html;
  // Insert before DOMContentLoaded if functions exist
  if (!/function openSupplierModal\s*\(/.test(html)) return html;
  if (html.includes("document.addEventListener('DOMContentLoaded'")) {
    return html.replace(
      "document.addEventListener('DOMContentLoaded'",
      `window.openSupplierModal = openSupplierModal;
  window.closeSupplierModal = closeSupplierModal;
  window.printBySupplier = printBySupplier;
  window.exportSupplierPdf = exportSupplierPdf;
  document.addEventListener('DOMContentLoaded'`
    );
  }
  return html;
}

function ensureEscHtml(html) {
  if (/function escHtml\s*\(/.test(html)) return html;
  if (!html.includes("escHtml(")) return html;
  // inject near start of main IIFE or after DASHBOARD_DATA check
  if (html.includes("function getCfopDados()")) {
    return html.replace(
      /function getCfopDados\(\) \{[\s\S]*?\n  \}/,
      (m) =>
        m +
        `
  function escHtml(v) {
    return String(v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }`
    );
  }
  return html;
}

const VIEW_FILES = [
  { file: "UNICATINTAS.ejs", jpg: false },
  { file: "baifer1trm.ejs", jpg: false },
  { file: "baifer2trm.ejs", jpg: false },
  { file: "du-lanche.ejs", jpg: false },
  { file: "egaplast.ejs", jpg: false },
  { file: "loja-maquinas.ejs", jpg: false },
  { file: "lojamaquinas1trm.ejs", jpg: false },
  { file: "schumacher.ejs", jpg: false },
  { file: "jpg.ejs", jpg: true },
];

for (const v of VIEW_FILES) {
  const fp = path.join(viewsDir, v.file);
  let html = fs.readFileSync(fp, "utf8");
  const before = html;
  html = ensureFinCss(html);
  html = ensureModalCssHidden(html);
  html = ensureFinBar(html, v.jpg);
  html = ensureWindowExports(html);
  html = ensureEscHtml(html);
  if (html !== before) {
    fs.writeFileSync(fp, html);
    console.log("updated view", v.file);
  } else {
    console.log("ok view", v.file);
  }
}

// Also patch source HTMLs used for rebuild
const SOURCES = [
  path.join(root, "UNICA 10/UNICATINTAS.html"),
  path.join(root, "DASH/BAIFER DASHBOARD/baifer.html"),
  path.join(root, "DASH/du lanches/du-lanche.html"),
  path.join(root, "egaplast att com cfop/EGAPLAST.html"),
  path.join(root, "lojja/LOJA-MAQUINAS.html"),
  path.join(root, "DASH/shumacher/SCHUMACHER.html"),
  path.join(root, "jpg/JPG.html"),
];

for (const fp of SOURCES) {
  if (!fs.existsSync(fp)) continue;
  let html = fs.readFileSync(fp, "utf8");
  const before = html;
  const isJpg = /JPG\.html$/i.test(fp);
  html = ensureFinCss(html);
  html = ensureModalCssHidden(html);
  html = ensureFinBar(html, isJpg);
  if (html !== before) {
    fs.writeFileSync(fp, html);
    console.log("updated source", path.relative(root, fp));
  }
}

console.log("PATCH COMPLETE");
