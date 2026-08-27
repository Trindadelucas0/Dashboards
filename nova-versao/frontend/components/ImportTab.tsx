"use client";

import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import { useDash } from "@/components/DashContext";

type Item = {
  file: string;
  ok?: boolean;
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
  errors?: string[];
};

export default function ImportTab() {
  const { company, goToSlot, reloadCompany } = useDash();
  const [items, setItems] = useState<Item[]>([]);
  const [previewId, setPreviewId] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      const blocked = data.saved.filter((s) => s.status !== "saved");
      if (ok.length) {
        const last = ok[ok.length - 1];
        setMsg(
          `Gravado: ${ok.map((s) => `${s.file} → ${s.unidade || ""} ${s.competencia || ""}`).join(", ")}`,
        );
        await reloadCompany();
        if (last.competencia) goToSlot(last.competencia, last.unidade || "matriz");
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

  return (
    <section>
      <div className="sec-header">
        <div>
          <div className="sec-title">Importar planilhas</div>
          <div className="sec-sub">
            Pacote mensal (Egaplast, Baifer): Entradas, Saídas, Apuração ICMS, IPI, PIS/COFINS, ST, DRE, Balancete e — Baifer —
            <strong> APURAÇÃO 5005</strong> (Memória de Cálculo / ICMS a recolher / subvenção). Mesmo layout todo mês.
            O Python lê CNPJ e tipo da planilha; a 5005 não tem CNPJ — use o dashboard da empresa aberta.
            Nome com MMYYYY (ex. <code>012026 APURAÇÃO 5005.xlsx</code>) define o mês.
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
          <article key={it.file} className={`import-item ${it.ok ? "ok" : "err"}`}>
            <strong>{it.file}</strong>
            <div>{it.company_label || "empresa ?"} · {it.competencia || "mês ?"} · {it.unidade} · {it.tipo}</div>
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
    </section>
  );
}
