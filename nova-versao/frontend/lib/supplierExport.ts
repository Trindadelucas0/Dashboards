import type { SupplierReportData } from "./supplierReport";

function escHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtBrl(v: number) {
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeFilePart(s: string, max = 24) {
  return String(s || "empresa")
    .slice(0, max)
    .replace(/[\\/:*?"<>|]/g, "");
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(script);
  });
}

type JsPdfDoc = {
  internal: { pageSize: { getHeight: () => number } };
  setFont: (n: string, s: string) => void;
  setFontSize: (n: number) => void;
  setTextColor: (...n: number[]) => void;
  text: (t: string, x: number, y: number) => void;
  addPage: () => void;
  autoTable: (opts: Record<string, unknown>) => void;
  lastAutoTable?: { finalY: number };
  save: (name: string) => void;
};

type JsPdfNs = {
  jsPDF: new (opts: { orientation: string; unit: string; format: string }) => JsPdfDoc;
};

type XlsxNs = {
  utils: {
    book_new: () => unknown;
    aoa_to_sheet: (rows: (string | number)[][]) => { "!cols"?: { wch: number }[] };
    book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
  };
  writeFile: (wb: unknown, name: string) => void;
};

declare global {
  interface Window {
    jspdf?: JsPdfNs;
    XLSX?: XlsxNs;
  }
}

async function loadPdfLibs() {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
  const Ctor = window.jspdf?.jsPDF as (JsPdfNs["jsPDF"] & { prototype?: { autoTable?: unknown } }) | undefined;
  if (!Ctor) throw new Error("Biblioteca jsPDF nao carregada.");
  if (typeof Ctor.prototype?.autoTable !== "function") {
    throw new Error("Biblioteca jspdf-autotable nao carregada.");
  }
}

async function loadXlsxLib() {
  await loadScript("https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js");
  if (!window.XLSX) throw new Error("Biblioteca XLSX nao carregada.");
}

function buildPrintHtml(data: SupplierReportData) {
  const emitido = new Date().toLocaleDateString("pt-BR");
  let html =
    '<div class="supplier-print-root" style="font-family:Inter,sans-serif;padding:0;margin:0;color:#1a1a2e;background:#fff;width:100%;max-width:100%;box-sizing:border-box;">';
  html += '<h1 style="font-size:18px;margin-bottom:4px;">Relatório por Fornecedor</h1>';
  html += `<p style="font-size:12px;color:#555;margin-bottom:24px;">${escHtml(data.companyName)} — Competência ${escHtml(data.competencia)} — ${escHtml(emitido)}</p>`;
  for (const s of data.suppliers) {
    html += '<div class="supplier-print-block" style="margin-bottom:12px;page-break-inside:auto;width:100%;max-width:100%;box-sizing:border-box;">';
    html += `<h2 style="font-size:14px;border-bottom:2px solid #22a329;padding-bottom:6px;">${escHtml(s.nome)}</h2>`;
    html += `<p style="font-size:11px;color:#555;">CNPJ: ${escHtml(s.cnpj)} · UF: ${escHtml(s.uf)}</p>`;
    html += '<table style="width:100%;max-width:100%;border-collapse:collapse;margin-top:8px;font-size:10px;table-layout:fixed;"><colgroup><col class="cfop"><col class="desc"><col class="fin"><col class="qtd"><col class="val"></colgroup>';
    html += `<thead><tr style="background:#f0f0f0;"><th style="padding:4px 5px;text-align:left;">CFOP</th><th style="padding:4px 5px;text-align:left;">Descrição</th><th style="padding:4px 5px;text-align:left;">${escHtml(data.col3Label)}</th><th style="padding:4px 5px;text-align:right;">Qtd NFs</th><th style="padding:4px 5px;text-align:right;">Valor (R$)</th></tr></thead><tbody>`;
    for (const r of s.rows) {
      html += `<tr><td style="padding:4px 5px;border-bottom:1px solid #ddd;word-wrap:break-word;">${escHtml(r.cfop)}</td>`;
      html += `<td style="padding:4px 5px;border-bottom:1px solid #ddd;word-wrap:break-word;">${escHtml(r.desc)}</td>`;
      html += `<td style="padding:4px 5px;border-bottom:1px solid #ddd;word-wrap:break-word;">${escHtml(r.fin)}</td>`;
      html += `<td style="padding:4px 5px;border-bottom:1px solid #ddd;word-wrap:break-word;text-align:right;">${r.qtd}</td>`;
      html += `<td style="padding:4px 5px;border-bottom:1px solid #ddd;word-wrap:break-word;text-align:right;font-weight:600;">${fmtBrl(r.total)}</td></tr>`;
    }
    html += `</tbody><tfoot><tr><td colspan="4" style="padding:6px 5px;text-align:right;font-weight:700;">Subtotal:</td><td style="padding:6px 5px;text-align:right;font-weight:700;">R$ ${fmtBrl(s.subtotal)}</td></tr></tfoot></table></div>`;
  }
  html += `<div style="border-top:2px solid #1a1a2e;padding-top:12px;margin-top:16px;text-align:right;font-size:14px;font-weight:700;">Total Geral: R$ ${fmtBrl(data.totalGeral)}</div></div>`;
  return html;
}

export function printSupplierReport(data: SupplierReportData) {
  const old = document.getElementById("print-supplier-report");
  if (old) old.remove();
  const div = document.createElement("div");
  div.id = "print-supplier-report";
  div.innerHTML = buildPrintHtml(data);
  document.body.appendChild(div);
  document.body.classList.add("supplier-printing");
  const cleanup = () => {
    document.body.classList.remove("supplier-printing");
    div.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

export async function exportSupplierPdf(data: SupplierReportData) {
  await loadPdfLibs();
  const { jsPDF } = window.jspdf as JsPdfNs;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 14;
  const pageH = pdf.internal.pageSize.getHeight();
  let y = margin;
  const money = (v: number) => `R$ ${fmtBrl(v)}`;
  const ensureSpace = (need: number) => {
    if (y + need > pageH - margin) {
      pdf.addPage();
      y = margin;
    }
  };
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("Relatorio por Fornecedor", margin, y);
  y += 7;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(80, 80, 80);
  pdf.text(
    `${data.companyName} — Competencia ${data.competencia} — ${new Date().toLocaleDateString("pt-BR")}`,
    margin,
    y,
  );
  y += 10;
  pdf.setTextColor(0, 0, 0);
  for (const s of data.suppliers) {
    ensureSpace(20);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text(String(s.nome || "").slice(0, 90), margin, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`CNPJ: ${s.cnpj} · UF: ${s.uf}`, margin, y);
    y += 4;
    pdf.setTextColor(0, 0, 0);
    pdf.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: "auto",
      head: [["CFOP", "Descricao", data.col3Label, "Qtd NFs", "Valor (R$)"]],
      body: s.rows.map((r) => [r.cfop, r.desc, r.fin, String(r.qtd), money(r.total)]),
      foot: [["", "", "", "Subtotal:", money(s.subtotal)]],
      styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: [34, 163, 41], textColor: 255 },
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
      columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
    });
    y = (pdf.lastAutoTable?.finalY || y) + 8;
  }
  ensureSpace(12);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(`Total Geral: ${money(data.totalGeral)}`, margin, y);
  pdf.save(`relatorio-fornecedor-${safeFilePart(data.companyName)}.pdf`);
}

function autoColWidths(aoa: (string | number)[][], maxWch = 50) {
  const widths: number[] = [];
  for (const row of aoa) {
    row.forEach((cell, c) => {
      const len = String(cell ?? "").length + 2;
      widths[c] = Math.min(Math.max(widths[c] || 10, len), maxWch);
    });
  }
  return widths.map((wch) => ({ wch }));
}

export async function exportSupplierExcel(data: SupplierReportData) {
  await loadXlsxLib();
  const XLSX = window.XLSX as XlsxNs;
  const emitido = new Date().toLocaleDateString("pt-BR");
  const col3 = data.col3Label || "Finalidade";
  const resumo: (string | number)[][] = [
    ["Relatório por Fornecedor"],
    ["Empresa", data.companyName || ""],
    ["Competência", data.competencia || ""],
    ["Emitido em", emitido],
    [],
    ["Fornecedor", "CNPJ", "UF", "Subtotal (R$)"],
  ];
  for (const s of data.suppliers) {
    resumo.push([s.nome || "", s.cnpj || "—", s.uf || "—", Math.round(Number(s.subtotal || 0) * 100) / 100]);
  }
  resumo.push(["Total Geral", "", "", Math.round(Number(data.totalGeral || 0) * 100) / 100]);
  const detalhado: (string | number)[][] = [
    ["Fornecedor", "CNPJ", "UF", "CFOP", "Descrição", col3, "Qtd NFs", "Valor (R$)"],
  ];
  for (const s of data.suppliers) {
    for (const r of s.rows || []) {
      detalhado.push([
        s.nome || "",
        s.cnpj || "—",
        s.uf || "—",
        r.cfop || "",
        r.desc || "—",
        r.fin || "—",
        Number(r.qtd || 0),
        Math.round(Number(r.total || 0) * 100) / 100,
      ]);
    }
  }
  const wb = XLSX.utils.book_new();
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo);
  wsResumo["!cols"] = autoColWidths(resumo, 45);
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");
  const wsDet = XLSX.utils.aoa_to_sheet(detalhado);
  wsDet["!cols"] = autoColWidths(detalhado, 50);
  XLSX.utils.book_append_sheet(wb, wsDet, "Detalhado");
  const safeComp = String(data.competencia || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 32);
  const safeDate = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
  const parts = ["relatorio-fornecedor", safeFilePart(data.companyName), safeComp, safeDate].filter(Boolean);
  XLSX.writeFile(wb, `${parts.join("_")}.xlsx`);
}
