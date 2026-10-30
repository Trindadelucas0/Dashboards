export type NfeLineItem = {
  competencia?: string;
  unidade?: string;
  nota?: string;
  serie?: string;
  nome?: string;
  doc?: string;
  tipoDoc?: string;
  uf?: string;
  cfop?: string;
  valor?: number;
};

export type NfeDetailRow = {
  competencia: string;
  unidade: string;
  nota: string;
  serie: string;
  nome: string;
  doc: string;
  tipoDoc: string;
  uf: string;
  cfop: string;
  valor: number;
};

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function consolidateNfeLines(
  items: NfeLineItem[],
  fallbackCompetencia: string,
  fallbackUnidade: string,
): NfeDetailRow[] {
  const grouped = new Map<string, NfeDetailRow>();

  for (const item of items || []) {
    const row: NfeDetailRow = {
      competencia: item.competencia || fallbackCompetencia,
      unidade: item.unidade || fallbackUnidade,
      nota: item.nota || "—",
      serie: item.serie || "—",
      nome: item.nome || "—",
      doc: item.doc || "—",
      tipoDoc: item.tipoDoc || "—",
      uf: item.uf || "—",
      cfop: item.cfop || "—",
      valor: roundMoney(Number(item.valor || 0)),
    };
    const key = [
      row.competencia,
      row.unidade,
      row.nota,
      row.serie,
      row.cfop,
      row.doc,
      row.nome,
      row.uf,
    ].join("\u001f");
    const existing = grouped.get(key);
    if (existing) existing.valor = roundMoney(existing.valor + row.valor);
    else grouped.set(key, row);
  }

  return [...grouped.values()];
}
