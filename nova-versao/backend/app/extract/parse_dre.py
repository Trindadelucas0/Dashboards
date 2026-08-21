from __future__ import annotations

import re
from typing import Any

from app.extract.workbook import WorkbookGrid


def _to_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s or s in ("-", "—"):
        return None
    neg = "(" in s and ")" in s
    s = s.replace("R$", "").replace(".", "").replace(",", ".").replace("(", "").replace(")", "")
    s = re.sub(r"[^\d.\-]", "", s)
    try:
        n = float(s or 0)
        return -n if neg else n
    except ValueError:
        return None


def parse_dre(grid: WorkbookGrid) -> dict:
    """Extrai linhas rotuladas de planilhas RESULTADO / DRE.

    Quando a planilha só traz estrutura (sem valores numéricos), grava as linhas
    com valor null — a UI mostra N/D sem inventar CMV/margem.
    """
    lines: list[dict] = []
    totals: dict[str, float | None] = {
        "receitaBruta": None,
        "cmv": None,
        "despesas": None,
        "lucLiq": None,
    }

    for raw in grid.rows or []:
        cells = list(raw or [])
        texts = [str(c).strip() for c in cells if c is not None and str(c).strip()]
        if not texts:
            continue
        label = texts[-1] if len(texts) >= 1 else ""
        # códigos de conta costumam vir antes do rótulo
        code = ""
        if len(texts) >= 2 and re.fullmatch(r"\d{1,5}", texts[0]):
            code = texts[0]
            label = texts[-1]
        nums = [_to_float(c) for c in cells]
        nums = [n for n in nums if n is not None]
        valor = nums[-1] if nums else None
        low = label.lower()
        row = {"codigo": code, "descricao": label, "valor": valor}
        if low in ("despesas",) and code:
            continue
        if "vendas de produtos" in low or "receita" in low:
            totals["receitaBruta"] = valor if valor is not None else totals["receitaBruta"]
            row["grupo"] = "receita"
        elif "custo da mercadoria" in low or low == "cmv":
            totals["cmv"] = valor if valor is not None else totals["cmv"]
            row["grupo"] = "cmv"
        elif "resultado líquido" in low or "resultado liquido" in low or "lucro líquido" in low:
            totals["lucLiq"] = valor if valor is not None else totals["lucLiq"]
            row["grupo"] = "resultado"
        elif "total de despesas" in low:
            totals["despesas"] = valor if valor is not None else totals["despesas"]
            row["grupo"] = "despesas"
        else:
            row["grupo"] = "linha"
        if label:
            lines.append(row)

    rb = totals["receitaBruta"]
    cmv = totals["cmv"]
    luc_bruto = None
    if rb is not None and cmv is not None:
        luc_bruto = round(rb - cmv, 2)
    marg_mb = round(100 * luc_bruto / rb, 2) if rb and luc_bruto is not None else None
    luc_liq = totals["lucLiq"]
    marg_ml = round(100 * luc_liq / rb, 2) if rb and luc_liq is not None else None

    return {
        "kind": "resultado",
        "linhas": lines,
        "receitaBruta": rb,
        "cmv": cmv,
        "despesas": totals["despesas"],
        "lucBruto": luc_bruto,
        "lucLiq": luc_liq,
        "margMb": marg_mb,
        "margMl": marg_ml,
        "hasValores": any(l.get("valor") is not None for l in lines),
    }
