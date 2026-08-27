from pathlib import Path

import pytest

from app.extract.classify import detect_sheet_tipo
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import WorkbookGrid
from app.routers.imports import _deep_merge

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "baifer-padrao"
ST_JAN = FIXTURES / "Apuração icms st 012026.xls"
DOWNLOADS = Path(r"C:\Users\trind\Downloads\drive-download-20260826T180812Z-1-001")

GOLDEN = {
    "2026-01": 474.62,
    "2026-02": 276.53,
    "2026-03": 473.01,
    "2026-04": 264.83,
    "2026-05": 461.13,
    "2026-06": 100.92,
    "2026-07": 81.99,
}


def test_detect_subtri_before_icms():
    grid = WorkbookGrid(
        "Apuração icms st 012026.xls",
        "Demonst. SUBTRI 01-2026 DF (M)",
        [["BAIFER"], ["DEMONSTRATIVO DA SUBSTITUIÇÃO TRIBUTÁRIA UF FAVORECIDA DF"]],
        "html",
    )
    assert detect_sheet_tipo(grid, "Apuração icms st 012026.xls") == "icms_st"
    assert detect_sheet_tipo(grid, "qualquer.xls") == "icms_st"


@pytest.mark.skipif(not ST_JAN.exists(), reason="Fixture Baifer ST jan/2026 ausente")
def test_baifer_icms_st_jan_fixture():
    result = classify_and_extract(ST_JAN)
    assert result["tipo"] == "icms_st"
    assert not result["errors"]
    assert result["company_id"] == "baifer"
    assert result["competencia"] == "2026-01"
    assert (result.get("meta") or {}).get("aRecolher") == pytest.approx(474.62, abs=0.02)
    ap = (result.get("pack_patch") or {}).get("apuracao") or {}
    assert ap["icmsSt"]["aRecolher"] == pytest.approx(474.62, abs=0.02)
    por = (result.get("pack_patch") or {}).get("porUfSt") or {}
    assert por.get("DF") == pytest.approx(474.62, abs=0.02)


@pytest.mark.skipif(not ST_JAN.exists(), reason="Fixture Baifer ST jan/2026 ausente")
def test_baifer_icms_st_merge_preserves_icms():
    result = classify_and_extract(ST_JAN)
    base = {
        "apuracao": {
            "icms": {"aRecolher": -1901.16, "apurado": 85763.18, "pctRb": 0},
            "pis": {"aRecolher": 0, "apurado": 6568.32, "pctRb": 0},
        }
    }
    merged = _deep_merge(base, result.get("pack_patch") or {})
    assert merged["apuracao"]["icms"]["aRecolher"] == pytest.approx(-1901.16, abs=0.02)
    assert merged["apuracao"]["pis"]["aRecolher"] == pytest.approx(0, abs=0.02)
    assert merged["apuracao"]["icmsSt"]["aRecolher"] == pytest.approx(474.62, abs=0.02)


@pytest.mark.skipif(not DOWNLOADS.exists(), reason="Pasta Downloads Baifer ST ausente")
def test_baifer_icms_st_jan_jul_downloads():
    for mm, expected in GOLDEN.items():
        month_dir = DOWNLOADS / f"{mm[5:]}-{mm[:4]}"
        paths = [p for p in month_dir.iterdir() if "icms st" in p.name.lower()]
        assert paths, f"sem ST em {month_dir}"
        result = classify_and_extract(paths[0])
        assert result["tipo"] == "icms_st", paths[0].name
        assert not result["errors"], result["errors"]
        assert result["company_id"] == "baifer"
        assert result["competencia"] == mm
        assert (result.get("meta") or {}).get("aRecolher") == pytest.approx(expected, abs=0.02)
        if mm == "2026-04":
            por = (result.get("pack_patch") or {}).get("porUfSt") or {}
            assert por.get("DF") == pytest.approx(263.01, abs=0.02)
            assert por.get("GO") == pytest.approx(1.82, abs=0.02)
