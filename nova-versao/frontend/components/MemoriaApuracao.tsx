"use client";

import { useMemo, useState } from "react";
import { brl } from "@/lib/api";
import {
  ResumoConsolidado,
  statusFromValor,
  TaxDetailCard,
  type TaxCardModel,
} from "@/components/MemoriaLivro";

type Linha = {
  cfop?: string;
  descricao?: string;
  valorContabil?: number;
  baseCalculo?: number;
  imposto?: number;
  isentas?: number;
  outros?: number;
  arquivo?: string;
};

type Subtotal = Linha & { movimento?: string; codigo?: string };

type Ajuste = {
  codigo?: string;
  descricao?: string;
  cfop?: string;
  debito?: number;
  credito?: number;
  arquivo?: string;
};

type TributoLivro = {
  entradas?: Linha[];
  saidas?: Linha[];
  subtotais?: Subtotal[];
  ajustes?: Ajuste[];
  colunaOutrosLabel?: string;
};

type Resumo = {
  debitos?: number;
  creditos?: number;
  outrosDebitos?: number;
  outrosCreditos?: number;
  saldoCredor?: number;
  saldoCredorAnterior?: number;
  saldoDevedor?: number;
  aRecolher?: number;
  saldoCredorSeguinte?: number;
  conferencia?: string;
  apurado?: number;
};

const FILTROS = ["ICMS", "IPI", "PIS", "COFINS"] as const;
const ABAS = ["RESUMO", "ENTRADAS", "SAIDAS", "CONFERENCIA"] as const;

const SUB_ORDEM = [
  { id: "estado", label: "Do Estado" },
  { id: "outros", label: "De outros estados" },
  { id: "exterior", label: "Exterior" },
  { id: "total", label: "TOTAL" },
] as const;

function fold(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function sum(rows: readonly object[], key: string) {
  return rows.reduce((acc, row) => acc + Number((row as Record<string, unknown>)[key] || 0), 0);
}

function bucketSub(row: Subtotal): (typeof SUB_ORDEM)[number]["id"] | null {
  const code = String(row.codigo || "");
  const desc = fold(row.descricao || "");
  if (code === "TOTAL" || desc === "total") return "total";
  if (desc.includes("exterior") || code === "3000" || code === "7000") return "exterior";
  if (desc.includes("outros") || code === "2000" || code === "6000") return "outros";
  if (desc.includes("estado") || code === "1000" || code === "5000") return "estado";
  return null;
}

function CfopBloco({
  linhas,
  outrosLabel,
  subtotais,
  movimento,
}: {
  linhas: Linha[];
  outrosLabel: string;
  subtotais: Subtotal[];
  movimento: "entradas" | "saidas";
}) {
  const [cfop, setCfop] = useState("");
  const [q, setQ] = useState("");
  const cfops = useMemo(() => {
    const set = new Set<string>();
    for (const linha of linhas) {
      if (linha.cfop) set.add(String(linha.cfop));
    }
    return Array.from(set).sort();
  }, [linhas]);
  const filtradas = useMemo(() => {
    const query = fold(q.trim());
    return linhas.filter((linha) => {
      if (cfop && String(linha.cfop) !== cfop) return false;
      if (!query) return true;
      return fold(`${linha.cfop || ""} ${linha.descricao || ""}`).includes(query);
    });
  }, [linhas, cfop, q]);

  const subs = subtotais.filter((s) => fold(s.movimento || "") === movimento);
  const porBucket = new Map<string, Subtotal>();
  for (const row of subs) {
    const id = bucketSub(row);
    if (id) porBucket.set(id, row);
  }

  return (
    <>
      <div className="vd-mes-bar" style={{ alignItems: "end" }}>
        <label htmlFor="livro-cfop">
          CFOP
          <select id="livro-cfop" className="period-sel" value={cfop} onChange={(e) => setCfop(e.target.value)} style={{ display: "block", marginTop: 4 }}>
            <option value="">Todos</option>
            {cfops.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label htmlFor="livro-busca">
          Buscar
          <input
            id="livro-busca"
            className="period-sel"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="CFOP ou descrição"
            style={{ display: "block", marginTop: 4 }}
          />
        </label>
        <span className="tax-prev">{filtradas.length} {filtradas.length === 1 ? "linha" : "linhas"}</span>
      </div>
      {filtradas.length ? (
        <>
          <div className="tbl-scroll livro-cfop">
            <table>
              <thead>
                <tr>
                  <th>CFOP</th>
                  <th>Descrição</th>
                  <th className="r">Valor contábil</th>
                  <th className="r">Base</th>
                  <th className="r">Imposto</th>
                  <th className="r">Isentas</th>
                  <th className="r">{outrosLabel}</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((linha, i) => (
                  <tr key={`${linha.cfop}-${i}`}>
                    <td>{linha.cfop}</td>
                    <td>{linha.descricao}</td>
                    <td className="r">{brl(linha.valorContabil)}</td>
                    <td className="r">{brl(linha.baseCalculo)}</td>
                    <td className="r">{brl(linha.imposto)}</td>
                    <td className="r">{brl(linha.isentas)}</td>
                    <td className="r">{brl(linha.outros)}</td>
                    <td className="td-mute">{linha.arquivo}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="fw7" colSpan={2}>Total</td>
                  <td className="r fw7">{brl(sum(filtradas, "valorContabil"))}</td>
                  <td className="r fw7">{brl(sum(filtradas, "baseCalculo"))}</td>
                  <td className="r fw7">{brl(sum(filtradas, "imposto"))}</td>
                  <td className="r fw7">{brl(sum(filtradas, "isentas"))}</td>
                  <td className="r fw7">{brl(sum(filtradas, "outros"))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="livro-cfop-cards">
            {filtradas.map((linha, i) => (
              <article className="tax-card" key={`card-${linha.cfop}-${i}`}>
                <div className="tax-name">CFOP {linha.cfop}</div>
                <div className="tax-prev">{linha.descricao}</div>
                <div className="tax-cur">{brl(linha.valorContabil)}</div>
                <div className="tax-prev">Base {brl(linha.baseCalculo)}</div>
                <div className="tax-prev">Imposto {brl(linha.imposto)}</div>
                <div className="tax-prev">Origem {linha.arquivo || "—"}</div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="alert-box warn">Nenhuma linha de CFOP neste filtro.</div>
      )}

      <div className="table-card">
        <div className="table-head">
          <div className="ttl">SUBTOTAIS</div>
          <div className="sub">{movimento === "entradas" ? "Entradas" : "Saídas"} do livro</div>
        </div>
        <div className="tbl-scroll">
          <table>
            <thead>
              <tr>
                <th>Grupo</th>
                <th className="r">Valor contábil</th>
                <th className="r">Base</th>
                <th className="r">Imposto</th>
                <th className="r">Isentas</th>
                <th className="r">{outrosLabel}</th>
              </tr>
            </thead>
            <tbody>
              {SUB_ORDEM.map((grupo) => {
                const row = porBucket.get(grupo.id);
                return (
                  <tr key={grupo.id}>
                    <td className="fw7">{grupo.label}</td>
                    <td className="r">{row ? brl(row.valorContabil) : "—"}</td>
                    <td className="r">{row ? brl(row.baseCalculo) : "—"}</td>
                    <td className="r">{row ? brl(row.imposto) : "—"}</td>
                    <td className="r">{row ? brl(row.isentas) : "—"}</td>
                    <td className="r">{row ? brl(row.outros) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function monthTitle(comp: string | null | undefined, fallback?: string) {
  if (comp && /^\d{4}-\d{2}$/.test(comp)) {
    const mm = Number(comp.slice(5, 7));
    const year = comp.slice(0, 4);
    if (mm >= 1 && mm <= 12) return `${MESES_PT[mm - 1]} ${year}`;
  }
  return fallback || "competência";
}

function recTone(n: number | null | undefined): "zero" | "credit" | "debit" {
  const v = Number(n || 0);
  if (Math.abs(v) < 0.005) return "zero";
  return v < 0 ? "credit" : "debit";
}

function statusLivro(res: Resumo): Pick<TaxCardModel, "status" | "statusLabel"> {
  const rec = Number(res.aRecolher || 0);
  const tr = Number(res.saldoCredorSeguinte || 0);
  if (rec > 0.005) return { status: "recolher", statusLabel: "A recolher" };
  if (Math.abs(rec) < 0.005 && tr > 0.005) return { status: "credor", statusLabel: "Saldo credor" };
  return statusFromValor(res.aRecolher ?? rec);
}

function livroRows(res: Resumo) {
  const aRec = Number(res.aRecolher || 0);
  const tr = Number(res.saldoCredorSeguinte || 0);
  return [
    { label: "Débitos por saídas", value: brl(res.debitos), tone: "debit" as const },
    { label: "Outros débitos", value: brl(res.outrosDebitos), tone: "debit" as const },
    { label: "Saldo devedor", value: brl(res.saldoDevedor), tone: "bold" as const },
    { label: "Créditos por entradas", value: brl(res.creditos), tone: "credit" as const },
    { label: "Saldo anterior", value: brl(res.saldoCredorAnterior), tone: "credit" as const },
    { label: "Outros créditos", value: brl(res.outrosCreditos), tone: "credit" as const },
    { label: "Saldo credor", value: brl(res.saldoCredor), tone: "credit" as const },
    { label: "A recolher", value: brl(res.aRecolher), tone: recTone(aRec), emphasis: true },
    {
      label: "A transportar",
      value: brl(res.saldoCredorSeguinte),
      tone: tr > 0.005 ? ("carry" as const) : ("plain" as const),
    },
  ];
}

function cardLivro(id: string, nome: string, tone: TaxCardModel["tone"], res: Resumo | undefined): TaxCardModel {
  const row = res || {};
  const aRec = Number(row.aRecolher || 0);
  const creditos = Number(row.creditos || 0);
  const apurado = Number(row.apurado ?? row.debitos ?? 0);
  return {
    id,
    nome,
    subtitle: "Livro de apuração",
    tone,
    apurado,
    creditos,
    aRecolher: aRec,
    pctRb: null,
    vencimento: null,
    ...statusLivro(row),
    rows: livroRows(row),
    resumoNome: nome,
  };
}

function cardPendente(
  id: string,
  nome: string,
  tone: TaxCardModel["tone"],
  subtitle: string,
  rows: { label: string; value: string; tone: "mute" }[],
): TaxCardModel {
  return {
    id,
    nome,
    subtitle,
    tone,
    apurado: null,
    creditos: null,
    aRecolher: null,
    pctRb: null,
    vencimento: null,
    status: "apuracao",
    statusLabel: "Em apuração",
    pending: true,
    rows,
    footBanner: "Em apuração",
    resumoNome: nome,
  };
}

export default function MemoriaApuracao({
  d,
  month,
  monthLabel,
}: {
  d: Record<string, any>;
  month?: string;
  monthLabel?: string;
}) {
  const livro = d.livroApuracao as { tributos?: Record<string, TributoLivro> } | null | undefined;
  const [livroOpen, setLivroOpen] = useState(false);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("ICMS");
  const [aba, setAba] = useState<(typeof ABAS)[number]>("RESUMO");
  if (!livro) return null;
  const tributos = livro.tributos || {};
  const ap = (d.apuracao || {}) as Record<string, Resumo>;
  const mesLabel = monthTitle(month, monthLabel);

  const cards: TaxCardModel[] = [
    cardLivro("icms", "ICMS", "icms", ap.icms),
    cardPendente("st", "ICMS ST", "st", "Em apuração", [
      { label: "Apurado", value: "—", tone: "mute" },
      { label: "Créditos", value: "—", tone: "mute" },
      { label: "A recolher", value: "—", tone: "mute" },
    ]),
    cardLivro("pis", "PIS", "pis", ap.pis),
    cardLivro("cofins", "COFINS", "cofins", ap.cofins),
    cardLivro("ipi", "IPI", "ipi", ap.ipi),
    cardPendente("irpj", "IRPJ", "irpj", "Lucro Real", [
      { label: "Apuração", value: "—", tone: "mute" },
      { label: "Lucro líquido", value: "—", tone: "mute" },
      { label: "Adições", value: "—", tone: "mute" },
      { label: "Exclusões", value: "—", tone: "mute" },
      { label: "Base de cálculo", value: "—", tone: "mute" },
      { label: "IRPJ devido", value: "—", tone: "mute" },
    ]),
    cardPendente("csll", "CSLL", "csll", "Lucro Real", [
      { label: "Apuração", value: "—", tone: "mute" },
      { label: "Lucro líquido", value: "—", tone: "mute" },
      { label: "Adições", value: "—", tone: "mute" },
      { label: "Exclusões", value: "—", tone: "mute" },
      { label: "Base de cálculo", value: "—", tone: "mute" },
      { label: "CSLL devida", value: "—", tone: "mute" },
    ]),
  ];

  const key = filtro.toLowerCase();
  const liv = tributos[key];
  const res = ap[key] || {};
  const outrosLabel = liv?.colunaOutrosLabel || "Outros";
  const deltaDeb = Math.abs(sum(liv?.saidas || [], "imposto") - Number(res.debitos || 0));
  const deltaCred = Math.abs(sum(liv?.entradas || [], "imposto") - Number(res.creditos || 0));
  const deltaAjC = Math.abs(sum(liv?.ajustes || [], "credito") - Number(res.outrosCreditos || 0));
  const deltaAjD = Math.abs(sum(liv?.ajustes || [], "debito") - Number(res.outrosDebitos || 0));
  const delta = Math.max(deltaDeb, deltaCred, deltaAjC, deltaAjD);
  const excelOk = String(res.conferencia || "").toUpperCase() === "OK";
  const conferido = delta < 0.02 && excelOk;

  return (
    <>
      <div className="tax-detail-grid">
        {cards.map((c) => (
          <TaxDetailCard key={c.id} card={c} />
        ))}
      </div>

      <ResumoConsolidado cards={cards} rb={0} mesLabel={mesLabel} />

      <div className="mem-livro-wrap">
        <button
          type="button"
          className="mem-livro-toggle"
          aria-expanded={livroOpen}
          onClick={() => setLivroOpen((v) => !v)}
        >
          <span>{livroOpen ? "Ocultar" : "Ver"} livro técnico (ICMS, IPI, PIS/COFINS…)</span>
          <span className="mem-livro-chev" aria-hidden>
            {livroOpen ? "▴" : "▾"}
          </span>
        </button>
        {livroOpen ? (
          <div className="mem-livro-body">
            <Filtros
              filtro={filtro}
              onPick={(id) => {
                setFiltro(id);
                setAba("RESUMO");
              }}
            />
            {!liv ? (
              <div className="alert-box warn">Sem livro deste tributo.</div>
            ) : (
              <>
                <div className="vd-mes-bar" role="tablist" aria-label="Seção do livro">
                  {ABAS.map((id) => (
                    <button key={id} type="button" className={`vd-mes-chip${aba === id ? " active" : ""}`} aria-pressed={aba === id} onClick={() => setAba(id)}>
                      {id === "ENTRADAS" ? "Entradas / créditos" : id === "SAIDAS" ? "Saídas / débitos" : id === "CONFERENCIA" ? "Conferência" : "Resumo"}
                    </button>
                  ))}
                </div>

                {aba === "RESUMO" ? (
                  <div className="table-card">
                    <div className="table-head"><div className="ttl">Resumo {filtro}</div></div>
                    <div className="tbl-scroll">
                      <table>
                        <tbody>
                          <tr><td>Débitos por saídas</td><td className="r">{brl(res.debitos)}</td></tr>
                          <tr><td>Outros débitos</td><td className="r">{brl(res.outrosDebitos)}</td></tr>
                          <tr><td>Saldo devedor</td><td className="r">{brl(res.saldoDevedor)}</td></tr>
                          <tr><td>Créditos por entradas</td><td className="r">{brl(res.creditos)}</td></tr>
                          <tr><td>Saldo anterior</td><td className="r">{brl(res.saldoCredorAnterior)}</td></tr>
                          <tr><td>Outros créditos</td><td className="r">{brl(res.outrosCreditos)}</td></tr>
                          <tr><td>Saldo credor</td><td className="r">{brl(res.saldoCredor)}</td></tr>
                          <tr><td>A recolher</td><td className="r">{brl(res.aRecolher)}</td></tr>
                          <tr><td>A transportar</td><td className="r">{brl(res.saldoCredorSeguinte)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {aba === "ENTRADAS" ? (
                  <CfopBloco linhas={liv.entradas || []} outrosLabel={outrosLabel} subtotais={liv.subtotais || []} movimento="entradas" />
                ) : null}
                {aba === "SAIDAS" ? (
                  <CfopBloco linhas={liv.saidas || []} outrosLabel={outrosLabel} subtotais={liv.subtotais || []} movimento="saidas" />
                ) : null}

                {aba === "CONFERENCIA" ? (
                  <>
                    <div className="tax-card" style={{ marginBottom: 16 }}>
                      <div className="tax-card-head">
                        <div className="tax-name">Conferência {filtro}</div>
                        <span className={`chip ${conferido ? "gr" : "ye"}`}>{conferido ? "CONFERIDO" : "Divergente"}</span>
                      </div>
                      <div className="tax-prev">Maior diferença: {brl(delta)}. Planilha: {res.conferencia || "—"}.</div>
                    </div>
                    <div className="table-card">
                      <div className="tbl-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Checagem</th>
                              <th className="r">Livro</th>
                              <th className="r">Resumo</th>
                              <th className="r">Diferença</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>Imposto das saídas × débitos</td>
                              <td className="r">{brl(sum(liv.saidas || [], "imposto"))}</td>
                              <td className="r">{brl(res.debitos)}</td>
                              <td className="r">{brl(deltaDeb)}</td>
                            </tr>
                            <tr>
                              <td>Imposto das entradas × créditos</td>
                              <td className="r">{brl(sum(liv.entradas || [], "imposto"))}</td>
                              <td className="r">{brl(res.creditos)}</td>
                              <td className="r">{brl(deltaCred)}</td>
                            </tr>
                            <tr>
                              <td>Ajustes crédito × outros créditos</td>
                              <td className="r">{brl(sum(liv.ajustes || [], "credito"))}</td>
                              <td className="r">{brl(res.outrosCreditos)}</td>
                              <td className="r">{brl(deltaAjC)}</td>
                            </tr>
                            <tr>
                              <td>Ajustes débito × outros débitos</td>
                              <td className="r">{brl(sum(liv.ajustes || [], "debito"))}</td>
                              <td className="r">{brl(res.outrosDebitos)}</td>
                              <td className="r">{brl(deltaAjD)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="table-card">
                      <div className="table-head"><div className="ttl">Ajustes</div></div>
                      <div className="tbl-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Código</th>
                              <th>Descrição</th>
                              <th>CFOP</th>
                              <th className="r">Débito</th>
                              <th className="r">Crédito</th>
                              <th>Origem</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(liv.ajustes || []).length ? (liv.ajustes || []).map((aj, i) => (
                              <tr key={`${aj.codigo}-${aj.cfop}-${i}`}>
                                <td>{aj.codigo}</td>
                                <td>{aj.descricao}</td>
                                <td>{aj.cfop}</td>
                                <td className="r">{brl(aj.debito)}</td>
                                <td className="r">{brl(aj.credito)}</td>
                                <td className="td-mute">{aj.arquivo}</td>
                              </tr>
                            )) : (
                              <tr><td colSpan={6}>Nenhum ajuste neste tributo.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}

function Filtros({
  filtro,
  onPick,
}: {
  filtro: (typeof FILTROS)[number];
  onPick: (id: (typeof FILTROS)[number]) => void;
}) {
  return (
    <div className="vd-mes-bar" role="tablist" aria-label="Tributo">
      {FILTROS.map((id) => (
        <button key={id} type="button" className={`vd-mes-chip${filtro === id ? " active" : ""}`} aria-pressed={filtro === id} onClick={() => onPick(id)}>
          {id}
        </button>
      ))}
    </div>
  );
}
