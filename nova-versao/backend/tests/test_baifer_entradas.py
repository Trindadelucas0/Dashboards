from pathlib import Path

import pytest

from app.extract.pipeline import classify_and_extract
from app.routers.companies import _slice

DOWNLOADS = Path(r"c:\Users\trind\Downloads\drive-download-20260825T225251Z-1-001")
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "baifer-padrao"
FIXTURE_ENT = FIXTURES / "Entradas 01-2026.xls"
FIXTURE_FORN = FIXTURES / "Relatorio de entrada por fornecedor 08-2026.xls"

EXPECTED = {
    "2026-01": {"total": 606046.53, "nfs": 209},
    "2026-02": {"total": 214452.03, "nfs": 119},
    "2026-03": {"total": 511638.88, "nfs": 207},
    "2026-04": {"total": 430266.41, "nfs": 189},
    "2026-05": {"total": 360186.94, "nfs": 143},
    "2026-06": {"total": 652075.55, "nfs": 208},
    "2026-07": {"total": 608942.57, "nfs": 233},
}


def _entradas_files(folder: Path) -> list[Path]:
    return sorted(folder.glob("Entradas *.xls"))


@pytest.mark.skipif(not FIXTURE_ENT.exists(), reason="Fixture baifer-padrao ausente")
def test_baifer_entradas_fixture_jan():
    result = classify_and_extract(FIXTURE_ENT)
    assert result["tipo"] == "entradas"
    assert not result["errors"], result["errors"]
    assert result["company_id"] == "baifer"
    assert result["competencia"] == "2026-01"
    assert abs(result["meta"]["delta"]) < 0.02
    assert result["pack_patch"]["totalCompras"] == pytest.approx(606046.53, abs=0.02)


@pytest.mark.skipif(not FIXTURE_ENT.exists(), reason="Fixture baifer-padrao ausente")
def test_baifer_entradas_fixture_fills_compras_tab():
    result = classify_and_extract(FIXTURE_ENT)
    pack = result["pack_patch"] or {}
    pack["hasMovimentacao"] = True
    compras = _slice("compras", pack)
    assert compras["totalCompras"] == pytest.approx(606046.53, abs=0.02)
    assert len(compras["fornecedores"]) > 0
    assert len(compras["ufEntradas"]) > 0


@pytest.mark.skipif(not FIXTURE_FORN.exists(), reason="Fixture relatório por fornecedor ausente")
def test_baifer_entrada_por_fornecedor_ago():
    result = classify_and_extract(FIXTURE_FORN)
    assert result["tipo"] == "entradas"
    assert not result["errors"], result["errors"]
    assert result["company_id"] == "baifer"
    assert result["competencia"] == "2026-08"
    assert abs(result["meta"]["delta"]) < 0.02
    assert result["meta"]["nfs"] == 211
    assert result["pack_patch"]["totalCompras"] == pytest.approx(377506.76, abs=0.02)


@pytest.mark.skipif(not FIXTURE_FORN.exists(), reason="Fixture relatório por fornecedor ausente")
def test_baifer_entrada_por_fornecedor_fills_compras_tab():
    result = classify_and_extract(FIXTURE_FORN)
    pack = result["pack_patch"] or {}
    pack["hasMovimentacao"] = True
    compras = _slice("compras", pack)
    assert compras["totalCompras"] == pytest.approx(377506.76, abs=0.02)
    assert len(compras["fornecedores"]) > 0
    assert len(compras["ufEntradas"]) > 0
    assert compras["fornecedores"][0]["nome"]


@pytest.mark.skipif(not DOWNLOADS.exists(), reason="Pasta Downloads ausente")
@pytest.mark.parametrize(
    "competencia,total,nfs",
    [(k, v["total"], v["nfs"]) for k, v in EXPECTED.items()],
)
def test_baifer_entradas_downloads_golden(competencia: str, total: float, nfs: int):
    month = competencia.split("-")[1]
    year = competencia.split("-")[0]
    hits = list(DOWNLOADS.glob(f"Entradas {month}-{year}.xls"))
    assert hits, f"Entradas {month}-{year}.xls não encontrado"
    result = classify_and_extract(hits[0])
    assert result["tipo"] == "entradas"
    assert not result["errors"], result["errors"]
    assert result["company_id"] == "baifer"
    assert result["competencia"] == competencia
    assert abs(result["meta"]["delta"]) < 0.02
    assert result["meta"]["nfs"] == nfs
    assert result["pack_patch"]["totalCompras"] == pytest.approx(total, abs=0.02)
