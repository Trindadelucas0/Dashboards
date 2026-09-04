"use client";

import { useMemo } from "react";
import {
  collapseTrimestre,
  dreCellNegative,
  filterDrePorMes,
  formatDreInt,
  isTrimestreCompetencia,
  margemPct,
  pivotDreMonths,
  trimestreLabel,
  type DreMonth,
  type DrePivotedRow,
} from "@/lib/dreStatement";

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

function pctOrDash(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function MarginKpi({
  name,
  value,
  formula,
  tone,
  pending,
}: {
  name: string;
  value: number | null | undefined;
  formula: string;
  tone?: "ok" | "warn" | "mute";
  pending?: boolean;
}) {
  return (
    <div className={`margin-card margin-kpi${tone ? ` tone-${tone}` : ""}`}>
      <div className="ind-name">{name}</div>
      <div className={`margin-val${pending || value == null ? " td-mute" : ""}`}>
        {pending ? "Em lançamento" : pctOrDash(value)}
      </div>
      <div className="margin-sub">{formula}</div>
    </div>
  );
}

type DreMonthExt = DreMonth & {
  margMo?: number | null;
  lucOperacional?: number | null;
  dedPct?: number | null;
};

export default function DreStatement({
  porMes,
  selectedCompetencia,
  source,
}: {
  porMes: DreMonthExt[];
  periodoLabel?: string;
  selectedCompetencia?: string;
  source?: string;
}) {
  const selected = selectedCompetencia || "";
  const isTrim = isTrimestreCompetencia(selected);
  const tableMonths = useMemo(
    () => filterDrePorMes(porMes || [], selected),
    [porMes, selected],
  );
  const kpiMonths = useMemo(
    () => collapseTrimestre(tableMonths, selected),
    [tableMonths, selected],
  );
  const rows = useMemo(() => pivotDreMonths(tableMonths), [tableMonths]);
  const showResumo = isTrim && tableMonths.length > 1;
  const colSpan = tableMonths.length + 1 + (showResumo ? 2 : 0);
  const pendingMonths = tableMonths.filter((m) => m.cmvPendente);
  const kpi = (kpiMonths[0] || null) as DreMonthExt | null;
  const titlePeriod = isTrim ? trimestreLabel(selected) : kpi?.label || selected;
  const fonte = source || kpi?.source || kpi?.dre?.source || "Planilha RESULTADO";
  const mb = kpi?.margMb ?? margemPct(kpi?.lucBruto, kpi?.receitaBruta);
  const ml = kpi?.margMl ?? margemPct(kpi?.lucLiq, kpi?.receitaBruta);
  const mo = kpi?.margMo ?? null;
  const carga = kpi?.dedPct ?? null;
  const highlightMonth = !isTrim && /^\d{4}-\d{2}$/.test(selected);
  const cmvPendingKpi = Boolean(kpi?.cmvPendente);

  if (!tableMonths.length) {
    return (
      <div className="alert-box warn">
        {isTrim
          ? "Sem DRE nos meses deste trimestre. Importe a planilha RESULTADO."
          : "Sem DRE neste mês. Importe a planilha RESULTADO da competência."}
      </div>
    );
  }

  return (
    <>
      {kpi ? (
        <div className="margin-grid">
          <MarginKpi
            name="Margem Bruta (MB)"
            value={cmvPendingKpi && mb == null ? null : mb}
            formula="Lucro bruto / Receita bruta"
            tone={mb != null && mb < 0 ? "warn" : "ok"}
            pending={cmvPendingKpi && mb == null}
          />
          <MarginKpi
            name="Margem Operacional (MO)"
            value={mo}
            formula={mo != null ? "Lucro operacional / RB" : "N/D — sem linha operacional na DRE"}
            tone={mo == null ? "mute" : mo < 0 ? "warn" : "ok"}
          />
          <MarginKpi
            name="Margem Líquida (ML)"
            value={cmvPendingKpi && ml == null ? null : ml}
            formula="Lucro líquido / Receita bruta"
            tone={ml != null && ml < 0 ? "warn" : "ok"}
            pending={cmvPendingKpi && ml == null}
          />
          <MarginKpi
            name="Carga tributária"
            value={carga}
            formula={carga != null ? "Deduções / Receita" : "N/D — aguardando apuração"}
            tone={carga == null ? "mute" : "warn"}
          />
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
            {isTrim ? " — Comparativo dos meses do trimestre" : ""}
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
                {tableMonths.map((m) => (
                  <th
                    key={m.competencia}
                    className={`r dre-month${highlightMonth && m.competencia === selected ? " dre-col-active" : ""}`}
                  >
                    {m.label}
                    {m.cmvPendente ? <span className="chip ye dre-cmv-chip">CMV Pendente</span> : null}
                  </th>
                ))}
                {showResumo ? (
                  <>
                    <th className="r dre-col-media">Média</th>
                    <th className="r dre-col-acum">Acumulado</th>
                  </>
                ) : null}
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
                    {tableMonths.map((m) => {
                      const pending = Boolean(row.cmv && m.cmvPendente && row.valores[m.competencia] == null);
                      const asterisk = Boolean(starKind && m.cmvPendente);
                      const active = highlightMonth && m.competencia === selected;
                      return (
                        <td
                          key={m.competencia}
                          className={`r${pending ? " dre-nd" : ""}${active ? " dre-col-active" : ""}${row.deduction ? " dre-ded-cell" : ""}`}
                        >
                          <DreValue
                            value={row.valores[m.competencia]}
                            deduction={row.deduction}
                            pending={pending}
                            asterisk={asterisk}
                          />
                        </td>
                      );
                    })}
                    {showResumo ? (
                      <>
                        <td className="r dre-col-media">
                          <DreValue value={row.media} deduction={row.deduction} />
                        </td>
                        <td className="r dre-col-acum">
                          <DreValue value={row.acumulado} deduction={row.deduction} />
                        </td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={colSpan} className="td-mute">
                    Sem linhas com valor neste período.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {pendingMonths.length ? (
        <div className="alert-box warn">
          *Totais dos meses com CMV pendente usam só as linhas já lançadas. Lucro bruto/líquido completa depois do CMV.
        </div>
      ) : null}
    </>
  );
}
