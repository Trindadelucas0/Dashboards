const fs = require("fs");
const path = require("path");

const root = "c:/Users/trind/Desktop/dashboards";
const AUTOTABLE =
  '  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>\n';

function ensureAutotable(html) {
  if (html.includes("jspdf-autotable")) return html;
  return html.replace(
    /(<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\/2\.5\.1\/jspdf\.umd\.min\.js"><\/script>\s*)/,
    "$1" + AUTOTABLE
  );
}

function addModalPdfButton(html) {
  if (html.includes("exportSupplierPdf()")) return html;
  return html.replace(
    /(<button type="button" class="btn-confirm" onclick="printBySupplier\(\)"><i class="fas fa-print"><\/i> Imprimir Selecionados<\/button>)/,
    '$1\n      <button type="button" class="btn-confirm btn-pdf-supplier" onclick="exportSupplierPdf()" title="Baixar PDF dos selecionados" style="background:#ef4444;"><i class="fas fa-file-pdf"></i> Baixar PDF</button>'
  );
}

const LOJA_EXPORT = `
  function buildLojaSupplierReportData(selected) {
    const suppliers = [];
    let totalGeral = 0;
    selected.forEach((cb) => {
      const cnpj = cb.value;
      const nome = cb.dataset.nome;
      const rows = [];
      let subtotal = 0;
      let uf = '—';
      (CFOP_DADOS || []).forEach((cfop) => {
        const f = (cfop.fornecedores || []).find((x) => x.cnpj === cnpj);
        if (!f) return;
        const info = (CFOP_FINALIDADE[cfop.cfop] || {});
        rows.push({
          cfop: cfop.cfop,
          desc: info.descricao || '—',
          fin: info.finalidade || '—',
          qtd: f.qtd,
          total: f.total,
        });
        subtotal += f.total;
        uf = f.uf || uf;
      });
      totalGeral += subtotal;
      suppliers.push({ nome: nome, cnpj: cnpj, uf: uf, rows: rows, subtotal: subtotal });
    });
    return {
      suppliers: suppliers,
      totalGeral: totalGeral,
      companyName: getCompanyName(),
      competencia: (typeof periodFull === 'function' ? periodFull() : (EMPRESA && EMPRESA.periodo)) || '—',
      col3Label: 'Finalidade',
    };
  }

  function exportSupplierPdf() {
    const selected = Array.from(document.querySelectorAll('#supplierList input:checked'));
    if (!selected.length) { alert('Selecione ao menos um fornecedor.'); return; }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('Biblioteca jsPDF nao carregada.');
      return;
    }
    if (typeof window.jspdf.jsPDF.prototype.autoTable !== 'function') {
      alert('Biblioteca jspdf-autotable nao carregada.');
      return;
    }
    const data = buildLojaSupplierReportData(selected);
    if (data.totalGeral <= 0) {
      alert('Nenhum dado encontrado para os fornecedores selecionados neste período.');
      return;
    }
    closeSupplierModal();
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
    const safe = String(data.companyName || 'loja').slice(0, 24).replace(/[\\/:*?"<>|]/g, '');
    pdf.save('relatorio-fornecedor-' + safe + '.pdf');
  }
`;

const UNICA_EXPORT = `
  window.buildUnicaSupplierReportData = function () {
    const selected = Array.from(document.querySelectorAll('#supplierList input[type="checkbox"]:checked'));
    const includeDemais = document.getElementById('includeDemaisFornecedores')?.checked;
    if (!selected.length && !includeDemais) {
      return { error: 'Selecione ao menos um fornecedor ou marque "Demais fornecedores".' };
    }
    const periodKey = getSupplierReportPeriodKey();
    const cfopDados = getCfopDadosForPrint();
    if (!cfopDados.length) return { error: 'Sem entradas para a competência selecionada.' };
    const selectedKeys = new Set(selected.map((cb) => cb.dataset.key || cb.dataset.nome || cb.value));
    const suppliers = [];
    let totalGeral = 0;
    selected.forEach((cb) => {
      const key = cb.dataset.key || cb.dataset.nome || cb.value;
      const nome = cb.dataset.nome || '';
      const cnpj = cb.value || '—';
      const uf = cb.dataset.uf || '—';
      const rows = rowsForSupplier(cfopDados, key, nome);
      const subtotal = rows.reduce((s, r) => s + r.total, 0);
      if (!rows.length) return;
      totalGeral += subtotal;
      suppliers.push({ nome: nome, cnpj: cnpj, uf: uf, rows: rows, subtotal: subtotal });
    });
    if (includeDemais) {
      const demaisRows = aggregateDemaisByCfop(cfopDados, selectedKeys);
      const subtotal = demaisRows.reduce((s, r) => s + r.total, 0);
      if (demaisRows.length) {
        totalGeral += subtotal;
        suppliers.push({ nome: 'Demais fornecedores', cnpj: '—', uf: '—', rows: demaisRows, subtotal: subtotal });
      }
    }
    if (totalGeral <= 0) {
      return { error: 'Nenhum dado encontrado para os fornecedores selecionados neste período.' };
    }
    return {
      suppliers: suppliers,
      totalGeral: totalGeral,
      companyName: getCompanyName(),
      competencia: periodLabelForReport(periodKey),
      col3Label: 'Finalidade',
    };
  };

  window.exportSupplierPdf = function () {
    const data = buildUnicaSupplierReportData();
    if (data.error) { alert(data.error); return; }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('Biblioteca jsPDF nao carregada.');
      return;
    }
    if (typeof window.jspdf.jsPDF.prototype.autoTable !== 'function') {
      alert('Biblioteca jspdf-autotable nao carregada.');
      return;
    }
    closeSupplierModal();
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
    pdf.text(data.companyName + ' — Competencia ' + data.competencia + ' — ' + new Date().toLocaleDateString('pt-BR'), margin, y);
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
    const safe = String(data.companyName || 'unica').slice(0, 24).replace(/[\\/:*?"<>|]/g, '');
    pdf.save('relatorio-fornecedor-' + safe + '.pdf');
  };
`;

// --- Loja Máquinas ---
{
  const file = path.join(root, "lojja/LOJA-MAQUINAS.html");
  let html = fs.readFileSync(file, "utf8");
  html = ensureAutotable(html);
  html = addModalPdfButton(html);
  if (!html.includes("function exportSupplierPdf()")) {
    html = html.replace(
      /\n  \/\* -----------------------------------------------\n     INICIALIZA/,
      "\n" + LOJA_EXPORT + "\n  /* -----------------------------------------------\n     INICIALIZA"
    );
  }
  fs.writeFileSync(file, html);
  console.log("LOJA ok");
}

// --- UNICA ---
{
  const htmlFile = path.join(root, "UNICA 10/UNICATINTAS.html");
  let html = fs.readFileSync(htmlFile, "utf8");
  html = ensureAutotable(html);
  html = addModalPdfButton(html);
  fs.writeFileSync(htmlFile, html);

  const appFile = path.join(root, "UNICA 10/unica-app.js");
  let app = fs.readFileSync(appFile, "utf8");
  if (!app.includes("window.exportSupplierPdf")) {
    app = app.replace(
      /  document\.addEventListener\('DOMContentLoaded', \(\) => \{/,
      UNICA_EXPORT + "\n  document.addEventListener('DOMContentLoaded', () => {"
    );
  }
  fs.writeFileSync(appFile, app);
  console.log("UNICA ok");
}

console.log("DONE");
