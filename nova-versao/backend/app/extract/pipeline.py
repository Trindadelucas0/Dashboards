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
from app.extract.parse_dre import parse_dre
from app.extract.parse_impostos import (
    apuracao_from_imposto_row,
    apuracao_patch_from_demo,
    composicao_from_apuracao,
    deducoes_from_apuracao,
    parse_demonstrativo_ipi,
    parse_demonstrativo_pis_cofins,
    parse_impostos_icms_ipi,
    parse_st_mensal,
)
from app.extract.parse_movimento import parse_movimento
from app.extract.workbook import WorkbookGrid, is_placeholder_bytes, load_workbook


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


def classify_and_extract(path: str | Path, data: bytes | None = None, db=None) -> dict:
    path = Path(path)
    filename = path.name
    if data is None:
        data = path.read_bytes()
    if is_placeholder_bytes(data):
        tipo = detect_sheet_tipo(WorkbookGrid(str(path), "", [], "empty"), filename)
        return _empty_result(filename, tipo, {"errors": [EMPTY_FILE_ERROR]})
    try:
        grid = load_workbook(path, data)
    except Exception as exc:  # noqa: BLE001
        tipo = detect_sheet_tipo(WorkbookGrid(str(path), "", [], "unknown"), filename)
        return _empty_result(
            filename,
            tipo,
            {"errors": [f"Não foi possível ler o arquivo: {exc}"], "parser": "fail"},
        )
    tipo = detect_sheet_tipo(grid, filename)
    cnpj = scan_cnpj(grid)
    razao = scan_razao(grid)
    competencia, period_text = scan_period(grid)
    if not competencia:
        competencia = competencia_from_filename(filename) or competencia_from_filename(grid.sheet_name or "")
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

    if not company:
        if tipo == "icms_st":
            result["warnings"].append("ST sem CNPJ — a empresa aberta no dashboard será usada ao gravar")
        else:
            result["errors"].append("CNPJ/razão não mapeados para nenhuma empresa cadastrada")
            return result
    # Impostos anuais / ST sem competência no nome — movimento/DRE ainda exigem.
    if not competencia and tipo not in ("impostos", "irpj", "ipi", "pis", "cofins", "icms_st"):
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
        parsed = parse_st_mensal(grid)
        result["pack_patch"] = apuracao_patch_from_demo("icms_st", parsed)
        result["meta"] = {"aRecolher": parsed.get("aRecolher"), "ufs": len(parsed.get("byUf") or {})}
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
