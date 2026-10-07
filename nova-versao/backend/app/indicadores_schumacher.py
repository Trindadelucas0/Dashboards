"""Indicadores financeiros Schumacher (DRE comparativo + Balanço comparativo)."""

from __future__ import annotations

from typing import Any

from app.extract.parse_dre_schumacher import _norm_label

_LEITURAS = {
    "faturamento": "Total vendido no período",
    "lucroBruto": "Venda menos custo da mercadoria/serviço",
    "margemBruta": "Quanto sobra da venda após o custo direto",
    "lucroLiquido": "Resultado final depois de despesas, impostos e custos",
    "margemLiquida": "Percentual real de lucro sobre o faturamento",
    "ebitda": "Resultado operacional antes de juros, impostos, depreciação e amortização",
    "corrente": "Se a empresa consegue pagar obrigações de curto prazo",
    "seca": "Capacidade de pagar sem depender da venda do estoque",
    "imediata": "Quanto consegue pagar agora com caixa/banco/aplicações",
    "geral": "Capacidade de pagamento no curto e longo prazo",
}


def _bp_group(linhas: list[dict], key: str) -> tuple[float | None, str]:
    """Primeiro match L1/group ou linha com rótulo normalizado == key."""
    key_n = _norm_label(key)
    best: dict | None = None
    for ln in linhas or []:
        desc = str(ln.get("descricao") or "")
        norm = _norm_label(desc)
        if norm != key_n:
            continue
        nivel = ln.get("nivel")
        kind = ln.get("kind")
        if nivel == 1 or kind == "group":
            return _line_val(ln), desc
        if best is None:
            best = ln
    if best is not None:
        return _line_val(best), str(best.get("descricao") or key)
    return None, key


def _line_val(ln: dict) -> float | None:
    v = ln.get("valor")
    if v is None:
        return None
    return round(float(v), 2)


def _sum_dre_da(linhas: list[dict]) -> tuple[float, list[dict]]:
    total = 0.0
    rows: list[dict] = []
    for ln in linhas or []:
        norm = _norm_label(str(ln.get("descricao") or ""))
        if "acumulad" in norm or "apropr" in norm:
            continue
        if "depreciac" not in norm and "amortiz" not in norm:
            continue
        val = _line_val(ln)
        if val is None:
            continue
        total += val
        rows.append(ln)
    return round(total, 2), rows


def _fmt_brl(n: float | None) -> str:
    if n is None:
        return "N/D"
    s = f"{abs(n):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {'−' if n < 0 else ''}{s}"


def _fmt_pct(n: float | None) -> str:
    if n is None:
        return "N/D"
    return f"{n:,.2f}%".replace(",", "X").replace(".", ",").replace("X", ".")


def _fmt_ratio(n: float | None) -> str:
    if n is None:
        return "N/D"
    return f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _item(
    *,
    valor: float | None,
    formula: str,
    leitura: str,
    detalhe: dict,
    nd: bool | None = None,
    valor_fmt: str | None = None,
    kind: str = "money",
) -> dict:
    if kind == "pct":
        vf = valor_fmt or _fmt_pct(valor)
    elif kind == "ratio":
        vf = valor_fmt or _fmt_ratio(valor)
    else:
        vf = valor_fmt or _fmt_brl(valor)
    return {
        "valor": valor,
        "valorFmt": vf,
        "formula": formula,
        "leitura": leitura,
        "nd": valor is None if nd is None else nd,
        "detalhe": detalhe,
    }


def _ratio_item(
    nome: str,
    formula: str,
    leitura_key: str,
    numerador: float | None,
    numerador_rotulo: str,
    numerador_fonte: str,
    denominador: float | None,
    denominador_rotulo: str,
    denominador_fonte: str,
) -> dict:
    passos: list[dict] = []
    if numerador is not None:
        passos.append(
            {"rotulo": numerador_rotulo, "valor": numerador, "fonte": numerador_fonte, "operador": None}
        )
    if denominador is not None:
        op = "÷"
        passos.append(
            {
                "rotulo": denominador_rotulo,
                "valor": denominador,
                "fonte": denominador_fonte,
                "operador": op,
            }
        )
    valor = None
    if numerador is not None and denominador not in (None, 0):
        valor = round(numerador / denominador, 4)
        passos.append({"rotulo": nome, "valor": valor, "fonte": "", "operador": "="})
    elif denominador == 0:
        passos.append(
            {
                "rotulo": nome,
                "valor": None,
                "fonte": "Denominador zero — ratio indeterminado",
                "operador": "=",
            }
        )
    return _item(
        valor=valor,
        formula=formula,
        leitura=_LEITURAS[leitura_key],
        detalhe={"titulo": nome, "formula": formula, "leitura": _LEITURAS[leitura_key], "passos": passos},
        kind="ratio",
    )


def _is_schumacher_pack(pack: dict) -> bool:
    dre = pack.get("dre") if isinstance(pack.get("dre"), dict) else {}
    bal = pack.get("balancete") if isinstance(pack.get("balancete"), dict) else {}
    return dre.get("kind") == "schumacher_comparativo" or bal.get("kind") == "schumacher_bp"


def compute_indicadores_schumacher(pack: dict) -> dict:
    pack = pack or {}
    dre = pack.get("dre") if isinstance(pack.get("dre"), dict) else {}
    bal = pack.get("balancete") if isinstance(pack.get("balancete"), dict) else {}
    dre_linhas = dre.get("linhas") if isinstance(dre.get("linhas"), list) else []
    bp_linhas = bal.get("linhas") if isinstance(bal.get("linhas"), list) else []

    rb = pack.get("receitaBruta")
    if rb is None and dre:
        rb = dre.get("receitaBruta")
    luc_bruto = pack.get("lucBruto") if pack.get("lucBruto") is not None else dre.get("lucBruto")
    luc_liq = pack.get("lucLiq") if pack.get("lucLiq") is not None else dre.get("lucLiq")
    marg_mb = pack.get("margMb") if pack.get("margMb") is not None else dre.get("margMb")
    marg_ml = pack.get("margMl") if pack.get("margMl") is not None else dre.get("margMl")
    luc_op = dre.get("lucOperacional")

    if marg_mb is None and rb and luc_bruto is not None:
        marg_mb = round(100 * luc_bruto / rb, 2)
    if marg_ml is None and rb and luc_liq is not None:
        marg_ml = round(100 * luc_liq / rb, 2)

    da_total, da_linhas = _sum_dre_da(dre_linhas)
    ebitda = None
    if luc_op is not None:
        ebitda = round(float(luc_op) + da_total, 2)

    # --- Resultado ---
    fat_passos = []
    if rb is not None:
        fat_passos.append(
            {
                "rotulo": "Receita operacional bruta",
                "valor": rb,
                "fonte": "DRE · RECEITA OPERACIONAL BRUTA",
                "operador": "=",
            }
        )
    faturamento = _item(
        valor=rb,
        formula="Receita operacional bruta (DRE)",
        leitura=_LEITURAS["faturamento"],
        detalhe={
            "titulo": "Faturamento",
            "formula": "Receita operacional bruta (DRE)",
            "leitura": _LEITURAS["faturamento"],
            "passos": fat_passos,
        },
    )

    lucro_bruto = _item(
        valor=luc_bruto,
        formula="Lucro bruto (DRE)",
        leitura=_LEITURAS["lucroBruto"],
        detalhe={
            "titulo": "Lucro bruto",
            "formula": "Lucro bruto (DRE)",
            "leitura": _LEITURAS["lucroBruto"],
            "passos": (
                [{"rotulo": "Lucro bruto", "valor": luc_bruto, "fonte": "DRE · LUCRO BRUTO", "operador": "="}]
                if luc_bruto is not None
                else []
            ),
        },
    )

    mb_passos: list[dict] = []
    if luc_bruto is not None:
        mb_passos.append({"rotulo": "Lucro bruto", "valor": luc_bruto, "fonte": "DRE", "operador": None})
    if rb is not None:
        mb_passos.append({"rotulo": "Receita operacional bruta", "valor": rb, "fonte": "DRE", "operador": "÷"})
    if marg_mb is not None:
        mb_passos.append({"rotulo": "Margem bruta", "valor": marg_mb, "fonte": "", "operador": "="})
    elif rb == 0:
        mb_passos.append({"rotulo": "Margem bruta", "valor": None, "fonte": "Denominador zero", "operador": "="})
    margem_bruta = _item(
        valor=marg_mb,
        formula="Lucro bruto ÷ Receita operacional bruta",
        leitura=_LEITURAS["margemBruta"],
        detalhe={
            "titulo": "Margem bruta",
            "formula": "Lucro bruto ÷ Receita operacional bruta",
            "leitura": _LEITURAS["margemBruta"],
            "passos": mb_passos,
        },
        kind="pct",
    )

    lucro_liquido = _item(
        valor=luc_liq,
        formula="Lucro ou prejuízo líquido (DRE)",
        leitura=_LEITURAS["lucroLiquido"],
        detalhe={
            "titulo": "Lucro líquido",
            "formula": "Lucro ou prejuízo líquido (DRE)",
            "leitura": _LEITURAS["lucroLiquido"],
            "passos": (
                [
                    {
                        "rotulo": "Lucro líquido",
                        "valor": luc_liq,
                        "fonte": "DRE · LUCRO OU PREJUÍZO LÍQUIDO DO EXERCÍCIO",
                        "operador": "=",
                    }
                ]
                if luc_liq is not None
                else []
            ),
        },
    )

    ml_passos: list[dict] = []
    if luc_liq is not None:
        ml_passos.append({"rotulo": "Lucro líquido", "valor": luc_liq, "fonte": "DRE", "operador": None})
    if rb is not None:
        ml_passos.append({"rotulo": "Receita operacional bruta", "valor": rb, "fonte": "DRE", "operador": "÷"})
    if marg_ml is not None:
        ml_passos.append({"rotulo": "Margem líquida", "valor": marg_ml, "fonte": "", "operador": "="})
    margem_liquida = _item(
        valor=marg_ml,
        formula="Lucro líquido ÷ Receita operacional bruta",
        leitura=_LEITURAS["margemLiquida"],
        detalhe={
            "titulo": "Margem líquida",
            "formula": "Lucro líquido ÷ Receita operacional bruta",
            "leitura": _LEITURAS["margemLiquida"],
            "passos": ml_passos,
        },
        kind="pct",
    )

    ebitda_passos: list[dict] = []
    if luc_op is not None:
        ebitda_passos.append(
            {"rotulo": "Resultado operacional", "valor": luc_op, "fonte": "DRE · RESULTADO OPERACIONAL", "operador": None}
        )
    for ln in da_linhas:
        ebitda_passos.append(
            {
                "rotulo": str(ln.get("descricao") or ""),
                "valor": _line_val(ln),
                "fonte": "DRE",
                "operador": "+",
            }
        )
    if da_linhas:
        ebitda_passos.append(
            {"rotulo": "Total depreciação e amortização", "valor": da_total, "fonte": "DRE", "operador": "soma"}
        )
    if ebitda is not None:
        ebitda_passos.append({"rotulo": "EBITDA", "valor": ebitda, "fonte": "", "operador": "="})
    ebitda_item = _item(
        valor=ebitda,
        formula="Resultado operacional + depreciação e amortização do mês (DRE)",
        leitura=_LEITURAS["ebitda"],
        detalhe={
            "titulo": "EBITDA",
            "formula": "Resultado operacional + depreciação e amortização do mês (DRE)",
            "leitura": _LEITURAS["ebitda"],
            "passos": ebitda_passos,
        },
    )

    # --- Liquidez ---
    ac_v, ac_desc = _bp_group(bp_linhas, "ativo circulante")
    pc_v, pc_desc = _bp_group(bp_linhas, "passivo circulante")
    disp_v, disp_desc = _bp_group(bp_linhas, "disponivel")
    est_v, est_desc = _bp_group(bp_linhas, "estoque")
    rlp_v, rlp_desc = _bp_group(bp_linhas, "realizavel a longo prazo")
    pnc_v, pnc_desc = _bp_group(bp_linhas, "passivo nao circulante")

    corrente = _ratio_item(
        "Liquidez corrente",
        "Ativo circulante ÷ Passivo circulante",
        "corrente",
        ac_v,
        "Ativo circulante",
        f"Balanço · {ac_desc.upper()}",
        pc_v,
        "Passivo circulante",
        f"Balanço · {pc_desc.upper()}",
    )

    num_seca = round(ac_v - est_v, 2) if ac_v is not None and est_v is not None else None
    seca_passos: list[dict] = []
    if ac_v is not None:
        seca_passos.append({"rotulo": "Ativo circulante", "valor": ac_v, "fonte": f"Balanço · {ac_desc.upper()}", "operador": None})
    if est_v is not None:
        seca_passos.append({"rotulo": "Estoques", "valor": est_v, "fonte": f"Balanço · {est_desc.upper()}", "operador": "−"})
    if num_seca is not None:
        seca_passos.append({"rotulo": "Numerador (AC − Estoques)", "valor": num_seca, "fonte": "", "operador": "soma"})
    if pc_v is not None:
        seca_passos.append({"rotulo": "Passivo circulante", "valor": pc_v, "fonte": f"Balanço · {pc_desc.upper()}", "operador": "÷"})
    seca_val = None
    if num_seca is not None and pc_v not in (None, 0):
        seca_val = round(num_seca / pc_v, 4)
        seca_passos.append({"rotulo": "Liquidez seca", "valor": seca_val, "fonte": "", "operador": "="})
    elif pc_v == 0:
        seca_passos.append({"rotulo": "Liquidez seca", "valor": None, "fonte": "Denominador zero", "operador": "="})
    seca = _item(
        valor=seca_val,
        formula="(Ativo circulante − Estoques) ÷ Passivo circulante",
        leitura=_LEITURAS["seca"],
        detalhe={
            "titulo": "Liquidez seca",
            "formula": "(Ativo circulante − Estoques) ÷ Passivo circulante",
            "leitura": _LEITURAS["seca"],
            "passos": seca_passos,
        },
        kind="ratio",
    )

    imediata = _ratio_item(
        "Liquidez imediata",
        "Disponível ÷ Passivo circulante",
        "imediata",
        disp_v,
        "Disponível",
        f"Balanço · {disp_desc.upper()}",
        pc_v,
        "Passivo circulante",
        f"Balanço · {pc_desc.upper()}",
    )

    num_geral = round(ac_v + rlp_v, 2) if ac_v is not None and rlp_v is not None else None
    den_geral = round(pc_v + pnc_v, 2) if pc_v is not None and pnc_v is not None else None
    geral_passos: list[dict] = []
    if ac_v is not None:
        geral_passos.append({"rotulo": "Ativo circulante", "valor": ac_v, "fonte": f"Balanço · {ac_desc.upper()}", "operador": None})
    if rlp_v is not None:
        geral_passos.append(
            {"rotulo": "Realizável a longo prazo", "valor": rlp_v, "fonte": f"Balanço · {rlp_desc.upper()}", "operador": "+"}
        )
    if num_geral is not None:
        geral_passos.append({"rotulo": "Numerador (AC + RLP)", "valor": num_geral, "fonte": "", "operador": "soma"})
    if pc_v is not None:
        geral_passos.append({"rotulo": "Passivo circulante", "valor": pc_v, "fonte": f"Balanço · {pc_desc.upper()}", "operador": None})
    if pnc_v is not None:
        geral_passos.append(
            {"rotulo": "Passivo não circulante", "valor": pnc_v, "fonte": f"Balanço · {pnc_desc.upper()}", "operador": "+"}
        )
    if den_geral is not None:
        geral_passos.append({"rotulo": "Denominador (PC + PNC)", "valor": den_geral, "fonte": "", "operador": "soma"})
    geral_val = None
    if num_geral is not None and den_geral not in (None, 0):
        geral_val = round(num_geral / den_geral, 4)
        geral_passos.append({"rotulo": "Liquidez geral", "valor": geral_val, "fonte": "", "operador": "="})
    elif den_geral == 0:
        geral_passos.append({"rotulo": "Liquidez geral", "valor": None, "fonte": "Denominador zero", "operador": "="})
    geral = _item(
        valor=geral_val,
        formula="(Ativo circulante + Realizável a longo prazo) ÷ (Passivo circulante + Passivo não circulante)",
        leitura=_LEITURAS["geral"],
        detalhe={
            "titulo": "Liquidez geral",
            "formula": "(Ativo circulante + Realizável a longo prazo) ÷ (Passivo circulante + Passivo não circulante)",
            "leitura": _LEITURAS["geral"],
            "passos": geral_passos,
        },
        kind="ratio",
    )

    return {
        "resultado": {
            "faturamento": faturamento,
            "lucroBruto": lucro_bruto,
            "margemBruta": margem_bruta,
            "lucroLiquido": lucro_liquido,
            "margemLiquida": margem_liquida,
            "ebitda": ebitda_item,
        },
        "liquidez": {
            "corrente": corrente,
            "seca": seca,
            "imediata": imediata,
            "geral": geral,
        },
    }


def _merge_dre_linhas(packs: list[dict]) -> list[dict]:
    by_key: dict[str, dict] = {}
    for p in packs:
        dre = p.get("dre") if isinstance(p.get("dre"), dict) else {}
        for ln in dre.get("linhas") or []:
            k = str(ln.get("key") or ln.get("descricao") or "")
            if k not in by_key:
                by_key[k] = {**ln, "valor": 0.0}
            v = _line_val(ln)
            if v is not None:
                by_key[k]["valor"] = round(float(by_key[k].get("valor") or 0) + v, 2)
    return list(by_key.values())


def _merge_bp_linhas(packs: list[dict]) -> list[dict]:
    by_key: dict[str, dict] = {}
    for p in packs:
        bal = p.get("balancete") if isinstance(p.get("balancete"), dict) else {}
        for ln in bal.get("linhas") or []:
            k = str(ln.get("key") or ln.get("descricao") or "")
            if k not in by_key:
                by_key[k] = {**ln, "valor": 0.0}
            v = _line_val(ln)
            if v is not None:
                by_key[k]["valor"] = round(float(by_key[k].get("valor") or 0) + v, 2)
    return list(by_key.values())


def _sum_field(packs: list[dict], field: str) -> float | None:
    vals = [p.get(field) for p in packs if p.get(field) is not None]
    if not vals:
        dre_vals = []
        for p in packs:
            dre = p.get("dre") if isinstance(p.get("dre"), dict) else {}
            if dre.get(field) is not None:
                dre_vals.append(dre.get(field))
        vals = dre_vals
    if not vals:
        return None
    return round(sum(float(v) for v in vals), 2)


def merge_packs_for_indicadores(packs: list[dict]) -> dict:
    packs = [p for p in (packs or []) if p]
    if not packs:
        return {}
    if len(packs) == 1:
        return packs[0]
    dre_linhas = _merge_dre_linhas(packs)
    bp_linhas = _merge_bp_linhas(packs)
    rb = _sum_field(packs, "receitaBruta")
    luc_bruto = _sum_field(packs, "lucBruto")
    luc_liq = _sum_field(packs, "lucLiq")
    luc_op_vals = []
    for p in packs:
        dre = p.get("dre") if isinstance(p.get("dre"), dict) else {}
        if dre.get("lucOperacional") is not None:
            luc_op_vals.append(float(dre["lucOperacional"]))
    luc_op = round(sum(luc_op_vals), 2) if luc_op_vals else None
    marg_mb = round(100 * luc_bruto / rb, 2) if rb and luc_bruto is not None else None
    marg_ml = round(100 * luc_liq / rb, 2) if rb and luc_liq is not None else None
    return {
        "hasDre": any(p.get("hasDre") for p in packs),
        "hasBalancete": any(p.get("hasBalancete") or p.get("balancete") for p in packs),
        "receitaBruta": rb,
        "lucBruto": luc_bruto,
        "lucLiq": luc_liq,
        "margMb": marg_mb,
        "margMl": marg_ml,
        "dre": {
            "kind": "schumacher_comparativo",
            "linhas": dre_linhas,
            "lucOperacional": luc_op,
            "receitaBruta": rb,
            "lucBruto": luc_bruto,
            "lucLiq": luc_liq,
            "margMb": marg_mb,
            "margMl": marg_ml,
        },
        "balancete": {"kind": "schumacher_bp", "linhas": bp_linhas},
    }


def aggregate_indicadores_schumacher(packs: list[dict], trimestre_label: str = "") -> dict:
    merged = merge_packs_for_indicadores(packs)
    out = compute_indicadores_schumacher(merged)
    if trimestre_label and len(packs) > 1:
        suffix = f" · Soma do trimestre ({trimestre_label})"
        for section in (out.get("resultado") or {}, out.get("liquidez") or {}):
            for item in section.values():
                det = item.get("detalhe") or {}
                for ps in det.get("passos") or []:
                    if ps.get("fonte") and "Soma do trimestre" not in str(ps.get("fonte")):
                        ps["fonte"] = str(ps["fonte"]) + suffix
    return out


def indicadores_tem_valor(ind: dict) -> bool:
    for section in (ind.get("resultado") or {}, ind.get("liquidez") or {}):
        for item in section.values():
            if isinstance(item, dict) and item.get("valor") is not None:
                return True
    return False
