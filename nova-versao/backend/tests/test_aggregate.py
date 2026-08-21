from app.extract.aggregate import aggregate, round2, unique_nfs, validate_movimento
from app.extract.parse_movimento import ExtractedMovimento, Line


def _line(nota, valor, cfop="2-102", nome="FORN", doc="123", uf="SP"):
    return Line(codigo="1", nota=nota, serie="1", nome=nome, doc=doc, uf=uf, cfop=cfop, valor=valor)


def test_unique_nfs_counts_nota_serie():
    lines = [_line("10", 1), _line("10", 2), _line("11", 3)]
    assert unique_nfs(lines) == 2


def test_aggregate_cfop_and_parties_sum():
    lines = [
        _line("1", 100, "2-102", "A", "111", "SP"),
        _line("2", 50, "2-102", "A", "111", "SP"),
        _line("3", 20, "1-933", "B", "222", "DF"),
    ]
    agg = aggregate(lines, "fornecedores")
    assert agg["soma"] == 170
    assert agg["nfs"] == 3
    cfops = {c["cfop"]: c for c in agg["cfopList"]}
    assert cfops["2-102"]["total"] == 150
    assert sum(p["total"] for p in cfops["2-102"]["fornecedores"]) == 150


def test_validate_total_geral_gate():
    mov = ExtractedMovimento(tipo="entradas", company="X", cnpj="", period="", total_geral=100.0, lines=[_line("1", 100)])
    assert validate_movimento(mov, 100.0) == []
    errs = validate_movimento(mov, 101.0)
    assert any("Δ" in e or "Delta" in e or "Total Geral" in e for e in errs)
    assert round2(1.234) == 1.23
