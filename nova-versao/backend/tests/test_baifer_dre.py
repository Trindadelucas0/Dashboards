from pathlib import Path

import pytest

from app.extract.pipeline import classify_and_extract
from app.routers.companies import _slice

DOWNLOADS = Path(r"c:\Users\trind\Downloads\drive-download-20260826T161842Z-1-001")
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "baifer-padrao"
FIXTURE_DRE = FIXTURES / "D. R. E. 01-2026.xls"

EXPECTED = {
    "2026-01": {
        "receitaBruta": 480047.45,
        "cmv": -369258.29,
        "lucBruto": -3731.04,
        "lucLiq": 6338.51,
        "margMb": -0.78,
        "margMl": 1.32,
        "receitaLiquida": 365527.25,
    },
    "2026-02": {
        "receitaBruta": 468725.57,
        "cmv": -360710.78,
        "lucBruto": 5470.64,
        "lucLiq": 4174.50,
        "margMb": 1.17,
        "margMl": 0.89,
        "receitaLiquida": 366181.42,
    },
    "2026-03": {
        "receitaBruta": 590886.49,
        "cmv": -454460.74,
        "lucBruto": 27736.86,
        "lucLiq": 28561.59,
        "margMb": 4.69,
        "margMl": 4.83,
        "receitaLiquida": 482197.60,
        "icms": -55821.04,
    },
    "2026-04": {
        "receitaBruta": 546988.18,
        "cmv": -477362.56,
        "lucBruto": -63230.51,
        "lucLiq": -53265.00,
        "margMb": -11.56,
        "margMl": -9.74,
        "receitaLiquida": 414132.05,
    },
    "2026-05": {
        "receitaBruta": 416209.96,
        "cmv": -347476.03,
        "lucBruto": -9887.09,
        "lucLiq": -2001.78,
        "margMb": -2.38,
        "margMl": -0.48,
        "receitaLiquida": 337588.94,
    },
    "2026-06": {
        "receitaBruta": 658376.71,
        "cmv": -536189.82,
        "lucBruto": -8502.79,
        "lucLiq": 10802.40,
        "margMb": -1.29,
        "margMl": 1.64,
        "receitaLiquida": 527687.03,
    },
    "2026-07": {
        "receitaBruta": 691952.40,
        "cmv": -551974.79,
        "lucBruto": -5813.57,
        "lucLiq": 5981.32,
        "margMb": -0.84,
        "margMl": 0.86,
        "receitaLiquida": 546161.22,
    },
}


def _assert_dre(result: dict, competencia: str, expected: dict) -> None:
    assert result["tipo"] == "dre"
    assert not result["errors"], result["errors"]
    assert result["company_id"] == "baifer"
    assert result["cnpj"] == "52005382000140"
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
    assert dre["receitaLiquida"] == pytest.approx(expected["receitaLiquida"], abs=0.02)
    if "icms" in expected:
        icms_line = next(
            (
                ln
                for ln in dre.get("linhas") or []
                if str(ln.get("descricao") or "").strip() in ("(-) ICMS", "ICMS")
            ),
            None,
        )
        assert icms_line is not None
        assert icms_line["valor"] == pytest.approx(expected["icms"], abs=0.02)


@pytest.mark.skipif(not FIXTURE_DRE.exists(), reason="Fixture baifer-padrao DRE ausente")
def test_baifer_dre_fixture_jan():
    result = classify_and_extract(FIXTURE_DRE)
    _assert_dre(result, "2026-01", EXPECTED["2026-01"])


@pytest.mark.skipif(not FIXTURE_DRE.exists(), reason="Fixture baifer-padrao DRE ausente")
def test_baifer_dre_fixture_fills_dre_tab():
    result = classify_and_extract(FIXTURE_DRE)
    pack = result["pack_patch"] or {}
    dre_tab = _slice("dre", pack)
    assert dre_tab["hasDre"] is True
    assert dre_tab["receitaBruta"] == pytest.approx(480047.45, abs=0.02)
    assert dre_tab["cmv"] == pytest.approx(-369258.29, abs=0.02)
    assert dre_tab["lucBruto"] == pytest.approx(-3731.04, abs=0.02)
    assert dre_tab["lucLiq"] == pytest.approx(6338.51, abs=0.02)
    assert len((dre_tab.get("dre") or {}).get("linhas") or []) >= 30


@pytest.mark.skipif(not DOWNLOADS.exists(), reason="Pasta Downloads DRE ausente")
@pytest.mark.parametrize("competencia,expected", list(EXPECTED.items()))
def test_baifer_dre_downloads_golden(competencia: str, expected: dict):
    month = competencia.split("-")[1]
    year = competencia.split("-")[0]
    path = DOWNLOADS / f"{month}-{year}" / "D. R. E..xls"
    assert path.exists(), f"DRE {competencia} não encontrado em {path}"
    result = classify_and_extract(path)
    _assert_dre(result, competencia, expected)
    # filename sem MM-YYYY: competência vem do título EM DD/MM/YYYY
    assert result["file"] == "D. R. E..xls"
