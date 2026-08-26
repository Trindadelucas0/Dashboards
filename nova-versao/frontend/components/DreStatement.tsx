"use client";

import { useMemo } from "react";
import { brl } from "@/lib/api";
import {
  dreCellNegative,
  formatDreInt,
  pivotDreMonths,
  type DreMonth,
  type DrePivotedRow,
} from "@/lib/dreStatement";

function moneyOrDash(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return brl(n);
}

function rowClass(row: DrePivotedRow) {
  if (row.kind === "group") return "dre-group";
  const parts = ["dre-indent"];
  if (row.kind === "total") return "dre-total";
  if (row.kind === "lucro") return "dre-lucro";
  if (row.deduction) parts.push("dre-neg");
  if (row.group === "Outros Resultados") parts.push("dre-subv");
  return parts.join(" ");
}

function DreValue({
  value,
  deduction,
  pending,
  asterisk,
}: {
  value: number | null;
  deduction: boolean;
  pending?: boolean;
  asterisk?: boolean;
}) {
  if (pending) return <span className="dre-nd">Em lançamento</span>;
  if (value == null) return <span className="td-mute">—</span>;
  const neg = dreCellNegative(value, deduction);
  return (
    <span className={neg ? "dre-num-neg" : undefined}>
      {formatDreInt(value, deduction)}
      {asterisk ? "*" : ""}
    </span>
  );
}

export default function DreStatement({
  porMes,
  periodoLabel,
  selectedCompetencia,
  source,
}: {
  porMes: DreMonth[];
  periodoLabel?: string;
  selectedCompetencia?: string;
  source?: string;
}) {
  const months = useMemo(() => (porMes || []).filter((m) => m.hasDre), [porMes]);
  const rows = useMemo(() => pivotDreMonths(months), [months]);
  const colSpan = months.length + 3;
  const pendingMonths = months.filter((m) => m.cmvPendente);
  const kpi =
    months.find((m) => m.competencia === selectedCompetencia) || months.at(-1) || null;
  const titlePeriod = periodoLabel || (kpi?.label ?? "");
  const fonte = source || kpi?.source || kpi?.dre?.source || "Planilha RESULTADO";

  if (!months.length) {
    return (
      <div className="alert-box warn">
        Importe a planilha RESULTADO para preencher a DRE. CMV e margens não são estimados.
      </div>
    );
  }

  return (
    <>
      {kpi ? (
        <div className="margin-grid">
          <div className="margin-card">
            <div className="ind-name">Receita Bruta</div>
            <div className="margin-val">{moneyOrDash(kpi.receitaBruta)}</div>
            <div className="margin-sub">{kpi.label}</div>
          </div>
          <div className="margin-card">
            <div className="ind-name">CMV</div>
            <div className={`margin-val${kpi.cmv != null && kpi.cmv < 0 ? " t-danger" : ""}`}>
              {kpi.cmvPendente ? "Em lançamento" : moneyOrDash(kpi.cmv)}
            </div>
            <div className="margin-sub">{kpi.label}</div>
          </div>
          <div className="margin-card">
            <div className="ind-name">Lucro Bruto</div>
            <div className={`margin-val${kpi.lucBruto != null && kpi.lucBruto < 0 ? " t-danger" : ""}`}>
              {moneyOrDash(kpi.lucBruto)}
            </div>
            <div className="margin-sub">MB {kpi.margMb != null ? `${kpi.margMb}%` : "—"}</div>
          </div>
          <div className="margin-card">
            <div className="ind-name">Lucro Líquido</div>
            <div className={`margin-val${kpi.lucLiq != null && kpi.lucLiq < 0 ? " t-danger" : ""}`}>
              {moneyOrDash(kpi.lucLiq)}
            </div>
            <div className="margin-sub">ML {kpi.margMl != null ? `${kpi.margMl}%` : "—"}</div>
          </div>
        </div>
      ) : null}

      {kpi?.dre?.hasValores === false ? (
        <div className="alert-box warn">
          RESULTADO importado sem valores numéricos na exportação. Estrutura abaixo; margens ficam N/D.
        </div>
      ) : null}

      <div className="table-card">
        <div className="table-head">
          <div className="ttl">Demonstrativo de Resultado – {titlePeriod}</div>
          <div className="sub">
            Valores em R$ — Fonte: {fonte}
            {pendingMonths.length
              ? ` — CMV de ${pendingMonths.map((m) => m.label).join(", ")} em elaboração`
              : ""}
          </div>
        </div>
        <div className="tbl-scroll">
          <table className="dre-tbl dre-tbl-year">
            <thead>
              <tr>
                <th className="dre-desc">Descrição</th>
                {months.map((m) => (
                  <th key={m.competencia} className="r dre-month">
                    {m.label}
                    {m.cmvPendente ? <span className="chip ye dre-cmv-chip">CMV Pendente</span> : null}
                  </th>
                ))}
                <th className="r dre-col-media">Média</th>
                <th className="r dre-col-acum">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                if (row.kind === "group") {
                  return (
                    <tr key={row.key} className="dre-group">
                      <td colSpan={colSpan}>{row.display}</td>
                    </tr>
                  );
                }
                const starKind = row.kind === "total" || row.kind === "lucro";
                return (
                  <tr key={row.key} className={rowClass(row)}>
                    <td>
                      {row.number ? <span className="dre-num">{row.number} </span> : null}
                      {row.display}
                    </td>
                    {months.map((m) => {
                      const pending = Boolean(row.cmv && m.cmvPendente && row.valores[m.competencia] == null);
                      const asterisk = Boolean(starKind && m.cmvPendente);
                      return (
                        <td key={m.competencia} className={`r${pending ? " dre-nd" : ""}`}>
                          <DreValue
                            value={row.valores[m.competencia]}
                            deduction={row.deduction}
                            pending={pending}
                            asterisk={asterisk}
                          />
                        </td>
                      );
                    })}
                    <td className="r dre-col-media">
                      <DreValue value={row.media} deduction={row.deduction} />
                    </td>
                    <td className="r dre-col-acum">
                      <DreValue value={row.acumulado} deduction={row.deduction} />
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={colSpan} className="td-mute">
                    Sem linhas estruturadas na DRE.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {pendingMonths.length ? (
        <div className="alert-box warn">
          *Totais dos meses com CMV pendente usam só as linhas já lançadas. Lucro bruto/líquido
          completa depois do CMV.
        </div>
      ) : null}
    </>
  );
}
