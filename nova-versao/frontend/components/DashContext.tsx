"use client";

import { createContext, useContext } from "react";

export type CompanyDetail = {
  id: string;
  label: string;
  theme: string;
  cnpj: string;
  tabs: string[];
  units: string[];
  months: { competencia: string; label: string; unidade: string }[];
};

export type DashCtx = {
  company: CompanyDetail | null;
  month: string;
  unidade: string;
  setMonth: (m: string) => void;
  setUnidade: (u: string) => void;
  goToSlot: (mes: string, un: string) => void;
  reloadCompany: () => Promise<CompanyDetail | null>;
};

export const DashContext = createContext<DashCtx | null>(null);

export function useDash() {
  const ctx = useContext(DashContext);
  if (!ctx) throw new Error("useDash precisa do layout do dashboard");
  return ctx;
}
