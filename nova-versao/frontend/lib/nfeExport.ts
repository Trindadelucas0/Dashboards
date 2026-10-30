import { api } from "./api";
import type { NfeLineItem } from "./nfeExportRows";
export { consolidateNfeLines } from "./nfeExportRows";
export type { NfeDetailRow, NfeLineItem } from "./nfeExportRows";

export async function fetchNfeLines(opts: {
  empresaId: string;
  competencia: string;
  unidade: string;
  tipo: "entradas" | "saidas";
}) {
  return api<{ items: NfeLineItem[] }>(
    `/api/companies/${opts.empresaId}/months/${encodeURIComponent(opts.competencia)}/nfe-lines?unidade=${encodeURIComponent(opts.unidade || "matriz")}&tipo=${opts.tipo}`,
  );
}

