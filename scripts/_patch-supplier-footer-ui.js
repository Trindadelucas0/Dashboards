/**
 * Aplica layout do footer Por Fornecedor (Cancelar | Imprimir/PDF/Excel)
 * e CSS de cores em todas as empresas fonte HTML.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");

const SUPPLIER_FOOTER_CSS = `
    #supplierModal .modal-footer {
      display:flex; flex-wrap:wrap; align-items:center;
      justify-content:space-between; gap:10px;
      padding:14px 20px; border-top:1px solid var(--border);
    }
    #supplierModal .modal-footer-actions {
      display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end;
    }
    #supplierModal .btn-confirm.btn-print-supplier {
      background:rgba(34,163,41,.2); border-color:rgba(34,163,41,.45); color:var(--accent);
    }
    #supplierModal .btn-confirm.btn-print-supplier:hover { background:rgba(34,163,41,.35); }
    #supplierModal .btn-confirm.btn-pdf-supplier {
      background:#dc2626; border-color:#b91c1c; color:#fff;
    }
    #supplierModal .btn-confirm.btn-pdf-supplier:hover { background:#b91c1c; }
    #supplierModal .btn-confirm.btn-xlsx-supplier {
      background:#15803d; border-color:#166534; color:#fff;
    }
    #supplierModal .btn-confirm.btn-xlsx-supplier:hover { background:#166534; }
`;

const NEW_FOOTER = `<div class="modal-footer">
      <button type="button" class="btn-cancel" onclick="closeSupplierModal()">Cancelar</button>
      <div class="modal-footer-actions">
        <button type="button" class="btn-confirm btn-print-supplier" onclick="printBySupplier()"><i class="fas fa-print"></i> Imprimir Selecionados</button>
        <button type="button" class="btn-confirm btn-pdf-supplier" onclick="exportSupplierPdf()" title="Baixar PDF dos selecionados"><i class="fas fa-file-pdf"></i> Baixar PDF</button>
        <button type="button" class="btn-confirm btn-xlsx-supplier" onclick="exportSupplierExcel()" title="Baixar Excel dos selecionados"><i class="fas fa-file-excel"></i> Baixar Excel</button>
      </div>
    </div>`;

const FILES = [
  path.join(root, "UNICA 10", "UNICATINTAS.html"),
  path.join(root, "DASH", "BAIFER DASHBOARD", "baifer.html"),
  path.join(root, "DASH", "du lanches", "du-lanche.html"),
  path.join(root, "egaplast att com cfop", "EGAPLAST.html"),
  path.join(root, "lojja", "LOJA-MAQUINAS.html"),
  path.join(root, "DASH", "shumacher", "SCHUMACHER.html"),
  path.join(root, "jpg", "JPG.html"),
];

function ensureCss(html) {
  if (html.includes("#supplierModal .btn-confirm.btn-xlsx-supplier")) {
    return html;
  }
  const re = /(\.modal-footer\s*\{[^}]*\}\n)/;
  if (re.test(html)) {
    return html.replace(re, "$1" + SUPPLIER_FOOTER_CSS);
  }
  if (html.includes("/* === SUPPLIER MODAL === */")) {
    return html.replace(
      "/* === SUPPLIER MODAL === */",
      SUPPLIER_FOOTER_CSS + "\n    /* === SUPPLIER MODAL === */"
    );
  }
  return html.replace("</style>", SUPPLIER_FOOTER_CSS + "\n  </style>");
}

function findMatchingDivEnd(html, startIdx) {
  // startIdx points to '<' of <div ...>
  let i = html.indexOf(">", startIdx) + 1;
  let depth = 1;
  while (i < html.length && depth > 0) {
    if (html.startsWith("<div", i) && (html[i + 4] === " " || html[i + 4] === ">")) {
      depth++;
      i += 4;
      continue;
    }
    if (html.startsWith("</div>", i)) {
      depth--;
      if (depth === 0) return i + 6;
      i += 6;
      continue;
    }
    i++;
  }
  throw new Error("Unclosed div from " + startIdx);
}

function patchFooter(html) {
  if (html.includes('<div class="modal-footer-actions">')) {
    return html;
  }
  const modalIdx = html.indexOf('id="supplierModal"');
  if (modalIdx < 0) throw new Error("supplierModal not found");
  const footerStart = html.indexOf('<div class="modal-footer">', modalIdx);
  if (footerStart < 0) throw new Error("modal-footer not found in supplierModal");
  const footerEnd = findMatchingDivEnd(html, footerStart);
  const oldFooter = html.slice(footerStart, footerEnd);
  if (!/printBySupplier|exportSupplierPdf/.test(oldFooter)) {
    throw new Error("Unexpected footer: " + oldFooter.slice(0, 180));
  }
  return html.slice(0, footerStart) + NEW_FOOTER + html.slice(footerEnd);
}

function patchSelectors(html) {
  return html
    .replace(
      /#supplierModal \.btn-confirm:not\(\.btn-pdf-supplier\)/g,
      "#supplierModal .btn-print-supplier"
    )
    .replace(
      /document\.querySelector\('#supplierModal \.btn-confirm:not\(\.btn-pdf-supplier\)'\)/g,
      "document.querySelector('#supplierModal .btn-print-supplier')"
    )
    .replace(
      /document\.querySelector\("#supplierModal \.btn-confirm:not\(\.btn-pdf-supplier\)"\)/g,
      'document.querySelector("#supplierModal .btn-print-supplier")'
    );
}

function patchFile(filePath) {
  let html = fs.readFileSync(filePath, "utf8");
  html = ensureCss(html);
  html = patchFooter(html);
  html = patchSelectors(html);
  fs.writeFileSync(filePath, html, "utf8");
  const hasActions = html.includes('<div class="modal-footer-actions">');
  const hasPrint = html.includes("btn-print-supplier");
  const xlsxCount = (html.match(/btn-xlsx-supplier/g) || []).length;
  console.log(
    (hasActions && hasPrint ? "OK" : "WARN") +
      " " +
      path.relative(root, filePath) +
      " actions=" +
      hasActions +
      " printCls=" +
      hasPrint +
      " xlsxRefs=" +
      xlsxCount
  );
}

for (const f of FILES) {
  patchFile(f);
}
console.log("Done.");
