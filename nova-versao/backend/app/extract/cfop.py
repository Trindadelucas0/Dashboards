from __future__ import annotations

CFOP_INFO: dict[str, tuple[str, str]] = {
    "1-102": ("Compra para comercialização", "Revenda"),
    "2-102": ("Compra p/ comercialização interestadual", "Revenda"),
    "1-403": ("Compra p/ comercialização com ST", "Revenda c/ ST"),
    "2-403": ("Compra p/ comercialização com ST (inter)", "Revenda c/ ST"),
    "1-407": ("Compra para uso ou consumo com ST", "Uso e consumo"),
    "1-551": ("Compra de bem para o ativo imobilizado", "Ativo Imobilizado"),
    "2-551": ("Compra de bem p/ ativo (interestadual)", "Ativo Imobilizado"),
    "1-556": ("Compra de material para uso ou consumo", "Uso e consumo"),
    "1-202": ("Devolução de venda", "Devolução Venda"),
    "2-202": ("Devolução de venda interestadual", "Devolução Venda"),
    "1-411": ("Devolução de venda com ST", "Devolução Venda"),
    "2-411": ("Devolução de venda com ST (inter)", "Devolução Venda"),
    "5-102": ("Venda de mercadoria adquirida de terceiros", "Venda"),
    "6-102": ("Venda interestadual de mercadoria", "Venda"),
    "5-405": ("Venda com ST", "Venda c/ ST"),
    "6-404": ("Venda interestadual com ST", "Venda c/ ST"),
    "5-202": ("Devolução de compra", "Devol. Compra"),
    "6-202": ("Devolução de compra interestadual", "Devol. Compra"),
}

# Código SINIEF (A.BCD) → rótulo completo do grupo (legado egaplast.grupoCores).
SINIEF_GRUPOS: dict[str, str] = {
    "1.100": "1.100 Compras para industrialização, produção rural, comercialização ou prestações de serviços",
    "1.150": "1.150 Transferências para industrialização, produção rural, comercialização ou prestações de serviços",
    "1.200": "1.200 Devoluções de Vendas de Produção Própria, de Terceiros ou Anulações de Valores",
    "1.250": "1.250 Compras de Energia Elétrica",
    "1.300": "1.300 Aquisições de Serviços de Comunicação",
    "1.350": "1.350 Aquisições de serviços de transporte",
    "1.400": "1.400 Entradas sujeitas ao regime de ST",
    "1.450": "1.450 Sistemas de Integração e Parceria Rural",
    "1.500": "1.500 Entradas de Mercadorias Remetidas para Formação de Lote ou com Fim Específico de Exportação e Eventuais Devoluções",
    "1.550": "1.550 Operações com Bens do Ativo Imobilizado e Materiais para Uso ou Consumo",
    "1.600": "1.600 Lançamentos de Créditos e Ressarcimentos de Icms",
    "1.650": "1.650 Entradas de Combustíveis, Derivados ou Não de Petróleo, e Lubrificantes",
    "1.900": "1.900 Outras Entradas de Mercadorias ou Aquisições de Serviços",
    "2.100": "2.100 Compras para industrialização, produção rural, comercialização ou prestações de serviços",
    "2.150": "2.150 Transferências para industrialização, produção rural, comercialização ou prestações de serviços",
    "2.200": "2.200 Devoluções de Vendas de Produção Própria, de Terceiros ou Anulações de Valores",
    "2.250": "2.250 Compras de Energia Elétrica",
    "2.300": "2.300 Aquisições de Serviços de Comunicação",
    "2.350": "2.350 Aquisições de serviços de transporte",
    "2.400": "2.400 Entradas sujeitas ao regime de ST",
    "2.450": "2.450 Sistemas de Integração e Parceria Rural",
    "2.500": "2.500 Entradas de Mercadorias Remetidas para Formação de Lote ou com Fim Específico de Exportação e Eventuais Devoluções",
    "2.550": "2.550 Operações com Bens do Ativo Imobilizado e Materiais para Uso ou Consumo",
    "2.600": "2.600 Lançamentos de Créditos e Ressarcimentos de Icms",
    "2.650": "2.650 Entradas de Combustíveis, Derivados ou Não de Petróleo, e Lubrificantes",
    "2.900": "2.900 Outras Entradas de Mercadorias ou Aquisições de Serviços",
    "3.100": "3.100 Compras para Industrialização, Produção Rural, Comercialização ou Prestações de Serviços",
    "3.200": "3.200 Devoluções de Vendas de Produção Própria, de Terceiros ou Anulações de Valores",
    "3.250": "3.250 Compras de Energia Elétrica",
    "3.300": "3.300 Aquisições de Serviços de Comunicação",
    "3.350": "3.350 Aquisições de Serviços de Transporte",
    "3.500": "3.500 Entradas de Mercadorias Remetidas com Fim Específico de Exportação e Eventuais Devoluções",
    "3.550": "3.550 Operações com Bens do Ativo Imobilizado e Materiais para Uso ou Consumo",
    "3.650": "3.650 Entradas de Combustíveis, Derivados ou Não de Petróleo, e Lubrificantes",
    "3.900": "3.900 Outras Entradas de Mercadorias ou Aquisições de Serviços",
}


def _cfop_digits(cfop: str) -> str:
    return "".join(ch for ch in (cfop or "") if ch.isdigit())


def sinief_code(cfop: str) -> str:
    """CFOP 2-152 → '2.150' (faixa SINIEF de 50 em 50)."""
    digits = _cfop_digits(cfop)
    if len(digits) < 4:
        return ""
    origin = digits[0]
    rest = int(digits[1:4])
    base = (rest // 50) * 50
    return f"{origin}.{base:03d}"


def sinief_grupo(cfop: str) -> str:
    code = sinief_code(cfop)
    if not code:
        return "Sem grupo"
    return SINIEF_GRUPOS.get(code, f"{code} Outras operações")


def _credito_pis_cofins(finalidade: str) -> bool:
    return finalidade in ("Revenda", "Revenda c/ ST", "Ativo Imobilizado", "Uso e consumo")


def cfop_meta(cfop: str) -> dict:
    info = CFOP_INFO.get(cfop) or CFOP_INFO.get((cfop or "").replace(".", "-"))
    grupo = sinief_grupo(cfop)
    if info:
        return {
            "descricao": info[0],
            "finalidade": info[1],
            "creditoPisCofins": _credito_pis_cofins(info[1]),
            "grupo": grupo,
        }
    digits = _cfop_digits(cfop)
    last = digits[-3:] if len(digits) >= 3 else ""
    if last in ("102", "403"):
        fin = "Revenda"
        return {"descricao": "Operação de mercadoria", "finalidade": fin, "creditoPisCofins": True, "grupo": grupo}
    if last in ("551", "555"):
        fin = "Ativo Imobilizado"
        return {"descricao": "Ativo imobilizado", "finalidade": fin, "creditoPisCofins": True, "grupo": grupo}
    if last in ("202", "411"):
        fin = "Devolução Venda"
        return {"descricao": "Devolução", "finalidade": fin, "creditoPisCofins": False, "grupo": grupo}
    return {"descricao": "—", "finalidade": "Outros", "creditoPisCofins": False, "grupo": grupo}


def macro_grupo(cfop: str) -> str:
    fin = cfop_meta(cfop)["finalidade"]
    if fin in ("Revenda", "Revenda c/ ST", "Uso e consumo"):
        return "revenda"
    if fin == "Ativo Imobilizado":
        return "ativo"
    if "Devol" in fin:
        return "devol"
    return "outros"


MACRO = (
    {"key": "revenda", "label": "Revenda", "badge": "1.102 / 2.102 / 1.403", "color": "#22a329", "cardColor": "blue", "icon": "rotate-left", "sub": "Compra p/ comercialização"},
    {"key": "ativo", "label": "Ativo Imobilizado", "badge": "1.551", "color": "#f97316", "cardColor": "orange", "icon": "building", "sub": "Bens para o ativo imobilizado"},
    {"key": "devol", "label": "Devoluções / Retornos", "badge": "1.202 / 1.411", "color": "#8b5cf6", "cardColor": "purple", "icon": "arrows-rotate", "sub": "Devoluções de venda"},
    {"key": "outros", "label": "Outros", "badge": "Demais CFOPs", "color": "#06b6d4", "cardColor": "cyan", "icon": "box-open", "sub": "Serviços e demais entradas"},
)


def aggregate_macro(cfop_dados: list[dict]) -> list[dict]:
    buckets = {m["key"]: {"total": 0.0, "qtd": 0} for m in MACRO}
    total = 0.0
    for row in cfop_dados or []:
        key = macro_grupo(str(row.get("cfop") or ""))
        buckets[key]["total"] += float(row.get("total") or 0)
        buckets[key]["qtd"] += int(row.get("qtd") or 0)
        total += float(row.get("total") or 0)
    out = []
    for m in MACRO:
        b = buckets[m["key"]]
        out.append({**m, "total": round(b["total"], 2), "qtd": b["qtd"], "pct": round(100 * b["total"] / total, 1) if total else 0})
    return out


def top_grupos(cfop_dados: list[dict], n: int = 4) -> list[dict]:
    """Top N grupos SINIEF por valor (KPIs da Finalidade de Compras)."""
    buckets: dict[str, float] = {}
    for row in cfop_dados or []:
        grupo = str(row.get("grupo") or "").strip() or sinief_grupo(str(row.get("cfop") or ""))
        buckets[grupo] = buckets.get(grupo, 0.0) + float(row.get("total") or 0)
    grand = sum(buckets.values())
    ordered = sorted(buckets.items(), key=lambda x: x[1], reverse=True)[:n]
    return [
        {
            "grupo": g,
            "total": round(v, 2),
            "pct": round(100 * v / grand, 1) if grand else 0.0,
        }
        for g, v in ordered
    ]
