"use client";

import Link from "next/link";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { brl } from "@/lib/api";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const PAL = ["#22a329", "#3b82f6", "#f59e0b", "#8b5cf6"];

type TaxRow = {
  debitos?: number;
  outrosDebitos?: number;
  saldoDevedor?: number;
  creditos?: number;
  saldoCredorAnterior?: number;
  outrosCreditos?: number;
  saldoCredor?: number;
  aRecolher?: number;
  saldoCredorSeguinte?: number;
  conferencia?: string;
};

type Serie = {
  labels?: string[];
  debitosIcms?: (number | null)[];
  creditosIcms?: (number | null)[];
  aRecolherIcms?: (number | null)[];
};

const TRIBUTOS: { key: string; label: string }[] = [
  { key: "icms", label: "ICMS" },
  { key: "ipi", label: "IPI" },
  { key: "pis", label: "PIS" },
  { key: "cofins", label: "COFINS" },
];

const EM_APURACAO = ["ICMS ST", "IRPJ", "CSLL"];

function moneyOrDash(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return brl(Number(v));
}

export default function ApuracaoDashboard({
  mode,
  d,
  serie,
  empresa,
  month,
  unidade,
}: {
  mode: "full" | "resumo";
  d: Record<string, any>;
  serie?: Serie;
  empresa: string;
  month: string;
  unidade: string;
}) {
  const livro = d.livroApuracao;
  if (!livro) return null;
  const ap = (d.apuracao || {}) as Record<string, TaxRow>;
  const icms = (ap.icms || {}) as TaxRow;
  const conferido = String(icms.conferencia || "").toUpperCase() === "OK";
  const href = `/dashboard/${empresa}/memoria?mes=${encodeURIComponent(month)}&unidade=${encodeURIComponent(unidade)}`;

  const doughnutRows = TRIBUTOS.map((t) => ({
    label: t.label,
    valor: Number(ap[t.key]?.aRecolher || 0),
  })).filter((r) => r.valor > 0.009);

  const labels = serie?.labels || [];
  const mil = (arr: (number | null)[] | undefined) =>
    (arr || []).map((v) => (v == null ? null : +(Number(v) / 1000).toFixed(1)));

  return (
    <>
      <div className="kpi-grid kpi-grid-6">
        <article className="tax-card">
          <div className="tax-name">DÉBITOS</div>
          <div className="tax-cur">{moneyOrDash(icms.debitos)}</div>
          <div className="tax-prev">Outros débitos {moneyOrDash(icms.outrosDebitos)}</div>
          <div className="tax-prev">Saldo devedor {moneyOrDash(icms.saldoDevedor)}</div>
        </article>
        <article className="tax-card">
          <div className="tax-name">CRÉDITOS</div>
          <div className="tax-cur">{moneyOrDash(icms.creditos)}</div>
          <div className="tax-prev">Saldo anterior {moneyOrDash(icms.saldoCredorAnterior)}</div>
          <div className="tax-prev">Outros créditos {moneyOrDash(icms.outrosCreditos)}</div>
        </article>
        <article className="tax-card">
          <div className="tax-name">A RECOLHER</div>
          <div className="tax-cur">{moneyOrDash(icms.aRecolher)}</div>
          <div className="tax-prev">Quando o saldo devedor é maior</div>
        </article>
        <article className="tax-card">
          <div className="tax-name">SALDO CREDOR</div>
          <div className="tax-cur">{moneyOrDash(icms.saldoCredor)}</div>
          <div className="tax-prev">Entradas + saldo anterior + outros créditos</div>
        </article>
        <article className="tax-card">
          <div className="tax-name">A TRANSPORTAR</div>
          <div className="tax-cur">{moneyOrDash(icms.saldoCredorSeguinte)}</div>
          <div className="tax-prev">Saldo credor a transportar</div>
        </article>
        <article className="tax-card">
          <div className="tax-card-head">
            <div className="tax-name">STATUS</div>
            <span className={`chip ${conferido ? "gr" : "ye"}`}>{conferido ? "CONFERIDO" : icms.conferencia || "—"}</span>
          </div>
          <div className="tax-cur">{conferido ? "CONFERIDO" : "—"}</div>
          <div className="tax-prev">Conferência do resumo de ICMS</div>
        </article>
      </div>

      <div className="table-card">
        <div className="table-head">
          <div className="ttl">APURAÇÃO POR TRIBUTO</div>
          <div className="sub">ICMS, IPI, PIS e COFINS do livro. ICMS ST, IRPJ e CSLL seguem em apuração.</div>
        </div>
        <div className="tbl-scroll">
          <table>
            <thead>
              <tr>
                <th>Tributo</th>
                <th className="r">Débitos</th>
                <th className="r">Créditos</th>
                <th className="r">Saldo credor</th>
                <th className="r">A recolher</th>
                <th className="r">A transportar</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {TRIBUTOS.map((t) => {
                const row = ap[t.key];
                const ok = String(row?.conferencia || "").toUpperCase() === "OK";
                return (
                  <tr key={t.key}>
                    <td className="fw7">{t.label}</td>
                    <td className="r">{row ? moneyOrDash(row.debitos) : "—"}</td>
                    <td className="r">{row ? moneyOrDash(row.creditos) : "—"}</td>
                    <td className="r">{row ? moneyOrDash(row.saldoCredor) : "—"}</td>
                    <td className="r">{row ? moneyOrDash(row.aRecolher) : "—"}</td>
                    <td className="r">{row ? moneyOrDash(row.saldoCredorSeguinte) : "—"}</td>
                    <td>
                      <span className={`chip ${ok ? "gr" : "gy"}`}>{ok ? "CONFERIDO" : row?.conferencia || "—"}</span>
                    </td>
                  </tr>
                );
              })}
              {EM_APURACAO.map((name) => (
                <tr key={name}>
                  <td className="fw7">{name}</td>
                  <td className="r">—</td>
                  <td className="r">—</td>
                  <td className="r">—</td>
                  <td className="r">—</td>
                  <td className="r">—</td>
                  <td><span className="chip ye">Em apuração</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {mode === "full" ? (
        <div className="charts-row cr-2col">
          <div className="chart-card">
            <div className="chart-ttl">Evolução ICMS — débitos, créditos e a recolher</div>
            <div className="chart-wrap h260">
              <Bar
                data={{
                  labels,
                  datasets: [
                    {
                      label: "Débitos",
                      data: mil(serie?.debitosIcms),
                      backgroundColor: "rgba(34,163,41,0.7)",
                      borderRadius: 4,
                    },
                    {
                      label: "Créditos",
                      data: mil(serie?.creditosIcms),
                      backgroundColor: "rgba(59,130,246,0.7)",
                      borderRadius: 4,
                    },
                    {
                      label: "A recolher",
                      data: mil(serie?.aRecolherIcms),
                      backgroundColor: "rgba(245,158,11,0.75)",
                      borderRadius: 4,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: "bottom" } },
                  scales: { y: { ticks: { callback: (v) => `R$ ${v}K` } } },
                }}
              />
            </div>
          </div>
          <div className="chart-card">
            <div className="chart-ttl">A recolher no mês</div>
            <div className="chart-wrap h260">
              {doughnutRows.length ? (
                <Doughnut
                  data={{
                    labels: doughnutRows.map((r) => r.label),
                    datasets: [{ data: doughnutRows.map((r) => r.valor), backgroundColor: PAL, borderWidth: 0 }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: "60%",
                    plugins: { legend: { position: "right" } },
                  }}
                />
              ) : (
                <p className="tax-prev">Sem imposto a recolher neste mês.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <p>
        <Link className="btn-export" href={href}>
          Ver memória de cálculo
        </Link>
      </p>
    </>
  );
}
