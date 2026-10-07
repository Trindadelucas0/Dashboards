"""Golden dos indicadores Schumacher (jan/2026)."""

from pathlib import Path

import pytest

from app.extract.parse_workbook_padrao import expand_workbook_parts
from app.extract.pipeline import classify_and_extract
from app.indicadores_schumacher import _LEITURAS, compute_indicadores_schumacher

DRE = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "schumacher-padrao"
    / "DRE_SCHUMACHER_2026.xlsx"
)
BP = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "schumacher-padrao"
    / "BALANCO_PATRIMONIAL_SCHUMACHER_2026.xlsx"
)


def _pack_jan_dre_bp():
    dre_items = expand_workbook_parts({**classify_and_extract(DRE), "file_hash": "h-dre"})
    bp_items = expand_workbook_parts({**classify_and_extract(BP), "file_hash": "h-bp"})
    jan_dre = next(i for i in dre_items if i["competencia"] == "2026-01")
    jan_bp = next(i for i in bp_items if i["competencia"] == "2026-01")
    pack = {**jan_dre["pack_patch"], **jan_bp["pack_patch"]}
    return pack


@pytest.mark.skipif(not (DRE.exists() and BP.exists()), reason="Fixtures DRE/BP ausentes")
def test_indicadores_golden_jan_2026():
    ind = compute_indicadores_schumacher(_pack_jan_dre_bp())
    res = ind["resultado"]
    liq = ind["liquidez"]
    assert res["faturamento"]["valor"] == pytest.approx(65256171.15, abs=0.02)
    assert liq["corrente"]["valor"] == pytest.approx(1.5789, abs=0.02)
    assert res["ebitda"]["valor"] == pytest.approx(4940019.71, abs=0.02)
    for key, texto in _LEITURAS.items():
        if key in res:
            assert res[key]["leitura"] == texto
            assert res[key]["detalhe"]["leitura"] == texto
        if key in liq:
            assert liq[key]["leitura"] == texto
            assert liq[key]["detalhe"]["leitura"] == texto


@pytest.mark.skipif(not DRE.exists(), reason="Fixture DRE ausente")
def test_indicadores_somente_dre_sem_liquidez():
    dre_items = expand_workbook_parts({**classify_and_extract(DRE), "file_hash": "h-dre"})
    jan = next(i for i in dre_items if i["competencia"] == "2026-01")
    ind = compute_indicadores_schumacher(jan["pack_patch"])
    assert ind["resultado"]["faturamento"]["valor"] == pytest.approx(65256171.15, abs=0.02)
    for key in ("corrente", "seca", "imediata", "geral"):
        assert ind["liquidez"][key]["valor"] is None


@pytest.mark.skipif(not BP.exists(), reason="Fixture BP ausente")
def test_indicadores_somente_bp_sem_resultado():
    bp_items = expand_workbook_parts({**classify_and_extract(BP), "file_hash": "h-bp"})
    jan = next(i for i in bp_items if i["competencia"] == "2026-01")
    ind = compute_indicadores_schumacher(jan["pack_patch"])
    assert ind["liquidez"]["corrente"]["valor"] == pytest.approx(1.5789, abs=0.02)
    assert ind["resultado"]["faturamento"]["valor"] is None
    assert ind["resultado"]["ebitda"]["valor"] is None
