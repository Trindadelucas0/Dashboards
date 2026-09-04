from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.extract.workbook import WorkbookGrid


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
    # BR: 1.234.567,89  |  COM/xlsx: 1234567.89 (grid sempre vira str)
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


def _is_number_cell(cell: Any) -> bool:
    if isinstance(cell, bool):
        return False
    if isinstance(cell, (int, float)):
        return True
    s = str(cell or "").strip()
    if not s or "/" in s or re.search(r"[a-zA-Z]", s):
        return False
    return _to_float(s) is not None


def _norm_label(label: str) -> str:
    folded = _fold(label)
    folded = re.sub(r"^[\(\)=\+\-\/\s]+", "", folded)
    folded = re.sub(r"\s+", " ", folded)
    return folded.strip()


def _is_exito_dre(grid: WorkbookGrid) -> bool:
    head = " ".join(_fold(" ".join(grid.row(r))) for r in range(min(8, len(grid.rows))))
    if "demonstracao do resultado" in head:
        return True
    if "saldo atual" in head and "receita bruta" in head:
        return True
    return False


def _skip_exito_row(label: str) -> bool:
    low = _fold(label)
    if not low:
        return True
    if low.startswith(("empresa", "c.n.p.j", "cnpj", "insc", "folha", "numero livro", "nº livro")):
        return True
    if low in ("descricao", "descrição", "saldo atual"):
        return True
    if "demonstracao do resultado" in low:
        return True
    if "sistema licenciado" in low:
        return True
    if "cpf:" in low or "crc" in low:
        return True
    if set(low.replace("\n", "")) <= set("_ "):
        return True
    return False


def _exito_row(cells: list[Any]) -> tuple[str, str, float | None, str]:
    texts: list[str] = []
    nums: list[float] = []
    first_text_col = None
    for idx, cell in enumerate(cells):
        if cell is None or str(cell).strip() == "":
            continue
        if _is_number_cell(cell):
            n = _to_float(cell)
            if n is not None:
                nums.append(n)
            continue
        text = str(cell).strip()
        if text:
            if first_text_col is None:
                first_text_col = idx
            texts.append(text)
    label = texts[0] if texts else ""
    valor = nums[-1] if nums else None
    nivel = "linha"
    if first_text_col == 0:
        nivel = "total"
    elif first_text_col and first_text_col >= 2:
        nivel = "detalhe"
    return "", label, valor, nivel


def _parse_exito_dre(grid: WorkbookGrid) -> dict:
    """DRE EXITO: seções na col 0, detalhe na col 2, totais em Saldo Atual."""
    lines: list[dict] = []
    totals: dict[str, float | None] = {
        "receitaBruta": None,
        "receitaLiquida": None,
        "cmv": None,
        "despesas": None,
        "lucBruto": None,
        "lucLiq": None,
    }

    for raw in grid.rows or []:
        cells = list(raw or [])
        _code, label, valor, nivel = _exito_row(cells)
        if _skip_exito_row(label):
            continue
        key = _norm_label(label)
        row = {"codigo": "", "descricao": label, "valor": valor, "grupo": "linha"}
        if key == "receita bruta":
            totals["receitaBruta"] = valor
            row["grupo"] = "receita"
        elif key in ("venda de mercadorias", "vendas de produtos"):
            if totals["receitaBruta"] is None:
                totals["receitaBruta"] = valor
            row["grupo"] = "receita"
        elif key == "receita liquida":
            totals["receitaLiquida"] = valor
            row["grupo"] = "receita"
        elif key == "cmv" or "custos das mercadorias vendidas" in key or "custo da mercadoria" in key:
            if key == "cmv" or totals["cmv"] is None:
                totals["cmv"] = valor
            row["grupo"] = "cmv"
        elif key == "lucro bruto":
            totals["lucBruto"] = valor
            row["grupo"] = "resultado"
        elif key in ("despesas operacionais", "total de despesas"):
            totals["despesas"] = valor
            row["grupo"] = "despesas"
        elif (
            key in ("lucro liquido do exercicio", "prejuizo do exercicio", "resultado liquido")
            or "lucro ou prejuizo liquido do exercicio" in key
        ):
            totals["lucLiq"] = valor
            row["grupo"] = "resultado"
        elif nivel == "total":
            row["grupo"] = "total"
        else:
            row["grupo"] = "linha"
        if label:
            lines.append(row)

    rb = totals["receitaBruta"]
    cmv = totals["cmv"]
    luc_bruto = totals["lucBruto"]
    if luc_bruto is None and totals["receitaLiquida"] is not None and cmv is not None:
        luc_bruto = round(totals["receitaLiquida"] + cmv, 2)
    luc_liq = totals["lucLiq"]
    marg_mb = round(100 * luc_bruto / rb, 2) if rb and luc_bruto is not None else None
    marg_ml = round(100 * luc_liq / rb, 2) if rb and luc_liq is not None else None

    return normalize_dre_deducoes(
        {
            "kind": "exito",
            "linhas": lines,
            "receitaBruta": rb,
            "receitaLiquida": totals["receitaLiquida"],
            "cmv": cmv,
            "despesas": totals["despesas"],
            "lucBruto": luc_bruto,
            "lucLiq": luc_liq,
            "margMb": marg_mb,
            "margMl": marg_ml,
            "hasValores": any(l.get("valor") is not None for l in lines),
        }
    )


def _parse_resultado_legacy(grid: WorkbookGrid) -> dict:
    """Planilhas RESULTADO (Egaplast/legado): rótulo + último número da linha."""
    lines: list[dict] = []
    totals: dict[str, float | None] = {
        "receitaBruta": None,
        "cmv": None,
        "despesas": None,
        "lucLiq": None,
    }

    for raw in grid.rows or []:
        cells = list(raw or [])
        texts = [str(c).strip() for c in cells if c is not None and str(c).strip()]
        if not texts:
            continue
        label = texts[-1] if len(texts) >= 1 else ""
        code = ""
        if len(texts) >= 2 and re.fullmatch(r"\d{1,5}", texts[0]):
            code = texts[0]
            label = texts[-1]
        nums = [_to_float(c) for c in cells]
        nums = [n for n in nums if n is not None]
        valor = nums[-1] if nums else None
        low = label.lower()
        row = {"codigo": code, "descricao": label, "valor": valor}
        if low in ("despesas",) and code:
            continue
        if "vendas de produtos" in low or low == "receita bruta" or low == "receita":
            totals["receitaBruta"] = valor if valor is not None else totals["receitaBruta"]
            row["grupo"] = "receita"
        elif "custo da mercadoria" in low or low == "cmv":
            totals["cmv"] = valor if valor is not None else totals["cmv"]
            row["grupo"] = "cmv"
        elif "resultado líquido" in low or "resultado liquido" in low or "lucro líquido" in low:
            totals["lucLiq"] = valor if valor is not None else totals["lucLiq"]
            row["grupo"] = "resultado"
        elif "total de despesas" in low:
            totals["despesas"] = valor if valor is not None else totals["despesas"]
            row["grupo"] = "despesas"
        else:
            row["grupo"] = "linha"
        if label:
            lines.append(row)

    rb = totals["receitaBruta"]
    cmv = totals["cmv"]
    luc_bruto = None
    if rb is not None and cmv is not None:
        luc_bruto = round(rb - cmv, 2)
    marg_mb = round(100 * luc_bruto / rb, 2) if rb and luc_bruto is not None else None
    luc_liq = totals["lucLiq"]
    marg_ml = round(100 * luc_liq / rb, 2) if rb and luc_liq is not None else None

    return {
        "kind": "resultado",
        "linhas": lines,
        "receitaBruta": rb,
        "cmv": cmv,
        "despesas": totals["despesas"],
        "lucBruto": luc_bruto,
        "lucLiq": luc_liq,
        "margMb": marg_mb,
        "margMl": marg_ml,
        "hasValores": any(l.get("valor") is not None for l in lines),
    }


def _is_lucro_liq_label(key: str) -> bool:
    if not key or "lucro bruto" in key:
        return False
    return (
        "lucro liquido" in key
        or "prejuizo do exercicio" in key
        or "prejuizo liquido" in key
        or "resultado liquido" in key
        or "resultado do exercicio" in key
        or "lucro ou prejuizo" in key
    )


def normalize_dre_deducoes(dre: dict) -> dict:
    """Força linhas (-) do bloco Deduções a abater e refaz Líquida / Lucro Bruto / Líquido.

    EXITO às vezes exporta ICMS (dedução) com saldo positivo. A UI mostrava parênteses
    e o total somava o valor — líquida maior que a bruta e lucro bruto inflado.
    Não altera `(-) OUTRAS RECEITAS OPERACIONAIS` (fora deste bloco).
    """
    if not isinstance(dre, dict) or dre.get("kind") == "resultado":
        return dre
    linhas = dre.get("linhas")
    if not isinstance(linhas, list) or not linhas:
        return dre

    in_deducoes = False
    header_idx: int | None = None
    child_idxs: list[int] = []
    rl_idx: int | None = None
    lb_idx: int | None = None

    for i, ln in enumerate(linhas):
        if not isinstance(ln, dict):
            continue
        label = str(ln.get("descricao") or "")
        key = _norm_label(label)
        if "deducoes da receita" in key:
            in_deducoes = True
            header_idx = i
            child_idxs = []
            continue
        if key == "receita liquida":
            rl_idx = i
            in_deducoes = False
            continue
        if key == "lucro bruto":
            lb_idx = i
            continue
        if not in_deducoes:
            continue
        child_idxs.append(i)
        valor = ln.get("valor")
        if valor is None:
            continue
        if label.strip().startswith("(-)") and float(valor) > 0:
            ln["valor"] = round(-abs(float(valor)), 2)

    child_sum = 0.0
    has_child = False
    for i in child_idxs:
        valor = linhas[i].get("valor")
        if valor is None:
            continue
        child_sum += float(valor)
        has_child = True
    if header_idx is not None and has_child:
        linhas[header_idx]["valor"] = round(child_sum, 2)

    rb = dre.get("receitaBruta")
    if rb is None or not has_child:
        return dre

    old_rl = dre.get("receitaLiquida")
    new_rl = round(float(rb) + child_sum, 2)
    dre["receitaLiquida"] = new_rl
    if rl_idx is not None:
        linhas[rl_idx]["valor"] = new_rl

    delta = round(new_rl - float(old_rl), 2) if old_rl is not None else 0.0
    cmv = dre.get("cmv")
    if cmv is not None:
        new_lb = round(new_rl + float(cmv), 2)
        dre["lucBruto"] = new_lb
        if lb_idx is not None:
            linhas[lb_idx]["valor"] = new_lb
    elif dre.get("lucBruto") is not None and delta:
        dre["lucBruto"] = round(float(dre["lucBruto"]) + delta, 2)
        if lb_idx is not None:
            linhas[lb_idx]["valor"] = dre["lucBruto"]

    if dre.get("lucLiq") is not None and delta:
        dre["lucLiq"] = round(float(dre["lucLiq"]) + delta, 2)
        for ln in linhas:
            if not isinstance(ln, dict) or ln.get("valor") is None:
                continue
            key = _norm_label(str(ln.get("descricao") or ""))
            if _is_lucro_liq_label(key):
                ln["valor"] = round(float(ln["valor"]) + delta, 2)

    if rb:
        if dre.get("lucBruto") is not None:
            dre["margMb"] = round(100 * float(dre["lucBruto"]) / float(rb), 2)
        if dre.get("lucLiq") is not None:
            dre["margMl"] = round(100 * float(dre["lucLiq"]) / float(rb), 2)
    return dre


_MONTH_PADRAO = {
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


def _is_padrao_dre(grid: WorkbookGrid) -> bool:
    if not grid.rows:
        return False
    head = [_fold(str(c or "")) for c in grid.row(0)]
    return "receita bruta" in head and any(m in head for m in _MONTH_PADRAO)


def find_padrao_month_columns(grid: WorkbookGrid, header_row: int = 0) -> dict[str, int]:
    """Mapa MM → índice de coluna (planilha padrão com meses por extenso)."""
    cols: dict[str, int] = {}
    if not grid.rows or header_row >= len(grid.rows):
        return cols
    for col, cell in enumerate(grid.row(header_row)):
        key = _fold(str(cell or ""))
        if key in _MONTH_PADRAO:
            cols[_MONTH_PADRAO[key]] = col
    return cols


def parse_dre_padrao_column(grid: WorkbookGrid, value_col: int) -> dict:
    """DRE planilha padrão: rótulo col A, valor na coluna do mês."""
    lines: list[dict] = []
    totals: dict[str, float | None] = {
        "receitaBruta": None,
        "receitaLiquida": None,
        "cmv": None,
        "despesas": None,
        "lucBruto": None,
        "lucLiq": None,
    }
    in_despesas = False
    despesas_sum = 0.0
    has_despesa = False
    extras_pos = 0.0

    for raw in grid.rows or []:
        cells = list(raw or [])
        if not cells:
            continue
        label = str(cells[0] if cells else "").strip()
        if _skip_exito_row(label):
            continue
        key = _norm_label(label)
        valor = None
        if value_col < len(cells) and _is_number_cell(cells[value_col]):
            valor = _to_float(cells[value_col])

        row = {"codigo": "", "descricao": label, "valor": valor, "grupo": "linha"}
        if key == "receita bruta":
            if valor is not None:
                totals["receitaBruta"] = valor
            row["grupo"] = "receita"
        elif key in ("venda de mercadorias", "vendas de produtos"):
            if valor is not None:
                totals["receitaBruta"] = valor
            row["grupo"] = "receita"
        elif key == "receita liquida" or label.strip().startswith("= RECEITA"):
            totals["receitaLiquida"] = valor
            row["grupo"] = "receita"
        elif key == "cmv" or "custos das mercadorias vendidas" in key or "custo da mercadoria" in key:
            if key == "cmv" or totals["cmv"] is None:
                totals["cmv"] = valor
            row["grupo"] = "cmv"
        elif key == "lucro bruto" or label.strip().startswith("= LUCRO BRUTO"):
            totals["lucBruto"] = valor
            row["grupo"] = "resultado"
        elif "despesas operacionais" in key:
            in_despesas = True
            totals["despesas"] = valor
            row["grupo"] = "despesas"
        elif in_despesas and valor is not None and not label.strip().startswith("= "):
            if not key.startswith("(") and "receitas financeiras" not in key:
                despesas_sum += float(valor)
                has_despesa = True
            row["grupo"] = "despesas"
        elif "receitas financeiras" in key or "outras receitas operacionais" in key:
            in_despesas = False
            row["grupo"] = "linha"
        elif "bonificacao recebida" in key or "receita de subvencao" in key:
            if valor is not None:
                extras_pos += float(valor)
            row["grupo"] = "receita"
        elif _is_lucro_liq_label(key) or label.strip().startswith("= LUCRO OU PREJU"):
            totals["lucLiq"] = valor
            row["grupo"] = "resultado"
        elif label.strip().startswith("= "):
            row["grupo"] = "total"
        if label:
            lines.append(row)

    rb = totals["receitaBruta"]
    cmv = totals["cmv"]
    luc_bruto = totals["lucBruto"]
    if luc_bruto is None and totals["receitaLiquida"] is not None and cmv is not None:
        luc_bruto = round(float(totals["receitaLiquida"]) + float(cmv), 2)
    luc_liq = totals["lucLiq"]
    if luc_liq is None and luc_bruto is not None:
        extra = despesas_sum if has_despesa else 0.0
        luc_liq = round(float(luc_bruto) + extra + extras_pos, 2)
    marg_mb = round(100 * luc_bruto / rb, 2) if rb and luc_bruto is not None else None
    marg_ml = round(100 * luc_liq / rb, 2) if rb and luc_liq is not None else None

    return normalize_dre_deducoes(
        {
            "kind": "padrao",
            "linhas": lines,
            "receitaBruta": rb,
            "receitaLiquida": totals["receitaLiquida"],
            "cmv": cmv,
            "despesas": totals["despesas"] if totals["despesas"] is not None else (round(despesas_sum, 2) if has_despesa else None),
            "lucBruto": luc_bruto,
            "lucLiq": luc_liq,
            "margMb": marg_mb,
            "margMl": marg_ml,
            "hasValores": any(l.get("valor") is not None for l in lines),
        }
    )


def parse_dre(grid: WorkbookGrid) -> dict:
    """Extrai linhas rotuladas de planilhas RESULTADO / DRE EXITO.

    Quando a planilha só traz estrutura (sem valores numéricos), grava as linhas
    com valor null — a UI mostra N/D sem inventar CMV/margem.
    """
    if _is_padrao_dre(grid):
        cols = find_padrao_month_columns(grid)
        if cols:
            first_col = cols[sorted(cols.keys())[0]]
            return parse_dre_padrao_column(grid, first_col)
    if _is_exito_dre(grid):
        return _parse_exito_dre(grid)
    return _parse_resultado_legacy(grid)
