"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DashContext, type CompanyDetail, type DashCtx } from "@/components/DashContext";
import { api } from "@/lib/api";
import { firstAllowedTab, NAV } from "@/lib/nav";
import "../../dashboard.css";

const TITLES: Record<string, [string, string]> = {
  "visao-geral": ["Visão Geral", "Resumo Executivo"],
  compras: ["Compras", "Aquisições"],
  finalidade: ["Finalidade de Compras", "Por CFOP"],
  vendas: ["Vendas", "Saídas por cliente"],
  impostos: ["Impostos", "Apuração"],
  memoria: ["Memória de Cálculo", "ICMS 5005 + PIS/COFINS"],
  recebimentos: ["Recebimentos/Pagamentos", "Estimativa pelo movimento"],
  balancete: ["Balancete", "Contábil"],
  dre: ["DRE", "Demonstração do resultado"],
  indicadores: ["Indicadores", "Margens e giro"],
  importar: ["Importar planilhas", "Classifica e grava no mês certo"],
};

export default function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const params = useParams<{ empresa: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const empresa = params.empresa;
  const aba = pathname.split("/").pop() || "visao-geral";
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [month, setMonthState] = useState("");
  const [unidade, setUnidadeState] = useState("");

  useEffect(() => {
    api<{ isAdmin?: boolean }>("/api/auth/me")
      .then((me) => {
        setIsAdmin(Boolean(me.isAdmin));
        setAuthReady(true);
      })
      .catch(() => {
        setIsAdmin(false);
        setAuthReady(true);
      });
  }, []);

  useEffect(() => {
    api<CompanyDetail>(`/api/companies/${empresa}`)
      .then((c) => {
        setCompany(c);
        const qMes = search.get("mes") || "";
        const qUn = search.get("unidade") || "";
        const units = c.units || [];
        const months = c.months || [];
        const un = qUn && units.includes(qUn) ? qUn : units[0] || "matriz";
        const monthsUn = months.filter((m) => m.unidade === un);
        const last = monthsUn.at(-1) || months.at(-1);
        const isTrimKey = /^q[1-4]-\d{4}$/i.test(qMes);
        const trimOk =
          isTrimKey &&
          monthsUn.some((m) => {
            const mm = Number(String(m.competencia).split("-")[1] || 0);
            const q = Math.floor((mm - 1) / 3) + 1;
            const year = String(m.competencia).slice(0, 4);
            return `q${q}-${year}`.toLowerCase() === qMes.toLowerCase();
          });
        const mes =
          trimOk
            ? qMes.toLowerCase()
            : qMes && months.some((m) => m.competencia === qMes && (!un || m.unidade === un))
              ? qMes
              : last?.competencia || "";
        setUnidadeState(un);
        if (mes) setMonthState(mes);
      })
      .catch(() => setCompany(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reidrata só na troca de empresa
  }, [empresa]);

  useEffect(() => {
    if (!authReady || !company) return;
    const allowed = (company.tabs || []).filter((id) => isAdmin || id !== "importar");
    if (!allowed.length) return;
    if (allowed.includes(aba)) return;
    const fallback = firstAllowedTab(allowed);
    const q = new URLSearchParams();
    if (month) q.set("mes", month);
    if (unidade) q.set("unidade", unidade);
    const qs = q.toString();
    router.replace(`/dashboard/${empresa}/${fallback}${qs ? `?${qs}` : ""}`);
  }, [aba, authReady, company, empresa, isAdmin, month, router, unidade]);

  async function reloadCompany() {
    try {
      const c = await api<CompanyDetail>(`/api/companies/${empresa}`);
      setCompany(c);
      return c;
    } catch {
      return null;
    }
  }

  function pushQuery(nextMes: string, nextUn: string) {
    const q = new URLSearchParams();
    if (nextMes) q.set("mes", nextMes);
    if (nextUn) q.set("unidade", nextUn);
    router.replace(`${pathname}?${q.toString()}`);
  }

  const tabs = (company?.tabs || NAV.flatMap((s) => s.items.map((i) => i.id))).filter(
    (id) => isAdmin || id !== "importar",
  );
  const [title, sub] = TITLES[aba] || [aba, ""];
  const months = useMemo(() => {
    if (!company) return [];
    return company.months.filter((m) => !unidade || m.unidade === unidade);
  }, [company, unidade]);

  const ctx: DashCtx = {
    company,
    month,
    unidade,
    setMonth: (m) => {
      setMonthState(m);
      pushQuery(m, unidade);
    },
    setUnidade: (u) => {
      setUnidadeState(u);
      pushQuery(month, u);
    },
    goToSlot: (mes, un) => {
      setMonthState(mes);
      setUnidadeState(un);
      pushQuery(mes, un);
    },
    reloadCompany,
  };

  return (
    <DashContext.Provider value={ctx}>
      <div className={`dash-root ${company?.theme === "blue" ? "theme-blue" : ""}`}>
        <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mob-open" : ""}`}>
          <div className="sidebar-logo">
            <div className="logo-icon"><i className="fas fa-chart-pie" /></div>
            <div className="logo-text">
              <div className="company">{company?.label || "Dashboard"}</div>
              <div className="subtitle">Êxito · Nova versão</div>
            </div>
          </div>
          <nav className="sidebar-nav">
            {NAV.map((sec) => {
              const items = sec.items.filter((i) => tabs.includes(i.id));
              if (!items.length) return null;
              return (
                <div key={sec.section}>
                  <div className="sec-label">{sec.section}</div>
                  {items.map((item) => (
                    <Link
                      key={item.id}
                      href={`/dashboard/${empresa}/${item.id}?mes=${month}&unidade=${unidade}`}
                      className={`nav-item ${aba === item.id ? "active" : ""}`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <div className="nav-ico"><i className={`fas ${item.icon}`} /></div>
                      <span className="nav-label">{item.label}</span>
                    </Link>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="sidebar-foot">
            <div className="sidebar-foot-info">
              <div className="lbl">Competência</div>
              <div className="val">{/^q[1-4]-\d{4}$/i.test(month) ? `${month.slice(1, 2)}º Trim ${month.slice(3)}` : (month || "—")}</div>
            </div>
          </div>
        </aside>
        <div className="overlay" onClick={() => setMobileOpen(false)} />
        <div className={`main-wrapper ${collapsed ? "sb-collapsed" : ""}`}>
          <header className="top-header">
            <button type="button" className="btn-toggle" onClick={() => {
              if (window.innerWidth < 768) setMobileOpen((v) => !v);
              else setCollapsed((v) => !v);
            }} aria-label="Menu">
              <i className="fas fa-bars" />
            </button>
            <div className="header-title">
              {title} <span>{sub}{month ? ` – ${/^q[1-4]-\d{4}$/i.test(month) ? `${month.slice(1, 2)}º Trimestre ${month.slice(3)}` : month}` : ""}</span>
            </div>
            <div className="header-actions">
              <Link href="/seletor" className="btn-export">Voltar</Link>
              {company && company.units.length > 1 ? (
                <select className="period-sel" value={unidade} onChange={(e) => ctx.setUnidade(e.target.value)} aria-label="Unidade">
                  {company.units.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              ) : null}
              <select className="period-sel" value={month} onChange={(e) => ctx.setMonth(e.target.value)} aria-label="Período">
                {(() => {
                  const qs = new Map<string, string>();
                  for (const m of months) {
                    const mm = Number(String(m.competencia).split("-")[1] || 0);
                    const q = Math.floor((mm - 1) / 3) + 1;
                    const year = String(m.competencia).slice(0, 4);
                    const k = `q${q}-${year}`;
                    if (!qs.has(k)) qs.set(k, `${q}º Trimestre ${year}`);
                  }
                  return (
                    <>
                      {Array.from(qs.entries()).map(([k, lbl]) => (
                        <option key={k} value={k}>{lbl}</option>
                      ))}
                      {months.map((m) => <option key={m.competencia} value={m.competencia}>{m.label}</option>)}
                    </>
                  );
                })()}
              </select>
              <div className="regime-badge">Nova versão</div>
            </div>
          </header>
          <main className="content">{children}</main>
        </div>
      </div>
    </DashContext.Provider>
  );
}
