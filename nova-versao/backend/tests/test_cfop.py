from app.extract.cfop import aggregate_macro, cfop_meta, macro_grupo, sinief_grupo, top_grupos


def test_cfop_revenda_and_devol():
    assert cfop_meta("1-102")["finalidade"] == "Revenda"
    assert macro_grupo("2-102") == "revenda"
    assert macro_grupo("1-202") == "devol"
    assert macro_grupo("1-551") == "ativo"
    assert cfop_meta("2-152")["grupo"].startswith("2.150")


def test_macro_sums():
    rows = [
        {"cfop": "1-102", "total": 80, "qtd": 2},
        {"cfop": "1-202", "total": 20, "qtd": 1},
    ]
    macro = {m["key"]: m for m in aggregate_macro(rows)}
    assert macro["revenda"]["total"] == 80
    assert macro["devol"]["total"] == 20
    assert macro["revenda"]["pct"] == 80.0


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
