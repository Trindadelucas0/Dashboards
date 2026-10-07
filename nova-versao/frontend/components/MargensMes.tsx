"use client";

import { Bar } from "react-chartjs-2";
import { brl } from "@/lib/api";

type Resumo = {
  qtde?: number;
  aVista?: number;
  aPrazo?: number;
  total?: number;
  custo?: number;
  lucroBruto?: number;
  lucroLiquido?: number;
  margBruta?: number;
  margLiquida?: number;
};

type Serie = {
  labels?: string[];
  competencias?: string[];
  total?: (number | null)[];
  lucroBruto?: (number | null)[];
};

const PAL = ["#22a329", "#3b82f6"];

function margPct(ratio: number | null | undefined) {
  if (ratio == null || Number.isNaN(Number(ratio))) return "—";
  return `${(Number(ratio) * 100).toFixed(2).replace(".", ",")}%`;
}

function num(n: number | null | undefined) {
  return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function Kpi({
  color,
  icon,
  value,
  label,
  sub,
  neg,
}: {
  color: string;
  icon: string;
  value: string;
  label: string;
  sub?: string;
  neg?: boolean;
}) {
  return (
    <article className={`kpi-card c-${color}`}>
      <div className="kpi-head">
        <div className={`kpi-ico c-${color}`}>
          <i className={`fas fa-${icon}`} aria-hidden />
        </div>
      </div>
      <div className={`kpi-val${neg ? " neg" : ""}`}>{value}</div>
      <div className="kpi-lbl">{label}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </article>
  );
}

export default function MargensMes({ d, periodLabel }: { d: Record<string, any>; periodLabel: string }) {
  const mm = (d.margemMes || {}) as { resumo?: Resumo };
  const resumo = mm.resumo || {};
  const serie = (d.serie || {}) as Serie;
  const total = Number(resumo.total || 0);
  const lucroBruto = Number(resumo.lucroBruto || 0);
  const lucroLiq = Number(resumo.lucroLiquido || 0);
  const aVista = Number(resumo.aVista || 0);
  const aPrazo = Number(resumo.aPrazo || 0);
  const qtde = Number(resumo.qtde || 0);
  const custo = Number(resumo.custo || 0);
  const labels = serie.labels || [];
  const hasSerie = labels.length > 0 && (serie.total || []).some((v) => v != null);

  return (
    <>
      <div className="kpi-grid kpi-grid-8">
        <Kpi color="blue" icon="store" value={brl(total)} label="TOTAL VENDAS" sub={periodLabel} />
        <Kpi color="purple" icon="file-invoice" value={brl(aPrazo)} label="A PRAZO" />
        <Kpi color="cyan" icon="money-bill" value={brl(aVista)} label="A VISTA" />
        <Kpi color="orange" icon="boxes-stacked" value={num(qtde)} label="QUANTIDADE" />
        <Kpi color="yellow" icon="tags" value={brl(custo)} label="CUSTO" />
        <Kpi
          color={lucroBruto < 0 ? "red" : "green"}
          icon="chart-line"
          value={brl(lucroBruto)}
          label="LUCRO BRUTO"
          sub={`marg. ${margPct(resumo.margBruta)}`}
          neg={lucroBruto < 0}
        />
        <Kpi
          color={lucroLiq < 0 ? "red" : "green"}
          icon="chart-pie"
          value={brl(lucroLiq)}
          label="LUCRO LÍQUIDO"
          sub={`marg. ${margPct(resumo.margLiquida)}`}
          neg={lucroLiq < 0}
        />
        <Kpi color="blue" icon="percent" value={margPct(resumo.margBruta)} label="MARGEM BRUTA" sub="demonstrativo" />
      </div>

      <div className="chart-card">
        <div className="chart-ttl">Evolução mensal</div>
        <div className="chart-sub">Total e lucro bruto — matriz</div>
        <div className="chart-wrap h280">
          {hasSerie ? (
            <Bar
              data={{
                labels,
                datasets: [
                  { label: "Total", data: serie.total || [], backgroundColor: PAL[0], borderRadius: 4 },
                  { label: "Lucro bruto", data: serie.lucroBruto || [], backgroundColor: PAL[1], borderRadius: 4 },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: "bottom" } },
                scales: { x: { grid: { display: false } }, y: { ticks: { callback: (v) => brl(Number(v)) } } },
              }}
            />
          ) : (
            <div className="muted">Sem série mensal neste recorte.</div>
          )}
        </div>
      </div>
    </>
  );
}
