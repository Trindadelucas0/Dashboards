"use client";

import { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import { brl } from "@/lib/api";

const EVOL_PAL = {
  margemBruta: "#22a329",
  margemLiquida: "#3b82f6",
  corrente: "#f59e0b",
  seca: "#8b5cf6",
  imediata: "#06b6d4",
  geral: "#f97316",
} as const;

type Passo = {
  rotulo: string;
  valor?: number | null;
  fonte?: string;
  operador?: string | null;
};

type IndicadorItem = {
  valor?: number | null;
  valorFmt?: string;
  formula?: string;
  leitura?: string;
  nd?: boolean;
  detalhe?: {
    titulo?: string;
    formula?: string;
    leitura?: string;
    passos?: Passo[];
  };
};

type IndicadoresPack = {
  resultado?: Record<string, IndicadorItem>;
  liquidez?: Record<string, IndicadorItem>;
};

type Props = {
  indicadores?: IndicadoresPack | null;
  porMes?: { competencia: string; label?: string; indicadoresSchumacher?: IndicadoresPack }[];
  periodLabel?: string;
  hasDre?: boolean;
  hasBp?: boolean;
};

const RESULTADO_CARDS: { key: string; label: string; kind: "money" | "pct" }[] = [
  { key: "faturamento", label: "Faturamento", kind: "money" },
  { key: "lucroBruto", label: "Lucro bruto", kind: "money" },
  { key: "margemBruta", label: "Margem bruta", kind: "pct" },
  { key: "lucroLiquido", label: "Lucro líquido", kind: "money" },
  { key: "margemLiquida", label: "Margem líquida", kind: "pct" },
  { key: "ebitda", label: "EBITDA", kind: "money" },
];

const LIQUIDEZ_CARDS: { key: string; label: string }[] = [
  { key: "corrente", label: "Liquidez corrente" },
  { key: "seca", label: "Liquidez seca" },
  { key: "imediata", label: "Liquidez imediata" },
  { key: "geral", label: "Liquidez geral" },
];

function fmtValor(item: IndicadorItem | undefined, kind: "money" | "pct" | "ratio") {
  if (item?.valorFmt) return item.valorFmt;
  const v = item?.valor;
  if (v == null) return "N/D";
  if (kind === "pct") return `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  if (kind === "ratio") return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return brl(v);
}

function fmtPassoValor(v: number | null | undefined) {
  if (v == null) return "—";
  return brl(v);
}

function fmtPassoCell(p: Passo) {
  if (p.operador === "=" && typeof p.valor === "number" && Math.abs(p.valor) < 100 && p.rotulo.toLowerCase().includes("liquidez")) {
    return Number(p.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (p.operador === "=" && typeof p.valor === "number" && p.rotulo.toLowerCase().includes("margem")) {
    return `${Number(p.valor).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  }
  return fmtPassoValor(p.valor);
}

function IndicadorPassosTable({ passos }: { passos: Passo[] }) {
  if (!passos.length) {
    return <p className="ind-det-empty">Conta não encontrada no Balanço/DRE deste mês.</p>;
  }
  return (
    <div className="ind-card-expand-scroll">
      <table className="ind-det-table">
        <tbody>
          {passos.map((p, i) => (
            <tr key={`${p.rotulo}-${i}`}>
              <td className="ind-det-op">
                {p.operador && p.operador !== "soma" ? p.operador : p.operador === "soma" ? "Σ" : ""}
              </td>
              <td>
                <div>{p.rotulo}</div>
                {p.fonte ? <div className="ind-det-fonte">{p.fonte}</div> : null}
              </td>
              <td className="ind-det-val">{fmtPassoCell(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IndicadorDetalheModal({
  item,
  cardLabel,
  periodLabel,
  onClose,
}: {
  item: IndicadorItem;
  cardLabel: string;
  periodLabel: string;
  onClose: () => void;
}) {
  const det = item.detalhe || {};
  const passos = det.passos || [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ind-det-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box ind-det-modal">
        <div className="modal-header">
          <h3 id="ind-det-title">
            {det.titulo || cardLabel}
            {periodLabel ? ` · ${periodLabel}` : ""}
          </h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="ind-det-meta">
            <strong>Fórmula</strong> {det.formula || item.formula || "—"}
          </p>
          <p className="ind-det-meta">
            <strong>Leitura</strong> {det.leitura || item.leitura || "—"}
          </p>
          <h4 className="ind-det-sub">Como calculamos</h4>
          <IndicadorPassosTable passos={passos} />
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IndicadorCard({
  id,
  label,
  item,
  kind,
  expanded,
  onToggle,
  onInfo,
}: {
  id: string;
  label: string;
  item?: IndicadorItem;
  kind: "money" | "pct" | "ratio";
  expanded: boolean;
  onToggle: (id: string) => void;
  onInfo: (id: string) => void;
}) {
  const passos = item?.detalhe?.passos || [];

  return (
    <div
      className={`ind-card ind-card-clickable${expanded ? " ind-card-open" : ""}`}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`${label}. ${expanded ? "Recolher detalhes" : "Expandir detalhes do cálculo"}`}
      onClick={() => onToggle(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(id);
        }
      }}
    >
      <div className="ind-card-top">
        <div className="ind-name">{label}</div>
        <button
          type="button"
          className="ind-info-btn"
          aria-label="Abrir memória de cálculo em tela cheia"
          onClick={(e) => {
            e.stopPropagation();
            onInfo(id);
          }}
        >
          <i className="fas fa-circle-exclamation" aria-hidden />
        </button>
      </div>
      <div className="ind-val">{fmtValor(item, kind)}</div>
      <div className="ind-formula">{item?.formula || "—"}</div>
      <div className="ind-interp">{item?.leitura || "—"}</div>
      {!expanded ? <div className="ind-card-hint">Clique no card para ver o cálculo</div> : null}
      {expanded ? (
        <div className="ind-card-expand">
          <h4 className="ind-det-sub">Como calculamos</h4>
          <IndicadorPassosTable passos={passos} />
        </div>
      ) : null}
    </div>
  );
}

export default function IndicadoresSchumacher({ indicadores, porMes, periodLabel, hasDre, hasBp }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pack = indicadores || {};

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const openItem = useMemo(() => {
    if (!openId) return null;
    const [section, key] = openId.split(":");
    const sec = section === "liq" ? pack.liquidez : pack.resultado;
    return sec?.[key];
  }, [openId, pack]);

  const openLabel = useMemo(() => {
    if (!openId) return "";
    const [, key] = openId.split(":");
    const all = [...RESULTADO_CARDS, ...LIQUIDEZ_CARDS.map((c) => ({ ...c, kind: "ratio" as const }))];
    return all.find((c) => c.key === key)?.label || key;
  }, [openId]);

  const evolucaoChart = useMemo(() => {
    const rows = porMes || [];
    if (!rows.length) return null;
    const labels = rows.map((m) => m.label || m.competencia);
    const val = (m: (typeof rows)[0], resKey: string, liqKey?: string) => {
      const ind = m.indicadoresSchumacher;
      if (!ind) return null;
      if (liqKey) {
        const v = ind.liquidez?.[liqKey]?.valor;
        return v == null ? null : Number(v);
      }
      const v = ind.resultado?.[resKey]?.valor;
      return v == null ? null : Number(v);
    };
    return {
      labels,
      datasets: [
        {
          label: "Margem bruta %",
          data: rows.map((m) => val(m, "margemBruta")),
          borderColor: EVOL_PAL.margemBruta,
          tension: 0.3,
          fill: false,
          yAxisID: "y",
        },
        {
          label: "Margem líquida %",
          data: rows.map((m) => val(m, "margemLiquida")),
          borderColor: EVOL_PAL.margemLiquida,
          tension: 0.3,
          fill: false,
          yAxisID: "y",
        },
        {
          label: "Liquidez corrente",
          data: rows.map((m) => val(m, "", "corrente")),
          borderColor: EVOL_PAL.corrente,
          tension: 0.3,
          fill: false,
          yAxisID: "y1",
        },
        {
          label: "Liquidez seca",
          data: rows.map((m) => val(m, "", "seca")),
          borderColor: EVOL_PAL.seca,
          tension: 0.3,
          fill: false,
          yAxisID: "y1",
        },
        {
          label: "Liquidez imediata",
          data: rows.map((m) => val(m, "", "imediata")),
          borderColor: EVOL_PAL.imediata,
          tension: 0.3,
          fill: false,
          yAxisID: "y1",
        },
        {
          label: "Liquidez geral",
          data: rows.map((m) => val(m, "", "geral")),
          borderColor: EVOL_PAL.geral,
          tension: 0.3,
          fill: false,
          yAxisID: "y1",
        },
      ],
    };
  }, [porMes]);

  return (
    <>
      <p className="ind-sch-sub">
        Consolidado Matriz · DRE + Balanço importados
        {periodLabel ? ` · ${periodLabel}` : ""}
      </p>

      <div className="ind-section">
        <div className="ind-section-ttl">A · Resultado (DRE)</div>
        {!hasDre ? (
          <div className="ind-bp-banner">Sem DRE neste período — indicadores de resultado ficam N/D.</div>
        ) : null}
        <div className="ind-grid ind-grid-3">
          {RESULTADO_CARDS.map((c) => (
            <IndicadorCard
              key={c.key}
              id={`res:${c.key}`}
              label={c.label}
              item={pack.resultado?.[c.key]}
              kind={c.kind}
              expanded={expandedId === `res:${c.key}`}
              onToggle={toggleExpand}
              onInfo={setOpenId}
            />
          ))}
        </div>
      </div>

      <div className="ind-section">
        <div className="ind-section-ttl">B · Liquidez (Balanço)</div>
        {!hasBp ? (
          <div className="ind-bp-banner">
            Sem Balanço neste mês — liquidez fica N/D. Não inventamos saldo.
          </div>
        ) : null}
        <div className="ind-grid ind-grid-2">
          {LIQUIDEZ_CARDS.map((c) => (
            <IndicadorCard
              key={c.key}
              id={`liq:${c.key}`}
              label={c.label}
              item={pack.liquidez?.[c.key]}
              kind="ratio"
              expanded={expandedId === `liq:${c.key}`}
              onToggle={toggleExpand}
              onInfo={setOpenId}
            />
          ))}
        </div>
      </div>

      <div className="ind-section">
        <div className="ind-section-ttl">C · Evolução</div>
        {evolucaoChart ? (
          <>
            <p className="ind-sch-sub">
              Cada ponto é um mês importado no ano; os cards acima seguem o mês ou trimestre do chip.
            </p>
            <div className="chart-card">
              <div className="chart-ttl">Margem bruta %, margem líquida % e liquidez</div>
              <div className="chart-wrap h260">
                <Line
                  data={evolucaoChart}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    spanGaps: false,
                    plugins: { legend: { position: "bottom" } },
                    scales: {
                      y: {
                        position: "left",
                        ticks: { callback: (v) => `${v}%` },
                      },
                      y1: {
                        position: "right",
                        grid: { drawOnChartArea: false },
                      },
                    },
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="alert-box">Sem meses com DRE ou Balanço neste ano.</div>
        )}
      </div>

      {openItem ? (
        <IndicadorDetalheModal
          item={openItem}
          cardLabel={openLabel}
          periodLabel={periodLabel || ""}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  );
}
