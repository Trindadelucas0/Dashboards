"use client";

import { Fragment, useMemo, useState } from "react";
import { brl } from "@/lib/api";

type Cidade = {
  codCidade: string;
  cidade: string;
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

type Resumo = {
  itens?: number;
  total?: number;
  lucroBruto?: number;
  lucroLiquido?: number;
  margBruta?: number;
  margLiquida?: number;
};

type SortKey = "total" | "lucroLiquido" | "margLiquida" | "cidade";

function margPct(ratio: number | null | undefined) {
  if (ratio == null || Number.isNaN(Number(ratio))) return "—";
  return `${(Number(ratio) * 100).toFixed(2).replace(".", ",")}%`;
}

function signClass(n: number | null | undefined) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return "td-val";
  return v < 0 ? "td-val neg" : "td-val pos";
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

export default function MargensCidade({ d }: { d: Record<string, any> }) {
  const mc = (d.margemCidade || {}) as {
    periodoLabel?: string;
    resumo?: Resumo;
    cidades?: Cidade[];
  };
  const resumo = mc.resumo || {};
  const cidades = (mc.cidades || []) as Cidade[];
  const periodo = mc.periodoLabel || "Acumulado";
  const [busca, setBusca] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [aberto, setAberto] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let rows = cidades.filter((c) => {
      if (!q) return true;
      return String(c.cidade || "").toLowerCase().includes(q) || String(c.codCidade || "").includes(q);
    });
    rows = [...rows].sort((a, b) => {
      if (sortKey === "cidade") return String(a.cidade).localeCompare(String(b.cidade), "pt-BR");
      return Number(b[sortKey] || 0) - Number(a[sortKey] || 0);
    });
    return rows;
  }, [cidades, busca, sortKey]);

  const total = Number(resumo.total || 0);
  const lucroBruto = Number(resumo.lucroBruto || 0);
  const lucroLiq = Number(resumo.lucroLiquido || 0);
  const itens = Number(resumo.itens || cidades.length);

  return (
    <>
      <div className="kpi-grid kpi-grid-8">
        <Kpi color="blue" icon="city" value={brl(total)} label="TOTAL" sub={`${itens} cidades · ${periodo}`} />
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
      </div>

      <div className="table-card">
        <div className="table-head">
          <div>
            <div className="ttl">CIDADES</div>
            <div className="sub">{filtradas.length} linhas · clique para detalhe</div>
          </div>
        </div>
        <div className="vp-toolbar">
          <label className="search-box" style={{ marginBottom: 0, flex: "1 1 180px" }}>
            <select
              className="period-sel"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="Ordenar"
            >
              <option value="total">Ordenar: Total</option>
              <option value="lucroLiquido">Ordenar: Lucro líquido</option>
              <option value="margLiquida">Ordenar: Margem líquida</option>
              <option value="cidade">Ordenar: Cidade</option>
            </select>
          </label>
          <label className="search-box" style={{ marginBottom: 0, flex: "1 1 220px" }}>
            <input type="search" placeholder="Buscar cidade…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
        </div>
        <div className="tbl-scroll">
          <table>
            <thead>
              <tr>
                <th>Cód.</th>
                <th>Cidade</th>
                <th className="r">Total</th>
                <th className="r">Lucro líq.</th>
                <th className="r">Marg. líq.</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((c) => {
                const key = `${c.codCidade}-${c.cidade}`;
                const open = aberto === key;
                return (
                  <Fragment key={key}>
                    <tr className="row-click" onClick={() => setAberto(open ? null : key)}>
                      <td>{c.codCidade}</td>
                      <td className="fw7">{c.cidade}</td>
                      <td className={`r ${signClass(c.total)}`}>{brl(c.total)}</td>
                      <td className={`r ${signClass(c.lucroLiquido)}`}>{brl(c.lucroLiquido)}</td>
                      <td className="r">{margPct(c.margLiquida)}</td>
                    </tr>
                    {open ? (
                      <tr className="detail-row">
                        <td colSpan={5}>
                          <div className="detail-grid">
                            <span>Qtde: {Number(c.qtde || 0).toLocaleString("pt-BR")}</span>
                            <span>À vista: {brl(c.aVista)}</span>
                            <span>A prazo: {brl(c.aPrazo)}</span>
                            <span>Custo: {brl(c.custo)}</span>
                            <span>Lucro bruto: {brl(c.lucroBruto)}</span>
                            <span>Marg. bruta: {margPct(c.margBruta)}</span>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
