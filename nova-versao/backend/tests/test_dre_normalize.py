from copy import deepcopy

import pytest

from app.extract.parse_dre import normalize_dre_deducoes
from app.routers.companies import _slice


def _marco_pack() -> dict:
    """Saldo EXITO de mar/2026 Baifer: ICMS positivo no export, totais inflados."""
    linhas = [
        {"descricao": "RECEITA BRUTA", "valor": 590886.49, "grupo": "receita"},
        {"descricao": "VENDA DE MERCADORIAS", "valor": 590886.49, "grupo": "receita"},
        {"descricao": "(-) DEDUÇÕES DA RECEITA BRUTA", "valor": 2953.19, "grupo": "total"},
        {"descricao": "(-) DEVOLUÇÃO DE VENDA DE MERCADORIAS", "valor": -7355.43, "grupo": "linha"},
        {"descricao": "(-) ICMS", "valor": 55821.04, "grupo": "linha"},
        {"descricao": "(-) COFINS", "valor": -37005.35, "grupo": "linha"},
        {"descricao": "(-) PIS", "valor": -8034.06, "grupo": "linha"},
        {"descricao": "(-) SUBSTITUIÇÃO TRIBUTÁRIA", "valor": -473.01, "grupo": "linha"},
        {"descricao": "= RECEITA LÍQUIDA", "valor": 593839.68, "grupo": "receita"},
        {"descricao": "(-) CMV", "valor": -454460.74, "grupo": "cmv"},
        {"descricao": "= LUCRO BRUTO", "valor": 139378.94, "grupo": "resultado"},
        {"descricao": "(-) DESPESAS OPERACIONAIS", "valor": -22059.42, "grupo": "despesas"},
        {"descricao": "(-) OUTRAS RECEITAS OPERACIONAIS", "valor": 24108.17, "grupo": "linha"},
        {"descricao": "= LUCRO OU PREJUÍZO LÍQUIDO DO EXERCÍCIO", "valor": 140203.67, "grupo": "resultado"},
    ]
    return {
        "hasDre": True,
        "receitaBruta": 590886.49,
        "cmv": -454460.74,
        "lucBruto": 139378.94,
        "lucLiq": 140203.67,
        "margMb": 23.59,
        "margMl": 23.73,
        "dre": {
            "kind": "exito",
            "linhas": linhas,
            "receitaBruta": 590886.49,
            "receitaLiquida": 593839.68,
            "cmv": -454460.74,
            "lucBruto": 139378.94,
            "lucLiq": 140203.67,
            "hasValores": True,
        },
    }


def test_normalize_flips_icms_and_recalc_lucro_bruto():
    dre = normalize_dre_deducoes(deepcopy(_marco_pack()["dre"]))
    icms = next(ln for ln in dre["linhas"] if ln["descricao"] == "(-) ICMS")
    outras = next(ln for ln in dre["linhas"] if "OUTRAS RECEITAS" in ln["descricao"])
    assert icms["valor"] == pytest.approx(-55821.04, abs=0.02)
    assert outras["valor"] == pytest.approx(24108.17, abs=0.02)
    assert dre["receitaLiquida"] == pytest.approx(482197.60, abs=0.02)
    assert dre["lucBruto"] == pytest.approx(27736.86, abs=0.02)
    assert dre["lucLiq"] == pytest.approx(28561.59, abs=0.02)
    assert dre["lucBruto"] == pytest.approx(28_000, abs=1_000)


def test_slice_dre_normalizes_already_imported_pack():
    sliced = _slice("dre", _marco_pack())
    assert sliced["lucBruto"] == pytest.approx(27736.86, abs=0.02)
    assert sliced["lucLiq"] == pytest.approx(28561.59, abs=0.02)
    dre = sliced["dre"]
    assert dre["receitaLiquida"] == pytest.approx(482197.60, abs=0.02)
    icms = next(ln for ln in dre["linhas"] if ln["descricao"] == "(-) ICMS")
    assert icms["valor"] == pytest.approx(-55821.04, abs=0.02)


def test_normalize_does_not_change_already_negative_deductions():
    dre = {
        "kind": "exito",
        "receitaBruta": 480047.45,
        "receitaLiquida": 365527.25,
        "cmv": -369258.29,
        "lucBruto": -3731.04,
        "lucLiq": 6338.51,
        "linhas": [
            {"descricao": "RECEITA BRUTA", "valor": 480047.45},
            {"descricao": "(-) DEDUÇÕES DA RECEITA BRUTA", "valor": -114520.20},
            {"descricao": "(-) ICMS", "valor": -53411.97},
            {"descricao": "(-) COFINS", "valor": -30254.08},
            {"descricao": "(-) PIS", "valor": -6568.32},
            {"descricao": "(-) DEVOLUÇÃO DE VENDA DE MERCADORIAS", "valor": -23811.21},
            {"descricao": "(-) SUBSTITUIÇÃO TRIBUTÁRIA", "valor": -474.62},
            {"descricao": "= RECEITA LÍQUIDA", "valor": 365527.25},
            {"descricao": "(-) CMV", "valor": -369258.29},
            {"descricao": "= LUCRO BRUTO", "valor": -3731.04},
        ],
    }
    out = normalize_dre_deducoes(deepcopy(dre))
    assert out["receitaLiquida"] == pytest.approx(365527.25, abs=0.02)
    assert out["lucBruto"] == pytest.approx(-3731.04, abs=0.02)
    icms = next(ln for ln in out["linhas"] if ln["descricao"] == "(-) ICMS")
    assert icms["valor"] == pytest.approx(-53411.97, abs=0.02)
