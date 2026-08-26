from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.extract.workbook import WorkbookGrid


def _fold(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch)).lower().strip()


def _to_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s or s in ("-", "—"):
        return None
    if "/" in s:
        return None
    neg = "(" in s and ")" in s
    s = s.replace("R$", "").strip()
    # BR: 1.234.567,89  |  COM/xlsx: 1234567.89 (grid sempre vira str)
    if re.search(r",\d{1,2}$", s):
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", "")
    s = s.replace("(", "").replace(")", "")
    s = re.sub(r"[^\d.\-]", "", s)
    try:
        n = float(s or 0)
        return -abs(n) if neg else n
    except ValueError:
        return None


def _is_number_cell(cell: Any) -> bool:
    if isinstance(cell, bool):
        return False
    if isinstance(cell, (int, float)):
        return True
    s = str(cell or "").strip()
    if not s or "/" in s or re.search(r"[a-zA-Z]", s):
        return False
    return _to_float(s) is not None


def _norm_label(label: str) -> str:
    folded = _fold(label)
    folded = re.sub(r"^[\(\)=\+\-\/\s]+", "", folded)
    folded = re.sub(r"\s+", " ", folded)
    return folded.strip()


def _is_exito_dre(grid: WorkbookGrid) -> bool:
    head = " ".join(_fold(" ".join(grid.row(r))) for r in range(min(8, len(grid.rows))))
    if "demonstracao do resultado" in head:
        return True
    if "saldo atual" in head and "receita bruta" in head:
        return True
    return False


def _skip_exito_row(label: str) -> bool:
    low = _fold(label)
    if not low:
        return True
    if low.startswith(("empresa", "c.n.p.j", "cnpj", "insc", "folha", "numero livro", "nº livro")):
        return True
    if low in ("descricao", "descrição", "saldo atual"):
        return True
    if "demonstracao do resultado" in low:
        return True
    if "sistema licenciado" in low:
        return True
    if "cpf:" in low or "crc" in low:
        return True
    if set(low.replace("\n", "")) <= set("_ "):
        return True
    return False


def _exito_row(cells: list[Any]) -> tuple[str, str, float | None, str]:
    texts: list[str] = []
    nums: list[float] = []
    first_text_col = None
    for idx, cell in enumerate(cells):
        if cell is None or str(cell).strip() == "":
            continue
        if _is_number_cell(cell):
            n = _to_float(cell)
            if n is not None:
                nums.append(n)
            continue
        text = str(cell).strip()
        if text:
            if first_text_col is None:
                first_text_col = idx
            texts.append(text)
    label = texts[0] if texts else ""
    valor = nums[-1] if nums else None
    nivel = "linha"
    if first_text_col == 0:
        nivel = "total"
    elif first_text_col and first_text_col >= 2:
        nivel = "detalhe"
    return "", label, valor, nivel


def _parse_exito_dre(grid: WorkbookGrid) -> dict:
    """DRE EXITO: seções na col 0, detalhe na col 2, totais em Saldo Atual."""
    lines: list[dict] = []
    totals: dict[str, float | None] = {
        "receitaBruta": None,
        "receitaLiquida": None,
        "cmv": None,
        "despesas": None,
        "lucBruto": None,
        "lucLiq": None,
    }

    for raw in grid.rows or []:
        cells = list(raw or [])
        _code, label, valor, nivel = _exito_row(cells)
        if _skip_exito_row(label):
            continue
        key = _norm_label(label)
        row = {"codigo": "", "descricao": label, "valor": valor, "grupo": "linha"}
        if key == "receita bruta":
            totals["receitaBruta"] = valor
            row["grupo"] = "receita"
        elif key in ("venda de mercadorias", "vendas de produtos"):
            if totals["receitaBruta"] is None:
                totals["receitaBruta"] = valor
            row["grupo"] = "receita"
        elif key == "receita liquida":
            totals["receitaLiquida"] = valor
            row["grupo"] = "receita"
        elif key == "cmv" or "custos das mercadorias vendidas" in key or "custo da mercadoria" in key:
            if key == "cmv" or totals["cmv"] is None:
                totals["cmv"] = valor
            row["grupo"] = "cmv"
        elif key == "lucro bruto":
            totals["lucBruto"] = valor
            row["grupo"] = "resultado"
        elif key in ("despesas operacionais", "total de despesas"):
            totals["despesas"] = valor
            row["grupo"] = "despesas"
        elif (
            key in ("lucro liquido do exercicio", "prejuizo do exercicio", "resultado liquido")
            or "lucro ou prejuizo liquido do exercicio" in key
        ):
            totals["lucLiq"] = valor
            row["grupo"] = "resultado"
        elif nivel == "total":
            row["grupo"] = "total"
        else:
            row["grupo"] = "linha"
        if label:
            lines.append(row)

    rb = totals["receitaBruta"]
    cmv = totals["cmv"]
    luc_bruto = totals["lucBruto"]
    if luc_bruto is None and totals["receitaLiquida"] is not None and cmv is not None:
        luc_bruto = round(totals["receitaLiquida"] + cmv, 2)
    luc_liq = totals["lucLiq"]
    marg_mb = round(100 * luc_bruto / rb, 2) if rb and luc_bruto is not None else None
    marg_ml = round(100 * luc_liq / rb, 2) if rb and luc_liq is not None else None

    return {
        "kind": "exito",
        "linhas": lines,
        "receitaBruta": rb,
        "receitaLiquida": totals["receitaLiquida"],
        "cmv": cmv,
        "despesas": totals["despesas"],
        "lucBruto": luc_bruto,
        "lucLiq": luc_liq,
        "margMb": marg_mb,
        "margMl": marg_ml,
        "hasValores": any(l.get("valor") is not None for l in lines),
    }


def _parse_resultado_legacy(grid: WorkbookGrid) -> dict:
    """Planilhas RESULTADO (Egaplast/legado): rótulo + último número da linha."""
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
        if "vendas de produtos" in low or low == "receita bruta" or low == "receita":
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


def parse_dre(grid: WorkbookGrid) -> dict:
    """Extrai linhas rotuladas de planilhas RESULTADO / DRE EXITO.

    Quando a planilha só traz estrutura (sem valores numéricos), grava as linhas
    com valor null — a UI mostra N/D sem inventar CMV/margem.
    """
    if _is_exito_dre(grid):
        return _parse_exito_dre(grid)
    return _parse_resultado_legacy(grid)
