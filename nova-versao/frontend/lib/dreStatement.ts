export type DreLine = {
  codigo?: string;
  descricao: string;
  grupo?: string;
  nivel?: "total" | "detalhe" | "linha";
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
  dre?: { kind?: string; linhas?: DreLine[]; hasValores?: boolean; source?: string };
  source?: string;
};

export type DreRowKind = "group" | "line" | "subtotal" | "total" | "lucro";

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

export type DreTreeRow = {
  row: DrePivotedRow;
  parentKey: string | null;
  depth: 0 | 1 | 2;
  children: string[];
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

// O balancete rotula a MESMA conta de resultado ora como "LUCRO LÍQUIDO DO
// EXERCÍCIO", ora como "PREJUÍZO DO EXERCÍCIO", conforme o sinal do mês. Sem
// unificar, o trimestre cria duas linhas e cada uma soma só parte dos meses.
const RESULTADO_EXERCICIO_KEY = "resultado liquido do exercicio";

function isResultadoExercicio(key: string) {
  return (
    (key.includes("lucro") || key.includes("prejuizo")) &&
    key.includes("exercicio") &&
    !key.includes("antes") &&
    !key.includes("operacional") &&
    !key.startsWith("lucro ou prejuizo")
  );
}

export function dreLineKey(descricao: string) {
  const key = foldLabel(descricao);
  return isResultadoExercicio(key) ? RESULTADO_EXERCICIO_KEY : key;
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
  if (grupo === "total") {
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

function orderedDreUnion(months: DreMonth[]): DreLine[] {
  const union: DreLine[] = [];
  const unionKeys: string[] = [];
  const seen = new Set<string>();

  for (const month of months) {
    const lines = (month.dre?.linhas || []).filter((line) => {
      const description = (line.descricao || "").trim();
      return Boolean(description) && !isSectionOnly(description);
    });

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const key = dreLineKey(line.descricao);
      if (!key || seen.has(key)) continue;

      let previousKey: string | null = null;
      for (let previous = index - 1; previous >= 0; previous -= 1) {
        const candidate = dreLineKey(lines[previous].descricao);
        if (seen.has(candidate)) {
          previousKey = candidate;
          break;
        }
      }

      let nextKey: string | null = null;
      for (let next = index + 1; next < lines.length; next += 1) {
        const candidate = dreLineKey(lines[next].descricao);
        if (seen.has(candidate)) {
          nextKey = candidate;
          break;
        }
      }

      const previousIndex = previousKey ? unionKeys.indexOf(previousKey) : -1;
      const nextIndex = nextKey ? unionKeys.indexOf(nextKey) : -1;
      let insertAt = union.length;
      if (nextIndex >= 0 && (previousIndex < 0 || previousIndex < nextIndex)) {
        insertAt = nextIndex;
      } else if (previousIndex >= 0) {
        insertAt = previousIndex + 1;
      }

      union.splice(insertAt, 0, line);
      unionKeys.splice(insertAt, 0, key);
      seen.add(key);
    }
  }

  return union;
}

export function collapseTrimestre(months: DreMonth[], selected: string): DreMonth[] {
  if (!isTrimestreCompetencia(selected) || months.length === 0) return months;
  const lineSums = new Map<string, number>();
  for (const m of months) {
    for (const ln of m.dre?.linhas || []) {
      const desc = (ln.descricao || "").trim();
      if (!desc || isSectionOnly(desc) || ln.valor == null || Number.isNaN(Number(ln.valor))) continue;
      const key = dreLineKey(desc);
      lineSums.set(key, (lineSums.get(key) || 0) + Number(ln.valor));
    }
  }
  const linhas = orderedDreUnion(months)
    .filter((line) => lineSums.has(dreLineKey(line.descricao)))
    .map((line) => ({ ...line, valor: lineSums.get(dreLineKey(line.descricao)) ?? null }));
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
        kind: months.map((m) => m.dre?.kind).find(Boolean),
        linhas,
        hasValores: linhas.some((l) => l.valor != null),
        source: months.map((m) => m.source || m.dre?.source).filter(Boolean).at(-1),
      },
      source: months.map((m) => m.source || m.dre?.source).filter(Boolean).at(-1),
    },
  ];
}

export function pivotDreMonths(porMes: DreMonth[]): DrePivotedRow[] {
  const months = porMes.filter((m) => m.hasDre);
  const union = orderedDreUnion(months);

  const rows: DrePivotedRow[] = [];
  let lastGroup: string | null = null;
  let sourceSubtotalGroup: string | null = null;
  const groupCount = new Map<string, number>();
  const preserveSourceLabels = months.some((m) => m.dre?.kind === "exito");

  for (const ln of union) {
    let meta = dreRowClass(ln);
    const key = dreLineKey(ln.descricao);
    const sourceTotal =
      ln.nivel === "total" ||
      (ln.grupo || "").toLowerCase() === "total" ||
      key === "receita bruta" ||
      key === "cmv";

    // Na DRE EXITO, a posição recuada é a fonte da hierarquia. Uma conta de
    // detalhe pertence ao subtotal imediatamente anterior, mesmo quando o nome
    // isolado (por exemplo, "Bonificações Concedidas") também poderia sugerir
    // outro grupo contábil. Packs antigos usam `grupo: linha` e preservam a
    // mesma ordem, portanto recebem o mesmo tratamento sem nova importação.
    const sourceDetail =
      !sourceTotal &&
      (ln.nivel === "detalhe" ||
        ((ln.grupo || "").toLowerCase() === "linha" && sourceSubtotalGroup !== null));
    if (sourceDetail && sourceSubtotalGroup) {
      meta = {
        ...meta,
        group: sourceSubtotalGroup,
        deduction: [GROUP_DEDUCOES, GROUP_CUSTOS, GROUP_DESPESAS].includes(sourceSubtotalGroup),
      };
    }

    // Packs novos trazem `nivel`; packs antigos continuam funcionando pela
    // ordem das linhas. Uma linha sem palavra-chave herda o último grupo
    // contábil, em vez de desaparecer da tabela.
    if (meta.kind === "line" && meta.group == null && lastGroup) {
      meta = {
        ...meta,
        group: lastGroup,
        deduction: [GROUP_DEDUCOES, GROUP_CUSTOS, GROUP_DESPESAS].includes(lastGroup),
      };
    }
    if (sourceTotal && meta.kind === "line") {
      meta = { ...meta, kind: "subtotal" };
    }
    if (meta.kind === "line" && meta.group == null) {
      // Fora de um grupo reconhecido, ainda assim preserve a linha original.
      meta = { ...meta, group: GROUP_OUTROS };
    }
    if (sourceTotal) {
      sourceSubtotalGroup = meta.kind === "subtotal" ? meta.group : null;
    }

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
    if (!preserveSourceLabels && meta.kind === "line" && meta.group) {
      const n = (groupCount.get(meta.group) || 0) + 1;
      groupCount.set(meta.group, n);
      number = `1.${n}`;
    }
    // Linha unificada: o rótulo segue o sinal do acumulado do período.
    const descricao =
      key === RESULTADO_EXERCICIO_KEY
        ? (acumulado ?? 0) < 0
          ? "PREJUÍZO DO EXERCÍCIO"
          : "LUCRO LÍQUIDO DO EXERCÍCIO"
        : ln.descricao;

    rows.push({
      key,
      descricao,
      display: preserveSourceLabels
        ? (descricao || "").trim()
        : withSign(descricao, meta.kind, meta.deduction, meta.group),
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

export function buildDreTreeRows(rows: DrePivotedRow[]): DreTreeRow[] {
  const tree: DreTreeRow[] = [];
  let groupKey: string | null = null;
  let subtotalKey: string | null = null;

  for (const row of rows) {
    let parentKey: string | null = null;
    let depth: 0 | 1 | 2 = 0;

    if (row.kind === "group") {
      groupKey = row.key;
      subtotalKey = null;
    } else if (row.kind === "subtotal") {
      parentKey = groupKey;
      depth = groupKey ? 1 : 0;
      subtotalKey = row.key;
    } else if (row.kind === "line") {
      parentKey = subtotalKey || groupKey;
      depth = subtotalKey ? 2 : groupKey ? 1 : 0;
    } else {
      // Totais de resultado são marcos da DRE e ficam sempre visíveis.
      groupKey = null;
      subtotalKey = null;
    }

    tree.push({ row, parentKey, depth, children: [] });
  }

  const byKey = new Map(tree.map((node) => [node.row.key, node]));
  for (const node of tree) {
    if (!node.parentKey) continue;
    byKey.get(node.parentKey)?.children.push(node.row.key);
  }
  return tree;
}

export function compactDreExpandedKeys(tree: DreTreeRow[]): Set<string> {
  return new Set(
    tree
      .filter((node) => node.row.kind === "group" && node.children.length > 0)
      .map((node) => node.row.key),
  );
}

export function allDreExpandedKeys(tree: DreTreeRow[]): Set<string> {
  return new Set(tree.filter((node) => node.children.length > 0).map((node) => node.row.key));
}

export function visibleDreTreeRows(tree: DreTreeRow[], expanded: Set<string>): DreTreeRow[] {
  const byKey = new Map(tree.map((node) => [node.row.key, node]));
  return tree.filter((node) => {
    let parentKey = node.parentKey;
    while (parentKey) {
      if (!expanded.has(parentKey)) return false;
      parentKey = byKey.get(parentKey)?.parentKey || null;
    }
    return true;
  });
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
