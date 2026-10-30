from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timedelta

from app.extract.workbook import WorkbookGrid


SOURCE = "simples_nacional_exito"
ALLOWED_ESTABLISHMENTS: dict[str, tuple[str, ...]] = {
    "44": ("dauto", "servicos"),
    "45": ("vet", "luziania"),
    "56": ("etica",),
    "67": ("mercado", "aguas", "claras"),
}


def _fold(value: object) -> str:
    text = str(value or "").replace("\ufffd", "")
    nfkd = unicodedata.normalize("NFKD", text)
    plain = "".join(ch for ch in nfkd if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", plain.lower()).strip()


def _clean_display(value: str) -> str:
    text = str(value or "")
    repairs = {
        "Loca��o": "Locação",
        "M�veis": "Móveis",
        "Presta��o": "Prestação",
        "Servi�os": "Serviços",
        "n�o": "não",
        "Se��o": "Seção",
        "Resolu��o": "Resolução",
        "reten��o": "retenção",
        "substitui��o": "substituição",
        "pr�prio": "próprio",
        "Munic�pio": "Município",
        "� 5�-C": "§ 5º-C",
        "� 1�": "§ 1º",
    }
    for broken, repaired in repairs.items():
        text = text.replace(broken, repaired)
    return re.sub(r"\s+", " ", text.replace("\ufffd", "")).strip()


def _num(value: object) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    text = text.replace("R$", "").replace("%", "").replace(" ", "")
    if re.fullmatch(r"-?\d{1,3}(?:\.\d{3})*,\d+", text):
        text = text.replace(".", "").replace(",", ".")
    else:
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _row_text(row: list[str]) -> str:
    return _fold(" ".join(str(cell or "").strip() for cell in row if str(cell or "").strip()))


def _first_text(row: list[str]) -> str:
    for cell in row:
        if str(cell or "").strip():
            return _fold(cell)
    return ""


def _find_row(grid: WorkbookGrid, *needles: str) -> tuple[int, list[str]] | tuple[None, None]:
    wanted = tuple(_fold(item) for item in needles)
    for index, row in enumerate(grid.rows):
        text = _row_text(row)
        if all(item in text for item in wanted):
            return index, row
    return None, None


def _numbers(row: list[str], start: int = 0, end: int | None = None) -> list[tuple[int, float]]:
    out: list[tuple[int, float]] = []
    for index, value in enumerate(row[start:end], start=start):
        parsed = _num(value)
        if parsed is not None:
            out.append((index, parsed))
    return out


def _last_number(row: list[str]) -> float | None:
    values = _numbers(row)
    return values[-1][1] if values else None


def _excel_month(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    for pattern in (r"(\d{2})/(\d{2})/(\d{4})", r"(\d{2})/(\d{4})", r"(\d{4})-(\d{2})"):
        match = re.search(pattern, text)
        if not match:
            continue
        if pattern.startswith("(\\d{4})"):
            return f"{match.group(1)}-{match.group(2)}"
        if len(match.groups()) == 3:
            return f"{match.group(3)}-{match.group(2)}"
        return f"{match.group(2)}-{match.group(1)}"
    serial = _num(text)
    if serial is None or serial < 1:
        return ""
    try:
        date = datetime(1899, 12, 30) + timedelta(days=serial)
    except (OverflowError, ValueError):
        return ""
    return date.strftime("%Y-%m")


def _metric_row(grid: WorkbookGrid, predicate) -> list[str] | None:
    for row in grid.rows:
        first = _first_text(row)
        if predicate(first):
            return row
    return None


def _market_columns(grid: WorkbookGrid) -> tuple[int | None, int | None, int | None]:
    _index, row = _find_row(grid, "mercado interno", "mercado externo", "total")
    if row is None:
        return None, None, None
    internal = external = total = None
    for index, cell in enumerate(row):
        label = _fold(cell)
        if "mercado interno" in label:
            internal = index
        elif "mercado externo" in label:
            external = index
        elif label == "total":
            total = index
    return internal, external, total


def _market_values(row: list[str] | None, columns: tuple[int | None, int | None, int | None]) -> dict:
    if row is None:
        return {"mercadoInterno": None, "mercadoExterno": None, "total": None}
    values = []
    for column in columns:
        values.append(_num(row[column]) if column is not None and column < len(row) else None)
    total = values[2]
    if total is None and any(value is not None for value in values[:2]):
        total = round(sum(value or 0 for value in values[:2]), 2)
    return {"mercadoInterno": values[0], "mercadoExterno": values[1], "total": total}


def _text_after_label(
    grid: WorkbookGrid,
    label: str,
    include_continuation: bool = False,
    first_only: bool = False,
) -> str:
    index, row = _find_row(grid, label)
    if row is None:
        return ""
    first_nonempty = next((i for i, cell in enumerate(row) if str(cell or "").strip()), 0)
    parts = [str(cell).strip() for cell in row[first_nonempty + 1 :] if str(cell or "").strip()]
    if first_only:
        return _clean_display(parts[0]) if parts else ""
    if include_continuation and index is not None and index + 1 < len(grid.rows):
        next_row = grid.rows[index + 1]
        if not str(next_row[0] if next_row else "").strip():
            parts.extend(str(cell).strip() for cell in next_row if str(cell or "").strip())
    return _clean_display(" ".join(parts))


def _labeled_number(grid: WorkbookGrid, label: str) -> float | None:
    _index, row = _find_row(grid, label)
    if row is None:
        return None
    found = _last_number(row)
    if found is not None:
        return found
    match = re.search(r"-?\d+(?:[.,]\d+)?", " ".join(str(cell or "") for cell in row))
    return _num(match.group(0)) if match else None


def is_simples_nacional_exito(grid: WorkbookGrid) -> bool:
    text = _fold(" ".join(_row_text(row) for row in grid.rows[:40]))
    return all(
        marker in text
        for marker in (
            "simples nacional",
            "total de receitas brutas",
            "partilha",
            "simples nacional a recolher",
        )
    )


def is_allowed_simples_unit(establishment: str, unit_label: str) -> bool:
    expected = ALLOWED_ESTABLISHMENTS.get(str(establishment or "").strip())
    if not expected:
        return False
    folded = _fold(unit_label)
    return folded.startswith(str(establishment)) and all(token in folded for token in expected)


def parse_simples_nacional_exito(grid: WorkbookGrid) -> dict:
    columns = _market_columns(grid)
    rpa_row = _metric_row(grid, lambda first: "regime de competencia" in first)
    rbt12_row = _metric_row(grid, lambda first: "rbt12" in first)
    rba_current_row = _metric_row(grid, lambda first: "corrente" in first and "rba" in first)
    rba_previous_row = _metric_row(grid, lambda first: "anterior" in first and "rba" in first)

    period_row = _metric_row(grid, lambda first: first.startswith("per") and len(first) <= 12)
    competencia = ""
    if period_row:
        for cell in period_row[1:]:
            competencia = _excel_month(cell)
            if competencia:
                break

    establishment = ""
    _index, establishment_row = _find_row(grid, "estabelecimento")
    if establishment_row:
        for _column, value in _numbers(establishment_row):
            digits = str(int(value))
            if digits in ALLOWED_ESTABLISHMENTS:
                establishment = digits
                break

    revenue_row_index, revenue_row = _find_row(grid, "receita tributada total")
    revenue_total = aliquota = das_total = None
    if revenue_row is not None:
        revenue_numbers = _numbers(revenue_row)
        if revenue_numbers:
            revenue_total = revenue_numbers[0][1]
        row_labels = [_fold(cell) for cell in revenue_row]
        aliquota_col = next((i for i, cell in enumerate(row_labels) if cell.startswith("aliquota")), None)
        das_col = next((i for i, cell in enumerate(row_labels) if "simples nacional total" in cell), None)
        if aliquota_col is not None:
            aliquota = next((value for col, value in revenue_numbers if col > aliquota_col), None)
        if das_col is not None:
            das_total = next((value for col, value in revenue_numbers if col > das_col), None)

    part_index, part_header = _find_row(grid, "partilha")
    part_values = None
    if part_index is not None:
        for row in grid.rows[part_index + 1 :]:
            if _first_text(row).rstrip(":") == "valor":
                part_values = row
                break
    partilha: dict[str, float] = {}
    if part_header is not None and part_values is not None:
        key_map = {
            "irpj": "irpj",
            "csll": "csll",
            "cofins": "cofins",
            "pis": "pis",
            "inss/cpp": "inss",
            "inss": "inss",
            "icms": "icms",
            "iss": "iss",
        }
        for column, cell in enumerate(part_header):
            label = _fold(cell)
            key = next((mapped for source, mapped in key_map.items() if source == label), None)
            if key and column < len(part_values):
                value = _num(part_values[column])
                if value is not None:
                    partilha[key] = round(value, 2)

    ajustes = {
        "outrosAcrescimos": _labeled_number(grid, "outros acrescimos"),
        "outrasDeducoes": _labeled_number(grid, "outras deducoes"),
        "valorDiferido": _labeled_number(grid, "valor diferido"),
        "valorFixoIcms": _labeled_number(grid, "valor fixo icms"),
        "valorFixoIss": _labeled_number(grid, "valor fixo iss"),
    }

    if das_total is None:
        das_total = _labeled_number(grid, "simples nacional a recolher")

    result = {
        "competencia": competencia,
        "estabelecimentoCodigo": establishment,
        "rpa": _market_values(rpa_row, columns),
        "rbt12": _market_values(rbt12_row, columns),
        "rbaAtual": _market_values(rba_current_row, columns),
        "rbaAnterior": _market_values(rba_previous_row, columns),
        "faixa": _text_after_label(grid, "faixa de enquadramento", first_only=True),
        "fatorR": _labeled_number(grid, "fator r"),
        "anexo": _text_after_label(grid, "anexo"),
        "secao": _text_after_label(grid, "secao", include_continuation=True),
        "tabela": _text_after_label(grid, "tabela"),
        "receitaTributadaTotal": revenue_total,
        "aliquota": aliquota,
        "das": das_total,
        "partilha": partilha,
        "ajustes": ajustes,
        "fonte": SOURCE,
        "sourceRow": revenue_row_index,
    }

    errors: list[str] = []
    if establishment not in ALLOWED_ESTABLISHMENTS:
        errors.append("Estabelecimento fora do escopo permitido (44, 45, 56 ou 67)")
    if not competencia:
        errors.append("Competência não identificada na linha Período")
    base = result["rpa"].get("total")
    if base is None:
        errors.append("Receita do período (RPA) não identificada")
    if aliquota is None:
        errors.append("Alíquota efetiva não identificada")
    if das_total is None:
        errors.append("Simples Nacional a recolher não identificado")
    if base is not None and aliquota is not None and das_total is not None:
        expected = round(float(base) * float(aliquota) / 100, 2)
        if abs(expected - float(das_total)) >= 0.02:
            errors.append(
                f"DAS não confere com RPA × alíquota: esperado {expected:.2f}, planilha {float(das_total):.2f}"
            )
    if partilha and das_total is not None:
        part_sum = round(sum(partilha.values()), 2)
        if abs(part_sum - float(das_total)) >= 0.02:
            errors.append(
                f"Partilha não confere com o DAS: soma {part_sum:.2f}, DAS {float(das_total):.2f}"
            )
    result["errors"] = errors
    result["hasValores"] = das_total is not None and base is not None
    return result


def simples_pack_patch(parsed: dict, *, cnpj: str, razao: str) -> dict:
    rpa = parsed.get("rpa") or {}
    base = rpa.get("total")
    aliquota = parsed.get("aliquota")
    das = parsed.get("das")
    memoria = {
        key: value
        for key, value in parsed.items()
        if key not in {"errors", "hasValores", "sourceRow"}
    }
    memoria.update(
        {
            "regime": "Simples Nacional",
            "cnpj": cnpj,
            "razaoSocial": razao,
            "baseMemoria": base,
        }
    )
    return {
        "apuracao": {
            "das": {
                "baseCalculo": base,
                "aliquota": aliquota,
                "apurado": das,
                "aRecolher": das,
                "fonte": SOURCE,
            },
        },
        "memoriaSimples": memoria,
    }
