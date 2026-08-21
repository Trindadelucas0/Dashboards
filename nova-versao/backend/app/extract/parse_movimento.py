from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.companies import only_digits
from app.extract.classify import format_cfop, parse_br_number
from app.extract.workbook import WorkbookGrid

SKIP_MARKERS = (
    "total fornecedor",
    "total cliente",
    "acompanhamento de",
    "sistema licenciado",
)


@dataclass
class Line:
    codigo: str
    nota: str
    serie: str
    nome: str
    doc: str
    uf: str
    cfop: str
    valor: float


@dataclass
class ExtractedMovimento:
    tipo: str
    company: str
    cnpj: str
    period: str
    total_geral: float | None
    lines: list[Line] = field(default_factory=list)
    sheet: str = ""
    parser: str = ""


def _is_detail_code(val: str) -> bool:
    return bool(re.match(r"^\d+$", (val or "").strip()))


def _skip_row(row: list[str]) -> bool:
    joined = " ".join(row).lower()
    return any(m in joined for m in SKIP_MARKERS)


def _col(row: list[str], idx: int) -> str:
    if idx < 0 or idx >= len(row):
        return ""
    return str(row[idx] or "").strip()


def _find_cfop(row: list[str]) -> str:
    for cell in row:
        t = cell.strip()
        if re.match(r"^\d[.\-]?\d{3}$", t):
            return format_cfop(t)
    return ""


def _find_total_geral(grid: WorkbookGrid, valor_cols: list[int]) -> float | None:
    for i, row in enumerate(grid.rows):
        joined = " ".join(str(c) for c in row).lower()
        if "total geral" not in joined:
            continue
        for offset in range(0, 4):
            r = i + offset
            if r >= len(grid.rows):
                break
            cand = grid.rows[r]
            for col in valor_cols:
                num = parse_br_number(_col(cand, col))
                if num is not None and abs(num) > 0:
                    return num
            for cell in reversed(cand):
                num = parse_br_number(str(cell))
                if num is not None and abs(num) > 1:
                    return num
    return None


def _norm(s: str) -> str:
    t = (s or "").strip().lower()
    trans = str.maketrans("áàâãéêíóôõúç", "aaaaeeiooouc")
    t = t.translate(trans)
    return re.sub(r"\s+", " ", t)


def _header_map(row: list[str]) -> dict[str, int] | None:
    labels = [_norm(c) for c in row]
    joined = " ".join(labels)
    if "nota" not in joined or ("codigo" not in joined and "código" not in joined):
        return None
    mapping: dict[str, int] = {}
    valor_contabil: int | None = None
    valor_generic: int | None = None
    for i, lab in enumerate(labels):
        if lab in ("codigo", "código") and "codigo" not in mapping:
            mapping["codigo"] = i
        elif lab == "nota":
            mapping["nota"] = i
        elif lab in ("serie", "série"):
            mapping["serie"] = i
        elif "fornecedor" in lab or lab == "cliente":
            mapping["nome"] = i
        elif "cnpj" in lab or "cpf" in lab:
            mapping["doc"] = i
        elif lab == "cfop":
            mapping["cfop"] = i
        elif lab == "uf":
            mapping["uf"] = i
        elif "valor" in lab and "contabil" in lab:
            valor_contabil = i
        elif lab in ("vl contabil", "vl. contabil"):
            valor_contabil = i
        elif lab == "valor" and valor_generic is None:
            valor_generic = i
    if valor_contabil is not None:
        mapping["valor"] = valor_contabil
    elif valor_generic is not None:
        mapping["valor"] = valor_generic
    if "nota" in mapping and "codigo" in mapping:
        return mapping
    return None


def parse_movimento(grid: WorkbookGrid, tipo: str) -> ExtractedMovimento:
    header = None
    header_row = -1
    for i, row in enumerate(grid.rows[:40]):
        found = _header_map(row)
        if found:
            header = found
            header_row = i
            break

    if not header:
        if tipo == "entradas":
            header = {"codigo": 0, "nota": 5, "serie": 7, "nome": 10, "doc": 12, "cfop": 16, "uf": 18, "valor": 19}
        else:
            header = {"codigo": 0, "nota": 4, "serie": 5, "nome": 11, "doc": 15, "cfop": 17, "uf": 21, "valor": 22}

    valor_cols = [header["valor"]] if "valor" in header else []
    if tipo != "entradas":
        valor_cols.extend([22, 23])

    lines: list[Line] = []
    start = header_row + 1 if header_row >= 0 else 0
    for row in grid.rows[start:]:
        if not row or not _is_detail_code(_col(row, header.get("codigo", 0))):
            continue
        if _skip_row(row):
            continue
        valor = parse_br_number(_col(row, header["valor"])) if "valor" in header else None
        if valor is None:
            for col in valor_cols:
                cand = parse_br_number(_col(row, col))
                if cand is not None and abs(cand) >= 0.01:
                    valor = cand
                    break
        if valor is None:
            for col in reversed(range(len(row))):
                cand = parse_br_number(_col(row, col))
                if cand is not None and abs(cand) >= 0.01:
                    valor = cand
                    break
        if valor is None:
            continue
        cfop_raw = _col(row, header["cfop"]) if "cfop" in header else ""
        cfop = format_cfop(cfop_raw) or _find_cfop(row)
        nome = _col(row, header.get("nome", 10))
        nome = re.sub(r"^\d{1,3}(?:\.\d{3}){1,2}\s+", "", nome)
        nome = re.sub(r"^\d{11,14}\s+", "", nome)
        lines.append(
            Line(
                codigo=_col(row, header.get("codigo", 0)),
                nota=_col(row, header.get("nota", 0)),
                serie=_col(row, header.get("serie", 0)),
                nome=nome.strip() or _col(row, header.get("nome", 0)),
                doc=only_digits(_col(row, header.get("doc", 0))),
                uf=_col(row, header.get("uf", 0)) or "—",
                cfop=cfop,
                valor=float(valor),
            )
        )

    total = _find_total_geral(grid, valor_cols or list(range(max((len(r) for r in grid.rows), default=1))))
    return ExtractedMovimento(
        tipo=tipo,
        company="",
        cnpj="",
        period="",
        total_geral=total,
        lines=lines,
        sheet=grid.sheet_name,
        parser=grid.kind,
    )
