from pathlib import Path

import pytest

from app.extract.pipeline import classify_and_extract
from app.routers.companies import _slice
from app.routers.imports import _pack_has_tipo

DOWNLOADS = Path(r"c:\Users\trind\Downloads\LOJA")
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "loja-maquinas-padrao"
FIXTURE_DRE = FIXTURES / "D. R. E. 01-2026.xls"

EXPECTED = {
    "2026-01": {
        "receitaBruta": 437687.83,
        "cmv": -251542.05,
        "lucBruto": 50568.52,
        "lucLiq": -27938.76,
        "margMb": 11.55,
        "margMl": -6.38,
    },
    "2026-02": {
        "receitaBruta": 512844.19,
        "cmv": -297822.3,
        "lucBruto": 75985.05,
        "lucLiq": 10073.31,
        "margMb": 14.82,
        "margMl": 1.96,
    },
    "2026-03": {
        "receitaBruta": 615309.75,
        "cmv": -378605.47,
        "lucBruto": 85769.18,
        "lucLiq": 26141.48,
        "margMb": 13.94,
        "margMl": 4.25,
    },
    "2026-04": {
        "receitaBruta": 521411.19,
        "cmv": -291651.28,
        "lucBruto": 79575.53,
        "lucLiq": 23666.1,
        "margMb": 15.26,
        "margMl": 4.54,
    },
    "2026-05": {
        "receitaBruta": 508156.12,
        "cmv": -291500.38,
        "lucBruto": 74578.44,
        "lucLiq": 18838.81,
        "margMb": 14.68,
        "margMl": 3.71,
    },
    "2026-06": {
        "receitaBruta": 577854.83,
        "cmv": -349760.22,
        "lucBruto": 74820.72,
        "lucLiq": -26694.09,
        "margMb": 12.95,
        "margMl": -4.62,
    },
    "2026-07": {
        "receitaBruta": 662364.58,
        "cmv": -394766.97,
        "lucBruto": 91634.6,
        "lucLiq": -4270.35,
        "margMb": 13.83,
        "margMl": -0.64,
    },
}


def _assert_dre(result: dict, competencia: str, expected: dict) -> None:
    assert result["tipo"] == "dre"
    assert not result["errors"], result["errors"]
    assert result["company_id"] == "loja-maquinas"
    assert result["cnpj"] == "13983066000190"
    assert result["competencia"] == competencia
    assert result["meta"].get("hasValores") is True
    pack = result["pack_patch"] or {}
    assert pack.get("hasDre") is True
    dre = pack.get("dre") or {}
    assert dre.get("kind") == "exito"
    assert dre.get("hasValores") is True
    assert len(dre.get("linhas") or []) >= 30
    assert pack["receitaBruta"] == pytest.approx(expected["receitaBruta"], abs=0.02)
    assert pack["cmv"] == pytest.approx(expected["cmv"], abs=0.02)
    assert pack["lucBruto"] == pytest.approx(expected["lucBruto"], abs=0.02)
    assert pack["lucLiq"] == pytest.approx(expected["lucLiq"], abs=0.02)
    assert pack["margMb"] == pytest.approx(expected["margMb"], abs=0.02)
    assert pack["margMl"] == pytest.approx(expected["margMl"], abs=0.02)


@pytest.mark.skipif(not FIXTURE_DRE.exists(), reason="Fixture loja-maquinas-padrao DRE ausente")
def test_loja_dre_fixture_jan():
    result = classify_and_extract(FIXTURE_DRE)
    _assert_dre(result, "2026-01", EXPECTED["2026-01"])


@pytest.mark.skipif(not FIXTURE_DRE.exists(), reason="Fixture loja-maquinas-padrao DRE ausente")
def test_loja_dre_fixture_fills_tab():
    result = classify_and_extract(FIXTURE_DRE)
    pack = result["pack_patch"] or {}
    dre_tab = _slice("dre", pack)
    assert dre_tab["hasDre"] is True
    assert dre_tab["receitaBruta"] == pytest.approx(437687.83, abs=0.02)
    assert dre_tab["lucLiq"] == pytest.approx(-27938.76, abs=0.02)
    assert len((dre_tab.get("dre") or {}).get("linhas") or []) >= 30
    assert _pack_has_tipo(pack, "dre") is True
    assert _pack_has_tipo(pack, "balancete") is False


@pytest.mark.skipif(not DOWNLOADS.exists(), reason="Pasta Downloads LOJA ausente")
@pytest.mark.parametrize("competencia,expected", list(EXPECTED.items()))
def test_loja_dre_downloads_golden(competencia: str, expected: dict):
    month = competencia.split("-")[1]
    year = competencia.split("-")[0]
    path = DOWNLOADS / f"{month}-{year}" / "D. R. E..xls"
    assert path.exists(), f"DRE {competencia} não encontrado em {path}"
    result = classify_and_extract(path)
    _assert_dre(result, competencia, expected)
