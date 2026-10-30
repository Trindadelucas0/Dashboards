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
