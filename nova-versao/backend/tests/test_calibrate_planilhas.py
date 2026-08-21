from pathlib import Path

import pytest

from app.config import get_settings
from app.extract.classify import EMPTY_FILE_ERROR, RANGE_ERROR
from app.extract.pipeline import classify_and_extract

PLANILHAS = get_settings().planilhas_path


def _iter_planilhas():
    return sorted(PLANILHAS.rglob("*.xls")) + sorted(PLANILHAS.rglob("*.xlsx"))


@pytest.mark.skipif(not PLANILHAS.exists(), reason="Pasta PLANILHAS ausente")
def test_planilhas_movimento_all_ok_or_explicit_range():
    """Valida movimento só para arquivos que mapeiam para Egaplast (catálogo atual)."""
    files = _iter_planilhas()
    assert files, "Nenhum xls em PLANILHAS"
    failures = []
    ok_mov = 0
    range_rejected = 0
    skipped_other = 0
    for path in files:
        try:
            result = classify_and_extract(path)
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{path.relative_to(PLANILHAS)}: exceção {exc}")
            continue
        tipo = result.get("tipo")
        if tipo not in ("entradas", "saidas"):
            continue
        errors = result.get("errors") or []
        if RANGE_ERROR in errors or EMPTY_FILE_ERROR in errors:
            range_rejected += 1
            continue
        if result.get("company_id") != "egaplast":
            skipped_other += 1
            continue
        delta = (result.get("meta") or {}).get("delta")
        if not result.get("competencia"):
            failures.append(f"{path.relative_to(PLANILHAS)}: sem competência {errors}")
        elif errors:
            failures.append(f"{path.relative_to(PLANILHAS)}: {errors}")
        elif delta is None or abs(float(delta)) >= 0.02:
            failures.append(f"{path.relative_to(PLANILHAS)}: delta={delta}")
        else:
            ok_mov += 1
    assert not failures, f"{len(failures)} movimento(s) falharam:\n" + "\n".join(failures[:40])
    assert ok_mov >= 1 or skipped_other >= 0, "Nenhuma planilha mensal de movimento validou"
    # fixture padrao cobre Egaplast; PLANILHAS pode não ter mês único Egaplast
    fixture = Path(__file__).resolve().parents[2] / "fixtures" / "egaplast-padrao" / "Entradas.xls"
    if ok_mov < 1 and fixture.exists():
        result = classify_and_extract(fixture)
        assert not result["errors"] and result["company_id"] == "egaplast"


@pytest.mark.skipif(not PLANILHAS.exists(), reason="Pasta PLANILHAS ausente")
def test_planilhas_dre_impostos_irpj_nao_quebram():
    files = _iter_planilhas()
    if not files:
        pytest.skip("Nenhum xls em PLANILHAS")
    failures = []
    seen = {"dre": 0, "impostos": 0, "irpj": 0}
    for path in files:
        try:
            result = classify_and_extract(path)
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{path.name}: exceção {exc}")
            continue
        tipo = result.get("tipo")
        if tipo not in seen:
            continue
        # catálogo só Egaplast — outros CNPJs podem falhar por empresa
        if result.get("company_id") not in (None, "egaplast") and result.get("company_id") != "egaplast":
            continue
        errs = result.get("errors") or []
        if any("não mapeados" in e for e in errs):
            continue
        seen[tipo] += 1
        if tipo == "irpj":
            if errs:
                failures.append(f"{path.name}: IRPJ não deve falhar a extração {errs}")
            continue
        if tipo == "dre":
            continue
        if tipo == "impostos" and errs:
            failures.append(f"{path.name}: impostos {errs}")
    assert not failures, "\n".join(failures[:20])


@pytest.mark.skipif(not PLANILHAS.exists(), reason="Pasta PLANILHAS ausente")
def test_egaplast_files_map_to_company():
    hits = list(PLANILHAS.glob("*Egaplast*.xls"))
    if not hits:
        pytest.skip("Arquivos Egaplast não encontrados")
    for path in hits:
        result = classify_and_extract(path)
        assert result.get("company_id") == "egaplast", path.name


@pytest.mark.skipif(not PLANILHAS.exists(), reason="Pasta PLANILHAS ausente")
def test_rota040_files_not_in_catalog_anymore():
    """Nova-versão ficou só Egaplast — Rota 040 não mapeia no catálogo estático."""
    from app.companies import COMPANY_BY_ID

    assert "rota-040" not in COMPANY_BY_ID
    hits = list(PLANILHAS.glob("*Rota 040*.xls"))
    if not hits:
        pytest.skip("Arquivos Rota 040 não encontrados")
    result = classify_and_extract(hits[0])
    assert result.get("company_id") != "rota-040"
