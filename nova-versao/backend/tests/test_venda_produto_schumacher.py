"""Golden de venda por produto Schumacher (Matriz/Filial jan–ago/2026)."""

from pathlib import Path

import pytest

from app.extract.parse_livro_apuracao import is_livro_apuracao
from app.extract.parse_venda_produto import is_venda_produto, merge_venda_produto
from app.extract.parse_workbook_padrao import expand_workbook_parts
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import WorkbookGrid

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "schumacher-padrao"
    / "VENDA_POR_PRODUTO_SHUMACHER_01_A_08_2026_MATRIZ_E_FILIAL.xlsx"
)
LIVRO = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "schumacher-padrao"
    / "SHUMACKER_MATRIZ_APURACOES_2026.xlsx"
)


@pytest.mark.skipif(not FIXTURE.exists(), reason="Fixture venda por produto ausente")
def test_venda_produto_dezesseis_parts_e_golden():
    result = classify_and_extract(FIXTURE)
    assert result["tipo"] == "venda_produto"
    assert not result["errors"]
    assert result["company_id"] == "schumacher"
    items = expand_workbook_parts({**result, "file_hash": "fixture-hash"})
    assert len(items) == 16
    assert {i["competencia"] for i in items} == {f"2026-{m:02d}" for m in range(1, 9)}
    assert {i["unidade"] for i in items} == {"matriz", "filial"}
    assert all(not i.get("errors") for i in items)
    assert all(i.get("company_id") == "schumacher" for i in items)
    assert len({i["file_hash"] for i in items}) == 16

    jan_m = next(i for i in items if i["competencia"] == "2026-01" and i["unidade"] == "matriz")
    res = jan_m["pack_patch"]["vendaProduto"]["resumo"]
    assert res["itens"] == 244
    assert res["total"] == pytest.approx(2124363.70, abs=0.02)
    assert res["aVista"] == pytest.approx(412.05, abs=0.02)
    assert res["custo"] == pytest.approx(879028.75, abs=0.02)
    assert res["lucroBruto"] == pytest.approx(1245335.00, abs=0.02)
    assert res["lucroLiquido"] == pytest.approx(733690.16, abs=0.02)
    assert res["margBruta"] == pytest.approx(0.5862, abs=0.0002)
    assert res["pmp"] == pytest.approx(43.08, abs=0.02)
    linha = next(x for x in jan_m["pack_patch"]["vendaProduto"]["produtos"] if x["codigo"] == "10001")
    assert linha["qtde"] == pytest.approx(603, abs=0.02)
    assert linha["total"] == pytest.approx(17529.33, abs=0.02)

    jan_f = next(i for i in items if i["competencia"] == "2026-01" and i["unidade"] == "filial")
    assert jan_f["pack_patch"]["vendaProduto"]["resumo"]["total"] == pytest.approx(731003.59, abs=0.02)
    assert jan_f["pack_patch"]["vendaProduto"]["resumo"]["itens"] == 53

    fev_f = next(i for i in items if i["competencia"] == "2026-02" and i["unidade"] == "filial")
    assert fev_f["pack_patch"]["vendaProduto"]["resumo"]["lucroBruto"] == pytest.approx(-187636.43, abs=0.02)

    merged = merge_venda_produto(
        [jan_m["pack_patch"], jan_f["pack_patch"]],
    )
    assert merged["resumo"]["total"] == pytest.approx(2855367.29, abs=0.02)


def test_livro_nao_e_venda_produto():
    sheets = [
        WorkbookGrid("", "Resumo", [], "x"),
        WorkbookGrid("", "ICMS_Entradas", [], "x"),
    ]
    assert is_venda_produto(sheets) is False
    assert is_livro_apuracao(sheets) is True


def test_planilha_padrao_nao_e_venda_produto():
    sheets = [
        WorkbookGrid("", "DRE", [], "x"),
        WorkbookGrid("", "BALANCETE", [], "x"),
        WorkbookGrid("", "ICMS 5005-2012", [], "x"),
    ]
    assert is_venda_produto(sheets) is False


@pytest.mark.skipif(not LIVRO.exists(), reason="Fixture livro ausente")
def test_arquivo_livro_nao_classifica_venda_produto():
    result = classify_and_extract(LIVRO)
    assert result["tipo"] == "livro_apuracao"


def test_slice_e_aggregate_vendas_produto():
    from app.routers.companies import _is_empty, _slice, aggregate_fiscal_packs

    vazia = {}
    assert _is_empty("vendas-produto", vazia, None) is True
    pack = {
        "vendaProduto": {
            "resumo": {"total": 100.0, "lucroBruto": -20.0, "itens": 2},
            "produtos": [{"codigo": "1", "total": 100.0}],
        }
    }
    assert _is_empty("vendas-produto", pack, None) is False
    sliced = _slice("vendas-produto", pack)
    assert sliced["vendaProduto"]["resumo"]["total"] == 100.0

    a = {
        "vendaProduto": {
            "resumo": {
                "itens": 1,
                "qtde": 1,
                "qtdeUn": 1,
                "aVista": 0,
                "aPrazo": 100,
                "total": 100,
                "custo": 40,
                "lucroBruto": 60,
                "lucroLiquido": 50,
                "margBruta": 0.6,
                "margLiquida": 0.5,
                "pmp": 10,
            },
            "produtos": [
                {
                    "codigo": "10001",
                    "produto": "A",
                    "qtde": 1,
                    "qtdeUn": 1,
                    "aVista": 0,
                    "aPrazo": 100,
                    "total": 100,
                    "custo": 40,
                    "lucroBruto": 60,
                    "lucroLiquido": 50,
                    "margBruta": 0.6,
                    "margLiquida": 0.5,
                    "pmp": 10,
                }
            ],
        }
    }
    b = {
        "vendaProduto": {
            "resumo": {
                "itens": 1,
                "qtde": 2,
                "qtdeUn": 2,
                "aVista": 20,
                "aPrazo": 80,
                "total": 100,
                "custo": 70,
                "lucroBruto": 30,
                "lucroLiquido": 20,
                "margBruta": 0.3,
                "margLiquida": 0.2,
                "pmp": 40,
            },
            "produtos": [
                {
                    "codigo": "10001",
                    "produto": "A",
                    "qtde": 2,
                    "qtdeUn": 2,
                    "aVista": 20,
                    "aPrazo": 80,
                    "total": 100,
                    "custo": 70,
                    "lucroBruto": 30,
                    "lucroLiquido": 20,
                    "margBruta": 0.3,
                    "margLiquida": 0.2,
                    "pmp": 40,
                }
            ],
        }
    }
    merged = aggregate_fiscal_packs([a, b], "Jan/2026")
    assert merged["vendaProduto"]["resumo"]["total"] == pytest.approx(200, abs=0.02)
    assert merged["vendaProduto"]["resumo"]["itens"] == 1
    assert merged["vendaProduto"]["resumo"]["pmp"] == pytest.approx(25, abs=0.02)
    assert merged["vendaProduto"]["resumo"]["margBruta"] == pytest.approx(0.45, abs=0.0001)
