from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.extract.workbook import WorkbookGrid

_MES = {
    "janeiro": "01",
    "fevereiro": "02",
    "marco": "03",
    "março": "03",
    "abril": "04",
    "maio": "05",
    "junho": "06",
    "julho": "07",
    "agosto": "08",
    "setembro": "09",
    "outubro": "10",
    "novembro": "11",
    "dezembro": "12",
}

_UNIDADE = {
    "matriz": "matriz",
    "filial pr": "pr",
    "filial sp": "sp",
    "filial mg": "mg",
    "filial df": "df",
    "asa sul": "asa_sul",
    "sede": "sede",
}


def _num(v: Any) -> float:
    if v is None or v == "":
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s or s in ("-", "—"):
        return 0.0
    neg = "(" in s and ")" in s
    s = s.replace("R$", "").strip()
    # BR: 1.234.567,89  |  US/xlsx: 1234567.89
    if re.search(r",\d{1,2}$", s):
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", "")
    s = re.sub(r"[^\d.\-]", "", s)
    try:
        n = float(s or 0)
        return -abs(n) if neg else n
    except ValueError:
        return 0.0


def _mes_key(label: str) -> str:
    low = (label or "").strip().lower()
    return _MES.get(low, "")


def _unit_key(label: str) -> str:
    low = re.sub(r"\s+", " ", (label or "").strip().lower())
    return _UNIDADE.get(low, re.sub(r"[^a-z0-9]+", "_", low) or "matriz")


def parse_impostos_icms_ipi(grid: WorkbookGrid) -> dict:
    """Parser da planilha tabular ICMS/IPI (ex.: Grupo JPG)."""
    rows_out: list[dict] = []
    if not grid.rows:
        return {"kind": "icms_ipi_table", "rows": [], "byCompetenciaUnidade": {}}

    header = [str(c or "").strip().lower() for c in grid.rows[0]]
    idx = {h: i for i, h in enumerate(header) if h}

    def col(*names: str) -> int | None:
        for n in names:
            if n in idx:
                return idx[n]
        return None

    i_emp = col("empresa")
    i_fil = col("filial")
    i_mes = col("mês", "mes")
    i_icms_cred = col("icms crédito", "icms credito")
    i_icms_deb = col("icms débito", "icms debito")
    i_icms_rec = col("icms a recolher")
    i_ipi_cred = col("ipi crédito", "ipi credito")
    i_ipi_deb = col("ipi débito", "ipi debito")
    i_ipi_rec = col("ipi a recolher")

    for raw in grid.rows[1:]:
        mes_lbl = str(raw[i_mes] if i_mes is not None and i_mes < len(raw) else "")
        mm = _mes_key(mes_lbl)
        if not mm:
            continue
        filial = str(raw[i_fil] if i_fil is not None and i_fil < len(raw) else "")
        unidade = _unit_key(filial)
        row = {
            "empresa": str(raw[i_emp] if i_emp is not None and i_emp < len(raw) else ""),
            "filial": filial,
            "unidade": unidade,
            "mesLabel": mes_lbl,
            "mes": mm,
            "icmsCredito": _num(raw[i_icms_cred] if i_icms_cred is not None and i_icms_cred < len(raw) else 0),
            "icmsDebito": _num(raw[i_icms_deb] if i_icms_deb is not None and i_icms_deb < len(raw) else 0),
            "icmsARecolher": _num(raw[i_icms_rec] if i_icms_rec is not None and i_icms_rec < len(raw) else 0),
            "ipiCredito": _num(raw[i_ipi_cred] if i_ipi_cred is not None and i_ipi_cred < len(raw) else 0),
            "ipiDebito": _num(raw[i_ipi_deb] if i_ipi_deb is not None and i_ipi_deb < len(raw) else 0),
            "ipiARecolher": _num(raw[i_ipi_rec] if i_ipi_rec is not None and i_ipi_rec < len(raw) else 0),
        }
        rows_out.append(row)

    by_key: dict[str, dict] = {}
    for r in rows_out:
        key = f"{r['mes']}|{r['unidade']}"
        by_key[key] = r

    return {"kind": "icms_ipi_table", "rows": rows_out, "byCompetenciaUnidade": by_key}


def apuracao_from_imposto_row(row: dict | None, receita: float = 0.0) -> dict | None:
    if not row:
        return None
    icms_ap = float(row.get("icmsDebito") or 0)
    icms_rec = float(row.get("icmsARecolher") or 0)
    pct = round(100 * icms_rec / receita, 2) if receita else 0.0
    return {
        "icms": {"apurado": icms_ap, "aRecolher": icms_rec, "pctRb": pct},
        "icmsSt": {"apurado": 0.0, "aRecolher": 0.0, "pctRb": 0.0},
        "pis": {"apurado": 0.0, "aRecolher": 0.0, "pctRb": 0.0},
        "cofins": {"apurado": 0.0, "aRecolher": 0.0, "pctRb": 0.0},
        "ipi": {
            "apurado": float(row.get("ipiDebito") or 0),
            "aRecolher": float(row.get("ipiARecolher") or 0),
            "credito": float(row.get("ipiCredito") or 0),
            "pctRb": 0.0,
        },
        "subvencao": 0.0,
        "fonte": "impostos_icms_ipi",
    }


def composicao_from_apuracao(ap: dict | None) -> list[dict]:
    if not ap:
        return []
    out = []
    for key, label in (
        ("icms", "ICMS"),
        ("icmsSt", "ICMS ST"),
        ("pis", "PIS"),
        ("cofins", "COFINS"),
        ("ipi", "IPI"),
        ("irpj", "IRPJ"),
        ("csll", "CSLL"),
        ("difal", "DIFAL"),
    ):
        item = ap.get(key) or {}
        if not isinstance(item, dict):
            continue
        if item.get("aRecolher") is not None:
            valor = float(item.get("aRecolher") or 0)
        else:
            valor = float(item.get("apurado") or 0)
        if abs(valor) > 0.009:
            out.append({"label": label, "valor": round(valor, 2)})
    return out


def deducoes_from_apuracao(ap: dict | None) -> float | None:
    parts = composicao_from_apuracao(ap)
    if not parts:
        return None
    return round(sum(p["valor"] for p in parts), 2)


def _fold(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch)).lower().strip()


def _row_label(row: list[str]) -> str:
    return " ".join(str(c or "").strip() for c in row if str(c or "").strip()).lower()


def _first_label(row: list[str]) -> str:
    for cell in row:
        text = str(cell or "").strip()
        if text:
            return _fold(text)
    return ""


def _last_numeric(row: list[str]) -> float | None:
    for cell in reversed(row):
        if cell is None or str(cell).strip() == "":
            continue
        if isinstance(cell, (int, float)) or re.search(r"\d", str(cell)):
            return round(_num(cell), 2)
    return None


def _find_label_value(grid: WorkbookGrid, *needles: str) -> float | None:
    folded_needles = [_fold(n) for n in needles]
    for row in grid.rows:
        label = _fold(_row_label(row))
        if not label:
            continue
        if not any(n in label for n in folded_needles):
            continue
        found = _last_numeric(row)
        if found is not None:
            return found
    return None


def _label_matches(first: str, *needles: str) -> bool:
    if not first:
        return False
    for raw in needles:
        needle = _fold(raw)
        if not needle:
            continue
        if first == needle or first.startswith(needle + " ") or first.startswith(needle + ":"):
            return True
    return False


def _find_row_value(grid: WorkbookGrid, start: int, *needles: str) -> float | None:
    """Primeira célula (descrição) tem que ser o rótulo — não pega 'Estorno de débitos pelas saídas'."""
    for row in grid.rows[start:]:
        if not _label_matches(_first_label(row), *needles):
            continue
        found = _last_numeric(row)
        if found is not None:
            return found
    return None


def is_demonstrativo_icms(grid: WorkbookGrid) -> bool:
    for row in grid.rows[:12]:
        if "demonstrativo do icms" in _fold(_row_label(row)):
            return True
    sheet = _fold(grid.sheet_name or "")
    return "demonst" in sheet and "icms" in sheet


def parse_demonstrativo_icms(grid: WorkbookGrid) -> dict:
    """Demonstrativo do ICMS EXITO — bloco APURAÇÃO (ICMS a recolher / saldo credor)."""
    apur_i = 0
    for i, row in enumerate(grid.rows):
        first = _first_label(row)
        if first == "apuracao" or first.startswith("apuracao "):
            apur_i = i
            break

    debito_saidas = _find_row_value(grid, 0, "debitos pelas saidas")
    debitos = _find_row_value(grid, apur_i, "total de debitos")
    if debitos is None:
        debitos = _find_row_value(grid, 0, "total de debitos")
    creditos = _find_row_value(grid, apur_i, "total de creditos")
    if creditos is None:
        creditos = _find_row_value(grid, 0, "total de creditos")
    a_recolher = _find_row_value(grid, apur_i, "icms a recolher")
    saldo_seguinte = _find_row_value(grid, apur_i, "saldo credor de icms")
    saldo_anterior = _find_row_value(grid, apur_i, "saldo credor do periodo anterior")

    rec = float(a_recolher or 0)
    credor = float(saldo_seguinte or 0)
    if abs(rec) < 0.009 and credor > 0.009:
        rec = -abs(credor)

    apurado = float(debito_saidas if debito_saidas is not None else (debitos or 0))
    return {
        "kind": "demonstrativo_icms",
        "debitos": float(debitos or 0),
        "creditos": float(creditos or 0),
        "debitoSaidas": float(debito_saidas or 0),
        "saldoCredorAnterior": float(saldo_anterior or 0),
        "saldoCredorSeguinte": credor,
        "aRecolher": rec,
        "apurado": apurado,
    }


def parse_demonstrativo_ipi(grid: WorkbookGrid) -> dict:
    """Demonstrativo IPI EXITO — saldo devedor / créditos / débitos."""
    debitos = _find_label_value(grid, "total de débitos", "total de debitos") or 0.0
    creditos = _find_label_value(grid, "total de créditos", "total de creditos") or 0.0
    a_recolher = _find_label_value(grid, "saldo devedor de ipi")
    if a_recolher is None:
        a_recolher = debitos
    return {
        "kind": "demonstrativo_ipi",
        "debitos": debitos,
        "creditos": creditos,
        "aRecolher": float(a_recolher or 0),
    }


def is_demonstrativo_apuracao_pis_cofins(grid: WorkbookGrid) -> bool:
    for row in grid.rows[:8]:
        folded = _fold(_row_label(row))
        if "demonstrativo da apuracao do pis" in folded or "demonstrativo da apuracao do cofins" in folded:
            return True
    return False


def parse_demonstrativo_apuracao_pis_cofins(grid: WorkbookGrid, tributo: str) -> dict:
    """Demonstrativo da Apuração PIS/COFINS — regime não cumulativo ou cumulativo (EXITO)."""
    apurado = _find_row_value(
        grid,
        0,
        "valor total da contribuicao nao cumulativa apurada no periodo",
    )
    a_recolher = _find_row_value(
        grid,
        0,
        "valor da contribuicao nao cumulativa a recolher",
    )
    credito = _find_row_value(grid, 0, "total do credito para o periodo seguinte")

    if apurado is None and a_recolher is None:
        apurado = _find_row_value(grid, 0, "valor total da contribuicao cumulativa devida")
        a_recolher = _find_row_value(grid, 0, "valor da contribuicao cumulativa a recolher")
        if apurado is None:
            apurado = _find_row_value(
                grid,
                0,
                "51.contribuicao cumulativa apurada a aliquota basica",
            )

    saldo_devedor = _find_row_value(grid, 0, "saldo devedor da contribuicao")
    return {
        "kind": f"demonstrativo_apuracao_{tributo}",
        "tributo": tributo,
        "apurado": float(apurado or 0),
        "aRecolher": float(a_recolher or 0),
        "credito": float(credito or 0),
        "saldoDevedor": float(saldo_devedor or 0),
        "baseCalculo": 0.0,
    }


def parse_demonstrativo_pis_cofins(grid: WorkbookGrid, tributo: str) -> dict:
    """PIS/COFINS — layout Apuração não cumulativo ou consolidado EFD (Total Imposto)."""
    if is_demonstrativo_apuracao_pis_cofins(grid):
        return parse_demonstrativo_apuracao_pis_cofins(grid, tributo)

    imposto = _find_label_value(grid, "total imposto")
    base = _find_label_value(grid, "total da base de cálculo", "total da base de calculo")
    if imposto is None:
        for row in reversed(grid.rows):
            label = _row_label(row)
            if not label.startswith("total"):
                continue
            nums = [_num(c) for c in row if c is not None and str(c).strip() and re.search(r"\d", str(c))]
            if len(nums) >= 3:
                imposto = round(nums[-1], 2)
                if base is None and len(nums) >= 2:
                    base = round(nums[-2], 2)
                break
    return {
        "kind": f"demonstrativo_{tributo}",
        "tributo": tributo,
        "baseCalculo": float(base or 0),
        "aRecolher": float(imposto or 0),
        "apurado": float(imposto or 0),
    }


def is_demonstrativo_subtri(grid: WorkbookGrid, filename: str = "") -> bool:
    """Demonstrativo EXITO da Substituição Tributária (aba Demonst. SUBTRI / Apuração icms st)."""
    file_l = (filename or "").lower()
    name = (grid.sheet_name or "").lower()
    head = " ".join(" ".join(str(c or "") for c in row) for row in (grid.rows or [])[:6])
    head_fold = _fold(head)
    if "subtri" in name or "icms st" in file_l or "icms_st" in file_l:
        return True
    return "substituicao tributaria" in head_fold or "demonstrativo da substituicao" in head_fold


def _uf_from_subtri(grid: WorkbookGrid) -> str:
    head = " ".join(" ".join(str(c or "") for c in row) for row in (grid.rows or [])[:6])
    m = re.search(r"UF\s+FAVORECIDA\s+([A-Za-z]{2})\b", head, re.I)
    if m:
        return m.group(1).upper()
    m = re.search(r"\b([A-Za-z]{2})\s*\(M\)", grid.sheet_name or "", re.I)
    if m:
        return m.group(1).upper()
    return ""


def parse_demonstrativo_subtri(grid: WorkbookGrid) -> dict:
    """Uma aba SUBTRI (UF favorecida) → aRecolher da linha oficial + UF."""
    a_recolher = _find_label_value(grid, "substituicao tributaria a recolher")
    saldo_credor = _find_label_value(grid, "saldo credor de substituicao tributaria")
    rec = float(a_recolher or 0)
    credor = float(saldo_credor or 0)
    if abs(rec) < 0.009 and credor > 0.009:
        rec = -abs(credor)
    uf = _uf_from_subtri(grid)
    by_uf = {uf: rec} if uf else {}
    return {
        "kind": "demonstrativo_subtri",
        "uf": uf,
        "byUf": by_uf,
        "aRecolher": rec,
        "apurado": rec,
        "saldoCredorSeguinte": credor,
    }


def merge_subtri_sheets(sheets: list[WorkbookGrid]) -> dict:
    """Soma várias abas SUBTRI (ex. DF + GO) em um único resultado ST."""
    by_uf: dict[str, float] = {}
    total = 0.0
    for sh in sheets:
        parsed = parse_demonstrativo_subtri(sh)
        uf = str(parsed.get("uf") or "").upper()
        val = float(parsed.get("aRecolher") or 0)
        if uf:
            by_uf[uf] = round(by_uf.get(uf, 0.0) + val, 2)
        total = round(total + val, 2)
    return {
        "kind": "demonstrativo_subtri",
        "byUf": by_uf,
        "aRecolher": total,
        "apurado": total,
    }


def parse_st_mensal(grid: WorkbookGrid) -> dict:
    """ST MENSAL — tabela UF / VALOR + TOTAL (colunas podem não começar em A)."""
    by_uf: dict[str, float] = {}
    total = 0.0
    header_i = None
    i_uf = None
    i_val = None
    for i, row in enumerate(grid.rows):
        cells = [str(c or "").strip().lower() for c in row]
        if "uf" not in cells:
            continue
        for j, c in enumerate(cells):
            if c == "uf":
                i_uf = j
            if "valor" in c:
                i_val = j
        if i_uf is not None and i_val is not None:
            header_i = i
            break
    if header_i is None or i_uf is None or i_val is None:
        return {"kind": "st_mensal", "byUf": {}, "aRecolher": 0.0, "apurado": 0.0}
    for row in grid.rows[header_i + 1 :]:
        uf = str(row[i_uf] if i_uf < len(row) else "").strip().upper()
        if not uf:
            continue
        valor = _num(row[i_val] if i_val < len(row) else 0)
        if uf == "TOTAL":
            total = valor
            continue
        if len(uf) == 2:
            by_uf[uf] = valor
    if not total and by_uf:
        total = round(sum(by_uf.values()), 2)
    return {
        "kind": "st_mensal",
        "byUf": by_uf,
        "aRecolher": float(total or 0),
        "apurado": float(total or 0),
    }


def apuracao_patch_from_demo(tipo: str, parsed: dict) -> dict:
    """Monta só a chave de apuração do tributo (mergeável no pack)."""
    tax = {
        "apurado": float(parsed.get("apurado") or parsed.get("aRecolher") or parsed.get("debitos") or 0),
        "aRecolher": float(parsed.get("aRecolher") or 0),
        "pctRb": 0.0,
    }
    if tipo == "ipi":
        tax["credito"] = float(parsed.get("creditos") or 0)
        tax["apurado"] = float(parsed.get("debitos") or tax["apurado"])
        out = {"apuracao": {"ipi": tax, "fonte": "demonstrativo_ipi"}, "impostosDemo": {"ipi": parsed}}
        if parsed.get("hasValores") and (parsed.get("resumo") or parsed.get("debito")):
            out["memoriaIpi"] = {
                "formula": parsed.get("formula") or "",
                "debito": parsed.get("debito") or {},
                "credito": parsed.get("credito") or {},
                "resumo": parsed.get("resumo") or {},
                "aRecolher": parsed.get("aRecolher"),
            }
        return out
    if tipo == "pis":
        tax["credito"] = float(parsed.get("credito") or 0)
        fonte = (
            "demonstrativo_apuracao_pis"
            if str(parsed.get("kind") or "").startswith("demonstrativo_apuracao")
            else "demonstrativo_pis"
        )
        return {"apuracao": {"pis": tax, "fonte": fonte}, "impostosDemo": {"pis": parsed}}
    if tipo == "cofins":
        tax["credito"] = float(parsed.get("credito") or 0)
        fonte = (
            "demonstrativo_apuracao_cofins"
            if str(parsed.get("kind") or "").startswith("demonstrativo_apuracao")
            else "demonstrativo_cofins"
        )
        return {"apuracao": {"cofins": tax, "fonte": fonte}, "impostosDemo": {"cofins": parsed}}
    if tipo == "icms_st":
        fonte = "demonstrativo_subtri" if str(parsed.get("kind") or "") == "demonstrativo_subtri" else "st_mensal"
        return {
            "apuracao": {"icmsSt": tax, "fonte": fonte},
            "impostosDemo": {"icmsSt": parsed},
            "porUfSt": parsed.get("byUf") or {},
        }
    if tipo == "icms":
        rec = parsed.get("aRecolher")
        tax["aRecolher"] = float(rec) if rec is not None else 0.0
        tax["apurado"] = float(parsed.get("apurado") if parsed.get("apurado") is not None else parsed.get("debitos") or 0)
        tax["credito"] = float(parsed.get("creditos") or 0)
        tax["saldoCredor"] = float(parsed.get("saldoCredorSeguinte") or 0)
        return {"apuracao": {"icms": tax, "fonte": "demonstrativo_icms"}, "impostosDemo": {"icms": parsed}}
    if tipo == "irpj":
        tax["credito"] = float(parsed.get("credito") or 0)
        out = {"apuracao": {"irpj": tax, "fonte": "planilha_padrao_irpj"}, "impostosDemo": {"irpj": parsed}}
        if parsed.get("linhas"):
            out["memoriaIrpj"] = {"linhas": parsed.get("linhas") or [], "aRecolher": parsed.get("aRecolher")}
        return out
    if tipo == "csll":
        tax["credito"] = float(parsed.get("credito") or 0)
        out = {"apuracao": {"csll": tax, "fonte": "planilha_padrao_csll"}, "impostosDemo": {"csll": parsed}}
        if parsed.get("linhas"):
            out["memoriaCsll"] = {"linhas": parsed.get("linhas") or [], "aRecolher": parsed.get("aRecolher")}
        return out
    if tipo == "difal":
        return {
            "apuracao": {"difal": tax, "fonte": "planilha_padrao_difal"},
            "impostosDemo": {"difal": parsed},
            "porUfDifal": parsed.get("byUf") or {},
        }
    return {}


def _padrao_base_line(row: list, tributo: str, wide: bool) -> dict:
    if wide:
        return {
            "tributo": tributo.upper(),
            "valorProduto": round(_num(row[1] if len(row) > 1 else 0), 2),
            "valorContabil": round(_num(row[2] if len(row) > 2 else 0), 2),
            "baseCalculo": round(_num(row[3] if len(row) > 3 else 0), 2),
            "ajusteBc": round(_num(row[4] if len(row) > 4 else 0), 2),
            "bcAjustada": round(_num(row[5] if len(row) > 5 else 0), 2),
            "aliquota": round(_num(row[6] if len(row) > 6 else 0), 6),
            "valorImposto": round(_num(row[7] if len(row) > 7 else 0), 2),
        }
    return {
        "tributo": tributo.upper(),
        "valorProduto": round(_num(row[1] if len(row) > 1 else 0), 2),
        "valorContabil": round(_num(row[2] if len(row) > 2 else 0), 2),
        "baseCalculo": round(_num(row[3] if len(row) > 3 else 0), 2),
        "ajusteBc": 0.0,
        "bcAjustada": round(_num(row[3] if len(row) > 3 else 0), 2),
        "aliquota": round(_num(row[4] if len(row) > 4 else 0), 6),
        "valorImposto": round(_num(row[5] if len(row) > 5 else 0), 2),
    }


def _first_tax_label(row: list) -> str:
    for cell in row:
        lab = _fold(str(cell or ""))
        if lab in ("pis", "cofins", "ipi"):
            return lab
    return ""


def parse_pis_cofins_padrao(grid: WorkbookGrid) -> dict:
    """Planilha padrão — aba PIS COFINS: débito, crédito e RESUMO APURAÇÃO.

    ``aRecolher`` é o resultado **do mês**: débito − crédito. A coluna A RECOLHER
    do RESUMO só é aceita quando bate com essa conta; nas planilhas em que ela
    desconta o saldo credor acumulado de meses anteriores o valor da coluna vira
    apenas informativo (``aRecolherPlanilha``).
    """
    out: dict[str, Any] = {
        "kind": "padrao_pis_cofins",
        "hasValores": False,
        "formula": "aRecolher = débito − crédito",
        "debito": {"linhas": []},
        "credito": {"linhas": []},
        "resumo": {},
        "warnings": [],
    }
    mode = ""
    for row in grid.rows or []:
        cells = [str(c or "").strip() for c in row]
        joined = _fold(" ".join(cells))
        if not joined:
            continue
        if "valor produto" in joined or ("imposto" in joined and "debito" in joined and "credito" in joined):
            continue
        if joined in ("debito", "debitos") or joined.endswith(" debito") and len(joined) < 12:
            mode = "debito"
            continue
        if joined in ("credito", "creditos"):
            mode = "credito"
            continue
        if "resumo apuracao" in joined:
            mode = "resumo"
            continue
        tributo = _first_tax_label(row)
        if tributo not in ("pis", "cofins"):
            continue
        if mode in ("debito", "credito"):
            line = _padrao_base_line(row, tributo, wide=True)
            if abs(line["valorImposto"]) + abs(line["valorProduto"]) < 0.009:
                continue
            out[mode]["linhas"].append(line)
            continue
        if mode != "resumo":
            continue
        deb = _num(row[2] if len(row) > 2 else 0)
        cred = _num(row[3] if len(row) > 3 else 0)
        saldo = _num(row[4] if len(row) > 4 else 0)
        rec = _num(row[5] if len(row) > 5 else 0)
        if abs(deb) + abs(cred) + abs(rec) < 0.009:
            continue
        calculado = round(deb - cred, 2)
        planilha = round(rec, 2)
        confere = abs(planilha - calculado) < 0.02
        a_recolher = planilha if confere else calculado
        resumo_row = {
            "tributo": tributo.upper(),
            "debito": round(deb, 2),
            "credito": round(cred, 2),
            "saldoCredor": round(saldo, 2),
            "aRecolher": a_recolher,
            "aRecolherPlanilha": planilha,
            "aRecolherCalculado": calculado,
            "fonte": "resumo" if confere else "debito-credito",
        }
        out["resumo"][tributo] = resumo_row
        out[tributo] = {
            "kind": f"padrao_{tributo}",
            "debitos": round(deb, 2),
            "credito": round(cred, 2),
            "saldoCredor": round(saldo, 2),
            "aRecolher": a_recolher,
            "aRecolherPlanilha": planilha,
            "apurado": round(deb, 2),
            "hasValores": True,
        }
        if not confere:
            out["warnings"].append(
                f"{tributo.upper()}: coluna A RECOLHER do RESUMO ({planilha}) não bate com débito − crédito "
                f"({calculado}) — usado o cálculo do mês; saldo credor acumulado {round(saldo, 2)} fica informativo"
            )
        out["hasValores"] = True
    return out


def parse_ipi_padrao(grid: WorkbookGrid) -> dict:
    """Planilha padrão — aba IPI: débito, crédito e RESUMO APURAÇÃO."""
    out: dict[str, Any] = {
        "kind": "padrao_ipi",
        "hasValores": False,
        "formula": "aRecolher = débito − crédito − saldo credor",
        "debito": {"linhas": []},
        "credito": {"linhas": []},
        "resumo": {},
    }
    mode = ""
    for row in grid.rows or []:
        cells = [str(c or "").strip() for c in row]
        joined = _fold(" ".join(cells))
        if not joined:
            continue
        if "valor produto" in joined or ("imposto" in joined and "debito" in joined):
            continue
        if joined in ("debito", "debitos"):
            mode = "debito"
            continue
        if joined in ("credito", "creditos"):
            mode = "credito"
            continue
        if "resumo apuracao" in joined:
            mode = "resumo"
            continue
        tributo = _first_tax_label(row)
        if tributo != "ipi":
            continue
        if mode in ("debito", "credito"):
            line = _padrao_base_line(row, tributo, wide=False)
            if abs(line["valorImposto"]) + abs(line["valorProduto"]) < 0.009:
                continue
            out[mode]["linhas"].append(line)
            continue
        if mode != "resumo":
            continue
        deb = _num(row[2] if len(row) > 2 else 0)
        cred = _num(row[3] if len(row) > 3 else 0)
        saldo = _num(row[4] if len(row) > 4 else 0)
        rec = _num(row[5] if len(row) > 5 else 0)
        if abs(deb) + abs(cred) + abs(rec) < 0.009:
            continue
        out["debitos"] = round(deb, 2)
        out["creditos"] = round(cred, 2)
        out["saldoCredor"] = round(saldo, 2)
        out["aRecolher"] = round(rec, 2)
        out["apurado"] = round(deb, 2)
        out["hasValores"] = True
        out["resumo"] = {
            "ipi": {
                "tributo": "IPI",
                "debito": round(deb, 2),
                "credito": round(cred, 2),
                "saldoCredor": round(saldo, 2),
                "aRecolher": round(rec, 2),
            }
        }
    return out


def parse_difal_padrao(grid: WorkbookGrid) -> dict:
    """Mesma grade UF/VALOR da aba ST."""
    parsed = parse_st_mensal(grid)
    parsed["kind"] = "padrao_difal"
    return parsed


def parse_irpj_csll_padrao(grid: WorkbookGrid, tipo: str) -> dict:
    """Demonstrativo IRPJ/CSLL — linhas do livro + saldo devedor."""
    linhas: list[dict] = []
    a_recolher: float | None = None
    for row in grid.rows or []:
        texts = [str(c or "").strip() for c in row if str(c or "").strip()]
        if not texts:
            continue
        label_raw = next((str(c or "").strip() for c in row if str(c or "").strip()), "")
        nums = []
        for cell in row:
            if cell is None or str(cell).strip() == "":
                continue
            if isinstance(cell, (int, float)) or re.search(r"\d", str(cell)):
                n = _num(cell)
                if str(cell).strip() not in (label_raw,) and (isinstance(cell, (int, float)) or re.search(r"[\d]", str(cell))):
                    if not re.fullmatch(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}", str(cell).strip()):
                        nums.append(round(n, 2))
        folded = _fold(label_raw)
        if folded.startswith("demonstrativo") or folded.startswith("estabelecimento"):
            linhas.append({"label": label_raw, "valor": None, "valores": [], "kind": "titulo"})
            continue
        valor = nums[-1] if nums else None
        kind = "linha"
        if "saldo devedor" in folded:
            kind = "resultado"
            if valor is not None:
                a_recolher = float(valor)
        elif folded in ("apuracao", "adicional do irpj", "percentual de presuncao majorado"):
            kind = "grupo"
        linhas.append({"label": label_raw, "valor": valor, "valores": nums, "kind": kind})
    if a_recolher is None:
        return {"kind": f"padrao_{tipo}", "hasValores": False, "linhas": linhas}
    if abs(a_recolher) < 0.009:
        return {"kind": f"padrao_{tipo}", "hasValores": False, "linhas": linhas}
    return {
        "kind": f"padrao_{tipo}",
        "aRecolher": float(a_recolher),
        "apurado": float(a_recolher),
        "credito": 0.0,
        "hasValores": True,
        "linhas": linhas,
    }
