/**
 * Replica exportSupplierExcel (Por Fornecedor) em todas as empresas
 * e atualiza o script de validacao.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");

const EXCEL_HELPERS = `
  function autoColWidths(aoa, maxWch) {
    const widths = [];
    aoa.forEach((row) => {
      row.forEach((cell, c) => {
        const len = String(cell == null ? '' : cell).length + 2;
        widths[c] = Math.min(Math.max(widths[c] || 10, len), maxWch || 50);
      });
    });
    return widths.map((wch) => ({ wch }));
  }

  function buildSupplierExcelWorkbook(data) {
    const wb = XLSX.utils.book_new();
    const emitido = new Date().toLocaleDateString('pt-BR');
    const col3 = data.col3Label || 'Finalidade';

    const resumo = [
      ['Relatório por Fornecedor'],
      ['Empresa', data.companyName || ''],
      ['Competência', data.competencia || ''],
      ['Emitido em', emitido],
      [],
      ['Fornecedor', 'CNPJ', 'UF', 'Subtotal (R$)'],
    ];
    data.suppliers.forEach((s) => {
      resumo.push([
        s.nome || '',
        s.cnpj || '—',
        s.uf || '—',
        Math.round(Number(s.subtotal || 0) * 100) / 100,
      ]);
    });
    resumo.push(['Total Geral', '', '', Math.round(Number(data.totalGeral || 0) * 100) / 100]);
    const wsResumo = XLSX.utils.aoa_to_sheet(resumo);
    wsResumo['!cols'] = autoColWidths(resumo, 45);
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

    const detalhado = [
      ['Fornecedor', 'CNPJ', 'UF', 'CFOP', 'Descrição', col3, 'Qtd NFs', 'Valor (R$)'],
    ];
    data.suppliers.forEach((s) => {
      (s.rows || []).forEach((r) => {
        detalhado.push([
          s.nome || '',
          s.cnpj || '—',
          s.uf || '—',
          r.cfop || '',
          r.desc || '—',
          r.fin || '—',
          Number(r.qtd || 0),
          Math.round(Number(r.total || 0) * 100) / 100,
        ]);
      });
    });
    const wsDet = XLSX.utils.aoa_to_sheet(detalhado);
    wsDet['!cols'] = autoColWidths(detalhado, 50);
    XLSX.utils.book_append_sheet(wb, wsDet, 'Detalhado');
    return wb;
  }

  function saveSupplierExcelWorkbook(data) {
    const wb = buildSupplierExcelWorkbook(data);
    const safeCompany = String(data.companyName || 'empresa').slice(0, 24).replace(/[\\/:*?"<>|]/g, '');
    const safeComp = String(data.competencia || '')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\\s+/g, '_')
      .slice(0, 32);
    const safeDate = new Date().toLocaleDateString('pt-BR').replace(/\\//g, '-');
    const parts = ['relatorio-fornecedor', safeCompany, safeComp, safeDate].filter(Boolean);
    XLSX.writeFile(wb, parts.join('_') + '.xlsx');
  }
`;

const BTN_EXCEL =
  '      <button type="button" class="btn-confirm btn-xlsx-supplier" onclick="exportSupplierExcel()" title="Baixar Excel dos selecionados" style="background:#22c55e;"><i class="fas fa-file-excel"></i> Baixar Excel</button>';

function ensureHint(html) {
  return html
    .replace(
      /Selecione fornecedores e emita o relatório \(Imprimir ou PDF\) da competência ativa\./g,
      "Selecione fornecedores e emita o relatório (Imprimir, PDF ou Excel) da competência ativa."
    )
    .replace(
      /Selecione fornecedores e emita o relatório \(Imprimir ou PDF\) da competência\/unidade ativa\./g,
      "Selecione fornecedores e emita o relatório (Imprimir, PDF ou Excel) da competência/unidade ativa."
    );
}

function ensureExcelButton(html) {
  if (/exportSupplierExcel\s*\(/.test(html) && /Baixar Excel/i.test(html)) return html;
  // Insert after Baixar PDF button(s) in supplier modal footer
  return html.replace(
    /(<button[^>]*onclick="exportSupplierPdf\(\)"[^>]*>[\s\S]*?<\/button>)/g,
    (m) => {
      if (m.includes("btn-xlsx-supplier") || html.includes('onclick="exportSupplierExcel()"') && m.includes("min-width")) {
        // keep but still add after if not present nearby - handled below
      }
      if (html.includes("btn-xlsx-supplier")) return m;
      return m + "\n" + BTN_EXCEL;
    }
  );
}

function ensureExcelButtonOnce(html) {
  if (/btn-xlsx-supplier/.test(html) || /onclick="exportSupplierExcel\(\)"/.test(html)) {
    return html;
  }
  // Prefer the modal footer PDF button (not drawer ones with min-width)
  const re =
    /(<div class="modal-footer">[\s\S]*?<button[^>]*onclick="exportSupplierPdf\(\)"[^>]*>[\s\S]*?<\/button>)/;
  if (re.test(html)) {
    return html.replace(re, "$1\n" + BTN_EXCEL);
  }
  return html.replace(
    /(<button[^>]*onclick="exportSupplierPdf\(\)"[^>]*>[\s\S]*?<\/button>)/,
    "$1\n" + BTN_EXCEL
  );
}

function insertAfterExportPdfFn(src, exportFnBody) {
  if (/function\s+exportSupplierExcel\s*\(/.test(src) || /window\.exportSupplierExcel\s*=/.test(src)) {
    return src;
  }
  if (!src.includes("function exportSupplierPdf")) {
    throw new Error("exportSupplierPdf not found");
  }
  // Insert helpers + export after the whole exportSupplierPdf function:
  // find "function exportSupplierPdf" then find matching closing brace at column indent
  const start = src.indexOf("function exportSupplierPdf");
  if (start < 0) throw new Error("exportSupplierPdf start missing");

  // naive: find end by looking for next "\n  function " or "\n  window." or "\n  /*" or "\n</script>" after the pdf function
  let i = start;
  let depth = 0;
  let started = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") {
      depth++;
      started = true;
    } else if (ch === "}") {
      depth--;
      if (started && depth === 0) {
        i++;
        break;
      }
    }
  }
  const insertAt = i;
  const block = "\n" + EXCEL_HELPERS + "\n" + exportFnBody + "\n";
  return src.slice(0, insertAt) + block + src.slice(insertAt);
}

function ensureWindowExport(src) {
  if (/window\.exportSupplierExcel\s*=/.test(src)) return src;
  if (/window\.exportSupplierPdf\s*=\s*exportSupplierPdf/.test(src)) {
    return src.replace(
      /window\.exportSupplierPdf\s*=\s*exportSupplierPdf;/,
      "window.exportSupplierPdf = exportSupplierPdf;\n  window.exportSupplierExcel = exportSupplierExcel;"
    );
  }
  return src;
}

const EXPORT_MODAL = `
  function exportSupplierExcel() {
    const data = buildModalSupplierReportData();
    if (data.error) { alert(data.error); return; }
    if (!window.XLSX) {
      alert('Biblioteca XLSX nao carregada.');
      return;
    }
    closeSupplierModal();
    saveSupplierExcelWorkbook(data);
  }
`;

const EXPORT_LOJA = `
  function exportSupplierExcel() {
    const selected = Array.from(document.querySelectorAll('#supplierList .supplier-item input:checked'));
    const includeDemais = document.getElementById('includeDemaisFornecedores')?.checked;
    if (!selected.length && !includeDemais) {
      alert('Selecione ao menos um fornecedor ou marque "Demais fornecedores".');
      return;
    }
    if (!window.XLSX) {
      alert('Biblioteca XLSX nao carregada.');
      return;
    }
    const data = buildLojaSupplierReportData(selected, includeDemais);
    if (data.totalGeral <= 0) {
      alert('Nenhum dado encontrado para os fornecedores selecionados neste período.');
      return;
    }
    closeSupplierModal();
    saveSupplierExcelWorkbook(data);
  }
`;

const EXPORT_SCHUMACHER = `
  function exportSupplierExcel() {
    const selected = Array.from(document.querySelectorAll('#supplierList input:checked'));
    if (!selected.length) { alert('Selecione ao menos um fornecedor.'); return; }
    if (!window.XLSX) {
      alert('Biblioteca XLSX nao carregada.');
      return;
    }
    const built = buildSupplierReportData(selected);
    if (built.totalGeral <= 0) {
      alert('Nenhum dado encontrado para os fornecedores selecionados neste período.');
      return;
    }
    closeSupplierModal();
    saveSupplierExcelWorkbook({
      suppliers: built.suppliers,
      totalGeral: built.totalGeral,
      companyName: getCompanyName(),
      competencia: built.competencia,
      col3Label: 'Finalidade',
    });
  }
`;

const EXPORT_JPG = `
function exportSupplierExcel() {
  const selected = Array.from(document.querySelectorAll('#supplierList .supplier-item input:checked'));
  const includeDemais = document.getElementById('includeDemaisFornecedores')?.checked;
  if (!selected.length && !includeDemais) {
    alert('Selecione ao menos um fornecedor ou marque "Demais fornecedores".');
    return;
  }
  if (!window.XLSX) {
    alert('Biblioteca XLSX nao carregada.');
    return;
  }
  const built = buildSupplierReportData(selected, includeDemais);
  if (!built.suppliers.length || built.totalGeral <= 0) {
    alert('Nenhum dado encontrado para os fornecedores selecionados neste periodo.');
    return;
  }
  closeSupplierModal();
  saveSupplierExcelWorkbook({
    suppliers: built.suppliers,
    totalGeral: built.totalGeral,
    companyName: built.empresa + (built.label ? ' — ' + built.label : ''),
    competencia: built.periodo,
    col3Label: 'Finalidade',
  });
}
`;

// JPG helpers without leading indent (global functions)
const EXCEL_HELPERS_JPG = EXCEL_HELPERS.replace(/^  /gm, "");

function patchHtmlModal(filePath) {
  let html = fs.readFileSync(filePath, "utf8");
  html = ensureHint(html);
  html = ensureExcelButtonOnce(html);
  fs.writeFileSync(filePath, html, "utf8");
  console.log("HTML:", path.relative(root, filePath));
}

function patchJsModal(filePath) {
  let src = fs.readFileSync(filePath, "utf8");
  src = insertAfterExportPdfFn(src, EXPORT_MODAL);
  src = ensureWindowExport(src);
  fs.writeFileSync(filePath, src, "utf8");
  console.log("JS:", path.relative(root, filePath));
}

// --- BAIFER ---
patchHtmlModal(path.join(root, "DASH", "BAIFER DASHBOARD", "baifer.html"));
patchJsModal(path.join(root, "DASH", "BAIFER DASHBOARD", "baifer-app.js"));

// --- DU LANCHE ---
patchHtmlModal(path.join(root, "DASH", "du lanches", "du-lanche.html"));
patchJsModal(path.join(root, "DASH", "du lanches", "du-lanche-app.js"));

// --- EGAPLAST ---
patchHtmlModal(path.join(root, "egaplast att com cfop", "EGAPLAST.html"));
patchJsModal(path.join(root, "egaplast att com cfop", "egaplast-app.js"));

// --- LOJA ---
{
  const file = path.join(root, "lojja", "LOJA-MAQUINAS.html");
  let html = fs.readFileSync(file, "utf8");
  html = ensureHint(html);
  html = ensureExcelButtonOnce(html);
  if (!/function\s+exportSupplierExcel\s*\(/.test(html)) {
    html = insertAfterExportPdfFn(html, EXPORT_LOJA);
    html = ensureWindowExport(html);
  }
  fs.writeFileSync(file, html, "utf8");
  console.log("LOJA:", path.relative(root, file));
}

// --- SCHUMACHER ---
{
  const file = path.join(root, "DASH", "shumacher", "SCHUMACHER.html");
  let html = fs.readFileSync(file, "utf8");
  html = ensureHint(html);
  html = ensureExcelButtonOnce(html);
  if (!/function\s+exportSupplierExcel\s*\(/.test(html)) {
    html = insertAfterExportPdfFn(html, EXPORT_SCHUMACHER);
  }
  fs.writeFileSync(file, html, "utf8");
  console.log("SCHUMACHER:", path.relative(root, file));
}

// --- JPG ---
{
  const file = path.join(root, "jpg", "JPG.html");
  let html = fs.readFileSync(file, "utf8");
  if (!/cdn\.sheetjs\.com|xlsx\.full/.test(html)) {
    html = html.replace(
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>',
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>\n  <script src="https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js"></script>'
    );
  }
  html = ensureHint(html);
  html = ensureExcelButtonOnce(html);
  if (!/function\s+exportSupplierExcel\s*\(/.test(html)) {
    // JPG uses unindented function declarations
    const start = html.indexOf("function exportSupplierPdf");
    if (start < 0) throw new Error("JPG: exportSupplierPdf missing");
    let i = start;
    let depth = 0;
    let started = false;
    for (; i < html.length; i++) {
      const ch = html[i];
      if (ch === "{") {
        depth++;
        started = true;
      } else if (ch === "}") {
        depth--;
        if (started && depth === 0) {
          i++;
          break;
        }
      }
    }
    const block = "\n" + EXCEL_HELPERS_JPG + "\n" + EXPORT_JPG + "\n";
    html = html.slice(0, i) + block + html.slice(i);
  }
  fs.writeFileSync(file, html, "utf8");
  console.log("JPG:", path.relative(root, file));
}

// Update validation script
const valPath = path.join(__dirname, "_validate-por-fornecedor-final.js");
let val = fs.readFileSync(valPath, "utf8");
if (!val.includes("baixarExcel")) {
  val = val.replace(
    '["baixarPdf", /exportSupplierPdf\\s*\\(/.test(html) && /Baixar PDF/i.test(html)],',
    '["baixarPdf", /exportSupplierPdf\\s*\\(/.test(html) && /Baixar PDF/i.test(html)],\n' +
      '    ["baixarExcel", /exportSupplierExcel\\s*\\(/.test(html) && /Baixar Excel/i.test(html)],'
  );
  val = val.replace(
    '["fnPdf", hasFn(html, "exportSupplierPdf")],',
    '["fnPdf", hasFn(html, "exportSupplierPdf")],\n' +
      '    ["fnExcel", hasFn(html, "exportSupplierExcel")],'
  );
  fs.writeFileSync(valPath, val, "utf8");
  console.log("Updated _validate-por-fornecedor-final.js");
}

console.log("\nDone.");
