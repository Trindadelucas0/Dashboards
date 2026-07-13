const fs = require("fs");
const path = require("path");

const BTN_OLD = `              <button type="button" class="btn-confirm" onclick="printBySupplier()" style="margin-top:12px;width:100%;">
                <i class="fas fa-print"></i> Imprimir Selecionados
              </button>`;

const BTN_NEW = `              <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
                <button type="button" class="btn-confirm" onclick="printBySupplier()" style="flex:1;min-width:140px;">
                  <i class="fas fa-print"></i> Imprimir Selecionados
                </button>
                <button type="button" class="btn-confirm btn-pdf-supplier" onclick="exportSupplierPdf()" style="flex:1;min-width:140px;background:#ef4444;">
                  <i class="fas fa-file-pdf"></i> Baixar PDF
                </button>
              </div>`;

const MODAL_OLD = `      <button type="button" class="btn-confirm" onclick="printBySupplier()"><i class="fas fa-print"></i> Imprimir Selecionados</button>
    </div>
  </div>
</div>`;

const MODAL_NEW = `      <button type="button" class="btn-confirm" onclick="printBySupplier()"><i class="fas fa-print"></i> Imprimir Selecionados</button>
      <button type="button" class="btn-confirm btn-pdf-supplier" onclick="exportSupplierPdf()" style="background:#ef4444;"><i class="fas fa-file-pdf"></i> Baixar PDF</button>
    </div>
  </div>
</div>`;

function patchHtml(file) {
  let html = fs.readFileSync(file, "utf8");
  const btnRe =
    /<button type="button" class="btn-confirm" onclick="printBySupplier\(\)" style="margin-top:12px;width:100%;">\s*<i class="fas fa-print"><\/i> Imprimir Selecionados\s*<\/button>/;
  if (!btnRe.test(html)) throw new Error("BTN not found: " + file);
  html = html.replace(btnRe, BTN_NEW.trim());
  if (!html.includes('onclick="exportSupplierPdf()"')) {
    html = html.replace(
      /(<button type="button" class="btn-confirm" onclick="printBySupplier\(\)"><i class="fas fa-print"><\/i> Imprimir Selecionados<\/button>)/,
      '$1\n      <button type="button" class="btn-confirm btn-pdf-supplier" onclick="exportSupplierPdf()" style="background:#ef4444;"><i class="fas fa-file-pdf"></i> Baixar PDF</button>'
    );
  }
  fs.writeFileSync(file, html);
  console.log("HTML", path.basename(file));
}

const EXPORT_HELPER = `
  function exportSupplierPdfFromData(data) {
    if (data.error) { alert(data.error); return; }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('Biblioteca jsPDF nao carregada.');
      return;
    }
    if (typeof window.jspdf.jsPDF.prototype.autoTable !== 'function') {
      alert('Biblioteca jspdf-autotable nao carregada.');
      return;
    }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 14;
    const pageH = pdf.internal.pageSize.getHeight();
    let y = margin;
    const fmtBrl = (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const ensureSpace = (need) => {
      if (y + need > pageH - margin) { pdf.addPage(); y = margin; }
    };
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('Relatorio por Fornecedor', margin, y);
    y += 7;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(80, 80, 80);
    pdf.text(data.companyName + ' — ' + data.competencia + ' — ' + new Date().toLocaleDateString('pt-BR'), margin, y);
    y += 10;
    pdf.setTextColor(0, 0, 0);
    data.suppliers.forEach((s) => {
      ensureSpace(20);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(String(s.nome || '').slice(0, 90), margin, y);
      y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text('CNPJ: ' + s.cnpj + ' · UF: ' + s.uf, margin, y);
      y += 4;
      pdf.setTextColor(0, 0, 0);
      pdf.autoTable({
        startY: y,
        margin: { left: margin, right: margin },
        head: [['CFOP', 'Descricao', data.col3Label, 'Qtd NFs', 'Valor (R$)']],
        body: s.rows.map((r) => [r.cfop, r.desc, r.fin, String(r.qtd), fmtBrl(r.total)]),
        foot: [['', '', '', 'Subtotal:', fmtBrl(s.subtotal)]],
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [34, 163, 41], textColor: 255 },
        footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
      });
      y = pdf.lastAutoTable.finalY + 8;
    });
    ensureSpace(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('Total Geral: ' + fmtBrl(data.totalGeral), margin, y);
    const safe = String(data.companyName || 'empresa').slice(0, 24).replace(/[\\\\/:*?"<>|]/g, '');
    pdf.save('relatorio-fornecedor-' + safe + '.pdf');
  }
`;

function makeBuilderAndPrint(rowFinExpr, col3Label) {
  return `
  function buildSelectedSupplierReportData() {
    const selectedNames = Array.from(fornecedorSelected);
    if (!selectedNames.length) return { error: 'Selecione ao menos um fornecedor.' };
    const cfopDados = getCfopDados();
    if (!cfopDados.length) return { error: 'Sem entradas para a competência selecionada.' };
    const suppliers = [];
    let totalGeral = 0;
    selectedNames.forEach((nome) => {
      const catalog = fornecedorCatalogCache.find((f) => f.nome === nome) || {};
      const rows = [];
      let subtotal = 0;
      cfopDados.forEach((c) => {
        const f = (c.fornecedores || []).find((x) => x.nome === nome);
        if (!f) return;
        ${rowFinExpr}
        rows.push({
          cfop: c.cfop,
          desc: desc,
          fin: fin,
          qtd: f.qtd || 0,
          total: f.total || 0,
        });
        subtotal += f.total || 0;
      });
      rows.sort((a, b) => b.total - a.total);
      totalGeral += subtotal;
      suppliers.push({ nome: nome, cnpj: catalog.cnpj || '—', uf: catalog.uf || '—', rows: rows, subtotal: subtotal });
    });
    if (totalGeral <= 0) return { error: 'Nenhum dado encontrado para os fornecedores selecionados neste período.' };
    return {
      suppliers: suppliers,
      totalGeral: totalGeral,
      competencia: periodFull(),
      companyName: getCompanyName(),
      col3Label: '${col3Label}',
    };
  }

  function printBySupplier() {
    const data = buildSelectedSupplierReportData();
    if (data.error) { alert(data.error); return; }
    let html = '<div style="font-family:Inter,sans-serif;padding:24px;color:#1a1a2e;background:#fff;">';
    html += '<h1 style="font-size:18px;margin-bottom:4px;">Relatório por Fornecedor</h1>';
    html += '<p style="font-size:12px;color:#555;margin-bottom:24px;">' +
      escHtml(data.companyName) + ' — ' + escHtml(data.competencia) + ' — ' +
      new Date().toLocaleDateString('pt-BR') + '</p>';
    data.suppliers.forEach((s) => {
      html += '<div style="margin-bottom:28px;page-break-inside:avoid;">';
      html += '<h2 style="font-size:14px;border-bottom:2px solid #22a329;padding-bottom:6px;">' + escHtml(s.nome) + '</h2>';
      html += '<p style="font-size:11px;color:#555;">CNPJ: ' + escHtml(s.cnpj) + ' · UF: ' + escHtml(s.uf) + '</p>';
      html += '<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:12px;">';
      html += '<thead><tr style="background:#f0f0f0;"><th style="padding:8px;text-align:left;">CFOP</th>';
      html += '<th style="padding:8px;text-align:left;">Descrição</th><th style="padding:8px;text-align:left;">' + escHtml(data.col3Label) + '</th>';
      html += '<th style="padding:8px;text-align:right;">Qtd NFs</th><th style="padding:8px;text-align:right;">Valor (R$)</th></tr></thead><tbody>';
      s.rows.forEach((r) => {
        html += '<tr><td style="padding:8px;border-bottom:1px solid #ddd;">' + escHtml(r.cfop) + '</td>';
        html += '<td style="padding:8px;border-bottom:1px solid #ddd;">' + escHtml(r.desc) + '</td>';
        html += '<td style="padding:8px;border-bottom:1px solid #ddd;">' + escHtml(r.fin) + '</td>';
        html += '<td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">' + r.qtd + '</td>';
        html += '<td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;font-weight:600;">' +
          r.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</td></tr>';
      });
      html += '</tbody><tfoot><tr><td colspan="4" style="padding:10px;text-align:right;font-weight:700;">Subtotal:</td>';
      html += '<td style="padding:10px;text-align:right;font-weight:700;">R$ ' +
        s.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</td></tr></tfoot></table></div>';
    });
    html += '<div style="border-top:2px solid #1a1a2e;padding-top:12px;margin-top:16px;text-align:right;font-size:14px;font-weight:700;">';
    html += 'Total Geral: R$ ' + data.totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</div></div>';
    const old = document.getElementById('print-supplier-report');
    if (old) old.remove();
    const div = document.createElement('div');
    div.id = 'print-supplier-report';
    div.innerHTML = html;
    document.body.appendChild(div);
    document.body.classList.add('supplier-printing');
    const cleanup = () => {
      document.body.classList.remove('supplier-printing');
      div.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  function exportSupplierPdf() {
    exportSupplierPdfFromData(buildSelectedSupplierReportData());
  }
`;
}

function patchApp(file, rowFinExpr, col3Label) {
  let js = fs.readFileSync(file, "utf8");
  const start = js.indexOf("  function printBySupplier() {");
  if (start < 0) throw new Error("printBySupplier not found: " + file);
  const end = js.indexOf("\n  function closeDrilldown()", start);
  if (end < 0) throw new Error("closeDrilldown not found after print: " + file);
  const replacement =
    EXPORT_HELPER +
    makeBuilderAndPrint(rowFinExpr, col3Label);
  js = js.slice(0, start) + replacement + js.slice(end);
  if (!js.includes("window.exportSupplierPdf")) {
    js = js.replace(
      "window.printBySupplier = printBySupplier;",
      "window.printBySupplier = printBySupplier;\n  window.exportSupplierPdf = exportSupplierPdf;"
    );
  }
  fs.writeFileSync(file, js);
  console.log("APP", path.basename(file));
}

const root = "c:/Users/trind/Desktop/dashboards";
patchHtml(path.join(root, "DASH/du lanches/du-lanche.html"));
patchHtml(path.join(root, "egaplast att com cfop/EGAPLAST.html"));
patchApp(
  path.join(root, "DASH/du lanches/du-lanche-app.js"),
  `const info = getCfopInfo(c.cfop);
        const desc = info.descricao;
        const fin = info.finalidade || cfopFinalidadeFromItem(c);`,
  "Finalidade"
);
patchApp(
  path.join(root, "egaplast att com cfop/egaplast-app.js"),
  `const desc = cfopDescricaoFromItem(c);
        const fin = cfopGrupoFromItem(c);`,
  "Grupo"
);
console.log("OK");
