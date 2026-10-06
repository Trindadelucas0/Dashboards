"use client";

import { useMemo, useState } from "react";
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

function money(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return brl(n);
}

function numClass(n: number | null | undefined, deduction?: boolean) {
  if (n == null) return "td-mute";
  if (n < 0 || deduction) return "dre-num-neg";
  return undefined;
}

function sum(vals: Array<number | null | undefined>) {
  const nums = vals.filter((v): v is number => v != null && !Number.isNaN(Number(v)));
  if (!nums.length) return null;
  return round2(nums.reduce((a, b) => a + Number(b), 0));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
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

function rowClass(kind?: string, deduction?: boolean) {
  if (kind === "lucro") return "dre-lucro";
  if (kind === "total") return "dre-total";
  if (kind === "group") return "dre-group";
  const parts = ["dre-indent"];
  if (deduction) parts.push("dre-neg");
  return parts.join(" ");
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
    const byKey = new Map<string, DreSchLinha & { valores: Record<string, number | null> }>();
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

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  const visible = useMemo(() => {
    const matchKeys = new Set<string>();
    if (q) {
      for (const row of rows) {
        if ((row.descricao || "").toLowerCase().includes(q)) {
          let k: string | undefined = row.key;
          while (k) {
            matchKeys.add(k);
            const parent = rows.find((r) => r.key === k)?.parentKey;
            k = parent || undefined;
          }
        }
      }
    }
    const open = new Set(expanded);
    if (q) {
      for (const k of matchKeys) open.add(k);
    }
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

  const expandAll = () => {
    setExpanded(new Set(rows.filter((r) => r.collapseRoot && (childMap.get(r.key) || []).length).map((r) => r.key)));
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
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conta"
              aria-label="Buscar conta"
            />
          </div>
        </div>
        <div className="tbl-scroll">
          <table className="dre-tbl dre-tbl-year">
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
              {visible.map((row) => {
                const hasKids = (childMap.get(row.key) || []).length > 0;
                const open = expanded.has(row.key) || Boolean(q);
                return (
                  <tr key={row.key} className={rowClass(row.kind, row.deduction)}>
                    <td>
                      {hasKids ? (
                        <button
                          type="button"
                          className="bal-toggle"
                          aria-expanded={open}
                          onClick={() => toggle(row.key)}
                        >
                          <i className={`fas fa-chevron-${open ? "down" : "right"}`} aria-hidden />
                        </button>
                      ) : (
                        <span className="bal-toggle-spacer" />
                      )}
                      {row.descricao}
                    </td>
                    {tableMonths.map((m) => {
                      const val = row.valores[m.competencia];
                      const active = highlight === m.competencia;
                      return (
                        <td key={m.competencia} className={`r${active ? " dre-col-active" : ""}`}>
                          <span className={numClass(val, row.deduction)}>{money(val)}</span>
                        </td>
                      );
                    })}
                    <td className="r dre-col-acum">
                      <span className={numClass(row.acumulado, row.deduction)}>{money(row.acumulado)}</span>
                    </td>
                  </tr>
                );
              })}
              {!visible.length ? (
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
