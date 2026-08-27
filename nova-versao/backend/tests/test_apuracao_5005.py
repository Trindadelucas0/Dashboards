"""Calibração padrão — planilha APURAÇÃO 5005 (Memória ICMS / Baifer)."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from app.extract.classify import detect_sheet_tipo
from app.extract.parse_memoria_5005 import apuracao_patch_from_5005, parse_apuracao_5005
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import WorkbookGrid
from app.routers.companies import _is_empty, _slice

# Mesmo padrão dos outros testes Baifer: fixtures em nova-versao/fixtures/
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "baifer-padrao"
FIXTURE_5005 = FIXTURES / "012026-apuracao-5005.xlsx"
DOWNLOADS = Path(r"C:\Users\trind\Downloads\drive-download-20260826T154551Z-1-001")

# Golden jan/2026 (planilha oficial Baifer)
JAN_GOLDEN = {
    "debitoOriginal": 85763.18,
    "creditoOriginal": 38536.92,
    "totalOriginal": 124300.10,
    "debitos5005": 56756.77,
    "creditos5005": 54601.50,
    "total5005": 2155.27,
    "debitoFora": 168.16,
    "creditoFora": 3970.56,
    "creditoOutorgado": 254.15,
    "totalFora": -4056.55,
    "icmsARecolher": -1901.28,
    "ganhoReceitaSubvencao": 45070.99,
}

# ICMS a recolher por mês (fonte 5005) — Downloads opcional
MONTH_ICMS = {
    "2026-01": -1901.28,
    "2026-02": 28441.58,
    "2026-03": 17592.90,
    "2026-04": 21349.29,
    "2026-05": 13105.44,
    "2026-06": 14834.69,
    "2026-07": 17806.44,
}


def test_detect_apuracao_5005_by_filename():
    grid = WorkbookGrid("x.xlsx", "Planilha1", [["DÉBITO ORIGINAL", "1"]], "xlsx")
    assert detect_sheet_tipo(grid, "012026 APURAÇÃO 5005.xlsx") == "apuracao_5005"
    assert detect_sheet_tipo(grid, "072026-apuracao-5005.xlsx") == "apuracao_5005"


def test_detect_apuracao_5005_by_labels_without_5005_in_name():
    grid = WorkbookGrid(
        "mem.xlsx",
        "Planilha1",
        [
            ["DÉBITO ORIGINAL", 1],
            ["CREDITO ORIGINAL", 2],
            ["DEBITOS 5005", 3],
            ["ICMS A RECOLHER", 4],
        ],
        "xlsx",
    )
    assert detect_sheet_tipo(grid, "memoria.xlsx") == "apuracao_5005"


def test_parse_apuracao_5005_labels():
    grid = WorkbookGrid(
        "f.xlsx",
        "Planilha1",
        [
            ["DÉBITO ORIGINAL", 85763.18],
            ["CREDITO ORIGINAL", 38536.92],
            ["TOTAL", 124300.10],
            ["", ""],
            ["DEBITOS 5005", 56756.77],
            ["CREDITOS 5005", 54601.50],
            ["TOTAL", 2155.27],
            ["", ""],
            ["DÉBITO FORA", 168.16],
            ["CREDITO FORA", 3970.56],
            ["CREDITO  OUTORGADO", 254.15],
            ["TOTAL", -4056.55],
            ["", ""],
            ["ICMS A RECOLHER", -1901.28],
            ["", ""],
            ["GANHO RECEITA DE SUBVENÇÃO", 45070.99],
        ],
        "xlsx",
    )
    parsed = parse_apuracao_5005(grid, "012026 APURAÇÃO 5005.xlsx")
    for key, expected in JAN_GOLDEN.items():
        assert parsed[key] == pytest.approx(expected, abs=0.02), key
    assert parsed["competencia"] == "2026-01"
    patch = apuracao_patch_from_5005(parsed)
    assert patch["memoriaCalculo"]["icmsARecolher"] == pytest.approx(-1901.28, abs=0.02)
    assert patch["apuracao"]["icms"]["aRecolher"] == pytest.approx(-1901.28, abs=0.02)
    assert patch["apuracao"]["subvencao"] == pytest.approx(45070.99, abs=0.02)


def test_parse_total_original_zero_fallback():
    """Planilha mar/2026 veio com TOTAL original = 0 — recalcula débito+crédito."""
    grid = WorkbookGrid(
        "f.xlsx",
        "Planilha1",
        [
            ["DÉBITO ORIGINAL", 104631.90],
            ["CREDITO ORIGINAL", 29510.55],
            ["TOTAL", 0],
            ["DEBITOS 5005", 1],
            ["CREDITOS 5005", 1],
            ["TOTAL", 0],
            ["DÉBITO FORA", 0],
            ["CREDITO FORA", 0],
            ["CREDITO  OUTORGADO", 0],
            ["TOTAL", 0],
            ["ICMS A RECOLHER", 17592.90],
        ],
        "xlsx",
    )
    parsed = parse_apuracao_5005(grid, "032026 APURAÇÃO 5005.xlsx")
    assert parsed["totalOriginal"] == pytest.approx(134142.45, abs=0.02)


@pytest.mark.skipif(not FIXTURE_5005.exists(), reason="Fixture baifer-padrao 5005 ausente")
def test_baifer_5005_fixture_jan():
    result = classify_and_extract(FIXTURE_5005)
    assert result["tipo"] == "apuracao_5005"
    assert result["competencia"] == "2026-01"
    assert not result.get("errors"), result.get("errors")
    mem = (result.get("pack_patch") or {}).get("memoriaCalculo") or {}
    for key, expected in JAN_GOLDEN.items():
        assert float(mem.get(key) or 0) == pytest.approx(expected, abs=0.02), key
    icms = ((result.get("pack_patch") or {}).get("apuracao") or {}).get("icms") or {}
    assert icms.get("aRecolher") == pytest.approx(-1901.28, abs=0.02)
    assert icms.get("fonte") == "apuracao_5005"


@pytest.mark.skipif(not FIXTURE_5005.exists(), reason="Fixture baifer-padrao 5005 ausente")
def test_baifer_5005_fills_memoria_and_impostos_tabs():
    result = classify_and_extract(FIXTURE_5005)
    pack = result["pack_patch"] or {}
    row = type("Row", (), {"pack": pack})()
    assert _is_empty("memoria", pack, row) is False
    assert _is_empty("impostos", pack, row) is False
    mem = _slice("memoria", pack)
    assert mem["memoriaCalculo"]["icmsARecolher"] == pytest.approx(-1901.28, abs=0.02)
    imp = _slice("impostos", pack)
    assert imp["apuracao"]["icms"]["aRecolher"] == pytest.approx(-1901.28, abs=0.02)
    assert float(imp["apuracao"].get("subvencao") or 0) == pytest.approx(45070.99, abs=0.02)


@pytest.mark.skipif(not FIXTURE_5005.exists(), reason="Fixture baifer-padrao 5005 ausente")
def test_import_tempfile_uses_original_filename_for_competencia():
    """Preview grava em tempfile; competência deve vir do nome original (MMYYYY)."""
    data = FIXTURE_5005.read_bytes()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        # Com original_filename (como routers/imports.py no preview) → competência OK
        r = classify_and_extract(tmp_path, data, original_filename="012026 APURAÇÃO 5005.xlsx")
        assert r["tipo"] == "apuracao_5005"
        assert r["competencia"] == "2026-01"
        assert not r.get("errors"), r.get("errors")
        mem = (r.get("pack_patch") or {}).get("memoriaCalculo") or {}
        assert mem.get("icmsARecolher") == pytest.approx(-1901.28, abs=0.02)
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@pytest.mark.skipif(not DOWNLOADS.is_dir(), reason="Pasta Downloads Baifer 5005 ausente")
def test_baifer_5005_downloads_jan_jul_icms():
    for month, expected in MONTH_ICMS.items():
        yyyy, mm = month.split("-")
        folder = DOWNLOADS / f"{mm}-{yyyy}"
        files = list(folder.glob("*5005*")) if folder.is_dir() else []
        assert files, f"faltando 5005 em {folder}"
        r = classify_and_extract(files[0])
        assert r["tipo"] == "apuracao_5005"
        assert r["competencia"] == month
        assert not r.get("errors"), r.get("errors")
        mem = (r.get("pack_patch") or {}).get("memoriaCalculo") or {}
        assert float(mem.get("icmsARecolher") or 0) == pytest.approx(expected, abs=0.02), month
