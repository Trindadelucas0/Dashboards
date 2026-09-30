"""Planilha padrão — contrato genérico (sem Baifer/Loja no nome do teste).

O parser não olha a empresa: abas + MMYYYY no nome. company_id vem do dashboard.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.extract.parse_workbook_padrao import (
    extract_workbook_padrao,
    is_workbook_padrao,
)
from app.extract.workbook import WorkbookGrid
from app.routers.imports import _apply_session_company


def _g(name: str, rows: list[list]) -> WorkbookGrid:
    return WorkbookGrid("sintetico.xlsx", name, rows, "xlsx")


def _dre_jan_only() -> WorkbookGrid:
    # Janeiro preenchido; agosto vazio — não pode vazar para 08/2026.
    header = [
        "RECEITA BRUTA",
        "JANEIRO",
        "AV",
        "AH",
        "FEVEREIRO",
        "AV",
        "AH",
        "MARÇO",
        "AV",
        "AH",
        "ABRIL",
        "AV",
        "AH",
        "MAIO",
        "AV",
        "AH",
        "JUNHO",
        "AV",
        "AH",
        "JULHO",
        "AV",
        "AH",
        "AGOSTO",
        "AV",
        "AH",
        "SETEMBRO",
        "AV",
        "AH",
        "OUTUBRO",
        "AV",
        "AH",
        "NOVEMBRO",
        "AV",
        "AH",
        "DEZEMBRO",
        "AV",
        "AH",
    ]
    venda = ["VENDA DE MERCADORIAS", "100000"] + [""] * (len(header) - 2)
    return _g("DRE", [header, venda])


def _bal_jan_only() -> WorkbookGrid:
    header = [
        "Código",
        "Classificação",
        "Descrição da conta",
        "JANEIRO",
        "FEVEREIRO",
        "AV",
        "MARÇO",
        "AV",
        "ABRIL",
        "AV",
        "MAIO",
        "AV",
        "JUNHO",
        "AV",
        "JULHO",
        "AV",
        "AGOSTO",
        "AV",
        "SETEMBRO",
        "AV",
        "OUTUBRO",
        "AV",
        "NOVEMBRO",
        "AV",
        "DEZEMBRO",
        "AV",
    ]
    ativo = ["1", "1", "ATIVO", "500000"] + [""] * (len(header) - 4)
    return _g("BALANCETE", [header, ativo])


def _icms_5005() -> WorkbookGrid:
    return _g(
        "ICMS 5005-2012",
        [
            ["DÉBITO ORIGINAL", "1000"],
            ["CREDITO ORIGINAL", "200"],
            ["TOTAL", "800"],
            [],
            ["DEBITOS 5005", "500"],
            ["CREDITOS 5005", "100"],
            ["TOTAL", "400"],
            [],
            ["DEBITO FORA", "50"],
            ["CREDITO FORA", "0"],
            ["CREDITO OUTORGADO", "0"],
            ["TOTAL", "50"],
            [],
            ["ICMS A RECOLHER", "450"],
        ],
    )


def _icms_simples() -> WorkbookGrid:
    return _g(
        "ICMS",
        [
            ["DÉBITO ICMS", "800"],
            ["CREDITO ICMS", "300"],
            ["ICMS A RECOLHER", "500"],
        ],
    )


def _pis_ajuste() -> WorkbookGrid:
    return _g(
        "PIS COFINS",
        [
            ["", "DEBITO"],
            [
                "",
                "VALOR PRODUTO",
                "VALOR CONTABIL",
                "BASE DE CALCULO",
                "AJUSTE .B.C",
                "B.C. AJUSTADA",
                "ALIQUOTA",
                "VALOR IMPOSTO",
            ],
            ["PIS", "100", "100", "100", "", "100", "0.0165", "10"],
            ["COFINS", "100", "100", "100", "", "100", "0.076", "20"],
            ["", "CREDITO"],
            [
                "",
                "VALOR PRODUTO",
                "VALOR CONTABIL",
                "BASE DE CALCULO",
                "AJUSTE .B.C",
                "B.C. AJUSTADA",
                "ALIQUOTA",
                "VALOR IMPOSTO",
            ],
            ["PIS", "40", "40", "40", "", "40", "0.0165", "4"],
            ["COFINS", "40", "40", "40", "", "40", "0.076", "8"],
            ["", "RESUMO APURAÇÃO"],
            [],
            ["", "IMPOSTO", "DEBITO", "CREDITO", "AJUSTE (ALUGUEL)", "IMPOSTO A RECOLHER"],
            [],
            ["", "PIS", "10", "4", "1", "5"],
            ["", "COFINS", "20", "8", "2", "10"],
        ],
    )


def _pis_saldo_credor() -> WorkbookGrid:
    return _g(
        "PIS COFINS",
        [
            ["", "DEBITO"],
            [
                "",
                "VALOR PRODUTO",
                "VALOR CONTABIL",
                "BASE DE CALCULO",
                "AJUSTE .B.C",
                "B.C. AJUSTADA",
                "ALIQUOTA",
                "VALOR IMPOSTO",
            ],
            ["PIS", "100", "100", "100", "", "100", "0.0165", "10"],
            ["COFINS", "100", "100", "100", "", "100", "0.076", "20"],
            ["", "CREDITO"],
            [
                "",
                "VALOR PRODUTO",
                "VALOR CONTABIL",
                "BASE DE CALCULO",
                "AJUSTE .B.C",
                "B.C. AJUSTADA",
                "ALIQUOTA",
                "VALOR IMPOSTO",
            ],
            ["PIS", "40", "40", "40", "", "40", "0.0165", "4"],
            ["COFINS", "40", "40", "40", "", "40", "0.076", "8"],
            ["", "RESUMO APURAÇÃO"],
            [],
            ["", "IMPOSTO", "DEBITO", "CREDITO", "SALDO CREDOR", "A RECOLHER"],
            [],
            ["", "PIS", "10", "4", "3", "3"],
            ["", "COFINS", "20", "8", "5", "7"],
        ],
    )


def _st_df() -> WorkbookGrid:
    return _g("ST", [[], [], ["", "UF", "VALOR"], ["", "DF", "12.5"], ["", "GO", "0"]])


def _part(result: dict, tipo: str) -> dict:
    return next(p for p in result["parts"] if p.get("tipo") == tipo)


def test_is_workbook_padrao_sem_movimento_com_tres_fiscais():
    sheets = [_dre_jan_only(), _bal_jan_only(), _icms_simples(), _pis_ajuste()]
    assert is_workbook_padrao(sheets)


def test_icms_5005_e_competencia_do_nome():
    sheets = [_dre_jan_only(), _bal_jan_only(), _icms_5005(), _pis_saldo_credor(), _st_df()]
    r08 = extract_workbook_padrao(sheets, "Planilha Padrao EMPRESA-NOVA 082026.xlsx")
    assert r08["tipo"] == "workbook_padrao"
    assert r08["competencia"] == "2026-08"
    assert r08["company_id"] is None

    ap = _part(r08, "apuracao_5005")
    assert ap["competencia"] == "2026-08"
    assert ap["meta"]["icmsARecolher"] == pytest.approx(450.0, abs=0.02)
    assert ap["pack_patch"]["apuracao"]["icms"]["aRecolher"] == pytest.approx(450.0, abs=0.02)
    assert "memoriaCalculo" in ap["pack_patch"]
    assert not any(p.get("tipo") == "icms" for p in r08["parts"])

    pis = _part(r08, "pis_cofins")
    resumo = pis["pack_patch"]["memoriaPisCofins"]["resumo"]
    assert pis["pack_patch"]["apuracao"]["pis"]["aRecolher"] == pytest.approx(3.0, abs=0.02)
    assert pis["pack_patch"]["apuracao"]["cofins"]["aRecolher"] == pytest.approx(7.0, abs=0.02)
    assert resumo["pis"]["saldoCredor"] == pytest.approx(3.0, abs=0.02)
    assert "ajuste" not in resumo["pis"]

    assert _part(r08, "dre")["status"] == "vazia"
    assert _part(r08, "balancete")["status"] == "vazia"
    assert _part(r08, "icms_st")["meta"]["aRecolher"] == pytest.approx(12.5, abs=0.02)

    r09 = extract_workbook_padrao(sheets, "Planilha Padrao EMPRESA-NOVA 092026.xlsx")
    assert r09["competencia"] == "2026-09"
    assert _part(r09, "apuracao_5005")["competencia"] == "2026-09"
    assert {p["tipo"] for p in r09["parts"] if p.get("pack_patch")} == {
        p["tipo"] for p in r08["parts"] if p.get("pack_patch")
    }


def test_icms_simples_e_pis_ajuste():
    sheets = [_dre_jan_only(), _bal_jan_only(), _icms_simples(), _pis_ajuste()]
    result = extract_workbook_padrao(sheets, "Modelo QUALQUER 032026.xlsx")
    assert result["tipo"] == "workbook_padrao"
    assert result["competencia"] == "2026-03"
    assert result["company_id"] is None
    assert not any(p.get("tipo") == "apuracao_5005" for p in result["parts"])

    icms = _part(result, "icms")
    tax = icms["pack_patch"]["apuracao"]["icms"]
    assert tax["apurado"] == pytest.approx(800.0, abs=0.02)
    assert tax["credito"] == pytest.approx(300.0, abs=0.02)
    assert tax["aRecolher"] == pytest.approx(500.0, abs=0.02)
    assert tax["fonte"] == "planilha_padrao_icms"
    assert "memoriaCalculo" not in icms["pack_patch"]

    pis = _part(result, "pis_cofins")
    resumo = pis["pack_patch"]["memoriaPisCofins"]["resumo"]
    assert pis["pack_patch"]["apuracao"]["pis"]["aRecolher"] == pytest.approx(5.0, abs=0.02)
    assert pis["pack_patch"]["apuracao"]["cofins"]["aRecolher"] == pytest.approx(10.0, abs=0.02)
    assert resumo["pis"]["ajuste"] == pytest.approx(1.0, abs=0.02)
    assert resumo["cofins"]["ajuste"] == pytest.approx(2.0, abs=0.02)
    assert "saldoCredor" not in resumo["pis"]
    assert "saldoCredor" not in resumo["cofins"]

    assert _part(result, "dre")["status"] == "vazia"
    assert _part(result, "balancete")["status"] == "vazia"


def test_empresa_do_dashboard_mesmo_fora_do_catalogo_estatico():
    """Empresa só no Postgres herda o dashboard aberto (não o nome do arquivo)."""
    extracted = {
        "company_id": None,
        "company_label": None,
        "file": "Planilha Padrao EMPRESA-NOVA 082026.xlsx",
        "warnings": [],
        "errors": [],
    }
    dest = SimpleNamespace(id="empresa-nova", label="Empresa Nova LTDA", cnpj="11222333000144")
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = dest

    _apply_session_company(extracted, "empresa-nova", db)

    assert extracted["company_id"] == "empresa-nova"
    assert extracted["company_label"] == "Empresa Nova LTDA"
    assert any("Empresa herdada do dashboard" in w for w in extracted["warnings"])
    assert not extracted.get("errors")
