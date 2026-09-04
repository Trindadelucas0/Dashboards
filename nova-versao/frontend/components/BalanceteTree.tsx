"use client";

import { useEffect, useMemo, useState } from "react";
import { brl } from "@/lib/api";

export type BalConta = {
  codigo: string;
  descricao: string;
  nivel?: number;
  grupo?: string;
  debito?: number | null;
  credito?: number | null;
  saldoAnterior?: number | null;
  saldoAtual?: number | null;
};

export type BalMonth = {
  competencia: string;
  label: string;
  shortLabel?: string;
  hasBalancete?: boolean;
  balancete?: {
    contas?: BalConta[];
    totais?: Record<string, number | null | undefined>;
    source?: string;
    kind?: string;
  };
  totais?: Record<string, number | null | undefined>;
  source?: string;
};

type TreeNode = {
  codigo: string;
  descricao: string;
  nivel: number;
  grupo: string;
  valores: Record<string, number | null>;
  children: TreeNode[];
};

function moneyOrDash(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return brl(n);
}

function parentCode(codigo: string): string | null {
  const i = codigo.lastIndexOf(".");
  if (i <= 0) return null;
  return codigo.slice(0, i);
}

function natureBadge(codigo: string, valor: number | null): "D" | "C" | null {
  if (valor == null) return null;
  const root = (codigo || "").split(".")[0] || "";
  if (root === "1") return valor >= 0 ? "D" : "C";
  if (root === "2" || root === "3") return valor >= 0 ? "C" : "D";
  return valor >= 0 ? "D" : "C";
}

function levelClass(nivel: number, grupo: string) {
  const g = (grupo || "").toLowerCase();
  const root = g.startsWith("1") || g.includes("ativo") ? "ativo"
    : g.startsWith("2") || g.includes("passivo") ? "passivo"
    : g.startsWith("3") || g.includes("resultado") ? "resultado"
    : "";
  const parts = [`bal-row-l${Math.min(nivel, 3)}`];
  if (root) parts.push(`bal-${root}`);
  if (nivel === 1) parts.push("bal-row-root");
  return parts.join(" ");
}

function buildTree(porMes: BalMonth[]): TreeNode[] {
  const byCode = new Map<string, TreeNode>();
  for (const m of porMes) {
    const contas = m.balancete?.contas || [];
    for (const c of contas) {
      const codigo = String(c.codigo || "").trim();
      if (!codigo) continue;
      let node = byCode.get(codigo);
      if (!node) {
        node = {
          codigo,
          descricao: c.descricao || codigo,
          nivel: c.nivel ?? codigo.split(".").length,
          grupo: c.grupo || codigo.split(".")[0] || "",
          valores: {},
          children: [],
        };
        byCode.set(codigo, node);
      } else if (c.descricao && (!node.descricao || node.descricao === codigo)) {
        node.descricao = c.descricao;
      }
      const saldo = c.saldoAtual;
      node.valores[m.competencia] = saldo == null ? null : Number(saldo);
    }
  }

  const roots: TreeNode[] = [];
  const sorted = [...byCode.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
  for (const node of sorted) {
    node.children = [];
  }
  for (const node of sorted) {
    let p = parentCode(node.codigo);
    let attached = false;
    while (p) {
      const parent = byCode.get(p);
      if (parent) {
        parent.children.push(node);
        attached = true;
        break;
      }
      p = parentCode(p);
    }
    if (!attached) roots.push(node);
  }
  return roots;
}

function flattenVisible(nodes: TreeNode[], expanded: Set<string>): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children.length && expanded.has(n.codigo)) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

function sumValores(valores: Record<string, number | null>, comps: string[]) {
  let sum = 0;
  let any = false;
  for (const c of comps) {
    const v = valores[c];
    if (v == null) continue;
    sum += Number(v);
    any = true;
  }
  return any ? sum : null;
}

function matchQuery(node: TreeNode, q: string) {
  if (!q) return true;
  const hay = `${node.codigo} ${node.descricao}`.toLowerCase();
  return hay.includes(q);
}

function filterTree(nodes: TreeNode[], q: string, grupo: string): TreeNode[] {
  const walk = (list: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const n of list) {
      const kids = walk(n.children);
      const selfOk = matchQuery(n, q) && (!grupo || n.grupo === grupo || n.codigo.startsWith(grupo));
      if (selfOk || kids.length) {
        out.push({
          ...n,
          children: selfOk && !q && !grupo ? n.children : kids.length ? kids : selfOk ? n.children : [],
        });
      }
    }
    return out;
  };
  return walk(nodes);
}

function collectCodes(nodes: TreeNode[], pred: (n: TreeNode) => boolean, into: Set<string>) {
  for (const n of nodes) {
    if (pred(n)) into.add(n.codigo);
    if (n.children.length) collectCodes(n.children, pred, into);
  }
}

function shortMonthLabel(m: BalMonth) {
  return m.shortLabel || m.label || m.competencia;
}

function NaturePill({ nat }: { nat: "D" | "C" }) {
  return <span className={`bal-nat bal-nat-${nat.toLowerCase()}`}>{nat}</span>;
}

function BalCell({ codigo, valor }: { codigo: string; valor: number | null | undefined }) {
  if (valor == null) return <span className="td-mute">—</span>;
  const nat = natureBadge(codigo, valor);
  return (
    <span className="bal-cell">
      <span className="bal-cell-val">{brl(valor)}</span>
      {nat ? <NaturePill nat={nat} /> : null}
    </span>
  );
}

export default function BalanceteTree({
  porMes,
  selectedCompetencia,
  source,
  periodoLabel,
}: {
  porMes: BalMonth[];
  selectedCompetencia?: string;
  source?: string;
  periodoLabel?: string;
}) {
  const months = porMes || [];
  const selected = selectedCompetencia || "";
  const comps = months.map((m) => m.competencia);
  const tree = useMemo(() => buildTree(months), [months]);

  const [query, setQuery] = useState("");
  const [grupo, setGrupo] = useState("");
  const [activeCol, setActiveCol] = useState(selected);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setActiveCol(selected);
  }, [selected]);

  useEffect(() => {
    const s = new Set<string>();
    collectCodes(tree, (n) => n.nivel <= 2, s);
    setExpanded(s);
  }, [tree]);

  const filtered = useMemo(() => filterTree(tree, query.trim().toLowerCase(), grupo), [tree, query, grupo]);
  const rows = useMemo(() => flattenVisible(filtered, expanded), [filtered, expanded]);

  const highlight = /^\d{4}-\d{2}$/.test(activeCol) ? activeCol : selected;
  const kpiMonth =
    months.find((m) => m.competencia === selected) ||
    months.find((m) => m.competencia === highlight) ||
    months[months.length - 1] ||
    null;
  const totais = kpiMonth?.totais || kpiMonth?.balancete?.totais || {};
  const ativo = totais.ativo;
  const passivo = totais.passivo;
  const resultado =
    totais.resultado != null
      ? totais.resultado
      : ativo != null && passivo != null
        ? Number(ativo) - Math.abs(Number(passivo))
        : null;
  const nAnaliticas = useMemo(() => {
    const contas = kpiMonth?.balancete?.contas || [];
    const leaves = contas.filter((c) => (c.nivel ?? String(c.codigo).split(".").length) >= 4);
    return leaves.length || contas.length;
  }, [kpiMonth]);

  const fonte = source || kpiMonth?.source || kpiMonth?.balancete?.source || "CONTABIL";
  const titleMes = kpiMonth?.label || selected || periodoLabel || "—";
  const firstLbl = months[0] ? shortMonthLabel(months[0]).replace(/\/\d{4}/, "").toUpperCase() : "";
  const lastLbl = months.length
    ? shortMonthLabel(months[months.length - 1]).replace(/\/\d{4}/, "").toUpperCase()
    : "";
  const totalColLabel =
    months.length > 1 && firstLbl && lastLbl ? `TOTAL ${firstLbl}–${lastLbl}` : "TOTAL";

  const rangeLabel = useMemo(() => {
    if (!months.length) return "";
    const a = months[0].label || months[0].shortLabel || months[0].competencia;
    const b = months[months.length - 1].label || months[months.length - 1].shortLabel || months[months.length - 1].competencia;
    return a === b ? a : `${a} a ${b}`;
  }, [months]);

  const expandAll = () => {
    const s = new Set<string>();
    collectCodes(filtered, () => true, s);
    setExpanded(s);
  };
  const collapseAll = () => {
    const s = new Set<string>();
    collectCodes(filtered, (n) => n.nivel <= 1, s);
    setExpanded(s);
  };
  const toggle = (codigo: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  if (!months.length) {
    return <div className="alert-box warn">Balancete ainda não importado neste ano. Não inventamos saldo contábil.</div>;
  }

  const grupos = Array.from(
    new Set(
      (kpiMonth?.balancete?.contas || [])
        .map((c) => c.grupo || c.codigo?.split(".")[0] || "")
        .filter(Boolean),
    ),
  );

  return (
    <>
      <div className="bal-page-head">
        <div className="bal-page-title">Balancete — {titleMes}</div>
        <div className="bal-page-sub">
          Fonte: {fonte}
          {periodoLabel ? ` · Recorte ${periodoLabel}` : ""}
        </div>
      </div>

      <div className="alert-box warn bal-banner">
        Dados contábeis disponíveis para {rangeLabel}
        {months.length < 12 ? ". Meses sem importação aparecem como — na grade." : "."}
      </div>

      <div className="bal-kpi-grid">
        <article className="kpi-card c-green bal-kpi">
          <div className="kpi-head">
            <div className="kpi-ico c-green"><i className="fas fa-building-columns" aria-hidden /></div>
          </div>
          <div className="kpi-val">{moneyOrDash(ativo != null ? Number(ativo) : null)}</div>
          <div className="kpi-lbl">Total Ativo</div>
          <div className="kpi-sub bal-kpi-foot">
            <span className="chip gr">Natureza D</span>
            <span>{kpiMonth?.label || "—"}</span>
          </div>
        </article>
        <article className="kpi-card c-purple bal-kpi">
          <div className="kpi-head">
            <div className="kpi-ico c-purple"><i className="fas fa-scale-balanced" aria-hidden /></div>
          </div>
          <div className="kpi-val">{moneyOrDash(passivo != null ? Number(passivo) : null)}</div>
          <div className="kpi-lbl">Total Passivo</div>
          <div className="kpi-sub bal-kpi-foot">
            <span className="chip pu">Natureza C</span>
            <span>{kpiMonth?.label || "—"}</span>
          </div>
        </article>
        <article className="kpi-card c-cyan bal-kpi">
          <div className="kpi-head">
            <div className="kpi-ico c-cyan"><i className="fas fa-chart-line" aria-hidden /></div>
          </div>
          <div className="kpi-val">{moneyOrDash(resultado != null ? Number(resultado) : null)}</div>
          <div className="kpi-lbl">Resultado do período</div>
          <div className="kpi-sub bal-kpi-foot">
            <span className="chip ye">Natureza R</span>
            <span>{totais.resultado != null ? "Conta 3" : "Ativo − |Passivo|"}</span>
          </div>
        </article>
        <article className="kpi-card c-blue bal-kpi">
          <div className="kpi-head">
            <div className="kpi-ico c-blue"><i className="fas fa-list-ul" aria-hidden /></div>
          </div>
          <div className="kpi-val">{nAnaliticas || "—"}</div>
          <div className="kpi-lbl">Contas analíticas</div>
          <div className="kpi-sub">Nível 4 ou superior</div>
        </article>
      </div>

      <div className="table-card bal-card">
        <div className="table-head bal-card-head">
          <div>
            <div className="ttl">Balancete de Verificação</div>
            <div className="sub">Árvore Conta × meses · TOTAL = soma dos saldos mensais da grade (wireframe)</div>
          </div>
        </div>

        <div className="bal-toolbar">
          <div className="bal-mes-bar" role="tablist" aria-label="Coluna de mês">
            {months.map((m) => (
              <button
                key={m.competencia}
                type="button"
                className={`vd-mes-chip${highlight === m.competencia ? " active" : ""}`}
                onClick={() => setActiveCol(m.competencia)}
              >
                {shortMonthLabel(m)}
              </button>
            ))}
          </div>
          <div className="bal-controls">
            <input
              className="bal-search"
              type="search"
              placeholder="Buscar conta ou descrição"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar conta"
            />
            <select className="bal-filter" value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Filtrar grupo">
              <option value="">Todos os grupos</option>
              {grupos.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <button type="button" className="btn-export bal-tool-btn" onClick={expandAll} title="Expandir tudo">
              <i className="fas fa-angles-down" aria-hidden /> Expandir
            </button>
            <button type="button" className="btn-export bal-tool-btn" onClick={collapseAll} title="Recolher">
              <i className="fas fa-angles-up" aria-hidden /> Recolher
            </button>
          </div>
        </div>

        <div className="tbl-scroll">
          <table className="dre-tbl bal-tree">
            <thead>
              <tr>
                <th className="bal-code">Conta</th>
                <th className="bal-desc">Descrição</th>
                {months.map((m) => (
                  <th
                    key={m.competencia}
                    className={`r bal-month${highlight === m.competencia ? " bal-col-active" : ""}`}
                  >
                    {shortMonthLabel(m)}
                  </th>
                ))}
                <th className="r bal-total-col">{totalColLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => {
                const hasKids = n.children.length > 0;
                const open = expanded.has(n.codigo);
                const total = sumValores(n.valores, comps);
                return (
                  <tr key={n.codigo} className={levelClass(n.nivel, n.grupo || n.codigo)}>
                    <td className="bal-code">
                      <span className="bal-code-txt">{n.codigo}</span>
                    </td>
                    <td className="bal-desc">
                      <div className="bal-desc-cell" style={{ paddingLeft: `${Math.max(0, n.nivel - 1) * 14}px` }}>
                        {hasKids ? (
                          <button
                            type="button"
                            className="bal-toggle"
                            onClick={() => toggle(n.codigo)}
                            aria-expanded={open}
                            aria-label={open ? "Recolher" : "Expandir"}
                          >
                            <i className={`fas fa-chevron-${open ? "down" : "right"}`} aria-hidden />
                          </button>
                        ) : (
                          <span className="bal-toggle-spacer" />
                        )}
                        <i
                          className={`fas ${hasKids ? "fa-folder" : "fa-file-lines"} bal-node-ico`}
                          aria-hidden
                        />
                        <span className="bal-desc-txt">{n.descricao}</span>
                      </div>
                    </td>
                    {months.map((m) => {
                      const v = n.valores[m.competencia];
                      const active = highlight === m.competencia;
                      return (
                        <td key={m.competencia} className={`r${active ? " bal-col-active" : ""}`}>
                          <BalCell codigo={n.codigo} valor={v} />
                        </td>
                      );
                    })}
                    <td className="r td-val bal-total-cell">
                      <BalCell codigo={n.codigo} valor={total} />
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={months.length + 3} className="td-mute">
                    Nenhuma conta neste filtro.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="bal-foot">Totais visíveis ({rows.length} contas)</div>
      </div>
    </>
  );
}
