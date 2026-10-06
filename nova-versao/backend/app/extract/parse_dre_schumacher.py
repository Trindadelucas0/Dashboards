"""DRE comparativo Schumacher (aba Comparativo: Conta × Jan/26–Ago/26 + Acumulado).

Não é Análise Vertical (MM/YYYY) nem planilha padrão (aba DRE). Uma part por mês.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.extract.classify import resolve_company, scan_cnpj, scan_razao
from app.extract.workbook import WorkbookGrid

_MONTH_ABBR = {
    "jan": "01",
    "fev": "02",
    "mar": "03",
    "abr": "04",
    "mai": "05",
    "jun": "06",
    "jul": "07",
    "ago": "08",
    "set": "09",
    "out": "10",
    "nov": "11",
    "dez": "12",
}
_MONTH_RE = re.compile(
    r"^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s*/\s*(\d{2}|\d{4})$",
    re.I,
)

_DRE_L1 = (
    "receita operacional bruta",
    "impostos sobre vendas",
    "deducoes da receita bruta",
    "receita liquida",
    "custos",
    "lucro bruto",
    "despesas operacionais",
    "resultado operacional",
    "receitas financeiras",
    "despesas financeiras",
    "outras receitas operacionais",
    "despesas nao operacionais",
    "resultado antes provisao p/ contribuicao social",
    "lucro ou prejuizo liquido do exercicio",
)
_LUCRO_KEYS = ("lucro bruto", "lucro ou prejuizo liquido do exercicio")
_TOTAL_KEYS = (
    "receita liquida",
    "resultado operacional",
    "resultado antes provisao p/ contribuicao social",
    "resultado antes provisao p/ imposto de renda",
)


def _fold(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text or "")
    ascii_txt = "".join(ch for ch in nfkd if not unicodedata.combining(ch)).lower()
    return re.sub(r"\s+", " ", ascii_txt).strip()


def _norm_label(label: str) -> str:
    folded = _fold(label)
    folded = re.sub(r"^[\(\)=\+\-\/\s–—−-]+", "", folded)
    return re.sub(r"\s+", " ", folded).strip()


def _to_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s or s in ("-", "—", "−"):
        return None
    if "/" in s and re.search(r"[a-zA-Z]", s):
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


def comparativo_sheet(sheets: list[WorkbookGrid]) -> WorkbookGrid | None:
    for grid in sheets or []:
        if _fold(grid.sheet_name) == "comparativo":
            return grid
    return None


def find_month_columns(grid: WorkbookGrid) -> tuple[int, dict[str, int], int | None] | None:
    """Retorna (header_idx, {YYYY-MM: col}, acum_col)."""
    if not grid or not grid.rows:
        return None
    for idx, raw in enumerate(grid.rows[:20]):
        cells = [str(c or "").strip() for c in (raw or [])]
        if not cells:
            continue
        if _fold(cells[0]) != "conta":
            continue
        months: dict[str, int] = {}
        acum: int | None = None
        for col, cell in enumerate(cells):
            folded = _fold(cell).replace("\n", " ")
            m = _MONTH_RE.match(folded.replace(" ", ""))
            if not m:
                m = _MONTH_RE.match(re.sub(r"\s+", "", folded))
            if m:
                mm = _MONTH_ABBR[m.group(1).lower()]
                yy = m.group(2)
                year = yy if len(yy) == 4 else f"20{yy}"
                months[f"{year}-{mm}"] = col
                continue
            if "acumulado" in folded:
                acum = col
        if len(months) >= 2:
            return idx, months, acum
    return None


def _head_blob(grid: WorkbookGrid) -> str:
    return " ".join(_fold(" ".join(grid.row(r))) for r in range(min(8, len(grid.rows or []))))


def is_dre_schumacher(sheets: list[WorkbookGrid]) -> bool:
    grid = comparativo_sheet(sheets)
    if not grid:
        return False
    head = _head_blob(grid)
    if "demonstracao do resultado" not in head:
        return False
    found = find_month_columns(grid)
    return found is not None


def _skip_row(label: str) -> bool:
    folded = _fold(label)
    if not folded:
        return True
    if folded == "conta":
        return True
    if folded.startswith("cnpj"):
        return True
    if "demonstracao do resultado" in folded:
        return True
    if folded.startswith("periodo:") or folded.startswith("valores em"):
        return True
    if folded.startswith("industria schumacher"):
        return True
    return False


def _kind_for(norm: str, is_l1: bool) -> str:
    if norm in _LUCRO_KEYS:
        return "lucro"
    if norm in _TOTAL_KEYS:
        return "total"
    if is_l1:
        return "group"
    return "line"


def _is_deduction(label: str, norm: str) -> bool:
    raw = (label or "").strip()
    if raw.startswith("(-)") or raw.startswith("-"):
        return True
    return norm.startswith(("impostos", "deducoes", "custos", "despesas"))


def _kpi(linhas: list[dict], campo: str) -> float | None:
    want = {
        "receitaBruta": "receita operacional bruta",
        "receitaLiquida": "receita liquida",
        "lucBruto": "lucro bruto",
        "lucLiq": "lucro ou prejuizo liquido do exercicio",
        "lucOperacional": "resultado operacional",
        "cmv": "custos",
    }[campo]
    for ln in linhas:
        if _norm_label(str(ln.get("descricao") or "")) == want:
            val = ln.get("valor")
            return None if val is None else round(float(val), 2)
    return None


def _acum_kpis(linhas: list[dict]) -> dict[str, float | None]:
    want = {
        "receitaBruta": "receita operacional bruta",
        "receitaLiquida": "receita liquida",
        "lucBruto": "lucro bruto",
        "lucLiq": "lucro ou prejuizo liquido do exercicio",
        "lucOperacional": "resultado operacional",
        "cmv": "custos",
    }
    out: dict[str, float | None] = {k: None for k in want}
    for ln in linhas:
        norm = _norm_label(str(ln.get("descricao") or ""))
        for campo, key in want.items():
            if norm == key:
                val = ln.get("acumulado")
                out[campo] = None if val is None else round(float(val), 2)
    return out


def _parse_linhas(grid: WorkbookGrid, header_idx: int, months: dict[str, int], acum_col: int | None) -> list[dict]:
    rows: list[dict] = []
    seen_l1: set[str] = set()
    last_l1 = ""
    for i, raw in enumerate((grid.rows or [])[header_idx + 1 :], start=header_idx + 1):
        label = str((raw or [""])[0] or "").strip()
        if _skip_row(label):
            continue
        nums = [_to_float(raw[c]) if c < len(raw) else None for c in months.values()]
        if all(n is None for n in nums) and (acum_col is None or acum_col >= len(raw) or _to_float(raw[acum_col]) is None):
            continue
        norm = _norm_label(label)
        is_l1 = norm in _DRE_L1 and norm not in seen_l1
        if is_l1:
            seen_l1.add(norm)
            last_l1 = f"{i}:{label}"
        valores = {comp: (_to_float(raw[col]) if col < len(raw) else None) for comp, col in months.items()}
        acum = _to_float(raw[acum_col]) if acum_col is not None and acum_col < len(raw) else None
        rows.append(
            {
                "key": f"{i}:{label}",
                "descricao": label,
                "nivel": 1 if is_l1 else 2,
                "kind": _kind_for(norm, is_l1),
                "deduction": _is_deduction(label, norm),
                "collapseRoot": is_l1,
                "parentKey": "" if is_l1 else last_l1,
                "valores": valores,
                "acumulado": None if acum is None else round(acum, 2),
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


def extract_dre_schumacher(sheets: list[WorkbookGrid], filename: str) -> dict:
    grid = comparativo_sheet(sheets)
    parser = (grid.kind if grid else None) or (sheets[0].kind if sheets else "xlsx")
    if not grid:
        return {
            "file": filename,
            "sheet": "",
            "parser": parser,
            "tipo": "dre_schumacher",
            "cnpj": "",
            "razao": "",
            "competencia": "",
            "period": "",
            "company_id": None,
            "company_label": None,
            "unidade": "matriz",
            "errors": ["Aba Comparativo não encontrada"],
            "warnings": [],
            "pack_patch": None,
            "lines": [],
            "meta": {},
            "parts": [],
        }

    found = find_month_columns(grid)
    cnpj = scan_cnpj(grid)
    razao = scan_razao(grid)
    company, _unit = resolve_company(cnpj, razao, filename)
    errors: list[str] = []
    if not company:
        errors.append("CNPJ/razão não mapeados para nenhuma empresa cadastrada")
    if not found:
        errors.append("Colunas mensais Jan/26 não encontradas na DRE Comparativo")
        return {
            "file": filename,
            "sheet": grid.sheet_name,
            "parser": parser,
            "tipo": "dre_schumacher",
            "cnpj": cnpj,
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
            "meta": {},
            "parts": [],
        }

    header_idx, months, acum_col = found
    parsed = _parse_linhas(grid, header_idx, months, acum_col)
    if not parsed:
        errors.append("Nenhuma linha de conta na DRE Comparativo")

    parts: list[dict] = []
    for competencia in sorted(months):
        linhas = _month_linhas(parsed, competencia)
        rb = _kpi(linhas, "receitaBruta")
        rl = _kpi(linhas, "receitaLiquida")
        luc_bruto = _kpi(linhas, "lucBruto")
        luc_liq = _kpi(linhas, "lucLiq")
        luc_op = _kpi(linhas, "lucOperacional")
        cmv = _kpi(linhas, "cmv")
        acum = _acum_kpis(linhas)
        marg_mb = round(100 * luc_bruto / rb, 2) if rb and luc_bruto is not None else None
        marg_ml = round(100 * luc_liq / rb, 2) if rb and luc_liq is not None else None
        dre = {
            "kind": "schumacher_comparativo",
            "source": filename,
            "sheet": grid.sheet_name,
            "linhas": linhas,
            "receitaBruta": rb,
            "receitaLiquida": rl,
            "lucBruto": luc_bruto,
            "lucLiq": luc_liq,
            "lucOperacional": luc_op,
            "cmv": cmv,
            "margMb": marg_mb,
            "margMl": marg_ml,
            "acumuladoJanAgo": acum,
            "hasValores": any(l.get("valor") is not None for l in linhas),
        }
        parts.append(
            {
                "file": filename,
                "parser": parser,
                "tipo": "dre",
                "sheet": f"DRE {competencia}",
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
                    "hasDre": True,
                    "receitaBruta": rb,
                    "receitaLiquida": rl,
                    "lucBruto": luc_bruto,
                    "lucLiq": luc_liq,
                    "cmv": cmv,
                    "margMb": marg_mb,
                    "margMl": marg_ml,
                    "dre": dre,
                },
                "lines": [],
                "meta": {
                    "hasValores": dre["hasValores"],
                    "receitaBruta": rb,
                    "lucLiq": luc_liq,
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
        "tipo": "dre_schumacher",
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
