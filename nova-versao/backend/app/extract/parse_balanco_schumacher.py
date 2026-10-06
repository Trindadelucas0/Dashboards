"""Balanço Patrimonial comparativo Schumacher (aba Comparativo: Conta × Jan/26–Ago/26).

Não é balancete EXITO (codigo+saldo). Uma part por competência; posição no fim do mês.
"""

from __future__ import annotations

from app.extract.classify import resolve_company, scan_cnpj, scan_razao
from app.extract.parse_dre_schumacher import (
    _fold,
    _norm_label,
    _skip_row,
    _to_float,
    comparativo_sheet,
    find_month_columns,
)
from app.extract.workbook import WorkbookGrid

_BP_L1 = (
    "ativo",
    "ativo circulante",
    "ativo nao circulante",
    "passivo",
    "passivo circulante",
    "passivo nao circulante",
    "patrimonio liquido",
)


def _head_blob(grid: WorkbookGrid) -> str:
    return " ".join(_fold(" ".join(grid.row(r))) for r in range(min(8, len(grid.rows or []))))


def is_balanco_schumacher(sheets: list[WorkbookGrid]) -> bool:
    grid = comparativo_sheet(sheets)
    if not grid:
        return False
    head = _head_blob(grid)
    if "balanco patrimonial" not in head:
        return False
    found = find_month_columns(grid)
    if not found:
        return False
    labels = " ".join(_fold(str((row or [""])[0] or "")) for row in (grid.rows or [])[:20])
    return "ativo" in labels


def _is_diferenca(norm: str) -> bool:
    return "diferenca" in norm and "ativo" in norm and "passivo" in norm


def _parse_linhas(grid: WorkbookGrid, header_idx: int, months: dict[str, int]) -> list[dict]:
    rows: list[dict] = []
    seen_l1: set[str] = set()
    last_l1 = ""
    lado = "ativo"
    for i, raw in enumerate((grid.rows or [])[header_idx + 1 :], start=header_idx + 1):
        label = str((raw or [""])[0] or "").strip()
        if _skip_row(label):
            continue
        nums = [_to_float(raw[c]) if c < len(raw) else None for c in months.values()]
        if all(n is None for n in nums):
            continue
        norm = _norm_label(label)
        if norm == "passivo" and "passivo" not in seen_l1:
            lado = "passivo"
        is_l1 = (norm in _BP_L1 and norm not in seen_l1) or _is_diferenca(norm)
        if is_l1:
            seen_l1.add(norm)
            last_l1 = f"{i}:{label}"
        kind = "total" if _is_diferenca(norm) or norm in ("ativo", "passivo") else (
            "group" if is_l1 else "line"
        )
        valores = {comp: (_to_float(raw[col]) if col < len(raw) else None) for comp, col in months.items()}
        rows.append(
            {
                "key": f"{i}:{label}",
                "descricao": label,
                "nivel": 1 if is_l1 else 2,
                "kind": kind,
                "collapseRoot": is_l1,
                "parentKey": "" if is_l1 else last_l1,
                "lado": lado,
                "valores": valores,
            }
        )
    return rows


def _month_linhas(rows: list[dict], competencia: str) -> list[dict]:
    out = []
    for row in rows:
        item = {k: v for k, v in row.items() if k != "valores"}
        val = (row.get("valores") or {}).get(competencia)
        item["valor"] = None if val is None else round(float(val), 2)
        out.append(item)
    return out


def _totais(linhas: list[dict]) -> dict[str, float | None]:
    out: dict[str, float | None] = {
        "ativo": None,
        "passivo": None,
        "patrimonio": None,
        "diferenca": None,
    }
    for ln in linhas:
        norm = _norm_label(str(ln.get("descricao") or ""))
        val = ln.get("valor")
        if val is None:
            continue
        num = round(float(val), 2)
        if norm == "ativo":
            out["ativo"] = num
        elif norm == "passivo":
            out["passivo"] = num
        elif norm == "patrimonio liquido":
            out["patrimonio"] = num
        elif _is_diferenca(norm):
            out["diferenca"] = num
    return out


def extract_balanco_schumacher(sheets: list[WorkbookGrid], filename: str) -> dict:
    grid = comparativo_sheet(sheets)
    parser = (grid.kind if grid else None) or (sheets[0].kind if sheets else "xlsx")
    empty = {
        "file": filename,
        "sheet": grid.sheet_name if grid else "",
        "parser": parser,
        "tipo": "balanco_schumacher",
        "cnpj": "",
        "razao": "",
        "competencia": "",
        "period": "",
        "company_id": None,
        "company_label": None,
        "unidade": "matriz",
        "errors": [],
        "warnings": [],
        "pack_patch": None,
        "lines": [],
        "meta": {},
        "parts": [],
    }
    if not grid:
        empty["errors"] = ["Aba Comparativo não encontrada"]
        return empty

    found = find_month_columns(grid)
    cnpj = scan_cnpj(grid)
    razao = scan_razao(grid)
    company, _unit = resolve_company(cnpj, razao, filename)
    errors: list[str] = []
    if not company:
        errors.append("CNPJ/razão não mapeados para nenhuma empresa cadastrada")
    if not found:
        errors.append("Colunas mensais Jan/26 não encontradas no Balanço Comparativo")
        empty.update(
            {
                "cnpj": cnpj,
                "razao": razao,
                "company_id": company.id if company else None,
                "company_label": company.label if company else None,
                "errors": errors,
            }
        )
        return empty

    header_idx, months, _acum = found
    parsed = _parse_linhas(grid, header_idx, months)
    if not parsed:
        errors.append("Nenhuma linha de conta no Balanço Comparativo")

    parts: list[dict] = []
    for competencia in sorted(months):
        linhas = _month_linhas(parsed, competencia)
        totais = _totais(linhas)
        parts.append(
            {
                "file": filename,
                "parser": parser,
                "tipo": "balancete",
                "sheet": f"BP {competencia}",
                "cnpj": company.cnpj if company else cnpj,
                "razao": razao,
                "competencia": competencia,
                "period": "",
                "company_id": company.id if company else None,
                "company_label": company.label if company else None,
                "unidade": "matriz",
                "errors": [],
                "warnings": [],
                "pack_patch": {
                    "hasBalancete": True,
                    "balancete": {
                        "kind": "schumacher_bp",
                        "source": filename,
                        "sheet": grid.sheet_name,
                        "linhas": linhas,
                        "totais": totais,
                        "hasValores": any(l.get("valor") is not None for l in linhas),
                    },
                },
                "lines": [],
                "meta": {
                    "ativo": totais.get("ativo"),
                    "passivo": totais.get("passivo"),
                    "diferenca": totais.get("diferenca"),
                    "lineCount": len(linhas),
                },
                "status": "ok",
            }
        )

    ok_parts = [p for p in parts if p.get("status") == "ok"]
    return {
        "file": filename,
        "sheet": grid.sheet_name,
        "parser": parser,
        "tipo": "balanco_schumacher",
        "cnpj": company.cnpj if company else cnpj,
        "razao": razao,
        "competencia": "",
        "period": "",
        "company_id": company.id if company else None,
        "company_label": company.label if company else None,
        "unidade": "matriz",
        "errors": errors,
        "warnings": [],
        "pack_patch": None,
        "lines": [],
        "meta": {"partsCount": len(parts), "okParts": len(ok_parts)},
        "parts": parts,
    }
