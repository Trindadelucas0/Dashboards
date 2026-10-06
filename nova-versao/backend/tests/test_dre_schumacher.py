"""Golden da DRE comparativo Schumacher (jan–ago/2026)."""

from pathlib import Path

import pytest

from app.extract.parse_balanco_schumacher import is_balanco_schumacher
from app.extract.parse_dre import is_analise_vertical_dre
from app.extract.parse_dre_schumacher import is_dre_schumacher
from app.extract.parse_livro_apuracao import is_livro_apuracao
from app.extract.parse_venda_produto import is_venda_produto
from app.extract.parse_workbook_padrao import expand_workbook_parts
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import WorkbookGrid, load_all_sheets

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "schumacher-padrao"
    / "DRE_SCHUMACHER_2026.xlsx"
)
LIVRO = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "schumacher-padrao"
    / "SHUMACKER_MATRIZ_APURACOES_2026.xlsx"
)
VENDA = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "schumacher-padrao"
    / "VENDA_POR_PRODUTO_SHUMACHER_01_A_08_2026_MATRIZ_E_FILIAL.xlsx"
)


@pytest.mark.skipif(not FIXTURE.exists(), reason="Fixture DRE Schumacher ausente")
def test_dre_schumacher_oito_parts_e_golden():
    sheets = load_all_sheets(FIXTURE)
    assert is_dre_schumacher(sheets) is True
    assert is_analise_vertical_dre(sheets[0], FIXTURE.name) is False
    assert is_balanco_schumacher(sheets) is False

    result = classify_and_extract(FIXTURE)
    assert result["tipo"] == "dre_schumacher"
    assert not result["errors"]
    assert result["company_id"] == "schumacher"
    items = expand_workbook_parts({**result, "file_hash": "fixture-hash-dre"})
    assert len(items) == 8
    assert {i["competencia"] for i in items} == {f"2026-{m:02d}" for m in range(1, 9)}
    assert all(i.get("unidade") == "matriz" for i in items)
    assert all(not i.get("errors") for i in items)
    assert len({i["file_hash"] for i in items}) == 8

    jan = next(i for i in items if i["competencia"] == "2026-01")
    dre = jan["pack_patch"]["dre"]
    assert dre["kind"] == "schumacher_comparativo"
    assert jan["pack_patch"]["receitaBruta"] == pytest.approx(65256171.15, abs=0.02)
    assert dre["receitaLiquida"] == pytest.approx(64810440.98, abs=0.02)
    assert dre["lucBruto"] == pytest.approx(21588039.86, abs=0.02)
    assert dre["lucLiq"] == pytest.approx(3286063.34, abs=0.02)
    assert dre["acumuladoJanAgo"]["receitaBruta"] == pytest.approx(101951997.02, abs=0.02)
    assert dre["acumuladoJanAgo"]["lucLiq"] == pytest.approx(-4771004.58, abs=0.02)

    ago = next(i for i in items if i["competencia"] == "2026-08")
    assert ago["pack_patch"]["receitaBruta"] == pytest.approx(5448307.61, abs=0.02)
    assert ago["pack_patch"]["dre"]["lucLiq"] == pytest.approx(-60274.01, abs=0.02)
    assert ago["pack_patch"]["dre"]["acumuladoJanAgo"]["lucLiq"] == pytest.approx(-4771004.58, abs=0.02)


def test_planilha_padrao_e_livro_nao_sao_dre_schumacher():
    padrao = [
        WorkbookGrid("", "DRE", [], "x"),
        WorkbookGrid("", "BALANCETE", [], "x"),
        WorkbookGrid("", "ICMS 5005-2012", [], "x"),
    ]
    assert is_dre_schumacher(padrao) is False
    livro = [
        WorkbookGrid("", "Resumo", [], "x"),
        WorkbookGrid("", "ICMS_Entradas", [], "x"),
    ]
    assert is_dre_schumacher(livro) is False
    assert is_livro_apuracao(livro) is True
    assert is_venda_produto(livro) is False


@pytest.mark.skipif(not LIVRO.exists(), reason="Fixture livro ausente")
def test_arquivo_livro_nao_classifica_dre_schumacher():
    result = classify_and_extract(LIVRO)
    assert result["tipo"] == "livro_apuracao"


@pytest.mark.skipif(not VENDA.exists(), reason="Fixture venda por produto ausente")
def test_arquivo_venda_produto_nao_classifica_dre_schumacher():
    result = classify_and_extract(VENDA)
    assert result["tipo"] == "venda_produto"
