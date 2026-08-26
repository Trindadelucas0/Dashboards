export type CfopFornecedor = {
  nome: string;
  cnpj?: string;
  uf?: string;
  qtd?: number;
  total?: number;
};

export type CfopDado = {
  cfop: string;
  descricao?: string;
  finalidade?: string;
  grupo?: string;
  qtd?: number;
  total?: number;
  fornecedores?: CfopFornecedor[];
};

export type SupplierOption = {
  key: string;
  nome: string;
  cnpj: string;
  uf: string;
};

export type ReportRow = {
  cfop: string;
  desc: string;
  fin: string;
  qtd: number;
  total: number;
};

export type ReportSupplier = {
  nome: string;
  cnpj: string;
  uf: string;
  rows: ReportRow[];
  subtotal: number;
};

export type SupplierReportData = {
  suppliers: ReportSupplier[];
  totalGeral: number;
  companyName: string;
  competencia: string;
  col3Label: string;
};

export type SupplierReportResult = { error: string } | SupplierReportData;

export function supplierKey(f: { cnpj?: string; nome?: string }): string {
  const cnpj = String(f.cnpj || "").trim();
  if (cnpj && cnpj !== "—") return cnpj;
  return String(f.nome || "").trim();
}

export function collectUniqueSuppliers(cfopDados: CfopDado[]): SupplierOption[] {
  const map = new Map<string, SupplierOption>();
  for (const cfop of cfopDados) {
    for (const f of cfop.fornecedores || []) {
      const key = supplierKey(f);
      if (!key || map.has(key)) continue;
      map.set(key, {
        key,
        nome: f.nome || "—",
        cnpj: f.cnpj || "—",
        uf: f.uf || "—",
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function cfopLabels(c: CfopDado): { desc: string; fin: string } {
  return {
    desc: c.descricao || `CFOP ${c.cfop}`,
    fin: c.finalidade || c.grupo || "—",
  };
}

export function rowsForSupplier(cfopDados: CfopDado[], key: string, nome: string): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const c of cfopDados) {
    const f = (c.fornecedores || []).find((x) => supplierKey(x) === key || x.nome === nome);
    if (!f) continue;
    const { desc, fin } = cfopLabels(c);
    rows.push({
      cfop: c.cfop,
      desc,
      fin,
      qtd: Number(f.qtd || 0),
      total: Number(f.total || 0),
    });
  }
  return rows.sort((a, b) => b.total - a.total);
}

export function aggregateDemaisByCfop(cfopDados: CfopDado[], selectedKeys: Set<string>): ReportRow[] {
  const map: Record<string, ReportRow> = {};
  for (const c of cfopDados) {
    for (const f of c.fornecedores || []) {
      const key = supplierKey(f);
      if (!key || selectedKeys.has(key)) continue;
      if (!map[c.cfop]) {
        const { desc, fin } = cfopLabels(c);
        map[c.cfop] = { cfop: c.cfop, desc, fin, qtd: 0, total: 0 };
      }
      map[c.cfop].qtd += Number(f.qtd || 0);
      map[c.cfop].total += Number(f.total || 0);
    }
  }
  return Object.values(map)
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function buildSupplierReport(opts: {
  selected: SupplierOption[];
  includeDemais: boolean;
  cfopDados: CfopDado[];
  companyName: string;
  competencia: string;
}): SupplierReportResult {
  const { selected, includeDemais, cfopDados, companyName, competencia } = opts;
  if (!selected.length && !includeDemais) {
    return { error: 'Selecione ao menos um fornecedor ou marque "Demais fornecedores".' };
  }
  if (!cfopDados.length) {
    return { error: "Sem entradas para a competência selecionada." };
  }
  const selectedKeys = new Set(selected.map((s) => s.key));
  const suppliers: ReportSupplier[] = [];
  let totalGeral = 0;
  for (const s of selected) {
    const rows = rowsForSupplier(cfopDados, s.key, s.nome);
    const subtotal = rows.reduce((sum, r) => sum + r.total, 0);
    if (!rows.length) continue;
    totalGeral += subtotal;
    suppliers.push({
      nome: s.nome,
      cnpj: s.cnpj || "—",
      uf: s.uf || "—",
      rows,
      subtotal,
    });
  }
  if (includeDemais) {
    const demaisRows = aggregateDemaisByCfop(cfopDados, selectedKeys);
    const subtotal = demaisRows.reduce((sum, r) => sum + r.total, 0);
    if (demaisRows.length) {
      totalGeral += subtotal;
      suppliers.push({
        nome: "Demais fornecedores",
        cnpj: "—",
        uf: "—",
        rows: demaisRows,
        subtotal,
      });
    }
  }
  if (totalGeral <= 0) {
    return { error: "Nenhum dado encontrado para os fornecedores selecionados neste período." };
  }
  return {
    suppliers,
    totalGeral,
    companyName,
    competencia,
    col3Label: "Finalidade",
  };
}

export function isSupplierReportError(r: SupplierReportResult): r is { error: string } {
  return "error" in r;
}
