from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.routers.companies import _nfe_line_item, nfe_lines_payload


def test_nfe_line_item_classifies_doc():
    cpf = _nfe_line_item(
        SimpleNamespace(
            competencia="2026-01",
            nota="10",
            serie="1",
            nome="Pessoa",
            doc="123.456.789-01",
            uf="DF",
            cfop="5-102",
            valor=50,
        )
    )
    assert cpf["tipoDoc"] == "cpf"
    assert cpf["nota"] == "10"
    assert cpf["valor"] == 50.0

    cnpj = _nfe_line_item(
        SimpleNamespace(
            competencia="2026-01",
            nota="11",
            serie="1",
            nome="Empresa",
            doc="12345678000199",
            uf="SP",
            cfop="6-102",
            valor=90,
        )
    )
    assert cnpj["tipoDoc"] == "cnpj"

    outros = _nfe_line_item(
        SimpleNamespace(
            competencia="2026-01",
            nota="12",
            serie="",
            nome="X",
            doc="99",
            uf="",
            cfop="",
            valor=None,
        )
    )
    assert outros["tipoDoc"] == "outros"
    assert outros["valor"] == 0.0


class _Query:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *a, **k):
        return self

    def order_by(self, *a, **k):
        return self

    def all(self):
        return self._rows


def test_nfe_lines_payload_returns_saidas(monkeypatch):
    monkeypatch.setattr("app.routers.companies.require_company", lambda cid, user, db: cid)
    rows = [
        SimpleNamespace(
            competencia="2026-01",
            nota="1",
            serie="1",
            nome="PF",
            doc="12345678901",
            uf="DF",
            cfop="5-102",
            valor=10,
        ),
        SimpleNamespace(
            competencia="2026-01",
            nota="2",
            serie="1",
            nome="PJ",
            doc="12345678000199",
            uf="SP",
            cfop="6-102",
            valor=20,
        ),
    ]
    db = MagicMock()
    db.query.return_value = _Query(rows)
    user = SimpleNamespace(id=1, is_admin=True)
    out = nfe_lines_payload("unica", "2026-01", "matriz", "saidas", user, db)
    assert out["count"] == 2
    assert out["tipo"] == "saidas"
    assert out["companyId"] == "unica"
    assert out["items"][0]["tipoDoc"] == "cpf"
    assert out["items"][1]["tipoDoc"] == "cnpj"


def test_nfe_lines_payload_rejects_tipo(monkeypatch):
    monkeypatch.setattr("app.routers.companies.require_company", lambda cid, user, db: cid)
    with pytest.raises(HTTPException) as exc:
        nfe_lines_payload(
            "unica",
            "2026-01",
            "matriz",
            "outro",
            SimpleNamespace(id=1, is_admin=True),
            MagicMock(),
        )
    assert exc.value.status_code == 400
