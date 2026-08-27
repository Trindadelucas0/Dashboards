"use client";

import { ALL_VIEWER_TAB_IDS, VIEWER_TAB_OPTIONS } from "@/lib/nav";

export type CompanyOption = { id: string; label: string };
export type AccessMap = Record<string, string[]>;

type Props = {
  companies: CompanyOption[];
  access: AccessMap;
  onChange: (next: AccessMap) => void;
};

export function buildAccessPayload(access: AccessMap): { companyId: string; tabs: string[] }[] {
  return Object.entries(access)
    .filter(([, tabs]) => tabs.length > 0)
    .map(([companyId, tabs]) => ({ companyId, tabs }));
}

export function accessFromApi(
  items: { companyId: string; tabs: string[] }[] | undefined,
): AccessMap {
  const out: AccessMap = {};
  for (const item of items || []) {
    out[item.companyId] = (item.tabs || []).filter((t) => ALL_VIEWER_TAB_IDS.includes(t));
  }
  return out;
}

export default function UserAccessPicker({ companies, access, onChange }: Props) {
  function toggleCompany(id: string) {
    const next = { ...access };
    if (next[id]) {
      delete next[id];
    } else {
      next[id] = [...ALL_VIEWER_TAB_IDS];
    }
    onChange(next);
  }

  function toggleTab(companyId: string, tabId: string) {
    const current = access[companyId];
    if (!current) return;
    const has = current.includes(tabId);
    const tabs = has ? current.filter((t) => t !== tabId) : [...current, tabId];
    onChange({ ...access, [companyId]: tabs });
  }

  if (companies.length === 0) {
    return <p className="company-empty">Nenhuma empresa cadastrada ainda.</p>;
  }

  return (
    <div className="company-checks" role="group" aria-label="Empresas e módulos">
      {companies.map((c) => {
        const on = Boolean(access[c.id]);
        const tabs = access[c.id] || [];
        return (
          <div key={c.id} className={`company-block ${on ? "on" : ""}`}>
            <label className={`company-check ${on ? "on" : ""}`}>
              <input type="checkbox" checked={on} onChange={() => toggleCompany(c.id)} />
              <span>{c.label}</span>
            </label>
            {on ? (
              <div className="tab-checks" role="group" aria-label={`Módulos de ${c.label}`}>
                {VIEWER_TAB_OPTIONS.map((tab) => (
                  <label key={tab.id} className={`tab-check ${tabs.includes(tab.id) ? "on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={tabs.includes(tab.id)}
                      onChange={() => toggleTab(c.id, tab.id)}
                    />
                    <span>{tab.label}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
