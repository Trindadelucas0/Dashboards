import json
from pathlib import Path

import pytest

from app.extract.aggregate import aggregate
from app.extract.parse_movimento import Line

REPO = Path(__file__).resolve().parents[3]
RAW = REPO / "relatorios" / "jul2026" / "raw"
PACK = REPO / "relatorios" / "jul2026" / "unica-07.json"


@pytest.mark.skipif(not PACK.exists(), reason="Gabarito unica-07.json ausente")
def test_unica_raw_matches_pack_totals():
    ent = json.loads((RAW / "unica-entradas.json").read_text(encoding="utf-8"))
    sai = json.loads((RAW / "unica-saidas.json").read_text(encoding="utf-8"))
    pack = json.loads(PACK.read_text(encoding="utf-8"))

    def to_lines(raw):
        return [
            Line(
                codigo=str(x.get("codigo") or ""),
                nota=str(x.get("nota") or ""),
                serie=str(x.get("serie") or ""),
                nome=str(x.get("nome") or ""),
                doc=str(x.get("doc") or ""),
                uf=str(x.get("uf") or "—"),
                cfop=str(x.get("cfop") or ""),
                valor=float(x.get("valor") or 0),
            )
            for x in raw["lines"]
        ]

    a_ent = aggregate(to_lines(ent), "fornecedores")
    a_sai = aggregate(to_lines(sai), "clientes")
    assert a_ent["soma"] == pack["meta"]["somaEntradas"]
    assert a_sai["soma"] == pack["meta"]["somaSaidas"]
    assert a_ent["nfs"] == pack["meta"]["nfsEntradas"]
    assert a_sai["nfs"] == pack["meta"]["nfsSaidas"]
    assert abs(a_ent["soma"] - ent["totalGeral"]) < 0.02
    assert abs(a_sai["soma"] - sai["totalGeral"]) < 0.02
