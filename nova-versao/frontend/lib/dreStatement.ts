export type DreLine = {
  codigo?: string;
  descricao: string;
  grupo?: string;
  valor: number | null;
};

export type DreMonth = {
  competencia: string;
  label: string;
  hasDre: boolean;
  cmvPendente: boolean;
  receitaBruta?: number | null;
  cmv?: number | null;
  lucBruto?: number | null;
  lucLiq?: number | null;
  margMb?: number | null;
  margMl?: number | null;
  dre?: { linhas?: DreLine[]; hasValores?: boolean; source?: string };
  source?: string;
};

export type DreRowKind = "group" | "line" | "total" | "lucro";

export type DrePivotedRow = {
  key: string;
  descricao: string;
  display: string;
  kind: DreRowKind;
  group: string | null;
  deduction: boolean;
  cmv: boolean;
  pending: boolean;
  number?: string;
  valores: Record<string, number | null>;
  media: number | null;
  acumulado: number | null;
};

const GROUP_RECEITAS = "Receitas";
const GROUP_DEDUCOES = "Deduções da Receita Bruta";
const GROUP_CUSTOS = "Custos";
const GROUP_DESPESAS = "Despesas";
const GROUP_OUTROS = "Outros Resultados";

function foldLabel(text: string) {
  return (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^[\(\)=\+\-\/\s–—−-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function dreLineKey(descricao: string) {
  return foldLabel(descricao);
}

function isSectionOnly(label: string) {
  const key = foldLabel(label);
  return [
    "receitas",
    "deducoes",
    "deducoes da receita bruta",
    "custos",
    "despesas",
    "outras receitas",
    "outros resultados",
  ].includes(key);
}

function isCmvLine(ln: { descricao: string; grupo?: string }) {
  if ((ln.grupo || "").toLowerCase() === "cmv") return true;
  const key = foldLabel(ln.descricao);
  return (
    key === "cmv" ||
    key.includes("custo das mercadorias") ||
    key.includes("custos das mercadorias") ||
    key.includes("custo da mercadoria")
  );
}

export function dreRowClass(ln: { descricao: string; grupo?: string }): {
  kind: DreRowKind;
  group: string | null;
  deduction: boolean;
  cmv: boolean;
} {
  const key = foldLabel(ln.descricao);
  const grupo = (ln.grupo || "").toLowerCase();
  if (
    (key.includes("lucro") || key.includes("prejuizo")) &&
    key.includes("exercicio") &&
    !key.includes("antes") &&
    !key.includes("operacional")
  ) {
    return { kind: "lucro", group: null, deduction: false, cmv: false };
  }
  if (key.includes("receita liquida") || key === "lucro bruto" || key.startsWith("= ")) {
    return { kind: "total", group: null, deduction: false, cmv: false };
  }
  if (isCmvLine(ln)) {
    return { kind: "line", group: GROUP_CUSTOS, deduction: true, cmv: true };
  }
  if (
    key.includes("bonific") ||
    key.includes("subvenc") ||
    key.includes("outras receitas") ||
    key.includes("outros resultados")
  ) {
    return { kind: "line", group: GROUP_OUTROS, deduction: false, cmv: false };
  }
  if (
    key.includes("devoluc") ||
    key.includes("deduc") ||
    key.includes("icms") ||
    key.includes("cofins") ||
    /\bpis\b/.test(key) ||
    key.includes("substituicao") ||
    key.includes("iss ")
  ) {
    return { kind: "line", group: GROUP_DEDUCOES, deduction: true, cmv: false };
  }
  if (
    key.includes("despesa") ||
    key.includes("receitas financeiras") ||
    key.includes("despesas banc")
  ) {
    const finan = key.includes("receitas financeiras");
    return { kind: "line", group: GROUP_DESPESAS, deduction: !finan, cmv: false };
  }
  if (
    grupo === "receita" ||
    key === "receita bruta" ||
    key.includes("venda de mercadorias") ||
    key.includes("vendas de produtos") ||
    key.includes("receita bruta de vendas")
  ) {
    return { kind: "line", group: GROUP_RECEITAS, deduction: false, cmv: false };
  }
  if (grupo === "resultado") {
    return { kind: "total", group: null, deduction: false, cmv: false };
  }
  return { kind: "line", group: null, deduction: false, cmv: false };
}

function withSign(label: string, kind: DreRowKind, deduction: boolean, group: string | null) {
  const raw = (label || "").trim();
  if (/^[\(\)=\+\-]/.test(raw) || raw.startsWith("(–)") || raw.startsWith("(—)")) return raw;
  if (kind === "total" || kind === "lucro") return `(=) ${raw}`;
  if (deduction) return `(-) ${raw}`;
  if (group === GROUP_RECEITAS || group === GROUP_OUTROS || /receitas financeiras/i.test(raw)) {
    return `(+) ${raw}`;
  }
  return raw;
}

export function dreMediaAcumulado(valores: Array<number | null | undefined>) {
  const nums = valores.filter((v): v is number => v != null && !Number.isNaN(v));
  if (!nums.length) return { media: null as number | null, acumulado: null as number | null };
  const acumulado = nums.reduce((a, b) => a + b, 0);
  return { media: acumulado / nums.length, acumulado };
}

export function pivotDreMonths(porMes: DreMonth[]): DrePivotedRow[] {
  const months = porMes.filter((m) => m.hasDre);
  const seen = new Set<string>();
  const union: DreLine[] = [];
  for (const m of months) {
    for (const ln of m.dre?.linhas || []) {
      const desc = (ln.descricao || "").trim();
      if (!desc || isSectionOnly(desc)) continue;
      const key = dreLineKey(desc);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      union.push(ln);
    }
  }

  const rows: DrePivotedRow[] = [];
  let lastGroup: string | null = null;
  const groupCount = new Map<string, number>();

  for (const ln of union) {
    const meta = dreRowClass(ln);
    if (meta.group && meta.group !== lastGroup) {
      lastGroup = meta.group;
      rows.push({
        key: `group:${meta.group}`,
        descricao: meta.group,
        display: meta.group,
        kind: "group",
        group: meta.group,
        deduction: false,
        cmv: false,
        pending: false,
        valores: {},
        media: null,
        acumulado: null,
      });
    }

    const key = dreLineKey(ln.descricao);
    const valores: Record<string, number | null> = {};
    for (const m of months) {
      const hit = (m.dre?.linhas || []).find((x) => dreLineKey(x.descricao) === key);
      if (!hit) {
        valores[m.competencia] = null;
        continue;
      }
      if (meta.cmv && m.cmvPendente && hit.valor == null) {
        valores[m.competencia] = null;
        continue;
      }
      valores[m.competencia] = hit.valor == null ? null : Number(hit.valor);
    }
    const { media, acumulado } = dreMediaAcumulado(months.map((m) => valores[m.competencia]));
    let number: string | undefined;
    if (meta.kind === "line" && meta.group) {
      const n = (groupCount.get(meta.group) || 0) + 1;
      groupCount.set(meta.group, n);
      number = `1.${n}`;
    }
    rows.push({
      key,
      descricao: ln.descricao,
      display: withSign(ln.descricao, meta.kind, meta.deduction, meta.group),
      kind: meta.kind,
      group: meta.group,
      deduction: meta.deduction,
      cmv: meta.cmv,
      pending: meta.cmv,
      number,
      valores,
      media,
      acumulado,
    });
  }
  return rows;
}

export function formatDreInt(n: number | null | undefined, deduction = false) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const rounded = Math.round(Number(n));
  const abs = Math.abs(rounded).toLocaleString("pt-BR");
  if (rounded < 0 || (deduction && rounded > 0)) return `(${abs})`;
  return abs;
}

export function dreCellNegative(n: number | null | undefined, deduction = false) {
  if (n == null || Number.isNaN(Number(n))) return false;
  const rounded = Math.round(Number(n));
  return rounded < 0 || (deduction && rounded > 0);
}
