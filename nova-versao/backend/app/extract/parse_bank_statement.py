from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

from app.extract.workbook import WorkbookGrid, load_all_sheets

MONEY_STEP = Decimal("0.01")


class BankStatementError(ValueError):
    pass


def _fold(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
    return re.sub(r"\s+", " ", text)


def normalize_bank_key(value: str) -> str:
    return _fold(value).replace(" ", "-")[:180]


def parse_br_money(value: object) -> Decimal:
    if isinstance(value, (int, float, Decimal)):
        return Decimal(str(value)).quantize(MONEY_STEP, rounding=ROUND_HALF_UP)
    raw = str(value or "").strip()
    if not raw:
        raise BankStatementError("Valor vazio")
    negative_parentheses = raw.startswith("(") and raw.endswith(")")
    text = raw.replace("R$", "").replace("\u00a0", "").replace(" ", "")
    text = re.sub(r"[^0-9,\.\-]", "", text)
    if not text or text in {"-", ",", "."}:
        raise BankStatementError(f"Valor inválido: {raw}")
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    elif text.count(".") > 1:
        text = text.replace(".", "")
    try:
        amount = Decimal(text)
    except InvalidOperation as exc:
        raise BankStatementError(f"Valor inválido: {raw}") from exc
    if negative_parentheses:
        amount = -abs(amount)
    return amount.quantize(MONEY_STEP, rounding=ROUND_HALF_UP)


def parse_transaction_date(value: object) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raw = str(value or "").strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise BankStatementError(f"Data inválida: {raw or 'vazia'}")


def _find_header(grid: WorkbookGrid) -> int:
    for idx, row in enumerate(grid.rows[:40]):
        cells = [_fold(cell) for cell in (row[:7] + [""] * 7)[:7]]
        if (
            cells[0] == "data"
            and cells[1] == "debito"
            and cells[2] == "credito"
            and cells[3] == "valor"
            and cells[4] == "historico"
            and "nota" in cells[5]
            and cells[6] == "classificacao exito"
        ):
            return idx
    raise BankStatementError(
        "Cabeçalho não reconhecido. Esperado: Data, Débito, Crédito, Valor, Histórico, Nº Nota e Classificação Êxito."
    )


def _header_value(grid: WorkbookGrid, label: str) -> str:
    wanted = _fold(label)
    for row in grid.rows[:20]:
        for cell in row:
            text = str(cell or "").strip()
            if _fold(text).startswith(wanted):
                parts = text.split(":", 1)
                return parts[1].strip() if len(parts) == 2 else ""
    return ""


def _competencia(raw: str) -> str:
    match = re.search(r"\b(0[1-9]|1[0-2])/(\d{4})\b", raw or "")
    if not match:
        raise BankStatementError("Competência não identificada no cabeçalho")
    return f"{match.group(2)}-{match.group(1)}"


def parse_bank_statement(path: str | Path, data: bytes | None = None) -> dict:
    sheets = load_all_sheets(path, data)
    if len(sheets) != 1:
        raise BankStatementError("A conciliação bancária deve ter apenas uma aba")
    grid = sheets[0]
    if grid.kind != "xlsx":
        raise BankStatementError("Formato inválido. Envie uma planilha .xlsx")

    header_idx = _find_header(grid)
    bank_name = _header_value(grid, "Banco")
    if not bank_name:
        raise BankStatementError("Banco não identificado no cabeçalho")
    competencia = _competencia(_header_value(grid, "Competência"))
    expected_year, expected_month = (int(part) for part in competencia.split("-"))

    transactions: list[dict] = []
    errors: list[str] = []
    totals = {"in": Decimal("0"), "out": Decimal("0"), "balance": Decimal("0")}
    by_classification: dict[str, dict[str, Decimal | int]] = defaultdict(
        lambda: {"count": 0, "total": Decimal("0"), "net": Decimal("0")}
    )

    for row_number, row in enumerate(grid.rows[header_idx + 1 :], start=header_idx + 2):
        values = (row[:7] + [""] * 7)[:7]
        if not any(str(value or "").strip() for value in values):
            continue
        try:
            tx_date = parse_transaction_date(values[0])
            amount = parse_br_money(values[3])
        except BankStatementError as exc:
            errors.append(f"Linha {row_number}: {exc}")
            continue
        if tx_date.year != expected_year or tx_date.month != expected_month:
            errors.append(
                f"Linha {row_number}: data {tx_date.strftime('%d/%m/%Y')} fora da competência {competencia}"
            )
            continue
        classification = str(values[6] or "").strip()
        class_label = classification or "Sem classificação"
        absolute = abs(amount)
        totals["balance"] += amount
        if amount >= 0:
            totals["in"] += amount
        else:
            totals["out"] += absolute
        by_classification[class_label]["count"] = int(by_classification[class_label]["count"]) + 1
        by_classification[class_label]["total"] = Decimal(str(by_classification[class_label]["total"])) + absolute
        by_classification[class_label]["net"] = Decimal(str(by_classification[class_label]["net"])) + amount
        transactions.append(
            {
                "row_number": row_number,
                "transaction_date": tx_date,
                "debit_account": str(values[1] or "").strip(),
                "credit_account": str(values[2] or "").strip(),
                "amount": amount,
                "history": str(values[4] or "").strip(),
                "note_number": str(values[5] or "").strip(),
                "exito_classification": classification,
            }
        )

    if errors:
        preview = "; ".join(errors[:8])
        if len(errors) > 8:
            preview += f"; e mais {len(errors) - 8} erro(s)"
        raise BankStatementError(preview)
    if not transactions:
        raise BankStatementError("A planilha não contém lançamentos após o cabeçalho")

    classifications = [
        {
            "label": label,
            "count": int(values["count"]),
            "total": Decimal(str(values["total"])).quantize(MONEY_STEP),
            "net": Decimal(str(values["net"])).quantize(MONEY_STEP),
        }
        for label, values in by_classification.items()
    ]
    classifications.sort(key=lambda item: (-int(item["count"]), str(item["label"])))
    return {
        "sheet": grid.sheet_name,
        "bank_name": bank_name,
        "bank_key": normalize_bank_key(bank_name),
        "competencia": competencia,
        "transactions": transactions,
        "row_count": len(transactions),
        "unclassified_count": sum(1 for tx in transactions if not tx["exito_classification"]),
        "total_in": totals["in"].quantize(MONEY_STEP),
        "total_out": totals["out"].quantize(MONEY_STEP),
        "balance": totals["balance"].quantize(MONEY_STEP),
        "classifications": classifications,
    }
