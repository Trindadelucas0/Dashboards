"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, brl } from "@/lib/api";
import { useDash } from "@/components/DashContext";

type CompetenciaOption = { value: string; label: string; importedAt: string | null };
type BankOption = { bankKey: string; bankName: string; competencias: CompetenciaOption[] };
type Classification = { label: string; value?: string; count: number; total: number; net: number };
type StatementSummary = {
  bankKey: string;
  bankName: string;
  competencia: string;
  fileName: string;
  importedAt: string | null;
  rowCount: number;
  unclassifiedCount: number;
  totalIn: number;
  totalOut: number;
  balance: number;
  classifications: Classification[];
};
type Transaction = {
  id: number;
  date: string;
  debit: string;
  credit: string;
  amount: number;
  history: string;
  noteNumber: string;
  classification: string;
};
type TransactionsResponse = {
  page: number;
  pageSize: number;
  pages: number;
  total: number;
  items: Transaction[];
};
type Preview = StatementSummary & {
  previewId: string;
  exists: boolean;
  duplicate: boolean;
};

const PAGE_SIZE = 20;

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function transactionDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function signedMoney(value: number) {
  const formatted = brl(Math.abs(value));
  return `${value >= 0 ? "+ " : "− "}${formatted}`;
}

export default function BankReconciliation() {
  const { company, unidade, isAdmin } = useDash();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [bankKey, setBankKey] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [summary, setSummary] = useState<StatementSummary | null>(null);
  const [transactions, setTransactions] = useState<TransactionsResponse | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [classification, setClassification] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [confirmReplace, setConfirmReplace] = useState(false);

  const selectedBank = useMemo(
    () => banks.find((bank) => bank.bankKey === bankKey) || null,
    [banks, bankKey],
  );

  function syncUrl(nextBank: string, nextMonth: string) {
    const query = new URLSearchParams(searchParams.toString());
    if (nextBank) query.set("bank", nextBank);
    else query.delete("bank");
    if (nextMonth) query.set("bankMonth", nextMonth);
    else query.delete("bankMonth");
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  }

  useEffect(() => {
    if (!company?.id || !unidade) return;
    let active = true;
    setLoadingOptions(true);
    setError("");
    api<{ banks: BankOption[] }>(
      `/api/companies/${company.id}/bank-statements/options?unidade=${encodeURIComponent(unidade)}`,
    )
      .then((data) => {
        if (!active) return;
        const nextBanks = data.banks || [];
        setBanks(nextBanks);
        const urlBank = searchParams.get("bank") || "";
        const wantedBank = nextBanks.find((item) => item.bankKey === urlBank) || nextBanks[0];
        const urlMonth = searchParams.get("bankMonth") || "";
        const wantedMonth = wantedBank?.competencias.find((item) => item.value === urlMonth)
          || wantedBank?.competencias[0];
        setBankKey(wantedBank?.bankKey || "");
        setCompetencia(wantedMonth?.value || "");
        if (wantedBank && wantedMonth && (urlBank !== wantedBank.bankKey || urlMonth !== wantedMonth.value)) {
          syncUrl(wantedBank.bankKey, wantedMonth.value);
        }
      })
      .catch((reason: Error) => active && setError(reason.message))
      .finally(() => active && setLoadingOptions(false));
    return () => { active = false; };
    // A URL é lida na carga; mudanças posteriores passam pelos seletores da própria tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, unidade, refreshKey]);

  useEffect(() => {
    if (!company?.id || !unidade || !bankKey || !competencia) {
      setSummary(null);
      setTransactions(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setLoadingData(true);
      setError("");
      const common = `bankKey=${encodeURIComponent(bankKey)}&competencia=${competencia}&unidade=${encodeURIComponent(unidade)}`;
      const filters = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search.trim()) filters.set("search", search.trim());
      if (classification) filters.set("classification", classification);
      if (dateFrom) filters.set("dateFrom", dateFrom);
      if (dateTo) filters.set("dateTo", dateTo);
      Promise.all([
        api<StatementSummary>(`/api/companies/${company.id}/bank-statements/summary?${common}`),
        api<TransactionsResponse>(`/api/companies/${company.id}/bank-statements/transactions?${common}&${filters}`),
      ])
        .then(([summaryData, transactionData]) => {
          if (!active) return;
          setSummary(summaryData);
          setTransactions(transactionData);
          if (transactionData.page !== page) setPage(transactionData.page);
        })
        .catch((reason: Error) => active && setError(reason.message))
        .finally(() => active && setLoadingData(false));
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [company?.id, unidade, bankKey, competencia, page, search, classification, dateFrom, dateTo, refreshKey]);

  useEffect(() => setPage(1), [search, classification, dateFrom, dateTo, bankKey, competencia]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  function chooseBank(nextBankKey: string) {
    const bank = banks.find((item) => item.bankKey === nextBankKey);
    const nextMonth = bank?.competencias[0]?.value || "";
    setBankKey(nextBankKey);
    setCompetencia(nextMonth);
    setClassification("");
    syncUrl(nextBankKey, nextMonth);
  }

  function chooseMonth(nextMonth: string) {
    setCompetencia(nextMonth);
    setClassification("");
    syncUrl(bankKey, nextMonth);
  }

  function openModal() {
    setModalOpen(true);
    setFile(null);
    setPreview(null);
    setImportError("");
    setConfirmReplace(false);
  }

  function closeModal() {
    if (previewBusy || commitBusy) return;
    setModalOpen(false);
    window.setTimeout(() => importButtonRef.current?.focus(), 0);
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] || null;
    setFile(nextFile);
    setPreview(null);
    setImportError("");
    setConfirmReplace(false);
  }

  async function generatePreview() {
    if (!file || !company?.id) return;
    setPreviewBusy(true);
    setImportError("");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("company_id", company.id);
      body.set("unidade", unidade || "matriz");
      const result = await api<Preview>("/api/bank-statements/preview", { method: "POST", body });
      setPreview(result);
    } catch (reason) {
      setPreview(null);
      setImportError(reason instanceof Error ? reason.message : "Não foi possível validar a planilha.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function commitImport() {
    if (!preview || preview.duplicate || (preview.exists && !confirmReplace)) return;
    setCommitBusy(true);
    setImportError("");
    try {
      await api("/api/bank-statements/commit", {
        method: "POST",
        body: JSON.stringify({ previewId: preview.previewId, replace: preview.exists }),
      });
      setSuccess(preview.exists
        ? "Banco e competência substituídos com sucesso."
        : "Conciliação importada com sucesso.");
      setBankKey(preview.bankKey);
      setCompetencia(preview.competencia);
      syncUrl(preview.bankKey, preview.competencia);
      setRefreshKey((value) => value + 1);
      setModalOpen(false);
    } catch (reason) {
      setImportError(reason instanceof Error ? reason.message : "Não foi possível gravar a importação.");
    } finally {
      setCommitBusy(false);
    }
  }

  const maxClassCount = Math.max(...(summary?.classifications.map((item) => item.count) || [1]));

  return (
    <section className="bank-page">
      <div className="bank-page-head">
        <div>
          <div className="sec-title">Recebimentos/Pagamentos</div>
          <div className="sec-sub">Conciliação bancária por banco e competência</div>
        </div>
        {isAdmin ? (
          <button ref={importButtonRef} type="button" className="bank-primary" onClick={openModal}>
            <i className="fas fa-file-arrow-up" /> Importar planilha
          </button>
        ) : null}
      </div>

      {success ? <div className="bank-feedback success" role="status">{success}</div> : null}
      {error ? <div className="error-banner" role="alert">{error}</div> : null}

      <div className="bank-toolbar" aria-label="Seleção da conciliação">
        <label>
          <span>Banco</span>
          <select value={bankKey} onChange={(event) => chooseBank(event.target.value)} disabled={!banks.length}>
            {!banks.length ? <option value="">Nenhum banco importado</option> : null}
            {banks.map((bank) => <option key={bank.bankKey} value={bank.bankKey}>{bank.bankName}</option>)}
          </select>
        </label>
        <label>
          <span>Competência</span>
          <select value={competencia} onChange={(event) => chooseMonth(event.target.value)} disabled={!selectedBank}>
            {!selectedBank ? <option value="">Nenhuma competência</option> : null}
            {selectedBank?.competencias.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <div className="bank-last-import">
          <span>Última importação</span>
          <strong>{dateLabel(summary?.importedAt)}</strong>
        </div>
      </div>

      {loadingOptions ? <div className="notice">Carregando conciliações…</div> : null}
      {!loadingOptions && !banks.length ? (
        <div className="bank-empty">
          <i className="fas fa-building-columns" />
          <h2>Nenhuma conciliação importada</h2>
          <p>{isAdmin ? "Importe uma planilha .xlsx para iniciar a consulta por banco e competência." : "Peça a um administrador para importar a primeira planilha bancária."}</p>
          {isAdmin ? <button type="button" className="bank-primary" onClick={openModal}>Importar planilha</button> : null}
        </div>
      ) : null}

      {summary ? (
        <>
          <div className={`bank-kpis ${loadingData ? "is-loading" : ""}`}>
            <article><span>Entradas</span><strong className="positive">{brl(summary.totalIn)}</strong><small>Valores positivos</small></article>
            <article><span>Saídas</span><strong className="negative">{brl(summary.totalOut)}</strong><small>Valores negativos</small></article>
            <article><span>Saldo</span><strong className={summary.balance < 0 ? "negative" : "positive"}>{brl(summary.balance)}</strong><small>Entradas menos saídas</small></article>
            <article><span>Lançamentos</span><strong>{summary.rowCount.toLocaleString("pt-BR")}</strong><small>Linhas importadas</small></article>
          </div>

          <div className="bank-overview-grid">
            <article className="bank-panel">
              <div className="bank-panel-title">Classificação Êxito</div>
              <div className="bank-class-list">
                {summary.classifications.map((item) => {
                  const filterValue = item.value || item.label;
                  return (
                    <button
                      type="button"
                      key={filterValue}
                      className={classification === filterValue ? "active" : ""}
                      onClick={() => setClassification(classification === filterValue ? "" : filterValue)}
                    >
                      <span className="bank-class-main"><b>{item.label}</b><em>{item.count.toLocaleString("pt-BR")}</em></span>
                      <span className="bank-class-bar"><i style={{ width: `${Math.max(3, (item.count / maxClassCount) * 100)}%` }} /></span>
                      <span className={item.net < 0 ? "negative" : "positive"}>{signedMoney(item.net)}</span>
                    </button>
                  );
                })}
              </div>
            </article>
            <article className="bank-panel bank-checks">
              <div className="bank-panel-title">Conferência do arquivo</div>
              <dl>
                <div><dt>Banco identificado</dt><dd><i className="fas fa-check" /> OK</dd></div>
                <div><dt>Competência identificada</dt><dd><i className="fas fa-check" /> OK</dd></div>
                <div><dt>Linhas com valor</dt><dd>{summary.rowCount.toLocaleString("pt-BR")}</dd></div>
                <div><dt>Sem classificação</dt><dd className={summary.unclassifiedCount ? "warning" : ""}>{summary.unclassifiedCount.toLocaleString("pt-BR")}</dd></div>
                <div><dt>Arquivo ativo</dt><dd title={summary.fileName}>{summary.fileName}</dd></div>
              </dl>
            </article>
          </div>

          <article className="bank-table-card">
            <div className="bank-table-heading">
              <div><h2>Lançamentos</h2><p>Pesquisa e filtros aplicados somente ao banco e mês selecionados.</p></div>
              <span>{transactions?.total.toLocaleString("pt-BR") || 0} resultado(s)</span>
            </div>
            <div className="bank-filters">
              <label className="bank-search"><span className="sr-only">Buscar histórico ou nota</span><i className="fas fa-magnifying-glass" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar histórico ou nota…" /></label>
              <label><span className="sr-only">Classificação</span><select value={classification} onChange={(event) => setClassification(event.target.value)}><option value="">Todas as classificações</option>{summary.classifications.map((item) => <option key={item.value || item.label} value={item.value || item.label}>{item.label}</option>)}</select></label>
              <label><span>De</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
              <label><span>Até</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
              {(search || classification || dateFrom || dateTo) ? <button type="button" className="bank-clear" onClick={() => { setSearch(""); setClassification(""); setDateFrom(""); setDateTo(""); }}>Limpar</button> : null}
            </div>

            <div className={`bank-table-wrap ${loadingData ? "is-loading" : ""}`}>
              <table className="bank-table">
                <thead><tr><th>Data</th><th>Débito</th><th>Crédito</th><th className="right">Valor</th><th>Histórico</th><th>Nota</th><th>Classificação</th></tr></thead>
                <tbody>
                  {transactions?.items.map((item) => (
                    <tr key={item.id}>
                      <td>{transactionDate(item.date)}</td><td>{item.debit || "—"}</td><td>{item.credit || "—"}</td>
                      <td className={`right bank-amount ${item.amount < 0 ? "negative" : "positive"}`}>{signedMoney(item.amount)}</td>
                      <td className="bank-history" title={item.history}>{item.history || "—"}</td><td>{item.noteNumber || "—"}</td>
                      <td><span className={`bank-tag ${item.classification === "Sem classificação" ? "warning" : ""}`}>{item.classification}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bank-mobile-list">
                {transactions?.items.map((item) => (
                  <article key={item.id}>
                    <div><time>{transactionDate(item.date)}</time><strong className={item.amount < 0 ? "negative" : "positive"}>{signedMoney(item.amount)}</strong></div>
                    <p>{item.history || "Sem histórico"}</p><small>Débito {item.debit || "—"} · Crédito {item.credit || "—"} · Nota {item.noteNumber || "—"}</small>
                    <span className={`bank-tag ${item.classification === "Sem classificação" ? "warning" : ""}`}>{item.classification}</span>
                  </article>
                ))}
              </div>
              {!loadingData && transactions && !transactions.items.length ? <div className="bank-no-results">Nenhum lançamento corresponde aos filtros.</div> : null}
            </div>
            <div className="bank-pagination">
              <span>{transactions?.total.toLocaleString("pt-BR") || 0} resultados</span>
              <div><button type="button" disabled={!transactions || transactions.page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><b>{transactions?.page || 1} / {transactions?.pages || 1}</b><button type="button" disabled={!transactions || transactions.page >= transactions.pages} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>
            </div>
          </article>
        </>
      ) : null}

      {modalOpen ? (
        <div className="bank-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeModal(); }}>
          <section className="bank-modal" role="dialog" aria-modal="true" aria-labelledby="bank-import-title">
            <header><div><h2 id="bank-import-title">Importar conciliação bancária</h2><p>São lidas somente as colunas de Data até Classificação Êxito.</p></div><button type="button" aria-label="Fechar" onClick={closeModal}>×</button></header>
            <div className="bank-modal-body">
              <div className="bank-step"><span>1</span><div><b>Arquivo .xlsx</b><p>Um banco e uma competência por arquivo. Limite de 10 MB.</p></div></div>
              <label className="bank-file"><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={selectFile} /><i className="fas fa-file-excel" /><span>{file?.name || "Selecionar planilha .xlsx"}</span></label>
              {file && !preview ? <button type="button" className="bank-primary bank-preview-button" disabled={previewBusy} onClick={generatePreview}>{previewBusy ? "Validando…" : "Validar e gerar prévia"}</button> : null}
              {importError ? <div className="error-banner" role="alert">{importError}</div> : null}
              {preview ? (
                <>
                  <div className="bank-step preview"><span>2</span><div><b>Prévia conferida</b><p>Revise os dados antes de gravar.</p></div></div>
                  <dl className="bank-preview-grid">
                    <div><dt>Banco</dt><dd>{preview.bankName}</dd></div><div><dt>Competência</dt><dd>{preview.competencia}</dd></div>
                    <div><dt>Lançamentos</dt><dd>{preview.rowCount.toLocaleString("pt-BR")}</dd></div><div><dt>Sem classificação</dt><dd>{preview.unclassifiedCount.toLocaleString("pt-BR")}</dd></div>
                    <div><dt>Entradas</dt><dd className="positive">{brl(preview.totalIn)}</dd></div><div><dt>Saídas</dt><dd className="negative">{brl(preview.totalOut)}</dd></div>
                    <div className="wide"><dt>Saldo</dt><dd className={preview.balance < 0 ? "negative" : "positive"}>{brl(preview.balance)}</dd></div>
                  </dl>
                  <div className="bank-validation-list"><span><i className="fas fa-check" /> Estrutura reconhecida</span><span><i className="fas fa-check" /> Datas dentro da competência</span><span><i className="fas fa-check" /> Valores válidos</span></div>
                  {preview.duplicate ? <div className="bank-feedback warning">Este mesmo arquivo já está ativo para o banco e a competência.</div> : null}
                  {preview.exists && !preview.duplicate ? <label className="bank-replace-confirm"><input type="checkbox" checked={confirmReplace} onChange={(event) => setConfirmReplace(event.target.checked)} /><span><b>Substituir banco/mês existente</b>Os lançamentos atuais deixarão de aparecer, mas a importação anterior ficará preservada no histórico.</span></label> : null}
                </>
              ) : null}
            </div>
            <footer><button type="button" className="btn-cancel" onClick={closeModal}>Cancelar</button>{preview ? <button type="button" className="bank-primary" disabled={commitBusy || preview.duplicate || (preview.exists && !confirmReplace)} onClick={commitImport}>{commitBusy ? "Gravando…" : preview.exists ? "Substituir banco/mês" : "Gravar importação"}</button> : null}</footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
