from pathlib import Path

import pytest

from app.extract.pipeline import classify_and_extract
from app.routers.companies import _slice

DOWNLOADS = Path(r"c:\Users\trind\Downloads\drive-download-20260825T225251Z-1-001")
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "baifer-padrao"

EXPECTED = {
    "2026-01": {"total": 515051.89, "nfs": 378},
    "2026-02": {"total": 479928.01, "nfs": 335},
    "2026-03": {"total": 603306.81, "nfs": 489},
    "2026-04": {"total": 562728.17, "nfs": 458},
    "2026-05": {"total": 430254.72, "nfs": 421},
    "2026-06": {"total": 659485.00, "nfs": 422},
    "2026-07": {"total": 702124.58, "nfs": 498},
}


def _saidas_jan() -> Path | None:
    hits = list(FIXTURES.glob("Saídas 01-2026.xls"))
    return hits[0] if hits else None


FIXTURE_SAI = _saidas_jan()


@pytest.mark.skipif(FIXTURE_SAI is None, reason="Fixture baifer-padrao Saídas ausente")
def test_baifer_saidas_fixture_jan():
    result = classify_and_extract(FIXTURE_SAI)
    assert result["tipo"] == "saidas"
    assert not result["errors"], result["errors"]
    assert result["company_id"] == "baifer"
    assert result["cnpj"] == "52005382000140"
    assert result["competencia"] == "2026-01"
    assert abs(result["meta"]["delta"]) < 0.02
    assert result["pack_patch"]["cfopSaidasTotal"] == pytest.approx(515051.89, abs=0.02)
    assert result["pack_patch"]["receitaBruta"] == pytest.approx(515051.89, abs=0.02)


@pytest.mark.skipif(FIXTURE_SAI is None, reason="Fixture baifer-padrao Saídas ausente")
def test_baifer_saidas_fixture_fills_vendas_tab():
    result = classify_and_extract(FIXTURE_SAI)
    pack = result["pack_patch"] or {}
    pack["hasMovimentacao"] = True
    vendas = _slice("vendas", pack)
    assert vendas["cfopSaidasTotal"] == pytest.approx(515051.89, abs=0.02)
    assert vendas["nfsSaidas"] == 378
    assert len(vendas["clientes"]) > 0
    assert len(vendas["ufSaidas"]) > 0
    assert len(vendas["cfopSaidas"]) > 0
    soma_cfop = sum(float(c.get("total") or 0) for c in vendas["cfopSaidas"])
    assert soma_cfop == pytest.approx(515051.89, abs=0.02)


@pytest.mark.skipif(not DOWNLOADS.exists(), reason="Pasta Downloads ausente")
@pytest.mark.parametrize(
    "competencia,total,nfs",
    [(k, v["total"], v["nfs"]) for k, v in EXPECTED.items()],
)
def test_baifer_saidas_downloads_golden(competencia: str, total: float, nfs: int):
    month = competencia.split("-")[1]
    year = competencia.split("-")[0]
    hits = list(DOWNLOADS.glob(f"Saídas {month}-{year}.xls"))
    assert hits, f"Saídas {month}-{year}.xls não encontrado"
    result = classify_and_extract(hits[0])
    assert result["tipo"] == "saidas"
    assert not result["errors"], result["errors"]
    assert result["company_id"] == "baifer"
    assert result["competencia"] == competencia
    assert abs(result["meta"]["delta"]) < 0.02
    assert result["meta"]["nfs"] == nfs
    assert result["pack_patch"]["cfopSaidasTotal"] == pytest.approx(total, abs=0.02)
    assert result["pack_patch"]["receitaBruta"] == pytest.approx(total, abs=0.02)
