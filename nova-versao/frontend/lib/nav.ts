export const CARD_META: Record<string, { desc: string; icon: string }> = {
  egaplast: {
    desc: "Artefatos e comércio de plásticos",
    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  },
  jpg: {
    desc: "JPG Produtos Funcionais — sede e filiais",
    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  },
  schumacher: {
    desc: "Indústria Schumacher — Matriz e Schumacher Serviços",
    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  },
};

export const NAV = [
  { section: "Principal", items: [{ id: "visao-geral", label: "Visão Geral", icon: "fa-gauge-high" }] },
  {
    section: "Movimentação",
    items: [
      { id: "compras", label: "Compras", icon: "fa-cart-shopping" },
      { id: "finalidade", label: "Finalidade de Compras", icon: "fa-tags" },
      { id: "vendas", label: "Vendas", icon: "fa-store" },
    ],
  },
  {
    section: "Vendas",
    items: [
      { id: "margens-mes", label: "Margens por mês", icon: "fa-calendar-days" },
      { id: "margens-cidade", label: "Margens por cidade", icon: "fa-city" },
      { id: "vendas-produto", label: "Vendas por produto", icon: "fa-boxes-stacked" },
    ],
  },
  {
    section: "Tributário",
    items: [
      { id: "impostos", label: "Impostos", icon: "fa-file-invoice-dollar" },
      { id: "memoria", label: "Memória de Cálculo", icon: "fa-calculator" },
    ],
  },
  {
    section: "Financeiro",
    items: [
      { id: "recebimentos", label: "Recebimentos/Pagamentos", icon: "fa-money-bill-transfer" },
      { id: "balancete", label: "Balancete", icon: "fa-scale-balanced" },
      { id: "dre", label: "DRE", icon: "fa-chart-line" },
      { id: "indicadores", label: "Indicadores", icon: "fa-circle-nodes" },
    ],
  },
  { section: "Dados", items: [{ id: "importar", label: "Importar planilhas", icon: "fa-file-arrow-up" }] },
];

export type NavSection = (typeof NAV)[number];
export type NavItem = NavSection["items"][number];

const INDICADORES_NAV_ITEM: NavItem = {
  id: "indicadores",
  label: "Indicadores",
  icon: "fa-circle-nodes",
};

/** Schumacher: Indicadores fora de Financeiro, em seção própria. Demais empresas: NAV padrão. */
export function navSectionsForCompany(companyId: string): NavSection[] {
  if (companyId !== "schumacher") return NAV;

  const out: NavSection[] = [];
  for (const sec of NAV) {
    if (sec.section === "Financeiro") {
      out.push({
        section: sec.section,
        items: sec.items.filter((i) => i.id !== "indicadores"),
      });
      out.push({ section: "Indicadores", items: [INDICADORES_NAV_ITEM] });
      continue;
    }
    out.push(sec);
  }
  return out;
}

/** Abas liberáveis para viewer (nunca inclui importar). */
export const VIEWER_TAB_OPTIONS = NAV.flatMap((s) => s.items).filter((i) => i.id !== "importar");

export const ALL_VIEWER_TAB_IDS = VIEWER_TAB_OPTIONS.map((i) => i.id);

export function firstAllowedTab(tabs: string[] | undefined | null): string {
  if (!tabs?.length) return "visao-geral";
  for (const opt of VIEWER_TAB_OPTIONS) {
    if (tabs.includes(opt.id)) return opt.id;
  }
  return tabs[0] || "visao-geral";
}
