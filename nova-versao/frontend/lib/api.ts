export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const msg = typeof data.detail === "string" ? data.detail : "Não autenticado";
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.href = "/";
    }
    throw new Error(msg);
  }
  if (!res.ok) {
    const detail = data.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((item: { msg?: string } | string) => (typeof item === "string" ? item : item?.msg || "")).filter(Boolean).join("; ")
          : data.message || "Erro na API";
    throw new Error(message);
  }
  return data as T;
}

export function brl(n: number | null | undefined) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Formato compacto do legado: R$ 1,13M / R$ 716K / BRL completo. */
export function brlCompact(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  const abs = Math.abs(v);
  if (abs >= 1e6) return `R$ ${(v / 1e6).toFixed(2).replace(".", ",")}M`;
  if (abs >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
  return brl(v);
}

export function pct(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export function formatCnpj(digits: string) {
  const d = (digits || "").replace(/\D/g, "");
  if (d.length !== 14) return digits || "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
