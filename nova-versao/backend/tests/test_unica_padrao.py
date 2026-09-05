"""Planilha padrão Unica — 9 abas fiscais + ENTRADAS/SAÍDAS no mesmo workbook."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.extract.parse_workbook_padrao import is_workbook_padrao
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import load_all_sheets
from app.routers.imports import _deep_merge

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "unica-padrao"
JAN = FIXTURES / "planilha-padrao-012026.xlsx"
ABR = FIXTURES / "planilha-padrao-042026.xlsx"
DOWNLOADS = Path.home() / "Downloads"

UNICA_CNPJ = "36517206000130"


def _jul_parcial_path() -> Path | None:
    """Workbook ~370 KB com ENTRADAS/SAÍDAS sem DRE/BAL (julho B)."""
    if not DOWNLOADS.is_dir():
        return None
    cands = [
        p
        for p in DOWNLOADS.iterdir()
        if "UNICA" in p.name.upper() and "072026" in p.name and p.stat().st_size > 200_000
    ]
    return cands[0] if cands else None


def _jun_path() -> Path | None:
    if not DOWNLOADS.is_dir():
        return None
    cands = [
        p for p in DOWNLOADS.iterdir() if "UNICA" in p.name.upper() and "062026" in p.name
    ]
    return cands[0] if cands else None


def _extract(path: Path) -> dict:
    return classify_and_extract(path, company_cnpj=UNICA_CNPJ)


def _part(result: dict, tipo: str) -> dict | None:
    return next((p for p in result["parts"] if p["tipo"] == tipo), None)


@pytest.mark.skipif(not JAN.exists(), reason="Fixture unica 012026 ausente")
def test_detecta_workbook_padrao_com_movimento():
    sheets = load_all_sheets(JAN)
    assert is_workbook_padrao(sheets)
    nomes = {s.sheet_name.upper() for s in sheets}
    assert "ENTRADAS" in nomes


@pytest.mark.skipif(not JAN.exists(), reason="Fixture unica 012026 ausente")
def test_janeiro_empresa_e_competencia():
    result = _extract(JAN)
    assert result["tipo"] == "workbook_padrao"
    assert not result["errors"]
    entradas = _part(result, "entradas")
    assert entradas is not None
    assert entradas["competencia"] == "2026-01"
    assert result["competencia"] == "2026-01"


@pytest.mark.skipif(not JAN.exists(), reason="Fixture unica 012026 ausente")
def test_janeiro_movimento_golden():
    result = _extract(JAN)
    entradas = _part(result, "entradas")
    assert entradas["status"] == "ok"
    assert not entradas["errors"]
    assert abs(entradas["meta"]["delta"]) < 0.02
    assert entradas["meta"]["nfs"] == 204
    assert entradas["pack_patch"]["totalCompras"] == pytest.approx(1790105.13, abs=0.02)
    assert entradas["pack_patch"]["fornecedores"]
    assert entradas["pack_patch"]["cfopDados"]
    assert len(entradas["lines"]) == entradas["meta"]["lineCount"]

    saidas = _part(result, "saidas")
    assert saidas["status"] == "ok"
    assert not saidas["errors"]
    # "Total Geral" das saídas não totaliza o Valor Contábil → aceito com warning
    assert saidas["meta"]["totalGeralExcel"] is None
    assert saidas["warnings"]
    assert saidas["pack_patch"]["cfopSaidasTotal"] == pytest.approx(1863198.21, abs=0.02)
    assert saidas["pack_patch"]["receitaBruta"] == pytest.approx(1863198.21, abs=0.02)
    assert saidas["meta"]["nfs"] == 923
    assert saidas["pack_patch"]["clientes"]


@pytest.mark.skipif(not JAN.exists(), reason="Fixture unica 012026 ausente")
def test_janeiro_impostos_golden():
    result = _extract(JAN)
    p5005 = _part(result, "apuracao_5005")
    mem = p5005["pack_patch"]["memoriaCalculo"]
    assert mem["icmsARecolher"] == pytest.approx(18164.87, abs=0.02)
    assert mem["ganhoReceitaSubvencao"] == pytest.approx(139563.57, abs=0.02)

    st = _part(result, "icms_st")
    assert st["pack_patch"]["apuracao"]["icmsSt"]["aRecolher"] == pytest.approx(66958.60, abs=0.02)

    pis = _part(result, "pis_cofins")
    ap = pis["pack_patch"]["apuracao"]
    # aRecolher = débito − crédito do mês (a coluna A RECOLHER traz o saldo acumulado)
    assert ap["pis"]["aRecolher"] == pytest.approx(-153.95, abs=0.02)
    assert ap["cofins"]["aRecolher"] == pytest.approx(-709.09, abs=0.02)
    resumo = pis["pack_patch"]["memoriaPisCofins"]["resumo"]
    assert resumo["pis"]["aRecolherPlanilha"] == pytest.approx(-83936.33, abs=0.02)
    assert resumo["pis"]["fonte"] == "debito-credito"


@pytest.mark.skipif(not JAN.exists(), reason="Fixture unica 012026 ausente")
def test_janeiro_irpj_csll_ignorados_por_cnpj():
    result = _extract(JAN)
    for tipo in ("irpj", "csll"):
        part = _part(result, tipo)
        assert part is not None
        assert part["status"] == "ignorada"
        assert part["pack_patch"] is None


@pytest.mark.skipif(not JAN.exists(), reason="Fixture unica 012026 ausente")
def test_janeiro_dre_e_balancete_da_coluna_do_mes():
    result = _extract(JAN)
    dre = _part(result, "dre")
    assert dre["competencia"] == "2026-01"
    assert dre["status"] == "ok"
    bal = _part(result, "balancete")
    assert bal["competencia"] == "2026-01"
    assert bal["status"] == "ok"


@pytest.mark.skipif(not ABR.exists(), reason="Fixture unica 042026 ausente")
def test_abril_abas_singulares_e_dre_vazia():
    result = _extract(ABR)
    assert result["tipo"] == "workbook_padrao"
    assert result["competencia"] == "2026-04"

    # DRE/BALANCETE: só janeiro está preenchido no modelo → abril não grava nada
    dre = _part(result, "dre")
    assert dre["status"] == "vazia"
    assert dre["pack_patch"] is None
    assert dre["competencia"] == "2026-04"
    bal = _part(result, "balancete")
    assert bal["status"] == "vazia"
    assert bal["pack_patch"] is None

    entradas = _part(result, "entradas")
    assert entradas["sheet"] == "ENTRADA"
    assert entradas["status"] == "ok"
    assert abs(entradas["meta"]["delta"]) < 0.02
    assert entradas["pack_patch"]["totalCompras"] == pytest.approx(1898660.87, abs=0.02)


@pytest.mark.skipif(not ABR.exists(), reason="Fixture unica 042026 ausente")
def test_abril_saida_sem_valor_contabil_nao_grava():
    result = _extract(ABR)
    saidas = _part(result, "saidas")
    assert saidas["sheet"] == "SAIDA"
    assert saidas["status"] == "vazia"
    assert saidas["pack_patch"] is None
    assert saidas["meta"]["valorSource"] != "contabil"
    assert any("Valor Contábil" in w for w in saidas["warnings"])


@pytest.mark.skipif(not ABR.exists(), reason="Fixture unica 042026 ausente")
def test_abril_impostos_golden():
    result = _extract(ABR)
    mem = _part(result, "apuracao_5005")["pack_patch"]["memoriaCalculo"]
    assert mem["icmsARecolher"] == pytest.approx(65810.31, abs=0.02)
    assert mem["ganhoReceitaSubvencao"] == pytest.approx(36488.51, abs=0.02)
    st = _part(result, "icms_st")
    assert st["pack_patch"]["apuracao"]["icmsSt"]["aRecolher"] == pytest.approx(71751.12, abs=0.02)


@pytest.mark.skipif(not JAN.exists(), reason="Fixture unica 012026 ausente")
def test_janeiro_pack_merge_compras_e_vendas():
    from app.routers.companies import _is_empty, _slice

    result = _extract(JAN)
    pack: dict = {}
    for part in result["parts"]:
        if part.get("pack_patch"):
            pack = _deep_merge(pack, part["pack_patch"])
    assert not _is_empty("compras", pack, object())
    assert not _is_empty("vendas", pack, object())
    compras = _slice("compras", pack)
    assert compras["totalCompras"] == pytest.approx(1790105.13, abs=0.02)
    vendas = _slice("vendas", pack)
    assert vendas["cfopSaidasTotal"] == pytest.approx(1863198.21, abs=0.02)


@pytest.mark.skipif(_jul_parcial_path() is None, reason="Downloads Unica 072026 parcial ausente")
def test_julho_parcial_sem_dre_bal_movimento_golden():
    path = _jul_parcial_path()
    assert path is not None
    sheets = load_all_sheets(path)
    assert is_workbook_padrao(sheets)
    nomes = {s.sheet_name.upper() for s in sheets}
    assert "ENTRADAS" in nomes or "ENTRADA" in nomes
    assert "DRE" not in nomes
    assert "BALANCETE" not in nomes

    result = _extract(path)
    assert result["tipo"] == "workbook_padrao"
    assert result["competencia"] == "2026-07"
    assert any("parcial" in w.lower() or "faltam" in w.lower() for w in (result.get("warnings") or []))

    entradas = _part(result, "entradas")
    assert entradas["status"] == "ok"
    assert abs(entradas["meta"]["delta"] or 0) < 0.02
    assert entradas["meta"]["nfs"] == 238
    assert entradas["pack_patch"]["totalCompras"] == pytest.approx(2119642.66, abs=0.02)

    saidas = _part(result, "saidas")
    assert saidas["status"] == "ok"
    assert saidas["pack_patch"]["cfopSaidasTotal"] == pytest.approx(2440744.56, abs=0.02)

    pis = _part(result, "pis_cofins")
    ap = pis["pack_patch"]["apuracao"]
    assert ap["pis"]["aRecolher"] == pytest.approx(3699.88, abs=0.02)
    assert ap["cofins"]["aRecolher"] == pytest.approx(17041.86, abs=0.02)


@pytest.mark.skipif(_jun_path() is None, reason="Downloads Unica 062026 ausente")
def test_junho_st_golden_81007():
    path = _jun_path()
    assert path is not None
    result = _extract(path)
    st = _part(result, "icms_st")
    assert st is not None
    assert st["pack_patch"]["apuracao"]["icmsSt"]["aRecolher"] == pytest.approx(81007.0, abs=0.02)
