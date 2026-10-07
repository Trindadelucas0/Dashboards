"""Demonstrativo de margens de venda por mês (ODS disfarçado de .xls)."""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.extract.workbook import WorkbookGrid

_COMPANY_ID = "schumacher"


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
        if _col(hmap, "mes", "mês") is not None and _col(hmap, "ano") is not None:
            if _col(hmap, "total vendas", "total") is not None:
                return hmap, i
    return None


def is_margem_mes(sheets: list[WorkbookGrid]) -> bool:
    if not sheets:
        return False
    for grid in sheets:
        if _grid_header(grid):
            return True
    return False


def _year_from_filename(filename: str) -> str:
    m = re.search(r"(20\d{2})", filename or "")
    return m.group(1) if m else "2026"


def _parse_rows(grid: WorkbookGrid, filename: str) -> tuple[list[dict], list[str]]:
    found = _grid_header(grid)
    if not found:
        return [], ["Cabeçalho Mês/Ano/Total Vendas não encontrado"]
    hmap, header_i = found
    c_mes = _col(hmap, "mes", "mês")
    c_ano = _col(hmap, "ano")
    c_qtde = _col(hmap, "qtde", "qtd")
    c_av = _col(hmap, "a vista", "valor_av")
    c_ap = _col(hmap, "a prazo", "valor_ap")
    c_total = _col(hmap, "total vendas", "valor", "total")
    c_custo = _col(hmap, "custo total", "custo_total")
    c_lb = _col(hmap, "lucro brt", "lucro bruto", "lucro_bruto")
    c_ll = _col(hmap, "lucro liq", "lucro liquido", "lucro_liquido")
    c_mb = _col(hmap, "margem brt", "margem bruta")
    c_ml = _col(hmap, "margem lqd", "margem liquida", "margem lqd")
    errors: list[str] = []
    parts: list[dict] = []
    for row in (grid.rows or [])[header_i + 1 :]:
        mm_raw = _cell(row, c_mes)
        if not mm_raw or not re.fullmatch(r"\d{1,2}", mm_raw):
            continue
        mm = int(mm_raw)
        if mm < 1 or mm > 12:
            continue
        year = _cell(row, c_ano) or _year_from_filename(filename)
        if not re.fullmatch(r"20\d{2}", str(year)):
            year = _year_from_filename(filename)
        competencia = f"{year}-{mm:02d}"
        a_vista = _money(_cell(row, c_av))
        a_prazo = _money(_cell(row, c_ap))
        total = _money(_cell(row, c_total))
        if total <= 0 and (a_vista or a_prazo):
            total = round(a_vista + a_prazo, 2)
        resumo = {
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
        parts.append(
            {
                "competencia": competencia,
                "resumo": resumo,
            }
        )
    if not parts:
        errors.append("Nenhuma linha de mês válida")
    return parts, errors


def extract_margem_mes(sheets: list[WorkbookGrid], filename: str) -> dict:
    grid = sheets[0]
    parser = grid.kind if grid else "ods"
    month_parts, parse_errors = _parse_rows(grid, filename)
    parts: list[dict] = []
    for block in month_parts:
        comp = block["competencia"]
        resumo = block["resumo"]
        parts.append(
            {
                "file": filename,
                "parser": parser,
                "tipo": "margem_mes",
                "sheet": grid.sheet_name,
                "cnpj": "",
                "razao": "Industria Schumacher",
                "competencia": comp,
                "period": "",
                "company_id": _COMPANY_ID,
                "company_label": "Indústria Schumacher",
                "unidade": "matriz",
                "errors": [],
                "warnings": [],
                "pack_patch": {
                    "margemMes": {
                        "fonte": "margem_mes",
                        "resumo": resumo,
                    }
                },
                "lines": [],
                "meta": {"total": resumo.get("total"), "competencia": comp},
                "status": "ok",
            }
        )
    errors = list(parse_errors)
    ok_parts = [p for p in parts if not p.get("errors")]
    return {
        "file": filename,
        "sheet": grid.sheet_name,
        "parser": parser,
        "tipo": "margem_mes",
        "cnpj": "",
        "razao": "Industria Schumacher",
        "competencia": "",
        "period": "",
        "company_id": _COMPANY_ID,
        "company_label": "Indústria Schumacher",
        "unidade": "matriz",
        "errors": errors,
        "warnings": [],
        "pack_patch": None,
        "lines": [],
        "meta": {"partsCount": len(parts), "okParts": len(ok_parts)},
        "parts": parts,
    }


def merge_margem_mes(packs: list[dict]) -> dict | None:
    blocos = []
    for p in packs:
        mm = p.get("margemMes")
        if isinstance(mm, dict) and isinstance(mm.get("resumo"), dict):
            blocos.append(mm["resumo"])
    if not blocos:
        return None
    keys_sum = ("qtde", "aVista", "aPrazo", "total", "custo", "lucroBruto", "lucroLiquido")
    resumo: dict[str, float] = {}
    for key in keys_sum:
        resumo[key] = round(sum(float(b.get(key) or 0) for b in blocos), 2)
    total = float(resumo.get("total") or 0)
    resumo["margBruta"] = round(float(resumo.get("lucroBruto") or 0) / total, 6) if total else 0.0
    resumo["margLiquida"] = round(float(resumo.get("lucroLiquido") or 0) / total, 6) if total else 0.0
    return {"fonte": "margem_mes", "resumo": resumo}
