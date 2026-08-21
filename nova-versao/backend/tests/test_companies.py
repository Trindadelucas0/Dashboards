from app.companies import only_digits, slugify


def test_slugify_ascii_and_accents():
    assert slugify("Rota 040 Embalagens") == "rota-040-embalagens"
    assert slugify("Única Tintas") == "unica-tintas"
    assert slugify("!!!") == "empresa"
    assert slugify("") == "empresa"


def test_only_digits_cnpj():
    assert only_digits("36.517.206/0001-30") == "36517206000130"
    assert only_digits("  ") == ""
