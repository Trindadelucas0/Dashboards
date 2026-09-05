from app.extract.aggregate import (
    aggregate,
    empty_pack,
    merge_saidas,
    round2,
    tipo_doc,
    unique_nfs,
    validate_movimento,
    vendas_por_doc,
)
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


def test_tipo_doc_cpf_cnpj_outros():
    assert tipo_doc("123.456.789-01") == "cpf"
    assert tipo_doc("12345678901") == "cpf"
    assert tipo_doc("12.345.678/0001-99") == "cnpj"
    assert tipo_doc("12345678000199") == "cnpj"
    assert tipo_doc("123") == "outros"
    assert tipo_doc("") == "outros"


def test_vendas_por_doc_percentuais():
    ranking = [
        {"tipoDoc": "cpf", "total": 30, "qtd": 2},
        {"tipoDoc": "cnpj", "total": 70, "qtd": 3},
    ]
    out = vendas_por_doc(ranking, 100)
    assert out["cpf"] == {"total": 30.0, "qtd": 2, "pct": 30.0}
    assert out["cnpj"]["total"] == 70.0
    assert out["cnpj"]["pct"] == 70.0
    assert out["outros"]["total"] == 0.0
    assert out["outros"]["pct"] == 0.0
    sem = vendas_por_doc(ranking, 0)
    assert sem["cpf"]["pct"] is None


def test_aggregate_ranking_tipo_doc():
    lines = [
        _line("1", 100, "5-102", "PF", "12345678901", "DF"),
        _line("2", 200, "5-102", "PJ", "12345678000199", "SP"),
    ]
    agg = aggregate(lines, "clientes")
    tipos = {p["nome"]: p["tipoDoc"] for p in agg["ranking"]}
    assert tipos["PF"] == "cpf"
    assert tipos["PJ"] == "cnpj"


def test_merge_saidas_vendas_por_doc():
    mov = ExtractedMovimento(
        tipo="saidas",
        company="X",
        cnpj="",
        period="2026-01",
        total_geral=300.0,
        lines=[
            _line("1", 100, "5-102", "PF", "12345678901", "DF"),
            _line("2", 200, "5-102", "PJ", "12345678000199", "SP"),
        ],
    )
    pack = merge_saidas(empty_pack(), mov)
    por = pack["vendasPorDoc"]
    assert por["cpf"]["total"] == 100.0
    assert por["cnpj"]["total"] == 200.0
    assert por["cpf"]["pct"] == 33.33
    assert por["cnpj"]["pct"] == 66.67
