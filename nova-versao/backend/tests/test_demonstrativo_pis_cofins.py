from pathlib import Path

import pytest

from app.extract.classify import detect_sheet_tipo
from app.extract.parse_impostos import (
    apuracao_patch_from_demo,
    parse_demonstrativo_pis_cofins,
)
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import WorkbookGrid
from app.routers.companies import _slice
from app.routers.imports import _deep_merge

DOWNLOADS = Path(r"c:\Users\trind\Downloads\drive-download-20260825T225251Z-1-001")
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "egaplast-padrao"
PIS_FIX = FIXTURES / "Demonstrativo de Apuração - PIS.xls"
EFD_FIX = FIXTURES / "Demonstrativo EFD PIS e COFINS.xls"


def _pis_grid() -> WorkbookGrid:
    return WorkbookGrid(
        "Apuração pis e cofins 012026.xls",
        "Demonstrativo de Apuração - PIS",
        [
            ["Empresa:", "BAIFER DISTRIBUIDORA DE FERRAMENTAS LTDA"],
            ["CNPJ:", "52005382000140"],
            ["Competência:", "01/01/2026"],
            ["DEMONSTRATIVO DA APURAÇÃO DO PIS"],
            ["APURAÇÃO DO PIS NÃO CUMULATIVO", "Valor"],
            ["Valor Total da Contribuição Não Cumulativa Apurada no Período", "6568.32"],
            ["Valor da Contribuição Não Cumulativa a Recolher", "0"],
            ["Total do Crédito para o Período Seguinte", "18080.71"],
            ["Saldo devedor da Contribuição PIS/PASEP", "0"],
        ],
        "html",
    )


def _cofins_grid() -> WorkbookGrid:
    return WorkbookGrid(
        "Apuração pis e cofins 012026.xls",
        "Demonstrativo de Apuração - COF",
        [
            ["Empresa:", "BAIFER DISTRIBUIDORA DE FERRAMENTAS LTDA"],
            ["CNPJ:", "52005382000140"],
            ["Competência:", "01/01/2026"],
            ["DEMONSTRATIVO DA APURAÇÃO DO COFINS"],
            ["APURAÇÃO DO COFINS NÃO CUMULATIVO", "Valor"],
            ["Valor Total da Contribuição Não Cumulativa Apurada no Período", "30254.08"],
            ["Valor da Contribuição Não Cumulativa a Recolher", "0"],
            ["Total do Crédito para o Período Seguinte", "83280.93"],
            ["Saldo devedor da Contribuição COFINS", "0"],
        ],
        "html",
    )


def test_detect_pis_cofins_combined_filename():
    assert detect_sheet_tipo(_pis_grid(), "Apuração pis e cofins 012026.xls") == "pis"
    assert detect_sheet_tipo(_cofins_grid(), "Apuração pis e cofins 012026.xls") == "cofins"


def test_parse_apuracao_pis_jan():
    parsed = parse_demonstrativo_pis_cofins(_pis_grid(), "pis")
    assert parsed["kind"] == "demonstrativo_apuracao_pis"
    assert parsed["apurado"] == pytest.approx(6568.32)
    assert parsed["aRecolher"] == pytest.approx(0)
    assert parsed["credito"] == pytest.approx(18080.71)


def test_parse_apuracao_cofins_jan():
    parsed = parse_demonstrativo_pis_cofins(_cofins_grid(), "cofins")
    assert parsed["apurado"] == pytest.approx(30254.08)
    assert parsed["aRecolher"] == pytest.approx(0)
    assert parsed["credito"] == pytest.approx(83280.93)


def test_merge_pis_cofins_pack():
    pack = _deep_merge(
        apuracao_patch_from_demo("pis", parse_demonstrativo_pis_cofins(_pis_grid(), "pis")),
        apuracao_patch_from_demo("cofins", parse_demonstrativo_pis_cofins(_cofins_grid(), "cofins")),
    )
    ap = pack["apuracao"]
    assert ap["pis"]["apurado"] == pytest.approx(6568.32)
    assert ap["cofins"]["apurado"] == pytest.approx(30254.08)
    assert ap["pis"]["aRecolher"] == pytest.approx(0)
    impostos = _slice("impostos", {**pack, "hasMovimentacao": True, "cfopSaidasTotal": 1})
    labels = {c["label"] for c in impostos["composicao"]}
    assert "PIS" not in labels and "COFINS" not in labels


def _write_html_workbook(tmp_path: Path, sheets: list[tuple[str, WorkbookGrid]]) -> Path:
    parts = []
    for title, grid in sheets:
        rows_html = []
        for row in grid.rows:
            cells = "".join(f"<td>{c}</td>" for c in row)
            rows_html.append(f"<tr>{cells}</tr>")
        parts.append(f"<h2>{title}</h2><table>{''.join(rows_html)}</table>")
    html = "<html><body>" + "".join(parts) + "</body></html>"
    path = tmp_path / "Apuracao pis e cofins 012026.xls"
    path.write_bytes(html.encode("latin-1", errors="replace"))
    return path


def test_import_single_pis_sheet_html(tmp_path):
    path = _write_html_workbook(tmp_path, [("PIS", _pis_grid())])
    result = classify_and_extract(path)
    assert result["tipo"] == "pis"
    assert result["pack_patch"]["apuracao"]["pis"]["apurado"] == pytest.approx(6568.32)
    assert result["competencia"] == "2026-01"


@pytest.mark.skipif(not DOWNLOADS.exists(), reason="Pasta Downloads ausente")
def test_real_combined_workbook_jan():
    hits = sorted(DOWNLOADS.glob("*pis*cofins*012026.xls"))
    assert hits
    result = classify_and_extract(hits[0])
    assert result["tipo"] == "pis_cofins", result
    ap = result["pack_patch"]["apuracao"]
    assert ap["pis"]["apurado"] == pytest.approx(6568.32, abs=0.02)
    assert ap["cofins"]["apurado"] == pytest.approx(30254.08, abs=0.02)
    assert ap["pis"]["aRecolher"] == pytest.approx(0, abs=0.02)
    assert ap["cofins"]["aRecolher"] == pytest.approx(0, abs=0.02)
    assert result["meta"]["pis"]["credito"] == pytest.approx(18080.71, abs=0.02)


@pytest.mark.skipif(not PIS_FIX.exists() or not EFD_FIX.exists(), reason="Fixture egaplast ausente")
def test_egaplast_pis_cofins_layout_nao_regride():
    pis = classify_and_extract(PIS_FIX)
    cof = classify_and_extract(EFD_FIX)
    assert pis["tipo"] == "pis"
    assert cof["tipo"] == "cofins"
    assert not pis["errors"]
    assert not cof["errors"]
    assert pis["meta"]["aRecolher"] == pytest.approx(6448.85, abs=0.02)
    assert cof["meta"]["aRecolher"] == pytest.approx(29763.91, abs=0.02)
