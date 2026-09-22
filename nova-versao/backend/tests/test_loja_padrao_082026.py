"""Planilha padrão Loja das Máquinas 08/2026 — ICMS simples, sem memória 5005."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.extract.pipeline import classify_and_extract

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "loja-maquinas-padrao"
    / "planilha-padrao-082026.xlsx"
)


def _part(result: dict, tipo: str) -> dict:
    return next(p for p in result["parts"] if p.get("tipo") == tipo)


@pytest.mark.skipif(not FIXTURE.exists(), reason="Fixture Loja 082026 ausente")
def test_loja_082026_workbook_icms_pis_dre_vazia():
    result = classify_and_extract(FIXTURE)
    assert result["tipo"] == "workbook_padrao"
    assert result["competencia"] == "2026-08"
    assert not result["errors"]

    aviso = " ".join(result.get("warnings") or [])
    assert "CSLL" in aviso
    assert "IRPJ" in aviso
    assert "ICMS 5005-2012" in aviso
    assert "DRE/Balancete" not in aviso

    icms = _part(result, "icms")
    assert icms["status"] == "ok"
    assert icms["competencia"] == "2026-08"
    tax = icms["pack_patch"]["apuracao"]["icms"]
    assert tax["aRecolher"] == pytest.approx(24606.70, abs=0.02)
    assert tax["apurado"] == pytest.approx(80544.36, abs=0.02)
    assert tax["credito"] == pytest.approx(55937.66, abs=0.02)
    assert tax["fonte"] == "planilha_padrao_icms"
    assert icms["pack_patch"]["apuracao"]["fonte"] == "planilha_padrao_icms"
    assert "memoriaCalculo" not in icms["pack_patch"]
    assert not any(p.get("tipo") == "apuracao_5005" for p in result["parts"])

    pis = _part(result, "pis_cofins")
    assert pis["status"] == "ok"
    assert pis["competencia"] == "2026-08"
    ap = pis["pack_patch"]["apuracao"]
    resumo = pis["pack_patch"]["memoriaPisCofins"]["resumo"]
    assert ap["pis"]["aRecolher"] == pytest.approx(3016.31, abs=0.02)
    assert ap["cofins"]["aRecolher"] == pytest.approx(13893.28, abs=0.02)
    assert resumo["pis"]["aRecolherCalculado"] == pytest.approx(3243.46, abs=0.02)
    assert resumo["cofins"]["aRecolherCalculado"] == pytest.approx(14939.55, abs=0.02)
    assert resumo["pis"]["ajuste"] == pytest.approx(227.15, abs=0.02)
    assert resumo["cofins"]["ajuste"] == pytest.approx(1046.27, abs=0.02)
    assert "saldoCredor" not in resumo["pis"]
    assert "saldoCredor" not in resumo["cofins"]

    dre = _part(result, "dre")
    bal = _part(result, "balancete")
    assert dre["status"] == "vazia"
    assert dre["competencia"] == "2026-08"
    assert not dre.get("pack_patch")
    assert bal["status"] == "vazia"
    assert bal["competencia"] == "2026-08"
    assert not bal.get("pack_patch")

    gravados = {p["tipo"] for p in result["parts"] if p.get("pack_patch")}
    assert gravados == {"icms", "pis_cofins"}
