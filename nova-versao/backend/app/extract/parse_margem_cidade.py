"""Demonstrativo de margens de venda por cidade (acumulado jan–set/2026)."""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.extract.workbook import WorkbookGrid

_COMPANY_ID = "schumacher"
_MATRIX_COMP = "2026-09"
_PERIODO_LABEL = "Jan–Set/2026"


def _fold(value: str) -> str:
    nfkd = unicodedata.normalize("NFKD", value or "")
    ascii_txt = "".join(ch for ch in nfkd if not unicodedata.combining(ch)).lower()
    return re.sub(r"\s+", " ", ascii_txt).strip()


def _header_map(row: list[Any]) -> dict[str, int]:
    out: dict[str, int] = {}
    for i, cell in enumerate(row or []):
        key = _fold(str(cell or ""))
        if key and key not in out:
            out[key] = i
    return out


def _col(hmap: dict[str, int], *names: str) -> int | None:
    for name in names:
        key = _fold(name)
        if key in hmap:
            return hmap[key]
    return None


def _cell(row: list[Any], idx: int | None) -> str:
    if idx is None or idx < 0 or idx >= len(row or []):
        return ""
    return str(row[idx] if row[idx] is not None else "").strip()


def _num(raw: str) -> float:
    s = (raw or "").strip().replace(" ", "")
    if not s or s in {"-", "—"}:
        return 0.0
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _money(raw: str) -> float:
    return round(_num(raw), 2)


def _ratio_pct(raw: str) -> float:
    v = _num(raw)
    if abs(v) > 1.5:
        return round(v / 100.0, 6)
    return round(v, 6)


def _grid_header(grid: WorkbookGrid) -> tuple[dict[str, int], int] | None:
    for i, row in enumerate(grid.rows or []):
        hmap = _header_map(row)
        if _col(hmap, "codcidade", "cod cidade") is not None and _col(hmap, "cidade") is not None:
            return hmap, i
    return None


def is_margem_cidade(sheets: list[WorkbookGrid]) -> bool:
    if not sheets:
        return False
    for grid in sheets:
        if _grid_header(grid):
            return True
    return False


def _parse_cidades(grid: WorkbookGrid) -> tuple[list[dict], dict, list[str]]:
    found = _grid_header(grid)
    if not found:
        return [], {}, ["Cabeçalho CODCIDADE/CIDADE não encontrado"]
    hmap, header_i = found
    c_cod = _col(hmap, "codcidade", "cod cidade")
    c_cid = _col(hmap, "cidade")
    c_qtde = _col(hmap, "qtd", "qtde")
    c_av = _col(hmap, "valor_av", "a vista")
    c_ap = _col(hmap, "valor_ap", "a prazo")
    c_total = _col(hmap, "valor", "total vendas")
    c_custo = _col(hmap, "custo_total", "custo total")
    c_lb = _col(hmap, "lucro_bruto", "lucro bruto")
    c_ll = _col(hmap, "lucro_liquido", "lucro liquido")
    c_mb = _col(hmap, "margem brt", "margem bruta")
    c_ml = _col(hmap, "margem lqd", "margem liquida")
    cidades: list[dict] = []
    for row in (grid.rows or [])[header_i + 1 :]:
        cod = _cell(row, c_cod)
        if not cod or not re.fullmatch(r"\d+", cod):
            continue
        cidade = _cell(row, c_cid)
        if not cidade:
            continue
        a_vista = _money(_cell(row, c_av))
        a_prazo = _money(_cell(row, c_ap))
        total = _money(_cell(row, c_total))
        if total <= 0 and (a_vista or a_prazo):
            total = round(a_vista + a_prazo, 2)
        cidades.append(
            {
                "codCidade": cod,
                "cidade": cidade,
                "qtde": round(_num(_cell(row, c_qtde)), 2),
                "aVista": a_vista,
                "aPrazo": a_prazo,
                "total": total,
                "custo": _money(_cell(row, c_custo)),
                "lucroBruto": _money(_cell(row, c_lb)),
                "lucroLiquido": _money(_cell(row, c_ll)),
                "margBruta": _ratio_pct(_cell(row, c_mb)),
                "margLiquida": _ratio_pct(_cell(row, c_ml)),
            }
        )
    errors: list[str] = []
    if not cidades:
        errors.append("Nenhuma cidade válida")
        return [], {}, errors
    resumo_keys = ("qtde", "aVista", "aPrazo", "total", "custo", "lucroBruto", "lucroLiquido")
    resumo: dict[str, float] = {"itens": len(cidades)}
    for key in resumo_keys:
        resumo[key] = round(sum(float(c.get(key) or 0) for c in cidades), 2)
    tot = float(resumo.get("total") or 0)
    resumo["margBruta"] = round(float(resumo.get("lucroBruto") or 0) / tot, 6) if tot else 0.0
    resumo["margLiquida"] = round(float(resumo.get("lucroLiquido") or 0) / tot, 6) if tot else 0.0
    return cidades, resumo, errors


def extract_margem_cidade(sheets: list[WorkbookGrid], filename: str) -> dict:
    grid = sheets[0]
    parser = grid.kind if grid else "ods"
    cidades, resumo, parse_errors = _parse_cidades(grid)
    part_errors = list(parse_errors)
    pack = {
        "margemCidade": {
            "fonte": "margem_cidade",
            "periodoLabel": _PERIODO_LABEL,
            "competenciaMatriz": _MATRIX_COMP,
            "resumo": resumo,
            "cidades": cidades,
        }
    }
    parts = [
        {
            "file": filename,
            "parser": parser,
            "tipo": "margem_cidade",
            "sheet": grid.sheet_name,
            "cnpj": "",
            "razao": "Industria Schumacher",
            "competencia": _MATRIX_COMP,
            "period": _PERIODO_LABEL,
            "company_id": _COMPANY_ID,
            "company_label": "Indústria Schumacher",
            "unidade": "matriz",
            "errors": part_errors,
            "warnings": [],
            "pack_patch": pack,
            "lines": [],
            "meta": {"total": resumo.get("total"), "itens": resumo.get("itens")},
            "status": "ok" if not part_errors else "erro",
        }
    ]
    return {
        "file": filename,
        "sheet": grid.sheet_name,
        "parser": parser,
        "tipo": "margem_cidade",
        "cnpj": "",
        "razao": "Industria Schumacher",
        "competencia": _MATRIX_COMP,
        "period": _PERIODO_LABEL,
        "company_id": _COMPANY_ID,
        "company_label": "Indústria Schumacher",
        "unidade": "matriz",
        "errors": part_errors,
        "warnings": [],
        "pack_patch": None,
        "lines": [],
        "meta": {"partsCount": len(parts), "okParts": 1 if not part_errors else 0, "itens": len(cidades)},
        "parts": parts,
    }
