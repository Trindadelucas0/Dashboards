from __future__ import annotations

from pathlib import Path

from app.extract.aggregate import aggregate, merge_entradas, merge_saidas, validate_movimento
from app.extract.classify import (
    EMPTY_FILE_ERROR,
    RANGE_ERROR,
    competencia_from_filename,
    detect_sheet_tipo,
    is_multi_month_movimento,
    resolve_company,
    scan_cnpj,
    scan_period,
    scan_razao,
)
from app.extract.parse_balancete import parse_balancete
from app.extract.parse_dre import extract_dre_vertical, is_analise_vertical_dre, parse_dre
from app.extract.parse_impostos import (
    apuracao_from_imposto_row,
    apuracao_patch_from_demo,
    composicao_from_apuracao,
    deducoes_from_apuracao,
    is_demonstrativo_icms,
    is_demonstrativo_subtri,
    merge_subtri_sheets,
    parse_demonstrativo_icms,
    parse_demonstrativo_ipi,
    parse_demonstrativo_pis_cofins,
    parse_impostos_icms_ipi,
    parse_st_mensal,
)
from app.extract.parse_memoria_5005 import apuracao_patch_from_5005, is_apuracao_5005, parse_apuracao_5005
from app.extract.parse_workbook_padrao import (
    extract_workbook_padrao,
    is_workbook_padrao,
    padrao_missing_sheets,
)
from app.extract.parse_movimento import parse_movimento
from app.extract.workbook import WorkbookGrid, is_placeholder_bytes, load_all_sheets


def _deep_merge(base: dict, patch: dict) -> dict:
    out = dict(base or {})
    for key, val in (patch or {}).items():
        if isinstance(val, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], val)
        else:
            out[key] = val
    return out


def _extract_pis_cofins_sheets(sheets: list[WorkbookGrid], filename: str) -> list[tuple[str, WorkbookGrid]]:
    out: list[tuple[str, WorkbookGrid]] = []
    for sh in sheets:
        tipo = detect_sheet_tipo(sh, filename)
        if tipo in ("pis", "cofins"):
            out.append((tipo, sh))
    return out


def _pis_cofins_score(parsed: dict) -> float:
    return abs(float(parsed.get("aRecolher") or 0)) + abs(float(parsed.get("apurado") or 0))


def _apply_pis_cofins_extract(result: dict, tax_sheets: list[tuple[str, WorkbookGrid]], filename: str) -> dict:
    meta_grid = tax_sheets[0][1]
    kinds = {t for t, _ in tax_sheets}
    result["tipo"] = "pis_cofins" if len(kinds) > 1 else tax_sheets[0][0]
    result["sheet"] = ", ".join(sh.sheet_name for _, sh in tax_sheets)
    result["parser"] = meta_grid.kind
    result["cnpj"] = scan_cnpj(meta_grid)
    result["razao"] = scan_razao(meta_grid)
    competencia, period_text = scan_period(meta_grid)
    if not competencia:
        competencia = competencia_from_filename(filename) or competencia_from_filename(meta_grid.sheet_name or "")
    result["competencia"] = competencia
    result["period"] = period_text

    best: dict[str, tuple[WorkbookGrid, dict]] = {}
    for tributo, sh in tax_sheets:
        parsed = parse_demonstrativo_pis_cofins(sh, tributo)
        prev = best.get(tributo)
        if prev is None or _pis_cofins_score(parsed) > _pis_cofins_score(prev[1]):
            best[tributo] = (sh, parsed)

    pack_patch: dict = {}
    meta: dict = {}
    for tributo, (sh, parsed) in best.items():
        pack_patch = _deep_merge(pack_patch, apuracao_patch_from_demo(tributo, parsed))
        meta[tributo] = {
            "aRecolher": parsed.get("aRecolher"),
            "apurado": parsed.get("apurado"),
            "credito": parsed.get("credito"),
            "sheet": sh.sheet_name,
        }
    if len(best) == 1:
        only = next(iter(best.values()))[1]
        meta["aRecolher"] = only.get("aRecolher")
        meta["apurado"] = only.get("apurado")
        meta["baseCalculo"] = only.get("baseCalculo")
    result["pack_patch"] = pack_patch
    result["meta"] = meta
    return result


def _empty_result(filename: str, tipo: str, extra: dict | None = None) -> dict:
    base = {
        "file": filename,
        "sheet": "",
        "parser": "empty",
        "tipo": tipo,
        "cnpj": "",
        "razao": "",
        "competencia": "",
        "period": "",
        "company_id": None,
        "company_label": None,
        "unidade": "matriz",
        "errors": [],
        "warnings": [],
        "pack_patch": None,
        "lines": [],
        "meta": {},
    }
    if extra:
        base.update(extra)
    return base


def classify_and_extract(
    path: str | Path,
    data: bytes | None = None,
    db=None,
    original_filename: str | None = None,
    company_cnpj: str | None = None,
) -> dict:
    path = Path(path)
    filename = original_filename or path.name
    if data is None:
        data = path.read_bytes()
    if is_placeholder_bytes(data):
        tipo = detect_sheet_tipo(WorkbookGrid(str(path), "", [], "empty"), filename)
        return _empty_result(filename, tipo, {"errors": [EMPTY_FILE_ERROR]})
    try:
        sheets = load_all_sheets(path, data)
    except Exception as exc:  # noqa: BLE001
        tipo = detect_sheet_tipo(WorkbookGrid(str(path), "", [], "unknown"), filename)
        return _empty_result(
            filename,
            tipo,
            {"errors": [f"Não foi possível ler o arquivo: {exc}"], "parser": "fail"},
        )

    if is_workbook_padrao(sheets):
        return extract_workbook_padrao(sheets, filename, company_cnpj=company_cnpj or "")

    tax_sheets = _extract_pis_cofins_sheets(sheets, filename)
    grid = sheets[0]
    # Análise Vertical multi-mês: parts por competência (antes do caminho DRE unitário)
    if is_analise_vertical_dre(grid, filename):
        return extract_dre_vertical(grid, filename, company_cnpj=company_cnpj or "")

    tipo = detect_sheet_tipo(grid, filename)

    if tax_sheets:
        result = {
            "file": filename,
            "sheet": "",
            "parser": grid.kind,
            "tipo": "pis_cofins",
            "cnpj": "",
            "razao": "",
            "competencia": "",
            "period": "",
            "company_id": None,
            "company_label": None,
            "unidade": "matriz",
            "errors": [],
            "warnings": [],
            "pack_patch": None,
            "lines": [],
            "meta": {},
        }
        result = _apply_pis_cofins_extract(result, tax_sheets, filename)
        company, unidade = resolve_company(result["cnpj"], result["razao"], filename)
        if not company and db is not None:
            from app.companies import resolve_from_db

            company, unidade = resolve_from_db(db, result["cnpj"], result["razao"] or filename)
        if company and not result["cnpj"] and company.cnpj:
            result["cnpj"] = company.cnpj
        result["company_id"] = company.id if company else None
        result["company_label"] = company.label if company else None
        result["unidade"] = unidade or "matriz"
        if not company:
            result["errors"].append("CNPJ/razão não mapeados para nenhuma empresa cadastrada")
            return result
        if not result["competencia"]:
            result["errors"].append("Competência não identificada no cabeçalho nem no nome do arquivo")
            return result
        return result

    cnpj = scan_cnpj(grid)
    razao = scan_razao(grid)
    competencia, period_text = scan_period(grid)
    if not competencia:
        competencia = (
            competencia_from_filename(filename)
            or competencia_from_filename(grid.sheet_name or "")
            or competencia_from_filename(path.parent.name)
        )
    company, unidade = resolve_company(cnpj, razao, filename)
    if not company and db is not None:
        from app.companies import resolve_from_db

        company, unidade = resolve_from_db(db, cnpj, razao or filename)
    if company and not cnpj and company.cnpj:
        cnpj = company.cnpj

    result = {
        "file": filename,
        "sheet": grid.sheet_name,
        "parser": grid.kind,
        "tipo": tipo,
        "cnpj": cnpj,
        "razao": razao,
        "competencia": competencia,
        "period": period_text,
        "company_id": company.id if company else None,
        "company_label": company.label if company else None,
        "unidade": unidade or "matriz",
        "errors": [],
        "warnings": [],
        "pack_patch": None,
        "lines": [],
        "meta": {},
    }

    faltando = padrao_missing_sheets(sheets)
    if faltando:
        result["warnings"].append(
            f"Planilha padrão incompleta (faltam as abas {', '.join(faltando)}): apenas a aba "
            f"{grid.sheet_name} foi lida — reenvie o arquivo com todas as abas do modelo"
        )

    if not company:
        if tipo == "icms_st":
            result["warnings"].append("ST sem CNPJ — a empresa aberta no dashboard será usada ao gravar")
        elif tipo == "apuracao_5005" or is_apuracao_5005(grid, filename):
            # 5005 não traz CNPJ — company_id vem do override no import (Baifer etc.).
            result["warnings"].append("APURAÇÃO 5005 sem CNPJ — a empresa aberta no dashboard será usada ao gravar")
        else:
            result["errors"].append("CNPJ/razão não mapeados para nenhuma empresa cadastrada")
            return result
    # Impostos anuais / ST / 5005 sem competência no nome — movimento/DRE ainda exigem.
    if not competencia and tipo not in (
        "impostos",
        "irpj",
        "ipi",
        "pis",
        "cofins",
        "pis_cofins",
        "icms",
        "icms_st",
        "apuracao_5005",
    ):
        result["errors"].append("Competência não identificada no cabeçalho nem no nome do arquivo")
        return result

    if tipo in ("entradas", "saidas"):
        if is_multi_month_movimento(grid, filename):
            result["errors"].append(RANGE_ERROR)
            return result
        mov = parse_movimento(grid, tipo)
        mov.company = razao
        mov.cnpj = cnpj
        mov.period = period_text or competencia
        party = "fornecedores" if tipo == "entradas" else "clientes"
        agg = aggregate(mov.lines, party)
        errors = validate_movimento(mov, agg["soma"])
        result["errors"].extend(errors)
        result["meta"] = {
            "totalGeralExcel": mov.total_geral,
            "soma": agg["soma"],
            "nfs": agg["nfs"],
            "delta": round(agg["soma"] - float(mov.total_geral or 0), 2),
            "lineCount": len(mov.lines),
        }
        result["lines"] = [
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
        ]
        pack: dict = {}
        if tipo == "entradas":
            pack = merge_entradas({}, mov)
        else:
            pack = merge_saidas({}, mov)
        result["pack_patch"] = pack
        return result

    if tipo == "balancete":
        parsed = parse_balancete(grid)
        result["pack_patch"] = {
            "hasBalancete": True,
            "balancete": {**parsed, "source": filename, "sheet": grid.sheet_name},
        }
        if not parsed.get("hasValores"):
            result["warnings"].append("Balancete sem valores numéricos reconhecidos")
            result["errors"].append("Balancete sem contas reconhecidas")
        result["meta"] = {
            "lineCount": len(parsed.get("contas") or []),
            "hasValores": parsed.get("hasValores"),
            "ativo": (parsed.get("totais") or {}).get("ativo"),
            "passivo": (parsed.get("totais") or {}).get("passivo"),
        }
        return result

    if tipo == "dre":
        dre = parse_dre(grid)
        result["pack_patch"] = {
            "hasDre": True,
            "dre": {**dre, "source": filename, "sheet": grid.sheet_name},
        }
        if dre.get("receitaBruta") is not None:
            result["pack_patch"]["receitaBruta"] = dre["receitaBruta"]
            result["pack_patch"]["lucBruto"] = dre.get("lucBruto")
            result["pack_patch"]["lucLiq"] = dre.get("lucLiq")
            result["pack_patch"]["margMb"] = dre.get("margMb")
            result["pack_patch"]["margMl"] = dre.get("margMl")
            result["pack_patch"]["cmv"] = dre.get("cmv")
        if not dre.get("hasValores"):
            result["warnings"].append(
                "RESULTADO/DRE sem valores numéricos exportados — estrutura gravada; margens ficam N/D"
            )
        result["meta"] = {"lineCount": len(dre.get("linhas") or []), "hasValores": dre.get("hasValores")}
        return result

    if tipo == "apuracao_5005" or (tipo in ("desconhecido", "impostos") and is_apuracao_5005(grid, filename)):
        parsed = parse_apuracao_5005(grid, filename)
        result["tipo"] = "apuracao_5005"
        if not result.get("competencia") and parsed.get("competencia"):
            result["competencia"] = parsed["competencia"]
        result["pack_patch"] = apuracao_patch_from_5005(parsed)
        result["meta"] = {
            "icmsARecolher": parsed.get("icmsARecolher"),
            "ganhoReceitaSubvencao": parsed.get("ganhoReceitaSubvencao"),
            "hasValores": parsed.get("hasValores"),
        }
        if not parsed.get("hasValores"):
            result["errors"].append("APURAÇÃO 5005 sem valores reconhecidos")
        return result

    if tipo == "ipi":
        parsed = parse_demonstrativo_ipi(grid)
        result["pack_patch"] = apuracao_patch_from_demo("ipi", parsed)
        result["meta"] = {"aRecolher": parsed.get("aRecolher"), "debitos": parsed.get("debitos")}
        return result

    if tipo in ("pis", "cofins"):
        parsed = parse_demonstrativo_pis_cofins(grid, tipo)
        result["pack_patch"] = apuracao_patch_from_demo(tipo, parsed)
        result["meta"] = {"aRecolher": parsed.get("aRecolher"), "baseCalculo": parsed.get("baseCalculo")}
        return result

    if tipo == "icms_st":
        if any(is_demonstrativo_subtri(sh, filename) for sh in sheets):
            subtri_sheets = [sh for sh in sheets if is_demonstrativo_subtri(sh, filename)]
            parsed = merge_subtri_sheets(subtri_sheets or sheets)
            result["sheet"] = ", ".join(sh.sheet_name for sh in (subtri_sheets or sheets))
        else:
            parsed = parse_st_mensal(grid)
        result["pack_patch"] = apuracao_patch_from_demo("icms_st", parsed)
        result["meta"] = {"aRecolher": parsed.get("aRecolher"), "ufs": len(parsed.get("byUf") or {})}
        return result

    if tipo == "icms" or (tipo == "impostos" and is_demonstrativo_icms(grid)):
        parsed = parse_demonstrativo_icms(grid)
        result["tipo"] = "icms"
        result["pack_patch"] = apuracao_patch_from_demo("icms", parsed)
        result["meta"] = {
            "aRecolher": parsed.get("aRecolher"),
            "debitos": parsed.get("debitos"),
            "apurado": parsed.get("apurado"),
        }
        return result

    if tipo == "impostos":
        parsed = parse_impostos_icms_ipi(grid)
        if parsed.get("rows"):
            year = (competencia or "")[:4] or "2026"
            mm = (competencia or "")[-2:] if competencia else ""
            unit = result["unidade"] or "matriz"
            if not mm:
                # último mês presente na tabela
                meses = sorted({r["mes"] for r in parsed["rows"]})
                mm = meses[-1] if meses else ""
                if mm:
                    competencia = f"{year}-{mm}"
                    result["competencia"] = competencia
                    result["warnings"].append(
                        f"Competência inferida da tabela de impostos: {competencia} (arquivo anual multi-mês)"
                    )
            row = parsed["byCompetenciaUnidade"].get(f"{mm}|{unit}")
            if not row and str(unit).lower() == "matriz":
                row = next(
                    (r for r in parsed["rows"] if r["mes"] == mm and str(r.get("filial") or "").strip().lower() == "matriz"),
                    None,
                )
            # se a linha da matriz/unidade estiver zerada, preferir filial com valor no mês
            def _row_valor(r: dict | None) -> float:
                if not r:
                    return 0.0
                return abs(float(r.get("icmsARecolher") or 0)) + abs(float(r.get("ipiARecolher") or 0))

            if (not row or _row_valor(row) == 0) and mm:
                candidatos = [r for r in parsed["rows"] if r["mes"] == mm]
                candidatos.sort(key=_row_valor, reverse=True)
                if candidatos and _row_valor(candidatos[0]) > 0:
                    row = candidatos[0]
                    result["unidade"] = row["unidade"]
                    unit = row["unidade"]
                    result["warnings"].append(
                        f"Unidade ajustada para filial com apuração no mês: {row.get('filial')} ({unit})"
                    )
            elif not row and mm:
                row = next((r for r in parsed["rows"] if r["mes"] == mm), None)
                if row:
                    result["unidade"] = row["unidade"]
                    unit = row["unidade"]
                    result["warnings"].append(f"Unidade ajustada para a linha do mês: {unit}")
            ap = apuracao_from_imposto_row(row)
            ded = deducoes_from_apuracao(ap)
            comp = composicao_from_apuracao(ap)
            result["pack_patch"] = {
                "impostos": {**parsed, "source": filename, "sheet": grid.sheet_name},
                "apuracao": ap,
                "composicao": comp,
                "deducoes": ded,
                "dedPct": None,
            }
            if not row:
                result["warnings"].append(
                    f"Tabela ICMS/IPI importada, mas sem linha para {competencia}/{unit} — apuração fica vazia até escolher a filial certa"
                )
        else:
            if not competencia:
                result["errors"].append("Competência não identificada e tabela ICMS/IPI não reconhecida")
                return result
            result["warnings"].append("Planilha de impostos sem tabela ICMS/IPI reconhecida; gravando metadados")
            result["pack_patch"] = {
                "impostos": {"source": filename, "sheet": grid.sheet_name, "rows": len(grid.rows), "kind": "raw"}
            }
        return result

    if tipo == "irpj":
        result["warnings"].append("IRPJ/CSLL: payload estrutural até calibração das linhas do demonstrativo")
        result["pack_patch"] = {"irpj": {"source": filename, "sheet": grid.sheet_name, "rows": len(grid.rows)}}
        return result

    result["errors"].append(f"Tipo de planilha não reconhecido ({tipo})")
    return result
