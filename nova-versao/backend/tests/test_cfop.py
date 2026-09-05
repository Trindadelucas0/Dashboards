from app.extract.cfop import (
    aggregate_macro,
    aggregate_servicos,
    cfop_meta,
    macro_grupo,
    sinief_grupo,
    top_grupos,
)


def test_cfop_revenda_and_devol():
    assert cfop_meta("1-102")["finalidade"] == "Revenda"
    assert macro_grupo("2-102") == "revenda"
    assert macro_grupo("1-202") == "devol"
    assert macro_grupo("1-551") == "ativo"
    assert cfop_meta("2-152")["grupo"].startswith("2.150")


def test_cfop_servicos_issqn_e_transporte():
    assert cfop_meta("1-933")["finalidade"] == "Serviço ISSQN"
    assert cfop_meta("2-933")["finalidade"] == "Serviço ISSQN"
    assert cfop_meta("1-353")["finalidade"] == "Serviço Transp."
    assert cfop_meta("2-353")["finalidade"] == "Serviço Transp."
    assert macro_grupo("1-933") == "servicos"
    assert macro_grupo("2-353") == "servicos"
    # heurística fora do mapa
    assert cfop_meta("1-932")["finalidade"] == "Serviço ISSQN"
    assert cfop_meta("2-355")["finalidade"] == "Serviço Transp."


def test_macro_sums():
    rows = [
        {"cfop": "1-102", "total": 80, "qtd": 2},
        {"cfop": "1-202", "total": 20, "qtd": 1},
    ]
    macro = {m["key"]: m for m in aggregate_macro(rows)}
    assert macro["revenda"]["total"] == 80
    assert macro["devol"]["total"] == 20
    assert macro["revenda"]["pct"] == 80.0


def test_macro_separa_servicos_de_outros():
    rows = [
        {"cfop": "1-102", "total": 50, "qtd": 1},
        {"cfop": "1-933", "total": 30, "qtd": 2},
        {"cfop": "2-910", "total": 20, "qtd": 1},
    ]
    macro = {m["key"]: m for m in aggregate_macro(rows)}
    assert macro["servicos"]["total"] == 30
    assert macro["outros"]["total"] == 20
    assert macro["revenda"]["total"] == 50


def test_aggregate_servicos():
    rows = [
        {"cfop": "1-102", "total": 100, "qtd": 1},
        {"cfop": "1-933", "total": 40, "qtd": 2},
        {"cfop": "2-353", "total": 10, "qtd": 1},
    ]
    st = aggregate_servicos(rows)
    assert st["total"] == 50
    assert st["qtd"] == 3
    assert st["pctCompras"] == 33.3
    by_label = {t["label"]: t for t in st["porTipo"]}
    assert by_label["ISSQN"]["total"] == 40
    assert by_label["Transporte"]["total"] == 10
    assert len(st["cfops"]) == 2


def test_top_grupos_order():
    rows = [
        {"cfop": "2-152", "total": 70, "qtd": 1},
        {"cfop": "2-551", "total": 20, "qtd": 1},
        {"cfop": "1-403", "total": 10, "qtd": 1},
    ]
    tops = top_grupos(rows, 4)
    assert sinief_grupo("2-152") == tops[0]["grupo"]
    assert tops[0]["pct"] == 70.0
    assert len(tops) == 3
