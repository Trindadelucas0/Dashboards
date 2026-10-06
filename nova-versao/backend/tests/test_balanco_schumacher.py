"""Golden do Balanço Patrimonial comparativo Schumacher (jan–ago/2026)."""

from pathlib import Path

import pytest

from app.extract.parse_balancete import parse_balancete
from app.extract.parse_balanco_schumacher import is_balanco_schumacher
from app.extract.parse_dre_schumacher import is_dre_schumacher
from app.extract.parse_workbook_padrao import expand_workbook_parts
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import load_all_sheets

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "schumacher-padrao"
    / "BALANCO_PATRIMONIAL_SCHUMACHER_2026.xlsx"
)
DRE = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "schumacher-padrao"
    / "DRE_SCHUMACHER_2026.xlsx"
)


@pytest.mark.skipif(not FIXTURE.exists(), reason="Fixture Balanço Schumacher ausente")
def test_balanco_schumacher_oito_parts_e_golden():
    sheets = load_all_sheets(FIXTURE)
    assert is_balanco_schumacher(sheets) is True
    assert is_dre_schumacher(sheets) is False
    parsed = parse_balancete(sheets[0])
    assert not (parsed.get("contas") if isinstance(parsed, dict) else parsed)

    result = classify_and_extract(FIXTURE)
    assert result["tipo"] == "balanco_schumacher"
    assert not result["errors"]
    assert result["company_id"] == "schumacher"
    items = expand_workbook_parts({**result, "file_hash": "fixture-hash-bp"})
    assert len(items) == 8
    assert {i["competencia"] for i in items} == {f"2026-{m:02d}" for m in range(1, 9)}
    assert all(i.get("unidade") == "matriz" for i in items)
    assert all(not i.get("errors") for i in items)
    assert len({i["file_hash"] for i in items}) == 8

    jan = next(i for i in items if i["competencia"] == "2026-01")
    bal = jan["pack_patch"]["balancete"]
    assert bal["kind"] == "schumacher_bp"
    tot = bal["totais"]
    assert tot["ativo"] == pytest.approx(78939887.50, abs=0.02)
    assert tot["passivo"] == pytest.approx(75653824.16, abs=0.02)
    assert tot["patrimonio"] == pytest.approx(24427195.97, abs=0.02)
    assert tot["diferenca"] == pytest.approx(3286063.34, abs=0.02)

    ago = next(i for i in items if i["competencia"] == "2026-08")
    tot_ago = ago["pack_patch"]["balancete"]["totais"]
    assert tot_ago["ativo"] == pytest.approx(75570991.22, abs=0.02)
    assert tot_ago["passivo"] == pytest.approx(80341995.80, abs=0.02)
    assert tot_ago["diferenca"] == pytest.approx(-4771004.58, abs=0.02)


@pytest.mark.skipif(not (FIXTURE.exists() and DRE.exists()), reason="Fixtures DRE/BP ausentes")
def test_diferenca_bp_igual_lucro_liquido_dre():
    dre_items = expand_workbook_parts(
        {**classify_and_extract(DRE), "file_hash": "h-dre"}
    )
    bp_items = expand_workbook_parts(
        {**classify_and_extract(FIXTURE), "file_hash": "h-bp"}
    )
    jan_dre = next(i for i in dre_items if i["competencia"] == "2026-01")
    jan_bp = next(i for i in bp_items if i["competencia"] == "2026-01")
    assert jan_dre["pack_patch"]["dre"]["lucLiq"] == pytest.approx(
        jan_bp["pack_patch"]["balancete"]["totais"]["diferenca"],
        abs=0.02,
    )
    ago_dre = next(i for i in dre_items if i["competencia"] == "2026-08")
    ago_bp = next(i for i in bp_items if i["competencia"] == "2026-08")
    # Posição de ago = lucro acumulado Jan–Ago da DRE (estoque), não o fluxo do mês.
    assert ago_dre["pack_patch"]["dre"]["acumuladoJanAgo"]["lucLiq"] == pytest.approx(
        ago_bp["pack_patch"]["balancete"]["totais"]["diferenca"],
        abs=0.02,
    )
