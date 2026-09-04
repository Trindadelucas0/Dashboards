"use client";

import { useState } from "react";
import { brl } from "@/lib/api";

type MemLine = { key?: string; label: string; papel?: string; kind?: string; valor?: number | null };
type TaxBaseLine = {
  tributo: string;
  valorProduto: number;
  valorContabil: number;
  baseCalculo: number;
  ajusteBc?: number;
  bcAjustada?: number;
  aliquota: number;
  valorImposto: number;
};
type ResumoRow = {
  tributo: string;
  debito: number;
  credito: number;
  saldoCredor?: number;
  aRecolher: number;
  aRecolherPlanilha?: number;
};
type IrpjLine = { label: string; valor?: number | null; valores?: number[]; kind?: string };

type ValTone = "plain" | "bold" | "debit" | "credit" | "result" | "carry" | "mute" | "zero";

type DetailRow = {
  label: string;
  value: string;
  tone?: ValTone;
  emphasis?: boolean;
};

type TaxCardModel = {
  id: string;
  nome: string;
  subtitle?: string;
  tone: "icms" | "pis" | "cofins" | "st" | "difal" | "ipi" | "irpj" | "csll" | "subv";
  apurado: number | null;
  creditos: number | null;
  aRecolher: number | null;
  pctRb: number | null;
  vencimento: string | null;
  status: "recolher" | "credor" | "zero" | "apuracao" | "info";
  statusLabel: string;
  rows: DetailRow[];
  footBanner?: string;
  pending?: boolean;
  inResumo?: boolean;
  resumoNome?: string;
};

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

function moneyOrDash(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return brl(n);
}

function creditParen(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) < 0.005) return brl(0);
  return `(${brl(Math.abs(n))})`;
}

function taxRow(row: Record<string, unknown> | null | undefined) {
  return !!(row && typeof row === "object" && ("aRecolher" in row || "apurado" in row));
}

function pctAliq(n: number) {
  if (!n && n !== 0) return "—";
  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  return `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;
}

function pctRb(valor: number | null | undefined, rb: number) {
  if (valor == null || !rb) return null;
  return Math.round((10000 * Number(valor)) / rb) / 100;
}

function pctLabel(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function filledUf(map: Record<string, number> | undefined) {
  return Object.entries(map || {})
    .filter(([, v]) => Math.abs(Number(v) || 0) >= 0.01)
    .sort((a, b) => Math.abs(Number(b[1])) - Math.abs(Number(a[1])));
}

function findBaseLine(lines: TaxBaseLine[] | undefined, name: string) {
  const up = name.toUpperCase();
  return (lines || []).find((ln) => String(ln.tributo || "").toUpperCase() === up);
}

function statusFromValor(v: number | null | undefined): Pick<TaxCardModel, "status" | "statusLabel"> {
  if (v == null) return { status: "apuracao", statusLabel: "Em apuração" };
  if (Math.abs(v) < 0.005) return { status: "zero", statusLabel: "Zero recolher" };
  if (v < 0) return { status: "credor", statusLabel: "Saldo credor" };
  return { status: "recolher", statusLabel: "A recolher" };
}

function toneClass(tone?: ValTone) {
  if (!tone || tone === "plain") return "";
  return `mem-val-${tone}`;
}

function TaxDetailCard({ card }: { card: TaxCardModel }) {
  return (
    <article className={`tax-detail tax-${card.tone}${card.pending ? " tax-pending" : ""}`} id={`card-${card.id}`}>
      <div className="tax-detail-head">
        <div className="tax-detail-titles">
          <div className="tax-detail-name">{card.nome}</div>
          {card.subtitle ? <div className="tax-detail-sub">{card.subtitle}</div> : null}
        </div>
        <span className={`chip tax-status tax-status-${card.status}`}>{card.statusLabel}</span>
      </div>
      <div className="tax-detail-rows">
        {card.rows.map((row, i) => (
          <div key={`${row.label}-${i}`} className={`tax-detail-row${row.emphasis ? " tax-detail-row-em" : ""}`}>
            <span>{row.label}</span>
            <span className={toneClass(row.tone)}>{row.value}</span>
          </div>
        ))}
      </div>
      {card.footBanner ? <div className="tax-detail-banner">{card.footBanner}</div> : null}
    </article>
  );
}

function ResumoConsolidado({
  cards,
  rb,
  mesLabel,
}: {
  cards: TaxCardModel[];
  rb: number;
  mesLabel: string;
}) {
  const rows = cards.filter((c) => c.inResumo !== false);
  if (!rows.length) return null;

  const totIds = new Set(["icms", "st"]);
  const totCards = rows.filter((c) => totIds.has(c.id) && !c.pending && c.aRecolher != null);
  const totApurado = totCards.reduce((s, c) => s + Number(c.apurado || 0), 0);
  const totCreditos = totCards.reduce((s, c) => s + Number(c.creditos || 0), 0);
  const totRecolher = totCards.reduce((s, c) => s + Number(c.aRecolher || 0), 0);
  const totPct = pctRb(totRecolher, rb);
  const hasTot = totCards.length > 0;

  return (
    <div className="table-card mem-resumo">
      <div className="table-head">
        <div className="ttl">Resumo Consolidado — {mesLabel}</div>
        <div className="sub">Total de obrigações tributárias apuradas e estimadas na competência.</div>
      </div>
      <div className="tbl-scroll">
        <table className="dre-tbl mem-resumo-tbl">
          <thead>
            <tr>
              <th>Tributo</th>
              <th>Vencimento</th>
              <th className="r">Apurado bruto</th>
              <th className="r">Créditos/Benef.</th>
              <th className="r">A recolher</th>
              <th className="r">% s/ RB</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const zeroRec = !c.pending && c.aRecolher != null && Math.abs(c.aRecolher) < 0.005;
              const recolherTxt =
                c.pending || c.aRecolher == null
                  ? c.statusLabel === "Em apuração"
                    ? "Em apuração"
                    : "—"
                  : brl(c.aRecolher);
              return (
                <tr key={c.id} className={c.pending ? "mem-resumo-pending" : undefined}>
                  <td>
                    <span className={`mem-trib-name tax-${c.tone}`}>{c.resumoNome || c.nome}</span>
                  </td>
                  <td className="td-mute">{c.vencimento || "—"}</td>
                  <td className="r">
                    {c.pending
                      ? c.footBanner || "Em apuração"
                      : moneyOrDash(c.apurado)}
                  </td>
                  <td className={`r ${!c.pending && c.creditos != null && Math.abs(c.creditos) >= 0.005 ? "mem-val-credit" : ""}`}>
                    {c.pending ? "—" : c.creditos == null ? "—" : creditParen(c.creditos)}
                  </td>
                  <td
                    className={`r td-val ${
                      c.pending
                        ? "td-mute"
                        : zeroRec
                          ? "mem-val-zero"
                          : c.aRecolher != null && c.aRecolher < 0
                            ? "mem-val-credit"
                            : c.aRecolher != null && c.aRecolher > 0
                              ? "mem-val-debit"
                              : ""
                    }`}
                  >
                    {recolherTxt}
                  </td>
                  <td className="r">
                    {c.pending || c.pctRb == null ? (
                      <span className="td-mute">—</span>
                    ) : (
                      <span className={`mem-pct-pill tax-${c.tone}`}>{pctLabel(c.pctRb)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {hasTot ? (
              <tr className="mem-resumo-total">
                <td className="fw7">TOTAL (ICMS + ICMS ST)</td>
                <td className="td-mute">—</td>
                <td className="r fw7">{brl(totApurado)}</td>
                <td className={`r fw7 ${Math.abs(totCreditos) >= 0.005 ? "mem-val-credit" : ""}`}>
                  {Math.abs(totCreditos) >= 0.005 ? creditParen(totCreditos) : "—"}
                </td>
                <td className={`r fw7 ${totRecolher > 0 ? "mem-val-debit" : totRecolher < 0 ? "mem-val-credit" : "mem-val-zero"}`}>
                  {brl(totRecolher)}
                </td>
                <td className="r fw7">{pctLabel(totPct)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MemoriaLivro({
  d,
  ap,
  month,
  monthLabel,
}: {
  d: Record<string, any>;
  ap: Record<string, any> | null;
  month?: string;
  monthLabel?: string;
}) {
  const [livroOpen, setLivroOpen] = useState(false);
  const mem = d.memoriaCalculo as Record<string, any> | undefined;
  const hasMem = !!(mem && (mem.debitoOriginal != null || mem.icmsARecolher != null));
  const livroPc = d.memoriaPisCofins as {
    formula?: string;
    debito?: { linhas?: TaxBaseLine[] };
    credito?: { linhas?: TaxBaseLine[] };
    resumo?: Record<string, ResumoRow>;
  } | undefined;
  const livroIpi = d.memoriaIpi as {
    formula?: string;
    debito?: { linhas?: TaxBaseLine[] };
    credito?: { linhas?: TaxBaseLine[] };
    resumo?: Record<string, ResumoRow>;
    aRecolher?: number;
  } | undefined;
  const livroIrpj = d.memoriaIrpj as { linhas?: IrpjLine[]; aRecolher?: number } | undefined;
  const livroCsll = d.memoriaCsll as { linhas?: IrpjLine[]; aRecolher?: number } | undefined;
  const stUf = filledUf(d.porUfSt);
  const difalUf = filledUf(d.porUfDifal);
  const hasPis = taxRow(ap?.pis) || !!(livroPc?.resumo?.pis);
  const hasCofins = taxRow(ap?.cofins) || !!(livroPc?.resumo?.cofins);
  const hasIcmsSt = taxRow(ap?.icmsSt) || stUf.length > 0;
  const hasDifal = taxRow(ap?.difal) || difalUf.length > 0;
  const hasIpi = !!(livroIpi && (livroIpi.aRecolher != null || (livroIpi.resumo && Object.keys(livroIpi.resumo).length)));
  const hasIrpj = !!(livroIrpj?.linhas?.length);
  const hasCsll = !!(livroCsll?.linhas?.length);
  const hasPisCofins = hasPis || hasCofins;
  const rb = Number(d.receitaBruta || 0);
  const subvVal = Number(mem?.ganhoReceitaSubvencao ?? d.subvencao ?? 0);
  const mesLabel = monthTitle(month, monthLabel);

  const cards: TaxCardModel[] = [];

  if (hasMem || taxRow(ap?.icms)) {
    const aRec = Number(mem?.icmsARecolher ?? ap?.icms?.aRecolher ?? 0);
    const apurado = mem?.debitoOriginal != null ? Number(mem.debitoOriginal) : Number(ap?.icms?.apurado ?? aRec);
    const creditos =
      mem?.creditoOriginal != null
        ? Number(mem.creditoOriginal)
        : ap?.icms?.credito != null
          ? Number(ap.icms.credito)
          : null;
    const st = statusFromValor(aRec);
    const rows: DetailRow[] = [];
    if (mem?.debitoOriginal != null) rows.push({ label: "Débito original", value: brl(Number(mem.debitoOriginal)), tone: "debit" });
    if (mem?.creditoOriginal != null) rows.push({ label: "Crédito original", value: brl(Number(mem.creditoOriginal)), tone: "credit" });
    if (mem?.totalOriginal != null) rows.push({ label: "TOTAL original", value: brl(Number(mem.totalOriginal)), tone: "bold", emphasis: true });
    if (mem?.debitos5005 != null) rows.push({ label: "Débitos 5005", value: brl(Number(mem.debitos5005)), tone: "debit" });
    if (mem?.creditos5005 != null) rows.push({ label: "Créditos 5005", value: brl(Number(mem.creditos5005)), tone: "credit" });
    if (mem?.total5005 != null) rows.push({ label: "TOTAL 5005", value: brl(Number(mem.total5005)), tone: "bold", emphasis: true });
    if (mem?.debitoFora != null) rows.push({ label: "Débito fora", value: brl(Number(mem.debitoFora)), tone: "debit" });
    if (mem?.creditoFora != null) rows.push({ label: "Crédito fora", value: brl(Number(mem.creditoFora)), tone: "credit" });
    if (mem?.creditoOutorgado != null) rows.push({ label: "Crédito outorgado", value: brl(Number(mem.creditoOutorgado)), tone: "credit" });
    if (mem?.totalFora != null) rows.push({ label: "TOTAL fora", value: brl(Number(mem.totalFora)), tone: "bold", emphasis: true });
    rows.push({
      label: "ICMS a recolher",
      value: brl(aRec),
      tone: Math.abs(aRec) < 0.005 ? "zero" : aRec < 0 ? "credit" : "debit",
      emphasis: true,
    });
    if (mem?.ganhoReceitaSubvencao != null) {
      rows.push({ label: "Ganho receita de subvenção", value: brl(Number(mem.ganhoReceitaSubvencao)), tone: "carry" });
    }
    if (!rows.length) {
      rows.push(
        { label: "Apurado", value: moneyOrDash(apurado), tone: "bold" },
        { label: "Créditos", value: moneyOrDash(creditos), tone: "credit" },
        { label: "A recolher", value: brl(aRec), tone: aRec < 0 ? "credit" : "debit", emphasis: true },
      );
    }
    cards.push({
      id: "icms",
      nome: "ICMS",
      subtitle: "Decreto 5005",
      tone: "icms",
      apurado,
      creditos,
      aRecolher: aRec,
      pctRb: pctRb(Math.max(aRec, 0), rb),
      vencimento: null,
      ...st,
      rows,
      resumoNome: "ICMS (Decreto 5005)",
    });
  }

  if (hasIcmsSt) {
    const aRec = Number(ap?.icmsSt?.aRecolher ?? 0);
    const apurado = Number(ap?.icmsSt?.apurado ?? aRec);
    const creditos = ap?.icmsSt?.credito != null ? Number(ap.icmsSt.credito) : null;
    const ufLabel = stUf.map(([uf]) => uf).join("/") || null;
    const rows: DetailRow[] = [
      { label: "Apurado bruto", value: brl(apurado), tone: "bold" },
      { label: "Créditos/Benef.", value: creditos == null ? "—" : creditParen(creditos), tone: "credit" },
      {
        label: "A recolher",
        value: brl(aRec),
        tone: Math.abs(aRec) < 0.005 ? "zero" : aRec < 0 ? "credit" : "debit",
        emphasis: true,
      },
    ];
    if (stUf.length) {
      for (const [uf, val] of stUf.slice(0, 6)) {
        rows.splice(rows.length - 1, 0, { label: `UF ${uf}`, value: brl(Number(val)), tone: "plain" });
      }
    }
    cards.push({
      id: "st",
      nome: "ICMS ST",
      subtitle: ufLabel || "Por UF",
      tone: "st",
      apurado,
      creditos,
      aRecolher: aRec,
      pctRb: pctRb(aRec, rb),
      vencimento: null,
      status: "info",
      statusLabel: "Importado",
      rows,
      resumoNome: ufLabel ? `ICMS ST (${ufLabel})` : "ICMS ST",
    });
  }

  if (hasPis) {
    const row = livroPc?.resumo?.pis;
    const debLine = findBaseLine(livroPc?.debito?.linhas, "PIS");
    const credLine = findBaseLine(livroPc?.credito?.linhas, "PIS");
    const aRec = Number(row?.aRecolher ?? ap?.pis?.aRecolher ?? 0);
    const debito = Number(row?.debito ?? ap?.pis?.apurado ?? debLine?.valorImposto ?? 0);
    const credito = Number(row?.credito ?? ap?.pis?.credito ?? credLine?.valorImposto ?? 0);
    const saldo = row?.saldoCredor;
    const st = statusFromValor(aRec);
    const rows: DetailRow[] = [];
    if (debLine?.baseCalculo != null) rows.push({ label: "Base de cálculo", value: brl(debLine.baseCalculo), tone: "bold" });
    if (debLine?.aliquota != null) rows.push({ label: "Alíquota", value: pctAliq(debLine.aliquota), tone: "plain" });
    rows.push({ label: "Débito", value: brl(debito), tone: "debit" });
    rows.push({ label: "Créditos", value: brl(credito), tone: "debit" });
    if (saldo != null) rows.push({ label: "Saldo credor (acum.)", value: brl(Number(saldo)), tone: "mute" });
    rows.push({
      label: "A recolher",
      value: brl(aRec),
      tone: Math.abs(aRec) < 0.005 ? "zero" : aRec < 0 ? "result" : "debit",
      emphasis: true,
    });
    if (aRec < -0.005) rows.push({ label: "Crédito p/ próximo período", value: brl(Math.abs(aRec)), tone: "carry" });
    cards.push({
      id: "pis",
      nome: "PIS",
      subtitle: "Não-Cumulativo",
      tone: "pis",
      apurado: debito,
      creditos: credito,
      aRecolher: aRec,
      pctRb: pctRb(Math.max(aRec, 0), rb),
      vencimento: null,
      ...st,
      rows,
      resumoNome: "PIS (Não-Cumulativo)",
    });
  }

  if (hasCofins) {
    const row = livroPc?.resumo?.cofins;
    const debLine = findBaseLine(livroPc?.debito?.linhas, "COFINS");
    const credLine = findBaseLine(livroPc?.credito?.linhas, "COFINS");
    const aRec = Number(row?.aRecolher ?? ap?.cofins?.aRecolher ?? 0);
    const debito = Number(row?.debito ?? ap?.cofins?.apurado ?? debLine?.valorImposto ?? 0);
    const credito = Number(row?.credito ?? ap?.cofins?.credito ?? credLine?.valorImposto ?? 0);
    const saldo = row?.saldoCredor;
    const st = statusFromValor(aRec);
    const rows: DetailRow[] = [];
    if (debLine?.baseCalculo != null) rows.push({ label: "Base de cálculo", value: brl(debLine.baseCalculo), tone: "bold" });
    if (debLine?.aliquota != null) rows.push({ label: "Alíquota", value: pctAliq(debLine.aliquota), tone: "plain" });
    rows.push({ label: "Débito", value: brl(debito), tone: "debit" });
    rows.push({ label: "Créditos", value: brl(credito), tone: "debit" });
    if (saldo != null) rows.push({ label: "Saldo credor (acum.)", value: brl(Number(saldo)), tone: "mute" });
    rows.push({
      label: "A recolher",
      value: brl(aRec),
      tone: Math.abs(aRec) < 0.005 ? "zero" : aRec < 0 ? "result" : "debit",
      emphasis: true,
    });
    if (aRec < -0.005) rows.push({ label: "Crédito p/ próximo período", value: brl(Math.abs(aRec)), tone: "carry" });
    cards.push({
      id: "cofins",
      nome: "COFINS",
      subtitle: "Não-Cumulativo",
      tone: "cofins",
      apurado: debito,
      creditos: credito,
      aRecolher: aRec,
      pctRb: pctRb(Math.max(aRec, 0), rb),
      vencimento: null,
      ...st,
      rows,
      resumoNome: "COFINS (Não-Cumulativo)",
    });
  }

  if (hasDifal) {
    const aRec = Number(ap?.difal?.aRecolher ?? 0);
    const apurado = Number(ap?.difal?.apurado ?? aRec);
    const creditos = ap?.difal?.credito != null ? Number(ap.difal.credito) : null;
    cards.push({
      id: "difal",
      nome: "DIFAL",
      subtitle: difalUf.map(([uf]) => uf).join("/") || "Por UF",
      tone: "difal",
      apurado,
      creditos,
      aRecolher: aRec,
      pctRb: pctRb(aRec, rb),
      vencimento: null,
      status: "info",
      statusLabel: "Importado",
      rows: [
        { label: "Apurado", value: brl(apurado), tone: "bold" },
        { label: "Créditos", value: creditos == null ? "—" : moneyOrDash(creditos), tone: "credit" },
        { label: "A recolher", value: brl(aRec), tone: aRec < 0 ? "credit" : "debit", emphasis: true },
      ],
      inResumo: false,
    });
  }

  if (hasIpi) {
    const row = Object.values(livroIpi?.resumo || {})[0];
    const aRec = Number(livroIpi?.aRecolher ?? row?.aRecolher ?? 0);
    const debito = Number(row?.debito ?? 0);
    const credito = Number(row?.credito ?? 0);
    const st = statusFromValor(aRec);
    cards.push({
      id: "ipi",
      nome: "IPI",
      tone: "ipi",
      apurado: debito,
      creditos: credito,
      aRecolher: aRec,
      pctRb: pctRb(Math.max(aRec, 0), rb),
      vencimento: null,
      ...st,
      rows: [
        { label: "Débito", value: brl(debito), tone: "debit" },
        { label: "Crédito", value: brl(credito), tone: "debit" },
        {
          label: "A recolher",
          value: brl(aRec),
          tone: Math.abs(aRec) < 0.005 ? "zero" : aRec < 0 ? "result" : "debit",
          emphasis: true,
        },
      ],
      inResumo: false,
    });
  }

  if (hasIrpj) {
    const aRec = livroIrpj?.aRecolher ?? null;
    const st = statusFromValor(aRec);
    const preview = (livroIrpj?.linhas || []).filter((ln) => ln.valor != null).slice(0, 8);
    const rows: DetailRow[] =
      preview.length > 0
        ? preview.map((ln) => ({
            label: ln.label,
            value: moneyOrDash(ln.valor),
            tone: ln.kind === "resultado" ? "result" : "plain",
          }))
        : [{ label: "A recolher", value: moneyOrDash(aRec), tone: "bold", emphasis: true }];
    cards.push({
      id: "irpj",
      nome: "IRPJ",
      subtitle: "Lucro Real",
      tone: "irpj",
      apurado: aRec,
      creditos: null,
      aRecolher: aRec,
      pctRb: pctRb(aRec, rb),
      vencimento: null,
      ...st,
      rows,
      resumoNome: "IRPJ",
    });
  } else if (hasMem || hasPisCofins) {
    cards.push({
      id: "irpj",
      nome: "IRPJ",
      subtitle: "Lucro Real",
      tone: "irpj",
      apurado: null,
      creditos: null,
      aRecolher: null,
      pctRb: null,
      vencimento: null,
      status: "apuracao",
      statusLabel: "Em apuração",
      pending: true,
      rows: [
        { label: "Apuração", value: "—", tone: "mute" },
        { label: "Lucro líquido", value: "—", tone: "mute" },
        { label: "Adições", value: "—", tone: "mute" },
        { label: "Exclusões", value: "—", tone: "mute" },
        { label: "Base de cálculo", value: "—", tone: "mute" },
        { label: "IRPJ devido", value: "—", tone: "mute" },
      ],
      footBanner: "Em apuração",
      resumoNome: "IRPJ",
    });
  }

  if (hasCsll) {
    const aRec = livroCsll?.aRecolher ?? null;
    const st = statusFromValor(aRec);
    const preview = (livroCsll?.linhas || []).filter((ln) => ln.valor != null).slice(0, 8);
    const rows: DetailRow[] =
      preview.length > 0
        ? preview.map((ln) => ({
            label: ln.label,
            value: moneyOrDash(ln.valor),
            tone: ln.kind === "resultado" ? "result" : "plain",
          }))
        : [{ label: "A recolher", value: moneyOrDash(aRec), tone: "bold", emphasis: true }];
    cards.push({
      id: "csll",
      nome: "CSLL",
      subtitle: "Lucro Real",
      tone: "csll",
      apurado: aRec,
      creditos: null,
      aRecolher: aRec,
      pctRb: pctRb(aRec, rb),
      vencimento: null,
      ...st,
      rows,
      resumoNome: "CSLL",
    });
  } else if (hasMem || hasPisCofins) {
    cards.push({
      id: "csll",
      nome: "CSLL",
      subtitle: "Lucro Real",
      tone: "csll",
      apurado: null,
      creditos: null,
      aRecolher: null,
      pctRb: null,
      vencimento: null,
      status: "apuracao",
      statusLabel: "Em apuração",
      pending: true,
      rows: [
        { label: "Apuração", value: "—", tone: "mute" },
        { label: "Lucro líquido", value: "—", tone: "mute" },
        { label: "Adições", value: "—", tone: "mute" },
        { label: "Exclusões", value: "—", tone: "mute" },
        { label: "Base de cálculo", value: "—", tone: "mute" },
        { label: "CSLL devida", value: "—", tone: "mute" },
      ],
      footBanner: "Em apuração",
      resumoNome: "CSLL",
    });
  }

  if (hasMem && subvVal) {
    cards.push({
      id: "subv",
      nome: "Subvenção",
      tone: "subv",
      apurado: subvVal,
      creditos: null,
      aRecolher: subvVal,
      pctRb: pctRb(subvVal, rb),
      vencimento: null,
      status: "credor",
      statusLabel: "Receita",
      rows: [{ label: "Ganho receita de subvenção", value: brl(subvVal), tone: "carry", emphasis: true }],
      inResumo: false,
    });
  }

  const resumoOrder = ["icms", "st", "pis", "cofins", "irpj", "csll"];
  const resumoCards = resumoOrder
    .map((id) => cards.find((c) => c.id === id && c.inResumo !== false))
    .filter(Boolean) as TaxCardModel[];
  const extraCards = cards.filter((c) => !resumoOrder.includes(c.id) || c.inResumo === false);
  const displayCards = [...resumoCards, ...extraCards];

  const hasAnyTax = cards.some((c) => !c.pending) || hasMem || hasPisCofins || hasIcmsSt || hasDifal || hasIpi;
  const linhas5005Raw = (mem?.linhas || []) as MemLine[];
  const linhas5005: MemLine[] = linhas5005Raw.length
    ? linhas5005Raw
    : hasMem
      ? (
          [
            ["debitoOriginal", "Débito original", "movimento", ""],
            ["creditoOriginal", "Crédito original", "", ""],
            ["totalOriginal", "TOTAL original", "débito + crédito", "total"],
            ["debitos5005", "Débitos 5005", "", ""],
            ["creditos5005", "Créditos 5005", "", ""],
            ["total5005", "TOTAL 5005", "débitos − créditos", "total"],
            ["debitoFora", "Débito fora", "", ""],
            ["creditoFora", "Crédito fora", "", ""],
            ["creditoOutorgado", "Crédito outorgado", "", ""],
            ["totalFora", "TOTAL fora", "déb. − créd. − outorgado", "total"],
            ["icmsARecolher", "ICMS a recolher", "= tot5005 + totFora", "resultado"],
            ["ganhoReceitaSubvencao", "Ganho receita de subvenção", "receita (DRE)", "subvencao"],
          ] as [string, string, string, string][]
        )
          .filter(([key]) => mem?.[key] != null)
          .map(([key, label, papel, kind]) => ({ key, label, papel, kind, valor: Number(mem?.[key]) }))
      : [];

  const hasLivro =
    hasMem || hasPisCofins || hasIcmsSt || hasDifal || hasIpi || hasIrpj || hasCsll || !!(d.entradasMeta || d.saidasMeta);

  return (
    <>
      {displayCards.length ? (
        <div className="tax-detail-grid">
          {displayCards.map((c) => (
            <TaxDetailCard key={c.id} card={c} />
          ))}
        </div>
      ) : null}

      <ResumoConsolidado cards={resumoCards} rb={rb} mesLabel={mesLabel} />

      {hasLivro ? (
        <div className="mem-livro-wrap">
          <button
            type="button"
            className="mem-livro-toggle"
            aria-expanded={livroOpen}
            onClick={() => setLivroOpen((v) => !v)}
          >
            <span>{livroOpen ? "Ocultar" : "Ver"} livro técnico (5005, PIS/COFINS, ST…)</span>
            <span className="mem-livro-chev" aria-hidden>
              {livroOpen ? "▴" : "▾"}
            </span>
          </button>

          {livroOpen ? (
            <div className="mem-livro-body">
              {hasMem ? (
                <div className="table-card" id="mem-5005">
                  <div className="table-head">
                    <div className="ttl">ICMS Decreto 5005</div>
                    <div className="sub">{mem?.formulaIcms || "Total 5005 + Total fora = ICMS a recolher"}</div>
                  </div>
                  <div className="tbl-scroll">
                    <table className="dre-tbl">
                      <thead>
                        <tr>
                          <th>Descrição</th>
                          <th className="r">Valor</th>
                          <th>Papel</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhas5005.map((ln) => (
                          <tr
                            key={ln.key || ln.label}
                            className={
                              ln.kind === "resultado"
                                ? "dre-lucro"
                                : ln.kind === "total"
                                  ? "dre-total"
                                  : ln.kind === "subvencao"
                                    ? "dre-subv"
                                    : undefined
                            }
                          >
                            <td className="fw7">{ln.label}</td>
                            <td className={`r ${Number(ln.valor) < 0 ? "dre-num-neg" : ""}`}>{moneyOrDash(ln.valor)}</td>
                            <td className="td-mute">{ln.papel || ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="alert-box warn">
                  Memória ICMS (APURAÇÃO 5005) ainda não importada neste mês.
                  {hasPisCofins ? " PIS/COFINS abaixo vêm da planilha importada." : " Importe a planilha padrão para preencher o livro."}
                </div>
              )}

              {hasPisCofins ? (
                <div className="table-card" id="mem-pis">
                  <div className="table-head">
                    <div className="ttl">PIS / COFINS</div>
                    <div className="sub">{livroPc?.formula || "a recolher = débito − crédito − saldo credor"}</div>
                  </div>
                  <BaseBlock title="Débito" lines={livroPc?.debito?.linhas || []} />
                  <BaseBlock title="Crédito" lines={livroPc?.credito?.linhas || []} />
                  <ResumoBlock rows={Object.values(livroPc?.resumo || {})} fallback={ap} />
                </div>
              ) : null}

              {hasIcmsSt ? <UfBlock id="mem-st" title="ICMS ST" rows={stUf} total={Number(ap?.icmsSt?.aRecolher ?? 0)} /> : null}
              {hasDifal ? <UfBlock id="mem-difal" title="DIFAL" rows={difalUf} total={Number(ap?.difal?.aRecolher ?? 0)} /> : null}

              {hasIpi ? (
                <div className="table-card" id="mem-ipi">
                  <div className="table-head">
                    <div className="ttl">IPI</div>
                    <div className="sub">{livroIpi?.formula || "a recolher = débito − crédito − saldo credor"}</div>
                  </div>
                  <BaseBlock title="Débito" lines={livroIpi?.debito?.linhas || []} />
                  <BaseBlock title="Crédito" lines={livroIpi?.credito?.linhas || []} />
                  <ResumoBlock rows={Object.values(livroIpi?.resumo || {})} />
                </div>
              ) : null}

              {hasIrpj ? <DemoBlock id="mem-irpj" title="IRPJ" linhas={livroIrpj?.linhas || []} aRecolher={livroIrpj?.aRecolher} /> : null}
              {hasCsll ? <DemoBlock id="mem-csll" title="CSLL" linhas={livroCsll?.linhas || []} aRecolher={livroCsll?.aRecolher} /> : null}

              {d.entradasMeta || d.saidasMeta ? (
                <>
                  <div className="formula-box">Conferência movimento — Total Geral Excel × soma das NFs</div>
                  <div className="mem-grid">
                    <div className="mem-card">
                      <div className="mem-card-head">Entradas</div>
                      <div className="mem-row">
                        <span className="lbl">Total Geral Excel</span>
                        <span className="val">{moneyOrDash(d.entradasMeta?.totalGeralExcel)}</span>
                      </div>
                      <div className="mem-row">
                        <span className="lbl">Soma NFs</span>
                        <span className="val">{moneyOrDash(d.entradasMeta?.soma)}</span>
                      </div>
                      <div className={`mem-row ${Math.abs(d.entradasMeta?.delta || 0) >= 0.02 ? "neg" : "tot"}`}>
                        <span className="lbl">Δ</span>
                        <span className="val">{d.entradasMeta?.delta ?? "—"}</span>
                      </div>
                    </div>
                    <div className="mem-card">
                      <div className="mem-card-head">Saídas</div>
                      <div className="mem-row">
                        <span className="lbl">Total Geral Excel</span>
                        <span className="val">{moneyOrDash(d.saidasMeta?.totalGeralExcel)}</span>
                      </div>
                      <div className="mem-row">
                        <span className="lbl">Soma NFs</span>
                        <span className="val">{moneyOrDash(d.saidasMeta?.soma)}</span>
                      </div>
                      <div className={`mem-row ${Math.abs(d.saidasMeta?.delta || 0) >= 0.02 ? "neg" : "tot"}`}>
                        <span className="lbl">Δ</span>
                        <span className="val">{d.saidasMeta?.delta ?? "—"}</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {!hasAnyTax && !d.entradasMeta && !d.saidasMeta ? (
        <div className="alert-box warn">
          Sem APURAÇÃO 5005 nem demonstrativo de impostos — importe a planilha padrão (ou a memória/ICMS e PIS/COFINS).
        </div>
      ) : null}
    </>
  );
}

function BaseBlock({ title, lines }: { title: string; lines: TaxBaseLine[] }) {
  if (!lines.length) return null;
  return (
    <div className="tbl-scroll">
      <table className="dre-tbl">
        <thead>
          <tr>
            <th>{title}</th>
            <th className="r">Produto</th>
            <th className="r">Contábil</th>
            <th className="r">BC</th>
            <th className="r">Ajuste BC</th>
            <th className="r">BC ajustada</th>
            <th className="r">Alíq.</th>
            <th className="r">Imposto</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((ln) => (
            <tr key={`${title}-${ln.tributo}`}>
              <td className="fw7">{ln.tributo}</td>
              <td className="r">{brl(ln.valorProduto)}</td>
              <td className="r">{brl(ln.valorContabil)}</td>
              <td className="r">{brl(ln.baseCalculo)}</td>
              <td className="r">{brl(ln.ajusteBc || 0)}</td>
              <td className="r">{brl(ln.bcAjustada || ln.baseCalculo)}</td>
              <td className="r">{pctAliq(ln.aliquota)}</td>
              <td className="r td-val">{brl(ln.valorImposto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResumoBlock({ rows, fallback }: { rows: ResumoRow[]; fallback?: Record<string, any> | null }) {
  const list = rows.length
    ? rows
    : ([
        fallback?.pis
          ? {
              tributo: "PIS",
              debito: Number(fallback.pis.apurado || 0),
              credito: Number(fallback.pis.credito || 0),
              aRecolher: Number(fallback.pis.aRecolher || 0),
            }
          : null,
        fallback?.cofins
          ? {
              tributo: "COFINS",
              debito: Number(fallback.cofins.apurado || 0),
              credito: Number(fallback.cofins.credito || 0),
              aRecolher: Number(fallback.cofins.aRecolher || 0),
            }
          : null,
      ].filter(Boolean) as ResumoRow[]);
  if (!list.length) return null;
  return (
    <div className="tbl-scroll">
      <table className="dre-tbl">
        <thead>
          <tr>
            <th>Resumo apuração</th>
            <th className="r">Débito</th>
            <th className="r">Crédito</th>
            <th className="r">Saldo credor</th>
            <th className="r">A recolher</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.tributo} className="dre-total">
              <td className="fw7">{r.tributo}</td>
              <td className="r">{brl(r.debito)}</td>
              <td className="r">{brl(r.credito)}</td>
              <td className="r">{r.saldoCredor != null ? brl(r.saldoCredor) : "—"}</td>
              <td className={`r td-val ${r.aRecolher < 0 ? "dre-num-neg" : ""}`}>{brl(r.aRecolher)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UfBlock({ id, title, rows, total }: { id: string; title: string; rows: [string, number][]; total: number }) {
  return (
    <div className="table-card" id={id}>
      <div className="table-head">
        <div className="ttl">{title}</div>
        <div className="sub">Somente UFs com valor na planilha</div>
      </div>
      <div className="tbl-scroll">
        <table className="dre-tbl">
          <thead>
            <tr>
              <th>UF</th>
              <th className="r">Valor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([uf, val]) => (
              <tr key={uf}>
                <td className="fw7">{uf}</td>
                <td className="r">{brl(Number(val))}</td>
              </tr>
            ))}
            <tr className="dre-lucro">
              <td>Total</td>
              <td className="r">{brl(total || rows.reduce((a, [, v]) => a + Number(v), 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DemoBlock({ id, title, linhas, aRecolher }: { id: string; title: string; linhas: IrpjLine[]; aRecolher?: number }) {
  return (
    <div className="table-card" id={id}>
      <div className="table-head">
        <div className="ttl">{title}</div>
        <div className="sub">{aRecolher != null ? `Saldo devedor ${brl(aRecolher)}` : "Demonstrativo importado"}</div>
      </div>
      <div className="tbl-scroll">
        <table className="dre-tbl">
          <thead>
            <tr>
              <th>Descrição</th>
              <th className="r">Valor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((ln, i) => (
              <tr
                key={`${ln.label}-${i}`}
                className={ln.kind === "resultado" ? "dre-lucro" : ln.kind === "grupo" || ln.kind === "titulo" ? "dre-group" : undefined}
              >
                <td>{ln.label}</td>
                <td className={`r ${Number(ln.valor) < 0 ? "dre-num-neg" : ""}`}>{ln.valor != null ? brl(ln.valor) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
