"""Planilha padrão Dashboards — workbook multi-aba."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.extract.parse_workbook_padrao import expand_workbook_parts, is_workbook_padrao
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import load_all_sheets
from app.routers.companies import _is_empty, _slice
from app.routers.imports import _deep_merge

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "baifer-padrao"
MODELO = FIXTURES / "planilha-padrao-modelo.xlsx"
BAIFER = FIXTURES / "planilha-padrao-012026.xlsx"

BAIFER_CNPJ = "52005382000140"


@pytest.mark.skipif(not MODELO.exists(), reason="Fixture planilha-padrao-modelo ausente")
def test_detect_workbook_padrao_modelo():
    sheets = load_all_sheets(MODELO)
    assert is_workbook_padrao(sheets)


@pytest.mark.skipif(not MODELO.exists(), reason="Fixture planilha-padrao-modelo ausente")
def test_modelo_extrai_sem_errors():
    result = classify_and_extract(MODELO, company_cnpj=BAIFER_CNPJ)
    assert result["tipo"] == "workbook_padrao"
    assert not result["errors"]
    parts = result.get("parts") or []
    assert parts
    ok = [p for p in parts if p.get("pack_patch")]
    tipos = {p["tipo"] for p in ok}
    assert "dre" in tipos
    assert "balancete" in tipos
    assert "apuracao_5005" in tipos
    irpj_parts = [p for p in parts if p.get("tipo") == "irpj"]
    assert irpj_parts and irpj_parts[0].get("status") == "ignorada"


@pytest.mark.skipif(not MODELO.exists(), reason="Fixture planilha-padrao-modelo ausente")
def test_modelo_dre_golden_janeiro():
    result = classify_and_extract(MODELO, company_cnpj=BAIFER_CNPJ)
    dre_part = next(p for p in result["parts"] if p["tipo"] == "dre" and p.get("pack_patch"))
    assert dre_part["competencia"] == "2026-01"
    pack = dre_part["pack_patch"]
    assert pack["receitaBruta"] == pytest.approx(691952.40, abs=0.02)
    assert pack["cmv"] == pytest.approx(-551974.79, abs=0.02)
    dre = pack["dre"]
    assert dre["receitaLiquida"] == pytest.approx(546161.22, abs=0.02)
    assert pack["lucBruto"] == pytest.approx(-5813.57, abs=0.02)


@pytest.mark.skipif(not MODELO.exists(), reason="Fixture planilha-padrao-modelo ausente")
def test_modelo_balancete_golden():
    result = classify_and_extract(MODELO, company_cnpj=BAIFER_CNPJ)
    bal_part = next(p for p in result["parts"] if p["tipo"] == "balancete" and p.get("pack_patch"))
    totais = (bal_part["pack_patch"].get("balancete") or {}).get("totais") or {}
    assert totais["ativo"] == pytest.approx(3315866.01, abs=0.02)
    assert totais["passivo"] == pytest.approx(-3203632.39, abs=0.02)


@pytest.mark.skipif(not MODELO.exists(), reason="Fixture planilha-padrao-modelo ausente")
def test_modelo_5005_golden():
    result = classify_and_extract(MODELO, company_cnpj=BAIFER_CNPJ)
    p5005 = next(p for p in result["parts"] if p["tipo"] == "apuracao_5005")
    mem = p5005["pack_patch"]["memoriaCalculo"]
    assert mem["icmsARecolher"] == pytest.approx(-1901.28, abs=0.02)
    assert mem["ganhoReceitaSubvencao"] == pytest.approx(45070.99, abs=0.02)
    assert mem.get("formulaIcms")
    linhas = mem.get("linhas") or []
    assert len(linhas) >= 11
    assert linhas[0]["key"] == "debitoOriginal"
    assert linhas[-1]["key"] == "ganhoReceitaSubvencao"


@pytest.mark.skipif(not MODELO.exists(), reason="Fixture planilha-padrao-modelo ausente")
def test_modelo_merge_visao_geral_nao_vazia():
    result = classify_and_extract(MODELO, company_cnpj=BAIFER_CNPJ)
    pack: dict = {}
    for part in result["parts"]:
        if part.get("pack_patch"):
            pack = _deep_merge(pack, part["pack_patch"])
    assert not _is_empty("visao-geral", pack, object())
    vg = _slice("visao-geral", pack)
    assert vg["receitaBruta"] == pytest.approx(691952.40, abs=0.02)
    assert vg["icmsKpi"]["lbl"] == "Crédito ICMS"
    assert vg["icmsKpi"]["val"] == pytest.approx(1901.28, abs=0.02)


@pytest.mark.skipif(not BAIFER.exists(), reason="Fixture planilha-padrao-012026 ausente")
def test_baifer_pis_st_golden():
    result = classify_and_extract(BAIFER, company_cnpj=BAIFER_CNPJ)
    assert not result["errors"]
    pis_part = next((p for p in result["parts"] if p["tipo"] == "pis_cofins" and p.get("pack_patch")), None)
    assert pis_part is not None
    ap = pis_part["pack_patch"]["apuracao"]
    # aRecolher é o resultado do mês (débito − crédito). A coluna A RECOLHER da planilha
    # abate o saldo credor acumulado de meses anteriores e fica só como referência.
    assert ap["pis"]["aRecolher"] == pytest.approx(-2030.42, abs=0.02)
    assert ap["cofins"]["aRecolher"] == pytest.approx(-9352.23, abs=0.02)
    livro = pis_part["pack_patch"]["memoriaPisCofins"]
    assert livro["resumo"]["pis"]["aRecolherPlanilha"] == pytest.approx(-18080.71, abs=0.5)
    assert livro["resumo"]["cofins"]["aRecolherPlanilha"] == pytest.approx(-83280.93, abs=0.5)
    assert livro["resumo"]["pis"]["fonte"] == "debito-credito"
    deb_pis = next(x for x in livro["debito"]["linhas"] if x["tributo"] == "PIS")
    assert deb_pis["valorImposto"] == pytest.approx(6568.32, abs=0.02)
    assert livro["resumo"]["cofins"]["saldoCredor"] == pytest.approx(73928.70, abs=0.02)
    st_part = next((p for p in result["parts"] if p["tipo"] == "icms_st" and p.get("pack_patch")), None)
    assert st_part is not None
    assert st_part["pack_patch"]["apuracao"]["icmsSt"]["aRecolher"] == pytest.approx(474.62, abs=0.02)
    pack: dict = {}
    for part in result["parts"]:
        if part.get("pack_patch"):
            pack = _deep_merge(pack, part["pack_patch"])
    mem = _slice("memoria", pack)
    assert mem["memoriaCalculo"]["icmsARecolher"] == pytest.approx(-1901.28, abs=0.02)
    assert mem["memoriaPisCofins"]["resumo"]["pis"]["aRecolher"] == pytest.approx(-2030.42, abs=0.02)
    assert mem["porUfSt"]["DF"] == pytest.approx(474.62, abs=0.02)
    assert not mem.get("memoriaIrpj")


def test_expand_workbook_parts():
    extracted = {
        "tipo": "workbook_padrao",
        "file": "test.xlsx",
        "file_hash": "deadbeef" * 8,
        "parts": [
            {"tipo": "dre", "sheet": "DRE", "competencia": "2026-01", "pack_patch": {"hasDre": True}, "status": "ok"},
            {"tipo": "ipi", "sheet": "IPI", "competencia": "2026-01", "pack_patch": None, "status": "vazia", "warnings": []},
        ],
    }
    items = expand_workbook_parts(extracted)
    assert len(items) == 2
    assert items[1].get("skipped") is True
    assert items[0]["file_hash"] != items[1]["file_hash"]
