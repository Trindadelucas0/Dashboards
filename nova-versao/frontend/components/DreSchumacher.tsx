"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { brl } from "@/lib/api";
import { isTrimestreCompetencia, mesesDoTrimestre } from "@/lib/dreStatement";

export type DreSchLinha = {
  key: string;
  descricao: string;
  nivel?: number;
  kind?: string;
  deduction?: boolean;
  collapseRoot?: boolean;
  parentKey?: string;
  valor?: number | null;
  acumulado?: number | null;
};

export type DreSchMonth = {
  competencia: string;
  label: string;
  receitaBruta?: number | null;
  lucBruto?: number | null;
  lucLiq?: number | null;
  dre?: {
    kind?: string;
    source?: string;
    linhas?: DreSchLinha[];
    receitaBruta?: number | null;
    receitaLiquida?: number | null;
    lucBruto?: number | null;
    lucLiq?: number | null;
    acumuladoJanAgo?: Record<string, number | null>;
  };
  source?: string;
};

type DreRow = DreSchLinha & { valores: Record<string, number | null> };

function money(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return brl(n);
}

function numClass(n: number | null | undefined, deduction?: boolean) {
  if (n == null) return "td-mute";
  if (n < 0 || deduction) return "dre-num-neg";
  return undefined;
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
      <mark className="dre-sch-search-hit">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function sum(vals: Array<number | null | undefined>) {
  const nums = vals.filter((v): v is number => v != null && !Number.isNaN(Number(v)));
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + Number(b), 0) * 100) / 100;
}

function rowKindClass(row: DreRow) {
  if (row.kind === "lucro") return "dre-sch-row-lucro dre-lucro";
  if (row.kind === "total") return "dre-sch-row-total dre-total";
  if (row.deduction) return "dre-sch-row-deduction dre-neg";
  if (row.parentKey) return "dre-sch-row-line dre-indent";
  return "dre-sch-row-line";
}

function ValueCells({
  row,
  tableMonths,
  highlight,
  parentRow,
  showGroupPct,
  footerSum,
}: {
  row: DreRow;
  tableMonths: DreSchMonth[];
  highlight: string;
  parentRow?: DreRow;
  showGroupPct: boolean;
  footerSum?: boolean;
}) {
  const isLine = Boolean(row.parentKey);
  return (
    <>
      {tableMonths.map((m) => {
        const val = row.valores[m.competencia];
        const active = highlight === m.competencia;
        const pct = footerSum
          ? fmtPctPart(val, val)
          : isLine && parentRow
            ? fmtPctPart(val, parentRow.valores[m.competencia])
            : null;
        return (
          <td key={m.competencia} className={`r${active ? " dre-col-active" : ""}`}>
            <div className="dre-sch-val-cell">
              <span className={numClass(val, row.deduction)}>{money(val)}</span>
              {showGroupPct && pct ? <span className="dre-sch-pct">{pct}</span> : null}
            </div>
          </td>
        );
      })}
      <td className="r dre-col-acum">
        <div className="dre-sch-val-cell">
          <span className={numClass(row.acumulado, row.deduction)}>{money(row.acumulado)}</span>
          {footerSum ? (
            (() => {
              const pct = fmtPctPart(row.acumulado, row.acumulado);
              return pct ? <span className="dre-sch-pct">{pct}</span> : null;
            })()
          ) : showGroupPct && isLine && parentRow ? (
            (() => {
              const pct = fmtPctPart(row.acumulado, parentRow.acumulado);
              return pct ? <span className="dre-sch-pct">{pct}</span> : null;
            })()
          ) : null}
        </div>
      </td>
    </>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | null | undefined;
  sub: string;
}) {
  const neg = value != null && value < 0;
  return (
    <article className={`kpi-card ${neg ? "c-red" : "c-green"}`}>
      <div className={`kpi-val ${neg ? "td-val neg" : "td-val"}`}>{money(value)}</div>
      <div className="kpi-lbl">{label}</div>
      <div className="kpi-sub">{sub}</div>
    </article>
  );
}

export default function DreSchumacher({
  porMes,
  selectedCompetencia,
  source,
}: {
  porMes: DreSchMonth[];
  selectedCompetencia?: string;
  source?: string;
}) {
  const selected = selectedCompetencia || "";
  const isTrim = isTrimestreCompetencia(selected);
  const allMonths = porMes || [];
  const tableMonths = useMemo(() => {
    if (!isTrim) return allMonths;
    const want = new Set(mesesDoTrimestre(selected));
    return allMonths.filter((m) => want.has(m.competencia));
  }, [allMonths, isTrim, selected]);

  const rows = useMemo(() => {
    const byKey = new Map<string, DreRow>();
    for (const m of tableMonths) {
      for (const ln of m.dre?.linhas || []) {
        const key = ln.key || ln.descricao;
        let node = byKey.get(key);
        if (!node) {
          node = { ...ln, key, valores: {} };
          byKey.set(key, node);
        }
        node.valores[m.competencia] = ln.valor == null ? null : Number(ln.valor);
        if (ln.acumulado != null) node.acumulado = ln.acumulado;
      }
    }
    return Array.from(byKey.values());
  }, [tableMonths]);

  const rowByKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

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

  const rbByComp = useMemo(() => {
    const rbRow = rows.find((r) => normDesc(r.descricao) === "receita operacional bruta");
    return rbRow?.valores || {};
  }, [rows]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const preSearchExpanded = useRef<Set<string> | null>(null);

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

  const kpi = useMemo(() => {
    if (!tableMonths.length) return { rb: null, rl: null, lb: null, ll: null };
    if (isTrim) {
      return {
        rb: sum(tableMonths.map((m) => m.dre?.receitaBruta ?? m.receitaBruta)),
        rl: sum(tableMonths.map((m) => m.dre?.receitaLiquida)),
        lb: sum(tableMonths.map((m) => m.dre?.lucBruto ?? m.lucBruto)),
        ll: sum(tableMonths.map((m) => m.dre?.lucLiq ?? m.lucLiq)),
      };
    }
    const m = tableMonths.find((x) => x.competencia === selected) || tableMonths[tableMonths.length - 1];
    return {
      rb: m.dre?.receitaBruta ?? m.receitaBruta ?? null,
      rl: m.dre?.receitaLiquida ?? null,
      lb: m.dre?.lucBruto ?? m.lucBruto ?? null,
      ll: m.dre?.lucLiq ?? m.lucLiq ?? null,
    };
  }, [tableMonths, isTrim, selected]);

  const fonte = source || tableMonths[0]?.source || tableMonths[0]?.dre?.source || "DRE Schumacher";
  const highlight = !isTrim && /^\d{4}-\d{2}$/.test(selected) ? selected : "";
  const metaComp =
    highlight || tableMonths[tableMonths.length - 1]?.competencia || "";

  const expandAll = () => {
    setExpanded(new Set(rows.filter((r) => (childMap.get(r.key) || []).length > 0).map((r) => r.key)));
  };
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
    if (!hadQuery && willHaveQuery) preSearchExpanded.current = new Set(expanded);
    if (hadQuery && !willHaveQuery && preSearchExpanded.current) {
      setExpanded(preSearchExpanded.current);
      preSearchExpanded.current = null;
    }
    setQuery(value);
  };

  const isLastChildOfGroup = (index: number, row: DreRow) => {
    if (!row.parentKey) return false;
    const next = visible[index + 1];
    return !next || next.parentKey !== row.parentKey;
  };

  const renderGroupMeta = (row: DreRow, kidCount: number, open: boolean) => {
    if (open || kidCount === 0) return null;
    const rb = metaComp ? rbByComp[metaComp] : null;
    const val = metaComp ? row.valores[metaComp] : null;
    const pct = fmtPctPart(val, rb);
    const parts = [`${kidCount} linha${kidCount === 1 ? "" : "s"}`];
    if (pct) parts.push(`${pct} da RB`);
    return <div className="dre-sch-group-meta">{parts.join(" · ")}</div>;
  };

  if (!tableMonths.length) {
    return (
      <div className="alert-box warn">
        Importe a DRE Schumacher 2026 (aba Comparativo). Não inventamos resultado.
      </div>
    );
  }

  const colSpan = tableMonths.length + 2;

  return (
    <>
      <div className="bal-kpi-grid">
        <Kpi label="Receita bruta" value={kpi.rb} sub={isTrim ? "Soma dos meses do trimestre" : "Mês do chip"} />
        <Kpi label="Receita líquida" value={kpi.rl} sub={isTrim ? "Soma dos meses do trimestre" : "Mês do chip"} />
        <Kpi label="Lucro bruto" value={kpi.lb} sub={isTrim ? "Soma dos meses do trimestre" : "Mês do chip"} />
        <Kpi label="Lucro líquido" value={kpi.ll} sub={isTrim ? "Soma dos meses do trimestre" : "Mês do chip"} />
      </div>

      <div className="table-card">
        <div className="table-head bal-card-head">
          <div>
            <div className="ttl">DRE comparativo</div>
            <div className="sub">
              INDUSTRIA SCHUMACHER LTDA · CNPJ 04.589.817/0001-06 · Filial CONSOLIDADO · Valores em R$ · Fonte: {fonte}
            </div>
          </div>
        </div>
        <div className="bal-toolbar">
          <div className="bal-controls">
            <button type="button" className="btn-export bal-tool-btn" onClick={expandAll}>
              Expandir todos
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
        <div className="tbl-scroll">
          <table className="dre-tbl dre-tbl-year dre-sch-tree">
            <thead>
              <tr>
                <th className="dre-desc">Conta</th>
                {tableMonths.map((m) => (
                  <th
                    key={m.competencia}
                    className={`r dre-month${highlight === m.competencia ? " dre-col-active" : ""}`}
                  >
                    {m.label}
                  </th>
                ))}
                <th className="r dre-col-acum">Acum Jan–Ago</th>
              </tr>
            </thead>
            <tbody>
              {q && visible.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="dre-sch-empty">
                    Nenhuma conta com esse texto.
                  </td>
                </tr>
              ) : null}
              {visible.map((row, index) => {
                const hasKids = (childMap.get(row.key) || []).length > 0;
                const open = expanded.has(row.key) || Boolean(q);
                const kidCount = (childMap.get(row.key) || []).length;
                const isGroup = hasKids && row.kind !== "total" && row.kind !== "lucro";
                const isLine = Boolean(row.parentKey);
                const parentRow = row.parentKey ? rowByKey.get(row.parentKey) : undefined;

                const groupRow = isGroup ? (
                  <tr
                    key={row.key}
                    className={`dre-sch-row-group dre-group${open ? " dre-sch-row-open" : ""}`}
                    onClick={() => toggle(row.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(row.key);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-expanded={open}
                  >
                    <td>
                      <div className="dre-sch-desc-cell">
                        <i className={`fas fa-chevron-${open ? "down" : "right"} dre-sch-chevron`} aria-hidden />
                        <span className="dre-sch-desc-txt">{highlightDesc(row.descricao, q)}</span>
                      </div>
                      {renderGroupMeta(row, kidCount, open)}
                    </td>
                    <ValueCells row={row} tableMonths={tableMonths} highlight={highlight} showGroupPct={false} />
                  </tr>
                ) : null;

                const plainRow = !isGroup ? (
                  <tr key={row.key} className={rowKindClass(row)}>
                    <td>
                      <div className={`dre-sch-desc-cell${isLine ? " dre-sch-desc-indent" : ""}`}>
                        {isLine ? <span className="dre-sch-guide" aria-hidden /> : null}
                        {!isLine && !hasKids ? <span className="dre-sch-chevron-spacer" aria-hidden /> : null}
                        {!isLine && hasKids ? (
                          <span className="dre-sch-chevron-spacer" aria-hidden />
                        ) : null}
                        <span className="dre-sch-desc-txt">{highlightDesc(row.descricao, q)}</span>
                      </div>
                    </td>
                    <ValueCells
                      row={row}
                      tableMonths={tableMonths}
                      highlight={highlight}
                      parentRow={parentRow}
                      showGroupPct={isLine}
                    />
                  </tr>
                ) : null;

                const sumRow =
                  isLine && isLastChildOfGroup(index, row) && parentRow
                    ? (() => {
                        const parentOpen = expanded.has(parentRow.key) || Boolean(q);
                        if (!parentOpen) return null;
                        return (
                          <tr key={`${parentRow.key}-sum`} className="dre-sch-row-sum">
                            <td>
                              <div className="dre-sch-desc-cell dre-sch-desc-indent">
                                <span className="dre-sch-guide" aria-hidden />
                                <span className="dre-sch-desc-txt dre-sch-sum-lbl">Soma do grupo</span>
                              </div>
                            </td>
                            <ValueCells
                              row={parentRow}
                              tableMonths={tableMonths}
                              highlight={highlight}
                              showGroupPct={false}
                              footerSum
                            />
                          </tr>
                        );
                      })()
                    : null;

                return (
                  <Fragment key={row.key}>
                    {groupRow}
                    {plainRow}
                    {sumRow}
                  </Fragment>
                );
              })}
              {!q && !visible.length ? (
                <tr>
                  <td colSpan={colSpan} className="td-mute">
                    Sem linhas neste recorte.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {isTrim ? (
        <p className="td-mute" style={{ marginTop: 8 }}>
          Acumulado Jan–Ago vem do arquivo (não é a soma do trimestre).
        </p>
      ) : null}
    </>
  );
}
