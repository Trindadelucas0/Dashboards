"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import UserAccessPicker, {
  AccessMap,
  accessFromApi,
  buildAccessPayload,
  type CompanyOption,
} from "@/components/UserAccessPicker";
import "../../login.css";
import "../../empresas/nova/nova.css";
import "../novo/novo.css";

type UserDetail = {
  id: number;
  username: string;
  isAdmin: boolean;
  access: { companyId: string; tabs: string[] }[];
};

export default function EditarUsuarioPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = Number(params.id);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [access, setAccess] = useState<AccessMap>({});

  useEffect(() => {
    if (!Number.isFinite(userId) || userId <= 0) {
      router.replace("/usuarios");
      return;
    }
    (async () => {
      try {
        const me = await api<{ isAdmin?: boolean }>("/api/auth/me");
        if (!me.isAdmin) {
          router.replace("/seletor");
          return;
        }
        const [detail, list] = await Promise.all([
          api<UserDetail>(`/api/users/${userId}`),
          api<CompanyOption[]>("/api/companies"),
        ]);
        setUsername(detail.username);
        setIsAdmin(detail.isAdmin);
        setAccess(accessFromApi(detail.access));
        setCompanies(list);
        setReady(true);
      } catch {
        router.replace("/usuarios");
      }
    })();
  }, [router, userId]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") || "");
    const password2 = String(form.get("password2") || "");
    if (password || password2) {
      if (password !== password2) {
        setError("As senhas não coincidem");
        return;
      }
      if (password.length < 4) {
        setError("Senha deve ter pelo menos 4 caracteres");
        return;
      }
    }

    const body: { password?: string; access?: { companyId: string; tabs: string[] }[] } = {};
    if (password) body.password = password;

    if (!isAdmin) {
      const payload = buildAccessPayload(access);
      if (payload.length === 0) {
        setError("Selecione pelo menos um dashboard");
        return;
      }
      if (payload.some((a) => a.tabs.length === 0)) {
        setError("Cada empresa liberada precisa de pelo menos uma aba");
        return;
      }
      body.access = payload;
    }

    if (!body.password && !body.access) {
      setError("Nada para atualizar");
      return;
    }

    setLoading(true);
    try {
      await api(`/api/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      router.push("/usuarios");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar");
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
            <div className="brand-sub">Editar usuário</div>
          </div>
          <div className="divider" />
          <p className="nova-lead">
            Conta <strong>{username}</strong>
            {isAdmin ? " (administrador — só troca de senha)." : ". Ajuste empresas, módulos ou senha."}
          </p>
          {error ? <div className="error-box" role="alert">{error}</div> : null}
          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="password">Nova senha (opcional)</label>
              <input id="password" name="password" type="password" className="form-input" minLength={4} autoComplete="new-password" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="password2">Confirmar nova senha</label>
              <input id="password2" name="password2" type="password" className="form-input" minLength={4} autoComplete="new-password" />
            </div>
            {!isAdmin ? (
              <div className="form-group">
                <span className="form-label">Empresas e módulos</span>
                <UserAccessPicker companies={companies} access={access} onChange={setAccess} />
              </div>
            ) : null}
            <div className="form-group">
              <button type="submit" className="btn-login" disabled={loading}>
                {loading ? "Salvando…" : "Salvar"}
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
