from pathlib import Path

import pytest

from app.extract.pipeline import classify_and_extract
from app.routers.companies import _slice
from app.routers.imports import _pack_has_tipo

DOWNLOADS = Path(r"c:\Users\trind\Downloads\drive-download-20260826T161842Z-1-001")
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "baifer-padrao"
FIXTURE_BAL = FIXTURES / "Balancete 01-2026.xls"

EXPECTED = {
    "2026-01": {"contas": 89, "ativo": 2666499.86, "passivo": -2660161.35},
    "2026-02": {"contas": 91, "ativo": 2478064.89, "passivo": -2467551.88},
    "2026-03": {"contas": 94, "ativo": 2612214.97, "passivo": -2461498.29},
    "2026-04": {"contas": 98, "ativo": 2564281.19, "passivo": -2466829.51},
    "2026-05": {"contas": 97, "ativo": 2440627.97, "passivo": -2345178.07},
    "2026-06": {"contas": 100, "ativo": 2723253.07, "passivo": -2617000.77},
    "2026-07": {"contas": 101, "ativo": 3315866.01, "passivo": -3203632.39},
}


def _assert_balancete(result: dict, competencia: str, expected: dict) -> None:
    assert result["tipo"] == "balancete"
    assert not result["errors"], result["errors"]
    assert result["company_id"] == "baifer"
    assert result["cnpj"] == "52005382000140"
    assert result["competencia"] == competencia
    pack = result["pack_patch"] or {}
    assert pack.get("hasBalancete") is True
    bal = pack.get("balancete") or {}
    assert bal.get("kind") == "exito"
    assert bal.get("hasValores") is True
    contas = bal.get("contas") or []
    assert len(contas) == expected["contas"]
    totais = bal.get("totais") or {}
    assert totais["ativo"] == pytest.approx(expected["ativo"], abs=0.02)
    assert totais["passivo"] == pytest.approx(expected["passivo"], abs=0.02)
    assert contas[0]["codigo"] == "1"
    assert contas[0]["grupo"] == "ativo"


@pytest.mark.skipif(not FIXTURE_BAL.exists(), reason="Fixture baifer-padrao Balancete ausente")
def test_baifer_balancete_fixture_jan():
    result = classify_and_extract(FIXTURE_BAL)
    _assert_balancete(result, "2026-01", EXPECTED["2026-01"])


@pytest.mark.skipif(not FIXTURE_BAL.exists(), reason="Fixture baifer-padrao Balancete ausente")
def test_baifer_balancete_fixture_fills_tab():
    result = classify_and_extract(FIXTURE_BAL)
    pack = result["pack_patch"] or {}
    tab = _slice("balancete", pack)
    contas = (tab.get("balancete") or {}).get("contas") or []
    assert len(contas) == 89
    assert contas[0]["descricao"] == "ATIVO"
    assert _pack_has_tipo(pack, "balancete") is True
    assert _pack_has_tipo(pack, "dre") is False


@pytest.mark.skipif(not DOWNLOADS.exists(), reason="Pasta Downloads Balancete ausente")
@pytest.mark.parametrize("competencia,expected", list(EXPECTED.items()))
def test_baifer_balancete_downloads_golden(competencia: str, expected: dict):
    month = competencia.split("-")[1]
    year = competencia.split("-")[0]
    path = DOWNLOADS / f"{month}-{year}" / "Balancete.xls"
    assert path.exists(), f"Balancete {competencia} não encontrado em {path}"
    result = classify_and_extract(path)
    _assert_balancete(result, competencia, expected)
