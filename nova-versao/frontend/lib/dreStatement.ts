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

export function isTrimestreCompetencia(key: string) {
  return /^q[1-4]-\d{4}$/i.test(key || "");
}

export function mesesDoTrimestre(key: string): string[] {
  const m = /^q([1-4])-(\d{4})$/i.exec(key || "");
  if (!m) return [];
  const q = Number(m[1]);
  const year = m[2];
  const start = (q - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${year}-${String(start + i).padStart(2, "0")}`);
}

export function trimestreLabel(key: string) {
  const m = /^q([1-4])-(\d{4})$/i.exec(key || "");
  if (!m) return key;
  return `${m[1]}º Trimestre ${m[2]}`;
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
  if (key.includes("receita liquida") || key === "lucro bruto") {
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
    key.includes("iss ") ||
    key.includes("contribuicao social") ||
    key.includes("imposto de renda")
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

function sumNums(valores: Array<number | null | undefined>): number | null {
  const nums = valores.filter((v): v is number => v != null && !Number.isNaN(Number(v)));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + Number(b), 0);
}

export function dreMediaAcumulado(valores: Array<number | null | undefined>) {
  const nums = valores.filter((v): v is number => v != null && !Number.isNaN(v));
  if (!nums.length) return { media: null as number | null, acumulado: null as number | null };
  const acumulado = nums.reduce((a, b) => a + b, 0);
  return { media: acumulado / nums.length, acumulado };
}

export function filterDrePorMes(porMes: DreMonth[], selected: string): DreMonth[] {
  const all = (porMes || []).filter((m) => m.hasDre);
  if (!selected) return all;
  if (isTrimestreCompetencia(selected)) {
    const allowed = new Set(mesesDoTrimestre(selected));
    return all.filter((m) => allowed.has(m.competencia));
  }
  if (/^\d{4}-\d{2}$/.test(selected)) return all.filter((m) => m.competencia === selected);
  return all;
}

export function collapseTrimestre(months: DreMonth[], selected: string): DreMonth[] {
  if (!isTrimestreCompetencia(selected) || months.length === 0) return months;
  const lineMap = new Map<string, { ln: DreLine; sum: number }>();
  for (const m of months) {
    for (const ln of m.dre?.linhas || []) {
      const desc = (ln.descricao || "").trim();
      if (!desc || isSectionOnly(desc) || ln.valor == null || Number.isNaN(Number(ln.valor))) continue;
      const key = dreLineKey(desc);
      const prev = lineMap.get(key);
      if (!prev) lineMap.set(key, { ln: { ...ln }, sum: Number(ln.valor) });
      else prev.sum += Number(ln.valor);
    }
  }
  const linhas = Array.from(lineMap.values()).map(({ ln, sum }) => ({ ...ln, valor: sum }));
  const cmv = sumNums(months.map((m) => m.cmv ?? null));
  const allPending = months.every((m) => m.cmvPendente) && cmv == null;
  return [
    {
      competencia: selected.toLowerCase(),
      label: trimestreLabel(selected),
      hasDre: true,
      cmvPendente: allPending,
      receitaBruta: sumNums(months.map((m) => m.receitaBruta ?? null)),
      cmv,
      lucBruto: sumNums(months.map((m) => m.lucBruto ?? null)),
      lucLiq: sumNums(months.map((m) => m.lucLiq ?? null)),
      dre: {
        linhas,
        hasValores: linhas.some((l) => l.valor != null),
        source: months.map((m) => m.source || m.dre?.source).filter(Boolean).at(-1),
      },
      source: months.map((m) => m.source || m.dre?.source).filter(Boolean).at(-1),
    },
  ];
}

function isSecondaryCmv(key: string, keptCmv: boolean) {
  if (!keptCmv) return false;
  return key !== "cmv" && (key.includes("custo das mercadorias") || key.includes("custos das mercadorias") || key.includes("custo da mercadoria"));
}

function isSecondaryLucro(key: string, hasMainLucro: boolean) {
  if (!hasMainLucro) return false;
  return key === "lucro liquido do exercicio";
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

  const hasMainLucro = union.some((ln) => {
    const key = dreLineKey(ln.descricao);
    return (key.includes("lucro") || key.includes("prejuizo")) && key.includes("exercicio") && key.includes("ou prejuizo");
  });
  const hasShortCmv = union.some((ln) => dreLineKey(ln.descricao) === "cmv");

  const rows: DrePivotedRow[] = [];
  let lastGroup: string | null = null;
  const groupCount = new Map<string, number>();
  let keptCmv = false;

  for (const ln of union) {
    const meta = dreRowClass(ln);
    const key = dreLineKey(ln.descricao);
    if (meta.kind === "line" && meta.group == null) continue;
    if (isSecondaryCmv(key, hasShortCmv)) continue;
    if (isSecondaryLucro(key, hasMainLucro)) continue;

    const valores: Record<string, number | null> = {};
    let hasNumber = false;
    for (const m of months) {
      const hit = (m.dre?.linhas || []).find((x) => dreLineKey(x.descricao) === key);
      if (!hit || hit.valor == null || Number.isNaN(Number(hit.valor))) {
        valores[m.competencia] = null;
        continue;
      }
      if (meta.cmv && m.cmvPendente && hit.valor == null) {
        valores[m.competencia] = null;
        continue;
      }
      valores[m.competencia] = Number(hit.valor);
      hasNumber = true;
    }
    if (!hasNumber) continue;
    if (meta.cmv) {
      if (keptCmv) continue;
      keptCmv = true;
    }

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

export function formatDreInt(n: number | null | undefined, _deduction = false) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const rounded = Math.round(Number(n));
  const abs = Math.abs(rounded).toLocaleString("pt-BR");
  if (rounded < 0) return `(${abs})`;
  return abs;
}

export function dreCellNegative(n: number | null | undefined, _deduction = false) {
  if (n == null || Number.isNaN(Number(n))) return false;
  return Math.round(Number(n)) < 0;
}

export function margemPct(numerador: number | null | undefined, denominador: number | null | undefined) {
  if (numerador == null || denominador == null || !denominador) return null;
  return Math.round((Number(numerador) / Number(denominador)) * 10000) / 100;
}
