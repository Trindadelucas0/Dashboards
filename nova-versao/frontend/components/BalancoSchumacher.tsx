"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { brl } from "@/lib/api";
import { isTrimestreCompetencia, mesesDoTrimestre } from "@/lib/dreStatement";

export type BpLinha = {
  key: string;
  descricao: string;
  nivel?: number;
  kind?: string;
  collapseRoot?: boolean;
  parentKey?: string;
  lado?: "ativo" | "passivo";
  valor?: number | null;
};

export type BpMonth = {
  competencia: string;
  label: string;
  shortLabel?: string;
  totais?: {
    ativo?: number | null;
    passivo?: number | null;
    patrimonio?: number | null;
    diferenca?: number | null;
  };
  balancete?: {
    kind?: string;
    source?: string;
    linhas?: BpLinha[];
    totais?: BpMonth["totais"];
  };
  source?: string;
};

function money(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return brl(n);
}

function numClass(n: number | null | undefined) {
  if (n == null) return "td-mute";
  if (n < 0) return "td-val neg";
  return "td-val";
}

function normDesc(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function fmtPctPart(num: number | null | undefined, den: number | null | undefined) {
  if (num == null || den == null || Math.abs(den) < 0.005) return null;
  return `${Math.round((Math.abs(num) / Math.abs(den)) * 100)}%`;
}

function highlightDesc(text: string, q: string) {
  if (!q) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bp-search-hit">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function rowSideClass(side: "ativo" | "passivo", kind?: string) {
  if (kind === "total") return side === "ativo" ? "bp-row-total bp-ativo" : "bp-row-total bp-passivo";
  if (kind === "group") return side === "ativo" ? "bp-row-group bp-ativo" : "bp-row-group bp-passivo";
  return side === "ativo" ? "bp-row-line bp-ativo" : "bp-row-line bp-passivo";
}

function Kpi({
  color,
  label,
  value,
  sub,
}: {
  color: string;
  label: string;
  value: number | null | undefined;
  sub: string;
}) {
  const neg = value != null && value < 0;
  return (
    <article className={`kpi-card c-${color} bal-kpi`}>
      <div className={`kpi-val ${neg ? "td-val neg" : ""}`}>{money(value)}</div>
      <div className="kpi-lbl">{label}</div>
      <div className="kpi-sub">{sub}</div>
    </article>
  );
}

function TreeCol({
  side,
  title,
  rows,
  expanded,
  query,
  onToggle,
}: {
  side: "ativo" | "passivo";
  title: string;
  rows: BpLinha[];
  expanded: Set<string>;
  query: string;
  onToggle: (key: string) => void;
}) {
  const childMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.parentKey) continue;
      const list = m.get(row.parentKey) || [];
      list.push(row.key);
      m.set(row.parentKey, list);
    }
    return m;
  }, [rows]);

  const rowByKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  const sideRootValor = useMemo(() => {
    const root = rows.find((r) => r.kind === "total" && !r.parentKey && normDesc(r.descricao) === side);
    return root?.valor ?? null;
  }, [rows, side]);

  const sidePctLabel = side === "ativo" ? "do Ativo" : "do Passivo";

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const matchKeys = new Set<string>();
    if (q) {
      for (const row of rows) {
        if ((row.descricao || "").toLowerCase().includes(q)) {
          let k: string | undefined = row.key;
          while (k) {
            matchKeys.add(k);
            k = rowByKey.get(k)?.parentKey || undefined;
          }
        }
      }
    }
    const open = new Set(expanded);
    if (q) for (const k of matchKeys) open.add(k);
    return rows.filter((row) => {
      if (q && !matchKeys.has(row.key)) return false;
      if (row.collapseRoot || !row.parentKey) return true;
      let p: string | undefined = row.parentKey;
      while (p) {
        if (!open.has(p)) return false;
        p = rowByKey.get(p)?.parentKey;
      }
      return true;
    });
  }, [rows, expanded, q, rowByKey]);

  const isLastChildOfGroup = (index: number, row: BpLinha) => {
    if (!row.parentKey) return false;
    const next = visible[index + 1];
    return !next || next.parentKey !== row.parentKey;
  };

  const renderGroupMeta = (row: BpLinha, kidCount: number, open: boolean) => {
    if (open || kidCount === 0) return null;
    const pct = fmtPctPart(row.valor, sideRootValor);
    const parts = [`${kidCount} conta${kidCount === 1 ? "" : "s"}`];
    if (pct) parts.push(`${pct} ${sidePctLabel}`);
    return <div className="bp-group-meta">{parts.join(" · ")}</div>;
  };

  return (
    <div className="bp-col">
      <div className="bp-col-title">{title}</div>
      <table className="dre-tbl bp-tree">
        <tbody>
          {q && visible.length === 0 ? (
            <tr>
              <td colSpan={2} className="bp-empty">
                Nenhuma conta com esse texto.
              </td>
            </tr>
          ) : null}
          {visible.map((row, index) => {
            const hasKids = (childMap.get(row.key) || []).length > 0;
            const open = expanded.has(row.key) || Boolean(q);
            const kidCount = (childMap.get(row.key) || []).length;
            const isGroup = hasKids && row.kind !== "total";
            const isLine = Boolean(row.parentKey);

            const groupRow = isGroup ? (
              <tr
                key={row.key}
                className={`${rowSideClass(side, "group")}${open ? " bp-row-open" : ""}`}
                onClick={() => onToggle(row.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggle(row.key);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-expanded={open}
              >
                <td>
                  <div className="bp-desc-cell">
                    <i className={`fas fa-chevron-${open ? "down" : "right"} bp-chevron`} aria-hidden />
                    <span className="bp-desc-txt">{highlightDesc(row.descricao, q)}</span>
                  </div>
                  {renderGroupMeta(row, kidCount, open)}
                </td>
                <td className="r">
                  <span className={numClass(row.valor)}>{money(row.valor)}</span>
                </td>
              </tr>
            ) : null;

            const totalOrLineRow = !isGroup ? (
              <tr
                key={row.key}
                className={
                  row.kind === "total"
                    ? rowSideClass(side, "total")
                    : isLine
                      ? rowSideClass(side, "line")
                      : rowSideClass(side, row.kind)
                }
              >
                <td>
                  <div className={`bp-desc-cell${isLine ? " bp-desc-indent" : ""}`}>
                    {isLine ? <span className="bp-guide" aria-hidden /> : null}
                    {!isLine && !hasKids ? <span className="bp-chevron-spacer" aria-hidden /> : null}
                    <span className="bp-desc-txt">{highlightDesc(row.descricao, q)}</span>
                  </div>
                </td>
                <td className="r">
                  {isLine ? (
                    <div className="bp-val-cell">
                      <span className={numClass(row.valor)}>{money(row.valor)}</span>
                      {(() => {
                        const parent = rowByKey.get(row.parentKey!);
                        const pct = fmtPctPart(row.valor, parent?.valor);
                        return pct ? <span className="bp-pct">{pct}</span> : null;
                      })()}
                    </div>
                  ) : (
                    <span className={numClass(row.valor)}>{money(row.valor)}</span>
                  )}
                </td>
              </tr>
            ) : null;

            const sumRow =
              isLine && isLastChildOfGroup(index, row)
                ? (() => {
                    const parent = rowByKey.get(row.parentKey!);
                    if (!parent) return null;
                    const parentOpen = expanded.has(parent.key) || Boolean(q);
                    if (!parentOpen) return null;
                    const pct = fmtPctPart(parent.valor, parent.valor);
                    return (
                      <tr key={`${parent.key}-sum`} className="bp-row-sum">
                        <td>
                          <div className="bp-desc-cell bp-desc-indent">
                            <span className="bp-guide" aria-hidden />
                            <span className="bp-desc-txt bp-sum-lbl">Soma do grupo</span>
                          </div>
                        </td>
                        <td className="r">
                          <div className="bp-val-cell">
                            <span className={numClass(parent.valor)}>{money(parent.valor)}</span>
                            {pct ? <span className="bp-pct">{pct}</span> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })()
                : null;

            return (
              <Fragment key={row.key}>
                {groupRow}
                {totalOrLineRow}
                {sumRow}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function BalancoSchumacher({
  porMes,
  selectedCompetencia,
  source,
}: {
  porMes: BpMonth[];
  selectedCompetencia?: string;
  source?: string;
}) {
  const months = porMes || [];
  const selected = selectedCompetencia || "";
  const isTrim = isTrimestreCompetencia(selected);
  const trimComps = isTrim ? mesesDoTrimestre(selected) : [];
  const trimMonths = months.filter((m) => trimComps.includes(m.competencia));
  const bodyMonth = isTrim
    ? trimMonths[trimMonths.length - 1] || null
    : months.find((m) => m.competencia === selected) || months[months.length - 1] || null;

  const linhas = bodyMonth?.balancete?.linhas || [];
  const totais = bodyMonth?.totais || bodyMonth?.balancete?.totais || {};
  const ativoRows = linhas.filter((l) => l.lado !== "passivo");
  const passivoRows = linhas.filter((l) => l.lado === "passivo");
  const fonte = source || bodyMonth?.source || bodyMonth?.balancete?.source || "Balanço Schumacher";

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const preSearchExpanded = useRef<Set<string> | null>(null);

  const childKeysWithKids = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const row of linhas) {
      if (!row.parentKey) continue;
      const list = m.get(row.parentKey) || [];
      list.push(row.key);
      m.set(row.parentKey, list);
    }
    return linhas.filter((r) => (m.get(r.key) || []).length > 0).map((r) => r.key);
  }, [linhas]);

  const expandAll = () => setExpanded(new Set(childKeysWithKids));
  const collapseAll = () => setExpanded(new Set());
  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onQueryChange = (value: string) => {
    const hadQuery = Boolean(query.trim());
    const willHaveQuery = Boolean(value.trim());
    if (!hadQuery && willHaveQuery) {
      preSearchExpanded.current = new Set(expanded);
    }
    if (hadQuery && !willHaveQuery && preSearchExpanded.current) {
      setExpanded(preSearchExpanded.current);
      preSearchExpanded.current = null;
    }
    setQuery(value);
  };

  if (!months.length || !bodyMonth) {
    return (
      <div className="alert-box warn">
        Importe o Balanço Patrimonial Schumacher 2026 (aba Comparativo). Não inventamos saldo.
      </div>
    );
  }

  const posicao = bodyMonth.label || selected;

  return (
    <>
      <div className="bal-page-head">
        <div className="bal-page-title">Balanço Patrimonial — {posicao}</div>
        <div className="bal-page-sub">
          Posição ao fim do mês · Unidade TODOS · CNPJ 04.589.817/0001-06 · Fonte: {fonte}. Sem coluna
          acumulado (saldo no fim do mês, não fluxo).
        </div>
      </div>

      <div className="bal-kpi-grid">
        <Kpi color="green" label="Total Ativo" value={totais.ativo} sub="Linha ATIVO" />
        <Kpi color="purple" label="Passivo (c/ PL)" value={totais.passivo} sub="Linha PASSIVO" />
        <Kpi color="cyan" label="Patrimônio líquido" value={totais.patrimonio} sub="Linha PATRIMONIO LIQUIDO" />
        <Kpi color="blue" label="Diferença" value={totais.diferenca} sub="Ativo − Passivo (arquivo)" />
      </div>

      {isTrim && trimMonths.length ? (
        <div className="bp-trim-strip" aria-label="Posição nos meses do trimestre">
          {trimMonths.map((m) => {
            const t = m.totais || m.balancete?.totais || {};
            return (
              <div key={m.competencia} className="bp-trim-cell">
                <div className="bp-trim-lbl">{m.shortLabel || m.label}</div>
                <div>Ativo {money(t.ativo)}</div>
                <div>Passivo {money(t.passivo)}</div>
                <div className={numClass(t.diferenca)}>Dif. {money(t.diferenca)}</div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="table-card bal-card">
        <div className="bal-toolbar">
          <div className="bal-controls">
            <button type="button" className="btn-export bal-tool-btn" onClick={expandAll}>
              Expandir
            </button>
            <button type="button" className="btn-export bal-tool-btn" onClick={collapseAll}>
              Recolher
            </button>
            <input
              className="bal-search"
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Buscar conta"
              aria-label="Buscar conta"
            />
          </div>
        </div>
        <div className="bp-two-col">
          <TreeCol
            side="ativo"
            title="ATIVO"
            rows={ativoRows}
            expanded={expanded}
            query={query}
            onToggle={toggle}
          />
          <TreeCol
            side="passivo"
            title="PASSIVO"
            rows={passivoRows}
            expanded={expanded}
            query={query}
            onToggle={toggle}
          />
        </div>
      </div>
    </>
  );
}
