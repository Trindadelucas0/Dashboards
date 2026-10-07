from __future__ import annotations

from pathlib import Path

import pytest

from app.extract.parse_margem_cidade import is_margem_cidade
from app.extract.parse_margem_mes import is_margem_mes
from app.extract.parse_venda_produto import is_venda_produto
from app.extract.parse_workbook_padrao import expand_workbook_parts
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import load_all_sheets

FIX = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "schumacher-padrao"
    / "Demonstrativo de Margens de Venda(Mes).xls"
)
FIX_2025 = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "schumacher-padrao"
    / "Demonstrativo de Margens de Venda(Mes)2025.xls"
)
VENDA = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "schumacher-padrao"
    / "VENDA_POR_PRODUTO_SHUMACHER_01_A_08_2026_MATRIZ_E_FILIAL.xlsx"
)


@pytest.mark.skipif(not FIX.exists(), reason="Fixture margem mês ausente")
def test_margem_mes_nove_parts_2026_e_golden():
    sheets = load_all_sheets(FIX)
    assert is_margem_mes(sheets) is True
    assert is_margem_cidade(sheets) is False
    assert is_venda_produto(sheets) is False
    result = classify_and_extract(FIX)
    assert result["tipo"] == "margem_mes"
    assert result["company_id"] == "schumacher"
    items = expand_workbook_parts({**result, "file_hash": "fixture-mes-2026"})
    assert len(items) == 9
    jan = next(i for i in items if i["competencia"] == "2026-01")
    total = jan["pack_patch"]["margemMes"]["resumo"]["total"]
    assert total == pytest.approx(2855367.29, abs=0.02)
    mb = jan["pack_patch"]["margemMes"]["resumo"]["margBruta"]
    assert mb == pytest.approx(0.4952, abs=0.0001)


@pytest.mark.skipif(not FIX_2025.exists(), reason="Fixture margem mês 2025 ausente")
def test_margem_mes_doze_parts_2025():
    result = classify_and_extract(FIX_2025)
    assert result["tipo"] == "margem_mes"
    items = expand_workbook_parts({**result, "file_hash": "fixture-mes-2025"})
    assert len(items) == 12
    assert all(i["competencia"].startswith("2025-") for i in items)


@pytest.mark.skipif(not VENDA.exists(), reason="Fixture venda produto ausente")
def test_venda_produto_nao_e_margem_mes():
    sheets = load_all_sheets(VENDA)
    assert is_venda_produto(sheets) is True
    assert is_margem_mes(sheets) is False
    result = classify_and_extract(VENDA)
    assert result["tipo"] == "venda_produto"
