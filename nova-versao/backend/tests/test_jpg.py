"""JPG — catálogo, unidades, split mensal e tabela ICMS/IPI."""
from pathlib import Path

import pytest
from openpyxl import Workbook

from app.companies import COMPANY_BY_ID, KEEP_USERNAMES
from app.extract.classify import unit_from_filename
from app.extract.pipeline import classify_and_extract
from app.routers.companies import aggregate_fiscal_packs, catalog_units_payload

ROOT = Path(__file__).resolve().parents[2]
FIXTURE_ENT = ROOT / "fixtures" / "jpg-padrao" / "Entradas 01-2026.xlsx"


def test_jpg_catalog_units():
    reg = COMPANY_BY_ID["jpg"]
    assert reg.username == "jpg"
    assert reg.cnpj == "21051983000165"
    keys = [u.key for u in reg.units]
    assert keys == ["sede", "asa_sul", "pr", "sp", "mg"]
    assert "jpg" in KEEP_USERNAMES
    payload = catalog_units_payload("jpg", None)
    assert payload[0] == {"key": "todas", "label": "Todas as unidades"}
    assert {u["key"] for u in payload} >= {"todas", "sede", "pr", "mg", "sp", "asa_sul"}
    assert "matriz" not in {u["key"] for u in payload}
    assert "lannic" not in {u["key"] for u in payload}


def test_jpg_filename_unit():
    assert unit_from_filename("ipi filial pr 01 a 08.xls") == "pr"
    assert unit_from_filename("icms filial asa sul 01 a 08.xls") == "asa_sul"
    assert unit_from_filename("ipi filial mg 01 a 08.xls") == "mg"


def test_jpg_impostos_table_parts(tmp_path: Path):
    wb = Workbook()
    ws = wb.active
    ws.append(
        [
            "Empresa",
            "Filial",
            "Mês",
            "ICMS Crédito",
            "ICMS Débito",
            "ICMS a Recolher",
            "IPI Crédito",
            "IPI Débito",
            "IPI a Recolher",
        ]
    )
    ws.append(["JPG", "Filial PR", "Janeiro", 0, 0, 0, 10, 50, 40])
    ws.append(["JPG", "Filial PR", "Fevereiro", 0, 0, 0, 5, 20, 15])
    ws.append(["JPG", "Filial MG", "Janeiro", 0, 0, 0, 1, 2, 1])
    path = tmp_path / "ipi filial pr 01 a 08.xlsx"
    wb.save(path)
    result = classify_and_extract(path)
    assert result["company_id"] == "jpg"
    assert result["tipo"] == "impostos_mensal"
    parts = result.get("parts") or []
    assert len(parts) == 2
    assert all(p["unidade"] == "pr" for p in parts)
    jan = next(p for p in parts if p["competencia"] == "2026-01")
    assert jan["pack_patch"]["apuracao"]["ipi"]["aRecolher"] == 40
    assert not result.get("errors")


def test_split_and_probe_movimento(tmp_path: Path):
    from scripts.split_movimento_mensal import split_file

    wb = Workbook()
    ws = wb.active
    ws.title = "Entradas"
    ws.append(["JPG PRODUTOS FUNCIONAIS"])
    ws.append(["CNPJ:", "21.051.983/0001-65"])
    ws.append(["Período: 01/01/2026 até 28/02/2026"])
    ws.append(
        [
            "Código",
            "Data Emissão",
            "Nota",
            "Série",
            "Esp",
            "X",
            "Y",
            "Z",
            "W",
            "Q",
            "Fornecedor",
            "A",
            "CNPJ/CPF",
            "IE",
            "B",
            "C",
            "CFOP",
            "AC",
            "UF",
            "Valor Contábil",
        ]
    )
    ws.append(
        [1, "15/01/2026", "100", "1", "", "", "", "", "", "", "FORN A", "", "11111111000111", "", "", "", "2.102", "", "GO", "100,00"]
    )
    ws.append(
        [2, "10/02/2026", "101", "1", "", "", "", "", "", "", "FORN B", "", "11111111000111", "", "", "", "2.102", "", "GO", "50,50"]
    )
    src = tmp_path / "Entradas 01-2026 a 02-2026.xlsx"
    wb.save(src)
    out = tmp_path / "out"
    reports = split_file(src, out, "entradas")
    assert {r["competencia"] for r in reports} == {"2026-01", "2026-02"}
    jan = next(p for p in out.glob("*.xlsx") if "01-2026" in p.name)
    result = classify_and_extract(jan)
    assert result["tipo"] == "entradas"
    assert result["company_id"] == "jpg"
    assert result["unidade"] == "sede"
    assert result["competencia"] == "2026-01"
    assert not result["errors"]
    assert abs(result["meta"]["delta"]) < 0.02
    assert result["pack_patch"]["totalCompras"] == pytest.approx(100, abs=0.02)


def test_aggregate_todas_does_not_invent():
    packs = [
        {"hasMovimentacao": True, "totalCompras": 10, "cfopSaidasTotal": 20, "nfsEntradas": 1, "nfsSaidas": 2},
        {"hasMovimentacao": True, "totalCompras": 3, "cfopSaidasTotal": 4, "nfsEntradas": 1, "nfsSaidas": 1},
    ]
    pack = aggregate_fiscal_packs(packs, "Jan/2026")
    assert pack["totalCompras"] == 13
    assert pack["cfopSaidasTotal"] == 24
    assert pack["nfsEntradas"] == 2


@pytest.mark.skipif(not FIXTURE_ENT.exists(), reason="Fixture jpg-padrao ausente")
def test_jpg_sede_jan_split_golden():
    path = FIXTURE_ENT
    result = classify_and_extract(path)
    assert result["company_id"] == "jpg"
    assert result["unidade"] == "sede"
    assert result["tipo"] == "entradas"
    assert not result["errors"]
    assert abs(result["meta"]["delta"]) < 0.02
