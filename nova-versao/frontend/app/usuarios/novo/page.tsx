"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import UserAccessPicker, {
  AccessMap,
  buildAccessPayload,
  type CompanyOption,
} from "@/components/UserAccessPicker";
import "../../login.css";
import "../../empresas/nova/nova.css";
import "./novo.css";

export default function NovoUsuarioPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [access, setAccess] = useState<AccessMap>({});

  useEffect(() => {
    (async () => {
      try {
        const me = await api<{ isAdmin?: boolean }>("/api/auth/me");
        if (!me.isAdmin) {
          router.replace("/seletor");
          return;
        }
        const list = await api<CompanyOption[]>("/api/companies");
        setCompanies(list);
        setReady(true);
      } catch {
        router.replace("/");
      }
    })();
  }, [router]);

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
    const payload = buildAccessPayload(access);
    if (payload.length === 0) {
      setError("Selecione pelo menos um dashboard");
      return;
    }
    if (payload.some((a) => a.tabs.length === 0)) {
      setError("Cada empresa liberada precisa de pelo menos uma aba");
      return;
    }
    setLoading(true);
    try {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify({
          username,
          password,
          access: payload,
        }),
      });
      router.push("/usuarios");
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
        <div className="login-card nova-card nova-card-wide">
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
            Escolha as empresas e, em cada uma, quais módulos a conta pode ver. Não poderá importar planilhas.
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
              <span className="form-label">Empresas e módulos</span>
              <UserAccessPicker companies={companies} access={access} onChange={setAccess} />
            </div>
            <div className="form-group">
              <button type="submit" className="btn-login" disabled={loading || companies.length === 0}>
                {loading ? "Salvando…" : "Criar usuário"}
              </button>
            </div>
          </form>
          <Link href="/usuarios" className="nova-back">Voltar à lista</Link>
        </div>
        <div className="login-footer">© {new Date().getFullYear()} Êxito · Todos os direitos reservados</div>
      </div>
    </div>
  );
}
