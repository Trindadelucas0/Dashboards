"""Única — Análise Vertical do D.R.E. (multi-mês → parts dre por competência)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.extract.classify import detect_sheet_tipo, is_dre_filename
from app.extract.parse_dre import is_analise_vertical_dre
from app.extract.parse_workbook_padrao import expand_workbook_parts
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import load_workbook
from app.routers.companies import _slice

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "unica-padrao"
FIXTURE = FIXTURES / "Analise Vertical do D. R. E.xls"
DOWNLOADS = Path(r"c:\Users\trind\Downloads\Análise Vertical do D. R. E.xls")

UNICA_CNPJ = "36517206000130"

# Totais conferidos na planilha (colunas 01/2026…06/2026). Jan sem lucro operacional.
EXPECTED = {
    "2026-01": {
        "receitaBruta": 1853772.30,
        "receitaLiquida": 1391144.10,
        "cmv": -1339730.37,
        "lucBruto": 51413.73,
        "lucLiq": None,
        "despesas": -21084.0,
        "margMb": 2.77,
    },
    "2026-02": {
        "receitaBruta": 1748060.74,
        "receitaLiquida": 1323108.42,
        "cmv": -1226219.37,
        "lucBruto": 96889.05,
        "lucLiq": -39122.77,
        "despesas": -26524.08,
        "margMb": 5.54,
        "margMl": -2.24,
    },
    "2026-03": {
        "receitaBruta": 2070208.14,
        "receitaLiquida": 1578110.89,
        "cmv": -1438197.35,
        "lucBruto": 139913.54,
        "lucLiq": 20137.44,
        "despesas": -23362.40,
        "margMb": 6.76,
        "margMl": 0.97,
    },
    "2026-04": {
        "receitaBruta": 1968049.95,
        "receitaLiquida": 1451779.06,
        "cmv": -1406098.81,
        "lucBruto": 45680.25,
        "lucLiq": -150.87,
        "despesas": -18088.86,
        "margMb": 2.32,
        "margMl": -0.01,
    },
    "2026-05": {
        "receitaBruta": 1983869.76,
        "receitaLiquida": 1467534.88,
        "cmv": -1467938.90,
        "lucBruto": -404.02,
        "lucLiq": -139638.01,
        "despesas": -26552.60,
        "margMb": -0.02,
        "margMl": -7.04,
    },
    "2026-06": {
        "receitaBruta": 2209566.53,
        "receitaLiquida": 1665044.95,
        "cmv": -1628944.73,
        "lucBruto": 36100.22,
        "lucLiq": -66034.82,
        "despesas": -31678.19,
        "margMb": 1.63,
        "margMl": -2.99,
    },
}


def _path() -> Path:
    if FIXTURE.exists():
        return FIXTURE
    return DOWNLOADS


@pytest.mark.skipif(not FIXTURE.exists() and not DOWNLOADS.exists(), reason="Fixture Análise Vertical ausente")
def test_detecta_analise_vertical_e_filename():
    assert is_dre_filename("Análise Vertical do D. R. E.xls") is True
    grid = load_workbook(_path())
    assert is_analise_vertical_dre(grid, _path().name) is True
    assert detect_sheet_tipo(grid, _path().name) == "dre"


@pytest.mark.skipif(not FIXTURE.exists() and not DOWNLOADS.exists(), reason="Fixture Análise Vertical ausente")
def test_unica_dre_vertical_parts_golden():
    result = classify_and_extract(_path(), company_cnpj=UNICA_CNPJ)
    assert result["tipo"] == "dre_vertical"
    assert not result["errors"], result["errors"]
    assert result["company_id"] == "unica"
    assert result["cnpj"] == UNICA_CNPJ
    assert result["meta"]["okParts"] == 6
    parts = {p["competencia"]: p for p in result["parts"]}
    assert set(parts) == set(EXPECTED)
    for comp, expected in EXPECTED.items():
        part = parts[comp]
        assert part["status"] == "ok"
        assert not part["errors"]
        pack = part["pack_patch"] or {}
        dre = pack.get("dre") or {}
        assert pack.get("hasDre") is True
        assert dre.get("kind") == "analise_vertical"
        assert dre.get("hasValores") is True
        assert len(dre.get("linhas") or []) >= 40
        assert pack["receitaBruta"] == pytest.approx(expected["receitaBruta"], abs=0.02)
        assert dre["receitaLiquida"] == pytest.approx(expected["receitaLiquida"], abs=0.02)
        assert pack["cmv"] == pytest.approx(expected["cmv"], abs=0.02)
        assert pack["lucBruto"] == pytest.approx(expected["lucBruto"], abs=0.02)
        assert pack["margMb"] == pytest.approx(expected["margMb"], abs=0.02)
        assert dre.get("despesas") == pytest.approx(expected["despesas"], abs=0.02)
        if expected["lucLiq"] is None:
            assert pack.get("lucLiq") is None
            assert pack.get("margMl") is None
        else:
            assert pack["lucLiq"] == pytest.approx(expected["lucLiq"], abs=0.02)
            assert pack["margMl"] == pytest.approx(expected["margMl"], abs=0.02)


@pytest.mark.skipif(not FIXTURE.exists() and not DOWNLOADS.exists(), reason="Fixture Análise Vertical ausente")
def test_unica_dre_vertical_expands_and_fills_slice():
    result = classify_and_extract(_path(), company_cnpj=UNICA_CNPJ)
    expanded = expand_workbook_parts({**result, "file_hash": "fixture-hash"})
    assert len(expanded) == 6
    hashes = {item["file_hash"] for item in expanded}
    assert len(hashes) == 6
    mar = next(p for p in result["parts"] if p["competencia"] == "2026-03")
    dre_tab = _slice("dre", mar["pack_patch"] or {})
    assert dre_tab["hasDre"] is True
    assert dre_tab["receitaBruta"] == pytest.approx(2070208.14, abs=0.02)
    assert dre_tab["lucLiq"] == pytest.approx(20137.44, abs=0.02)


@pytest.mark.skipif(not FIXTURE.exists() and not DOWNLOADS.exists(), reason="Fixture Análise Vertical ausente")
def test_unica_dre_vertical_sem_cnpj_herda_aviso():
    result = classify_and_extract(_path())
    assert result["tipo"] == "dre_vertical"
    assert not result["errors"]
    assert result["company_id"] is None
    assert any("dashboard" in w.lower() or "cnpj" in w.lower() for w in result["warnings"])
