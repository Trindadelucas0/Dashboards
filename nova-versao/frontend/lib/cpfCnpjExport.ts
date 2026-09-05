import { api } from "./api";
import { appendSheet, exportFileName, getXlsx, roundMoney } from "./exportLibs";

export type CpfCnpjCliente = {
  nome: string;
  uf: string;
  total: number;
  qtd?: number;
  cnpj?: string;
  tipoDoc?: string;
};

export type VendasPorDoc = {
  cpf?: { total: number; qtd: number; pct: number | null };
  cnpj?: { total: number; qtd: number; pct: number | null };
  outros?: { total: number; qtd: number; pct: number | null };
};

type NfeLineItem = {
  competencia?: string;
  nota: string;
  serie: string;
  nome: string;
  doc: string;
  tipoDoc: string;
  uf: string;
  cfop: string;
  valor: number;
};

export async function exportCpfCnpjExcel(opts: {
  empresaId: string;
  companyName: string;
  competencia: string;
  unidade: string;
  total: number;
  clientes: CpfCnpjCliente[];
  vendasPorDoc?: VendasPorDoc;
}) {
  const lines = await api<{ items: NfeLineItem[] }>(
    `/api/companies/${opts.empresaId}/months/${encodeURIComponent(opts.competencia)}/nfe-lines?unidade=${encodeURIComponent(opts.unidade || "matriz")}&tipo=saidas`,
  );
  const XLSX = await getXlsx();
  const emitido = new Date().toLocaleDateString("pt-BR");
  const por = opts.vendasPorDoc || {};
  const resumo: (string | number)[][] = [
    ["Vendas CPF × CNPJ — detalhado"],
    ["Empresa", opts.companyName],
    ["Competência", opts.competencia],
    ["Unidade", opts.unidade],
    ["Total vendas (R$)", roundMoney(opts.total)],
    ["Emitido em", emitido],
    ["Regra", "CPF = 11 dígitos; CNPJ = 14 dígitos; demais = outros"],
    [],
    ["Tipo", "Valor (R$)", "NFs", "% sobre vendas"],
    ["CPF", roundMoney(por.cpf?.total || 0), por.cpf?.qtd || 0, por.cpf?.pct ?? "—"],
    ["CNPJ", roundMoney(por.cnpj?.total || 0), por.cnpj?.qtd || 0, por.cnpj?.pct ?? "—"],
    ["Outros", roundMoney(por.outros?.total || 0), por.outros?.qtd || 0, por.outros?.pct ?? "—"],
  ];
  const cli: (string | number)[][] = [["Cliente", "Documento", "Tipo", "UF", "NFs", "Valor (R$)", "% vendas"]];
  for (const c of opts.clientes || []) {
    cli.push([
      c.nome || "—",
      c.cnpj || "—",
      (c.tipoDoc || "").toUpperCase() || "—",
      c.uf || "—",
      c.qtd || 0,
      roundMoney(c.total),
      opts.total ? roundMoney((c.total / opts.total) * 100) : "—",
    ]);
  }
  const det: (string | number)[][] = [
    ["Competência", "Nota", "Série", "Cliente", "Documento", "Tipo", "UF", "CFOP", "Valor (R$)"],
  ];
  for (const r of lines.items || []) {
    det.push([
      r.competencia || opts.competencia,
      r.nota || "",
      r.serie || "",
      r.nome || "—",
      r.doc || "—",
      (r.tipoDoc || "").toUpperCase() || "—",
      r.uf || "—",
      r.cfop || "",
      roundMoney(r.valor),
    ]);
  }
  const wb = XLSX.utils.book_new();
  appendSheet(XLSX, wb, "Resumo", resumo);
  appendSheet(XLSX, wb, "Clientes", cli);
  appendSheet(XLSX, wb, "Linhas NF", det, 28);
  XLSX.writeFile(wb, exportFileName(["vendas-cpf-cnpj", opts.companyName, opts.competencia], "xlsx"));
}
