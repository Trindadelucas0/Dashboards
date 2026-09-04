"""Parser da planilha 'APURAÇÃO 5005' (memória ICMS Decreto 5005 / Baifer)."""

from __future__ import annotations

import re
import unicodedata

from app.extract.classify import MMYYYY_RE, MM_SEP_YYYY_RE, competencia_from_filename, parse_br_number
from app.extract.workbook import WorkbookGrid

LABEL_MAP = {
    "debito original": "debitoOriginal",
    "credito original": "creditoOriginal",
    "debitos 5005": "debitos5005",
    "creditos 5005": "creditos5005",
    "debito fora": "debitoFora",
    "credito fora": "creditoFora",
    "credito outorgado": "creditoOutorgado",
    "icms a recolher": "icmsARecolher",
    "ganho receita de subvencao": "ganhoReceitaSubvencao",
}


def _fold(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text or "")
    ascii_txt = "".join(ch for ch in nfkd if not unicodedata.combining(ch)).lower()
    return re.sub(r"\s+", " ", ascii_txt).strip()


def is_apuracao_5005(grid: WorkbookGrid, filename: str = "") -> bool:
    file_l = _fold(filename)
    if "5005" in file_l and "apura" in file_l:
        return True
    if "5005" in file_l:
        return True
    labels = {_fold(str(row[0])) for row in (grid.rows or []) if row}
    hits = sum(1 for key in ("debito original", "credito original", "debitos 5005", "icms a recolher") if key in labels)
    return hits >= 2


def parse_apuracao_5005(grid: WorkbookGrid, filename: str = "") -> dict:
    values: dict[str, float] = {}
    totals: list[float] = []
    for row in grid.rows or []:
        if not row:
            continue
        label = _fold(str(row[0] if len(row) > 0 else ""))
        if not label:
            continue
        raw = row[1] if len(row) > 1 else ""
        num = parse_br_number(str(raw)) if not isinstance(raw, (int, float)) else float(raw)
        if num is None:
            continue
        if label == "total":
            totals.append(round(float(num), 2))
            continue
        key = LABEL_MAP.get(label)
        if key:
            values[key] = round(float(num), 2)

    # Associar TOTAIS na ordem dos blocos (original, 5005, fora)
    if len(totals) >= 1 and "totalOriginal" not in values:
        values["totalOriginal"] = totals[0]
    if len(totals) >= 2 and "total5005" not in values:
        values["total5005"] = totals[1]
    if len(totals) >= 3 and "totalFora" not in values:
        values["totalFora"] = totals[2]

    # Fallbacks de total quando a planilha não trouxe a linha TOTAL
    if "totalOriginal" not in values and "debitoOriginal" in values and "creditoOriginal" in values:
        values["totalOriginal"] = round(values["debitoOriginal"] + values["creditoOriginal"], 2)
    if "total5005" not in values and "debitos5005" in values and "creditos5005" in values:
        values["total5005"] = round(values["debitos5005"] - values["creditos5005"], 2)
    if (
        "totalFora" not in values
        and "debitoFora" in values
        and "creditoFora" in values
        and "creditoOutorgado" in values
    ):
        values["totalFora"] = round(
            values["debitoFora"] - values["creditoFora"] - values["creditoOutorgado"],
            2,
        )
    # TOTAL=0 no bloco original é ruído comum — recalcula débito+crédito
    if (
        values.get("totalOriginal") == 0
        and "debitoOriginal" in values
        and "creditoOriginal" in values
        and (values["debitoOriginal"] or values["creditoOriginal"])
    ):
        values["totalOriginal"] = round(values["debitoOriginal"] + values["creditoOriginal"], 2)

    competencia = competencia_from_filename(filename) or ""
    if not competencia:
        for m in (MMYYYY_RE.search(filename or ""), MM_SEP_YYYY_RE.search(filename or "")):
            if m:
                competencia = f"{m.group(2)}-{m.group(1)}"
                break

    tot5005 = values.get("total5005")
    tot_fora = values.get("totalFora")
    icms = values.get("icmsARecolher")
    formula_icms = "Total 5005 + Total fora = ICMS a recolher"
    if tot5005 is not None and tot_fora is not None and icms is not None:
        formula_icms = f"{tot5005:,.2f} + ({tot_fora:,.2f}) = {icms:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    linhas_spec = (
        ("debitoOriginal", "Débito original", "movimento", ""),
        ("creditoOriginal", "Crédito original", "", ""),
        ("totalOriginal", "TOTAL original", "débito + crédito", "total"),
        ("debitos5005", "Débitos 5005", "", ""),
        ("creditos5005", "Créditos 5005", "", ""),
        ("total5005", "TOTAL 5005", "débitos − créditos", "total"),
        ("debitoFora", "Débito fora", "", ""),
        ("creditoFora", "Crédito fora", "", ""),
        ("creditoOutorgado", "Crédito outorgado", "", ""),
        ("totalFora", "TOTAL fora", "déb. − créd. − outorgado", "total"),
        ("icmsARecolher", "ICMS a recolher", "= tot5005 + totFora", "resultado"),
        ("ganhoReceitaSubvencao", "Ganho receita de subvenção", "receita (DRE)", "subvencao"),
    )
    linhas = [
        {"key": key, "label": label, "papel": papel, "kind": kind, "valor": values[key]}
        for key, label, papel, kind in linhas_spec
        if key in values
    ]

    return {
        "kind": "apuracao_5005",
        "competencia": competencia,
        "hasValores": "icmsARecolher" in values or "debitoOriginal" in values,
        "formulaIcms": formula_icms,
        "linhas": linhas,
        **values,
    }


def apuracao_patch_from_5005(parsed: dict) -> dict:
    """Grava memoriaCalculo e alinha ICMS a recolher + subvenção na apuração."""
    memoria = {k: v for k, v in parsed.items() if k not in ("kind",)}
    memoria["fonte"] = "apuracao_5005"
    icms: dict = {"fonte": "apuracao_5005"}
    if "icmsARecolher" in parsed:
        icms["aRecolher"] = float(parsed["icmsARecolher"])
    if "debitoOriginal" in parsed:
        icms["apurado"] = float(parsed["debitoOriginal"])
    if "creditoOriginal" in parsed:
        icms["credito"] = float(parsed["creditoOriginal"])
    patch: dict = {
        "memoriaCalculo": memoria,
        "apuracao": {"icms": icms, "fonte": "apuracao_5005"},
    }
    if "ganhoReceitaSubvencao" in parsed:
        patch["apuracao"]["subvencao"] = float(parsed["ganhoReceitaSubvencao"])
        patch["subvencao"] = float(parsed["ganhoReceitaSubvencao"])
    return patch
