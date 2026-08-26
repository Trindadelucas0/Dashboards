from pathlib import Path

import pytest

from app.extract.pipeline import classify_and_extract
from app.routers.companies import _is_empty, _slice
from app.routers.imports import _deep_merge

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "egaplast-padrao"
ENT = FIXTURES / "Entradas.xls"
SAI = FIXTURES / "Saídas.xls"
IPI = next(FIXTURES.glob("Demonst. IPI*.xls"), None)
PIS = FIXTURES / "Demonstrativo de Apuração - PIS.xls"
EFD = FIXTURES / "Demonstrativo EFD PIS e COFINS.xls"
ST = FIXTURES / "ST MENSAL.xlsx"


@pytest.mark.skipif(not ENT.exists() or not SAI.exists(), reason="Fixture egaplast-padrao ausente")
def test_egaplast_movimento_fills_tabs():
    pack: dict = {}
    for path in (ENT, SAI):
        result = classify_and_extract(path)
        assert not result["errors"], f"{path.name}: {result['errors']}"
        assert result["company_id"] == "egaplast"
        assert result["competencia"] == "2026-01"
        assert result["pack_patch"]
        pack = _deep_merge(pack, result["pack_patch"])

    assert abs(pack["entradasMeta"]["delta"]) < 0.02
    assert abs(pack["saidasMeta"]["delta"]) < 0.02
    assert pack["totalCompras"] == pytest.approx(1934726.72)
    assert pack["cfopSaidasTotal"] == pytest.approx(1218557.72)

    class Row:
        pass

    row = Row()
    assert _is_empty("compras", pack, row) is False
    compras = _slice("compras", pack)
    vendas = _slice("vendas", pack)
    visao = _slice("visao-geral", pack)
    assert compras["totalCompras"] == pack["totalCompras"]
    assert len(compras["fornecedores"]) > 0
    assert vendas["cfopSaidasTotal"] == pack["cfopSaidasTotal"]
    assert len(vendas["clientes"]) > 0
    assert visao["receitaBruta"] == pack["cfopSaidasTotal"]


@pytest.mark.skipif(
    not all(p and Path(p).exists() for p in (IPI, PIS, EFD, ST)),
    reason="Demonstrativos egaplast-padrao ausentes",
)
def test_egaplast_demonstrativos_fill_apuracao():
    pack: dict = {}
    expected = {
        "ipi": (IPI, "ipi", 2576.84),
        "pis": (PIS, "pis", 6448.85),
        "cofins": (EFD, "cofins", 29763.91),
        "icms_st": (ST, "icms_st", 76042.37),
    }
    for _key, (path, tipo, valor) in expected.items():
        result = classify_and_extract(path)
        assert result["tipo"] == tipo, f"{path.name} -> {result['tipo']} errors={result.get('errors')}"
        assert not result["errors"], f"{path.name}: {result['errors']}"
        assert result["pack_patch"]
        if tipo != "icms_st":
            assert result["company_id"] == "egaplast"
            assert result["competencia"] == "2026-01"
        pack = _deep_merge(pack, result["pack_patch"])
        meta_val = (result.get("meta") or {}).get("aRecolher")
        assert meta_val == pytest.approx(valor, abs=0.02)

    ap = pack["apuracao"]
    assert ap["ipi"]["aRecolher"] == pytest.approx(2576.84, abs=0.02)
    assert ap["pis"]["aRecolher"] == pytest.approx(6448.85, abs=0.02)
    assert ap["cofins"]["aRecolher"] == pytest.approx(29763.91, abs=0.02)
    assert ap["icmsSt"]["aRecolher"] == pytest.approx(76042.37, abs=0.02)

    impostos = _slice("impostos", {**pack, "hasMovimentacao": True, "cfopSaidasTotal": 1})
    labels = {c["label"] for c in impostos["composicao"]}
    assert {"IPI", "PIS", "COFINS", "ICMS ST"} <= labels
    assert impostos["deducoes"] == pytest.approx(2576.84 + 6448.85 + 29763.91 + 76042.37, abs=0.05)


@pytest.mark.skipif(not FIXTURES.exists(), reason="Fixture egaplast-padrao ausente")
def test_companies_catalog_includes_egaplast_and_baifer():
    from app.companies import COMPANIES, KEEP_COMPANY_IDS, KEEP_USERNAMES

    ids = {c.id for c in COMPANIES}
    assert ids >= {"egaplast", "baifer", "loja-maquinas"}
    assert KEEP_COMPANY_IDS >= frozenset({"egaplast", "baifer", "loja-maquinas"})
    assert "loja-maquinas" in KEEP_USERNAMES
