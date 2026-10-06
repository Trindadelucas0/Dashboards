"use client";

import { useMemo, useState } from "react";
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
  title,
  rows,
  expanded,
  query,
  onToggle,
}: {
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
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const matchKeys = new Set<string>();
    if (q) {
      for (const row of rows) {
        if ((row.descricao || "").toLowerCase().includes(q)) {
          let k: string | undefined = row.key;
          while (k) {
            matchKeys.add(k);
            k = rows.find((r) => r.key === k)?.parentKey || undefined;
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
        p = rows.find((r) => r.key === p)?.parentKey;
      }
      return true;
    });
  }, [rows, expanded, q]);

  return (
    <div className="bp-col">
      <div className="bp-col-title">{title}</div>
      <table className="dre-tbl bp-tree">
        <tbody>
          {visible.map((row) => {
            const hasKids = (childMap.get(row.key) || []).length > 0;
            const open = expanded.has(row.key) || Boolean(q);
            return (
              <tr key={row.key} className={row.kind === "total" || row.kind === "group" ? "dre-total" : "dre-indent"}>
                <td>
                  {hasKids ? (
                    <button
                      type="button"
                      className="bal-toggle"
                      aria-expanded={open}
                      onClick={() => onToggle(row.key)}
                    >
                      <i className={`fas fa-chevron-${open ? "down" : "right"}`} aria-hidden />
                    </button>
                  ) : (
                    <span className="bal-toggle-spacer" />
                  )}
                  {row.descricao}
                </td>
                <td className="r">
                  <span className={numClass(row.valor)}>{money(row.valor)}</span>
                </td>
              </tr>
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

  const expandAll = () => {
    const keys = linhas.filter((r) => r.collapseRoot).map((r) => r.key);
    setExpanded(new Set(keys));
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
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conta"
              aria-label="Buscar conta"
            />
          </div>
        </div>
        <div className="bp-two-col">
          <TreeCol title="ATIVO" rows={ativoRows} expanded={expanded} query={query} onToggle={toggle} />
          <TreeCol title="PASSIVO" rows={passivoRows} expanded={expanded} query={query} onToggle={toggle} />
        </div>
      </div>
    </>
  );
}
