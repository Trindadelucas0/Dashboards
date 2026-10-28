"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { CARD_META, firstAllowedTab } from "@/lib/nav";
import "../selector.css";

type Company = { id: string; label: string; desc: string; tabs?: string[] };

export default function SeletorPage() {
  const router = useRouter();
  const [username, setUsername] = useState("Usuário");
  const [isAdmin, setIsAdmin] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});

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
            const confirming = confirmingId === c.id;
            const deleting = deletingId === c.id;
            return (
              <article key={c.id} className="dashboard-card company-card">
                <Link href={`/dashboard/${c.id}/${firstAllowedTab(c.tabs)}`} className="company-card-main">
                  <div className="card-icon">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={meta?.icon || CARD_META.egaplast.icon} />
                    </svg>
                  </div>
                  <h2 className="card-title">{c.label}</h2>
                  <p className="card-desc">{c.desc || meta?.desc}</p>
                  <div className="card-arrow">Acessar</div>
                </Link>
                {isAdmin ? (
                  confirming ? (
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
                  ) : (
                    <button
                      type="button"
                      className="btn-delete-company"
                      disabled={Boolean(deletingId)}
                      onClick={() => {
                        setConfirmingId(c.id);
                        setDeleteErrors((current) => ({ ...current, [c.id]: "" }));
                      }}
                    >
                      Excluir empresa
                    </button>
                  )
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
