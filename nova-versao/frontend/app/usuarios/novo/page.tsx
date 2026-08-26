"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import "../../login.css";
import "../../empresas/nova/nova.css";
import "./novo.css";

type Company = { id: string; label: string };

export default function NovoUsuarioPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const me = await api<{ isAdmin?: boolean }>("/api/auth/me");
        if (!me.isAdmin) {
          router.replace("/seletor");
          return;
        }
        const list = await api<Company[]>("/api/companies");
        setCompanies(list);
        setReady(true);
      } catch {
        router.replace("/");
      }
    })();
  }, [router]);

  function toggleCompany(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const username = String(form.get("username") || "").trim();
    const password = String(form.get("password") || "");
    const password2 = String(form.get("password2") || "");
    if (password !== password2) {
      setError("As senhas não coincidem");
      return;
    }
    if (selected.length === 0) {
      setError("Selecione pelo menos um dashboard");
      return;
    }
    setLoading(true);
    try {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify({
          username,
          password,
          companyIds: selected,
        }),
      });
      router.push("/seletor");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar o usuário");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="login-page">
      <div className="dot-pattern" aria-hidden="true" />
      <div className="login-wrap nova-wrap">
        <div className="login-card nova-card">
          <div className="logo-wrapper">
            <div className="brand-name">
              <span className="dark">Êx</span>
              <span className="green">i</span>
              <span className="dark">to</span>
            </div>
            <div className="brand-sub">Novo usuário</div>
          </div>
          <div className="divider" />
          <p className="nova-lead">
            Cria uma conta só para visualizar os dashboards escolhidos. Não poderá importar planilhas.
          </p>
          {error ? <div className="error-box" role="alert">{error}</div> : null}
          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="username">Usuário</label>
              <input id="username" name="username" className="form-input" required minLength={2} autoComplete="off" placeholder="Ex.: cliente.egaplast" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="password">Senha</label>
              <input id="password" name="password" type="password" className="form-input" required minLength={4} autoComplete="new-password" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="password2">Confirmar senha</label>
              <input id="password2" name="password2" type="password" className="form-input" required minLength={4} autoComplete="new-password" />
            </div>
            <div className="form-group">
              <span className="form-label">Dashboards permitidos</span>
              {companies.length === 0 ? (
                <p className="company-empty">Nenhuma empresa cadastrada ainda.</p>
              ) : (
                <div className="company-checks" role="group" aria-label="Empresas">
                  {companies.map((c) => (
                    <label key={c.id} className={`company-check ${selected.includes(c.id) ? "on" : ""}`}>
                      <input
                        type="checkbox"
                        checked={selected.includes(c.id)}
                        onChange={() => toggleCompany(c.id)}
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="form-group">
              <button type="submit" className="btn-login" disabled={loading || companies.length === 0}>
                {loading ? "Salvando…" : "Criar usuário"}
              </button>
            </div>
          </form>
          <Link href="/seletor" className="nova-back">Voltar ao seletor</Link>
        </div>
        <div className="login-footer">© {new Date().getFullYear()} Êxito · Todos os direitos reservados</div>
      </div>
    </div>
  );
}
