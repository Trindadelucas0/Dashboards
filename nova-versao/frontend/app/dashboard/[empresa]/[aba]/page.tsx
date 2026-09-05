"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { api, brl, brlCompact, formatCnpj, pct } from "@/lib/api";
import { useDash } from "@/components/DashContext";
import ImportTab from "@/components/ImportTab";
import SupplierReportModal from "@/components/SupplierReportModal";
import DreStatement from "@/components/DreStatement";
import MemoriaLivro from "@/components/MemoriaLivro";
import BalanceteTree from "@/components/BalanceteTree";
import { exportVendasExcel, exportVendasPdf, type VendasExportInput } from "@/lib/vendasExport";
import { exportFinalidadeExcel, exportFinalidadePdf } from "@/lib/finalidadeExport";
import { exportCpfCnpjExcel } from "@/lib/cpfCnpjExport";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
);
ChartJS.defaults.color = "#94a3b8";
ChartJS.defaults.borderColor = "rgba(255,255,255,0.07)";
ChartJS.defaults.font.family = "Inter, system-ui, sans-serif";

const PAL = ["#22a329", "#3b82f6", "#f59e0b", "#8b5cf6", "#06b6d4", "#f97316", "#ef4444", "#10b981", "#64748b"];

type TrimestreTotais = {
  totalCompras: number;
  cfopSaidasTotal: number;
  receitaBruta: number;
  saldoOperacional: number;
  nfsEntradas: number;
  nfsSaidas: number;
  icmsARecolher: number | null;
  pisCofinsRecolher: number | null;
  deducoes: number | null;
  dedPct: number | null;
  icmsKpi: { val: number; lbl: string; color: string; sub: string } | null;
};

type TrimestrePayload = {
  id: string;
  key?: string;
  label: string;
  meses: string[];
  mesesPresentes: string[];
  mesesLabel: string;
  completo: boolean;
  totais: TrimestreTotais;
};

type TabResp = { empty: boolean; data: Record<string, any>; trimestre?: TrimestrePayload };

function rankClass(i: number) {
  if (i === 0) return "g1";
  if (i === 1) return "g2";
  if (i === 2) return "g3";
  return "gn";
}

function moneyOrDash(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return brl(n);
}

function trimestreSub(tri: TrimestrePayload | undefined) {
  if (!tri) return "";
  const n = tri.mesesPresentes?.length || 0;
  const base = tri.mesesLabel || tri.label;
  return `${base} (${n} de 3 meses)`;
}

function isTrimestreKey(key: string) {
  return /^q[1-4]-\d{4}$/i.test(key || "");
}

function trimestreKeyFromMonth(competencia: string): string {
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) return "";
  const year = competencia.slice(0, 4);
  const mm = Number(competencia.slice(5, 7));
  const q = Math.floor((mm - 1) / 3) + 1;
  return `q${q}-${year}`;
}

function trimestreChipLabel(key: string) {
  const m = /^q([1-4])-(\d{4})$/i.exec(key || "");
  if (!m) return key;
  return `${m[1]}º Trim`;
}

function quartersFromMonths(months: { competencia: string }[]) {
  const map = new Map<string, string[]>();
  for (const m of months) {
    const k = trimestreKeyFromMonth(m.competencia);
    if (!k) continue;
    const list = map.get(k) || [];
    list.push(m.competencia);
    map.set(k, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, comps]) => ({ key, comps, label: trimestreChipLabel(key) }));
}

function MesBar() {
  const { company, month, unidade, setMonth } = useDash();
  const months = (company?.months || []).filter((m) => !unidade || m.unidade === unidade);
  if (!months.length) return null;
  const quarters = quartersFromMonths(months);
  const activeTrim = isTrimestreKey(month) ? month.toLowerCase() : trimestreKeyFromMonth(month);
  const trimMeses = new Set(
    (isTrimestreKey(month)
      ? (() => {
          const m = /^q([1-4])-(\d{4})$/i.exec(month);
          if (!m) return [] as string[];
          const q = Number(m[1]);
          const year = m[2];
          const start = (q - 1) * 3 + 1;
          return [0, 1, 2].map((i) => `${year}-${String(start + i).padStart(2, "0")}`);
        })()
      : payloadTrimestreMeses(month)
    ).filter(Boolean),
  );

  return (
    <div className="vd-mes-bar" role="tablist" aria-label="Competência">
      {quarters.map((q, idx) => (
        <span key={q.key} className="vd-mes-group">
          {idx > 0 ? <span className="vd-mes-sep" aria-hidden>|</span> : null}
          <button
            type="button"
            className={`vd-mes-chip vd-mes-chip-trim ${month.toLowerCase() === q.key ? "active" : ""}${activeTrim === q.key ? " in-trim" : ""}`}
            onClick={() => setMonth(q.key)}
            title={`Soma dos meses: ${q.comps.join(", ")}`}
          >
            {q.label}
          </button>
          {months
            .filter((m) => trimestreKeyFromMonth(m.competencia) === q.key)
            .map((m) => (
              <button
                key={`${m.competencia}-${m.unidade}`}
                type="button"
                className={`vd-mes-chip ${m.competencia === month ? "active" : ""}${trimMeses.has(m.competencia) ? " in-trim" : ""}`}
                onClick={() => setMonth(m.competencia)}
              >
                {m.label}
              </button>
            ))}
        </span>
      ))}
    </div>
  );
}

/** Competências do trimestre civil do mês selecionado (sem API). */
function payloadTrimestreMeses(competencia: string): string[] {
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) return [];
  const year = competencia.slice(0, 4);
  const mm = Number(competencia.slice(5, 7));
  const q = Math.floor((mm - 1) / 3);
  const start = q * 3 + 1;
  return [0, 1, 2].map((i) => `${year}-${String(start + i).padStart(2, "0")}`);
}

function Kpi({ color, icon, value, label, sub, neg }: { color: string; icon: string; value: string; label: string; sub?: string; neg?: boolean }) {
  return (
    <article className={`kpi-card c-${color}`}>
      <div className="kpi-head">
        <div className={`kpi-ico c-${color}`}><i className={`fas fa-${icon}`} aria-hidden /></div>
      </div>
      <div className={`kpi-val${neg ? " neg" : ""}`}>{value}</div>
      <div className="kpi-lbl">{label}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </article>
  );
}

function TrimestreBlock({ tri, asMain }: { tri: TrimestrePayload; asMain?: boolean }) {
  const tot = tri.totais;
  const sub = trimestreSub(tri);
  return (
    <div className={`trim-block${asMain ? " trim-block-main" : ""}`}>
      <div className="trim-block-head">
        <div className="trim-block-title">{asMain ? tri.label : `Total — ${tri.label}`}</div>
        <div className="trim-block-sub">
          {asMain
            ? `Soma dos meses importados: ${tri.mesesLabel || "—"} (${tri.mesesPresentes?.length || 0} de 3)`
            : `${sub} · use o chip “1º Trim” / “2º Trim” na barra para ver o total somado na aba`}
        </div>
      </div>
      <div className="kpi-grid kpi-grid-4">
        <Kpi color="cyan" icon="file-invoice" value={brlCompact(tot.cfopSaidasTotal)} label="Vendas no trimestre" sub={sub} />
        <Kpi
          color="green"
          icon="cart-shopping"
          value={brlCompact(tot.totalCompras)}
          label="Compras no trimestre"
          sub={tot.nfsEntradas ? `${tot.nfsEntradas} NFs` : sub}
        />
        <Kpi
          color={tot.saldoOperacional >= 0 ? "green" : "red"}
          icon="scale-balanced"
          value={brlCompact(tot.saldoOperacional)}
          label="Saldo operacional"
          sub="Vendas − compras (trimestre)"
          neg={tot.saldoOperacional < 0}
        />
        {tot.icmsKpi ? (
          <Kpi
            color={tot.icmsKpi.color || "purple"}
            icon="landmark"
            value={brlCompact(tot.icmsKpi.val)}
            label={tot.icmsKpi.lbl}
            sub={tot.icmsKpi.sub || "Soma mensal no trimestre"}
          />
        ) : (
          <Kpi
            color="yellow"
            icon="coins"
            value={tot.pisCofinsRecolher != null ? brlCompact(Number(tot.pisCofinsRecolher)) : "—"}
            label="PIS + COFINS"
            sub={tot.pisCofinsRecolher != null ? "Soma a recolher no trimestre" : "Sem apuração no trimestre"}
          />
        )}
      </div>
    </div>
  );
}

function darkBar(opts?: { horizontal?: boolean }) {
  return {
    indexAxis: (opts?.horizontal ? "y" : "x") as "x" | "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { callback: (v: string | number) => (opts?.horizontal ? `R$ ${v}K` : v) } },
      y: { ticks: { callback: (v: string | number) => (opts?.horizontal ? v : `R$ ${v}K`) } },
    },
  };
}

function emptyMsg(aba: string) {
  if (aba === "dre") return "Importe a planilha RESULTADO para preencher a DRE. CMV e margens não são estimados.";
  if (aba === "impostos") return "Impostos só aparecem depois de importar a planilha de apuração. Não inventamos valor.";
  if (aba === "balancete") return "Balancete ainda não importado. Não inventamos saldo contábil.";
  if (aba === "memoria") return "Importe a planilha padrão (ou APURAÇÃO 5005 / PIS/COFINS) para ver a memória linha a linha.";
  if (aba === "recebimentos") {
    return "Sem movimento neste mês. Importe ENTRADAS/SAÍDAS (workbook parcial com movimento ou planilha EXITO).";
  }
  return "Sem movimento neste mês. Importe as planilhas na aba Importar.";
}

export default function AbaPage() {
  const params = useParams<{ empresa: string; aba: string }>();
  const { month, unidade, company } = useDash();
  const [payload, setPayload] = useState<TabResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drillCfop, setDrillCfop] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const aba = params.aba;

  useEffect(() => {
    if (!month || aba === "importar") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setDrillCfop(null);
    setExportMsg("");
    api<TabResp>(`/api/companies/${params.empresa}/months/${month}/${aba}?unidade=${encodeURIComponent(unidade || "matriz")}`)
      .then(setPayload)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.empresa, month, unidade, aba]);

  const d = (payload?.data || {}) as Record<string, any>;
  const tri = payload?.trimestre;
  const viewingTrimestre = isTrimestreKey(month) || Boolean(d.isTrimestre);
  const periodLabel = viewingTrimestre
    ? (d.competenciaLabel || tri?.label || month)
    : month;
  const cfopDadosAll = (d.cfopDados || []) as {
    cfop: string;
    descricao?: string;
    finalidade?: string;
    creditoPisCofins?: boolean;
    qtd: number;
    total: number;
    fornecedores?: { nome: string; cnpj: string; uf: string; qtd: number; total: number }[];
  }[];
  const drill = useMemo(() => cfopDadosAll.find((c) => c.cfop === drillCfop) || null, [cfopDadosAll, drillCfop]);

  if (aba === "importar") return <ImportTab />;

  const titles: Record<string, [string, string]> = {
    "visao-geral": ["Visão Geral", "Resumo executivo da competência"],
    compras: ["Compras", "Aquisições de mercadorias e insumos"],
    finalidade: ["Finalidade de Compras", "Por CFOP — clique para expandir fornecedores"],
    vendas: ["Vendas", "Faturamento de saídas por cliente e UF"],
    impostos: ["Impostos", "Apuração — só entra o que foi importado"],
    memoria: ["Memória de Cálculo", "Livro da planilha padrão — ICMS 5005, PIS/COFINS e demais tributos"],
    recebimentos: ["Recebimentos/Pagamentos", "Estimativa pelo movimento fiscal"],
    balancete: ["Balancete", "Contábil"],
    dre: ["DRE", "Demonstração do resultado"],
    indicadores: ["Indicadores", "Margens a partir do movimento"],
  };
  const title = (titles[aba] || [aba, ""])[0];
  const cnpj = company?.cnpj ? formatCnpj(company.cnpj) : "";
  const forn = (d.fornecedores || []) as { nome: string; uf: string; total: number; qtd?: number }[];
  const topCli = ((d.clientesTop10 || d.clientes || []) as { nome: string; uf: string; total: number; qtd?: number }[]).slice(0, 10);
  const ufEnt = (d.ufEntradas || []) as { uf: string; total: number; pct: number }[];
  const ufSai = (d.ufSaidas || []) as { uf: string; total: number; pct: number }[];
  const totalComp = Number(d.totalCompras || 0);
  const totalVend = Number(d.cfopSaidasTotal || d.receitaBruta || 0);
  const serie = d.serie || { labels: [], compras: [], vendas: [], nfsEntradas: [], nfsSaidas: [], competencias: [], deducoes: [], dedPct: [], margMb: [], margMl: [] };
  const maxForn = forn[0]?.total || 1;
  const maxCli = topCli[0]?.total || 1;
  const topForn = forn.slice(0, 8);
  const demaisForn = totalComp - topForn.reduce((a, b) => a + b.total, 0);
  const demaisCli = Number(d.demaisClientes ?? totalVend - topCli.reduce((a, b) => a + b.total, 0));
  const ap = d.apuracao as Record<string, any> | null;
  const composicao = (d.composicao || []) as { label: string; valor: number }[];
  const cfopDados = cfopDadosAll;
  const showBody = !loading && !error && !(payload?.empty);
  const showImpostosLayout = !loading && !error && (aba === "impostos");
  const showRecebimentos = !loading && !error && aba === "recebimentos";

  function vendasExportInput(): VendasExportInput {
    return {
      companyName: company?.label || "Empresa",
      competencia: month,
      unidade: unidade || "matriz",
      total: totalVend,
      receitaBruta: Number(d.receitaBruta ?? totalVend),
      nfs: Number(d.nfsSaidas || 0),
      ticketMedio: d.ticketMedio != null ? Number(d.ticketMedio) : null,
      ufSaidas: ufSai,
      cfopSaidas: (d.cfopSaidas || []) as VendasExportInput["cfopSaidas"],
      clientes: (d.clientes || topCli) as VendasExportInput["clientes"],
      vendasPorDoc: d.vendasPorDoc,
    };
  }

  async function runExport(fn: () => Promise<void>) {
    setExportMsg("");
    setExportBusy(true);
    try {
      await fn();
      setExportMsg("Arquivo gerado.");
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : "Falha ao gerar o arquivo.");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <section>
      <div className="sec-header">
        <div>
          <div className="sec-title">{title} <small>{periodLabel}{unidade ? ` · ${unidade}` : ""}</small></div>
          <div className="sec-sub">{company?.label}{cnpj ? ` — CNPJ ${cnpj}` : ""}{viewingTrimestre && tri ? ` · Soma ${tri.mesesLabel || ""}` : ""}</div>
        </div>
      </div>
      <MesBar />
      {loading ? <div className="notice">Carregando…</div> : null}
      {error ? <div className="error-banner" role="alert">{error}</div> : null}
      {!loading && !error && payload?.empty && aba !== "impostos" && aba !== "recebimentos" ? (
        <div className="alert-box warn">{emptyMsg(aba)}</div>
      ) : null}
      {!loading && !error && tri && aba !== "dre" ? <TrimestreBlock tri={tri} asMain={viewingTrimestre} /> : null}

      {aba === "finalidade" && !loading && !error ? (
        <>
          <div className="export-bar">
            <button
              type="button"
              className="btn-export"
              disabled={exportBusy || !showBody}
              onClick={() =>
                runExport(() =>
                  exportFinalidadePdf({
                    companyName: company?.label || "Empresa",
                    competencia: month,
                    unidade: unidade || "matriz",
                    totalCompras: totalComp,
                    nfsEntradas: Number(d.nfsEntradas || 0),
                    macro: d.macro || [],
                    cfopDados: cfopDadosAll,
                  }),
                )
              }
            >
              <i className="fas fa-file-pdf" /> Exportar PDF
            </button>
            <button
              type="button"
              className="btn-export"
              disabled={exportBusy || !showBody}
              onClick={() =>
                runExport(() =>
                  exportFinalidadeExcel({
                    companyName: company?.label || "Empresa",
                    competencia: month,
                    unidade: unidade || "matriz",
                    totalCompras: totalComp,
                    nfsEntradas: Number(d.nfsEntradas || 0),
                    macro: d.macro || [],
                    cfopDados: cfopDadosAll,
                  }),
                )
              }
            >
              <i className="fas fa-file-excel" /> Exportar Excel
            </button>
            {exportBusy ? <span className="export-msg">Gerando…</span> : null}
            {exportMsg ? <span className={`export-msg${exportMsg.startsWith("Falha") || exportMsg.includes("Erro") ? " err" : ""}`}>{exportMsg}</span> : null}
          </div>
          <SupplierReportModal
            empresa={params.empresa}
            unidade={unidade || "matriz"}
            month={month}
            periodLabel={periodLabel}
            companyName={company?.label || "Empresa"}
            months={company?.months || []}
            cfopDados={cfopDadosAll}
          />
        </>
      ) : null}

      {showBody && aba === "visao-geral" && (
        <>
          {(() => {
            const receita = Number(d.receitaBruta ?? totalVend);
            const vendas = Number(d.cfopSaidasTotal ?? totalVend);
            const saldo = Number(d.saldoOperacional ?? vendas - totalComp);
            const icmsKpi = d.icmsKpi as { val: number; lbl: string; color: string; sub: string } | null;
            const pisCofins = d.pisCofinsRecolher;
            const carga = d.dedPct;
            return (
              <div className="kpi-grid kpi-grid-8">
                <Kpi color="blue" icon="store" value={brlCompact(receita)} label="Receita Bruta" sub={d.hasDre ? "Fonte: DRE" : "Fonte: planilha de saídas"} />
                <Kpi color="cyan" icon="file-invoice" value={brlCompact(vendas)} label="Total Vendas (saídas)" sub={d.nfsSaidas ? `${d.nfsSaidas} NFs` : "Planilha de saídas"} />
                <Kpi color="green" icon="cart-shopping" value={brlCompact(totalComp)} label="Total de Compras" sub={d.nfsEntradas ? `${d.nfsEntradas} NFs` : "Planilha de entradas"} />
                <Kpi
                  color={saldo >= 0 ? "green" : "red"}
                  icon="scale-balanced"
                  value={brlCompact(saldo)}
                  label="Saldo Operacional"
                  sub="Vendas − compras"
                  neg={saldo < 0}
                />
                <Kpi
                  color={icmsKpi?.color || "purple"}
                  icon="landmark"
                  value={icmsKpi ? brlCompact(icmsKpi.val) : "—"}
                  label={icmsKpi?.lbl || "ICMS a Recolher"}
                  sub={icmsKpi?.sub || "Sem apuração neste mês"}
                />
                <Kpi
                  color="yellow"
                  icon="coins"
                  value={pisCofins != null ? brlCompact(Number(pisCofins)) : "—"}
                  label="PIS + COFINS"
                  sub={pisCofins != null ? "A recolher no período" : "Sem apuração neste mês"}
                />
                <Kpi
                  color="orange"
                  icon="percent"
                  value={carga != null ? `${carga}%` : "—"}
                  label="Carga Tributária"
                  sub={carga != null ? "Sobre receita bruta" : "Aguardando apuração"}
                />
                <Kpi color="cyan" icon="receipt" value={String(d.nfsSaidas ?? "—")} label="NFs / Linhas" sub="Notas de saída" />
              </div>
            );
          })()}
          <div className="charts-row cr-2col">
            <div className="chart-card">
              <div className="chart-ttl">Receita Bruta × Deduções Tributárias</div>
              <div className="chart-sub">Valores mensais importados (R$ mil)</div>
              <div className="chart-wrap h260">
                <Bar
                  data={{
                    labels: serie.labels.length ? serie.labels : [month || "—"],
                    datasets: [
                      {
                        label: "Receita Bruta (R$ mil)",
                        data: (serie.vendas.length ? serie.vendas : [totalVend]).map((v: number) => +(Number(v || 0) / 1000).toFixed(1)),
                        backgroundColor: "rgba(34,163,41,0.7)",
                        borderRadius: 4,
                      },
                      {
                        label: "Deduções Trib. (R$ mil)",
                        data: (serie.deducoes?.length ? serie.deducoes : [d.deducoes]).map((v: number | null) => (v == null ? null : +(Number(v) / 1000).toFixed(1))),
                        backgroundColor: "rgba(239,68,68,0.65)",
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
              <div className="chart-ttl">Deduções Tributárias sobre a Receita (%)</div>
              <div className="chart-sub">% de deduções sobre RB mensal</div>
              <div className="chart-wrap h260">
                <Line
                  data={{
                    labels: serie.labels.length ? serie.labels : [month || "—"],
                    datasets: [{
                      label: "Deduções % s/ RB",
                      data: serie.dedPct?.length ? serie.dedPct : [d.dedPct],
                      borderColor: "#ef4444",
                      backgroundColor: "rgba(239,68,68,0.1)",
                      borderWidth: 2.5,
                      pointRadius: 5,
                      fill: true,
                      tension: 0.3,
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    spanGaps: false,
                    plugins: { legend: { position: "bottom" } },
                    scales: { y: { min: 0, ticks: { callback: (v) => `${v}%` } } },
                  }}
                />
              </div>
            </div>
          </div>
          <div className="charts-row cr-2col">
            <div className="chart-card">
              <div className="chart-ttl">Composição das Deduções</div>
              <div className="chart-sub">Participação de cada tributo no total de deduções do mês</div>
              <div className="chart-wrap h260">
                <Doughnut
                  data={{
                    labels: composicao.length ? composicao.map((c) => c.label) : ["Sem apuração"],
                    datasets: [{ data: composicao.length ? composicao.map((c) => c.valor) : [1], backgroundColor: PAL, borderWidth: 0 }],
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "right" } } }}
                />
              </div>
            </div>
            <div className="chart-card">
              <div className="chart-ttl">Análise de Impostos sobre Vendas</div>
              <div className="chart-sub">Valores apurados / % sobre Receita Bruta de {brl(totalVend)}</div>
              <div className="tbl-scroll">
                <table>
                  <thead><tr><th>Tributo</th><th className="r">Apurado Bruto</th><th className="r">A Recolher</th><th className="r">% s/ RB</th></tr></thead>
                  <tbody>
                    {ap ? (
                      <>
                        {(["icms", "icmsSt", "pis", "cofins"] as const).map((k) => {
                          const labels: Record<string, [string, string]> = {
                            icms: ["ICMS", "bl"],
                            icmsSt: ["ICMS ST", "pu"],
                            pis: ["PIS", "gr"],
                            cofins: ["COFINS", "ye"],
                          };
                          const row = ap[k] || {};
                          return (
                            <tr key={k}>
                              <td>{labels[k][0]}</td>
                              <td className="r">{brl(row.apurado)}</td>
                              <td className="r td-val">{brl(row.aRecolher)}</td>
                              <td className="r"><span className={`chip ${labels[k][1]}`}>{row.pctRb ?? 0}%</span></td>
                            </tr>
                          );
                        })}
                        <tr><td>IRPJ</td><td className="r td-mute" colSpan={3}>Em apuração</td></tr>
                        <tr><td>CSLL</td><td className="r td-mute" colSpan={3}>Em apuração</td></tr>
                      </>
                    ) : (
                      <tr><td colSpan={4} className="td-mute" style={{ padding: 16 }}>Apuração detalhada disponível após importar planilha de impostos.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {showBody && aba === "compras" && (
        <>
          {(() => {
            const cfopsCp = (d.cfopDados || []) as { cfop: string; total: number }[];
            const topCfop = cfopsCp[0];
            const conc = d.concentracaoTopFornecedor;
            const topFornNome = forn[0]?.nome?.slice(0, 28) || "";
            return (
              <div className="kpi-grid kpi-grid-5">
                <Kpi color="green" icon="cart-shopping" value={brlCompact(totalComp)} label="Total de Compras" sub={d.nfsEntradas ? `${d.nfsEntradas} NFs` : "Planilha pendente"} />
                <Kpi color="cyan" icon="file-lines" value={topCfop?.cfop || "—"} label="Maior CFOP entrada" sub={topCfop ? brl(topCfop.total) : ""} />
                <Kpi color="orange" icon="tags" value={String(cfopsCp.length || "—")} label="CFOPs distintos" />
                <Kpi color="blue" icon="truck" value={String(forn.length || "—")} label="Fornecedores distintos" />
                <Kpi
                  color="purple"
                  icon="chart-pie"
                  value={conc != null ? `${conc}%` : "—"}
                  label="Concentração top fornecedor"
                  sub={topFornNome || undefined}
                />
              </div>
            );
          })()}
          <div className="charts-row cr-2col">
            <div className="chart-card">
              <div className="chart-ttl">Ranking de Fornecedores</div>
              <div className="chart-sub">Valor contábil de entradas (R$ mil)</div>
              <div className="chart-wrap h300">
                <Bar
                  data={{
                    labels: topForn.length ? topForn.map((f) => f.nome.slice(0, 28)) : ["Sem dados"],
                    datasets: [{ data: topForn.length ? topForn.map((f) => +(f.total / 1000).toFixed(1)) : [0], backgroundColor: PAL, borderRadius: 5 }],
                  }}
                  options={darkBar({ horizontal: true })}
                />
              </div>
            </div>
            <div className="chart-card">
              <div className="chart-ttl">Compras por Estado de Origem (UF)</div>
              <div className="chart-sub">Participação % por UF dos fornecedores</div>
              <div className="chart-wrap h300">
                <Doughnut
                  data={{
                    labels: ufEnt.length ? ufEnt.map((u) => u.uf) : ["Sem dados"],
                    datasets: [{ data: ufEnt.length ? ufEnt.map((u) => u.pct) : [100], backgroundColor: PAL, borderWidth: 0 }],
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, cutout: "58%", plugins: { legend: { position: "right" } } }}
                />
              </div>
            </div>
          </div>
          <div className="table-card">
            <div className="table-head">
              <div className="ttl">Ranking de Fornecedores</div>
              <div className="sub">Participação individual no volume total de compras</div>
            </div>
            <div className="tbl-scroll">
              <table>
                <thead><tr><th>#</th><th>Fornecedor</th><th>UF</th><th className="r">Valor Contábil</th><th>Participação</th><th className="r">CFOP Principal</th></tr></thead>
                <tbody>
                  {topForn.map((f, i) => (
                    <tr key={f.nome + i}>
                      <td><div className={`rank ${rankClass(i)}`}>{i + 1}</div></td>
                      <td><div className="fw7">{f.nome}</div><div className="td-mute">{f.qtd || "—"} NFs</div></td>
                      <td><span className="chip bl">{f.uf}</span></td>
                      <td className="r td-val">{brl(f.total)}</td>
                      <td>
                        <div className="pb-wrap">
                          <div className="pb-bar"><div className="pb-fill" style={{ width: `${(f.total / maxForn) * 100}%` }} /></div>
                          <div className="pb-pct">{totalComp ? ((f.total / totalComp) * 100).toFixed(1) : "0.0"}%</div>
                        </div>
                      </td>
                      <td className="r td-mute">—</td>
                    </tr>
                  ))}
                  {demaisForn > 0.009 ? (
                    <tr>
                      <td><div className="rank gn">{topForn.length + 1}+</div></td>
                      <td><div className="fw7">Demais Fornecedores</div></td>
                      <td><span className="chip gy">—</span></td>
                      <td className="r td-val">{brl(demaisForn)}</td>
                      <td className="r td-mute">—</td>
                      <td className="r td-mute">vários</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showBody && aba === "finalidade" && (
        <>
          <div className="alert-box">
            <i className="fas fa-info-circle" style={{ marginRight: 8 }} />
            Cada entrada é classificada pelo CFOP da NF-e. Nenhuma classificação manual. Clique em Detalhes para ver fornecedores do CFOP.
          </div>
          <div className="kpi-grid kpi-grid-4">
            {((d.topGrupos || []) as { grupo: string; total: number; pct: number }[]).length
              ? ((d.topGrupos || []) as { grupo: string; total: number; pct: number }[]).map((g, i) => {
                  const colors = ["green", "cyan", "orange", "purple"] as const;
                  const lbl = g.grupo.length > 42 ? `${g.grupo.slice(0, 40)}…` : g.grupo;
                  return (
                    <Kpi
                      key={g.grupo}
                      color={colors[i] || "blue"}
                      icon="layer-group"
                      value={brlCompact(g.total)}
                      label={lbl}
                      sub={`${g.pct}% do total`}
                    />
                  );
                })
              : <Kpi color="blue" icon="info-circle" value="—" label="Sem entradas" />}
          </div>
          <div className="charts-row cr-2col">
            <div className="chart-card">
              <div className="chart-ttl">Distribuição por Finalidade Fiscal</div>
              <div className="chart-sub">% do valor total de entradas</div>
              <div className="chart-wrap h280">
                <Doughnut
                  data={{
                    labels: (d.macro || []).map((m: { label: string }) => m.label),
                    datasets: [{ data: (d.macro || []).map((m: { pct: number }) => m.pct), backgroundColor: (d.macro || []).map((m: { color: string }) => m.color), borderWidth: 0 }],
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, cutout: "58%", plugins: { legend: { position: "right" } } }}
                />
              </div>
            </div>
            <div className="chart-card">
              <div className="chart-ttl">Valor por Finalidade (R$ mil)</div>
              <div className="chart-sub">Comparativo dos grupos fiscais de compras</div>
              <div className="chart-wrap h280">
                <Bar
                  data={{
                    labels: (d.macro || []).map((m: { label: string }) => m.label),
                    datasets: [{ data: (d.macro || []).map((m: { total: number }) => +(m.total / 1000).toFixed(1)), backgroundColor: (d.macro || []).map((m: { color: string }) => m.color), borderRadius: 5 }],
                  }}
                  options={darkBar()}
                />
              </div>
            </div>
          </div>
          <div className="table-card">
            <div className="table-head">
              <div className="ttl">Detalhamento por CFOP — Clique para expandir fornecedores</div>
              <div className="sub">Cada CFOP possui sua finalidade fiscal e créditos tributários permitidos</div>
            </div>
            <div className="tbl-scroll">
              <table>
                <thead>
                  <tr>
                    <th>CFOP</th><th>Descrição</th><th>Finalidade</th><th>Créd. PIS/COFINS</th>
                    <th className="r">Nº NFs</th><th className="r">Total (R$)</th><th className="r">% Total</th><th className="c">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {cfopDados.map((c) => (
                    <tr key={c.cfop}>
                      <td><span className="chip" style={{ fontFamily: "monospace", fontWeight: 700 }}>{c.cfop}</span></td>
                      <td className="td-mute">{c.descricao || "—"}</td>
                      <td><span className="chip bl">{c.finalidade || "—"}</span></td>
                      <td>{c.creditoPisCofins ? <span className="chip gr">Sim</span> : <span className="chip gy">Não</span>}</td>
                      <td className="r">{c.qtd}</td>
                      <td className="r td-val">{brl(c.total)}</td>
                      <td className="r">{totalComp ? ((c.total / totalComp) * 100).toFixed(1) : "0.0"}%</td>
                      <td className="c">
                        <button type="button" className="btn-export" onClick={() => setDrillCfop(c.cfop)}>
                          {drillCfop === c.cfop ? "Fechar" : "Abrir"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {drill ? (
            <div className="drilldown-panel">
              <div className="drilldown-head">
                <div>
                  <div className="ttl">CFOP {drill.cfop} — {drill.descricao}</div>
                  <div className="sub">{drill.finalidade} · {brl(drill.total)} · {(drill.fornecedores || []).length} fornecedores</div>
                </div>
                <button type="button" className="btn-export" onClick={() => setDrillCfop(null)}>Fechar</button>
              </div>
              <div className="tbl-scroll">
                <table>
                  <thead><tr><th>#</th><th>Fornecedor</th><th>CNPJ</th><th>UF</th><th className="r">Nº NFs</th><th className="r">Total (R$)</th><th className="r">% CFOP</th></tr></thead>
                  <tbody>
                    {(drill.fornecedores || []).map((f, i) => (
                      <tr key={f.cnpj + i}>
                        <td><div className={`rank ${rankClass(i)}`}>{i + 1}</div></td>
                        <td className="fw7">{f.nome}</td>
                        <td className="td-mute">{f.cnpj}</td>
                        <td><span className="chip bl">{f.uf}</span></td>
                        <td className="r">{f.qtd}</td>
                        <td className="r td-val">{brl(f.total)}</td>
                        <td className="r">{drill.total ? ((f.total / drill.total) * 100).toFixed(1) : "0.0"}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {(() => {
            const st = (d.servicosTomados || {}) as {
              total?: number;
              qtd?: number;
              pctCompras?: number;
              porTipo?: { key: string; label: string; color: string; total: number; qtd: number; pct: number }[];
              cfops?: { cfop: string; descricao?: string; finalidade?: string; qtd: number; total: number }[];
            };
            const stTotal = Number(st.total || 0);
            const porTipo = st.porTipo || [];
            const issqn = porTipo.find((t) => t.key === "Serviço ISSQN");
            const transp = porTipo.find((t) => t.key === "Serviço Transp.");
            const comun = porTipo.find((t) => t.key === "Serviço Comunicação" || t.key === "outros_serv");
            return (
              <div className="ind-section" style={{ marginTop: 28 }}>
                <div className="ind-section-ttl">Serviços Tomados</div>
                {stTotal <= 0 ? (
                  <div className="alert-box">Sem serviços tomados neste mês (nenhum CFOP de ISSQN / transporte / comunicação).</div>
                ) : (
                  <>
                    <div className="kpi-grid kpi-grid-4">
                      <Kpi
                        color="blue"
                        icon="handshake"
                        value={brlCompact(stTotal)}
                        label="Total serviços"
                        sub={`${st.pctCompras ?? 0}% das compras · ${st.qtd || 0} NFs`}
                      />
                      <Kpi
                        color="cyan"
                        icon="file-invoice"
                        value={issqn ? brlCompact(issqn.total) : "—"}
                        label="Serviço ISSQN"
                        sub={issqn ? `${issqn.pct}% dos serviços · ${issqn.qtd} NFs` : "Sem CFOP 933"}
                      />
                      <Kpi
                        color="orange"
                        icon="truck"
                        value={transp ? brlCompact(transp.total) : "—"}
                        label="Serviço transporte"
                        sub={transp ? `${transp.pct}% dos serviços · ${transp.qtd} NFs` : "Sem CFOP 353"}
                      />
                      <Kpi
                        color="purple"
                        icon="broadcast-tower"
                        value={comun ? brlCompact(comun.total) : "—"}
                        label="Comunicação / outros"
                        sub={comun ? `${comun.pct}% dos serviços · ${comun.qtd} NFs` : "Sem valor"}
                      />
                    </div>
                    <div className="charts-row cr-2col">
                      <div className="chart-card">
                        <div className="chart-ttl">Distribuição dos serviços</div>
                        <div className="chart-sub">Dentro do total de serviços tomados</div>
                        <div className="chart-wrap h280">
                          <Doughnut
                            data={{
                              labels: porTipo.map((t) => t.label),
                              datasets: [{
                                data: porTipo.map((t) => t.pct),
                                backgroundColor: porTipo.map((t) => t.color),
                                borderWidth: 0,
                              }],
                            }}
                            options={{ responsive: true, maintainAspectRatio: false, cutout: "58%", plugins: { legend: { position: "right" } } }}
                          />
                        </div>
                      </div>
                      <div className="chart-card">
                        <div className="chart-ttl">CFOPs de serviço</div>
                        <div className="chart-sub">Clique em Detalhes na tabela principal para fornecedores</div>
                        <div className="tbl-scroll" style={{ maxHeight: 280 }}>
                          <table>
                            <thead>
                              <tr>
                                <th>CFOP</th><th>Finalidade</th><th className="r">NFs</th><th className="r">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(st.cfops || []).map((c) => (
                                <tr key={`svc-${c.cfop}`}>
                                  <td><span className="chip" style={{ fontFamily: "monospace", fontWeight: 700 }}>{c.cfop}</span></td>
                                  <td><span className="chip bl">{c.finalidade || "—"}</span></td>
                                  <td className="r">{c.qtd}</td>
                                  <td className="r td-val">{brl(c.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </>
      )}

      {showBody && aba === "vendas" && (
        <>
          <div className="export-bar">
            <button type="button" className="btn-export" disabled={exportBusy} onClick={() => runExport(() => exportVendasPdf(vendasExportInput()))}>
              <i className="fas fa-file-pdf" /> Exportar PDF
            </button>
            <button type="button" className="btn-export" disabled={exportBusy} onClick={() => runExport(() => exportVendasExcel(vendasExportInput()))}>
              <i className="fas fa-file-excel" /> Exportar Excel
            </button>
            <button
              type="button"
              className="btn-export"
              disabled={exportBusy}
              onClick={() =>
                runExport(() =>
                  exportCpfCnpjExcel({
                    empresaId: params.empresa,
                    companyName: company?.label || "Empresa",
                    competencia: month,
                    unidade: unidade || "matriz",
                    total: totalVend,
                    clientes: (d.clientes || topCli) as { nome: string; uf: string; total: number; qtd?: number; cnpj?: string; tipoDoc?: string }[],
                    vendasPorDoc: d.vendasPorDoc,
                  }),
                )
              }
            >
              <i className="fas fa-id-card" /> Excel CPF/CNPJ detalhado
            </button>
            {exportBusy ? <span className="export-msg">Gerando…</span> : null}
            {exportMsg ? <span className={`export-msg${exportMsg.startsWith("Falha") || exportMsg.includes("Erro") ? " err" : ""}`}>{exportMsg}</span> : null}
          </div>
          {(() => {
            const receita = Number(d.receitaBruta ?? totalVend);
            const ticket = d.ticketMedio != null ? Number(d.ticketMedio) : (d.nfsSaidas ? totalVend / Number(d.nfsSaidas) : null);
            const top = topCli[0];
            const ufTop = ufSai[0];
            const varVd = (d.variacaoVendas || {}) as { pct: number | null; label?: string };
            const varPct = varVd.pct;
            const varTxt =
              varPct == null
                ? "—"
                : `${varPct >= 0 ? "+" : ""}${Number(varPct).toFixed(1).replace(".", ",")}%`;
            const varSub = varVd.label || "vs mês anterior";
            const porDoc = (d.vendasPorDoc || {}) as {
              cpf?: { total: number; qtd: number; pct: number | null };
              cnpj?: { total: number; qtd: number; pct: number | null };
            };
            const cpfPct = porDoc.cpf?.pct;
            const cnpjPct = porDoc.cnpj?.pct;
            return (
              <div className="kpi-grid kpi-grid-8">
                <Kpi color="blue" icon="store" value={brlCompact(receita)} label="Receita Bruta" />
                <Kpi
                  color="green"
                  icon="file-invoice"
                  value={brlCompact(totalVend)}
                  label="Total Saídas Contábil"
                  sub={varPct != null ? varTxt : (d.nfsSaidas ? `${d.nfsSaidas} NFs` : "Planilha pendente")}
                />
                <Kpi
                  color="cyan"
                  icon="receipt"
                  value={ticket != null ? brlCompact(ticket) : "—"}
                  label="Ticket médio"
                  sub="Saídas / NFs"
                />
                <Kpi
                  color="purple"
                  icon="user-tie"
                  value={top?.nome?.slice(0, 22) || "—"}
                  label="Top cliente"
                  sub={top ? brl(top.total) : undefined}
                />
                <Kpi
                  color="orange"
                  icon="map-location-dot"
                  value={ufTop?.uf || "—"}
                  label="UF principal"
                  sub={ufTop ? brl(ufTop.total) : undefined}
                />
                <Kpi
                  color="yellow"
                  icon="chart-line"
                  value={varTxt}
                  label="Variação vendas"
                  sub={varSub}
                  neg={varPct != null && varPct < 0}
                />
                <Kpi
                  color="cyan"
                  icon="id-card"
                  value={totalVend && cpfPct != null ? brlCompact(porDoc.cpf?.total || 0) : "—"}
                  label="Vendas CPF"
                  sub={cpfPct != null ? `${Number(cpfPct).toFixed(1).replace(".", ",")}% · ${porDoc.cpf?.qtd || 0} NFs` : "Sem documento CPF"}
                />
                <Kpi
                  color="green"
                  icon="building"
                  value={totalVend && cnpjPct != null ? brlCompact(porDoc.cnpj?.total || 0) : "—"}
                  label="Vendas CNPJ"
                  sub={cnpjPct != null ? `${Number(cnpjPct).toFixed(1).replace(".", ",")}% · ${porDoc.cnpj?.qtd || 0} NFs` : "Sem documento CNPJ"}
                />
              </div>
            );
          })()}
          <div className="charts-row cr-2col">
            <div className="chart-card">
              <div className="chart-ttl">Ranking de Clientes por Faturamento</div>
              <div className="chart-sub">Valor contábil de vendas (R$ mil)</div>
              <div className="chart-wrap h300">
                <Bar
                  data={{
                    labels: [...topCli.map((c) => c.nome.slice(0, 22)), ...(demaisCli > 0 ? ["Demais"] : [])],
                    datasets: [{ data: [...topCli.map((c) => +(c.total / 1000).toFixed(1)), ...(demaisCli > 0 ? [+(demaisCli / 1000).toFixed(1)] : [])], backgroundColor: PAL, borderRadius: 5 }],
                  }}
                  options={darkBar({ horizontal: true })}
                />
              </div>
            </div>
            <div className="chart-card">
              <div className="chart-ttl">Vendas por Estado de Destino (UF)</div>
              <div className="chart-sub">Participação % das saídas</div>
              <div className="chart-wrap h300">
                <Doughnut
                  data={{
                    labels: ufSai.length ? ufSai.map((u) => u.uf) : ["Sem dados"],
                    datasets: [{ data: ufSai.length ? ufSai.map((u) => u.pct) : [100], backgroundColor: PAL, borderWidth: 0 }],
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, cutout: "58%", plugins: { legend: { position: "right" } } }}
                />
              </div>
            </div>
          </div>
          <div className="table-card">
            <div className="table-head">
              <div className="ttl">Ranking de Clientes</div>
              <div className="sub">Faturamento individual e participação no mês</div>
            </div>
            <div className="tbl-scroll">
              <table>
                <thead><tr><th>#</th><th>Cliente</th><th>UF</th><th className="r">Faturamento</th><th>Participação</th></tr></thead>
                <tbody>
                  {topCli.map((c, i) => (
                    <tr key={c.nome + i}>
                      <td><div className={`rank ${rankClass(i)}`}>{i + 1}</div></td>
                      <td><div className="fw7">{c.nome}</div><div className="td-mute">{c.qtd || "—"} NFs</div></td>
                      <td><span className="chip bl">{c.uf}</span></td>
                      <td className="r td-val">{brl(c.total)}</td>
                      <td>
                        <div className="pb-wrap">
                          <div className="pb-bar"><div className="pb-fill" style={{ width: `${(c.total / maxCli) * 100}%` }} /></div>
                          <div className="pb-pct">{totalVend ? ((c.total / totalVend) * 100).toFixed(1) : "0.0"}%</div>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {demaisCli > 0.009 ? (
                    <tr>
                      <td><div className="rank gn">{topCli.length + 1}+</div></td>
                      <td><div className="fw7">Demais Clientes</div></td>
                      <td><span className="chip gy">—</span></td>
                      <td className="r td-val">{brl(demaisCli)}</td>
                      <td className="r td-mute">—</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          <div className="table-card">
            <div className="table-head">
              <div className="ttl">CFOP de Saídas</div>
              <div className="sub">Classificação fiscal das vendas</div>
            </div>
            <div className="tbl-scroll">
              <table>
                <thead><tr><th>CFOP</th><th>Descrição</th><th className="r">Qtd NF</th><th className="r">Valor (R$)</th><th className="r">%</th></tr></thead>
                <tbody>
                  {(d.cfopSaidas || []).map((c: { cfop: string; descricao?: string; qtd: number; total: number }) => (
                    <tr key={c.cfop}>
                      <td><span className="chip" style={{ fontFamily: "monospace", fontWeight: 700 }}>{c.cfop}</span></td>
                      <td className="td-mute">{c.descricao || "—"}</td>
                      <td className="r">{c.qtd}</td>
                      <td className="r td-val">{brl(c.total)}</td>
                      <td className="r">{totalVend ? ((c.total / totalVend) * 100).toFixed(1) : "0.0"}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showImpostosLayout && (
        (() => {
          const vendas = Number(d.receitaBruta || d.cfopSaidasTotal || totalVend || 0);
          const taxKeys = ["icms", "icmsSt", "pis", "cofins", "ipi", "difal", "irpj", "csll"] as const;
          let sumRecolher: number | null = null;
          if (ap) {
            let any = false;
            let acc = 0;
            for (const k of taxKeys) {
              const row = ap[k];
              if (row && typeof row === "object" && ("aRecolher" in row || "apurado" in row)) {
                acc += Number(row.aRecolher ?? 0);
                any = true;
              }
            }
            sumRecolher = any ? acc : null;
          }
          const totalImp =
            d.deducoes != null && d.deducoes !== undefined ? Number(d.deducoes) : sumRecolher;
          const pctVendas =
            vendas > 0 && totalImp != null
              ? Math.round((10000 * totalImp) / vendas) / 100
              : d.dedPct != null && vendas > 0
                ? Number(d.dedPct)
                : null;
          const pctSobreVendas = (aRecolher: number | null | undefined) => {
            if (aRecolher == null || !(vendas > 0)) return null;
            return Math.round((10000 * Number(aRecolher)) / vendas) / 100;
          };
          const fmtPct = (n: number | null | undefined) =>
            n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

          return (
            <>
              {payload?.empty || !ap ? (
                <div className="alert-box warn">
                  Impostos só aparecem depois de importar a planilha de apuração. Não inventamos valor.
                </div>
              ) : null}

              <div className="kpi-grid kpi-grid-4 imp-kpi-top">
                <Kpi
                  color="cyan"
                  icon="file-invoice"
                  value={vendas > 0 ? brlCompact(vendas) : "—"}
                  label="Vendas do mês"
                  sub={vendas > 0 ? "Receita bruta / saídas do pack" : "Sem faturamento neste mês"}
                />
                <Kpi
                  color="orange"
                  icon="coins"
                  value={totalImp != null ? brlCompact(totalImp) : "—"}
                  label="Total impostos"
                  sub={totalImp != null ? "Soma a recolher / deduções do pack" : "Aguardando apuração"}
                />
                <Kpi
                  color="red"
                  icon="percent"
                  value={fmtPct(pctVendas)}
                  label="Total impostos / Vendas"
                  sub={pctVendas != null ? "% sobre faturamento do mês" : "Sem vendas ou sem apuração"}
                />
                <Kpi
                  color="purple"
                  icon="chart-pie"
                  value={fmtPct(d.dedPct != null ? Number(d.dedPct) : pctVendas)}
                  label="Carga tributária"
                  sub={d.dedPct != null ? "dedPct do pack" : pctVendas != null ? "Calculado na tela" : "N/D"}
                />
              </div>

              <div className="tax-grid">
                {(
                  [
                    ["ICMS", "icms", "t-accent", "bl"],
                    ["ICMS ST", "icmsSt", "", "pu"],
                    ["PIS", "pis", "t-success", "gr"],
                    ["COFINS", "cofins", "t-warning", "ye"],
                    ["IPI", "ipi", "", "gy"],
                    ...(ap?.difal ? ([["DIFAL", "difal", "", "gy"]] as const) : []),
                    ["IRPJ/CSLL", "irpj_csll", "", "gy"],
                  ] as const
                ).map(([name, key, curClass, chip]) => {
                  const row =
                    key === "irpj_csll"
                      ? ap?.irpj || ap?.csll
                        ? {
                            aRecolher: Number(ap?.irpj?.aRecolher ?? 0) + Number(ap?.csll?.aRecolher ?? 0),
                            apurado: Number(ap?.irpj?.apurado ?? 0) + Number(ap?.csll?.apurado ?? 0),
                          }
                        : null
                      : (ap?.[key as keyof typeof ap] as { aRecolher?: number; apurado?: number } | null | undefined);
                  const aRec = row ? Number(row.aRecolher ?? row.apurado) : null;
                  const pctSv = row ? pctSobreVendas(row.aRecolher ?? row.apurado) : null;
                  const stUfEntries =
                    key === "icmsSt"
                      ? Object.entries((d.porUfSt || {}) as Record<string, number>).filter(
                          ([, v]) => Math.abs(Number(v) || 0) > 0.009,
                        )
                      : [];
                  return (
                    <div className="tax-card" key={key}>
                      <div className="tax-card-head">
                        <div className={`tax-name ${curClass}`}>{name}</div>
                        <span className={`chip ${chip}`}>{row ? "Importado" : "Em apuração"}</span>
                      </div>
                      <div className={`tax-cur ${curClass}`}>{row && aRec != null ? brl(aRec) : "—"}</div>
                      <div className="tax-prev">
                        {row
                          ? `Apurado: ${brl(row.apurado)} · % s/ vendas: ${fmtPct(pctSv)}`
                          : "Aguardando planilha deste tributo"}
                      </div>
                      {stUfEntries.length ? (
                        <div className="tax-prev" style={{ marginTop: 6 }}>
                          Por UF:{" "}
                          {stUfEntries
                            .map(([uf, v]) => `${uf} ${brl(Number(v))}`)
                            .join(" · ")}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="charts-row cr-2col">
                <div className="chart-card">
                  <div className="chart-ttl">Evolução — Receita × Deduções</div>
                  <div className="chart-wrap h260">
                    <Bar
                      data={{
                        labels: serie.labels || [],
                        datasets: [
                          {
                            label: "Receita",
                            data: (serie.vendas || []).map((v: number) => +(v / 1000).toFixed(1)),
                            backgroundColor: "rgba(34,163,41,0.7)",
                            borderRadius: 4,
                          },
                          {
                            label: "Deduções",
                            data: (serie.deducoes || []).map((v: number | null) =>
                              v == null ? null : +(v / 1000).toFixed(1),
                            ),
                            backgroundColor: "rgba(239,68,68,0.65)",
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
                  <div className="chart-ttl">Participação das deduções</div>
                  <div className="chart-wrap h260">
                    <Doughnut
                      data={{
                        labels: composicao.length ? composicao.map((c) => c.label) : ["Sem dados"],
                        datasets: [
                          {
                            data: composicao.length ? composicao.map((c) => c.valor) : [1],
                            backgroundColor: PAL,
                            borderWidth: 0,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: "60%",
                        plugins: { legend: { position: "right" } },
                      }}
                    />
                  </div>
                </div>
              </div>
            </>
          );
        })()
      )}

      {showBody && aba === "memoria" && (
        <MemoriaLivro d={d} ap={ap} month={month} monthLabel={periodLabel} />
      )}

      {showRecebimentos && (
        (() => {
          const hasRecMov = Boolean(d.hasMovimentacao) && (totalVend > 0 || totalComp > 0);
          const saldo = d.saldo != null ? Number(d.saldo) : totalVend - totalComp;
          const pctCv = d.comprasSobreVendasPct != null ? Number(d.comprasSobreVendasPct) : null;
          const ticket = d.ticketMedio != null ? Number(d.ticketMedio) : null;
          const cobertura = d.cobertura != null ? Number(d.cobertura) : null;
          const nfsS = Number(d.nfsSaidas || 0);
          const nfsE = Number(d.nfsEntradas || 0);
          const vendasSerie = (serie.vendas || []) as (number | null)[];
          const comprasSerie = (serie.compras || []) as (number | null)[];
          const nfsSSerie = (serie.nfsSaidas || []) as (number | null)[];
          const nfsESerie = (serie.nfsEntradas || []) as (number | null)[];
          const labels = (serie.labels?.length ? serie.labels : [month || "—"]) as string[];
          const comps = (serie.competencias || []) as string[];
          const sumFilled = (arr: (number | null)[]) =>
            arr.reduce((s, v) => (v == null ? s : s + Number(v)), 0);
          const acumRec = sumFilled(vendasSerie);
          const acumPag = sumFilled(comprasSerie);
          const idx = comps.indexOf(month);
          let momPct: number | null = null;
          if (!viewingTrimestre && idx > 0) {
            const prev = vendasSerie[idx - 1];
            const cur = vendasSerie[idx];
            if (prev != null && prev > 0 && cur != null) {
              momPct = Math.round((10000 * (cur - prev)) / prev) / 100;
            }
          }
          const dashOr = (ok: boolean, value: string) => (ok ? value : "—");
          const fmtPctNum = (n: number | null | undefined) =>
            n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
          const doughnutHas = hasRecMov && (totalVend > 0 || totalComp > 0);
          return (
            <>
              {!hasRecMov ? (
                <div className="alert-box warn">
                  Sem movimento neste mês. Importe o workbook com ENTRADAS/SAÍDAS (aceita parcial sem DRE/BAL) ou as planilhas EXITO.
                </div>
              ) : null}
              <div className="alert-box">
                <i className="fas fa-info-circle" style={{ marginRight: 8 }} />
                Estimativa pelo faturamento e entradas NF-e — não substitui o financeiro (caixa/contas a receber).
              </div>
              <div className="kpi-grid kpi-grid-4">
                <Kpi
                  color="green"
                  icon="arrow-down"
                  value={dashOr(hasRecMov, brl(totalVend))}
                  label="Recebimentos estimados"
                  sub="Faturamento (saídas NF-e)"
                />
                <Kpi
                  color="red"
                  icon="arrow-up"
                  value={dashOr(hasRecMov, brl(totalComp))}
                  label="Pagamentos estimados"
                  sub="Compras (entradas NF-e)"
                />
                <Kpi
                  color={hasRecMov && saldo < 0 ? "orange" : "blue"}
                  icon="wallet"
                  value={dashOr(hasRecMov, brl(saldo))}
                  label="Saldo estimado"
                  sub="Recebimentos − pagamentos"
                  neg={hasRecMov && saldo < 0}
                />
                <Kpi
                  color="cyan"
                  icon="percent"
                  value={dashOr(hasRecMov, fmtPctNum(pctCv))}
                  label="Compras / Vendas"
                  sub="Pressão de caixa estimada"
                />
              </div>
              <div className="kpi-grid kpi-grid-4">
                <Kpi
                  color="green"
                  icon="file-invoice"
                  value={dashOr(hasRecMov && nfsS > 0, String(nfsS))}
                  label="NFs de saída"
                  sub="Volume de recebimentos"
                />
                <Kpi
                  color="orange"
                  icon="file-import"
                  value={dashOr(hasRecMov && nfsE > 0, String(nfsE))}
                  label="NFs de entrada"
                  sub="Volume de pagamentos"
                />
                <Kpi
                  color="purple"
                  icon="receipt"
                  value={dashOr(hasRecMov && ticket != null, ticket != null ? brl(ticket) : "—")}
                  label="Ticket médio"
                  sub="Recebimentos / NFs saída"
                />
                <Kpi
                  color="cyan"
                  icon="scale-balanced"
                  value={dashOr(
                    hasRecMov && cobertura != null,
                    cobertura != null ? `${cobertura.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}×` : "—",
                  )}
                  label="Cobertura (V/C)"
                  sub="Vendas ÷ compras do mês"
                />
              </div>
              <div className="kpi-grid kpi-grid-4">
                <Kpi
                  color="green"
                  icon="chart-line"
                  value={acumRec ? brlCompact(acumRec) : "—"}
                  label="Receb. acumulados"
                  sub="Soma dos meses com movimento"
                />
                <Kpi
                  color="red"
                  icon="chart-line"
                  value={acumPag ? brlCompact(acumPag) : "—"}
                  label="Pag. acumulados"
                  sub="Soma dos meses com movimento"
                />
                <Kpi
                  color={acumRec - acumPag < 0 ? "orange" : "blue"}
                  icon="scale-balanced"
                  value={acumRec || acumPag ? brlCompact(acumRec - acumPag) : "—"}
                  label="Saldo acumulado"
                  sub="Acumulado do ano na série"
                  neg={acumRec - acumPag < 0}
                />
                <Kpi
                  color={momPct != null && momPct < 0 ? "red" : "green"}
                  icon="arrow-trend-up"
                  value={fmtPctNum(momPct)}
                  label="Δ Receb. vs mês anterior"
                  sub={idx > 0 && labels[idx - 1] ? `vs ${labels[idx - 1]}` : "Sem mês anterior"}
                  neg={momPct != null && momPct < 0}
                />
              </div>
              <div className="charts-row cr-2col">
                <div className="chart-card">
                  <div className="chart-ttl">Recebimentos × Pagamentos (série mensal)</div>
                  <div className="chart-sub">Meses sem movimento aparecem como lacuna (sem zero inventado)</div>
                  <div className="chart-wrap h260">
                    <Bar
                      data={{
                        labels,
                        datasets: [
                          {
                            label: "Recebimentos",
                            data: (vendasSerie.length ? vendasSerie : [hasRecMov ? totalVend : null]).map((v: number | null) =>
                              v == null ? null : +(Number(v) / 1000).toFixed(1),
                            ),
                            backgroundColor: "#22a329",
                            borderRadius: 5,
                            spanGaps: false,
                          },
                          {
                            label: "Pagamentos",
                            data: (comprasSerie.length ? comprasSerie : [hasRecMov ? totalComp : null]).map((v: number | null) =>
                              v == null ? null : +(Number(v) / 1000).toFixed(1),
                            ),
                            backgroundColor: "#3b82f6",
                            borderRadius: 5,
                            spanGaps: false,
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
                  <div className="chart-ttl">Composição do mês</div>
                  <div className="chart-sub">Recebimentos vs pagamentos (R$ do mês)</div>
                  <div className="chart-wrap h260">
                    <Doughnut
                      data={{
                        labels: doughnutHas ? ["Recebimentos", "Pagamentos"] : ["Sem dados"],
                        datasets: [
                          {
                            data: doughnutHas ? [totalVend, totalComp] : [1],
                            backgroundColor: doughnutHas ? ["#22a329", "#3b82f6"] : ["#64748b"],
                            borderWidth: 0,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: "58%",
                        plugins: {
                          legend: { position: "right" },
                          tooltip: {
                            callbacks: {
                              label: (c) => {
                                if (!doughnutHas) return String(c.label || "");
                                const val = Number(c.parsed || 0);
                                return `${c.label}: ${brl(val)}`;
                              },
                            },
                          },
                        },
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="table-card">
                <div className="table-head">
                  <div className="ttl">Evolução mensal estimada</div>
                  <div className="sub">Recebimentos e pagamentos por competência — lacuna quando não há movimento</div>
                </div>
                <div className="tbl-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Mês</th>
                        <th className="r">Recebimentos</th>
                        <th className="r">Pagamentos</th>
                        <th className="r">Saldo</th>
                        <th className="r">Comp./Vend.</th>
                        <th className="r">NFs saída</th>
                        <th className="r">NFs entrada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labels.map((lab, i) => {
                        const rec = vendasSerie[i];
                        const pag = comprasSerie[i];
                        const filled = rec != null || pag != null;
                        const recN = rec == null ? 0 : Number(rec);
                        const pagN = pag == null ? 0 : Number(pag);
                        const sal = filled ? recN - pagN : null;
                        const ratio = filled && recN > 0 ? Math.round((10000 * pagN) / recN) / 100 : null;
                        const isCur = comps[i] ? comps[i] === month : false;
                        return (
                          <tr key={`${lab}-${i}`} className={isCur ? "row-cur" : undefined}>
                            <td className="fw7">{lab}{isCur ? " · atual" : ""}</td>
                            <td className="r td-val">{rec == null ? "—" : brl(recN)}</td>
                            <td className="r td-val">{pag == null ? "—" : brl(pagN)}</td>
                            <td className={`r td-val${sal != null && sal < 0 ? " neg" : ""}`}>{sal == null ? "—" : brl(sal)}</td>
                            <td className="r">{fmtPctNum(ratio)}</td>
                            <td className="r">{nfsSSerie[i] == null ? "—" : nfsSSerie[i]}</td>
                            <td className="r">{nfsESerie[i] == null ? "—" : nfsESerie[i]}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          );
        })()
      )}

      {showBody && aba === "balancete" && (
        <BalanceteTree
          porMes={d.porMes || []}
          selectedCompetencia={month}
          source={d.balanceteSource || d.balancete?.source}
          periodoLabel={d.periodoLabel}
        />
      )}

      {showBody && aba === "dre" && (
          <DreStatement
            porMes={d.porMes || []}
            selectedCompetencia={month}
            source={d.dreSource || d.dre?.source}
          />
      )}

      {showBody && aba === "indicadores" && (
        (() => {
          const mb = d.margMb != null ? d.margMb : d.margemBruta != null ? +(100 * d.margemBruta).toFixed(2) : null;
          const ml = d.margMl != null ? d.margMl : null;
          const mo = d.margMo != null ? d.margMo : null;
          const carga = d.dedPct != null ? d.dedPct : null;
          const hasBp = !!(d.hasBalancete || d.balanceteTotais);
          const statusDot = (ok: boolean | null, label: string) => (
            <span className={`ind-status-dot ${ok == null ? "nd" : ok ? "ok" : "warn"}`}>
              <i />
              {label}
            </span>
          );
          const fmtPct = (n: number | null | undefined) =>
            n == null ? "N/D" : `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
          const margMbSerie =
            serie.margMb?.length
              ? serie.margMb
              : (serie.vendas || []).map((v: number, i: number) => {
                  const c = serie.compras?.[i] || 0;
                  return v ? +(((v - c) / v) * 100).toFixed(2) : null;
                });
          return (
            <>
              <div className="ind-section">
                <div className="ind-section-ttl">A · Margens</div>
                <div className="ind-grid ind-grid-3">
                  <div className="ind-card">
                    <div className="ind-card-top">
                      <div className="ind-name">Margem bruta</div>
                      {statusDot(mb == null ? null : mb >= 0, mb == null ? "Sem DRE" : d.hasDre ? "DRE" : "Estimativa")}
                    </div>
                    <div className="ind-val">{fmtPct(mb)}</div>
                    <div className="ind-formula">
                      {d.hasDre ? "Lucro bruto / Receita bruta" : "(Vendas − Compras) / Vendas"}
                    </div>
                    <div className="ind-interp">
                      {d.hasDre
                        ? "Margem oficial da DRE importada."
                        : d.margemEstimada
                          ? "Estimativa pelo movimento — sem CMV contábil."
                          : "Aguardando DRE ou movimento."}
                    </div>
                  </div>
                  <div className="ind-card">
                    <div className="ind-card-top">
                      <div className="ind-name">Margem operacional</div>
                      {statusDot(mo == null ? null : mo >= 0, mo == null ? "N/D" : "DRE")}
                    </div>
                    <div className="ind-val">{fmtPct(mo)}</div>
                    <div className="ind-formula">Lucro operacional / Receita bruta</div>
                    <div className="ind-interp">
                      {mo != null
                        ? "Linha de resultado operacional encontrada na DRE."
                        : "Em cálculo — a DRE importada não traz lucro/resultado operacional."}
                    </div>
                  </div>
                  <div className="ind-card">
                    <div className="ind-card-top">
                      <div className="ind-name">Margem líquida</div>
                      {statusDot(ml == null ? null : ml >= 0, ml == null ? "N/D" : "DRE")}
                    </div>
                    <div className="ind-val">{fmtPct(ml)}</div>
                    <div className="ind-formula">Lucro líquido / Receita bruta</div>
                    <div className="ind-interp">
                      {ml != null ? "Margem líquida da DRE." : "N/D até importar DRE com lucro líquido."}
                    </div>
                  </div>
                </div>
              </div>

              <div className="ind-section">
                <div className="ind-section-ttl">B · Carga tributária</div>
                <div className="ind-grid ind-grid-2">
                  <div className="ind-card">
                    <div className="ind-card-top">
                      <div className="ind-name">Carga sobre receita</div>
                      {statusDot(carga == null ? null : true, carga == null ? "Em apuração" : "Apuração")}
                    </div>
                    <div className="ind-val">{fmtPct(carga)}</div>
                    <div className="ind-formula">Deduções / Receita</div>
                    <div className="ind-interp">
                      {carga != null
                        ? `Deduções ${d.deducoes != null ? brl(d.deducoes) : "—"} sobre RB ${brl(d.receitaBruta)}.`
                        : "Preenche após apuração/DRE do mês."}
                    </div>
                  </div>
                  <div className="ind-card">
                    <div className="ind-card-top">
                      <div className="ind-name">Receita bruta (referência)</div>
                      {statusDot(d.receitaBruta ? true : null, d.hasDre ? "DRE" : "Movimento")}
                    </div>
                    <div className="ind-val">{d.receitaBruta != null ? brl(d.receitaBruta) : "—"}</div>
                    <div className="ind-formula">{d.hasDre ? "RB da DRE" : "Σ saídas NF-e"}</div>
                    <div className="ind-interp">Base usada nos percentuais desta tela.</div>
                  </div>
                </div>
              </div>

              <div className="ind-section">
                <div className="ind-section-ttl">C · Indicadores patrimoniais</div>
                {!hasBp ? (
                  <div className="ind-bp-banner">
                    Sem Balancete neste mês — liquidez, endividamento e capital de giro ficam N/D. Não inventamos BP.
                  </div>
                ) : (
                  <div className="alert-box">Balancete presente — indicadores patrimoniais detalhados ainda em construção; totais no card abaixo.</div>
                )}
                <div className="ind-grid ind-grid-4">
                  {[
                    ["Liquidez corrente", "Ativo circulante / Passivo circulante"],
                    ["Endividamento", "Passivo / Ativo"],
                    ["Capital de giro", "AC − PC"],
                    ["Participação de terceiros", "Passivo / PL"],
                  ].map(([name, formula]) => (
                    <div className="ind-card ind-card-nd" key={name}>
                      <div className="ind-card-top">
                        <div className="ind-name">{name}</div>
                        {statusDot(null, hasBp ? "Em cálculo" : "N/D")}
                      </div>
                      <div className="ind-val">N/D</div>
                      <div className="ind-formula">{formula}</div>
                      <div className="ind-interp">
                        {hasBp
                          ? "Exige contas circulantes/PL desdobradas — ainda não mapeadas no pack."
                          : "Importe o Balancete da competência."}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ind-section">
                <div className="ind-section-ttl">D · Evolução</div>
                <div className="chart-card">
                  <div className="chart-ttl">Deduções %, margem bruta % e margem líquida %</div>
                  <div className="chart-wrap h260">
                    <Line
                      data={{
                        labels: serie.labels || [],
                        datasets: [
                          { label: "Deduções %", data: serie.dedPct || [], borderColor: "#ef4444", tension: 0.3, fill: false },
                          { label: "MB %", data: margMbSerie, borderColor: "#22a329", tension: 0.3, fill: false },
                          {
                            label: "ML %",
                            data: serie.margMl || [],
                            borderColor: "#3b82f6",
                            tension: 0.3,
                            fill: false,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        spanGaps: false,
                        plugins: { legend: { position: "bottom" } },
                        scales: { y: { ticks: { callback: (v) => `${v}%` } } },
                      }}
                    />
                  </div>
                </div>
              </div>
            </>
          );
        })()
      )}
    </section>
  );
}
