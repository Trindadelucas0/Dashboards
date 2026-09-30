"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useDash } from "@/components/DashContext";

type Item = {
  file: string;
  ok?: boolean;
  skipped?: boolean;
  status?: string;
  errors?: string[];
  warnings?: string[];
  company_id?: string;
  company_label?: string;
  competencia?: string;
  unidade?: string;
  tipo?: string;
  duplicateHash?: boolean;
  slotExists?: boolean;
  meta?: { soma?: number; delta?: number; nfs?: number };
};

type Saved = {
  file: string;
  status: string;
  companyId?: string;
  competencia?: string;
  unidade?: string;
  tipo?: string;
  errors?: string[];
  warnings?: string[];
};

type SavedSlot = {
  competencia: string;
  unidade: string;
  tipos: string[];
};

type SavedImport = {
  id: number;
  fileName: string;
  createdAt: string | null;
  reversible: boolean;
  slots: SavedSlot[];
};

function formatImportedAt(iso: string | null) {
  if (!iso) return "Data não informada";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR");
}

function slotLabel(slot: SavedSlot) {
  const tipos = (slot.tipos || []).filter(Boolean).join(", ");
  return `${slot.competencia || "mês ?"} · ${slot.unidade || "matriz"}${tipos ? ` · ${tipos}` : ""}`;
}

export default function ImportTab() {
  const { company, goToSlot, reloadCompany } = useDash();
  const [items, setItems] = useState<Item[]>([]);
  const [previewId, setPreviewId] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savedImports, setSavedImports] = useState<SavedImport[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listReady, setListReady] = useState(false);
  const [listError, setListError] = useState("");
  const [listTick, setListTick] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<SavedImport | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteMsg, setDeleteMsg] = useState("");
  const confirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pendingDelete) return;
    confirmRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [pendingDelete]);

  useEffect(() => {
    if (!company?.id) {
      setSavedImports([]);
      setListLoading(false);
      setListReady(false);
      return;
    }
    let cancelled = false;
    setListLoading(true);
    setListReady(false);
    setListError("");
    setPendingDelete(null);
    setSavedImports([]);
    api<{ items: SavedImport[] }>(`/api/imports?companyId=${encodeURIComponent(company.id)}`)
      .then((data) => {
        if (!cancelled) setSavedImports(data.items || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setSavedImports([]);
          setListError(err instanceof Error ? err.message : "Não foi possível listar as planilhas.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setListLoading(false);
          setListReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [company?.id, listTick]);

  const canSave = items.some((it) => it.ok);
  const hasDuplicate = items.some((it) => it.ok && (it.duplicateHash || it.slotExists));

  async function preview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMsg("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (company?.id) fd.set("company_id", company.id);
    setLoading(true);
    try {
      const res = await fetch("/api/imports/preview", { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha no preview");
      setPreviewId(data.previewId);
      setItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function commit(replace: boolean) {
    setLoading(true);
    setError("");
    setMsg("");
    try {
      const data = await api<{ saved: Saved[] }>("/api/imports/commit", {
        method: "POST",
        body: JSON.stringify({ previewId, replace, companyId: company?.id }),
      });
      const ok = data.saved.filter((s) => s.status === "saved");
      const ignored = data.saved.filter((s) => s.status === "ignorado");
      const blocked = data.saved.filter((s) => s.status !== "saved" && s.status !== "ignorado");
      if (ok.length) {
        const last = ok[ok.length - 1];
        let success = `Gravado: ${ok.map((s) => `${s.file} → ${s.unidade || ""} ${s.competencia || ""}`).join(", ")}`;
        if (ignored.length) {
          const avisos = ignored
            .map((s) => {
              const detail = (s.warnings || []).join("; ") || "aba vazia ou ignorada";
              return `${s.file}: ${detail}`;
            })
            .join(" | ");
          success += ` · Avisos (sem gravar): ${avisos}`;
        }
        setMsg(success);
        setListTick((tick) => tick + 1);
        await reloadCompany();
        if (last.competencia) goToSlot(last.competencia, last.unidade || "matriz");
      } else if (ignored.length) {
        setMsg(
          ignored
            .map((s) => {
              const detail = (s.warnings || []).join("; ") || "aba vazia ou ignorada";
              return `${s.file}: ${detail}`;
            })
            .join(" | "),
        );
      }
      if (blocked.length) {
        const reason = blocked
          .map((s) => `${s.file}: ${s.status}${(s.errors || []).length ? " — " + (s.errors || []).join("; ") : ""}`)
          .join(" | ");
        setError(ok.length ? `Alguns arquivos não gravaram. ${reason}` : `Não gravou. ${reason}`);
      }
      if (!ok.length && !blocked.length) setError("Nada para gravar.");
      setPreviewId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gravar");
    } finally {
      setLoading(false);
    }
  }

  async function removeSaved() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError("");
    setDeleteMsg("");
    try {
      await api(`/api/imports/${pendingDelete.id}`, { method: "DELETE" });
      setDeleteMsg("Planilha excluída. Os dados dela saíram do mês.");
      setPendingDelete(null);
      setListTick((tick) => tick + 1);
      await reloadCompany();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Não foi possível excluir a planilha.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section>
      <div className="sec-header">
        <div>
          <div className="sec-title">Importar planilhas</div>
          <div className="sec-sub">
            {company?.id === "jpg" ? (
              <>
                Envie Entradas/Saídas EXITO e demonstrativos de <strong>ICMS/IPI</strong> da filial (uma aba por mês).
                Empresa vem do dashboard aberto. Abas vazias ou IRPJ de outra empresa aparecem como aviso, não erro.
              </>
            ) : (
              <>
                <strong>Planilha padrão</strong> (9 abas: DRE, Balancete, 5005, PIS/COFINS, IRPJ, CSLL, ST, DIFAL, IPI) — mesmo esqueleto todo mês; só mudam os números.
                Também aceita pacote EXITO legado (Entradas, Relatório de entrada por fornecedor, Saídas, demonstrativos separados).
                Empresa vem do dashboard aberto. Abas vazias ou IRPJ de outra empresa aparecem como aviso, não erro.
              </>
            )}
          </div>
        </div>
      </div>
      <form className="import-drop" onSubmit={preview}>
        <label htmlFor="files">Selecione um ou mais arquivos .xls / .xlsx</label>
        <p className="muted">Envie um ou mais .xls / .xlsx do mês. Eles são somados/mesclados no mês correspondente.</p>
        <input id="files" name="files" type="file" multiple accept=".xls,.xlsx" required style={{ margin: "12px 0" }} />
        <div>
          <button type="submit" className="btn-export" disabled={loading}>{loading ? "Lendo…" : "Extrair e validar"}</button>
        </div>
      </form>
      {error ? <div className="error-banner" role="alert">{error}</div> : null}
      {msg ? <div className="notice">{msg}</div> : null}
      <div className="import-list">
        {items.map((it) => (
          <article
            key={it.file}
            className={`import-item ${it.skipped ? "warn" : it.ok ? "ok" : "err"}`}
          >
            <strong>{it.file}</strong>
            <div>{it.company_label || "empresa ?"} · {it.competencia || "mês ?"} · {it.unidade} · {it.tipo}{it.status ? ` · ${it.status}` : ""}{it.skipped ? " · ignorada" : ""}</div>
            {it.meta ? <div>Soma {it.meta.soma} · Δ {it.meta.delta} · NFs {it.meta.nfs}</div> : null}
            {it.duplicateHash ? <div>Arquivo já importado (hash).</div> : null}
            {it.slotExists ? <div>Este mês já tem dados. Use substituir para sobrescrever.</div> : null}
            {(it.warnings || []).map((e) => <div key={e}>{e}</div>)}
            {(it.errors || []).map((e) => <div key={e}>{e}</div>)}
          </article>
        ))}
      </div>
      {previewId && canSave ? (
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button type="button" className="btn-export" onClick={() => commit(false)} disabled={loading}>
            Gravar
          </button>
          {hasDuplicate ? (
            <button type="button" className="btn-export" onClick={() => commit(true)} disabled={loading}>
              Substituir mês
            </button>
          ) : null}
        </div>
      ) : null}
      {previewId && !canSave ? (
        <p className="muted" style={{ marginTop: 16 }}>
          Não dá para gravar.
          {items.flatMap((it) => it.errors || []).length
            ? " " + items.flatMap((it) => it.errors || []).join(" ")
            : " Extraia de novo depois de corrigir o arquivo."}
        </p>
      ) : null}

      <div className="import-saved">
        <h2 className="sec-title">Planilhas importadas</h2>
        <p className="muted">Arquivos já gravados nesta empresa. Excluir tira só os dados daquela planilha.</p>
        {listLoading ? <p className="muted">Carregando planilhas…</p> : null}
        {listError ? <div className="error-banner" role="alert">{listError}</div> : null}
        {deleteMsg ? <div className="notice" role="status">{deleteMsg}</div> : null}
        {!listLoading && listReady && !listError && savedImports.length === 0 ? (
          <p className="empty-state">Nenhuma planilha importada nesta empresa.</p>
        ) : null}
        <div className="import-saved-list">
          {savedImports.map((row) => {
            const confirming = pendingDelete?.id === row.id;
            return (
              <article key={row.id} className={`import-saved-card${confirming ? " is-confirming" : ""}`}>
                <div>
                  <strong>{row.fileName || "Planilha"}</strong>
                  <div className="muted">{formatImportedAt(row.createdAt)}</div>
                  <ul className="import-saved-slots">
                    {(row.slots || []).map((slot) => (
                      <li key={`${row.id}-${slot.competencia}-${slot.unidade}`}>{slotLabel(slot)}</li>
                    ))}
                  </ul>
                  {row.reversible ? null : (
                    <p className="muted">Planilha antiga. Se houver outra do mesmo tipo no mês, a exclusão é recusada.</p>
                  )}
                </div>
                {confirming ? (
                  <div ref={confirmRef} className="import-confirm" role="region" aria-label="Confirmar exclusão">
                    <p>
                      Excluir <strong>{row.fileName || "Planilha"}</strong>? Sai o que esta planilha gravou.
                      O que veio de outros arquivos no mesmo mês permanece.
                    </p>
                    {deleteError ? <div className="error-banner" role="alert">{deleteError}</div> : null}
                    <div className="import-confirm-actions">
                      <button type="button" className="btn-export" onClick={() => setPendingDelete(null)} disabled={deleting}>
                        Cancelar
                      </button>
                      <button type="button" className="btn-export danger" onClick={removeSaved} disabled={deleting}>
                        {deleting ? "Excluindo…" : "Excluir planilha"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-export danger"
                    onClick={() => {
                      setDeleteError("");
                      setDeleteMsg("");
                      setPendingDelete(row);
                    }}
                    disabled={deleting}
                  >
                    Excluir
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
