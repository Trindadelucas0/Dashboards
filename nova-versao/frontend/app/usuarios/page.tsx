"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { VIEWER_TAB_OPTIONS } from "@/lib/nav";
import "../login.css";
import "../empresas/nova/nova.css";
import "./novo/novo.css";

type Access = { companyId: string; tabs: string[] };
type UserRow = {
  id: number;
  username: string;
  isAdmin: boolean;
  companyIds: string[];
  access: Access[];
};
type Company = { id: string; label: string };

const TAB_LABEL: Record<string, string> = Object.fromEntries(
  VIEWER_TAB_OPTIONS.map((t) => [t.id, t.label]),
);

export default function UsuariosPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const me = await api<{ isAdmin?: boolean }>("/api/auth/me");
        if (!me.isAdmin) {
          router.replace("/seletor");
          return;
        }
        const [list, companies] = await Promise.all([
          api<UserRow[]>("/api/users"),
          api<Company[]>("/api/companies"),
        ]);
        setUsers(list);
        setLabels(Object.fromEntries(companies.map((c) => [c.id, c.label])));
        setReady(true);
      } catch {
        router.replace("/");
      }
    })();
  }, [router]);

  if (!ready) return null;

  return (
    <div className="users-page">
      <div className="users-wrap">
        <div className="users-card">
          <div className="users-head">
            <div>
              <h1>Usuários</h1>
              <p>Libere empresas e módulos por conta. Só o admin importa planilhas.</p>
            </div>
            <div className="users-actions">
              <Link href="/seletor" className="users-btn">Seletor</Link>
              <Link href="/usuarios/novo" className="users-btn primary">Novo usuário</Link>
            </div>
          </div>
          {users.length === 0 ? (
            <div className="users-empty">Nenhum usuário cadastrado.</div>
          ) : (
            <table className="users-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Acesso</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.username}</strong>
                      {u.isAdmin ? <div className="users-tabs-summary">Administrador</div> : null}
                    </td>
                    <td>
                      {u.isAdmin ? (
                        <span className="users-badge">Todas as empresas</span>
                      ) : u.access.length === 0 ? (
                        <span className="users-tabs-summary">Sem dashboards</span>
                      ) : (
                        u.access.map((a) => (
                          <div key={a.companyId} style={{ marginBottom: 6 }}>
                            <span className="users-badge">{labels[a.companyId] || a.companyId}</span>
                            <div className="users-tabs-summary">
                              {(a.tabs || []).map((t) => TAB_LABEL[t] || t).join(" · ") || "—"}
                            </div>
                          </div>
                        ))
                      )}
                    </td>
                    <td>
                      {!u.isAdmin ? (
                        <Link href={`/usuarios/${u.id}`} className="users-btn">Editar</Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
