"""Golden do livro de apuração Schumacher (jan–ago/2026) e não-match da planilha padrão."""

from pathlib import Path

import pytest

from app.extract.parse_livro_apuracao import is_livro_apuracao
from app.extract.parse_workbook_padrao import expand_workbook_parts
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import WorkbookGrid
from app.routers.companies import aggregate_fiscal_packs

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "schumacher-padrao"
    / "SHUMACKER_MATRIZ_APURACOES_2026.xlsx"
)


def _items():
    result = classify_and_extract(FIXTURE)
    assert result["tipo"] == "livro_apuracao"
    assert not result["errors"]
    assert result["company_id"] == "schumacher"
    items = expand_workbook_parts({**result, "file_hash": "fixture-hash"})
    return result, items


@pytest.mark.skipif(not FIXTURE.exists(), reason="Fixture schumacher-padrao ausente")
def test_livro_schumacher_oito_meses_e_golden_jan():
    _result, items = _items()
    assert len(items) == 8
    assert {i["competencia"] for i in items} == {f"2026-{m:02d}" for m in range(1, 9)}
    assert all(not i.get("errors") for i in items)
    assert all(i.get("company_id") == "schumacher" for i in items)
    assert all(i.get("unidade") == "matriz" for i in items)
    assert len({i["file_hash"] for i in items}) == 8

    jan = next(i for i in items if i["competencia"] == "2026-01")
    ap = jan["pack_patch"]["apuracao"]
    assert set(ap) == {"icms", "ipi", "pis", "cofins"}
    icms = ap["icms"]
    assert icms["debitos"] == pytest.approx(202756.31, abs=0.02)
    assert icms["outrosDebitos"] == pytest.approx(0, abs=0.02)
    assert icms["creditos"] == pytest.approx(140400.70, abs=0.02)
    assert icms["saldoCredorAnterior"] == pytest.approx(0, abs=0.02)
    assert icms["outrosCreditos"] == pytest.approx(16331.63, abs=0.02)
    assert icms["saldoCredor"] == pytest.approx(156732.33, abs=0.02)
    assert icms["aRecolher"] == pytest.approx(46023.98, abs=0.02)
    assert icms["saldoCredorSeguinte"] == pytest.approx(0, abs=0.02)
    assert icms["conferencia"] == "OK"
    assert icms["fonte"] == "livro_apuracao"
    assert icms["apurado"] == pytest.approx(icms["debitos"], abs=0.02)
    assert icms["aRecolher"] == pytest.approx(icms["saldoDevedor"] - icms["saldoCredor"], abs=0.02)
    assert ap["ipi"]["aRecolher"] == pytest.approx(3561.24, abs=0.02)

    livro = jan["pack_patch"]["livroApuracao"]["tributos"]
    linha = next(x for x in livro["icms"]["entradas"] if x["cfop"] == "1101")
    assert linha["valorContabil"] == pytest.approx(177204.18, abs=0.02)
    assert linha["imposto"] == pytest.approx(18449.58, abs=0.02)
    assert "colunaOutrosLabel" not in livro["icms"]
    assert livro["pis"]["colunaOutrosLabel"] == "Imune/Susp."
    assert livro["cofins"]["colunaOutrosLabel"] == "Imune/Susp."

    abr = next(i for i in items if i["competencia"] == "2026-04")
    assert abr["pack_patch"]["apuracao"]["icms"]["outrosDebitos"] == pytest.approx(180694.92, abs=0.02)


def test_planilha_padrao_nao_e_livro():
    sheets = [
        WorkbookGrid("", "DRE", [], "x"),
        WorkbookGrid("", "BALANCETE", [], "x"),
        WorkbookGrid("", "ICMS 5005-2012", [], "x"),
    ]
    assert is_livro_apuracao(sheets) is False


def test_aggregate_livro_concatena_e_conferencia():
    a = {
        "apuracao": {
            "icms": {"debitos": 10, "aRecolher": 4, "conferencia": "OK", "fonte": "livro_apuracao"},
        },
        "livroApuracao": {
            "tributos": {
                "icms": {"entradas": [{"cfop": "1101"}], "saidas": [], "subtotais": [], "ajustes": []},
            }
        },
    }
    b = {
        "apuracao": {
            "icms": {"debitos": 3, "aRecolher": 1, "conferencia": "OK", "fonte": "livro_apuracao"},
        },
        "livroApuracao": {
            "tributos": {
                "icms": {"entradas": [{"cfop": "2101"}], "saidas": [], "subtotais": [], "ajustes": []},
                "pis": {
                    "entradas": [],
                    "saidas": [],
                    "subtotais": [],
                    "ajustes": [],
                    "colunaOutrosLabel": "Imune/Susp.",
                },
            }
        },
    }
    pack = aggregate_fiscal_packs([a, b], "1º Trimestre 2026")
    assert pack["livroApuracao"]["tributos"]["icms"]["entradas"] == [{"cfop": "1101"}, {"cfop": "2101"}]
    assert pack["apuracao"]["icms"]["debitos"] == pytest.approx(13, abs=0.02)
    assert pack["apuracao"]["icms"]["conferencia"] == "OK"
    assert pack["apuracao"]["icms"]["fonte"] == "livro_apuracao"
    assert pack["livroApuracao"]["tributos"]["pis"]["colunaOutrosLabel"] == "Imune/Susp."

    ruim = {
        "apuracao": {"icms": {"debitos": 1, "conferencia": "DIVERGENTE", "fonte": "livro_apuracao"}},
        "livroApuracao": a["livroApuracao"],
    }
    pack2 = aggregate_fiscal_packs([a, ruim], "1º Trimestre 2026")
    assert pack2["apuracao"]["icms"]["conferencia"] == "DIVERGENTE"
    assert "livroApuracao" in pack2
