from __future__ import annotations

import re
import unicodedata
from datetime import datetime

from app.companies import CompanyReg, find_by_cnpj, find_by_name, only_digits
from app.extract.workbook import WorkbookGrid

CNPJ_FMT_RE = re.compile(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}")
PERIOD_RE = re.compile(
    r"(\d{2})/(\d{2})/(\d{4})\s*(?:até|ate|-)\s*(\d{2})/(\d{2})/(\d{4})",
    re.I,
)
COMP_DATE_RE = re.compile(r"compet[eê]ncia\s*:?\s*(\d{2})/(\d{2})/(\d{4})", re.I)
DRE_EM_RE = re.compile(
    r"demonstra[cç][aã]o do resultado(?: do exerc[ií]cio)?\s+em\s+(\d{2})/(\d{2})/(\d{4})",
    re.I,
)
TRIMESTRE_RE = re.compile(
    r"([1-4])\s*[ºoª°]?\s*trimestre\s*(?:de\s*)?(20\d{2})",
    re.I,
)
MMYYYY_RE = re.compile(r"(0[1-9]|1[0-2])(20\d{2})")
MM_SEP_YYYY_RE = re.compile(r"(0[1-9]|1[0-2])[-./](20\d{2})")
CFOP_RE = re.compile(r"^(\d)[.\-]?(\d{3})$")
_MES = (
    r"jan(?:eiro)?|fev(?:ereiro)?|mar(?:[cç]o)?|abr(?:il)?|mai(?:o)?|"
    r"jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|"
    r"nov(?:embro)?|dez(?:embro)?"
)
RANGE_NAME_RE = re.compile(rf"({_MES})\s*a\s*({_MES})", re.I)
RANGE_ERROR = "Planilha cobre mais de um mês. Envie um arquivo por competência."
EMPTY_FILE_ERROR = "Arquivo vazio ou não baixado. Baixe o arquivo e envie de novo."


def _fold_text(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch)).lower()


def is_dre_filename(name: str) -> bool:
    """D. R. E..xls / DRE 01-2026.xls / Análise Vertical do D. R. E.xls."""
    compact = re.sub(r"[^a-z0-9]+", "", _fold_text(name))
    if compact == "dre" or compact.startswith("dre"):
        return True
    # Análise Vertical do D.R.E. → analiseverticaldodre
    return "analisevertical" in compact and "dre" in compact


def is_balancete_filename(name: str) -> bool:
    compact = re.sub(r"[^a-z0-9]+", "", _fold_text(name))
    return compact == "balancete" or compact.startswith("balancete")


def format_cfop(raw: str, raw_num: float | None = None) -> str:
    t = (raw or "").strip()
    m = re.match(r"^(\d)-(\d{3})$", t)
    if m:
        return t
    m = re.match(r"^(\d)\.(\d{3})$", t)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    m = re.match(r"^(\d)(\d{3})$", t)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    if raw_num is not None:
        n = int(round(float(raw_num)))
        s = str(n)
        if len(s) == 4:
            return f"{s[0]}-{s[1:]}"
    return t


def parse_br_number(text: str) -> float | None:
    s = (text or "").strip()
    if not s:
        return None
    s = s.replace("R$", "").replace(" ", "")
    if re.match(r"^-?\d{1,3}(\.\d{3})*,\d+$", s):
        s = s.replace(".", "").replace(",", ".")
        try:
            return float(s)
        except ValueError:
            return None
    s2 = s.replace(",", ".")
    try:
        return float(s2)
    except ValueError:
        return None


def scan_cnpj(grid: WorkbookGrid) -> str:
    for r in range(min(12, len(grid.rows))):
        row = grid.row(r)
        joined = " ".join(row)
        m = CNPJ_FMT_RE.search(joined)
        if m:
            return only_digits(m.group(0))
        if "cnpj" in joined.lower():
            for cell in row:
                digits = only_digits(cell)
                if len(digits) == 14:
                    return digits
            digits = only_digits(joined)
            if len(digits) == 14:
                return digits
    return ""


def scan_razao(grid: WorkbookGrid) -> str:
    for r in range(min(5, len(grid.rows))):
        row = " ".join(grid.row(r))
        if row and not row.lower().startswith("cnpj"):
            return row[:180]
    return ""


def scan_period(grid: WorkbookGrid) -> tuple[str, str]:
    for r in range(min(12, len(grid.rows))):
        joined = " ".join(grid.row(r))
        m = PERIOD_RE.search(joined)
        if m:
            month, year = m.group(2), m.group(3)
            return f"{year}-{month}", joined
        m = COMP_DATE_RE.search(joined)
        if m:
            return f"{m.group(3)}-{m.group(2)}", joined
        m = DRE_EM_RE.search(joined)
        if m:
            return f"{m.group(3)}-{m.group(2)}", joined
    return "", ""


def period_span_months(grid: WorkbookGrid) -> int:
    for r in range(min(12, len(grid.rows))):
        joined = " ".join(grid.row(r))
        m = PERIOD_RE.search(joined)
        if not m:
            continue
        start_y, start_m = int(m.group(3)), int(m.group(2))
        end_y, end_m = int(m.group(6)), int(m.group(5))
        return (end_y - start_y) * 12 + (end_m - start_m) + 1
    return 0


def is_multi_month_movimento(grid: WorkbookGrid, filename: str) -> bool:
    if RANGE_NAME_RE.search(filename or ""):
        return True
    return period_span_months(grid) > 1


def competencia_from_filename(name: str) -> str:
    m = TRIMESTRE_RE.search(name)
    if m:
        quarter = int(m.group(1))
        return f"{m.group(2)}-{quarter * 3:02d}"
    m = MMYYYY_RE.search(name.replace(" ", ""))
    if m:
        return f"{m.group(2)}-{m.group(1)}"
    m = MM_SEP_YYYY_RE.search(name)
    if m:
        return f"{m.group(2)}-{m.group(1)}"
    months = {
        "janeiro": "01",
        "jan": "01",
        "fevereiro": "02",
        "fev": "02",
        "marco": "03",
        "março": "03",
        "mar": "03",
        "abril": "04",
        "abr": "04",
        "maio": "05",
        "mai": "05",
        "junho": "06",
        "jun": "06",
        "julho": "07",
        "jul": "07",
        "agosto": "08",
        "ago": "08",
    }
    low = name.lower()
    for key, mm in months.items():
        if key in low:
            year_m = re.search(r"20\d{2}", name)
            year = year_m.group(0) if year_m else str(datetime.now().year)
            return f"{year}-{mm}"
    return ""


def detect_sheet_tipo(grid: WorkbookGrid, filename: str) -> str:
    name = (grid.sheet_name or "").lower()
    file_l = filename.lower()
    head = " ".join(" ".join(grid.row(r)).lower() for r in range(min(8, len(grid.rows))))
    file_fold = _fold_text(filename)
    labels_fold = _fold_text(" ".join(str(row[0]) for row in (grid.rows or [])[:14] if row))
    if "5005" in file_fold or (
        "debito original" in labels_fold and ("debitos 5005" in labels_fold or "credito outorgado" in labels_fold)
    ):
        return "apuracao_5005"
    if "entrada" in name:
        return "entradas"
    if "acompanhamento de entradas" in _fold_text(head) or "entrada por fornecedor" in file_fold:
        return "entradas"
    if "saida" in name or "saída" in name:
        return "saidas"
    if "demonstrativo do ipi" in head or ("ipi" in file_l and "demonst" in file_l):
        return "ipi"
    # ICMS ST antes do ICMS genérico — filename "Apuração icms st" e aba Demonst. SUBTRI
    head_fold = _fold_text(head)
    name_fold_dots = name.replace(".", " ")
    if (
        "st mensal" in file_l
        or "subtri" in name
        or "icms st" in file_l
        or "icms_st" in file_l
        or "substituicao tributaria" in head_fold
        or "st estados" in name
        or (file_l.startswith("st ") and "valor" in head)
    ):
        return "icms_st"
    if "demonstrativo do icms" in head or "demonst. icms" in name or "demonst icms" in name_fold_dots:
        return "icms"
    if "icms" in file_l and ("apura" in file_l or "demonst" in file_l):
        return "icms"
    if "demonstrativo da apuração do cofins" in head or "demonstrativo da apuracao do cofins" in head:
        return "cofins"
    if "demonstrativo da apuração do pis" in head or "demonstrativo da apuracao do pis" in head:
        return "pis"
    name_fold = name.replace(".", " ")
    if "cof" in name and "pis" not in name:
        return "cofins"
    if "pis" in name and "cof" not in name:
        return "pis"
    if "receitas cumulativas do cofins" in head or ("cofins" in name and "pis" not in name):
        return "cofins"
    if "receitas cumulativas do pis" in head or ("apura" in file_l and "pis" in file_l and "cofins" not in file_l):
        return "pis"
    if "efd" in file_l and ("pis" in file_l or "cofins" in file_l):
        return "cofins" if "cofins" in head or "cofins" in name else "pis"
    if "total fornecedor" in head or ("fornecedor" in head and "entrada" in file_l):
        return "entradas"
    if "total cliente" in head or "cliente" in head:
        return "saidas"
    if (
        is_balancete_filename(file_l)
        or is_balancete_filename(name)
        or "balancete" in _fold_text(head)
    ):
        return "balancete"
    head_fold_full = _fold_text(head)
    labels0 = _fold_text(" ".join(str(row[0]) for row in (grid.rows or [])[:8] if row))
    if (
        "demonstracao do resultado" in head_fold_full
        or is_dre_filename(name)
        or is_dre_filename(file_l)
        or "resultado" in file_l
        or (
            "receita bruta" in labels0
            and ("analise vertical" in head_fold_full or "analise vertical" in _fold_text(name) + _fold_text(file_l))
        )
        or (
            "receita bruta" in labels0
            and re.search(r"(0[1-9]|1[0-2])/20\d{2}", head)
        )
    ):
        return "dre"
    if "irpj" in file_l or "csll" in file_l:
        return "irpj"
    if "imposto" in file_l or "icms" in file_l:
        return "impostos"
    if "entrada" in file_l or "forncedor" in file_l or "fornecedor" in file_l:
        return "entradas"
    if "saida" in file_l or "saída" in file_l or "cliente" in file_l:
        return "saidas"
    return "desconhecido"


def resolve_company(cnpj: str, razao: str, filename: str) -> tuple[CompanyReg | None, str]:
    company, unit = find_by_cnpj(cnpj)
    if company:
        unit_key = unit.key if unit else "matriz"
        low = filename.lower()
        if company.id == "egaplast" and re.search(r"\b61\b|filial", low):
            unit_key = "filial"
        return company, unit_key
    by_name = find_by_name(razao) or find_by_name(filename)
    if by_name:
        unit_key = by_name.units[0].key if by_name.units else "matriz"
        return by_name, unit_key
    return None, ""
