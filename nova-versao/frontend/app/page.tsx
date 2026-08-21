"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import "./login.css";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: String(form.get("username") || ""),
          password: String(form.get("password") || ""),
        }),
      });
      router.push("/seletor");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="dot-pattern" aria-hidden="true" />
      <div className="login-wrap">
        <div className="login-card">
          <div className="logo-wrapper">
            <div className="brand-name">
              <span className="dark">Êx</span>
              <span className="green">i</span>
              <span className="dark">to</span>
            </div>
            <div className="brand-sub">Dashboards</div>
          </div>
          <div className="divider" />
          {error ? <div className="error-box" role="alert">{error}</div> : null}
          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-username">Usuário</label>
              <input id="login-username" name="username" className="form-input" required autoComplete="username" placeholder="admin" defaultValue="admin" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="login-password">Senha</label>
              <input id="login-password" name="password" type="password" className="form-input" required autoComplete="current-password" placeholder="1234" />
            </div>
            <p className="login-hint">Teste local: <strong>admin</strong> / <strong>1234</strong></p>
            <div className="form-group">
              <button type="submit" className="btn-login" disabled={loading}>
                {loading ? "Entrando…" : "Entrar"}
              </button>
            </div>
          </form>
        </div>
        <div className="login-footer">© {new Date().getFullYear()} Êxito · Todos os direitos reservados</div>
      </div>
    </div>
  );
}
