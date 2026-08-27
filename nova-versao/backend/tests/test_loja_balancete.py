from pathlib import Path

import pytest

from app.extract.pipeline import classify_and_extract
from app.routers.companies import _slice
from app.routers.imports import _pack_has_tipo

DOWNLOADS = Path(r"c:\Users\trind\Downloads\LOJA")
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "loja-maquinas-padrao"
FIXTURE_BAL = FIXTURES / "Balancete 01-2026.xls"

EXPECTED = {
    "2026-01": {"contas": 122, "ativo": 2988866.68, "passivo": -3016805.44},
    "2026-02": {"contas": 126, "ativo": 3042630.0, "passivo": -3060495.45},
    "2026-03": {"contas": 138, "ativo": 3185359.98, "passivo": -3177083.95},
    "2026-04": {"contas": 151, "ativo": 3220085.92, "passivo": -3188143.79},
    "2026-05": {"contas": 149, "ativo": 3193749.43, "passivo": -3142968.49},
    "2026-06": {"contas": 150, "ativo": 3177485.86, "passivo": -3153399.01},
    "2026-07": {"contas": 153, "ativo": 3222552.25, "passivo": -3202735.75},
}


def _assert_balancete(result: dict, competencia: str, expected: dict) -> None:
    assert result["tipo"] == "balancete"
    assert not result["errors"], result["errors"]
    assert result["company_id"] == "loja-maquinas"
    assert result["cnpj"] == "13983066000190"
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


@pytest.mark.skipif(not FIXTURE_BAL.exists(), reason="Fixture loja-maquinas-padrao Balancete ausente")
def test_loja_balancete_fixture_jan():
    result = classify_and_extract(FIXTURE_BAL)
    _assert_balancete(result, "2026-01", EXPECTED["2026-01"])


@pytest.mark.skipif(not FIXTURE_BAL.exists(), reason="Fixture loja-maquinas-padrao Balancete ausente")
def test_loja_balancete_fixture_fills_tab():
    result = classify_and_extract(FIXTURE_BAL)
    pack = result["pack_patch"] or {}
    tab = _slice("balancete", pack)
    contas = (tab.get("balancete") or {}).get("contas") or []
    assert len(contas) == 122
    assert contas[0]["descricao"] == "ATIVO"
    assert _pack_has_tipo(pack, "balancete") is True
    assert _pack_has_tipo(pack, "dre") is False


@pytest.mark.skipif(not DOWNLOADS.exists(), reason="Pasta Downloads LOJA ausente")
@pytest.mark.parametrize("competencia,expected", list(EXPECTED.items()))
def test_loja_balancete_downloads_golden(competencia: str, expected: dict):
    month = competencia.split("-")[1]
    year = competencia.split("-")[0]
    path = DOWNLOADS / f"{month}-{year}" / "Balancete.xls"
    assert path.exists(), f"Balancete {competencia} não encontrado em {path}"
    result = classify_and_extract(path)
    _assert_balancete(result, competencia, expected)
