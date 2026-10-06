"""Livro de Registro de Apuração (Resumo + CFOP entradas/saídas + subtotais + ajustes).

Não é a planilha padrão (DRE / BALANCETE / ICMS 5005). Uma part por competência.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.extract.classify import resolve_company
from app.extract.workbook import WorkbookGrid

_TRIBUTOS = ("icms", "ipi", "pis", "cofins")
_OUTROS_LABEL = {"pis": "Imune/Susp.", "cofins": "Imune/Susp."}


def _fold(value: str) -> str:
    nfkd = unicodedata.normalize("NFKD", value or "")
    ascii_txt = "".join(ch for ch in nfkd if not unicodedata.combining(ch)).lower()
    return re.sub(r"\s+", " ", ascii_txt).strip()


def _sheet_map(sheets: list[WorkbookGrid]) -> dict[str, WorkbookGrid]:
    return {_fold(s.sheet_name): s for s in sheets}


def is_livro_apuracao(sheets: list[WorkbookGrid]) -> bool:
    """True só com abas Resumo e ICMS_Entradas. Planilha padrão (DRE/BALANCETE/5005) não entra."""
    if not sheets:
        return False
    names = {_fold(s.sheet_name) for s in sheets}
    return "resumo" in names and "icms_entradas" in names


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


def _money(raw: str) -> float:
    s = (raw or "").strip().replace(" ", "")
    if not s or s in {"-", "—"}:
        return 0.0
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return round(float(s), 2)
    except ValueError:
        return 0.0


def _competencia(raw: str) -> str:
    m = re.match(r"(20\d{2})-(\d{2})", (raw or "").strip())
    if not m:
        return ""
    return f"{m.group(1)}-{m.group(2)}"


def _cfop(raw: str) -> str:
    s = (raw or "").strip()
    if re.fullmatch(r"\d+\.0", s):
        s = s[:-2]
    return s


def _tributo_key(raw: str) -> str:
    key = _fold(raw)
    return key if key in _TRIBUTOS else ""


def _is_total_label(raw: str) -> bool:
    folded = _fold(raw)
    return folded == "total" or folded.startswith("total ")


def _leia_me(grid: WorkbookGrid | None) -> tuple[str, str]:
    cnpj = ""
    razao = ""
    if not grid:
        return cnpj, razao
    for row in grid.rows or []:
        label = _fold(str(row[0] if row else ""))
        value = str(row[1] if row and len(row) > 1 and row[1] is not None else "").strip()
        if label == "cnpj" and value:
            digits = "".join(ch for ch in value if ch.isdigit())
            if len(digits) == 14:
                cnpj = digits
        elif label == "empresa" and value and not razao:
            razao = value
    return cnpj, razao


def _parse_resumo(grid: WorkbookGrid | None) -> dict[str, dict[str, dict]]:
    out: dict[str, dict[str, dict]] = {}
    if not grid or not grid.rows:
        return out
    hmap = _header_map(grid.rows[0])
    i_trib = _col(hmap, "Tributo")
    i_per = _col(hmap, "Período", "Periodo")
    i_deb = _col(hmap, "Débitos por saídas", "Debitos por saidas")
    i_od = _col(hmap, "Outros débitos", "Outros debitos")
    i_sd = _col(hmap, "Saldo devedor")
    i_cr = _col(hmap, "Créditos por entradas", "Creditos por entradas")
    i_ant = _col(hmap, "Saldo credor período anterior", "Saldo credor periodo anterior")
    i_oc = _col(hmap, "Outros créditos", "Outros creditos")
    i_sc = _col(hmap, "Saldo credor")
    i_rec = _col(hmap, "Imposto a recolher")
    i_tr = _col(hmap, "Saldo credor a transportar")
    i_conf = _col(hmap, "Conferência", "Conferencia")
    for row in grid.rows[1:]:
        trib = _tributo_key(_cell(row, i_trib))
        comp = _competencia(_cell(row, i_per))
        if not trib or not comp:
            continue
        debitos = _money(_cell(row, i_deb))
        out.setdefault(comp, {})[trib] = {
            "debitos": debitos,
            "outrosDebitos": _money(_cell(row, i_od)),
            "saldoDevedor": _money(_cell(row, i_sd)),
            "creditos": _money(_cell(row, i_cr)),
            "saldoCredorAnterior": _money(_cell(row, i_ant)),
            "outrosCreditos": _money(_cell(row, i_oc)),
            "saldoCredor": _money(_cell(row, i_sc)),
            "aRecolher": _money(_cell(row, i_rec)),
            "saldoCredorSeguinte": _money(_cell(row, i_tr)),
            "conferencia": _cell(row, i_conf),
            "fonte": "livro_apuracao",
            "apurado": debitos,
        }
    return out


def _parse_cfop(grid: WorkbookGrid | None) -> tuple[dict[str, list[dict]], str | None]:
    grouped: dict[str, list[dict]] = {}
    outros_label: str | None = None
    if not grid or not grid.rows:
        return grouped, outros_label
    hmap = _header_map(grid.rows[0])
    i_per = _col(hmap, "Período", "Periodo")
    i_cfop = _col(hmap, "CFOP")
    i_desc = _col(hmap, "Descrição", "Descricao")
    i_vc = _col(hmap, "Valor Contábil", "Valor Contabil")
    i_bc = _col(hmap, "Base de Cálculo", "Base de Calculo")
    i_imp = _col(hmap, "Imposto Creditado", "Imposto Debitado")
    if i_imp is None:
        for key, idx in hmap.items():
            if key.startswith("imposto"):
                i_imp = idx
                break
    i_ise = _col(hmap, "Isentas/Não Tribut.", "Isentas/Nao Tribut.")
    if i_ise is None:
        for key, idx in hmap.items():
            if key.startswith("isentas"):
                i_ise = idx
                break
    i_out = None
    for key, idx in hmap.items():
        if "imune" in key:
            i_out = idx
            outros_label = "Imune/Susp."
            break
    if i_out is None:
        i_out = _col(hmap, "Outros")
    i_arq = _col(hmap, "Arquivo de origem")
    for row in grid.rows[1:]:
        comp = _competencia(_cell(row, i_per))
        cfop = _cfop(_cell(row, i_cfop))
        descricao = _cell(row, i_desc)
        if not comp or not cfop or _is_total_label(descricao):
            continue
        grouped.setdefault(comp, []).append(
            {
                "cfop": cfop,
                "descricao": descricao,
                "valorContabil": _money(_cell(row, i_vc)),
                "baseCalculo": _money(_cell(row, i_bc)),
                "imposto": _money(_cell(row, i_imp)),
                "isentas": _money(_cell(row, i_ise)),
                "outros": _money(_cell(row, i_out)),
                "arquivo": _cell(row, i_arq),
            }
        )
    return grouped, outros_label


def _parse_subtotais(grid: WorkbookGrid | None) -> dict[str, dict[str, list[dict]]]:
    out: dict[str, dict[str, list[dict]]] = {}
    if not grid or not grid.rows:
        return out
    hmap = _header_map(grid.rows[0])
    i_trib = _col(hmap, "Tributo")
    i_per = _col(hmap, "Período", "Periodo")
    i_mov = _col(hmap, "Movimento")
    i_cod = _col(hmap, "Código", "Codigo")
    i_desc = _col(hmap, "Descrição", "Descricao")
    i_vc = _col(hmap, "Valor Contábil", "Valor Contabil")
    i_bc = _col(hmap, "Base de Cálculo", "Base de Calculo")
    i_imp = None
    for key, idx in hmap.items():
        if key.startswith("imposto"):
            i_imp = idx
            break
    i_ise = None
    for key, idx in hmap.items():
        if key.startswith("isentas"):
            i_ise = idx
            break
    i_out = None
    for key, idx in hmap.items():
        if key.startswith("outros") or "imune" in key:
            i_out = idx
            break
    for row in grid.rows[1:]:
        trib = _tributo_key(_cell(row, i_trib))
        comp = _competencia(_cell(row, i_per))
        if not trib or not comp:
            continue
        out.setdefault(comp, {}).setdefault(trib, []).append(
            {
                "movimento": _cell(row, i_mov),
                "codigo": _cfop(_cell(row, i_cod)),
                "descricao": _cell(row, i_desc),
                "valorContabil": _money(_cell(row, i_vc)),
                "baseCalculo": _money(_cell(row, i_bc)),
                "imposto": _money(_cell(row, i_imp)),
                "isentas": _money(_cell(row, i_ise)),
                "outros": _money(_cell(row, i_out)),
            }
        )
    return out


def _parse_ajustes(grid: WorkbookGrid | None) -> dict[str, dict[str, list[dict]]]:
    out: dict[str, dict[str, list[dict]]] = {}
    if not grid or not grid.rows:
        return out
    hmap = _header_map(grid.rows[0])
    i_trib = _col(hmap, "Tributo")
    i_per = _col(hmap, "Período", "Periodo")
    i_cod = _col(hmap, "Cód. ajuste", "Cod. ajuste")
    if i_cod is None:
        for key, idx in hmap.items():
            if "ajuste" in key or key.startswith("cod"):
                i_cod = idx
                break
    i_desc = _col(hmap, "Descrição do ajuste", "Descricao do ajuste")
    if i_desc is None:
        for key, idx in hmap.items():
            if key.startswith("descricao"):
                i_desc = idx
                break
    i_cfop = _col(hmap, "CFOP")
    i_deb = _col(hmap, "Débito", "Debito")
    i_cr = _col(hmap, "Crédito", "Credito")
    i_arq = _col(hmap, "Arquivo de origem")
    for row in grid.rows[1:]:
        trib = _tributo_key(_cell(row, i_trib))
        comp = _competencia(_cell(row, i_per))
        descricao = _cell(row, i_desc)
        if not trib or not comp or _is_total_label(descricao):
            continue
        out.setdefault(comp, {}).setdefault(trib, []).append(
            {
                "codigo": _cfop(_cell(row, i_cod)),
                "descricao": descricao,
                "cfop": _cfop(_cell(row, i_cfop)),
                "debito": _money(_cell(row, i_deb)),
                "credito": _money(_cell(row, i_cr)),
                "arquivo": _cell(row, i_arq),
            }
        )
    return out


def extract_livro_apuracao(sheets: list[WorkbookGrid], filename: str) -> dict:
    smap = _sheet_map(sheets)
    parser = sheets[0].kind if sheets else "xlsx"
    cnpj, razao = _leia_me(smap.get("leia-me"))
    company, unidade = resolve_company(cnpj, razao, filename)
    unidade = unidade or "matriz"
    errors: list[str] = []
    if not company:
        errors.append("CNPJ/razão não mapeados para nenhuma empresa cadastrada")

    resumo = _parse_resumo(smap.get("resumo"))
    cfop: dict[str, dict[str, dict[str, list]]] = {}
    for trib, (ent_name, sai_name) in (
        ("icms", ("icms_entradas", "icms_saidas")),
        ("ipi", ("ipi_entradas", "ipi_saidas")),
        ("pis", ("pis_entradas", "pis_saidas")),
        ("cofins", ("cofins_entradas", "cofins_saidas")),
    ):
        entradas, _lab_e = _parse_cfop(smap.get(ent_name))
        saidas, _lab_s = _parse_cfop(smap.get(sai_name))
        for comp, lines in entradas.items():
            cfop.setdefault(comp, {}).setdefault(trib, {})["entradas"] = lines
        for comp, lines in saidas.items():
            cfop.setdefault(comp, {}).setdefault(trib, {})["saidas"] = lines

    subtotais = _parse_subtotais(smap.get("subtotais"))
    ajustes = _parse_ajustes(smap.get("ajustes"))

    comps = sorted(set(resumo) | set(cfop) | set(subtotais) | set(ajustes))
    parts: list[dict] = []
    for comp in comps:
        apuracao: dict[str, dict] = {}
        tributos: dict[str, dict] = {}
        for trib in _TRIBUTOS:
            bloco = (resumo.get(comp) or {}).get(trib)
            if isinstance(bloco, dict):
                apuracao[trib] = dict(bloco)
            linhas = (cfop.get(comp) or {}).get(trib) or {}
            subs = ((subtotais.get(comp) or {}).get(trib)) or []
            aj = ((ajustes.get(comp) or {}).get(trib)) or []
            if not bloco and not linhas and not subs and not aj:
                continue
            item: dict[str, Any] = {
                "entradas": list(linhas.get("entradas") or []),
                "saidas": list(linhas.get("saidas") or []),
                "subtotais": list(subs),
                "ajustes": list(aj),
            }
            if trib in _OUTROS_LABEL:
                item["colunaOutrosLabel"] = _OUTROS_LABEL[trib]
            tributos[trib] = item
        if not apuracao and not tributos:
            continue
        parts.append(
            {
                "file": filename,
                "parser": parser,
                "tipo": "livro_apuracao",
                "sheet": "Resumo",
                "cnpj": cnpj,
                "razao": razao,
                "competencia": comp,
                "period": "",
                "company_id": company.id if company else None,
                "company_label": company.label if company else None,
                "unidade": unidade,
                "errors": list(errors),
                "warnings": [],
                "lines": [],
                "meta": {
                    "aRecolherIcms": (apuracao.get("icms") or {}).get("aRecolher"),
                    "fonte": "livro_apuracao",
                },
                "status": "ok" if not errors else "erro",
                "pack_patch": {
                    "apuracao": apuracao,
                    "livroApuracao": {"tributos": tributos},
                },
            }
        )

    if not parts and not errors:
        errors.append("Livro de apuração sem competências no Resumo")

    return {
        "file": filename,
        "sheet": "Resumo",
        "parser": parser,
        "tipo": "livro_apuracao",
        "cnpj": cnpj,
        "razao": razao,
        "competencia": parts[0]["competencia"] if parts else "",
        "period": "",
        "company_id": company.id if company else None,
        "company_label": company.label if company else None,
        "unidade": unidade,
        "errors": errors,
        "warnings": [],
        "pack_patch": None,
        "lines": [],
        "meta": {"partsCount": len(parts)},
        "parts": parts,
    }
