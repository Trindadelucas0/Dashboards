from __future__ import annotations

from pathlib import Path

import pytest

from app.extract.parse_margem_cidade import is_margem_cidade
from app.extract.parse_margem_mes import is_margem_mes
from app.extract.parse_workbook_padrao import expand_workbook_parts
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import load_all_sheets

FIX = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "schumacher-padrao"
    / "Demonstrativo de Margens de Venda(Cidade).xls"
)


@pytest.mark.skipif(not FIX.exists(), reason="Fixture margem cidade ausente")
def test_margem_cidade_145_cidades_golden():
    sheets = load_all_sheets(FIX)
    assert is_margem_cidade(sheets) is True
    assert is_margem_mes(sheets) is False
    result = classify_and_extract(FIX)
    assert result["tipo"] == "margem_cidade"
    assert result["company_id"] == "schumacher"
    items = expand_workbook_parts({**result, "file_hash": "fixture-cidade"})
    assert len(items) == 1
    item = items[0]
    assert item["competencia"] == "2026-09"
    mc = item["pack_patch"]["margemCidade"]
    assert mc["periodoLabel"] == "Jan–Set/2026"
    assert len(mc["cidades"]) == 145
    assert mc["resumo"]["total"] == pytest.approx(51139507.94, abs=0.02)
