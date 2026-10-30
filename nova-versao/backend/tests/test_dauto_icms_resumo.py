from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import HTTPException

from app.extract.pipeline import classify_and_extract
from app.routers.imports import _apply_session_unit, _session_unit_context


FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "dauto-padrao"
    / "09-2026PLANILHA PADRÃO DASHBOARDS DT FILIAL 104.xlsx"
)

MATRIZ_FIXTURES = [
    (
        "07-2026Planilha Padrão DASBORADS - DT TINTAS MATRIZ 75 - Copia - Copia.xlsx",
        "2026-07", 27753.90, 18997.95, 14359.05, -5603.10, 6342.33, 29272.31,
    ),
    (
        "08-2026Planilha Padrão DASBORADS - DT TINTAS MATRIZ 75 - Copia.xlsx",
        "2026-08", 10878.30, 18666.35, 5603.10, -13391.15, 3973.72, 18340.26,
    ),
    (
        "09-2026Planilha Padrão DASBORADS - DT TINTAS MATRIZ 75.xlsx",
        "2026-09", 17324.18, 19851.86, 13391.15, -15918.83, 4625.49, 21348.42,
    ),
]


@pytest.mark.skipif(not FIXTURE.exists(), reason="Fixture ICMS Dauto ausente")
def test_icms_resumo_dauto_reconhece_total_e_estorno_de_credito():
    result = classify_and_extract(FIXTURE, company_cnpj="12345678000199")

    assert result["tipo"] == "workbook_padrao"
    assert result["competencia"] == "2026-09"
    assert not result["errors"]
    assert len(result["parts"]) == 1

    part = result["parts"][0]
    assert part["tipo"] == "icms"
    assert part["competencia"] == "2026-09"
    tax = part["pack_patch"]["apuracao"]["icms"]
    assert tax["debitoSaidas"] == pytest.approx(14506.85, abs=0.02)
    assert tax["estornoCredito"] == pytest.approx(3138.63, abs=0.02)
    assert tax["apurado"] == pytest.approx(17645.48, abs=0.02)
    assert tax["credito"] == pytest.approx(18631.34, abs=0.02)
    assert tax["aRecolher"] == pytest.approx(-985.86, abs=0.02)


@pytest.mark.parametrize(
    "filename,competencia,debito,credito,saldo_anterior,saldo_final,pis,cofins",
    MATRIZ_FIXTURES,
)
def test_matriz_dauto_importa_saldo_final_icms_e_resumo_debito_pis_cofins(
    filename: str,
    competencia: str,
    debito: float,
    credito: float,
    saldo_anterior: float,
    saldo_final: float,
    pis: float,
    cofins: float,
):
    fixture = FIXTURE.parent / filename
    if not fixture.exists():
        pytest.skip(f"Fixture Dauto matriz ausente: {filename}")

    result = classify_and_extract(fixture, company_cnpj="40994045000143")

    assert result["tipo"] == "workbook_padrao"
    assert result["competencia"] == competencia
    assert not result["errors"]
    parts = {part["tipo"]: part for part in result["parts"]}
    assert set(parts) == {"apuracao_5005", "pis_cofins"}

    icms = parts["apuracao_5005"]["pack_patch"]["apuracao"]["icms"]
    assert icms["apurado"] == pytest.approx(debito, abs=0.02)
    assert icms["credito"] == pytest.approx(credito, abs=0.02)
    assert icms["saldoCredorAnterior"] == pytest.approx(saldo_anterior, abs=0.02)
    assert icms["aRecolher"] == pytest.approx(saldo_final, abs=0.02)

    apuracao = parts["pis_cofins"]["pack_patch"]["apuracao"]
    assert apuracao["pis"]["credito"] == pytest.approx(0, abs=0.02)
    assert apuracao["pis"]["aRecolher"] == pytest.approx(pis, abs=0.02)
    assert apuracao["cofins"]["credito"] == pytest.approx(0, abs=0.02)
    assert apuracao["cofins"]["aRecolher"] == pytest.approx(cofins, abs=0.02)


def test_unidade_do_dashboard_e_usada_quando_cnpj_confere():
    extracted = {
        "cnpj": "12.345.678/0001-99",
        "unidade": "matriz",
        "warnings": [],
        "errors": [],
    }

    _apply_session_unit(extracted, "filial-1", "12345678000199", "104-LUZIANIA-GO")

    assert extracted["unidade"] == "filial-1"
    assert not extracted["errors"]
    assert "104-LUZIANIA-GO" in extracted["warnings"][0]


def test_unidade_do_dashboard_bloqueia_cnpj_divergente():
    extracted = {
        "cnpj": "99.999.999/0001-99",
        "unidade": "matriz",
        "warnings": [],
        "errors": [],
    }

    _apply_session_unit(extracted, "filial-1", "12345678000199", "104-LUZIANIA-GO")

    assert extracted["unidade"] == "matriz"
    assert any("não pertence à unidade selecionada" in error for error in extracted["errors"])


def test_importacao_bloqueia_todas_as_unidades():
    with pytest.raises(HTTPException, match="unidade específica"):
        _session_unit_context("grupo-dauto", "todas", object())
