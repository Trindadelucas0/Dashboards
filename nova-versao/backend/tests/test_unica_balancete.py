"""Única — Balancete EXITO mensal → pack.balancete / aba Balancete."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.extract.pipeline import classify_and_extract
from app.routers.companies import _slice, build_balancete_por_mes
from app.routers.imports import _pack_has_tipo

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "unica-padrao"
UNICA_CNPJ = "36517206000130"

# Totais conferidos nas linhas Classificação 1 / 2 / 3 (Saldo Atual) da planilha.
FIXTURE_FILES = {
    "2026-02": "Balancete 02-2026 - UNICA.xls",
    "2026-03": "Balancete 03-2026-UNICA.xls",
    "2026-04": "Balancete 04-2026 - UNICA.xls",
    "2026-05": "Balancete 05-2026- UNICA.xls",
}

EXPECTED = {
    "2026-02": {
        "contas": 118,
        "ativo": 17725883.14,
        "passivo": -19158242.06,
        "resultado": 1432358.92,
    },
    "2026-03": {
        "contas": 133,
        "ativo": 18894008.23,
        "passivo": -20513069.63,
        "resultado": 1619061.4,
    },
    "2026-04": {
        "contas": 129,
        "ativo": 19012297.41,
        "passivo": -20631509.68,
        "resultado": 1619212.27,
    },
    "2026-05": {
        "contas": 135,
        "ativo": 18320007.45,
        "passivo": -20078857.73,
        "resultado": 1758850.28,
    },
}


def _path(competencia: str) -> Path:
    return FIXTURES / FIXTURE_FILES[competencia]


def _assert_balancete(result: dict, competencia: str, expected: dict) -> None:
    assert result["tipo"] == "balancete"
    assert not result["errors"], result["errors"]
    assert result["company_id"] == "unica"
    assert result["cnpj"] == UNICA_CNPJ
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
    assert totais["resultado"] == pytest.approx(expected["resultado"], abs=0.02)
    # Identidade patrimonial (saldos com sinal EXITO): Ativo + Passivo + Resultado ≈ 0
    assert (totais["ativo"] + totais["passivo"] + totais["resultado"]) == pytest.approx(0.0, abs=0.02)
    assert contas[0]["codigo"] == "1"
    assert contas[0]["grupo"] == "ativo"
    assert contas[0]["descricao"] == "ATIVO"


@pytest.mark.parametrize("competencia", list(EXPECTED.keys()))
def test_unica_balancete_fixture(competencia: str):
    path = _path(competencia)
    if not path.exists():
        pytest.skip(f"Fixture ausente: {path.name}")
    result = classify_and_extract(path)
    _assert_balancete(result, competencia, EXPECTED[competencia])


def test_unica_balancete_fixture_fills_tab():
    path = _path("2026-05")
    if not path.exists():
        pytest.skip(f"Fixture ausente: {path.name}")
    result = classify_and_extract(path)
    pack = result["pack_patch"] or {}
    tab = _slice("balancete", pack)
    contas = (tab.get("balancete") or {}).get("contas") or []
    assert len(contas) == EXPECTED["2026-05"]["contas"]
    assert tab.get("hasBalancete") is True
    assert _pack_has_tipo(pack, "balancete") is True
    assert _pack_has_tipo(pack, "dre") is False


def test_unica_balancete_por_mes_year_filter():
    """Simula meses gravados → build_balancete_por_mes filtra pelo ano."""

    class M:
        def __init__(self, competencia: str, pack: dict):
            self.competencia = competencia
            self.pack = pack

    months = []
    for comp, exp in EXPECTED.items():
        path = _path(comp)
        if not path.exists():
            pytest.skip(f"Fixture ausente: {path.name}")
        pack = classify_and_extract(path)["pack_patch"] or {}
        months.append(M(comp, pack))
    months.append(M("2025-12", months[0].pack))

    por = build_balancete_por_mes(months, "2026")
    assert [m["competencia"] for m in por] == ["2026-02", "2026-03", "2026-04", "2026-05"]
    assert por[0]["balancete"]["totais"]["ativo"] == pytest.approx(EXPECTED["2026-02"]["ativo"], abs=0.02)
    assert build_balancete_por_mes(months, "2024") == []
