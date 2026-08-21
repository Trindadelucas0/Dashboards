from pathlib import Path

import pytest

from app.extract.classify import RANGE_ERROR, is_multi_month_movimento
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import WorkbookGrid
from app.routers.companies import _is_empty, _slice
from app.routers.imports import _deep_merge

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "egaplast-padrao"
ENT = FIXTURES / "Entradas.xls"
SAI = FIXTURES / "Saídas.xls"


@pytest.mark.skipif(not ENT.exists() or not SAI.exists(), reason="Fixture egaplast-padrao ausente")
def test_movimento_import_fills_tabs_and_totals():
    pack: dict = {}
    for path in (ENT, SAI):
        result = classify_and_extract(path)
        assert not result["errors"], result["errors"]
        assert result["company_id"] == "egaplast"
        assert result["pack_patch"]
        pack = _deep_merge(pack, result["pack_patch"])

    assert abs(pack["entradasMeta"]["delta"]) < 0.02
    assert abs(pack["saidasMeta"]["delta"]) < 0.02
    assert pack["totalCompras"] == pack["entradasMeta"]["soma"]
    assert pack["cfopSaidasTotal"] == pack["saidasMeta"]["soma"]

    class Row:
        pass

    row = Row()
    compras = _slice("compras", pack)
    vendas = _slice("vendas", pack)
    finalidade = _slice("finalidade", pack)
    memoria = _slice("memoria", pack)
    visao = _slice("visao-geral", pack)

    assert _is_empty("compras", pack, row) is False
    assert compras["totalCompras"] == pack["totalCompras"]
    assert len(compras["fornecedores"]) > 0
    assert len(compras["ufEntradas"]) > 0
    assert vendas["cfopSaidasTotal"] == pack["cfopSaidasTotal"]
    assert len(vendas["clientes"]) > 0
    assert "demaisClientes" in vendas
    assert len(finalidade["cfopDados"]) > 0
    assert len(finalidade["macro"]) == 4
    assert finalidade["cfopDados"][0].get("fornecedores") is not None or "fornecedores" in pack["cfopDados"][0]
    assert memoria["entradasMeta"]["soma"] == pack["totalCompras"]
    assert visao["receitaBruta"] == pack["cfopSaidasTotal"]


@pytest.mark.skipif(not FIXTURES.exists(), reason="Fixture egaplast-padrao ausente")
def test_egaplast_impostos_demo_fill_apuracao():
    pack: dict = {}
    for path in sorted(FIXTURES.glob("*.xls")) + sorted(FIXTURES.glob("*.xlsx")):
        result = classify_and_extract(path)
        if result.get("tipo") not in ("ipi", "pis", "cofins", "icms_st"):
            continue
        assert not result["errors"], f"{path.name}: {result['errors']}"
        pack = _deep_merge(pack, result["pack_patch"] or {})
    assert pack.get("apuracao")
    data = _slice("impostos", {**pack, "hasMovimentacao": True, "cfopSaidasTotal": 1})
    assert data["apuracao"] is not None
    assert data["deducoes"] and data["deducoes"] > 0


def test_range_filename_rejected_for_egaplast():
    grid = WorkbookGrid(
        "Saídas.xls jan a junho.xls",
        "Saídas",
        [
            ["EGAPLAST"],
            ["CNPJ:", "03.185.564/0001-34"],
            ["01/01/2026 até 30/06/2026"],
            ["Total Cliente"],
        ],
        "html",
    )
    assert is_multi_month_movimento(grid, "Saídas.xls jan a junho.xls") is True
    assert RANGE_ERROR
