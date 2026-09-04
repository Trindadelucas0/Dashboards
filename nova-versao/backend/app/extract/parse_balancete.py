from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.extract.workbook import WorkbookGrid

_ACCOUNT_RE = re.compile(r"^\d+(?:\.\d+)*$")


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


def _grupo(codigo: str) -> str:
    first = (codigo or "").split(".", 1)[0]
    return {"1": "ativo", "2": "passivo", "3": "resultado"}.get(first, "outro")


def _find_header(grid: WorkbookGrid) -> tuple[int, dict[str, int]] | None:
    for idx, raw in enumerate((grid.rows or [])[:25]):
        cells = [_fold(str(c or "")) for c in (raw or [])]
        joined = " ".join(cells)
        if "codigo" not in joined or "saldo" not in joined:
            continue
        cols: dict[str, int] = {}
        for col, cell in enumerate(cells):
            if not cell:
                continue
            if "classificacao" in cell and "codigo" not in cols:
                cols["classificacao"] = col
            elif cell == "codigo" or cell.startswith("codigo"):
                cols.setdefault("codigo_interno", col)
            elif "descricao" in cell:
                cols["descricao"] = col
            elif "saldo anterior" in cell or cell == "saldo ant":
                cols["saldoAnterior"] = col
            elif cell in ("debito", "debitos") or cell.startswith("debito"):
                cols.setdefault("debito", col)
            elif cell in ("credito", "creditos") or cell.startswith("credito"):
                cols.setdefault("credito", col)
            elif "saldo atual" in cell:
                cols["saldoAtual"] = col
        if "descricao" in cols and ("saldoAtual" in cols or "classificacao" in cols):
            return idx, cols
    return None


def find_padrao_balancete_month_columns(grid: WorkbookGrid, header_row: int = 0) -> dict[str, int]:
    from app.extract.parse_dre import _MONTH_PADRAO

    cols: dict[str, int] = {}
    if not grid.rows or header_row >= len(grid.rows):
        return cols
    for col, cell in enumerate(grid.row(header_row)):
        key = _fold(str(cell or ""))
        if key in _MONTH_PADRAO:
            cols[_MONTH_PADRAO[key]] = col
    return cols


def _is_padrao_balancete(grid: WorkbookGrid) -> bool:
    if not grid.rows:
        return False
    head = " ".join(_fold(str(c or "")) for c in grid.row(0))
    return "codigo" in head and "classificacao" in head and "janeiro" in head


def parse_balancete_padrao_column(grid: WorkbookGrid, value_col: int) -> dict:
    """Balancete planilha padrão: valor mensal na coluna do mês → saldoAtual."""
    header_idx = 0
    class_col = 1
    desc_col = 2
    contas: list[dict] = []

    for raw in (grid.rows or [])[header_idx + 1 :]:
        cells = list(raw or [])
        if not cells:
            continue
        codigo = str(cells[class_col] if class_col < len(cells) else "").strip()
        if not _ACCOUNT_RE.match(codigo):
            continue
        descricao = str(cells[desc_col] if desc_col < len(cells) else "").strip()
        if not descricao:
            continue
        low = _fold(descricao)
        if "sistema licenciado" in low or "cpf:" in low or "crc" in low:
            continue
        saldo_atual = None
        if value_col < len(cells):
            from app.extract.parse_dre import _is_number_cell, _to_float as dre_float

            if _is_number_cell(cells[value_col]):
                saldo_atual = dre_float(cells[value_col])
        contas.append(
            {
                "codigo": codigo,
                "descricao": descricao,
                "nivel": codigo.count(".") + 1,
                "grupo": _grupo(codigo),
                "saldoAnterior": None,
                "debito": None,
                "credito": None,
                "saldoAtual": saldo_atual,
            }
        )

    by_code = {c["codigo"]: c for c in contas}
    totais = {
        "ativo": (by_code.get("1") or {}).get("saldoAtual"),
        "passivo": (by_code.get("2") or {}).get("saldoAtual"),
        "resultado": (by_code.get("3") or {}).get("saldoAtual"),
        "debitos": None,
        "creditos": None,
        "contas": len(contas),
    }
    return {
        "kind": "padrao",
        "contas": contas,
        "totais": totais,
        "hasValores": any(c.get("saldoAtual") is not None for c in contas),
    }


def parse_balancete(grid: WorkbookGrid) -> dict:
    """Balancete EXITO: Código interno, Classificação, Descrição, saldos e movimento."""
    if _is_padrao_balancete(grid):
        cols = find_padrao_balancete_month_columns(grid)
        if cols:
            first_col = cols[sorted(cols.keys())[0]]
            return parse_balancete_padrao_column(grid, first_col)
    found = _find_header(grid)
    if not found:
        return {
            "kind": "exito",
            "contas": [],
            "totais": {},
            "hasValores": False,
        }
    header_idx, cols = found
    class_col = cols.get("classificacao", cols.get("codigo_interno", 1))
    desc_col = cols.get("descricao", 3)
    contas: list[dict] = []

    for raw in (grid.rows or [])[header_idx + 1 :]:
        cells = list(raw or [])
        if not cells:
            continue
        codigo = str(cells[class_col] if class_col < len(cells) else "").strip()
        if not _ACCOUNT_RE.match(codigo):
            continue
        descricao = str(cells[desc_col] if desc_col < len(cells) else "").strip()
        if not descricao:
            continue
        low = _fold(descricao)
        if "sistema licenciado" in low or "cpf:" in low or "crc" in low:
            continue
        saldo_ant = _to_float(cells[cols["saldoAnterior"]]) if "saldoAnterior" in cols and cols["saldoAnterior"] < len(cells) else None
        debito = _to_float(cells[cols["debito"]]) if "debito" in cols and cols["debito"] < len(cells) else None
        credito = _to_float(cells[cols["credito"]]) if "credito" in cols and cols["credito"] < len(cells) else None
        saldo_atual = _to_float(cells[cols["saldoAtual"]]) if "saldoAtual" in cols and cols["saldoAtual"] < len(cells) else None
        contas.append(
            {
                "codigo": codigo,
                "descricao": descricao,
                "nivel": codigo.count(".") + 1,
                "grupo": _grupo(codigo),
                "saldoAnterior": saldo_ant,
                "debito": debito,
                "credito": credito,
                "saldoAtual": saldo_atual,
            }
        )

    by_code = {c["codigo"]: c for c in contas}
    totais = {
        "ativo": (by_code.get("1") or {}).get("saldoAtual"),
        "passivo": (by_code.get("2") or {}).get("saldoAtual"),
        "resultado": (by_code.get("3") or {}).get("saldoAtual"),
        "debitos": round(sum(float(c.get("debito") or 0) for c in contas if c["nivel"] == 1), 2),
        "creditos": round(sum(float(c.get("credito") or 0) for c in contas if c["nivel"] == 1), 2),
        "contas": len(contas),
    }

    return {
        "kind": "exito",
        "contas": contas,
        "totais": totais,
        "hasValores": any(c.get("saldoAtual") is not None for c in contas),
    }
