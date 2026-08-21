"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { CARD_META } from "@/lib/nav";
import "../selector.css";

type Company = { id: string; label: string; desc: string };

export default function SeletorPage() {
  const router = useRouter();
  const [username, setUsername] = useState("Usuário");
  const [isAdmin, setIsAdmin] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState("");

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
            return (
              <Link key={c.id} href={`/dashboard/${c.id}/visao-geral`} className="dashboard-card">
                <div className="card-icon">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={meta?.icon || CARD_META.egaplast.icon} />
                  </svg>
                </div>
                <h2 className="card-title">{c.label}</h2>
                <p className="card-desc">{c.desc || meta?.desc}</p>
                <div className="card-arrow">Acessar</div>
              </Link>
            );
          })}
          {isAdmin ? (
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
          ) : null}
        </div>
        <div className="selector-footer">© {new Date().getFullYear()} Êxito · Todos os direitos reservados</div>
      </div>
    </div>
  );
}
