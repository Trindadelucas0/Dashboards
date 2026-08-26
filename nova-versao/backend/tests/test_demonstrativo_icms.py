from pathlib import Path

import pytest

from app.extract.classify import detect_sheet_tipo
from app.extract.parse_impostos import (
    apuracao_patch_from_demo,
    composicao_from_apuracao,
    parse_demonstrativo_icms,
)
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import WorkbookGrid
from app.routers.companies import _slice

DOWNLOADS = Path(r"c:\Users\trind\Downloads\drive-download-20260825T225251Z-1-001")


def _grid_recolher() -> WorkbookGrid:
    return WorkbookGrid(
        "Apuração icms 062026.xls",
        "Demonst. ICMS 06-2026 (M)",
        [
            ["EGAPLAST ARTEFATOS DE PLASTICOS LTDA"],
            ["CNPJ:", "03.185.564/0001-34"],
            ["Competência:", "01/06/2026"],
            ["DEMONSTRATIVO DO ICMS"],
            ["DÉBITOS"],
            ["Descrição", "Valor"],
            ["Débitos pelas saídas", "111531.23"],
            ["Estorno de débitos pelas saídas do Regime Especial - Lei nº 5.005/2012", "111468.05"],
            ["Total de débitos", "161996.94"],
            ["CRÉDITOS"],
            ["Créditos pelas entradas", "34769.17"],
            ["Total de créditos", "147162.25"],
            ["APURAÇÃO"],
            ["Descrição", "Valor"],
            ["Saldo credor do período anterior", "0"],
            ["Total de débitos", "161996.94"],
            ["Total de créditos", "147162.25"],
            ["ICMS a recolher", "14834.69"],
            ["Saldo credor de ICMS para o mês seguinte", "0"],
        ],
        "html",
    )


def _grid_credor() -> WorkbookGrid:
    return WorkbookGrid(
        "Apuração icms 012026.xls",
        "Demonst. ICMS 01-2026 (M)",
        [
            ["EGAPLAST ARTEFATOS DE PLASTICOS LTDA"],
            ["CNPJ:", "03.185.564/0001-34"],
            ["Competência:", "01/01/2026"],
            ["DEMONSTRATIVO DO ICMS"],
            ["DÉBITOS"],
            ["Débitos pelas saídas", "85763.18"],
            ["Total de débitos", "122484.93"],
            ["CRÉDITOS"],
            ["Total de créditos", "124386.09"],
            ["APURAÇÃO"],
            ["Saldo credor do período anterior", "0"],
            ["Total de débitos", "122484.93"],
            ["Total de créditos", "124386.09"],
            ["ICMS a recolher", "0"],
            ["Saldo credor de ICMS para o mês seguinte", "1901.16"],
        ],
        "html",
    )


def test_parse_demonstrativo_icms_a_recolher():
    parsed = parse_demonstrativo_icms(_grid_recolher())
    assert parsed["kind"] == "demonstrativo_icms"
    assert parsed["debitoSaidas"] == pytest.approx(111531.23)
    assert parsed["debitos"] == pytest.approx(161996.94)
    assert parsed["creditos"] == pytest.approx(147162.25)
    assert parsed["aRecolher"] == pytest.approx(14834.69)
    assert parsed["apurado"] == pytest.approx(111531.23)


def test_parse_demonstrativo_icms_saldo_credor():
    parsed = parse_demonstrativo_icms(_grid_credor())
    assert parsed["aRecolher"] == pytest.approx(-1901.16)
    assert parsed["saldoCredorSeguinte"] == pytest.approx(1901.16)
    assert parsed["apurado"] == pytest.approx(85763.18)


def test_pipeline_icms_fills_apuracao_for_egaplast():
    grid = _grid_recolher()
    assert detect_sheet_tipo(grid, grid.path) == "icms"
    parsed = parse_demonstrativo_icms(grid)
    pack = apuracao_patch_from_demo("icms", parsed)
    assert pack["apuracao"]["icms"]["aRecolher"] == pytest.approx(14834.69)
    assert pack["apuracao"]["fonte"] == "demonstrativo_icms"
    impostos = _slice("impostos", {**pack, "hasMovimentacao": True, "cfopSaidasTotal": 1})
    assert impostos["apuracao"]["icms"]["aRecolher"] == pytest.approx(14834.69)
    labels = {c["label"] for c in impostos["composicao"]}
    assert "ICMS" in labels


def test_composicao_zero_a_recolher_nao_usa_debito_como_imposto():
    ap = {"icms": {"apurado": 85763.18, "aRecolher": 0.0}}
    assert composicao_from_apuracao(ap) == []


def _write_tmp_xls_html(tmp_path: Path, grid: WorkbookGrid) -> Path:
    """classify_and_extract precisa de arquivo; HTML table é o loader mais estável."""
    rows_html = []
    for row in grid.rows:
        cells = "".join(f"<td>{c}</td>" for c in row)
        rows_html.append(f"<tr>{cells}</tr>")
    html = "<html><body><table>" + "".join(rows_html) + "</table></body></html>"
    path = tmp_path / Path(grid.path).name
    path.write_bytes(html.encode("latin-1", errors="replace"))
    return path


def test_import_extract_grants_icms_pack(tmp_path):
    path = _write_tmp_xls_html(tmp_path, _grid_recolher())
    result = classify_and_extract(path)
    assert result["tipo"] == "icms"
    assert not result["errors"], result["errors"]
    assert result["company_id"] == "egaplast"
    assert result["competencia"] == "2026-06"
    ap = (result["pack_patch"] or {}).get("apuracao") or {}
    assert ap["icms"]["aRecolher"] == pytest.approx(14834.69)
    assert result["meta"]["aRecolher"] == pytest.approx(14834.69)


def test_import_extract_saldo_credor(tmp_path):
    path = _write_tmp_xls_html(tmp_path, _grid_credor())
    result = classify_and_extract(path)
    assert not result["errors"], result["errors"]
    assert result["pack_patch"]["apuracao"]["icms"]["aRecolher"] == pytest.approx(-1901.16)


@pytest.mark.skipif(not DOWNLOADS.exists(), reason="Pasta de apuração ICMS ausente")
def test_real_apuracao_icms_jun_a_recolher():
    hits = list(DOWNLOADS.glob("*icms*062026.xls"))
    assert hits, "Apuração icms 062026.xls não encontrada"
    from app.extract.workbook import load_workbook

    grid = load_workbook(hits[0])
    parsed = parse_demonstrativo_icms(grid)
    assert parsed["aRecolher"] == pytest.approx(14834.69, abs=0.02)
    assert parsed["debitos"] == pytest.approx(161996.94, abs=0.02)
    assert parsed["creditos"] == pytest.approx(147162.25, abs=0.02)
