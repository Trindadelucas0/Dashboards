from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.companies import CompanyReg, Unit
from app.extract.classify import detect_sheet_tipo
from app.extract.parse_simples_nacional import (
    is_allowed_simples_unit,
    parse_simples_nacional_exito,
    simples_pack_patch,
)
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import WorkbookGrid
from app.imports_revert import apply_legacy_key_removal, deep_merge
from app.routers.companies import _slice


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "fixtures" / "simples-nacional-exito" / "filial-44-anonimizada.json"
CNPJ = "32911621000113"


def _grid() -> WorkbookGrid:
    source = json.loads(FIXTURE.read_text(encoding="utf-8"))
    rows = [[""] * 38 for _ in range(38)]
    for entry in source["rows"]:
        for column, value in entry["cells"].items():
            rows[int(entry["row"])][int(column)] = value
    return WorkbookGrid(str(FIXTURE), source["sheet"], rows, "fixture")


def test_detect_and_parse_simples_nacional_golden():
    grid = _grid()
    assert detect_sheet_tipo(grid, "Simples Nacional.xls") == "simples_nacional"

    parsed = parse_simples_nacional_exito(grid)

    assert parsed["errors"] == []
    assert parsed["competencia"] == "2026-09"
    assert parsed["estabelecimentoCodigo"] == "44"
    assert parsed["rpa"]["total"] == pytest.approx(127233.38, abs=0.01)
    assert parsed["rbt12"]["total"] == pytest.approx(1369213.03, abs=0.01)
    assert parsed["rbaAtual"]["total"] == pytest.approx(989841.21, abs=0.01)
    assert parsed["aliquota"] == pytest.approx(13.3970449287939)
    assert parsed["das"] == pytest.approx(17045.51, abs=0.01)
    assert parsed["partilha"] == {
        "irpj": 681.82,
        "csll": 596.59,
        "cofins": 2325.01,
        "pis": 504.55,
        "inss": 7397.75,
        "iss": 5539.79,
    }
    assert sum(parsed["partilha"].values()) == pytest.approx(parsed["das"], abs=0.01)


def test_pack_uses_rpa_and_only_das():
    parsed = parse_simples_nacional_exito(_grid())
    patch = simples_pack_patch(parsed, cnpj=CNPJ, razao="EMPRESA ANONIMIZADA LTDA")

    assert set(patch) == {"apuracao", "memoriaSimples"}
    assert patch["apuracao"]["das"]["baseCalculo"] == pytest.approx(127233.38, abs=0.01)
    assert set(patch["apuracao"]) == {"das"}
    assert patch["memoriaSimples"]["baseMemoria"] == pytest.approx(127233.38, abs=0.01)


def test_pipeline_resolves_dynamic_allowed_unit(monkeypatch, tmp_path: Path):
    company = CompanyReg(
        id="dt-tintas",
        label="DT TINTAS MATRIZ",
        theme="green",
        tabs=("impostos", "memoria", "importar"),
        units=(Unit("filial-3", "44-DAUTO SERVICOS-MG", CNPJ),),
        cnpj="00000000000000",
    )
    monkeypatch.setattr("app.extract.pipeline.load_all_sheets", lambda *_args, **_kwargs: [_grid()])
    monkeypatch.setattr("app.companies.resolve_from_db", lambda *_args, **_kwargs: (company, "filial-3"))
    source = tmp_path / "Simples Nacional.xls"
    source.write_bytes(b"fixture")

    result = classify_and_extract(source, db=object())

    assert result["errors"] == []
    assert result["tipo"] == "simples_nacional"
    assert result["company_id"] == "dt-tintas"
    assert result["unidade"] == "filial-3"
    assert result["competencia"] == "2026-09"
    assert result["meta"]["estabelecimento"] == "44"
    assert result["meta"]["rpa"] == pytest.approx(127233.38, abs=0.01)
    assert result["meta"]["das"] == pytest.approx(17045.51, abs=0.01)


@pytest.mark.parametrize(
    "code,label,allowed",
    [
        ("44", "44-DAUTO SERVICOS-MG", True),
        ("45", "45-VET LUZIANIA-GO", True),
        ("56", "56-ETICA-DF", True),
        ("67", "67-MERCADO AGUAS CLARAS-DF", True),
        ("69", "69-MERCADO GAMA-DF", False),
        ("44", "44-OUTRA EMPRESA-MG", False),
    ],
)
def test_allowed_units(code: str, label: str, allowed: bool):
    assert is_allowed_simples_unit(code, label) is allowed


def test_parser_blocks_bad_formula_and_partilha():
    grid = _grid()
    grid.rows[25][37] = "17000.00"
    parsed = parse_simples_nacional_exito(grid)
    assert any("RPA × alíquota" in error for error in parsed["errors"])
    assert any("Partilha não confere" in error for error in parsed["errors"])


def test_parser_supports_external_market_adjustments_and_icms_split():
    grid = _grid()
    grid.rows[10][18] = "100000.00"
    grid.rows[10][24] = "27233.38"
    grid.rows[26][32] = "ICMS"
    grid.rows[31][15] = "10.00"
    grid.rows[32][15] = "2.00"
    grid.rows[33][15] = "3.00"
    grid.rows[34][15] = "4.00"
    grid.rows[35][15] = "5.00"

    parsed = parse_simples_nacional_exito(grid)

    assert parsed["errors"] == []
    assert parsed["rpa"] == {
        "mercadoInterno": 100000.0,
        "mercadoExterno": 27233.38,
        "total": 127233.38,
    }
    assert parsed["partilha"]["icms"] == pytest.approx(5539.79, abs=0.01)
    assert "iss" not in parsed["partilha"]
    assert parsed["ajustes"] == {
        "outrosAcrescimos": 10.0,
        "outrasDeducoes": 2.0,
        "valorDiferido": 3.0,
        "valorFixoIcms": 4.0,
        "valorFixoIss": 5.0,
    }


def test_parser_accepts_zero_values_and_missing_optional_fields():
    grid = _grid()
    for row, columns in {
        10: (18, 24, 34),
        25: (12, 22, 37),
        30: (8, 14, 20, 23, 25, 32),
        36: (15,),
    }.items():
        for column in columns:
            grid.rows[row][column] = "0"
    for row in (13, 19, 21, 22, 24, 31, 32, 33, 34, 35):
        grid.rows[row] = [""] * len(grid.rows[row])

    parsed = parse_simples_nacional_exito(grid)

    assert parsed["errors"] == []
    assert parsed["rpa"]["total"] == 0
    assert parsed["aliquota"] == 0
    assert parsed["das"] == 0
    assert parsed["faixa"] == ""
    assert parsed["fatorR"] is None
    assert all(value is None for value in parsed["ajustes"].values())


def test_parser_blocks_missing_competencia():
    grid = _grid()
    grid.rows[5] = [""] * len(grid.rows[5])

    parsed = parse_simples_nacional_exito(grid)

    assert any("Competência não identificada" in error for error in parsed["errors"])


def test_replace_simples_keeps_other_month_data():
    parsed = parse_simples_nacional_exito(_grid())
    simples = simples_pack_patch(parsed, cnpj=CNPJ, razao="EMPRESA ANONIMIZADA LTDA")
    current = deep_merge(
        {
            "hasMovimentacao": True,
            "cfopSaidasTotal": 200000.0,
            "totalCompras": 80000.0,
            "hasDre": True,
            "dre": {"hasValores": True},
            "apuracao": {"icms": {"aRecolher": 900.0}},
        },
        simples,
    )

    cleaned = apply_legacy_key_removal(
        current,
        {"simples_nacional"},
        {"saidas", "entradas", "dre", "icms"},
    )

    assert "memoriaSimples" not in cleaned
    assert "das" not in cleaned["apuracao"]
    assert cleaned["apuracao"]["icms"]["aRecolher"] == 900.0
    assert cleaned["cfopSaidasTotal"] == 200000.0
    assert cleaned["totalCompras"] == 80000.0
    assert cleaned["hasDre"] is True


def test_tax_and_memory_slices_use_simples_rpa_instead_of_movement_sales():
    parsed = parse_simples_nacional_exito(_grid())
    simples = simples_pack_patch(parsed, cnpj=CNPJ, razao="EMPRESA ANONIMIZADA LTDA")
    pack = deep_merge(
        {
            "hasMovimentacao": True,
            "cfopSaidasTotal": 200000.0,
            "receitaBruta": 200000.0,
        },
        simples,
    )

    assert _slice("impostos", pack)["receitaBruta"] == pytest.approx(127233.38, abs=0.01)
    assert _slice("memoria", pack)["receitaBruta"] == pytest.approx(127233.38, abs=0.01)
