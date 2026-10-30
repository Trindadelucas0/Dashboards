import { appendSheet, exportFileName, fmtBrl, getXlsx, newPdf, roundMoney } from "./exportLibs";
import { consolidateNfeLines, fetchNfeLines } from "./nfeExport";

export type FinalidadeExportInput = {
  empresaId?: string;
  companyName: string;
  competencia: string;
  unidade: string;
  totalCompras: number;
  nfsEntradas: number;
  macro: { label: string; total: number; pct: number }[];
  cfopDados: {
    cfop: string;
    descricao?: string;
    finalidade?: string;
    creditoPisCofins?: boolean;
    qtd: number;
    total: number;
    fornecedores?: { nome: string; cnpj: string; uf: string; qtd: number; total: number }[];
  }[];
};

function money(v: number) {
  return `R$ ${fmtBrl(v)}`;
}

export async function exportFinalidadePdf(data: FinalidadeExportInput) {
  const pdf = await newPdf("landscape");
  const margin = 12;
  let y = margin;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("Relatorio de finalidade de compras", margin, y);
  y += 7;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(80, 80, 80);
  pdf.text(
    `${data.companyName} — ${data.competencia} — ${data.unidade} — Total ${money(data.totalCompras)} — ${data.nfsEntradas} NFs`,
    margin,
    y,
  );
  y += 8;
  pdf.setTextColor(0, 0, 0);
  pdf.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Finalidade / grupo", "Valor (R$)", "%"]],
    body: (data.macro || []).map((m) => [m.label, money(m.total), `${Number(m.pct || 0).toFixed(1)}%`]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [34, 163, 41], textColor: 255 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  });
  y = (pdf.lastAutoTable?.finalY || y) + 8;
  pdf.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [["CFOP", "Descricao", "Finalidade", "Cred. PIS/COFINS", "NFs", "Valor (R$)", "%"]],
    body: (data.cfopDados || []).map((c) => [
      c.cfop,
      c.descricao || "—",
      c.finalidade || "—",
      c.creditoPisCofins ? "Sim" : "Nao",
      String(c.qtd || 0),
      money(c.total),
      data.totalCompras ? `${((c.total / data.totalCompras) * 100).toFixed(1)}%` : "—",
    ]),
    styles: { fontSize: 7, cellPadding: 1.3, overflow: "linebreak" },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
  });
  pdf.save(exportFileName(["finalidade-compras", data.companyName, data.competencia], "pdf"));
}

export async function exportFinalidadeExcel(data: FinalidadeExportInput) {
  if (!data.empresaId) throw new Error("Empresa não identificada para consultar as notas de entrada.");
  const lines = await fetchNfeLines({
    empresaId: data.empresaId,
    competencia: data.competencia,
    unidade: data.unidade,
    tipo: "entradas",
  });
  const detalhes = consolidateNfeLines(lines.items || [], data.competencia, data.unidade);
  const XLSX = await getXlsx();
  const emitido = new Date().toLocaleDateString("pt-BR");
  const resumo: (string | number)[][] = [
    ["Relatório de finalidade de compras"],
    ["Empresa", data.companyName],
    ["Competência", data.competencia],
    ["Unidade", data.unidade],
    ["Total compras (R$)", roundMoney(data.totalCompras)],
    ["NFs", data.nfsEntradas || 0],
    ["Emitido em", emitido],
    [],
    ["Finalidade / grupo", "Valor (R$)", "%"],
  ];
  for (const m of data.macro || []) {
    resumo.push([m.label, roundMoney(m.total), m.pct]);
  }
  const cfop: (string | number)[][] = [
    ["CFOP", "Descrição", "Finalidade", "Créd. PIS/COFINS", "NFs", "Valor (R$)", "%"],
  ];
  for (const c of data.cfopDados || []) {
    cfop.push([
      c.cfop,
      c.descricao || "—",
      c.finalidade || "—",
      c.creditoPisCofins ? "Sim" : "Não",
      c.qtd || 0,
      roundMoney(c.total),
      data.totalCompras ? roundMoney((c.total / data.totalCompras) * 100) : "—",
    ]);
  }
  const forn: (string | number)[][] = [
    ["Competência", "Unidade", "Nº da Nota", "Série", "CFOP", "Fornecedor", "CNPJ", "UF", "Valor (R$)"],
  ];
  if (detalhes.length) {
    for (const r of detalhes) {
      forn.push([
        r.competencia,
        r.unidade,
        r.nota,
        r.serie,
        r.cfop,
        r.nome,
        r.doc,
        r.uf,
        roundMoney(r.valor),
      ]);
    }
  } else {
    for (const c of data.cfopDados || []) {
      for (const f of c.fornecedores || []) {
        forn.push([
          data.competencia,
          data.unidade,
          "—",
          "—",
          c.cfop,
          f.nome || "—",
          f.cnpj || "—",
          f.uf || "—",
          roundMoney(f.total),
        ]);
      }
    }
  }
  const wb = XLSX.utils.book_new();
  appendSheet(XLSX, wb, "Resumo", resumo);
  appendSheet(XLSX, wb, "CFOP", cfop);
  appendSheet(XLSX, wb, "Fornecedores", forn);
  XLSX.writeFile(wb, exportFileName(["finalidade-compras", data.companyName, data.competencia], "xlsx"));
}
