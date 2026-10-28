"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import "../../login.css";
import "./nova.css";

function digitsOnly(value: string) {
  return value.replace(/\D/g, "").slice(0, 14);
}

function formatCnpj(value: string) {
  const d = digitsOnly(value);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

type ExtraUnit = { id: string; label: string; cnpj: string };

function newExtraUnit(): ExtraUnit {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, label: "", cnpj: "" };
}

export default function NovaEmpresaPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cnpj, setCnpj] = useState("");
  const [extraUnits, setExtraUnits] = useState<ExtraUnit[]>([]);
  const [theme, setTheme] = useState("green");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await api<{ isAdmin?: boolean }>("/api/auth/me");
        if (!me.isAdmin) {
          router.replace("/seletor");
          return;
        }
        setReady(true);
      } catch {
        router.replace("/");
      }
    })();
  }, [router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const companyLabel = String(form.get("label") || "").trim();
      const normalizedLabels = [companyLabel, ...extraUnits.map((unit) => unit.label.trim())].map((value) => value.toLocaleLowerCase("pt-BR"));
      const normalizedCnpjs = [digitsOnly(cnpj), ...extraUnits.map((unit) => digitsOnly(unit.cnpj))];
      if (new Set(normalizedLabels).size !== normalizedLabels.length) {
        throw new Error("Cada unidade deve ter um nome diferente.");
      }
      if (new Set(normalizedCnpjs).size !== normalizedCnpjs.length) {
        throw new Error("Cada unidade deve ter um CNPJ diferente.");
      }
      const created = await api<{ id: string }>("/api/companies", {
        method: "POST",
        body: JSON.stringify({
          label: companyLabel,
          cnpj: digitsOnly(cnpj),
          razao: String(form.get("razao") || ""),
          description: String(form.get("description") || ""),
          theme,
          units: extraUnits.map((unit) => ({
            label: unit.label.trim(),
            cnpj: digitsOnly(unit.cnpj),
          })),
        }),
      });
      router.push(`/dashboard/${created.id}/importar`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível cadastrar");
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
            <div className="brand-sub">Nova empresa</div>
          </div>
          <div className="divider" />
          <p className="nova-lead">
            Informe o nome, o CNPJ e a razão como na planilha EXITO. Na hora de importar, o sistema já identifica e converte sozinho.
          </p>
          {error ? <div className="error-box" role="alert">{error}</div> : null}
          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="label">Nome no seletor</label>
              <input id="label" name="label" className="form-input" required minLength={2} placeholder="Ex.: Metalúrgica Silva" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cnpj">CNPJ da matriz</label>
              <input
                id="cnpj"
                name="cnpj"
                className="form-input"
                required
                inputMode="numeric"
                autoComplete="off"
                placeholder="00.000.000/0000-00"
                value={cnpj}
                onChange={(ev) => setCnpj(formatCnpj(ev.target.value))}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="razao">Razão social (como na planilha)</label>
              <input id="razao" name="razao" className="form-input" placeholder="Ex.: SILVA METAIS LTDA" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="description">Descrição no card</label>
              <input id="description" name="description" className="form-input" placeholder="Ex.: Indústria — tributário e gerencial" />
            </div>
            <div className="form-group unit-group">
              <div className="unit-heading">
                <div>
                  <span className="form-label">Outros CNPJs</span>
                  <span className="unit-help">Dê um nome claro para cada unidade ou empresa do mesmo dashboard.</span>
                </div>
                <button
                  type="button"
                  className="btn-add-unit"
                  onClick={() => setExtraUnits((current) => [...current, newExtraUnit()])}
                >
                  + Adicionar outro CNPJ
                </button>
              </div>
              {extraUnits.length ? (
                <div className="unit-list">
                  {extraUnits.map((unit, index) => (
                    <div className="unit-row" key={unit.id}>
                      <div className="unit-fields">
                        <div>
                          <label className="form-label" htmlFor={`unit-label-${unit.id}`}>Nome da unidade</label>
                          <input
                            id={`unit-label-${unit.id}`}
                            className="form-input"
                            required
                            minLength={2}
                            maxLength={80}
                            placeholder="Ex.: Empresa ABC Goiânia"
                            value={unit.label}
                            onChange={(event) => setExtraUnits((current) => current.map((item) => item.id === unit.id ? { ...item, label: event.target.value } : item))}
                          />
                        </div>
                        <div>
                          <label className="form-label" htmlFor={`unit-cnpj-${unit.id}`}>CNPJ</label>
                          <input
                            id={`unit-cnpj-${unit.id}`}
                            className="form-input"
                            required
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="00.000.000/0000-00"
                            value={unit.cnpj}
                            onChange={(event) => setExtraUnits((current) => current.map((item) => item.id === unit.id ? { ...item, cnpj: formatCnpj(event.target.value) } : item))}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-remove-unit"
                        aria-label={`Remover ${unit.label || `unidade ${index + 1}`}`}
                        onClick={() => setExtraUnits((current) => current.filter((item) => item.id !== unit.id))}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="unit-empty">Nenhum CNPJ adicional. Você pode cadastrar somente a empresa principal.</div>
              )}
            </div>
            <div className="form-group">
              <span className="form-label">Tema do dashboard</span>
              <div className="theme-row">
                <button type="button" className={`theme-chip ${theme === "green" ? "on" : ""}`} onClick={() => setTheme("green")}>Verde</button>
                <button type="button" className={`theme-chip blue ${theme === "blue" ? "on" : ""}`} onClick={() => setTheme("blue")}>Azul</button>
              </div>
            </div>
            <div className="form-group">
              <button type="submit" className="btn-login" disabled={loading}>
                {loading ? "Salvando…" : "Criar e ir para importar"}
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
