"""Demonstrativo de margens de venda por produto (Matriz 01–08 + Filial 01–08).

Não é livro de apuração nem planilha padrão. Uma part por competência e unidade.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.extract.classify import resolve_company
from app.extract.workbook import WorkbookGrid

_SHEET_RE = re.compile(r"^(matriz|filial)\s+(\d{1,2})$")
_MONEY_KEYS = (
    "qtde",
    "qtdeUn",
    "aVista",
    "aPrazo",
    "total",
    "custo",
    "lucroBruto",
    "lucroLiquido",
    "pmp",
)


def _fold(value: str) -> str:
    nfkd = unicodedata.normalize("NFKD", value or "")
    ascii_txt = "".join(ch for ch in nfkd if not unicodedata.combining(ch)).lower()
    return re.sub(r"\s+", " ", ascii_txt).strip()


def _sheet_map(sheets: list[WorkbookGrid]) -> dict[str, WorkbookGrid]:
    return {_fold(s.sheet_name): s for s in sheets}


def is_venda_produto(sheets: list[WorkbookGrid]) -> bool:
    """True com abas Matriz 01 e Filial 01. Livro (ICMS_Entradas) e planilha padrão não entram."""
    if not sheets:
        return False
    names = {_fold(s.sheet_name) for s in sheets}
    return "matriz 01" in names and "filial 01" in names


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


def _code(raw: str) -> str:
    s = (raw or "").strip()
    if re.fullmatch(r"\d+\.0+", s):
        return s.split(".", 1)[0]
    return s


def _is_total(raw: str) -> bool:
    folded = _fold(raw)
    return folded == "total" or folded.startswith("total ")


def _sheet_meta(folded: str) -> tuple[str, str] | None:
    m = _SHEET_RE.match(folded)
    if not m:
        return None
    unidade = "matriz" if m.group(1) == "matriz" else "filial"
    mm = int(m.group(2))
    if mm < 1 or mm > 12:
        return None
    return unidade, f"{mm:02d}"


def _year_from_grid(grid: WorkbookGrid, filename: str) -> str:
    blob = " ".join(str(c or "") for row in (grid.rows or [])[:6] for c in row)
    blob = blob + " " + filename
    m = re.search(r"(20\d{2})", blob)
    return m.group(1) if m else "2026"


def _parse_product_sheet(grid: WorkbookGrid, unidade: str, mm: str, year: str) -> dict:
    rows = grid.rows or []
    header_i = None
    hmap: dict[str, int] = {}
    for i, row in enumerate(rows):
        cand = _header_map(row)
        if _col(cand, "Codigo", "Código") is not None and _col(cand, "Produto") is not None and _col(cand, "Total") is not None:
            header_i = i
            hmap = cand
            break
    out: dict[str, Any] = {
        "unidade": unidade,
        "competencia": f"{year}-{mm}",
        "sheet": grid.sheet_name,
        "produtos": [],
        "resumo": {},
        "somaTotal": 0.0,
        "errors": [],
    }
    if header_i is None:
        out["errors"].append(f"{grid.sheet_name}: cabeçalho Código/Produto/Total não encontrado")
        return out

    i_cod = _col(hmap, "Codigo", "Código")
    i_prod = _col(hmap, "Produto")
    i_qtde = _col(hmap, "Qtde")
    i_qtde_un = _col(hmap, "Qtde Un.", "Qtde Un")
    i_vista = _col(hmap, "A Vista")
    i_prazo = _col(hmap, "A Prazo")
    i_total = _col(hmap, "Total")
    i_custo = _col(hmap, "Custo")
    i_lb = _col(hmap, "Lucro Bruto")
    i_ll = _col(hmap, "Lucro Liquido", "Lucro Líquido")
    i_mb = _col(hmap, "Marg. Bruta", "Marg Bruta")
    i_ml = _col(hmap, "Marg. Liquida", "Marg. Líquida", "Marg Liquida")
    i_pmp = _col(hmap, "PMP")

    produtos: list[dict] = []
    total_row: dict | None = None
    for row in rows[header_i + 1 :]:
        codigo = _code(_cell(row, i_cod))
        if not codigo:
            continue
        item = {
            "codigo": codigo,
            "produto": _cell(row, i_prod),
            "qtde": _money(_cell(row, i_qtde)),
            "qtdeUn": _money(_cell(row, i_qtde_un)),
            "aVista": _money(_cell(row, i_vista)),
            "aPrazo": _money(_cell(row, i_prazo)),
            "total": _money(_cell(row, i_total)),
            "custo": _money(_cell(row, i_custo)),
            "lucroBruto": _money(_cell(row, i_lb)),
            "lucroLiquido": _money(_cell(row, i_ll)),
            "margBruta": _num(_cell(row, i_mb)),
            "margLiquida": _num(_cell(row, i_ml)),
            "pmp": _num(_cell(row, i_pmp)),
        }
        if _is_total(codigo):
            total_row = item
            itens_txt = item["produto"]
            m_itens = re.search(r"(\d+)", itens_txt)
            item["itens"] = int(m_itens.group(1)) if m_itens else 0
            continue
        produtos.append(item)

    soma = round(sum(p["total"] for p in produtos), 2)
    produtos.sort(key=lambda p: float(p.get("total") or 0), reverse=True)
    out["produtos"] = produtos
    out["somaTotal"] = soma
    if total_row:
        itens = int(total_row.get("itens") or 0) or len(produtos)
        out["resumo"] = {
            "itens": itens,
            "qtde": total_row["qtde"],
            "qtdeUn": total_row["qtdeUn"],
            "aVista": total_row["aVista"],
            "aPrazo": total_row["aPrazo"],
            "total": total_row["total"],
            "custo": total_row["custo"],
            "lucroBruto": total_row["lucroBruto"],
            "lucroLiquido": total_row["lucroLiquido"],
            "margBruta": total_row["margBruta"],
            "margLiquida": total_row["margLiquida"],
            "pmp": total_row["pmp"],
        }
        if abs(soma - float(total_row["total"])) >= 0.02:
            out["errors"].append(
                f"{grid.sheet_name}: soma dos produtos {soma:.2f} ≠ TOTAL GERAL {total_row['total']:.2f}"
            )
    else:
        out["errors"].append(f"{grid.sheet_name}: linha TOTAL GERAL ausente")
        tot = soma
        lb = round(sum(p["lucroBruto"] for p in produtos), 2)
        ll = round(sum(p["lucroLiquido"] for p in produtos), 2)
        out["resumo"] = {
            "itens": len(produtos),
            "qtde": round(sum(p["qtde"] for p in produtos), 2),
            "qtdeUn": round(sum(p["qtdeUn"] for p in produtos), 2),
            "aVista": round(sum(p["aVista"] for p in produtos), 2),
            "aPrazo": round(sum(p["aPrazo"] for p in produtos), 2),
            "total": tot,
            "custo": round(sum(p["custo"] for p in produtos), 2),
            "lucroBruto": lb,
            "lucroLiquido": ll,
            "margBruta": (lb / tot) if tot else 0.0,
            "margLiquida": (ll / tot) if tot else 0.0,
            "pmp": 0.0,
        }
    return out


def _parse_resumo(grid: WorkbookGrid | None, year: str) -> dict[str, dict[str, dict]]:
    """competencia -> unidade -> {itens, total, custo, lucroBruto, margBruta}."""
    out: dict[str, dict[str, dict]] = {}
    if not grid or not grid.rows:
        return out
    header_i = None
    for i, row in enumerate(grid.rows):
        first = _fold(str(row[0] if row else ""))
        if first in {"mes", "mês"}:
            header_i = i
            break
    if header_i is None:
        return out
    for row in grid.rows[header_i + 1 :]:
        label = str(row[0] if row else "")
        if _fold(label).startswith("total") or _fold(label).startswith("obs"):
            continue
        m = re.match(r"(\d{2})", label.strip())
        if not m:
            continue
        mm = m.group(1)
        comp = f"{year}-{mm}"
        def _block(itens_i: int, total_i: int, custo_i: int, lb_i: int, mb_i: int) -> dict:
            return {
                "itens": int(_num(_cell(row, itens_i))),
                "total": _money(_cell(row, total_i)),
                "custo": _money(_cell(row, custo_i)),
                "lucroBruto": _money(_cell(row, lb_i)),
                "margBruta": _num(_cell(row, mb_i)),
            }

        out[comp] = {
            "matriz": _block(1, 2, 3, 4, 5),
            "filial": _block(6, 7, 8, 9, 10),
            "consolidado": {
                "total": _money(_cell(row, 11)),
                "lucroBruto": _money(_cell(row, 12)),
                "margBruta": _num(_cell(row, 13)),
            },
        }
    return out


def extract_venda_produto(sheets: list[WorkbookGrid], filename: str) -> dict:
    smap = _sheet_map(sheets)
    parser = sheets[0].kind if sheets else "xlsx"
    year = "2026"
    for grid in sheets:
        year = _year_from_grid(grid, filename)
        break
    razao = ""
    for grid in sheets:
        if grid.rows:
            razao = str(grid.rows[0][0] if grid.rows[0] else "").strip()
            if razao:
                break
    company, _unit = resolve_company("", razao, filename)
    errors: list[str] = []
    if not company:
        errors.append("CNPJ/razão não mapeados para nenhuma empresa cadastrada")

    resumo = _parse_resumo(smap.get("resumo"), year)
    parts: list[dict] = []
    for folded, grid in smap.items():
        meta = _sheet_meta(folded)
        if not meta:
            continue
        unidade, mm = meta
        parsed = _parse_product_sheet(grid, unidade, mm, year)
        comp = parsed["competencia"]
        part_errors = list(parsed.get("errors") or [])
        ref = ((resumo.get(comp) or {}).get(unidade)) or {}
        if ref and parsed.get("resumo"):
            if abs(float(parsed["resumo"]["total"]) - float(ref.get("total") or 0)) >= 0.02:
                part_errors.append(
                    f"{grid.sheet_name}: total {parsed['resumo']['total']:.2f} ≠ Resumo {ref.get('total')}"
                )
        pack_resumo = dict(parsed.get("resumo") or {})
        parts.append(
            {
                "file": filename,
                "parser": parser,
                "tipo": "venda_produto",
                "sheet": grid.sheet_name,
                "cnpj": company.cnpj if company else "",
                "razao": razao,
                "competencia": comp,
                "period": "",
                "company_id": company.id if company else None,
                "company_label": company.label if company else None,
                "unidade": unidade,
                "errors": part_errors,
                "warnings": [],
                "pack_patch": {
                    "vendaProduto": {
                        "fonte": "venda_produto",
                        "unidade": unidade,
                        "resumo": pack_resumo,
                        "produtos": parsed.get("produtos") or [],
                    }
                },
                "lines": [],
                "meta": {
                    "total": pack_resumo.get("total"),
                    "itens": pack_resumo.get("itens"),
                    "lucroBruto": pack_resumo.get("lucroBruto"),
                },
                "status": "ok" if not part_errors else "erro",
            }
        )

    ok_parts = [p for p in parts if not p.get("errors")]
    if not parts:
        errors.append("Nenhuma aba Matriz/Filial com produtos")
    return {
        "file": filename,
        "sheet": ", ".join(sorted(smap.keys())),
        "parser": parser,
        "tipo": "venda_produto",
        "cnpj": company.cnpj if company else "",
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


def merge_venda_produto(packs: list[dict]) -> dict | None:
    """Soma resumos, junta produtos pelo código, recalcula margem e PMP ponderado."""
    blocos = []
    for p in packs:
        vp = p.get("vendaProduto")
        if isinstance(vp, dict) and (vp.get("resumo") or vp.get("produtos")):
            blocos.append(vp)
    if not blocos:
        return None

    money_acc = {k: 0.0 for k in _MONEY_KEYS}
    pmp_weight = 0.0
    pmp_num = 0.0
    by_code: dict[str, dict] = {}
    for vp in blocos:
        res = vp.get("resumo") or {}
        for k in _MONEY_KEYS:
            money_acc[k] = round(money_acc[k] + float(res.get(k) or 0), 2)
        tot = float(res.get("total") or 0)
        pmp = float(res.get("pmp") or 0)
        if tot:
            pmp_num += pmp * tot
            pmp_weight += tot
        for prod in vp.get("produtos") or []:
            if not isinstance(prod, dict):
                continue
            codigo = str(prod.get("codigo") or "").strip()
            if not codigo:
                continue
            cur = by_code.get(codigo)
            if cur is None:
                cur = {
                    "codigo": codigo,
                    "produto": str(prod.get("produto") or ""),
                    "qtde": 0.0,
                    "qtdeUn": 0.0,
                    "aVista": 0.0,
                    "aPrazo": 0.0,
                    "total": 0.0,
                    "custo": 0.0,
                    "lucroBruto": 0.0,
                    "lucroLiquido": 0.0,
                    "pmpNum": 0.0,
                    "pmpDen": 0.0,
                }
                by_code[codigo] = cur
            if prod.get("produto"):
                cur["produto"] = str(prod.get("produto") or cur["produto"])
            for k in ("qtde", "qtdeUn", "aVista", "aPrazo", "total", "custo", "lucroBruto", "lucroLiquido"):
                cur[k] = round(float(cur[k]) + float(prod.get(k) or 0), 2)
            ptot = float(prod.get("total") or 0)
            if ptot:
                cur["pmpNum"] += float(prod.get("pmp") or 0) * ptot
                cur["pmpDen"] += ptot

    produtos: list[dict] = []
    for cur in by_code.values():
        tot = float(cur["total"])
        lb = float(cur["lucroBruto"])
        ll = float(cur["lucroLiquido"])
        pmp_den = float(cur.pop("pmpDen"))
        pmp_n = float(cur.pop("pmpNum"))
        cur["margBruta"] = (lb / tot) if tot else 0.0
        cur["margLiquida"] = (ll / tot) if tot else 0.0
        cur["pmp"] = (pmp_n / pmp_den) if pmp_den else 0.0
        produtos.append(cur)
    produtos.sort(key=lambda x: float(x.get("total") or 0), reverse=True)

    total = money_acc["total"]
    lb = money_acc["lucroBruto"]
    ll = money_acc["lucroLiquido"]
    resumo = {
        "itens": len(produtos),
        **money_acc,
        "margBruta": (lb / total) if total else 0.0,
        "margLiquida": (ll / total) if total else 0.0,
        "pmp": (pmp_num / pmp_weight) if pmp_weight else 0.0,
    }
    return {"fonte": "venda_produto", "resumo": resumo, "produtos": produtos}
