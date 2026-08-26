"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  buildSupplierReport,
  collectUniqueSuppliers,
  isSupplierReportError,
  type CfopDado,
  type SupplierOption,
} from "@/lib/supplierReport";
import { exportSupplierExcel, exportSupplierPdf, printSupplierReport } from "@/lib/supplierExport";

type MonthOpt = { competencia: string; label: string; unidade: string };

type Props = {
  empresa: string;
  unidade: string;
  month: string;
  periodLabel: string;
  companyName: string;
  months: MonthOpt[];
  cfopDados: CfopDado[];
};

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

function labelForPeriod(key: string, months: MonthOpt[]): string {
  if (isTrimestreKey(key)) {
    const m = /^q([1-4])-(\d{4})$/i.exec(key);
    return m ? `${m[1]}º Trimestre ${m[2]}` : key;
  }
  return months.find((m) => m.competencia === key)?.label || key;
}

export default function SupplierReportModal({
  empresa,
  unidade,
  month,
  periodLabel,
  companyName,
  months,
  cfopDados,
}: Props) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState(month);
  const [search, setSearch] = useState("");
  const [includeDemais, setIncludeDemais] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [remoteCfops, setRemoteCfops] = useState<CfopDado[] | null>(null);
  const [remoteLabel, setRemoteLabel] = useState("");
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  const periodOptions = useMemo(() => {
    const byUn = months.filter((m) => !unidade || m.unidade === unidade);
    const qs = new Map<string, string>();
    for (const m of byUn) {
      const k = trimestreKeyFromMonth(m.competencia);
      if (k && !qs.has(k)) qs.set(k, labelForPeriod(k, byUn));
    }
    return {
      quarters: Array.from(qs.entries()).map(([value, label]) => ({ value, label })),
      months: byUn.map((m) => ({ value: m.competencia, label: m.label })),
    };
  }, [months, unidade]);

  const activeCfops = period === month && remoteCfops === null ? cfopDados : (remoteCfops || []);
  const competenciaLabel =
    period === month && remoteCfops === null ? periodLabel : remoteLabel || labelForPeriod(period, months);

  const suppliers = useMemo(() => collectUniqueSuppliers(activeCfops), [activeCfops]);
  const term = search.trim().toLowerCase();
  const visible = term
    ? suppliers.filter((s) => `${s.nome} ${s.cnpj} ${s.uf}`.toLowerCase().includes(term))
    : suppliers;

  useEffect(() => {
    if (!open) return;
    setPeriod(month);
    setSearch("");
    setIncludeDemais(true);
    setSelectedKeys(new Set());
    setRemoteCfops(null);
    setRemoteLabel("");
    setFetchError("");
    setActionError("");
  }, [open, month]);

  useEffect(() => {
    if (!open) return;
    if (period === month) {
      setRemoteCfops(null);
      setRemoteLabel("");
      setFetchError("");
      setLoadingPeriod(false);
      return;
    }
    let cancelled = false;
    setLoadingPeriod(true);
    setFetchError("");
    setSelectedKeys(new Set());
    api<{ empty?: boolean; data?: Record<string, unknown>; trimestre?: { label?: string } }>(
      `/api/companies/${empresa}/months/${period}/finalidade?unidade=${encodeURIComponent(unidade || "matriz")}`,
    )
      .then((payload) => {
        if (cancelled) return;
        const data = payload.data || {};
        setRemoteCfops((data.cfopDados as CfopDado[]) || []);
        setRemoteLabel(String(data.competenciaLabel || payload.trimestre?.label || labelForPeriod(period, months)));
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setRemoteCfops([]);
        setFetchError(e.message || "Falha ao carregar a competência.");
      })
      .finally(() => {
        if (!cancelled) setLoadingPeriod(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, period, month, empresa, unidade, months]);

  function toggleKey(key: string, checked: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleVisible(checked: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const s of visible) {
        if (checked) next.add(s.key);
        else next.delete(s.key);
      }
      return next;
    });
  }

  function selectedOptions(): SupplierOption[] {
    return suppliers.filter((s) => selectedKeys.has(s.key));
  }

  function buildOrError() {
    return buildSupplierReport({
      selected: selectedOptions(),
      includeDemais,
      cfopDados: activeCfops,
      companyName,
      competencia: competenciaLabel,
    });
  }

  async function runExport(kind: "print" | "pdf" | "xlsx") {
    setActionError("");
    const result = buildOrError();
    if (isSupplierReportError(result)) {
      setActionError(result.error);
      return;
    }
    setBusy(true);
    try {
      if (kind === "print") printSupplierReport(result);
      if (kind === "pdf") await exportSupplierPdf(result);
      if (kind === "xlsx") await exportSupplierExcel(result);
      setOpen(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Falha ao gerar o relatório.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fin-supplier-bar" id="fin-supplier-bar">
        <button
          type="button"
          className="btn-export print"
          onClick={() => setOpen(true)}
          title="Imprimir por Fornecedor"
        >
          <i className="fas fa-truck" /> Por Fornecedor
        </button>
        <span className="fin-supplier-hint">
          Selecione fornecedores e emita o relatório (Imprimir, PDF ou Excel) da competência escolhida.
        </span>
      </div>

      {open ? (
        <div
          className="modal-overlay"
          id="supplierModal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="supplier-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="modal-box">
            <div className="modal-header">
              <h3 id="supplier-modal-title">
                <i className="fas fa-truck" /> Imprimir por Fornecedor
              </h3>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="search-box">
                <label htmlFor="supplierReportPeriod">Competência do relatório</label>
                <select
                  id="supplierReportPeriod"
                  className="period-sel"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  {periodOptions.quarters.length ? (
                    <optgroup label="Trimestres">
                      {periodOptions.quarters.map((q) => (
                        <option key={q.value} value={q.value}>
                          {q.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {periodOptions.months.length ? (
                    <optgroup label="Meses">
                      {periodOptions.months.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </div>
              <div className="search-box">
                <input
                  type="text"
                  id="supplierSearch"
                  placeholder="Buscar fornecedor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="supplier-actions">
                <button type="button" onClick={() => toggleVisible(true)}>
                  Selecionar Todos
                </button>
                <button type="button" onClick={() => toggleVisible(false)}>
                  Limpar Seleção
                </button>
              </div>
              <label className="supplier-item supplier-item-demais" htmlFor="includeDemaisFornecedores">
                <input
                  type="checkbox"
                  id="includeDemaisFornecedores"
                  checked={includeDemais}
                  onChange={(e) => setIncludeDemais(e.target.checked)}
                />
                <span className="supplier-info">
                  <strong>Demais fornecedores</strong>
                  <small>Agrupa fornecedores não selecionados por CFOP</small>
                </span>
              </label>
              <div className="supplier-list" id="supplierList">
                {loadingPeriod ? (
                  <p className="td-mute" style={{ padding: 16 }}>
                    Carregando competência…
                  </p>
                ) : fetchError ? (
                  <p className="td-mute" style={{ padding: 16 }}>
                    {fetchError}
                  </p>
                ) : visible.length ? (
                  visible.map((s) => (
                    <label key={s.key} className="supplier-item">
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(s.key)}
                        onChange={(e) => toggleKey(s.key, e.target.checked)}
                      />
                      <span className="supplier-info">
                        <strong>{s.nome}</strong>
                        <small>
                          {s.cnpj} · {s.uf}
                        </small>
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="td-mute" style={{ padding: 16 }}>
                    Nenhum fornecedor nesta competência.
                  </p>
                )}
              </div>
              {actionError ? (
                <p className="supplier-action-error" role="alert">
                  {actionError}
                </p>
              ) : null}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-cancel" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <div className="modal-footer-actions">
                <button
                  type="button"
                  className="btn-confirm btn-print-supplier"
                  disabled={busy || loadingPeriod}
                  onClick={() => runExport("print")}
                >
                  <i className="fas fa-print" /> Imprimir Selecionados
                </button>
                <button
                  type="button"
                  className="btn-confirm btn-pdf-supplier"
                  disabled={busy || loadingPeriod}
                  onClick={() => runExport("pdf")}
                  title="Baixar PDF dos selecionados"
                >
                  <i className="fas fa-file-pdf" /> Baixar PDF
                </button>
                <button
                  type="button"
                  className="btn-confirm btn-xlsx-supplier"
                  disabled={busy || loadingPeriod}
                  onClick={() => runExport("xlsx")}
                  title="Baixar Excel dos selecionados"
                >
                  <i className="fas fa-file-excel" /> Baixar Excel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
