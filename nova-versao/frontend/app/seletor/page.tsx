"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { CARD_META, firstAllowedTab } from "@/lib/nav";
import "../selector.css";

type CompanyUnit = { key: string; label: string; cnpj: string | null };
type Company = { id: string; label: string; desc: string; cnpj: string; tabs?: string[] };
type CompanyDetail = { id: string; label: string; cnpj: string; units: CompanyUnit[] };

function digitsOnly(value: string) {
  return value.replace(/\D/g, "").slice(0, 14);
}

function maskCnpj(value: string) {
  const digits = digitsOnly(value);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export default function SeletorPage() {
  const router = useRouter();
  const [username, setUsername] = useState("Usuário");
  const [isAdmin, setIsAdmin] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState("");
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUnits, setEditingUnits] = useState<CompanyUnit[]>([]);
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);
  const [editSavingKey, setEditSavingKey] = useState<string | null>(null);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");
  const [newUnit, setNewUnit] = useState({ label: "", cnpj: "" });
  const [addingUnit, setAddingUnit] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await api<{ username: string; isAdmin?: boolean }>("/api/auth/me");
        setUsername(me.username);
        setIsAdmin(Boolean(me.isAdmin));
        const list = await api<Company[]>("/api/companies");
        setCompanies(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro");
      }
    })();
  }, []);

  useEffect(() => {
    function closeActions(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest("[data-company-actions]")) setActionMenuId(null);
    }
    function closeActionsWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setActionMenuId(null);
    }
    document.addEventListener("pointerdown", closeActions);
    document.addEventListener("keydown", closeActionsWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeActions);
      document.removeEventListener("keydown", closeActionsWithKeyboard);
    };
  }, []);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  async function deleteCompany(company: Company) {
    setDeletingId(company.id);
    setDeleteErrors((current) => ({ ...current, [company.id]: "" }));
    try {
      await api<{ deleted: boolean; companyId: string }>(`/api/companies/${encodeURIComponent(company.id)}`, {
        method: "DELETE",
      });
      setCompanies((current) => current.filter((item) => item.id !== company.id));
      setActionMenuId(null);
      setConfirmingId(null);
    } catch (err) {
      setDeleteErrors((current) => ({
        ...current,
        [company.id]: err instanceof Error ? err.message : "Não foi possível excluir a empresa.",
      }));
    } finally {
      setDeletingId(null);
    }
  }

  async function openUnitEditor(company: Company) {
    setActionMenuId(null);
    setConfirmingId(null);
    setEditingId(company.id);
    setEditingUnits([]);
    setEditError("");
    setEditSuccess("");
    setNewUnit({ label: "", cnpj: "" });
    setRemovingKey(null);
    setEditLoadingId(company.id);
    try {
      const detail = await api<CompanyDetail>(`/api/companies/${encodeURIComponent(company.id)}`);
      setEditingUnits(detail.units || []);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Não foi possível carregar as unidades.");
    } finally {
      setEditLoadingId(null);
    }
  }

  function updateUnitDraft(key: string, change: Partial<CompanyUnit>) {
    setEditingUnits((current) => current.map((unit) => unit.key === key ? { ...unit, ...change } : unit));
  }

  async function saveUnit(company: Company, unit: CompanyUnit) {
    setEditError("");
    setEditSuccess("");
    const finalNames = editingUnits.filter((item) => item.key !== "todas").map((item) => item.label.trim().toLocaleLowerCase("pt-BR"));
    if (new Set(finalNames).size !== finalNames.length) {
      setEditError("Cada unidade deve ter um nome diferente.");
      return;
    }
    const finalCnpjs = editingUnits.filter((item) => item.key !== "todas" && item.cnpj).map((item) => digitsOnly(item.cnpj || ""));
    if (new Set(finalCnpjs).size !== finalCnpjs.length) {
      setEditError("Cada unidade deve ter um CNPJ diferente.");
      return;
    }
    setEditSavingKey(unit.key);
    try {
      const result = await api<{ companyId: string; unit: CompanyUnit }>(`/api/companies/${encodeURIComponent(company.id)}/units/${encodeURIComponent(unit.key)}`, {
        method: "PATCH",
        body: JSON.stringify({
          label: unit.label.trim(),
          cnpj: digitsOnly(unit.cnpj || ""),
        }),
      });
      setEditingUnits((current) => current.map((item) => item.key === result.unit.key ? result.unit : item));
      setEditSuccess(`${result.unit.label} foi atualizada.`);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Não foi possível salvar a unidade.");
    } finally {
      setEditSavingKey(null);
    }
  }

  async function saveCompanyName(company: Company, unit: CompanyUnit) {
    setEditError("");
    setEditSuccess("");
    const label = unit.label.trim();
    const finalNames = editingUnits
      .filter((item) => item.key !== "todas")
      .map((item) => (item.key === unit.key ? label : item.label.trim()).toLocaleLowerCase("pt-BR"));
    if (new Set(finalNames).size !== finalNames.length) {
      setEditError("O nome da empresa deve ser diferente do nome das unidades.");
      return;
    }
    setEditSavingKey(unit.key);
    try {
      const result = await api<{ id: string; label: string; cnpj: string }>(`/api/companies/${encodeURIComponent(company.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ label }),
      });
      setCompanies((current) => current.map((item) => item.id === result.id ? { ...item, label: result.label } : item));
      setEditingUnits((current) => current.map((item) => item.key === unit.key ? { ...item, label: result.label } : item));
      setEditSuccess(`${result.label} foi atualizada.`);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Não foi possível salvar o nome da empresa.");
    } finally {
      setEditSavingKey(null);
    }
  }

  async function addUnit(company: Company) {
    setEditError("");
    setEditSuccess("");
    setAddingUnit(true);
    try {
      const result = await api<{ companyId: string; unit: CompanyUnit }>(`/api/companies/${encodeURIComponent(company.id)}/units`, {
        method: "POST",
        body: JSON.stringify({ label: newUnit.label.trim(), cnpj: digitsOnly(newUnit.cnpj) }),
      });
      setEditingUnits((current) => [...current, result.unit]);
      setNewUnit({ label: "", cnpj: "" });
      setEditSuccess(`${result.unit.label} foi adicionada.`);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Não foi possível adicionar a unidade.");
    } finally {
      setAddingUnit(false);
    }
  }

  async function removeUnit(company: Company, unit: CompanyUnit) {
    setEditError("");
    setEditSuccess("");
    setEditSavingKey(unit.key);
    try {
      await api(`/api/companies/${encodeURIComponent(company.id)}/units/${encodeURIComponent(unit.key)}`, { method: "DELETE" });
      setEditingUnits((current) => current.filter((item) => item.key !== unit.key));
      setRemovingKey(null);
      setEditSuccess(`${unit.label} foi removida.`);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Não foi possível remover a unidade.");
    } finally {
      setEditSavingKey(null);
    }
  }

  return (
    <div className="selector-page">
      <div className="dot-pattern" aria-hidden="true" />
      <div className="selector-container">
        <div className="header-card">
          <div className="header-top">
            <div className="brand-name">
              <span className="dark">Êx</span>
              <span className="green">i</span>
              <span className="dark">to</span>
            </div>
            <button type="button" className="btn-logout" onClick={logout}>Sair</button>
          </div>
          <div className="divider" />
          <h1 className="welcome-title">
            Bem-vindo, <span className="user-name">{username}</span>
          </h1>
          <p className="welcome-sub">Selecione o dashboard que deseja acessar</p>
        </div>
        <div className="dashboard-grid">
          {error ? <div className="error-box">{error}</div> : null}
          {!error && companies.length === 0 && !isAdmin ? (
            <div className="empty-dashboards">Nenhum dashboard foi atribuído à sua conta.</div>
          ) : null}
          {companies.map((c) => {
            const meta = CARD_META[c.id];
            const actionsOpen = actionMenuId === c.id;
            const confirming = confirmingId === c.id;
            const editing = editingId === c.id;
            const deleting = deletingId === c.id;
            return (
              <article key={c.id} className={`dashboard-card company-card${actionsOpen ? " actions-open" : ""}`}>
                {isAdmin && !confirming && !editing ? (
                  <div className="company-actions" data-company-actions>
                    <button
                      type="button"
                      className="company-actions-trigger"
                      aria-label={`Mais opções para ${c.label}`}
                      aria-haspopup="menu"
                      aria-expanded={actionsOpen}
                      disabled={Boolean(deletingId)}
                      onClick={() => setActionMenuId((current) => current === c.id ? null : c.id)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="5" r="1.8" />
                        <circle cx="12" cy="12" r="1.8" />
                        <circle cx="12" cy="19" r="1.8" />
                      </svg>
                    </button>
                    {actionsOpen ? (
                      <div className="company-actions-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          className="company-actions-edit"
                          onClick={() => void openUnitEditor(c)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4" />
                          </svg>
                          Gerenciar empresa, unidades e CNPJs
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="company-actions-delete"
                          onClick={() => {
                            setActionMenuId(null);
                            setEditingId(null);
                            setConfirmingId(c.id);
                            setDeleteErrors((current) => ({ ...current, [c.id]: "" }));
                          }}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
                          </svg>
                          Excluir empresa
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <Link href={`/dashboard/${c.id}/${firstAllowedTab(c.tabs)}`} className="company-card-main">
                  <div className="card-icon">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={meta?.icon || CARD_META.egaplast.icon} />
                    </svg>
                  </div>
                  <h2 className="card-title">{c.label}</h2>
                  <p className="card-desc">{c.desc || meta?.desc}</p>
                  <span className="card-access">
                    Acessar dashboard
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </span>
                </Link>
                {isAdmin ? (
                  editing ? (
                    <div className="company-unit-editor">
                      <div className="company-unit-editor-head">
                        <strong>Gerenciar empresa, unidades e CNPJs</strong>
                        <span>Somente administrador. O nome da empresa principal pode ser alterado; o CNPJ principal permanece protegido.</span>
                      </div>
                      {editLoadingId === c.id ? <div className="company-unit-status">Carregando unidades…</div> : null}
                      {!editLoadingId && editingUnits.filter((unit) => unit.key !== "todas").map((unit) => {
                        const isMain = unit.cnpj === c.cnpj;
                        const canEditName = Boolean(unit.cnpj);
                        const canEditUnit = canEditName && !isMain;
                        return (
                          <form
                            className="company-unit-card"
                            key={unit.key}
                            onSubmit={(event) => {
                              event.preventDefault();
                              if (isMain) void saveCompanyName(c, unit);
                              else if (canEditUnit) void saveUnit(c, unit);
                            }}
                          >
                            <div className="company-unit-field">
                              <label htmlFor={`unit-name-${c.id}-${unit.key}`}>{isMain ? "Empresa principal" : "Nome da unidade"}</label>
                              <input
                                id={`unit-name-${c.id}-${unit.key}`}
                                value={unit.label}
                                disabled={!canEditName || Boolean(editSavingKey)}
                                required={canEditName}
                                minLength={2}
                                maxLength={isMain ? 120 : 80}
                                onChange={(event) => updateUnitDraft(unit.key, { label: event.target.value })}
                              />
                            </div>
                            <div className="company-unit-field">
                              <label htmlFor={`unit-cnpj-${c.id}-${unit.key}`}>CNPJ</label>
                              <input
                                id={`unit-cnpj-${c.id}-${unit.key}`}
                                value={unit.cnpj ? maskCnpj(unit.cnpj) : "Sem CNPJ cadastrado"}
                                disabled={!canEditUnit || Boolean(editSavingKey)}
                                required={canEditUnit}
                                inputMode="numeric"
                                onChange={(event) => updateUnitDraft(unit.key, { cnpj: digitsOnly(event.target.value) })}
                              />
                            </div>
                            {isMain ? (
                              <div className="company-unit-row-actions">
                                <button type="submit" className="btn-unit-save" disabled={Boolean(editSavingKey)}>
                                  {editSavingKey === unit.key ? "Salvando…" : "Salvar nome da empresa"}
                                </button>
                              </div>
                            ) : canEditUnit ? (
                              removingKey === unit.key ? (
                                <div className="company-unit-remove-confirm">
                                  <span>Remover esta unidade vazia?</span>
                                  <button type="button" className="btn-delete-cancel" onClick={() => setRemovingKey(null)}>Cancelar</button>
                                  <button type="button" className="btn-delete-confirm" disabled={editSavingKey === unit.key} onClick={() => void removeUnit(c, unit)}>
                                    {editSavingKey === unit.key ? "Removendo…" : "Confirmar"}
                                  </button>
                                </div>
                              ) : (
                                <div className="company-unit-row-actions">
                                  <button type="button" className="btn-unit-remove" disabled={Boolean(editSavingKey)} onClick={() => setRemovingKey(unit.key)}>Remover</button>
                                  <button type="submit" className="btn-unit-save" disabled={Boolean(editSavingKey)}>
                                    {editSavingKey === unit.key ? "Salvando…" : "Salvar unidade"}
                                  </button>
                                </div>
                              )
                            ) : null}
                          </form>
                        );
                      })}
                      {!editLoadingId ? (
                        <form
                          className="company-unit-card company-unit-new"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void addUnit(c);
                          }}
                        >
                          <strong>Adicionar outro CNPJ</strong>
                          <div className="company-unit-field">
                            <label htmlFor={`new-unit-name-${c.id}`}>Nome da unidade</label>
                            <input
                              id={`new-unit-name-${c.id}`}
                              required
                              minLength={2}
                              maxLength={80}
                              value={newUnit.label}
                              disabled={addingUnit}
                              placeholder="Ex.: Empresa ABC Goiânia"
                              onChange={(event) => setNewUnit((current) => ({ ...current, label: event.target.value }))}
                            />
                          </div>
                          <div className="company-unit-field">
                            <label htmlFor={`new-unit-cnpj-${c.id}`}>CNPJ</label>
                            <input
                              id={`new-unit-cnpj-${c.id}`}
                              required
                              inputMode="numeric"
                              value={newUnit.cnpj}
                              disabled={addingUnit}
                              placeholder="00.000.000/0000-00"
                              onChange={(event) => setNewUnit((current) => ({ ...current, cnpj: maskCnpj(event.target.value) }))}
                            />
                          </div>
                          <button type="submit" className="btn-unit-add" disabled={addingUnit}>
                            {addingUnit ? "Adicionando…" : "+ Adicionar unidade"}
                          </button>
                        </form>
                      ) : null}
                      {editError ? <div className="company-delete-error" role="alert">{editError}</div> : null}
                      {editSuccess ? <div className="company-unit-success" role="status">{editSuccess}</div> : null}
                      <div className="company-delete-actions">
                        <button
                          type="button"
                          className="btn-delete-cancel"
                          disabled={Boolean(editSavingKey) || addingUnit}
                          onClick={() => setEditingId(null)}
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  ) : confirming ? (
                    <div className="company-delete-confirm" aria-live="polite">
                      <p>Excluir <strong>{c.label}</strong> e todas as suas planilhas?</p>
                      <span>Esta ação não pode ser desfeita.</span>
                      {deleteErrors[c.id] ? <div className="company-delete-error" role="alert">{deleteErrors[c.id]}</div> : null}
                      <div className="company-delete-actions">
                        <button
                          type="button"
                          className="btn-delete-cancel"
                          disabled={Boolean(deletingId)}
                          onClick={() => setConfirmingId(null)}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="btn-delete-confirm"
                          disabled={Boolean(deletingId)}
                          onClick={() => deleteCompany(c)}
                        >
                          {deleting ? "Excluindo…" : "Confirmar exclusão"}
                        </button>
                      </div>
                    </div>
                  ) : null
                ) : null}
              </article>
            );
          })}
          {isAdmin ? (
            <>
              <Link href="/empresas/nova" className="dashboard-card card-new">
                <div className="card-icon">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h2 className="card-title">Nova empresa</h2>
                <p className="card-desc">Cadastre CNPJ e razão. A planilha já cai no dashboard certo.</p>
                <div className="card-arrow">Cadastrar</div>
              </Link>
              <Link href="/usuarios" className="dashboard-card card-new">
                <div className="card-icon">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h2 className="card-title">Usuários</h2>
                <p className="card-desc">Crie contas e escolha empresas e módulos que cada uma pode ver.</p>
                <div className="card-arrow">Gerenciar</div>
              </Link>
            </>
          ) : null}
        </div>
        <div className="selector-footer">© {new Date().getFullYear()} Êxito · Todos os direitos reservados</div>
      </div>
    </div>
  );
}
