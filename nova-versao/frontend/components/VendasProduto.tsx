"use client";

import { Fragment, useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import { brl } from "@/lib/api";

type Produto = {
  codigo: string;
  produto: string;
  qtde: number;
  qtdeUn?: number;
  aVista: number;
  aPrazo: number;
  total: number;
  custo: number;
  lucroBruto: number;
  lucroLiquido: number;
  margBruta: number;
  margLiquida: number;
  pmp: number;
};

type Resumo = {
  itens?: number;
  qtde?: number;
  aVista?: number;
  aPrazo?: number;
  total?: number;
  custo?: number;
  lucroBruto?: number;
  lucroLiquido?: number;
  margBruta?: number;
  margLiquida?: number;
  pmp?: number;
};

type Serie = {
  labels?: string[];
  competencias?: string[];
  total?: (number | null)[];
  lucroBruto?: (number | null)[];
};

const PAL = ["#22a329", "#3b82f6"];

type Filtro = "todos" | "margNeg" | "aVista" | "qtdeZero";
type SortKey = "total" | "lucroLiquido" | "margLiquida" | "qtde" | "codigo";

function margPct(ratio: number | null | undefined) {
  if (ratio == null || Number.isNaN(Number(ratio))) return "—";
  return `${(Number(ratio) * 100).toFixed(2).replace(".", ",")}%`;
}

function num(n: number | null | undefined) {
  return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
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

export default function VendasProduto({
  d,
  periodLabel,
  unidadeLabel,
}: {
  d: Record<string, any>;
  periodLabel: string;
  unidadeLabel?: string;
}) {
  const vp = (d.vendaProduto || {}) as { resumo?: Resumo; produtos?: Produto[] };
  const resumo = vp.resumo || {};
  const produtos = (vp.produtos || []) as Produto[];
  const serie = (d.serie || {}) as Serie;
  const [showLista, setShowLista] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let rows = produtos.filter((p) => {
      if (filtro === "margNeg" && !(Number(p.margLiquida) < 0)) return false;
      if (filtro === "aVista" && !(Number(p.aVista) > 0)) return false;
      if (filtro === "qtdeZero" && Number(p.qtde) !== 0) return false;
      if (!q) return true;
      return String(p.codigo || "").toLowerCase().includes(q) || String(p.produto || "").toLowerCase().includes(q);
    });
    rows = [...rows].sort((a, b) => {
      if (sortKey === "codigo") return String(a.codigo).localeCompare(String(b.codigo), "pt-BR");
      return Number(b[sortKey] || 0) - Number(a[sortKey] || 0);
    });
    return rows;
  }, [produtos, filtro, sortKey, busca]);

  const top = useMemo(
    () => [...produtos].sort((a, b) => Number(b.total || 0) - Number(a.total || 0)).slice(0, 8),
    [produtos],
  );
  const total = Number(resumo.total || 0);
  const lucroBruto = Number(resumo.lucroBruto || 0);
  const lucroLiq = Number(resumo.lucroLiquido || 0);
  const aVista = Number(resumo.aVista || 0);
  const aPrazo = Number(resumo.aPrazo || 0);
  const qtde = Number(resumo.qtde || 0);
  const custo = Number(resumo.custo || 0);
  const pmp = Number(resumo.pmp || 0);
  const itens = Number(resumo.itens || produtos.length);

  const labels = serie.labels || [];
  const hasSerie = labels.length > 0 && (serie.total || []).some((v) => v != null);

  return (
    <>
      <div className="kpi-grid kpi-grid-8">
        <Kpi color="blue" icon="store" value={brl(total)} label="TOTAL" sub={`${itens} produtos`} />
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
        <Kpi color="blue" icon="ruler" value={num(pmp)} label="PMP" sub="linha TOTAL da aba" />
      </div>

      <div className="charts-row cr-2col">
        <div className="table-card">
          <div className="table-head">
            <div className="ttl">MAIORES VENDAS</div>
            <div className="sub">{periodLabel}{unidadeLabel ? ` · ${unidadeLabel}` : ""}</div>
          </div>
          <div className="tbl-scroll">
            <table>
              <tbody>
                {top.map((p) => (
                  <tr key={`top-${p.codigo}`}>
                    <td className="fw7">{p.codigo}</td>
                    <td>{p.produto}</td>
                    <td className="r td-val">{brl(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-head" style={{ borderTop: "1px solid var(--border)", borderBottom: 0 }}>
            <button type="button" className="btn-export" onClick={() => setShowLista(true)}>
              Ver todos os produtos
            </button>
          </div>
        </div>
        <div className="chart-card">
          <div className="ttl">EVOLUÇÃO Jan–Ago</div>
          <div className="sub">Total e lucro bruto da unidade selecionada</div>
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
      </div>

      {showLista ? (
        <div className="table-card">
          <div className="table-head">
            <div>
              <div className="ttl">PRODUTOS</div>
              <div className="sub">{filtrados.length} itens · clique na linha para o detalhe</div>
            </div>
          </div>
          <div className="vp-toolbar">
            {(
              [
                ["todos", "Todos"],
                ["margNeg", "Margem líquida negativa"],
                ["aVista", "À vista > 0"],
                ["qtdeZero", "Qtde zerada"],
              ] as [Filtro, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`chip ${filtro === id ? "bl" : "gy"}`}
                onClick={() => setFiltro(id)}
              >
                {label}
              </button>
            ))}
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
                <option value="qtde">Ordenar: Quantidade</option>
                <option value="codigo">Ordenar: Código</option>
              </select>
            </label>
            <label className="search-box" style={{ marginBottom: 0, flex: "1 1 220px" }}>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Pesquisar código ou nome"
                aria-label="Pesquisar código ou nome"
              />
            </label>
          </div>
          {filtrados.length ? (
            <>
              <div className="tbl-scroll livro-cfop">
                <table>
                  <thead>
                    <tr>
                      <th>Cód</th>
                      <th>Produto</th>
                      <th className="r">Qtde</th>
                      <th className="r">Total</th>
                      <th className="r">Custo</th>
                      <th className="r">Lucro líq.</th>
                      <th className="r">Marg. líq.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((p) => {
                      const open = aberto === p.codigo;
                      return (
                        <Fragment key={p.codigo}>
                          <tr
                            className={open ? "row-cur" : ""}
                            onClick={() => setAberto(open ? null : p.codigo)}
                            style={{ cursor: "pointer" }}
                          >
                            <td className="fw7">{p.codigo}</td>
                            <td>{p.produto}</td>
                            <td className="r">{num(p.qtde)}</td>
                            <td className={`r ${signClass(p.total)}`}>{brl(p.total)}</td>
                            <td className="r">{brl(p.custo)}</td>
                            <td className={`r ${signClass(p.lucroLiquido)}`}>{brl(p.lucroLiquido)}</td>
                            <td className={`r ${signClass(p.margLiquida)}`}>{margPct(p.margLiquida)}</td>
                          </tr>
                          {open ? (
                            <tr className="vp-detail-row">
                              <td colSpan={7}>
                                À vista {brl(p.aVista)} · A prazo {brl(p.aPrazo)} · Qtde un. {num(p.qtdeUn)} · Lucro bruto {brl(p.lucroBruto)} · Marg. bruta {margPct(p.margBruta)} · PMP {num(p.pmp)}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="fw7">TOTAL GERAL</td>
                      <td className="r fw7">{num(qtde)}</td>
                      <td className={`r fw7 ${signClass(total)}`}>{brl(total)}</td>
                      <td className="r fw7">{brl(custo)}</td>
                      <td className={`r fw7 ${signClass(lucroLiq)}`}>{brl(lucroLiq)}</td>
                      <td className={`r fw7 ${signClass(resumo.margLiquida)}`}>{margPct(resumo.margLiquida)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="livro-cfop-cards">
                {filtrados.map((p) => (
                  <article className="tax-card" key={`card-${p.codigo}`}>
                    <div className="tax-name">{p.codigo} · {p.produto}</div>
                    <div className={`tax-cur ${signClass(p.total)}`}>{brl(p.total)}</div>
                    <div className="tax-prev">Qtde {num(p.qtde)}</div>
                    <div className={`tax-prev ${signClass(p.lucroLiquido)}`}>Lucro líq. {brl(p.lucroLiquido)}</div>
                    <div className={`tax-prev ${signClass(p.margLiquida)}`}>Marg. líq. {margPct(p.margLiquida)}</div>
                    <div className="tax-prev">À vista {brl(p.aVista)} · A prazo {brl(p.aPrazo)}</div>
                    <div className="tax-prev">Custo {brl(p.custo)} · PMP {num(p.pmp)}</div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="alert-box warn" style={{ margin: "0 18px 18px" }}>Nenhum produto</div>
          )}
        </div>
      ) : null}
    </>
  );
}
