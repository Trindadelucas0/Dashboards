"""Planilha padrão Dashboards — workbook multi-aba (9 abas fixas)."""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from typing import Any

from app.companies import only_digits
from app.extract.aggregate import aggregate, merge_entradas, merge_saidas
from app.extract.classify import competencia_from_filename, scan_cnpj, scan_period, scan_razao
from app.extract.parse_balancete import (
    find_padrao_balancete_month_columns,
    parse_balancete_padrao_column,
)
from app.extract.parse_dre import find_padrao_month_columns, parse_dre_padrao_column
from app.extract.parse_movimento import parse_movimento
from app.extract.parse_impostos import (
    apuracao_patch_from_demo,
    parse_difal_padrao,
    parse_ipi_padrao,
    parse_irpj_csll_padrao,
    parse_pis_cofins_padrao,
)
from app.extract.parse_memoria_5005 import apuracao_patch_from_5005, parse_apuracao_5005
from app.extract.parse_impostos import parse_st_mensal
from app.extract.workbook import WorkbookGrid
from app.security import sha256_bytes

# Abas obrigatórias do esqueleto (normalizado)
_PADRAO_SHEETS = frozenset(
    {
        "dre",
        "balancete",
        "icms 5005-2012",
        "pis cofins",
        "irpj",
        "csll",
        "st",
        "difal",
        "ipi",
    }
)

# Abas de movimento opcionais (nome normalizado sem acento) → tipo do pipeline
_MOVIMENTO_SHEETS = {
    "entradas": "entradas",
    "entrada": "entradas",
    "saidas": "saidas",
    "saida": "saidas",
}


def _fold_name(name: str) -> str:
    nfkd = unicodedata.normalize("NFKD", name or "")
    ascii_txt = "".join(ch for ch in nfkd if not unicodedata.combining(ch)).lower()
    return re.sub(r"\s+", " ", ascii_txt).strip()


def _sheet_map(sheets: list[WorkbookGrid]) -> dict[str, WorkbookGrid]:
    return {_fold_name(s.sheet_name): s for s in sheets}


def is_workbook_padrao(sheets: list[WorkbookGrid]) -> bool:
    """True quando o arquivo traz o conjunto completo de abas do modelo padrão."""
    if len(sheets) < 9:
        return False
    names = {_fold_name(s.sheet_name) for s in sheets}
    return _PADRAO_SHEETS.issubset(names)


def padrao_missing_sheets(sheets: list[WorkbookGrid]) -> list[str]:
    """Abas do esqueleto que faltam num arquivo que claramente tenta ser a planilha padrão."""
    names = {_fold_name(s.sheet_name) for s in sheets}
    presentes = _PADRAO_SHEETS & names
    if len(presentes) < 3 or len(presentes) == len(_PADRAO_SHEETS):
        return []
    return sorted(n.upper() for n in _PADRAO_SHEETS - names)


def _infer_year(sheet_map: dict[str, WorkbookGrid], filename: str) -> str:
    m = re.search(r"(20\d{2})", filename or "")
    if m:
        return m.group(1)
    irpj = sheet_map.get("irpj")
    if irpj:
        for row in (irpj.rows or [])[:5]:
            for cell in row or []:
                if isinstance(cell, datetime):
                    return str(cell.year)
                s = str(cell or "")
                ym = re.search(r"(20\d{2})", s)
                if ym:
                    return ym.group(1)
    comp = competencia_from_filename(filename)
    if comp:
        return comp[:4]
    return str(datetime.now().year)


def _filled_months_dre(grid: WorkbookGrid | None, year: str) -> list[tuple[str, int]]:
    if not grid:
        return []
    cols = find_padrao_month_columns(grid)
    out: list[tuple[str, int]] = []
    for mm, col in sorted(cols.items()):
        if _column_has_numbers(grid, col, start=1):
            out.append((f"{year}-{mm}", col))
    return out


def _column_has_numbers(grid: WorkbookGrid, col: int, start: int = 0) -> bool:
    for row in (grid.rows or [])[start:]:
        if col >= len(row):
            continue
        cell = row[col]
        if cell is None or str(cell).strip() == "":
            continue
        if isinstance(cell, (int, float)):
            return True
        if re.search(r"\d", str(cell)):
            return True
    return False


def _part_base(filename: str, parser: str) -> dict:
    return {
        "file": filename,
        "parser": parser,
        "cnpj": "",
        "razao": "",
        "period": "",
        "company_id": None,
        "company_label": None,
        "unidade": "matriz",
        "errors": [],
        "warnings": [],
        "lines": [],
        "meta": {},
        "status": "ok",
    }


def _make_part(
    filename: str,
    parser: str,
    *,
    tipo: str,
    sheet: str,
    competencia: str,
    pack_patch: dict | None,
    meta: dict | None = None,
    warnings: list[str] | None = None,
    errors: list[str] | None = None,
    lines: list[dict] | None = None,
    status: str = "ok",
) -> dict:
    p = _part_base(filename, parser)
    p.update(
        {
            "tipo": tipo,
            "sheet": sheet,
            "competencia": competencia,
            "pack_patch": pack_patch,
            "meta": meta or {},
            "warnings": warnings or [],
            "errors": errors or [],
            "lines": lines or [],
            "status": status,
        }
    )
    return p


def _dre_pack_patch(dre: dict, filename: str, sheet: str) -> dict:
    pack: dict = {
        "hasDre": True,
        "dre": {**dre, "source": filename, "sheet": sheet, "kind": "padrao"},
    }
    if dre.get("receitaBruta") is not None:
        pack["receitaBruta"] = dre["receitaBruta"]
        pack["lucBruto"] = dre.get("lucBruto")
        pack["lucLiq"] = dre.get("lucLiq")
        pack["margMb"] = dre.get("margMb")
        pack["margMl"] = dre.get("margMl")
        pack["cmv"] = dre.get("cmv")
    return pack


def _balancete_pack_patch(parsed: dict, filename: str, sheet: str) -> dict:
    return {
        "hasBalancete": True,
        "balancete": {**parsed, "source": filename, "sheet": sheet, "kind": "padrao"},
    }


def _movimento_part(
    grid: WorkbookGrid,
    filename: str,
    parser_kind: str,
    tipo: str,
    fallback_comp: str,
    company_cnpj: str,
) -> dict:
    """Aba ENTRADAS/SAÍDAS do workbook padrão → part igual à do fluxo EXITO legado."""
    sheet_name = grid.sheet_name or tipo.upper()
    comp, period_text = scan_period(grid)
    comp = comp or fallback_comp
    mov = parse_movimento(grid, tipo)
    mov.company = scan_razao(grid)
    mov.cnpj = scan_cnpj(grid) or company_cnpj
    mov.period = period_text or comp
    agg = aggregate(mov.lines, "fornecedores" if tipo == "entradas" else "clientes")

    def part(**kwargs) -> dict:
        return _make_part(filename, parser_kind, tipo=tipo, sheet=sheet_name, competencia=comp, **kwargs)

    if not mov.lines:
        return part(
            pack_patch=None,
            status="vazia",
            warnings=[f"{sheet_name}: nenhuma linha de detalhe encontrada"],
        )
    if mov.valor_source != "contabil":
        # Sem a coluna Valor Contábil o total sai da coluna de imposto — não gravar.
        return part(
            pack_patch=None,
            status="vazia",
            meta={"soma": agg["soma"], "nfs": agg["nfs"], "valorSource": mov.valor_source},
            warnings=[
                f"{sheet_name}: aba sem a coluna 'Valor Contábil'; a soma disponível "
                f"({agg['soma']}) é de outra coluna — aba não gravada, reenviar a planilha completa"
            ],
        )

    warnings: list[str] = []
    errors: list[str] = []
    delta = None
    if mov.total_geral is None:
        warnings.append(
            f"{sheet_name}: linha 'Total Geral' sem valor na coluna Valor Contábil — "
            "conferência feita pela soma das linhas"
        )
    else:
        delta = round(agg["soma"] - float(mov.total_geral), 2)
        if abs(delta) >= 0.02:
            errors.append(f"Δ Total Geral = {delta} (limite 0,02)")

    pack = merge_entradas({}, mov) if tipo == "entradas" else merge_saidas({}, mov)
    return part(
        pack_patch=pack,
        meta={
            "totalGeralExcel": mov.total_geral,
            "soma": agg["soma"],
            "nfs": agg["nfs"],
            "delta": delta,
            "lineCount": len(mov.lines),
        },
        warnings=warnings,
        errors=errors,
        lines=[
            {
                "nota": ln.nota,
                "serie": ln.serie,
                "nome": ln.nome,
                "doc": ln.doc,
                "uf": ln.uf,
                "cfop": ln.cfop,
                "valor": ln.valor,
            }
            for ln in mov.lines
        ],
    )


def _cnpj_matches_sheet(grid: WorkbookGrid, expected_cnpj: str) -> bool:
    if not expected_cnpj:
        return True
    found = scan_cnpj(grid)
    if not found:
        return True
    return only_digits(found) == only_digits(expected_cnpj)


def extract_workbook_padrao(
    sheets: list[WorkbookGrid],
    filename: str,
    company_cnpj: str = "",
) -> dict:
    """Extrai todas as abas do modelo padrão. Nunca bloqueia por aba vazia ou CNPJ ausente."""
    smap = _sheet_map(sheets)
    parser_kind = sheets[0].kind if sheets else "xlsx"
    year = _infer_year(smap, filename)
    anchor = competencia_from_filename(filename)

    dre_grid = smap.get("dre")
    dre_months = _filled_months_dre(dre_grid, year)
    if not anchor and dre_months:
        anchor = dre_months[0][0]

    parts: list[dict] = []
    warnings: list[str] = []

    bal_grid = smap.get("balancete")
    tax_comp = anchor or (dre_months[0][0] if dre_months else "")

    # DRE e BALANCETE: só a coluna do mês do arquivo. Coluna vazia → part "vazia"
    # (o modelo vem com janeiro preenchido; sem esse recorte todo mês importaria janeiro).
    if dre_grid and tax_comp:
        col = find_padrao_month_columns(dre_grid).get(tax_comp[-2:])
        if col is None:
            warnings.append(f"DRE: coluna do mês {tax_comp} não encontrada na aba")
        else:
            dre = parse_dre_padrao_column(dre_grid, col) if _column_has_numbers(dre_grid, col, start=1) else {}
            if dre.get("hasValores"):
                parts.append(
                    _make_part(
                        filename,
                        parser_kind,
                        tipo="dre",
                        sheet="DRE",
                        competencia=tax_comp,
                        pack_patch=_dre_pack_patch(dre, filename, "DRE"),
                        meta={"hasValores": True, "receitaBruta": dre.get("receitaBruta")},
                    )
                )
            else:
                parts.append(
                    _make_part(
                        filename,
                        parser_kind,
                        tipo="dre",
                        sheet="DRE",
                        competencia=tax_comp,
                        pack_patch=None,
                        status="vazia",
                        warnings=[f"DRE {tax_comp}: coluna do mês sem valores na planilha"],
                    )
                )

    if bal_grid and tax_comp:
        col = find_padrao_balancete_month_columns(bal_grid).get(tax_comp[-2:])
        if col is None:
            warnings.append(f"BALANCETE: coluna do mês {tax_comp} não encontrada na aba")
        else:
            parsed = (
                parse_balancete_padrao_column(bal_grid, col)
                if _column_has_numbers(bal_grid, col, start=1)
                else {}
            )
            if parsed.get("hasValores"):
                parts.append(
                    _make_part(
                        filename,
                        parser_kind,
                        tipo="balancete",
                        sheet="BALANCETE",
                        competencia=tax_comp,
                        pack_patch=_balancete_pack_patch(parsed, filename, "BALANCETE"),
                        meta={
                            "hasValores": True,
                            "ativo": (parsed.get("totais") or {}).get("ativo"),
                            "passivo": (parsed.get("totais") or {}).get("passivo"),
                        },
                    )
                )
            else:
                parts.append(
                    _make_part(
                        filename,
                        parser_kind,
                        tipo="balancete",
                        sheet="BALANCETE",
                        competencia=tax_comp,
                        pack_patch=None,
                        status="vazia",
                        warnings=[f"BALANCETE {tax_comp}: coluna do mês sem valores na planilha"],
                    )
                )

    # ENTRADAS/SAÍDAS (opcionais): competência vem do "Período:" da própria aba.
    for grid in sheets:
        tipo_mov = _MOVIMENTO_SHEETS.get(_fold_name(grid.sheet_name))
        if tipo_mov:
            parts.append(_movimento_part(grid, filename, parser_kind, tipo_mov, tax_comp, company_cnpj))

    icms_grid = smap.get("icms 5005-2012")
    if icms_grid and tax_comp:
        parsed_5005 = parse_apuracao_5005(icms_grid, filename)
        if parsed_5005.get("hasValores"):
            parts.append(
                _make_part(
                    filename,
                    parser_kind,
                    tipo="apuracao_5005",
                    sheet="ICMS 5005-2012",
                    competencia=tax_comp,
                    pack_patch=apuracao_patch_from_5005(parsed_5005),
                    meta={
                        "icmsARecolher": parsed_5005.get("icmsARecolher"),
                        "ganhoReceitaSubvencao": parsed_5005.get("ganhoReceitaSubvencao"),
                    },
                )
            )
        else:
            warnings.append("ICMS 5005: aba sem valores reconhecidos")

    pis_grid = smap.get("pis cofins")
    if pis_grid and tax_comp:
        pis_parsed = parse_pis_cofins_padrao(pis_grid)
        if pis_parsed.get("hasValores"):
            patch: dict = {}
            meta_pc: dict = {}
            for tributo in ("pis", "cofins"):
                sub = pis_parsed.get(tributo)
                if sub and sub.get("aRecolher") is not None:
                    patch = _deep_merge_patch(patch, apuracao_patch_from_demo(tributo, sub))
                    meta_pc[tributo] = sub.get("aRecolher")
            if patch:
                patch["memoriaPisCofins"] = {
                    "formula": pis_parsed.get("formula") or "aRecolher = débito − crédito",
                    "debito": pis_parsed.get("debito") or {},
                    "credito": pis_parsed.get("credito") or {},
                    "resumo": pis_parsed.get("resumo") or {},
                }
                parts.append(
                    _make_part(
                        filename,
                        parser_kind,
                        tipo="pis_cofins",
                        sheet="PIS COFINS",
                        competencia=tax_comp,
                        pack_patch=patch,
                        meta=meta_pc,
                        warnings=list(pis_parsed.get("warnings") or []),
                    )
                )
        else:
            parts.append(
                _make_part(
                    filename,
                    parser_kind,
                    tipo="pis_cofins",
                    sheet="PIS COFINS",
                    competencia=tax_comp,
                    pack_patch=None,
                    status="vazia",
                    warnings=["PIS/COFINS: resumo sem valores"],
                )
            )

    st_grid = smap.get("st")
    if st_grid and tax_comp:
        st_parsed = parse_st_mensal(st_grid)
        total = float(st_parsed.get("aRecolher") or 0)
        if abs(total) > 0.009:
            parts.append(
                _make_part(
                    filename,
                    parser_kind,
                    tipo="icms_st",
                    sheet="ST",
                    competencia=tax_comp,
                    pack_patch=apuracao_patch_from_demo("icms_st", st_parsed),
                    meta={"aRecolher": total},
                )
            )

    difal_grid = smap.get("difal")
    if difal_grid and tax_comp:
        difal_parsed = parse_difal_padrao(difal_grid)
        total_d = float(difal_parsed.get("aRecolher") or 0)
        if abs(total_d) > 0.009:
            parts.append(
                _make_part(
                    filename,
                    parser_kind,
                    tipo="difal",
                    sheet="DIFAL",
                    competencia=tax_comp,
                    pack_patch=apuracao_patch_from_demo("difal", difal_parsed),
                    meta={"aRecolher": total_d},
                )
            )

    ipi_grid = smap.get("ipi")
    if ipi_grid and tax_comp:
        ipi_parsed = parse_ipi_padrao(ipi_grid)
        if ipi_parsed.get("hasValores"):
            parts.append(
                _make_part(
                    filename,
                    parser_kind,
                    tipo="ipi",
                    sheet="IPI",
                    competencia=tax_comp,
                    pack_patch=apuracao_patch_from_demo("ipi", ipi_parsed),
                    meta={"aRecolher": ipi_parsed.get("aRecolher")},
                )
            )

    for sheet_key, tipo_ir in (("irpj", "irpj"), ("csll", "csll")):
        grid = smap.get(sheet_key)
        if not grid or not tax_comp:
            continue
        if not _cnpj_matches_sheet(grid, company_cnpj):
            parts.append(
                _make_part(
                    filename,
                    parser_kind,
                    tipo=tipo_ir,
                    sheet=sheet_key.upper(),
                    competencia=tax_comp,
                    pack_patch=None,
                    status="ignorada",
                    warnings=[f"{sheet_key.upper()}: CNPJ da aba não confere com a empresa do dashboard — ignorado"],
                )
            )
            continue
        parsed = parse_irpj_csll_padrao(grid, tipo_ir)
        if parsed.get("hasValores"):
            parts.append(
                _make_part(
                    filename,
                    parser_kind,
                    tipo=tipo_ir,
                    sheet=sheet_key.upper(),
                    competencia=tax_comp,
                    pack_patch=apuracao_patch_from_demo(tipo_ir, parsed),
                    meta={"aRecolher": parsed.get("aRecolher")},
                )
            )

    ok_parts = [p for p in parts if p.get("status") == "ok" and p.get("pack_patch")]
    if not ok_parts:
        warnings.append("Nenhuma aba com valores graváveis neste arquivo")

    return {
        "file": filename,
        "sheet": ", ".join(sorted(smap.keys())),
        "parser": parser_kind,
        "tipo": "workbook_padrao",
        "cnpj": company_cnpj or "",
        "razao": "",
        "competencia": anchor or tax_comp or "",
        "period": "",
        "company_id": None,
        "company_label": None,
        "unidade": "matriz",
        "errors": [],
        "warnings": warnings,
        "pack_patch": None,
        "lines": [],
        "meta": {"partsCount": len(parts), "okParts": len(ok_parts)},
        "parts": parts,
    }


def _deep_merge_patch(base: dict, patch: dict) -> dict:
    out = dict(base or {})
    for key, val in (patch or {}).items():
        if isinstance(val, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge_patch(out[key], val)
        else:
            out[key] = val
    return out


def expand_workbook_parts(extracted: dict) -> list[dict]:
    """Expande parts do workbook padrão em itens de preview/commit."""
    if extracted.get("tipo") != "workbook_padrao":
        return [extracted]
    base = {k: v for k, v in extracted.items() if k not in ("parts", "pack_patch")}
    file_hash = extracted.get("file_hash")
    items: list[dict] = []
    for part in extracted.get("parts") or []:
        item = {**base, **part}
        item["file"] = f"{extracted.get('file', '')} · {part.get('sheet') or part.get('tipo')}"
        if file_hash:
            part_tipo = part.get("tipo") or "part"
            item["file_hash"] = sha256_bytes(f"{file_hash}:{part_tipo}".encode())
            item["source_file_hash"] = file_hash
        if part.get("status") in ("vazia", "ignorada") and not part.get("pack_patch"):
            item["ok"] = True
            item["skipped"] = True
        else:
            item["ok"] = not item.get("errors")
        items.append(item)
    if not items:
        fallback = {**extracted, "ok": True}
        items.append(fallback)
    return items
