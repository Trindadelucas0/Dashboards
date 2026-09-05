import { appendSheet, exportFileName, fmtBrl, getXlsx, newPdf, roundMoney } from "./exportLibs";

export type VendasExportInput = {
  companyName: string;
  competencia: string;
  unidade: string;
  total: number;
  receitaBruta: number;
  nfs: number;
  ticketMedio: number | null;
  ufSaidas: { uf: string; total: number; pct: number }[];
  cfopSaidas: { cfop: string; descricao?: string; qtd: number; total: number }[];
  clientes: { nome: string; uf: string; total: number; qtd?: number; cnpj?: string; tipoDoc?: string }[];
  vendasPorDoc?: {
    cpf?: { total: number; qtd: number; pct: number | null };
    cnpj?: { total: number; qtd: number; pct: number | null };
    outros?: { total: number; qtd: number; pct: number | null };
  };
};

function money(v: number) {
  return `R$ ${fmtBrl(v)}`;
}

function pctLabel(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(2).replace(".", ",")}%`;
}

export async function exportVendasPdf(data: VendasExportInput) {
  const pdf = await newPdf("portrait");
  const margin = 14;
  let y = margin;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("Relatorio geral de vendas", margin, y);
  y += 7;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(80, 80, 80);
  pdf.text(
    `${data.companyName} — ${data.competencia} — ${data.unidade} — ${new Date().toLocaleDateString("pt-BR")}`,
    margin,
    y,
  );
  y += 8;
  pdf.setTextColor(0, 0, 0);
  pdf.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Indicador", "Valor"]],
    body: [
      ["Total saidas", money(data.total)],
      ["Receita bruta", money(data.receitaBruta)],
      ["NFs", String(data.nfs || 0)],
      ["Ticket medio", data.ticketMedio != null ? money(data.ticketMedio) : "—"],
      ["Vendas CPF", `${money(data.vendasPorDoc?.cpf?.total || 0)} (${pctLabel(data.vendasPorDoc?.cpf?.pct)})`],
      ["Vendas CNPJ", `${money(data.vendasPorDoc?.cnpj?.total || 0)} (${pctLabel(data.vendasPorDoc?.cnpj?.pct)})`],
    ],
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [34, 163, 41], textColor: 255 },
  });
  y = (pdf.lastAutoTable?.finalY || y) + 8;
  pdf.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [["UF", "Valor (R$)", "%"]],
    body: (data.ufSaidas || []).map((u) => [u.uf, money(u.total), pctLabel(u.pct)]),
    styles: { fontSize: 7, cellPadding: 1.4 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  });
  y = (pdf.lastAutoTable?.finalY || y) + 8;
  pdf.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [["CFOP", "Descricao", "Qtd NF", "Valor (R$)"]],
    body: (data.cfopSaidas || []).map((c) => [c.cfop, c.descricao || "—", String(c.qtd || 0), money(c.total)]),
    styles: { fontSize: 7, cellPadding: 1.4, overflow: "linebreak" },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
  });
  y = (pdf.lastAutoTable?.finalY || y) + 8;
  pdf.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [["#", "Cliente", "Doc", "Tipo", "UF", "NFs", "Valor (R$)"]],
    body: (data.clientes || []).map((c, i) => [
      String(i + 1),
      c.nome || "—",
      c.cnpj || "—",
      (c.tipoDoc || "").toUpperCase() || "—",
      c.uf || "—",
      String(c.qtd || 0),
      money(c.total),
    ]),
    styles: { fontSize: 6.5, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: { fillColor: [15, 118, 110], textColor: 255 },
    columnStyles: { 5: { halign: "right" }, 6: { halign: "right" } },
  });
  pdf.save(exportFileName(["vendas", data.companyName, data.competencia], "pdf"));
}

export async function exportVendasExcel(data: VendasExportInput) {
  const XLSX = await getXlsx();
  const emitido = new Date().toLocaleDateString("pt-BR");
  const resumo: (string | number)[][] = [
    ["Relatório geral de vendas"],
    ["Empresa", data.companyName],
    ["Competência", data.competencia],
    ["Unidade", data.unidade],
    ["Emitido em", emitido],
    [],
    ["Indicador", "Valor"],
    ["Total saídas (R$)", roundMoney(data.total)],
    ["Receita bruta (R$)", roundMoney(data.receitaBruta)],
    ["NFs", data.nfs || 0],
    ["Ticket médio (R$)", data.ticketMedio != null ? roundMoney(data.ticketMedio) : "—"],
    ["Vendas CPF (R$)", roundMoney(data.vendasPorDoc?.cpf?.total || 0)],
    ["Vendas CPF %", data.vendasPorDoc?.cpf?.pct ?? "—"],
    ["Vendas CNPJ (R$)", roundMoney(data.vendasPorDoc?.cnpj?.total || 0)],
    ["Vendas CNPJ %", data.vendasPorDoc?.cnpj?.pct ?? "—"],
  ];
  const uf: (string | number)[][] = [["UF", "Valor (R$)", "%"]];
  for (const u of data.ufSaidas || []) uf.push([u.uf, roundMoney(u.total), u.pct]);
  const cfop: (string | number)[][] = [["CFOP", "Descrição", "Qtd NF", "Valor (R$)"]];
  for (const c of data.cfopSaidas || []) cfop.push([c.cfop, c.descricao || "—", c.qtd || 0, roundMoney(c.total)]);
  const cli: (string | number)[][] = [["#", "Cliente", "Documento", "Tipo", "UF", "NFs", "Valor (R$)"]];
  (data.clientes || []).forEach((c, i) => {
    cli.push([
      i + 1,
      c.nome || "—",
      c.cnpj || "—",
      (c.tipoDoc || "").toUpperCase() || "—",
      c.uf || "—",
      c.qtd || 0,
      roundMoney(c.total),
    ]);
  });
  const wb = XLSX.utils.book_new();
  appendSheet(XLSX, wb, "Resumo", resumo);
  appendSheet(XLSX, wb, "UF", uf);
  appendSheet(XLSX, wb, "CFOP", cfop);
  appendSheet(XLSX, wb, "Clientes", cli);
  XLSX.writeFile(wb, exportFileName(["vendas", data.companyName, data.competencia], "xlsx"));
}
